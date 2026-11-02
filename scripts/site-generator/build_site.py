# -*- coding: utf-8 -*-
"""Buduje stronę RevSerwis 4.0: główna, 17 podstron działów, „Wszystkie usługi”, kontakt,
odświeża nagłówek/stopkę pozostałych stron, usuwa strony zastąpione przez działy i generuje sitemap.

    python3 scripts/site-generator/build_site.py
"""
import glob
import json
import os
from datetime import date
from urllib.parse import quote

import local_pages
from common import (reviews_block, GMAPS, RATING, RATING_COUNT, stars, PRICE_MODELS, BY_SLUG, CATEGORIES, CAT_PAGE, DIVISIONS, GROUPS, PUB, REDIRECTS, EMAIL, IG, PHONE, TEL, SITE, BRAND,
                    apply_chrome, asset, dv, e, head, page, page_file, photo, photo_url, wa)

TODAY = date.today().isoformat()

# Szczegółowe podstrony (starsze) → dział, do którego należą.
LEGACY = {
    'przeprowadzki.html': 'revhome', 'oproznianie-utylizacja.html': 'revhome', 'przygotowanie-nieruchomosci-do-sprzedazy.html': 'revhome',
    'transport.html': 'revcargo', 'przewozy-osob.html': 'revevent', 'odbior-odpadow.html': 'revfacility', 'mycie-cisnieniowe.html': 'revfacility',
    'rozbiorki-i-wyburzenia.html': 'revbud', 'prace-ziemne-i-koparkowe.html': 'revsite', 'wycinka-drzew-i-krzewow.html': 'revgarden',
    'usuwanie-pni-i-korzeni.html': 'revgarden', 'porzadkowanie-dzialek-i-posesji.html': 'revgarden', 'czyszczenie-hal-i-garazy.html': 'revclean',
}
LEGACY_TITLES = {
    'przeprowadzki.html': 'Przeprowadzki', 'oproznianie-utylizacja.html': 'Opróżnianie lokali', 'przygotowanie-nieruchomosci-do-sprzedazy.html': 'Przygotowanie do sprzedaży',
    'transport.html': 'Transport z wniesieniem', 'przewozy-osob.html': 'Przewóz osób i transfery', 'odbior-odpadow.html': 'Odbiór gabarytów',
    'mycie-cisnieniowe.html': 'Mycie ciśnieniowe', 'rozbiorki-i-wyburzenia.html': 'Rozbiórki wiat, altan i szop', 'prace-ziemne-i-koparkowe.html': 'Prace ziemne i koparkowe',
    'wycinka-drzew-i-krzewow.html': 'Wycinka drzew i krzewów', 'usuwanie-pni-i-korzeni.html': 'Usuwanie pni i korzeni',
    'porzadkowanie-dzialek-i-posesji.html': 'Porządkowanie działek', 'czyszczenie-hal-i-garazy.html': 'Czyszczenie hal i garaży',
}
GROUP_NAME = {g['key']: g['name'] for g in GROUPS}


def section(kicker, title, inner, lead='', cls='', sid=''):
    lead_html = f'<p class="v4-lead">{lead}</p>' if lead else ''
    return (f'<section class="v4-section {cls}"{f" id={chr(34)}{sid}{chr(34)}" if sid else ""}><div class="v4-wrap">'
            f'<div class="v4-head"><span class="v4-kicker">{kicker}</span><h2>{title}</h2>{lead_html}</div>{inner}</div></section>')


def steps_html(steps, cls='v4-steps'):
    return f'<ol class="{cls}">' + ''.join(f'<li><span>{i}</span><p>{e(s)}</p></li>' for i, s in enumerate(steps, 1)) + '</ol>'


def faq_html(faq):
    return '<div class="rv-faq">' + ''.join(f'<details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in faq) + '</div>'


def faq_ld(faq):
    return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}


def division_card(d, services=3, cls=''):
    tags = ''.join(f'<li>{e(s)}</li>' for s in d['services'][:services])
    more = len(d['services']) - services
    soon = '<span class="v4-soon">Wkrótce</span>' if d.get('soon') else ''
    return (f'<a class="v4-div {cls}" href="{page_file(d["slug"])}" data-cat="{d["group"]}">'
            f'<span class="v4-div-top"><span class="v4-div-icon"><i class="fa-solid {d["icon"]}" aria-hidden="true"></i></span>{soon}</span>'
            f'{dv(d["name"], "strong")}<span class="v4-div-tag">{e(d["tagline"])}</span>'
            f'<ul>{tags}{f"<li class={chr(34)}more{chr(34)}>+ {more} więcej</li>" if more > 0 else ""}</ul>'
            f'<span class="v4-div-go">Zobacz dział <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span></a>')


def cta_band(title, text, quote_href, wa_text, soon=False):
    primary = (f'<a class="rv-button" href="kontakt.html?temat=winter&amp;dzial=revwinter">Zapisz się na start</a>' if soon
               else f'<a class="rv-button" href="{e(quote_href)}">Wyceń zlecenie</a>')
    return (f'<section class="v4-section"><div class="v4-wrap"><div class="v4-cta">'
            f'<div><h2>{title}</h2><p>{text}</p></div>'
            f'<div class="v4-cta-actions">{primary}<a class="rv-button wa" href="{e(wa(wa_text))}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a>'
            f'<a class="rv-button ghost" href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i> {PHONE}</a></div></div></div></section>')


