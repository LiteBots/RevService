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

from common import (BY_SLUG, DIVISIONS, GROUPS, PUB, REDIRECTS, EMAIL, IG, PHONE, TEL, SITE,
                    apply_chrome, dv, e, page, page_file, wa)

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
               else f'<a class="rv-button" href="{e(quote_href)}">Bezpłatna wycena</a>')
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
               else f'<a class="rv-button" href="{quote_href}">Bezpłatna wycena <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>')
    hero = f'''<section class="v4-hero v4-hero-sub"><div class="bg-grid"></div><div class="v4-glow"></div><div class="v4-wrap v4-hero-grid">
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

    body += section('Warto wiedzieć', 'Najczęstsze pytania', faq_html(d['faq']))
    related = '<div class="v4-divs v4-divs-3">' + ''.join(division_card(BY_SLUG[r]) for r in d.get('related', []) if r in BY_SLUG) + '</div>'
    body += section('Inne działy', 'Często łączone z tym działem', related)
    body += cta_band('Opisz zlecenie — wycena jest bezpłatna' if not soon else 'Chcesz, żebyśmy odezwali się przed sezonem?',
                     'Dodaj zdjęcia, a odezwiemy się z propozycją ceny i terminu.' if not soon else 'Zostaw kontakt — przygotujemy ofertę Winter Care dla Twojego terenu.',
                     quote_href, wa_text, soon)

    service_ld = {"@context": "https://schema.org", "@type": "Service", "name": f'{name} — {d["tagline"]}', "serviceType": d['services'], "description": d['lead'],
                  "url": SITE + page_file(slug), "provider": {"@id": SITE + "#organization"}, "areaServed": ["Słupsk", "Pomorskie", "Polska"]}
    html = page(f'{name} — {d["seo"]} | RevSerwis', d['lead'][:155].rsplit(' ', 1)[0] + '…' if len(d['lead']) > 158 else d['lead'],
                page_file(slug), body, extra_ld=(service_ld, faq_ld(d['faq'])), quote_href=quote_href, wa_text=wa_text)
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
            cards += (f'<article class="v4-all" id="{d["slug"]}" data-div><header><span class="v4-div-icon"><i class="fa-solid {d["icon"]}" aria-hidden="true"></i></span>'
                      f'<div>{dv(d["name"], "h3")}<p>{e(d["tagline"])}</p></div>{"<span class=" + chr(34) + "v4-soon" + chr(34) + ">Wkrótce</span>" if d.get("soon") else ""}</header>'
                      f'<ul>{items}</ul><footer><a href="{page_file(d["slug"])}">Opis działu</a><a class="go" href="{"kontakt.html?temat=winter&amp;dzial=" + d["slug"] if d.get("soon") else "wycena.html?dzial=" + d["slug"]}">{"Zapisz się" if d.get("soon") else "Wyceń"} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></footer></article>')
        blocks += f'<div class="v4-group" data-group-block><h2 class="v4-group-title"><i class="fa-solid {g["icon"]}" aria-hidden="true"></i> {e(g["name"])}</h2><div class="v4-all-grid">{cards}</div></div>'
    total = sum(len(d['services']) for d in DIVISIONS)
    main = f'''<section class="v4-hero v4-hero-sub"><div class="bg-grid"></div><div class="v4-glow"></div><div class="v4-wrap">
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

