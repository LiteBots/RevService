# RevSerwis + RevMi 8.0

## Co nowego w 8.0

### Strona — SEO i wyszukiwanie
- **5 głównych usług** na górze strony i w menu: Przeprowadzki (krajowe i międzynarodowe), Opróżnianie i wywóz, Transport rzeczy, Odśnieżanie (RevWinter — już aktywne, bez „wkrótce”), Ogród i działka.
- **30 stron lokalnych** (5 usług × 6 miast: Słupsk, Ustka, Koszalin, Sławno, Bytów, Miastko), np. `przeprowadzki-slupsk.html`, `oproznianie-i-wywoz-koszalin.html`, `odsniezanie-ustka.html`. Każda ma unikalny tytuł i opis, treść o mieście (odległość od bazy, okoliczne miejscowości), zakres, czynniki ceny (bez stawek), FAQ, opinie, okruszki i dane strukturalne (Service, FAQPage, BreadcrumbList) oraz linki do innych miast i usług.
- **Obszar działania: cała Polska** (oddziały własne i zaprzyjaźnione) zamiast listy dwóch województw — `obszar-dzialania.html` generowany, z siatką miast × usług.
- **Opinie z wizytówki Google** (9 × 5★) wyrenderowane w HTML na stronie głównej, w „Opinie i realizacje” i na stronach lokalnych. Lista: `Public/assets/content.json` → `reviews` (po nowych opiniach dopisz je i przebuduj stronę).
- **Favicona dla Google** (koniec z szarym globusem): `/favicon.ico` (16/32/48), `/favicon.svg`, `/favicon-48x48.png`, `/favicon-96x96.png`, `/favicon-192x192.png`, `/apple-touch-icon.png`, `/site.webmanifest` — w katalogu głównym, dozwolone w `robots.txt` (wcześniej ikona była tylko 32 px w `/revmi/`, który jest zablokowany dla robotów). Generator: `npm run favicons`. Google odświeża faviconę zwykle w ciągu kilku dni–tygodni; można przyspieszyć: Search Console → Sprawdzenie adresu URL → strona główna → „Poproś o zindeksowanie”.
- Obrazek do udostępnień 1200×630 (`assets/brand/og-revserwis.png`), dane firmy w stopce i schemacie (Rev Serwis Kacper Taczała, NIP 8393269274, REGON 545866163, Słupsk), polityka prywatności z danymi firmy i nowymi odbiorcami danych (Claude API, OpenStreetMap, bramka SMS).
- Plik weryfikacji Google Search Console skopiowany do `Public/` (wcześniej leżał poza katalogiem strony i nie był serwowany).

### Wycena RevBot (`wycena.html`)
- **Jeden widok, mobile-first:** kafelki usług → 2–4 szybkie pytania → adres/dokąd + termin → opis + **do 10 zdjęć** → imię i telefon. Przycisk „Wyceń z RevBotem” jest zawsze widoczny na dole ekranu, wynik pokazuje się w oknie.
- **Stawki są tylko na serwerze** (`lib/revbot/pricing.js` + panel RevMi → RevBot): 2,5 zł/km, 30 zł/piętro (z windą część stawki), weekend/święto +20% (święta liczone automatycznie, z Wigilią), ciężkie rzeczy (pianino, sejf…), pakowanie, demontaż, utylizacja = koszt firmy + narzut, minimalna marża ponad koszty. Publiczny `ai-services.js` nie zawiera już żadnych cen.
- **Jak liczy:** Claude analizuje każde zdjęcie (spis rzeczy, m³, ciężkie przedmioty, piętra, rodzaje odpadów) → silnik liczy cenę z cennika → łączy z propozycją AI → koryguje współczynnikiem z historii (ile firma faktycznie brała za podobne zlecenia). Odległość: OpenStreetMap + OSRM (fallback: linia prosta × 1,3).
- **Uczy się sam:** po każdym zakończonym zleceniu porównuje wycenę z ceną końcową i kosztami, zapisuje wniosek w pamięci (Claude go uogólnia); korekty ceny przez administratora też trafiają do pamięci. Raz w tygodniu sprawdza w internecie aktualne ceny utylizacji i usług (narzędzie web search Claude API). Administrator dopisuje własne reguły.
- Klient widzi tylko widełki i ogólne uwagi; administrator w RevMi — rozbicie ceny, koszty, zysk, spis rzeczy i analizę zdjęć.