# ---------------------------------------------------------------------------
# Podstrony działów
# ---------------------------------------------------------------------------

def build_division(d):
    slug, name = d['slug'], d['name']
    quote_href = f'wycena.html?dzial={slug}'
    wa_text = f'Dzień dobry, piszę w sprawie działu {name}.'
    soon = bool(d.get('soon'))
    preview = ''.join(f'<li><i class="fa-solid fa-check" aria-hidden="true"></i>{e(s)}</li>' for s in d['services'][:7])
    more = len(d['services']) - 7
    primary = (f'<a class="rv-button" href="kontakt.html?temat=winter&amp;dzial={slug}"><i class="fa-solid fa-bell" aria-hidden="true"></i> Zapisz się na start</a>' if soon
               else f'<a class="rv-button" href="{quote_href}">Wyceń zlecenie <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>')
    hero = f'''<section class="v4-hero v4-hero-sub v6-photo-hero"><div class="v6-hero-media">{photo(d["photo"], "", "v6-hero-img", "100vw", (16, 9), (640, 1000, 1600, 2000), True)}</div><div class="v4-wrap v4-hero-grid">
  <div>
    <nav class="rv-crumbs" aria-label="Okruszki"><a href="index.html">Strona główna</a><span>/</span><a href="uslugi.html">Działy</a><span>/</span><span class="text-brand-500">{e(name)}</span></nav>
    <div class="v4-eyebrow"><i class="fa-solid {d["icon"]}" aria-hidden="true"></i> {e(GROUP_NAME[d["group"]])}{' · <b>Wkrótce</b>' if soon else ''}</div>
    <h1 class="v4-div-title">{dv(name)}<span>{e(d["tagline"])}</span></h1>
    <p class="v4-hero-lead">{e(d["lead"])}</p>
    <div class="v4-actions">{primary}<a class="rv-button wa" href="{e(wa(wa_text))}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a><a class="rv-button ghost" href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i> {PHONE}</a></div>
  </div>
  <aside class="v4-scope"><p class="v4-scope-title"><i class="fa-solid fa-list-check" aria-hidden="true"></i> Zakres działu</p><ul>{preview}</ul>{f'<a href="#zakres">+ {more} więcej usług</a>' if more > 0 else '<a href="#zakres">Szczegóły zakresu</a>'}</aside>
</div></section>'''

    services = '<div class="v4-services">' + ''.join(
        f'<a class="v4-service" href="{"kontakt.html?temat=winter&amp;dzial=" + slug if soon else quote_href + "&amp;zakres=" + e(quote(s))}"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>{e(s)}</span><i class="fa-solid fa-arrow-right go" aria-hidden="true"></i></a>'
        for s in d['services']) + '</div>'
    body = hero
    body += section('Zakres', f'Co robimy w {e(name)}?', services, 'Kliknij usługę, aby od razu przejść do wyceny z zaznaczonym zakresem.' if not soon else 'Zakres działu na nadchodzący sezon.', sid='zakres')

    h = d['highlight']
    body += (f'<section class="v4-section"><div class="v4-wrap"><div class="v4-product"><div class="v4-product-text">'
             f'<span class="v4-kicker">{"Abonament" if slug in ("revwinter", "revfacility") else "Nasz produkt"}</span><h2>{e(h["title"])}</h2><p>{e(h["text"])}</p>'
             f'<div class="v4-actions">{primary}</div></div>{steps_html(h["steps"], "v4-flow")}</div></div></section>')

    aud = '<div class="v4-audience">' + ''.join(f'<span><i class="fa-solid fa-user-check" aria-hidden="true"></i>{e(a)}</span>' for a in d['audience']) + '</div>'
    process = steps_html(['Zgłoszenie — formularz, telefon lub WhatsApp ze zdjęciami', 'Wycena i termin — potwierdzamy zakres i cenę', 'Realizacja — jedna ekipa, ustalony termin', 'Rozliczenie — paragon lub faktura VAT'])
    body += (f'<section class="v4-section"><div class="v4-wrap v4-two"><div><div class="v4-head"><span class="v4-kicker">Dla kogo</span><h2>Komu pomagamy</h2></div>{aud}</div>'
             f'<div><div class="v4-head"><span class="v4-kicker">Proces</span><h2>Jak działamy</h2></div>{process}</div></div></section>')

    pages = [p for p in d.get('pages', []) if p in LEGACY_TITLES]
    if pages:
        links = '<div class="rv-related">' + ''.join(
            f'<a href="{p}"><i class="fa-solid fa-file-lines" aria-hidden="true"></i><span><strong>{e(LEGACY_TITLES[p])}</strong><small>Szczegóły usługi, przykłady i pytania</small></span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>'
            for p in pages) + '</div>'
        body += section('Więcej informacji', 'Szczegółowe opisy usług', links)

    hub = {'revhome': 'przeprowadzki', 'revcargo': 'transport-rzeczy', 'revwinter': 'odsniezanie', 'revgarden': 'ogrod-i-dzialka'}.get(slug)
    if hub:
        body += local_pages.local_links_section(hub)
    body += section('Warto wiedzieć', 'Najczęstsze pytania', faq_html(d['faq']))
    related = '<div class="v4-divs v4-divs-3">' + ''.join(division_card(BY_SLUG[r]) for r in d.get('related', []) if r in BY_SLUG) + '</div>'
    body += section('Inne działy', 'Często łączone z tym działem', related)
    body += cta_band('Opisz zlecenie — widełki cenowe za darmo' if not soon else 'Chcesz, żebyśmy odezwali się przed sezonem?',
                     'Bezpłatnie podamy przedział ceny na podstawie opisu i zdjęć. Dokładną wycenę przygotujemy po płatnych oględzinach na miejscu.' if not soon else 'Zostaw kontakt — przygotujemy ofertę Winter Care dla Twojego terenu.',
                     quote_href, wa_text, soon)

    service_ld = {"@context": "https://schema.org", "@type": "Service", "name": f'{name} — {d["tagline"]}', "serviceType": d['services'], "description": d['lead'],
                  "url": SITE + page_file(slug), "provider": {"@id": SITE + "#organization"}, "areaServed": ["Słupsk", "Ustka", "Koszalin", "Sławno", "Bytów", "Miastko", "Polska"]}
    html = page(f'{name} — {d["seo"]} | RevSerwis', d['lead'][:155].rsplit(' ', 1)[0] + '…' if len(d['lead']) > 158 else d['lead'],
                page_file(slug), body, extra_ld=(service_ld, faq_ld(d['faq'])), quote_href=quote_href, wa_text=wa_text, crumbs=[('Działy', 'uslugi.html'), (name, page_file(slug))])
    open(os.path.join(PUB, page_file(slug)), 'w', encoding='utf-8').write(html)