def build_index():
    all_services = sum(len(d['services']) for d in DIVISIONS)
    popular = [('revhome', 'Przeprowadzka'), ('revgarden', 'Wycinka drzew'), ('revbud', 'Skuwanie i rozbiórka'), ('revclean', 'Sprzątanie po remoncie'),
               ('revmoto', 'Transport motocykla'), ('revstorage', 'Przechowanie rzeczy'), ('revcargo', 'Transport palet'), ('revfacility', 'Obsługa obiektu')]
    finder_fallback = ''.join(f'<a href="{page_file(s)}" data-pop><i class="fa-solid {BY_SLUG[s]["icon"]}" aria-hidden="true"></i>{e(t)}</a>' for s, t in popular)
    hero = f'''<section class="v4-hero"><div class="bg-grid"></div><div class="v4-glow"></div><div class="v4-wrap v4-hero-grid">
  <div class="fade-up">
    <div class="v4-eyebrow"><span class="v4-dot"></span> Słupsk · cała Polska · trasy UE</div>
    <h1 class="v4-h1">Transport, porządki<br><span>i obsługa nieruchomości.</span></h1>
    <p class="v4-hero-lead">RevSerwis to {len(DIVISIONS)} wyspecjalizowanych działów i jeden kontakt. Przeprowadzimy, przewieziemy, rozbierzemy, posprzątamy, wytniemy, przechowamy — dla domu i dla firmy.</p>
    <div class="v4-actions"><a class="rv-button" href="#wycena">Bezpłatna wycena <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a><a class="rv-button ghost" href="#dzialy">Poznaj działy</a></div>
    <ul class="v4-trust"><li><i class="fa-solid fa-camera" aria-hidden="true"></i>Wycena ze zdjęć — 0 zł</li><li><i class="fa-solid fa-file-invoice" aria-hidden="true"></i>Faktura VAT dla firm</li><li><i class="fa-solid fa-route" aria-hidden="true"></i>Polska i trasy UE</li><li><i class="fa-brands fa-whatsapp" aria-hidden="true"></i>Kontakt przez WhatsApp</li></ul>
  </div>
  <div class="v4-finder fade-up" style="transition-delay:150ms">
    <p class="v4-finder-title">Czego potrzebujesz?</p>
    <label class="v4-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" id="finderInput" placeholder="Wpisz, np. „odśnieżanie”, „gruz”, „quad”…" autocomplete="off" aria-controls="finderResults"></label>
    <div class="v4-finder-results" id="finderResults" aria-live="polite"></div>
    <div class="v4-finder-pop" id="finderPopular">{finder_fallback}</div>
    <p class="v4-finder-foot"><i class="fa-solid fa-bolt" aria-hidden="true"></i> Pilne? <a href="tel:{TEL}">{PHONE}</a> · <a href="{e(wa())}" rel="noopener" target="_blank">WhatsApp</a></p>
  </div>
</div>
<div class="v4-wrap"><div class="v4-stats"><div><strong>{len(DIVISIONS)}</strong><span>działów</span></div><div><strong>{all_services}+</strong><span>usług w ofercie</span></div><div><strong>1</strong><span>kontakt do wszystkiego</span></div><div><strong>B2B</strong><span>abonamenty dla firm</span></div></div></div></section>'''

    tabs = '<div class="rv-tabs" aria-label="Grupy działów"><button type="button" class="on" data-filter="all">Wszystkie</button>' + ''.join(
        f'<button type="button" data-filter="{g["key"]}">{e(g["name"])}</button>' for g in GROUPS) + '</div>'
    tile = ('<a class="v4-div v4-div-cta" href="uslugi.html"><span class="v4-div-top"><span class="v4-div-icon"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></span></span>'
            '<strong class="dv">Nie wiesz, który dział?</strong><span class="v4-div-tag">Przejrzyj pełną listę usług z wyszukiwarką albo opisz zlecenie — sami przypiszemy je do właściwej ekipy.</span>'
            '<span class="v4-div-go">Wszystkie usługi <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span></a>')
    grid = '<div class="v4-divs v4-divs-main" data-svc-grid>' + ''.join(division_card(d) for d in DIVISIONS) + tile + '</div>'
    body = hero
    body += section('Działy RevSerwis', 'Jedna firma, wyspecjalizowane zespoły', tabs + grid, 'Każdy dział ma swój zakres, sprzęt i ekipę. Ty masz jeden numer telefonu.', sid='dzialy')

    subs = [
        ('revfacility', 'Miesięczna obsługa obiektu', 'Odśnieżanie, koszenie, mycie kostki, sprzątanie, wywóz i drobne prace — jedna firma i stała miesięczna opłata.', 'Zapytaj o abonament', 'kontakt.html?temat=facility&dzial=revfacility', ''),
        ('revwinter', 'RevSerwis Winter Care', 'Abonament zimowy: firma płaci miesięcznie za gotowość i obsługę terenu. Odśnieżanie, posypywanie, wywóz śniegu.', 'Zapisz się na start', 'kontakt.html?temat=winter&dzial=revwinter', 'Wkrótce'),
        ('revb2b', 'Zewnętrzny dział transportowo-techniczny', 'Zamiast etatu kierowcy, busa, magazyniera i ekipy porządkowej — RevSerwis. Transport + ludzie + magazyn + teren + zima.', 'Porozmawiajmy o współpracy', 'kontakt.html?temat=b2b&dzial=revb2b', ''),
    ]
    sub_html = '<div class="v4-plans">' + ''.join(
        f'<article class="v4-plan{" featured" if s == "revb2b" else ""}"><div class="v4-plan-top"><span class="v4-div-icon"><i class="fa-solid {BY_SLUG[s]["icon"]}" aria-hidden="true"></i></span>{dv(BY_SLUG[s]["name"])}{f"<span class={chr(34)}v4-soon{chr(34)}>{badge}</span>" if badge else ""}</div>'
        f'<h3>{e(t)}</h3><p>{e(text)}</p><div class="v4-plan-actions"><a class="rv-button{"" if s == "revb2b" else " ghost"}" href="{e(href)}">{e(btn)}</a><a class="v4-link" href="{page_file(s)}">Szczegóły <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div></article>'
        for s, t, text, btn, href, badge in subs) + '</div>'
    body += section('Dla firm i obiektów', 'Abonamenty i stała współpraca', sub_html, 'Przewidywalny koszt, priorytet terminów i jeden kontakt — dla firm, wspólnot, sklepów, hoteli i właścicieli nieruchomości.', cls='v4-alt', sid='abonamenty')

    home, storage = BY_SLUG['revhome'], BY_SLUG['revstorage']
    body += (f'<section class="v4-section"><div class="v4-wrap v4-two">'
             f'<article class="v4-product-card"><span class="v4-kicker">{dv("RevHome")}</span><h2>{e(home["highlight"]["title"])}</h2><p>{e(home["highlight"]["text"])}</p>{steps_html(home["highlight"]["steps"], "v4-flow compact")}<a class="rv-button" href="wycena.html?dzial=revhome&amp;zakres={quote("Przygotowanie mieszkania do wynajmu")}">Wyceń przygotowanie</a></article>'
             f'<article class="v4-product-card"><span class="v4-kicker">{dv("RevStorage")}</span><h2>Magazynowanie bez własnego magazynu</h2><p>{e(storage["lead"])}</p>{steps_html(storage["highlight"]["steps"], "v4-flow compact")}<a class="rv-button ghost" href="revstorage.html">Jak to działa</a></article>'
             f'</div></section>')

    body += (f'<section class="v4-section"><div class="v4-wrap v4-two">'
             f'<article class="v4-strip assist"><i class="fa-solid fa-bolt" aria-hidden="true"></i><div><span class="v4-kicker">{dv("RevAssist")}</span><h2>Potrzebujesz coś przewieźć dzisiaj? Zadzwoń.</h2><p>Awaryjny transport, odbiór kupionej rzeczy, pomoc przy przeprowadzce — szybko i lokalnie.</p>'
             f'<div class="v4-actions"><a class="rv-button" href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i> {PHONE}</a><a class="rv-button wa" href="{e(wa("Dzień dobry, potrzebuję szybkiego transportu."))}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a></div></div></article>'
             f'<article class="v4-strip moto"><i class="fa-solid fa-motorcycle" aria-hidden="true"></i><div><span class="v4-kicker">{dv("RevMoto")}</span><h2>Kupujesz motocykl? My go odbierzemy i dostarczymy pod dom.</h2><p>Motocykle, skutery, quady, crossy, przyczepy i sprzęt ogrodowy — w Polsce i z UE.</p>'
             f'<div class="v4-actions"><a class="rv-button" href="wycena.html?dzial=revmoto">Wyceń transport</a><a class="rv-button ghost" href="revmoto.html">RevMoto</a></div></div></article>'
             f'</div></section>')

    process = steps_html(['Opisz zlecenie w formularzu, przez telefon lub na WhatsApp — zdjęcia przyspieszą wycenę.', 'Przypisujemy zgłoszenie do właściwego działu i potwierdzamy zakres.',
                          'Dostajesz cenę i termin. Formularz niczego nie rezerwuje — decydujesz po wycenie.', 'Realizujemy zlecenie jedną ekipą i rozliczamy się paragonem lub fakturą VAT.'], 'v4-steps v4-steps-4')
    body += section('Jak działamy', 'Od zapytania do realizacji w 4 krokach', process, cls='v4-alt')

    area = (f'<div class="v4-two v4-area"><div><p class="v4-lead">Bazą jest <strong>Słupsk i województwo pomorskie</strong>. Stąd wyjeżdżamy na lokalne zlecenia, trasy po całej Polsce i kursy do krajów UE.</p>'
            f'<ul class="v4-area-list"><li><i class="fa-solid fa-location-dot" aria-hidden="true"></i>Słupsk, Ustka i okolice</li><li><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i>Trójmiasto, Koszalin i całe Pomorze</li><li><i class="fa-solid fa-route" aria-hidden="true"></i>Cała Polska i trasy do UE</li></ul>'
            f'<a class="v4-link" href="obszar-dzialania.html">Wszystkie obsługiwane miasta <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div>'
            f'<div class="v4-contact-card"><h3>Porozmawiajmy</h3><p>Masz pytanie, ofertę współpracy albo nietypowe zlecenie? Wybierz wygodny kontakt.</p>'
            f'<a href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i><span><small>Telefon</small>{PHONE}</span></a>'
            f'<a href="{e(wa())}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span><small>WhatsApp</small>{PHONE}</span></a>'
            f'<a href="kontakt.html"><i class="fa-solid fa-envelope-open-text" aria-hidden="true"></i><span><small>Formularz kontaktowy</small>Osoby prywatne i firmy</span></a>'
            f'<a href="{IG}" rel="noopener" target="_blank"><i class="fa-brands fa-instagram" aria-hidden="true"></i><span><small>Instagram</small>@revserwis_</span></a></div></div>')
    body += section('Obszar i kontakt', 'Działamy lokalnie i na długich trasach', area)

    faq = [
        ('Do którego działu mam się zgłosić?', 'Nie musisz wiedzieć. Opisz zlecenie w formularzu albo zadzwoń — sami przypiszemy je do właściwej ekipy. Działy pomagają po prostu szybciej znaleźć usługę.'),
        ('Czy wycena jest płatna i czy formularz rezerwuje termin?', 'Wycena jest bezpłatna. Formularz nie rezerwuje terminu — termin i cenę potwierdzamy po rozmowie.'),
        ('Czy wystawiacie faktury i obsługujecie firmy?', 'Tak. Wystawiamy faktury VAT, a firmom proponujemy stałą współpracę, abonamenty (RevFacility, Winter Care) lub model „zewnętrznego działu” RevB2B.'),
        ('Czy mogę połączyć kilka usług w jednym zleceniu?', 'Tak — np. opróżnienie, sprzątanie i przechowanie rzeczy albo wycinka, karczowanie i wywóz gałęzi. Jedna ekipa, jeden termin.'),
        ('Jak szybko możecie przyjechać?', 'W pilnych sprawach w rejonie Słupska często jeszcze tego samego dnia — zależy od dostępności ekipy. Najszybciej sprawdzisz to telefonicznie lub na WhatsApp.'),
        ('Kiedy startuje RevWinter?', 'Przygotowujemy dział na najbliższy sezon zimowy. Zapisz się przez formularz kontaktowy — odezwiemy się z ofertą abonamentu Winter Care przed startem.'),
    ]
    body += section('FAQ', 'Najczęściej zadawane pytania', faq_html(faq), cls='v4-alt')
    body += ('<section id="wycena" class="v4-section"><div class="v4-wrap"><div class="v4-head"><span class="v4-kicker">Formularz online</span><h2>Wyceń swoje zlecenie</h2>'
             '<p class="v4-lead">Wybierz dział i zakres, dodaj zdjęcia — odezwiemy się z propozycją ceny i terminu. Ogólne pytania? Skorzystaj z <a class="v4-link-inline" href="kontakt.html">formularza kontaktowego</a>.</p></div>'
             f'<div data-quote-form></div><noscript><p class="text-gray-300">Formularz wymaga JavaScript. Zadzwoń: <a href="tel:{TEL}">{PHONE}</a> lub napisz na <a href="mailto:{EMAIL}">{EMAIL}</a>.</p></noscript></div></section>')
    body += ('<section class="v4-section" data-projects-section hidden><div class="v4-wrap"><div class="v4-head"><span class="v4-kicker">Realizacje</span><h2>Nasze realizacje</h2></div><div data-projects data-limit="3" class="rv-grid"></div><a href="realizacje.html" class="rv-button mt-8">Zobacz realizacje</a></div></section>'
             '<section class="v4-section" data-reviews-section hidden><div class="v4-wrap"><div class="v4-head"><span class="v4-kicker">Opinie</span><h2>Opinie naszych klientów</h2></div><div data-reviews class="rv-grid"></div></div></section>')
    html = page('RevSerwis — transport, porządki i obsługa nieruchomości | Słupsk, Pomorze',
                'RevSerwis: 17 działów — przeprowadzki, transport, rozbiórki, wycinka, sprzątanie, magazynowanie, obsługa firm i obiektów. Słupsk, Polska, UE. Bezpłatna wycena.',
                '', body, extra_ld=(faq_ld(faq),), scripts=('assets/divisions.js', 'assets/site.js', 'assets/quote.js'))
    open(os.path.join(PUB, 'index.html'), 'w', encoding='utf-8').write(html)


