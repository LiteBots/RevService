/* RevSerwis 6.0 — kreator wyceny krok po kroku (pełny ekran, jedno pytanie na ekranie, przycisk „Wstecz”).
   Wstawiany w element [data-quote-form]. Wysyła to samo zgłoszenie co wcześniej: POST /api/quotes. */
(function () {
  'use strict';

  var PHONE = '735 396 534';
  var PHONE_TEL = '+48735396534';
  var WHATSAPP = 'https://wa.me/48735396534';
  var MAX_PHOTOS = 3;
  var MAX_DATA_URL = 1350000;

  var CATALOG, DIVS, CATS, PHOTOS;
  function loadCatalog() {
    CATALOG = window.RV_DIVISIONS || { groups: [], divisions: [], categories: [], photos: {} };
    DIVS = CATALOG.divisions || [];
    CATS = CATALOG.categories || [];
    PHOTOS = CATALOG.photos || {};
  }
  loadCatalog();
  var byKey = function (slug) { return DIVS.filter(function (d) { return d.slug === slug; })[0]; };
  var catByKey = function (key) { return CATS.filter(function (c) { return c.key === key; })[0]; };

  // Stare adresy ?usluga=… (wersje 3.x) → dział + zakres.
  var LEGACY = {
    przeprowadzka: ['revhome', 'Przeprowadzki'], transport: ['revcargo', 'Transport mebli'], moto: ['revmoto', 'Motocykle'],
    osoby: ['revevent', 'Transport osób'], magazyn: ['revstorage', 'Krótkoterminowe przechowywanie'], oproznianie: ['revhome', 'Opróżnienia'],
    sprzedaz: ['revhome', 'Przygotowanie mieszkania do sprzedaży'], hale: ['revclean', 'Sprzątanie magazynów'], odpady: ['revfacility', 'Wywóz rzeczy'],
    mycie: ['revfacility', 'Mycie kostki'], rozbiorki: ['revbud', 'Rozbiórki'], wycinka: ['revgarden', 'Wycinka drzew'], pnie: ['revgarden', 'Usuwanie korzeni'],
    ziemne: ['revsite', 'Porządkowanie terenu'], dzialki: ['revgarden', 'Porządkowanie działek'], dostawy: ['revcargo', 'Transport palet'],
    hotele: ['revhotel', 'Dostawy'], b2b: ['revb2b', 'Transport']
  };

  // Pola: [klucz, etykieta (trafia do panelu), typ, opcje/placeholder]
  var FLOORS = ['Parter', '1', '2', '3', '4', '5+', 'Dom'];
  var F = {
    from: ['from', 'Skąd', 'text', 'Miejscowość, ulica'],
    to: ['to', 'Dokąd', 'text', 'Miejscowość, ulica'],
    address: ['from', 'Adres', 'text', 'Miejscowość, ulica'],
    area: ['area', 'Powierzchnia (m²)', 'number', 'np. 60'],
    company: ['company', 'Nazwa firmy / obiektu', 'text', ''],
    elevator: ['elevator', 'Winda', 'select', ['Brak windy', 'Przy odbiorze', 'Przy dostawie', 'W obu miejscach']],
    frequency: ['frequency', 'Częstotliwość', 'select', ['Jednorazowo', 'Kilka razy', 'Stała współpraca', 'Na wezwanie']],
    timing: ['timing', 'Kiedy pracujemy', 'select', ['W godzinach pracy', 'Po godzinach', 'W weekend', 'Dowolnie']]
  };
  var ROUTE = { q: 'Skąd i dokąd?', help: 'Wystarczy miejscowość — dokładny adres ustalimy przy kontakcie.', fields: [F.from, F.to] };
  var WHERE = function (q) { return { q: q || 'Gdzie?', help: 'Miejscowość i ulica — wystarczy w przybliżeniu.', fields: [F.address] }; };
  var one = function (q, field, help) { return { q: q, help: help || '', fields: [field] }; };

  // Pytania szczegółowe dla działów — każdy element to jeden ekran.
  var DETAILS = {
    revhome: [ROUTE,
      one('Jak duże jest mieszkanie?', ['size', 'Wielkość', 'select', ['Kilka rzeczy', 'Kawalerka', '2 pokoje', '3 pokoje', '4+ pokoje', 'Dom']]),
      { q: 'Piętra i winda', help: 'Pomaga dobrać liczbę osób w ekipie.', fields: [['floorFrom', 'Piętro — odbiór', 'select', FLOORS], ['floorTo', 'Piętro — dostawa', 'select', FLOORS], F.elevator] },
      one('Czy trzeba rozkręcić lub skręcić meble?', ['assembly', 'Demontaż / montaż mebli', 'select', ['Nie', 'Tak — kilka mebli', 'Tak — większość mebli']])],
    revclean: [WHERE('Gdzie sprzątamy?'),
      one('Jaki to obiekt?', ['objectType', 'Obiekt', 'select', ['Mieszkanie', 'Dom', 'Biuro', 'Magazyn', 'Garaż', 'Piwnica', 'Pusty lokal']]),
      one('Jaka jest powierzchnia?', F.area, 'Wystarczy w przybliżeniu.'),
      one('Jak często?', ['frequency', 'Częstotliwość', 'select', ['Jednorazowo', 'Co tydzień', 'Co miesiąc']])],
    revstorage: [{ q: 'Skąd odbieramy rzeczy?', help: 'Jeśli przywieziesz sam(a), możesz pominąć.', fields: [['from', 'Skąd odbieramy', 'text', 'Miejscowość, ulica'], ['to', 'Dokąd dowozimy (jeśli wiadomo)', 'text', 'Miejscowość, ulica']] },
      one('Ile jest rzeczy?', ['amount', 'Ilość rzeczy', 'select', ['Kilka kartonów / mebli', 'Kawalerka', '2–3 pokoje', 'Dom', 'Wyposażenie firmy']]),
      one('Na jak długo?', ['period', 'Okres przechowania', 'select', ['do 1 miesiąca', '1–3 miesiące', '3–6 miesięcy', 'Dłużej / nie wiem']]),
      one('Odebrać i dowieźć rzeczy?', ['pickup', 'Odbiór i dowóz', 'select', ['Tak, z odbiorem i dowozem', 'Tylko odbiór', 'Przywiozę sam(a)']])],
    revmoto: [{ q: 'Skąd i dokąd?', help: 'Odbieramy także z zagranicy.', fields: [['from', 'Skąd', 'text', 'Miejscowość (także za granicą)'], F.to] },
      { q: 'Ile sztuk i jaki model?', help: 'Model jest opcjonalny.', fields: [['count', 'Liczba sztuk', 'number', '1'], ['model', 'Marka i model', 'text', 'np. Yamaha MT-07']] },
      one('Czy pojazd jest jezdny?', ['running', 'Stan', 'select', ['Jezdny / sprawny', 'Niejezdny / uszkodzony']])],
    revassist: [ROUTE,
      one('Co przewozimy?', ['items', 'Co przewozimy', 'text', 'np. pralka, szafa, kartony']),
      one('Na kiedy?', ['urgency', 'Na kiedy', 'select', ['Dziś', 'Jutro', 'W tym tygodniu', 'Elastycznie']]),
      one('Wnieść lub wynieść?', ['carry', 'Wniesienie / wyniesienie', 'select', ['Tak', 'Nie']])],
    revbud: [WHERE(),
      one('Gdzie pracujemy?', ['objectType', 'Gdzie', 'select', ['Mieszkanie', 'Dom', 'Lokal użytkowy', 'Obiekt na zewnątrz']]),
      { q: 'Powierzchnia i piętro', help: 'W przybliżeniu.', fields: [F.area, ['floor', 'Piętro', 'select', FLOORS]] },
      one('Co z gruzem i materiałami?', ['debris', 'Gruz i materiały', 'select', ['Wynieść i wywieźć', 'Tylko wynieść', 'Bez wywozu']])],
    revgarden: [WHERE('Gdzie jest działka?'),
      one('Jak duży jest teren?', ['area', 'Powierzchnia terenu (m²)', 'number', 'np. 800'], 'W przybliżeniu — np. 800 m² to 8 arów.'),
      { q: 'Drzewa i krzewy', help: 'Jeśli nie dotyczy — pomiń.', fields: [['count', 'Liczba drzew / krzewów', 'number', 'np. 3'], ['height', 'Wysokość drzew', 'select', ['Nie dotyczy', 'do 5 m', '5–10 m', '10–15 m', 'powyżej 15 m']]] },
      one('Co z gałęziami i drewnem?', ['wood', 'Gałęzie i drewno', 'select', ['Wywieźć', 'Rozdrobnić na miejscu', 'Drewno zostaje', 'Do ustalenia']]),
      one('Jaki jest dojazd?', ['access', 'Dojazd', 'select', ['Swobodny', 'Wąski wjazd', 'Brak dojazdu autem']])],
    revsite: [{ q: 'Skąd i dokąd?', help: '', fields: [['from', 'Skąd (hurtownia / baza)', 'text', 'Miejscowość, ulica'], ['to', 'Adres budowy', 'text', 'Miejscowość, ulica']] },
      one('Co przewozimy lub jaki jest zakres?', ['goods', 'Zakres', 'text', 'np. 2 palety bloczków, narzędzia, 4 osoby']),
      one('Jak często?', F.frequency)],
    revwinter: [WHERE(),
      one('Jaki teren?', ['objectType', 'Teren', 'select', ['Parking', 'Podjazd', 'Chodniki', 'Teren firmy', 'Dach (po ocenie)']]),
      one('Jaka jest powierzchnia?', F.area),
      one('Jaka forma?', ['frequency', 'Forma', 'select', ['Abonament Winter Care', 'Jednorazowo / na wezwanie']])],
    revcargo: [ROUTE,
      { q: 'Co przewozimy?', help: 'Ilość, wymiary lub waga — w przybliżeniu.', fields: [['goods', 'Co przewozimy', 'text', 'np. 3 palety, kanapa, okna 6 szt.'], ['weight', 'Waga / wymiary', 'text', 'np. ok. 400 kg, 2,5 m']] },
      one('Wnosimy na miejscu?', ['carry', 'Wniesienie', 'select', ['Z wniesieniem', 'Bez wniesienia']]),
      one('Jak często?', F.frequency)],
    revevent: [{ q: 'Skąd i dokąd?', help: '', fields: [['from', 'Skąd', 'text', 'Adres odbioru'], ['to', 'Dokąd', 'text', 'np. sala weselna, lotnisko Gdańsk']] },
      one('Ile osób jedzie?', ['passengers', 'Liczba pasażerów', 'number', '1']),
      one('Bagaże lub sprzęt?', ['equipment', 'Bagaże / sprzęt', 'select', ['Brak', 'Bagaże', 'Sprzęt muzyczny / scenografia']]),
      one('Potrzebny kurs powrotny?', ['return', 'Kurs powrotny', 'select', ['Nie', 'Tak — tego samego dnia', 'Tak — inny termin']])],
    revfacility: [one('Jaki obiekt obsługujemy?', ['objectType', 'Obiekt', 'select', ['Biuro', 'Sklep', 'Magazyn / hala', 'Wspólnota / blok', 'Hotel / pensjonat', 'Dom / posesja']]),
      { q: 'Gdzie i jak duży?', help: '', fields: [['from', 'Lokalizacja obiektu', 'text', 'Miejscowość, ulica'], F.area] },
      one('Jaka forma współpracy?', ['frequency', 'Forma współpracy', 'select', ['Abonament miesięczny', 'Sezonowo', 'Jednorazowo']])],
    revb2b: [one('Czego potrzebuje Twoja firma?', ['scope', 'Czego potrzebuje firma', 'text', 'np. kierowca + bus 2× w tygodniu, magazyn, odśnieżanie']),
      WHERE('Gdzie działa firma?'),
      one('Jak często?', F.frequency)],
    revoffice: [ROUTE,
      one('Jak duże jest biuro?', ['size', 'Wielkość biura', 'select', ['do 10 stanowisk', '10–30 stanowisk', 'powyżej 30']]),
      one('Czy jest winda?', F.elevator),
      one('Kiedy możemy pracować?', F.timing)],
    revshop: [ROUTE,
      one('Jaki to lokal?', ['objectType', 'Lokal', 'select', ['Sklep', 'Salon', 'Gastronomia', 'Lokal usługowy']]),
      one('Kiedy możemy pracować?', F.timing)],
    revwarehouse: [WHERE('Gdzie jest magazyn?'),
      { q: 'Jaki towar i ile?', help: '', fields: [['goods', 'Towar', 'text', 'np. palety, kartony'], ['count', 'Liczba palet / kartonów', 'number', 'np. 20']] },
      one('Jak często?', ['frequency', 'Częstotliwość', 'select', ['Jednorazowo', 'Regularnie', 'Szczyt sezonu']])],
    revhotel: [one('Jaki to obiekt?', ['objectType', 'Rodzaj obiektu', 'select', ['Hotel', 'Pensjonat', 'Apartamenty / Airbnb', 'Domki letniskowe']]),
      WHERE('Gdzie jest obiekt?'),
      one('Jak często?', ['frequency', 'Współpraca', 'select', ['Jednorazowo', 'W sezonie', 'Cały rok']])],
    '': [WHERE()]
  };

  var WHEN = ['Jak najszybciej', 'W tym tygodniu', 'W tym miesiącu', 'Termin elastyczny'];

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>'"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]; });
  }
  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'rv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
  }
  function normalizePhone(raw) {
    var v = String(raw || '').trim();
    var digits = v.replace(/\D/g, '');
    if (v.indexOf('00') === 0) digits = digits.slice(2);
    return (v.charAt(0) === '+' || v.indexOf('00') === 0 ? '+' : '') + digits;
  }
  function validPhone(raw) {
    var v = String(raw || '').trim();
    var digits = v.replace(/\D/g, '');
    if (v.indexOf('00') === 0) digits = digits.slice(2);
    return /^[+\d\s()-]+$/.test(v) && digits.length >= 7 && digits.length <= 15;
  }
  function photoUrl(key, w, h) {
    var id = PHOTOS[key];
    return id ? 'https://images.unsplash.com/' + id + '?auto=format&fit=crop&w=' + w + (h ? '&h=' + h : '') + '&q=60' : '';
  }
  function dvName(name) { return name && name.indexOf('Rev') === 0 ? 'Rev<b>' + esc(name.slice(3)) + '</b>' : esc(name || ''); }

  function init(root) {
    if (!DIVS.length) { root.innerHTML = '<p>Formularz chwilowo niedostępny. Zadzwoń: <a href="tel:' + PHONE_TEL + '">' + PHONE + '</a>.</p>'; return; }
    var params = new URLSearchParams(location.search);
    var legacy = LEGACY[params.get('usluga')];
    var presetDiv = byKey(params.get('dzial')) ? params.get('dzial') : legacy ? legacy[0] : (byKey(root.getAttribute('data-division')) ? root.getAttribute('data-division') : '');
    var presetScope = params.get('zakres') || (legacy ? legacy[1] : '');

    var state = {
      category: catByKey(params.get('kat')) ? params.get('kat') : '',
      option: -1,               // indeks wybranej opcji w kategorii
      division: null,           // null = jeszcze nie wybrano; '' = „Coś innego”
      scope: '',
      values: {},               // odpowiedzi na pytania szczegółowe (klucz → wartość)
      when: '', date: '',
      description: '',
      photos: [],
      quoteType: params.get('rodzaj') === 'ogledziny' ? 'onsite' : params.get('rodzaj') === 'widelki' ? 'free' : '',
      name: '', phone: '',
      requestId: uuid(),
      busy: false,
      fixedDivision: false      // dział podany w adresie (np. z podstrony działu)
    };
    if (presetDiv) {
      state.division = presetDiv;
      state.fixedDivision = true;
      if (presetScope && byKey(presetDiv).services.indexOf(presetScope) !== -1) state.scope = presetScope;
    }
    if (params.get('miasto')) state.values.from = params.get('miasto');
    if (!presetDiv && params.get('kat') === 'inne') { state.category = 'inne'; state.division = ''; }

    function currentCategory() { return catByKey(state.category); }
    function currentOption() { var c = currentCategory(); return c && state.option >= 0 ? c.options[state.option] : null; }
    function detailSteps() { return state.division === null ? [] : (DETAILS[state.division] || DETAILS['']); }

    // Lista kroków liczona na bieżąco z odpowiedzi.
    function steps() {
      var list = [];
      if (!state.fixedDivision) {
        list.push('category');
        if (state.category && state.category !== 'inne') list.push('option');
      }
      if (state.division && (state.fixedDivision || (currentOption() && !currentOption().scope))) list.push('service');
      detailSteps().forEach(function (s, i) { list.push('detail-' + i); });
      list.push('when', 'describe', 'type', 'contact');
      return list;
    }

    root.innerHTML =
      '<div class="wz" id="wizard">' +
      '<div class="wz-top"><div class="wz-progress" aria-hidden="true"><span id="wz-bar"></span></div>' +
      '<div class="wz-top-row"><button type="button" class="wz-back" id="wz-back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Wstecz</span></button>' +
      '<span class="wz-count" id="wz-count" aria-live="polite"></span>' +
      '<a class="wz-help-link" href="tel:' + PHONE_TEL + '"><i class="fa-solid fa-phone" aria-hidden="true"></i><span>' + PHONE + '</span></a></div></div>' +
      '<form class="wz-form rv-form" id="quote-form" novalidate><div class="wz-stage" id="wz-stage"></div>' +
      '<div class="qf-honey" aria-hidden="true"><label>Strona www<input id="website" tabindex="-1" autocomplete="off"></label></div></form>' +
      '<div class="wz-done" id="quote-success" hidden><div class="wz-done-icon"><i class="fa-solid fa-check" aria-hidden="true"></i></div><h2>Dziękujemy! Zgłoszenie przyjęte.</h2>' +
      '<p id="quote-success-text"></p><p class="wz-done-label">Numer zgłoszenia</p><div class="qf-number" id="quote-number"></div>' +
      '<p>Pilna sprawa? Zadzwoń: <a href="tel:' + PHONE_TEL + '">' + PHONE + '</a> albo <a rel="noopener" target="_blank" href="' + WHATSAPP + '">napisz na WhatsApp</a>.</p>' +
      '<div class="wz-done-actions"><a class="rv-button" href="index.html">Wróć na stronę główną</a><button type="button" class="rv-button ghost" id="quote-again">Nowe zgłoszenie</button></div></div>' +
      '</div>';

    var stage = root.querySelector('#wz-stage');
    var form = root.querySelector('#quote-form');
    var backBtn = root.querySelector('#wz-back');
    var current = '';
    var depth = 0;            // ile kroków kreatora jest w historii przeglądarki

    function optionButton(attrs, title, sub, img, extraClass) {
      return '<button type="button" class="wz-opt' + (img ? ' has-img' : '') + (extraClass ? ' ' + extraClass : '') + '" ' + attrs + '>' +
        (img ? '<span class="wz-opt-img"><img src="' + esc(img) + '" alt="" loading="lazy" decoding="async"></span>' : '') +
        '<span class="wz-opt-text"><strong>' + title + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</span>' +
        '<i class="fa-solid fa-arrow-right wz-opt-go" aria-hidden="true"></i></button>';
    }

    function fieldHtml(f, single) {
      var key = f[0], label = f[1], type = f[2], extra = f[3];
      var id = 'detail-' + key;
      var value = state.values[key] || '';
      if (type === 'select') {
        if (single) {
          return '<div class="wz-opts wz-opts-list" role="radiogroup" aria-label="' + esc(label) + '">' + extra.map(function (o) {
            return '<button type="button" class="wz-opt wz-pick' + (o === value ? ' on' : '') + '" data-key="' + key + '" data-value="' + esc(o) + '" role="radio" aria-checked="' + (o === value) + '"><span class="wz-opt-text"><strong>' + esc(o) + '</strong></span><i class="fa-solid fa-check wz-opt-go" aria-hidden="true"></i></button>';
          }).join('') + '</div>';
        }
        return '<div class="wz-field"><span class="wz-label">' + esc(label) + '</span><div class="wz-chips" role="radiogroup" aria-label="' + esc(label) + '">' + extra.map(function (o) {
          return '<button type="button" class="wz-chip' + (o === value ? ' on' : '') + '" data-key="' + key + '" data-value="' + esc(o) + '" role="radio" aria-checked="' + (o === value) + '">' + esc(o) + '</button>';
        }).join('') + '</div></div>';
      }
      return '<div class="wz-field"><label class="wz-label" for="' + id + '">' + esc(label) + '</label><input id="' + id + '" data-input="' + key + '" type="' + (type === 'number' ? 'number' : 'text') + '"' +
        (type === 'number' ? ' min="0" inputmode="numeric"' : '') + ' maxlength="200" value="' + esc(value) + '" placeholder="' + esc(extra || '') + '"></div>';
    }

    function screen(kicker, question, help, body, nav) {
      return '<section class="wz-step" data-step="' + esc(current) + '"><div class="wz-head">' + (kicker ? '<p class="wz-kicker">' + kicker + '</p>' : '') +
        '<h2 class="wz-q" tabindex="-1">' + question + '</h2>' + (help ? '<p class="wz-help">' + help + '</p>' : '') + '</div>' +
        '<div class="wz-body">' + body + '</div>' + (nav || '') + '</section>';
    }
    function navHtml(nextLabel, skip) {
      return '<div class="wz-nav">' + (skip ? '<button type="button" class="wz-skip" data-skip>Pomiń</button>' : '') +
        '<button type="button" class="rv-button wz-next" data-next>' + (nextLabel || 'Dalej') + ' <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div>';
    }

    function kickerFor() {
      var d = state.division ? byKey(state.division) : null;
      var c = currentCategory();
      var parts = [];
      if (c) parts.push(esc(c.name));
      else if (d) parts.push(dvName(d.name));
      var o = currentOption();
      if (o) parts.push(esc(o.label));
      else if (state.scope) parts.push(esc(state.scope));
      return parts.join(' · ');
    }

    function render(id) {
      current = id;
      var list = steps();
      var index = list.indexOf(id);
      var html = '';
      if (id === 'category') {
        html = screen('', 'Czego potrzebujesz?', 'Wybierz jedną rzecz — resztę ustalimy w kolejnych krokach.',
          '<div class="wz-opts wz-opts-cats">' + CATS.map(function (c) {
            return optionButton('data-cat="' + esc(c.key) + '"', esc(c.name) + (c.soon ? ' <em class="wz-soon">Wkrótce</em>' : ''), esc(c.desc), photoUrl(c.photo, 480, 300), state.category === c.key ? 'on' : '');
          }).join('') + optionButton('data-cat="inne"', 'Coś innego', 'Opiszesz własnymi słowami', '', 'wz-other' + (state.category === 'inne' ? ' on' : '')) + '</div>');
      } else if (id === 'option') {
        var c = currentCategory();
        html = screen(esc(c.name), esc(c.question), '',
          '<div class="wz-opts wz-opts-list">' + c.options.map(function (o, i) {
            return optionButton('data-option="' + i + '"', esc(o.label), esc(o.hint || ''), '', state.option === i ? 'on' : '');
          }).join('') + '</div>');
      } else if (id === 'service') {
        var d = byKey(state.division);
        html = screen(dvName(d.name), 'Co dokładnie mamy zrobić?', esc(d.tagline || ''),
          '<div class="wz-opts wz-opts-list">' + d.services.map(function (s) {
            return optionButton('data-scope="' + esc(s) + '"', esc(s), '', '', state.scope === s ? 'on' : '');
          }).join('') + optionButton('data-scope=""', 'Kilka rzeczy / opiszę sam(a)', '', '', 'wz-other') + '</div>' +
          (state.fixedDivision && CATS.length ? '<p class="wz-switch"><button type="button" data-reset>Szukasz czegoś innego? Wybierz z listy usług</button></p>' : ''));
      } else if (id.indexOf('detail-') === 0) {
        var spec = detailSteps()[Number(id.slice(7))];
        var single = spec.fields.length === 1 && spec.fields[0][2] === 'select';
        html = screen(kickerFor(), esc(spec.q), esc(spec.help || (single ? '' : 'Nie wiesz? Możesz pominąć.')),
          '<div class="wz-fields">' + spec.fields.map(function (f) { return fieldHtml(f, single); }).join('') + '</div>',
          single ? '<div class="wz-nav"><button type="button" class="wz-skip" data-skip>Nie wiem / pomiń</button></div>' : navHtml('Dalej', true));
      } else if (id === 'when') {
        html = screen(kickerFor(), 'Kiedy?', 'Termin potwierdzimy przy kontakcie — formularz go nie rezerwuje.',
          '<div class="wz-opts wz-opts-list">' + WHEN.map(function (w) {
            return '<button type="button" class="wz-opt wz-pick' + (state.when === w ? ' on' : '') + '" data-when="' + esc(w) + '"><span class="wz-opt-text"><strong>' + esc(w) + '</strong></span><i class="fa-solid fa-check wz-opt-go" aria-hidden="true"></i></button>';
          }).join('') +
          '<div class="wz-opt wz-date' + (state.when === 'date' ? ' on' : '') + '"><span class="wz-opt-text"><strong>Konkretny dzień</strong><input type="date" id="date" value="' + esc(state.date) + '" aria-label="Wybierz dzień"></span></div></div>',
          '<div class="wz-nav"><button type="button" class="rv-button wz-next" data-next' + (state.when === 'date' && state.date ? '' : ' hidden') + ' id="wz-date-next">Dalej <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div>');
      } else if (id === 'describe') {
        html = screen(kickerFor(), 'Opisz krótko zlecenie', 'Kilka zdań i zdjęcia (opcjonalnie) — dzięki nim widełki cenowe będą węższe.',
          '<div class="wz-field"><label class="wz-label" for="description">Opis</label><textarea id="description" maxlength="3500" rows="5" placeholder="Co mamy zrobić? Ilości, wymiary, utrudnienia, dogodne godziny…">' + esc(state.description) + '</textarea></div>' +
          '<div class="wz-field"><span class="wz-label">Zdjęcia (maks. 3)</span><div class="qf-photos" id="quote-photos"></div></div><div class="qf-error" id="photo-error" role="alert" hidden></div>',
          navHtml('Dalej', !state.description && !state.photos.length));
      } else if (id === 'type') {
        html = screen(kickerFor(), 'Jaką wycenę wybierasz?', '',
          '<div class="wz-opts wz-types">' +
          '<button type="button" class="wz-opt wz-type' + (state.quoteType === 'free' ? ' on' : '') + '" data-type="free"><span class="wz-opt-text"><em>Bezpłatnie</em><strong>Widełki cenowe</strong><small>Na podstawie opisu i zdjęć podamy przedział ceny od–do. Bez wizyty i bez zobowiązań.</small></span><i class="fa-solid fa-arrow-right wz-opt-go" aria-hidden="true"></i></button>' +
          '<button type="button" class="wz-opt wz-type paid' + (state.quoteType === 'onsite' ? ' on' : '') + '" data-type="onsite"><span class="wz-opt-text"><em>Płatna · z dojazdem</em><strong>Dokładna wycena na miejscu</strong><small>Przyjedziemy na oględziny i podamy rzetelną cenę. Koszt wizyty podamy przy umawianiu.</small></span><i class="fa-solid fa-arrow-right wz-opt-go" aria-hidden="true"></i></button></div>');
      } else if (id === 'contact') {
        html = screen('Ostatni krok', 'Jak się z Tobą skontaktować?', 'Oddzwonimy albo napiszemy SMS.',
          '<div class="wz-fields"><div class="wz-field"><label class="wz-label" for="name">Imię lub firma</label><input id="name" autocomplete="name" maxlength="140" value="' + esc(state.name) + '"></div>' +
          '<div class="wz-field"><label class="wz-label" for="phone">Telefon *</label><input id="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="40" required placeholder="np. 600 100 200" value="' + esc(state.phone) + '"><span class="hint">Numer zagraniczny z prefiksem, np. +49…</span></div></div>' +
          '<div class="wz-summary" id="wz-summary">' + summaryHtml() + '</div>' +
          '<p class="qf-consent"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span>Wysyłając, przekazujesz dane w celu przygotowania wyceny. Szczegóły w <a href="polityka-prywatnosci.html">polityce prywatności</a>. Formularz nie rezerwuje terminu.</span></p>' +
          '<div class="qf-error" id="quote-error" role="alert" hidden></div>',
          '<div class="wz-nav"><button type="submit" class="rv-button wz-next wz-submit" id="quote-submit">' + submitLabel() + '</button></div>');
      }
      stage.innerHTML = html;
      if (id === 'describe') renderPhotos();
      var pct = Math.round(((index + 1) / list.length) * 100);
      root.querySelector('#wz-bar').style.width = pct + '%';
      root.querySelector('#wz-count').textContent = 'Krok ' + (index + 1) + ' z ' + list.length;
      backBtn.hidden = index <= 0;
      var heading = stage.querySelector('.wz-q');
      var firstInput = stage.querySelector('input:not([type=date]):not([type=file]), textarea');
      if (firstInput && window.matchMedia && window.matchMedia('(min-width: 768px)').matches) firstInput.focus();
      else if (heading && heading.focus) heading.focus({ preventScroll: true });
      if (window.scrollTo) window.scrollTo(0, 0);
    }

    function submitLabel() {
      return (state.quoteType === 'onsite' ? 'Umów wycenę z dojazdem ' : 'Poproś o widełki cenowe ') + '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i>';
    }

    function summaryRows() {
      var rows = [];
      var c = currentCategory(), o = currentOption(), d = state.division ? byKey(state.division) : null;
      rows.push(['Usługa', serviceName()]);
      if (c && o && !o.scope) rows.push(['Wybrano', o.label]);
      var from = (state.values.from || '').trim(), to = (state.values.to || '').trim();
      if (from || to) rows.push(['Miejsce', from && to ? from + ' → ' + to : from || to]);
      rows.push(['Termin', dateText() || 'Do ustalenia']);
      rows.push(['Wycena', state.quoteType === 'onsite' ? 'Płatna, z dojazdem na miejsce' : 'Bezpłatne widełki cenowe']);
      if (state.photos.length) rows.push(['Zdjęcia', String(state.photos.length)]);
      void d;
      return rows;
    }
    function summaryHtml() {
      return '<p class="wz-label">Podsumowanie</p><dl>' + summaryRows().map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl>';
    }

    function serviceName() {
      if (state.division === '' || state.division === null) return 'Inne zlecenie';
      var d = byKey(state.division);
      var o = currentOption();
      var detail = state.scope || (o ? o.label : '');
      var s = d.name + (detail ? ' — ' + detail : '');
      return s.length > 80 ? s.slice(0, 79) + '…' : s;
    }

    function dateText() {
      if (state.when === 'date' && state.date) {
        var d = new Date(state.date + 'T12:00:00');
        return isNaN(d) ? state.date : d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      }
      return state.when === 'date' ? '' : state.when;
    }

    function collect() {
      Array.prototype.forEach.call(stage.querySelectorAll('[data-input]'), function (el) { state.values[el.getAttribute('data-input')] = el.value; });
      var desc = stage.querySelector('#description'); if (desc) state.description = desc.value;
      var name = stage.querySelector('#name'); if (name) state.name = name.value;
      var phone = stage.querySelector('#phone'); if (phone) state.phone = phone.value;
    }

    function go(id, push) {
      collect();
      render(id);
      try {
        if (push) { depth += 1; history.pushState({ wz: id, n: depth }, '', location.pathname + location.search + '#' + id); }
        else history.replaceState({ wz: id, n: depth }, '', location.pathname + location.search + '#' + id);
      } catch (e) { /* np. podgląd pliku lokalnego */ }
    }
    function next() {
      collect();
      var list = steps();
      var i = list.indexOf(current);
      if (i < list.length - 1) go(list[i + 1], true);
    }
    function back() {
      collect();
      var list = steps();
      var i = list.indexOf(current);
      if (i > 0) {
        if (depth > 0 && history.state && history.state.wz === current) history.back();
        else go(list[i - 1], false);
      }
    }
    function later(fn) { setTimeout(fn, 160); }

    window.addEventListener('popstate', function (e) {
      var id = e.state && e.state.wz;
      if (e.state && typeof e.state.n === 'number') depth = e.state.n;
      var list = steps();
      if (id && list.indexOf(id) !== -1 && !root.querySelector('#quote-success:not([hidden])')) { collect(); render(id); }
    });
    backBtn.addEventListener('click', back);

    stage.addEventListener('click', function (e) {
      var t = e.target.closest('button, .wz-date');
      if (!t || state.busy) return;
      var mark = function () {
        Array.prototype.forEach.call(t.parentNode.children, function (b) { b.classList.remove('on'); if (b.hasAttribute('aria-checked')) b.setAttribute('aria-checked', 'false'); });
        t.classList.add('on'); if (t.hasAttribute('aria-checked')) t.setAttribute('aria-checked', 'true');
      };
      if (t.hasAttribute('data-cat')) {
        var key = t.getAttribute('data-cat');
        if (key !== state.category) { state.option = -1; state.scope = ''; state.values = state.values.from ? { from: state.values.from } : {}; }
        state.category = key;
        if (key === 'inne') state.division = '';
        else if (state.option < 0) state.division = null;
        mark(); later(next);
      } else if (t.hasAttribute('data-option')) {
        var i = Number(t.getAttribute('data-option'));
        var o = currentCategory().options[i];
        if (o.division !== state.division) state.values = state.values.from ? { from: state.values.from, to: state.values.to || '' } : {};
        state.option = i; state.division = o.division; state.scope = o.scope || '';
        mark(); later(next);
      } else if (t.hasAttribute('data-scope')) {
        state.scope = t.getAttribute('data-scope');
        mark(); later(next);
      } else if (t.classList.contains('wz-pick') && t.hasAttribute('data-key')) {
        state.values[t.getAttribute('data-key')] = t.getAttribute('data-value');
        mark(); later(next);
      } else if (t.classList.contains('wz-chip')) {
        var k = t.getAttribute('data-key');
        state.values[k] = t.classList.contains('on') ? '' : t.getAttribute('data-value');
        var was = t.classList.contains('on');
        mark(); if (was) t.classList.remove('on');
      } else if (t.hasAttribute('data-when')) {
        state.when = t.getAttribute('data-when'); state.date = '';
        mark(); later(next);
      } else if (t.classList.contains('wz-date')) {
        state.when = 'date';
        mark();
        var input = t.querySelector('input');
        if (e.target !== input && input) { try { input.showPicker ? input.showPicker() : input.focus(); } catch (err) { input.focus(); } }
      } else if (t.hasAttribute('data-type')) {
        state.quoteType = t.getAttribute('data-type');
        mark(); later(next);
      } else if (t.hasAttribute('data-reset')) {
        state.fixedDivision = false; state.division = null; state.scope = ''; state.category = ''; state.option = -1; state.values = {};
        go('category', true);
      } else if (t.hasAttribute('data-next')) {
        next();
      } else if (t.hasAttribute('data-skip')) {
        if (current.indexOf('detail-') === 0) {
          var spec = detailSteps()[Number(current.slice(7))];
          spec.fields.forEach(function (f) { if (f[2] === 'select') delete state.values[f[0]]; });
        }
        next();
      } else if (t.hasAttribute('data-remove')) {
        state.photos.splice(Number(t.getAttribute('data-remove')), 1);
        renderPhotos();
      }
    });

    stage.addEventListener('change', function (e) {
      if (e.target.id === 'date') {
        state.when = 'date'; state.date = e.target.value;
        var btn = stage.querySelector('#wz-date-next'); if (btn) btn.hidden = !state.date;
        var box = e.target.closest('.wz-date'); if (box) { Array.prototype.forEach.call(box.parentNode.children, function (b) { b.classList.remove('on'); }); box.classList.add('on'); }
      } else if (e.target.id === 'quote-file') {
        addPhotos(e.target.files);
      }
    });
    stage.addEventListener('input', function (e) {
      if (e.target.id === 'description') {
        var skip = stage.querySelector('[data-skip]');
        if (skip) skip.hidden = !!e.target.value.trim();
      }
    });
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'tel') { e.preventDefault(); next(); }
    });

    function renderPhotos() {
      var box = stage.querySelector('#quote-photos');
      if (!box) return;
      box.innerHTML = state.photos.map(function (p, i) {
        return '<div class="qf-photo"><img src="' + p.data + '" alt="Zdjęcie ' + (i + 1) + '"><button type="button" data-remove="' + i + '" aria-label="Usuń zdjęcie"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>';
      }).join('') + (state.photos.length < MAX_PHOTOS
        ? '<label class="qf-add"><i class="fa-solid fa-camera" aria-hidden="true"></i>Dodaj zdjęcie<input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple id="quote-file"></label>'
        : '');
      var skip = stage.querySelector('[data-skip]');
      if (skip) skip.hidden = !!(state.photos.length || state.description.trim());
    }

    function resize(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onerror = function () { reject(new Error('Nie można odczytać pliku.')); };
        reader.onload = function () {
          var img = new Image();
          img.onerror = function () { reject(new Error('Ten format zdjęcia nie jest obsługiwany. Wybierz JPG lub PNG.')); };
          img.onload = function () {
            var max = 1600, w = img.naturalWidth, h = img.naturalHeight;
            var scale = Math.min(1, max / Math.max(w, h));
            var canvas = document.createElement('canvas');
            canvas.width = Math.round(w * scale);
            canvas.height = Math.round(h * scale);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            var q = 0.82, data = canvas.toDataURL('image/jpeg', q);
            while (data.length > MAX_DATA_URL && q > 0.4) { q -= 0.1; data = canvas.toDataURL('image/jpeg', q); }
            if (data.length > MAX_DATA_URL) return reject(new Error('Zdjęcie jest za duże.'));
            resolve({ data: data });
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }
    function addPhotos(files) {
      collect();
      var list = Array.prototype.slice.call(files || [], 0, MAX_PHOTOS - state.photos.length);
      var err = stage.querySelector('#photo-error');
      if (err) err.hidden = true;
      list.reduce(function (p, f) {
        return p.then(function () { return resize(f).then(function (photo) { state.photos.push(photo); }); });
      }, Promise.resolve()).catch(function (e) { if (err) { err.textContent = e.message; err.hidden = false; } }).then(renderPhotos);
    }

    function payload() {
      var d = state.division ? byKey(state.division) : null;
      var c = currentCategory(), o = currentOption();
      var details = { 'Rodzaj wyceny': state.quoteType === 'onsite' ? 'Płatna z dojazdem (oględziny)' : 'Bezpłatna — widełki cenowe' };
      if (c) details['Kategoria'] = c.name;
      if (o && o.label !== state.scope) details['Wybrana opcja'] = o.label;
      if (d) details['Dział'] = d.name;
      if (state.scope) details['Zakres'] = state.scope;
      detailSteps().forEach(function (spec) {
        spec.fields.forEach(function (f) {
          var v = String(state.values[f[0]] || '').trim();
          if (v && f[0] !== 'from' && f[0] !== 'to' && Object.keys(details).length < 19) details[f[1]] = v.slice(0, 200);
        });
      });
      var from = String(state.values.from || '').trim(), to = String(state.values.to || '').trim();
      var route = from && to ? from + ' → ' + to : (from || to);
      return {
        service: serviceName(),
        division: d ? d.slug : '',
        quoteType: state.quoteType === 'onsite' ? 'onsite' : 'free',
        route: route.slice(0, 300),
        date: (dateText() || 'Do ustalenia').slice(0, 200),
        description: state.description.trim().slice(0, 3500),
        clientName: state.name.trim().slice(0, 140),
        phone: normalizePhone(state.phone),
        requestId: state.requestId,
        website: root.querySelector('#website').value,
        details: details,
        photos: state.photos
      };
    }

    function showError(message) {
      var box = stage.querySelector('#quote-error');
      if (!box) return;
      box.textContent = message || '';
      box.hidden = !message;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (current !== 'contact') { next(); return; }
      if (state.busy) return;
      collect();
      if (!validPhone(state.phone)) {
        showError('Wpisz prawidłowy numer telefonu. Dla numerów zagranicznych dodaj prefiks, np. +49.');
        var ph = stage.querySelector('#phone'); if (ph) ph.focus();
        return;
      }
      showError('');
      state.busy = true;
      var submit = stage.querySelector('#quote-submit');
      submit.disabled = true;
      submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Wysyłanie…';
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 45000) : null;
      fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
        signal: controller ? controller.signal : undefined
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok || !data.success) throw new Error(data.message || 'Nie udało się wysłać zgłoszenia. Spróbuj ponownie lub zadzwoń: ' + PHONE + '.');
          return data;
        });
      }).then(function (data) {
        root.querySelector('#quote-number').textContent = data.number || '';
        root.querySelector('#quote-success-text').textContent = state.quoteType === 'onsite'
          ? 'Zadzwonimy, aby umówić termin oględzin i podać koszt wizyty.'
          : 'Odezwiemy się z widełkami cenowymi (od–do). Jeśli zechcesz dokładną cenę, umówimy płatne oględziny.';
        form.hidden = true;
        root.querySelector('.wz-top').hidden = true;
        root.querySelector('#quote-success').hidden = false;
        if (window.scrollTo) window.scrollTo(0, 0);
        if (typeof window.gtag === 'function') window.gtag('event', 'generate_lead', { division: state.division || 'inne' });
      }).catch(function (err) {
        showError(err && err.name === 'AbortError' ? 'Przekroczono czas wysyłania. Sprawdź internet i spróbuj ponownie.' : (err.message || 'Błąd wysyłania.'));
      }).then(function () {
        if (timer) clearTimeout(timer);
        state.busy = false;
        var s = stage.querySelector('#quote-submit');
        if (s) { s.disabled = false; s.innerHTML = submitLabel(); }
      });
    });

    root.querySelector('#quote-again').addEventListener('click', function () {
      state.requestId = uuid();
      state.photos = []; state.values = {}; state.description = ''; state.when = ''; state.date = '';
      if (!state.fixedDivision) { state.category = ''; state.option = -1; state.division = null; state.scope = ''; }
      form.hidden = false;
      root.querySelector('.wz-top').hidden = false;
      root.querySelector('#quote-success').hidden = true;
      go(steps()[0], false);
    });

    // Start: pierwszy krok bez odpowiedzi (np. ?kat=ogrod → od razu „Co robimy na działce?”).
    var list = steps();
    var start = list[0];
    if (state.category && list.indexOf('option') !== -1) start = 'option';
    else if (state.category === 'inne') start = list[1];
    else if (state.fixedDivision) start = state.scope ? (list[list.indexOf('service') + 1] || list[0]) : list[0];
    if (state.fixedDivision && state.scope && list.indexOf('service') !== -1) start = list[list.indexOf('service') + 1];
    go(start, false);
  }

  var retried = false;
  function start() {
    // Zapas: gdyby plik z działami (assets/divisions.<hash>.js) nie wczytał się, dociągamy wersję bez hasha.
    if (!window.RV_DIVISIONS && !retried && document.querySelector('[data-quote-form]')) {
      retried = true;
      var tag = document.createElement('script');
      tag.src = '/assets/divisions.js?v=' + Date.now();
      tag.onload = function () { loadCatalog(); start(); };
      tag.onerror = function () { start(); };
      document.head.appendChild(tag);
      return;
    }
    loadCatalog();
    Array.prototype.forEach.call(document.querySelectorAll('[data-quote-form]'), function (root) {
      if (!root.getAttribute('data-ready')) { root.setAttribute('data-ready', '1'); init(root); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