# ---------------------------------------------------------------------------
# Wszystkie usługi
# ---------------------------------------------------------------------------

def build_services():
    blocks = ''
    for g in GROUPS:
        cards = ''
        for d in [x for x in DIVISIONS if x['group'] == g['key']]:
            items = ''.join(f'<li data-q="{e(s.lower())}">{e(s)}</li>' for s in d['services'])
            cards += (f'<article class="v4-all" id="{d["slug"]}" data-div><div class="v6-all-img">{photo(d["photo"], "", "", "(max-width: 700px) 100vw, 400px", (16, 7), (480, 800))}</div><header><span class="v4-div-icon"><i class="fa-solid {d["icon"]}" aria-hidden="true"></i></span>'
                      f'<div>{dv(d["name"], "h3")}<p>{e(d["tagline"])}</p></div>{"<span class=" + chr(34) + "v4-soon" + chr(34) + ">Wkrótce</span>" if d.get("soon") else ""}</header>'
                      f'<ul>{items}</ul><footer><a href="{page_file(d["slug"])}">Opis działu</a><a class="go" href="{"kontakt.html?temat=winter&amp;dzial=" + d["slug"] if d.get("soon") else "wycena.html?dzial=" + d["slug"]}">{"Zapisz się" if d.get("soon") else "Wyceń"} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></footer></article>')
        blocks += f'<div class="v4-group" data-group-block><h2 class="v4-group-title"><i class="fa-solid {g["icon"]}" aria-hidden="true"></i> {e(g["name"])}</h2><div class="v4-all-grid">{cards}</div></div>'
    total = sum(len(d['services']) for d in DIVISIONS)
    main = f'''<section class="v4-hero v4-hero-sub v6-photo-hero"><div class="v6-hero-media">{photo("van", "", "v6-hero-img", "100vw", (16, 9), (640, 1000, 1600, 2000), True)}</div><div class="v4-wrap">
  <nav class="rv-crumbs" aria-label="Okruszki"><a href="index.html">Strona główna</a><span>/</span><span class="text-brand-500">Działy i usługi</span></nav>
  <h1 class="v4-h1">Wszystkie działy i usługi</h1>
  <p class="v4-hero-lead">{len(DIVISIONS)} działów i ponad {total // 10 * 10} usług — od jednego kursu po stałą obsługę firmy. Wpisz, czego potrzebujesz.</p>
  <label class="v4-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" id="serviceFilter" placeholder="np. wycinka, przeprowadzka, palety, odśnieżanie…" autocomplete="off"><span id="serviceCount" aria-live="polite"></span></label>
</div></section>
<section class="v4-section"><div class="v4-wrap">{blocks}<p class="v4-empty" id="serviceEmpty" hidden>Nie znaleźliśmy takiej usługi na liście — <a href="kontakt.html">napisz do nas</a>, sprawdzimy, czy pomożemy.</p></div></section>'''
    main += cta_band('Nie wiesz, który dział wybrać?', 'Opisz sprawę — sami przypiszemy zlecenie do właściwej ekipy.', 'wycena.html', 'Dzień dobry, mam pytanie o usługę.')
    html = page('Działy i usługi RevSerwis — transport, porządki, teren, firmy', f'{len(DIVISIONS)} działów RevSerwis: RevHome, RevBud, RevGarden, RevClean, RevCargo, RevFacility i inne. Pełna lista usług z wyceną online.', 'uslugi.html', main)
    open(os.path.join(PUB, 'uslugi.html'), 'w', encoding='utf-8').write(html)


# ---------------------------------------------------------------------------
# Strona główna
# ---------------------------------------------------------------------------

