/* RevMi 9.0 — konta klientów i dostęp B2B, RevOutlet, RevPowrót, abonamenty (plany + subskrypcje),
   partnerzy (biura nieruchomości), hotele (stałe trasy), rekrutacja oraz sekcja „Panel klienta” w szczegółach zlecenia. */
'use strict';

(function () {
  const RM = window.RM;
  const { esc, $, $$ } = RM;
  const S = RM.state;
  const views = RM.views;
  const H = () => RM.helpers;
  const empty = (...a) => H().empty(...a);
  const day = v => (v ? RM.fmt.date.format(new Date(v)) : '—');
  const when = v => (v ? RM.fmt.full.format(new Date(v)) : '—');
  const ACCESS = { hotel: ['Hotel / pensjonat', 'blue'], partner: ['Partner — biuro nieruchomości', 'purple'] };
  const ORDER_ST = { new: ['Nowa', 'orange'], confirmed: ['Potwierdzona', 'blue'], completed: ['Zrealizowana', 'green'], cancelled: ['Anulowana', 'muted'] };
  const ITEM_ST = { draft: ['Szkic', ''], available: ['W sprzedaży', 'green'], reserved: ['Zarezerwowane', 'orange'], sold: ['Sprzedane', 'blue'], archived: ['Archiwum', 'muted'] };
  const TRIP_ST = { open: ['Otwarty', 'green'], full: ['Pełny', 'orange'], done: ['Zakończony', 'muted'], cancelled: ['Anulowany', 'red'] };
  const SUB_ST = { pending: ['Do aktywacji', 'orange'], active: ['Aktywny', 'green'], paused: ['Wstrzymany', 'muted'], cancelled: ['Zakończony', 'red'] };
  const REF_ST = { new: ['Nowe', 'orange'], contacted: ['Kontakt', 'blue'], planned: ['Zaplanowane', 'blue'], completed: ['Zrealizowane', 'green'], lost: ['Bez realizacji', 'muted'] };
  const COM_ST = { none: ['—', 'muted'], pending: ['Naliczona', 'orange'], approved: ['Zatwierdzona', 'blue'], paid: ['Wypłacona', 'green'] };
  const APP_ST = { new: ['Nowe', 'orange'], review: ['Analiza', 'blue'], interview: ['Rozmowa', 'blue'], accepted: ['Przyjęte', 'green'], rejected: ['Odrzucone', 'muted'] };
  const TRACK = { dzial: 'Dział usługowy', marketing: 'Marketing', franczyza: 'Franczyza' };
  const PERIOD = { month: 'mies.', season: 'sezon', year: 'rok' };
  const WD = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
  const kpi = (label, value, sub = '', tone = '') => `<div class="card kpi" ${tone ? `style="--tone:var(--${tone})"` : ''}><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
  const seg = (items, active, attr) => `<div class="segmented">${items.map(([k, l, n]) => `<button type="button" class="${active === k ? 'active' : ''}" data-${attr}="${esc(k)}">${esc(l)}${n !== undefined ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>`;
  const tel = p => (p ? `<a href="${esc(RM.telUrl ? RM.telUrl(p) : 'tel:' + p)}">${esc(p)}</a>` : '—');
  const ui = (S.ui.v9 = S.ui.v9 || { accAccess: '', accQ: '', outletTab: 'items', appTrack: '', subTab: 'subs' });

  /* ------------------------------------------------------------------ */
  /* Liczniki w menu                                                     */
  /* ------------------------------------------------------------------ */
  RM.loadV9Counts = async () => {
    if (!RM.isAdmin()) return;
    try { S.v9 = await RM.api('/api/v9/counts'); } catch { /* starszy serwer */ }
  };
  document.addEventListener('DOMContentLoaded', () => {
    const original = RM.reload;
    if (typeof original === 'function') {
      RM.reload = async function (...args) {
        const r = await original.apply(this, args);
        await RM.loadV9Counts();
        return r;
      };
    }
  });

  let accountOptions = null;
  async function accounts() {
    if (!accountOptions) accountOptions = (await RM.api('/api/v9/account-options')).accounts;
    return accountOptions;
  }

  /* ================================================================== */
  /* KONTA KLIENTÓW                                                       */
  /* ================================================================== */
  views.konta = {
    title: 'Konta klientów',
    admin: true,
    async render(el) {
      if (!el.querySelector('.v9-acc')) el.innerHTML = '<div class="skeleton"></div>';
      const qs = new URLSearchParams({ ...(ui.accAccess && { access: ui.accAccess }), ...(ui.accQ && { q: ui.accQ }) });
      const { accounts: list } = await RM.api('/api/v9/accounts?' + qs);
      el.innerHTML = `<div class="v9-acc">
        <div class="page-head"><div><h1>Konta klientów</h1><p>Panel klienta /konto — klienci logują się e-mailem i hasłem. Tu nadajesz dostęp do paneli B2B (hotel, partner).</p></div>
          <div class="page-actions"><a class="btn" href="/konto" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Otwórz panel klienta</a></div></div>
        <div class="toolbar" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
          ${seg([['', 'Wszystkie'], ['none', 'Bez B2B'], ['hotel', 'Hotele'], ['partner', 'Partnerzy']], ui.accAccess, 'acc')}
          <label class="search" style="flex:1;min-width:220px;max-width:380px;display:flex"><i class="fa-solid fa-magnifying-glass"></i><input id="accQ" type="search" value="${esc(ui.accQ)}" placeholder="E-mail, nazwa, telefon, NIP…"></label>
        </div>
        <div class="card table-wrap"><table class="table"><thead><tr><th>Klient</th><th>Kontakt</th><th>Dostęp B2B</th><th>Zlecenia</th><th>Ostatnio</th><th></th></tr></thead><tbody>
          ${list.map(a => `<tr>
            <td><b>${esc(a.company || a.name)}</b>${a.company ? `<div class="muted small">${esc(a.name)}</div>` : ''}${a.status === 'blocked' ? ' <span class="badge plain tone-red">Zablokowane</span>' : ''}${a.deletionRequestedAt ? ' <span class="badge plain tone-orange">Prosi o usunięcie</span>' : ''}${(a.accessRequested || []).map(k => ` <span class="badge plain tone-orange">Prosi o: ${esc(ACCESS[k][0])}</span>`).join('')}</td>
            <td>${esc(a.email)}${a.emailVerified ? ' <i class="fa-solid fa-circle-check" style="color:var(--accent)" title="E-mail potwierdzony"></i>' : ''}<div class="muted small">${tel(a.phone)}</div></td>
            <td>${a.access.length ? a.access.map(k => RM.tag(ACCESS[k])).join(' ') : '<span class="muted small">—</span>'}</td>
            <td>${a.orders}${a.value ? `<div class="muted small">${esc(RM.money(a.value))}</div>` : ''}</td>
            <td class="small">${a.lastLoginAt ? esc(RM.ago ? RM.ago(a.lastLoginAt) : day(a.lastLoginAt)) : '—'}</td>
            <td><button class="btn sm" data-acc-open="${esc(a._id)}"><i class="fa-solid fa-sliders"></i> Zarządzaj</button></td></tr>`).join('') || `<tr><td colspan="6">${empty('fa-user-shield', 'Brak kont', 'Klienci zakładają konto na stronie /konto. Link znajdziesz w nagłówku strony (ikona ludzika).')}</td></tr>`}
        </tbody></table></div></div>`;
      const rerender = () => views.konta.render(el);
      $$('[data-acc]', el).forEach(b => b.addEventListener('click', () => { ui.accAccess = b.dataset.acc; rerender(); }));
      let t;
      $('#accQ', el).addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { ui.accQ = e.target.value.trim(); rerender().then(() => { const i = $('#accQ', el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350); });
      $$('[data-acc-open]', el).forEach(b => b.addEventListener('click', () => accountForm(b.dataset.accOpen, rerender)));
    }
  };

  async function accountForm(id, done) {
    const d = await RM.api('/api/v9/accounts/' + id);
    const a = d.account;
    const summary = `<div class="muted small" style="line-height:1.7">
      Konto od ${esc(day(a.createdAt))} · logowań: ${a.loginCount} · ${a.emailVerified ? 'e-mail potwierdzony' : '<b style="color:var(--orange)">e-mail niepotwierdzony</b>'}<br>
      Zlecenia: <b>${d.tasks.length}</b> · Magazyn: <b>${d.storage.length}</b> · Abonamenty: <b>${d.subscriptions.length}</b>${a.access.includes('hotel') ? ` · Obiekty: <b>${d.properties.length}</b>` : ''}${a.access.includes('partner') ? ` · Polecenia: <b>${d.referrals}</b>` : ''}
      ${d.tasks.length ? `<div style="margin-top:6px">${d.tasks.slice(0, 6).map(t => `<a href="#/zlecenia/${esc(t._id)}" class="chip" style="margin:2px">${esc(t.number)} · ${esc(RM.STATUS[t.status]?.short || t.status)}</a>`).join('')}</div>` : ''}</div>`;
    RM.form({
      title: a.company || a.name,
      subtitle: a.email,
      values: { access: a.access, agencyName: a.partner?.agencyName || a.company, commissionPct: a.partner?.commissionPct ?? 10, companyName: a.hotel?.companyName || a.company, status: a.status, emailVerified: a.emailVerified, client: a.client || '', adminNotes: a.adminNotes, phone: a.phone },
      fields: [
        { type: 'html', full: true, html: summary },
        { type: 'section', label: 'Dostęp do paneli B2B' },
        { name: 'access', label: 'Panele', type: 'picks', full: true, options: Object.entries(ACCESS).map(([k, [l]]) => ({ value: k, label: l })), hint: 'Klient dostanie e-mail, a w jego panelu pojawi się nowa zakładka.' },
        { name: 'agencyName', label: 'Partner: nazwa biura' },
        { name: 'commissionPct', label: 'Partner: prowizja (%)', type: 'number', min: 0, max: 50, step: '0.5' },
        { name: 'companyName', label: 'Hotel: nazwa firmy / obiektu', full: true },
        { type: 'section', label: 'Konto' },
        { name: 'status', label: 'Status', type: 'select', options: [['active', 'Aktywne'], ['blocked', 'Zablokowane']] },
        { name: 'phone', label: 'Telefon', type: 'tel' },
        { name: 'client', label: 'Karta klienta w CRM', type: 'select', full: true, options: [['', '— nie powiązano —'], ...S.clients.map(c => [c._id, c.name + (c.phone ? ' · ' + c.phone : '')])] },
        { name: 'emailVerified', label: 'E-mail potwierdzony', type: 'switch', hint: 'Po potwierdzeniu klient widzi też zlecenia zgłoszone wcześniej na ten adres.' },
        { name: 'adminNotes', label: 'Notatki (widoczne tylko w RevMi)', type: 'textarea', full: true }
      ],
      submitLabel: 'Zapisz',
      danger: { label: 'Usuń konto', confirm: 'Usunąć konto klienta? Zlecenia i dokumenty zostaną (odpięte od konta).', action: async () => { await RM.api('/api/v9/accounts/' + id, { method: 'DELETE' }); accountOptions = null; RM.toast('Usunięto konto'); done(); } },
      async onSubmit(v) {
        await RM.api('/api/v9/accounts/' + id, { method: 'PUT', body: { access: v.access, partner: { agencyName: v.agencyName, commissionPct: v.commissionPct }, hotel: { companyName: v.companyName }, status: v.status, emailVerified: v.emailVerified || undefined, client: v.client || null, adminNotes: v.adminNotes, phone: v.phone } });
        accountOptions = null;
        RM.toast('Zapisano konto');
        done();
      }
    });
  }

  /* ---------- Sekcja „Panel klienta” w szczegółach zlecenia ---------- */
  const baseMedia = RM.mediaSection;
  const baseBind = RM.bindMedia;
  RM.mediaSection = (t, media, canWork) => {
    const base = baseMedia ? baseMedia(t, media, canWork) : '';
    if (!RM.isAdmin()) return base;
    const linked = Boolean(t.account);
    return base + `<div class="section" id="v9Portal"><h3><i class="fa-solid fa-user-shield"></i> Panel klienta</h3>
      <p class="muted small" style="margin:-4px 0 8px">${linked ? 'Klient śledzi to zlecenie w panelu /konto i dostaje e-maile o zmianie statusu.' : t.clientEmail ? 'Nie przypięto do konta. Jeśli klient ma konto z potwierdzonym e-mailem ' + esc(t.clientEmail) + ', i tak je zobaczy.' : 'Nie przypięto do konta klienta.'}</p>
      ${t.clientAcceptedAt ? `<p class="small" style="color:var(--accent)"><i class="fa-solid fa-check"></i> Klient zaakceptował wycenę ${esc(when(t.clientAcceptedAt))}</p>` : ''}
      ${t.clientCancelRequestedAt ? `<p class="small" style="color:var(--orange)"><i class="fa-solid fa-triangle-exclamation"></i> Klient prosi o anulowanie${t.clientCancelReason ? ': ' + esc(t.clientCancelReason) : ''}</p>` : ''}
      ${t.clientRating ? `<p class="small">Ocena klienta: <b style="color:#fbbf24">${'★'.repeat(t.clientRating)}</b>${t.clientFeedback ? ' — ' + esc(t.clientFeedback) : ''}</p>` : ''}
      ${t.trackingNote || t.etaAt ? `<p class="small">Komunikat: <b>${esc(t.trackingNote || '—')}</b>${t.etaAt ? ` · przyjazd ok. <b>${esc(when(t.etaAt))}</b>` : ''}</p>` : ''}
      <div class="btn-row"><button class="btn sm" data-v9-link><i class="fa-solid fa-link"></i> ${linked ? 'Zmień konto' : 'Przypnij do konta'}</button><button class="btn sm" data-v9-track><i class="fa-solid fa-location-crosshairs"></i> Komunikat i czas przyjazdu</button></div></div>`;
  };
  RM.bindMedia = (drawer, t) => {
    baseBind?.(drawer, t);
    $('[data-v9-link]', drawer)?.addEventListener('click', async () => {
      const opts = await accounts();
      RM.form({
        title: 'Konto klienta', subtitle: t.number,
        values: { account: t.account || '' },
        fields: [{ name: 'account', label: 'Konto', type: 'select', full: true, options: [['', '— brak —'], ...opts.map(o => [o._id, o.label])] }],
        async onSubmit(v) { const r = await RM.api(`/api/v9/tasks/${RM.id(t)}/account`, { method: 'POST', body: { account: v.account || null } }); RM.upsertTask(r.task); RM.toast('Zapisano'); RM.refreshDrawer(); }
      });
    });
    $('[data-v9-track]', drawer)?.addEventListener('click', () => {
      RM.form({
        title: 'Śledzenie dla klienta', subtitle: 'Widoczne w panelu klienta przy zleceniu',
        values: { trackingNote: t.trackingNote || '', etaAt: t.etaAt || '' },
        fields: [
          { name: 'trackingNote', label: 'Komunikat', full: true, maxlength: 300, placeholder: 'np. Ekipa wyjechała z bazy, będziemy za ok. 40 minut' },
          { name: 'etaAt', label: 'Przewidywany przyjazd', type: 'datetime-local', full: true }
        ],
        async onSubmit(v) { const r = await RM.api('/api/tasks/' + RM.id(t), { method: 'PUT', body: { trackingNote: v.trackingNote, etaAt: v.etaAt || null } }); RM.upsertTask(r.task); RM.toast('Klient zobaczy komunikat w panelu'); RM.refreshDrawer(); }
      });
    });
  };

  /* ================================================================== */
  /* REVOUTLET                                                            */
  /* ================================================================== */
  views.outlet = {
    title: 'RevOutlet',
    admin: true,
    async render(el) {
      if (!el.querySelector('.v9-outlet')) el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v9/outlet');
      const s = d.summary;
      const tab = ui.outletTab;
      const items = d.items;
      el.innerHTML = `<div class="v9-outlet">
        <div class="page-head"><div><h1>Rev<b style="color:var(--accent)">Outlet</b></h1><p>Sklep z rzeczami z opróżniania — publikujesz tutaj, klienci rezerwują na <a href="/outlet.html" target="_blank" rel="noopener">outlet.html</a>.</p></div>
          <div class="page-actions"><button class="btn" id="roSort"><i class="fa-solid fa-dumpster"></i> Z Sortowni</button><button class="btn primary" id="roNew"><i class="fa-solid fa-plus"></i> Dodaj przedmiot</button></div></div>
        <div class="kpis">${kpi('W sprzedaży', s.available, `${s.drafts} szkiców`)}${kpi('Zarezerwowane', s.reserved, `${s.newOrders} nowych rezerwacji`, 'orange')}${kpi('Wartość oferty', esc(RM.money(s.stockValue)), 'dostępne przedmioty', 'blue')}${kpi('Sprzedaż', esc(RM.money(s.soldValue)), `${s.soldCount} sprzedanych`, 'purple')}</div>
        <div style="margin-bottom:14px">${seg([['items', 'Przedmioty', items.length], ['orders', 'Rezerwacje', d.orders.filter(o => o.status === 'new').length]], tab, 'rotab')}</div>
        ${tab === 'items' ? `<div class="grid grid-auto">${items.map(i => `<article class="card res-card">
            <div style="aspect-ratio:4/3;border-radius:12px;overflow:hidden;background:var(--surface-2);display:grid;place-items:center">${i.photoCount ? `<img loading="lazy" src="/api/v9/outlet/${esc(i._id)}/photos/0" alt="" style="width:100%;height:100%;object-fit:cover">` : '<i class="fa-solid fa-couch" style="font-size:32px;color:var(--muted-2)"></i>'}</div>
            <div class="res-top"><div style="min-width:0"><h3>${esc(i.title)}</h3><p>${esc(i.number || '')} · ${esc(i.category)} · ${esc(i.condition)}</p></div><span style="margin-left:auto">${RM.tag(ITEM_ST[i.status])}</span></div>
            <div class="res-stats"><div><small>Cena</small><strong>${esc(RM.money(i.price))}</strong></div><div><small>Ilość</small><strong>${i.quantity}</strong></div><div><small>Wyświetlenia</small><strong>${i.views || 0}</strong></div></div>
            <div class="res-actions"><button class="btn sm" data-roedit="${esc(i._id)}"><i class="fa-solid fa-pen"></i> Edytuj</button><button class="btn sm" data-rophoto="${esc(i._id)}"><i class="fa-solid fa-camera"></i> Zdjęcia (${i.photoCount || 0})</button>${i.status === 'draft' ? `<button class="btn sm primary" data-ropub="${esc(i._id)}"><i class="fa-solid fa-upload"></i> Publikuj</button>` : ''}</div>
          </article>`).join('') || empty('fa-couch', 'Brak przedmiotów', 'Dodaj rzecz z opróżniania albo przenieś pozycję z Sortowni — ze zdjęciami.')}</div>`
        : `<div class="card table-wrap"><table class="table"><thead><tr><th>Rezerwacja</th><th>Przedmiot</th><th>Klient</th><th>Odbiór</th><th>Kwota</th><th>Status</th><th></th></tr></thead><tbody>
            ${d.orders.map(o => `<tr><td><b>${esc(o.number)}</b><div class="muted small">${esc(when(o.createdAt))}</div></td><td>${esc(o.itemTitle)}</td><td>${esc(o.name)}<div class="small">${tel(o.phone)}${o.email ? ' · ' + esc(o.email) : ''}</div>${o.account ? '<span class="badge plain tone-blue">konto</span>' : ''}</td>
              <td>${o.delivery === 'delivery' ? 'Dowóz: ' + esc(o.address) : 'Odbiór osobisty'}${o.note ? `<div class="muted small">${esc(o.note)}</div>` : ''}</td><td class="nowrap">${esc(RM.money(o.price + (o.deliveryPrice || 0)))}</td><td>${RM.tag(ORDER_ST[o.status])}</td>
              <td class="nowrap">${o.status === 'new' ? `<button class="btn sm primary" data-ordst="confirmed" data-id="${esc(o._id)}" data-delivery="${esc(o.delivery)}">Potwierdź</button> ` : ''}${['new', 'confirmed'].includes(o.status) ? `<button class="btn sm" data-ordst="completed" data-id="${esc(o._id)}">Sprzedane</button> <button class="btn sm" data-ordst="cancelled" data-id="${esc(o._id)}">Anuluj</button>` : ''}${o.task ? ` <a class="btn sm" href="#/zlecenia/${esc(o.task)}">Zlecenie</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Brak rezerwacji.</td></tr>'}
          </tbody></table></div>`}</div>`;
      const rerender = () => views.outlet.render(el);
      $$('[data-rotab]', el).forEach(b => b.addEventListener('click', () => { ui.outletTab = b.dataset.rotab; rerender(); }));
      $('#roNew', el).addEventListener('click', () => itemForm(null, d, rerender));
      $('#roSort', el).addEventListener('click', () => fromSorting(rerender));
      $$('[data-roedit]', el).forEach(b => b.addEventListener('click', () => itemForm(items.find(i => i._id === b.dataset.roedit), d, rerender)));
      $$('[data-rophoto]', el).forEach(b => b.addEventListener('click', () => itemPhotos(items.find(i => i._id === b.dataset.rophoto), rerender)));
      $$('[data-ropub]', el).forEach(b => b.addEventListener('click', async () => {
        const it = items.find(i => i._id === b.dataset.ropub);
        if (!(it.price > 0) && !await RM.confirm('Cena wynosi 0 zł. Opublikować mimo to?', { ok: 'Publikuj', danger: false })) return;
        try { await RM.api('/api/v9/outlet/' + it._id, { method: 'PUT', body: { status: 'available' } }); RM.toast('Opublikowano w RevOutlet'); rerender(); } catch (e) { RM.fail(e); }
      }));
      $$('[data-ordst]', el).forEach(b => b.addEventListener('click', async () => {
        const status = b.dataset.ordst;
        let body = { status };
        if (status === 'confirmed' && b.dataset.delivery === 'delivery') {
          const v = prompt('Termin dowozu (RRRR-MM-DD GG:MM) — utworzymy zlecenie transportu:', new Date(Date.now() + 86400000).toISOString().slice(0, 10) + ' 10:00');
          if (v === null) return;
          body.dateStart = new Date(v.replace(' ', 'T')).toISOString();
        }
        if (status === 'cancelled' && !await RM.confirm('Anulować rezerwację? Przedmiot wróci do sprzedaży.')) return;
        try { await RM.api('/api/v9/outlet-orders/' + b.dataset.id, { method: 'PUT', body }); RM.toast('Zapisano'); RM.loadV9Counts(); rerender(); } catch (e) { RM.fail(e); }
      }));
    }
  };

  function itemForm(i, d, done) {
    RM.form({
      title: i ? 'Edytuj przedmiot' : 'Nowy przedmiot', subtitle: i ? i.number : 'RevOutlet',
      values: { status: 'draft', condition: 'Dobry', category: 'Meble', deliveryAvailable: true, quantity: 1, location: 'Słupsk', ...(i || {}) },
      fields: [
        { name: 'title', label: 'Nazwa', required: true, full: true, placeholder: 'np. Komoda dębowa 4 szuflady' },
        { name: 'category', label: 'Kategoria', type: 'select', options: d.categories },
        { name: 'condition', label: 'Stan', type: 'select', options: d.conditions },
        { name: 'price', label: 'Cena (zł)', type: 'number', min: 0, step: '1', required: true },
        { name: 'oldPrice', label: 'Cena przed obniżką (opcjonalnie)', type: 'number', min: 0, step: '1' },
        { name: 'quantity', label: 'Ilość sztuk', type: 'number', min: 1, step: '1' },
        { name: 'dimensions', label: 'Wymiary', placeholder: 'np. 120×45×80 cm' },
        { name: 'location', label: 'Miejsce odbioru' },
        { name: 'deliveryPrice', label: 'Cena dowozu (zł)', type: 'number', min: 0, step: '1', hint: 'Puste = wycena przy rezerwacji' },
        { name: 'deliveryAvailable', label: 'Możliwy dowóz z wniesieniem', type: 'switch' },
        { name: 'featured', label: 'Wyróżnij na górze listy', type: 'switch' },
        { name: 'status', label: 'Status', type: 'select', options: Object.entries(ITEM_ST).map(([k, [l]]) => [k, l]) },
        { name: 'description', label: 'Opis', type: 'textarea', full: true, placeholder: 'Stan, wady, materiał, co w zestawie…' }
      ],
      danger: i ? { label: 'Usuń', confirm: 'Usunąć przedmiot? (Jeśli ma rezerwacje — trafi do archiwum.)', action: async () => { await RM.api('/api/v9/outlet/' + i._id, { method: 'DELETE' }); RM.toast('Usunięto'); done(); } } : null,
      async onSubmit(v) {
        if (v.oldPrice === null) delete v.oldPrice;
        if (v.deliveryPrice === null) v.deliveryPrice = null;
        const r = await RM.api(i ? '/api/v9/outlet/' + i._id : '/api/v9/outlet', { method: i ? 'PUT' : 'POST', body: v });
        RM.toast(i ? 'Zapisano' : 'Dodano — teraz dodaj zdjęcia');
        if (!i) { done(); setTimeout(() => itemPhotos(r.item, done), 200); } else done();
      }
    });
  }

  function itemPhotos(i, done) {
    const html = `<div class="photos" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px">${Array.from({ length: i.photoCount || 0 }, (_, n) => `<div style="position:relative"><img src="/api/v9/outlet/${esc(i._id)}/photos/${n}?t=${Date.now()}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px"><button type="button" class="icon-btn" data-delph="${n}" style="position:absolute;top:4px;right:4px;width:28px;height:28px" aria-label="Usuń"><i class="fa-solid fa-xmark"></i></button></div>`).join('') || '<p class="muted small">Brak zdjęć — pierwsze będzie okładką w sklepie.</p>'}</div>`;
    const form = RM.form({
      title: 'Zdjęcia: ' + i.title, subtitle: 'Max 12 · pierwsze to okładka',
      fields: [{ type: 'html', full: true, html: html + '<button type="button" class="btn" data-addph style="margin-top:12px"><i class="fa-solid fa-camera"></i> Dodaj zdjęcia</button>' }],
      submitLabel: 'Gotowe',
      async onSubmit() { done(); }
    });
    $('[data-addph]', form).addEventListener('click', async e => {
      const photos = await RM.pickPhotos(12 - (i.photoCount || 0));
      if (!photos.length) return;
      e.target.disabled = true;
      try { const r = await RM.api(`/api/v9/outlet/${i._id}/photos`, { method: 'POST', body: { photos } }); i.photoCount = r.photoCount; RM.toast('Dodano zdjęcia'); itemPhotos(i, done); } catch (err) { RM.fail(err); e.target.disabled = false; }
    });
    $$('[data-delph]', form).forEach(b => b.addEventListener('click', async () => {
      try { const r = await RM.api(`/api/v9/outlet/${i._id}/photos/${b.dataset.delph}`, { method: 'DELETE' }); i.photoCount = r.photoCount; itemPhotos(i, done); } catch (err) { RM.fail(err); }
    }));
  }

  async function fromSorting(done) {
    const { entries } = await RM.api('/api/sorting?limit=150');
    const list = entries.filter(e => e.kind === 'in');
    RM.form({
      title: 'Na sprzedaż z Sortowni', subtitle: 'Utworzymy szkic przedmiotu ze zdjęciami z sortowni',
      fields: [{ name: 'entry', label: 'Pozycja sortowni', type: 'select', full: true, required: true, options: [['', '— wybierz —'], ...list.map(e => [e._id, `${day(e.createdAt)} · ${e.item || e.binName}${e.taskNumber ? ' · ' + e.taskNumber : ''}${e.photoCount ? ' · 📷 ' + e.photoCount : ''}`])] }],
      submitLabel: 'Utwórz szkic',
      async onSubmit(v) {
        const r = await RM.api('/api/v9/outlet/from-sorting/' + v.entry, { method: 'POST' });
        RM.toast(r.existed ? 'Ten przedmiot już jest w RevOutlet' : 'Szkic utworzony — ustaw cenę i opublikuj');
        ui.outletTab = 'items';
        done();
      }
    });
  }

  /* ================================================================== */
  /* REVPOWRÓT                                                            */
  /* ================================================================== */
  views.powrot = {
    title: 'RevPowrót',
    admin: true,
    async render(el) {
      if (!el.querySelector('.v9-trips')) el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v9/trips');
      el.innerHTML = `<div class="v9-trips">
        <div class="page-head"><div><h1>Rev<b style="color:var(--accent)">Powrót</b></h1><p>Puste kursy powrotne — sprzedajesz wolne m³, klienci rezerwują na <a href="/powrot.html" target="_blank" rel="noopener">powrot.html</a>.</p></div>
          <div class="page-actions"><button class="btn primary" id="trNew"><i class="fa-solid fa-plus"></i> Nowy kurs</button></div></div>
        <div class="kpis">${kpi('Otwarte kursy', d.summary.open)}${kpi('Nowe rezerwacje', d.summary.newBookings, 'do potwierdzenia', 'orange')}${kpi('Przychód (zrealizowane)', esc(RM.money(d.summary.revenue)), '', 'purple')}${kpi('Wolne m³', esc(String(Math.round(d.trips.filter(t => t.status === 'open').reduce((s, t) => s + t.remainingM3, 0) * 10) / 10).replace('.', ',')), 'w otwartych kursach', 'blue')}</div>
        <div style="display:grid;gap:14px">${d.trips.map(t => `<article class="card" style="padding:18px">
          <div class="res-top"><span class="row-icon"><i class="fa-solid fa-route"></i></span><div style="min-width:0"><h3>${esc(t.from)} → ${esc(t.to)}</h3><p>${esc(t.number || '')} · ${esc(when(t.date))}${t.dateFlexDays ? ` (±${t.dateFlexDays} dni)` : ''}${t.vehicle ? ' · ' + esc(t.vehicle) : ''}${t.published ? '' : ' · <b>ukryty</b>'}</p></div><span style="margin-left:auto">${RM.tag(TRIP_STATUS(t))}</span></div>
          <div class="res-stats"><div><small>Miejsce</small><strong>${esc(String(t.remainingM3).replace('.', ','))} / ${esc(String(t.capacityM3).replace('.', ','))} m³</strong></div><div><small>Cena</small><strong>${t.pricePerM3 ? esc(RM.money(t.pricePerM3)) + '/m³' : '—'}${t.minPrice ? ` · min ${esc(RM.money(t.minPrice))}` : ''}</strong></div><div><small>Przychód</small><strong>${esc(RM.money(t.revenue))}</strong></div></div>
          ${t.bookings.length ? `<div class="table-wrap" style="margin-top:10px"><table class="table"><thead><tr><th>Rezerwacja</th><th>Klient</th><th>Trasa</th><th>m³</th><th>Cena</th><th>Status</th><th></th></tr></thead><tbody>${t.bookings.map(b => `<tr>
              <td><b>${esc(b.number)}</b><div class="muted small">${esc(when(b.createdAt))}</div></td><td>${esc(b.name)}<div class="small">${tel(b.phone)}</div></td><td class="small">${esc(b.pickupAddress)} → ${esc(b.dropAddress)}<div class="muted">${esc(b.items)}${b.floorInfo ? ' · ' + esc(b.floorInfo) : ''}</div></td>
              <td>${esc(String(b.volumeM3).replace('.', ','))}</td><td class="nowrap">${esc(RM.money(b.price))}</td><td>${RM.tag(ORDER_ST[b.status])}</td>
              <td class="nowrap">${b.status === 'new' ? `<button class="btn sm primary" data-bk="confirmed" data-id="${esc(b._id)}">Potwierdź</button> ` : ''}${b.status === 'confirmed' ? `<button class="btn sm" data-bk="completed" data-id="${esc(b._id)}">Zrealizowana</button> ` : ''}${['new', 'confirmed'].includes(b.status) ? `<button class="btn sm" data-bkprice="${esc(b._id)}" data-price="${b.price}">Cena</button> <button class="btn sm" data-bk="cancelled" data-id="${esc(b._id)}">Anuluj</button>` : ''}${b.task ? ` <a class="btn sm" href="#/zlecenia/${esc(b.task)}">Zlecenie</a>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small" style="margin:10px 0 0">Brak rezerwacji.</p>'}
          <div class="res-actions" style="margin-top:12px"><button class="btn sm" data-tredit="${esc(t._id)}"><i class="fa-solid fa-pen"></i> Edytuj kurs</button></div>
        </article>`).join('') || empty('fa-route', 'Brak kursów', 'Wracasz z trasy pustym busem? Dodaj kurs — klienci zarezerwują wolne miejsce.')}</div></div>`;
      const rerender = () => views.powrot.render(el);
      $('#trNew', el).addEventListener('click', () => tripForm(null, rerender));
      $$('[data-tredit]', el).forEach(b => b.addEventListener('click', () => tripForm(d.trips.find(t => t._id === b.dataset.tredit), rerender)));
      $$('[data-bk]', el).forEach(b => b.addEventListener('click', async () => {
        if (b.dataset.bk === 'cancelled' && !await RM.confirm('Anulować rezerwację? Miejsce wróci do kursu.')) return;
        try { await RM.api('/api/v9/bookings/' + b.dataset.id, { method: 'PUT', body: { status: b.dataset.bk } }); RM.toast(b.dataset.bk === 'confirmed' ? 'Potwierdzono — utworzono zlecenie w kalendarzu' : 'Zapisano'); RM.loadV9Counts(); await RM.reload(); rerender(); } catch (e) { RM.fail(e); }
      }));
      $$('[data-bkprice]', el).forEach(b => b.addEventListener('click', async () => {
        const v = prompt('Cena rezerwacji (zł):', b.dataset.price);
        if (v === null) return;
        try { await RM.api('/api/v9/bookings/' + b.dataset.bkprice, { method: 'PUT', body: { price: Number(String(v).replace(',', '.')) } }); rerender(); } catch (e) { RM.fail(e); }
      }));
    }
  };
  const TRIP_STATUS = t => TRIP_ST[t.status] || ['—', ''];

  function tripForm(t, done) {
    RM.form({
      title: t ? 'Edytuj kurs' : 'Nowy kurs powrotny', subtitle: t ? t.number : 'RevPowrót',
      values: { status: 'open', published: true, dateFlexDays: 0, ...(t || {}), branch: t?.branch ? String(t.branch) : '' },
      fields: [
        { name: 'from', label: 'Skąd', required: true },
        { name: 'to', label: 'Dokąd', required: true },
        { name: 'date', label: 'Data i godzina wyjazdu', type: 'datetime-local', required: true },
        { name: 'dateFlexDays', label: 'Elastyczność (± dni)', type: 'number', min: 0, max: 14 },
        { name: 'via', label: 'Przez (miasta po drodze)', full: true },
        { name: 'capacityM3', label: 'Wolne miejsce w busie (m³)', type: 'number', min: 0.5, step: '0.5', required: true },
        { name: 'maxWeightKg', label: 'Maks. waga (kg)', type: 'number', min: 0 },
        { name: 'pricePerM3', label: 'Cena za m³ (zł)', type: 'number', min: 0 },
        { name: 'minPrice', label: 'Cena minimalna (zł)', type: 'number', min: 0 },
        { name: 'discountPct', label: 'Rabat vs zwykły transport (%)', type: 'number', min: 0, max: 90, hint: 'Pokazywany klientom jako zachęta' },
        { name: 'vehicle', label: 'Pojazd' },
        { name: 'branch', label: 'Oddział', type: 'select', options: [['', '— ekipa główna —'], ...(S.branches || []).map(b => [b._id, b.name])] },
        { name: 'status', label: 'Status', type: 'select', options: Object.entries(TRIP_ST).map(([k, [l]]) => [k, l]) },
        { name: 'published', label: 'Widoczny na stronie', type: 'switch' },
        { name: 'notes', label: 'Uwagi dla klientów', type: 'textarea', full: true }
      ],
      danger: t ? { label: 'Usuń', confirm: 'Usunąć kurs?', action: async () => { await RM.api('/api/v9/trips/' + t._id, { method: 'DELETE' }); RM.toast('Usunięto'); done(); } } : null,
      async onSubmit(v) {
        if (!v.branch) v.branch = '';
        await RM.api(t ? '/api/v9/trips/' + t._id : '/api/v9/trips', { method: t ? 'PUT' : 'POST', body: v });
        RM.toast(t ? 'Zapisano' : 'Kurs opublikowany');
        done();
      }
    });
  }

  /* ================================================================== */
  /* ABONAMENTY 9.0 — plany i subskrypcje                                 */
  /* ================================================================== */
  views.subskrypcje = {
    title: 'Abonamenty',
    admin: true,
    async render(el) {
      if (!el.querySelector('.v9-subs')) el.innerHTML = '<div class="skeleton"></div>';
      const [{ plans }, sd] = await Promise.all([RM.api('/api/v9/plans'), RM.api('/api/v9/subscriptions')]);
      const tab = ui.subTab;
      el.innerHTML = `<div class="v9-subs">
        <div class="page-head"><div><h1>Abonamenty (panel klienta)</h1><p>Plany na <a href="/abonamenty.html" target="_blank" rel="noopener">abonamenty.html</a> i zgłoszenia klientów. Aktywacja tworzy umowę w „Abonamentach” (rozliczenia, MRR).</p></div>
          <div class="page-actions"><button class="btn primary" id="plNew"><i class="fa-solid fa-plus"></i> Nowy plan</button></div></div>
        <div class="kpis">${kpi('Aktywne', sd.summary.active)}${kpi('Do aktywacji', sd.summary.pending, 'zadzwoń do klienta', 'orange')}${kpi('Przychód / mies.', esc(RM.money(sd.summary.mrr)), 'sezon ÷ 5, rok ÷ 12', 'purple')}${kpi('Plany na stronie', plans.filter(p => p.active).length, `${plans.filter(p => !p.active).length} ukrytych`, 'blue')}</div>
        <div style="margin-bottom:14px">${seg([['subs', 'Subskrypcje', sd.subscriptions.length], ['plans', 'Plany', plans.length]], tab, 'subtab')}</div>
        ${tab === 'plans' ? `${plans.some(p => !p.active && !p.price) ? '<div class="card" style="padding:14px;margin-bottom:14px;border-color:var(--orange)"><i class="fa-solid fa-circle-info" style="color:var(--orange)"></i> Przygotowałem plany startowe bez cen (ukryte). Ustaw cenę i włącz „Widoczny na stronie”, żeby pojawiły się klientom.</div>' : ''}
          <div class="grid grid-auto">${plans.map(p => `<article class="card res-card">
            <div class="res-top"><div style="min-width:0"><h3>${esc(p.name)}</h3><p>${esc(RM.divName(p.division) || 'Bez działu')} · ${esc(p.tagline || '')}</p></div><span style="margin-left:auto">${p.active ? RM.tag(['Na stronie', 'green']) : RM.tag(['Ukryty', 'muted'])}</span></div>
            <div class="res-stats"><div><small>Cena</small><strong>${esc(RM.money(p.price))} / ${esc(PERIOD[p.billingPeriod])}</strong></div><div><small>Wizyty</small><strong>${p.visitsPerPeriod || '—'}</strong></div><div><small>Klienci</small><strong>${p.subscribers}</strong></div></div>
            <p class="muted small" style="margin:0">${(p.features || []).map(esc).join(' · ')}</p>
            <div class="res-actions"><button class="btn sm" data-pledit="${esc(p._id)}"><i class="fa-solid fa-pen"></i> Edytuj</button></div></article>`).join('')}</div>`
        : `<div class="card table-wrap"><table class="table"><thead><tr><th>Abonament</th><th>Klient</th><th>Adres</th><th>Cena</th><th>Wizyty</th><th>Status</th><th></th></tr></thead><tbody>
            ${sd.subscriptions.map(s => { const next = (s.visits || []).filter(v => v.status === 'planned').sort((a, b) => new Date(a.date) - new Date(b.date))[0]; return `<tr>
              <td><b>${esc(s.planName)}</b><div class="muted small">${esc(s.number)} · ${esc(day(s.createdAt))}</div></td>
              <td>${s.account ? `${esc(s.account.company || s.account.name)}<div class="small">${tel(s.account.phone)} · ${esc(s.account.email)}</div>` : '—'}</td>
              <td class="small">${esc(s.address)}${s.area ? `<div class="muted">${esc(s.area)}</div>` : ''}${s.note ? `<div class="muted">${esc(s.note)}</div>` : ''}</td>
              <td class="nowrap">${esc(RM.money(s.price))} / ${esc(PERIOD[s.billingPeriod])}</td>
              <td class="small">${(s.visits || []).filter(v => v.status === 'done').length} wyk.${next ? `<div>następna ${esc(when(next.date))}</div>` : ''}</td>
              <td>${RM.tag(SUB_ST[s.status])}${s.pauseRequestedAt && s.status === 'active' ? '<div><span class="badge plain tone-orange">prosi o wstrzymanie</span></div>' : ''}${s.cancelReason && s.status !== 'cancelled' ? '<div><span class="badge plain tone-red">prosi o rezygnację</span></div>' : ''}</td>
              <td class="nowrap"><button class="btn sm" data-subedit="${esc(s._id)}"><i class="fa-solid fa-sliders"></i></button> ${s.status === 'active' ? `<button class="btn sm" data-visit="${esc(s._id)}"><i class="fa-solid fa-calendar-plus"></i> Wizyta</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Brak zgłoszeń. Klienci zamawiają abonamenty w panelu /konto.</td></tr>'}
          </tbody></table></div>`}</div>`;
      const rerender = () => views.subskrypcje.render(el);
      $$('[data-subtab]', el).forEach(b => b.addEventListener('click', () => { ui.subTab = b.dataset.subtab; rerender(); }));
      $('#plNew', el).addEventListener('click', () => planForm(null, rerender));
      $$('[data-pledit]', el).forEach(b => b.addEventListener('click', () => planForm(plans.find(p => p._id === b.dataset.pledit), rerender)));
      $$('[data-subedit]', el).forEach(b => b.addEventListener('click', () => subForm(sd.subscriptions.find(s => s._id === b.dataset.subedit), rerender)));
      $$('[data-visit]', el).forEach(b => b.addEventListener('click', () => visitForm(sd.subscriptions.find(s => s._id === b.dataset.visit), rerender)));
    }
  };

  function planForm(p, done) {
    RM.form({
      title: p ? 'Edytuj plan' : 'Nowy plan', subtitle: 'Widoczny na abonamenty.html i w panelu klienta',
      values: { billingPeriod: 'month', audience: 'all', active: false, ...(p || {}), features: (p?.features || []).join('\n') },
      fields: [
        { name: 'name', label: 'Nazwa', required: true },
        { name: 'slug', label: 'Identyfikator (np. winter-care-dom)', required: true, pattern: '[a-z0-9-]{2,60}' },
        { name: 'division', label: 'Dział', type: 'select', options: RM.divOptions() },
        { name: 'tagline', label: 'Krótki opis' },
        { name: 'price', label: 'Cena (zł)', type: 'number', min: 0, step: '1', required: true },
        { name: 'billingPeriod', label: 'Za okres', type: 'select', options: [['month', 'Miesiąc'], ['season', 'Sezon'], ['year', 'Rok']] },
        { name: 'visitsPerPeriod', label: 'Wizyty w okresie', type: 'number', min: 0 },
        { name: 'season', label: 'Sezon (np. listopad – marzec)' },
        { name: 'audience', label: 'Dla kogo', type: 'select', options: [['all', 'Wszyscy'], ['person', 'Osoby prywatne'], ['company', 'Firmy']] },
        { name: 'order', label: 'Kolejność', type: 'number', min: 0 },
        { name: 'features', label: 'Co zawiera (jedna rzecz w linii)', type: 'textarea', full: true },
        { name: 'description', label: 'Opis', type: 'textarea', full: true },
        { name: 'highlight', label: 'Wyróżniony („Najczęściej wybierany”)', type: 'switch' },
        { name: 'active', label: 'Widoczny na stronie', type: 'switch', hint: 'Wymaga ceny większej od zera' }
      ],
      danger: p ? { label: 'Usuń', confirm: 'Usunąć plan? (Jeśli ma klientów — zostanie ukryty.)', action: async () => { await RM.api('/api/v9/plans/' + p._id, { method: 'DELETE' }); RM.toast('Gotowe'); done(); } } : null,
      async onSubmit(v) { await RM.api(p ? '/api/v9/plans/' + p._id : '/api/v9/plans', { method: p ? 'PUT' : 'POST', body: v }); RM.toast('Zapisano plan'); done(); }
    });
  }

  function subForm(s, done) {
    RM.form({
      title: s.planName, subtitle: `${s.number} · ${s.account?.company || s.account?.name || ''}`,
      values: { status: s.status, price: s.price, startDate: s.startDate || new Date().toISOString(), adminNotes: s.adminNotes || '', clearPauseRequest: false },
      fields: [
        { type: 'html', full: true, html: `<p class="muted small" style="margin:0">${esc(s.address)}${s.area ? ' · ' + esc(s.area) : ''}${s.note ? '<br>' + esc(s.note) : ''}${s.cancelReason ? `<br><b style="color:var(--orange)">Rezygnacja: ${esc(s.cancelReason)}</b>` : ''}</p>` },
        { name: 'status', label: 'Status', type: 'select', options: Object.entries(SUB_ST).map(([k, [l]]) => [k, l]), hint: 'Aktywacja tworzy umowę w zakładce „Abonamenty” i wysyła klientowi e-mail.' },
        { name: 'price', label: `Cena (zł / ${PERIOD[s.billingPeriod]})`, type: 'number', min: 0, step: '1' },
        { name: 'startDate', label: 'Start', type: 'date' },
        ...(s.pauseRequestedAt ? [{ name: 'clearPauseRequest', label: 'Odrzuć prośbę o wstrzymanie', type: 'switch' }] : []),
        { name: 'adminNotes', label: 'Notatki', type: 'textarea', full: true }
      ],
      async onSubmit(v) { await RM.api('/api/v9/subscriptions/' + s._id, { method: 'PUT', body: v }); RM.toast('Zapisano'); RM.loadV9Counts(); done(); }
    });
  }

  function visitForm(s, done) {
    RM.form({
      title: 'Zaplanuj wizytę', subtitle: `${s.planName} · ${s.address}`,
      values: { date: new Date(Date.now() + 86400000).toISOString(), createTask: true },
      fields: [
        { name: 'date', label: 'Termin', type: 'datetime-local', required: true, full: true },
        { name: 'note', label: 'Notatka (widoczna dla klienta)', full: true },
        { name: 'createTask', label: 'Utwórz zlecenie w kalendarzu', type: 'switch' }
      ],
      async onSubmit(v) { await RM.api(`/api/v9/subscriptions/${s._id}/visits`, { method: 'POST', body: v }); RM.toast('Wizyta zaplanowana'); await RM.reload(); done(); }
    });
  }

  /* ================================================================== */
  /* PARTNERZY — biura nieruchomości                                      */
  /* ================================================================== */
  views.partnerzy = {
    title: 'Partnerzy',
    admin: true,
    async render(el) {
      if (!el.querySelector('.v9-ref')) el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v9/referrals');
      el.innerHTML = `<div class="v9-ref">
        <div class="page-head"><div><h1>Partnerzy — biura nieruchomości</h1><p>Polecenia klientów z portalu partnera. Dostęp nadajesz w „Konta klientów”. Zgłoszenia nowych biur trafiają do „Wiadomości”.</p></div>
          <div class="page-actions"><a class="btn" href="/partnerzy.html" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Strona programu</a></div></div>
        <div class="kpis">${kpi('Nowe polecenia', d.summary.new, 'zadzwoń do klienta', 'orange')}${kpi('Zrealizowane', d.summary.completed)}${kpi('Prowizje do wypłaty', esc(RM.money(d.summary.toPay)), '', 'purple')}${kpi('Wypłacone', esc(RM.money(d.summary.paid)), '', 'blue')}</div>
        <div class="card table-wrap"><table class="table"><thead><tr><th>Polecenie</th><th>Biuro</th><th>Klient</th><th>Usługi</th><th>Status</th><th>Prowizja</th><th></th></tr></thead><tbody>
          ${d.referrals.map(r => `<tr><td><b>${esc(r.number)}</b><div class="muted small">${esc(day(r.createdAt))}</div></td><td>${esc(r.agencyName)}<div class="muted small">${esc(r.agentName)}</div></td>
            <td>${esc(r.clientName)}<div class="small">${tel(r.clientPhone)}</div><div class="muted small">${esc(r.propertyAddress)}</div></td><td class="small">${esc((r.services || []).join(', '))}</td>
            <td>${RM.tag(REF_ST[r.status])}</td><td class="nowrap">${r.commissionAmount ? esc(RM.money(r.commissionAmount)) : '—'}<div>${RM.tag(COM_ST[r.commissionStatus])}</div></td>
            <td class="nowrap"><button class="btn sm" data-refedit="${esc(r._id)}"><i class="fa-solid fa-sliders"></i></button>${r.task ? ` <a class="btn sm" href="#/zlecenia/${esc(r.task)}">Zlecenie</a>` : ''}</td></tr>`).join('') || `<tr><td colspan="7">${empty('fa-handshake', 'Brak poleceń', 'Nadaj biuru dostęp „partner” w Kontach klientów — polecenia pojawią się tutaj i w Wycenach.')}</td></tr>`}
        </tbody></table></div></div>`;
      const rerender = () => views.partnerzy.render(el);
      $$('[data-refedit]', el).forEach(b => b.addEventListener('click', () => {
        const r = d.referrals.find(x => x._id === b.dataset.refedit);
        RM.form({
          title: 'Polecenie ' + r.number, subtitle: `${r.agencyName} → ${r.clientName}`,
          values: { status: r.status, statusNote: r.statusNote, orderValue: r.orderValue, commissionPct: r.commissionPct, commissionStatus: r.commissionStatus },
          fields: [
            { type: 'html', full: true, html: `<p class="muted small" style="margin:0">${esc(r.notes || '')}${r.listingUrl ? ` · <a href="${esc(r.listingUrl)}" target="_blank" rel="noopener">ogłoszenie</a>` : ''}</p>` },
            { name: 'status', label: 'Status (widzi partner)', type: 'select', options: Object.entries(REF_ST).map(([k, [l]]) => [k, l]) },
            { name: 'statusNote', label: 'Komentarz dla partnera', full: true, maxlength: 500 },
            { name: 'orderValue', label: 'Wartość zlecenia (zł)', type: 'number', min: 0, hint: 'Puste = kwota ze zlecenia w RevMi' },
            { name: 'commissionPct', label: 'Prowizja (%)', type: 'number', min: 0, max: 50, step: '0.5' },
            { name: 'commissionStatus', label: 'Status prowizji', type: 'select', options: Object.entries(COM_ST).map(([k, [l]]) => [k, l === '—' ? 'Brak' : l]) }
          ],
          async onSubmit(v) { await RM.api('/api/v9/referrals/' + r._id, { method: 'PUT', body: v }); RM.toast('Zapisano — partner widzi zmianę w portalu'); RM.loadV9Counts(); rerender(); }
        });
      }));
    }
  };

  /* ================================================================== */
  /* HOTELE                                                               */
  /* ================================================================== */
  views.hotele = {
    title: 'Hotele',
    admin: true,
    async render(el) {
      if (!el.querySelector('.v9-hotels')) el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v9/hotels');
      el.innerHTML = `<div class="v9-hotels">
        <div class="page-head"><div><h1>Hotele i pensjonaty (B2B)</h1><p>Klienci z dostępem „hotel”. Zaakceptowane stałe trasy tworzą zlecenia automatycznie na 14 dni do przodu.</p></div></div>
        ${d.pending ? `<div class="card" style="padding:14px;margin-bottom:14px;border-color:var(--orange)"><i class="fa-solid fa-hourglass-half" style="color:var(--orange)"></i> ${d.pending} ${d.pending === 1 ? 'trasa czeka' : 'tras czeka'} na akceptację — ustaw cenę za kurs i zaakceptuj.</div>` : ''}
        <div style="display:grid;gap:14px">${d.hotels.map(h => `<article class="card" style="padding:18px">
          <div class="res-top"><span class="row-icon blue"><i class="fa-solid fa-hotel"></i></span><div style="min-width:0"><h3>${esc(h.hotel?.companyName || h.company || h.name)}</h3><p>${esc(h.name)} · ${tel(h.phone)} · ${esc(h.email)}</p></div><div style="margin-left:auto;text-align:right"><small class="muted">Ten miesiąc</small><div><b>${h.monthCompleted}</b> zleceń · <b>${esc(RM.money(h.monthValue))}</b></div></div></div>
          <p class="small" style="margin:10px 0">${h.properties.map(p => `<span class="chip"><i class="fa-solid fa-building"></i> ${esc(p.name)} · ${esc(p.address)}</span>`).join(' ') || '<span class="muted">Brak obiektów</span>'}</p>
          ${h.routes.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Trasa</th><th>Obiekt</th><th>Dni</th><th>Cena / kurs</th><th>Status</th><th></th></tr></thead><tbody>${h.routes.map(r => `<tr>
            <td><b>${esc(r.service)}</b><div class="muted small">${esc(r.description || '')}</div></td><td>${esc(h.properties.find(p => p._id === String(r.property))?.name || '—')}</td>
            <td class="nowrap">${r.weekdays.map(w => WD[w - 1]).join(', ')} · ${esc(r.time)}</td><td>${r.pricePerRun != null ? esc(RM.money(r.pricePerRun)) : '—'}</td>
            <td>${!r.approved ? RM.tag(['Do akceptacji', 'orange']) : r.active ? RM.tag(['Aktywna', 'green']) : RM.tag(['Wstrzymana', 'muted'])}</td>
            <td><button class="btn sm ${r.approved ? '' : 'primary'}" data-route="${esc(r._id)}">${r.approved ? 'Ustawienia' : 'Akceptuj'}</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small" style="margin:0">Brak stałych tras.</p>'}
        </article>`).join('') || empty('fa-hotel', 'Brak klientów hotelowych', 'Nadaj dostęp „Hotel / pensjonat” w zakładce Konta klientów — klient zobaczy w panelu obiekty, stałe trasy i zestawienia.')}</div></div>`;
      const routes = d.hotels.flatMap(h => h.routes);
      $$('[data-route]', el).forEach(b => b.addEventListener('click', () => {
        const r = routes.find(x => x._id === b.dataset.route);
        RM.form({
          title: r.approved ? 'Ustawienia trasy' : 'Akceptacja stałej trasy', subtitle: `${r.service} · ${r.weekdays.map(w => WD[w - 1]).join(', ')} ${r.time}`,
          values: { approved: true, active: r.active, pricePerRun: r.pricePerRun, branch: r.branch ? String(r.branch) : '' },
          fields: [
            { name: 'pricePerRun', label: 'Cena za jeden kurs (zł)', type: 'number', min: 0, required: true },
            { name: 'branch', label: 'Oddział', type: 'select', options: [['', '— ekipa główna —'], ...(S.branches || []).map(b => [b._id, b.name])] },
            { name: 'approved', label: 'Zaakceptowana (tworzy zlecenia)', type: 'switch' },
            { name: 'active', label: 'Aktywna', type: 'switch' }
          ],
          submitLabel: r.approved ? 'Zapisz' : 'Akceptuj',
          async onSubmit(v) { await RM.api('/api/v9/hotel-routes/' + r._id, { method: 'PUT', body: v }); RM.toast(v.approved ? 'Zaakceptowano — zlecenia pojawią się w kalendarzu' : 'Zapisano'); RM.loadV9Counts(); setTimeout(() => RM.reload(), 1500); views.hotele.render(el); }
        });
      }));
    }
  };

  /* ================================================================== */
  /* REKRUTACJA                                                           */
  /* ================================================================== */
  views.rekrutacja = {
    title: 'Rekrutacja',
    admin: true,
    async render(el) {
      if (!el.querySelector('.v9-jobs')) el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v9/applications' + (ui.appTrack ? '?track=' + ui.appTrack : ''));
      const count = t => d.counts.filter(c => !t || c._id.track === t).reduce((s, c) => s + c.n, 0);
      el.innerHTML = `<div class="v9-jobs">
        <div class="page-head"><div><h1>Rekrutacja i franczyza</h1><p>Zgłoszenia z <a href="/kariera.html" target="_blank" rel="noopener">kariera.html</a> — działy usługowe, marketing i zapytania o franczyzę.</p></div></div>
        <div style="margin-bottom:14px">${seg([['', 'Wszystkie', count('')], ['dzial', 'Działy', count('dzial')], ['marketing', 'Marketing', count('marketing')], ['franczyza', 'Franczyza', count('franczyza')]], ui.appTrack, 'track')}</div>
        <div class="grid grid-auto">${d.applications.map(a => `<article class="card res-card">
          <div class="res-top"><span class="row-icon ${a.track === 'franczyza' ? 'purple' : a.track === 'marketing' ? 'blue' : ''}"><i class="fa-solid ${a.track === 'franczyza' ? 'fa-city' : a.track === 'marketing' ? 'fa-bullhorn' : 'fa-people-carry-box'}"></i></span><div style="min-width:0"><h3>${esc(a.name)}</h3><p>${esc(a.number)} · ${esc(TRACK[a.track])} · ${esc(day(a.createdAt))}</p></div><span style="margin-left:auto">${RM.tag(APP_ST[a.status])}</span></div>
          <p style="margin:0"><b>${esc(a.track === 'dzial' ? a.department : a.track === 'marketing' ? a.role : 'Franczyza: ' + (a.franchise?.city || ''))}</b> · ${esc(a.city)}</p>
          <p class="small" style="margin:0">${tel(a.phone)} · <a href="mailto:${esc(a.email)}">${esc(a.email)}</a>${a.link ? ` · <a href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">link</a>` : ''}</p>
          <p class="muted small" style="margin:0">${[a.availability, (a.licenses || []).length ? 'prawo jazdy: ' + a.licenses.join(', ') : '', a.franchise?.budget ? 'budżet: ' + a.franchise.budget : '', a.franchise?.timeline, a.franchise?.hasVehicle ? 'ma busa' : '', a.franchise?.hasCompany ? 'ma firmę' : '', a.franchise?.hasTeam ? 'ma ludzi' : ''].filter(Boolean).map(esc).join(' · ')}</p>
          ${a.experience || a.message || a.franchise?.businessExperience ? `<p class="small" style="margin:0;white-space:pre-line">${esc([a.experience, a.franchise?.businessExperience, a.message].filter(Boolean).join('\n\n').slice(0, 400))}</p>` : ''}
          ${a.rating ? `<p style="margin:0;color:#fbbf24">${'★'.repeat(a.rating)}</p>` : ''}
          <div class="res-actions"><button class="btn sm" data-appedit="${esc(a._id)}"><i class="fa-solid fa-sliders"></i> Oceń / status</button></div>
        </article>`).join('') || empty('fa-id-card', 'Brak zgłoszeń', 'Udostępnij stronę kariera.html w ogłoszeniach i na Facebooku.')}</div></div>`;
      const rerender = () => views.rekrutacja.render(el);
      $$('[data-track]', el).forEach(b => b.addEventListener('click', () => { ui.appTrack = b.dataset.track; rerender(); }));
      $$('[data-appedit]', el).forEach(b => b.addEventListener('click', () => {
        const a = d.applications.find(x => x._id === b.dataset.appedit);
        RM.form({
          title: a.name, subtitle: `${a.number} · ${TRACK[a.track]}`,
          values: { status: a.status, rating: a.rating || 0, internalNotes: a.internalNotes || '' },
          fields: [
            { name: 'status', label: 'Status', type: 'select', options: Object.entries(APP_ST).map(([k, [l]]) => [k, l]) },
            { name: 'rating', label: 'Ocena (0–5)', type: 'number', min: 0, max: 5 },
            { name: 'internalNotes', label: 'Notatki z rozmowy', type: 'textarea', full: true }
          ],
          danger: { label: 'Usuń', confirm: 'Usunąć zgłoszenie (np. na prośbę kandydata — RODO)?', action: async () => { await RM.api('/api/v9/applications/' + a._id, { method: 'DELETE' }); RM.toast('Usunięto'); rerender(); } },
          async onSubmit(v) { await RM.api('/api/v9/applications/' + a._id, { method: 'PUT', body: v }); RM.toast('Zapisano'); RM.loadV9Counts(); rerender(); }
        });
      }));
    }
  };
})();
