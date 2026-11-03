# -*- coding: utf-8 -*-
"""RevSerwis 12 — lokalne podstrony SEO: 8 usług × 30 miast + huby miast + „Obszar działania”.

Jak unikamy stron „1:1” (duplicate / doorway content):
  1. Fakty miasta — osiedla, okoliczne miejscowości, powiat, odległość i czas dojazdu, profil zabudowy (cities.py).
  2. Scenariusze dobierane do charakteru miasta (tagi: morze, aglomeracja, jeziora, studenci…) — inne zlecenia nad morzem, inne w Trójmieście.
  3. Pięć różnych układów stron (A–E) + rozbudowany układ Słupska (S). Układ wybiera się tak, że ta sama usługa w sąsiednich
     miastach i różne usługi w tym samym mieście mają INNY układ, inną kolejność sekcji i inne komponenty.
  4. Warianty tytułu, opisu, H1, wstępu, nagłówków sekcji, FAQ i wskazówek — wybierane deterministycznie (hash usługa+miasto).
  5. Usługi „na miejscu” (odśnieżanie, sprzątanie, mycie) tylko tam, gdzie dojeżdżamy codziennie — nie tworzymy stron
     dla usług, których realnie nie świadczymy w danym mieście (local_services.py → tiers).
  6. Słupsk (baza) — najbogatsze strony: osiedla, gminy powiatu słupskiego, więcej FAQ, porównanie wariantów, priorytet w sitemap.
"""
import hashlib
import os

from common import (PUB, SITE, PHONE, TEL, GMAPS, e, page, photo, wa, reviews_block, RATING, RATING_COUNT, stars)
from cities import CITIES, ORDER as ORDER_CITIES, TIER_LABEL, dist_text, region_cities
from local_services import SERVICES, ORDER as ORDER_SERVICES

SLUPSK_GMINY = ['Kobylnica', 'Słupsk (gmina wiejska)', 'Ustka', 'Dębnica Kaszubska', 'Damnica', 'Główczyce', 'Potęgowo', 'Kępice', 'Smołdzino']


# ---------------------------------------------------------------------------
# Pomocnicze
# ---------------------------------------------------------------------------

def page_name(service, city):
    return f'{service}-{city}.html'


def hub_name(city):
    return f'uslugi-{city}.html'


def available(skey, ckey):
    return CITIES[ckey]['tier'] in SERVICES[skey]['tiers']


PAGES = [(s, c) for s in ORDER_SERVICES for c in ORDER_CITIES if available(s, c)]


def services_in(ckey):
    return [s for s in ORDER_SERVICES if available(s, ckey)]


def cities_for(skey):
    return [c for c in ORDER_CITIES if available(skey, c)]


def h(*parts):
    return int(hashlib.md5('|'.join(map(str, parts)).encode('utf-8')).hexdigest(), 16)


def pick(seq, *salt):
    return seq[h(*salt) % len(seq)]


def shuffled(seq, *salt):
    return sorted(seq, key=lambda x: h(*salt, x if isinstance(x, str) else repr(x)))


def z_prep(name):
    """„z” albo „ze”: ze Słupska, ze Sławna, ze Szczecina — ale z Sopotu, z Ustki."""
    n = name.lower()
    vowels = 'aąeęioóuy'
    if n[0] in 'sśzźż' and len(n) > 1 and n[1] not in vowels:
        return 'ze'
    return 'z'


def ctx(c):
    near = c['near'] + ['okoliczne miejscowości'] * 3
    areas = c['areas'] + ['centrum'] * 2
    return dict(city=c['name'], in_city=c['in'], gen=c['gen'], z_gen=f'{z_prep(c["name"])} {c["gen"]}', loc=c['loc'], ins=c['ins'], near1=near[0], near2=near[1], near3=near[2],
                area1=areas[0], area2=areas[1], km=c['km'], dist=dist_text(c), phone=PHONE)


def fill(text, c):
    return text.format(**ctx(c))


def city_tags(c):
    tags = set(c['tags']) | {'any'}
    if c['tier'] == 'baza':
        tags.add('baza')
    if c['tier'] in ('pomorze', 'daleko'):
        tags.add('far')
    return tags


def scenarios(skey, ckey, n=4):
    s, c = SERVICES[skey], CITIES[ckey]
    tags = city_tags(c)
    specific = [x for x in s['scenarios'] if set(x['when']) & (tags - {'any'})]
    generic = [x for x in s['scenarios'] if 'any' in x['when']]
    chosen = shuffled(specific, skey, ckey, 'sc')[:n]
    for g in shuffled(generic, skey, ckey, 'gen'):
        if len(chosen) >= n:
            break
        if g not in chosen:
            chosen.append(g)
    return [(fill(x['t'], c), fill(x['x'], c)) for x in chosen]


def faq_list(skey, ckey, n=5):
    s, c = SERVICES[skey], CITIES[ckey]
    pool = s['faq']
    rest = shuffled(pool[1:], skey, ckey, 'faq')[:n - 1]
    out = [(fill(q, c), fill(a, c)) for q, a in [pool[0], *rest]]
    out.append((f'Czy obsługujecie miejscowości wokół {c["gen"]}?', f'Tak — m.in. {", ".join(c["near"][:6])}. Wpisz adres w formularzu, a dojazd policzymy automatycznie.'))
    if c['tier'] in ('pomorze', 'daleko'):
        out.append((f'Czy dojazd ze Słupska do {c["gen"]} podnosi cenę?', f'Dojazd ({dist_text(c)}) jest uwzględniony w wycenie. Zlecenia {c["in"]} planujemy w pełne dni pracy i łączymy z innymi kursami w regionie, żeby koszt dojazdu był jak najniższy.'))
    elif c['tier'] == 'baza':
        out.append(('Czy możecie przyjechać jeszcze dziś?', f'Słupsk to nasza baza, więc przy wolnej ekipie często tak. Najszybciej sprawdzisz to telefonicznie: {PHONE}.'))
    return out


