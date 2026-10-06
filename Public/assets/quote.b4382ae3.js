/* RevSerwis 4.0 — formularz wyceny ze zdjęciami: dział → zakres → szczegóły → kontakt (wstawiany w [data-quote-form]) */
(function () {
  'use strict';

  var PHONE = '735 396 534';
  var PHONE_TEL = '+48735396534';
  var WHATSAPP = 'https://wa.me/48735396534';
  var MAX_PHOTOS = 3;
  var MAX_DATA_URL = 1350000;

  var CATALOG = window.RV_DIVISIONS || { groups: [], divisions: [] };
  var DIVS = CATALOG.divisions;
  var byKey = function (slug) { return DIVS.filter(function (d) { return d.slug === slug; })[0]; };

  // Stare adresy ?usluga=… (wersje 3.x) → dział + zaznaczony zakres.
  var LEGACY = {
    przeprowadzka: ['revhome', 'Przeprowadzki'], transport: ['revcargo', 'Transport mebli'], moto: ['revmoto', 'Motocykle'],
    osoby: ['revevent', 'Transport osób'], magazyn: ['revstorage', 'Krótkoterminowe przechowywanie'], oproznianie: ['revhome', 'Opróżnienia'],
    sprzedaz: ['revhome', 'Przygotowanie mieszkania do sprzedaży'], hale: ['revclean', 'Sprzątanie magazynów'], odpady: ['revfacility', 'Wywóz rzeczy'],
    mycie: ['revfacility', 'Mycie kostki'], rozbiorki: ['revbud', 'Rozbiórki'], wycinka: ['revgarden', 'Wycinka drzew'], pnie: ['revgarden', 'Usuwanie korzeni'],
    ziemne: ['revsite', 'Porządkowanie terenu'], dzialki: ['revgarden', 'Porządkowanie działek'], dostawy: ['revcargo', 'Transport palet'],
    hotele: ['revhotel', 'Dostawy'], b2b: ['revb2b', 'Transport']
  };

  // Pola szczegółów: [klucz, etykieta (trafia do panelu), typ, opcje/placeholder, pełna szerokość]
  var FLOORS = ['Parter', '1', '2', '3', '4', '5+', 'Dom'];
  var F = {
    from: ['from', 'Skąd / adres', 'text', 'Miejscowość, ulica'],
    to: ['to', 'Dokąd', 'text', 'Miejscowość, ulica'],
    address: ['from', 'Adres', 'text', 'Miejscowość, ulica', true],
    floorFrom: ['floorFrom', 'Piętro — odbiór', 'select', FLOORS],
    floorTo: ['floorTo', 'Piętro — dostawa', 'select', FLOORS],
    elevator: ['elevator', 'Winda', 'select', ['Brak windy', 'Przy odbiorze', 'Przy dostawie', 'W obu miejscach']],
    area: ['area', 'Powierzchnia (m²)', 'number', 'np. 60'],
    company: ['company', 'Nazwa firmy / obiektu', 'text', ''],
    frequency: ['frequency', 'Częstotliwość', 'select', ['Jednorazowo', 'Kilka razy', 'Stała współpraca', 'Na wezwanie']],
    timing: ['timing', 'Kiedy pracujemy', 'select', ['W godzinach pracy', 'Po godzinach', 'W weekend', 'Dowolnie']]
  };
  var DETAILS = {
    revhome: [F.from, F.to, F.floorFrom, F.floorTo, F.elevator,
      ['size', 'Wielkość', 'select', ['Kilka rzeczy', 'Kawalerka', '2 pokoje', '3 pokoje', '4+ pokoje', 'Dom']],
      ['assembly', 'Demontaż / montaż mebli', 'select', ['Nie', 'Tak — kilka mebli', 'Tak — większość mebli']]],
    revclean: [F.address, ['objectType', 'Obiekt', 'select', ['Mieszkanie', 'Dom', 'Biuro', 'Magazyn', 'Garaż', 'Piwnica', 'Pusty lokal']], F.area,
      ['condition', 'Rodzaj sprzątania', 'select', ['Standardowe', 'Po remoncie', 'Po przeprowadzce', 'Po najemcach', 'Przed sprzedażą', 'Gruntowne']],
      ['frequency', 'Częstotliwość', 'select', ['Jednorazowo', 'Co tydzień', 'Co miesiąc']]],
    revstorage: [['from', 'Skąd odbieramy', 'text', 'Miejscowość, ulica'], ['to', 'Dokąd dowozimy (jeśli wiadomo)', 'text', 'Miejscowość, ulica'],
      ['amount', 'Ilość rzeczy', 'select', ['Kilka kartonów / mebli', 'Kawalerka', '2–3 pokoje', 'Dom', 'Wyposażenie firmy']],
      ['period', 'Okres przechowania', 'select', ['do 1 miesiąca', '1–3 miesiące', '3–6 miesięcy', 'Dłużej / nie wiem']],
      ['pickup', 'Odbiór i dowóz', 'select', ['Tak, z odbiorem i dowozem', 'Tylko odbiór', 'Przywiozę sam(a)']]],
    revmoto: [['from', 'Skąd', 'text', 'Miejscowość (także za granicą)'], F.to,
      ['vehicle', 'Pojazd', 'select', ['Motocykl', 'Skuter', 'Quad', 'Cross', 'Mała maszyna', 'Przyczepa', 'Sprzęt ogrodowy', 'Kilka pojazdów']],
      ['count', 'Liczba sztuk', 'number', '1'], ['model', 'Marka i model (opcjonalnie)', 'text', 'np. Yamaha MT-07'],
      ['running', 'Stan', 'select', ['Jezdny / sprawny', 'Niejezdny / uszkodzony']]],
    revassist: [F.from, F.to, ['items', 'Co przewozimy', 'text', 'np. pralka, szafa, kartony', true],
      ['urgency', 'Na kiedy', 'select', ['Dziś', 'Jutro', 'W tym tygodniu', 'Elastycznie']], ['carry', 'Wniesienie / wyniesienie', 'select', ['Tak', 'Nie']]],
    revbud: [F.address, ['objectType', 'Gdzie', 'select', ['Mieszkanie', 'Dom', 'Lokal użytkowy', 'Obiekt na zewnątrz']], F.area,
      ['floor', 'Piętro', 'select', FLOORS], ['debris', 'Gruz i materiały', 'select', ['Wynieść i wywieźć', 'Tylko wynieść', 'Bez wywozu']]],
    revgarden: [F.address, ['area', 'Powierzchnia terenu (m²)', 'number', 'np. 800'], ['count', 'Liczba drzew / krzewów (jeśli dotyczy)', 'number', 'np. 3'],
      ['height', 'Wysokość drzew', 'select', ['Nie dotyczy', 'do 5 m', '5–10 m', '10–15 m', 'powyżej 15 m']],
      ['wood', 'Gałęzie i drewno', 'select', ['Wywieźć', 'Rozdrobnić na miejscu', 'Drewno zostaje', 'Do ustalenia']],
      ['access', 'Dojazd', 'select', ['Swobodny', 'Wąski wjazd', 'Brak dojazdu autem']]],
    revsite: [['from', 'Skąd (hurtownia / baza)', 'text', 'Miejscowość, ulica'], ['to', 'Adres budowy', 'text', 'Miejscowość, ulica'],
      ['goods', 'Co przewozimy / zakres', 'text', 'np. 2 palety bloczków, narzędzia, 4 osoby', true], F.frequency],
    revwinter: [F.address, ['objectType', 'Teren', 'select', ['Parking', 'Podjazd', 'Chodniki', 'Teren firmy', 'Dach (po ocenie)']], F.area,
      ['frequency', 'Forma', 'select', ['Abonament Winter Care', 'Jednorazowo / na wezwanie']]],
    revcargo: [F.from, F.to, ['goods', 'Co przewozimy', 'text', 'np. 3 palety, kanapa, okna 6 szt.', true],
      ['weight', 'Waga / wymiary', 'text', 'np. ok. 400 kg, 2,5 m'], ['carry', 'Wniesienie', 'select', ['Z wniesieniem', 'Bez wniesienia']], F.frequency],
    revevent: [['from', 'Skąd', 'text', 'Adres odbioru'], ['to', 'Dokąd', 'text', 'np. sala weselna, lotnisko Gdańsk'],
      ['passengers', 'Liczba pasażerów', 'number', '1'], ['eventType', 'Wydarzenie', 'select', ['Wesele', 'Impreza', 'Koncert / DJ', 'Transfer lotniskowy', 'Wyjazd firmowy']],
      ['equipment', 'Bagaże / sprzęt', 'select', ['Brak', 'Bagaże', 'Sprzęt muzyczny / scenografia']],
      ['return', 'Kurs powrotny', 'select', ['Nie', 'Tak — tego samego dnia', 'Tak — inny termin']]],
    revfacility: [F.company, ['from', 'Lokalizacja obiektu', 'text', 'Miejscowość, ulica'],
      ['objectType', 'Obiekt', 'select', ['Biuro', 'Sklep', 'Magazyn / hala', 'Wspólnota / blok', 'Hotel / pensjonat', 'Dom / posesja']], F.area,
      ['frequency', 'Forma współpracy', 'select', ['Abonament miesięczny', 'Sezonowo', 'Jednorazowo']]],
    revb2b: [F.company, ['from', 'Lokalizacja', 'text', 'Miejscowość'], ['scope', 'Czego potrzebuje firma', 'text', 'np. kierowca + bus 2× w tygodniu, magazyn, odśnieżanie', true], F.frequency],
    revoffice: [F.company, F.from, F.to, ['size', 'Wielkość biura', 'select', ['do 10 stanowisk', '10–30 stanowisk', 'powyżej 30']], F.elevator, F.timing],
    revshop: [F.company, F.from, F.to, ['objectType', 'Lokal', 'select', ['Sklep', 'Salon', 'Gastronomia', 'Lokal usługowy']], F.timing],
    revwarehouse: [F.company, ['from', 'Adres magazynu', 'text', 'Miejscowość, ulica'], ['goods', 'Towar', 'text', 'np. palety, kartony'],
      ['count', 'Liczba palet / kartonów', 'number', 'np. 20'], ['frequency', 'Częstotliwość', 'select', ['Jednorazowo', 'Regularnie', 'Szczyt sezonu']]],
    revhotel: [['company', 'Nazwa obiektu', 'text', ''], ['from', 'Lokalizacja', 'text', 'Miejscowość'],
      ['objectType', 'Rodzaj obiektu', 'select', ['Hotel', 'Pensjonat', 'Apartamenty / Airbnb', 'Domki letniskowe']],
      ['frequency', 'Współpraca', 'select', ['Jednorazowo', 'W sezonie', 'Cały rok']]]
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
  function validPhone(raw) {
    var v = String(raw || '').trim();
    var digits = v.replace(/\D/g, '');
    if (v.indexOf('00') === 0) digits = digits.slice(2);
    return /^[+\d\s()-]+$/.test(v) && digits.length >= 7 && digits.length <= 15;
  }

  function init(root) {
    if (!DIVS.length) { root.innerHTML = '<p>Formularz chwilowo niedostępny. Zadzwoń: <a href="tel:' + PHONE_TEL + '">' + PHONE + '</a>.</p>'; return; }
    var params = new URLSearchParams(location.search);
    var legacy = LEGACY[params.get('usluga')];
    var initial = byKey(params.get('dzial')) ? params.get('dzial') : legacy ? legacy[0] : (root.getAttribute('data-division') || 'revhome');
    var preScope = params.get('zakres') || (legacy ? legacy[1] : '');
    var state = {
      division: byKey(initial) ? initial : DIVS[0].slug,
      scopes: {},
      draft: {},
      photos: [],
      requestId: uuid(),
      busy: false
    };
    if (preScope && byKey(state.division).services.indexOf(preScope) !== -1) state.scopes[state.division] = [preScope];
    if (params.get('miasto')) state.draft.from = params.get('miasto');

    var groupsHtml = CATALOG.groups.map(function (g) {
      return '<p class="qf-group">' + esc(g.name) + '</p>' + DIVS.filter(function (d) { return d.group === g.key; }).map(function (d) {
        return '<div class="qf-service qf-division"><input type="radio" name="division" id="div-' + d.slug + '" value="' + d.slug + '"' + (d.slug === state.division ? ' checked' : '') + '>' +
          '<label for="div-' + d.slug + '"><i class="fa-solid ' + esc(d.icon) + '" aria-hidden="true"></i><span class="qf-dv">Rev<b>' + esc(d.name.slice(3)) + '</b></span>' +
          (d.soon ? '<em class="qf-new">Wkrótce</em>' : '') + '</label></div>';
      }).join('');
    }).join('');

    root.innerHTML =
      '<div class="qf">' +
      '<form class="qf-card rv-form" id="quote-form" novalidate>' +
      '<div class="qf-steps" aria-hidden="true"><span class="on"></span><span></span><span></span></div>' +
      '<p class="qf-title">1. Wybierz dział</p><p class="qf-sub">Nie wiesz który? Wybierz najbliższy — dopasujemy zlecenie po wycenie.</p>' +
      '<div class="qf-services" role="radiogroup" aria-label="Dział">' + groupsHtml + '</div>' +
      '<p class="qf-title">2. Zakres</p><p class="qf-sub" id="quote-scope-sub">Zaznacz jedną lub kilka usług.</p>' +
      '<div class="qf-scopes" id="quote-scopes" role="group" aria-label="Zakres usług"></div>' +
      '<div class="qf-note" id="quote-soon" hidden></div>' +
      '<div class="qf-section">Szczegóły</div>' +
      '<div class="qf-grid" id="quote-details"></div>' +
      '<div class="qf-section">Termin i opis</div>' +
      '<div class="qf-grid">' +
      '<div class="qf-field"><label for="date">Preferowany termin</label><input id="date" type="date"></div>' +
      '<div class="qf-field"><label for="time">Pora dnia</label><select id="time"><option value="">Dowolna</option><option>Rano</option><option>Południe</option><option>Popołudnie</option><option>Wieczór</option></select></div>' +
      '<div class="qf-field full"><label for="description">Opis zlecenia</label><textarea id="description" maxlength="3500" placeholder="Co mamy zrobić? Utrudnienia, wymiary, ilości, dogodne godziny…"></textarea></div>' +
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
      '<div class="glass-card static"><h3 id="quote-aside-title">Wybrany dział</h3><p id="quote-aside-text"></p><a class="qf-aside-link" id="quote-aside-link" href="#">Opis działu →</a></div>' +
      '<div class="glass-card static"><h3><i class="fa-solid fa-bolt" style="color:var(--rv-accent)" aria-hidden="true"></i> Jak to działa?</h3><ul><li>Wysyłasz zgłoszenie — to nic nie kosztuje.</li><li>Oddzwaniamy, doprecyzowujemy zakres.</li><li>Dostajesz cenę i termin do akceptacji.</li></ul></div>' +
      '<div class="glass-card static"><h3>Wolisz porozmawiać?</h3><p>Zadzwoń lub napisz na WhatsApp — ustalimy wszystko od ręki.</p><a class="rv-button ghost" style="width:100%;margin-top:10px" href="tel:' + PHONE_TEL + '"><i class="fa-solid fa-phone" aria-hidden="true"></i> ' + PHONE + '</a>' +
      '<a class="rv-button wa" style="width:100%;margin-top:10px" rel="noopener" target="_blank" href="' + WHATSAPP + '?text=' + encodeURIComponent('Dzień dobry, chciałbym zapytać o wycenę.') + '"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Napisz na WhatsApp</a>' +
      '<p style="margin-top:10px;font-size:13px;color:var(--rv-muted)">Na WhatsApp możesz od razu wysłać więcej zdjęć lub film.</p></div>' +
      '</aside></div>';

    var form = root.querySelector('#quote-form');
    var detailsBox = root.querySelector('#quote-details');
    var scopesBox = root.querySelector('#quote-scopes');
    var photosBox = root.querySelector('#quote-photos');
    var errorBox = root.querySelector('#quote-error');
    var submit = root.querySelector('#quote-submit');
    var steps = root.querySelectorAll('.qf-steps span');

    function saveDraft() {
      Array.prototype.forEach.call(detailsBox.querySelectorAll('[data-key]'), function (el) { state.draft[el.getAttribute('data-key')] = el.value; });
    }
    function selectedScopes() { return (state.scopes[state.division] || []).slice(); }

    function renderScopes() {
      var d = byKey(state.division);
      var chosen = selectedScopes();
      scopesBox.innerHTML = d.services.map(function (s, i) {
        var id = 'scope-' + i;
        var on = chosen.indexOf(s) !== -1;
        return '<label class="qf-chip' + (on ? ' on' : '') + '" for="' + id + '"><input type="checkbox" id="' + id + '" name="scope" value="' + esc(s) + '"' + (on ? ' checked' : '') + '>' + esc(s) + '</label>';
      }).join('');
      var soon = root.querySelector('#quote-soon');
      soon.hidden = !d.soon;
      soon.innerHTML = d.soon ? '<i class="fa-solid fa-snowflake" aria-hidden="true"></i> ' + esc(d.name) + ' startuje wkrótce. Wyślij zgłoszenie, a odezwiemy się z ofertą przed sezonem — albo <a href="kontakt.html?temat=winter&amp;dzial=' + d.slug + '">zapisz się przez formularz kontaktowy</a>.' : '';
      root.querySelector('#quote-aside-title').innerHTML = 'Rev<b class="text-brand-400">' + esc(d.name.slice(3)) + '</b>';
      root.querySelector('#quote-aside-text').textContent = d.tagline || '';
      root.querySelector('#quote-aside-link').setAttribute('href', d.slug + '.html');
    }

    function renderDetails() {
      var list = DETAILS[state.division] || [F.address];
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
      var filled = selectedScopes().length || Array.prototype.some.call(detailsBox.querySelectorAll('[data-key]'), function (el) { return el.value; }) || root.querySelector('#description').value.trim();
      var level = 1 + (filled ? 1 : 0) + (phone ? 1 : 0);
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
      var d = byKey(state.division);
      var scopes = selectedScopes();
      var details = { 'Dział': d.name };
      if (scopes.length) details['Zakres'] = scopes.join(', ').slice(0, 200);
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
      var service = d.name + (scopes.length ? ' — ' + scopes.join(', ') : '');
      if (service.length > 80) service = service.slice(0, 79) + '…';
      return {
        service: service,
        division: d.slug,
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

    form.addEventListener('change', function (e) {
      if (e.target.name === 'division') {
        saveDraft();
        state.division = e.target.value;
        renderScopes();
        renderDetails();
      } else if (e.target.name === 'scope') {
        var list = Array.prototype.map.call(scopesBox.querySelectorAll('input:checked'), function (i) { return i.value; });
        state.scopes[state.division] = list;
        e.target.closest('.qf-chip').classList.toggle('on', e.target.checked);
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
        if (typeof window.gtag === 'function') window.gtag('event', 'generate_lead', { division: state.division });
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
      state.scopes = {};
      form.reset();
      var radio = form.querySelector('[name=division][value="' + state.division + '"]');
      if (radio) radio.checked = true;
      renderScopes();
      renderDetails();
      renderPhotos();
      form.hidden = false;
      root.querySelector('#quote-success').hidden = true;
      progress();
    });

    renderScopes();
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
