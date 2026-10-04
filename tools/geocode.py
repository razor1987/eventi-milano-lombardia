#!/usr/bin/env python3
"""Geocodifica gli eventi senza coordinate usando Nominatim (OSM).
Cache persistente in data/geocode.json indicizzata per eventKey,
cosi' le sync giornaliere non ripetono le query.
Uso cortese: 1 richiesta / 1.3s, User-Agent identificativo.

Le query semplici ("venue, città") funzionano meglio di quelle lunghe:
Nominatim fallisce spesso su "venue, via, città, città" (doppioni).
Con --refine-fallback ricontrolla anche gli eventi finiti sulle
coordinate di fallback del Duomo (a meno che la venue citi il Duomo).
"""
import json, time, re, urllib.parse, urllib.request, os, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVENTS = os.path.join(BASE, 'data', 'events.json')
CACHE = os.path.join(BASE, 'data', 'geocode.json')
UA = 'eventi-milano-lombardia/1.0 (sito personale non commerciale)'
DUOMO = (45.4641943, 9.1896346)

# venue note -> query che Nominatim risolve davvero
ALIASES = {
    'area zelig (zelig cabaret)': 'Teatro Zelig',
    'area zelig': 'Teatro Zelig',
    'zelig cabaret': 'Teatro Zelig',
    'teatro lirico giorgio gaber': 'Teatro Lirico Giorgio Gaber',
    'santeria toscana 31': 'Santeria Toscana 31',
    'triennale milano teatro': 'Triennale di Milano',
    'volvo studio milano': 'Volvo Studio',
    'soul movie studios': 'Soul Movie Studios',
    'teatro pime': 'Teatro PIME',
    'doppio malto milano': 'Doppio Malto',
    'yellow square': 'YellowSquare Milano',
    'osteria democratica': 'Osteria Democratica Milano',
    'teatro manzoni': 'Teatro Manzoni Milano',
    'teatro dal verme': 'Teatro Dal Verme',
    'teatro nazionale italiana assicurazioni': 'Teatro Nazionale Milano',
    'teatro degli arcimboldi': 'Teatro degli Arcimboldi',
    'teatro principe': 'Teatro Principe Milano',
    'teatro principe – allo sbagliato': 'Teatro Principe Milano',
    'blue note milano': 'Blue Note Milano',
    'alcatraz': 'Alcatraz Milano',
    'fabrique': 'Fabrique Milano',
    'magazzini generali': 'Magazzini Generali Milano',
    'circolo magnolia': 'Circolo Magnolia Segrate',
    'live club': "Live Club Trezzo sull'Adda",
    'bloom': 'Bloom Mezzago',
    'legend club': 'Legend Club Milano',
    'unipol forum': 'Unipol Forum Assago',
    'unipol dome': 'Unipol Dome Milano',
    'choruslife arena': 'ChorusLife Arena Bergamo',
    'fiera milano': 'Fiera Milano Rho',
    'piazza duomo': 'Piazza Duomo Milano',
}

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

def clean_venue(v):
    if not v:
        return ''
    v = v.strip()
    # alias esatti (case-insensitive)
    low = v.lower()
    if low in ALIASES:
        return ALIASES[low]
    # togli parentesi: "Area Zelig (Zelig Cabaret)" -> "Area Zelig"
    v2 = re.sub(r'\s*\(.*?\)\s*', ' ', v).strip()
    if v2.lower() in ALIASES:
        return ALIASES[v2.lower()]
    return v2 or v

def queries_for(e):
    qs = []
    venue = clean_venue(e.get('venue'))
    city = (e.get('city') or '').strip()
    addr = (e.get('address') or '').strip()
    if venue and city:
        qs.append(f'{venue}, {city}')          # semplice: funziona meglio
    if venue and addr and city and addr.lower() not in city.lower():
        qs.append(f'{venue}, {addr}, {city}')
    if venue and not city:
        qs.append(venue + ', Lombardia, Italia')
    if city:
        qs.append(city + ', Lombardia, Italia')
        qs.append(city + ', Italia')
    # dedup mantenendo l'ordine
    seen, out = set(), []
    for q in qs:
        if q not in seen:
            seen.add(q)
            out.append(q)
    return out

def is_duomo_fallback(e):
    try:
        return (abs(float(e.get('latitude')) - DUOMO[0]) < 1e-6 and
                abs(float(e.get('longitude')) - DUOMO[1]) < 1e-6)
    except (TypeError, ValueError):
        return False

def mentions_duomo(e):
    txt = ' '.join(str(e.get(k) or '') for k in ('venue', 'address', 'title')).lower()
    return 'duomo' in txt

def main():
    refine = '--refine-fallback' in sys.argv
    d = json.load(open(EVENTS, encoding='utf-8'))
    evs = d['events']
    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    todo = []
    for e in evs:
        if e.get('latitude') and e.get('longitude'):
            if refine and is_duomo_fallback(e) and not mentions_duomo(e):
                todo.append(e)
            continue
        if e.get('eventKey') not in cache:
            todo.append(e)
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
            # se ricade ancora sul Duomo senza citarlo, non peggiorare: tieni se già Duomo
            cache[e['eventKey']] = {'lat': latlon[0], 'lon': latlon[1]}
            done += 1
            if done % 20 == 0:
                print(f'  ... {done}/{len(todo)}', flush=True)
    # applica cache agli eventi (anche sopra coordinate fallback)
    n = 0
    for e in evs:
        c = cache.get(e.get('eventKey') or '')
        if c and (not (e.get('latitude') and e.get('longitude')) or
                  (refine and is_duomo_fallback(e) and not mentions_duomo(e))):
            e['latitude'], e['longitude'] = c['lat'], c['lon']
            n += 1
    json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
    json.dump(d, open(EVENTS, 'w', encoding='utf-8'), ensure_ascii=False)
    with_coords = sum(1 for e in evs if e.get('latitude') and e.get('longitude'))
    duomo_n = sum(1 for e in evs if is_duomo_fallback(e))
    print(f'OK: {done} geocodificati, {n} applicati, {with_coords}/{len(evs)} con coordinate ({duomo_n} su fallback Duomo)', flush=True)

if __name__ == '__main__':
    main()