def quote_href(skey, ckey, usluga=None):
    s = SERVICES[skey]
    u = usluga or s['usluga']
    return f'wycena.html?usluga={u}&amp;miasto={e(CITIES[ckey]["name"])}'


def plan_sentence(c):
    return {
        'baza': 'Ekipa i busy są na miejscu — przy wolnym terminie przyjeżdżamy nawet tego samego dnia, a wycena z dojazdem nie wymaga dalekiej podróży.',
        'blisko': f'{c["route"]} Jesteśmy tu regularnie, więc terminy są podobne jak w Słupsku.',
        'pomorze': f'{c["route"]} Zlecenia {c["in"]} planujemy w pełne dni pracy i łączymy z innymi kursami w regionie — dzięki temu dojazd nie podnosi niepotrzebnie ceny.',
        'daleko': f'{c["route"]} Terminy ustalamy z wyprzedzeniem, a zakres potwierdzamy na zdjęciach, żeby jeden wyjazd wystarczył.',
    }[c['tier']]


HOUSING_TIP = {
    'przeprowadzki': 'Dlatego w wycenie pytamy o piętro, windę i szerokość klatki po obu stronach — od tego zależy liczba osób w ekipie.',
    'oproznianie-i-wywoz': 'Od rodzaju budynku zależy, jak daleko nosimy rzeczy do auta i ile kursów trzeba zaplanować.',
    'transport-rzeczy': 'Przy dostawie z wniesieniem liczy się piętro, winda i to, czy auto podjedzie pod samo wejście.',
    'odsniezanie': 'Inaczej odśnieża się wąski podjazd przy domu, a inaczej parking przed sklepem — dobieramy sprzęt do terenu.',
    'ogrod-i-dzialka': 'Wielkość i dostępność działek bardzo się tu różnią — dlatego prosimy o zdjęcie bramy i terenu.',
    'wycinka-drzew': 'Przy zwartej zabudowie drzewa często rosną blisko domów i ogrodzeń — wtedy tniemy sekcyjnie.',
    'sprzatanie': 'Od rodzaju lokalu zależy zakres: inne jest sprzątanie mieszkania w bloku, inne domu albo apartamentu na wynajem.',
    'mycie-cisnieniowe': 'Ważne jest, czy na miejscu jest woda i prąd oraz jak duża jest powierzchnia nawierzchni.',
}

HEAD_VARIANTS = {
    'scope': [('Zakres', '{name} {in_city} — co robimy'), ('Co obejmuje usługa', 'Zakres prac {in_city}'), ('Oferta', 'W czym pomagamy {in_city}')],
    'local': [('Lokalnie', '{city} i okolice'), ('Na miejscu', 'Jak pracujemy {in_city}'), ('Region', '{city}: dojazd i specyfika')],
    'scen': [('Przykłady', 'Najczęstsze zlecenia {in_city}'), ('Z praktyki', 'Typowe sytuacje {in_city}'), ('Realizacje', 'Z czym przychodzą klienci {in_city}')],
    'price': [('Cena', 'Od czego zależy cena'), ('Wycena', 'Co wpływa na koszt'), ('Koszt', 'Jak liczymy cenę')],
    'prep': [('Przygotowanie', 'Jak się przygotować'), ('Wskazówki', 'Zanim przyjedziemy'), ('Checklista', 'Co warto zrobić wcześniej')],
    'compare': [('Warianty', 'Który wariant wybrać?'), ('Porównanie', 'Zakres w skrócie'), ('Pakiety', 'Porównaj warianty usługi')],
    'faq': [('FAQ', '{name} {city} — pytania'), ('Pytania', 'Najczęściej pytacie'), ('FAQ', 'Pytania i odpowiedzi')],
    'links': [('Zobacz też', 'Usługi w regionie'), ('W okolicy', 'Sąsiednie miasta i usługi'), ('Linki', 'Więcej usług w regionie')],
}


def head_for(kind, skey, ckey, **extra):
    s, c = SERVICES[skey], CITIES[ckey]
    kicker, title = pick(HEAD_VARIANTS[kind], kind, skey, ckey)
    return kicker, title.format(name=s['name'], **ctx(c), **extra)


def sec(kicker, title, inner, sid='', cls='', lead=''):
    lead_html = f'<p class="v4-lead">{lead}</p>' if lead else ''
    return (f'<section class="v4-section {cls}"{f" id={chr(34)}{sid}{chr(34)}" if sid else ""}><div class="v4-wrap"><div class="v4-head"><span class="v4-kicker">{kicker}</span>'
            f'<h2>{title}</h2>{lead_html}</div>{inner}</div></section>')


def actions(qh, wa_text):
    return (f'<div class="v4-actions"><a class="rv-button" href="{qh}">Wyceń online <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>'
            f'<a class="rv-button wa" href="{e(wa(wa_text))}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a>'
            f'<a class="rv-button ghost" href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i> {PHONE}</a></div>')


def rating():
    return (f'<a class="v8-hero-rating" href="{GMAPS}" rel="noopener" target="_blank"><b>{str(RATING).replace(".", ",")}</b>{stars(5)}'
            f'<span>{RATING_COUNT} opinii w Google</span></a>')


def crumbs(s, c, path_label):
    return (f'<nav class="rv-crumbs" aria-label="Okruszki"><a href="index.html">Strona główna</a><span>/</span><a href="{hub_name(c["key"])}">{e(c["name"])}</a>'
            f'<span>/</span><span class="text-brand-500">{e(path_label)}</span></nav>')


def checks(items):
    return '<ul class="v6-checks">' + ''.join(f'<li><i class="fa-solid fa-check" aria-hidden="true"></i>{e(x)}</li>' for x in items) + '</ul>'


# ---------------------------------------------------------------------------
# Komponenty
# ---------------------------------------------------------------------------

