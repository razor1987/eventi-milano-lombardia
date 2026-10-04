#!/usr/bin/env python3
"""Geocodifica gli eventi senza coordinate usando Nominatim (OSM).
Cache persistente in data/geocode.json indicizzata per eventKey,
cosi' le sync giornaliere non ripetono le query.
Uso cortese: 1 richiesta / 1.3s, User-Agent identificativo.
"""
import json, time, urllib.parse, urllib.request, os, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVENTS = os.path.join(BASE, 'data', 'events.json')
CACHE = os.path.join(BASE, 'data', 'geocode.json')
UA = 'eventi-milano-lombardia/1.0 (sito personale non commerciale)'

def nominatim(q):
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode(
        {'q': q, 'format': 'json', 'limit': 1, 'countrycodes': 'it'})
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            res = json.load(r)
            if res:
                return float(res[0]['lat']), float(res[0]['lon'])
    except Exception as e:
        print('  ! errore query', q[:60], '->', e, flush=True)
    return None

def queries_for(e):
    qs = []
    parts = [p for p in (e.get('venue'), e.get('address'), e.get('city')) if p]
    if len(parts) >= 2:
        qs.append(', '.join(parts))
    if e.get('city'):
        qs.append(e['city'] + ', Lombardia, Italia')
        qs.append(e['city'] + ', Italia')
    return qs

def main():
    d = json.load(open(EVENTS, encoding='utf-8'))
    evs = d['events']
    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    todo = [e for e in evs if not (e.get('latitude') and e.get('longitude'))
            and e.get('eventKey') not in cache]
    print(f'eventi totali: {len(evs)}, da geocodificare: {len(todo)}', flush=True)
    done = 0
    for e in todo:
        latlon = None
        for q in queries_for(e):
            latlon = nominatim(q)
            time.sleep(1.3)
            if latlon:
                break
        if latlon and e.get('eventKey'):
            cache[e['eventKey']] = {'lat': latlon[0], 'lon': latlon[1]}
            done += 1
            if done % 20 == 0:
                print(f'  ... {done}/{len(todo)}', flush=True)
    # applica cache agli eventi
    n = 0
    for e in evs:
        if not (e.get('latitude') and e.get('longitude')):
            c = cache.get(e.get('eventKey') or '')
            if c:
                e['latitude'], e['longitude'] = c['lat'], c['lon']
                n += 1
    json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
    json.dump(d, open(EVENTS, 'w', encoding='utf-8'), ensure_ascii=False)
    with_coords = sum(1 for e in evs if e.get('latitude') and e.get('longitude'))
    print(f'OK: {done} nuovi geocodificati, {n} applicati da cache, {with_coords}/{len(evs)} con coordinate', flush=True)

if __name__ == '__main__':
    main()
