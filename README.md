# RevSerwis + RevMi 4.0

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
src/routes/*.js          API: auth, public (wyceny, kontakt), tasks, resources, dashboard, notifications,
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
