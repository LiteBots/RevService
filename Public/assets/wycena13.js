/* RevSerwis 13 — szczegółowy formularz wyceny (bez AI). Katalog pytań: /assets/quote-form.js (wspólny z serwerem). */
(function () {
  'use strict';
  var C = window.RevQuoteForm;
  var app = document.getElementById('quoteApp');
  if (!C || !app) return;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var rid = function () { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12); };
  var KEY = 'revserwis.wycena.v13';
  var STEPS = ['Usługa', 'Szczegóły', 'Termin i zdjęcia', 'Kontakt'];

  if (!document.getElementById('q13css')) {
    var st = document.createElement('style'); st.id = 'q13css';
    st.textContent = [
      '.q-grid{display:grid;grid-template-columns:1fr 340px;gap:32px;align-items:start}',
      '.q-grid aside{position:sticky;top:96px}',
      '@media(max-width:1000px){.q-grid{grid-template-columns:1fr}.q-grid aside{position:static;order:-1}.q-sum dl{display:none}}',
      '.q-title{font-size:clamp(32px,4vw,44px);font-weight:800;letter-spacing:-.03em}',
      '.q-sub{color:var(--muted);margin:10px 0 24px;max-width:64ch}',
      '.q-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:22px}',
      '.q-steps button{text-align:left;padding:12px 14px;border-radius:12px;background:var(--s1);border:1px solid var(--line);font:700 13.5px inherit;font-family:inherit;color:var(--muted);cursor:pointer}',
      '.q-steps b{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--s3);margin-right:8px;font-size:12px}',
      '.q-steps .done{color:#d1d5db}.q-steps .done b{background:var(--mintSoft);color:var(--mint)}',
      '.q-steps .on{border-color:var(--mint);color:var(--text)}.q-steps .on b{background:var(--mint);color:var(--ink)}',
      '.q-steps button[disabled]{cursor:default}',
      '@media(max-width:640px){.q-steps{grid-template-columns:repeat(4,1fr)}.q-steps span{display:none}.q-steps button{text-align:center;padding:10px 4px}.q-steps b{margin:0}}',
      '.q-card{background:var(--s1);border:1px solid var(--line);border-radius:22px;padding:26px;margin-bottom:18px}',
      '.q-card h2{font-size:21px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.q-card .hint{color:var(--muted);font-size:14px;margin-bottom:18px}',
      '.q-req{color:var(--mint);font-size:12.5px;font-weight:700}',
      '@media(max-width:640px){.q-card{padding:18px;border-radius:18px}}',
      '.q-svcs{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}',
      '@media(max-width:640px){.q-svcs{grid-template-columns:1fr 1fr}}',
      '.q-svc{border:1px solid var(--line2);border-radius:16px;padding:18px 14px;text-align:left;font:700 15px inherit;font-family:inherit;color:#e5e7eb;background:none;cursor:pointer;display:flex;flex-direction:column;gap:8px}',
      '.q-svc i{font-size:22px;color:var(--muted)}.q-svc small{color:var(--muted);font-weight:600;font-size:12.5px}',
      '.q-svc[aria-pressed=true]{border-color:var(--mint);background:var(--mintSoft)}.q-svc[aria-pressed=true] i{color:var(--mint)}',
      '.q-addr{display:grid;grid-template-columns:1fr 1fr;gap:16px}',
      '@media(max-width:760px){.q-addr{grid-template-columns:1fr}}',
      '.q-col{background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:18px}',
      '.q-col h3{font-size:15px;font-weight:800;margin-bottom:12px;display:flex;gap:8px;align-items:center}.q-col h3 i{color:var(--mint)}',
      '.q-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '.q-chips{display:flex;gap:6px;flex-wrap:wrap}',
      '.q-chip{padding:9px 13px;border-radius:10px;border:1px solid var(--line2);font:700 13.5px inherit;font-family:inherit;color:#d1d5db;background:none;cursor:pointer}',
      '.q-chip[aria-pressed=true]{background:var(--mint);color:var(--ink);border-color:var(--mint)}',
      '.q-items{display:flex;flex-direction:column;gap:10px}',
      '.q-item{display:grid;grid-template-columns:150px 1fr 120px 40px;gap:8px;align-items:center;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:10px}',
      '.q-item.norooms{grid-template-columns:1fr 120px 40px}',
      '.q-item .flags{grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
      '.q-item .flags .in{min-height:36px;font-size:14px;flex:1;min-width:160px}',
      '.q-flag{padding:5px 9px;border-radius:8px;border:1px solid var(--line2);font:700 12px inherit;font-family:inherit;color:#cfd3d8;background:none;cursor:pointer}',
      '.q-flag[aria-pressed=true]{background:rgba(251,191,36,.14);color:var(--amber);border-color:rgba(251,191,36,.4)}',
      '.q-item .in,.q-item .sel{min-height:42px;font-size:15px}',
      '@media(max-width:640px){.q-item{grid-template-columns:1fr 110px 40px}.q-item .room{grid-column:1/-1}.q-item.norooms{grid-template-columns:1fr 110px 40px}}',
      '.q-qty{display:flex;align-items:center;border:1px solid var(--line2);border-radius:11px;overflow:hidden;height:42px;background:var(--s2)}',
      '.q-qty button{width:34px;height:100%;border:0;background:none;color:var(--muted);font-size:18px;cursor:pointer}',
      '.q-qty input{width:100%;min-width:0;text-align:center;background:none;border:0;color:var(--text);font:800 15px inherit;font-family:inherit;-moz-appearance:textfield}',
      '.q-qty input::-webkit-outer-spin-button,.q-qty input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}',
      '.q-del{width:40px;height:40px;border-radius:10px;border:1px solid var(--line);background:none;color:var(--muted);cursor:pointer}',
      '.q-add{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}',
      '.q-add button{padding:8px 12px;border-radius:10px;border:1px dashed var(--line2);font:700 13px inherit;font-family:inherit;color:#d1d5db;background:none;cursor:pointer}',
      '.q-add button i{color:var(--mint);margin-right:6px}',
      '.q-roombar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;font-size:14px;color:var(--muted);font-weight:600}',
      '.q-roombar .sel{width:auto;min-height:40px}',
      '.q-qrow{display:grid;grid-template-columns:28px 1fr 130px;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}',
      '.q-qrow:first-child{border-top:0}',
      '.q-qrow input[type=checkbox]{width:20px;height:20px;accent-color:var(--mint)}',
      '.q-qrow .note{grid-column:2/-1}',
      '.q-qrow .unit{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px;font-weight:700}',
      '.q-qrow .unit .in{min-height:42px}',
      '@media(max-width:560px){.q-qrow{grid-template-columns:28px 1fr}.q-qrow .unit{grid-column:2}}',
      '.q-checks{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '@media(max-width:640px){.q-checks{grid-template-columns:1fr}}',
      '.q-ck{display:flex;gap:10px;align-items:center;padding:12px 14px;border:1px solid var(--line2);border-radius:12px;font-size:14px;font-weight:600;cursor:pointer}',
      '.q-ck input{width:18px;height:18px;accent-color:var(--mint)}',
      '.q-ck:has(input:checked){border-color:var(--mint)}',
      '.q-photos{display:flex;gap:10px;flex-wrap:wrap}',
      '.q-photo{position:relative;width:96px;height:96px;border-radius:12px;overflow:hidden;background:var(--s2)}',
      '.q-photo img{width:100%;height:100%;object-fit:cover}',
      '.q-photo button{position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:8px;border:0;background:rgba(0,0,0,.75);color:#fff;cursor:pointer}',
      '.q-pick{width:96px;height:96px;border-radius:12px;border:1px dashed var(--line2);display:grid;place-items:center;text-align:center;color:var(--muted);font-size:13px;font-weight:700;cursor:pointer}',
      '.q-nav{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:6px}',
      '.q-sum{background:var(--s1);border:1px solid var(--line);border-radius:22px;padding:22px}',
      '.q-sum h2{font-size:19px;font-weight:800}',
      '.q-sum dl{display:grid;grid-template-columns:auto 1fr;gap:9px 14px;font-size:14px;margin:14px 0 16px}',
      '.q-sum dt{color:var(--muted)}.q-sum dd{font-weight:700;text-align:right;overflow-wrap:anywhere}',
      '.q-eta{display:flex;gap:12px;background:var(--mintSoft);border:1px solid rgba(3,240,186,.3);border-radius:14px;padding:14px;margin-top:12px}',
      '.q-eta i{color:var(--mint);font-size:20px;margin-top:2px}.q-eta b{display:block}.q-eta span{font-size:13.5px;color:#cfd8d5}',
      '.q-ok{max-width:640px;margin:0 auto;text-align:center;background:var(--s1);border:1px solid var(--line);border-radius:28px;padding:44px 32px}',
      '.q-ok .big{width:76px;height:76px;border-radius:50%;background:var(--mint);color:var(--ink);display:grid;place-items:center;font-size:32px;margin:0 auto 20px}',
      '.q-ok h2{font-size:32px;font-weight:800}.q-ok p{color:var(--muted);margin-top:10px}',
      '.q-ok .num{display:inline-block;margin:22px 0;padding:10px 18px;border-radius:12px;background:var(--s2);border:1px solid var(--line2);font-weight:800;letter-spacing:.03em}',
      '.q-ok .tl{text-align:left;display:flex;flex-direction:column;gap:14px;margin:6px 0 26px;padding:20px;border-radius:16px;background:var(--bg2)}',
      '.q-ok .tl div{display:flex;gap:12px;font-size:14.5px}.q-ok .tl i{color:var(--mint);margin-top:4px;width:16px}',
      '.q-err{margin-bottom:16px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ---------------- stan ---------------- */
  var blank = function () {
    return { requestId: rid(), step: 0, service: '', answers: {}, from: { address: '', floor: '', lift: '', parking: '', place: '', note: '' }, to: { address: '', floor: '', lift: '', parking: '', place: '', note: '' },
      items: [], room: 'Salon', waste: {}, works: {}, extras: [], schedule: { date: '', time: 'Obojętnie', flexible: false }, description: '', photos: [],
      contact: { name: '', phone: '', email: '', company: '', nip: '' }, consent: false };
  };
  var S = blank();
  try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && saved.requestId && !saved.sent) { S = Object.assign(blank(), saved, { photos: [] }); } } catch (e) { /* tryb prywatny */ }
  var params = new URLSearchParams(location.search);
  if (params.get('usluga') && C.BY_ID[params.get('usluga')] && S.service !== params.get('usluga')) { S.service = params.get('usluga'); S.step = Math.max(S.step, 1); }
  if (params.get('miasto') && !S.from.address) S.from.address = params.get('miasto') + ', ';
  var save = function () { try { var c = Object.assign({}, S, { photos: [] }); localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* pełna pamięć */ } };
  var svc = function () { return C.BY_ID[S.service]; };
  var error = '';

  /* ---------------- pomocnicze ---------------- */
  var chips = function (path, options, multi, value) {
    var v = multi ? (value || []) : value;
    return '<div class="q-chips" role="group">' + options.map(function (o) {
      var on = multi ? v.indexOf(o) >= 0 : v === o;
      return '<button type="button" class="q-chip" data-chip="' + esc(path) + '" data-multi="' + (multi ? 1 : 0) + '" data-val="' + esc(o) + '" aria-pressed="' + on + '">' + esc(o) + '</button>';
    }).join('') + '</div>';
  };
  var input = function (path, value, attrs) { return '<input class="in" data-k="' + esc(path) + '" value="' + esc(value == null ? '' : value) + '" ' + (attrs || '') + '>'; };
  var get = function (path) { return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, S); };
  var set = function (path, v) { var ks = path.split('.'), o = S; for (var i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = v; };
  var floorTxt = function (f) { return f === '' || f == null ? '' : Number(f) === 0 ? 'parter' : Number(f) < 0 ? f + ' (piwnica)' : f + '. piętro'; };

  function placeBox(key, title, icon, s) {
    var p = S[key];
    var building = s.id !== 'przewoz';
    return '<div class="q-col"><h3><i class="fa-solid ' + icon + '" aria-hidden="true"></i>' + title + '</h3>' +
      '<div class="f"><label for="a-' + key + '">Adres <span class="req">*</span></label>' + input(key + '.address', p.address, 'id="a-' + key + '" maxlength="220" autocomplete="street-address" placeholder="Ulica i numer, miejscowość"') + '</div>' +
      (building ? '<div class="q-row2"><div class="f"><label for="fl-' + key + '">Piętro <span class="req">*</span></label>' + input(key + '.floor', p.floor, 'id="fl-' + key + '" type="number" inputmode="numeric" min="-2" max="40" placeholder="0 = parter"') + '</div>' +
        '<div class="f"><label for="pl-' + key + '">Rodzaj</label><select class="sel" data-k="' + key + '.place" id="pl-' + key + '"><option value="">Wybierz</option>' + C.PLACES.map(function (o) { return '<option' + (p.place === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="f"><span class="lbl">Winda <span class="req">*</span></span>' + chips(key + '.lift', C.LIFTS, false, p.lift) + '</div>' +
        '<div class="f"><span class="lbl">Odległość od parkingu do drzwi</span>' + chips(key + '.parking', C.PARKING, false, p.parking) + '</div>' : '') +
      '<div class="f" style="margin:0"><label for="n-' + key + '">Uwagi do dojazdu</label>' + input(key + '.note', p.note, 'id="n-' + key + '" maxlength="200" placeholder="Np. wąska klatka, kod do bramy, strefa płatnego parkowania"') + '</div></div>';
  }

  function fieldHtml(f) {
    var v = S.answers[f.id];
    var lbl = esc(f.label) + (f.required ? ' <span class="req">*</span>' : '');
    if (f.type === 'chips') return '<div class="f"><span class="lbl">' + lbl + '</span>' + chips('answers.' + f.id, f.options, f.multi, v) + '</div>';
    var attrs = f.type === 'number' ? 'type="number" inputmode="numeric" min="0" max="' + (f.max || 100000) + '"' : f.type === 'time' ? 'type="time"' : 'maxlength="' + (f.max || 200) + '"';
    return '<div class="f"><label for="ans-' + f.id + '">' + lbl + '</label>' + input('answers.' + f.id, v, 'id="ans-' + f.id + '" ' + attrs) + '</div>';
  }

  function itemsHtml(s) {
    var rooms = s.rooms;
    var sugg = C.ITEM_SUGGEST.meble.concat(C.ITEM_SUGGEST.agd, C.ITEM_SUGGEST.inne);
    var rows = S.items.map(function (it, i) {
      return '<div class="q-item' + (rooms ? '' : ' norooms') + '">' +
        (rooms ? '<select class="sel room" data-item="' + i + '" data-f="room" aria-label="Pomieszczenie">' + C.ROOMS.map(function (r) { return '<option' + (it.room === r ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select>' : '') +
        '<input class="in" data-item="' + i + '" data-f="name" value="' + esc(it.name) + '" maxlength="120" list="q-sugg" placeholder="Np. szafa 3-drzwiowa" aria-label="Przedmiot">' +
        '<div class="q-qty"><button type="button" data-qty="' + i + '" data-d="-1" aria-label="Mniej">−</button><input type="number" inputmode="numeric" min="1" max="1000" data-item="' + i + '" data-f="qty" value="' + esc(it.qty) + '" aria-label="Ilość"><button type="button" data-qty="' + i + '" data-d="1" aria-label="Więcej">+</button></div>' +
        '<button type="button" class="q-del" data-del="' + i + '" aria-label="Usuń pozycję"><i class="fa-solid fa-trash-can"></i></button>' +
        '<div class="flags">' + C.ITEM_FLAGS.map(function (fl) { return '<button type="button" class="q-flag" data-flag="' + i + '" data-val="' + esc(fl) + '" aria-pressed="' + (it.flags.indexOf(fl) >= 0) + '">' + esc(fl) + '</button>'; }).join('') +
        '<input class="in" data-item="' + i + '" data-f="note" value="' + esc(it.note) + '" maxlength="160" placeholder="Wymiary, waga, uwagi" aria-label="Uwagi"></div></div>';
    }).join('');
    var total = S.items.reduce(function (a, it) { return a + (Number(it.qty) || 0); }, 0);
    return '<section class="q-card"><h2>' + (s.id === 'oproznianie' ? 'Największe rzeczy do wyniesienia' : s.id === 'transport' ? 'Co przewozimy' : 'Lista rzeczy do przewiezienia') + (s.items === 'required' ? ' <span class="q-req">wymagane</span>' : ' <span class="muted small">opcjonalnie</span>') + '</h2>' +
      '<p class="hint">' + esc(s.lead) + ' Zaznacz, co trzeba rozkręcić albo co jest wyjątkowo ciężkie.</p>' +
      (rooms ? '<div class="q-roombar"><label for="q-room">Dodajesz do:</label><select class="sel" id="q-room" data-k="room">' + C.ROOMS.map(function (r) { return '<option' + (S.room === r ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select><span>Razem: <b style="color:var(--text)">' + total + ' szt.</b> w ' + S.items.length + ' pozycjach</span></div>' : '') +
      '<div class="q-items">' + (rows || '<div class="alert info"><i class="fa-solid fa-circle-info"></i><span>Kliknij przedmiot poniżej albo „Własny przedmiot”, a potem podaj ilość.</span></div>') + '</div>' +
      '<div class="q-add">' + ['Kanapa / sofa', 'Szafa 2-drzwiowa', 'Szafa 3-drzwiowa', 'Łóżko podwójne', 'Komoda', 'Stół', 'Krzesło', 'Biurko', 'Lodówka', 'Pralka', 'Telewizor', 'Kartony'].map(function (n) { return '<button type="button" data-addname="' + esc(n) + '"><i class="fa-solid fa-plus"></i>' + esc(n) + '</button>'; }).join('') +
      '<button type="button" data-addname=""><i class="fa-solid fa-pen"></i>Własny przedmiot</button></div>' +
      '<datalist id="q-sugg">' + sugg.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist></section>';
  }

  function qtyListHtml(kind, list, title, hint) {
    return '<section class="q-card"><h2>' + title + ' <span class="q-req">wymagane</span></h2><p class="hint">' + hint + '</p><div>' + list.map(function (d) {
      var v = S[kind][d.id] || null;
      return '<div class="q-qrow"><input type="checkbox" id="' + kind + '-' + d.id + '" data-pick="' + kind + '" data-id="' + d.id + '"' + (v ? ' checked' : '') + '><label for="' + kind + '-' + d.id + '" style="font-weight:700">' + esc(d.name) + '</label>' +
        '<div class="unit">' + (v ? '<input class="in" type="number" inputmode="decimal" min="0" step="0.5" data-q="' + kind + '.' + d.id + '.qty" value="' + esc(v.qty) + '" aria-label="Ilość: ' + esc(d.name) + '">' + esc(d.unit) : '') + '</div>' +
        (v ? '<div class="note"><input class="in" data-q="' + kind + '.' + d.id + '.note" value="' + esc(v.note) + '" maxlength="200" placeholder="Szczegóły, np. 2 wersalki i fotel, piec 1,5 m wysokości" aria-label="Szczegóły: ' + esc(d.name) + '"></div>' : '') + '</div>';
    }).join('') + '</div></section>';
  }

  /* ---------------- kroki ---------------- */
  function step0() {
    return '<section class="q-card"><h2>Czego potrzebujesz?</h2><p class="hint">Formularz dopasuje pytania do wybranej usługi.</p><div class="q-svcs">' +
      C.SERVICES.map(function (s) { return '<button type="button" class="q-svc" data-svc="' + s.id + '" aria-pressed="' + (S.service === s.id) + '"><i class="fa-solid ' + s.icon + '" aria-hidden="true"></i>' + esc(s.name) + '</button>'; }).join('') + '</div></section>';
  }
  function step1() {
    var s = svc();
    var addr = s.route ? '<div class="q-addr">' + placeBox('from', s.id === 'przewoz' ? 'Skąd wyjeżdżamy' : 'Załadunek', 'fa-location-dot', s) + placeBox('to', s.id === 'przewoz' ? 'Dokąd jedziemy' : 'Rozładunek', 'fa-flag-checkered', s) + '</div>' : placeBox('from', 'Adres zlecenia', 'fa-location-dot', s);
    var html = '<section class="q-card"><h2>' + (s.route ? 'Skąd i dokąd' : 'Gdzie') + ' <span class="q-req">wymagane</span></h2><p class="hint">' + (s.id === 'przewoz' ? 'Podaj dokładne adresy wyjazdu i celu.' : 'Piętro, winda i odległość od parkingu najbardziej wpływają na cenę.') + '</p>' + addr + '</section>';
    html += '<section class="q-card"><h2>' + esc(s.name) + ': szczegóły</h2><p class="hint">Pola oznaczone gwiazdką są wymagane.</p>' + s.fields.map(fieldHtml).join('') + '</section>';
    if (s.items) html += itemsHtml(s);
    if (s.waste) html += qtyListHtml('waste', C.WASTE, 'Rodzaje odpadów', 'Zaznacz wszystko, co mamy zabrać, i podaj ilość.');
    if (s.works) html += qtyListHtml('works', C.DEMOLITION, 'Zakres prac', 'Zaznacz prace i podaj ilość: m² ściany lub podłogi, sztuki albo metry bieżące.');
    html += '<section class="q-card"><h2>Co jeszcze mamy zrobić?</h2><p class="hint">Zaznacz wszystko, czego potrzebujesz.</p><div class="q-checks">' + s.extras.map(function (x, i) {
      return '<label class="q-ck"><input type="checkbox" data-extra="' + esc(x) + '"' + (S.extras.indexOf(x) >= 0 ? ' checked' : '') + '>' + esc(x) + '</label>'; }).join('') + '</div></section>';
    return html;
  }
  function step2() {
    var min = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    return '<section class="q-card"><h2>Termin</h2><p class="hint">Termin potwierdzamy po wycenie. Formularz go nie rezerwuje.</p><div class="q-row2"><div class="f"><label for="q-date">Preferowana data</label>' + input('schedule.date', S.schedule.date, 'id="q-date" type="date" min="' + min + '"') + '</div><div class="f"><label for="q-time">Pora dnia</label><select class="sel" id="q-time" data-k="schedule.time">' + C.TIMES.map(function (t) { return '<option' + (S.schedule.time === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div></div>' +
      '<label class="check"><input type="checkbox" data-k="schedule.flexible"' + (S.schedule.flexible ? ' checked' : '') + '><span>Termin jest elastyczny, może być inny dzień</span></label></section>' +
      '<section class="q-card"><h2>Zdjęcia i uwagi</h2><p class="hint">Zdjęcia pomieszczeń i dużych rzeczy bardzo pomagają w wycenie (do ' + C.MAX_PHOTOS + ').</p><div class="q-photos">' +
      S.photos.map(function (p, i) { return '<div class="q-photo"><img src="' + p + '" alt="Zdjęcie ' + (i + 1) + '"><button type="button" data-rmphoto="' + i + '" aria-label="Usuń zdjęcie">×</button></div>'; }).join('') +
      (S.photos.length < C.MAX_PHOTOS ? '<label class="q-pick"><input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-photos>+ Dodaj<br>zdjęcia</label>' : '') + '</div>' +
      '<div class="f" style="margin:16px 0 0"><label for="q-desc">Dodatkowe informacje</label><textarea class="ta" id="q-desc" data-k="description" maxlength="3000" placeholder="Wszystko, co powinniśmy wiedzieć: dostęp, godziny, rzeczy nietypowe">' + esc(S.description) + '</textarea></div></section>';
  }
  function step3() {
    var c = S.contact;
    return '<section class="q-card"><h2>Kontakt</h2><p class="hint">Na ten numer wyślemy SMS z wyceną. Ten sam numer posłuży do logowania w panelu klienta.</p>' +
      '<div class="q-row2"><div class="f"><label for="q-name">Imię i nazwisko <span class="req">*</span></label>' + input('contact.name', c.name, 'id="q-name" maxlength="140" autocomplete="name"') + '</div><div class="f"><label for="q-phone">Telefon <span class="req">*</span></label>' + input('contact.phone', c.phone, 'id="q-phone" type="tel" inputmode="tel" maxlength="40" autocomplete="tel" placeholder="600 123 456"') + '</div></div>' +
      '<div class="f"><label for="q-email">E-mail</label>' + input('contact.email', c.email, 'id="q-email" type="email" maxlength="160" autocomplete="email" placeholder="opcjonalnie"') + '</div>' +
      '<div class="q-row2"><div class="f"><label for="q-company">Firma</label>' + input('contact.company', c.company, 'id="q-company" maxlength="200" autocomplete="organization" placeholder="opcjonalnie"') + '</div><div class="f"><label for="q-nip">NIP</label>' + input('contact.nip', c.nip, 'id="q-nip" maxlength="20" placeholder="do faktury VAT"') + '</div></div>' +
      '<div class="hp" aria-hidden="true"><input id="q-website" tabindex="-1" autocomplete="off"></div>' +
      '<label class="check"><input type="checkbox" data-k="consent"' + (S.consent ? ' checked' : '') + '><span>Zgadzam się na kontakt w sprawie wyceny (telefon, SMS, e-mail). <a href="/polityka-prywatnosci.html" target="_blank">Polityka prywatności</a></span></label></section>';
  }

  /* ---------------- walidacja kroku ---------------- */
  function validate(step) {
    var s = svc();
    if (step === 0) return s ? '' : 'Wybierz usługę.';
    if (step === 1) {
      var places = s.route ? [['from', s.id === 'przewoz' ? 'Skąd' : 'Załadunek'], ['to', s.id === 'przewoz' ? 'Dokąd' : 'Rozładunek']] : [['from', 'Adres']];
      for (var i = 0; i < places.length; i++) {
        var p = S[places[i][0]], l = places[i][1];
        if ((p.address || '').replace(/[\s,]/g, '').length < 5) return l + ': wpisz pełny adres.';
        if (s.id !== 'przewoz') { if (p.floor === '' || p.floor == null) return l + ': podaj piętro (0 = parter).'; if (!p.lift) return l + ': zaznacz, czy jest winda.'; }
      }
      for (var j = 0; j < s.fields.length; j++) {
        var f = s.fields[j], v = S.answers[f.id];
        if (f.required && (v == null || v === '' || (Array.isArray(v) && !v.length))) return 'Uzupełnij: „' + f.label + '”.';
      }
      if (s.items === 'required' && !S.items.some(function (it) { return it.name.trim() && Number(it.qty) > 0; })) return 'Dodaj przynajmniej jedną rzecz do listy i podaj ilość.';
      if (S.items.some(function (it) { return it.name.trim() && !(Number(it.qty) > 0); })) return 'Podaj ilość przy każdej rzeczy na liście.';
      if (s.waste && !Object.keys(S.waste).length) return 'Zaznacz przynajmniej jeden rodzaj odpadów.';
      if (s.works && !Object.keys(S.works).length) return 'Zaznacz przynajmniej jedną pracę.';
    }
    if (step === 3) {
      if ((S.contact.name || '').trim().length < 2) return 'Podaj imię i nazwisko.';
      if ((S.contact.phone || '').replace(/\D/g, '').length < 9) return 'Podaj numer telefonu (9 cyfr).';
      if (S.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(S.contact.email)) return 'Sprawdź adres e-mail.';
      if (!S.consent) return 'Zaznacz zgodę na kontakt w sprawie wyceny.';
    }
    return '';
  }

  /* ---------------- podsumowanie ---------------- */
  function summary() {
    var s = svc();
    var rows = [];
    if (s) {
      rows.push(['Usługa', s.name]);
      var pl = function (p) { return [floorTxt(p.floor), p.lift].filter(Boolean).join(', '); };
      if (S.from.address) rows.push([s.route ? 'Skąd' : 'Adres', S.from.address]);
      if (s.route && S.to.address) rows.push(['Dokąd', S.to.address]);
      if (pl(S.from)) rows.push([s.route ? 'Załadunek' : 'Piętro', pl(S.from)]);
      if (s.route && pl(S.to)) rows.push(['Rozładunek', pl(S.to)]);
      var items = S.items.filter(function (i) { return i.name.trim(); });
      if (items.length) {
        rows.push(['Rzeczy', items.reduce(function (a, i) { return a + (Number(i.qty) || 0); }, 0) + ' szt., ' + items.length + ' pozycji']);
        var dis = items.filter(function (i) { return i.flags.indexOf('do rozkręcenia') >= 0; }).length; if (dis) rows.push(['Do rozkręcenia', dis]);
        var hv = items.filter(function (i) { return i.flags.indexOf('ciężkie') >= 0; }); if (hv.length) rows.push(['Ciężkie', hv.map(function (i) { return i.name; }).join(', ')]);
      }
      if (Object.keys(S.waste).length) rows.push(['Odpady', Object.keys(S.waste).length + ' rodzaje']);
      if (Object.keys(S.works).length) rows.push(['Prace', Object.keys(S.works).length + ' pozycji']);
      if (S.extras.length) rows.push(['Dodatkowo', S.extras.join(', ')]);
      if (S.schedule.date) rows.push(['Termin', new Date(S.schedule.date + 'T12:00').toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'long' })]);
      if (S.photos.length) rows.push(['Zdjęcia', S.photos.length]);
    }
    return '<div class="q-sum"><h2>Podsumowanie</h2>' + (rows.length ? '<dl>' + rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>' : '<p class="muted small" style="margin:10px 0">Wybierz usługę, żeby zacząć.</p>') +
      '<div class="q-eta"><i class="fa-solid fa-clock" aria-hidden="true"></i><div><b>Wycena do 24 godzin</b><span>Dostaniesz SMS z ceną i link do panelu klienta. Wycena jest bezpłatna.</span></div></div>' +
      '<p class="muted small" style="margin-top:14px">Wolisz porozmawiać? <a href="tel:+48735396534" style="color:var(--mint)">735 396 534</a></p></div>';
  }

  /* ---------------- render ---------------- */
  function render() {
    var body = [step0, step1, step2, step3][S.step]();
    var last = S.step === 3;
    app.innerHTML = '<div class="q-grid"><main><h1 class="q-title">Wycena zlecenia</h1><p class="q-sub">Im dokładniej opiszesz zlecenie, tym dokładniejsza cena. Wycenę wyślemy SMS-em i do panelu klienta w ciągu 24 godzin.</p>' +
      '<nav class="q-steps" aria-label="Kroki formularza">' + STEPS.map(function (t, i) { return '<button type="button" data-goto="' + i + '" class="' + (i < S.step ? 'done' : i === S.step ? 'on' : '') + '"' + (i > S.step ? ' disabled' : '') + (i === S.step ? ' aria-current="step"' : '') + '><b>' + (i < S.step ? '✓' : i + 1) + '</b><span>' + t + '</span></button>'; }).join('') + '</nav>' +
      (error ? '<div class="alert err q-err" role="alert"><i class="fa-solid fa-triangle-exclamation"></i><span>' + esc(error) + '</span></div>' : '') + body +
      '<div class="q-nav">' + (S.step ? '<button type="button" class="btn btn-ghost" data-back>Wstecz</button>' : '<span></span>') + '<button type="button" class="btn btn-mint" data-next>' + (last ? 'Wyślij do wyceny' : S.step === 0 ? 'Dalej: szczegóły' : S.step === 1 ? 'Dalej: termin i zdjęcia' : 'Dalej: kontakt') + '</button></div></main><aside id="qSum">' + summary() + '</aside></div>';
  }
  var refreshSummary = function () { var a = document.getElementById('qSum'); if (a) a.innerHTML = summary(); save(); };
  var scrollTop = function () { window.scrollTo({ top: app.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' }); };

  /* ---------------- zdarzenia ---------------- */
  app.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.k) { set(t.dataset.k, t.type === 'checkbox' ? t.checked : t.value); if (t.dataset.k === 'room') return; refreshSummary(); }
    else if (t.dataset.item != null) { var it = S.items[+t.dataset.item]; it[t.dataset.f] = t.dataset.f === 'qty' ? t.value.replace(/[^\d]/g, '') : t.value; refreshSummary(); }
    else if (t.dataset.q) { var p = t.dataset.q.split('.'); S[p[0]][p[1]][p[2]] = t.value; save(); }
  });
  app.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.k) { set(t.dataset.k, t.type === 'checkbox' ? t.checked : t.value); refreshSummary(); }
    if (t.dataset.item != null && t.dataset.f === 'room') { S.items[+t.dataset.item].room = t.value; save(); }
    if (t.dataset.extra != null) { var x = t.dataset.extra; S.extras = t.checked ? S.extras.concat([x]) : S.extras.filter(function (y) { return y !== x; }); refreshSummary(); }
    if (t.dataset.pick) { var map = S[t.dataset.pick]; if (t.checked) map[t.dataset.id] = { qty: '', note: '' }; else delete map[t.dataset.id]; save(); render(); var el = document.getElementById(t.id); if (el) el.focus(); }
    if (t.hasAttribute('data-photos')) addPhotos(t.files);
  });
  app.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.svc) { if (S.service !== b.dataset.svc) { S.service = b.dataset.svc; S.answers = {}; S.extras = []; } error = ''; S.step = 1; save(); render(); return scrollTop(); }
    if (b.dataset.chip) {
      var path = b.dataset.chip, val = b.dataset.val;
      if (b.dataset.multi === '1') { var cur = get(path) || []; set(path, cur.indexOf(val) >= 0 ? cur.filter(function (x) { return x !== val; }) : cur.concat([val])); b.setAttribute('aria-pressed', String(cur.indexOf(val) < 0)); }
      else { set(path, get(path) === val ? '' : val); b.parentNode.querySelectorAll('.q-chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b && get(path) === val)); }); }
      return refreshSummary();
    }
    if (b.hasAttribute('data-addname')) { var name = b.dataset.addname; var ex = name && S.items.filter(function (i) { return i.name === name && i.room === (svc().rooms ? S.room : ''); })[0]; if (ex) ex.qty = String((Number(ex.qty) || 0) + 1); else S.items.push({ room: svc().rooms ? S.room : '', name: name, qty: '1', flags: [], note: '' }); save(); render(); if (!name) { var ins = app.querySelectorAll('[data-f=name]'); if (ins.length) ins[ins.length - 1].focus(); } return; }
    if (b.dataset.qty != null) { var it = S.items[+b.dataset.qty]; it.qty = String(Math.max(1, Math.min(1000, (Number(it.qty) || 0) + Number(b.dataset.d)))); var inp = b.parentNode.querySelector('input'); inp.value = it.qty; return refreshSummary(); }
    if (b.dataset.del != null) { S.items.splice(+b.dataset.del, 1); save(); return render(); }
    if (b.dataset.flag != null) { var itf = S.items[+b.dataset.flag], fl = b.dataset.val; itf.flags = itf.flags.indexOf(fl) >= 0 ? itf.flags.filter(function (x) { return x !== fl; }) : itf.flags.concat([fl]); b.setAttribute('aria-pressed', String(itf.flags.indexOf(fl) >= 0)); return refreshSummary(); }
    if (b.dataset.rmphoto != null) { S.photos.splice(+b.dataset.rmphoto, 1); return render(); }
    if (b.dataset.goto != null) { var g = +b.dataset.goto; if (g < S.step) { S.step = g; error = ''; save(); render(); scrollTop(); } return; }
    if (b.hasAttribute('data-back')) { S.step = Math.max(0, S.step - 1); error = ''; save(); render(); return scrollTop(); }
    if (b.hasAttribute('data-next')) {
      error = validate(S.step);
      if (error) { render(); return scrollTop(); }
      if (S.step < 3) { S.step++; save(); render(); return scrollTop(); }
      return submit(b);
    }
  });

  function addPhotos(files) {
    var list = Array.prototype.slice.call(files || []).slice(0, C.MAX_PHOTOS - S.photos.length);
    var pending = list.length; if (!pending) return;
    list.forEach(function (file) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        var q = 0.8, data = cv.toDataURL('image/jpeg', q);
        while (data.length > 1300000 && q > 0.4) { q -= 0.1; data = cv.toDataURL('image/jpeg', q); }
        S.photos.push(data); URL.revokeObjectURL(url);
        if (--pending === 0) render();
      };
      img.onerror = function () { URL.revokeObjectURL(url); if (--pending === 0) render(); };
      img.src = url;
    });
  }

  function payload() {
    var s = svc();
    var num = function (v) { return v === '' || v == null ? null : Number(v); };
    var pl = function (p) { return { address: (p.address || '').replace(/[\s,]+$/, ''), floor: s.id === 'przewoz' ? null : num(p.floor), lift: p.lift, parking: p.parking, place: p.place, note: p.note }; };
    var qty = function (map) { return Object.keys(map).map(function (id) { return { id: id, qty: map[id].qty === '' ? 0 : Number(String(map[id].qty).replace(',', '.')), note: map[id].note }; }); };
    return {
      requestId: S.requestId, service: s.id, answers: S.answers, from: pl(S.from), to: s.route ? pl(S.to) : null,
      items: s.items ? S.items.filter(function (i) { return i.name.trim(); }).map(function (i) { return { room: i.room, name: i.name.trim(), qty: Number(i.qty) || 0, flags: i.flags, note: i.note }; }) : [],
      waste: s.waste ? qty(S.waste) : [], works: s.works ? qty(S.works) : [], extras: S.extras,
      schedule: S.schedule, description: S.description, photos: S.photos, contact: S.contact, consent: S.consent === true,
      website: (document.getElementById('q-website') || {}).value || ''
    };
  }

  function submit(btn) {
    btn.disabled = true; btn.textContent = 'Wysyłamy…';
    fetch('/api/quotes/v13', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload()) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || d.success === false) throw new Error(d.message || (r.status === 413 ? 'Zdjęcia są za duże. Usuń kilka i spróbuj ponownie.' : 'Nie udało się wysłać. Zadzwoń: 735 396 534.')); return d; }); })
      .then(function (d) {
        var phone = S.contact.phone;
        try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
        var due = d.dueAt ? new Date(d.dueAt) : new Date(Date.now() + 864e5);
        var dueTxt = due.toLocaleString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
        var reg = '/konto?rejestracja=1&tel=' + encodeURIComponent(phone) + '&nr=' + encodeURIComponent(d.number || '');
        app.innerHTML = '<div class="q-ok" role="status"><div class="big"><i class="fa-solid fa-check"></i></div><h2>Zgłoszenie przyjęte</h2><p>Wycenę otrzymasz do 24 godzin, najpóźniej ' + esc(dueTxt) + '. Wyślemy ją SMS-em na numer ' + esc(phone) + '.</p>' +
          '<div class="num">Zgłoszenie ' + esc(d.number || '') + '</div>' +
          '<div class="tl"><div><i class="fa-solid fa-magnifying-glass"></i><span>Sprawdzamy listę i trasę. Jeśli czegoś zabraknie, zadzwonimy.</span></div><div><i class="fa-solid fa-message"></i><span>Wysyłamy wycenę SMS-em i do panelu klienta.</span></div><div><i class="fa-solid fa-calendar-check"></i><span>Akceptujesz wycenę jednym kliknięciem i potwierdzamy termin.</span></div></div>' +
          '<div class="ctas" style="justify-content:center">' + (d.hasAccount ? '<a class="btn btn-mint" href="/konto">Zobacz w panelu klienta</a>' : '<a class="btn btn-mint" href="' + esc(reg) + '">Załóż konto i śledź status</a>') + '<a class="btn btn-ghost" href="/">Wróć na stronę</a></div>' +
          (d.hasAccount ? '' : '<p class="small">Konto zakładasz numerem telefonu i hasłem. To zgłoszenie pojawi się w nim automatycznie.</p>') + '</div>';
        scrollTop();
        if (window.gtag) window.gtag('event', 'generate_lead', { service: S.service });
      })
      .catch(function (err) { error = err.message; render(); scrollTop(); });
  }

  render();
})();
