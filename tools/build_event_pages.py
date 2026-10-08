#!/usr/bin/env python3
"""Genera pagine statiche pre-renderizzate per ogni evento + sitemap.xml.

Per la SEO: ogni evento ha un URL dedicato e STABILE /evento/<slug>.html con
- <title> e meta description unici
- JSON-LD schema.org/Event (rich result di Google)
- contenuto visibile pre-renderizzato (niente JS necessario)

Lo slug deriva da eventKey (stabile tra le sync); gli ID numerici cambiano.
DEVE girare PRIMA dello strip dei campi interni (usa eventKey) e aggiunge
il campo pubblico "slug" a ogni evento in events.json.

Uso: python3 tools/build_event_pages.py
Idempotente: rigenera tutto, elimina le pagine di eventi non più presenti.
"""
import hashlib
import html
import json
import os
import re
import shutil
from datetime import date

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVENTS_JSON = os.path.join(BASE, 'data', 'events.json')
OUT_DIR = os.path.join(BASE, 'evento')
SITEMAP = os.path.join(BASE, 'sitemap.xml')
INDEX = os.path.join(BASE, 'index.html')
SITE = 'https://eventi-milano-lombardia.onrender.com'

CSS = """body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;margin:0;background:#f8fafc;color:#0f172a;line-height:1.6}
.wrap{max-width:720px;margin:0 auto;padding:24px 16px}
.top{background:#2563eb;color:#fff;padding:14px 16px}
.top a{color:#fff;text-decoration:none;font-weight:700;font-size:18px}
.card{background:#fff;border-radius:12px;padding:24px;margin:20px 0;box-shadow:0 2px 12px rgba(0,0,0,.07)}
h1{font-size:24px;margin:0 0 8px;line-height:1.3}
.meta{color:#475569;font-size:14px;margin-bottom:12px}
.badge{display:inline-block;background:#dbeafe;color:#1d4ed8;font-size:12px;font-weight:600;border-radius:999px;padding:3px 10px;margin:2px 4px 2px 0}
.badge.free{background:#dcfce7;color:#15803d}
.desc{white-space:pre-line;margin:14px 0}
.sec{margin-top:16px}.sec h2{font-size:15px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0 0 6px}
.btn{display:inline-block;background:#2563eb;color:#fff!important;text-decoration:none;font-weight:600;border-radius:10px;padding:12px 22px;margin-top:16px}
.src{font-size:13px;color:#64748b;margin-top:16px}.src a{color:#2563eb}
footer{color:#94a3b8;font-size:13px;padding:24px 16px;text-align:center}
@media(prefers-color-scheme:dark){body{background:#0f172a;color:#e2e8f0}.card{background:#1e293b}.meta{color:#94a3b8}.sec h2{color:#94a3b8}}"""


def esc(s):
    return html.escape(str(s or ''), quote=True)


def slug_for(e):
    """Slug stabile: hash di eventKey (gli ID numerici cambiano tra le sync)."""
    key = e.get('eventKey') or str(e.get('id'))
    return hashlib.sha1(str(key).encode('utf-8')).hexdigest()[:12]


def parse_start_time(time_label):
    m = re.search(r'(\d{1,2})[:.](\d{2})', time_label or '')
    if m:
        return f'{int(m.group(1)):02d}:{m.group(2)}:00'
    return None


def event_status(e):
    txt = ((e.get('status') or '') + ' ' + (e.get('caveat') or '')).lower()
    if 'annullat' in txt:
        return 'https://schema.org/EventCancelled'
    if 'rinviat' in txt or 'posticipat' in txt:
        return 'https://schema.org/EventPostponed'
    return 'https://schema.org/EventScheduled'


