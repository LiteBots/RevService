# RevSerwis + RevMi 3.1

## Co nowego w 3.1 (październik 2026)

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
src/routes/*.js          API: auth, public (wyceny), tasks, resources, dashboard, notifications
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
