# -*- coding: utf-8 -*-
"""RevSerwis 8.0 — lokalne podstrony SEO: 5 głównych usług × 6 miast (30 stron) + „Obszar działania” (cała Polska).

Każda strona ma unikalny tytuł, opis, H1, treść o mieście (odległość od bazy, okoliczne miejscowości, specyfika),
zakres usługi, czynniki ceny (bez stawek), proces, FAQ (FAQPage), opinie z Google, okruszki (BreadcrumbList),
dane strukturalne Service z areaServed = miasto i linki do pozostałych miast oraz usług (linkowanie wewnętrzne).
"""
import os

from common import (PUB, SITE, PHONE, TEL, GMAPS, COMPANY, e, page, photo, wa, reviews_block, RATING, RATING_COUNT, stars)

# ---------------------------------------------------------------------------
# Usługi
# ---------------------------------------------------------------------------

SERVICES = {
    'przeprowadzki': {
        'name': 'Przeprowadzki', 'h1': 'Przeprowadzki', 'kat': 'przeprowadzka', 'photo': 'movers', 'icon': 'fa-house-chimney', 'hub': 'przeprowadzki.html',
        'short': 'przeprowadzki krajowe i międzynarodowe',
        'title': 'Przeprowadzki {city} — krajowe i międzynarodowe | RevSerwis',
        'desc': 'Przeprowadzki {in_city}: mieszkania, domy i biura, w Polsce i za granicę. Pakowanie, demontaż mebli, transport z zabezpieczeniem. Bezpłatna wycena online ze zdjęć.',
        'lead': 'Przeprowadzamy mieszkania, domy i biura {in_city} i okolicach — lokalnie, po całej Polsce i za granicę. Zabezpieczamy meble, nosimy po schodach, rozkręcamy i skręcamy szafy.',
        'scope': ['Przeprowadzki mieszkań, domów i biur', 'Przeprowadzki międzynarodowe (UE, Skandynawia, Wielka Brytania)', 'Pakowanie, kartony i folie', 'Demontaż i montaż mebli', 'Wnoszenie na piętra i ciężkie rzeczy (pianina, sejfy)', 'Transport pojedynczych mebli i AGD', 'Przechowanie rzeczy między przeprowadzkami', 'Wywóz niepotrzebnych mebli przy okazji'],
        'factors': ['ilość rzeczy (objętość ładunku) i liczba kursów', 'piętra i dostęp do windy po obu stronach', 'odległość trasy i dojazd', 'pakowanie, demontaż mebli i ciężkie przedmioty', 'termin — weekendy i święta są droższe'],
        'faq': [
            ('Ile kosztuje przeprowadzka {in_city}?', 'Cena zależy od ilości rzeczy, pięter, dostępu do windy i odległości. W formularzu online dodajesz zdjęcia i od razu dostajesz bezpłatne widełki cenowe. Dokładną kwotę potwierdzamy telefonicznie albo po oględzinach.'),
            ('Czy robicie przeprowadzki z {city_gen} za granicę?', 'Tak. Realizujemy przeprowadzki międzynarodowe — m.in. do Niemiec, Holandii, Skandynawii i Wielkiej Brytanii. Trasę i termin ustalamy indywidualnie.'),
            ('Czy spakujecie rzeczy i rozkręcicie meble?', 'Tak, na życzenie pakujemy rzeczy, dostarczamy kartony i folie, demontujemy i montujemy meble. Zaznacz to w wycenie.'),
            ('Jak szybko możecie przyjechać do {city_gen}?', 'Najczęściej w ciągu kilku dni; w pilnych sprawach sprawdzimy dostępność ekipy jeszcze tego samego dnia — najszybciej przez telefon {phone}.')
        ]
    },
    'oproznianie-i-wywoz': {
        'name': 'Opróżnianie i wywóz', 'h1': 'Opróżnianie mieszkań i wywóz gabarytów', 'kat': 'oproznianie', 'photo': 'garage_junk', 'icon': 'fa-box-open', 'hub': 'oproznianie-utylizacja.html',
        'short': 'opróżnianie mieszkań, piwnic i garaży oraz wywóz gabarytów',
        'title': 'Opróżnianie mieszkań i wywóz gabarytów {city} | RevSerwis',
        'desc': 'Opróżnianie mieszkań, domów, piwnic i garaży {in_city}. Wywóz mebli, AGD i gabarytów z legalną utylizacją. Wycena ze zdjęć online — szybko i bez zobowiązań.',
        'lead': 'Opróżniamy mieszkania, domy, piwnice, strychy i garaże {in_city} — wynosimy, segregujemy i legalnie utylizujemy. Zostawiamy pusty, pozamiatany lokal.',
        'scope': ['Opróżnianie mieszkań i domów (także po zmarłych)', 'Piwnice, strychy, garaże i komórki', 'Wywóz mebli, AGD, RTV i gabarytów', 'Wywóz gruzu i odpadów po remoncie', 'Opróżnianie lokali po najemcach i przed sprzedażą', 'Segregacja i legalna utylizacja', 'Sprzątanie po opróżnieniu', 'Opróżnianie firm, biur i magazynów'],
        'factors': ['ilość rzeczy (m³) i liczba kursów', 'rodzaj odpadów — meble, AGD, gruz, odpady zielone', 'piętro, winda i odległość od auta', 'koszty utylizacji w punkcie odbioru', 'potrzeba sprzątania po opróżnieniu'],
        'faq': [
            ('Ile kosztuje opróżnienie mieszkania {in_city}?', 'Na cenę wpływa ilość rzeczy, rodzaj odpadów, piętro i koszty utylizacji. Wyślij zdjęcia w formularzu — nasz system wyceny policzy bezpłatne widełki, a dokładną kwotę potwierdzimy po rozmowie lub oględzinach.'),
            ('Co dzieje się z wywiezionymi rzeczami?', 'Segregujemy je i oddajemy do legalnych punktów odbioru i recyklingu. Rzeczy w dobrym stanie możemy przekazać dalej.'),
            ('Czy opróżnicie mieszkanie po zmarłym bez mojej obecności?', 'Tak — wystarczy przekazanie kluczy i ustalenie, co zostaje. Robimy zdjęcia przed i po.'),
            ('Czy wywieziecie pojedynczą kanapę lub szafę z {city_gen}?', 'Tak, wywozimy także pojedyncze meble i AGD. Wybierz w wycenie „Tylko wywóz gabarytów”.')
        ]
    },
    'transport-rzeczy': {
        'name': 'Transport rzeczy', 'h1': 'Transport rzeczy i mebli', 'kat': 'transport', 'photo': 'van_furniture', 'icon': 'fa-truck', 'hub': 'revcargo.html',
        'short': 'transport mebli, AGD, palet i materiałów',
        'title': 'Transport mebli i rzeczy {city} — z wniesieniem | RevSerwis',
        'desc': 'Transport mebli, AGD, palet i materiałów {in_city} i w całej Polsce. Odbiór ze sklepu lub z ogłoszenia, wniesienie na piętro. Wycena online w 30 sekund.',
        'lead': 'Przewozimy meble, AGD, palety, materiały budowlane i maszyny {in_city}, po całej Polsce i za granicę. Odbieramy ze sklepu, z ogłoszenia albo z magazynu — z wniesieniem na miejsce.',
        'scope': ['Transport mebli i AGD z wniesieniem', 'Odbiór zakupów ze sklepu i z ogłoszeń', 'Transport palet i materiałów budowlanych', 'Transport maszyn i urządzeń', 'Transport motocykli, quadów i skuterów', 'Kursy po Polsce i do krajów UE', 'Stałe dostawy dla firm', 'Pomoc przy załadunku i rozładunku'],
        'factors': ['odległość trasy', 'waga i gabaryty ładunku', 'pomoc przy załadunku i wniesienie na piętro', 'termin i pilność', 'liczba punktów odbioru i dostawy'],
        'faq': [
            ('Ile kosztuje transport mebli {in_city}?', 'Cena zależy od trasy, gabarytów i tego, czy potrzebujesz wniesienia. Wpisz trasę w formularzu online — dostaniesz bezpłatne widełki od razu na ekranie.'),
            ('Czy odbierzecie mebel ze sklepu i wniesiecie go do mieszkania?', 'Tak. Odbieramy ze sklepów i od osób prywatnych, wnosimy na piętro, a na życzenie montujemy.'),
            ('Czy jeździcie z {city_gen} w dalsze trasy?', 'Tak — realizujemy kursy po całej Polsce i do krajów UE, także z pomocą oddziałów partnerskich.'),
            ('Czy przewieziecie motocykl lub quad?', 'Tak, przewozimy motocykle, quady, skutery i crossy — także niesprawne.')
        ]
    },
    'odsniezanie': {
        'name': 'Odśnieżanie', 'h1': 'Odśnieżanie posesji, parkingów i firm', 'kat': 'zima', 'photo': 'snow', 'icon': 'fa-snowflake', 'hub': 'revwinter.html',
        'short': 'odśnieżanie podjazdów, parkingów i terenów firm',
        'title': 'Odśnieżanie {city} — parkingi, podjazdy, firmy | RevWinter',
        'desc': 'Odśnieżanie {in_city}: parkingi, podjazdy, chodniki i place firm. Jednorazowo lub abonament na cały sezon (Winter Care). Usuwanie lodu, posypywanie, wywóz śniegu.',
        'lead': 'Odśnieżamy podjazdy, parkingi, chodniki i tereny firm {in_city}. Jednorazowo po opadach albo w abonamencie Winter Care na cały sezon — z usuwaniem lodu i posypywaniem.',
        'scope': ['Odśnieżanie parkingów i placów', 'Odśnieżanie podjazdów i chodników', 'Usuwanie lodu i posypywanie', 'Wywóz śniegu', 'Odśnieżanie terenów firm, sklepów i wspólnot', 'Abonament Winter Care na cały sezon', 'Dyżury po nocnych opadach', 'Raport ze zdjęciami po każdej akcji'],
        'factors': ['powierzchnia i rodzaj terenu', 'jednorazowo czy abonament na sezon', 'częstotliwość i godziny (np. przed otwarciem firmy)', 'posypywanie i wywóz śniegu', 'dojazd sprzętu'],
        'faq': [
            ('Ile kosztuje odśnieżanie {in_city}?', 'Zależy od powierzchni, częstotliwości i tego, czy chcesz jednorazowej akcji, czy abonamentu na sezon. Podaj powierzchnię w formularzu — otrzymasz bezpłatne widełki.'),
            ('Na czym polega abonament Winter Care?', 'Stała opłata za sezon: przyjeżdżamy po każdym opadzie w ustalonych godzinach, odśnieżamy, posypujemy i raportujemy wykonanie. Bez dzwonienia po każdym śniegu.'),
            ('Czy odśnieżacie tereny firm i wspólnot w {city_loc}?', 'Tak — parkingi sklepów, placy firm, osiedla i wspólnoty mieszkaniowe. Wystawiamy faktury VAT.'),
            ('Jak szybko przyjeżdżacie po opadach?', 'Klienci z abonamentem mają pierwszeństwo — ustalamy godziny dyżuru (np. do 7:00). Zlecenia jednorazowe realizujemy według kolejki.')
        ]
    },
    'ogrod-i-dzialka': {
        'name': 'Ogród i działka', 'h1': 'Ogród i działka — koszenie, wycinka, porządki', 'kat': 'ogrod', 'photo': 'gardener', 'icon': 'fa-leaf', 'hub': 'revgarden.html',
        'short': 'koszenie, wycinka drzew i porządkowanie działek',
        'title': 'Koszenie, wycinka drzew i porządki na działce {city} | RevSerwis',
        'desc': 'Prace na działce {in_city}: koszenie trawy, karczowanie, wycinka drzew, usuwanie pni i wywóz odpadów zielonych. Wycena online ze zdjęć — bezpłatne widełki.',
        'lead': 'Porządkujemy ogrody i działki {in_city}: koszenie, karczowanie zarośli, wycinka i przycinka drzew, usuwanie pni oraz wywóz gałęzi i odpadów zielonych.',
        'scope': ['Koszenie trawy i wysokich zarośli', 'Karczowanie krzewów i samosiejek', 'Wycinka i przycinka drzew', 'Usuwanie pni i korzeni (frezowanie)', 'Przycinanie żywopłotów', 'Wywóz gałęzi i odpadów zielonych', 'Porządkowanie działek przed sprzedażą lub budową', 'Stała pielęgnacja terenu firm'],
        'factors': ['powierzchnia i stopień zarośnięcia', 'liczba i wysokość drzew', 'bliskość budynków i linii', 'ilość odpadów zielonych do wywozu', 'dostęp dla sprzętu'],
        'faq': [
            ('Ile kosztuje uporządkowanie działki {in_city}?', 'Zależy od powierzchni, zarośnięcia i ilości odpadów do wywozu. Dodaj zdjęcia działki w formularzu — dostaniesz bezpłatne widełki.'),
            ('Czy potrzebuję zezwolenia na wycinkę drzewa?', 'Zależy od gatunku, obwodu pnia i tego, czy działka należy do osoby prywatnej. W razie wątpliwości podpowiemy, gdzie zapytać w urzędzie gminy.'),
            ('Czy wywozicie gałęzie i trawę?', 'Tak, wywozimy i utylizujemy odpady zielone — możesz to zaznaczyć w wycenie.'),
            ('Czy obsługujecie działki rekreacyjne pod {city_ins}?', 'Tak — działki w mieście i w okolicznych miejscowościach. Przy stałej pielęgnacji ustalamy harmonogram.')
        ]
    }
}

