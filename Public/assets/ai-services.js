/* RevSerwis 7.0 — katalog usług do wyceny AI.
   Jedno źródło dla strony (wycena.html) i serwera (lib/ai-quote-input.js, src/services/ai-quote.js).
   Pola: chips (jeden wybór), multi (kilka), number.
   price(f, ctx) to orientacyjna stawka bazowa RevSerwis (zł brutto). Serwer przekazuje ją AI jako punkt odniesienia
   i używa jej jako zapasowej wyceny, gdy AI jest niedostępne. Stawki zmieniasz tutaj. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.REV_AI_SERVICES = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SERVICES = [
    { id: 'move', division: 'revhome', dept: 'RevHome', name: 'Przeprowadzka', desc: 'Mieszkania, domy, biura — Polska i UE', icon: 'home', dest: true,
      fields: [
        { id: 'scope', label: 'Zakres', type: 'chips', options: ['Kilka rzeczy', 'Kawalerka', '2 pokoje', '3 pokoje', '4+ pokoi', 'Dom', 'Biuro'], def: 2 },
        { id: 'floorFrom', label: 'Piętro przy odbiorze', type: 'number', min: -1, max: 20, def: 0, unit: 'floor' },
        { id: 'floorTo', label: 'Piętro przy dostawie', type: 'number', min: -1, max: 20, def: 0, unit: 'floor' },
        { id: 'lift', label: 'Winda', type: 'chips', options: ['Brak', 'Przy odbiorze', 'Przy dostawie', 'W obu miejscach'], def: 0 },
        { id: 'assembly', label: 'Rozkręcanie mebli', type: 'chips', options: ['Nie trzeba', 'Tylko demontaż', 'Demontaż i montaż'], def: 0 },
        { id: 'extras', label: 'Dodatkowo', type: 'multi', options: ['Pakowanie przez ekipę', 'Kartony', 'Pianino / sejf', 'Przedmioty wartościowe', 'Duże AGD'] }
      ],
      price: (f, c) => {
        const lf = [1, 0.5, 0.5, 0][f.lift] ?? 1;
        const floors = Math.max(0, f.floorFrom) + Math.max(0, f.floorTo);
        return [150, 350, 550, 800, 1100, 1600, 1200][f.scope] + c.km * 2 + floors * 45 * Math.max(lf, 0.2) + [0, 120, 240][f.assembly] +
          [300, 80, 400, 100, 80].reduce((t, v, i) => t + (f.extras.includes(i) ? v : 0), 0);
      },
      hint: f => (Math.max(0, f.floorFrom) + Math.max(0, f.floorTo) >= 3 && f.lift === 0 ? 'Wnoszenie i znoszenie bez windy wyraźnie wydłuża czas pracy ekipy.' : '') },

    { id: 'cargo', division: 'revcargo', dept: 'RevCargo', name: 'Transport rzeczy', desc: 'Meble, AGD, palety, materiały, maszyny', icon: 'truck', dest: true,
      fields: [
        { id: 'kind', label: 'Co przewozimy?', type: 'chips', options: ['Meble / AGD', 'Materiały budowlane', 'Palety', 'Maszyny / urządzenia', 'Inne'], def: 0 },
        { id: 'weight', label: 'Szacunkowa waga', type: 'chips', options: ['do 500 kg', '500–1000 kg', '1–3 t', 'ponad 3 t'], def: 0 },
        { id: 'help', label: 'Pomoc przy załadunku', type: 'chips', options: ['Nie', 'Tak'], def: 1 }
      ],
      price: (f, c) => 150 + c.km * 2.5 + [0, 80, 200, 450][f.weight] + (f.help ? 120 : 0) },

    { id: 'shop', division: 'revassist', dept: 'RevAssist', name: 'Odbiór ze sklepu', desc: 'Zakupy ze sklepu lub z ogłoszenia — z wniesieniem', icon: 'bag', dest: true,
      fields: [
        { id: 'items', label: 'Ile rzeczy?', type: 'number', min: 1, max: 50, def: 1, unit: 'szt.' },
        { id: 'floor', label: 'Piętro dostawy', type: 'number', min: -1, max: 20, def: 0, unit: 'floor' },
        { id: 'carry', label: 'Zakres', type: 'chips', options: ['Pod drzwi', 'Wniesienie', 'Wniesienie + montaż'], def: 1 }
      ],
      price: (f, c) => 120 + c.km * 2 + f.items * 20 + Math.max(0, f.floor) * 20 + [0, 60, 150][f.carry] },

    { id: 'moto', division: 'revmoto', dept: 'RevMoto', name: 'Transport motocykli', desc: 'Motocykle, quady, skutery, crossy', icon: 'moto', dest: true,
      fields: [
        { id: 'type', label: 'Pojazd', type: 'chips', options: ['Motocykl', 'Skuter', 'Quad', 'Cross', 'Inny'], def: 0 },
        { id: 'state', label: 'Stan', type: 'chips', options: ['Na chodzie', 'Niesprawny'], def: 0 },
        { id: 'count', label: 'Liczba pojazdów', type: 'number', min: 1, max: 5, def: 1, unit: 'szt.' }
      ],
      price: (f, c) => 150 + c.km * 2.2 + (f.count - 1) * 90 + (f.state ? 80 : 0) + (f.type === 2 ? 60 : 0) },

    { id: 'clear', division: 'revhome', dept: 'RevHome', name: 'Opróżnianie', desc: 'Mieszkania, piwnice, strychy, garaże, firmy', icon: 'box',
      fields: [
        { id: 'place', label: 'Co opróżniamy?', type: 'chips', options: ['Mieszkanie', 'Dom', 'Piwnica', 'Strych', 'Garaż', 'Posesja', 'Firma'], def: 0 },
        { id: 'area', label: 'Powierzchnia', type: 'number', min: 2, max: 2000, step: 5, def: 50, unit: 'm²' },
        { id: 'fill', label: 'Ile jest rzeczy?', type: 'chips', options: ['Mało', 'Średnio', 'Dużo', 'Bardzo dużo'], def: 1 },
        { id: 'floor', label: 'Piętro', type: 'number', min: -1, max: 20, def: 0, unit: 'floor' }
      ],
      price: f => 200 + f.area * 12 * [0.6, 1, 1.5, 2.1][f.fill] + Math.max(0, f.floor) * 50,
      hint: f => (f.fill >= 2 ? 'Duża ilość rzeczy oznacza więcej kursów i wyższe koszty utylizacji.' : '') },

    { id: 'waste', division: 'revhome', dept: 'RevHome', name: 'Wywóz gabarytów i odpadów', desc: 'Meble, AGD, gruz, odpady zielone', icon: 'trash',
      fields: [
        { id: 'kinds', label: 'Co wywozimy?', type: 'multi', options: ['Meble', 'AGD / RTV', 'Gruz', 'Odpady zielone', 'Opony', 'Mieszane'] },
        { id: 'qty', label: 'Ilość', type: 'chips', options: ['do 2 m³', '2–5 m³', '5–10 m³', 'ponad 10 m³'], def: 1 },
        { id: 'carry', label: 'Wyniesienie', type: 'chips', options: ['Leży przy aucie', 'Trzeba wynieść'], def: 1 }
      ],
      price: f => [250, 550, 1000, 1800][f.qty] + (f.carry ? 150 : 0) + (f.kinds.includes(2) ? 200 : 0) + (f.kinds.includes(4) ? 100 : 0) },

    { id: 'cleaning', division: 'revclean', dept: 'RevClean', name: 'Sprzątanie', desc: 'Mieszkania, domy, biura, po remoncie i najemcach', icon: 'sparkle',
      fields: [
        { id: 'place', label: 'Co sprzątamy?', type: 'chips', options: ['Mieszkanie', 'Dom', 'Biuro', 'Po remoncie', 'Po najemcach / przeprowadzce', 'Garaż / piwnica'], def: 0 },
        { id: 'area', label: 'Powierzchnia', type: 'number', min: 10, max: 3000, step: 5, def: 50, unit: 'm²' },
        { id: 'scope', label: 'Zakres', type: 'chips', options: ['Standardowe', 'Generalne'], def: 0 },
        { id: 'windows', label: 'Mycie okien', type: 'chips', options: ['Nie', 'Tak'], def: 0 }
      ],
      price: f => Math.max(250, f.area * [6, 9][f.scope] * (f.place === 3 ? 1.4 : 1) + (f.windows ? f.area * 2 : 0)) },

    { id: 'wash', division: 'revclean', dept: 'RevClean', name: 'Mycie ciśnieniowe', desc: 'Kostka, tarasy, elewacje, dachy', icon: 'drop',
      fields: [
        { id: 'surface', label: 'Co myjemy?', type: 'chips', options: ['Kostka / podjazd', 'Taras', 'Elewacja', 'Dach', 'Ogrodzenie'], def: 0 },
        { id: 'area', label: 'Powierzchnia', type: 'number', min: 5, max: 5000, step: 10, def: 60, unit: 'm²' },
        { id: 'dirt', label: 'Zabrudzenie', type: 'chips', options: ['Lekkie', 'Średnie', 'Mocne (mech, glony)'], def: 1 },
        { id: 'impreg', label: 'Impregnacja', type: 'chips', options: ['Nie', 'Tak'], def: 0 }
      ],
      price: f => Math.max(250, f.area * [8, 10, 14][f.dirt] * ([2, 3].includes(f.surface) ? 1.4 : 1) + (f.impreg ? f.area * 6 : 0)) },

    { id: 'halls', division: 'revclean', dept: 'RevClean', name: 'Czyszczenie hal i garaży', desc: 'Hale, magazyny, warsztaty, garaże', icon: 'sparkle',
      fields: [
        { id: 'type', label: 'Obiekt', type: 'chips', options: ['Garaż', 'Hala', 'Magazyn', 'Warsztat'], def: 0 },
        { id: 'area', label: 'Powierzchnia', type: 'number', min: 10, max: 20000, step: 10, def: 40, unit: 'm²' },
        { id: 'dirt', label: 'Zabrudzenie', type: 'chips', options: ['Lekkie', 'Średnie', 'Mocne'], def: 1 }
      ],
      price: f => Math.max(300, f.area * [4, 6, 9][f.dirt]) },

    { id: 'demo', division: 'revbud', dept: 'RevBud', name: 'Rozbiórki małych obiektów', desc: 'Wiaty, altany, szopy, ogrodzenia', icon: 'hammer',
      fields: [
        { id: 'obj', label: 'Obiekt', type: 'chips', options: ['Wiata', 'Altana', 'Szopa', 'Garaż blaszany', 'Ogrodzenie', 'Inne'], def: 2 },
        { id: 'area', label: 'Wielkość', type: 'number', min: 2, max: 500, step: 2, def: 12, unit: 'm²' },
        { id: 'mat', label: 'Materiał', type: 'chips', options: ['Drewno', 'Blacha', 'Mur / beton', 'Mieszany'], def: 0 },
        { id: 'haul', label: 'Wywóz gruzu i odpadów', type: 'chips', options: ['Tak', 'Nie'], def: 0 }
      ],
      price: f => 400 + f.area * [35, 30, 70, 50][f.mat] + (f.haul === 0 ? f.area * 20 : 0),
      hint: f => (f.mat === 2 ? 'Konstrukcje murowane wymagają cięższego sprzętu i droższej utylizacji gruzu.' : '') },

    { id: 'strip', division: 'revbud', dept: 'RevBud', name: 'Skuwanie i demontaż', desc: 'Płytki, tynki, posadzki, łazienki, kuchnie', icon: 'hammer',
      fields: [
        { id: 'works', label: 'Co skuwamy / demontujemy?', type: 'multi', options: ['Płytki', 'Tynki', 'Posadzki', 'Cała łazienka', 'Kuchnia', 'Ścianki działowe'] },
        { id: 'area', label: 'Powierzchnia', type: 'number', min: 1, max: 1000, step: 1, def: 15, unit: 'm²' },
        { id: 'haul', label: 'Wywóz gruzu', type: 'chips', options: ['Tak', 'Nie'], def: 0 }
      ],
      price: f => 300 + f.area * 45 * (f.works.includes(2) ? 1.3 : 1) + (f.haul === 0 ? f.area * 15 : 0) },

    { id: 'earth', division: 'revbud', dept: 'RevBud', name: 'Prace ziemne i koparkowe', desc: 'Wykopy, niwelacja, drenaż', icon: 'shovel',
      fields: [
        { id: 'works', label: 'Rodzaj prac', type: 'multi', options: ['Wykopy', 'Niwelacja terenu', 'Fundamenty', 'Drenaż', 'Wywóz ziemi'] },
        { id: 'time', label: 'Szacowany czas', type: 'chips', options: ['Kilka godzin', '1 dzień', '2–3 dni', 'Dłużej'], def: 1 },
        { id: 'access', label: 'Dojazd dla sprzętu', type: 'chips', options: ['Łatwy', 'Utrudniony'], def: 0 }
      ],
      price: f => [600, 1400, 3500, 7000][f.time] + (f.works.includes(4) ? 500 : 0) + (f.access ? 300 : 0) },

    { id: 'trees', division: 'revgarden', dept: 'RevGarden', name: 'Wycinka drzew i krzewów', desc: 'Wycinka, przycinka, wywóz gałęzi', icon: 'tree',
      fields: [
        { id: 'count', label: 'Liczba drzew', type: 'number', min: 0, max: 100, def: 1, unit: 'szt.' },
        { id: 'height', label: 'Wysokość', type: 'chips', options: ['do 5 m', '5–10 m', '10–15 m', 'ponad 15 m'], def: 1 },
        { id: 'near', label: 'Blisko budynku lub linii', type: 'chips', options: ['Nie', 'Tak'], def: 0 },
        { id: 'bushes', label: 'Krzewy', type: 'chips', options: ['Brak', 'Kilka', 'Dużo'], def: 0 },
        { id: 'haul', label: 'Wywóz gałęzi', type: 'chips', options: ['Tak', 'Nie'], def: 0 }
      ],
      price: f => Math.max(250, f.count * [200, 400, 800, 1400][f.height] * (f.near ? 1.5 : 1) + [0, 200, 500][f.bushes] + (f.haul === 0 ? f.count * 100 : 0)),
      hint: f => (f.near ? 'Drzewa przy budynku lub linii wymagają wycinki etapowej, co podnosi cenę.' : '') },

    { id: 'stumps', division: 'revgarden', dept: 'RevGarden', name: 'Usuwanie pni i korzeni', desc: 'Frezowanie lub wykopanie', icon: 'stump',
      fields: [
        { id: 'count', label: 'Liczba pni', type: 'number', min: 1, max: 100, def: 1, unit: 'szt.' },
        { id: 'dia', label: 'Średnica', type: 'chips', options: ['do 30 cm', '30–60 cm', 'ponad 60 cm'], def: 1 },
        { id: 'method', label: 'Metoda', type: 'chips', options: ['Frezowanie', 'Wykopanie z korzeniami'], def: 0 }
      ],
      price: f => Math.max(200, f.count * [150, 300, 500][f.dia] * (f.method ? 1.6 : 1)) },

    { id: 'plot', division: 'revgarden', dept: 'RevGarden', name: 'Ogród i działka', desc: 'Koszenie, karczowanie, porządkowanie', icon: 'leaf',
      fields: [
        { id: 'area', label: 'Powierzchnia', type: 'number', min: 50, max: 50000, step: 50, def: 500, unit: 'm²' },
        { id: 'state', label: 'Stan działki', type: 'chips', options: ['Lekko zarośnięta', 'Zarośnięta', 'Bardzo zarośnięta / zaśmiecona'], def: 1 },
        { id: 'scope', label: 'Zakres', type: 'multi', options: ['Koszenie', 'Karczowanie krzewów', 'Przycinanie żywopłotu', 'Wywóz śmieci', 'Wywóz odpadów zielonych'] }
      ],
      price: f => Math.max(300, f.area * [0.6, 1.2, 2.2][f.state] + f.scope.length * 150) },

    { id: 'sale', division: 'revsite', dept: 'RevSite', name: 'Przygotowanie do sprzedaży', desc: 'Opróżnianie, sprzątanie, ogród, podjazd', icon: 'tag',
      fields: [
        { id: 'scope', label: 'Zakres', type: 'multi', options: ['Opróżnianie', 'Sprzątanie', 'Ogród', 'Mycie podjazdu', 'Drobne naprawy'] },
        { id: 'area', label: 'Metraż nieruchomości', type: 'number', min: 20, max: 2000, step: 10, def: 80, unit: 'm²' }
      ],
      price: f => 300 + f.area * 8 + f.scope.length * 300 },

    { id: 'people', division: 'revevent', dept: 'RevEvent', name: 'Przewóz osób', desc: 'Lotniska, wesela, imprezy, pracownicy', icon: 'users', dest: true,
      fields: [
        { id: 'kind', label: 'Rodzaj przejazdu', type: 'chips', options: ['Lotnisko', 'Wesele / impreza', 'Pracowniczy', 'Zespół / sprzęt', 'Inny'], def: 0 },
        { id: 'persons', label: 'Liczba osób', type: 'number', min: 1, max: 50, def: 4, unit: 'os.' },
        { id: 'trip', label: 'Trasa', type: 'chips', options: ['W jedną stronę', 'W obie strony'], def: 0 }
      ],
      price: (f, c) => 100 + c.km * 2.8 * (f.trip ? 2 : 1) + (f.persons > 8 ? 200 : 0) },

    { id: 'storage', division: 'revstorage', dept: 'RevStorage', name: 'Przechowanie rzeczy', desc: 'Odbiór, magazyn, dowóz', icon: 'warehouse',
      fields: [
        { id: 'vol', label: 'Ilość rzeczy', type: 'chips', options: ['do 5 m³', '5–15 m³', '15–30 m³', 'ponad 30 m³'], def: 1 },
        { id: 'period', label: 'Okres', type: 'chips', options: ['do 1 mies.', '1–3 mies.', '3–6 mies.', 'Dłużej'], def: 1 },
        { id: 'transport', label: 'Transport do magazynu', type: 'chips', options: ['Tak', 'Nie'], def: 0 }
      ],
      price: f => [200, 450, 800, 1300][f.vol] * [1, 2.5, 5, 9][f.period] + (f.transport === 0 ? 300 : 0) },

    { id: 'snow', division: 'revwinter', dept: 'RevWinter', name: 'Odśnieżanie', desc: 'Podjazdy, parkingi, chodniki, teren firmy', icon: 'snow',
      fields: [
        { id: 'place', label: 'Teren', type: 'chips', options: ['Podjazd', 'Parking', 'Chodniki', 'Teren firmy'], def: 0 },
        { id: 'area', label: 'Powierzchnia', type: 'number', min: 20, max: 50000, step: 20, def: 100, unit: 'm²' },
        { id: 'mode', label: 'Tryb', type: 'chips', options: ['Jednorazowo', 'Cała zima (abonament)'], def: 0 }
      ],
      price: f => (f.mode ? Math.max(1500, f.area * 1.2 * 20) : Math.max(150, f.area * 1.5)) },

    { id: 'facility', division: 'revfacility', dept: 'RevFacility', name: 'Obsługa firmy / obiektu', desc: 'Stała obsługa, dział transportowy, hotele', icon: 'building',
      fields: [
        { id: 'kind', label: 'Czego potrzebujesz?', type: 'chips', options: ['Stała obsługa obiektu', 'Zewnętrzny dział transportowy', 'Hotel / pensjonat / Airbnb', 'Plac budowy', 'Biuro / sklep / magazyn'], def: 0 },
        { id: 'freq', label: 'Jak często?', type: 'chips', options: ['Jednorazowo', 'Co tydzień', 'Kilka razy w tygodniu', 'Codziennie'], def: 1 }
      ],
      price: f => [600, 2000, 4000, 8000][f.freq],
      hint: f => (f.freq ? 'Przy stałej współpracy kwota dotyczy orientacyjnie jednego miesiąca.' : '') },

    { id: 'other', division: '', dept: 'RevAssist', name: 'Inne zlecenie', desc: 'Nie ma na liście? Opisz, co trzeba zrobić', icon: 'dots',
      fields: [], price: () => 400 }
  ];

  const BY_ID = Object.fromEntries(SERVICES.map(s => [s.id, s]));

  /** Odpowiedzi klienta → liczby/indeksy z domyślnymi wartościami i obcięciem do zakresu (bezpieczne dla serwera). */
  function normalize(id, raw) {
    const s = BY_ID[id];
    const out = {};
    if (!s) return out;
    const src = raw && typeof raw === 'object' ? raw : {};
    for (const f of s.fields) {
      const v = src[f.id];
      if (f.type === 'number') {
        const n = Number(v);
        out[f.id] = Number.isFinite(n) ? Math.min(f.max, Math.max(f.min, n)) : f.def;
      } else if (f.type === 'multi') {
        out[f.id] = (Array.isArray(v) ? v : []).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < f.options.length).filter((i, k, a) => a.indexOf(i) === k);
      } else {
        const n = Number(v);
        out[f.id] = Number.isInteger(n) && n >= 0 && n < f.options.length ? n : (f.def || 0);
      }
    }
    return out;
  }

  const floorText = v => (v < 0 ? 'piwnica / suterena' : v === 0 ? 'parter' : v + '. piętro');

  /** Odpowiedzi w formie czytelnej dla człowieka i dla AI. */
  function readable(id, values) {
    const s = BY_ID[id];
    const out = {};
    if (!s) return out;
    for (const f of s.fields) {
      const v = values[f.id];
      out[f.label] = f.type === 'number' ? (f.unit === 'floor' ? floorText(v) : `${v} ${f.unit}`)
        : f.type === 'multi' ? (v.map(i => f.options[i]).join(', ') || '—')
          : f.options[v];
    }
    return out;
  }

  /** Bazowa kwota orientacyjna (środek widełek) dla jednej usługi. */
  function basePrice(id, values, ctx) {
    const s = BY_ID[id];
    if (!s) return 400;
    const v = Number(s.price(values, { km: 0, ...(ctx || {}) }));
    return Math.max(150, Number.isFinite(v) ? v : 400);
  }

  const round10 = n => Math.round(n / 10) * 10;
  const SPREAD = { high: [0.9, 1.2], medium: [0.85, 1.3], low: [0.8, 1.45] };

  return { SERVICES, BY_ID, normalize, readable, basePrice, floorText, round10, SPREAD };
});
