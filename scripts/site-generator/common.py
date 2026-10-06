# -*- coding: utf-8 -*-
"""Wspólne elementy strony RevSerwis 4.0: <head>, nagłówek z mega-menu działów, stopka, pasek mobilny.

Generator jest opcjonalny (Python 3.9+, bez zależności). Strona działa jako statyczny HTML.
Źródło danych o działach: lib/divisions.json.
"""
import html as _html
import json
import os
import re
from urllib.parse import quote as _q

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PUB = os.path.join(ROOT, 'Public')
DATA = json.load(open(os.path.join(ROOT, 'lib', 'divisions.json'), encoding='utf-8'))
GROUPS = DATA['groups']
DIVISIONS = DATA['divisions']
BY_SLUG = {d['slug']: d for d in DIVISIONS}
REDIRECTS = DATA['redirects']
VERSION = '4'
SOON = '<em class="sh-new">Wkrótce</em>'

PHONE, TEL = '735 396 534', '+48735396534'
EMAIL = 'kontakt@revserwis.pl'
IG = 'https://www.instagram.com/revserwis_/'
FB = 'https://www.facebook.com/profile.php?id=61591448955070'
LOGO = 'https://i.imgur.com/dHWDH8j.png'
SITE = 'https://www.revserwis.pl/'

ORG = {
    "@context": "https://schema.org", "@type": "MovingCompany", "@id": SITE + "#organization", "name": "RevSerwis", "url": SITE,
    "telephone": TEL, "email": EMAIL, "logo": LOGO, "image": LOGO, "priceRange": "$$",
    "address": {"@type": "PostalAddress", "addressLocality": "Słupsk", "addressRegion": "pomorskie", "addressCountry": "PL"},
    "areaServed": ["Słupsk", "Pomorskie", "Zachodniopomorskie", "Polska"], "sameAs": [FB, IG]
}


def e(value):
    return _html.escape(str(value), quote=True)


def wa(text='Dzień dobry, chciałbym zapytać o wycenę.'):
    return 'https://wa.me/48735396534?text=' + _q(text)


def page_file(slug):
    return slug + '.html'


def dv(name, tag='span', cls='dv'):
    """Znak działu: „Rev” + nazwa w kolorze marki, np. Rev<b>Garden</b>."""
    rest = name[3:] if name.startswith('Rev') else name
    return f'<{tag} class="{cls}">Rev<b>{e(rest)}</b></{tag}>'


def head(title, desc, path, extra_ld=(), scripts=('assets/site.js',), robots=''):
    url = SITE + path
    lds = ''.join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n' for x in (ORG, *extra_ld))
    js = ''.join(f'<script defer src="{s}?v={VERSION}"></script>' for s in scripts)
    return f'''<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
{robots}<link rel="canonical" href="{url}">
<meta name="theme-color" content="#030303">
<meta property="og:type" content="website">
<meta property="og:locale" content="pl_PL">
<meta property="og:site_name" content="RevSerwis">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{LOGO}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/revmi/icons/favicon-32.png" type="image/png">
<link rel="apple-touch-icon" href="/revmi/icons/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<link rel="stylesheet" href="assets/tailwind.css">
<link rel="stylesheet" href="assets/site.css?v={VERSION}">
{lds}{js}
<noscript><style>.fade-up{{opacity:1;transform:none}}</style></noscript>
</head>
<body class="flex flex-col min-h-screen relative overflow-x-hidden">
<a class="rv-skip" href="#main-content">Przejdź do treści</a>
'''


NAV = [('revb2b.html', 'Dla firm'), ('realizacje.html', 'Realizacje'), ('cennik.html', 'Jak wyceniamy'), ('obszar-dzialania.html', 'Obszar'), ('kontakt.html', 'Kontakt')]