def P(skey, ckey):
    """Wszystko, czego potrzebują komponenty strony usługa × miasto."""
    s, c = dict(SERVICES[skey]), dict(CITIES[ckey], key=ckey)
    d = {'s': s, 'c': c, 'sk': skey, 'ck': ckey}
    d['title'] = fill(pick(s['titles'], 't', skey, ckey), c)
    d['desc'] = fill(pick(s['descs'], 'd', skey, ckey), c)
    d['h1'] = fill(pick(s['h1'], 'h', skey, ckey), c)
    d['lead'] = fill(pick(s['leads'], 'l', skey, ckey), c)
    d['qh'] = quote_href(skey, ckey)
    d['wa'] = f'Dzień dobry, pytam o usługę: {s["name"]} — {c["name"]}.'
    d['photo'] = pick(s['photos'], 'p', skey, ckey)
    d['scope'] = shuffled(s['scope'], skey, ckey, 'scope') if c['tier'] != 'baza' else s['scope']
    d['scen'] = scenarios(skey, ckey, 5 if c['tier'] == 'baza' else 4)
    d['faq'] = faq_list(skey, ckey, 8 if c['tier'] == 'baza' else 5)
    d['prep'] = shuffled(s['prep'], skey, ckey, 'prep')[:6 if c['tier'] == 'baza' else 4]
    return d


def hero_photo(d):
    s, c = d['s'], d['c']
    scope = ''.join(f'<li><i class="fa-solid fa-check" aria-hidden="true"></i>{e(x)}</li>' for x in d['scope'][:6])
    return f'''<section class="v4-hero v4-hero-sub v6-photo-hero"><div class="v6-hero-media">{photo(d["photo"], "", "v6-hero-img", "100vw", (16, 9), (640, 1000, 1600, 2000), True)}</div><div class="v4-wrap v4-hero-grid">
  <div>
    {crumbs(s, c, s["name"])}
    <div class="v4-eyebrow"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> {e(c["name"])} · {e(dist_text(c))}</div>
    <h1 class="v4-h1">{e(d["h1"])}</h1>
    <p class="v4-hero-lead">{e(d["lead"])}</p>
    {actions(d["qh"], d["wa"])}
    {rating()}
  </div>
  <aside class="v4-scope"><p class="v4-scope-title"><i class="fa-solid fa-list-check" aria-hidden="true"></i> {e(s["name"])} {e(c["in"])}</p><ul>{scope}</ul><a href="#zakres">Cały zakres usługi</a></aside>
</div></section>'''


def facts_bar(d):
    c = d['c']
    items = [('fa-location-dot', 'Dojazd', dist_text(c).replace('ok. ', '')), ('fa-map', 'Powiat', c['county']),
             ('fa-house', 'Zabudowa', c['housing'].split(',')[0]), ('fa-star', 'Opinie Google', f'{str(RATING).replace(".", ",")} / 5 · {RATING_COUNT} opinii')]
    return '<div class="v12-facts">' + ''.join(f'<div><i class="fa-solid {i}" aria-hidden="true"></i><span><small>{e(k)}</small>{e(v)}</span></div>' for i, k, v in items) + '</div>'


def hero_facts(d):
    s, c = d['s'], d['c']
    return f'''<section class="v4-hero v4-hero-sub v12-hero-plain"><div class="v4-wrap">
  {crumbs(s, c, s["name"])}
  <div class="v4-eyebrow"><i class="fa-solid {s["icon"]}" aria-hidden="true"></i> {e(s["short"])}</div>
  <h1 class="v4-h1">{e(d["h1"])}</h1>
  <p class="v4-hero-lead">{e(d["lead"])}</p>
  {actions(d["qh"], d["wa"])}
  {facts_bar(d)}
</div></section>'''


def hero_toc(d, toc):
    s, c = d['s'], d['c']
    links = ''.join(f'<a href="#{a}">{e(t)}</a>' for a, t in toc)
    return f'''<section class="v4-hero v4-hero-sub v12-hero-split"><div class="v4-wrap v12-split">
  <div>
    {crumbs(s, c, s["name"])}
    <h1 class="v4-h1">{e(d["h1"])}</h1>
    <p class="v4-hero-lead">{e(d["lead"])}</p>
    {actions(d["qh"], d["wa"])}
  </div>
  <div class="v12-photo-card">{photo(d["photo"], f'{s["name"]} {c["name"]} — RevSerwis', "", "(max-width: 900px) 100vw, 40vw", (4, 3), (480, 800, 1200), True)}
    <nav class="v12-toc" aria-label="Spis treści"><strong>Na tej stronie</strong>{links}</nav></div>
</div></section>'''


def hero_chips(d):
    s, c = d['s'], d['c']
    chips = ''.join(f'<a class="v12-chip" href="{quote_href(d["sk"], d["ck"], u)}"><i class="fa-solid fa-circle-plus" aria-hidden="true"></i>{e(label)}</a>' for label, u in s['chips'])
    return f'''<section class="v4-hero v4-hero-sub v6-photo-hero v12-hero-center"><div class="v6-hero-media">{photo(d["photo"], "", "v6-hero-img", "100vw", (16, 9), (640, 1000, 1600, 2000), True)}</div><div class="v4-wrap">
  {crumbs(s, c, s["name"])}
  <h1 class="v4-h1">{e(d["h1"])}</h1>
  <p class="v4-hero-lead">{e(d["lead"])}</p>
  <p class="v12-chips-title">Co mamy wycenić? Wybierz — formularz otworzy się z zaznaczoną usługą i miastem:</p>
  <div class="v12-chips">{chips}</div>
  <div class="v4-actions"><a class="rv-button ghost" href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i> {PHONE}</a><a class="rv-button wa" href="{e(wa(d["wa"]))}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a></div>
  {rating()}
</div></section>'''