MAIN_TILE = {
    'przeprowadzka': ('przeprowadzki.html', 'przeprowadzki', 'Mieszkania, domy i biura — w Polsce i za granicę. Pakowanie, demontaż mebli, ciężkie rzeczy.'),
    'oproznianie': ('oproznianie-utylizacja.html', 'oproznianie-i-wywoz', 'Mieszkania, piwnice, garaże i domy. Wywóz gabarytów z legalną utylizacją.'),
    'transport': ('revcargo.html', 'transport-rzeczy', 'Meble, AGD, palety i materiały — z odbiorem ze sklepu i wniesieniem.'),
    'zima': ('revwinter.html', 'odsniezanie', 'Parkingi, podjazdy i tereny firm. Jednorazowo albo abonament Winter Care.'),
    'ogrod': ('revgarden.html', 'ogrod-i-dzialka', 'Koszenie, karczowanie, wycinka drzew, usuwanie pni i wywóz odpadów zielonych.')
}


def main_tiles():
    out = ''
    for c in [x for x in CATEGORIES if x.get('main')]:
        href, local, text = MAIN_TILE[c['key']]
        out += (f'<article class="v8-main-tile">{photo(c["photo"], "", "v8-main-img", "(max-width: 700px) 100vw, 33vw", (16, 10), (480, 800))}'
                f'<div class="v8-main-body"><h3><i class="fa-solid {c["icon"]}" aria-hidden="true"></i> {e(c["name"])}</h3><p>{e(text)}</p>'
                f'<div class="v8-main-actions"><a class="rv-button sm" href="wycena.html?kat={c["key"]}">Wyceń</a><a class="rv-button ghost sm" href="{href}">Szczegóły</a></div>'
                f'<p class="v8-main-local">{" · ".join(f"<a href={chr(34)}{local}-{ck}.html{chr(34)}>{e(cn)}</a>" for ck, cn in [("slupsk", "Słupsk"), ("ustka", "Ustka"), ("koszalin", "Koszalin"), ("slawno", "Sławno"), ("bytow", "Bytów"), ("miastko", "Miastko")])}</p></div></article>')
    return f'<div class="v8-main-grid">{out}</div>'


def category_tiles(limit=None, skip_main=False):
    cats = [c for c in CATEGORIES if not (skip_main and c.get('main'))]
    tiles = ''.join(
        f'<a class="v6-cat" href="wycena.html?kat={c["key"]}">{photo(c["photo"], "", "v6-cat-img", "(max-width: 640px) 50vw, (max-width: 1100px) 33vw, 300px", (4, 3), (320, 480, 720))}'
        f'<span class="v6-cat-body"><strong>{e(c["name"])}{" <em class=" + chr(34) + "v6-soon" + chr(34) + ">Wkrótce</em>" if c.get("soon") else ""}</strong><small>{e(c["desc"])}</small></span>'
        f'<span class="v6-cat-go" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span></a>'
        for c in cats[:limit])
    other = ('<a class="v6-cat v6-cat-other" href="wycena.html?kat=inne"><span class="v6-cat-body"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>'
             '<strong>Coś innego?</strong><small>Opisz własnymi słowami — dopasujemy ekipę</small></span><span class="v6-cat-go" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span></a>')
    return f'<div class="v6-cats">{tiles}{other}</div>'