def header(current=''):
    in_div = current.replace('.html', '') in BY_SLUG or current == 'uslugi.html'
    cols = []
    for g in GROUPS:
        items = ''.join(
            f'<a href="{page_file(d["slug"])}"><i class="fa-solid {d["icon"]}" aria-hidden="true"></i><span><strong>{e(d["name"])}{SOON if d.get("soon") else ""}</strong><small>{e(d["tagline"])}</small></span></a>'
            for d in DIVISIONS if d['group'] == g['key'])
        cols.append(f'<div class="sh-col"><p class="sh-col-title">{e(g["name"])}</p>{items}</div>')
    mega = (f'<div class="sh-menu sh-mega">{"".join(cols)}<div class="sh-mega-foot"><span><i class="fa-solid fa-layer-group" aria-hidden="true"></i> 17 działów RevSerwis — jeden kontakt do wszystkiego.</span>'
            f'<span class="sh-mega-links"><a class="ghost" href="uslugi.html">Wszystkie usługi</a><a href="wycena.html">Bezpłatna wycena <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></span></div></div>')
    nav = ''.join(f'<a href="{f}" class="{"active" if f == current else ""}">{t}</a>' for f, t in NAV)
    mobile = ''
    for g in GROUPS:
        mobile += f'<div class="label">{e(g["name"])}</div>' + ''.join(
            f'<a href="{page_file(d["slug"])}"><i class="fa-solid {d["icon"]}" aria-hidden="true"></i>{e(d["name"])}{SOON if d.get("soon") else ""}</a>'
            for d in DIVISIONS if d['group'] == g['key'])
    firm = ('<div class="label">Firma</div><a href="index.html"><i class="fa-solid fa-house" aria-hidden="true"></i>Strona główna</a><a href="uslugi.html"><i class="fa-solid fa-layer-group" aria-hidden="true"></i>Wszystkie usługi</a>'
            + ''.join(f'<a href="{f}"><i class="fa-solid fa-angle-right" aria-hidden="true"></i>{t}</a>' for f, t in NAV if f != 'revb2b.html'))
    return f'''<header class="site-header" id="siteHeader">
  <div class="sh-inner">
    <a class="sh-logo" href="index.html" aria-label="RevSerwis — strona główna"><img src="{LOGO}" alt="RevSerwis" width="160" height="52"></a>
    <nav class="sh-nav" aria-label="Menu główne">
      <div class="sh-drop"><button type="button" aria-haspopup="true" aria-expanded="false" class="{"active" if in_div else ""}">Działy i usługi <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>{mega}</div>
      {nav}
    </nav>
    <div class="sh-actions">
      <a class="sh-wa" href="{e(wa())}" rel="noopener" target="_blank" aria-label="Napisz na WhatsApp"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></a>
      <a class="sh-phone" href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i>{PHONE}</a>
      <a class="sh-cta" href="wycena.html">Wyceń online <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
      <button class="sh-burger" id="menuToggle" type="button" aria-label="Otwórz menu" aria-expanded="false" aria-controls="mobileMenu"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>
    </div>
  </div>
  <div class="sh-mobile" id="mobileMenu" hidden>
    {mobile}
    {firm}
    <div class="sh-mobile-cta"><a href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i>Zadzwoń</a><a class="wa" href="{e(wa())}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i>WhatsApp</a><a class="primary" href="wycena.html"><i class="fa-solid fa-clipboard-list" aria-hidden="true"></i>Wyceń online</a></div>
  </div>
</header>'''


def footer():
    def col(title, items):
        return f'<div class="sf-col"><h3>{e(title)}</h3><ul>' + ''.join(f'<li><a href="{f}">{t}</a></li>' for f, t in items) + '</ul></div>'
    home = [(page_file(d['slug']), d['name']) for d in DIVISIONS if d['group'] in ('dom', 'transport')]
    biz = [(page_file(d['slug']), d['name']) for d in DIVISIONS if d['group'] in ('teren', 'firmy')]
    firma = [('uslugi.html', 'Wszystkie usługi'), ('realizacje.html', 'Realizacje'), ('cennik.html', 'Jak wyceniamy'), ('obszar-dzialania.html', 'Obszar działania'),
             ('wycena.html', 'Bezpłatna wycena'), ('kontakt.html', 'Formularz kontaktowy')]
    return f'''<footer class="site-footer">
  <div class="sf-inner">
    <div class="sf-grid">
      <div class="sf-brand"><img src="{LOGO}" alt="RevSerwis" width="148" height="48" loading="lazy"><p>Transport, porządki i obsługa nieruchomości w 17 wyspecjalizowanych działach. Baza w Słupsku — Pomorze, cała Polska i trasy europejskie. Klienci prywatni, firmy, hotele i obiekty.</p>
        <div class="sf-social"><a href="{FB}" aria-label="Facebook" rel="noopener" target="_blank"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i></a><a href="{IG}" aria-label="Instagram" rel="noopener" target="_blank"><i class="fa-brands fa-instagram" aria-hidden="true"></i></a><a href="{e(wa())}" aria-label="WhatsApp" rel="noopener" target="_blank" class="wa"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></a><a href="tel:{TEL}" aria-label="Telefon"><i class="fa-solid fa-phone" aria-hidden="true"></i></a><a href="mailto:{EMAIL}" aria-label="E-mail"><i class="fa-solid fa-envelope" aria-hidden="true"></i></a></div></div>
      {col('Dom i transport', home)}
      {col('Teren i firmy', biz)}
      {col('Firma', firma)}
      <div class="sf-col"><h3>Kontakt</h3><ul class="sf-contact"><li><i class="fa-solid fa-phone" aria-hidden="true"></i><span><small>Telefon</small><a href="tel:{TEL}">{PHONE}</a></span></li><li><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span><small>WhatsApp</small><a href="{e(wa())}" rel="noopener" target="_blank">{PHONE}</a></span></li><li><i class="fa-solid fa-envelope" aria-hidden="true"></i><span><small>E-mail</small><a href="mailto:{EMAIL}">{EMAIL}</a></span></li><li><i class="fa-brands fa-instagram" aria-hidden="true"></i><span><small>Instagram</small><a href="{IG}" rel="noopener" target="_blank">@revserwis_</a></span></li><li><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span><small>Baza</small><a href="obszar-dzialania.html">Słupsk, Pomorze</a></span></li></ul></div>
    </div>
    <div class="sf-bottom"><span>&copy; <span data-year>2026</span> RevSerwis. Wszystkie prawa zastrzeżone.</span>
      <nav aria-label="Stopka"><a href="polityka-prywatnosci.html">Polityka prywatności</a><button type="button" data-cookie-settings>Ustawienia cookies</button><a href="/revmi/" rel="nofollow">Panel</a></nav></div>
  </div>
</footer>'''