# ---------------------------------------------------------------------------
# Miasta (odległości przybliżone — od bazy w Słupsku)
# ---------------------------------------------------------------------------

CITIES = {
    'slupsk': {
        'name': 'Słupsk', 'in': 'w Słupsku', 'gen': 'Słupska', 'loc': 'Słupsku', 'ins': 'Słupskiem', 'km': 0, 'county': 'powiat słupski, woj. pomorskie',
        'near': ['Kobylnica', 'Redzikowo', 'Siemianice', 'Bierkowo', 'Głobino', 'Włynkówko', 'Strzelinko', 'Krępa Słupska'],
        'areas': ['Zatorze', 'Nadrzecze', 'Westerplatte', 'Stare Miasto', 'Ryczewo'],
        'about': 'Słupsk to nasza baza — stąd wyjeżdżają ekipy RevSerwis. Dzięki temu w mieście i najbliższych gminach dojazd jest najkrótszy, a w pilnych sprawach często przyjeżdżamy jeszcze tego samego dnia.',
        'note': {'przeprowadzki': 'W Słupsku wiele przeprowadzek to bloki bez windy na Zatorzu i Nadrzeczu — liczymy piętra z góry i dobieramy liczbę osób w ekipie, żeby nie przeciągać dnia.',
                 'oproznianie-i-wywoz': 'Z lokali w Słupsku wywozimy odpady bezpośrednio do punktów odbioru w regionie — bez zbędnego magazynowania i dodatkowych kursów.',
                 'transport-rzeczy': 'W Słupsku często odbieramy meble ze sklepów i z ogłoszeń jeszcze w dniu zgłoszenia i wnosimy je od razu na miejsce.',
                 'odsniezanie': 'W Słupsku obsługujemy parkingi sklepów, place firm i podjazdy domów jednorodzinnych — także w Kobylnicy i Redzikowie.',
                 'ogrod-i-dzialka': 'Wokół Słupska jest wiele działek rekreacyjnych i ogródków — koszenie i karczowanie robimy także jako stałą, sezonową usługę.'}
    },
    'ustka': {
        'name': 'Ustka', 'in': 'w Ustce', 'gen': 'Ustki', 'loc': 'Ustce', 'ins': 'Ustką', 'km': 20, 'county': 'powiat słupski, woj. pomorskie',
        'near': ['Przewłoka', 'Orzechowo', 'Wodnica', 'Zimowiska', 'Rowy', 'Dębina', 'Objazda'],
        'areas': ['centrum i okolice portu', 'Przewłoka', 'osiedla przy drodze do Słupska'],
        'about': 'Ustka leży ok. 20 km od naszej bazy w Słupsku, więc dojeżdżamy szybko i bez wysokich kosztów dojazdu. Obsługujemy zarówno mieszkańców, jak i właścicieli apartamentów i pensjonatów.',
        'note': {'przeprowadzki': 'W Ustce sporo zleceń to apartamenty na wynajem i domy letniskowe — przewozimy umeblowanie przed sezonem i po nim.',
                 'oproznianie-i-wywoz': 'Opróżniamy i przygotowujemy do sezonu mieszkania na wynajem w Ustce — razem z wywozem starego wyposażenia.',
                 'transport-rzeczy': 'Do Ustki dowozimy meble i wyposażenie dla apartamentów, pensjonatów i domów — także w stałych trasach dla firm.',
                 'odsniezanie': 'Po sezonie w Ustce zostaje wiele pustych obiektów — odśnieżamy podjazdy i dojścia także pod nieobecność właściciela, z raportem zdjęciowym.',
                 'ogrod-i-dzialka': 'Działki letniskowe w okolicy Ustki i Rowów porządkujemy przed sezonem i po nim, z wywozem odpadów zielonych.'}
    },
    'koszalin': {
        'name': 'Koszalin', 'in': 'w Koszalinie', 'gen': 'Koszalina', 'loc': 'Koszalinie', 'ins': 'Koszalinem', 'km': 70, 'county': 'woj. zachodniopomorskie',
        'near': ['Mielno', 'Sianów', 'Świeszyno', 'Biesiekierz', 'Manowo', 'Będzino'],
        'areas': ['centrum', 'osiedla mieszkaniowe', 'tereny przemysłowe'],
        'about': 'Koszalin obsługujemy z bazy w Słupsku (ok. 70 km) oraz z pomocą zaprzyjaźnionej ekipy w regionie. Zlecenia planujemy tak, żeby jeden wyjazd obejmował cały zakres — bez dopłat za puste kursy.',
        'note': {'przeprowadzki': 'Często realizujemy przeprowadzki na trasie Koszalin – Słupsk i Koszalin – Trójmiasto oraz wyjazdy z Koszalina za granicę.',
                 'oproznianie-i-wywoz': 'W Koszalinie opróżniamy mieszkania, piwnice i lokale firm — przy większych zleceniach planujemy cały dzień pracy ekipy i kilka kursów.',
                 'transport-rzeczy': 'Z Koszalina przewozimy meble i materiały w całej Polsce; łączymy kursy, aby obniżyć koszt dla klienta.',
                 'odsniezanie': 'Dla firm z Koszalina i okolic (Mielno, Sianów) oferujemy abonament Winter Care z ustalonymi godzinami dyżurów.',
                 'ogrod-i-dzialka': 'Porządkujemy działki w Koszalinie i nad morzem (Mielno, Będzino) — także przygotowanie terenu pod sprzedaż lub budowę.'}
    },
    'slawno': {
        'name': 'Sławno', 'in': 'w Sławnie', 'gen': 'Sławna', 'loc': 'Sławnie', 'ins': 'Sławnem', 'km': 30, 'county': 'powiat sławieński, woj. zachodniopomorskie',
        'near': ['Darłowo', 'Postomino', 'Malechowo', 'Warszkowo', 'Żukowo Morskie', 'Jarosławiec'],
        'areas': ['centrum', 'osiedla domów jednorodzinnych', 'okoliczne wsie'],
        'about': 'Sławno jest ok. 30 km od Słupska — to dla nas lokalna trasa. Obsługujemy też Darłowo i gminy Postomino oraz Malechowo.',
        'note': {'przeprowadzki': 'Ze Sławna i Darłowa przewozimy mieszkania i domy w całej Polsce, a także lokalnie — w obrębie powiatu sławieńskiego.',
                 'oproznianie-i-wywoz': 'W Sławnie i okolicach często opróżniamy domy i budynki gospodarcze — razem z wywozem gruzu i złomu.',
                 'transport-rzeczy': 'Do Sławna i Darłowa dowozimy meble, AGD i materiały budowlane — z wniesieniem i pomocą przy rozładunku.',
                 'odsniezanie': 'W Sławnie odśnieżamy podjazdy, parkingi i tereny firm — jednorazowo lub w abonamencie.',
                 'ogrod-i-dzialka': 'Na terenach wiejskich wokół Sławna koszymy i karczujemy większe działki oraz wycinamy drzewa przy budynkach.'}
    },
    'bytow': {
        'name': 'Bytów', 'in': 'w Bytowie', 'gen': 'Bytowa', 'loc': 'Bytowie', 'ins': 'Bytowem', 'km': 70, 'county': 'powiat bytowski, woj. pomorskie',
        'near': ['Tuchomie', 'Borzytuchom', 'Parchowo', 'Studzienice', 'Czarna Dąbrówka', 'Kołczygłowy'],
        'areas': ['centrum', 'osiedla', 'okoliczne miejscowości i jeziora'],
        'about': 'Bytów i powiat bytowski obsługujemy z bazy w Słupsku (ok. 70 km). Większe zlecenia planujemy na cały dzień, żeby dojazd nie podnosił niepotrzebnie ceny.',
        'note': {'przeprowadzki': 'Z Bytowa przeprowadzamy rodziny do Trójmiasta, Słupska i za granicę, a także lokalnie w obrębie powiatu.',
                 'oproznianie-i-wywoz': 'W Bytowie i okolicach opróżniamy domy, strychy i działki rekreacyjne nad jeziorami — z segregacją i utylizacją.',
                 'transport-rzeczy': 'Do Bytowa i okolicznych gmin przewozimy meble, AGD i materiały — z odbiorem ze sklepów w Słupsku i Trójmieście.',
                 'odsniezanie': 'W Bytowie odśnieżamy tereny firm i podjazdy — przy abonamencie ustalamy kolejność i godziny dojazdu.',
                 'ogrod-i-dzialka': 'Wokół Bytowa porządkujemy działki rekreacyjne i siedliska, wycinamy drzewa i usuwamy pnie.'}
    },
    'miastko': {
        'name': 'Miastko', 'in': 'w Miastku', 'gen': 'Miastka', 'loc': 'Miastku', 'ins': 'Miastkiem', 'km': 75, 'county': 'powiat bytowski, woj. pomorskie',
        'near': ['Kępice', 'Trzebielino', 'Kołczygłowy', 'Biały Bór', 'Dretyń'],
        'areas': ['centrum', 'osiedla', 'okoliczne wsie'],
        'about': 'Miastko jest ok. 75 km od Słupska. Dojeżdżamy przez Kępice, więc obsługujemy też tę gminę i Trzebielino. Zlecenia z regionu łączymy w jeden wyjazd.',
        'note': {'przeprowadzki': 'Z Miastka i Kępic przeprowadzamy mieszkania i domy do większych miast i za granicę, z pakowaniem i demontażem mebli.',
                 'oproznianie-i-wywoz': 'W Miastku opróżniamy mieszkania i domy po zmarłych, a także budynki gospodarcze — z pełnym wywozem.',
                 'transport-rzeczy': 'Do Miastka przewozimy meble i AGD z odbiorem ze sklepów w Słupsku, Koszalinie i Trójmieście.',
                 'odsniezanie': 'W Miastku odśnieżamy parkingi i tereny firm w ramach abonamentu sezonowego.',
                 'ogrod-i-dzialka': 'Porządkujemy zarośnięte działki i siedliska wokół Miastka — koszenie, karczowanie i wywóz odpadów zielonych.'}
    }
}

