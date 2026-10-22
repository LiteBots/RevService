/* RevSerwis 8.0 — formularz „Wycena RevBot” (wycena.html).
   Jeden widok: usługa → kilka szybkich pytań → adres i termin → opis + do 10 zdjęć → kontakt → wynik w oknie.
   Strona nie zna stawek firmy — wysyła odpowiedzi, a serwer (RevBot) zwraca widełki. */
(function () {
  'use strict';

  var API = '/api/quotes/ai';
  var MAX_PHOTOS = 10;
  var ICONS = { home: 'fa-house', box: 'fa-box-open', trash: 'fa-trash-can', truck: 'fa-truck', snow: 'fa-snowflake', leaf: 'fa-leaf', tree: 'fa-tree', stump: 'fa-tree', bag: 'fa-bag-shopping', moto: 'fa-motorcycle', sparkle: 'fa-broom', drop: 'fa-droplet', hammer: 'fa-hammer', shovel: 'fa-person-digging', tag: 'fa-tag', users: 'fa-van-shuttle', warehouse: 'fa-warehouse', building: 'fa-building', dots: 'fa-ellipsis' };
  var PLACEHOLDER = {
    move: 'Np. 3 pokoje, 4. piętro bez windy, szafa 3-drzwiowa, pianino, ok. 30 kartonów…',
    clear: 'Np. mieszkanie 50 m² po zmarłym, meble, AGD, dużo drobnych rzeczy, 2. piętro…',
    waste: 'Np. stara kanapa, szafa, lodówka i kilka worków — leżą w garażu…',
    cargo: 'Np. narożnik i lodówka ze sklepu do domu, 3. piętro z windą…',
    snow: 'Np. podjazd 120 m² i chodnik przed sklepem, chcemy obsługi przez całą zimę…',
    plot: 'Np. działka 1000 m², wysoka trawa, krzaki przy ogrodzeniu, trzeba wywieźć…',
    trees: 'Np. 2 świerki ok. 12 m przy domu, gałęzie do wywiezienia…'
  };

  var C = null;
  var state = { group: null, service: null, answers: {}, photos: [], when: 0, sending: false, requestId: uuid(), lastSig: '' };
  var $ = function (id) { return document.getElementById(id); };

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>'"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]; }); }
  function money(n) { return new Intl.NumberFormat('pl-PL').format(Math.round(n || 0)) + ' zł'; }
  function plural(n, a, b, c) { return n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c; }

  /* ---------------- Usługi ---------------- */
  function renderServices() {
    var main = C.GROUPS.filter(function (g) { return g.main; });
    var html = main.map(function (g) {
      return '<button type="button" class="q-svc" data-group="' + g.key + '" aria-pressed="' + (state.group === g.key) + '"><i class="fa-solid ' + (ICONS[g.icon] || 'fa-circle') + '" aria-hidden="true"></i><span>' + esc(g.label) + '<small>' + esc(g.sub || '') + '</small></span></button>';
    }).join('');
    var other = state.group && !C.GROUPS.find(function (g) { return g.key === state.group; }).main;
    html += '<button type="button" class="q-svc" data-group="__more" aria-pressed="' + Boolean(other) + '"><i class="fa-solid fa-grip" aria-hidden="true"></i><span>Więcej usług<small>sprzątanie, rozbiórki…</small></span></button>';
    $('services').innerHTML = html;
    var sel = $('moreSelect');
    if (!sel.options.length) {
      sel.innerHTML = '<option value="">— wybierz usługę —</option>' + C.GROUPS.filter(function (g) { return !g.main; }).map(function (g) { return '<option value="' + g.key + '">' + esc(g.label) + '</option>'; }).join('');
    }
    $('moreBox').classList.toggle('show', Boolean(other) || state.showMore);
    if (other) sel.value = state.group;
  }

  function selectGroup(key, serviceId) {
    var g = C.GROUPS.find(function (x) { return x.key === key; });
    if (!g) return;
    state.group = key;
    var ids = g.variants.map(function (v) { return v[0]; });
    var next = serviceId && ids.indexOf(serviceId) >= 0 ? serviceId : ids[0];
    if (next !== state.service) { state.service = next; state.answers = {}; }
    renderServices();
    renderVariants();
    renderFields();
    updateDest();
    var desc = $('description');
    desc.placeholder = PLACEHOLDER[state.service] || 'Opisz krótko, co trzeba zrobić — ilość rzeczy, piętro, dostęp, termin…';
  }

  function renderVariants() {
    var g = C.GROUPS.find(function (x) { return x.key === state.group; });
    if (!g || g.variants.length < 2) { $('variants').innerHTML = ''; return; }
    $('variants').innerHTML = g.variants.map(function (v) {
      return '<button type="button" class="q-chip" data-variant="' + v[0] + '" aria-pressed="' + (state.service === v[0]) + '">' + esc(v[1]) + '</button>';
    }).join('');
  }

  function renderFields() {
    var s = C.BY_ID[state.service];
    if (!s) { $('fields').innerHTML = ''; return; }
    $('fields').innerHTML = s.fields.filter(function (f) { return f.quick; }).map(function (f) {
      var v = state.answers[f.id];
      if (f.type === 'number') {
        var unset = v === undefined;
        var label = unset ? 'nie wiem' : (f.unit === 'floor' ? C.floorText(v) : v + ' ' + f.unit);
        return '<div class="q-f num"><span>' + esc(f.label) + '</span><div class="q-step' + (unset ? ' unset' : '') + '" data-num="' + f.id + '"><button type="button" data-d="-1" aria-label="Mniej">−</button><output aria-live="polite">' + esc(label) + '</output><button type="button" data-d="1" aria-label="Więcej">+</button></div></div>';
      }
      var multi = f.type === 'multi';
      return '<div class="q-f"><span>' + esc(f.label) + (multi ? ' <small style="color:var(--dim)">(można kilka)</small>' : '') + '</span><div class="q-chips">' + f.options.map(function (o, i) {
        var on = multi ? (v || []).indexOf(i) >= 0 : v === i;
        return '<button type="button" class="q-chip" data-field="' + f.id + '" data-i="' + i + '" data-multi="' + multi + '" aria-pressed="' + on + '">' + esc(o) + '</button>';
      }).join('') + '</div></div>';
    }).join('');
  }

  function stepNumber(id, d) {
    var f = C.BY_ID[state.service].fields.find(function (x) { return x.id === id; });
    var step = f.step || (f.unit === 'm²' ? 10 : 1);
    var cur = state.answers[id];
    if (cur === undefined) cur = f.unit === 'floor' ? (d > 0 ? -1 : 1) : f.unit === 'm²' ? Math.max(f.min, 50) - step * d : f.min - d;
    var next = Math.min(f.max, Math.max(f.min, cur + d * step));
    state.answers[id] = next;
    renderFields();
  }

  function updateDest() {
    var s = C.BY_ID[state.service];
    var dest = Boolean(s && s.dest);
    $('destWrap').hidden = !dest;
    $('address').placeholder = dest ? 'Skąd? (adres lub miejscowość)' : 'Adres lub miejscowość';
  }

  /* ---------------- Zdjęcia ---------------- */
  function compress(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        var q = 0.8;
        var data = c.toDataURL('image/jpeg', q);
        while (data.length > 1200000 && q > 0.4) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
        URL.revokeObjectURL(url);
        resolve(data);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Nie można odczytać zdjęcia')); };
      img.src = url;
    });
  }

  function renderPhotos() {
    var box = $('photos');
    var thumbs = state.photos.map(function (d, i) {
      return '<span class="q-ph"><img src="' + d + '" alt="Zdjęcie ' + (i + 1) + '"><button type="button" data-rm="' + i + '" aria-label="Usuń zdjęcie ' + (i + 1) + '">×</button></span>';
    }).join('');
    box.innerHTML = thumbs + (state.photos.length < MAX_PHOTOS ? '<button type="button" class="q-add" id="addPhoto"><i class="fa-solid fa-camera" aria-hidden="true"></i>' + (state.photos.length ? 'Dodaj<br>więcej' : 'Dodaj<br>zdjęcia') + '</button>' : '');
    $('photoCount').textContent = state.photos.length + '/' + MAX_PHOTOS + ' zdjęć';
  }

  async function addFiles(files) {
    var list = Array.prototype.slice.call(files || []).slice(0, MAX_PHOTOS - state.photos.length);
    if (!list.length) return;
    var btn = $('addPhoto');
    if (btn) btn.classList.add('busy');
    for (var i = 0; i < list.length; i++) {
      try { state.photos.push(await compress(list[i])); } catch (e) { showError('Nie udało się wczytać zdjęcia ' + list[i].name); }
    }
    renderPhotos();
  }

  /* ---------------- Wysyłka ---------------- */
  function showError(msg, el) {
    $('formError').textContent = msg || '';
    document.querySelectorAll('.q-invalid').forEach(function (x) { x.classList.remove('q-invalid'); });
    if (el) { el.classList.add('q-invalid'); el.focus({ preventScroll: false }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  function payload() {
    return {
      requestId: state.requestId,
      website: $('website').value,
      consent: $('consent').checked,
      services: [{ id: state.service, answers: state.answers }],
      location: { address: $('address').value.trim(), destination: $('destWrap').hidden ? '' : $('destination').value.trim(), km: 0 },
      description: $('description').value.trim(),
      photos: state.photos,
      schedule: { date: $('date').value || '', time: 3, urgency: state.when },
      contact: { client: $('company').value.trim() ? 1 : 0, name: $('name').value.trim(), phone: $('phone').value.trim(), email: $('email').value.trim(), company: $('company').value.trim() },
      quoteType: $('onsite').checked ? 'onsite' : 'free'
    };
  }

  function validate(p) {
    if (!state.service) { showError('Wybierz usługę.', $('services')); return false; }
    if (p.location.address.length < 2) { showError('Podaj adres lub miejscowość.', $('address')); return false; }
    if (!$('destWrap').hidden && p.location.destination.length < 2) { showError('Podaj, dokąd jedziemy.', $('destination')); return false; }
    if (state.service === 'other' && p.description.length < 15) { showError('Opisz zlecenie (min. 15 znaków).', $('description')); return false; }
    if (p.contact.name.length < 2) { showError('Podaj imię.', $('name')); return false; }
    if (p.contact.phone.replace(/\D/g, '').length < 7) { showError('Podaj numer telefonu.', $('phone')); return false; }
    if (!p.consent) { showError('Zaznacz zgodę poniżej formularza.', $('consent')); return false; }
    showError('');
    return true;
  }

  var LOAD_STEPS = ['Analizuję zdjęcia…', 'Liczę trasę i dojazd…', 'Sprawdzam podobne zlecenia…', 'Przygotowuję widełki…'];
  function openSheet(html) { $('sheetIn').innerHTML = html; $('sheet').hidden = false; document.body.style.overflow = 'hidden'; }
  function closeSheet() { $('sheet').hidden = true; document.body.style.overflow = ''; }

  async function submit(e) {
    e.preventDefault();
    if (state.sending) return;
    var p = payload();
    if (!validate(p)) return;
    var sig = JSON.stringify(Object.assign({}, p, { requestId: '' }));
    if (state.lastSig && sig !== state.lastSig) { state.requestId = uuid(); p.requestId = state.requestId; }
    state.lastSig = sig;
    state.sending = true;
    $('goBtn').disabled = true;
    var stepIdx = 0;
    openSheet('<div class="q-load"><div class="q-orb" aria-hidden="true"></div><h2 id="sheetTitle">RevBot wycenia zlecenie</h2><p id="loadStep">' + (p.photos.length ? LOAD_STEPS[0] : LOAD_STEPS[1]) + '</p></div>');
    var timer = setInterval(function () { stepIdx = Math.min(LOAD_STEPS.length - 1, stepIdx + 1); var el = $('loadStep'); if (el) el.textContent = LOAD_STEPS[stepIdx]; }, 3500);
    try {
      var ctrl = new AbortController();
      var t = setTimeout(function () { ctrl.abort(); }, 150000);
      var res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p), signal: ctrl.signal });
      clearTimeout(t);
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) throw new Error(data.message || 'Nie udało się wysłać zgłoszenia. Spróbuj ponownie lub zadzwoń: 735 396 534.');
      showResult(data);
      try { window.gtag && window.gtag('event', 'generate_lead', { value: data.estimate.low, currency: 'PLN' }); } catch (x) { /* brak analityki */ }
    } catch (err) {
      openSheet('<div class="q-load"><h2 id="sheetTitle">Nie udało się wycenić</h2><p>' + esc(err.name === 'AbortError' ? 'Serwer odpowiada zbyt długo. Twoje zgłoszenie mogło dotrzeć — zadzwonimy. Możesz też spróbować ponownie.' : err.message) + '</p><div class="q-actions"><button type="button" class="q-btn" data-close>Popraw dane</button><a class="q-btn wa" href="tel:+48735396534"><i class="fa-solid fa-phone"></i> Zadzwoń</a></div></div>');
    } finally {
      clearInterval(timer);
      state.sending = false;
      $('goBtn').disabled = false;
    }
  }

  var CONF = { high: ['Wysoka pewność', 'fa-circle-check'], medium: ['Średnia pewność', 'fa-circle-half-stroke'], low: ['Niska pewność — warto dosłać zdjęcia', 'fa-circle-exclamation'] };
  function list(items) { return items && items.length ? '<ul>' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; }

  function showResult(d) {
    var e = d.estimate || {};
    var conf = CONF[e.confidence] || CONF.medium;
    var items = d.items && d.items.length > 1 ? '<h3>Pozycje</h3><div class="q-items">' + d.items.map(function (i) { return '<div><span>' + esc(i.name) + '</span><b>' + money(i.low) + ' – ' + money(i.high) + '</b></div>'; }).join('') + '</div>' : '';
    var waText = 'Dzień dobry, mam wycenę ' + (d.number || '') + ' (' + money(e.low) + ' – ' + money(e.high) + '). Chciałbym ustalić termin.';
    openSheet('<div class="q-res">' +
      '<div class="q-res-top"><h2 id="sheetTitle">Wstępna wycena RevBot</h2><button type="button" class="q-x" data-close aria-label="Zamknij">×</button></div>' +
      '<div class="q-price">' + money(e.low) + ' <span>–</span> ' + money(e.high) + '</div>' +
      '<span class="q-conf ' + esc(e.confidence || 'medium') + '"><i class="fa-solid ' + conf[1] + '" aria-hidden="true"></i>' + esc(conf[0]) + '</span>' +
      (d.summary ? '<p class="q-sum">' + esc(d.summary) + '</p>' : '') +
      (d.needsOnsite ? '<p class="q-note" style="color:var(--warn)"><i class="fa-solid fa-location-dot"></i> Przy tym zakresie zalecamy oględziny na miejscu — wtedy podamy dokładną cenę.</p>' : '') +
      items +
      (d.observations && d.observations.length ? '<h3>Co widzimy</h3>' + list(d.observations) : '') +
      (d.priceFactors && d.priceFactors.length ? '<h3>Co może zmienić cenę</h3>' + list(d.priceFactors) : '') +
      (d.questions && d.questions.length ? '<h3>Doprecyzujemy telefonicznie</h3>' + list(d.questions) : '') +
      '<p class="q-note">To cena wstępna, nie ostateczna. Zgłoszenie już do nas trafiło — oddzwonimy, potwierdzimy zakres i termin. Formularz nie rezerwuje terminu.</p>' +
      '<div class="q-actions"><a class="q-btn primary" href="tel:+48735396534"><i class="fa-solid fa-phone"></i> Zadzwoń i umów termin</a>' +
      '<a class="q-btn wa" href="https://wa.me/48735396534?text=' + encodeURIComponent(waText) + '" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>' +
      '<button type="button" class="q-btn" data-new><i class="fa-solid fa-rotate"></i> Nowa wycena</button></div>' +
      (d.number ? '<p class="q-num">Numer zgłoszenia: <b>' + esc(d.number) + '</b></p>' : '') +
      '</div>');
  }

  function reset() {
    state.requestId = uuid();
    state.lastSig = '';
    state.photos = [];
    state.answers = {};
    $('quoteForm').reset();
    state.when = 0;
    document.querySelectorAll('[data-when]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.when === '0')); });
    renderPhotos();
    renderFields();
    closeSheet();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- Parametry z adresu (linki ze strony) ---------------- */
  var KAT = { przeprowadzka: 'przeprowadzka', przeprowadzki: 'przeprowadzka', transport: 'transport', moto: 'transport', oproznianie: 'oproznianie', wywoz: 'oproznianie', sprzatanie: 'sprzatanie', ogrod: 'ogrod', remont: 'remont', przechowanie: 'przechowanie', osoby: 'osoby', firmy: 'firmy', zima: 'zima', odsniezanie: 'zima', inne: 'inne' };
  var KAT_SERVICE = { moto: 'moto' };
  var DIV = { revhome: 'przeprowadzka', revcargo: 'transport', revmoto: 'transport', revassist: 'transport', revclean: 'sprzatanie', revgarden: 'ogrod', revbud: 'remont', revsite: 'remont', revstorage: 'przechowanie', revevent: 'osoby', revwinter: 'zima', revfacility: 'firmy', revb2b: 'firmy', revoffice: 'firmy', revshop: 'firmy', revwarehouse: 'przechowanie', revhotel: 'firmy' };
  var USLUGA = { przeprowadzki: 'move', oproznianie: 'clear', odpady: 'waste', gabaryty: 'waste', transport: 'cargo', mycie: 'wash', sprzatanie: 'cleaning', rozbiorki: 'demo', wycinka: 'trees', pnie: 'stumps', ziemne: 'earth', dzialki: 'plot', sprzedaz: 'sale', hale: 'halls', magazyn: 'storage', moto: 'moto', osoby: 'people', odsniezanie: 'snow' };

  function fromUrl() {
    var q = new URLSearchParams(location.search);
    var svc = q.get('usluga') && USLUGA[q.get('usluga')];
    var group = svc ? C.GROUP_OF[svc] : KAT[q.get('kat')] || DIV[q.get('dzial')] || null;
    if (!svc && q.get('kat')) svc = KAT_SERVICE[q.get('kat')] || null;
    if (q.get('dzial') === 'revmoto') svc = 'moto';
    var zakres = (q.get('zakres') || '').toLowerCase();
    if (zakres) {
      if (/wycink|drzew/.test(zakres)) { group = 'ogrod'; svc = 'trees'; }
      else if (/pni|korzen/.test(zakres)) { group = 'ogrod'; svc = 'stumps'; }
      else if (/wywóz|wywoz|gabaryt/.test(zakres)) { group = 'oproznianie'; svc = 'waste'; }
      else if (/opróżn|oprozn/.test(zakres)) { group = 'oproznianie'; svc = 'clear'; }
    }
    if (group) selectGroup(group, svc);
    if (q.get('miasto')) $('address').value = q.get('miasto');
    if (q.get('rodzaj') === 'ogledziny') $('onsite').checked = true;
  }

  /* ---------------- Start ---------------- */
  function init() {
    C = window.REV_AI_SERVICES;
    if (!C) return;
    var today = new Date();
    var iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    $('date').min = iso;
    renderServices();
    renderPhotos();
    fromUrl();

    $('services').addEventListener('click', function (e) {
      var b = e.target.closest('[data-group]');
      if (!b) return;
      if (b.dataset.group === '__more') { state.showMore = true; renderServices(); $('moreSelect').focus(); return; }
      state.showMore = false;
      selectGroup(b.dataset.group);
    });
    $('moreSelect').addEventListener('change', function (e) { if (e.target.value) selectGroup(e.target.value); });
    $('variants').addEventListener('click', function (e) {
      var b = e.target.closest('[data-variant]');
      if (b) selectGroup(state.group, b.dataset.variant);
    });
    $('fields').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-field]');
      if (chip) {
        var id = chip.dataset.field;
        var i = Number(chip.dataset.i);
        if (chip.dataset.multi === 'true') {
          var cur = (state.answers[id] || []).slice();
          var k = cur.indexOf(i);
          if (k >= 0) cur.splice(k, 1); else cur.push(i);
          if (cur.length) state.answers[id] = cur; else delete state.answers[id];
        } else if (state.answers[id] === i) delete state.answers[id];
        else state.answers[id] = i;
        renderFields();
        return;
      }
      var step = e.target.closest('[data-d]');
      if (step) stepNumber(step.closest('[data-num]').dataset.num, Number(step.dataset.d));
    });
    document.querySelectorAll('[data-when]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.when = Number(b.dataset.when);
        document.querySelectorAll('[data-when]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
    });
    $('photos').addEventListener('click', function (e) {
      var rm = e.target.closest('[data-rm]');
      if (rm) { state.photos.splice(Number(rm.dataset.rm), 1); renderPhotos(); return; }
      if (e.target.closest('#addPhoto')) $('fileInput').click();
    });
    $('fileInput').addEventListener('change', function (e) { addFiles(e.target.files).then(function () { e.target.value = ''; }); });
    $('moreContact').addEventListener('click', function () { $('moreContactBox').hidden = false; this.hidden = true; $('email').focus(); });
    $('quoteForm').addEventListener('submit', submit);
    $('sheet').addEventListener('click', function (e) {
      if (e.target === $('sheet') || e.target.closest('[data-close]')) closeSheet();
      if (e.target.closest('[data-new]')) reset();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('sheet').hidden && !state.sending) closeSheet(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