def offers(e):
    pt = e.get('priceType')
    if pt == 'free':
        return {'@type': 'Offer', 'price': '0', 'priceCurrency': 'EUR',
                'availability': 'https://schema.org/InStock'}
    if pt == 'paid':
        m = re.search(r'(\d+)[.,]?(\d{0,2})\s*€|€\s*(\d+)[.,]?(\d{0,2})',
                      e.get('priceLabel') or '')
        if m:
            num = next((g for g in m.groups() if g and g.isdigit()), None)
            if num:
                return {'@type': 'Offer', 'price': num,
                        'priceCurrency': 'EUR',
                        'availability': 'https://schema.org/InStock'}
    return None


def json_ld(e, url):
    start = e.get('startDate') or ''
    t = parse_start_time(e.get('timeLabel'))
    loc = {
        '@type': 'Place',
        'name': e.get('venue') or e.get('city') or '',
        'address': {
            '@type': 'PostalAddress',
            'addressLocality': e.get('city') or '',
            'addressRegion': 'Lombardia',
            'addressCountry': 'IT',
        },
    }
    if e.get('latitude') and e.get('longitude'):
        loc['geo'] = {'@type': 'GeoCoordinates',
                      'latitude': e['latitude'], 'longitude': e['longitude']}
    data = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        'name': e.get('title') or '',
        'startDate': f'{start}T{t}' if t else start,
        'eventStatus': event_status(e),
        'location': loc,
        'description': (e.get('details') or '')[:500],
        'url': url,
        'inLanguage': 'it',
    }
    if e.get('endDate') and e['endDate'] != start:
        data['endDate'] = e['endDate']
    off = offers(e)
    if off:
        data['offers'] = off
    return json.dumps(data, ensure_ascii=False)


def cat_label(e):
    return {'music': 'Concerto', 'festival': 'Festival', 'comedy': 'Stand-up',
            'sagre': 'Sagra', 'outdoor': 'All\u2019aperto',
            'inaugurazioni': 'Inaugurazione'}.get(e.get('category') or '', 'Evento')


def page_html(e, url):
    title = e.get('title') or 'Evento'
    date_line = e.get('dateLabel') or e.get('startDate') or ''
    if e.get('timeLabel'):
        date_line += ' · ' + e['timeLabel']
    place = ' · '.join(x for x in [e.get('venue'), e.get('city')] if x)
    desc_meta = ((e.get('details') or '').strip().replace('\n', ' ')[:155]
                 or f'{title} a {e.get("city") or "Milano"}: {date_line}.')
    pt = e.get('priceType')
    price_badge = ('<span class="badge free">Gratis</span>' if pt == 'free'
                   else f'<span class="badge">{esc(e.get("priceLabel") or "A pagamento")}</span>'
                   if pt == 'paid' else '')
    details = esc(e.get('details') or '')
    food = (f'<div class="sec"><h2>Food</h2><div class="desc">{esc(e.get("foodDetails"))}</div></div>'
            if e.get('foodDetails') else '')
    prices = ''
    if pt == 'paid' and e.get('priceLabel'):
        prices = (f'<div class="sec"><h2>Prezzi</h2><div>{esc(e.get("priceLabel"))}</div></div>')
    caveat = (f'<div class="sec"><h2>Nota</h2><div>{esc(e.get("caveat"))}</div></div>'
              if e.get('caveat') else '')
    sources = ''
    if e.get('sources'):
        links = ' · '.join(
            f'<a href="{esc(s.get("url"))}" rel="nofollow">{esc(s.get("name") or "fonte")}</a>'
            for s in e['sources'] if s.get('url'))
        if links:
            sources = f'<div class="src">Fonti: {links}</div>'
    addr = esc(e.get('address') or '')
    slug = e.get('slug') or ''
    return f"""<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)} — {esc(date_line)} | Eventi Milano Lombardia</title>
<meta name="description" content="{esc(desc_meta)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Eventi Milano Lombardia">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc_meta)}">
<meta property="og:url" content="{url}">
<style>{CSS}</style>
<script type="application/ld+json">{json_ld(e, url)}</script>
</head>
<body>
<div class="top"><a href="{SITE}/">Eventi Milano Lombardia</a></div>
<div class="wrap"><div class="card">
<span class="badge">{esc(cat_label(e))}</span>{price_badge}
<h1>{esc(title)}</h1>
<div class="meta">{esc(date_line)}<br>{esc(place)}{('<br>' + addr) if addr else ''}</div>
{f'<div class="desc">{details}</div>' if details else ''}
{food}{prices}{caveat}
<a class="btn" href="{SITE}/?evento={slug}">Apri nell'app</a>
{sources}
</div></div>
<footer>Eventi a Milano e in Lombardia — aggiornato ogni giorno.</footer>
</body>
</html>
"""