def build_index():
    hero = f'''<section class="v6-hero"><div class="v6-hero-media">{photo("movers", "Przeprowadzka — wnoszenie mebli", "v6-hero-img", "100vw", (16, 9), (640, 1000, 1600, 2200), True)}</div>
<div class="v4-wrap v6-hero-inner">
  <div class="v4-eyebrow"><span class="v4-dot"></span> Słupsk · cała Polska · trasy UE</div>
  <h1 class="v6-h1">Przeprowadzki, opróżnianie i transport <span>— Słupsk i cała Polska.</span></h1>
  <p class="v6-lead">Przeprowadzki krajowe i międzynarodowe, opróżnianie i wywóz, transport rzeczy, odśnieżanie oraz ogród i działka. Dodaj zdjęcia — <strong>wycenę zobaczysz od razu</strong>.</p>
  <div class="v4-actions"><a class="rv-button v6-big" href="wycena.html">Wyceń online — 30 sekund <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a><a class="rv-button ghost v6-big" href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i> {PHONE}</a></div>
  <a class="v8-hero-rating" href="{GMAPS}" rel="noopener" target="_blank"><b>{str(RATING).replace('.', ',')}</b>{stars(5)}<span>{RATING_COUNT} opinii w Google</span></a>
  <ul class="v6-trust"><li><i class="fa-solid fa-check" aria-hidden="true"></i>Bezpłatne widełki cenowe</li><li><i class="fa-solid fa-check" aria-hidden="true"></i>Faktura VAT</li><li><i class="fa-solid fa-check" aria-hidden="true"></i>Polska i trasy UE</li><li><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><a href="{e(wa())}" rel="noopener" target="_blank">Napisz na WhatsApp</a></li></ul>
</div></section>'''
    body = hero
    body += section('Główne usługi', 'Czego potrzebujesz?', main_tiles(), 'Kliknij usługę, aby zobaczyć szczegóły, albo od razu <a class="v4-link-inline" href="wycena.html">wyceń zlecenie online</a>.', sid='uslugi')
    body += section('Więcej', 'Pozostałe usługi', category_tiles(skip_main=True), '<a class="v4-link-inline" href="uslugi.html">Wszystkie działy i usługi →</a>', cls='v8-more')

    process = steps_html(['Wybierz usługę, opisz zlecenie i dodaj zdjęcia — zajmie to ok. 30 sekund.', 'Od razu widzisz bezpłatne widełki cenowe; dokładną cenę potwierdzamy telefonicznie albo po oględzinach.', 'Przyjeżdżamy w ustalonym terminie i rozliczamy się paragonem lub fakturą VAT.'], 'v4-steps v6-steps')
    body += section('Jak to działa', 'Trzy proste kroki', process, cls='v4-alt')
    body += section('Jak wyceniamy', 'Dwa sposoby wyceny — wybierasz Ty', PRICE_MODELS, 'Widełki cenowe są bezpłatne. Rzetelną, dokładną wycenę przygotowujemy po oględzinach na miejscu — ta usługa jest płatna.', sid='jak-wyceniamy')

    biz = (f'<div class="v6-split"><div class="v6-split-media">{photo("office", "Nowoczesne biuro", "", "(max-width: 900px) 100vw, 50vw", (4, 3), (480, 800, 1200))}</div>'
           f'<div class="v6-split-text"><span class="v4-kicker">Dla firm i obiektów</span><h2>Jeden partner do transportu, porządków i obsługi terenu</h2>'
           f'<p class="v4-lead">Biura, sklepy, magazyny, hotele i wspólnoty. Stała miesięczna obsługa, abonament zimowy albo zewnętrzny dział transportowy — bez etatów i własnej floty.</p>'
           f'<ul class="v6-checks"><li><i class="fa-solid fa-check" aria-hidden="true"></i>Abonament RevFacility — sprzątanie, koszenie, mycie kostki, wywóz</li><li><i class="fa-solid fa-check" aria-hidden="true"></i>RevB2B — transport, ludzie i magazyn na żądanie</li><li><i class="fa-solid fa-check" aria-hidden="true"></i>Faktura VAT, stały opiekun, priorytet terminów</li></ul>'
           f'<div class="v4-actions"><a class="rv-button" href="wycena.html?kat=firmy">Zapytaj o współpracę</a><a class="rv-button ghost" href="revb2b.html">Oferta dla firm</a></div></div></div>')
    body += f'<section class="v4-section"><div class="v4-wrap">{biz}</div></section>'

    area = (f'<div class="v4-two v4-area"><div><p class="v4-lead">Bazą jest <strong>Słupsk</strong>, a zlecenia realizujemy <strong>w całej Polsce</strong> — z własnymi i zaprzyjaźnionymi oddziałami. Przeprowadzki i transport także do krajów UE.</p>'
            f'<ul class="v4-area-list"><li><i class="fa-solid fa-location-dot" aria-hidden="true"></i><a href="przeprowadzki-slupsk.html">Słupsk</a>, <a href="przeprowadzki-ustka.html">Ustka</a>, <a href="przeprowadzki-slawno.html">Sławno</a> i okolice</li><li><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i><a href="przeprowadzki-koszalin.html">Koszalin</a>, <a href="przeprowadzki-bytow.html">Bytów</a>, <a href="przeprowadzki-miastko.html">Miastko</a></li><li><i class="fa-solid fa-route" aria-hidden="true"></i>Cała Polska i trasy do UE</li></ul>'
            f'<a class="v4-link" href="obszar-dzialania.html">Obszar działania <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div>'
            f'<div class="v4-contact-card"><h3>Porozmawiajmy</h3><p>Wolisz zadzwonić albo wysłać zdjęcia na WhatsApp? Też tak można.</p>'
            f'<a href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i><span><small>Telefon</small>{PHONE}</span></a>'
            f'<a href="{e(wa())}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span><small>WhatsApp</small>{PHONE}</span></a>'
            f'<a href="kontakt.html"><i class="fa-solid fa-envelope-open-text" aria-hidden="true"></i><span><small>Formularz kontaktowy</small>Osoby prywatne i firmy</span></a>'
            f'<a href="{IG}" rel="noopener" target="_blank"><i class="fa-brands fa-instagram" aria-hidden="true"></i><span><small>Instagram</small>@revserwis_</span></a></div></div>')
    body += section('Obszar i kontakt', 'Działamy lokalnie i na długich trasach', area, cls='v4-alt')

    faq = [
        ('Czy wycena jest płatna?', 'Wycena orientacyjna jest bezpłatna — na podstawie opisu i zdjęć podajemy widełki cenowe (od–do). Rzetelna, dokładna wycena wymaga oględzin na miejscu i jest płatna; koszt dojazdu podajemy przy umawianiu wizyty.'),
        ('Nie wiem, którą usługę wybrać. Co zrobić?', 'Wybierz najbliższy kafelek albo „Coś innego” i opisz sprawę własnymi słowami. Sami dobierzemy ekipę.'),
        ('Czy formularz rezerwuje termin?', 'Nie. Termin i cenę potwierdzamy po rozmowie albo po oględzinach.'),
        ('Czy mogę połączyć kilka usług w jednym zleceniu?', 'Tak — np. opróżnienie, sprzątanie i przechowanie rzeczy albo wycinka i wywóz gałęzi. Napisz o tym w opisie zlecenia.'),
        ('Jak szybko możecie przyjechać?', 'W pilnych sprawach w rejonie Słupska często jeszcze tego samego dnia — zależy od dostępności ekipy. Najszybciej sprawdzisz to telefonicznie lub na WhatsApp.'),
        ('Czy działacie poza Słupskiem?', 'Tak. Bazą jest Słupsk, ale zlecenia realizujemy w całej Polsce — z własnymi i zaprzyjaźnionymi oddziałami. Przeprowadzki i transport także za granicę.'),
        ('Czy wystawiacie faktury?', 'Tak, wystawiamy faktury VAT. Firmom proponujemy też stałą współpracę i abonamenty.'),
    ]
    body += section('FAQ', 'Najczęściej zadawane pytania', faq_html(faq))
    body = body.replace(section('FAQ', 'Najczęściej zadawane pytania', faq_html(faq)), reviews_block(title='Opinie naszych klientów', lead='Prawdziwe opinie z wizytówki RevSerwis w Google.') + section('FAQ', 'Najczęściej zadawane pytania', faq_html(faq)))
    body += cta_band('Opisz zlecenie — widełki cenowe za darmo', 'Dodaj zdjęcia, a system wyceny RevBot od razu pokaże bezpłatne widełki. Dokładną wycenę przygotujemy po płatnych oględzinach na miejscu.', 'wycena.html', 'Dzień dobry, chciałbym zapytać o wycenę.')
    body += ('<section class="v4-section" data-projects-section hidden><div class="v4-wrap"><div class="v4-head"><span class="v4-kicker">Realizacje</span><h2>Nasze realizacje</h2></div><div data-projects data-limit="3" class="rv-grid"></div><a href="realizacje.html" class="rv-button mt-8">Zobacz realizacje</a></div></section>'
             '')
    html = page('RevSerwis — przeprowadzki, opróżnianie i transport | Słupsk i cała Polska',
                'Przeprowadzki krajowe i międzynarodowe, opróżnianie mieszkań i wywóz, transport rzeczy, odśnieżanie, ogród i działka. Słupsk i cała Polska. Wycena online ze zdjęć w 30 sekund.',
                '', body, extra_ld=(faq_ld(faq),), scripts=('assets/site.js',))
    open(os.path.join(PUB, 'index.html'), 'w', encoding='utf-8').write(html)


