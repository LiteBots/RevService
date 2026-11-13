# RevSerwis 12.0 — lista ulepszeń (co zrobione, co dalej)

Priorytet: **Słupsk i okolice** (baza), potem reszta Pomorza.
Legenda: ✅ zrobione w tej paczce · 🔜 do zrobienia (kolejność = priorytet)

---

## 1. Lokalne SEO — osobne, różne podstrony dla miast i usług

### ✅ Zrobione
- **30 miast** z własnymi danymi (`scripts/site-generator/cities.py`): odmiana nazwy, odległość i czas dojazdu ze Słupska, powiat, osiedla i dzielnice, okoliczne miejscowości, typ zabudowy, cechy miasta (morze, aglomeracja, jeziora, studenci, przemysł…).
- **8 usług** (`local_services.py`): przeprowadzki, opróżnianie i wywóz, transport rzeczy, odśnieżanie, ogród i działka, **wycinka drzew** (nowa), **sprzątanie** (nowa), **mycie ciśnieniowe** (nowa).
- **163 strony usługa × miasto + 30 hubów miast** (`uslugi-{miasto}.html`) + nowy „Obszar działania”.
- **Strony nie są kopiami 1:1:**
  - 5 różnych układów (A: klasyczny, B: fakty + tabela, C: przewodnik ze spisem treści, D: kroki + szybki wybór, E: porównanie wariantów) + **osobny, najbogatszy układ Słupska (S)**. Ta sama usługa w sąsiednich miastach i różne usługi w tym samym mieście zawsze mają inny układ.
  - Scenariusze dobierane do charakteru miasta (nad morzem: apartamenty i pensjonaty; Trójmiasto: przeprowadzki w aglomeracji; Kaszuby: siedliska nad jeziorami; Słupsk: bloki bez windy na Zatorzu…).
  - Warianty tytułów, opisów, H1, wstępów, nagłówków sekcji, FAQ i wskazówek.
  - Zmierzone podobieństwo treści (5-wyrazowe fragmenty, bez nagłówka/stopki/opinii): **średnio 20%** między tą samą usługą w różnych miastach, **14%** między usługami w tym samym mieście. Strony mają 415–1170 słów.
- **Bez stron „na siłę”:** odśnieżanie, sprzątanie i mycie tylko tam, gdzie dojeżdżamy codziennie (Słupsk + do ~70 km); ogród i wycinka — do Trójmiasta; przeprowadzki, transport, opróżnianie — wszędzie. Strony usług, których realnie nie świadczymy daleko od bazy, wyglądałyby dla Google jak doorway pages, a dla klienta jak obietnica bez pokrycia. Zmiana: `tiers` w `local_services.py`.
- **Słupsk na pierwszym miejscu:** hub `uslugi-slupsk.html` (priorytet 1.0 w sitemap), link „Słupsk” w menu głównym, osiedla Słupska z wskazówkami per usługa, gminy powiatu słupskiego, więcej FAQ, w stopce kolumna „Lokalnie” prowadzi głównie do Słupska.
- Schema.org: `Service` z `areaServed` = miasto + okolice, `FAQPage`, `BreadcrumbList` (Strona główna → Miasto → Usługa), `ItemList` na hubach; organizacja z `areaServed` = 30 miast. `geo.placename` per miasto.
- Linkowanie wewnętrzne: ta sama usługa w najbliższych miastach, inne usługi w tym mieście, hub miasta, Słupsk zawsze w linkach; huby działów pokazują miasta pogrupowane (baza → blisko → Pomorze → daleko).
- Odmiana „z/ze” (ze Słupska, ze Szczecina, z Sopotu).

### 🔜 Do zrobienia (największy wpływ na pozycje)
1. **Google Business Profile** — uzupełnić usługi (te same nazwy co na stronie), obszar obsługi (30 miast), zdjęcia z realizacji co tydzień, posty. To dla Słupska ważniejsze niż sama strona.
2. **Prawdziwe zdjęcia z realizacji per miasto** — zamiast zdjęć z Unsplash. 2–3 zdjęcia „przed/po” z podpisem „Opróżnianie mieszkania, Słupsk-Zatorze” na każdej stronie Słupska to najmocniejszy sygnał unikalności. W RevMi są już zdjęcia przed/po — można je publikować (za zgodą klienta) automatycznie.
3. **Opinie z nazwą miasta** — prosić klientów w SMS-ie o opinię z wzmianką o mieście i usłudze; na stronie miasta pokazywać opinie z tego miasta.
4. **Search Console** — dodać nową sitemapę, obserwować indeksowanie stron miast przez 4–6 tygodni; strony bez wyświetleń po 3 miesiącach (np. daleko od bazy) rozbudować albo dać `noindex`.
5. **Katalogi i cytowania NAP** (Panorama Firm, pkt.pl, Oferteo, Fixly, lokalne portale Słupska) — identyczna nazwa, adres, telefon.
6. Artykuły-poradniki na blogu powiązane ze Słupskiem (np. „Wywóz gabarytów w Słupsku — terminy i PSZOK”, „Przeprowadzka na Zatorzu bez windy”) linkujące do stron usług.
7. Strony **osiedli Słupska** (np. „Przeprowadzki Zatorze”) dopiero, gdy będą realne zdjęcia/opinie z tych osiedli — inaczej to cienka treść.