def main():
    with open(EVENTS_JSON, encoding='utf-8') as f:
        data = json.load(f)
    events = data.get('events', [])
    today = date.today().isoformat()

    if os.path.isdir(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    os.makedirs(OUT_DIR, exist_ok=True)

    urls = []
    for e in events:
        slug = slug_for(e)
        e['slug'] = slug
        url = f'{SITE}/evento/{slug}.html'
        with open(os.path.join(OUT_DIR, f'{slug}.html'), 'w', encoding='utf-8') as f:
            f.write(page_html(e, url))
        urls.append(url)

    with open(EVENTS_JSON, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)

    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          f'  <url><loc>{SITE}/</loc><lastmod>{today}</lastmod>'
          '<changefreq>daily</changefreq><priority>1.0</priority></url>']
    for u in urls:
        sm.append(f'  <url><loc>{u}</loc><lastmod>{today}</lastmod>'
                  '<changefreq>weekly</changefreq><priority>0.6</priority></url>')
    sm.append('</urlset>')
    with open(SITEMAP, 'w', encoding='utf-8') as f:
        f.write('\n'.join(sm))

    update_noscript(events)

    print(f'{len(urls)} pagine evento + sitemap ({len(urls) + 1} URL)')


def update_noscript(events):
    """Riempie il blocco noscript della homepage con i prossimi eventi
    (contenuto statico indicizzabile + link interni)."""
    if not os.path.isfile(INDEX):
        return
    h = open(INDEX, encoding='utf-8').read()
    start_m = '<!--NOSCRIPT-EVENTS-START-->'
    end_m = '<!--NOSCRIPT-EVENTS-END-->'
    if start_m not in h or end_m not in h:
        return
    today = date.today().isoformat()
    upcoming = sorted(
        (e for e in events if (e.get('startDate') or '') >= today),
        key=lambda e: e.get('startDate') or '')[:40]
    items = '\n'.join(
        f'<li><a href="{SITE}/evento/{e.get("slug")}.html">'
        f'{esc(e.get("title"))} — {esc(e.get("dateLabel") or e.get("startDate") or "")}'
        f' ({esc(e.get("city") or "")})</a></li>'
        for e in upcoming if e.get('slug'))
    block = (f'{start_m}\n<noscript><div style="max-width:720px;margin:0 auto;'
             'padding:24px 16px;font-family:system-ui,sans-serif">'
             '<h1>Eventi a Milano e in Lombardia</h1>'
             '<p>Tutti gli eventi a Milano e in Lombardia: concerti, festival, '
             'stand-up comedy e open mic, sagre, eventi all\u2019aperto e '
             'inaugurazioni. Cerca per data, zona, prezzo e distanza. '
             'Aggiornato ogni giorno.</p>'
             '<h2>Prossimi eventi</h2><ul>\n'
             f'{items}\n</ul><p>Attiva JavaScript per usare ricerca e filtri.</p>'
             '</div></noscript>\n' + end_m)
    h = h[:h.index(start_m)] + block + h[h.index(end_m) + len(end_m):]
    open(INDEX, 'w', encoding='utf-8').write(h)
    print(f'noscript homepage: {len(upcoming)} eventi')


if __name__ == '__main__':
    main()
