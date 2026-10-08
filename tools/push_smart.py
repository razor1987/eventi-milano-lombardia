#!/usr/bin/env python3
"""Push diff-based su GitHub via git-database REST API.

A differenza di github_push_rest.py carica SOLO i file nuovi/modificati
(confronto via sha1 git-blob) ed elimina dal repo i file non più presenti
in locale. Indispensabile con migliaia di pagine evento statiche.

Usage: push_smart.py <owner> <repo> <directory> [branch] [message]
"""
import base64
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request

BASE = "https://api.github.com"
ALLOWED = ["api.github.com"]
CREDENTIAL = "custom.github"
SKIP_DIRS = {".git", "node_modules", "__pycache__"}


def api(method, path, body=None, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(BASE + path, method=method)
            req.add_header("Accept", "application/vnd.github+json")
            req.add_header("X-GitHub-Api-Version", "2022-11-28")
            data = None
            if body is not None:
                data = json.dumps(body).encode()
                req.add_header("Content-Type", "application/json")
            add_surrogate_to_request(req, CREDENTIAL, entry_name="access_token",
                                     allowed_hosts=ALLOWED)
            with urllib.request.urlopen(req, data=data, timeout=120) as resp:
                raw = resp.read().decode("utf-8", "replace")
                return resp.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            if attempt == retries - 1:
                return exc.code, {"_error": detail}
            time.sleep(2 * (attempt + 1))
        except Exception as exc:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def git_blob_sha(data):
    h = hashlib.sha1()
    h.update(b"blob " + str(len(data)).encode() + b"\0")
    h.update(data)
    return h.hexdigest()


def main():
    if len(sys.argv) < 4:
        print(__doc__, file=sys.stderr)
        return 2
    owner, repo, directory = sys.argv[1], sys.argv[2], sys.argv[3]
    branch = sys.argv[4] if len(sys.argv) > 4 else "main"
    message = sys.argv[5] if len(sys.argv) > 5 else "deploy update"
    R = f"/repos/{owner}/{repo}"

    status, me = api("GET", "/user")
    if status != 200:
        print(f"auth failed: {status} {me}", file=sys.stderr)
        return 1
    login = me["login"]

    local = {}
    for root, dirs, names in os.walk(directory):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for n in sorted(names):
            full = os.path.join(root, n)
            rel = os.path.relpath(full, directory)
            with open(full, "rb") as f:
                data = f.read()
            local[rel] = (data, git_blob_sha(data))

    status, ref = api("GET", f"{R}/git/refs/heads/{branch}")
    parent_sha, base_tree_sha, remote = None, None, {}
    if status == 200:
        parent_sha = ref["object"]["sha"]
        status, commit = api("GET", f"{R}/git/commits/{parent_sha}")
        base_tree_sha = commit["tree"]["sha"]
        status, tree = api("GET", f"{R}/git/trees/{base_tree_sha}?recursive=1")
        if status == 200:
            for t in tree.get("tree", []):
                if t["type"] == "blob":
                    remote[t["path"]] = t["sha"]
        if tree.get("truncated"):
            print("ATTENZIONE: tree remoto troncato, fallback su push completo",
                  file=sys.stderr)
            remote = {}

    to_upload = [(rel, data) for rel, (data, sha) in local.items()
                 if remote.get(rel) != sha]
    to_delete = [p for p in remote if p not in local]
    print(f"{len(local)} file locali, {len(to_upload)} da caricare, "
          f"{len(to_delete)} da eliminare", flush=True)
    if not to_upload and not to_delete and parent_sha:
        print("nessuna modifica, niente da pushare")
        return 0

    def upload(item):
        rel, data = item
        status, blob = api("POST", f"{R}/git/blobs",
                           {"content": base64.b64encode(data).decode(),
                            "encoding": "base64"})
        if status != 201:
            raise RuntimeError(f"blob failed for {rel}: {status} {blob}")
        return rel, blob["sha"]

    entries = []
    done = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        for rel, sha in ex.map(upload, to_upload):
            mode = "100755" if rel.endswith(".sh") else "100644"
            entries.append({"path": rel, "mode": mode, "type": "blob",
                            "sha": sha})
            done += 1
            if done % 200 == 0 or done == len(to_upload):
                print(f"  blob {done}/{len(to_upload)}", flush=True)
    for p in to_delete:
        entries.append({"path": p, "mode": "100644", "type": "blob",
                        "sha": None})

    tree_body = {"tree": entries}
    if base_tree_sha:
        tree_body["base_tree"] = base_tree_sha
    status, tree = api("POST", f"{R}/git/trees", tree_body)
    if status != 201:
        print(f"tree failed: {status} {tree}", file=sys.stderr)
        return 1

    commit_body = {"message": message, "tree": tree["sha"],
                   "author": {"name": login,
                              "email": f"{login}@users.noreply.github.com"}}
    if parent_sha:
        commit_body["parents"] = [parent_sha]
    status, commit = api("POST", f"{R}/git/commits", commit_body)
    if status != 201:
        print(f"commit failed: {status} {commit}", file=sys.stderr)
        return 1
    commit_sha = commit["sha"]
    print(f"commit {commit_sha[:7]}", flush=True)

    if parent_sha:
        status, _ = api("PATCH", f"{R}/git/refs/heads/{branch}",
                        {"sha": commit_sha})
    else:
        status, _ = api("POST", f"{R}/git/refs",
                        {"ref": f"refs/heads/{branch}", "sha": commit_sha})
    if status not in (200, 201):
        print(f"ref update failed: {status}", file=sys.stderr)
        return 1

    print(f"pushed to https://github.com/{owner}/{repo}/tree/{branch}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