# ---------------------------------------------------------------------------
# Wycena — kreator na pełny ekran
# ---------------------------------------------------------------------------

def build_quote():
    title = 'Wycena online — widełki cenowe lub wycena z dojazdem | RevSerwis'
    desc = 'Wyceń zlecenie w 2 minuty: wybierz usługę i odpowiedz na kilka prostych pytań. Bezpłatne widełki cenowe albo płatna, dokładna wycena z dojazdem.'
    # 7.0: wycena.html to formularz „Wycena AI” (edytowany ręcznie, nie generowany).
    # Klasyczny kreator zostaje jako zapasowy: wycena-klasyczna.html.
    top = head(title, desc, 'wycena.html', scripts=('assets/divisions.js', 'assets/site.js', 'assets/quote.js'))
    top = top.replace('<body class="flex flex-col min-h-screen relative overflow-x-hidden">', '<body class="wz-page">')
    top = top.replace('<meta name="viewport"', '<meta name="robots" content="noindex, follow">\n<meta name="viewport"', 1)
    body = (f'<header class="wz-header"><a class="sh-logo" href="index.html" aria-label="RevSerwis — strona główna">{BRAND}</a>'
            f'<a class="wz-close" href="index.html" aria-label="Zamknij i wróć na stronę główną"><i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Zamknij</span></a></header>'
            f'<main id="main-content" class="wz-main"><h1 class="sr-only">Wycena online RevSerwis</h1><div data-quote-form></div>'
            f'<noscript><div class="wz-noscript"><p>Formularz wymaga JavaScript. Zadzwoń: <a href="tel:{TEL}">{PHONE}</a>, napisz na <a href="{e(wa())}">WhatsApp</a> lub na <a href="mailto:{EMAIL}">{EMAIL}</a>.</p></div></noscript></main>'
            f'<footer class="wz-footer"><span>Wolisz porozmawiać?</span><a href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i> {PHONE}</a><a class="wa" href="{e(wa())}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a><a href="{IG}" rel="noopener" target="_blank"><i class="fa-brands fa-instagram" aria-hidden="true"></i> Instagram</a></footer>'
            '</body>\n</html>\n')
    open(os.path.join(PUB, 'wycena-klasyczna.html'), 'w', encoding='utf-8').write(top + body)


# ---------------------------------------------------------------------------
# Kontakt (formularz dla osób prywatnych i firm)
# ---------------------------------------------------------------------------