def scope_grid(d):
    return '<div class="v4-services">' + ''.join(
        f'<a class="v4-service" href="{d["qh"]}"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>{e(x)}</span><i class="fa-solid fa-arrow-right go" aria-hidden="true"></i></a>' for x in d['scope']) + '</div>'


def scope_cols(d):
    half = (len(d['scope']) + 1) // 2
    return f'<div class="v4-two">{checks(d["scope"][:half])}{checks(d["scope"][half:])}</div>'


def local_text(d):
    s, c, sk = d['s'], d['c'], d['sk']
    paras = [c['about'], f'Typowa zabudowa {c["in"]}: {c["housing"]}. {HOUSING_TIP[sk]}', plan_sentence(c),
             f'Obsługujemy całe miasto ({", ".join(c["areas"][:6])}) oraz okolice: {", ".join(c["near"][:6])}.']
    order = [0, 1, 2, 3] if h(sk, c['key'], 'lp') % 2 else [1, 0, 3, 2]
    return ''.join(f'<p class="v4-lead">{e(paras[i])}</p>' for i in order)


def contact_card(d):
    s, c = d['s'], d['c']
    return (f'<div class="v4-contact-card"><h3>{e(s["name"])} {e(c["name"])} — kontakt</h3><p>Opisz zlecenie i dodaj zdjęcia — widełki cenowe dostaniesz od razu.</p>'
            f'<a href="{d["qh"]}"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span><small>Wycena online</small>bezpłatne widełki</span></a>'
            f'<a href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i><span><small>Telefon</small>{PHONE}</span></a>'
            f'<a href="{e(wa(d["wa"]))}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span><small>WhatsApp — wyślij zdjęcia</small>{PHONE}</span></a>'
            f'<a href="/konto"><i class="fa-solid fa-mobile-screen" aria-hidden="true"></i><span><small>Status zlecenia</small>panel klienta po numerze telefonu</span></a></div>')


def local_block(d):
    return f'<div class="v4-two"><div>{local_text(d)}</div>{contact_card(d)}</div>'


def areas_grid(d):
    c = d['c']
    areas = ''.join(f'<li>{e(a)}</li>' for a in c['areas'])
    near = ''.join(f'<li>{e(n)}</li>' for n in c['near'])
    return (f'<div class="v12-areas"><div><h3><i class="fa-solid fa-city" aria-hidden="true"></i> {e(c["name"])} — osiedla i dzielnice</h3><ul>{areas}</ul></div>'
            f'<div><h3><i class="fa-solid fa-route" aria-hidden="true"></i> Okolice {e(c["gen"])}</h3><ul>{near}</ul></div>'
            f'<div><h3><i class="fa-solid fa-truck-fast" aria-hidden="true"></i> Dojazd</h3><p>{e(plan_sentence(c))}</p><p class="v12-muted">{e(c["county"])} · woj. {e(c["region"])}</p></div></div>')


def scen_cards(d):
    return '<div class="v12-scen">' + ''.join(f'<article><h3>{e(t)}</h3><p>{e(x)}</p></article>' for t, x in d['scen']) + '</div>'


def scen_table(d):
    rows = ''.join(f'<tr><th scope="row">{e(t)}</th><td>{e(x)}</td></tr>' for t, x in d['scen'])
    return f'<div class="v12-table-wrap"><table class="v12-table"><thead><tr><th scope="col">Sytuacja</th><th scope="col">Jak to robimy</th></tr></thead><tbody>{rows}</tbody></table></div>'


def compare_table(d):
    cols, rows = d['s']['compare']
    head = ''.join(f'<th scope="col">{e(x)}</th>' for x in cols)
    body = ''.join('<tr>' + f'<th scope="row">{e(r[0])}</th>' + ''.join(f'<td>{e(x)}</td>' for x in r[1:]) + '</tr>' for r in rows)
    return f'<div class="v12-table-wrap"><table class="v12-table v12-compare"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'


def factors_steps(d):
    c = d['c']
    steps = ['Wybierz usługę, opisz zlecenie i dodaj zdjęcia — w formularzu są też pytania o dojazd i dostęp, żeby ekipa przyjechała przygotowana.',
             'Od razu dostajesz bezpłatne widełki cenowe; oddzwaniamy, żeby potwierdzić zakres i termin.',
             f'Przyjeżdżamy {c["in"]} w ustalonym terminie, z kompletem sprzętu i zdjęciami przed i po.',
             'Status sprawdzasz w panelu klienta po numerze telefonu; rozliczasz się paragonem lub fakturą VAT.']
    return (f'<div class="v4-two"><div><p class="v4-lead">Nie publikujemy jednej stawki dla wszystkich — cena zależy od konkretnego zlecenia. Na wycenę wpływa przede wszystkim:</p>{checks(d["s"]["factors"])}'
            f'<p class="v4-lead">Widełki z formularza są bezpłatne. Dokładną cenę podajemy po rozmowie albo po płatnych oględzinach na miejscu.</p></div>'
            '<div><ol class="v4-steps">' + ''.join(f'<li><span>{i}</span><p>{e(t)}</p></li>' for i, t in enumerate(steps, 1)) + '</ol></div></div>')


def timeline(d):
    s, c = d['s'], d['c']
    items = [('Zgłoszenie', 'Formularz ze zdjęciami, telefon albo WhatsApp. Pytamy o szczegóły, które wpływają na przygotowanie ekipy.'),
             ('Widełki i termin', 'Bezpłatny przedział ceny od razu na ekranie, potem telefon z potwierdzeniem terminu.'),
             ('Dzień przed', 'SMS z przypomnieniem i linkiem do potwierdzenia albo zmiany terminu.'),
             ('Realizacja', f'Ekipa przyjeżdża {c["in"]} z kompletem sprzętu dobranym do zgłoszenia. Zdjęcia przed i po.'),
             ('Po wszystkim', 'Rozliczenie paragonem lub fakturą VAT, historia zlecenia w panelu klienta.')]
    return '<ol class="v12-timeline">' + ''.join(f'<li><b>{e(t)}</b><p>{e(x)}</p></li>' for t, x in items) + '</ol>'


