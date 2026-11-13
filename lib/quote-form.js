/* RevSerwis 13 — katalog formularza wyceny (6 usług). Plik serwera (lib/) — strona dostaje go pod /assets/quote-form.js (src/app.js).
   Jeden plik dla strony (wycena.html) i serwera (lib/quote-v13.js), żeby pytania i walidacja zawsze się zgadzały. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RevQuoteForm = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LIFTS = ['Brak windy', 'Winda osobowa', 'Winda towarowa', 'Parter / dom'];
  var PARKING = ['do 10 m', '10–30 m', 'ponad 30 m'];
  var PLACES = ['Mieszkanie', 'Dom', 'Garaż', 'Piwnica', 'Strych', 'Komórka', 'Biuro / lokal', 'Magazyn', 'Działka', 'Inne'];
  var ROOMS = ['Salon', 'Sypialnia', 'Pokój dziecięcy', 'Kuchnia', 'Łazienka', 'Przedpokój', 'Gabinet', 'Piwnica', 'Garaż', 'Strych', 'Balkon', 'Inne'];
  var ITEM_FLAGS = ['do rozkręcenia', 'do skręcenia', 'ciężkie', 'delikatne', 'trzeba odłączyć'];
  var TIMES = ['Obojętnie', 'Rano (7–11)', 'Południe (11–15)', 'Popołudnie (15–19)'];

  /* Podpowiedzi przedmiotów do szybkiego dodania */
  var ITEM_SUGGEST = {
    meble: ['Kanapa / sofa', 'Narożnik', 'Fotel', 'Szafa 2-drzwiowa', 'Szafa 3-drzwiowa', 'Komoda', 'Regał', 'Szafka RTV', 'Stół', 'Krzesło', 'Biurko', 'Łóżko pojedyncze', 'Łóżko podwójne', 'Materac', 'Szafka nocna', 'Meble kuchenne (szafka)', 'Ławka / stolik'],
    agd: ['Lodówka', 'Zamrażarka', 'Pralka', 'Suszarka', 'Zmywarka', 'Kuchenka', 'Piekarnik', 'Mikrofalówka', 'Telewizor', 'Komputer / monitor'],
    inne: ['Kartony', 'Worki z rzeczami', 'Rower', 'Pianino', 'Sejf', 'Akwarium', 'Dywan', 'Lustro / obraz', 'Roślina w donicy', 'Paleta']
  };

  var WASTE = [
    { id: 'gabaryty', name: 'Gabaryty (meble, materace, dywany)', unit: 'szt.' },
    { id: 'agd', name: 'AGD (lodówki, pralki, kuchenki)', unit: 'szt.' },
    { id: 'rtv', name: 'RTV i elektronika', unit: 'szt.' },
    { id: 'zielone', name: 'Odpady zielone (gałęzie, trawa, liście)', unit: 'worków' },
    { id: 'gruz', name: 'Gruz i odpady budowlane', unit: 'worków' },
    { id: 'opony', name: 'Opony', unit: 'szt.' },
    { id: 'inne', name: 'Inne odpady', unit: 'szt.' }
  ];

  var DEMOLITION = [
    { id: 'plytki', name: 'Kucie płytek (ściany / podłoga)', unit: 'm²' },
    { id: 'piec', name: 'Rozbiórka pieca kaflowego', unit: 'szt.' },
    { id: 'tapety', name: 'Zrywanie tapet', unit: 'm²' },
    { id: 'kasetony', name: 'Zdejmowanie kasetonów', unit: 'm²' },
    { id: 'boazeria', name: 'Demontaż boazerii', unit: 'm²' },
    { id: 'sciana', name: 'Wyburzenie ściany', unit: 'm²' },
    { id: 'sanitariaty', name: 'Demontaż zlewów, toalet, wanien, brodzików', unit: 'szt.' },
    { id: 'kuchnia', name: 'Demontaż zabudowy kuchennej', unit: 'mb' },
    { id: 'podlogi', name: 'Zrywanie podłóg (panele, deski, wykładzina, parkiet)', unit: 'm²' },
    { id: 'sufity', name: 'Zrywanie sufitów (podwieszane, płyty, panele)', unit: 'm²' },
    { id: 'tynki', name: 'Skuwanie tynków', unit: 'm²' },
    { id: 'wylewka', name: 'Skuwanie wylewki', unit: 'm²' },
    { id: 'drzwi', name: 'Demontaż drzwi i ościeżnic', unit: 'szt.' },
    { id: 'inne', name: 'Inne prace rozbiórkowe', unit: 'szt.' }
  ];

  var SERVICES = [
    {
      id: 'przeprowadzka', name: 'Przeprowadzka', icon: 'fa-truck-ramp-box', route: true, items: 'required', rooms: true,
      lead: 'Dodaj rzeczy pokój po pokoju i podaj dokładne ilości.',
      fields: [
        { id: 'scope', label: 'Rodzaj przeprowadzki', type: 'chips', options: ['Mieszkanie', 'Dom', 'Biuro', 'Pojedyncze rzeczy', 'Za granicę'], required: true },
        { id: 'area', label: 'Metraż (m²)', type: 'number', max: 2000 },
        { id: 'boxes', label: 'Ile kartonów (orientacyjnie)?', type: 'number', max: 500 }
      ],
      extras: ['Demontaż i montaż mebli', 'Pakowanie rzeczy przez ekipę', 'Zabezpieczenie folią i kocami', 'Kartony i materiały od nas', 'Wywóz niepotrzebnych rzeczy', 'Sprzątanie po przeprowadzce']
    },
    {
      id: 'oproznianie', name: 'Opróżnianie', icon: 'fa-box-open', route: false, items: 'optional', rooms: true,
      lead: 'Wypisz największe rzeczy (meble, AGD). Drobiazgi opisz poziomem zapełnienia.',
      fields: [
        { id: 'place', label: 'Co opróżniamy?', type: 'chips', options: ['Mieszkanie', 'Dom', 'Garaż', 'Strych', 'Piwnica', 'Komórka', 'Lokal / biuro'], required: true, multi: true },
        { id: 'purpose', label: 'Powód', type: 'chips', options: ['Pod sprzedaż', 'Pod wynajem', 'Po najemcach', 'Po zmarłym', 'Przed remontem', 'Inny'] },
        { id: 'area', label: 'Metraż (m²)', type: 'number', max: 2000, required: true },
        { id: 'rooms', label: 'Liczba pomieszczeń', type: 'number', max: 50 },
        { id: 'fill', label: 'Jak bardzo zapełnione?', type: 'chips', options: ['Kilka rzeczy', 'Normalnie umeblowane', 'Mocno zagracone', 'Pełne po sufit'], required: true },
        { id: 'bags', label: 'Worki / kartony z drobnymi rzeczami (szt.)', type: 'number', max: 1000 }
      ],
      extras: ['Sprzątanie po opróżnieniu', 'Odłożenie rzeczy do zachowania', 'Odkupienie / oddanie wartościowych rzeczy', 'Drobne naprawy pod sprzedaż', 'Odczyt liczników i przekazanie kluczy']
    },
    {
      id: 'transport', name: 'Transport z wniesieniem', icon: 'fa-dolly', route: true, items: 'required', rooms: false,
      lead: 'Co dokładnie przewozimy? Podaj ilości i wymiary dużych rzeczy.',
      fields: [
        { id: 'pickup', label: 'Skąd odbieramy?', type: 'chips', options: ['Z domu / mieszkania', 'Ze sklepu', 'Z OLX / od osoby prywatnej', 'Z firmy / magazynu'], required: true },
        { id: 'weight', label: 'Najcięższa rzecz (kg, orientacyjnie)', type: 'number', max: 5000 }
      ],
      extras: ['Wniesienie na piętro', 'Montaż / skręcenie', 'Wyniesienie i wywóz starego mebla / AGD', 'Zabezpieczenie folią i kocami']
    },
    {
      id: 'odpady', name: 'Odbiór odpadów', icon: 'fa-dumpster', route: false, items: false, waste: true,
      lead: 'Zaznacz rodzaje odpadów i podaj ilości.',
      fields: [
        { id: 'where', label: 'Gdzie leżą odpady?', type: 'chips', options: ['W mieszkaniu / domu', 'W piwnicy / garażu', 'Przed domem / na posesji', 'Na działce', 'Na budowie'], required: true },
        { id: 'volume', label: 'Ile tego jest (orientacyjnie)?', type: 'chips', options: ['Do 1 m³ (bagażnik)', '1–3 m³', '3–8 m³ (pół busa)', '8–15 m³ (pełny bus)', 'Ponad 15 m³'], required: true }
      ],
      extras: ['Wyniesienie przez ekipę', 'Demontaż przed wywozem', 'Sprzątanie po wywozie', 'Potwierdzenie utylizacji (KPO) dla firmy']
    },
    {
      id: 'rozbiorki', name: 'Rozbiórki i skuwanie', icon: 'fa-hammer', route: false, items: false, works: true,
      lead: 'Zaznacz wszystkie prace i podaj ich ilość (m², szt. lub mb).',
      fields: [
        { id: 'place', label: 'Gdzie?', type: 'chips', options: ['Mieszkanie', 'Dom', 'Łazienka', 'Kuchnia', 'Lokal / biuro', 'Budynek gospodarczy'], required: true, multi: true },
        { id: 'area', label: 'Metraż całego lokalu (m²)', type: 'number', max: 5000 },
        { id: 'occupied', label: 'Czy w lokalu są jeszcze meble?', type: 'chips', options: ['Pusty', 'Częściowo', 'Umeblowany — trzeba opróżnić'] },
        { id: 'debris', label: 'Wywóz gruzu i odpadów', type: 'chips', options: ['Tak, po Waszej stronie', 'Nie, mam kontener'], required: true },
        { id: 'utilities', label: 'Prąd i woda na miejscu', type: 'chips', options: ['Są', 'Tylko prąd', 'Brak'] }
      ],
      extras: ['Zabezpieczenie okien, drzwi i klatki', 'Sprzątanie po rozbiórce', 'Odpylanie / odkurzanie przemysłowe', 'Przygotowanie pod konkretnego wykonawcę']
    },
    {
      id: 'przewoz', name: 'Przewóz osób', icon: 'fa-van-shuttle', route: true, items: false, people: true,
      lead: 'Podaj trasę, godzinę i liczbę osób.',
      fields: [
        { id: 'purpose', label: 'Cel przejazdu', type: 'chips', options: ['Lotnisko', 'Wesele / impreza', 'Wyjazd firmowy', 'Dworzec', 'Inny'], required: true },
        { id: 'passengers', label: 'Liczba osób', type: 'number', max: 60, required: true },
        { id: 'luggage', label: 'Bagaże (szt.)', type: 'number', max: 200 },
        { id: 'time', label: 'Godzina wyjazdu', type: 'time', required: true },
        { id: 'return', label: 'Kurs powrotny', type: 'chips', options: ['Nie', 'Tak, tego samego dnia', 'Tak, innego dnia'] },
        { id: 'flight', label: 'Numer lotu (jeśli lotnisko)', type: 'text', max: 20 }
      ],
      extras: ['Fotelik dla dziecka', 'Duży bagaż (narty, rowery)', 'Postój / oczekiwanie']
    }
  ];

  var BY_ID = {};
  SERVICES.forEach(function (s) { BY_ID[s.id] = s; });

  return {
    SERVICES: SERVICES, BY_ID: BY_ID, LIFTS: LIFTS, PARKING: PARKING, PLACES: PLACES, ROOMS: ROOMS,
    ITEM_FLAGS: ITEM_FLAGS, ITEM_SUGGEST: ITEM_SUGGEST, WASTE: WASTE, DEMOLITION: DEMOLITION, TIMES: TIMES,
    MAX_PHOTOS: 15, MAX_ITEMS: 150
  };
});
