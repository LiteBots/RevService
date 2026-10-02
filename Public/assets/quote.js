/* RevSerwis — formularz wyceny ze zdjęciami (wstawiany w [data-quote-form]) */
(function () {
  'use strict';

  var PHONE = '735 396 534';
  var PHONE_TEL = '+48735396534';
  var WHATSAPP = 'https://wa.me/48735396534';
  var MAX_PHOTOS = 3;
  var MAX_DATA_URL = 1350000;

  var GROUPS = [
    ['transport', 'Transport i przeprowadzki'],
    ['porzadki', 'Opróżnianie i sprzątanie'],
    ['posesja', 'Posesja, ogród i rozbiórki'],
    ['firmy', 'Dla firm i obiektów']
  ];
  var SERVICES = [
    { key: 'przeprowadzka', label: 'Przeprowadzka', icon: 'fa-truck-moving', group: 'transport' },
    { key: 'transport', label: 'Transport z wniesieniem', icon: 'fa-dolly', group: 'transport' },
    { key: 'moto', label: 'Transport motocykla / quada / skutera', short: 'Motocykl / quad / skuter', icon: 'fa-motorcycle', group: 'transport', isNew: true },
    { key: 'osoby', label: 'Przewóz osób / Transfer', icon: 'fa-van-shuttle', group: 'transport' },
    { key: 'magazyn', label: 'Magazynowanie mienia', icon: 'fa-warehouse', group: 'transport' },
    { key: 'oproznianie', label: 'Opróżnianie i utylizacja', icon: 'fa-dumpster', group: 'porzadki' },
    { key: 'sprzedaz', label: 'Przygotowanie nieruchomości do sprzedaży', short: 'Przygotowanie do sprzedaży', icon: 'fa-house-circle-check', group: 'porzadki' },
    { key: 'hale', label: 'Czyszczenie hal i garaży', icon: 'fa-broom', group: 'porzadki' },
    { key: 'odpady', label: 'Odbiór odpadów i gabarytów', icon: 'fa-recycle', group: 'porzadki' },
    { key: 'mycie', label: 'Mycie ciśnieniowe', icon: 'fa-shower', group: 'porzadki' },
    { key: 'rozbiorki', label: 'Rozbiórki i wyburzenia', icon: 'fa-house-crack', group: 'posesja' },
    { key: 'wycinka', label: 'Wycinka drzew i krzewów', icon: 'fa-tree', group: 'posesja' },
    { key: 'pnie', label: 'Usuwanie pni i korzeni', icon: 'fa-circle-dot', group: 'posesja' },
    { key: 'ziemne', label: 'Prace ziemne i koparkowe', icon: 'fa-person-digging', group: 'posesja' },
    { key: 'dzialki', label: 'Porządkowanie działek i posesji', short: 'Porządkowanie działki', icon: 'fa-leaf', group: 'posesja' },
    { key: 'dostawy', label: 'Stałe dostawy dla firm', icon: 'fa-route', group: 'firmy' },
    { key: 'hotele', label: 'Stałe trasy — hotele i pensjonaty', short: 'Hotele i pensjonaty', icon: 'fa-hotel', group: 'firmy' },
    { key: 'b2b', label: 'Współpraca B2B', icon: 'fa-building', group: 'firmy' }
  ];

  // Pola szczegółów: [klucz, etykieta (trafia do panelu), typ, opcje/placeholder, pełna szerokość]
  var F = {
    from: ['from', 'Skąd / adres', 'text', 'Miejscowość, ulica'],
    to: ['to', 'Dokąd', 'text', 'Miejscowość, ulica'],
    floorFrom: ['floorFrom', 'Piętro — odbiór', 'select', ['Parter', '1', '2', '3', '4', '5+', 'Dom']],
    floorTo: ['floorTo', 'Piętro — dostawa', 'select', ['Parter', '1', '2', '3', '4', '5+', 'Dom']],
    elevator: ['elevator', 'Winda', 'select', ['Brak windy', 'Przy odbiorze', 'Przy dostawie', 'W obu miejscach']]
  };
  var DETAILS = {
    przeprowadzka: [
      F.from, F.to, F.floorFrom, F.floorTo, F.elevator,
      ['size', 'Wielkość przeprowadzki', 'select', ['Kilka rzeczy', 'Kawalerka', '2 pokoje', '3 pokoje', '4+ pokoje', 'Dom', 'Biuro']],
      ['packing', 'Pakowanie', 'select', ['Pakuję sam(a)', 'Potrzebuję pomocy w pakowaniu']],
      ['assembly', 'Demontaż / montaż mebli', 'select', ['Nie', 'Tak — kilka mebli', 'Tak — większość mebli']]
    ],
    transport: [
      ['from', 'Skąd (sklep / adres)', 'text', 'np. IKEA Gdańsk, zamówienie nr…'], F.to,
      ['items', 'Co przewozimy', 'text', 'np. kanapa 3-os., pralka', true],
      F.floorTo, ['carry', 'Wniesienie', 'select', ['Tak, z wniesieniem', 'Nie, tylko transport']]
    ],
    osoby: [
      ['from', 'Skąd', 'text', 'Adres odbioru'], ['to', 'Dokąd', 'text', 'np. Lotnisko Gdańsk'],
      ['passengers', 'Liczba pasażerów', 'number', '1'], ['luggage', 'Bagaże', 'select', ['Podręczne', '1 walizka / os.', 'Dużo bagażu']],
      ['return', 'Kurs powrotny', 'select', ['Nie', 'Tak — tego samego dnia', 'Tak — inny termin']], ['flight', 'Nr lotu (opcjonalnie)', 'text', 'np. FR1234']
    ],
    oproznianie: [
      ['from', 'Adres obiektu', 'text', 'Miejscowość, ulica', true],
      ['objectType', 'Co opróżniamy', 'select', ['Mieszkanie', 'Dom', 'Piwnica / strych', 'Garaż', 'Lokal firmowy', 'Posesja']],
      ['area', 'Powierzchnia (m²)', 'number', 'np. 50'], ['floor', 'Piętro', 'select', ['Parter', '1', '2', '3', '4', '5+']],
      ['cleaning', 'Sprzątanie po opróżnieniu', 'select', ['Nie', 'Tak, podstawowe']]
    ],
    odpady: [
      ['from', 'Adres odbioru', 'text', 'Miejscowość, ulica', true],
      ['wasteType', 'Co odbieramy', 'select', ['Meble', 'AGD / RTV', 'Odpady zielone', 'Mieszane gabaryty', 'Inne (opisz)']],
      ['amount', 'Ilość', 'text', 'np. kanapa + 2 szafy'], ['carry', 'Wyniesienie z lokalu', 'select', ['Tak, trzeba wynieść', 'Nie, rzeczy są na zewnątrz']]
    ],
    mycie: [
      ['from', 'Adres', 'text', 'Miejscowość, ulica', true],
      ['surface', 'Co myjemy', 'select', ['Kostka / podjazd', 'Taras', 'Elewacja', 'Ogrodzenie', 'Parking / teren firmy', 'Inne']],
      ['area', 'Metraż (m²)', 'number', 'np. 80'], ['water', 'Dostęp do wody', 'select', ['Tak', 'Nie', 'Nie wiem']]
    ],
    rozbiorki: [
      ['from', 'Adres', 'text', 'Miejscowość, ulica', true],
      ['objectType', 'Co rozbieramy', 'select', ['Wiata', 'Altana', 'Szopa / komórka', 'Garaż blaszany', 'Drewutnia', 'Ogrodzenie', 'Taras / podest', 'Inne (opisz)']],
      ['material', 'Materiał', 'select', ['Drewno', 'Blacha / metal', 'Mur / pustak / beton', 'Mieszany', 'Nie wiem']],
      ['size', 'Przybliżone wymiary', 'text', 'np. 3 × 4 m'],
      ['foundation', 'Fundament / wylewka', 'select', ['Brak', 'Jest — do usunięcia', 'Jest — zostaje', 'Nie wiem']],
      ['removal', 'Wywóz materiałów', 'select', ['Tak, z wywozem', 'Bez wywozu']]
    ],
    wycinka: [
      ['from', 'Adres', 'text', 'Miejscowość, ulica', true],
      ['what', 'Co wycinamy', 'select', ['Drzewo / drzewa', 'Krzewy / żywopłot', 'Drzewa i krzewy', 'Samosiejki / zarośla']],
      ['count', 'Liczba drzew / krzewów', 'number', 'np. 3'],
      ['height', 'Wysokość', 'select', ['do 5 m', '5–10 m', '10–15 m', 'powyżej 15 m', 'Nie wiem']],
      ['obstacles', 'Otoczenie', 'select', ['Wolna przestrzeń', 'Blisko budynku', 'Nad ogrodzeniem / linią', 'Trudny dojazd']],
      ['wood', 'Drewno i gałęzie', 'select', ['Wywieźć wszystko', 'Drewno zostaje pocięte', 'Do ustalenia']],
      ['stumps', 'Usunięcie pni', 'select', ['Nie', 'Tak, usunąć pnie']]
    ],
    pnie: [
      ['from', 'Adres', 'text', 'Miejscowość, ulica', true],
      ['count', 'Liczba pni', 'number', 'np. 2'],
      ['diameter', 'Średnica pnia', 'select', ['do 30 cm', '30–60 cm', 'powyżej 60 cm', 'Różne']],
      ['access', 'Dojazd', 'select', ['Swobodny dojazd', 'Wąskie przejście', 'Brak dojazdu sprzętem']],
      ['fill', 'Zasypanie i wyrównanie', 'select', ['Tak', 'Nie']]
    ],
    ziemne: [
      ['from', 'Adres / działka', 'text', 'Miejscowość, ulica lub nr działki', true],
      ['workType', 'Rodzaj prac', 'select', ['Wykopy (fundament, przyłącze)', 'Niwelacja / wyrównanie terenu', 'Korytowanie pod kostkę / podjazd', 'Rowy / drenaż', 'Usuwanie ziemi / gruzu', 'Inne (opisz)']],
      ['size', 'Wymiary / metraż', 'text', 'np. 20 m × 0,6 m × 1 m'],
      ['access', 'Wjazd na działkę', 'select', ['Swobodny', 'Wąski wjazd', 'Nie wiem']],
      ['soil', 'Urobek', 'select', ['Wywieźć', 'Zostaje na działce', 'Do ustalenia']]
    ],
    dzialki: [
      ['from', 'Adres / działka', 'text', 'Miejscowość, ulica lub nr działki', true],
      ['plotType', 'Rodzaj terenu', 'select', ['Działka niezabudowana', 'Posesja z domem', 'Ogród', 'Teren firmy']],
      ['area', 'Powierzchnia (m²)', 'number', 'np. 800'],
      ['scope', 'Zakres prac', 'text', 'np. wykaszanie, zarośla, wywóz śmieci', true],
      ['frequency', 'Częstotliwość', 'select', ['Jednorazowo', 'Cyklicznie']]
    ],
    sprzedaz: [
      ['from', 'Adres nieruchomości', 'text', 'Miejscowość, ulica', true],
      ['objectType', 'Nieruchomość', 'select', ['Mieszkanie', 'Dom', 'Dom z ogrodem', 'Lokal użytkowy']],
      ['area', 'Powierzchnia (m²)', 'number', 'np. 70'],
      ['scope', 'Zakres', 'select', ['Opróżnianie', 'Opróżnianie + sprzątanie', 'Komplet z posesją (ogród, podjazd)', 'Do ustalenia']],
      ['extras', 'Dodatkowo', 'text', 'np. mycie podjazdu, koszenie, przechowanie mebli', true],
      ['deadline', 'Na kiedy', 'select', ['Jak najszybciej', 'Do 2 tygodni', 'Do miesiąca', 'Elastycznie']]
    ],
    hale: [
      ['from', 'Adres obiektu', 'text', 'Miejscowość, ulica', true],
      ['objectType', 'Obiekt', 'select', ['Hala / magazyn', 'Garaż', 'Warsztat', 'Wiata / zadaszenie']],
      ['area', 'Powierzchnia (m²)', 'number', 'np. 300'],
      ['scope', 'Zakres', 'select', ['Opróżnienie i sprzątanie', 'Sprzątanie / mycie posadzki', 'Wywóz odpadów', 'Kompleksowo']],
      ['frequency', 'Częstotliwość', 'select', ['Jednorazowo', 'Cyklicznie']]
    ],
    magazyn: [
      ['from', 'Skąd odbieramy', 'text', 'Miejscowość, ulica'], ['to', 'Dokąd dowozimy (jeśli wiadomo)', 'text', 'Miejscowość, ulica'],
      ['amount', 'Ilość rzeczy', 'select', ['Kilka kartonów / mebli', 'Kawalerka', '2–3 pokoje', 'Dom', 'Wyposażenie firmy']],
      ['period', 'Okres przechowania', 'select', ['do 1 miesiąca', '1–3 miesiące', '3–6 miesięcy', 'Dłużej / nie wiem']],
      ['pickup', 'Odbiór i dowóz', 'select', ['Tak, z odbiorem i dowozem', 'Tylko odbiór', 'Dowiozę sam(a)']],
      F.floorFrom
    ],
    moto: [
      ['from', 'Skąd', 'text', 'Miejscowość, ulica (także za granicą)'], ['to', 'Dokąd', 'text', 'Miejscowość, ulica'],
      ['vehicle', 'Pojazd', 'select', ['Motocykl', 'Skuter / motorower', 'Quad / ATV', 'Kilka pojazdów']],
      ['count', 'Liczba pojazdów', 'number', '1'],
      ['model', 'Marka i model (opcjonalnie)', 'text', 'np. Yamaha MT-07'],
      ['running', 'Stan', 'select', ['Jezdny', 'Niejezdny / uszkodzony']]
    ],
    dostawy: [
      ['company', 'Nazwa firmy', 'text', ''], ['from', 'Lokalizacja / magazyn', 'text', 'Miejscowość'],
      ['goods', 'Co przewozimy', 'text', 'np. meble, palety, towar dla sklepów', true],
      ['frequency', 'Częstotliwość', 'select', ['Codziennie', 'Kilka razy w tygodniu', 'Co tydzień', 'Co miesiąc', 'Na wezwanie']],
      ['area', 'Obszar', 'select', ['Słupsk i okolice', 'Pomorze', 'Cała Polska', 'Polska i UE']]
    ],
    hotele: [
      ['company', 'Nazwa obiektu', 'text', ''], ['from', 'Lokalizacja', 'text', 'Miejscowość'],
      ['objectType', 'Rodzaj obiektu', 'select', ['Hotel', 'Pensjonat', 'Apartamenty / kwatery', 'Ośrodek wypoczynkowy']],
      ['scope', 'Czego potrzebujesz', 'select', ['Transfery gości', 'Dostawy / zaopatrzenie', 'Przewozy pościeli i tekstyliów', 'Wywóz gabarytów', 'Kilka usług']],
      ['frequency', 'Częstotliwość', 'select', ['Codziennie', 'Kilka razy w tygodniu', 'Tylko w sezonie', 'Na wezwanie']]
    ],
    b2b: [
      ['company', 'Nazwa firmy', 'text', ''], ['from', 'Lokalizacja', 'text', 'Miejscowość'],
      ['frequency', 'Częstotliwość', 'select', ['Jednorazowo', 'Co tydzień', 'Co miesiąc', 'Stała współpraca']],
      ['scope', 'Rodzaj zleceń', 'text', 'np. dostawy mebli, relokacja biura', true]
    ]
  };

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

  function init(root) {
    var params = new URLSearchParams(location.search);
    var initial = params.get('usluga');
    var city = params.get('miasto');
    var state = {
      service: SERVICES.some(function (s) { return s.key === initial; }) ? initial : 'przeprowadzka',
      draft: {},
      photos: [],
      requestId: uuid(),
      busy: false
    };
    if (city) state.draft.from = city;

    root.innerHTML =
      '<div class="qf">' +
      '<form class="qf-card rv-form" id="quote-form" novalidate>' +
      '<div class="qf-steps" aria-hidden="true"><span class="on"></span><span></span><span></span></div>' +
      '<p class="qf-title">1. Wybierz usługę</p><p class="qf-sub">Dopasujemy pytania do rodzaju zlecenia.</p>' +
      '<div class="qf-services" role="radiogroup" aria-label="Usługa">' + GROUPS.map(function (g) {
        return '<p class="qf-group">' + esc(g[1]) + '</p>' + SERVICES.filter(function (s) { return s.group === g[0]; }).map(function (s) {
          return '<div class="qf-service"><input type="radio" name="service" id="svc-' + s.key + '" value="' + s.key + '"' + (s.key === state.service ? ' checked' : '') + '><label for="svc-' + s.key + '"><i class="fa-solid ' + s.icon + '" aria-hidden="true"></i>' + esc(s.short || s.label) + (s.isNew ? '<em class="qf-new">Nowość</em>' : '') + '</label></div>';
        }).join('');
      }).join('') + '</div>' +
      '<p class="qf-title">2. Szczegóły</p><p class="qf-sub">Im więcej wiemy, tym dokładniejsza wycena.</p>' +
      '<div class="qf-grid" id="quote-details"></div>' +
      '<div class="qf-section">Termin i opis</div>' +
      '<div class="qf-grid">' +
      '<div class="qf-field"><label for="date">Preferowany termin</label><input id="date" type="date"></div>' +
      '<div class="qf-field"><label for="time">Pora dnia</label><select id="time"><option value="">Dowolna</option><option>Rano</option><option>Południe</option><option>Popołudnie</option><option>Wieczór</option></select></div>' +
      '<div class="qf-field full"><label for="description">Opis zlecenia</label><textarea id="description" maxlength="3500" placeholder="Co mamy zrobić? Utrudnienia, wymiary, rzeczy delikatne, dogodne godziny…"></textarea></div>' +
      '</div>' +
      '<div class="qf-section">Zdjęcia (opcjonalnie, maks. 3)</div>' +
      '<div class="qf-photos" id="quote-photos"></div>' +
      '<p class="qf-title" style="margin-top:26px">3. Kontakt</p><p class="qf-sub">Oddzwonimy lub napiszemy SMS z propozycją.</p>' +
      '<div class="qf-grid">' +
      '<div class="qf-field"><label for="name">Imię / firma</label><input id="name" autocomplete="name" maxlength="140"></div>' +
      '<div class="qf-field"><label for="phone">Telefon *</label><input id="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="40" required placeholder="np. 600 100 200"><span class="hint">Numery zagraniczne z prefiksem, np. +49…</span></div>' +
      '</div>' +
      '<div class="qf-honey" aria-hidden="true"><label>Strona www<input id="website" tabindex="-1" autocomplete="off"></label></div>' +
      '<p class="qf-consent"><i class="fa-solid fa-shield-halved" style="color:var(--rv-accent);margin-top:3px" aria-hidden="true"></i><span>Wysyłając formularz, przekazujesz dane w celu przygotowania wyceny. Szczegóły w <a href="polityka-prywatnosci.html">polityce prywatności</a>. Formularz nie rezerwuje terminu.</span></p>' +
      '<div class="qf-error" id="quote-error" role="alert" hidden></div>' +
      '<div class="qf-actions"><button class="rv-button" type="submit" id="quote-submit">Wyślij zapytanie <i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button></div>' +
      '</form>' +
      '<div class="qf-card qf-success" id="quote-success" hidden><div class="icon"><i class="fa-solid fa-check" aria-hidden="true"></i></div><h3>Dziękujemy! Zgłoszenie przyjęte.</h3><p>Numer Twojego zgłoszenia:</p><div class="qf-number" id="quote-number"></div><p>Skontaktujemy się najszybciej, jak to możliwe. Pilna sprawa? Zadzwoń: <a class="text-brand-400" href="tel:' + PHONE_TEL + '">' + PHONE + '</a> lub <a class="text-brand-400" rel="noopener" target="_blank" href="' + WHATSAPP + '">napisz na WhatsApp</a>.</p><div class="qf-actions" style="justify-content:center"><button type="button" class="rv-button ghost" id="quote-again">Wyślij kolejne zapytanie</button></div></div>' +
      '<aside class="qf-aside">' +
      '<div class="glass-card static"><h3><i class="fa-solid fa-bolt" style="color:var(--rv-accent)" aria-hidden="true"></i> Jak to działa?</h3><ul><li>Wysyłasz zgłoszenie — to nic nie kosztuje.</li><li>Oddzwaniamy, doprecyzowujemy zakres.</li><li>Dostajesz cenę i termin do akceptacji.</li></ul></div>' +
      '<div class="glass-card static"><h3>Wolisz porozmawiać?</h3><p>Zadzwoń lub napisz na WhatsApp — ustalimy wszystko od ręki.</p><a class="rv-button ghost" style="width:100%;margin-top:10px" href="tel:' + PHONE_TEL + '"><i class="fa-solid fa-phone" aria-hidden="true"></i> ' + PHONE + '</a>' +
      '<a class="rv-button wa" style="width:100%;margin-top:10px" rel="noopener" target="_blank" href="' + WHATSAPP + '?text=' + encodeURIComponent('Dzień dobry, chciałbym zapytać o wycenę.') + '"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Napisz na WhatsApp</a>' +
      '<p style="margin-top:10px;font-size:13px;color:var(--rv-muted)">Na WhatsApp możesz od razu wysłać więcej zdjęć lub film.</p></div>' +
      '</aside></div>';

    var form = root.querySelector('#quote-form');
    var detailsBox = root.querySelector('#quote-details');
    var photosBox = root.querySelector('#quote-photos');
    var errorBox = root.querySelector('#quote-error');
    var submit = root.querySelector('#quote-submit');
    var steps = root.querySelectorAll('.qf-steps span');

    function saveDraft() {
      Array.prototype.forEach.call(detailsBox.querySelectorAll('[data-key]'), function (el) {
        state.draft[el.getAttribute('data-key')] = el.value;
      });
    }

    function renderDetails() {
      var list = DETAILS[state.service] || [];
      detailsBox.innerHTML = list.map(function (f) {
        var key = f[0], label = f[1], type = f[2], extra = f[3], full = f[4];
        var id = 'detail-' + key;
        var value = state.draft[key] || '';
        var input;
        if (type === 'select') {
          input = '<select id="' + id + '" data-key="' + key + '" data-label="' + esc(label) + '"><option value="">— wybierz —</option>' + extra.map(function (o) { return '<option' + (o === value ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
        } else {
          input = '<input id="' + id + '" data-key="' + key + '" data-label="' + esc(label) + '" type="' + (type === 'number' ? 'number' : 'text') + '"' + (type === 'number' ? ' min="0" inputmode="numeric"' : '') + ' maxlength="200" value="' + esc(value) + '" placeholder="' + esc(extra || '') + '">';
        }
        return '<div class="qf-field' + (full ? ' full' : '') + '"><label for="' + id + '">' + esc(label) + '</label>' + input + '</div>';
      }).join('');
    }

    function renderPhotos() {
      photosBox.innerHTML = state.photos.map(function (p, i) {
        return '<div class="qf-photo"><img src="' + p.data + '" alt="Zdjęcie ' + (i + 1) + '"><button type="button" data-remove="' + i + '" aria-label="Usuń zdjęcie"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>';
      }).join('') + (state.photos.length < MAX_PHOTOS
        ? '<label class="qf-add"><i class="fa-solid fa-camera" aria-hidden="true"></i>Dodaj zdjęcie<input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple id="quote-file"></label>'
        : '');
      var file = photosBox.querySelector('#quote-file');
      if (file) file.addEventListener('change', function () { addPhotos(file.files); });
    }

    function progress() {
      var phone = root.querySelector('#phone').value.trim();
      var detailsFilled = Array.prototype.some.call(detailsBox.querySelectorAll('[data-key]'), function (el) { return el.value; }) || root.querySelector('#description').value.trim();
      var level = 1 + (detailsFilled ? 1 : 0) + (phone ? 1 : 0);
      Array.prototype.forEach.call(steps, function (s, i) { s.classList.toggle('on', i < level); });
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
      var list = Array.prototype.slice.call(files || [], 0, MAX_PHOTOS - state.photos.length);
      showError('');
      list.reduce(function (p, f) {
        return p.then(function () { return resize(f).then(function (photo) { state.photos.push(photo); }); });
      }, Promise.resolve()).catch(function (e) { showError(e.message); }).then(renderPhotos);
    }

    function showError(message) {
      errorBox.textContent = message || '';
      errorBox.hidden = !message;
    }

    function payload() {
      saveDraft();
      var svc = SERVICES.filter(function (s) { return s.key === state.service; })[0];
      var details = {};
      Array.prototype.forEach.call(detailsBox.querySelectorAll('[data-key]'), function (el) {
        var v = String(el.value || '').trim();
        if (v && ['from', 'to'].indexOf(el.getAttribute('data-key')) === -1) details[el.getAttribute('data-label')] = v.slice(0, 200);
      });
      var from = (state.draft.from || '').trim();
      var to = (state.draft.to || '').trim();
      var route = from && to ? from + ' → ' + to : (from || to);
      var dateVal = root.querySelector('#date').value;
      var time = root.querySelector('#time').value;
      var dateText = dateVal ? new Date(dateVal + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
      if (time) dateText = (dateText ? dateText + ', ' : '') + time.toLowerCase();
      return {
        service: svc.label,
        route: route.slice(0, 300),
        date: (dateText || 'Do ustalenia').slice(0, 200),
        description: root.querySelector('#description').value.trim().slice(0, 3500),
        clientName: root.querySelector('#name').value.trim().slice(0, 140),
        phone: normalizePhone(root.querySelector('#phone').value),
        requestId: state.requestId,
        website: root.querySelector('#website').value,
        details: details,
        photos: state.photos
      };
    }

    function validPhone(raw) {
      var v = String(raw || '').trim();
      var digits = v.replace(/\D/g, '');
      if (v.indexOf('00') === 0) digits = digits.slice(2);
      return /^[+\d\s()-]+$/.test(v) && digits.length >= 7 && digits.length <= 15;
    }

    form.addEventListener('change', function (e) {
      if (e.target.name === 'service') {
        saveDraft();
        state.service = e.target.value;
        renderDetails();
      }
      progress();
    });
    form.addEventListener('input', progress);
    photosBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-remove]');
      if (!b) return;
      state.photos.splice(Number(b.getAttribute('data-remove')), 1);
      renderPhotos();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (state.busy) return;
      var phoneInput = root.querySelector('#phone');
      if (!validPhone(phoneInput.value)) {
        showError('Wpisz prawidłowy numer telefonu. Dla numerów zagranicznych dodaj prefiks, np. +49.');
        phoneInput.focus();
        return;
      }
      showError('');
      state.busy = true;
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
        form.hidden = true;
        var success = root.querySelector('#quote-success');
        success.hidden = false;
        if (success.scrollIntoView) success.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof window.gtag === 'function') window.gtag('event', 'generate_lead', { service: state.service });
      }).catch(function (err) {
        showError(err && err.name === 'AbortError' ? 'Przekroczono czas wysyłania. Sprawdź internet i spróbuj ponownie.' : (err.message || 'Błąd wysyłania.'));
      }).then(function () {
        if (timer) clearTimeout(timer);
        state.busy = false;
        submit.disabled = false;
        submit.innerHTML = 'Wyślij zapytanie <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>';
      });
    });

    root.querySelector('#quote-again').addEventListener('click', function () {
      state.requestId = uuid();
      state.photos = [];
      state.draft = {};
      form.reset();
      var radio = form.querySelector('[name=service][value="' + state.service + '"]');
      if (radio) radio.checked = true;
      renderDetails();
      renderPhotos();
      form.hidden = false;
      root.querySelector('#quote-success').hidden = true;
      progress();
    });

    renderDetails();
    renderPhotos();
    progress();
  }

  function start() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-quote-form]'), function (root) {
      if (!root.getAttribute('data-ready')) { root.setAttribute('data-ready', '1'); init(root); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