### Panel RevMi 8.0
- **Oddziały** — osobna ekipa, bus, zlecenia i statystyki. Zlecenia nigdy nie trafiają do oddziału automatycznie (przypisuje administrator). Pracownik oddziału loguje się swoim PIN-em i widzi tylko zlecenia swojego oddziału (bez surowych zgłoszeń i cen RevBota). Lista sprzętu oddziału trafia na checklistę „Sprzęt przed wyjazdem” — bez odhaczenia pracownik nie rozpocznie zlecenia.
- **Zakończenie zlecenia = raport** (wygodny na telefonie): zdjęcia przed/po (min. 1, w oddziale — ustawiana liczba), koszty paliwa, materiałów, utylizacji i inne (0 lub kwota — trafiają do kosztów firmy), godziny, pobrana kwota, uwagi, a na końcu **zgoda osoby zamykającej na SMS do klienta z linkiem do opinii Google** (SMSAPI; bez bramki — gotowy SMS w telefonie).
- **Rozliczenia** — wypłaty, premie, zaliczki i potrącenia wszystkich pracowników ze wszystkich oddziałów; sumują się do „Rozliczono”, które zapisuje wypłatę jako koszt firmy (statystyki i podatek aktualizują się od razu). Szybkie naliczenie za zlecenie wg stawek pracowników.
- **Statystyki** — przychód, koszty (w tym koszty zleceń i wypłaty), zysk, marża, **podatek 12% (zasady ogólne, z progiem 120 000 zł → 32%, narastająco)**, oddziały, zespół, usługi z marżą, trafność RevBota, konwersja wycen, prośby o opinię.
- **RevBot** — ukryty cennik do edycji, symulacja wyceny, pamięć (reguły / wnioski / wiedza z internetu / korekty), „Zapytaj RevBota”, ręczne odświeżenie wiedzy rynkowej.
- **Właściciel w zespole** — główny PIN ma profil pracownika (Gracjan), więc można go dopisywać do zleceń, oddziałów i rozliczeń.
- **Duży notatnik** — edytor na cały ekran z autozapisem, kolorami, przypinaniem, listą zadań, tagami i przypomnieniem.
- Usunięte z menu: Oferty, Abonamenty, Cennik (dane w bazie zostają). Nowe: Oddziały, Rozliczenia, Statystyki, RevBot. Odświeżony wygląd i większe przyciski na telefonie.

### Wdrożenie 8.0 (Railway)
1. Wgraj pliki (nadpisz). Bez nowych paczek npm i bez ręcznej migracji — profil właściciela i nowe kolekcje (`branches`, `taskmedias`, `payentries`, `revbotmemories`) tworzą się same.
2. Variables (opcjonalne): `SMSAPI_TOKEN`, `SMS_SENDER` (SMS z prośbą o opinię), `REVBOT_RESEARCH=false` (wyłącza cotygodniowe szukanie cen w internecie), `GEO_DISABLED=true` (bez OpenStreetMap). Pełna lista: `.env.example`.
3. Wyszukiwanie w internecie wymaga włączonego narzędzia web search dla organizacji w konsoli Anthropic.
4. Po wdrożeniu: RevMi → Ustawienia → wklej **link do opinii** z Profilu Firmy w Google („Poproś o opinie”), sprawdź parametry w **RevBot**, utwórz pierwszy **Oddział**.
5. Cache PWA: `revmi-8.0.0` — telefony pobiorą nową wersję same.
6. Przebudowa strony po zmianach treści: `npm run site` (Python 3.9+), ikony: `npm run favicons`.

---

## Wersja 7.0

## Co nowego w 7.0

### Wycena AI wszystkich usług (`wycena.html`)
- Nowy formularz krok po kroku w stylu strony: **usługi (można kilka) → szczegóły każdej usługi → lokalizacja → opis i do 6 zdjęć → termin → kontakt → wycena**.
- 21 usług RevSerwis z własnymi pytaniami (piętra, winda, m², ilość m³, wysokość drzew, materiał, pilność…). Katalog i stawki bazowe są w jednym pliku: **`Public/assets/ai-services.js`** (strona i serwer).
- Po wysłaniu zgłoszenie **od razu trafia do panelu (Wyceny)**, a serwer wycenia je przez **Claude API (Anthropic)**: model dostaje odpowiedzi klienta, opis, zdjęcia, stawki bazowe RevSerwis i aktywny **Cennik** z panelu. Klient widzi widełki, pewność wyceny, obserwacje ze zdjęć, czynniki ceny i pytania — z wyraźną informacją, że **to cena wstępna, a nie ostateczna**.
- Zdjęcia są pomniejszane w przeglądarce (JPEG 1600 px), na serwerze ponownie przetwarzane przez `sharp`; do AI trafiają w 1024 px.
- **Bez klucza Claude API, po przekroczeniu limitu dziennego albo przy błędzie API** formularz nadal działa — liczy widełki ze stawek katalogu (w panelu widać „Wycena automatyczna (bez AI)” i powód).
- Ponowne wysłanie tego samego zgłoszenia (np. słaby internet) zwraca tę samą wycenę — bez duplikatów i bez drugiego zapytania do AI.
- Linki z całej strony działają dalej: `wycena.html?kat=ogrod`, `?dzial=revgarden&zakres=Wycinka drzew`, `?rodzaj=ogledziny`, stare `?usluga=`.
- Poprzedni kreator został jako zapasowy: `wycena-klasyczna.html` (noindex, wysyła na `/api/quotes` jak wcześniej).