def mobile_bar(quote_href='wycena.html', wa_text=None):
    return (f'<div class="rv-mobile-bar" id="mobileBar"><a href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i> Zadzwoń</a>'
            f'<a class="wa" href="{e(wa(wa_text) if wa_text else wa())}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a>'
            f'<a href="{e(quote_href)}"><i class="fa-solid fa-clipboard-list" aria-hidden="true"></i> Wyceń</a></div>\n')


def wa_float(text=None):
    return f'<a class="rv-wa-float" href="{e(wa(text) if text else wa())}" rel="noopener" target="_blank" aria-label="Napisz do nas na WhatsApp"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>Napisz na WhatsApp</span></a>\n'


def page(title, desc, path, main, *, extra_ld=(), scripts=('assets/site.js',), quote_href='wycena.html', wa_text=None):
    return (head(title, desc, path, extra_ld, scripts) + header(path) + '\n<main class="flex-grow" id="main-content">' + main + '</main>\n'
            + footer() + '\n' + mobile_bar(quote_href, wa_text) + wa_float(wa_text) + '</body>\n</html>\n')


def apply_chrome(path, division_tag=None):
    """Podmienia nagłówek, stopkę, pasek mobilny i przycisk WhatsApp w istniejącej stronie."""
    name = os.path.basename(path)
    src = open(path, encoding='utf-8').read()
    out, n1 = re.subn(r'<header class="site-header".*?</header>', lambda m: header(name), src, count=1, flags=re.S)
    out, n2 = re.subn(r'<footer class="site-footer">.*?</footer>', lambda m: footer(), out, count=1, flags=re.S)
    m = re.search(r'<div class="rv-mobile-bar" id="mobileBar">.*?</div>\n?', out, flags=re.S)
    href = 'wycena.html'
    if m:
        hm = re.findall(r'href="(wycena\.html[^"]*)"', m.group(0))
        href = _html.unescape(hm[-1]) if hm else href
        out = out[:m.start()] + mobile_bar(href) + out[m.end():]
    out = re.sub(r'<a class="rv-wa-float".*?</a>\n?', '', out, flags=re.S)
    out = out.replace('</body>', wa_float() + '</body>', 1)
    out = re.sub(r'(assets/(?:site|quote|contact)\.(?:css|js))\?v=\d+', lambda mm: f'{mm.group(1)}?v={VERSION}', out)
    out = out.replace('"sameAs": ["https://www.facebook.com/profile.php?id=61591448955070"]', json.dumps({"sameAs": [FB, IG]}, ensure_ascii=False)[1:-1])
    if 'assets/quote.js' in out and 'assets/divisions.js' not in out:
        out = re.sub(r'(<script defer src="assets/quote\.js)', f'<script defer src="assets/divisions.js?v={VERSION}"></script>\\1', out, count=1)
    for old_page, new_page in REDIRECTS.items():
        out = out.replace(f'href="{old_page}', f'href="{new_page}')
    if division_tag and 'rv-div-tag' not in out:
        d = BY_SLUG[division_tag]
        tag = f'<a class="rv-div-tag" href="{page_file(d["slug"])}"><i class="fa-solid {d["icon"]}" aria-hidden="true"></i> Dział {e(d["name"])} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>'
        out = re.sub(r'(<h1[^>]*>)', lambda mm: tag + mm.group(1), out, count=1)
    open(path, 'w', encoding='utf-8').write(out)
    return n1, n2