ORDER_SERVICES = list(SERVICES)
ORDER_CITIES = list(CITIES)


def page_name(service, city):
    return f'{service}-{city}.html'


def fill(text, c):
    return text.format(city=c['name'], in_city=c['in'], city_gen=c['gen'], city_loc=c['loc'], city_ins=c['ins'], phone=PHONE)


def _faq_html(faq):
    return '<div class="rv-faq">' + ''.join(f'<details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in faq) + '</div>'


def build_local_page(skey, ckey):
    s, c = SERVICES[skey], CITIES[ckey]
    path = page_name(skey, ckey)
    title = fill(s['title'], c)
    desc = fill(s['desc'], c)
    lead = fill(s['lead'], c)
    quote_href = f'wycena.html?kat={s["kat"]}&amp;miasto={e(c["name"])}'
    wa_text = f'Dzień dobry, pytam o usługę: {s["name"]} — {c["name"]}.'
    dist = 'na miejscu — tu jest nasza baza' if not c['km'] else f'ok. {c["km"]} km od bazy w Słupsku'

    faq = [(fill(q, c), fill(a, c)) for q, a in s['faq']]
    faq.append((f'Czy obsługujecie miejscowości wokół {c["gen"]}?', f'Tak — m.in. {", ".join(c["near"])}. Wpisz adres w formularzu, a policzymy dojazd automatycznie.'))

    hero = f'''<section class="v4-hero v4-hero-sub v6-photo-hero"><div class="v6-hero-media">{photo(s["photo"], "", "v6-hero-img", "100vw", (16, 9), (640, 1000, 1600, 2000), True)}</div><div class="v4-wrap v4-hero-grid">
  <div>
    <nav class="rv-crumbs" aria-label="Okruszki"><a href="index.html">Strona główna</a><span>/</span><a href="{s["hub"]}">{e(s["name"])}</a><span>/</span><span class="text-brand-500">{e(c["name"])}</span></nav>
    <div class="v4-eyebrow"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> {e(c["name"])} · {e(dist)}</div>
    <h1 class="v4-h1">{e(s["h1"])} {e(c["name"])}</h1>
    <p class="v4-hero-lead">{e(lead)}</p>
    <div class="v4-actions"><a class="rv-button" href="{quote_href}">Wyceń online — 30 s <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a><a class="rv-button wa" href="{e(wa(wa_text))}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a><a class="rv-button ghost" href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i> {PHONE}</a></div>
    <a class="v8-hero-rating" href="{GMAPS}" rel="noopener" target="_blank"><b>{str(RATING).replace('.', ',')}</b>{stars(5)}<span>{RATING_COUNT} opinii w Google</span></a>
  </div>
  <aside class="v4-scope"><p class="v4-scope-title"><i class="fa-solid fa-list-check" aria-hidden="true"></i> {e(s["name"])} {e(c["in"])}</p><ul>{"".join(f'<li><i class="fa-solid fa-check" aria-hidden="true"></i>{e(x)}</li>' for x in s["scope"][:6])}</ul><a href="#zakres">Cały zakres usługi</a></aside>
</div></section>'''

    scope = '<div class="v4-services">' + ''.join(f'<a class="v4-service" href="{quote_href}"><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>{e(x)}</span><i class="fa-solid fa-arrow-right go" aria-hidden="true"></i></a>' for x in s['scope']) + '</div>'
    local = (f'<div class="v4-two"><div><p class="v4-lead">{e(c["about"])}</p><p class="v4-lead">{e(c["note"][skey])}</p>'
             f'<p class="v4-lead">Obsługujemy całe miasto ({e(", ".join(c["areas"]))}) oraz okolice: <strong>{e(", ".join(c["near"]))}</strong>. Dłuższe trasy i zlecenia w innych regionach realizujemy w całej Polsce — z własnymi i zaprzyjaźnionymi oddziałami.</p></div>'
             f'<div class="v4-contact-card"><h3>{e(s["name"])} {e(c["name"])} — kontakt</h3><p>Opisz zlecenie i dodaj zdjęcia — widełki cenowe dostaniesz od razu.</p>'
             f'<a href="{quote_href}"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span><small>Wycena online</small>ok. 30 sekund</span></a>'
             f'<a href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i><span><small>Telefon</small>{PHONE}</span></a>'
             f'<a href="{e(wa(wa_text))}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span><small>WhatsApp — wyślij zdjęcia</small>{PHONE}</span></a></div></div>')
    factors = ('<div class="v4-two"><div><p class="v4-lead">Nie publikujemy jednej stawki dla wszystkich — cena zależy od konkretnego zlecenia. Na wycenę wpływa przede wszystkim:</p>'
               '<ul class="v6-checks">' + ''.join(f'<li><i class="fa-solid fa-check" aria-hidden="true"></i>{e(f)}</li>' for f in s['factors']) + '</ul>'
               f'<p class="v4-lead">Widełki z formularza są bezpłatne. Dokładną cenę podajemy po rozmowie albo po płatnych oględzinach na miejscu.</p></div>'
               '<div><ol class="v4-steps">' + ''.join(f'<li><span>{i}</span><p>{e(t)}</p></li>' for i, t in enumerate([
                   'Wybierz usługę, opisz zlecenie i dodaj zdjęcia — zajmie to ok. 30 sekund.',
                   'Od razu dostajesz bezpłatne widełki cenowe; oddzwaniamy, żeby potwierdzić zakres i termin.',
                   f'Przyjeżdżamy {c["in"]} w ustalonym terminie i robimy zdjęcia przed i po.',
                   'Rozliczasz się paragonem lub fakturą VAT.'], 1)) + '</ol></div></div>')

    others_city = ''.join(f'<a href="{page_name(skey, k)}">{e(s["name"])} {e(CITIES[k]["name"])}</a>' for k in ORDER_CITIES if k != ckey)
    others_svc = ''.join(f'<a href="{page_name(k, ckey)}">{e(SERVICES[k]["name"])} {e(c["name"])}</a>' for k in ORDER_SERVICES if k != skey)
    links = f'<div class="v8-local-links"><div><h3>{e(s["name"])} w innych miastach</h3><div class="v8-chips">{others_city}</div></div><div><h3>Inne usługi {e(c["in"])}</h3><div class="v8-chips">{others_svc}</div></div></div>'

    def sec(kicker, title, inner, sid='', cls=''):
        return f'<section class="v4-section {cls}"{f" id={chr(34)}{sid}{chr(34)}" if sid else ""}><div class="v4-wrap"><div class="v4-head"><span class="v4-kicker">{kicker}</span><h2>{title}</h2></div>{inner}</div></section>'

    body = hero
    body += sec('Zakres', f'{e(s["name"])} {e(c["in"])} — co robimy', scope, 'zakres')
    body += sec('Lokalnie', f'{e(c["name"])} i okolice', local, cls='v4-alt')
    body += sec('Cena', 'Od czego zależy cena i jak działamy', factors)
    body += reviews_block(limit=3, offset=ORDER_CITIES.index(ckey) * 3 + ORDER_SERVICES.index(skey), title=f'Opinie klientów RevSerwis', lead='Prawdziwe opinie z naszej wizytówki Google.')
    body += sec('FAQ', f'{e(s["name"])} {e(c["name"])} — pytania', _faq_html(faq))
    body += sec('Zobacz też', 'Usługi w regionie', links, cls='v4-alt')
    body += (f'<section class="v4-section"><div class="v4-wrap"><div class="v4-cta"><div><h2>{e(s["name"])} {e(c["name"])} — wycena w 30 sekund</h2><p>Opisz zlecenie i dodaj do 10 zdjęć. Bezpłatne widełki cenowe pokażemy od razu na ekranie.</p></div>'
             f'<div class="v4-cta-actions"><a class="rv-button" href="{quote_href}">Wyceń zlecenie</a><a class="rv-button wa" href="{e(wa(wa_text))}" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a><a class="rv-button ghost" href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i> {PHONE}</a></div></div></div></section>')

    service_ld = {"@context": "https://schema.org", "@type": "Service", "name": f'{s["name"]} {c["name"]}', "serviceType": s['short'], "description": desc,
                  "url": SITE + path, "provider": {"@id": SITE + "#organization"},
                  "areaServed": [{"@type": "City", "name": c['name']}, *({"@type": "Place", "name": n} for n in c['near'][:5])],
                  "offers": {"@type": "Offer", "url": SITE + 'wycena.html', "description": 'Bezpłatna wycena orientacyjna (widełki cenowe) online'}}
    faq_ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}
    html = page(title, desc, path, body, extra_ld=(service_ld, faq_ld), quote_href=quote_href.replace('&amp;', '&'), wa_text=wa_text,
                crumbs=[(s['name'], s['hub']), (f'{s["name"]} {c["name"]}', path)])
    open(os.path.join(PUB, path), 'w', encoding='utf-8').write(html)
    return path