### Panel RevMi
- **Wyceny:** na karcie zgłoszenia plakietka „AI: 1 500 – 2 100 zł”. W szczegółach sekcja **Wycena AI**: widełki, pozycje dla każdej usługi, **sugerowana ekipa, pojazd, czas pracy, uwagi i ryzyka** (tylko dla admina), obserwacje, pytania do klienta, porównanie ze stawkami bazowymi. Przyciski **„Wyceń wg widełek”** (wypełnia cenę od–do) i **„Wyceń ponownie”**.
- **Magazyn:** miejsca w magazynie (boksy, regały, strefy, kontenery) z **pojemnością w m³**, pasek **zajętości całego magazynu** i każdego miejsca, **wolne m³**, rzeczy bez przypisanego miejsca, filtr po miejscu, **zdjęcia rzeczy klienta** (do 12 na pozycję), ostrzeżenie przy przekroczeniu pojemności.
- **Sortownia (nowa zakładka, także dla pracowników):** pojemniki / frakcje odpadów (złom, drewno, gruz, elektroodpady…) z jednostką (kg / szt. / m³), pojemnością i progiem ostrzeżenia. **Dodawanie do sortowania** z ilością, wagą, liczbą sztuk, opisem, zdjęciami i powiązaniem ze zleceniem; **opróżnianie** (dokąd, przychód ze skupu / koszt utylizacji), **korekta stanu**, historia ruchów, wartość surowców. Status „Jest miejsce / Wkrótce opróżnić / Opróżnij” i **push do adminów**, gdy pojemnik się zapełnia. Szybkie dodawanie z przycisku „+” na telefonie.
- Push i Discord o nowej wycenie pokazują widełki AI.

### Wdrożenie 7.0 (Railway)
1. Wgraj pliki (nadpisz). Nowe: `Public/assets/ai-services.js`, `Public/assets/quote-ai.js`, `Public/wycena-klasyczna.html`, `Public/revmi/app-ops.js`, `lib/ai-quote-input.js`, `src/services/ai-quote.js`, `src/routes/ops.js`, `tests/ai-quote.test.js`, `tests/ops.test.js`, `.env.example`.
2. **Variables:** dodaj `ANTHROPIC_API_KEY` (klucz z platform.claude.com → API keys; konto musi mieć doładowane środki). Opcjonalnie `ANTHROPIC_MODEL` (domyślnie `claude-sonnet-5-5` — dobry balans jakości i ceny; taniej: `claude-haiku-5-5`, dokładniej: `claude-opus-5-5`), `AI_DAILY_LIMIT` (domyślnie 200 wycen AI na dobę).
3. Bez nowych paczek npm i bez migracji bazy — nowe kolekcje (`storageunits`, `sortingbins`, `sortingentries`) tworzą się same.
4. Po wdrożeniu: `https://www.revserwis.pl/api/health` pokazuje `"ai": "claude-sonnet-5-5"` (albo `"fallback"`, gdy brak klucza). W panelu: Magazyn → **Dodaj miejsce** (boksy z m³), Sortownia → **Nowy pojemnik**. Warto uzupełnić **Cennik** — AI bierze go pod uwagę.
5. Panel ma nową wersję cache PWA (`revmi-7.0.0`) — telefony pobiorą ją same po odświeżeniu.

> Klucz Claude API jest tylko na serwerze (Railway Variables) — nigdy nie trafia do przeglądarki. Formularz ma limit 6 zgłoszeń / 15 min z jednego adresu i dzienny limit wycen AI.

---

## Co nowego w 6.0

### Wygląd — ciemny motyw z logo (czarny + miętowy) i zdjęcia
- Strona i panel RevMi wróciły do ciemnej kolorystyki logo (`#03F0BE` na czarnym), w czytelniejszej wersji: większe teksty, mocniejszy kontrast, prostsze sekcje.
- **Zdjęcia**: nagłówek strony głównej, kafelki usług, nagłówki wszystkich 17 działów, „Wszystkie usługi”, kontakt i sekcja dla firm. Zdjęcia pochodzą z **Unsplash** (darmowa licencja Unsplash, można używać komercyjnie) i są ładowane z `images.unsplash.com` w rozmiarze dopasowanym do ekranu (`srcset`). CSP w `src/app.js` dopuszcza ten adres.
- Lista zdjęć (id + autor) jest w `lib/divisions.json` → `photos`; przypisanie do działów — pole `photo` w każdym dziale, do kafelków — `categories[].photo`. Aby podmienić zdjęcie na własne z realizacji, wgraj plik np. do `Public/assets/photos/` i zmień funkcję `photo_url` w `scripts/site-generator/common.py` (albo podmień id na inne zdjęcie z Unsplash) i przebuduj stronę.