def build_contact():
    main = f'''<section class="v4-hero v4-hero-sub v6-photo-hero"><div class="v6-hero-media">{photo("van_boxes", "", "v6-hero-img", "100vw", (16, 9), (640, 1000, 1600, 2000), True)}</div><div class="v4-wrap">
  <nav class="rv-crumbs" aria-label="Okruszki"><a href="index.html">Strona główna</a><span>/</span><span class="text-brand-500">Kontakt</span></nav>
  <h1 class="v4-h1">Porozmawiajmy.</h1>
  <p class="v4-hero-lead">Pytanie, współpraca, abonament dla firmy albo zapis na RevWinter? Napisz — wiadomość trafi prosto na <strong>{EMAIL}</strong>. Chcesz wycenić konkretne zlecenie ze zdjęciami? Użyj <a class="v4-link-inline" href="wycena.html">formularza wyceny</a>.</p>
</div></section>
<section class="v4-section"><div class="v4-wrap v4-contact-layout">
  <div><div data-contact-form></div><noscript><p class="text-gray-300">Formularz wymaga JavaScript. Napisz na <a href="mailto:{EMAIL}">{EMAIL}</a> lub zadzwoń: <a href="tel:{TEL}">{PHONE}</a>.</p></noscript></div>
  <aside class="v4-contact-side">
    <div class="v4-contact-card"><h3>Szybki kontakt</h3>
      <a href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i><span><small>Telefon</small>{PHONE}</span></a>
      <a href="{e(wa())}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span><small>WhatsApp — także zdjęcia i filmy</small>{PHONE}</span></a>
      <a href="mailto:{EMAIL}"><i class="fa-solid fa-envelope" aria-hidden="true"></i><span><small>E-mail</small>{EMAIL}</span></a>
      <a href="{IG}" rel="noopener" target="_blank"><i class="fa-brands fa-instagram" aria-hidden="true"></i><span><small>Instagram</small>@revserwis_</span></a>
    </div>
    <div class="v4-contact-card"><h3>Dla firm</h3><p>Abonamenty <a href="revfacility.html">RevFacility</a>, <a href="revwinter.html">Winter Care</a> i model <a href="revb2b.html">RevB2B</a> — zewnętrzny dział transportowo-techniczny. Wybierz w formularzu „Firma”, dodaj NIP, a przygotujemy ofertę.</p></div>
    <div class="v4-contact-card"><h3>Baza</h3><p>Słupsk, województwo pomorskie. Obsługujemy Pomorze, całą Polskę i trasy do UE. <a href="obszar-dzialania.html">Obszar działania →</a></p></div>
  </aside>
</div></section>
<div data-company-details class="max-w-7xl mx-auto px-4 pb-12" hidden></div>'''
    html = page('Kontakt — RevSerwis | formularz dla osób prywatnych i firm', f'Skontaktuj się z RevSerwis: formularz kontaktowy dla osób prywatnych i firm, telefon {PHONE}, WhatsApp, e-mail {EMAIL}. Baza w Słupsku.',
                'kontakt.html', main, scripts=('assets/divisions.js', 'assets/site.js', 'assets/contact.js'))
    open(os.path.join(PUB, 'kontakt.html'), 'w', encoding='utf-8').write(html)


PRICE_SECTION_LEGACY = ('<section class="rv-section" id="jak-wyceniamy"><div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div class="mb-10"><span class="text-brand-500 font-bold tracking-widest uppercase text-sm">Zasady wyceny</span>'
                        '<h2 class="text-3xl md:text-4xl font-extrabold mt-3">Dwa sposoby wyceny</h2></div>' + PRICE_MODELS + '</div></section>')

LEGACY_TEXT = [
    ('Opisz zlecenie — wycena jest bezpłatna', 'Opisz zlecenie — widełki cenowe za darmo'),
    ('Dodaj zdjęcia, a odezwiemy się z propozycją ceny i terminu.', 'Bezpłatnie podamy przedział ceny. Dokładną wycenę przygotujemy po płatnych oględzinach na miejscu.'),
    ('>Bezpłatna wycena <i', '>Wyceń zlecenie <i'),
    ('>Bezpłatna wycena</a>', '>Wyceń zlecenie</a>'),
    ('<title>Bezpłatna wycena online — przeprowadzki, transport, mycie | RevSerwis</title>', '<title>Wycena online — widełki cenowe lub wycena z dojazdem | RevSerwis</title>'),
    ('content="Bezpłatna wycena online — przeprowadzki, transport, mycie | RevSerwis"', 'content="Wycena online — widełki cenowe lub wycena z dojazdem | RevSerwis"'),
    ('Bezpłatna wycena online w 17 działach RevSerwis', 'Wycena online w 17 działach RevSerwis — bezpłatne widełki cenowe albo płatna wycena z dojazdem'),
    ('<span class="text-brand-500 text-sm"> / Bezpłatna wycena</span>', '<span class="text-brand-500 text-sm"> / Wycena</span>'),
    ('Wybierz dział i zakres, dodaj szczegóły i zdjęcia. Odezwiemy się z propozycją terminu i ceny — bez zobowiązań.',
     'Bezpłatnie podajemy <strong>widełki cenowe</strong> na podstawie opisu i zdjęć. Jeśli potrzebujesz <strong>rzetelnej, dokładnej wyceny</strong>, przyjedziemy na płatne oględziny.'),
    ('<summary>Czy wycena jest bezpłatna?</summary><p>Tak. Wysłanie formularza nic nie kosztuje i do niczego nie zobowiązuje.</p>',
     '<summary>Czy wycena jest płatna?</summary><p>Wycena orientacyjna (widełki cenowe od–do) jest bezpłatna i do niczego nie zobowiązuje. Dokładna, rzetelna wycena wymaga oględzin na miejscu — jest płatna, a koszt dojazdu podajemy przy umawianiu wizyty.</p>'),
    ('Zdjęcia pomagają ocenić ilość rzeczy, dostęp i zakres pracy — wycena jest dokładniejsza.', 'Zdjęcia pomagają ocenić ilość rzeczy, dostęp i zakres pracy — widełki cenowe są wtedy węższe.'),
    ('Jak wyceniamy transport, przeprowadzki, przewozy osób, porządki, rozbiórki, wycinkę i prace ziemne. Cena zależy od rzeczywistego zakresu zlecenia.',
     'Bezpłatne widełki cenowe albo płatna, rzetelna wycena po oględzinach na miejscu. Cena zależy od rzeczywistego zakresu zlecenia.'),
    ('Nie publikujemy jednej stawki dla wszystkich zleceń. Zdjęcia i kilka szczegółów pozwalają przygotować ofertę dopasowaną do Twojej sytuacji.',
     'Nie publikujemy jednej stawki dla wszystkich zleceń. Na podstawie zdjęć podajemy bezpłatnie widełki cenowe, a dokładną cenę — po płatnych oględzinach.'),
    ('<li>Zakres pracy i uzgodnioną cenę lub sposób rozliczania.</li>', '<li>Bezpłatnie: widełki cenowe (od–do). Po oględzinach: dokładną cenę i zakres pracy.</li>'),
    ('href="wycena.html?usluga="', 'href="wycena.html"'),
]


