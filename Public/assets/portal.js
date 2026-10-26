/* RevSerwis 9.0 — wspólne narzędzia + strony: RevOutlet, RevPowrót, abonamenty, partnerzy, kariera.
   Strona wybiera moduł atrybutem <body data-page="…">. */
'use strict';

(function () {
  const RV = (window.RV = window.RV || {});

  /* ------------------------------------------------------------------ */
  /* Narzędzia                                                           */
  /* ------------------------------------------------------------------ */
  const esc = (RV.esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]));
  const $ = (RV.$ = (s, r = document) => r.querySelector(s));
  const $$ = (RV.$$ = (s, r = document) => [...r.querySelectorAll(s)]);
  RV.money = v => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(Number(v) || 0) + ' zł';
  RV.day = v => (v ? new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(v)) : '—');
  RV.dayShort = v => (v ? new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(v)) : '—');
  RV.when = v => (v ? new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(v)) : '—');
  RV.rid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
  RV.todayISO = (plusDays = 0) => { const d = new Date(); d.setDate(d.getDate() + plusDays); return d.toISOString().slice(0, 10); };

  RV.api = async function (path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' } : { 'X-Requested-With': 'fetch' },
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch { /* brak treści */ }
    if (!res.ok) {
      const err = new Error((data && data.message) || (res.status === 413 ? 'Zdjęcia są za duże — dodaj mniej.' : 'Coś poszło nie tak. Spróbuj ponownie albo zadzwoń: 735 396 534.'));
      err.status = res.status;
      throw err;
    }
    return data || {};
  };

  RV.toast = (msg, type = 'ok') => {
    let box = $('.pt-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'pt-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'pt-toast ' + (type === 'error' ? 'err' : 'ok');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  };

  /** Okno dialogowe. Zwraca element <dialog> (usuwany po zamknięciu). */
  RV.dialog = (title, html, { wide = false } = {}) => {
    const d = document.createElement('dialog');
    d.className = 'pt-dialog';
    if (wide) d.style.width = 'min(980px, calc(100vw - 24px))';
    d.innerHTML = `<div class="pt-dialog-head"><h2>${esc(title)}</h2><button type="button" class="pt-x" data-close aria-label="Zamknij"><i class="fa-solid fa-xmark"></i></button></div><div class="pt-dialog-body">${html}</div>`;
    document.body.appendChild(d);
    d.addEventListener('close', () => d.remove());
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    $$('[data-close]', d).forEach(b => b.addEventListener('click', () => d.close()));
    d.showModal();
    return d;
  };

  /** Pomniejsza zdjęcia w przeglądarce (max 1600 px, JPEG) i zwraca data URL. */
  RV.readPhotos = async (files, max = 6) => {
    const out = [];
    for (const file of [...files].slice(0, max)) {
      if (!/^image\//.test(file.type)) continue;
      try {
        const url = URL.createObjectURL(file);
        const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        out.push(c.toDataURL('image/jpeg', 0.82));
      } catch { /* pomijamy plik, którego nie da się odczytać */ }
    }
    return out;
  };

  /** Wybór zdjęć z podglądem. Zwraca obiekt { get(): string[] }. */
  RV.photoPicker = (el, max = 6) => {
    let photos = [];
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.hidden = true;
    el.after(input);
    const render = () => {
      el.innerHTML = photos.map((p, i) => `<div class="ph"><img src="${p}" alt=""><button type="button" data-rm="${i}" aria-label="Usuń zdjęcie">✕</button></div>`).join('') +
        (photos.length < max ? '<button type="button" class="add" data-add aria-label="Dodaj zdjęcie"><i class="fa-solid fa-camera"></i></button>' : '');
      $('[data-add]', el)?.addEventListener('click', () => input.click());
      $$('[data-rm]', el).forEach(b => b.addEventListener('click', () => { photos.splice(Number(b.dataset.rm), 1); render(); }));
    };
    input.addEventListener('change', async () => {
      const add = await RV.readPhotos(input.files, max - photos.length);
      photos = photos.concat(add).slice(0, max);
      input.value = '';
      render();
    });
    render();
    return { get: () => photos.slice(), clear: () => { photos = []; render(); } };
  };

  /** Odczyt formularza do obiektu (checkboxy grupowe → tablice). */
  RV.formData = form => {
    const out = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === 'checkbox') {
        const group = form.querySelectorAll(`input[type=checkbox][name="${CSS.escape(el.name)}"]`).length > 1 || el.dataset.group === '1';
        if (group) { (out[el.name] ||= []); if (el.checked) out[el.name].push(el.value); } else out[el.name] = el.checked;
      } else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    }
    return out;
  };

  /** Wspólna obsługa wysyłki formularza: blokada przycisku, błąd w ramce. */
  RV.submit = async (form, fn) => {
    const btn = form.querySelector('[type=submit]');
    const err = form.querySelector('.pt-error');
    if (err) { err.classList.remove('show'); err.textContent = ''; }
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Wysyłam…'; }
    try {
      await fn();
    } catch (e) {
      if (err) { err.textContent = e.message; err.classList.add('show'); err.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } else RV.toast(e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = label; }
    }
  };

  RV.me = null;
  RV.loadMe = async () => {
    try { const r = await RV.api('/api/konto/me'); RV.me = r.authenticated ? r.account : null; } catch { RV.me = null; }
    return RV.me;
  };

  const opts = (list, selected = '') => list.map(v => `<option ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
  RV.opts = opts;

  /* ================================================================== */
  /* RevOutlet                                                            */
  /* ================================================================== */
  const PAGES = {};

  PAGES.outlet = async () => {
    const root = $('#outletApp');
    const state = { category: '', q: '', sort: '', items: [], categories: [] };
    root.innerHTML = `
      <div class="pt-toolbar">
        <label class="pt-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="roQ" placeholder="Szukaj: komoda, rower, pralka…" aria-label="Szukaj w RevOutlet"></label>
        <div class="pt-field" style="min-width:190px"><select id="roSort" aria-label="Sortowanie"><option value="">Najnowsze</option><option value="price">Cena rosnąco</option><option value="price-desc">Cena malejąco</option></select></div>
      </div>
      <div class="pt-chips" id="roCats"></div>
      <div class="pt-grid" id="roGrid" style="margin-top:14px"><div class="pt-skel"></div><div class="pt-skel"></div><div class="pt-skel"></div></div>`;

    const load = async () => {
      const qs = new URLSearchParams({ ...(state.category && { category: state.category }), ...(state.q && { q: state.q }), ...(state.sort && { sort: state.sort }) });
      const data = await RV.api('/api/outlet?' + qs);
      state.items = data.items;
      state.categories = data.categories;
      render();
    };
    const card = i => `<button type="button" class="ro-card ${i.status === 'reserved' ? 'ro-reserved' : ''}" data-id="${esc(i.id)}">
        <div class="ro-img">${i.photoCount ? `<img loading="lazy" src="/api/outlet/${esc(i.id)}/photos/0" alt="${esc(i.title)}">` : '<i class="fa-solid fa-couch"></i>'}
          <span class="pt-badge">${esc(i.condition)}</span>${i.status === 'reserved' ? '<span class="pt-badge amber ro-flag">Zarezerwowane</span>' : i.secondLife ? '<span class="pt-badge mint ro-flag"><i class="fa-solid fa-recycle"></i> Drugie życie</span>' : ''}</div>
        <div class="ro-body"><div class="ro-title">${esc(i.title)}</div><div class="ro-meta">${esc(i.category)}${i.location ? ' · ' + esc(i.location) : ''}${i.deliveryAvailable ? ' · dowóz' : ''}</div>
          <div class="ro-price">${RV.money(i.price)}${i.oldPrice ? `<s>${RV.money(i.oldPrice)}</s>` : ''}</div></div></button>`;
    const render = () => {
      $('#roCats').innerHTML = `<button type="button" class="pt-chip ${state.category ? '' : 'on'}" data-cat="">Wszystko</button>` +
        state.categories.filter(c => c.count).map(c => `<button type="button" class="pt-chip ${state.category === c.name ? 'on' : ''}" data-cat="${esc(c.name)}">${esc(c.name)}<small>${c.count}</small></button>`).join('');
      $$('[data-cat]', root).forEach(b => b.addEventListener('click', () => { state.category = b.dataset.cat; load(); }));
      $('#roGrid').innerHTML = state.items.length ? state.items.map(card).join('')
        : `<div class="pt-empty" style="grid-column:1/-1"><i class="fa-solid fa-box-open"></i><h3>${state.q || state.category ? 'Nic nie znaleźliśmy' : 'Nowe rzeczy już wkrótce'}</h3><p>${state.q || state.category ? 'Zmień wyszukiwanie albo kategorię.' : 'Rzeczy z opróżnianych mieszkań dodajemy na bieżąco — zajrzyj za kilka dni.'}</p></div>`;
      $$('.ro-card', root).forEach(c => c.addEventListener('click', () => openItem(c.dataset.id)));
    };
    let t;
    $('#roQ').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 300); });
    $('#roSort').addEventListener('change', e => { state.sort = e.target.value; load(); });

    async function openItem(id) {
      let item;
      try { item = (await RV.api('/api/outlet/' + encodeURIComponent(id))).item; } catch (e) { RV.toast(e.message, 'error'); return; }
      const photos = Array.from({ length: item.photoCount }, (_, i) => `/api/outlet/${encodeURIComponent(item.id)}/photos/${i}`);
      const me = RV.me || await RV.loadMe();
      const d = RV.dialog(item.title, `<div class="ro-detail">
        <div class="ro-gallery"><div class="main">${photos.length ? `<img id="roMain" src="${photos[0]}" alt="${esc(item.title)}">` : '<div class="ro-img" style="height:100%"><i class="fa-solid fa-couch"></i></div>'}</div>
          ${photos.length > 1 ? `<div class="ro-thumbs">${photos.map((p, i) => `<button type="button" class="${i ? '' : 'on'}" data-ph="${p}"><img src="${p}" alt=""></button>`).join('')}</div>` : ''}</div>
        <div>
          <div class="ro-price" style="font-size:30px">${RV.money(item.price)}${item.oldPrice ? `<s>${RV.money(item.oldPrice)}</s>` : ''}</div>
          <dl class="ro-specs"><dt>Stan</dt><dd>${esc(item.condition)}</dd><dt>Kategoria</dt><dd>${esc(item.category)}</dd>${item.dimensions ? `<dt>Wymiary</dt><dd>${esc(item.dimensions)}</dd>` : ''}<dt>Odbiór</dt><dd>${esc(item.location || 'Słupsk')}</dd><dt>Dowóz</dt><dd>${item.deliveryAvailable ? (item.deliveryPrice ? RV.money(item.deliveryPrice) : 'wycena przy rezerwacji') : 'tylko odbiór osobisty'}</dd><dt>Numer</dt><dd>${esc(item.number || '')}</dd></dl>
          ${item.description ? `<p style="white-space:pre-wrap;color:#c4c8cf;line-height:1.6">${esc(item.description)}</p>` : ''}
          ${item.status === 'available' ? `<form id="roOrder" class="pt-form" novalidate style="margin-top:16px">
            <div class="pt-field full"><span class="pt-label">Jak chcesz odebrać?</span><div class="pt-options">
              <label class="pt-option"><input type="radio" name="delivery" value="pickup" checked><span><i class="fa-solid fa-person-walking"></i> Odbiór osobisty</span></label>
              ${item.deliveryAvailable ? '<label class="pt-option"><input type="radio" name="delivery" value="delivery"><span><i class="fa-solid fa-truck"></i> Dowóz z wniesieniem</span></label>' : ''}</div></div>
            <div class="pt-field"><label for="roName">Imię i nazwisko</label><input id="roName" name="name" required minlength="2" autocomplete="name" value="${esc(me?.name || '')}"></div>
            <div class="pt-field"><label for="roPhone">Telefon</label><input id="roPhone" name="phone" type="tel" required autocomplete="tel" value="${esc(me?.phone || '')}"></div>
            <div class="pt-field full"><label for="roEmail">E-mail (potwierdzenie rezerwacji)</label><input id="roEmail" name="email" type="email" autocomplete="email" value="${esc(me?.email || '')}"></div>
            <div class="pt-field full" id="roAddrWrap" hidden><label for="roAddr">Adres dostawy</label><input id="roAddr" name="address" autocomplete="street-address" placeholder="Miasto, ulica, numer, piętro"></div>
            <div class="pt-field full"><label for="roNote">Uwagi (opcjonalnie)</label><input id="roNote" name="note" placeholder="np. najlepiej po 16:00"></div>
            <input class="pt-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
            <label class="pt-check full"><input type="checkbox" name="consent" required><span>Zgadzam się na kontakt RevSerwis w sprawie rezerwacji (<a href="polityka-prywatnosci.html" target="_blank">polityka prywatności</a>).</span></label>
            <label class="pt-check full"><input type="checkbox" name="newsletter"><span>Chcę dostawać e-mailem nowości z RevOutlet i promocje (opcjonalnie, wypis w każdej chwili).</span></label>
            <div class="pt-error full" role="alert"></div>
            <button class="rv-button full" type="submit">Zarezerwuj — zapłacisz przy odbiorze <i class="fa-solid fa-arrow-right"></i></button>
            <p class="pt-muted pt-small full" style="margin:0">Rezerwacja jest bezpłatna. Zadzwonimy, żeby potwierdzić termin. Rzecz czeka na Ciebie 3 dni.</p>
          </form>` : `<div class="pt-success" style="margin-top:16px"><h3>${item.status === 'sold' ? 'Sprzedane' : 'Zarezerwowane'}</h3><p>Ta rzecz ${item.status === 'sold' ? 'znalazła już nowego właściciela' : 'czeka na odbiór przez innego klienta'}. Zobacz inne w RevOutlet.</p></div>`}
        </div></div>`, { wide: true });
      $$('[data-ph]', d).forEach(b => b.addEventListener('click', () => { $('#roMain', d).src = b.dataset.ph; $$('[data-ph]', d).forEach(x => x.classList.toggle('on', x === b)); }));
      const form = $('#roOrder', d);
      if (!form) return;
      const rid = RV.rid();
      $$('input[name=delivery]', form).forEach(r => r.addEventListener('change', () => { const on = form.delivery.value === 'delivery'; $('#roAddrWrap', form).hidden = !on; $('#roAddr', form).required = on; }));
      form.addEventListener('submit', e => {
        e.preventDefault();
        RV.submit(form, async () => {
          const data = RV.formData(form);
          const r = await RV.api('/api/outlet/orders', { method: 'POST', body: { ...data, item: item.id, requestId: rid } });
          form.outerHTML = `<div class="pt-success" style="margin-top:16px"><h3><i class="fa-solid fa-circle-check"></i> Zarezerwowane — ${esc(r.number)}</h3><p>Zadzwonimy na podany numer, żeby potwierdzić ${data.delivery === 'delivery' ? 'termin dowozu' : 'odbiór'}.${RV.me ? ' Rezerwację zobaczysz też w swoim koncie.' : ''}</p></div>`;
          load();
        });
      });
    }
    await RV.loadMe();
    try { await load(); } catch (e) { $('#roGrid').innerHTML = `<div class="pt-empty" style="grid-column:1/-1"><i class="fa-solid fa-triangle-exclamation"></i><h3>Nie udało się wczytać</h3><p>${esc(e.message)}</p></div>`; }
  };

  /* ================================================================== */
  /* RevPowrót                                                            */
  /* ================================================================== */

  PAGES.powrot = async () => {
    const root = $('#powrotApp');
    root.innerHTML = '<div class="pt-grid"><div class="pt-skel"></div><div class="pt-skel"></div></div>';
    let trips;
    try { trips = (await RV.api('/api/powrot')).trips; } catch (e) { root.innerHTML = `<div class="pt-empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Nie udało się wczytać kursów</h3><p>${esc(e.message)}</p></div>`; return; }
    await RV.loadMe();
    if (!trips.length) {
      root.innerHTML = '<div class="pt-empty"><i class="fa-solid fa-route"></i><h3>Brak wolnych kursów na najbliższe dni</h3><p>Nowe trasy dodajemy na bieżąco. Napisz na WhatsApp, skąd i dokąd chcesz coś przewieźć — damy znać, gdy będziemy jechać w tę stronę.</p><p style="margin-top:14px"><a class="rv-button" href="https://wa.me/48735396534?text=Dzie%C5%84%20dobry%2C%20interesuje%20mnie%20RevPowr%C3%B3t%20na%20trasie%3A%20" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Zapytaj o trasę</a></p></div>';
      return;
    }
    const card = t => {
      const pct = t.capacityM3 ? Math.round((1 - t.remainingM3 / t.capacityM3) * 100) : 100;
      const full = t.status !== 'open' || t.remainingM3 < 0.25;
      return `<article class="pt-card rp-card">
        <div class="rp-route"><div class="rp-city"><small>Skąd</small>${esc(t.from)}</div><div class="rp-line" aria-hidden="true"></div><div class="rp-city to"><small>Dokąd</small>${esc(t.to)}</div></div>
        <div class="rp-row"><span><i class="fa-regular fa-calendar"></i>${RV.dayShort(t.date)}${t.dateFlexDays ? ` (±${t.dateFlexDays} dni)` : ''}</span>${t.via ? `<span><i class="fa-solid fa-signs-post"></i>przez ${esc(t.via)}</span>` : ''}${t.vehicle ? `<span><i class="fa-solid fa-truck"></i>${esc(t.vehicle)}</span>` : ''}</div>
        <div><div class="rp-row" style="justify-content:space-between"><span>Wolne miejsce: <strong style="color:#fff">${t.remainingM3} m³</strong> z ${t.capacityM3} m³</span>${t.discountPct ? `<span class="pt-badge mint">−${t.discountPct}% vs zwykły transport</span>` : ''}</div><div class="rp-meter" style="margin-top:8px"><span style="width:${pct}%"></span></div></div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div class="rp-price">${t.pricePerM3 ? `${RV.money(t.pricePerM3)} <small>/ m³</small>` : '<small>Cena po wycenie</small>'}${t.minPrice ? `<div class="pt-muted pt-small">minimum ${RV.money(t.minPrice)}</div>` : ''}</div>
          <button class="rv-button" type="button" data-book="${esc(t.id)}" ${full ? 'disabled' : ''}>${full ? 'Brak miejsca' : 'Zarezerwuj miejsce'}</button></div>
        ${t.notes ? `<p class="pt-small pt-muted" style="margin:0">${esc(t.notes)}</p>` : ''}
      </article>`;
    };
    root.innerHTML = `<div class="pt-grid cols-2">${trips.map(card).join('')}</div>`;
    $$('[data-book]', root).forEach(b => b.addEventListener('click', () => book(trips.find(t => t.id === b.dataset.book))));

    function book(t) {
      const me = RV.me;
      const rid = RV.rid();
      const d = RV.dialog(`${t.from} → ${t.to} · ${RV.dayShort(t.date)}`, `<form class="pt-form" novalidate>
        <div class="pt-field"><label for="bkVol">Ile miejsca potrzebujesz? (m³)</label><input id="bkVol" name="volumeM3" type="number" min="0.25" max="${t.remainingM3}" step="0.25" value="${Math.min(2, t.remainingM3)}" required inputmode="decimal"><span class="hint">1 m³ ≈ 10 kartonów albo komoda. Wolne: ${t.remainingM3} m³.</span></div>
        <div class="pt-field"><span class="pt-label">Cena orientacyjna</span><div class="rp-price" id="bkPrice">—</div><span class="hint">Ostateczną potwierdzimy telefonicznie.</span></div>
        <div class="pt-field full"><label for="bkItems">Co przewozimy?</label><textarea id="bkItems" name="items" required minlength="3" placeholder="np. szafa 2-drzwiowa, łóżko 160×200, 12 kartonów"></textarea></div>
        <div class="pt-field"><label for="bkFrom">Adres odbioru</label><input id="bkFrom" name="pickupAddress" required placeholder="${esc(t.from)}, ulica, numer"></div>
        <div class="pt-field"><label for="bkTo">Adres dostawy</label><input id="bkTo" name="dropAddress" required placeholder="${esc(t.to)}, ulica, numer"></div>
        <div class="pt-field full"><label for="bkFloor">Piętra i winda (opcjonalnie)</label><input id="bkFloor" name="floorInfo" placeholder="np. odbiór 3 piętro bez windy, dostawa parter"></div>
        <div class="pt-field"><label for="bkName">Imię i nazwisko</label><input id="bkName" name="name" required autocomplete="name" value="${esc(me?.name || '')}"></div>
        <div class="pt-field"><label for="bkPhone">Telefon</label><input id="bkPhone" name="phone" type="tel" required autocomplete="tel" value="${esc(me?.phone || '')}"></div>
        <div class="pt-field full"><label for="bkEmail">E-mail</label><input id="bkEmail" name="email" type="email" autocomplete="email" value="${esc(me?.email || '')}"></div>
        <input class="pt-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <label class="pt-check full"><input type="checkbox" name="consent" required><span>Zgadzam się na kontakt RevSerwis w sprawie rezerwacji (<a href="polityka-prywatnosci.html" target="_blank">polityka prywatności</a>).</span></label>
        <label class="pt-check full"><input type="checkbox" name="newsletter"><span>Powiadamiajcie mnie e-mailem o nowych wolnych kursach (opcjonalnie).</span></label>
        <div class="pt-error full" role="alert"></div>
        <button class="rv-button full" type="submit">Rezerwuję miejsce <i class="fa-solid fa-arrow-right"></i></button>
      </form>`);
      const form = $('form', d);
      const price = () => {
        const v = Number(String(form.volumeM3.value).replace(',', '.')) || 0;
        const p = Math.max(v * (t.pricePerM3 || 0), t.minPrice || 0);
        $('#bkPrice', d).textContent = t.pricePerM3 || t.minPrice ? RV.money(Math.round(p * 100) / 100) : 'po wycenie';
      };
      form.volumeM3.addEventListener('input', price);
      price();
      form.addEventListener('submit', e => {
        e.preventDefault();
        RV.submit(form, async () => {
          const data = RV.formData(form);
          const r = await RV.api('/api/powrot/bookings', { method: 'POST', body: { ...data, volumeM3: Number(String(data.volumeM3).replace(',', '.')), trip: t.id, requestId: rid } });
          form.outerHTML = `<div class="pt-success"><h3><i class="fa-solid fa-circle-check"></i> Miejsce zarezerwowane — ${esc(r.number)}</h3><p>Cena orientacyjna: <strong>${RV.money(r.price)}</strong>. Zadzwonimy, żeby ustalić godzinę odbioru.</p></div>`;
          setTimeout(() => PAGES.powrot(), 400);
        });
      });
    }
  };

  /* ================================================================== */
  /* Abonamenty                                                           */
  /* ================================================================== */

  const PERIOD = { month: '/ mies.', season: '/ sezon', year: '/ rok' };
  RV.PERIOD = PERIOD;

  PAGES.abonamenty = async () => {
    const root = $('#plansApp');
    root.innerHTML = '<div class="pt-grid"><div class="pt-skel"></div><div class="pt-skel"></div><div class="pt-skel"></div></div>';
    let plans;
    try { plans = (await RV.api('/api/plany')).plans; } catch (e) { root.innerHTML = `<div class="pt-empty"><h3>Nie udało się wczytać planów</h3><p>${esc(e.message)}</p></div>`; return; }
    if (!plans.length) {
      root.innerHTML = '<div class="pt-empty"><i class="fa-solid fa-rotate"></i><h3>Cennik abonamentów przygotowujemy</h3><p>Napisz albo zadzwoń — ustalimy stałą opiekę nad Twoją posesją lub obiektem już teraz.</p><p style="margin-top:14px"><a class="rv-button" href="kontakt.html">Zapytaj o abonament</a></p></div>';
      return;
    }
    root.innerHTML = `<div class="pt-grid cols-3">${plans.map(p => `<article class="pt-card pl-card ${p.highlight ? 'hl' : ''}">
        ${p.highlight ? '<span class="pt-badge mint pl-top">Najczęściej wybierany</span>' : ''}
        <div><span class="pt-badge">${esc(p.divisionName || 'RevSerwis')}</span>${p.audience === 'company' ? ' <span class="pt-badge blue">Dla firm</span>' : ''}</div>
        <div><h3 style="font-size:21px">${esc(p.name)}</h3><p>${esc(p.tagline || '')}</p></div>
        <div class="pl-price">${RV.money(p.price)} <small>${PERIOD[p.billingPeriod] || ''}</small></div>
        ${p.season ? `<div class="pt-small pt-muted"><i class="fa-regular fa-calendar"></i> Sezon: ${esc(p.season)}</div>` : ''}
        <ul class="pl-list">${(p.features || []).map(f => `<li><i class="fa-solid fa-check"></i><span>${esc(f)}</span></li>`).join('')}${p.visitsPerPeriod ? `<li><i class="fa-solid fa-check"></i><span>${p.visitsPerPeriod} ${p.visitsPerPeriod === 1 ? 'wizyta' : 'wizyty'} w okresie rozliczeniowym</span></li>` : ''}</ul>
        <a class="pt-btn ${p.highlight ? 'primary' : ''}" href="/konto#/abonamenty?plan=${encodeURIComponent(p.id)}">Wybieram ten plan <i class="fa-solid fa-arrow-right"></i></a>
      </article>`).join('')}</div>`;
  };

  /* ================================================================== */
  /* Partnerzy — biura nieruchomości                                      */
  /* ================================================================== */

  PAGES.partnerzy = async () => {
    const form = $('#partnerForm');
    if (!form) return;
    const rid = RV.rid();
    form.addEventListener('submit', e => {
      e.preventDefault();
      RV.submit(form, async () => {
        await RV.api('/api/partnerzy/zgloszenie', { method: 'POST', body: { ...RV.formData(form), requestId: rid } });
        form.outerHTML = '<div class="pt-success"><h3><i class="fa-solid fa-circle-check"></i> Dziękujemy!</h3><p>Odezwiemy się w ciągu 1–2 dni roboczych. W międzyczasie załóż konto w <a href="/konto" style="color:var(--rv-accent)">panelu klienta</a> — po weryfikacji włączymy w nim portal partnerski.</p></div>';
      });
    });
  };

  /* ================================================================== */
  /* Kariera                                                              */
  /* ================================================================== */

  PAGES.kariera = async () => {
    const root = $('#karieraApp');
    const C = window.RV_CAREER || {};
    let track = location.hash === '#franczyza' ? 'franczyza' : location.hash === '#marketing' ? 'marketing' : 'dzial';
    const rid = RV.rid();
    const field = (name, label, attrs = '', extra = '') => `<div class="pt-field ${extra}"><label for="kr_${name}">${label}</label><input id="kr_${name}" name="${name}" ${attrs}></div>`;
    const render = () => {
      $$('.kr-track').forEach(b => b.classList.toggle('on', b.dataset.track === track));
      const specific = track === 'dzial'
        ? `<div class="pt-field full"><span class="pt-label">Dział</span><div class="pt-options">${C.departments.map((d, i) => `<label class="pt-option"><input type="radio" name="department" value="${esc(d)}" ${i ? '' : 'required'}><span>${esc(d)}</span></label>`).join('')}</div></div>
           <div class="pt-field"><label for="kr_av">Dostępność</label><select id="kr_av" name="availability"><option value="">— wybierz —</option>${opts(C.availability)}</select></div>
           <div class="pt-field"><span class="pt-label">Prawo jazdy</span><div class="pt-options">${C.licenses.map(l => `<label class="pt-option"><input type="checkbox" name="licenses" value="${esc(l)}" data-group="1"><span>${esc(l)}</span></label>`).join('')}</div></div>
           <div class="pt-field full"><label for="kr_exp">Doświadczenie</label><textarea id="kr_exp" name="experience" placeholder="Gdzie pracowałeś/aś? Przeprowadzki, magazyn, budowa, ogród…"></textarea></div>`
        : track === 'marketing'
          ? `<div class="pt-field full"><span class="pt-label">Obszar</span><div class="pt-options">${C.marketing.map((d, i) => `<label class="pt-option"><input type="radio" name="role" value="${esc(d)}" ${i ? '' : 'required'}><span>${esc(d)}</span></label>`).join('')}</div></div>
             <div class="pt-field"><label for="kr_av">Dostępność</label><select id="kr_av" name="availability"><option value="">— wybierz —</option>${opts(C.availability)}</select></div>
             ${field('link', 'Portfolio / profil (link)', 'type="url" placeholder="https://"')}
             <div class="pt-field full"><label for="kr_exp">Doświadczenie</label><textarea id="kr_exp" name="experience" placeholder="Konta, które prowadziłeś/aś, kampanie, grafiki, wyniki…"></textarea></div>`
          : `${field('f_city', 'Miasto, w którym chcesz otworzyć RevSerwis', 'required minlength="2" data-f="city"', 'full')}
             <div class="pt-field"><label for="kr_budget">Budżet na start</label><select id="kr_budget" data-f="budget"><option value="">— wybierz —</option>${opts(C.budgets)}</select></div>
             <div class="pt-field"><label for="kr_tl">Kiedy chcesz zacząć?</label><select id="kr_tl" data-f="timeline"><option value="">— wybierz —</option>${opts(C.timelines)}</select></div>
             <div class="pt-field full"><span class="pt-label">Co już masz?</span><div class="pt-options">
               <label class="pt-option"><input type="checkbox" data-f="hasCompany"><span><i class="fa-solid fa-building"></i> Działalność gospodarczą</span></label>
               <label class="pt-option"><input type="checkbox" data-f="hasVehicle"><span><i class="fa-solid fa-truck"></i> Busa / auto dostawcze</span></label>
               <label class="pt-option"><input type="checkbox" data-f="hasTeam"><span><i class="fa-solid fa-people-group"></i> Ludzi do ekipy</span></label></div></div>
             <div class="pt-field full"><label for="kr_bx">Doświadczenie w biznesie</label><textarea id="kr_bx" data-f="businessExperience" placeholder="Czym się zajmujesz? Prowadziłeś/aś firmę? Znasz lokalny rynek?"></textarea></div>`;
      $('#krForm').innerHTML = `
        ${field('name', 'Imię i nazwisko', 'required minlength="2" autocomplete="name"')}
        ${field('city', track === 'franczyza' ? 'Gdzie mieszkasz?' : 'Miasto', 'required minlength="2" autocomplete="address-level2"')}
        ${field('email', 'E-mail', 'type="email" required autocomplete="email"')}
        ${field('phone', 'Telefon', 'type="tel" required autocomplete="tel"')}
        ${specific}
        ${track !== 'marketing' ? field('link', 'Link do CV / LinkedIn (opcjonalnie)', 'type="url" placeholder="https://"', 'full') : ''}
        <div class="pt-field full"><label for="kr_msg">${track === 'franczyza' ? 'Dlaczego RevSerwis?' : 'Kilka słów o sobie'} (opcjonalnie)</label><textarea id="kr_msg" name="message"></textarea></div>
        <input class="pt-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <label class="pt-check full"><input type="checkbox" name="consent" required><span>Wyrażam zgodę na przetwarzanie moich danych przez Rev Serwis Kacper Taczała w celu ${track === 'franczyza' ? 'rozmów o franczyzie' : 'rekrutacji'} (<a href="polityka-prywatnosci.html" target="_blank">polityka prywatności</a>).</span></label>
        <div class="pt-error full" role="alert"></div>
        <button class="rv-button full" type="submit">${track === 'franczyza' ? 'Wyślij zapytanie o franczyzę' : 'Wyślij zgłoszenie'} <i class="fa-solid fa-arrow-right"></i></button>`;
    };
    root.innerHTML = `<div class="kr-tracks">
        <button type="button" class="pt-card kr-track" data-track="dzial"><div class="pt-icon"><i class="fa-solid fa-people-carry-box"></i></div><h3>Działy usługowe</h3><p>Przeprowadzki, opróżnianie mieszkań, transport, ogród, odśnieżanie, kierowcy.</p></button>
        <button type="button" class="pt-card kr-track" data-track="marketing"><div class="pt-icon"><i class="fa-solid fa-bullhorn"></i></div><h3>Dział marketingu</h3><p>Social media, grafika i wideo, zdjęcia realizacji, sprzedaż B2B, SEO.</p></button>
        <button type="button" class="pt-card kr-track" data-track="franczyza" id="franczyza"><div class="pt-icon"><i class="fa-solid fa-city"></i></div><h3>Franczyza RevSerwis</h3><p>Otwórz RevSerwis w swoim mieście: marka, panel RevMi, wyceny RevBot i zlecenia z internetu.</p></button>
      </div>
      <form id="krForm" class="pt-form pt-card" novalidate style="margin-top:16px;padding:24px"></form>`;
    $$('.kr-track', root).forEach(b => b.addEventListener('click', () => { track = b.dataset.track; history.replaceState(null, '', '#' + (track === 'dzial' ? '' : track)); render(); $('#krForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    render();
    $('#krForm').addEventListener('submit', e => {
      e.preventDefault();
      const form = e.target;
      if (track === 'dzial' && !form.querySelector('input[name=department]:checked')) { RV.toast('Wybierz dział.', 'error'); return; }
      if (track === 'marketing' && !form.querySelector('input[name=role]:checked')) { RV.toast('Wybierz obszar marketingu.', 'error'); return; }
      RV.submit(form, async () => {
        const data = RV.formData(form);
        delete data.f_city;
        const body = { ...data, track, requestId: rid };
        if (track === 'franczyza') {
          body.franchise = {};
          $$('[data-f]', form).forEach(el => { body.franchise[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; });
        }
        const r = await RV.api('/api/kariera', { method: 'POST', body });
        form.innerHTML = `<div class="pt-success full"><h3><i class="fa-solid fa-circle-check"></i> Dziękujemy! Zgłoszenie ${esc(r.number)} dotarło.</h3><p>Odezwiemy się w ciągu kilku dni roboczych${data.email ? ` — sprawdź też skrzynkę ${esc(data.email)}` : ''}.</p></div>`;
      });
    });
  };

  /* ================================================================== */
  /* Newsletter — zapis, potwierdzenie, wypis                             */
  /* ================================================================== */

  PAGES.newsletter = async () => {
    const root = $('#newsApp');
    const q = new URLSearchParams(location.search);
    const done = (icon, title, text, ok = true) => `<div class="pt-card" style="text-align:center;padding:36px 24px"><div class="pt-icon" style="margin:0 auto 14px;width:64px;height:64px;font-size:26px;${ok ? '' : 'background:rgba(248,113,113,.12);color:#fca5a5'}"><i class="fa-solid ${icon}"></i></div><h2 style="margin:0 0 8px;color:#fff">${esc(title)}</h2><p style="color:#c4c8cf;margin:0 auto;max-width:460px;line-height:1.6">${esc(text)}</p><p style="margin-top:20px"><a class="rv-button" href="index.html">Wróć na stronę</a></p></div>`;
    for (const [param, url, icon] of [['potwierdz', '/api/newsletter/potwierdz', 'fa-circle-check'], ['wypisz', '/api/newsletter/wypisz', 'fa-envelope-circle-check']]) {
      const token = q.get(param);
      if (!token) continue;
      history.replaceState(null, '', 'newsletter.html');
      root.innerHTML = '<div class="pt-skel"></div>';
      try { const r = await RV.api(url, { method: 'POST', body: { token } }); root.innerHTML = done(icon, param === 'potwierdz' ? 'Gotowe — jesteś na liście!' : 'Wypisano z newslettera', r.message); }
      catch (e) { root.innerHTML = done('fa-triangle-exclamation', 'Nie udało się', e.message, false); }
      return;
    }
    const T = (window.RV_NEWS || {}).topics || {};
    root.innerHTML = `<form class="pt-form pt-card" id="nlForm" novalidate style="padding:24px">
      <div class="pt-field"><label for="nlE">E-mail</label><input id="nlE" name="email" type="email" required autocomplete="email"></div>
      <div class="pt-field"><label for="nlN">Imię (opcjonalnie)</label><input id="nlN" name="name" autocomplete="given-name"></div>
      <div class="pt-field full"><label for="nlC">Miasto (opcjonalnie — dostaniesz oferty z Twojej okolicy)</label><input id="nlC" name="city" autocomplete="address-level2"></div>
      <div class="pt-field full"><span class="pt-label">Co Cię interesuje?</span><div class="pt-options">${Object.entries(T).map(([k, l]) => `<label class="pt-option"><input type="checkbox" name="topics" value="${esc(k)}" data-group="1" ${['promocje', 'outlet', 'sezon'].includes(k) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></div>
      <input class="pt-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label class="pt-check full"><input type="checkbox" name="consent" required><span>Chcę dostawać informacje handlowe od Rev Serwis Kacper Taczała na podany e-mail. Mogę wycofać zgodę w każdej chwili linkiem w wiadomości (<a href="polityka-prywatnosci.html" target="_blank">polityka prywatności</a>).</span></label>
      <div class="pt-error full" role="alert"></div>
      <button class="rv-button full" type="submit">Zapisuję się <i class="fa-solid fa-arrow-right"></i></button>
      <p class="pt-small pt-muted full" style="margin:0">Po zapisie wyślemy e-mail z linkiem potwierdzającym — bez kliknięcia nie wyślemy żadnych ofert.</p></form>`;
    const f = $('#nlForm');
    f.addEventListener('submit', e => {
      e.preventDefault();
      RV.submit(f, async () => {
        const r = await RV.api('/api/newsletter', { method: 'POST', body: { ...RV.formData(f), source: 'stopka' } });
        root.innerHTML = done('fa-envelope-open-text', r.status === 'active' ? 'Już jesteś na liście' : 'Sprawdź skrzynkę', r.message);
      });
    });
  };

  /* ================================================================== */
  /* Odbiór mieszkania — nabywcy od dewelopera                            */
  /* ================================================================== */

  PAGES.odbior = async () => {
    const root = $('#odbiorApp');
    const ask = (msg = '') => {
      root.innerHTML = `<form class="pt-card" id="odCode" novalidate style="padding:24px;display:grid;gap:14px;max-width:520px">
        <h2 style="margin:0;color:#fff;font-size:22px">Wpisz kod inwestycji</h2><p class="pt-muted" style="margin:0">Kod znajdziesz w materiałach od dewelopera (np. w protokole odbioru).</p>
        <div class="pt-field"><label for="odC">Kod</label><input id="odC" name="code" required maxlength="12" autocomplete="off" style="text-transform:uppercase;letter-spacing:.15em;font-weight:800;font-size:20px" placeholder="np. OSIE7KX"></div>
        ${msg ? `<div class="pt-error show">${esc(msg)}</div>` : ''}
        <button class="rv-button" type="submit">Dalej <i class="fa-solid fa-arrow-right"></i></button>
        <p class="pt-small pt-muted" style="margin:0">Nie masz kodu? <a href="wycena.html" style="color:var(--rv-accent)">Wyceń przeprowadzkę online</a> albo zadzwoń: <a href="tel:+48735396534" style="color:var(--rv-accent)">735 396 534</a>.</p></form>`;
      $('#odCode').addEventListener('submit', e => { e.preventDefault(); const c = e.target.code.value.trim().toUpperCase(); if (c) { history.replaceState(null, '', '?kod=' + encodeURIComponent(c)); load(c); } });
    };
    const load = async code => {
      root.innerHTML = '<div class="pt-skel"></div>';
      let d;
      try { d = await RV.api('/api/deweloper/' + encodeURIComponent(code)); } catch (e) { ask(e.message); return; }
      const inv = d.investment;
      const rid = RV.rid();
      root.innerHTML = `<div class="pt-card" style="padding:22px;margin-bottom:14px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;justify-content:space-between">
          <div><span class="pt-badge mint"><i class="fa-solid fa-building"></i> ${esc(inv.name)}</span><h2 style="margin:10px 0 4px;color:#fff;font-size:22px">${esc(inv.city)}${inv.address ? ', ' + esc(inv.address) : ''}</h2>${inv.buyerOffer ? `<p style="margin:0">${esc(inv.buyerOffer)}</p>` : ''}</div>
          ${inv.discountPct ? `<div style="text-align:center"><div style="font-size:38px;font-weight:800;color:var(--rv-accent);line-height:1">−${inv.discountPct}%</div><small class="pt-muted">rabat dla nabywców</small></div>` : ''}</div>
        <form class="pt-form pt-card" id="odForm" novalidate style="padding:24px">
          <div class="pt-field full"><span class="pt-label">Czego potrzebujesz?</span><div class="pt-options">${d.services.map((s, i) => `<label class="pt-option"><input type="checkbox" name="services" value="${esc(s)}" data-group="1" ${i === 0 ? 'checked' : ''}><span>${esc(s)}</span></label>`).join('')}</div></div>
          <div class="pt-field"><label for="odN">Imię i nazwisko</label><input id="odN" name="name" required autocomplete="name"></div>
          <div class="pt-field"><label for="odP">Telefon</label><input id="odP" name="phone" type="tel" required autocomplete="tel"></div>
          <div class="pt-field"><label for="odE">E-mail</label><input id="odE" name="email" type="email" autocomplete="email"></div>
          <div class="pt-field"><label for="odU">Numer lokalu</label><input id="odU" name="unit" placeholder="np. B/12"></div>
          <div class="pt-field"><label for="odH">Odbiór kluczy</label><input id="odH" name="handoverDate" type="date"></div>
          <div class="pt-field"><label for="odM">Kiedy chcesz się przeprowadzić?</label><input id="odM" name="moveDate" type="date" min="${RV.todayISO()}"></div>
          <div class="pt-field full"><label for="odF">Skąd się przeprowadzasz?</label><input id="odF" name="fromAddress" placeholder="Miasto, ulica, piętro"></div>
          <div class="pt-field full"><label for="odNo">Uwagi (opcjonalnie)</label><textarea id="odNo" name="notes" placeholder="Ile pokoi, co przewozimy, czy jest winda…"></textarea></div>
          <input class="pt-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <label class="pt-check full"><input type="checkbox" name="consent" required><span>Zgadzam się na kontakt RevSerwis w sprawie przeprowadzki (<a href="polityka-prywatnosci.html" target="_blank">polityka prywatności</a>).</span></label>
          <label class="pt-check full"><input type="checkbox" name="newsletter"><span>Chcę dostawać e-mailem promocje RevSerwis (opcjonalnie).</span></label>
          <div class="pt-error full" role="alert"></div>
          <button class="rv-button full" type="submit">Wyślij zgłoszenie <i class="fa-solid fa-arrow-right"></i></button></form>`;
      const f = $('#odForm');
      f.addEventListener('submit', e => {
        e.preventDefault();
        RV.submit(f, async () => {
          const body = RV.formData(f);
          if (!body.services?.length) throw new Error('Wybierz przynajmniej jedną usługę.');
          for (const k of ['handoverDate', 'moveDate']) if (!body[k]) body[k] = null;
          const r = await RV.api('/api/deweloper/' + encodeURIComponent(code) + '/zgloszenie', { method: 'POST', body: { ...body, requestId: rid } });
          f.outerHTML = `<div class="pt-success"><h3><i class="fa-solid fa-circle-check"></i> Dziękujemy! Zgłoszenie ${esc(r.number)} dotarło.</h3><p>Zadzwonimy w ciągu jednego dnia roboczego, żeby ustalić termin${inv.discountPct ? ` — rabat ${inv.discountPct}% uwzględnimy w wycenie` : ''}. Chcesz śledzić zlecenie online? <a href="/konto#rejestracja" style="color:var(--rv-accent)">Załóż konto</a> na ten sam e-mail.</p></div>`;
        });
      });
    };
    const code = new URLSearchParams(location.search).get('kod');
    if (code) load(code.toUpperCase()); else ask();
  };

  /* ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (PAGES[page]) PAGES[page]().catch(e => console.error(e));
  });
})();