### Prostsza nawigacja — klient nie musi znać nazw działów
- Strona główna: duży nagłówek ze zdjęciem i jednym przyciskiem „Wyceń zlecenie”, a pod nim **„Czego potrzebujesz?”** — 11 kafelków ze zdjęciami w języku klienta (Przeprowadzka, Transport rzeczy, Motocykl lub quad, Opróżnianie i wywóz, Sprzątanie, Ogród i działka, Rozbiórki i skuwanie, Przechowanie rzeczy, Przewóz osób, Dla firm i obiektów, Odśnieżanie) + „Coś innego?”.
- Menu „Usługi” pokazuje te same kategorie ze zdjęciami; pełna lista 17 działów jest w `uslugi.html`. Działy (RevHome, RevGarden…) zostały — są przypisywane automatycznie na podstawie odpowiedzi klienta.
- Kategorie i ich opcje: `lib/divisions.json` → `categories` (każda opcja wskazuje dział i zakres).

### Kreator wyceny krok po kroku (`wycena.html`)
- Pełny ekran, **jedno pytanie na ekranie**: usługa → co dokładnie → kilka prostych pytań (adres, wielkość, piętra…) → kiedy → opis i zdjęcia → rodzaj wyceny (bezpłatne widełki / płatna z dojazdem) → telefon → wyślij.
- Wybór kafelka od razu przechodzi dalej, każde pytanie szczegółowe można pominąć, pasek postępu „Krok X z Y”, przycisk **Wstecz** (działa też przycisk wstecz w telefonie/przeglądarce), podsumowanie przed wysłaniem.
- Linki: `wycena.html?kat=ogrod`, `wycena.html?dzial=revgarden&zakres=Wycinka drzew`, `wycena.html?rodzaj=ogledziny`, `wycena.html?kat=inne`; stare `?usluga=` nadal działają.
- Zgłoszenie trafia do panelu tak jak wcześniej (`POST /api/quotes`), dodatkowo z polami „Kategoria” i „Wybrana opcja”.

## Zasady wyceny (od 5.0)

- **Bezpłatna wycena = zawsze widełki cenowe** (od–do) na podstawie opisu i zdjęć — bez dojazdu i bez zobowiązań.
- **Rzetelna, dokładna wycena jest płatna i wymaga dojazdu na miejsce** (oględziny). Koszt wizyty podajemy przy umawianiu — na stronie nie ma kwoty.
- Sekcja „Dwa sposoby wyceny” na stronie głównej, w cenniku (`cennik.html#wycena`) i na stronie wyceny; zmienione teksty przycisków, FAQ i pasków CTA.
- Formularz wyceny ma wybór **Rodzaj wyceny** (bezpłatne widełki / płatna z dojazdem). Link bezpośredni: `wycena.html?rodzaj=ogledziny` lub `?rodzaj=widelki`.
- Zgłoszenie zapisuje pole `quoteType` (`free` / `onsite`). W panelu: plakietka „Z dojazdem” na liście, opis w szczegółach wyceny, pole w formularzu zlecenia, kolumna w eksporcie CSV, osobny tytuł powiadomienia push („📍 Wycena z dojazdem”). Nazwa zlecenia zaczyna się od „Oględziny:”.

---

## Co nowego w 4.0

### Strona — 17 działów
RevSerwis jest podzielony na działy. Każdy ma własną podstronę (`/revhome.html`, `/revbud.html`, …) z zakresem usług, produktem, procesem, FAQ, danymi strukturalnymi (Service + FAQPage) i przyciskami wyceny / WhatsApp.

| Grupa | Działy |
|---|---|
| Dom i mieszkanie | RevHome, RevClean, RevStorage, RevMoto, RevAssist |
| Budowa, teren i ogród | RevBud, RevGarden, RevSite, RevWinter (wkrótce) |
| Transport | RevCargo, RevEvent (RevTours) |
| Firmy i obiekty | RevFacility, RevB2B, RevOffice, RevShop, RevWarehouse, RevHotel |

