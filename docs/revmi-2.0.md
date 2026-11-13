# RevMi 2.0.0 — architektura

Nowa aplikacja dla ekipy RevSerwis. Działa na **tym samym serwerze i tej samej bazie MongoDB** co 9.2 —
żadne dane nie są przenoszone ani kasowane. Stary panel zostaje pod `/revmi-9/` (moduły, których 2.0 jeszcze
nie przepisało: RevOutlet, RevPowrót, Newsletter, Rekrutacja, Sortownia, Dodatki, Deweloperzy, Hotele,
Partnerzy, Konta klientów, Abonamenty 9.0, Oferty, RevBot, Automatyzacje).

## Frontend — `Public/revmi/`

Bez kroku budowania (jak 9.2): moduły ES (`<script type="module">`), jeden plik CSS z tokenami.

```
index.html          powłoka, ładuje js/app.js
app.css             design system (ciemny motyw domyślnie, jasny opcjonalnie), komponenty
sw.js               cache PWA revmi-2.0.0, push, offline
js/core.js          api(), stan, router (#/trasa/param), toast, modal, formatowanie, ikony
js/app.js           start: sesja → logowanie / 2FA / blokada PIN → powłoka (menu biura / pasek ekipy)
js/views/*.js       jeden plik = jeden ekran (export default { title, render(el, params) })
```

Menu biura: Pulpit · Zlecenia · Wyceny · Grafik · Skrzynka · Klienci · Pakiety firm · Zespół · Finanse ·
Magazyn · Flota · Notatnik · Asystent AI · Ustawienia. Pracownik: Mój dzień · Trasa · Czat · Czas · Zarobki · Więcej.

## Backend — nowe pliki

```
src/models-v2.js        V2Config, LoginSession, Equipment, EquipmentMove, CrmEvent, PackagePlan, PackageSub,
                        TimeEntry, Availability, SwapRequest, ChatChannel, ChatMessage, ChatRead, FaultReport, SmsConfirm
lib/v2.js               czysta logika (prognoza, budżety, ranking, zarobki, geofence, hasła) — testy w tests/v2.test.js
src/routes/v2-auth.js   logowanie hasłem, potwierdzenie terminu z SMS (publiczne)
src/routes/v2.js        /api/v2/* (po requireAuth)
src/middleware/v2.js    wymuszenie 2FA dla administratorów, rejestr sesji
src/services/v2-jobs.js budżety, przypomnienia CRM, odnowienia pakietów, SMS dzień przed, raporty PDF, stany magazynu
src/services/report-pdf.js  raport PDF (pdfkit + font Noto Sans z polskimi znakami)
```

Rozszerzone schematy (zgodne wstecz, tylko nowe pola z domyślnymi wartościami):
`Employee.passwordHash`, `Client.stage/value/nextAction…`, `Task.packageSub/complaint/smsConfirm…`.

## Decyzje

- Ceny zleceń traktujemy jako **brutto** (ustawienie `pricesAreGross`, domyślnie tak; gdy nie — doliczamy VAT `vatRate`).
- Prognoza = suma `finalPrice ?? price` zleceń zaplanowanych, w realizacji i zakończonych z danego okresu (bez anulowanych i surowych wycen).
- 2FA obowiązkowe dla administratorów (`ADMIN_2FA_OPTIONAL=true` wyłącza wymóg awaryjnie).
- Logowanie: e-mail/telefon + hasło; PIN zostaje (główny PIN właściciela i pracownicy bez hasła) i służy do odblokowania aplikacji.
- Czat zespołu: odświeżanie co kilka sekund (bez websocketów — działa na każdym planie Railway).
- GPS: tylko gdy pracownik ma włączony „Czas pracy”, za jego zgodą w przeglądarce.
