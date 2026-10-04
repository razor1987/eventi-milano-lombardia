#!/usr/bin/env python3
"""Fonde i near-duplicate in data/events.json (stesso evento, titoli leggermente diversi).

Euristica conservativa: fonde solo se stessa data di inizio + stesso luogo
(venue normalizzata, fallback città) + titoli molto simili (ratio > 0.65,
stesso headliner prima del primo separatore, o un titolo contenuto nell'altro)
+ endDate compatibili. In caso di fusione unisce le fonti (dedup per URL),
tiene i testi più lunghi e il prezzo noto se presente.

Uso: python3 tools/dedup.py  (idempotente)
"""
import json, re, os, sys
from collections import defaultdict
from difflib import SequenceMatcher
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVENTS = os.path.join(BASE, 'data', 'events.json')

def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', (s or '').lower()).strip()

def vkey(e):
    v = norm(e.get('venue')) or norm(e.get('city'))
    return re.sub(r'\s+', '', v)[:12]

def headliner(title):
    t = title or ''
    for sep in ['–', '—', '-', '(', ':', '|']:
        if sep in t:
            t = t.split(sep)[0]
    return norm(t)

def endok(a, b):
    ea = a.get('endDate') or a.get('startDate')
    eb = b.get('endDate') or b.get('startDate')
    return ea == eb

def similar(a, b):
    ta, tb = norm(a.get('title')), norm(b.get('title'))
    if not ta or not tb:
        return False
    if SequenceMatcher(None, ta, tb).ratio() > 0.65:
        return True
    ha, hb = headliner(a.get('title')), headliner(b.get('title'))
    if ha and ha == hb:
        return True
    return ta in tb or tb in ta

def score(e):
    s = len(e.get('details') or '') + len(e.get('foodDetails') or '')
    s += 100 * len(e.get('sources') or [])
    if e.get('priceType') not in (None, 'unknown'):
        s += 200
    if e.get('address'):
        s += 100
    if e.get('timeLabel'):
        s += 50
    return s

def merge_into(canonical, others):
    seen, merged = set(), []
    for e in [canonical] + others:
        for s in (e.get('sources') or []):
            u = (s.get('url') or s.get('name') or '').strip()
            if u and u not in seen:
                seen.add(u)
                merged.append(s)
    canonical['sources'] = merged
    for f in ('details', 'foodDetails', 'dateLabel', 'timeLabel'):
        canonical[f] = max([canonical] + others, key=lambda e: len(e.get(f) or '')).get(f)
    for f in ('title', 'venue', 'kind', 'address'):
        best = max([canonical] + others, key=lambda e: len(e.get(f) or ''))
        if best.get(f):
            canonical[f] = best.get(f)
    priced = [e for e in [canonical] + others if e.get('priceType') not in (None, 'unknown')]
    if priced:
        p = max(priced, key=lambda e: len(e.get('priceLabel') or ''))
        canonical['priceLabel'], canonical['priceType'] = p.get('priceLabel'), p.get('priceType')
    cavs = []
    for e in [canonical] + others:
        c = (e.get('caveat') or '').strip()
        if c and c not in cavs:
            cavs.append(c)
    canonical['caveat'] = ' | '.join(cavs) if cavs else None
    if not canonical.get('latitude'):
        for e in others:
            if e.get('latitude'):
                canonical['latitude'], canonical['longitude'] = e['latitude'], e['longitude']
                break
    return canonical

def main():
    d = json.load(open(EVENTS, encoding='utf-8'))
    evs = d['events']
    groups = defaultdict(list)
    for e in evs:
        groups[(e.get('startDate'), vkey(e))].append(e)
    removed = 0
    for key, g in groups.items():
        if len(g) < 2:
            continue
        parent = list(range(len(g)))
        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x
        for i in range(len(g)):
            for j in range(i + 1, len(g)):
                if endok(g[i], g[j]) and similar(g[i], g[j]):
                    parent[find(i)] = find(j)
        clusters = defaultdict(list)
        for i, e in enumerate(g):
            clusters[find(i)].append(e)
        for cl in clusters.values():
            if len(cl) < 2:
                continue
            cl.sort(key=score, reverse=True)
            can, others = cl[0], cl[1:]
            merge_into(can, others)
            for o in others:
                evs.remove(o)
                removed += 1
            print(f"fusi {len(cl)}: {can['title'][:60]}", flush=True)
    for i, e in enumerate(evs, start=1):
        e['id'] = i
    d['count'] = len(evs)
    d['generatedAt'] = datetime.now().astimezone().isoformat(timespec='seconds')
    json.dump(d, open(EVENTS, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'Dedup: {removed} rimossi, {len(evs)} eventi finali', flush=True)

if __name__ == '__main__':
    main()
