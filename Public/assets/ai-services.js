/* RevSerwis 8.0 — katalog usług formularza „Wycena RevBot”.
   Jedno źródło dla strony (wycena.html) i serwera (lib/ai-quote-input.js).
   UWAGA: ten plik jest publiczny — NIE MA w nim stawek ani cen. Stawki (km, piętra, weekend, utylizacja…)
   są wyłącznie na serwerze: lib/revbot/pricing.js + panel RevMi → RevBot.
   Pola: chips (jeden wybór), multi (kilka), number. Pola „quick” pokazujemy od razu w formularzu,
   resztę RevBot odczyta z opisu i zdjęć. Pole bez odpowiedzi = „nie podano” (nie zgadujemy za klienta). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.REV_AI_SERVICES = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SERVICES = [
    { id: 'move', division: 'revhome', dept: 'RevHome', name: 'Przeprowadzka', desc: 'Krajowe i międzynarodowe — mieszkania, domy, biura', icon: 'home', dest: true,
      fields: [
        { id: 'scope', label: 'Zakres', type: 'chips', quick: true, options: ['Kilka rzeczy', 'Kawalerka', '2 pokoje', '3 pokoje', '4+ pokoi', 'Dom', 'Biuro'] },
        { id: 'floorFrom', label: 'Piętro (skąd)', type: 'number', quick: true, min: -1, max: 20, unit: 'floor' },
        { id: 'floorTo', label: 'Piętro (dokąd)', type: 'number', quick: true, min: -1, max: 20, unit: 'floor' },
        { id: 'lift', label: 'Winda', type: 'chips', quick: true, options: ['Brak', 'Tylko skąd', 'Tylko dokąd', 'W obu miejscach'] },
        { id: 'assembly', label: 'Rozkręcanie mebli', type: 'chips', options: ['Nie trzeba', 'Tylko demontaż', 'Demontaż i montaż'] },
        { id: 'extras', label: 'Dodatkowo', type: 'multi', quick: true, options: ['Pakowanie przez ekipę', 'Kartony', 'Pianino / sejf', 'Przedmioty wartościowe', 'Duże AGD'] }
      ] },

    { id: 'clear', division: 'revhome', dept: 'RevHome', name: 'Opróżnianie i wywóz', desc: 'Mieszkania, piwnice, strychy, garaże, posesje', icon: 'box',
      fields: [
        { id: 'place', label: 'Co opróżniamy?', type: 'chips', quick: true, options: ['Mieszkanie', 'Dom', 'Piwnica', 'Strych', 'Garaż', 'Posesja', 'Firma'] },
        { id: 'area', label: 'Powierzchnia', type: 'number', quick: true, min: 2, max: 2000, step: 5, unit: 'm²' },
        { id: 'fill', label: 'Ile jest rzeczy?', type: 'chips', options: ['Mało', 'Średnio', 'Dużo', 'Bardzo dużo'] },
        { id: 'floor', label: 'Piętro', type: 'number', quick: true, min: -1, max: 20, unit: 'floor' }
      ] },

    { id: 'waste', division: 'revhome', dept: 'RevHome', name: 'Wywóz gabarytów', desc: 'Meble, AGD, gruz, odpady zielone', icon: 'trash',
      fields: [
        { id: 'kinds', label: 'Co wywozimy?', type: 'multi', quick: true, options: ['Meble', 'AGD / RTV', 'Gruz', 'Odpady zielone', 'Opony', 'Mieszane'] },
        { id: 'qty', label: 'Ilość', type: 'chips', options: ['do 2 m³', '2–5 m³', '5–10 m³', 'ponad 10 m³'] },
        { id: 'carry', label: 'Wyniesienie', type: 'chips', quick: true, options: ['Leży przy aucie', 'Trzeba wynieść'] }
      ] },

    { id: 'cargo', division: 'revcargo', dept: 'RevCargo', name: 'Transport rzeczy', desc: 'Meble, AGD, palety, materiały, maszyny', icon: 'truck', dest: true,
      fields: [
        { id: 'kind', label: 'Co przewozimy?', type: 'chips', quick: true, options: ['Meble / AGD', 'Materiały budowlane', 'Palety', 'Maszyny / urządzenia', 'Inne'] },
        { id: 'weight', label: 'Szacunkowa waga', type: 'chips', options: ['do 500 kg', '500–1000 kg', '1–3 t', 'ponad 3 t'] },
        { id: 'help', label: 'Pomoc przy załadunku', type: 'chips', quick: true, options: ['Nie', 'Tak'] }
      ] },

    { id: 'snow', division: 'revwinter', dept: 'RevWinter', name: 'Odśnieżanie', desc: 'Podjazdy, parkingi, chodniki — jednorazowo lub abonament', icon: 'snow',
      fields: [
        { id: 'place', label: 'Teren', type: 'chips', quick: true, options: ['Podjazd', 'Parking', 'Chodniki', 'Teren firmy'] },
        { id: 'area', label: 'Powierzchnia', type: 'number', quick: true, min: 20, max: 50000, step: 20, unit: 'm²' },
        { id: 'mode', label: 'Tryb', type: 'chips', quick: true, options: ['Jednorazowo', 'Cała zima (abonament)'] }
      ] },

    { id: 'plot', division: 'revgarden', dept: 'RevGarden', name: 'Ogród i działka', desc: 'Koszenie, karczowanie, porządkowanie', icon: 'leaf',
      fields: [
        { id: 'area', label: 'Powierzchnia', type: 'number', quick: true, min: 50, max: 50000, step: 50, unit: 'm²' },
        { id: 'state', label: 'Stan działki', type: 'chips', quick: true, options: ['Lekko zarośnięta', 'Zarośnięta', 'Bardzo zarośnięta / zaśmiecona'] },
        { id: 'scope', label: 'Zakres', type: 'multi', options: ['Koszenie', 'Karczowanie krzewów', 'Przycinanie żywopłotu', 'Wywóz śmieci', 'Wywóz odpadów zielonych'] }
      ] },

    { id: 'trees', division: 'revgarden', dept: 'RevGarden', name: 'Wycinka drzew i krzewów', desc: 'Wycinka, przycinka, wywóz gałęzi', icon: 'tree',
      fields: [
        { id: 'count', label: 'Liczba drzew', type: 'number', quick: true, min: 0, max: 100, unit: 'szt.' },
        { id: 'height', label: 'Wysokość', type: 'chips', quick: true, options: ['do 5 m', '5–10 m', '10–15 m', 'ponad 15 m'] },
        { id: 'near', label: 'Blisko budynku lub linii', type: 'chips', options: ['Nie', 'Tak'] },
        { id: 'bushes', label: 'Krzewy', type: 'chips', options: ['Brak', 'Kilka', 'Dużo'] },
        { id: 'haul', label: 'Wywóz gałęzi', type: 'chips', options: ['Tak', 'Nie'] }
      ] },

    { id: 'stumps', division: 'revgarden', dept: 'RevGarden', name: 'Usuwanie pni i korzeni', desc: 'Frezowanie lub wykopanie', icon: 'stump',
      fields: [
        { id: 'count', label: 'Liczba pni', type: 'number', quick: true, min: 1, max: 100, unit: 'szt.' },
        { id: 'dia', label: 'Średnica', type: 'chips', quick: true, options: ['do 30 cm', '30–60 cm', 'ponad 60 cm'] },
        { id: 'method', label: 'Metoda', type: 'chips', options: ['Frezowanie', 'Wykopanie z korzeniami'] }
      ] },

    { id: 'shop', division: 'revassist', dept: 'RevAssist', name: 'Odbiór ze sklepu', desc: 'Zakupy ze sklepu lub z ogłoszenia — z wniesieniem', icon: 'bag', dest: true,
      fields: [
        { id: 'items', label: 'Ile rzeczy?', type: 'number', quick: true, min: 1, max: 50, unit: 'szt.' },
        { id: 'floor', label: 'Piętro dostawy', type: 'number', quick: true, min: -1, max: 20, unit: 'floor' },
        { id: 'carry', label: 'Zakres', type: 'chips', options: ['Pod drzwi', 'Wniesienie', 'Wniesienie + montaż'] }
      ] },

    { id: 'moto', division: 'revmoto', dept: 'RevMoto', name: 'Transport motocykli', desc: 'Motocykle, quady, skutery, crossy', icon: 'moto', dest: true,
      fields: [
        { id: 'type', label: 'Pojazd', type: 'chips', quick: true, options: ['Motocykl', 'Skuter', 'Quad', 'Cross', 'Inny'] },
        { id: 'state', label: 'Stan', type: 'chips', quick: true, options: ['Na chodzie', 'Niesprawny'] },
        { id: 'count', label: 'Liczba pojazdów', type: 'number', min: 1, max: 5, unit: 'szt.' }
      ] },

    { id: 'cleaning', division: 'revclean', dept: 'RevClean', name: 'Sprzątanie', desc: 'Mieszkania, domy, biura, po remoncie i najemcach', icon: 'sparkle',
      fields: [
        { id: 'place', label: 'Co sprzątamy?', type: 'chips', quick: true, options: ['Mieszkanie', 'Dom', 'Biuro', 'Po remoncie', 'Po najemcach / przeprowadzce', 'Garaż / piwnica'] },
        { id: 'area', label: 'Powierzchnia', type: 'number', quick: true, min: 10, max: 3000, step: 5, unit: 'm²' },
        { id: 'scope', label: 'Zakres', type: 'chips', options: ['Standardowe', 'Generalne'] },
        { id: 'windows', label: 'Mycie okien', type: 'chips', options: ['Nie', 'Tak'] }
      ] },

    { id: 'wash', division: 'revclean', dept: 'RevClean', name: 'Mycie ciśnieniowe', desc: 'Kostka, tarasy, elewacje, dachy', icon: 'drop',
      fields: [
        { id: 'surface', label: 'Co myjemy?', type: 'chips', quick: true, options: ['Kostka / podjazd', 'Taras', 'Elewacja', 'Dach', 'Ogrodzenie'] },
        { id: 'area', label: 'Powierzchnia', type: 'number', quick: true, min: 5, max: 5000, step: 10, unit: 'm²' },
        { id: 'dirt', label: 'Zabrudzenie', type: 'chips', options: ['Lekkie', 'Średnie', 'Mocne (mech, glony)'] },
        { id: 'impreg', label: 'Impregnacja', type: 'chips', options: ['Nie', 'Tak'] }
      ] },

    { id: 'halls', division: 'revclean', dept: 'RevClean', name: 'Czyszczenie hal i garaży', desc: 'Hale, magazyny, warsztaty, garaże', icon: 'sparkle',
      fields: [
        { id: 'type', label: 'Obiekt', type: 'chips', quick: true, options: ['Garaż', 'Hala', 'Magazyn', 'Warsztat'] },
        { id: 'area', label: 'Powierzchnia', type: 'number', quick: true, min: 10, max: 20000, step: 10, unit: 'm²' },
        { id: 'dirt', label: 'Zabrudzenie', type: 'chips', options: ['Lekkie', 'Średnie', 'Mocne'] }
      ] },

    { id: 'demo', division: 'revbud', dept: 'RevBud', name: 'Rozbiórki małych obiektów', desc: 'Wiaty, altany, szopy, ogrodzenia', icon: 'hammer',
      fields: [
        { id: 'obj', label: 'Obiekt', type: 'chips', quick: true, options: ['Wiata', 'Altana', 'Szopa', 'Garaż blaszany', 'Ogrodzenie', 'Inne'] },
        { id: 'area', label: 'Wielkość', type: 'number', quick: true, min: 2, max: 500, step: 2, unit: 'm²' },
        { id: 'mat', label: 'Materiał', type: 'chips', options: ['Drewno', 'Blacha', 'Mur / beton', 'Mieszany'] },
        { id: 'haul', label: 'Wywóz gruzu i odpadów', type: 'chips', options: ['Tak', 'Nie'] }
      ] },

    { id: 'strip', division: 'revbud', dept: 'RevBud', name: 'Skuwanie i demontaż', desc: 'Płytki, tynki, posadzki, łazienki, kuchnie', icon: 'hammer',
      fields: [
        { id: 'works', label: 'Co skuwamy / demontujemy?', type: 'multi', quick: true, options: ['Płytki', 'Tynki', 'Posadzki', 'Cała łazienka', 'Kuchnia', 'Ścianki działowe'] },
        { id: 'area', label: 'Powierzchnia', type: 'number', quick: true, min: 1, max: 1000, step: 1, unit: 'm²' },
        { id: 'haul', label: 'Wywóz gruzu', type: 'chips', options: ['Tak', 'Nie'] }
      ] },

    { id: 'earth', division: 'revsite', dept: 'RevSite', name: 'Prace ziemne i koparkowe', desc: 'Wykopy, niwelacja, drenaż', icon: 'shovel',
      fields: [
        { id: 'works', label: 'Rodzaj prac', type: 'multi', quick: true, options: ['Wykopy', 'Niwelacja terenu', 'Fundamenty', 'Drenaż', 'Wywóz ziemi'] },
        { id: 'time', label: 'Szacowany czas', type: 'chips', options: ['Kilka godzin', '1 dzień', '2–3 dni', 'Dłużej'] },
        { id: 'access', label: 'Dojazd dla sprzętu', type: 'chips', options: ['Łatwy', 'Utrudniony'] }
      ] },

    { id: 'sale', division: 'revsite', dept: 'RevSite', name: 'Przygotowanie do sprzedaży', desc: 'Opróżnianie, sprzątanie, ogród, podjazd', icon: 'tag',
      fields: [
        { id: 'scope', label: 'Zakres', type: 'multi', quick: true, options: ['Opróżnianie', 'Sprzątanie', 'Ogród', 'Mycie podjazdu', 'Drobne naprawy'] },
        { id: 'area', label: 'Metraż nieruchomości', type: 'number', quick: true, min: 20, max: 2000, step: 10, unit: 'm²' }
      ] },

    { id: 'people', division: 'revevent', dept: 'RevEvent', name: 'Przewóz osób', desc: 'Lotniska, wesela, imprezy, pracownicy', icon: 'users', dest: true,
      fields: [
        { id: 'kind', label: 'Rodzaj przejazdu', type: 'chips', quick: true, options: ['Lotnisko', 'Wesele / impreza', 'Pracowniczy', 'Zespół / sprzęt', 'Inny'] },
        { id: 'persons', label: 'Liczba osób', type: 'number', quick: true, min: 1, max: 50, unit: 'os.' },
        { id: 'trip', label: 'Trasa', type: 'chips', options: ['W jedną stronę', 'W obie strony'] }
      ] },

    { id: 'storage', division: 'revstorage', dept: 'RevStorage', name: 'Przechowanie rzeczy', desc: 'Odbiór, magazyn, dowóz', icon: 'warehouse',
      fields: [
        { id: 'vol', label: 'Ilość rzeczy', type: 'chips', quick: true, options: ['do 5 m³', '5–15 m³', '15–30 m³', 'ponad 30 m³'] },
        { id: 'period', label: 'Okres', type: 'chips', quick: true, options: ['do 1 mies.', '1–3 mies.', '3–6 mies.', 'Dłużej'] },
        { id: 'transport', label: 'Transport do magazynu', type: 'chips', options: ['Tak', 'Nie'] }
      ] },

    { id: 'facility', division: 'revfacility', dept: 'RevFacility', name: 'Obsługa firmy / obiektu', desc: 'Stała obsługa, dział transportowy, hotele', icon: 'building',
      fields: [
        { id: 'kind', label: 'Czego potrzebujesz?', type: 'chips', quick: true, options: ['Stała obsługa obiektu', 'Zewnętrzny dział transportowy', 'Hotel / pensjonat / Airbnb', 'Plac budowy', 'Biuro / sklep / magazyn'] },
        { id: 'freq', label: 'Jak często?', type: 'chips', quick: true, options: ['Jednorazowo', 'Co tydzień', 'Kilka razy w tygodniu', 'Codziennie'] }
      ] },

    { id: 'other', division: '', dept: 'RevAssist', name: 'Inne zlecenie', desc: 'Nie ma na liście? Opisz, co trzeba zrobić', icon: 'dots', fields: [] }
  ];

  /* Kafelki formularza: 5 głównych usług RevSerwis (+ warianty), reszta w „Więcej usług”. */
  const GROUPS = [
    { key: 'przeprowadzka', label: 'Przeprowadzka', sub: 'Polska i zagranica', icon: 'home', main: true, variants: [['move', 'Przeprowadzka']] },
    { key: 'oproznianie', label: 'Opróżnianie i wywóz', sub: 'Mieszkania, piwnice, gabaryty', icon: 'box', main: true, variants: [['clear', 'Opróżnianie lokalu'], ['waste', 'Tylko wywóz gabarytów']] },
    { key: 'transport', label: 'Transport rzeczy', sub: 'Meble, AGD, palety', icon: 'truck', main: true, variants: [['cargo', 'Transport'], ['shop', 'Odbiór ze sklepu'], ['moto', 'Motocykl / quad']] },
    { key: 'zima', label: 'Odśnieżanie', sub: 'RevWinter', icon: 'snow', main: true, variants: [['snow', 'Odśnieżanie']] },
    { key: 'ogrod', label: 'Ogród i działka', sub: 'Koszenie, wycinka, pnie', icon: 'leaf', main: true, variants: [['plot', 'Koszenie i porządki'], ['trees', 'Wycinka drzew'], ['stumps', 'Pnie i korzenie']] },
    { key: 'sprzatanie', label: 'Sprzątanie', icon: 'sparkle', variants: [['cleaning', 'Sprzątanie'], ['wash', 'Mycie ciśnieniowe'], ['halls', 'Hale i garaże']] },
    { key: 'remont', label: 'Rozbiórki i skuwanie', icon: 'hammer', variants: [['demo', 'Rozbiórka obiektu'], ['strip', 'Skuwanie i demontaż'], ['earth', 'Prace ziemne']] },
    { key: 'przechowanie', label: 'Przechowanie rzeczy', icon: 'warehouse', variants: [['storage', 'Przechowanie']] },
    { key: 'osoby', label: 'Przewóz osób', icon: 'users', variants: [['people', 'Przewóz osób']] },
    { key: 'firmy', label: 'Dla firm i obiektów', icon: 'building', variants: [['facility', 'Obsługa firmy'], ['sale', 'Przygotowanie do sprzedaży']] },
    { key: 'inne', label: 'Coś innego', icon: 'dots', variants: [['other', 'Inne zlecenie']] }
  ];

  const BY_ID = Object.fromEntries(SERVICES.map(s => [s.id, s]));
  const GROUP_OF = {};
  for (const g of GROUPS) for (const [id] of g.variants) GROUP_OF[id] = g.key;

  /** Odpowiedzi klienta → liczby/indeksy obcięte do zakresu. Pola bez odpowiedzi pomijamy („nie podano”). */
  function normalize(id, raw) {
    const s = BY_ID[id];
    const out = {};
    if (!s) return out;
    const src = raw && typeof raw === 'object' ? raw : {};
    for (const f of s.fields) {
      const v = src[f.id];
      if (v === undefined || v === null || v === '') continue;
      if (f.type === 'number') {
        const n = Number(v);
        if (Number.isFinite(n)) out[f.id] = Math.min(f.max, Math.max(f.min, Math.round(n)));
      } else if (f.type === 'multi') {
        const list = (Array.isArray(v) ? v : []).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < f.options.length).filter((i, k, a) => a.indexOf(i) === k);
        if (list.length) out[f.id] = list;
      } else {
        const n = Number(v);
        if (Number.isInteger(n) && n >= 0 && n < f.options.length) out[f.id] = n;
      }
    }
    return out;
  }

  const floorText = v => (v < 0 ? 'piwnica / suterena' : v === 0 ? 'parter' : v + '. piętro');

  /** Podane odpowiedzi w formie czytelnej dla człowieka i dla AI. */
  function readable(id, values) {
    const s = BY_ID[id];
    const out = {};
    if (!s) return out;
    for (const f of s.fields) {
      const v = values[f.id];
      if (v === undefined) continue;
      out[f.label] = f.type === 'number' ? (f.unit === 'floor' ? floorText(v) : `${v} ${f.unit}`)
        : f.type === 'multi' ? (v.map(i => f.options[i]).join(', ') || '—')
          : f.options[v];
    }
    return out;
  }

  return { SERVICES, GROUPS, BY_ID, GROUP_OF, normalize, readable, floorText, MAX_PHOTOS: 10 };
});
