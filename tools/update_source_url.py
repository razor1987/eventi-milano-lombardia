#!/usr/bin/env python3
"""Aggiorna l'URL di una fonte evento nel dashboard privato (dashboard-eventi).

Uso: update_source_url.py <eventKey> <nuovo_url> [nome_fonte]
Carica l'evento da events.json (export), sostituisce l'URL della fonte indicata
(o della prima fonte se nome non dato), e lo risalva via savediscoveredevents
(eventKey+titolo+data identici => aggiornamento, non duplicato).
Stampa OK o ERRORE.
"""
import json, sys

EVENT_KEY, NEW_URL = sys.argv[1], sys.argv[2]
SRC_NAME = sys.argv[3] if len(sys.argv) > 3 else None

d = json.load(open('/home/hatch/workspace/eventi-pubblico/data/events.json'))
ev = next((e for e in d['events'] if e.get('eventKey') == EVENT_KEY), None)
if not ev:
    print(f"ERRORE: eventKey non trovato: {EVENT_KEY}"); sys.exit(1)

srcs = ev.get('sources') or []
tgt = next((s for s in srcs if SRC_NAME and s.get('name') == SRC_NAME), srcs[0] if srcs else None)
if not tgt:
    print(f"ERRORE: nessuna fonte per {EVENT_KEY}"); sys.exit(1)
old = tgt['url']
tgt['url'] = NEW_URL

# payload per savediscoveredevents (tutti i campi richiesti dallo schema)
payload = {
    "title": ev["title"], "category": ev["category"],
    "startDate": ev["startDate"], "endDate": ev.get("endDate"),
    "dateLabel": ev["dateLabel"], "timeLabel": ev.get("timeLabel"),
    "venue": ev.get("venue"), "city": ev["city"], "province": ev.get("province"),
    "area": ev["area"], "kind": ev.get("kind") or ev["category"],
    "priceLabel": ev.get("priceLabel") or "Prezzo non pubblicato",
    "priceType": ev.get("priceType") or "unknown",
    "details": ev.get("details"), "foodDetails": ev.get("foodDetails"),
    "caveat": ev.get("caveat"), "address": ev.get("address"),
    "latitude": ev.get("latitude"), "longitude": ev.get("longitude"),
    "sources": [{"name": s["name"], "url": s["url"], "channel": s.get("channel") or "other"}
                for s in srcs],
}
out = {"events": [payload],
       "summary": f"Aggiornato URL fonte evento {EVENT_KEY}"}
json.dump(out, open('/tmp/update_payload.json', 'w'), ensure_ascii=False)
print(f"OK {ev['title'][:50]}")
print(f"  {old}")
print(f"  -> {NEW_URL}")
print("PAYLOAD:/tmp/update_payload.json")