def local_links_section(skey):
    """Blok „W Twoim mieście” do stron usług (huby)."""
    s = SERVICES[skey]
    chips = ''.join(f'<a href="{page_name(skey, k)}"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>{e(s["name"])} {e(CITIES[k]["name"])}</a>' for k in ORDER_CITIES)
    return (f'<section class="v4-section v8-local" data-local-links><div class="v4-wrap"><div class="v4-head"><span class="v4-kicker">Lokalnie</span><h2>{e(s["name"])} w Twoim mieście</h2>'
            f'<p class="v4-lead">Baza w Słupsku, realizacje w całej Polsce. <a class="v4-link-inline" href="obszar-dzialania.html">Zobacz obszar działania</a>.</p></div><div class="v8-chips">{chips}</div></div></section>')


def build_area_page():
    path = 'obszar-dzialania.html'
    def city_card(ck, c):
        where = 'baza RevSerwis' if not c['km'] else f'ok. {c["km"]} km od Słupska'
        items = ''.join(f'<li><a href="{page_name(sk, ck)}">{e(SERVICES[sk]["name"])} {e(c["name"])}</a></li>' for sk in ORDER_SERVICES)
        return f'<article class="v8-city"><h3><i class="fa-solid fa-location-dot" aria-hidden="true"></i> {e(c["name"])}</h3><p>{e(where)} · {e(c["county"])}</p><ul>{items}</ul></article>'
    grid = ''.join(city_card(ck, c) for ck, c in CITIES.items())
    regions = ['pomorskie', 'zachodniopomorskie', 'kujawsko-pomorskie', 'warmińsko-mazurskie', 'wielkopolskie', 'mazowieckie', 'łódzkie', 'dolnośląskie', 'lubuskie',
               'śląskie', 'małopolskie', 'opolskie', 'podlaskie', 'lubelskie', 'podkarpackie', 'świętokrzyskie']
    main = f'''<section class="v4-hero v4-hero-sub v6-photo-hero"><div class="v6-hero-media">{photo("van", "", "v6-hero-img", "100vw", (16, 9), (640, 1000, 1600, 2000), True)}</div><div class="v4-wrap">
  <nav class="rv-crumbs" aria-label="Okruszki"><a href="index.html">Strona główna</a><span>/</span><span class="text-brand-500">Obszar działania</span></nav>
  <h1 class="v4-h1">Ze Słupska — w całej Polsce.</h1>
  <p class="v4-hero-lead">Bazą RevSerwis jest Słupsk. Zlecenia w całej Polsce realizujemy z własnymi i zaprzyjaźnionymi oddziałami, a przeprowadzki i transport także za granicę. Wpisz adres w wycenie — dojazd policzymy automatycznie.</p>
  <div class="v4-actions"><a class="rv-button" href="wycena.html">Wyceń zlecenie <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a><a class="rv-button ghost" href="tel:{TEL}"><i class="fa-solid fa-phone" aria-hidden="true"></i> {PHONE}</a></div>
</div></section>
<section class="v4-section"><div class="v4-wrap"><div class="v4-head"><span class="v4-kicker">Najbliżej bazy</span><h2>Miasta i usługi lokalne</h2><p class="v4-lead">Główne usługi w miastach, w których jesteśmy najczęściej.</p></div><div class="v8-cities">{grid}</div></div></section>
<section class="v4-section v4-alt"><div class="v4-wrap v4-two"><div><div class="v4-head"><span class="v4-kicker">Cała Polska</span><h2>Sieć oddziałów własnych i partnerskich</h2></div>
  <p class="v4-lead">Zlecenie przyjmuje RevSerwis, a realizuje najbliższa ekipa — nasza albo z zaprzyjaźnionego oddziału działającego według naszych standardów (zdjęcia przed i po, raport, jedna cena). Dzięki temu nie płacisz za długie dojazdy.</p>
  <ul class="v6-checks"><li><i class="fa-solid fa-check" aria-hidden="true"></i>Przeprowadzki i transport między dowolnymi miastami w Polsce</li><li><i class="fa-solid fa-check" aria-hidden="true"></i>Opróżnianie i wywóz — lokalna ekipa, legalna utylizacja</li><li><i class="fa-solid fa-check" aria-hidden="true"></i>Trasy do krajów UE, Skandynawii i Wielkiej Brytanii</li><li><i class="fa-solid fa-check" aria-hidden="true"></i>Jeden kontakt i jedna faktura — także dla firm z wieloma lokalizacjami</li></ul></div>
  <div class="v4-contact-card"><h3>Województwa</h3><p>{e(" · ".join(regions))}</p><p>Nie ma Twojej miejscowości? Wyślij adres — sprawdzimy najbliższą ekipę.</p><a href="wycena.html"><i class="fa-solid fa-route" aria-hidden="true"></i><span><small>Wycena online</small>dojazd liczony automatycznie</span></a></div></div></section>'''
    html = page('Obszar działania RevSerwis — Słupsk, Ustka, Koszalin i cała Polska', 'Baza w Słupsku, realizacje w całej Polsce z oddziałami własnymi i partnerskimi. Przeprowadzki, opróżnianie, transport, odśnieżanie i ogród — Słupsk, Ustka, Koszalin, Sławno, Bytów, Miastko.',
                path, main, crumbs=[('Obszar działania', path)])
    open(os.path.join(PUB, path), 'w', encoding='utf-8').write(html)
    return path


def build_all():
    pages = [build_local_page(s, c) for s in ORDER_SERVICES for c in ORDER_CITIES]
    pages.append(build_area_page())
    return pages