def prep_block(d):
    return f'<div class="v12-prep">{checks(d["prep"])}<p class="v12-muted">Im więcej szczegółów w formularzu, tym lepiej ekipa przygotuje sprzęt — i tym mniej niespodzianek w cenie.</p></div>'


def faq_block(d):
    return '<div class="rv-faq">' + ''.join(f'<details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in d['faq']) + '</div>'


def links_block(d):
    s, c, sk, ck = d['s'], d['c'], d['sk'], d['ck']
    near = [k for k in region_cities(ck, 12) if available(sk, k)][:7]
    if ck != 'slupsk' and available(sk, 'slupsk') and 'slupsk' not in near:
        near = ['slupsk'] + near[:6]
    city_links = ''.join(f'<a href="{page_name(sk, k)}">{e(s["name"])} {e(CITIES[k]["name"])}</a>' for k in near)
    svc_links = ''.join(f'<a href="{page_name(k, ck)}">{e(SERVICES[k]["name"])} {e(c["name"])}</a>' for k in services_in(ck) if k != sk)
    return (f'<div class="v8-local-links"><div><h3>{e(s["name"])} w okolicy</h3><div class="v8-chips">{city_links}</div></div>'
            f'<div><h3>Inne usługi {e(c["in"])}</h3><div class="v8-chips">{svc_links}<a href="{hub_name(ck)}">Wszystkie usługi {e(c["name"])} →</a></div></div></div>')


def cta_block(d):
    s, c = d['s'], d['c']
    return (f'<section class="v4-section"><div class="v4-wrap"><div class="v4-cta"><div><h2>{e(s["name"])} {e(c["name"])} — wycena online</h2><p>Opisz zlecenie i dodaj do 10 zdjęć. Bezpłatne widełki cenowe pokażemy od razu na ekranie.</p></div>'
            f'<div class="v4-cta-actions"><a class="rv-button" href="{d["qh"]}">Wyceń zlecenie</a><a class="rv-button wa" href="{e(wa(d["wa"]))}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a><a class="rv-button ghost" href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i> {PHONE}</a></div></div></div></section>')


def reviews(d, title=None):
    return reviews_block(limit=3, offset=h(d['sk'], d['ck'], 'rev') % 97, title=title or 'Opinie klientów RevSerwis', lead='Prawdziwe opinie z naszej wizytówki Google.')


def article(d):
    """Układ „przewodnik”: tekst długi z nagłówkami + karta kontaktu z boku."""
    s, c, sk = d['s'], d['c'], d['sk']
    parts = [
        ('jak-dzialamy', f'Jak działamy {c["in"]}', local_text(d)),
        ('przyklady', f'Typowe zlecenia {c["in"]}', ''.join(f'<h3>{e(t)}</h3><p>{e(x)}</p>' for t, x in d['scen'])),
        ('cena', f'Ile kosztuje {s["name"].lower()} {c["in"]}?', f'<p>Cena zależy przede wszystkim od tych czynników:</p>{checks(s["factors"])}<p>Bezpłatne widełki dostaniesz w formularzu online — po wpisaniu adresu i dodaniu zdjęć. Dokładną kwotę podajemy po rozmowie albo po płatnych oględzinach.</p>'),
        ('przygotowanie', 'Jak się przygotować', checks(d['prep'])),
    ]
    body = ''.join(f'<section class="v12-art-sec" id="{a}"><h2>{e(t)}</h2>{x}</section>' for a, t, x in parts)
    return (f'<section class="v4-section"><div class="v4-wrap v12-article"><div class="v12-art">{body}</div>'
            f'<aside class="v12-art-side">{contact_card(d)}<div class="v4-contact-card"><h3>Zakres usługi</h3>{checks(d["scope"][:6])}</div></aside></div></section>')


def osiedla_block(d):
    """Słupsk: każde osiedle z inną wskazówką dla danej usługi."""
    s, sk = d['s'], d['sk']
    tips = {
        'przeprowadzki': ['bloki bez windy — liczymy piętra z góry', 'kamienice z wąskimi klatkami — demontujemy szafy', 'parkowanie przy wejściu bywa trudne — ustalamy miejsce', 'domy i szeregowce — więcej rzeczy z garażu i piwnicy'],
        'oproznianie-i-wywoz': ['piwnice w blokach — szybkie zlecenia na kilka godzin', 'mieszkania po starszych osobach — odkładamy pamiątki', 'strychy kamienic — dużo drobnych rzeczy', 'domy z garażem — wywóz w kilku kursach'],
        'transport-rzeczy': ['dostawy ze sklepów z wniesieniem', 'odbiór z ogłoszeń jeszcze tego samego dnia', 'wąskie podwórka — mniejsze auto', 'nowe osiedla — dojazd pod klatkę'],
        'odsniezanie': ['parkingi przy pawilonach handlowych', 'chodniki i dojścia do klatek', 'podjazdy domów jednorodzinnych', 'place firm i hurtowni'],
        'ogrod-i-dzialka': ['ogródki działkowe — koszenie sezonowe', 'ogrody przy domach — przycinka żywopłotów', 'działki pod zabudowę — karczowanie', 'tereny wspólnot — stała pielęgnacja'],
        'wycinka-drzew': ['drzewa przy blokach i garażach', 'ogrody przy domach — wycinka sekcyjna', 'działki budowlane — usuwanie pni', 'stare sady — przycinka'],
        'sprzatanie': ['mieszkania po najemcach', 'mieszkania po remoncie', 'lokale przed sprzedażą', 'biura i gabinety'],
        'mycie-cisnieniowe': ['podjazdy z kostki przy domach', 'tarasy i schody', 'place i parkingi firm', 'ogrodzenia i murki'],
    }[sk]
    cards = ''.join(f'<li><b>{e(a)}</b><span>{e(pick(tips, sk, a))}</span></li>' for a in d['c']['areas'])
    gm = ', '.join(SLUPSK_GMINY)
    return (f'<ul class="v12-osiedla">{cards}</ul><p class="v4-lead">Poza miastem obsługujemy cały powiat słupski — gminy: {e(gm)}. '
            f'Dojazd do Kobylnicy, Redzikowa czy Siemianic zajmuje nam kilkanaście minut.</p>')


# ---------------------------------------------------------------------------
# Układy stron
# ---------------------------------------------------------------------------

def layout_A(d):
    k = lambda kind: head_for(kind, d['sk'], d['ck'])
    return (hero_photo(d) + sec(*k('scope'), scope_grid(d), 'zakres') + sec(*k('local'), local_block(d), cls='v4-alt')
            + sec(*k('scen'), scen_cards(d)) + sec(*k('price'), factors_steps(d), cls='v4-alt') + reviews(d)
            + sec(*k('faq'), faq_block(d), 'faq') + sec(*k('links'), links_block(d), cls='v4-alt') + cta_block(d))


def layout_B(d):
    k = lambda kind: head_for(kind, d['sk'], d['ck'])
    return (hero_facts(d) + sec(*k('scen'), scen_table(d), 'zakres', lead=e(f'{d["s"]["name"]} {d["c"]["in"]} — najczęstsze sytuacje i to, jak je rozwiązujemy.'))
            + sec(*k('local'), areas_grid(d), cls='v4-alt') + sec(*k('prep'), prep_block(d)) + sec(*k('compare'), compare_table(d), cls='v4-alt')
            + sec(*k('faq'), faq_block(d), 'faq') + cta_block(d) + sec(*k('links'), links_block(d), cls='v4-alt'))


def layout_C(d):
    k = lambda kind: head_for(kind, d['sk'], d['ck'])
    toc = [('jak-dzialamy', 'Jak działamy'), ('przyklady', 'Typowe zlecenia'), ('cena', 'Cena'), ('przygotowanie', 'Przygotowanie'), ('faq', 'Pytania')]
    return (hero_toc(d, toc) + article(d) + sec(*k('faq'), faq_block(d), 'faq', cls='v4-alt') + reviews(d)
            + sec(*k('links'), links_block(d)) + cta_block(d))


def layout_D(d):
    k = lambda kind: head_for(kind, d['sk'], d['ck'])
    return (hero_chips(d) + sec('Krok po kroku', f'Jak wygląda zlecenie {e(d["c"]["in"])}', timeline(d)) + sec(*k('scope'), scope_cols(d), 'zakres', cls='v4-alt')
            + sec(*k('local'), areas_grid(d)) + sec(*k('scen'), scen_cards(d), cls='v4-alt') + reviews(d)
            + sec(*k('faq'), faq_block(d), 'faq') + sec(*k('links'), links_block(d), cls='v4-alt'))


def layout_E(d):
    k = lambda kind: head_for(kind, d['sk'], d['ck'])
    return (hero_photo(d) + sec(*k('compare'), compare_table(d), 'zakres') + sec(*k('scen'), scen_cards(d), cls='v4-alt')
            + sec(*k('local'), local_block(d)) + sec(*k('prep'), prep_block(d), cls='v4-alt') + sec(*k('price'), factors_steps(d))
            + sec(*k('faq'), faq_block(d), 'faq', cls='v4-alt') + cta_block(d) + sec(*k('links'), links_block(d)))


def layout_S(d):
    """Słupsk — baza: najbogatszy układ."""
    k = lambda kind: head_for(kind, d['sk'], d['ck'])
    s = d['s']
    return (hero_photo(d) + f'<section class="v4-section v12-facts-sec"><div class="v4-wrap">{facts_bar(d)}</div></section>'
            + sec(*k('scope'), scope_grid(d), 'zakres') + sec('Osiedla Słupska', f'{e(s["name"])} na każdym osiedlu', osiedla_block(d), cls='v4-alt',
                                                              lead='Znamy specyfikę każdej części miasta — od kamienic w centrum po nowe domy pod Słupskiem.')
            + sec(*k('scen'), scen_cards(d)) + sec(*k('compare'), compare_table(d), cls='v4-alt') + sec(*k('local'), local_block(d))
            + sec(*k('prep'), prep_block(d), cls='v4-alt') + sec(*k('price'), factors_steps(d)) + reviews(d, 'Opinie klientów ze Słupska i okolic')
            + sec(*k('faq'), faq_block(d), 'faq') + sec(*k('links'), links_block(d), cls='v4-alt') + cta_block(d))


LAYOUTS = {'A': layout_A, 'B': layout_B, 'C': layout_C, 'D': layout_D, 'E': layout_E, 'S': layout_S}


def layout_for(skey, ckey):
    if CITIES[ckey]['tier'] == 'baza':
        return 'S'
    si, ci = ORDER_SERVICES.index(skey), ORDER_CITIES.index(ckey)
    return 'ABCDE'[(si * 2 + ci) % 5]


# ---------------------------------------------------------------------------
# Strony
# ---------------------------------------------------------------------------

def build_local_page(skey, ckey):
    d = P(skey, ckey)
    s, c = d['s'], d['c']
    path = page_name(skey, ckey)
    lay = layout_for(skey, ckey)
    body = LAYOUTS[lay](d).replace('<section class="v4-hero', f'<section data-layout="{lay}" class="v4-hero', 1)
    service_ld = {"@context": "https://schema.org", "@type": "Service", "name": f'{s["name"]} {c["name"]}', "serviceType": s['short'], "description": d['desc'],
                  "url": SITE + path, "provider": {"@id": SITE + "#organization"},
                  "areaServed": [{"@type": "City", "name": c['name']}, *({"@type": "Place", "name": n} for n in c['near'][:6])],
                  "offers": {"@type": "Offer", "url": SITE + 'wycena.html', "description": 'Bezpłatna wycena orientacyjna (widełki cenowe) online'}}
    faq_ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in d['faq']]}
    html = page(d['title'], d['desc'], path, body, extra_ld=(service_ld, faq_ld), quote_href=d['qh'].replace('&amp;', '&'), wa_text=d['wa'],
                crumbs=[(c['name'], hub_name(ckey)), (f'{s["name"]} {c["name"]}', path)])
    html = html.replace('<meta name="geo.placename" content="Słupsk">', f'<meta name="geo.placename" content="{e(c["name"])}">')
    open(os.path.join(PUB, path), 'w', encoding='utf-8').write(html)
    return path


