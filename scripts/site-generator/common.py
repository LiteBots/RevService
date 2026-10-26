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
CATEGORIES = DATA['categories']
PHOTOS = DATA['photos']
VERSION = '6'
# Kategoria (język klienta) → podstrona z opisem.
CAT_PAGE = {'przeprowadzka': 'revhome.html', 'transport': 'revcargo.html', 'moto': 'revmoto.html', 'oproznianie': 'oproznianie-utylizacja.html',
            'sprzatanie': 'revclean.html', 'ogrod': 'revgarden.html', 'remont': 'revbud.html', 'przechowanie': 'revstorage.html',
            'osoby': 'revevent.html', 'firmy': 'revb2b.html', 'zima': 'revwinter.html'}


def photo_url(key, w, h=None, q=60):
    pid = PHOTOS[key][0]
    return f'https://images.unsplash.com/{pid}?auto=format&fit=crop&w={w}' + (f'&h={h}' if h else '') + f'&q={q}'


def photo(key, alt='', cls='', sizes='100vw', ratio=(16, 10), widths=(480, 800, 1200, 1600), eager=False):
    """<img> ze zdjęciem z Unsplash (srcset, lazy-loading). Zdjęcia: licencja Unsplash, autorzy w lib/divisions.json → photos."""
    rw, rh = ratio
    srcset = ', '.join(f'{photo_url(key, w, round(w * rh / rw))} {w}w' for w in widths)
    mid = widths[len(widths) // 2]
    return (f'<img class="{cls}" src="{photo_url(key, mid, round(mid * rh / rw))}" srcset="{srcset}" sizes="{sizes}" alt="{e(alt)}" '
            f'width="{mid}" height="{round(mid * rh / rw)}" decoding="async"{" fetchpriority=" + chr(34) + "high" + chr(34) if eager else " loading=" + chr(34) + "lazy" + chr(34)}>')
import glob as _glob
import hashlib as _hashlib
import shutil as _shutil
_ASSET_CACHE = {}


def asset(path):
    """Zwraca adres pliku z hashem treści (np. assets/site.3f9a1c2b.css) i tworzy jego kopię.
    Dzięki temu przeglądarka/CDN nigdy nie poda starej wersji CSS/JS po wdrożeniu."""
    path = re.sub(r'\?v=\d+$', '', path)
    path = re.sub(r'\.[0-9a-f]{8}(\.(?:css|js))$', r'\1', path)
    if path in _ASSET_CACHE:
        return _ASSET_CACHE[path]
    src = os.path.join(PUB, path)
    base, ext = os.path.splitext(src)
    digest = _hashlib.md5(open(src, 'rb').read()).hexdigest()[:8]
    for old in _glob.glob(base + '.' + '[0-9a-f]' * 8 + ext):
        os.remove(old)
    _shutil.copyfile(src, f'{base}.{digest}{ext}')
    rel = f'{os.path.splitext(path)[0]}.{digest}{ext}'
    _ASSET_CACHE[path] = rel
    return rel


ASSET_RX = re.compile(r'assets/(?:tailwind|site|quote|contact|divisions)(?:\.[0-9a-f]{8})?\.(?:css|js)(?:\?v=\d+)?')
SOON = '<em class="sh-new">Wkrótce</em>'
ICON_LINKS = ('<link rel="icon" href="/favicon.ico" sizes="48x48">\n<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n'
              '<link rel="icon" href="/favicon-96x96.png" sizes="96x96" type="image/png">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<link rel="manifest" href="/site.webmanifest">')

PHONE, TEL = '735 396 534', '+48735396534'
EMAIL = 'kontakt@revserwis.pl'
IG = 'https://www.instagram.com/revserwis_/'
FB = 'https://www.facebook.com/profile.php?id=61591448955070'
SITE = 'https://www.revserwis.pl/'
LOGO = SITE + 'favicon-512x512.png'
OG_IMAGE = SITE + 'assets/brand/og-revserwis.png'
GMAPS = 'https://www.google.com/maps?cid=2360414228630652549'
COMPANY = {'name': 'Rev Serwis Kacper Taczała', 'nip': '8393269274', 'regon': '545866163', 'city': 'Słupsk'}
CONTENT = json.load(open(os.path.join(PUB, 'assets', 'content.json'), encoding='utf-8'))
REVIEWS = CONTENT.get('reviews', [])
RATING = CONTENT.get('rating', 5.0)
RATING_COUNT = CONTENT.get('ratingCount', len(REVIEWS))
BRAND = '<img class="brand-mark" src="assets/brand/revserwis-mark.png" alt="" width="40" height="40"><span class="brand-word"><span>Rev<b>Serwis</b></span><small>Transport · Porządki · Obsługa nieruchomości</small></span>'

ORG = {
    "@context": "https://schema.org", "@type": "MovingCompany", "@id": SITE + "#organization", "name": "RevSerwis", "alternateName": "Rev Serwis",
    "legalName": COMPANY['name'], "taxID": COMPANY['nip'], "identifier": [{"@type": "PropertyValue", "propertyID": "REGON", "value": COMPANY['regon']}],
    "url": SITE, "telephone": TEL, "email": EMAIL, "logo": LOGO, "image": [OG_IMAGE, LOGO], "priceRange": "$$",
    "address": {"@type": "PostalAddress", "addressLocality": "Słupsk", "postalCode": "76-200", "addressRegion": "pomorskie", "addressCountry": "PL"},
    "geo": {"@type": "GeoCoordinates", "latitude": 54.4641, "longitude": 17.0287},
    "areaServed": [{"@type": "Country", "name": "Polska"}, {"@type": "City", "name": "Słupsk"}, {"@type": "City", "name": "Ustka"}, {"@type": "City", "name": "Koszalin"}, {"@type": "City", "name": "Sławno"}, {"@type": "City", "name": "Bytów"}, {"@type": "City", "name": "Miastko"}],
    "openingHoursSpecification": [{"@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], "opens": "07:00", "closes": "20:00"}],
    "hasMap": GMAPS, "sameAs": [FB, IG, GMAPS]
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


def head(title, desc, path, extra_ld=(), scripts=('assets/site.js',), robots='', crumbs=None):
    url = SITE + path
    if crumbs:
        extra_ld = (*extra_ld, {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": i, "name": n, "item": SITE + u} for i, (n, u) in enumerate([('Strona główna', ''), *crumbs], 1)]})
    lds = ''.join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n' for x in (ORG, *extra_ld))
    js = ''.join(f'<script defer src="{asset(s)}"></script>' for s in scripts)
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
<meta property="og:image" content="{OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-96x96.png" sizes="96x96" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="geo.region" content="PL-22">
<meta name="geo.placename" content="Słupsk">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<link rel="stylesheet" href="{asset('assets/tailwind.css')}">
<link rel="stylesheet" href="{asset('assets/site.css')}">
{lds}{js}
<noscript><style>.fade-up{{opacity:1;transform:none}}</style></noscript>
</head>
<body class="flex flex-col min-h-screen relative overflow-x-hidden">
<a class="rv-skip" href="#main-content">Przejdź do treści</a>
'''


NAV = [('obszar-dzialania.html', 'Obszar działania'), ('revb2b.html', 'Dla firm'), ('realizacje.html', 'Opinie i realizacje'), ('kontakt.html', 'Kontakt')]


def header(current=''):
    in_div = current.replace('.html', '') in BY_SLUG or current == 'uslugi.html'
    items = ''.join(
        f'<a class="sh-cat" href="{CAT_PAGE[c["key"]]}"><span class="sh-cat-img" style="background-image:url({photo_url(c["photo"], 160, 120)})"></span>'
        f'<span><strong>{e(c["name"])}{SOON if c.get("soon") else ""}</strong><small>{e(c["desc"])}</small></span></a>'
        for c in CATEGORIES)
    mega = (f'<div class="sh-menu sh-mega"><div class="sh-cats">{items}</div><div class="sh-mega-foot"><span><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Szukasz konkretnego działu? <a class="sh-inline" href="uslugi.html">Wszystkie działy i usługi</a></span>'
            f'<span class="sh-mega-links"><a href="wycena.html">Wyceń zlecenie <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></span></div></div>')
    nav = ''.join(f'<a href="{f}" class="{"active" if f == current else ""}">{t}</a>' for f, t in NAV)
    mobile = '<div class="label">Usługi</div>' + ''.join(
        f'<a href="{CAT_PAGE[c["key"]]}"><i class="fa-solid {c["icon"]}" aria-hidden="true"></i>{e(c["name"])}{SOON if c.get("soon") else ""}</a>' for c in CATEGORIES)
    firm = ('<div class="label">Firma</div><a href="index.html"><i class="fa-solid fa-house" aria-hidden="true"></i>Strona główna</a><a href="uslugi.html"><i class="fa-solid fa-layer-group" aria-hidden="true"></i>Wszystkie działy (17)</a>'
            + ''.join(f'<a href="{f}"><i class="fa-solid fa-angle-right" aria-hidden="true"></i>{t}</a>' for f, t in NAV) + '<a href="obszar-dzialania.html"><i class="fa-solid fa-angle-right" aria-hidden="true"></i>Obszar działania</a>')
    return f'''<header class="site-header" id="siteHeader">
  <div class="sh-inner">
    <a class="sh-logo" href="index.html" aria-label="RevSerwis — strona główna">{BRAND}</a>
    <nav class="sh-nav" aria-label="Menu główne">
      <div class="sh-drop"><button type="button" aria-haspopup="true" aria-expanded="false" class="{"active" if in_div else ""}">Usługi <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>{mega}</div>
      {nav}
    </nav>
    <div class="sh-actions">
      <a class="sh-wa" href="{e(wa())}" rel="noopener" target="_blank" aria-label="Napisz na WhatsApp"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></a>
      <a class="sh-phone" href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i>{PHONE}</a>
      <a class="sh-cta" href="wycena.html">Wyceń zlecenie <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
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
    cats = [(CAT_PAGE[c['key']], e(c['name'])) for c in CATEGORIES]
    home = cats[:5]
    local = [('przeprowadzki-slupsk.html', 'Przeprowadzki Słupsk'), ('oproznianie-i-wywoz-slupsk.html', 'Opróżnianie Słupsk'), ('przeprowadzki-ustka.html', 'Przeprowadzki Ustka'),
             ('przeprowadzki-koszalin.html', 'Przeprowadzki Koszalin'), ('odsniezanie-slupsk.html', 'Odśnieżanie Słupsk'), ('obszar-dzialania.html', 'Wszystkie miasta →')]
    firma = [('realizacje.html', 'Opinie i realizacje'), ('cennik.html', 'Jak wyceniamy'), ('uslugi.html', 'Wszystkie usługi'),
             ('wycena.html', 'Wycena online'), ('wycena.html?rodzaj=ogledziny', 'Wycena z dojazdem'), ('kontakt.html', 'Formularz kontaktowy')]
    return f'''<footer class="site-footer">
  <div class="sf-inner">
    <div class="sf-grid">
      <div class="sf-brand"><a class="sf-logo" href="index.html" aria-label="RevSerwis">{BRAND}</a><p>Przeprowadzki krajowe i międzynarodowe, opróżnianie i wywóz, transport rzeczy, odśnieżanie oraz ogród i działka. Baza w Słupsku, realizacje w całej Polsce dzięki oddziałom własnym i partnerskim.</p>
        <a class="sf-rating" href="{GMAPS}" rel="noopener" target="_blank"><b>{str(RATING).replace('.', ',')}</b> <span aria-hidden="true">★★★★★</span> <small>{RATING_COUNT} opinii w Google</small></a>
        <div class="sf-social"><a href="{FB}" aria-label="Facebook" rel="noopener" target="_blank"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i></a><a href="{IG}" aria-label="Instagram" rel="noopener" target="_blank"><i class="fa-brands fa-instagram" aria-hidden="true"></i></a><a href="{e(wa())}" aria-label="WhatsApp" rel="noopener" target="_blank" class="wa"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></a><a href="tel:{TEL}" aria-label="Telefon"><i class="fa-solid fa-phone" aria-hidden="true"></i></a><a href="mailto:{EMAIL}" aria-label="E-mail"><i class="fa-solid fa-envelope" aria-hidden="true"></i></a></div></div>
      {col('Główne usługi', home)}
      {col('Lokalnie', local)}
      {col('Firma', firma)}
      <div class="sf-col"><h3>Kontakt</h3><ul class="sf-contact"><li><i class="fa-solid fa-phone" aria-hidden="true"></i><span><small>Telefon</small><a href="tel:{TEL}">{PHONE}</a></span></li><li><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span><small>WhatsApp</small><a href="{e(wa())}" rel="noopener" target="_blank">{PHONE}</a></span></li><li><i class="fa-solid fa-envelope" aria-hidden="true"></i><span><small>E-mail</small><a href="mailto:{EMAIL}">{EMAIL}</a></span></li><li><i class="fa-brands fa-instagram" aria-hidden="true"></i><span><small>Instagram</small><a href="{IG}" rel="noopener" target="_blank">@revserwis_</a></span></li><li><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span><small>Baza</small><a href="obszar-dzialania.html">Słupsk · cała Polska</a></span></li></ul></div>
    </div>
    <p class="sf-company">{COMPANY['name']} · {COMPANY['city']} · NIP {COMPANY['nip']} · REGON {COMPANY['regon']}</p>
    <div class="sf-bottom"><span>&copy; <span data-year>2026</span> RevSerwis. Wszystkie prawa zastrzeżone. Zdjęcia: <a href="https://unsplash.com/?utm_source=revserwis&amp;utm_medium=referral" rel="noopener" target="_blank">Unsplash</a>.</span>
      <nav aria-label="Stopka"><a href="polityka-prywatnosci.html">Polityka prywatności</a><button type="button" data-cookie-settings>Ustawienia cookies</button><a href="/revmi/" rel="nofollow">Panel</a></nav></div>
  </div>
</footer>'''


PRICE_MODELS = """<div class="price-models">
  <article class="price-model"><span class="pm-tag">Bezpłatnie</span><h3>Wycena orientacyjna — widełki cenowe</h3><p>Na podstawie opisu i zdjęć podajemy <strong>przedział ceny (od–do)</strong>. Szybko i bez wizyty — dobra, żeby sprawdzić budżet.</p>
    <ul><li><i class="fa-solid fa-check" aria-hidden="true"></i>Formularz online, telefon lub WhatsApp ze zdjęciami</li><li><i class="fa-solid fa-check" aria-hidden="true"></i>Odpowiedź z widełkami cenowymi</li><li><i class="fa-solid fa-check" aria-hidden="true"></i>Bez zobowiązań i bez dojazdu</li><li class="no"><i class="fa-solid fa-minus" aria-hidden="true"></i>Kwota ostateczna zależy od rzeczywistego zakresu</li></ul>
    <a class="rv-button ghost" href="wycena.html?rodzaj=widelki">Poproś o widełki</a></article>
  <article class="price-model paid"><span class="pm-tag">Płatna · z dojazdem</span><h3>Rzetelna wycena po oględzinach</h3><p>Przyjeżdżamy na miejsce, sprawdzamy zakres, ilości, dostęp i utrudnienia. Dostajesz <strong>dokładną wycenę</strong> i plan realizacji.</p>
    <ul><li><i class="fa-solid fa-check" aria-hidden="true"></i>Oględziny na miejscu w umówionym terminie</li><li><i class="fa-solid fa-check" aria-hidden="true"></i>Dokładna cena i zakres prac na piśmie</li><li><i class="fa-solid fa-check" aria-hidden="true"></i>Najlepsza przy większych i nietypowych zleceniach</li><li><i class="fa-solid fa-check" aria-hidden="true"></i>Koszt wizyty podajemy przy umawianiu</li></ul>
    <a class="rv-button" href="wycena.html?rodzaj=ogledziny">Umów wycenę z dojazdem</a></article>
</div>
<p class="price-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Widełki z bezpłatnej wyceny są orientacyjne. Wiążącą kwotę podajemy po oględzinach lub po doprecyzowaniu zakresu.</p>"""


def mobile_bar(quote_href='wycena.html', wa_text=None):
    return (f'<div class="rv-mobile-bar" id="mobileBar"><a href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i> Zadzwoń</a>'
            f'<a class="wa" href="{e(wa(wa_text) if wa_text else wa())}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a>'
            f'<a href="{e(quote_href)}"><i class="fa-solid fa-clipboard-list" aria-hidden="true"></i> Wyceń</a></div>\n')


def wa_float(text=None):
    return f'<a class="rv-wa-float" href="{e(wa(text) if text else wa())}" rel="noopener" target="_blank" aria-label="Napisz do nas na WhatsApp"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>Napisz na WhatsApp</span></a>\n'


def page(title, desc, path, main, *, extra_ld=(), scripts=('assets/site.js',), quote_href='wycena.html', wa_text=None, crumbs=None):
    return (head(title, desc, path, extra_ld, scripts, crumbs=crumbs) + header(path) + '\n<main class="flex-grow" id="main-content">' + main + '</main>\n'
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
    if 'assets/quote' in out and 'assets/divisions' not in out:
        out = re.sub(r'(<script defer src="assets/quote)', '<script defer src="assets/divisions.js"></script>\\1', out, count=1)
    out = ASSET_RX.sub(lambda mm: asset(mm.group(0)), out)
    out = out.replace('<link rel="icon" href="/revmi/icons/favicon-32.png" type="image/png">', ICON_LINKS)
    out = out.replace('<link rel="apple-touch-icon" href="/revmi/icons/apple-touch-icon.png">\n', '')
    out = out.replace('https://i.imgur.com/dHWDH8j.png', OG_IMAGE).replace('<meta name="twitter:card" content="summary">', '<meta name="twitter:card" content="summary_large_image">')
    out = re.sub(r'"areaServed": \[[^\]]*\]', '"areaServed": ["Słupsk", "Ustka", "Koszalin", "Sławno", "Bytów", "Miastko", "Polska"]', out)
    out = out.replace('"sameAs": ["https://www.facebook.com/profile.php?id=61591448955070"]', json.dumps({"sameAs": [FB, IG]}, ensure_ascii=False)[1:-1])
    for old_page, new_page in REDIRECTS.items():
        out = out.replace(f'href="{old_page}', f'href="{new_page}')
    if division_tag and 'rv-div-tag' not in out:
        d = BY_SLUG[division_tag]
        tag = f'<a class="rv-div-tag" href="{page_file(d["slug"])}"><i class="fa-solid {d["icon"]}" aria-hidden="true"></i> Dział {e(d["name"])} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>'
        out = re.sub(r'(<h1[^>]*>)', lambda mm: tag + mm.group(1), out, count=1)
    open(path, 'w', encoding='utf-8').write(out)
    return n1, n2


def stars(n=5):
    return '<span class="rv-stars" aria-label="Ocena ' + str(n) + ' na 5">' + '★' * int(n) + '</span>'


def reviews_block(limit=None, offset=0, title='Opinie klientów z Google', lead=None):
    """Prawdziwe opinie z wizytówki Google (Public/assets/content.json) — wyrenderowane w HTML (widoczne dla Google)."""
    items = [r for r in REVIEWS if r.get('text')] or REVIEWS
    if limit:
        items = (items[offset % len(items):] + items[:offset % len(items)])[:limit]
    cards = ''.join(
        f'<figure class="rv-review"><div class="rv-review-top"><span class="rv-review-av">{e(r["author"][:1].upper())}</span><figcaption><strong>{e(r["author"])}</strong><small>{e(r.get("source", "Google"))}</small></figcaption>{stars(r.get("rating", 5))}</div>'
        f'<blockquote>{e(r.get("text") or "Ocena bez komentarza.").replace(chr(10), "<br>")}</blockquote></figure>' for r in items)
    head_html = (f'<div class="rv-rating-big"><b>{str(RATING).replace(".", ",")}</b>{stars(5)}<span>{RATING_COUNT} opinii w Google</span>'
                 f'<a class="rv-button ghost sm" href="{GMAPS}" rel="noopener" target="_blank"><i class="fa-brands fa-google" aria-hidden="true"></i> Zobacz w Google</a></div>')
    note = '<p class="rv-review-note">Publikujemy wszystkie opinie z naszej wizytówki Google — bez wybierania i bez edycji. Opinie mogą wystawiać klienci po skorzystaniu z usługi.</p>'
    return (f'<section class="v4-section" id="opinie"><div class="v4-wrap"><div class="v4-head"><span class="v4-kicker">Opinie</span><h2>{title}</h2>'
            f'{f"<p class=v4-lead>{lead}</p>" if lead else ""}</div>{head_html}<div class="rv-reviews">{cards}</div>{note}</div></section>')


def rating_ld():
    return {"@context": "https://schema.org", "@type": "ItemList", "name": "Opinie klientów RevSerwis", "numberOfItems": len(REVIEWS),
            "itemListElement": [{"@type": "ListItem", "position": i, "item": {"@type": "Review", "author": {"@type": "Person", "name": r["author"]},
                                                                              "reviewRating": {"@type": "Rating", "ratingValue": r.get("rating", 5), "bestRating": 5},
                                                                              "reviewBody": r.get("text", ""), "datePublished": r.get("date", ""),
                                                                              "itemReviewed": {"@id": SITE + "#organization"}}}
                                for i, r in enumerate([x for x in REVIEWS if x.get('text')], 1)]}