def patch_legacy(path):
    name = os.path.basename(path)
    out = open(path, encoding='utf-8').read()
    for old, new in LEGACY_TEXT:
        out = out.replace(old, new)
    if name in ('wycena.html', 'cennik.html') and 'class="price-models"' not in out:
        anchor = '<section class="rv-section" id="wycena"' if name == 'wycena.html' else '<section  class="rv-section">'
        out = out.replace(anchor, PRICE_SECTION_LEGACY.replace('id="jak-wyceniamy"', 'id="jak-wyceniamy"' if name == 'wycena.html' else 'id="wycena"') + anchor, 1)
    open(path, 'w', encoding='utf-8').write(out)


LOCAL_HUB = {'przeprowadzki.html': 'przeprowadzki', 'oproznianie-utylizacja.html': 'oproznianie-i-wywoz', 'transport.html': 'transport-rzeczy',
             'wycinka-drzew-i-krzewow.html': 'ogrod-i-dzialka', 'porzadkowanie-dzialek-i-posesji.html': 'ogrod-i-dzialka'}


def extra_sections(path, name):
    """Dodaje do starszych stron: linki lokalne (usługa × miasto) i opinie z Google (realizacje). Bezpieczne przy wielokrotnym uruchomieniu."""
    import re as _re
    out = open(path, encoding='utf-8').read()
    out = _re.sub(r'<section class="v4-section v8-local" data-local-links>.*?</section>', '', out, flags=_re.S)
    out = _re.sub(r'<section class="v4-section" id="opinie">.*?</section>', '', out, flags=_re.S)
    if name in LOCAL_HUB:
        out = out.replace('</main>', local_pages.local_links_section(LOCAL_HUB[name]) + '</main>', 1)
    if name == 'realizacje.html':
        out = out.replace('</main>', reviews_block(title='Opinie klientów z Google', lead='Wszystkie opinie z wizytówki RevSerwis.') + '</main>', 1)
    open(path, 'w', encoding='utf-8').write(out)


def build_sitemap():
    pages = [('', '1.0'), ('uslugi.html', '0.9'), ('wycena.html', '0.9'), ('kontakt.html', '0.8')]
    pages += [(page_file(d['slug']), '0.9') for d in DIVISIONS]
    pages += [(p, '0.7') for p in LEGACY]
    pages += [(local_pages.page_name(sk, ck), '0.8') for sk in local_pages.ORDER_SERVICES for ck in local_pages.ORDER_CITIES]
    pages += [('cennik.html', '0.6'), ('obszar-dzialania.html', '0.8'), ('realizacje.html', '0.7'), ('polityka-prywatnosci.html', '0.3')]
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(
        f'<url><loc>{SITE}{p}</loc><lastmod>{TODAY}</lastmod><priority>{pr}</priority></url>\n' for p, pr in pages) + '</urlset>\n'
    open(os.path.join(PUB, 'sitemap.xml'), 'w', encoding='utf-8').write(xml)


def main():
    for d in DIVISIONS:
        build_division(d)
    build_services()
    build_index()
    build_contact()
    build_quote()
    local = local_pages.build_all()
    for old in REDIRECTS:
        path = os.path.join(PUB, old)
        if os.path.exists(path):
            os.remove(path)
    generated = {'index.html', 'uslugi.html', 'kontakt.html', 'wycena.html', *local, *(page_file(d['slug']) for d in DIVISIONS)}
    for path in sorted(glob.glob(os.path.join(PUB, '*.html'))):
        name = os.path.basename(path)
        if name in generated:
            continue
        patch_legacy(path)
        n = apply_chrome(path, LEGACY.get(name))
        extra_sections(path, name)
        if n != (1, 1):
            print('UWAGA: nie podmieniono nagłówka/stopki w', name, n)
    build_sitemap()
    print(f'OK: {len(DIVISIONS)} działów, {len(local)} stron lokalnych, uslugi.html, index.html, kontakt.html, sitemap.xml')


if __name__ == '__main__':
    main()