HUB_INTRO = {
    'baza': 'Słupsk to nasza baza — wszystkie usługi RevSerwis są tu dostępne na co dzień, często jeszcze tego samego dnia.',
    'blisko': 'Do {gen} dojeżdżamy regularnie, więc oferujemy tu pełny zakres usług — także te cykliczne, jak odśnieżanie czy sprzątanie.',
    'pomorze': '{city} obsługujemy w ramach zaplanowanych wyjazdów: przeprowadzki, transport, opróżnianie oraz prace w ogrodzie i wycinkę drzew.',
    'daleko': '{city} to dla nas trasa dalekobieżna — realizujemy tu przeprowadzki, transport i opróżnianie, planowane z wyprzedzeniem.',
}


def build_city_hub(ckey):
    c = dict(CITIES[ckey], key=ckey)
    path = hub_name(ckey)
    svcs = services_in(ckey)
    cards = ''.join(
        f'<a class="v12-svc" href="{page_name(sk, ckey)}"><i class="fa-solid {SERVICES[sk]["icon"]}" aria-hidden="true"></i><strong>{e(SERVICES[sk]["name"])} {e(c["name"])}</strong>'
        f'<span>{e(scenarios(sk, ckey, 1)[0][1][:150].rsplit(" ", 1)[0])}…</span><em>Zobacz <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></em></a>' for sk in svcs)
    intro = HUB_INTRO[c['tier']].format(**ctx(c))
    qh = f'wycena.html?miasto={e(c["name"])}'
    wa_text = f'Dzień dobry, pytam o usługi RevSerwis — {c["name"]}.'
    hero = f'''<section class="v4-hero v4-hero-sub v12-hero-plain"><div class="v4-wrap">
  <nav class="rv-crumbs" aria-label="Okruszki"><a href="index.html">Strona główna</a><span>/</span><a href="obszar-dzialania.html">Obszar działania</a><span>/</span><span class="text-brand-500">{e(c["name"])}</span></nav>
  <div class="v4-eyebrow"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> {e(TIER_LABEL[c["tier"]])} · {e(dist_text(c))}</div>
  <h1 class="v4-h1">RevSerwis {e(c["name"])} — usługi {e(c["in"])}</h1>
  <p class="v4-hero-lead">{e(intro)} {e(c["about"])}</p>
  <div class="v4-actions"><a class="rv-button" href="{qh}">Wyceń zlecenie <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a><a class="rv-button wa" href="{e(wa(wa_text))}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a><a class="rv-button ghost" href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i> {PHONE}</a></div>
</div></section>'''
    d = {'c': c, 's': SERVICES[svcs[0]], 'sk': svcs[0], 'ck': ckey}
    body = hero + sec('Usługi', f'Co robimy {e(c["in"])}', f'<div class="v12-svcs">{cards}</div>')
    body += sec('Lokalnie', f'{e(c["name"])} i okolice', areas_grid(d), cls='v4-alt')
    if c['tier'] == 'baza':
        body += sec('Powiat słupski', 'Gminy, które obsługujemy na co dzień', f'<div class="v8-chips">{"".join(f"<span>{e(g)}</span>" for g in SLUPSK_GMINY)}</div>',
                    lead='Z bazy w Słupsku dojeżdżamy do każdej gminy powiatu w mniej niż godzinę.')
    body += reviews_block(limit=3, offset=ORDER_CITIES.index(ckey) * 2, title=f'Opinie klientów RevSerwis', lead='Prawdziwe opinie z naszej wizytówki Google.')
    near = ''.join(f'<a href="{hub_name(k)}">{e(CITIES[k]["name"])}</a>' for k in region_cities(ckey, 8))
    body += sec('W regionie', 'Sąsiednie miasta', f'<div class="v8-chips">{near}<a href="obszar-dzialania.html">Cały obszar działania →</a></div>', cls='v4-alt')
    title = f'RevSerwis {c["name"]} — przeprowadzki, opróżnianie, transport' + (', ogród' if 'ogrod-i-dzialka' in svcs else '') + ' | RevSerwis'
    desc = f'Usługi RevSerwis {c["in"]}: ' + ', '.join(SERVICES[sk]['name'].lower() for sk in svcs) + f'. {dist_text(c).capitalize()}. Wycena online ze zdjęć.'
    ld = {"@context": "https://schema.org", "@type": "ItemList", "name": f'Usługi RevSerwis {c["in"]}',
          "itemListElement": [{"@type": "ListItem", "position": i, "url": SITE + page_name(sk, ckey), "name": f'{SERVICES[sk]["name"]} {c["name"]}'} for i, sk in enumerate(svcs, 1)]}
    html = page(title, desc[:300], path, body, extra_ld=(ld,), quote_href=qh.replace('&amp;', '&'), wa_text=wa_text, crumbs=[('Obszar działania', 'obszar-dzialania.html'), (c['name'], path)])
    html = html.replace('<meta name="geo.placename" content="Słupsk">', f'<meta name="geo.placename" content="{e(c["name"])}">')
    open(os.path.join(PUB, path), 'w', encoding='utf-8').write(html)
    return path


