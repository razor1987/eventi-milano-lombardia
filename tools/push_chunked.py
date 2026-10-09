#!/usr/bin/env python3
"""Push chunked: crea il commit finale in N commit intermedi da ~800 file l'uno,
perche' GitHub rifiuta (502) un singolo tree da 4475 voci. Il ref viene
spostato solo alla fine: i commit intermedi sono solo storia."""
import base64, hashlib, json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request

BASE = "https://api.github.com"
ALLOWED = ["api.github.com"]
CREDENTIAL = "custom.github"
SKIP_DIRS = {".git", "node_modules", "__pycache__"}
CHUNK = 800

owner, repo, directory = sys.argv[1], sys.argv[2], sys.argv[3]
branch = sys.argv[4] if len(sys.argv) > 4 else "main"
message = sys.argv[5] if len(sys.argv) > 5 else "deploy update"
R = f"/repos/{owner}/{repo}"


def api(method, path, body=None, retries=6):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(BASE + path, method=method)
            req.add_header("Accept", "application/vnd.github+json")
            req.add_header("X-GitHub-Api-Version", "2022-11-28")
            data = json.dumps(body).encode() if body is not None else None
            if data:
                req.add_header("Content-Type", "application/json")
            add_surrogate_to_request(req, CREDENTIAL, entry_name="access_token",
                                     allowed_hosts=ALLOWED)
            with urllib.request.urlopen(req, data=data, timeout=120) as resp:
                raw = resp.read().decode("utf-8", "replace")
                return resp.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:200]
            print(f"  HTTP {exc.code} {method} {path} tent.{attempt+1}: {detail}", flush=True)
            if attempt == retries - 1:
                return exc.code, {"_error": detail}
            time.sleep(5 * (attempt + 1))
        except Exception as exc:
            print(f"  err {exc} {method} {path} tent.{attempt+1}", flush=True)
            if attempt == retries - 1:
                raise
            time.sleep(5 * (attempt + 1))


def git_blob_sha(data):
    h = hashlib.sha1()
    h.update(b"blob " + str(len(data)).encode() + b"\0")
    h.update(data)
    return h.hexdigest()


local = {}
for root, dirs, names in os.walk(directory):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for n in sorted(names):
        full = os.path.join(root, n)
        rel = os.path.relpath(full, directory)
        with open(full, "rb") as f:
            data = f.read()
        local[rel] = (data, git_blob_sha(data))
print(f"{len(local)} file locali", flush=True)

s, ref = api("GET", f"{R}/git/refs/heads/{branch}")
assert s == 200, ref
head_sha = ref["object"]["sha"]
s, head_commit = api("GET", f"{R}/git/commits/{head_sha}")
base_tree = head_commit["tree"]["sha"]
s, rtree = api("GET", f"{R}/git/trees/{base_tree}?recursive=1")
remote = {}
if s == 200:
    for t in rtree.get("tree", []):
        if t["type"] == "blob":
            remote[t["path"]] = t["sha"]

changed = [(rel, data) for rel, (data, sha) in local.items()
           if remote.get(rel) != sha]
deleted = [p for p in remote if p not in local]
print(f"{len(changed)} modificati/nuovi, {len(deleted)} da eliminare", flush=True)

# i blob vanno creati su GitHub PRIMA di referenziarli nei tree
# (POST /git/trees accetta solo sha di oggetti esistenti)
def upload(item):
    rel, data = item
    s, blob = api("POST", f"{R}/git/blobs",
                  {"content": base64.b64encode(data).decode(),
                   "encoding": "base64"})
    assert s == 201, f"blob {rel}: {s} {blob}"
    return rel, blob["sha"]

uploaded = []
with ThreadPoolExecutor(max_workers=8) as ex:
    for rel, sha in ex.map(upload, changed):
        uploaded.append((rel, sha))
        if len(uploaded) % 200 == 0 or len(uploaded) == len(changed):
            print(f"  blob {len(uploaded)}/{len(changed)}", flush=True)

pages = [(r, sh) for r, sh in uploaded if r.startswith("evento/")]
others = [(r, sh) for r, sh in uploaded if not r.startswith("evento/")]

chunks = [pages[i:i + CHUNK] for i in range(0, len(pages), CHUNK)]
# ultimo chunk: resto pagine + altri file + eliminazioni
if chunks:
    chunks[-1] = chunks[-1] + others
else:
    chunks = [others]
print(f"{len(chunks)} chunk", flush=True)

s, me = api("GET", "/user")
login = me["login"]
author = {"name": login, "email": f"{login}@users.noreply.github.com"}

prev_tree, prev_commit = base_tree, head_sha
final_sha = None
for i, ch in enumerate(chunks):
    is_last = (i == len(chunks) - 1)
    entries = [{"path": r, "mode": "100755" if r.endswith(".sh") else "100644",
                "type": "blob", "sha": sh} for r, sh in ch]
    if is_last:
        for p in deleted:
            entries.append({"path": p, "mode": "100644", "type": "blob", "sha": None})
    msg = message if is_last else f"{message} (parte {i+1}/{len(chunks)})"
    s, nt = api("POST", f"{R}/git/trees", {"base_tree": prev_tree, "tree": entries})
    assert s == 201, f"tree chunk {i}: {s} {nt}"
    s, nc = api("POST", f"{R}/git/commits",
                {"message": msg, "tree": nt["sha"], "parents": [prev_commit],
                 "author": author})
    assert s == 201, f"commit chunk {i}: {s} {nc}"
    prev_tree, prev_commit = nt["sha"], nc["sha"]
    final_sha = nc["sha"]
    print(f"chunk {i+1}/{len(chunks)}: commit {final_sha[:7]} ({len(entries)} voci)", flush=True)

s, _ = api("PATCH", f"{R}/git/refs/heads/{branch}", {"sha": final_sha})
assert s in (200, 201), f"ref: {s}"
print(f"PUSHED https://github.com/{owner}/{repo}/tree/{branch} @ {final_sha[:7]}")
