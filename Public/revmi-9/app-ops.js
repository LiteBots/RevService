/* RevMi 7.0 — wycena AI w zgłoszeniach, Magazyn (miejsca, zajętość, zdjęcia) i Sortownia */
'use strict';

(function () {
  const RM = window.RM;
  const { esc, $, $$ } = RM;
  const S = RM.state;
  const views = RM.views;
  const H = () => RM.helpers;
  const empty = (...a) => H().empty(...a);
  const n1 = v => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(Number(v) || 0);
  const n2 = v => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(Number(v) || 0);
  const UNIT_LABEL = { kg: 'kg', szt: 'szt.', m3: 'm³' };
  const fillTone = pct => (pct === null || pct === undefined ? 'muted' : pct >= 100 ? 'red' : pct >= 80 ? 'orange' : 'green');
  const bar = (pct, tone) => `<div class="fill fill-${tone}"><i style="width:${Math.min(100, Math.max(0, pct || 0))}%"></i></div>`;

  /* ================================================================== */
  /* ZDJĘCIA — wybór i kompresja w przeglądarce (JPEG 1600 px)           */
  /* ================================================================== */

  async function compressImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      let q = 0.82;
      let data = c.toDataURL('image/jpeg', q);
      while (data.length > 1300000 && q > 0.4) { q -= 0.12; data = c.toDataURL('image/jpeg', q); }
      return data;
    } finally { URL.revokeObjectURL(url); }
  }

  /** Otwiera wybór zdjęć (aparat w telefonie) i zwraca tablicę data-URL. */
  RM.pickPhotos = (max = 6) => new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.addEventListener('change', async () => {
      const out = [];
      for (const f of [...input.files].slice(0, max)) {
        try { out.push(await compressImage(f)); } catch { RM.toast('Nie udało się wczytać zdjęcia ' + f.name, 'error'); }
      }
      resolve(out);
    });
    input.click();
  });

  /** Pole formularza ze zdjęciami (do RM.form, type: 'html'). */
  function photoField(store, max) {
    const id = 'ph_' + Math.random().toString(36).slice(2, 8);
    return {
      html: `<span class="label">Zdjęcia (max ${max})</span><div class="ph-field" id="${id}"><div class="ph-thumbs"></div><button type="button" class="btn sm" data-addph><i class="fa-solid fa-camera"></i> Dodaj zdjęcia</button></div>`,
      bind(form) {
        const box = $('#' + id, form.closest('dialog') || document);
        const render = () => {
          $('.ph-thumbs', box).innerHTML = store.map((d, i) => `<span class="ph"><img src="${d}" alt=""><button type="button" data-rmph="${i}" aria-label="Usuń">×</button></span>`).join('');
          $('[data-addph]', box).style.display = store.length >= max ? 'none' : '';
        };
        box.addEventListener('click', async e => {
          if (e.target.closest('[data-addph]')) {
            const added = await RM.pickPhotos(max - store.length);
            store.push(...added.slice(0, max - store.length));
            render();
          }
          const rm = e.target.closest('[data-rmph]');
          if (rm) { store.splice(Number(rm.dataset.rmph), 1); render(); }
        });
        render();
      }
    };
  }

  /* ================================================================== */
  /* WYCENA AI w zgłoszeniu                                              */
  /* ================================================================== */

  const CONF = { high: ['Wysoka pewność', 'green'], medium: ['Średnia pewność', 'orange'], low: ['Niska pewność', 'red'] };

  RM.aiBadge = t => {
    const e = t.aiEstimate;
    if (!e || !e.high) return '';
    return `<span class="ai-chip ${e.source === 'ai' ? '' : 'fb'}"><i class="fa-solid ${e.source === 'ai' ? 'fa-wand-magic-sparkles' : 'fa-calculator'}"></i>${e.source === 'ai' ? 'AI' : 'Widełki'}: ${esc(RM.money(e.low))} – ${esc(RM.money(e.high))}</span>`;
  };

  RM.aiSection = t => {
    const e = t.aiEstimate;
    if (!e || !RM.isAdmin()) return '';
    const list = a => (a || []).map(x => `<li>${esc(x)}</li>`).join('');
    const adm = e.admin || {};
    const admRows = [['Ekipa', adm.crew], ['Pojazd / sprzęt', adm.vehicle], ['Czas pracy', adm.hours], ['Uwagi do realizacji', adm.notes], ['Ryzyka cenowe', adm.risk]].filter(([, v]) => v);
    return `<div class="section ai-box">
      <div class="ai-head"><h3><i class="fa-solid fa-wand-magic-sparkles"></i> ${e.source === 'ai' ? 'Wycena RevBot' : 'Wycena z cennika (bez AI)'}</h3>${RM.tag(CONF[e.confidence] || ['—', ''])}</div>
      <div class="ai-range">${esc(RM.money(e.low))} – ${esc(RM.money(e.high))}</div>
      ${e.summary ? `<p class="muted small" style="margin:4px 0 10px">${esc(e.summary)}</p>` : ''}
      ${(e.items || []).length > 1 ? `<div class="ai-items">${e.items.map(i => `<div><span>${esc(i.name)}</span><b>${esc(RM.money(i.low))} – ${esc(RM.money(i.high))}</b></div>`).join('')}</div>` : (e.items?.[0]?.note ? `<p class="small" style="margin:0 0 8px">${esc(e.items[0].note)}</p>` : '')}
      ${e.needsOnsite ? '<p class="ai-warn"><i class="fa-solid fa-location-dot"></i> AI zaleca oględziny przed podaniem ceny.</p>' : ''}
      ${admRows.length ? `<dl class="details-table ai-admin">${admRows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
      ${(e.observations || []).length ? `<details><summary>Obserwacje (${e.observations.length})</summary><ul class="ai-list">${list(e.observations)}</ul></details>` : ''}
      ${(e.priceFactors || []).length ? `<details><summary>Co może zmienić cenę</summary><ul class="ai-list">${list(e.priceFactors)}</ul></details>` : ''}
      ${(e.questions || []).length ? `<details><summary>Pytania do klienta</summary><ul class="ai-list">${list(e.questions)}</ul></details>` : ''}
      <p class="muted small ai-meta">${e.source === 'ai' ? 'Model ' + esc(e.model || '') : 'Powód: ' + esc(e.error || 'brak klucza Claude API')}${e.baseline ? ` · stawki bazowe ${esc(RM.money(e.baseline.low))} – ${esc(RM.money(e.baseline.high))}` : ''}${e.createdAt ? ' · ' + esc(RM.formatWhen(e.createdAt)) : ''}</p>
      <div class="btn-row">${t.status === 'new' ? `<button class="btn sm primary" data-ai-use="${esc(RM.id(t))}"><i class="fa-solid fa-tag"></i> Wyceń wg widełek</button>` : ''}<button class="btn sm" data-ai-rerun="${esc(RM.id(t))}"><i class="fa-solid fa-rotate"></i> Wyceń ponownie</button></div>
    </div>`;
  };

  /* Akcje z sekcji AI (delegacja — szuflada zlecenia jest renderowana przez app-main.js) */
  document.addEventListener('click', async e => {
    const use = e.target.closest('[data-ai-use]');
    if (use) {
      const t = RM.task(use.dataset.aiUse);
      if (t?.aiEstimate) RM.taskForm({ ...t, price: t.aiEstimate.low, priceMax: t.aiEstimate.high }, { status: 'quoted', price: t.aiEstimate.low, priceMax: t.aiEstimate.high }, 'Wyceń zgłoszenie');
      return;
    }
    const rerun = e.target.closest('[data-ai-rerun]');
    if (rerun) {
      if (!await RM.confirm('Wycenić zgłoszenie ponownie? (zużywa zapytanie do Claude API)', { ok: 'Wyceń', danger: false })) return;
      rerun.disabled = true;
      rerun.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Wyceniam…';
      try {
        const { aiEstimate } = await RM.api(`/api/tasks/${rerun.dataset.aiRerun}/ai-quote`, { method: 'POST' });
        const t = RM.task(rerun.dataset.aiRerun);
        if (t) t.aiEstimate = aiEstimate;
        RM.toast(aiEstimate.source === 'ai' ? `AI: ${RM.money(aiEstimate.low)} – ${RM.money(aiEstimate.high)}` : 'Wycena bez AI: ' + (aiEstimate.error || ''), aiEstimate.source === 'ai' ? 'ok' : 'error');
        RM.rerender();
        if (t && RM.openTask) RM.openTask(RM.id(t));
      } catch (err) { RM.fail(err); rerun.disabled = false; }
    }
  });

  /* ================================================================== */
  /* MAGAZYN — miejsca, zajętość, zdjęcia                                */
  /* ================================================================== */

  const UNIT_KIND = { boks: 'Boks', regal: 'Regał', strefa: 'Strefa', kontener: 'Kontener', inne: 'Inne' };

  async function loadUnits() {
    const data = await RM.api('/api/storage-units');
    S.storageUnits = data.units;
    return data;
  }
  RM.loadStorageUnits = loadUnits;

  views.magazyn = {
    title: 'Magazyn',
    admin: true,
    async render(el) {
      if (!el.querySelector('.storage-grid')) el.innerHTML = '<div class="skeleton"></div>';
      const all = S.ui.storageAll;
      const tab = S.ui.storageTab || 'items';
      const unitFilter = S.ui.storageUnit || '';
      const [{ items, summary }, occ] = await Promise.all([RM.api('/api/storage' + (all ? '?all=1' : '')), loadUnits()]);
      const t = occ.totals;
      const unitName = id => occ.units.find(u => u._id === String(id))?.name;
      const shown = unitFilter ? items.filter(i => (unitFilter === 'none' ? !i.unit : String(i.unit) === unitFilter)) : items;
      const ending = items.filter(i => i.status === 'stored' && i.endDate && new Date(i.endDate) < new Date(Date.now() + 14 * 86400000)).length;

      el.innerHTML = `
        <div class="page-head"><div><h1>Magazyn <span class="dvm">Rev<b>Storage</b></span></h1><p>Rzeczy klientów, miejsca w magazynie i wolna przestrzeń</p></div>
          <div class="page-actions"><label class="toggle-line"><span class="switch"><input type="checkbox" id="stAll" ${all ? 'checked' : ''}><span></span></span> Pokaż wydane</label>
          <button class="btn" id="addUnit"><i class="fa-solid fa-table-cells-large"></i> Dodaj miejsce</button>
          <button class="btn primary" id="addStorage"><i class="fa-solid fa-plus"></i> Przyjmij do magazynu</button></div></div>

        <section class="card pad cap-card">
          <div class="cap-top"><div><small>Zajętość magazynu</small><strong>${t.capacity ? `${n1(t.used + t.reserved)} / ${n1(t.capacity)} m³` : `${n1(t.used)} m³ zajęte`}</strong></div>
            <div class="cap-pct tone-${fillTone(t.pct)}">${t.pct === null ? '—' : t.pct + '%'}</div></div>
          ${t.capacity ? bar(t.pct, fillTone(t.pct)) : '<p class="muted small" style="margin:6px 0 0">Dodaj miejsca (boksy, regały, strefy) z pojemnością w m³ — panel policzy wolną przestrzeń.</p>'}
          <div class="cap-legend"><span><i class="dot green"></i>W magazynie ${n1(t.used)} m³</span><span><i class="dot blue"></i>Rezerwacje ${n1(t.reserved)} m³</span>${t.free !== null ? `<span><i class="dot muted"></i>Wolne ${n1(t.free)} m³</span>` : ''}${t.unassigned ? `<span class="warn-txt"><i class="fa-solid fa-triangle-exclamation"></i> Bez miejsca: ${n1(t.unassigned)} m³</span>` : ''}</div>
        </section>

        <div class="kpis">
          <div class="card kpi"><div class="kpi-label">W magazynie <i class="fa-solid fa-box-archive"></i></div><div class="kpi-value">${summary.stored}</div><div class="kpi-sub">${summary.reserved} rezerwacji</div></div>
          <div class="card kpi" style="--tone:var(--blue)"><div class="kpi-label">Wolne miejsce <i class="fa-solid fa-cubes"></i></div><div class="kpi-value">${t.free === null ? '—' : n1(t.free) + ' m³'}</div><div class="kpi-sub">${occ.units.filter(u => u.active !== false).length} miejsc w magazynie</div></div>
          <div class="card kpi" style="--tone:var(--purple)"><div class="kpi-label">Przychód miesięczny <i class="fa-solid fa-wallet"></i></div><div class="kpi-value">${esc(RM.money(summary.monthly))}</div><div class="kpi-sub">z aktywnych przechowań</div></div>
          <div class="card kpi" style="--tone:var(--orange)"><div class="kpi-label">Kończy się (14 dni) <i class="fa-solid fa-hourglass-half"></i></div><div class="kpi-value">${ending}</div><div class="kpi-sub">push 7 dni przed końcem</div></div>
        </div>

        <div class="toolbar" style="margin-bottom:14px"><div class="segmented"><button data-stab="items" class="${tab === 'items' ? 'active' : ''}">Rzeczy klientów<span class="n">${items.length}</span></button><button data-stab="units" class="${tab === 'units' ? 'active' : ''}">Miejsca w magazynie<span class="n">${occ.units.length}</span></button></div>
          ${tab === 'items' && occ.units.length ? `<select id="stUnit" class="sel-sm"><option value="">Wszystkie miejsca</option>${occ.units.map(u => `<option value="${esc(u._id)}" ${unitFilter === u._id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}<option value="none" ${unitFilter === 'none' ? 'selected' : ''}>Bez przypisanego miejsca</option></select>` : ''}</div>

        ${tab === 'units' ? `<div class="grid grid-auto storage-grid">${occ.units.map(u => `
          <article class="card res-card ${u.active === false ? 'is-off' : ''}">
            <div class="res-top"><span class="row-icon blue"><i class="fa-solid fa-table-cells-large"></i></span><div style="min-width:0"><h3>${esc(u.name)}</h3><p>${esc(UNIT_KIND[u.kind] || 'Miejsce')}${u.active === false ? ' · nieaktywne' : ''}</p></div><span style="margin-left:auto">${u.pct === null ? RM.tag(['bez pojemności', 'muted']) : RM.tag([u.pct + '%', fillTone(u.pct)])}</span></div>
            ${u.capacity ? bar(u.pct, fillTone(u.pct)) : ''}
            <div class="res-stats"><div><small>Pojemność</small><strong>${u.capacity ? n1(u.capacity) + ' m³' : '—'}</strong></div><div><small>Zajęte</small><strong>${n1(u.used + u.reserved)} m³</strong></div><div><small>Wolne</small><strong>${u.free === null ? '—' : n1(u.free) + ' m³'}</strong></div></div>
            ${u.notes ? `<p class="muted small" style="margin:0">${esc(u.notes)}</p>` : ''}
            <div class="res-actions"><button class="btn sm" data-uedit="${esc(u._id)}"><i class="fa-solid fa-pen"></i> Edytuj</button><button class="btn sm" data-ushow="${esc(u._id)}"><i class="fa-solid fa-boxes-stacked"></i> Rzeczy (${u.items})</button></div>
          </article>`).join('') || empty('fa-table-cells-large', 'Brak miejsc w magazynie', 'Dodaj boksy, regały lub strefy z pojemnością w m³ — zobaczysz, ile miejsca zostało.')}</div>`
    : `<div class="grid grid-auto storage-grid">${shown.map(i => `
          <article class="card res-card">
            <div class="res-top"><span class="row-icon blue"><i class="fa-solid fa-box"></i></span><div style="min-width:0"><h3>${esc(i.description)}</h3><p>${esc(i.number || '')} · ${esc(i.clientName)}</p></div><span style="margin-left:auto">${RM.tag(RM.STORAGE_STATUS[i.status])}</span></div>
            <div class="res-stats"><div><small>Miejsce</small><strong>${esc(unitName(i.unit) || i.location || '—')}</strong></div><div><small>Objętość</small><strong>${i.volume ? n1(i.volume) + ' m³' : '—'}</strong></div><div><small>Miesięcznie</small><strong>${esc(RM.money(i.monthlyPrice))}</strong></div></div>
            <div class="res-stats" style="border-top:0;padding-top:0"><div><small>Od</small><strong>${i.startDate ? esc(RM.fmt.date.format(new Date(i.startDate))) : '—'}</strong></div><div><small>Do</small><strong>${i.status === 'stored' ? H().dateFlag(i.endDate) : i.endDate ? esc(RM.fmt.date.format(new Date(i.endDate))) : '—'}</strong></div><div><small>Telefon</small><strong>${i.clientPhone ? `<a href="${esc(RM.telUrl(i.clientPhone))}">${esc(i.clientPhone)}</a>` : '—'}</strong></div></div>
            ${i.photoCount ? `<div class="mini-photos">${Array.from({ length: Math.min(i.photoCount, 4) }, (_, k) => `<a href="/api/storage/${esc(i._id)}/photos/${k}" target="_blank" rel="noopener"><img loading="lazy" src="/api/storage/${esc(i._id)}/photos/${k}" alt=""></a>`).join('')}${i.photoCount > 4 ? `<span class="more">+${i.photoCount - 4}</span>` : ''}</div>` : ''}
            ${i.inventory ? `<p class="muted small" style="margin:0;white-space:pre-line">${esc(i.inventory.slice(0, 220))}${i.inventory.length > 220 ? '…' : ''}</p>` : ''}
            <div class="res-actions"><button class="btn sm" data-sedit="${esc(i._id)}"><i class="fa-solid fa-pen"></i> Edytuj</button><button class="btn sm" data-sphoto="${esc(i._id)}"><i class="fa-solid fa-camera"></i> Zdjęcia${i.photoCount ? ' (' + i.photoCount + ')' : ''}</button>${i.status !== 'released' ? `<button class="btn sm" data-release="${esc(i._id)}"><i class="fa-solid fa-truck-ramp-box"></i> Wydaj</button>` : ''}</div>
          </article>`).join('') || empty('fa-box-archive', unitFilter ? 'Brak rzeczy w tym miejscu' : 'Magazyn jest pusty', 'Przyjmij rzeczy klienta — panel przypomni o końcu przechowania.')}</div>`}`;

      const rerender = () => views.magazyn.render(el);
      $('#stAll', el).addEventListener('change', e => { S.ui.storageAll = e.target.checked; rerender(); });
      $('#addStorage', el).addEventListener('click', () => RM.storageForm(null, rerender));
      $('#addUnit', el).addEventListener('click', () => unitForm(null, rerender));
      $('#stUnit', el)?.addEventListener('change', e => { S.ui.storageUnit = e.target.value; rerender(); });
      $$('[data-stab]', el).forEach(b => b.addEventListener('click', () => { S.ui.storageTab = b.dataset.stab; rerender(); }));
      $$('[data-uedit]', el).forEach(b => b.addEventListener('click', () => unitForm(occ.units.find(u => u._id === b.dataset.uedit), rerender)));
      $$('[data-ushow]', el).forEach(b => b.addEventListener('click', () => { S.ui.storageTab = 'items'; S.ui.storageUnit = b.dataset.ushow; rerender(); }));
      $$('[data-sedit]', el).forEach(b => b.addEventListener('click', () => RM.storageForm(items.find(i => i._id === b.dataset.sedit), rerender)));
      $$('[data-sphoto]', el).forEach(b => b.addEventListener('click', () => storagePhotos(items.find(i => i._id === b.dataset.sphoto), rerender)));
      $$('[data-release]', el).forEach(b => b.addEventListener('click', async () => {
        if (!await RM.confirm('Oznaczyć rzeczy jako wydane klientowi?', { ok: 'Wydaj', danger: false })) return;
        try { await RM.api(`/api/storage/${b.dataset.release}/release`, { method: 'POST' }); RM.toast('Wydano z magazynu'); rerender(); } catch (err) { RM.fail(err); }
      }));
    }
  };

  function unitForm(u, done) {
    RM.form({
      title: u ? 'Edytuj miejsce' : 'Nowe miejsce w magazynie',
      subtitle: 'Boks, regał, strefa lub kontener z pojemnością',
      values: { kind: 'boks', active: true, ...(u || {}) },
      fields: [
        { name: 'name', label: 'Nazwa', required: true, placeholder: 'np. Boks A1, Regał B, Strefa paletowa' },
        { name: 'kind', label: 'Rodzaj', type: 'select', options: Object.entries(UNIT_KIND) },
        { name: 'capacity', label: 'Pojemność (m³)', type: 'number', min: 0, step: '0.1', hint: 'np. boks 2×3×2,5 m = 15 m³' },
        { name: 'order', label: 'Kolejność', type: 'number', step: '1' },
        { name: 'notes', label: 'Opis / uwagi', type: 'textarea', full: true },
        { name: 'active', label: 'Aktywne', type: 'switch', hint: 'Nieaktywne miejsca nie liczą się do pojemności' }
      ],
      danger: u ? { label: 'Usuń', confirm: 'Usunąć miejsce? (musi być puste)', action: async () => { await RM.api('/api/storage-units/' + u._id, { method: 'DELETE' }); RM.toast('Usunięto'); done(); } } : null,
      async onSubmit(data) {
        await RM.api(u ? '/api/storage-units/' + u._id : '/api/storage-units', { method: u ? 'PUT' : 'POST', body: data });
        RM.toast(u ? 'Zapisano' : 'Dodano miejsce');
        done();
      }
    });
  }

  function storagePhotos(i, done) {
    if (!i) return;
    const store = [];
    const ph = photoField(store, 8);
    const existing = i.photoCount ? `<div class="photos">${Array.from({ length: i.photoCount }, (_, k) => `<span class="ph-old"><a href="/api/storage/${esc(i._id)}/photos/${k}" target="_blank" rel="noopener"><img loading="lazy" src="/api/storage/${esc(i._id)}/photos/${k}" alt=""></a><button type="button" data-delph="${k}" title="Usuń zdjęcie">×</button></span>`).join('')}</div>` : '<p class="muted small">Brak zdjęć.</p>';
    const form = RM.form({
      title: 'Zdjęcia — ' + i.description,
      subtitle: `${i.number || ''} · ${i.clientName}`,
      submitLabel: 'Zapisz nowe zdjęcia',
      fields: [{ type: 'html', full: true, html: `<span class="label">Zapisane (${i.photoCount || 0})</span>${existing}` }, { type: 'html', full: true, html: ph.html }],
      async onSubmit() {
        if (!store.length) return true;
        await RM.api(`/api/storage/${i._id}/photos`, { method: 'POST', body: { photos: store } });
        RM.toast('Dodano zdjęcia');
        done();
      }
    });
    ph.bind(form);
    $$('[data-delph]', form).forEach(b => b.addEventListener('click', async () => {
      if (!await RM.confirm('Usunąć to zdjęcie?')) return;
      try { await RM.api(`/api/storage/${i._id}/photos/${b.dataset.delph}`, { method: 'DELETE' }); RM.toast('Usunięto'); RM.closeModal(); done(); } catch (err) { RM.fail(err); }
    }));
  }

  /* ================================================================== */
  /* SORTOWNIA                                                           */
  /* ================================================================== */

  const FRACTIONS = ['Metale / złom', 'Drewno', 'Gruz i ceramika', 'Elektroodpady (AGD/RTV)', 'Tworzywa sztuczne', 'Papier i karton', 'Szkło', 'Tekstylia', 'Meble / gabaryty', 'Opony', 'Odpady zielone', 'Zmieszane', 'Do sprzedaży / ponownego użycia', 'Inne'];
  const BIN_STATUS = { ok: ['Jest miejsce', 'green'], warn: ['Wkrótce opróżnić', 'orange'], full: ['Opróżnij', 'red'], none: ['Bez limitu', 'muted'] };
  const KIND = { in: ['Przyjęcie', 'green', 'fa-arrow-down'], out: ['Opróżnienie', 'blue', 'fa-truck-ramp-box'], adjust: ['Korekta', 'muted', 'fa-scale-balanced'] };

  views.sortownia = {
    title: 'Sortownia',
    async render(el) {
      if (!el.querySelector('.sort-grid')) el.innerHTML = '<div class="skeleton"></div>';
      const admin = RM.isAdmin();
      const all = S.ui.sortAll;
      const { bins, entries, summary } = await RM.api('/api/sorting' + (all ? '?all=1' : ''));
      S.sortingBins = bins;
      const filter = S.ui.sortFilter || 'all';
      const shown = bins.filter(b => filter === 'all' || (filter === 'empty' ? ['warn', 'full'].includes(b.status) : b.fraction === filter));
      const fractions = [...new Set(bins.map(b => b.fraction).filter(Boolean))];

      el.innerHTML = `
        <div class="page-head"><div><h1>Sortownia</h1><p>Co jest sortowane, ile czego mamy i które pojemniki trzeba opróżnić</p></div>
          <div class="page-actions">${admin ? `<label class="toggle-line"><span class="switch"><input type="checkbox" id="sortAll" ${all ? 'checked' : ''}><span></span></span> Archiwalne</label><button class="btn" id="addBin"><i class="fa-solid fa-dumpster"></i> Nowy pojemnik</button>` : ''}
          <button class="btn primary" id="addEntry" ${bins.length ? '' : 'disabled'}><i class="fa-solid fa-plus"></i> Dodaj do sortowania</button></div></div>
        <div class="kpis">
          <div class="card kpi"><div class="kpi-label">Na sortowni teraz <i class="fa-solid fa-weight-hanging"></i></div><div class="kpi-value">${n1(summary.weightNow)} kg</div><div class="kpi-sub">${summary.bins} pojemników / frakcji</div></div>
          <div class="card kpi" style="--tone:${summary.toEmpty ? 'var(--red)' : 'var(--accent)'}"><div class="kpi-label">Do opróżnienia <i class="fa-solid fa-dumpster-fire"></i></div><div class="kpi-value">${summary.toEmpty}</div><div class="kpi-sub">${summary.full ? summary.full + ' pełnych' : 'dostaniesz push przy zapełnieniu'}</div></div>
          <div class="card kpi" style="--tone:var(--blue)"><div class="kpi-label">Przyjęto w tym mies. <i class="fa-solid fa-arrow-down"></i></div><div class="kpi-value">${n1(summary.monthIn.weight)} kg</div><div class="kpi-sub">${summary.monthIn.count} wpisów · oddano ${n1(summary.monthOut.weight)} kg</div></div>
          <div class="card kpi" style="--tone:var(--purple)"><div class="kpi-label">Wartość surowców <i class="fa-solid fa-coins"></i></div><div class="kpi-value">${esc(RM.money(summary.valueNow))}</div><div class="kpi-sub">wg stawek pojemników${summary.monthOut.value ? ' · w mies. ' + esc(RM.money(summary.monthOut.value)) : ''}</div></div>
        </div>
        <div class="toolbar" style="margin-bottom:14px"><div class="segmented"><button data-sf="all" class="${filter === 'all' ? 'active' : ''}">Wszystkie<span class="n">${bins.length}</span></button><button data-sf="empty" class="${filter === 'empty' ? 'active' : ''}">Do opróżnienia<span class="n">${summary.toEmpty}</span></button>${fractions.map(f => `<button data-sf="${esc(f)}" class="${filter === f ? 'active' : ''}">${esc(f)}</button>`).join('')}</div></div>
        <div class="grid grid-auto sort-grid">${shown.map(b => `
          <article class="card res-card bin-card bin-${b.status} ${b.active === false ? 'is-off' : ''}">
            <div class="res-top"><span class="row-icon ${b.status === 'full' ? 'red' : b.status === 'warn' ? 'orange' : 'green'}"><i class="fa-solid fa-dumpster"></i></span><div style="min-width:0"><h3>${esc(b.name)}</h3><p>${esc([b.fraction, b.wasteCode && 'kod ' + b.wasteCode, b.location].filter(Boolean).join(' · ') || 'Pojemnik')}</p></div><span style="margin-left:auto">${RM.tag(BIN_STATUS[b.status])}</span></div>
            <div class="bin-level"><strong>${n2(b.current)} ${UNIT_LABEL[b.unit]}</strong>${b.capacity ? `<span>z ${n2(b.capacity)} ${UNIT_LABEL[b.unit]} · ${b.pct}%</span>` : '<span>bez limitu pojemności</span>'}</div>
            ${b.capacity ? bar(b.pct, fillTone(b.pct >= b.warnAt && b.pct < 100 ? 80 : b.pct)) : ''}
            <div class="res-stats"><div><small>Waga</small><strong>${n1(b.currentWeight)} kg</strong></div><div><small>Sztuk</small><strong>${n1(b.currentQty)}</strong></div><div><small>${b.capacity ? 'Wolne' : 'Wartość'}</small><strong>${b.capacity ? n2(b.free) + ' ' + UNIT_LABEL[b.unit] : esc(RM.money(b.value))}</strong></div></div>
            ${b.destination || b.lastEmptiedAt ? `<p class="muted small" style="margin:0">${b.destination ? 'Odbiór: ' + esc(b.destination) : ''}${b.destination && b.lastEmptiedAt ? ' · ' : ''}${b.lastEmptiedAt ? 'opróżniono ' + esc(RM.ago(b.lastEmptiedAt)) : ''}</p>` : ''}
            <div class="res-actions" style="flex-wrap:wrap"><button class="btn sm primary" data-bin-add="${esc(b._id)}"><i class="fa-solid fa-plus"></i> Dodaj</button><button class="btn sm" data-bin-empty="${esc(b._id)}" ${b.current ? '' : 'disabled'}><i class="fa-solid fa-truck-ramp-box"></i> Opróżnij</button><button class="btn sm" data-bin-hist="${esc(b._id)}"><i class="fa-solid fa-clock-rotate-left"></i> Historia</button>${admin ? `<button class="btn sm ghost" data-bin-edit="${esc(b._id)}" title="Edytuj"><i class="fa-solid fa-pen"></i></button>` : ''}</div>
          </article>`).join('') || empty('fa-dumpster', bins.length ? 'Brak pojemników w tym filtrze' : 'Sortownia jest pusta', admin ? 'Dodaj pojemniki (frakcje) — np. „Złom stalowy”, „Drewno”, „Gruz” — z pojemnością i progiem ostrzeżenia.' : 'Administrator musi najpierw dodać pojemniki.')}</div>
        <section class="card pad" style="margin-top:18px"><div class="card-head"><div><h2>Ostatnie ruchy</h2><p>Przyjęcia, opróżnienia i korekty</p></div></div>
          <div class="rows">${entries.map(entryRow).join('') || '<p class="muted small">Brak wpisów.</p>'}</div></section>`;

      const rerender = () => views.sortownia.render(el);
      $('#sortAll', el)?.addEventListener('change', e => { S.ui.sortAll = e.target.checked; rerender(); });
      $('#addBin', el)?.addEventListener('click', () => binForm(null, rerender));
      $('#addEntry', el).addEventListener('click', () => entryForm(null, rerender));
      $$('[data-sf]', el).forEach(b => b.addEventListener('click', () => { S.ui.sortFilter = b.dataset.sf; rerender(); }));
      const byId = id => bins.find(b => b._id === id);
      $$('[data-bin-add]', el).forEach(b => b.addEventListener('click', () => entryForm(byId(b.dataset.binAdd), rerender)));
      $$('[data-bin-empty]', el).forEach(b => b.addEventListener('click', () => emptyForm(byId(b.dataset.binEmpty), rerender)));
      $$('[data-bin-edit]', el).forEach(b => b.addEventListener('click', () => binForm(byId(b.dataset.binEdit), rerender)));
      $$('[data-bin-hist]', el).forEach(b => b.addEventListener('click', () => history(byId(b.dataset.binHist), rerender)));
      bindEntryRows(el, rerender);
    }
  };

  function entryRow(e) {
    const k = KIND[e.kind] || KIND.in;
    const amount = e.kind === 'adjust' ? (e.amount > 0 ? '+' : '') + n2(e.amount) : (e.kind === 'out' ? '−' : '+') + n2(Math.abs(e.amount));
    const bin = (S.sortingBins || []).find(b => b._id === String(e.bin));
    return `<div class="row entry-row"><span class="row-icon ${k[1]}"><i class="fa-solid ${k[2]}"></i></span>
      <span class="row-main"><strong>${esc(e.binName || bin?.name || '')} · ${amount} ${esc(UNIT_LABEL[bin?.unit] || '')}${e.item ? ' · ' + esc(e.item) : ''}</strong>
      <small>${esc(k[0])}${e.weightKg ? ' · ' + n1(e.weightKg) + ' kg' : ''}${e.quantity ? ' · ' + n1(e.quantity) + ' szt.' : ''}${e.destination ? ' → ' + esc(e.destination) : ''}${e.value ? ' · ' + esc(RM.money(e.value)) : ''}${e.taskNumber ? ' · ' + esc(e.taskNumber) : ''} · ${esc(e.createdBy || '')} · ${esc(RM.ago(e.createdAt))}${e.note ? '<br>' + esc(e.note) : ''}</small>
      ${e.photoCount ? `<span class="mini-photos">${Array.from({ length: e.photoCount }, (_, i) => `<a href="/api/sorting/entries/${esc(e._id)}/photos/${i}" target="_blank" rel="noopener"><img loading="lazy" src="/api/sorting/entries/${esc(e._id)}/photos/${i}" alt=""></a>`).join('')}</span>` : ''}</span>
      ${RM.isAdmin() ? `<button class="icon-btn ghost" data-entry-del="${esc(e._id)}" title="Usuń wpis"><i class="fa-solid fa-trash"></i></button>` : ''}</div>`;
  }

  /** Szybkie dodanie z przycisku „+” (telefon). */
  RM.sortingEntryForm = async done => {
    try {
      if (!S.sortingBins) S.sortingBins = (await RM.api('/api/sorting?limit=1')).bins;
      entryForm(null, done);
    } catch (err) { RM.fail(err); }
  };

  function bindEntryRows(root, done) {
    $$('[data-entry-del]', root).forEach(b => b.addEventListener('click', async () => {
      if (!await RM.confirm('Usunąć wpis? Przyjęcie zostanie odjęte od stanu pojemnika.')) return;
      try { await RM.api('/api/sorting/entries/' + b.dataset.entryDel, { method: 'DELETE' }); RM.toast('Usunięto'); RM.closeModal(); done(); } catch (err) { RM.fail(err); }
    }));
  }

  function binForm(b, done) {
    RM.form({
      title: b ? 'Edytuj pojemnik' : 'Nowy pojemnik / frakcja',
      subtitle: 'Sortownia',
      values: { unit: 'kg', warnAt: 80, ...(b || {}), active: b ? b.active !== false : true },
      fields: [
        { name: 'name', label: 'Nazwa', required: true, placeholder: 'np. Złom stalowy, Big bag — gruz, Kontener KP7' },
        { name: 'fraction', label: 'Frakcja', type: 'datalist', options: FRACTIONS },
        { name: 'unit', label: 'Jednostka', type: 'select', options: [['kg', 'kilogramy (kg)'], ['szt', 'sztuki'], ['m3', 'metry sześcienne (m³)']] },
        { name: 'capacity', label: 'Pojemność / limit', type: 'number', min: 0, step: '0.01', hint: 'W wybranej jednostce. 0 = bez limitu' },
        { name: 'warnAt', label: 'Ostrzegaj od (%)', type: 'number', min: 10, max: 100, step: '1', hint: 'Push do adminów, że trzeba opróżnić' },
        { name: 'pricePerUnit', label: 'Wartość za jednostkę (zł)', type: 'number', step: '0.01', hint: 'np. skup złomu 0,80 zł/kg; koszt utylizacji wpisz jako minus' },
        { name: 'wasteCode', label: 'Kod odpadu (BDO)', placeholder: 'np. 17 04 05' },
        { name: 'location', label: 'Miejsce na placu', placeholder: 'np. Wiata 2' },
        { name: 'destination', label: 'Gdzie oddajemy', full: true, placeholder: 'np. Skup złomu Słupsk, PSZOK, firma odbierająca' },
        { name: 'order', label: 'Kolejność', type: 'number', step: '1' },
        { name: 'notes', label: 'Uwagi', type: 'textarea', full: true },
        { name: 'active', label: 'Aktywny', type: 'switch' }
      ],
      danger: b ? { label: 'Usuń', confirm: 'Usunąć pojemnik? Jeśli ma historię, zostanie przeniesiony do archiwum.', action: async () => { const r = await RM.api('/api/sorting/bins/' + b._id, { method: 'DELETE' }); RM.toast(r.archived ? 'Przeniesiono do archiwum' : 'Usunięto'); done(); } } : null,
      async onSubmit(data) {
        await RM.api(b ? '/api/sorting/bins/' + b._id : '/api/sorting/bins', { method: b ? 'PUT' : 'POST', body: data });
        RM.toast(b ? 'Zapisano' : 'Dodano pojemnik');
        done();
      }
    });
  }

  function entryForm(bin, done) {
    const bins = (S.sortingBins || []).filter(b => b.active !== false);
    if (!bins.length) { RM.toast('Najpierw dodaj pojemnik', 'error'); return; }
    const store = [];
    const ph = photoField(store, 6);
    const recent = S.tasks.filter(t => ['progress', 'completed', 'planned'].includes(t.status)).sort((a, b) => new Date(b.dateStart) - new Date(a.dateStart)).slice(0, 40);
    const form = RM.form({
      title: 'Dodaj do sortowania',
      subtitle: bin ? bin.name : 'Wybierz pojemnik / frakcję',
      submitLabel: 'Dodaj',
      values: { bin: bin ? bin._id : bins[0]._id },
      fields: [
        { name: 'bin', label: 'Pojemnik / frakcja', type: 'select', required: true, full: true, options: bins.map(b => [b._id, `${b.name}${b.fraction ? ' — ' + b.fraction : ''} (${n2(b.current)}${b.capacity ? '/' + n2(b.capacity) : ''} ${UNIT_LABEL[b.unit]})`]) },
        { name: 'itemName', label: 'Co to jest', placeholder: 'np. pralka, kaloryfery, deski z rozbiórki', full: true },
        { name: 'amount', label: 'Ilość', type: 'number', min: 0, step: '0.01', required: true, hint: 'w jednostce pojemnika' },
        { name: 'weightKg', label: 'Waga (kg)', type: 'number', min: 0, step: '0.1', hint: 'gdy pojemnik liczy w kg — możesz zostawić puste' },
        { name: 'quantity', label: 'Sztuk', type: 'number', min: 0, step: '1' },
        { name: 'task', label: 'Ze zlecenia', type: 'select', options: [['', '— brak —'], ...recent.map(t => [RM.id(t), `${t.number || ''} · ${t.name}`.slice(0, 80)])] },
        { name: 'note', label: 'Notatka', type: 'textarea', full: true },
        { type: 'html', full: true, html: ph.html }
      ],
      async onSubmit(data) {
        const r = await RM.api(`/api/sorting/bins/${data.bin}/entries`, { method: 'POST', body: { ...data, item: data.itemName, photos: store, task: data.task || null } });
        const s = r.bin;
        RM.toast(s.status === 'full' ? `Dodano — „${s.name}” jest pełny, opróżnij!` : s.status === 'warn' ? `Dodano — „${s.name}” zapełniony w ${s.pct}%` : 'Dodano do sortowania', s.status === 'ok' || s.status === 'none' ? 'ok' : 'error');
        done();
      },
      onRender(f) {
        const unitHint = () => {
          const b = bins.find(x => x._id === f.elements.bin.value);
          const lbl = f.querySelector('label[for="f_amount"]');
          if (lbl && b) lbl.textContent = `Ilość (${UNIT_LABEL[b.unit]})`;
        };
        f.elements.bin.addEventListener('change', unitHint);
        unitHint();
      }
    });
    ph.bind(form);
  }

  function emptyForm(b, done) {
    if (!b) return;
    RM.form({
      title: 'Opróżnij — ' + b.name,
      subtitle: `Na stanie: ${n2(b.current)} ${UNIT_LABEL[b.unit]} · ${n1(b.currentWeight)} kg`,
      submitLabel: 'Opróżnij',
      values: { destination: b.destination || '', value: b.pricePerUnit ? Math.round(b.current * b.pricePerUnit * 100) / 100 : '' },
      fields: [
        { name: 'amount', label: `Ile opróżniono (${UNIT_LABEL[b.unit]})`, type: 'number', min: 0, step: '0.01', hint: 'Puste = cały pojemnik' },
        { name: 'destination', label: 'Dokąd', placeholder: 'np. Skup złomu, PSZOK, firma odbierająca' },
        { name: 'value', label: 'Przychód / koszt (zł)', type: 'number', step: '0.01', hint: 'Przychód ze skupu na plus, koszt utylizacji na minus' },
        { name: 'note', label: 'Notatka', type: 'textarea', full: true, placeholder: 'np. nr KPO, kwit wagowy' }
      ],
      async onSubmit(data) {
        if (data.amount === null) delete data.amount;
        await RM.api(`/api/sorting/bins/${b._id}/empty`, { method: 'POST', body: data });
        RM.toast('Opróżniono');
        done();
      }
    });
  }

  async function history(b, done) {
    if (!b) return;
    try {
      const { entries } = await RM.api(`/api/sorting/bins/${b._id}/entries`);
      const form = RM.form({
        title: 'Historia — ' + b.name,
        subtitle: `${n2(b.current)} ${UNIT_LABEL[b.unit]} na stanie`,
        submitLabel: RM.isAdmin() ? 'Korekta stanu' : 'Zamknij',
        fields: [{ type: 'html', full: true, html: `<div class="rows">${entries.map(entryRow).join('') || '<p class="muted small">Brak wpisów.</p>'}</div>` }],
        async onSubmit() {
          if (!RM.isAdmin()) return true;
          setTimeout(() => adjustForm(b, done), 50);
          return true;
        }
      });
      bindEntryRows(form, done);
    } catch (err) { RM.fail(err); }
  }

  function adjustForm(b, done) {
    RM.form({
      title: 'Korekta stanu — ' + b.name,
      subtitle: 'Inwentaryzacja: wpisz faktyczny stan po zważeniu / policzeniu',
      values: { current: b.current, currentWeight: b.currentWeight, currentQty: b.currentQty },
      fields: [
        { name: 'current', label: `Stan (${UNIT_LABEL[b.unit]})`, type: 'number', min: 0, step: '0.01', required: true },
        { name: 'currentWeight', label: 'Waga (kg)', type: 'number', min: 0, step: '0.1' },
        { name: 'currentQty', label: 'Sztuk', type: 'number', min: 0, step: '1' },
        { name: 'note', label: 'Powód', full: true, placeholder: 'np. ważenie na wadze najazdowej' }
      ],
      async onSubmit(data) {
        await RM.api(`/api/sorting/bins/${b._id}/adjust`, { method: 'POST', body: data });
        RM.toast('Zapisano korektę');
        done();
      }
    });
  }
})();