def local_links_section(skey):
    """Blok „W Twoim mieście” do stron usług (huby i działy) — Słupsk wyróżniony, reszta pogrupowana."""
    if skey not in SERVICES:
        return ''
    s = SERVICES[skey]
    groups = {}
    for k in cities_for(skey):
        groups.setdefault(CITIES[k]['tier'], []).append(k)
    html = ''
    for tier in ('baza', 'blisko', 'pomorze', 'daleko'):
        if tier not in groups:
            continue
        chips = ''.join(f'<a href="{page_name(skey, k)}"{" class=" + chr(34) + "v12-primary" + chr(34) if tier == "baza" else ""}><i class="fa-solid fa-location-dot" aria-hidden="true"></i>{e(s["name"])} {e(CITIES[k]["name"])}</a>' for k in groups[tier])
        html += f'<div class="v12-tier"><h3>{e(TIER_LABEL[tier])}</h3><div class="v8-chips">{chips}</div></div>'
    return (f'<section class="v4-section v8-local" data-local-links><div class="v4-wrap"><div class="v4-head"><span class="v4-kicker">Lokalnie</span><h2>{e(s["name"])} w Twoim mieście</h2>'
            f'<p class="v4-lead">Baza w Słupsku, realizacje na całym Pomorzu. <a class="v4-link-inline" href="obszar-dzialania.html">Zobacz obszar działania</a>.</p></div>{html}</div></section>')


