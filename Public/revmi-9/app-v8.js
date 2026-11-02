/* RevMi 8.0 — oddziały, zakończenie zlecenia (zdjęcia, koszty, opinia SMS), rozliczenia, statystyki z podatkiem,
   RevBot (parametry wyceny, pamięć, wiedza z internetu) i duży notatnik. */
'use strict';

(function () {
  const RM = window.RM;
  const { esc, $, $$ } = RM;
  const S = RM.state;
  const views = RM.views;
  const H = () => RM.helpers;
  const empty = (...a) => H().empty(...a);
  const n0 = v => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(Number(v) || 0);
  const n1 = v => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(Number(v) || 0);
  const plural = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
  const KIND = { before: 'Przed', after: 'Po', other: 'Inne' };
  const PAY_KIND = { pay: 'Wypłata', bonus: 'Premia', advance: 'Zaliczka', deduction: 'Potrącenie' };

  /** Okno na pełny ekran (telefon) / duże okno (komputer), niezależne od RM.form. */
  function sheet(html, cls = '') {
    const box = document.createElement('dialog');
    box.className = 'modal v8-sheet ' + cls;
    box.innerHTML = html;
    document.body.appendChild(box);
    box.addEventListener('close', () => box.remove());
    box.addEventListener('click', e => { if (e.target === box && !box.dataset.lock) box.close(); });
    $$('[data-x]', box).forEach(b => b.addEventListener('click', () => box.close()));
    box.showModal();
    return box;
  }

  async function uploadMedia(taskId, kind, photos) {
    let last = null;
    for (let i = 0; i < photos.length; i += 4) {
      last = await RM.api(`/api/tasks/${taskId}/media`, { method: 'POST', body: { kind, photos: photos.slice(i, i + 4) } });
    }
    return last;
  }

  /* ================================================================== */
  /* ZDJĘCIA Z REALIZACJI (w szczegółach zlecenia)                        */
  /* ================================================================== */

  RM.mediaSection = (t, media = [], canWork) => {
    if (t.status === 'new' || t.status === 'quoted') return '';
    const groups = ['before', 'after', 'other'].map(k => [k, media.filter(m => m.kind === k)]).filter(([, list]) => list.length);
    return `<div class="section" id="mediaSection"><h3>Zdjęcia z realizacji${media.length ? ` (${media.length})` : ''}</h3>
      ${groups.map(([k, list]) => `<p class="muted small" style="margin:6px 0">${KIND[k]}</p><div class="photos">${list.map(m => `<a href="/api/tasks/${esc(RM.id(t))}/media/${esc(m._id)}" target="_blank" rel="noopener" title="${esc(m.by || '')} · ${esc(RM.formatWhen(m.createdAt))}"><img loading="lazy" src="/api/tasks/${esc(RM.id(t))}/media/${esc(m._id)}" alt="${KIND[k]}"></a>`).join('')}</div>`).join('') || '<p class="muted small">Brak zdjęć. Przed zakończeniem dodaj przynajmniej jedno (przed lub po).</p>'}
      ${canWork ? `<div class="btn-row" style="margin-top:10px"><button class="btn sm" data-media="before"><i class="fa-solid fa-camera"></i> Zdjęcie „przed”</button><button class="btn sm" data-media="after"><i class="fa-solid fa-camera-retro"></i> Zdjęcie „po”</button></div>` : ''}
    </div>`;
  };

  RM.bindMedia = (drawer, t) => {
    $$('[data-media]', drawer).forEach(b => b.addEventListener('click', async () => {
      const photos = await RM.pickPhotos(10);
      if (!photos.length) return;
      b.disabled = true;
      b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Wysyłam…';
      try { await uploadMedia(RM.id(t), b.dataset.media, photos); RM.toast(`Dodano ${photos.length} ${plural(photos.length, 'zdjęcie', 'zdjęcia', 'zdjęć')}`); RM.refreshDrawer(); } catch (err) { RM.fail(err); b.disabled = false; }
    }));
  };

  /* ================================================================== */
  /* RAPORT Z ZAKOŃCZENIA                                                 */
  /* ================================================================== */

  const REVIEW = { sent: ['Wysłano SMS z prośbą o opinię', 'green'], manual: ['Prośba o opinię — wysłana z telefonu', 'green'], failed: ['SMS nie został wysłany', 'red'], skipped: ['Bez prośby o opinię', 'muted'], '': ['—', 'muted'] };

  RM.reportSection = t => {
    if (t.status !== 'completed') return '';
    const c = t.costs || {};
    const total = ['fuel', 'materials', 'disposal', 'other'].reduce((s, k) => s + (Number(c[k]) || 0), 0);
    const r = t.reviewRequest || {};
    const admin = RM.isAdmin();
    const value = t.finalPrice ?? t.price ?? 0;
    return `<div class="section report-box"><h3><i class="fa-solid fa-flag-checkered"></i> Raport z zakończenia</h3>
      <div class="info-grid">
        <div class="info"><small>Paliwo</small><strong>${c.fuel ?? '—'}${c.fuel != null ? ' zł' : ''}</strong></div>
        <div class="info"><small>Materiały</small><strong>${c.materials ?? '—'}${c.materials != null ? ' zł' : ''}</strong></div>
        <div class="info"><small>Utylizacja</small><strong>${c.disposal ?? '—'}${c.disposal != null ? ' zł' : ''}</strong></div>
        <div class="info"><small>Inne</small><strong>${c.other ?? '—'}${c.other != null ? ' zł' : ''}</strong></div>
        ${t.hoursWorked ? `<div class="info"><small>Czas pracy</small><strong>${esc(n1(t.hoursWorked))} h</strong></div>` : ''}
        ${t.cashCollected ? `<div class="info"><small>Pobrano od klienta</small><strong>${esc(RM.money(t.cashCollected))}</strong>${t.cashMethod ? `<div class="muted small">${esc(t.cashMethod)}</div>` : ''}</div>` : ''}
        ${admin ? `<div class="info full"><small>Wynik zlecenia</small><strong>${esc(RM.money(value))} − koszty ${esc(RM.money(total))} = <span style="color:var(--accent)">${esc(RM.money(value - total))}</span></strong><div class="muted small">bez wypłat ekipy (dodasz je w Rozliczeniach)</div></div>` : ''}
      </div>
      ${c.note ? `<p class="small" style="margin:8px 0 0">${esc(c.note)}</p>` : ''}
      ${t.completionNote ? `<div class="desc" style="margin-top:8px">${esc(t.completionNote)}</div>` : ''}
      <div class="btn-row" style="margin-top:10px;align-items:center">${RM.tag(REVIEW[r.status || ''] || REVIEW[''])}${c.reportedBy ? `<span class="muted small">raport: ${esc(c.reportedBy)}${r.consentBy ? ' · zgoda na SMS: ' + esc(r.consentBy) : ''}</span>` : ''}
        ${t.clientPhone && r.status !== 'sent' ? '<button class="btn sm" data-review-again><i class="fa-regular fa-star"></i> Poproś o opinię</button>' : ''}</div>
    </div>`;
  };

  RM.bindReport = (drawer, t) => {
    $('[data-review-again]', drawer)?.addEventListener('click', async () => {
      if (!await RM.confirm(`Wysłać klientowi (${t.clientPhone}) SMS z prośbą o opinię w Google?`, { ok: 'Tak, wyślij', danger: false })) return;
      try {
        const r = await RM.api(`/api/tasks/${RM.id(t)}/review-request`, { method: 'POST', body: { consent: true } });
        if (r.smsLink) location.href = r.smsLink;
        else RM.toast(r.review.status === 'sent' ? 'Wysłano SMS' : 'Nie wysłano: ' + (r.review.error || ''), r.review.status === 'sent' ? 'ok' : 'error');
        RM.refreshDrawer();
      } catch (err) { RM.fail(err); }
    });
  };

  /* ================================================================== */
  /* ZAKOŃCZENIE ZLECENIA — kreator na telefon                             */
  /* ================================================================== */

  RM.completeWizard = t => new Promise(resolve => {
    const admin = RM.isAdmin();
    const s = S.settings || {};
    const branch = RM.branch(t.branch);
    const need = branch ? (branch.minPhotos ?? 1) : 1;
    const store = { before: [], after: [] };
    let existing = (t.mediaCount?.before || 0) + (t.mediaCount?.after || 0) + (t.mediaCount?.other || 0);
    let result = null;
    // 9.2: czas ze stopera (start zlecenia → teraz, bez pauz), zaokrąglony do 15 min
    const timerH = (() => {
      let ms = 0;
      for (const seg of t.workLog || []) { const a = new Date(seg.start).getTime(); const b = seg.end ? new Date(seg.end).getTime() : Date.now(); if (b > a) ms += b - a; }
      return ms ? Math.round((ms / 3600000) * 4) / 4 : 0;
    })();
    const costInput = (name, label, icon) => `<label class="wz-cost"><span><i class="fa-solid ${icon}"></i>${label}</span><span class="wz-money"><input name="${name}" type="text" inputmode="decimal" placeholder="0,00" autocomplete="off" required><b>zł</b></span></label>`;
    const box = sheet(`<form class="wz" novalidate>
      <div class="modal-head"><div><h2>Zakończ zlecenie</h2><p>${esc(t.number || '')} · ${esc(t.name)}</p></div><button type="button" class="icon-btn ghost" data-x aria-label="Zamknij"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body">
        <section class="wz-step"><div class="wz-num">1</div><div class="wz-body"><h3>Zdjęcia z realizacji</h3><p class="muted small">Minimum ${need} — „przed” i „po”. Zobaczy je administrator.</p>
          <div class="wz-photos"><div><span class="label">Przed</span><div class="ph-thumbs" data-ph="before"></div><button type="button" class="btn sm" data-add="before"><i class="fa-solid fa-camera"></i> Dodaj</button></div>
          <div><span class="label">Po</span><div class="ph-thumbs" data-ph="after"></div><button type="button" class="btn sm" data-add="after"><i class="fa-solid fa-camera"></i> Dodaj</button></div></div>
          <p class="small wz-have" ${existing ? '' : 'hidden'}><i class="fa-solid fa-check"></i> Zlecenie ma już ${existing} ${plural(existing, 'zdjęcie', 'zdjęcia', 'zdjęć')}.</p></div></section>
        <section class="wz-step"><div class="wz-num">2</div><div class="wz-body"><h3>Koszty zlecenia</h3><p class="muted small">Wpisz kwotę albo 0 — trafi do kosztów firmy.</p>
          <button type="button" class="btn sm" data-receipt style="margin:0 0 8px"><i class="fa-solid fa-receipt"></i> Skanuj paragon — RevBot wpisze kwotę</button>
          <div class="wz-costs">${costInput('fuel', 'Paliwo', 'fa-gas-pump')}${costInput('materials', 'Materiały', 'fa-box')}${costInput('disposal', 'Utylizacja', 'fa-recycle')}${costInput('other', 'Inne', 'fa-receipt')}</div>
          <div class="form-grid" style="margin-top:10px"><div class="field"><label>Czas pracy (h)</label><input name="hoursWorked" type="text" inputmode="decimal" placeholder="${timerH ? 'ze stopera: ' + String(timerH).replace('.', ',') : 'np. 5,5'}" value="${timerH ? String(timerH).replace('.', ',') : ''}">${timerH ? '<span class="hint">Policzone ze stopera (start → teraz, bez przerw). Popraw, jeśli trzeba.</span>' : ''}</div>
          <div class="field"><label>Pobrano od klienta (zł)</label><input name="cashCollected" type="text" inputmode="decimal" placeholder="opcjonalnie"></div>
          <div class="field"><label>Forma płatności</label><select name="cashMethod"><option value="">—</option><option>Gotówka</option><option>BLIK</option><option>Przelew</option><option>Karta</option><option>Faktura</option></select></div>
          <div class="field"><label>Uwagi do kosztów</label><input name="costNote" maxlength="500" placeholder="np. 2 kursy na PSZOK"></div></div></div></section>
        ${admin ? `<section class="wz-step"><div class="wz-num"><i class="fa-solid fa-crown"></i></div><div class="wz-body"><h3>Rozliczenie (administrator)</h3><div class="form-grid"><div class="field"><label>Kwota końcowa (zł)</label><input name="finalPrice" type="text" inputmode="decimal" value="${esc(t.finalPrice ?? t.price ?? '')}"></div><div class="field"><label>Płatność</label><select name="paymentStatus">${Object.entries(RM.PAYMENT).map(([k, v]) => `<option value="${k}" ${t.paymentStatus === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
          ${need ? '<label class="toggle-line" style="margin-top:6px"><span class="switch"><input type="checkbox" name="skipPhotos"><span></span></span> Zakończ bez zdjęć (tylko administrator)</label>' : ''}</div></section>` : ''}
        <section class="wz-step"><div class="wz-num">3</div><div class="wz-body"><h3>Uwagi po zleceniu</h3><textarea name="completionNote" rows="2" maxlength="2000" placeholder="Co warto wiedzieć na przyszłość? (RevBot też się z tego uczy)"></textarea></div></section>
        <section class="wz-step review"><div class="wz-num"><i class="fa-regular fa-star"></i></div><div class="wz-body"><h3>Prośba o opinię w Google</h3>
          ${t.clientPhone ? `<label class="wz-consent"><input type="checkbox" name="reviewConsent"><span>Wyrażam zgodę na wysłanie klientowi <b>${esc(t.clientPhone)}</b> SMS-a z linkiem do opinii RevSerwis w Google.</span></label><p class="muted small" style="margin:6px 0 0">Zaznacz tylko, gdy klient był zadowolony. ${s.googleReviewUrl ? '' : 'Ustaw link do opinii w Ustawieniach.'}</p>` : '<p class="muted small">Brak telefonu klienta — nie wyślemy prośby.</p>'}</div></section>
        <p class="login-error" data-err style="margin-top:8px"></p>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-x>Anuluj</button><button type="submit" class="btn primary"><i class="fa-solid fa-flag-checkered"></i> Zakończ zlecenie</button></div>
    </form>`, 'v8-complete');
    box.dataset.lock = '1';

    const form = $('form', box);
    const render = kind => {
      $(`[data-ph="${kind}"]`, box).innerHTML = store[kind].map((d, i) => `<span class="ph"><img src="${d}" alt=""><button type="button" data-rm="${kind}:${i}" aria-label="Usuń">×</button></span>`).join('');
    };
    box.addEventListener('click', async e => {
      const add = e.target.closest('[data-add]');
      if (add) { const list = await RM.pickPhotos(10); store[add.dataset.add].push(...list.slice(0, 10 - store[add.dataset.add].length)); render(add.dataset.add); }
      const rc = e.target.closest('[data-receipt]');
      if (rc) {
        const [photo] = await RM.pickPhotos(1);
        if (!photo) return;
        rc.disabled = true;
        rc.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Czytam paragon…';
        try {
          const { receipt: r } = await RM.api('/api/v92/receipts/scan', { method: 'POST', body: { photo } });
          if (!r.readable || !(r.total > 0)) throw new Error('Nie udało się odczytać paragonu — wpisz kwotę ręcznie.');
          const field = { Paliwo: 'fuel', 'Materiały': 'materials', 'Narzędzia': 'materials', Utylizacja: 'disposal' }[r.category] || 'other';
          const input = form.elements[field];
          const prev = Number(String(input.value || '0').replace(',', '.')) || 0;
          input.value = String(Math.round((prev + r.total) * 100) / 100).replace('.', ',');
          if (form.elements.costNote && r.vendor) form.elements.costNote.value = [form.elements.costNote.value, `${r.vendor} ${String(r.total).replace('.', ',')} zł`].filter(Boolean).join('; ').slice(0, 500);
          RM.toast(`Paragon: ${r.vendor || ''} ${RM.money(r.total)} → ${input.closest('.wz-cost').querySelector('span').textContent.trim()}`);
        } catch (ex) { RM.fail(ex); } finally { rc.disabled = false; rc.innerHTML = '<i class="fa-solid fa-receipt"></i> Skanuj kolejny paragon'; }
      }
      const rm = e.target.closest('[data-rm]');
      if (rm) { const [k, i] = rm.dataset.rm.split(':'); store[k].splice(Number(i), 1); render(k); }
    });
    box.addEventListener('close', () => resolve(result));
    const num = v => (String(v || '').trim() === '' ? '' : Number(String(v).replace(',', '.').replace(/\s/g, '')));

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = form.elements;
      const err = $('[data-err]', box);
      err.textContent = '';
      const costs = { fuel: num(f.fuel.value), materials: num(f.materials.value), disposal: num(f.disposal.value), other: num(f.other.value), note: f.costNote.value };
      const missing = ['fuel', 'materials', 'disposal', 'other'].filter(k => costs[k] === '' || Number.isNaN(costs[k]));
      if (s.requireCostReport !== false && missing.length) { err.textContent = 'Wpisz wszystkie koszty (0, jeśli nie było).'; f[missing[0]].focus(); return; }
      const total = store.before.length + store.after.length + existing;
      const skip = admin && f.skipPhotos?.checked;
      if (s.requireCompletionPhotos !== false && total < need && !skip) { err.textContent = need === 1 ? 'Dodaj przynajmniej jedno zdjęcie (przed lub po).' : `Dodaj co najmniej ${need} zdjęcia.`; return; }
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Zapisuję…';
      try {
        for (const k of ['before', 'after']) if (store[k].length) { await uploadMedia(RM.id(t), k, store[k]); existing += store[k].length; store[k] = []; render(k); }
        const body = {
          costs, hoursWorked: num(f.hoursWorked.value), cashCollected: num(f.cashCollected.value), cashMethod: f.cashMethod.value,
          completionNote: f.completionNote.value, reviewConsent: Boolean(f.reviewConsent?.checked), skipPhotos: Boolean(skip)
        };
        if (admin) { body.finalPrice = num(f.finalPrice.value); body.paymentStatus = f.paymentStatus.value; }
        const r = await RM.api(`/api/tasks/${RM.id(t)}/complete`, { method: 'POST', body });
        RM.upsertTask(r.task);
        result = r.task;
        RM.toast('Zlecenie zakończone');
        if (RM.isAdmin()) RM.api('/api/dashboard').then(d => { S.dashboard = d; }).catch(() => null);
        box.close();
        if (r.smsLink) {
          if (await RM.confirm('Bramka SMS nie jest skonfigurowana — otworzyć gotową wiadomość z prośbą o opinię w telefonie?', { ok: 'Otwórz SMS', danger: false })) location.href = r.smsLink;
        } else if (r.review?.status === 'sent') RM.toast('Wysłano SMS z prośbą o opinię');
        else if (r.review?.status === 'failed') RM.toast('SMS nie wysłany: ' + (r.review.error || ''), 'error');
        RM.refreshDrawer();
        RM.rerender();
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-flag-checkered"></i> Zakończ zlecenie';
      }
    });
  });

  /* ================================================================== */
  /* ODDZIAŁY                                                             */
  /* ================================================================== */

  RM.branchPicker = t => {
    RM.form({
      title: 'Oddział zlecenia',
      subtitle: 'Zlecenie zobaczy tylko wybrana ekipa. Sprzęt z oddziału trafi na checklistę „przed wyjazdem”.',
      values: { branch: t.branch ? String(t.branch) : '' },
      fields: [{ name: 'branch', label: 'Oddział', type: 'select', full: true, options: RM.branchOptions() }],
      submitLabel: 'Przypisz',
      async onSubmit(data) {
        const r = await RM.api(`/api/tasks/${RM.id(t)}/branch`, { method: 'POST', body: { branch: data.branch || null } });
        RM.upsertTask(r.task);
        RM.toast(data.branch ? 'Przypisano do oddziału' : 'Zlecenie wróciło do ekipy głównej');
        RM.refreshDrawer();
        RM.rerender();
      }
    });
  };

  function branchForm(b, done) {
    const members = (b?.members || []).map(m => String(m._id));
    RM.form({
      title: b ? 'Edytuj oddział' : 'Nowy oddział',
      subtitle: 'Oddział = osobna ekipa, osobny bus, osobne zlecenia (zawsze dodawane ręcznie przez administratora)',
      values: { color: '#03F0BE', minPhotos: 1, ...(b || {}), equipmentText: (b?.equipment || []).join('\n'), members, vehicles: (b?.vehicles || []).map(String) },
      fields: [
        { name: 'name', label: 'Nazwa oddziału', required: true, placeholder: 'np. Oddział Przeprowadzki — Ekipa 2' },
        { name: 'specialty', label: 'Czym się zajmuje', placeholder: 'np. przeprowadzki i transport mebli' },
        { name: 'city', label: 'Miasto / rejon', placeholder: 'np. Koszalin' },
        { name: 'color', label: 'Kolor', type: 'color' },
        { name: 'vehicles', label: 'Bus / pojazdy oddziału', type: 'picks', full: true, options: S.fleet.map(v => ({ value: v._id, label: `${v.name} (${v.plates})` })) },
        { name: 'vehicleText', label: 'Pojazd spoza floty (opis)', placeholder: 'np. Iveco Daily 4,2 m' },
        { name: 'members', label: 'Ekipa — każda osoba widzi tylko zlecenia tego oddziału', type: 'picks', full: true, options: S.employees.filter(e => !e.isOwner).map(e => ({ value: e._id, label: e.name + (e.branch && String(e.branch) !== String(b?._id) ? ' (inny oddział)' : ''), avatar: true, color: e.color })) },
        { name: 'equipmentText', label: 'Sprzęt przed zleceniem — jedna rzecz w wierszu', type: 'textarea', full: true, placeholder: 'Pasy transportowe\nKoce i folia stretch\nWózek / platforma\nNarzędzia do demontażu' },
        { name: 'minPhotos', label: 'Minimalna liczba zdjęć przy zakończeniu', type: 'number', min: 0, max: 10 },
        { name: 'notes', label: 'Notatki', type: 'textarea', full: true }
      ],
      submitLabel: b ? 'Zapisz' : 'Utwórz oddział',
      danger: b ? { label: 'Zamknij oddział', confirm: 'Zamknąć oddział? Pracownicy wrócą do ekipy głównej, a zlecenia zostaną przy oddziale (możesz je przepiąć).', action: async () => { await RM.api('/api/branches/' + b._id, { method: 'DELETE' }); RM.toast('Oddział zamknięty'); done(); } } : null,
      async onSubmit(data) {
        const body = { ...data, equipment: data.equipmentText.split('\n').map(x => x.trim()).filter(Boolean) };
        delete body.equipmentText;
        await RM.api(b ? '/api/branches/' + b._id : '/api/branches', { method: b ? 'PUT' : 'POST', body });
        RM.toast(b ? 'Zapisano oddział' : 'Utworzono oddział');
        done();
      }
    });
  }

  views.oddzialy = {
    title: 'Oddziały',
    admin: true,
    async render(el) {
      if (!el.querySelector('.br-grid')) el.innerHTML = '<div class="skeleton"></div>';
      const { branches } = await RM.api('/api/branches');
      const mainTeam = S.employees.filter(e => !e.branch);
      el.innerHTML = `
        <div class="page-head"><div><h1>Oddziały</h1><p>Osobne ekipy, busy i zlecenia. Zlecenia trafiają do oddziału tylko wtedy, gdy przypiszesz je ręcznie.</p></div>
          <div class="page-actions"><button class="btn primary" id="brNew"><i class="fa-solid fa-plus"></i> Nowy oddział</button></div></div>
        <div class="br-grid">
          ${branches.map(b => `<article class="card br-card" style="--bc:${esc(b.color || '#03F0BE')}">
            <div class="br-head"><span class="br-dot"></span><div style="min-width:0"><h3>${esc(b.name)}</h3><p>${esc([b.specialty, b.city].filter(Boolean).join(' · ') || 'Oddział RevSerwis')}</p></div><button class="icon-btn ghost" data-bedit="${esc(b._id)}" aria-label="Edytuj"><i class="fa-solid fa-pen"></i></button></div>
            <div class="br-stats"><div><small>Aktywne</small><strong>${b.stats.active}</strong></div><div><small>Zakończone (mies.)</small><strong>${b.stats.completedMonth}</strong></div><div><small>Przychód</small><strong>${esc(RM.money(b.stats.revenueMonth))}</strong></div><div><small>Koszty</small><strong>${esc(RM.money(b.stats.costsMonth))}</strong></div></div>
            <div class="br-row"><i class="fa-solid fa-users"></i>${b.members.length ? b.members.map(m => `<span class="chip"><span class="avatar" style="color:${esc(m.color || 'var(--accent)')}">${esc(RM.initials(m.name))}</span>${esc(m.name)}</span>`).join('') : '<span class="muted small">Brak ekipy — dodaj osoby</span>'}</div>
            <div class="br-row"><i class="fa-solid fa-truck"></i>${[...(b.vehicles || []).map(id => RM.vehicle(id)).filter(Boolean).map(v => `<span class="chip">${esc(v.name)} · ${esc(v.plates)}</span>`), b.vehicleText ? `<span class="chip">${esc(b.vehicleText)}</span>` : ''].join('') || '<span class="muted small">Brak pojazdu</span>'}</div>
            <div class="br-row"><i class="fa-solid fa-toolbox"></i>${(b.equipment || []).length ? `<span class="small">${(b.equipment || []).map(esc).join(' · ')}</span>` : '<span class="muted small">Brak listy sprzętu</span>'}</div>
            <div class="res-actions"><button class="btn sm" data-btasks="${esc(b._id)}"><i class="fa-solid fa-clipboard-list"></i> Zlecenia</button><button class="btn sm" data-bassign="${esc(b._id)}"><i class="fa-solid fa-plus"></i> Przypisz zlecenie</button></div>
          </article>`).join('')}
          <article class="card br-card is-main" style="--bc:#8a8f98"><div class="br-head"><span class="br-dot"></span><div><h3>Ekipa główna</h3><p>Zlecenia bez oddziału — w tym wszystkie z formularza na stronie</p></div></div>
            <div class="br-row"><i class="fa-solid fa-users"></i>${mainTeam.map(m => `<span class="chip">${esc(m.name)}${m.isOwner ? ' 👑' : ''}</span>`).join('') || '<span class="muted small">—</span>'}</div></article>
        </div>
        ${!branches.length ? empty('fa-people-group', 'Nie masz jeszcze oddziałów', 'Utwórz oddział, dodaj do niego ekipę i bus, a potem przypisuj zlecenia. Pracownicy oddziału logują się swoim PIN-em i widzą tylko swoje zlecenia.', '<button class="btn primary" data-brfirst><i class="fa-solid fa-plus"></i> Utwórz pierwszy oddział</button>') : ''}`;
      const done = () => RM.reload().then(() => views.oddzialy.render(el));
      $('#brNew', el).addEventListener('click', () => branchForm(null, done));
      $('[data-brfirst]', el)?.addEventListener('click', () => branchForm(null, done));
      $$('[data-bedit]', el).forEach(b => b.addEventListener('click', () => branchForm(branches.find(x => x._id === b.dataset.bedit), done)));
      $$('[data-btasks]', el).forEach(b => b.addEventListener('click', () => { S.ui.ordersBranch = b.dataset.btasks; S.ui.ordersFilter = 'active'; location.hash = '#/zlecenia'; }));
      $$('[data-bassign]', el).forEach(b => b.addEventListener('click', () => {
        const open = S.tasks.filter(t => ['quoted', 'planned', 'progress'].includes(t.status) && String(t.branch || '') !== b.dataset.bassign)
          .sort((x, y) => new Date(x.dateStart) - new Date(y.dateStart));
        RM.form({
          title: 'Przypisz zlecenia do oddziału', subtitle: 'Wybierz zlecenia, które przejmie ta ekipa',
          fields: [{ name: 'tasks', label: 'Zlecenia', type: 'picks', full: true, options: open.map(t => ({ value: t._id, label: `${RM.fmt.day.format(new Date(t.dateStart))} · ${t.name}` })) }],
          submitLabel: 'Przypisz',
          async onSubmit(data) {
            for (const id of data.tasks) { const r = await RM.api(`/api/tasks/${id}/branch`, { method: 'POST', body: { branch: b.dataset.bassign } }); RM.upsertTask(r.task); }
            RM.toast(`Przypisano ${data.tasks.length}`);
            done();
          }
        });
      }));
    }
  };

  /* ================================================================== */
  /* ROZLICZENIA                                                          */
  /* ================================================================== */

  RM.payForm = (preset = null, done) => {
    RM.form({
      title: 'Dodaj do rozliczenia',
      subtitle: 'Kwoty sumują się, dopóki nie klikniesz „Rozliczono”',
      values: { kind: 'pay', date: new Date().toISOString(), ...(preset || {}) },
      fields: [
        { name: 'employee', label: 'Pracownik', type: 'select', required: true, full: true, options: [['', '— wybierz —'], ...S.employees.map(e => [e._id, e.name + (e.isOwner ? ' (właściciel)' : '') + (e.branch && RM.branch(e.branch) ? ' · ' + RM.branch(e.branch).name : '')])] },
        { name: 'kind', label: 'Rodzaj', type: 'select', options: Object.entries(PAY_KIND) },
        { name: 'amount', label: 'Kwota (zł)', type: 'number', min: 0.01, step: '0.01', required: true, inputmode: 'decimal' },
        { name: 'task', label: 'Zlecenie (opcjonalnie)', type: 'select', full: true, options: [['', '— bez zlecenia —'], ...S.tasks.filter(t => ['completed', 'progress', 'planned'].includes(t.status)).sort((a, b) => new Date(b.dateStart) - new Date(a.dateStart)).slice(0, 80).map(t => [t._id, `${t.number} · ${t.name}`])] },
        { name: 'description', label: 'Opis', full: true, placeholder: 'np. dniówka, nadgodziny, premia za opinię' },
        { name: 'date', label: 'Data', type: 'date' }
      ],
      submitLabel: 'Dodaj',
      async onSubmit(data) {
        if (!data.task) delete data.task;
        await RM.api('/api/payroll', { method: 'POST', body: data });
        RM.toast('Dodano do rozliczenia');
        done?.();
      }
    });
  };

  RM.payForTask = t => {
    const fields = (t.workers || []).filter(w => w.employee).map(w => {
      const e = RM.employee(w.employee);
      const suggested = e?.payRate ? (e.payRateUnit === 'hour' ? Math.round((t.hoursWorked || 0) * e.payRate) : e.payRate) : '';
      return { name: 'p_' + w.employee, label: `${w.name}${e?.payRate ? ` (stawka ${e.payRate} zł/${{ task: 'zlec.', hour: 'h', day: 'dzień' }[e.payRateUnit] || 'zlec.'})` : ''}`, type: 'number', min: 0, step: '0.01', value: suggested || '' };
    });
    if (!fields.length) return RM.toast('Do zlecenia nie przypisano pracowników z zespołu', 'error');
    RM.form({
      title: 'Wypłaty za zlecenie', subtitle: `${t.number} · ${t.name}`, fields, submitLabel: 'Dodaj do rozliczeń',
      async onSubmit(data) {
        const amounts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k.slice(2), v]));
        const r = await RM.api('/api/payroll/from-task', { method: 'POST', body: { task: RM.id(t), amounts } });
        RM.toast(`Dodano ${r.created} ${plural(r.created, 'pozycję', 'pozycje', 'pozycji')}`);
      }
    });
  };

  views.rozliczenia = {
    title: 'Rozliczenia',
    admin: true,
    async render(el) {
      if (!el.querySelector('.pay-list')) el.innerHTML = '<div class="skeleton"></div>';
      const data = await RM.api('/api/payroll');
      const rerender = () => views.rozliczenia.render(el);
      el.innerHTML = `
        <div class="page-head"><div><h1>Rozliczenia</h1><p>Wypłaty całego zespołu ze wszystkich oddziałów. „Rozliczono” zapisuje wypłatę w kosztach firmy.</p></div>
          <div class="page-actions"><button class="btn primary" id="payNew"><i class="fa-solid fa-plus"></i> Dodaj wypłatę</button></div></div>
        <div class="kpis"><div class="card kpi" style="--tone:var(--purple)"><div class="kpi-label">Do wypłaty łącznie <i class="fa-solid fa-hand-holding-dollar"></i></div><div class="kpi-value">${esc(RM.money(data.total))}</div><div class="kpi-sub">${data.employees.filter(e => e.balance).length} ${plural(data.employees.filter(e => e.balance).length, 'osoba', 'osoby', 'osób')} z nierozliczonymi kwotami</div></div></div>
        <div class="pay-list">${data.employees.map(e => `<article class="card pay-card ${e.balance ? '' : 'zero'}">
          <div class="pay-head"><span class="avatar" style="color:${esc(e.color || 'var(--accent)')}">${esc(RM.initials(e.name))}</span><div style="min-width:0;flex:1"><h3>${esc(e.name)}${e.isOwner ? ' <span class="badge plain tone-green">Właściciel</span>' : ''}</h3><p>${esc(e.role || '')} ${RM.branchBadge(e.branch, { empty: true })}</p></div>
            <div class="pay-sum"><small>Do wypłaty</small><strong>${esc(RM.money(e.balance))}</strong></div></div>
          ${e.open.length ? `<div class="rows">${e.open.map(p => `<div class="row"><span class="row-icon ${p.amount < 0 ? 'red' : ''}"><i class="fa-solid ${p.kind === 'bonus' ? 'fa-gift' : p.kind === 'advance' ? 'fa-forward' : p.kind === 'deduction' ? 'fa-minus' : 'fa-money-bill'}"></i></span><span class="row-main"><strong>${esc(PAY_KIND[p.kind] || 'Wypłata')} · ${esc(RM.money(p.amount))}</strong><small>${esc(p.description || '')} · ${esc(RM.fmt.date.format(new Date(p.date)))}</small></span><button class="icon-btn ghost" data-pdel="${esc(p._id)}" title="Usuń"><i class="fa-regular fa-trash-can"></i></button></div>`).join('')}</div>` : '<p class="muted small" style="margin:8px 0 0">Brak nierozliczonych pozycji.</p>'}
          <div class="res-actions"><button class="btn sm" data-padd="${esc(e._id)}"><i class="fa-solid fa-plus"></i> Dodaj</button>${e.balance ? `<button class="btn sm primary" data-psettle="${esc(e._id)}" data-name="${esc(e.name)}" data-sum="${esc(e.balance)}"><i class="fa-solid fa-check-double"></i> Rozliczono</button>` : ''}</div>
        </article>`).join('')}</div>
        <section class="card pad" style="margin-top:16px"><div class="card-head"><div><h2>Historia rozliczeń</h2><p>Ostatnie rozliczone pozycje</p></div></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Pracownik</th><th>Pozycja</th><th>Kwota</th><th>Rozliczenie</th></tr></thead><tbody>${data.history.map(p => `<tr><td>${esc(RM.fmt.date.format(new Date(p.settledAt)))}</td><td>${esc(p.employeeName)}</td><td>${esc(PAY_KIND[p.kind] || '')} · ${esc(p.description || '')}</td><td class="nowrap"><b>${esc(RM.money(p.amount))}</b></td><td class="mono muted">${esc(p.settlement || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Brak rozliczeń.</td></tr>'}</tbody></table></div></section>`;
      $('#payNew', el).addEventListener('click', () => RM.payForm(null, rerender));
      $$('[data-padd]', el).forEach(b => b.addEventListener('click', () => RM.payForm({ employee: b.dataset.padd }, rerender)));
      $$('[data-pdel]', el).forEach(b => b.addEventListener('click', async () => {
        if (!await RM.confirm('Usunąć pozycję z rozliczenia?', { ok: 'Usuń' })) return;
        try { await RM.api('/api/payroll/' + b.dataset.pdel, { method: 'DELETE' }); rerender(); } catch (err) { RM.fail(err); }
      }));
      $$('[data-psettle]', el).forEach(b => b.addEventListener('click', async () => {
        if (!await RM.confirm(`Rozliczyć ${b.dataset.name}: ${RM.money(b.dataset.sum)}? Kwota trafi do kosztów firmy (Wynagrodzenia), a saldo się wyzeruje.`, { ok: 'Rozliczono', danger: false })) return;
        try { const r = await RM.api('/api/payroll/settle/' + b.dataset.psettle, { method: 'POST' }); RM.toast(`Rozliczono ${RM.money(r.total)}`); RM.api('/api/dashboard').then(d => { S.dashboard = d; }).catch(() => null); rerender(); } catch (err) { RM.fail(err); }
      }));
    }
  };

  /* ================================================================== */
  /* STATYSTYKI (z podatkiem)                                             */
  /* ================================================================== */

  function bars(months) {
    const max = Math.max(1, ...months.map(m => Math.max(m.revenue, m.expenses)));
    return `<div class="bars">${months.map(m => `<div class="bar-col" title="${esc(m.label)}: przychód ${esc(RM.money(m.revenue))}, koszty ${esc(RM.money(m.expenses))}, podatek ${esc(RM.money(m.tax))}">
      <div class="bar-pair"><i style="height:${(m.revenue / max) * 100}%"></i><i class="exp" style="height:${(m.expenses / max) * 100}%"></i></div><small>${esc(m.label)}</small></div>`).join('')}</div>`;
  }

  views.statystyki = {
    title: 'Statystyki',
    admin: true,
    async render(el) {
      const ui = S.ui;
      if (!el.querySelector('.st-wrap')) el.innerHTML = '<div class="skeleton"></div>';
      const q = new URLSearchParams({ year: ui.statsYear, month: ui.statsMonth, period: ui.statsPeriod });
      const d = await RM.api('/api/stats?' + q);
      const t = d.totals;
      const monthName = new Date(ui.statsYear, ui.statsMonth - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
      const cats = Object.entries(d.categories).sort((a, b) => b[1] - a[1]);
      const catMax = Math.max(1, ...cats.map(c => c[1]));
      el.innerHTML = `<div class="st-wrap">
        <div class="page-head"><div><h1>Statystyki</h1><p>${ui.statsPeriod === 'year' ? 'Rok ' + ui.statsYear : esc(monthName)} · przychody, koszty, podatek, oddziały i zespół</p></div>
          <div class="page-actions"><div class="segmented"><button data-sp="month" class="${ui.statsPeriod === 'month' ? 'active' : ''}">Miesiąc</button><button data-sp="year" class="${ui.statsPeriod === 'year' ? 'active' : ''}">Rok</button></div>
            ${ui.statsPeriod === 'month' ? '<button class="icon-btn" data-sm="-1" aria-label="Poprzedni"><i class="fa-solid fa-chevron-left"></i></button><button class="icon-btn" data-sm="1" aria-label="Następny"><i class="fa-solid fa-chevron-right"></i></button>' : '<button class="icon-btn" data-sy="-1"><i class="fa-solid fa-chevron-left"></i></button><button class="icon-btn" data-sy="1"><i class="fa-solid fa-chevron-right"></i></button>'}</div></div>
        <div class="kpis">
          <div class="card kpi"><div class="kpi-label">Przychód <i class="fa-solid fa-wallet"></i></div><div class="kpi-value">${esc(RM.money(t.revenue))}</div><div class="kpi-sub">${t.completed} zleceń · śr. ${esc(RM.money(t.avgTicket))}</div></div>
          <div class="card kpi" style="--tone:var(--orange)"><div class="kpi-label">Koszty <i class="fa-solid fa-receipt"></i></div><div class="kpi-value">${esc(RM.money(t.expenses))}</div><div class="kpi-sub">zlecenia ${esc(RM.money(t.taskCosts))} · wypłaty ${esc(RM.money(t.payroll))}</div></div>
          <div class="card kpi" style="--tone:var(--purple)"><div class="kpi-label">Zysk <i class="fa-solid fa-chart-line"></i></div><div class="kpi-value">${esc(RM.money(t.profit))}</div><div class="kpi-sub">marża ${t.margin}%</div></div>
          <div class="card kpi" style="--tone:var(--red)"><div class="kpi-label">Podatek ${esc(d.tax.rate)}% <i class="fa-solid fa-landmark"></i></div><div class="kpi-value">${esc(RM.money(ui.statsPeriod === 'year' ? d.tax.ytd : d.tax.month))}</div><div class="kpi-sub">od stycznia ${esc(RM.money(d.tax.ytd))} · dochód ${esc(RM.money(d.tax.ytdProfit))}</div></div>
        </div>
        <div class="kpis kpis-biz">
          <div class="card kpi" style="--tone:var(--blue)"><div class="kpi-label">Konwersja wycen <i class="fa-solid fa-filter"></i></div><div class="kpi-value">${d.quotes.conversion}%</div><div class="kpi-sub">${d.quotes.won} z ${d.quotes.total} zgłoszeń z formularza</div></div>
          <div class="card kpi"><div class="kpi-label">Trafność RevBota <i class="fa-solid fa-robot"></i></div><div class="kpi-value">${d.revbot.accuracy === null ? '—' : d.revbot.accuracy + '%'}</div><div class="kpi-sub">${d.revbot.inRange === null ? 'za mało zakończonych zleceń' : d.revbot.inRange + '% cen końcowych w widełkach'} · ${d.revbot.compared} porównań</div></div>
          <div class="card kpi" style="--tone:var(--purple)"><div class="kpi-label">Do wypłaty <i class="fa-solid fa-hand-holding-dollar"></i></div><div class="kpi-value">${esc(RM.money(t.toPay))}</div><div class="kpi-sub"><a class="link" href="#/rozliczenia">Rozliczenia →</a></div></div>
          <div class="card kpi"><div class="kpi-label">Prośby o opinię <i class="fa-regular fa-star"></i></div><div class="kpi-value">${(d.reviews.sent || 0) + (d.reviews.manual || 0)}</div><div class="kpi-sub">${d.reviews.failed || 0} nieudanych</div></div>
        </div>
        <div class="grid grid-2">
          <section class="card pad"><div class="card-head"><div><h2>Rok ${esc(ui.statsYear)} — miesiąc po miesiącu</h2><p>Przychody i koszty</p></div><div class="legend"><span style="--c:var(--accent)">Przychód</span><span style="--c:rgba(251,191,36,.7)">Koszty</span></div></div>${bars(d.months)}
            <div class="table-wrap" style="margin-top:12px"><table class="table"><thead><tr><th>Miesiąc</th><th>Przychód</th><th>Koszty</th><th>Dochód</th><th>Podatek</th></tr></thead><tbody>${d.months.map(m => `<tr><td>${esc(m.label)}</td><td>${esc(RM.money(m.revenue))}</td><td>${esc(RM.money(m.expenses))}</td><td>${esc(RM.money(m.profit))}</td><td><b>${esc(RM.money(m.tax))}</b></td></tr>`).join('')}<tr class="sum"><td>Razem</td><td>${esc(RM.money(d.months.reduce((s, m) => s + m.revenue, 0)))}</td><td>${esc(RM.money(d.months.reduce((s, m) => s + m.expenses, 0)))}</td><td>${esc(RM.money(d.tax.ytdProfit))}</td><td><b>${esc(RM.money(d.tax.ytd))}</b></td></tr></tbody></table></div>
            <p class="muted small" style="margin:8px 0 0"><i class="fa-solid fa-circle-info"></i> Podatek: ${esc(d.tax.rate)}% dochodu narastająco od stycznia${d.tax.threshold ? `, ${esc(d.tax.upperRate)}% od nadwyżki ponad ${esc(n0(d.tax.threshold))} zł` : ''}${d.tax.freeAmount ? `, z kwotą wolną ${esc(n0(d.tax.freeAmount))} zł` : ''}. Szacunek bez ZUS i składki zdrowotnej — zmienisz w Ustawieniach.</p></section>
          <section class="card pad"><div class="card-head"><div><h2>Koszty wg kategorii</h2><p>${ui.statsPeriod === 'year' ? 'w roku' : 'w miesiącu'}</p></div></div>
            ${cats.length ? `<div class="div-rows">${cats.map(([k, v]) => `<div class="div-row"><span class="small">${esc(k)}</span><span class="div-bar"><i style="width:${(v / catMax) * 100}%;background:var(--orange)"></i></span><span></span><strong class="nowrap">${esc(RM.money(v))}</strong></div>`).join('')}</div>` : '<p class="muted small">Brak kosztów w tym okresie.</p>'}</section>
          <section class="card pad"><div class="card-head"><div><h2>Oddziały</h2><p>Wynik ekip</p></div><a class="link" href="#/oddzialy">Oddziały →</a></div>
            <div class="table-wrap"><table class="table"><thead><tr><th>Oddział</th><th>Zleceń</th><th>Przychód</th><th>Koszty</th><th>Zysk</th></tr></thead><tbody>${d.branches.map(b => `<tr><td><span class="br-dot sm" style="--bc:${esc(b.color || '#8a8f98')}"></span>${esc(b.name)} <span class="muted small">${b.members} os.</span></td><td>${b.completed}</td><td>${esc(RM.money(b.revenue))}</td><td>${esc(RM.money(b.costs))}</td><td><b>${esc(RM.money(b.profit))}</b></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Brak danych.</td></tr>'}</tbody></table></div></section>
          <section class="card pad"><div class="card-head"><div><h2>Zespół</h2><p>Zlecenia, udział w przychodzie, wypłaty</p></div><a class="link" href="#/rozliczenia">Rozliczenia →</a></div>
            <div class="table-wrap"><table class="table"><thead><tr><th>Osoba</th><th>Zleceń</th><th>Przychód</th><th>Wypłacono</th><th>Do wypłaty</th></tr></thead><tbody>${d.employees.map(e => `<tr><td>${esc(e.name)}${e.isOwner ? ' 👑' : ''}</td><td>${e.tasks}</td><td>${esc(RM.money(e.revenue))}</td><td>${esc(RM.money(e.paid))}</td><td><b>${esc(RM.money(e.toPay))}</b></td></tr>`).join('')}</tbody></table></div></section>
          <section class="card pad" style="grid-column:1/-1"><div class="card-head"><div><h2>Usługi</h2><p>Co zarabia najwięcej</p></div></div>
            <div class="table-wrap"><table class="table"><thead><tr><th>Usługa</th><th>Zleceń</th><th>Przychód</th><th>Śr. cena</th><th>Koszty zleceń</th><th>Marża</th><th>Godziny</th></tr></thead><tbody>${d.services.map(s => `<tr><td>${esc(s.type)}</td><td>${s.count}</td><td>${esc(RM.money(s.revenue))}</td><td>${esc(RM.money(s.avg))}</td><td>${esc(RM.money(s.costs))}</td><td><b style="color:${s.margin >= 50 ? 'var(--accent)' : s.margin >= 25 ? 'var(--orange)' : 'var(--red)'}">${s.margin}%</b></td><td>${esc(n1(s.hours))}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Brak zakończonych zleceń w tym okresie.</td></tr>'}</tbody></table></div></section>
        </div></div>`;
      const rerender = () => views.statystyki.render(el);
      $$('[data-sp]', el).forEach(b => b.addEventListener('click', () => { ui.statsPeriod = b.dataset.sp; rerender(); }));
      $$('[data-sm]', el).forEach(b => b.addEventListener('click', () => {
        let m = ui.statsMonth + Number(b.dataset.sm);
        if (m < 1) { m = 12; ui.statsYear -= 1; }
        if (m > 12) { m = 1; ui.statsYear += 1; }
        ui.statsMonth = m;
        rerender();
      }));
      $$('[data-sy]', el).forEach(b => b.addEventListener('click', () => { ui.statsYear += Number(b.dataset.sy); rerender(); }));
    }
  };
  views.raporty = views.statystyki;

  /* ================================================================== */
  /* REVBOT                                                               */
  /* ================================================================== */

  const MEM_KIND = { rule: ['Reguła', 'green'], lesson: ['Wniosek z realizacji', 'blue'], market: ['Wiedza z internetu', 'orange'], correction: ['Korekta administratora', ''] };
  const PARAM_FIELDS = [
    ['kmRate', 'Stawka za 1 km trasy (zł)', 0.1], ['floorRate', 'Każde piętro bez windy (zł)', 1], ['liftFactor', 'Z windą — część stawki za piętro (0–1)', 0.05],
    ['weekendSurcharge', 'Weekend lub święto (+%)', 1], ['urgentSurcharge', 'Termin pilny (+%)', 1], ['laborRate', 'Roboczogodzina 1 osoby — cena (zł)', 1],
    ['minOrder', 'Minimalna kwota zlecenia (zł)', 10], ['margin', 'Minimalna marża ponad koszty (%)', 1], ['disposalMarkup', 'Narzut na utylizację (%)', 1],
    ['packingPerM3', 'Pakowanie — za m³ (zł)', 1], ['assemblyPerM3', 'Demontaż + montaż — za m³ (zł)', 1], ['freeRadiusKm', 'Dojazd wliczony do (km od Słupska)', 1],
    ['workerCostRate', 'Koszt firmy za roboczogodzinę (zł)', 1], ['fuelCostPerKm', 'Koszt paliwa i auta za km (zł)', 0.05], ['vanM3', 'Pojemność busa (m³)', 1],
    ['extraCourse', 'Kolejny kurs lokalny (zł)', 5], ['moveM3PerWorkerHour', 'Wydajność przeprowadzki (m³ / os. / h)', 0.1], ['clearM3PerWorkerHour', 'Wydajność opróżniania (m³ / os. / h)', 0.1]
  ];

  views.revbot = {
    title: 'RevBot',
    admin: true,
    async render(el) {
      if (!el.querySelector('.rb-wrap')) el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/revbot');
      const p = d.params;
      const svcName = id => d.services.find(s => s.id === id)?.name || 'Wszystkie usługi';
      const rerender = () => views.revbot.render(el);
      el.innerHTML = `<div class="rb-wrap">
        <div class="page-head"><div><h1><i class="fa-solid fa-robot" style="color:var(--accent)"></i> RevBot</h1><p>Wycenia zgłoszenia ze strony: analizuje zdjęcia, korzysta z historii RevMi, swojej pamięci i wiedzy z internetu. Te parametry widzi tylko administrator — klient nigdy.</p></div>
          <div class="page-actions"><span class="badge plain ${d.ai.enabled ? 'tone-green' : 'tone-red'}">${d.ai.enabled ? 'Claude API: ' + esc(d.ai.model) : 'Brak ANTHROPIC_API_KEY — wycena z samego cennika'}</span></div></div>
        <div class="grid grid-2">
          <section class="card pad"><div class="card-head"><div><h2>Zapytaj RevBota</h2><p>np. „ile za przeprowadzkę 3 pokoi Słupsk → Gdańsk w sobotę?”</p></div></div>
            <form id="rbAsk" class="note-form" style="margin:0"><textarea name="q" placeholder="Twoje pytanie…" rows="2"></textarea><button class="btn primary" aria-label="Zapytaj"><i class="fa-solid fa-paper-plane"></i></button></form>
            <div id="rbAnswer" class="desc" hidden style="margin-top:10px"></div></section>
          <section class="card pad"><div class="card-head"><div><h2>Pamięć RevBota</h2><p>${Object.entries(d.counts).map(([k, n]) => `${(MEM_KIND[k] || [k])[0]}: ${n}`).join(' · ') || 'pusta — uczy się z każdego zakończonego zlecenia'}</p></div>
            <div class="btn-row"><button class="btn sm" id="rbResearch" ${d.ai.enabled ? '' : 'disabled'}><i class="fa-solid fa-globe"></i> Odśwież wiedzę z internetu</button><button class="btn sm primary" id="rbRule"><i class="fa-solid fa-plus"></i> Reguła</button></div></div>
            <p class="muted small" style="margin:0">RevBot sam zapisuje wnioski, gdy cena końcowa różni się od wyceny, i co tydzień sprawdza aktualne ceny utylizacji i usług. Reguły administratora mają najwyższy priorytet.</p></section>
        </div>
        <section class="card pad" style="margin-top:16px"><div class="card-head"><div><h2>Ukryty cennik wyceny</h2><p>Na tej podstawie silnik liczy cenę z danych odczytanych ze zdjęć</p></div><div class="btn-row"><button class="btn sm" id="rbReset">Przywróć domyślne</button></div></div>
          <form id="rbParams"><div class="form-grid rb-params">${PARAM_FIELDS.map(([k, label, step]) => `<div class="field"><label for="rb_${k}">${esc(label)}</label><input id="rb_${k}" name="${k}" type="number" step="${step}" min="0" value="${esc(p[k])}"><span class="hint">domyślnie ${esc(d.defaults[k])}</span></div>`).join('')}</div>
          <div class="grid grid-2" style="margin-top:14px">
            <div><h3 class="rb-h">Ciężkie rzeczy (dopłata)</h3><div class="rb-list" id="rbHeavy">${p.heavyItems.map(h => `<div class="rb-item"><input data-k="label" value="${esc(h.label)}"><input data-k="price" type="number" min="0" step="10" value="${esc(h.price)}"><span>zł</span><input data-k="words" value="${esc((h.words || []).join(', '))}" title="Słowa w opisie klienta"><input data-k="key" type="hidden" value="${esc(h.key)}"><button type="button" class="icon-btn ghost" data-rbdel aria-label="Usuń"><i class="fa-solid fa-xmark"></i></button></div>`).join('')}</div><button type="button" class="btn sm" data-rbadd="heavy"><i class="fa-solid fa-plus"></i> Dodaj</button></div>
            <div><h3 class="rb-h">Utylizacja — koszt dla firmy</h3><div class="rb-list" id="rbDisposal">${p.disposal.map(x => `<div class="rb-item"><input data-k="label" value="${esc(x.label)}"><input data-k="cost" type="number" step="5" value="${esc(x.cost)}"><select data-k="unit">${['m3', 'szt', 'kg'].map(u => `<option ${x.unit === u ? 'selected' : ''} value="${u}">zł/${u === 'm3' ? 'm³' : u}</option>`).join('')}</select><input data-k="key" type="hidden" value="${esc(x.key)}"><button type="button" class="icon-btn ghost" data-rbdel aria-label="Usuń"><i class="fa-solid fa-xmark"></i></button></div>`).join('')}</div><button type="button" class="btn sm" data-rbadd="disposal"><i class="fa-solid fa-plus"></i> Dodaj</button>
              <p class="muted small">Do ceny klienta doliczamy koszt utylizacji + narzut ${esc(p.disposalMarkup)}%. Ujemny koszt = przychód ze skupu (np. złom).</p></div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn primary"><i class="fa-solid fa-check"></i> Zapisz cennik</button></div></form></section>
        <section class="card pad" style="margin-top:16px"><div class="card-head"><div><h2>Sprawdź wycenę</h2><p>Symulacja bez zdjęć (do testowania cennika)</p></div></div>
          <form id="rbSim" class="form-grid"><div class="field"><label>Usługa</label><select name="service">${d.services.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
            <div class="field"><label>Skąd / adres</label><input name="address" value="Słupsk"></div><div class="field"><label>Dokąd</label><input name="destination" placeholder="np. Gdańsk"></div><div class="field"><label>Km trasy (gdy bez geolokalizacji)</label><input name="km" type="number" min="0"></div>
            <div class="field"><label>Data</label><input name="date" type="date"></div><div class="field full"><label>Opis</label><input name="description" placeholder="np. 3 pokoje, pianino, 4 piętro bez windy"></div>
            <div class="field full" style="display:flex;gap:14px;flex-wrap:wrap"><label class="toggle-line"><span class="switch"><input type="checkbox" name="geo"><span></span></span> Licz trasę z mapy</label><label class="toggle-line"><span class="switch"><input type="checkbox" name="useAi" ${d.ai.enabled ? '' : 'disabled'}><span></span></span> Z AI (zużywa zapytanie)</label><button class="btn primary" style="margin-left:auto"><i class="fa-solid fa-calculator"></i> Wylicz</button></div></form>
          <div id="rbSimOut"></div></section>
        <section class="card pad" style="margin-top:16px"><div class="card-head"><div><h2>Wpisy w pamięci</h2><p>Wyłączony wpis nie trafia do wycen</p></div></div>
          <div class="rows">${d.memory.map(m => `<div class="row rb-mem ${m.active ? '' : 'off'}"><span class="row-icon"><i class="fa-solid ${m.kind === 'market' ? 'fa-globe' : m.kind === 'lesson' ? 'fa-graduation-cap' : m.kind === 'correction' ? 'fa-pen-ruler' : 'fa-scale-balanced'}"></i></span>
            <span class="row-main"><strong>${RM.tag(MEM_KIND[m.kind] || [m.kind, ''])} <span class="muted small">${esc(svcName(m.service))} · waga ${esc(m.weight)} · użyto ${esc(m.uses || 0)}× · ${esc(RM.ago(m.updatedAt))}</span></strong><small style="white-space:normal">${esc(m.text)}</small>${(m.sources || []).length ? `<small>${m.sources.slice(0, 3).map(u => `<a class="link" href="${esc(u)}" target="_blank" rel="noopener">${esc(new URL(u).hostname)}</a>`).join(' · ')}</small>` : ''}</span>
            <label class="switch" title="Aktywny"><input type="checkbox" data-mtoggle="${esc(m._id)}" ${m.active ? 'checked' : ''}><span></span></label><button class="icon-btn ghost" data-mdel="${esc(m._id)}" aria-label="Usuń"><i class="fa-regular fa-trash-can"></i></button></div>`).join('') || '<p class="muted small">Pamięć jest pusta.</p>'}</div></section>
      </div>`;

      const answer = $('#rbAnswer', el);
      $('#rbAsk', el).addEventListener('submit', async e => {
        e.preventDefault();
        const q = e.target.elements.q.value.trim();
        if (!q) return;
        answer.hidden = false;
        answer.textContent = 'RevBot myśli…';
        try { const r = await RM.api('/api/revbot/ask', { method: 'POST', body: { question: q } }); answer.textContent = r.answer; } catch (err) { answer.textContent = err.message; }
      });
      $('#rbResearch', el).addEventListener('click', async e => {
        const b = e.currentTarget;
        b.disabled = true;
        b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Szukam w internecie…';
        try { const r = await RM.api('/api/revbot/research', { method: 'POST', body: {} }); RM.toast(`Zapisano ${r.saved.length} wpisów`); rerender(); } catch (err) { RM.fail(err); b.disabled = false; }
      });
      $('#rbRule', el).addEventListener('click', () => RM.form({
        title: 'Nowa reguła RevBota', subtitle: 'Np. „Pianino na piętro bez windy zawsze minimum 600 zł”',
        values: { weight: 5 },
        fields: [
          { name: 'text', label: 'Reguła', type: 'textarea', required: true, full: true, maxlength: 1500 },
          { name: 'service', label: 'Dotyczy usługi', type: 'select', options: [['', 'Wszystkich'], ...d.services.map(s => [s.id, s.name])] },
          { name: 'weight', label: 'Ważność (0–10)', type: 'number', min: 0, max: 10 }
        ],
        submitLabel: 'Zapamiętaj',
        async onSubmit(data) { await RM.api('/api/revbot/memory', { method: 'POST', body: { ...data, kind: 'rule' } }); RM.toast('RevBot zapamiętał regułę'); rerender(); }
      }));
      $('#rbReset', el).addEventListener('click', async () => {
        if (!await RM.confirm('Przywrócić domyślny cennik RevBota?', { ok: 'Przywróć' })) return;
        await RM.api('/api/revbot/params', { method: 'PUT', body: { reset: true } });
        RM.toast('Przywrócono');
        rerender();
      });
      el.addEventListener('click', e => {
        const del = e.target.closest('[data-rbdel]');
        if (del) del.closest('.rb-item').remove();
        const add = e.target.closest('[data-rbadd]');
        if (add) {
          const key = 'wlasne_' + Date.now().toString(36);
          const box = $(add.dataset.rbadd === 'heavy' ? '#rbHeavy' : '#rbDisposal', el);
          box.insertAdjacentHTML('beforeend', add.dataset.rbadd === 'heavy'
            ? `<div class="rb-item"><input data-k="label" placeholder="Nazwa"><input data-k="price" type="number" min="0" step="10" value="100"><span>zł</span><input data-k="words" placeholder="słowa w opisie, po przecinku"><input data-k="key" type="hidden" value="${key}"><button type="button" class="icon-btn ghost" data-rbdel><i class="fa-solid fa-xmark"></i></button></div>`
            : `<div class="rb-item"><input data-k="label" placeholder="Rodzaj odpadu"><input data-k="cost" type="number" step="5" value="50"><select data-k="unit"><option value="m3">zł/m³</option><option value="szt">zł/szt</option><option value="kg">zł/kg</option></select><input data-k="key" type="hidden" value="${key}"><button type="button" class="icon-btn ghost" data-rbdel><i class="fa-solid fa-xmark"></i></button></div>`);
        }
      });
      const readList = sel => $$(sel + ' .rb-item', el).map(row => Object.fromEntries($$('[data-k]', row).map(i => [i.dataset.k, i.value]))).filter(x => x.label && x.label.trim());
      $('#rbParams', el).addEventListener('submit', async e => {
        e.preventDefault();
        const f = e.target.elements;
        const params = Object.fromEntries(PARAM_FIELDS.map(([k]) => [k, Number(f[k].value)]));
        params.heavyItems = readList('#rbHeavy');
        params.disposal = readList('#rbDisposal');
        try { await RM.api('/api/revbot/params', { method: 'PUT', body: { params } }); RM.toast('Zapisano cennik RevBota'); } catch (err) { RM.fail(err); }
      });
      $('#rbSim', el).addEventListener('submit', async e => {
        e.preventDefault();
        const f = e.target.elements;
        const out = $('#rbSimOut', el);
        out.innerHTML = '<div class="skeleton" style="height:60px"></div>';
        try {
          const r = await RM.api('/api/revbot/simulate', { method: 'POST', body: { service: f.service.value, address: f.address.value, destination: f.destination.value, km: Number(f.km.value) || 0, date: f.date.value, description: f.description.value, geo: f.geo.checked, useAi: f.useAi.checked } });
          out.innerHTML = RM.revbotBreakdown(r.estimate);
        } catch (err) { out.innerHTML = `<p class="login-error">${esc(err.message)}</p>`; }
      });
      $$('[data-mtoggle]', el).forEach(i => i.addEventListener('change', async () => {
        try { await RM.api('/api/revbot/memory/' + i.dataset.mtoggle, { method: 'PUT', body: { active: i.checked } }); i.closest('.rb-mem').classList.toggle('off', !i.checked); } catch (err) { RM.fail(err); }
      }));
      $$('[data-mdel]', el).forEach(b => b.addEventListener('click', async () => {
        if (!await RM.confirm('Usunąć wpis z pamięci RevBota?', { ok: 'Usuń' })) return;
        try { await RM.api('/api/revbot/memory/' + b.dataset.mdel, { method: 'DELETE' }); rerender(); } catch (err) { RM.fail(err); }
      }));
    }
  };

  /** Rozbicie wyceny dla administratora (koszty, zysk, linie cennika, spis rzeczy). */
  RM.revbotBreakdown = e => {
    if (!e) return '';
    const ctx = e.context || {};
    return `<div class="rb-break">
      <div class="rb-top"><div><small>Widełki dla klienta</small><strong>${esc(RM.money(e.low))} – ${esc(RM.money(e.high))}</strong></div><div><small>Koszty firmy</small><strong>${esc(RM.money(e.cost || 0))}</strong></div><div><small>Zysk</small><strong style="color:var(--accent)">${esc(RM.money(e.profitLow || 0))} – ${esc(RM.money(e.profitHigh || 0))}</strong></div></div>
      ${ctx.routeKm || ctx.approachKm ? `<p class="muted small">Trasa ${esc(n1(ctx.routeKm || 0))} km · dojazd z bazy ${esc(n1(ctx.approachKm || 0))} km (${esc(ctx.distanceSource || '')})${ctx.surcharge ? ' · dopłata: ' + esc(ctx.dayName || 'weekend/święto') : ''}${ctx.urgent ? ' · pilne' : ''}</p>` : ''}
      ${(e.engine || []).map(s => `<details ${(e.engine || []).length === 1 ? 'open' : ''}><summary><b>${esc(s.name)}</b> — silnik ${esc(RM.money(s.engineMid))}${s.aiSuggested ? ` · AI ${esc(RM.money(s.aiSuggested))}` : ''}${s.factor && s.factor !== 1 ? ` · historia ×${esc(s.factor.toFixed(2))} (${s.history})` : ''}</summary>
        <div class="rb-lines">${(s.lines || []).map(l => `<div><span>${esc(l.label)}${l.note ? ` <small class="muted">${esc(l.note)}</small>` : ''}</span><b>${esc(RM.money(l.amount))}</b></div>`).join('')}</div>
        <p class="muted small">${s.crew ? s.crew + ' os.' : ''}${s.hours ? ' · ' + esc(n1(s.hours)) + ' h' : ''}${s.volumeM3 ? ' · ' + esc(n1(s.volumeM3)) + ' m³' : ''} · koszt ${esc(RM.money(s.cost))}${s.disposal?.lines?.length ? ' · utylizacja: ' + s.disposal.lines.map(x => `${esc(x.label)} ${esc(n1(x.amount))} ${x.unit === 'm3' ? 'm³' : esc(x.unit)} = ${esc(RM.money(x.cost))}`).join(', ') : ''}</p></details>`).join('')}
      ${(e.inventory || []).length ? `<details><summary>Spis rzeczy ze zdjęć (${e.inventory.length})</summary><div class="rb-lines">${e.inventory.map(i => `<div><span>${esc(i.item)}${i.photo ? ` <small class="muted">zdj. ${i.photo}</small>` : ''}${i.disposal ? ` <small class="muted">→ ${esc(i.disposal)}</small>` : ''}</span><b>${esc(n1(i.qty))}</b></div>`).join('')}</div></details>` : ''}
      ${(e.photoFindings || []).length ? `<details><summary>Analiza zdjęć</summary><ul class="ai-list">${e.photoFindings.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
    </div>`;
  };

  /* Rozbicie w szczegółach zgłoszenia — dopinane pod sekcją „Wycena AI” */
  const baseAi = RM.aiSection;
  RM.aiSection = t => {
    const html = baseAi ? baseAi(t) : '';
    if (!html || !RM.isAdmin() || !t.aiEstimate?.engine) return html;
    return html.replace(/<div class="btn-row">(?![\s\S]*<div class="btn-row">)/, `${RM.revbotBreakdown(t.aiEstimate)}<div class="btn-row">`);
  };

  /* ================================================================== */
  /* DUŻY NOTATNIK — edytor na cały ekran z autozapisem                    */
  /* ================================================================== */

  const NOTE_COLOR_DOT = { default: '#8f9895', mint: '#03f0ba', blue: '#60a5fa', amber: '#fbbf24', rose: '#fb7185', violet: '#c4b5fd' };
  const listToText = items => (items || []).map(i => (i.done ? '[x] ' : '[ ] ') + i.text).join('\n');
  function textToList(text, previous = []) {
    const old = new Map((previous || []).map(i => [i.text, i]));
    return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const done = /^\[(x|X)\]/.test(line);
      const clean = line.replace(/^\[( |x|X)?\]\s*/, '').replace(/^[-•]\s*/, '').trim();
      const prev = old.get(clean);
      return { ...(prev?._id ? { _id: prev._id } : {}), text: clean, done };
    }).filter(i => i.text);
  }

  RM.noteForm = function (note, preset = {}, done) {
    let current = note ? { ...note } : null;
    const v = { color: 'default', visibility: 'private', ...(note || {}), ...preset };
    const canVis = !note || note.mine;
    const box = sheet(`<form class="ne" novalidate>
      <div class="ne-top">
        <button type="button" class="icon-btn ghost" data-x aria-label="Zamknij"><i class="fa-solid fa-arrow-left"></i></button>
        <span class="ne-status muted small" data-status>${note ? 'Zapisano ' + esc(RM.ago(note.updatedAt)) : 'Nowa notatka'}</span>
        <div class="ne-tools">
          <div class="ne-colors" role="group" aria-label="Kolor">${Object.entries(NOTE_COLOR_DOT).map(([k, c]) => `<button type="button" data-color="${k}" class="${v.color === k ? 'on' : ''}" style="--c:${c}" title="${esc(RM.NOTE_COLORS[k])}"></button>`).join('')}</div>
          <button type="button" class="icon-btn ghost ${v.pinned ? 'on' : ''}" data-pin title="Przypnij"><i class="fa-solid fa-thumbtack"></i></button>
          ${note && (note.mine || RM.isAdmin()) ? '<button type="button" class="icon-btn ghost" data-more title="Więcej"><i class="fa-solid fa-ellipsis"></i></button>' : ''}
        </div>
      </div>
      <div class="ne-body nc-${esc(v.color)}">
        <input class="ne-title" name="title" maxlength="160" placeholder="Tytuł" value="${esc(v.title || '')}">
        <textarea class="ne-text" name="content" maxlength="20000" placeholder="Pisz swobodnie — notatka zapisuje się sama…">${esc(v.content || '')}</textarea>
        <details class="ne-extra" ${(v.checklist || []).length ? 'open' : ''}><summary><i class="fa-solid fa-list-check"></i> Lista zadań</summary><textarea name="checklist" rows="5" placeholder="[ ] Kupić folię stretch&#10;[x] Zadzwonić do klienta">${esc(listToText(v.checklist))}</textarea></details>
        <div class="ne-meta">
          <label><i class="fa-solid fa-hashtag"></i><input name="tags" placeholder="tagi, po przecinku" value="${esc((v.tags || []).join(', '))}"></label>
          <label><i class="fa-regular fa-bell"></i><input name="reminderAt" type="datetime-local" value="${esc(RM.toLocalInput(v.reminderAt))}"></label>
          ${canVis ? `<label><i class="fa-solid fa-users"></i><select name="visibility"><option value="private" ${v.visibility === 'private' ? 'selected' : ''}>Prywatna</option><option value="team" ${v.visibility === 'team' ? 'selected' : ''}>Zespołowa</option></select></label>` : `<span class="muted small"><i class="fa-solid fa-users"></i> Zespołowa · ${esc(note.ownerName || '')}</span>`}
        </div>
      </div>
      <div class="ne-foot"><span class="muted small" data-count></span><button type="submit" class="btn primary"><i class="fa-solid fa-check"></i> Gotowe</button></div>
    </form>`, 'v8-note');

    const form = $('form', box);
    const status = $('[data-status]', box);
    const count = $('[data-count]', box);
    let color = v.color;
    let pinned = Boolean(v.pinned);
    let dirty = false;
    let saving = null;
    const updCount = () => { const t = form.elements.content.value; count.textContent = `${t.trim() ? t.trim().split(/\s+/).length : 0} słów · ${t.length} znaków`; };
    updCount();
    const body = () => ({
      title: form.elements.title.value.trim(), content: form.elements.content.value, color, pinned,
      tags: form.elements.tags.value, checklist: textToList(form.elements.checklist.value, current?.checklist),
      reminderAt: form.elements.reminderAt.value ? new Date(form.elements.reminderAt.value).toISOString() : null,
      ...(form.elements.visibility ? { visibility: form.elements.visibility.value } : {}),
      ...(preset.task && !current ? { task: preset.task } : {}), ...(preset.division && !current ? { division: preset.division } : {})
    });
    const save = async () => {
      const b = body();
      if (!b.title && !b.content.trim() && !b.checklist.length) return null;
      status.textContent = 'Zapisuję…';
      const r = await RM.api(current ? '/api/notes/' + current._id : '/api/notes', { method: current ? 'PUT' : 'POST', body: b });
      current = r.note || current || null;
      if (!current && r.note) current = r.note;
      dirty = false;
      status.textContent = 'Zapisano ' + RM.fmt.time.format(new Date());
      return current;
    };
    const queue = RM.debounce(() => { saving = save().catch(err => { status.textContent = 'Błąd zapisu: ' + err.message; }); }, 900);
    form.addEventListener('input', () => { dirty = true; status.textContent = 'Zmiany…'; updCount(); queue(); });
    $$('[data-color]', box).forEach(b => b.addEventListener('click', () => {
      color = b.dataset.color;
      $$('[data-color]', box).forEach(x => x.classList.toggle('on', x === b));
      $('.ne-body', box).className = 'ne-body nc-' + color;
      dirty = true; queue();
    }));
    $('[data-pin]', box).addEventListener('click', e => { pinned = !pinned; e.currentTarget.classList.toggle('on', pinned); dirty = true; queue(); });
    $('[data-more]', box)?.addEventListener('click', e => {
      e.stopPropagation();
      RM.menu(e.currentTarget, [
        { icon: current?.archived ? 'fa-box-open' : 'fa-box-archive', label: current?.archived ? 'Przywróć z archiwum' : 'Archiwizuj', action: async () => { await RM.api('/api/notes/' + current._id, { method: 'PUT', body: { archived: !current.archived } }); RM.toast('Gotowe'); box.close(); } },
        { icon: 'fa-copy', label: 'Kopia', action: async () => { await RM.api('/api/notes', { method: 'POST', body: { ...body(), title: (body().title || 'Notatka') + ' (kopia)' } }); RM.toast('Utworzono kopię'); box.close(); } },
        { icon: 'fa-trash', label: 'Usuń', danger: true, action: async () => { if (!await RM.confirm('Usunąć notatkę? Tej operacji nie można cofnąć.', { ok: 'Usuń' })) return; await RM.api('/api/notes/' + current._id, { method: 'DELETE' }); dirty = false; RM.toast('Usunięto'); box.close(); } }
      ]);
    });
    form.addEventListener('submit', async e => { e.preventDefault(); try { if (dirty) await save(); box.close(); } catch (err) { RM.fail(err); } });
    box.addEventListener('close', async () => {
      try { if (saving) await saving; if (dirty) await save(); } catch { /* błąd pokazany w statusie */ }
      if (location.hash.startsWith('#/notatnik/')) history.replaceState(null, '', '#/notatnik');
      if (done) done(); else if (location.hash.startsWith('#/notatnik')) RM.rerender();
    });
    if (!note) setTimeout(() => form.elements[window.matchMedia('(min-width: 901px)').matches ? 'title' : 'content'].focus(), 50);
  };
})();