- **Nowa strona główna** w tej samej kolorystyce, spokojniejsza typografia: wyszukiwarka „Czego potrzebujesz?”, siatka działów z filtrami, abonamenty (RevFacility, Winter Care, RevB2B), produkty „Mieszkanie pod wynajem od A do Z” i „RevStorage: odbieramy → przewozimy → magazynujemy”, paski RevAssist i RevMoto, proces, obszar, FAQ.
- **`uslugi.html`** — wszystkie działy i usługi z wyszukiwarką.
- **Formularz wyceny** — wybór działu → zakres (kilka usług naraz) → pola dopasowane do działu. Linki `wycena.html?dzial=revgarden&zakres=Wycinka drzew`. Stare linki `?usluga=` nadal działają.
- **Formularz kontaktowy** (`kontakt.html`) — osobny od wyceny, dla osób prywatnych i firm (nazwa, NIP), temat i dział. Wiadomość trafia do panelu (Wiadomości), jako push do administratorów, na Discord i **na e-mail kontakt@revserwis.pl**. Linki: `kontakt.html?temat=winter|facility|b2b|storage`.
- Przekierowania 301: `transport-motocykli` → RevMoto, `magazynowanie-mienia` → RevStorage, `stale-dostawy-dla-firm` → RevCargo, `trasy-dla-hoteli-i-pensjonatow` → RevHotel, `dla-firm` → RevB2B. Pozostałe szczegółowe podstrony zostały i mają odnośnik do swojego działu.
- Katalog działów jest w jednym pliku: **`lib/divisions.json`** (serwer, strona i panel). Po zmianie: `npm run build` (generuje `Public/assets/divisions.js`), a podstrony odświeżysz generatorem: `python3 scripts/site-generator/build_site.py` (Python 3.9+, bez zależności).

### Panel RevMi 4.0 (komputer + PWA na telefonie)
- **Notatnik** (MongoDB, kolekcja `padnotes`) — notatki prywatne i zespołowe, kolory, tagi, przypinanie, listy zadań z odhaczaniem, archiwum, wyszukiwanie, szybka notatka jednym Enterem, **przypomnienie push o wybranej godzinie**. Dostępny dla pracowników i adminów, w dolnym pasku na telefonie.
- **Wiadomości** — skrzynka formularza kontaktowego: statusy, odpowiedź e-mailem (gotowy temat i cytat), telefon, WhatsApp, „Utwórz wycenę”, „Zapisz klienta w CRM”, „Oferta”, „Do notatnika”, notatka wewnętrzna, status wysyłki e-mail i ponowienie.
- **Oferty** — kosztorys z pozycjami, jednostkami, VAT 0/5/8/23 %, rabatem i sumami; numeracja `OF/2026/10/001`; dokument z danymi firmy, **wydruk / PDF**, wysyłka e-mailem lub na WhatsApp, duplikowanie, akceptacja → zlecenie.
- **Cennik** — stawki usług wg działów, wstawiane do ofert jednym kliknięciem.
- **Abonamenty** — miesięczne umowy (RevFacility, Winter Care, B2B): MRR, dzień rozliczenia, „Rozlicz” (zapis przychodu + kolejny termin), push 3 dni przed rozliczeniem.
- **Magazyn RevStorage** — przyjęcia, miejsce, m³, spis rzeczy, opłata miesięczna, wydanie, push 7 dni przed końcem przechowania.
- **Działy** — wyniki każdego działu w miesiącu, otwarte zlecenia, szybkie zlecenie/oferta w dziale. Zlecenia mają pole **Dział** (z wyceny ustawia się samo) i filtr działu na liście.
- **Raporty** — rok: przychody/koszty/zysk wg miesięcy, działy (przychód, skuteczność wycen, MRR), źródła zleceń, najlepsi klienci, tematy wiadomości, eksport CSV.
- **Wyszukiwarka Ctrl+K** — zlecenia, notatki, klienci, wiadomości, oferty, abonamenty, magazyn + szybkie akcje.
- **Szybkie dodawanie** — przycisk „+” na telefonie: zlecenie, notatka, oferta, koszt, abonament, magazyn.
- **Pulpit** — nowe kafelki (wiadomości, MRR, magazyn, notatki), wyniki działów, wiadomości, abonamenty do rozliczenia, koniec przechowania, przypięte notatki.
- **Ustawienia** — dane firmy na ofertach (NIP, adres, konto), domyślne warunki oferty, powiadomienia o wiadomościach i przypomnieniach biznesowych, automatyczne potwierdzenie e-mail dla klienta.
- **PWA** — nowe skróty (Notatnik, Wiadomości), push z przyciskami „Otwórz wiadomość / notatkę”, cache `revmi-4.0.0`.

### E-mail z formularza kontaktowego — konfiguracja (Railway → Variables)
Wiadomości zawsze zapisują się w panelu. Aby trafiały też na **kontakt@revserwis.pl**, ustaw jeden z wariantów:

1. **Resend (polecane)** — działa przez HTTPS na każdym planie Railway. Załóż konto na resend.com, dodaj i zweryfikuj domenę `revserwis.pl` (rekordy DNS), utwórz klucz API i ustaw `RESEND_API_KEY`. Nadawca: `MAIL_FROM=RevSerwis <kontakt@revserwis.pl>`.
2. **SMTP** — dane skrzynki z hostingu domeny: `SMTP_HOST`, `SMTP_PORT` (465), `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASS`. Uwaga: część planów Railway blokuje wychodzący SMTP — wtedy użyj Resend.