## 2. Formularz wyceny — więcej szczegółów dla ekipy

### ✅ Zrobione
- Każda usługa ma nową, rozwijaną sekcję **„Szczegóły dla ekipy”** (np. przeprowadzka: rodzaj budynku skąd/dokąd, liczba kartonów, ciężkie rzeczy — pianino, sejf, lodówka side-by-side, zabudowy; rzeczy delikatne; odłączenie AGD; trasa krajowa/zagraniczna; przechowanie po drodze; wywóz przy okazji; godzina wydania kluczy).
- Wspólna sekcja **„Dojazd i dostęp”**: gdzie stanie auto, dojazd dla busa (wąska brama, strefa płatna), klatka, kto będzie na miejscu / klucze / ochrona, pora, zgody zarządcy / zajęcie pasa, zwierzęta, preferowany kontakt, uwagi dla ekipy.
- Ryzyka, o które wcześniej nie pytaliśmy: **linia energetyczna przy drzewie, azbest (eternit) przy rozbiórce, instalacje w gruncie, brak wody/prądu, ograniczenia godzin hałasu, sople nad wejściem**.
- Licznik uzupełnienia (np. 4/20), wszystkie pola opcjonalne — formularz nadal da się wysłać w 30 sekund.
- **Checklista przygotowania ekipy tworzy się sama** w zleceniu RevMi (`lib/crew-prep.js`): „przed wyjazdem” (sprzęt: pasy do pianina, frezarka do pni, sól, agregat, maski FFP3…) i „na miejscu” (uwagi i ryzyka), plus **sugerowana liczba osób**.
- Nowe pola są doklejane na końcu listy — stawki w `lib/revbot/pricing.js` (czytane po indeksach) działają bez zmian; RevBot dostaje więcej danych do wyceny.

### 🔜 Do zrobienia
1. Ustawić w RevMi → RevBot dopłaty za nowe pola (np. pianino, brak windy, azbest → oględziny obowiązkowe).
2. Krok „zdjęcia” prowadzony per usługa (np. przeprowadzka: „zdjęcie klatki schodowej”, „zdjęcie największej szafy”).
3. Wybór terminu z kalendarza wolnych dni ekip (z grafiku RevMi).

## 3. Panel klienta po numerze telefonu

### ✅ Zrobione
- `/konto` **domyślnie loguje numerem telefonu** — bez hasła i bez zakładania konta. Klient widzi wszystkie zlecenia zgłoszone z tego numeru: status jak u kuriera, wycenę, termin, ekipę, przewidywany przyjazd, zdjęcia przed/po; może **zaakceptować wycenę, anulować / poprosić o anulowanie, ocenić**.
- Dwie metody potwierdzenia numeru:
  1. **kod SMS** (6 cyfr, ważny 10 min, hash w bazie) — gdy ustawiony `SMSAPI_TOKEN`,
  2. **numer telefonu + numer zlecenia** (z wyceny/SMS/e-maila) — działa zawsze, także bez bramki SMS.
- Bezpieczeństwo: numer musi być potwierdzony (sam numer nie wystarczy), blokada 30 min po 5 błędnych kodach / 8 błędnych numerach zleceń, limity na IP, SMS tylko gdy są zlecenia (bez spamu i kosztów), odpowiedź nie zdradza, czy numer jest w bazie, nowa sesja po weryfikacji, sesja 12 h, klient nie widzi notatek wewnętrznych, kosztów ani checklisty.
- Numer w dowolnym formacie (600 000 000, +48 600-000-000, 0048…) — nowe pole `clientPhoneKey` w zleceniu (indeks). Starsze zlecenia dopasowujemy po numerze i uzupełniamy klucz przy pierwszym wyszukaniu — **bez migracji bazy**.
- Gdy klient jest zalogowany kontem e-mail i potwierdzi numer — zlecenia z numeru pojawiają się też w panelu konta.
- Logowanie e-mailem i rejestracja działają jak wcześniej (`/konto#email`).

### 🔜 Do zrobienia
1. Dodać link do panelu w SMS-ach „dzień przed” i „ekipa jedzie” (`/konto`) oraz numer zlecenia w SMS-ie potwierdzającym zgłoszenie.
2. Czat z ekipą także w panelu telefonicznym (teraz: tylko w koncie e-mail).
3. „Zamów ponownie” w panelu telefonicznym.

## 4. Pozostałe ulepszenia (rekomendacje)
- 🔜 Naprawić istniejące, nieprzechodzące testy (10 — były w repo przed zmianami): m.in. `konto.html` bez `<h1>`/canonical, stare testy kreatora wyceny i formularza kontaktowego niedopasowane do obecnych stron, test komunikatu „Overloaded”.
- 🔜 Generator stron w Railway: `npm run build` nie uruchamia generatora Pythona — strony są w repo jako gotowe HTML. Po zmianie danych miast uruchom lokalnie `npm run site && npm run pages` i wgraj wynik.
- 🔜 Szybkość: zdjęcia hero z Unsplash → własne, skompresowane WebP/AVIF na własnej domenie (LCP).
- 🔜 Analityka konwersji per strona miasta (zdarzenia `generate_lead` z parametrem miasta) — wtedy wiadomo, które miasta warto rozbudowywać.
