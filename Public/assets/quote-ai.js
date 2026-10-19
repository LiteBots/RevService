/* RevSerwis 7.0 — Wycena AI (wycena.html).
   Formularz krok po kroku → POST /api/quotes/ai (JSON, zdjęcia jako JPEG 1600 px w data-URL)
   → zgłoszenie trafia do panelu RevMi (Wyceny), serwer wycenia je przez Claude API i zwraca widełki. */
(function () {
  'use strict';

  const CAT = window.REV_AI_SERVICES;
  if (!CAT) return;
  const CONFIG = { apiUrl: '/api/quotes/ai', maxPhotos: 6, maxPhotoPx: 1600, jpegQuality: 0.82, timeoutMs: 120000 };

  const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    truck: '<path d="M2 6h12v10H2z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
    moto: '<circle cx="6" cy="16" r="3"/><circle cx="18" cy="16" r="3"/><path d="M6 16l4-6h5l3 6"/><path d="M13 10l-2-3H9"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4"/><path d="M12 11v10"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
    drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
    hammer: '<path d="M14 4l6 6-3 3-6-6z"/><path d="M11 7l-8 8 3 3 8-8"/>',
    shovel: '<path d="M14 3l7 7"/><path d="M17.5 6.5L9 15"/><path d="M9 15l-2-2-4 4 1 4 4 1 4-4z"/>',
    tree: '<path d="M12 2l6 8h-3l4 6H5l4-6H6z"/><path d="M12 16v6"/>',
    stump: '<ellipse cx="12" cy="8" rx="7" ry="3"/><path d="M5 8v8c0 1.7 3.1 3 7 3s7-1.3 7-3V8"/>',
    leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19l8-8"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8"/>',
    warehouse: '<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-8h10v8"/><path d="M7 17h10"/>',
    snow: '<path d="M12 2v20M4.9 6l14.2 12M19.1 6L4.9 18"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>',
    building: '<path d="M4 21V4h11v17"/><path d="M15 9h5v12"/><path d="M8 8h3M8 12h3M8 16h3"/><path d="M2 21h20"/>',
    dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    camera: '<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="4"/>',
    ai: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'
  };
  const svg = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  const SERVICES = CAT.SERVICES;
  const SVC = CAT.BY_ID;
  const TIMES = ['Rano', 'Popołudnie', 'Wieczór', 'Obojętnie'];
  const URGENCY = ['Standardowo', 'Pilne (do 48 h)', 'Nie spieszy się'];
  const CLIENTS = ['Klient prywatny', 'Firma'];
  const QTYPES = ['Bezpłatne widełki (AI)', 'Płatna, dokładna wycena z dojazdem'];

  /* Linki ze strony: ?kat= (kafelki), ?dzial= (podstrony działów), ?zakres=, ?usluga= (stare), ?rodzaj=ogledziny */
  const KAT = { przeprowadzka: ['move'], transport: ['cargo'], moto: ['moto'], oproznianie: ['clear'], sprzatanie: ['cleaning'], ogrod: [], remont: [], przechowanie: ['storage'], osoby: ['people'], firmy: ['facility'], zima: ['snow'], inne: ['other'] };
  const KAT_DEPT = { ogrod: 'RevGarden', remont: 'RevBud', sprzatanie: 'RevClean' };
  const USLUGA = { przeprowadzki: 'move', przeprowadzka: 'move', transport: 'cargo', osoby: 'people', oproznianie: 'clear', mycie: 'wash', rozbiorki: 'demo', wycinka: 'trees', pnie: 'stumps', ziemne: 'earth', dzialki: 'plot', sprzedaz: 'sale', hale: 'halls', magazyn: 'storage', moto: 'moto', dostawy: 'cargo', hotele: 'facility' };
  const ZAKRES = [[/przeprowad/i, 'move'], [/wycink|drzew/i, 'trees'], [/pni|korzeni/i, 'stumps'], [/kosz|działk|dzialk|żywopł|krzew|ogród|ogrod/i, 'plot'], [/rozbiór|rozbior|wiat|altan|szop/i, 'demo'], [/skuw|płytk|tynk|łazien|kuch/i, 'strip'], [/ziemn|kopark|wykop/i, 'earth'], [/mycie|ciśnien|kostk/i, 'wash'], [/hal|garaż/i, 'halls'], [/sprząt|sprzat/i, 'cleaning'], [/opróżn|oprozn|piwnic|strych/i, 'clear'], [/wywóz|wywoz|gabaryt|odpad|gruz/i, 'waste'], [/motocykl|quad|skuter/i, 'moto'], [/transfer|lotnisk|wesel|przewóz osób/i, 'people'], [/magazyn|przechow/i, 'storage'], [/odśnież|odsniez/i, 'snow'], [/transport|dostaw/i, 'cargo'], [/sklep|ogłosze/i, 'shop']];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const zl = n => Math.round(n).toLocaleString('pl-PL') + ' zł';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''));

  const form = $('#quote');
  if (!form) return;
  const radioVal = n => { const el = form.querySelector(`input[name="${n}"]:checked`); return el ? el.value : ''; };
  const checkVals = n => $$(`input[name="${n}"]:checked`, form).map(i => i.value);
  const numVal = n => { const v = parseFloat(form.elements[n]?.value); return Number.isNaN(v) ? 0 : v; };
  const txt = n => (form.elements[n]?.value || '').trim();

  function pills(name, options, { type = 'radio', checked = null } = {}) {
    return options.map((o, i) => `<label class="po"><input type="${type}" name="${name}" value="${i}"${checked === i ? ' checked' : ''}><span>${esc(o)}</span></label>`).join('');
  }
  function stepper(name, { min = 0, max = 999, step = 1, def = 0, unit = '' }) {
    const lbl = unit === 'floor' ? `<span class="stepper-label" data-floor-label="${name}">${CAT.floorText(def)}</span>` : `<span class="stepper-label">${unit}</span>`;
    return `<div style="display:flex;align-items:center"><div class="stepper"><button type="button" data-dec aria-label="Mniej">−</button><input type="number" name="${name}" min="${min}" max="${max}" step="${step}" value="${def}" inputmode="numeric"><button type="button" data-inc aria-label="Więcej">+</button></div>${lbl}</div>`;
  }

  /* ---------------- Render ---------------- */
  $$('[data-icon]').forEach(el => { el.innerHTML = svg(el.dataset.icon); });
  const depts = ['Wszystkie', ...new Set(SERVICES.map(s => s.dept))];
  $('#deptFilters').innerHTML = depts.map((d, i) => `<button type="button" class="chip${i ? '' : ' on'}" data-dept="${d}">${d}</button>`).join('');
  $('#svcGrid').innerHTML = SERVICES.map(s => `
    <label class="opt svc" data-dept="${s.dept}"><input type="checkbox" name="svc" value="${s.id}">
      <span class="box"><span class="tick"></span><span class="ico">${svg(s.icon)}</span><span class="dept">${s.dept}</span>
      <span class="t">${esc(s.name)}</span><span class="m">${esc(s.desc)}</span></span></label>`).join('');
  function filterDept(dept) {
    $$('#deptFilters .chip').forEach(c => c.classList.toggle('on', c.dataset.dept === dept));
    $$('#svcGrid .svc').forEach(c => c.classList.toggle('hidden', dept !== 'Wszystkie' && c.dataset.dept !== dept));
  }
  $('#deptFilters').addEventListener('click', e => { const b = e.target.closest('[data-dept]'); if (b) filterDept(b.dataset.dept); });

  $('#timePills').innerHTML = pills('time', TIMES, { checked: 3 });
  $('#urgPills').innerHTML = pills('urgency', URGENCY, { checked: 0 });
  $('#clientPills').innerHTML = pills('client', CLIENTS, { checked: 0 });
  $('#qtypePills').innerHTML = pills('qtype', QTYPES, { checked: 0 });

  function renderDetails() {
    const sel = checkVals('svc');
    const wrap = $('#detailsWrap');
    const prev = {};
    $$('input', wrap).forEach(i => {
      if (i.type === 'number') prev[i.name] = i.value;
      else { prev[i.name] = prev[i.name] || []; if (i.checked) prev[i.name].push(i.value); }
    });
    wrap.innerHTML = sel.map(id => {
      const s = SVC[id];
      const body = s.fields.length ? s.fields.map(f => {
        const n = `f_${id}_${f.id}`;
        const ctl = f.type === 'number' ? stepper(n, f) : pills(n, f.options, { type: f.type === 'multi' ? 'checkbox' : 'radio', checked: f.type === 'chips' ? (f.def ?? 0) : null });
        return `<div class="fgroup"><span class="flabel">${esc(f.label)}${f.type === 'multi' ? ' <span style="text-transform:none;letter-spacing:0;font-weight:500">· możesz zaznaczyć kilka</span>' : ''}</span>${ctl}</div>`;
      }).join('') : '<p class="lead" style="margin:0">Opisz zlecenie w kolejnym kroku i dodaj zdjęcia — AI zaproponuje widełki na tej podstawie.</p>';
      return `<div class="sec"><div class="sec-head"><span class="ico">${svg(s.icon)}</span><div><small>${s.dept}</small><b>${esc(s.name)}</b></div></div>${body}</div>`;
    }).join('');
    Object.entries(prev).forEach(([n, v]) => {
      const els = $$(`input[name="${n}"]`, wrap);
      if (!els.length) return;
      if (els[0].type === 'number') els[0].value = v;
      else els.forEach(e => { e.checked = v.includes(e.value); });
    });
  }

  function answers(id) {
    const out = {};
    for (const f of SVC[id].fields) {
      const n = `f_${id}_${f.id}`;
      if (!form.querySelector(`input[name="${n}"]`)) continue; // szczegóły nieotwarte → domyślne na serwerze
      if (f.type === 'number') out[f.id] = numVal(n);
      else if (f.type === 'multi') out[f.id] = checkVals(n).map(Number);
      else out[f.id] = Number(radioVal(n) || f.def || 0);
    }
    return out;
  }

  /* ---------------- Zdjęcia ---------------- */
  let photos = [];
  async function compress(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, CONFIG.maxPhotoPx / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      let quality = CONFIG.jpegQuality;
      let data = c.toDataURL('image/jpeg', quality);
      while (data.length > 1300000 && quality > 0.4) { quality -= 0.12; data = c.toDataURL('image/jpeg', quality); }
      return { id: uuid(), data };
    } finally { URL.revokeObjectURL(url); }
  }
  async function addFiles(list) {
    const err = $('[data-err]', $('[data-name="photos"]'));
    err.textContent = '';
    const files = [...list].filter(f => /^image\//.test(f.type));
    const free = CONFIG.maxPhotos - photos.length;
    if (files.length > free) err.textContent = `Możesz dodać maksymalnie ${CONFIG.maxPhotos} zdjęć.`;
    for (const f of files.slice(0, Math.max(0, free))) {
      if (f.size > 25 * 1024 * 1024) { err.textContent = `Plik ${f.name} jest za duży (max 25 MB).`; continue; }
      const ph = document.createElement('div');
      ph.className = 'thumb loading';
      $('#thumbs').append(ph);
      try { photos.push(await compress(f)); } catch { err.textContent = `Nie udało się wczytać ${f.name}. Spróbuj zdjęcia JPG lub PNG.`; }
      ph.remove();
      renderThumbs();
    }
    refresh();
  }
  function renderThumbs() {
    $('#thumbs').innerHTML = photos.map(p => `<div class="thumb"><img src="${p.data}" alt=""><button type="button" data-rm="${p.id}" aria-label="Usuń zdjęcie">×</button></div>`).join('');
    $('#drop').style.display = photos.length >= CONFIG.maxPhotos ? 'none' : '';
  }
  $('#files').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(t => $('#drop').addEventListener(t, e => { e.preventDefault(); $('#drop').classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(t => $('#drop').addEventListener(t, e => { e.preventDefault(); $('#drop').classList.remove('drag'); }));
  $('#drop').addEventListener('drop', e => addFiles(e.dataTransfer.files));
  $('#thumbs').addEventListener('click', e => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    photos = photos.filter(x => x.id !== b.dataset.rm);
    renderThumbs();
    refresh();
  });

  /* ---------------- Stan ---------------- */
  const needsDest = () => checkVals('svc').some(id => SVC[id].dest);
  let requestId = uuid();

  function payload() {
    const dest = needsDest();
    return {
      requestId,
      website: txt('website'),
      services: checkVals('svc').map(id => ({ id, answers: answers(id) })),
      location: { address: txt('addr'), destination: dest ? txt('addrTo') : '', km: dest ? numVal('km') : 0 },
      description: txt('desc'),
      photos: photos.map(p => p.data),
      schedule: { date: txt('date'), time: Number(radioVal('time') || 3), urgency: Number(radioVal('urgency') || 0) },
      contact: { client: Number(radioVal('client') || 0), name: txt('name'), phone: txt('phone'), email: txt('email'), company: radioVal('client') === '1' ? txt('company') : '' },
      quoteType: radioVal('qtype') === '1' ? 'onsite' : 'free',
      consent: $('#consent').checked
    };
  }

  function precision() {
    const p = payload();
    let s = 0;
    if (p.services.length) s += 25;
    if (p.location.address) s += 15;
    const d = p.description.length;
    s += d >= 120 ? 20 : d >= 40 ? 12 : d >= 10 ? 5 : 0;
    s += Math.min(3, p.photos.length) * 10;
    if (p.schedule.date) s += 5;
    if (p.contact.name && p.contact.phone) s += 5;
    return Math.min(100, s);
  }

  function refresh() {
    const p = payload();
    const v = precision();
    $('#meterVal').textContent = v + '%';
    $('#meterBar').style.width = v + '%';
    $('#meterLabel').textContent = v >= 80 ? 'Bardzo dobra' : v >= 55 ? 'Dobra' : v >= 30 ? 'Podstawowa' : 'Uzupełnij formularz';
    $('#meterHint').textContent = !p.services.length ? 'Wybierz usługę, aby zacząć.'
      : p.photos.length < 2 ? 'Dodaj 2–3 zdjęcia, aby AI zawęziło widełki.'
        : p.description.length < 40 ? 'Dopisz kilka zdań opisu, aby zwiększyć precyzję.'
          : 'Świetnie, AI ma dużo informacji.';
    $('#sideSvc').innerHTML = p.services.length ? p.services.map(s => `<span>${esc(SVC[s.id].name)}</span>`).join('')
      : '<span class="none">nic nie wybrano</span>';
    $('#sidePhotos').textContent = `${p.photos.length} / ${CONFIG.maxPhotos}`;
    const loc = p.location.address ? p.location.address + (p.location.destination ? ' → ' + p.location.destination : '') : '—';
    $('#sideLoc').textContent = loc;
    $('#sideLoc').classList.toggle('muted', loc === '—');
    $$('[data-dest]').forEach(el => el.classList.toggle('hidden', !needsDest()));
    $('#addrLabel').textContent = needsDest() ? 'Adres odbioru / start *' : 'Adres / miejscowość *';
    $$('[data-company]').forEach(el => el.classList.toggle('hidden', radioVal('client') !== '1'));
    $$('[data-floor-label]').forEach(el => { el.textContent = CAT.floorText(numVal(el.dataset.floorLabel)); });
    $('#descCount').textContent = txt('desc').length;
    if (typeof setBar === 'function') setBar();
  }

  /* ---------------- Wysyłka i wynik ---------------- */
  async function send(p) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.timeoutMs);
    try {
      const r = await fetch(CONFIG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p), signal: ctrl.signal });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.success) throw new Error(data.message || 'Nie udało się wysłać zgłoszenia (' + r.status + ').');
      return data;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Serwer odpowiada zbyt długo. Spróbuj ponownie — zgłoszenie nie zostanie zdublowane.');
      throw e;
    } finally { clearTimeout(timer); }
  }

  let busy = false;
  async function runAI() {
    if (busy) return;
    busy = true;
    const p = payload();
    const steps = ['Zapisuję zgłoszenie', p.photos.length ? `Analizuję zdjęcia (${p.photos.length})` : 'Czytam opis i odpowiedzi', 'Porównuję z cennikiem RevSerwis', 'Wyliczam widełki cenowe'];
    $('#aiLoading').classList.remove('hidden');
    $('#aiResult').classList.add('hidden');
    $('#checklist').innerHTML = steps.map(s => `<li>${esc(s)}</li>`).join('');
    const lis = $$('#checklist li');
    let done = false;
    const anim = (async () => {
      for (let i = 0; i < lis.length; i++) {
        lis[i].className = 'run';
        await new Promise(r => setTimeout(r, i === lis.length - 1 ? 400 : 1100));
        while (i === lis.length - 1 && !done) await new Promise(r => setTimeout(r, 200));
        lis[i].className = 'ok';
      }
    })();
    let res = null;
    let error = null;
    try { res = await send(p); } catch (e) { error = e; }
    done = true;
    await anim;
    busy = false;
    showResult(res, error);
  }

  const CONF_TXT = { high: 'Wysoka pewność', medium: 'Średnia pewność', low: 'Niska pewność' };

  function showResult(r, error) {
    $('#aiLoading').classList.add('hidden');
    const box = $('#aiResult');
    box.classList.remove('hidden');
    if (error) {
      box.innerHTML = `<div class="big-disc"><div class="ic">!</div><div><b>Nie udało się przygotować wyceny.</b> ${esc(error.message)} Możesz spróbować ponownie albo zadzwonić: 735 396 534.</div></div>
        <div class="res-actions"><button type="button" class="btn btn-primary" id="retry">Spróbuj ponownie</button><button type="button" class="btn btn-ghost" id="backEdit">Popraw dane</button><a class="btn btn-ghost" href="tel:+48735396534">Zadzwoń</a></div>`;
      $('#retry').onclick = runAI;
      $('#backEdit').onclick = () => go(steps.findIndex(s => s.dataset.name === 'contact'), true);
      return;
    }
    const li = a => (a || []).map(x => `<li>${esc(x)}</li>`).join('');
    const ai = r.source === 'ai';
    box.innerHTML = `
      <p class="eyebrow">${ai ? 'Wycena AI gotowa' : 'Wycena gotowa'}</p>
      <h2 class="ttl" style="margin-bottom:8px">Twoja wstępna wycena</h2>
      <div class="ref">Numer zgłoszenia <b>${esc(r.number)}</b></div>
      <div class="res-top">
        <div><div class="lbl">Orientacyjnie</div><div class="res-range">${zl(r.estimate.low)} – ${zl(r.estimate.high)}</div>${r.summary ? `<p class="res-sum">${esc(r.summary)}</p>` : ''}</div>
        <div class="res-meta"><span class="badge-c ${esc(r.estimate.confidence)}"><i></i>${CONF_TXT[r.estimate.confidence] || ''}</span><span class="badge-demo">${ai ? 'Wycena przygotowana przez AI' : 'Na podstawie stawek RevSerwis'}</span></div>
      </div>
      <div class="big-disc"><div class="ic">!</div><div><b>To nie jest ostateczna cena.</b> Wycena została przygotowana automatycznie i ma charakter wyłącznie orientacyjny. Nie stanowi oferty handlowej. Ostateczny koszt usługi RevSerwis ustali po rozmowie lub oględzinach na miejscu.</div></div>
      ${r.needsOnsite ? '<div class="ai-tip" style="margin:-8px 0 22px"><i>✦</i><span>To zlecenie warto zobaczyć na miejscu — dokładną cenę podamy po płatnych oględzinach. Zadzwonimy, żeby je umówić.</span></div>' : ''}
      ${(r.items || []).length ? `<div class="res-items">${r.items.map(i => `<div class="res-item"><span class="ico">${svg(SVC[i.serviceId]?.icon || 'dots')}</span><div class="n"><b>${esc(i.name)}</b>${i.note ? `<span>${esc(i.note)}</span>` : ''}</div><span class="pr">${zl(i.low)} – ${zl(i.high)}</span></div>`).join('')}</div>` : ''}
      <div class="res-cols">
        <div class="res-box"><h4><i>✦</i>${ai ? 'Co zauważyło AI' : 'Na co zwróciliśmy uwagę'}</h4><ul>${li(r.observations)}</ul></div>
        <div class="res-box"><h4><i>±</i>Co może zmienić cenę</h4><ul>${li(r.priceFactors)}</ul></div>
      </div>
      ${(r.questions || []).length ? `<div class="res-box" style="margin-bottom:22px"><h4><i>?</i>Możemy jeszcze dopytać</h4><ul>${li(r.questions)}</ul></div>` : ''}
      <p class="lead" style="margin-bottom:18px">Zgłoszenie trafiło do RevSerwis. <b>Oddzwonimy</b>, aby potwierdzić szczegóły i podać ostateczną cenę.</p>
      <div class="res-actions">
        <a class="btn btn-primary" href="tel:+48735396534">Zadzwoń teraz</a>
        <a class="btn btn-ghost" href="https://wa.me/48735396534?text=${encodeURIComponent('Dzień dobry, wysłałem zgłoszenie ' + r.number + ' z wyceny online.')}" target="_blank" rel="noopener">WhatsApp</a>
        <button type="button" class="btn btn-ghost" id="restart">Nowa wycena</button>
      </div>`;
    $('#restart').onclick = restart;
    try { window.gtag && window.gtag('event', 'generate_lead', { value: r.estimate.low, currency: 'PLN' }); } catch { /* brak analityki */ }
  }

  /* ---------------- Nawigacja ---------------- */
  const steps = $$('.steps > .step');
  const realSteps = steps.filter(s => s.hasAttribute('data-step'));
  let idx = 0;

  function go(n, back = false) {
    steps[idx].classList.remove('active', 'back');
    idx = Math.max(0, Math.min(steps.length - 1, n));
    const st = steps[idx];
    st.classList.add('active');
    if (back) st.classList.add('back');
    const intro = st.hasAttribute('data-intro');
    const ai = st.hasAttribute('data-ai');
    const pos = realSteps.indexOf(st);
    $('#progressWrap').style.visibility = intro ? 'hidden' : 'visible';
    $('#progressBar').style.width = ai ? '100%' : ((pos + 1) / realSteps.length * 100) + '%';
    $('#progressTxt').innerHTML = ai ? '<b>WYCENA</b>' : `KROK <b>${pos + 1}</b> / ${realSteps.length}`;
    $('#nav').classList.toggle('hidden', ai);
    $('#prev').disabled = intro;
    const last = st.dataset.name === 'contact';
    $('#next').innerHTML = intro ? 'Zaczynamy<span class="arr">→</span>' : last ? 'Wyceń<span class="arr">✦</span>' : 'Dalej<span class="arr">→</span>';
    if (st.dataset.name === 'details') renderDetails();
    const err = $('[data-err]', st);
    if (err) err.textContent = '';
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* jsdom */ }
    refresh();
    if (ai) runAI();
  }

  function validate() {
    const st = steps[idx];
    const p = payload();
    const err = $('[data-err]', st);
    const fail = (msg, el) => { if (err) err.textContent = msg; if (el) { el.classList.add('err'); el.focus(); } return false; };
    $$('.err', st).forEach(e => e.classList.remove('err'));
    switch (st.dataset.name) {
      case 'services': if (!p.services.length) return fail('Wybierz przynajmniej jedną usługę.'); break;
      case 'location':
        if (!p.location.address) return fail('Podaj adres lub miejscowość.', $('#addr'));
        if (needsDest() && !p.location.destination) return fail('Podaj adres docelowy.', $('#addrTo'));
        if (needsDest() && p.location.km < 1) return fail('Podaj przybliżoną odległość w km.', $('#km'));
        break;
      case 'photos':
        if (p.services.some(s => s.id === 'other') && p.description.length < 15) return fail('Przy „Inne zlecenie” opisz, co trzeba zrobić (min. 15 znaków).', $('#desc'));
        break;
      case 'contact':
        if (p.contact.name.length < 2) return fail('Podaj imię i nazwisko.', $('#name'));
        if (p.contact.phone.replace(/\D/g, '').length < 9) return fail('Podaj poprawny numer telefonu.', $('#phone'));
        if (p.contact.email && !/^\S+@\S+\.\S+$/.test(p.contact.email)) return fail('Sprawdź adres e-mail.', $('#email'));
        if (!p.consent) { $('#consentBox').classList.add('err'); return fail('Potwierdź, że rozumiesz, iż wycena jest wstępna.'); }
        $('#consentBox').classList.remove('err');
        break;
      default: break;
    }
    return true;
  }

  function restart() {
    form.reset();
    photos = [];
    renderThumbs();
    $('#detailsWrap').innerHTML = '';
    $('#km').value = 20;
    requestId = uuid();
    filterDept('Wszystkie');
    go(0, true);
  }

  $('#next').addEventListener('click', () => { if (validate()) go(idx + 1); });
  $('#prev').addEventListener('click', () => go(idx - 1, true));
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !['TEXTAREA', 'BUTTON'].includes(e.target.tagName)) {
      e.preventDefault();
      if (!steps[idx].hasAttribute('data-ai')) $('#next').click();
    }
  });
  form.addEventListener('submit', e => e.preventDefault());
  // Zmiana danych po wysłaniu = nowe zgłoszenie (ten sam requestId z innymi danymi serwer odrzuca).
  form.addEventListener('input', () => { if (!steps[idx].hasAttribute('data-ai')) refresh(); });
  form.addEventListener('change', e => {
    if (e.target.name === 'svc' && steps[idx].dataset.name === 'services') renderDetails();
    refresh();
  });
  let lastSent = '';
  const _run = runAI;
  runAI = async function () { // eslint-disable-line no-func-assign
    const sig = JSON.stringify({ ...payload(), requestId: '' });
    if (lastSent && sig !== lastSent) requestId = uuid();
    lastSent = sig;
    return _run();
  };
  form.addEventListener('click', e => {
    const b = e.target.closest('[data-inc],[data-dec]');
    if (!b) return;
    const inp = b.parentElement.querySelector('input');
    const st = +inp.step || 1;
    const v = (parseFloat(inp.value) || 0) + (b.hasAttribute('data-inc') ? st : -st);
    inp.value = Math.max(+inp.min, Math.min(+inp.max, v));
    refresh();
  });
  $$('[data-km]').forEach(b => b.addEventListener('click', () => { $('#km').value = b.dataset.km; refresh(); }));
  const t = new Date();
  $('#date').min = new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  $('#estHead').addEventListener('click', () => { if (window.innerWidth <= 920) $('#estimate').classList.toggle('open'); });
  function setBar() { document.documentElement.style.setProperty('--barH', ($('#estHead').offsetHeight || 96) + 'px'); }
  window.addEventListener('resize', setBar);

  /* Parametry z linków */
  const params = new URLSearchParams(location.search);
  const pre = new Set();
  const kat = (params.get('kat') || '').toLowerCase();
  (KAT[kat] || []).forEach(id => pre.add(id));
  const usluga = USLUGA[(params.get('usluga') || '').toLowerCase()];
  if (usluga) pre.add(usluga);
  const zakres = params.get('zakres') || '';
  for (const part of zakres.split(/[,|]/)) { const m = ZAKRES.find(([re]) => re.test(part)); if (m) pre.add(m[1]); }
  const dzial = (params.get('dzial') || '').toLowerCase();
  let dept = KAT_DEPT[kat] || '';
  if (dzial) {
    const inDept = SERVICES.filter(s => s.division === dzial);
    if (inDept.length) dept = inDept[0].dept;
    if (!pre.size && inDept.length === 1) pre.add(inDept[0].id);
    if (!inDept.length && !pre.size) pre.add(dzial === 'revshop' || dzial === 'revoffice' || dzial === 'revwarehouse' ? 'move' : ['revb2b', 'revhotel'].includes(dzial) ? 'facility' : 'other');
  }
  if (params.get('rodzaj') === 'ogledziny') { const q = form.querySelector('input[name="qtype"][value="1"]'); if (q) q.checked = true; }
  pre.forEach(id => { const el = form.querySelector(`input[name="svc"][value="${id}"]`); if (el) el.checked = true; });

  refresh();
  if (pre.size || dept) {
    if (dept && !pre.size) filterDept(dept);
    const svcIdx = steps.findIndex(s => s.dataset.name === 'services');
    go(pre.size ? svcIdx + 1 : svcIdx);
  } else go(0);
  setBar();

  window.RevQuoteAI = { payload, go, validate, get step() { return steps[idx].dataset.name || (steps[idx].hasAttribute('data-intro') ? 'intro' : 'ai'); } };
})();