Opcjonalnie: `CONTACT_EMAIL` (domyślnie kontakt@revserwis.pl), `PUBLIC_URL` (link do panelu w e-mailu). E-maile wysyła kolejka z ponawianiem; „Odpowiedz” w mailu trafia bezpośrednio do klienta (Reply-To).

### Wdrożenie 4.0
> **4.0.1:** style i skrypty strony mają w nazwie hash treści (np. `assets/site.ddc468ec.css`), a strony HTML są wysyłane z `Cache-Control: no-cache`. Po wdrożeniu przeglądarka i CDN zawsze pobiorą nowe pliki — nie zobaczysz już nowej strony ze starym CSS. Wgrywaj **cały folder `Public/assets/`** (razem z plikami z hashem). Generator (`scripts/site-generator/build_site.py`) sam tworzy nowe nazwy przy każdej zmianie.

1. Wgraj pliki (nadpisz), usuń z repozytorium: `Public/transport-motocykli.html`, `Public/magazynowanie-mienia.html`, `Public/stale-dostawy-dla-firm.html`, `Public/trasy-dla-hoteli-i-pensjonatow.html`, `Public/dla-firm.html` (adresy przekierowują się same).
2. `npm install` (nowa paczka **nodemailer**) i commit `package-lock.json`.
3. Ustaw zmienne poczty (powyżej). Bez migracji bazy — nowe kolekcje tworzą się same.
4. Po wdrożeniu w panelu: Ustawienia → uzupełnij dane firmy (NIP, adres, konto) do ofert.

---

## Wersja 3.1


**Nowe usługi — każda ma własną podstronę, pola w formularzu wyceny i wpis w sitemap:**

| Usługa | Podstrona | `?usluga=` |
|---|---|---|
| Rozbiórki i wyburzenia (wiaty, altany, szopy, blaszaki) | `rozbiorki-i-wyburzenia.html` | `rozbiorki` |
| Wycinka drzew i krzewów | `wycinka-drzew-i-krzewow.html` | `wycinka` |
| Usuwanie pni i korzeni | `usuwanie-pni-i-korzeni.html` | `pnie` |
| Prace ziemne i koparkowe | `prace-ziemne-i-koparkowe.html` | `ziemne` |
| Porządkowanie działek i posesji | `porzadkowanie-dzialek-i-posesji.html` | `dzialki` |
| Przygotowanie nieruchomości do sprzedaży | `przygotowanie-nieruchomosci-do-sprzedazy.html` | `sprzedaz` |
| Czyszczenie hal i garaży | `czyszczenie-hal-i-garazy.html` | `hale` |
| Magazynowanie mienia | `magazynowanie-mienia.html` | `magazyn` |
| **Nowość:** transport motocykli, quadów i skuterów | `transport-motocykli.html` | `moto` |
| Stałe dostawy dla firm | `stale-dostawy-dla-firm.html` | `dostawy` |
| Stałe trasy dla hoteli i pensjonatów | `trasy-dla-hoteli-i-pensjonatow.html` | `hotele` |

**Strona główna:** pasek „Nowość” w hero, skróty „Czego potrzebujesz?”, siatka 18 usług z filtrami kategorii, baner transportu jednośladów, sekcja „Przygotowanie do sprzedaży”, „Wszystko z jednej ręki” (połączenia usług), odświeżona sekcja B2B (dostawy, hotele, hale), karta sprzętu na posesję i nowe pytania FAQ.

**Wszystkie strony:** mega-menu „Usługi” w 4 kategoriach, pogrupowane menu mobilne, nowa stopka (Transport / Nieruchomości i posesje / Firma / Kontakt). Nowe podstrony mają dane strukturalne Service + FAQPage. Uzupełnione `dla-firm.html` i `cennik.html`.

**Formularz wyceny:** 18 usług w kategoriach, osobne pola dla każdej nowej usługi (np. wysokość drzew, średnica pni, rodzaj pojazdu i stan techniczny). Backend (`/api/quotes`) bez zmian — nowe usługi trafiają do panelu jako zwykłe wyceny.