def build_area_page():
    path = 'obszar-dzialania.html'

    def city_card(ck):
        c = CITIES[ck]
        items = ''.join(f'<li><a href="{page_name(sk, ck)}">{e(SERVICES[sk]["name"])}</a></li>' for sk in services_in(ck))
        return (f'<article class="v8-city"><h3><i class="fa-solid fa-location-dot" aria-hidden="true"></i> <a href="{hub_name(ck)}">{e(c["name"])}</a></h3>'
                f'<p>{e(dist_text(c))} · {e(c["county"])}</p><ul>{items}</ul></article>')
    tiers = ''
    for tier in ('baza', 'blisko', 'pomorze', 'daleko'):
        cks = [k for k in ORDER_CITIES if CITIES[k]['tier'] == tier]
        tiers += f'<h3 class="v12-tier-title">{e(TIER_LABEL[tier])}</h3><div class="v8-cities">{"".join(city_card(k) for k in cks)}</div>'
    main = f'''<section class="v4-hero v4-hero-sub v6-photo-hero"><div class="v6-hero-media">{photo("van", "", "v6-hero-img", "100vw", (16, 9), (640, 1000, 1600, 2000), True)}</div><div class="v4-wrap">
  <nav class="rv-crumbs" aria-label="Okruszki"><a href="index.html">Strona główna</a><span>/</span><span class="text-brand-500">Obszar działania</span></nav>
  <h1 class="v4-h1">Ze Słupska — na całe Pomorze.</h1>
  <p class="v4-hero-lead">Bazą RevSerwis jest Słupsk. Na co dzień pracujemy w Słupsku, Ustce, Sławnie, Lęborku, Koszalinie i okolicach, a przeprowadzki, transport i opróżnianie realizujemy także w Trójmieście, Szczecinie, Pile i całej Polsce.</p>
  <div class="v4-actions"><a class="rv-button" href="wycena.html">Wyceń zlecenie <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a><a class="rv-button ghost" href="{hub_name("slupsk")}">Usługi w Słupsku</a><a class="rv-button ghost" href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i> {PHONE}</a></div>
</div></section>
<section class="v4-section"><div class="v4-wrap"><div class="v4-head"><span class="v4-kicker">{len(ORDER_CITIES)} miast</span><h2>Miasta i usługi lokalne</h2><p class="v4-lead">Usługi cykliczne (odśnieżanie, sprzątanie, mycie) świadczymy tam, gdzie dojeżdżamy codziennie. Przeprowadzki, transport i opróżnianie — wszędzie.</p></div>{tiers}</div></section>
<section class="v4-section v4-alt"><div class="v4-wrap v4-two"><div><div class="v4-head"><span class="v4-kicker">Cała Polska</span><h2>Długie trasy i zagranica</h2></div>
  <p class="v4-lead">Przeprowadzki i transport realizujemy między dowolnymi miastami w Polsce oraz do krajów UE, Skandynawii i Wielkiej Brytanii. Zlecenia daleko od bazy planujemy w pełne dni, żeby nie płacić za puste kursy.</p>
  {checks(["Jeden kontakt i jedna faktura — także dla firm z wieloma lokalizacjami", "Zdjęcia przed i po, raport z realizacji", "Status zlecenia w panelu klienta po numerze telefonu"])}</div>
  <div class="v4-contact-card"><h3>Nie ma Twojej miejscowości?</h3><p>Wpisz adres w wycenie — dojazd policzymy automatycznie i podpowiemy najbliższy termin.</p><a href="wycena.html"><i class="fa-solid fa-route" aria-hidden="true"></i><span><small>Wycena online</small>dojazd liczony automatycznie</span></a></div></div></section>'''
    html = page('Obszar działania RevSerwis — Słupsk, Pomorze, Trójmiasto i Szczecin', 'Baza w Słupsku. Usługi w 30 miastach: Słupsk, Ustka, Lębork, Koszalin, Sławno, Bytów, Miastko, Gdańsk, Gdynia, Sopot, Szczecin, Kołobrzeg, Piła i inne. Przeprowadzki, opróżnianie, transport, ogród.',
                path, main, crumbs=[('Obszar działania', path)])
    open(os.path.join(PUB, path), 'w', encoding='utf-8').write(html)
    return path


def build_all():
    pages = [build_local_page(s, c) for s, c in PAGES]
    pages += [build_city_hub(c) for c in ORDER_CITIES]
    pages.append(build_area_page())
    return pages