# ---------------------------------------------------------------------------
# Kontakt (formularz dla osób prywatnych i firm)
# ---------------------------------------------------------------------------

def build_contact():
    main = f'''<section class="v4-hero v4-hero-sub"><div class="bg-grid"></div><div class="v4-glow"></div><div class="v4-wrap">
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


def build_sitemap():
    pages = [('', '1.0'), ('uslugi.html', '0.9'), ('wycena.html', '0.9'), ('kontakt.html', '0.8')]
    pages += [(page_file(d['slug']), '0.9') for d in DIVISIONS]
    pages += [(p, '0.7') for p in LEGACY]
    pages += [('cennik.html', '0.6'), ('obszar-dzialania.html', '0.6'), ('realizacje.html', '0.6'), ('polityka-prywatnosci.html', '0.3')]
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(
        f'<url><loc>{SITE}{p}</loc><lastmod>{TODAY}</lastmod><priority>{pr}</priority></url>\n' for p, pr in pages) + '</urlset>\n'
    open(os.path.join(PUB, 'sitemap.xml'), 'w', encoding='utf-8').write(xml)


def main():
    for d in DIVISIONS:
        build_division(d)
    build_services()
    build_index()
    build_contact()
    for old in REDIRECTS:
        path = os.path.join(PUB, old)
        if os.path.exists(path):
            os.remove(path)
    generated = {'index.html', 'uslugi.html', 'kontakt.html', *(page_file(d['slug']) for d in DIVISIONS)}
    for path in sorted(glob.glob(os.path.join(PUB, '*.html'))):
        name = os.path.basename(path)
        if name in generated:
            continue
        n = apply_chrome(path, LEGACY.get(name))
        if n != (1, 1):
            print('UWAGA: nie podmieniono nagłówka/stopki w', name, n)
    build_sitemap()
    print(f'OK: {len(DIVISIONS)} działów, uslugi.html, index.html, kontakt.html, sitemap.xml')


if __name__ == '__main__':
    main()