**WhatsApp i Instagram:** pływający przycisk „Napisz na WhatsApp” (komputer), przycisk WhatsApp w dolnym pasku na telefonie, ikona w nagłówku i menu mobilnym, WhatsApp na podstronach usług (z gotową wiadomością o danej usłudze), w formularzu wyceny i na stronie Kontakt. Instagram [@revserwis_](https://www.instagram.com/revserwis_/) w stopce, na stronie Kontakt, w hero i w danych strukturalnych (`sameAs`). Numer WhatsApp: 735 396 534 (`wa.me/48735396534`).

**Panel RevMi:** nowe usługi na liście typów zleceń, wersja cache PWA `revmi-3.1.0`.

**Wdrożenie:** wgraj pliki jak zwykle — bez nowych zmiennych i bez migracji bazy. Po dodaniu klas w HTML uruchom `npm run build:css`.

---

## Wersja 3.0

Strona firmowa **revserwis.pl** oraz panel **RevMi** (zlecenia, wyceny, kalendarz, ekipa, flota, finanse) działający na komputerze i jako **aplikacja PWA na telefonie** z powiadomieniami push.

Hosting: **Railway** (Node 22) + istniejąca baza **MongoDB**. Nowa wersja jest zgodna z danymi, które już są w bazie (zlecenia, pracownicy, klienci, finanse) — nic nie trzeba migrować ręcznie.

---

## Co nowego

**Panel RevMi (`/revmi/`)**
- Nowy wygląd: na komputerze klasyczny panel z menu bocznym, na telefonie aplikacja z dolnym paskiem zakładek.
- Pulpit z KPI, planem na dziś i tydzień, nowymi wycenami, alertami (zlecenia bez ekipy, nieopłacone, terminy floty) i wykresem 6 miesięcy.
- Zlecenia: lista dzień po dniu albo tablica (kanban z przeciąganiem), filtry, wyszukiwarka, eksport CSV.
- Szczegóły zlecenia: zadzwoń / SMS / nawiguj, ekipa, pojazd, zdjęcia z formularza, **checklista**, **notatki ekipy**, historia zmian, duplikowanie, zapis klienta do CRM.
- Wyceny: skrzynka zgłoszeń z formularza + szybkie akcje „Wyceń” / „Zaplanuj” / „Odrzuć”.
- Przypisywanie **wielu pracowników** do zlecenia oraz pojazdu z floty.
- Kalendarz miesięczny (na telefonie z kropkami i listą dnia).
- Klienci (historia zleceń), Finanse (miesiące, operacje, struktura kosztów, oznaczanie płatności), Zespół (PIN, uprawnienia, urządzenia z pushami, powiadomienie do ekipy), Flota (OC, przegląd, serwis z alertami).
- Konto pracownika: widzi „Mój plan”, swoje zlecenia, może rozpocząć/zakończyć zlecenie, odhaczać checklistę i dodawać notatki.

**Powiadomienia push (z logo RevSerwis)**

| Zdarzenie | Kto dostaje |
|---|---|
| Nowa wycena z formularza na stronie | administratorzy |
| Nowe zlecenie w planie (dodane w panelu lub zaakceptowana wycena) | wszyscy w zespole |
| Przypisanie do zlecenia | przypisana osoba |
| Przypomnienie **3 dni** przed zleceniem | osoby przypisane do zlecenia |
| Przypomnienie **24 h** przed zleceniem | osoby przypisane do zlecenia |
| Pracownik rozpoczął/zakończył zlecenie | administratorzy |

Zasady (godziny przypomnień, statusy, kopie do admina) zmienisz w **Ustawieniach** panelu. Zlecenie bez ekipy → przypomnienie trafia do administratorów. Zmiana terminu zlecenia resetuje przypomnienia.

**Strona**
- Wspólny nagłówek z menu „Usługi”, nowa stopka, pasek „Zadzwoń / Wyceń” na telefonie.
- Nowy formularz wyceny (usługa → szczegóły → zdjęcia → kontakt) na `wycena.html` i stronie głównej.
- Odtworzone `wycena.html` i `transport.html`, strona 404, sitemap, dane strukturalne (LocalBusiness, FAQ).
- Style i skrypty w jednym miejscu (`assets/site.css`, `assets/site.js`) zamiast kopii w każdym pliku.

---

## Wdrożenie na Railway

1. Skopiuj zawartość tej paczki **do obecnego repozytorium** i nadpisz pliki — także `Public/assets/tailwind.css` (to nowy, samodzielny plik klas; strona nie potrzebuje już instalacji Tailwinda).
2. Usuń stare pliki: `Public/revmi.html`, `Public/testowe.html` (to strona Modulio), `Public/assets/enhancements.css`, `tailwind.config.js`, `styles.css`.
3. Wygeneruj lockfile: `npm install` (doszła paczka `web-push`) i commitnij `package-lock.json`.
4. Zmienne w Railway → Service → **Variables**:

| Zmienna | Wymagana | Opis |
|---|---|---|
| `MONGO_URL` | tak | już ustawiona (albo `MONGO_URI`) |
| `SESSION_SECRET` | tak | długi losowy ciąg |
| `ADMIN_PIN` | tak | główny PIN administratora (4–8 cyfr) |
| `NODE_ENV` | tak | `production` |
| `ADMIN_NAME` | nie | nazwa głównego admina (domyślnie Gracjan Błachnio) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | nie | klucze push; bez nich serwer sam je wygeneruje i zapisze w MongoDB |
| `VAPID_SUBJECT` | nie | domyślnie `mailto:kontakt@revserwis.pl` |
| `DISCORD_WEBHOOK_URL` | nie | dotychczasowe powiadomienie na Discordzie nadal działa |
| `TZ` | nie | domyślnie `Europe/Warsaw` |
| `ANTHROPIC_API_KEY` | nie (7.0) | wycena AI przez Claude API; bez klucza widełki liczone ze stawek katalogu |
| `ANTHROPIC_MODEL` | nie (7.0) | domyślnie `claude-sonnet-5-5` |
| `AI_DAILY_LIMIT` | nie (7.0) | maks. wycen AI na dobę, domyślnie 200 (0 = bez limitu) |

5. Push → Railway sam uruchomi `npm run build` (klasy CSS + ikony z `assets-src/logo.png`) i `npm start`.

> Dodajesz nowe klasy w HTML (np. `mt-10`, `text-brand-400`)? Uruchom `npm run build:css` — skrypt `scripts/build-utilities.js` przeskanuje strony i dopisze brakujące reguły do `Public/assets/tailwind.css`.
6. Wejdź na `https://www.revserwis.pl/revmi/`, zaloguj się i w **Powiadomienia** kliknij „Włącz powiadomienia”, potem „Wyślij test”.

> Powiadomienia push wymagają HTTPS — na Railway i Twojej domenie działa to automatycznie.

## Instalacja aplikacji na telefonie

- **Android (Chrome):** otwórz `revserwis.pl/revmi`, zaloguj się → menu ⋮ → „Zainstaluj aplikację” (albo przycisk „Zainstaluj” w zakładce Więcej) → w aplikacji: Powiadomienia → Włącz.
- **iPhone (iOS 16.4+):** otwórz w **Safari** → Udostępnij → „Do ekranu początkowego” → uruchom RevMi z ikony → Powiadomienia → Włącz. Na iPhonie push działa tylko w aplikacji dodanej do ekranu.
- Każdy pracownik loguje się **swoim PIN-em** (nadasz go w Zespół → Dodaj pracownika). Wylogowanie wyłącza pushe na danym urządzeniu.

## Uruchomienie lokalnie

```bash
npm install
cp .env.example .env   # uzupełnij MONGO_URL itd.
node --env-file=.env server.js
npm test
```

## Struktura

```
server.js                start: MongoDB, migracje, push, harmonogram przypomnień
src/app.js               Express (CORS, CSP, sesje, trasy, pliki statyczne)
src/config.js            zmienne środowiskowe
src/models.js            schematy Mongoose (zgodne ze starymi danymi)
src/routes/*.js          API: auth, public (wyceny, wycena AI, kontakt), tasks, resources, dashboard, notifications, ops (miejsca w magazynie, sortownia, ponowna wycena AI),
                         notes (notatnik), messages (wiadomości), business (oferty, abonamenty, magazyn, cennik, raporty, szukaj)
src/services/mail.js     e-mail z formularza kontaktowego (Resend / SMTP, kolejka z ponawianiem)
src/services/business-reminders.js  push: notatki, abonamenty, koniec przechowania
lib/divisions.json       katalog 17 działów (jedno źródło dla serwera, strony i panelu)
lib/contact-input.js     walidacja formularza kontaktowego
scripts/site-generator/  generator podstron działów, strony głównej, kontaktu i sitemap (Python)
src/services/push.js     Web Push + klucze VAPID
src/services/notify.js   kto dostaje które powiadomienie
src/services/reminders.js przypomnienia 3 dni / 24 h (co minutę, bezpieczne przy kilku instancjach)
lib/quote-input.js       walidacja formularza wyceny i zdjęć
lib/ai-quote-input.js    walidacja formularza „Wycena AI”
src/services/ai-quote.js wycena przez Claude API + zapasowa wycena z katalogu
Public/assets/ai-services.js  katalog usług i stawek bazowych (strona + serwer)
Public/                  strona WWW
Public/revmi/            panel PWA (index.html, app-*.js, app.css, sw.js, manifest, ikony)
assets-src/logo.png      logo, z którego generowane są ikony aplikacji
scripts/                 build, klasy CSS, ikony, klucze VAPID
tests/                   testy (node --test)
```


## Treści „Realizacje” i „Opinie”

Uzupełnij `Public/assets/content.json` — sekcje pojawią się automatycznie:

```json
{
  "projects": [{ "title": "Przeprowadzka 3 pokoi", "category": "Przeprowadzki", "city": "Słupsk", "description": "…", "image": "assets/realizacje/1.jpg" }],
  "reviews": [{ "author": "Anna", "text": "Szybko i sprawnie!", "rating": 5, "source": "Google" }],
  "company": { "name": "RevSerwis …", "address": "…", "nip": "…" }
}
```
