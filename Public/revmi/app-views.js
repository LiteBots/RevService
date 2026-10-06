/* RevMi — widoki panelu */
'use strict';

(function () {
  const RM = window.RM;
  const { esc, $, $$ } = RM;
  const S = RM.state;
  const views = (RM.views = {});

  /* ------------------------------------------------------------------ */
  /* Wspólne fragmenty                                                   */
  /* ------------------------------------------------------------------ */

  const empty = (icon, title, text, action = '') =>
    `<div class="empty"><i class="fa-solid ${icon}"></i><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;

  const crew = t => {
    const workers = t.workers || [];
    if (!workers.length) return '';
    return `<span class="stacked" title="${esc(workers.map(w => w.name).join(', '))}">${workers.slice(0, 4).map(w => {
      const e = RM.employee(w.employee);
      return `<span class="avatar" style="${e?.color ? `color:${esc(e.color)}` : ''}">${esc(RM.initials(w.name))}</span>`;
    }).join('')}</span>`;
  };

  RM.taskCard = (t, { showDay = false } = {}) => {
    const d = RM.toDate(t.dateStart);
    const isQuote = t.status === 'new';
    const top = isQuote ? `<strong><i class="fa-solid fa-inbox"></i></strong><small>${esc(RM.ago(t.createdAt))}</small>`
      : `<strong>${RM.valid(d) ? RM.fmt.time.format(d) : '--:--'}</strong><small>${showDay && RM.valid(d) ? esc(RM.fmt.day.format(d)) : (RM.valid(d) ? esc(RM.fmt.wd.format(d)) : '')}</small>`;
    const price = RM.isAdmin() ? RM.taskPrice(t) : '';
    return `<button class="task" data-task="${esc(RM.id(t))}">
      <div class="task-time">${top}</div>
      <div class="task-main">
        <div class="task-title">${t.priority === 'high' ? '<i class="fa-solid fa-bolt prio-high" title="Wysoki priorytet"></i>' : ''}<span>${esc(t.name)}</span></div>
        <div class="task-meta">
          ${RM.taskDivision(t) ? RM.divBadge(RM.taskDivision(t)) : ''}
          ${t.clientName ? `<span><i class="fa-regular fa-user"></i>${esc(t.clientName)}</span>` : ''}
          ${RM.place(t) ? `<span><i class="fa-solid fa-location-dot"></i>${esc(RM.place(t))}</span>` : ''}
          ${isQuote && t.clientPreferredDate ? `<span><i class="fa-regular fa-calendar"></i>${esc(t.clientPreferredDate)}</span>` : ''}
          ${t.quotePhotoCount ? `<span><i class="fa-solid fa-camera"></i>${t.quotePhotoCount}</span>` : ''}
          ${t.car ? `<span><i class="fa-solid fa-truck"></i>${esc(t.car)}</span>` : ''}
        </div>
      </div>
      <div class="task-side">${RM.statusBadge(t.status)}${price ? `<span class="task-price">${esc(price)}</span>` : ''}${crew(t)}</div>
    </button>`;
  };

  const groupByDay = (tasks) => {
    const groups = new Map();
    for (const t of tasks) {
      const d = RM.toDate(t.dateStart);
      const key = RM.valid(d) ? RM.dayKey(d) : 'none';
      if (!groups.has(key)) groups.set(key, { date: d, items: [] });
      groups.get(key).items.push(t);
    }
    return [...groups.values()].map(g => {
      const today = RM.valid(g.date) && RM.sameDay(g.date, new Date());
      const label = RM.valid(g.date) ? `${RM.relDay(g.date)}${['Dziś', 'Jutro', 'Wczoraj'].includes(RM.relDay(g.date)) || RM.relDay(g.date).startsWith('Za') ? ' · ' + RM.fmt.dayLong.format(g.date) : ''}` : 'Bez terminu';
      return `<div class="day-group"><h4 class="day-title ${today ? 'today' : ''}">${esc(label)}</h4><div class="task-list">${g.items.map(t => RM.taskCard(t)).join('')}</div></div>`;
    }).join('');
  };

  const searchMatch = (t, q) => {
    if (!q) return true;
    const hay = [t.name, t.number, t.clientName, t.clientPhone, t.address, t.type, t.desc, t.car, ...(t.workers || []).map(w => w.name)].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).every(part => hay.includes(part));
  };

  const upcoming = (days = 7, filter = () => true) => {
    const now = new Date();
    const to = new Date(RM.startOfDay(now).getTime() + days * 86400000);
    return S.tasks.filter(t => ['planned', 'progress', 'quoted'].includes(t.status) && filter(t))
      .filter(t => { const d = RM.toDate(t.dateStart); return d >= RM.startOfDay(now) && d < to; })
      .sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart));
  };

  const dateFlag = value => {
    const d = RM.toDate(value);
    if (!RM.valid(d)) return '<span class="muted">—</span>';
    const days = Math.round((RM.startOfDay(d) - RM.startOfDay(new Date())) / 86400000);
    const cls = days < 0 ? 'bad' : days <= 30 ? 'warn' : '';
    return `<span class="date-flag ${cls}">${esc(RM.fmt.date.format(d))}</span>`;
  };

  RM.fleetAlerts = () => {
    const alerts = [];
    for (const v of S.fleet) {
      for (const [key, label] of [['insuranceUntil', 'OC/AC'], ['inspectionUntil', 'Przegląd techniczny'], ['nextServiceDate', 'Serwis']]) {
        const d = RM.toDate(v[key]);
        if (!RM.valid(d)) continue;
        const days = Math.round((RM.startOfDay(d) - RM.startOfDay(new Date())) / 86400000);
        if (days <= 30) alerts.push({ v, label, days, d });
      }
    }
    return alerts.sort((a, b) => a.days - b.days);
  };

  /* ------------------------------------------------------------------ */
  /* Pulpit                                                              */
  /* ------------------------------------------------------------------ */
  views.pulpit = {
    title: 'Pulpit',
    async render(el) {
      if (!RM.isAdmin()) return views.moje.render(el);
      const hour = new Date().getHours();
      const hello = hour < 12 ? 'Dzień dobry' : hour < 18 ? 'Cześć' : 'Dobry wieczór';
      const quotes = S.tasks.filter(t => t.status === 'new').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const today = upcoming(1);
      const week = upcoming(8).filter(t => !RM.sameDay(new Date(t.dateStart), new Date()));
      const unpaid = S.tasks.filter(t => t.status === 'completed' && t.paymentStatus !== 'paid');
      const unassigned = upcoming(14).filter(t => !t.workers?.length && t.status !== 'quoted');
      const fleetAlerts = RM.fleetAlerts();
      const d = S.dashboard;
      const st = d?.stats || {};
      const pushState = await RM.push.status();

      el.innerHTML = `
        <div class="page-head"><div><h1>${hello}, ${esc((S.me.name || '').split(' ')[0])}</h1><p>${esc(RM.fmt.dayLong.format(new Date()))} · ${today.length ? `dziś ${today.length} ${today.length === 1 ? 'zlecenie' : 'zlecenia'}` : 'dziś wolne od zleceń'}</p></div>
          <div class="page-actions"><a class="btn" href="#/kalendarz"><i class="fa-regular fa-calendar"></i> Kalendarz</a><button class="btn primary" data-action="new-task"><i class="fa-solid fa-plus"></i> Nowe zlecenie</button></div></div>

        ${pushState !== 'on' ? `<div class="alert accent" style="margin-bottom:16px"><i class="fa-solid fa-bell"></i><div style="flex:1"><strong>Włącz powiadomienia na tym urządzeniu</strong><p>Nowe wyceny, zlecenia i przypomnienia przyjdą jako push z logo RevSerwis.</p></div><a class="btn sm primary" href="#/powiadomienia">Włącz</a></div>` : ''}

        <div class="kpis">
          <a class="card kpi" href="#/wyceny" style="--tone:var(--orange)"><div class="kpi-label">Nowe wyceny <i class="fa-solid fa-inbox"></i></div><div class="kpi-value">${quotes.length}</div><div class="kpi-sub">czeka na odpowiedź</div></a>
          <a class="card kpi" href="#/zlecenia" style="--tone:var(--blue)"><div class="kpi-label">Aktywne zlecenia <i class="fa-solid fa-truck-fast"></i></div><div class="kpi-value">${st.activeTasks ?? '—'}</div><div class="kpi-sub">${unassigned.length ? `${unassigned.length} bez ekipy` : 'wszystkie obsadzone'}</div></a>
          <a class="card kpi" href="#/finanse"><div class="kpi-label">Przychód (miesiąc) <i class="fa-solid fa-wallet"></i></div><div class="kpi-value">${d ? RM.money(st.revenue) : '—'}</div><div class="kpi-sub">koszty ${d ? RM.money(st.expenses) : '—'}</div></a>
          <a class="card kpi" href="#/finanse" style="--tone:var(--purple)"><div class="kpi-label">Zysk (miesiąc) <i class="fa-solid fa-chart-line"></i></div><div class="kpi-value">${d ? RM.money(st.profit) : '—'}</div><div class="kpi-sub">marża ${d ? Math.round(st.margin) + '%' : '—'} · ${st.completedTasks ?? 0} zakończonych</div></a>
        </div>

        ${d?.business ? businessKpis(d.business) : ''}

        <div class="dash">
          <div class="stack">
            <section class="card pad"><div class="card-head"><div><h2>Dziś</h2><p>${esc(RM.fmt.dayLong.format(new Date()))}</p></div><a class="link" href="#/kalendarz">Kalendarz →</a></div>
              <div class="task-list">${today.map(t => RM.taskCard(t)).join('') || empty('fa-mug-hot', 'Brak zleceń na dziś', 'Zaplanuj zlecenie lub sprawdź nowe wyceny.')}</div></section>
            <section class="card pad"><div class="card-head"><div><h2>Najbliższe dni</h2><p>Plan na kolejny tydzień</p></div><a class="link" href="#/zlecenia">Wszystkie →</a></div>
              ${week.length ? groupByDay(week) : empty('fa-calendar', 'Pusto w tym tygodniu', 'Nie ma zaplanowanych zleceń.')}</section>
            ${d?.business ? divisionTable(d.business.divisions) : ''}
            <section class="card pad"><div class="card-head"><div><h2>Wynik — 6 miesięcy</h2><p>Przychody i koszty</p></div><div class="legend"><span style="--c:var(--accent)">Przychód</span><span style="--c:rgba(251,191,36,.7)">Koszty</span></div></div>
              ${d ? chart(d.months) : '<div class="skeleton"></div>'}</section>
          </div>
          <div class="stack">
            <section class="card pad"><div class="card-head"><div><h2>Nowe wyceny</h2><p>Zgłoszenia z formularza</p></div><a class="link" href="#/wyceny">Otwórz →</a></div>
              <div class="rows">${quotes.slice(0, 5).map(t => `<button class="row" data-task="${esc(RM.id(t))}" style="background:none;border-left:0;border-right:0;border-top:0;width:100%;text-align:left"><span class="row-icon orange"><i class="fa-solid fa-inbox"></i></span><span class="row-main"><strong>${esc(t.type || t.name)}</strong><small>${esc(t.clientName || '')} · ${esc(RM.ago(t.createdAt))}${t.quotePhotoCount ? ' · 📷 ' + t.quotePhotoCount : ''}</small></span><i class="fa-solid fa-chevron-right muted"></i></button>`).join('') || '<p class="muted small">Brak nowych wycen.</p>'}</div></section>
            ${d?.business ? businessSide(d.business) : ''}
            ${unassigned.length ? `<div class="alert"><i class="fa-solid fa-user-plus"></i><div><strong>${unassigned.length} ${unassigned.length === 1 ? 'zlecenie' : 'zleceń'} bez przypisanej ekipy</strong><p>${unassigned.slice(0, 3).map(t => esc(t.name)).join(', ')} — przypisz osoby, aby dostały przypomnienia.</p></div></div>` : ''}
            ${unpaid.length ? `<div class="alert red"><i class="fa-solid fa-money-bill-wave"></i><div><strong>${unpaid.length} nieopłaconych zleceń</strong><p>Łącznie ${RM.money(unpaid.reduce((s, t) => s + (t.finalPrice ?? t.price ?? 0), 0))}. Sprawdź w Finansach.</p></div></div>` : ''}
            ${fleetAlerts.length ? `<section class="card pad"><div class="card-head"><h2>Flota — terminy</h2><a class="link" href="#/flota">Flota →</a></div><div class="rows">${fleetAlerts.slice(0, 5).map(a => `<div class="row"><span class="row-icon ${a.days < 0 ? 'red' : 'orange'}"><i class="fa-solid fa-car-burst"></i></span><span class="row-main"><strong>${esc(a.v.name)} · ${esc(a.label)}</strong><small>${a.days < 0 ? 'po terminie ' + Math.abs(a.days) + ' dni' : a.days === 0 ? 'dziś' : 'za ' + a.days + ' dni'} (${esc(RM.fmt.date.format(a.d))})</small></span></div>`).join('')}</div></section>` : ''}
            <section class="card pad"><div class="card-head"><h2>Aktywność</h2></div><div class="timeline">${(d?.recentActivity || []).map(a => `<div class="tl">${esc(a.message)}<small>${esc(a.actorName || '')} · ${esc(RM.ago(a.createdAt))}</small></div>`).join('') || '<p class="muted small" style="padding-left:14px">Brak wpisów.</p>'}</div></section>
          </div>
        </div>`;
    }
  };

  function businessKpis(b) {
    return `<div class="kpis kpis-biz">
      <a class="card kpi" href="#/wiadomosci" style="--tone:var(--orange)"><div class="kpi-label">Wiadomości <i class="fa-solid fa-envelope"></i></div><div class="kpi-value">${b.newMessages}</div><div class="kpi-sub">nowych z formularza kontaktowego</div></a>
      <a class="card kpi" href="#/abonamenty"><div class="kpi-label">Abonamenty (MRR) <i class="fa-solid fa-arrows-rotate"></i></div><div class="kpi-value">${esc(RM.money(b.mrr))}</div><div class="kpi-sub">${b.activeContracts} aktywnych · ${b.contractsDue.length} do rozliczenia</div></a>
      <a class="card kpi" href="#/magazyn" style="--tone:var(--blue)"><div class="kpi-label">Magazyn RevStorage <i class="fa-solid fa-box-archive"></i></div><div class="kpi-value">${b.storageCount}</div><div class="kpi-sub">${esc(String(b.storageVolume).replace('.', ','))} m³ · ${b.storageEnding.length} kończy się</div></a>
      <a class="card kpi" href="#/notatnik" style="--tone:var(--purple)"><div class="kpi-label">Notatnik <i class="fa-solid fa-note-sticky"></i></div><div class="kpi-value">${b.pinnedNotes.length}</div><div class="kpi-sub">przypiętych notatek</div></a>
    </div>`;
  }

  function divisionTable(divisions = []) {
    const rows = divisions.filter(d => d.active || d.completed || d.revenue);
    const max = Math.max(1, ...rows.map(d => d.revenue));
    return `<section class="card pad"><div class="card-head"><div><h2>Działy — ten miesiąc</h2><p>Aktywne zlecenia i przychód z zakończonych</p></div><a class="link" href="#/dzialy">Działy →</a></div>
      ${rows.length ? `<div class="div-rows">${rows.sort((a, b) => b.revenue - a.revenue || b.active - a.active).map(d => `<a class="div-row" href="#/dzialy/${esc(d.slug)}">${RM.divBadge(d.slug)}<span class="div-bar"><i style="width:${(d.revenue / max) * 100}%"></i></span><span class="muted small nowrap">${d.active} akt. · ${d.completed} zak.</span><strong class="nowrap">${esc(RM.money(d.revenue))}</strong></a>`).join('')}</div>` : '<p class="muted small">Brak zleceń z przypisanym działem w tym miesiącu.</p>'}</section>`;
  }

  function businessSide(b) {
    const parts = [];
    if (b.recentMessages.length) parts.push(`<section class="card pad"><div class="card-head"><div><h2>Wiadomości</h2><p>Formularz kontaktowy</p></div><a class="link" href="#/wiadomosci">Skrzynka →</a></div><div class="rows">${b.recentMessages.map(m => `<a class="row ${m.status === 'new' ? 'unread' : ''}" href="#/wiadomosci/${esc(m._id)}"><span class="row-icon orange"><i class="fa-solid fa-envelope"></i></span><span class="row-main"><strong>${esc(m.company ? `${m.company} (${m.name})` : m.name)}</strong><small>${esc(m.topic)} · ${esc(RM.ago(m.createdAt))}</small></span></a>`).join('')}</div></section>`);
    if (b.contractsDue.length) parts.push(`<section class="card pad"><div class="card-head"><div><h2>Do rozliczenia</h2><p>Abonamenty w ciągu 7 dni</p></div><a class="link" href="#/abonamenty">Abonamenty →</a></div><div class="rows">${b.contractsDue.map(c => `<a class="row" href="#/abonamenty"><span class="row-icon"><i class="fa-solid fa-file-invoice-dollar"></i></span><span class="row-main"><strong>${esc(c.title)}</strong><small>${esc(c.clientName || '')} · ${esc(RM.money(c.monthlyPrice))} · ${esc(RM.relDay(c.nextBillingDate))}</small></span></a>`).join('')}</div></section>`);
    if (b.storageEnding.length) parts.push(`<section class="card pad"><div class="card-head"><div><h2>Magazyn — koniec przechowania</h2><p>W ciągu 14 dni</p></div><a class="link" href="#/magazyn">Magazyn →</a></div><div class="rows">${b.storageEnding.map(i => `<a class="row" href="#/magazyn"><span class="row-icon blue"><i class="fa-solid fa-box-archive"></i></span><span class="row-main"><strong>${esc(i.description)}</strong><small>${esc(i.clientName)} · do ${esc(RM.fmt.date.format(new Date(i.endDate)))}</small></span></a>`).join('')}</div></section>`);
    if (b.pinnedNotes.length) parts.push(`<section class="card pad"><div class="card-head"><div><h2>Przypięte notatki</h2></div><a class="link" href="#/notatnik">Notatnik →</a></div><div class="pin-notes">${b.pinnedNotes.map(n => `<a class="pin-note nc-${esc(n.color || 'default')}" href="#/notatnik/${esc(n._id)}"><strong>${esc(n.title || 'Notatka')}</strong><span>${esc(String(n.content || (n.checklist || []).map(i => (i.done ? '✓ ' : '• ') + i.text).join('  ')).slice(0, 140))}</span></a>`).join('')}</div></section>`);
    return parts.join('');
  }

  function chart(months = []) {
    const max = Math.max(1, ...months.map(m => Math.max(m.revenue, m.expenses)));
    return `<div class="bars">${months.map(m => `<div class="bar-col" title="${esc(m.label)}: przychód ${esc(RM.money(m.revenue))}, koszty ${esc(RM.money(m.expenses))}">
      <div class="bar-pair"><i style="height:${(m.revenue / max) * 100}%"></i><i class="exp" style="height:${(m.expenses / max) * 100}%"></i></div><small>${esc(m.label)}</small></div>`).join('')}</div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Mój dzień (pracownik)                                               */
  /* ------------------------------------------------------------------ */
  views.moje = {
    title: 'Mój plan',
    async render(el) {
      const mine = t => RM.isMine(t);
      const today = upcoming(1, mine);
      const next = upcoming(30, mine).filter(t => !RM.sameDay(new Date(t.dateStart), new Date()));
      const free = upcoming(14, t => !t.workers?.length && t.status !== 'quoted');
      const pushState = await RM.push.status();
      el.innerHTML = `
        <div class="page-head"><div><h1>Cześć, ${esc((S.me.name || '').split(' ')[0])}</h1><p>${esc(RM.fmt.dayLong.format(new Date()))}</p></div></div>
        ${pushState !== 'on' ? `<div class="alert accent" style="margin-bottom:16px"><i class="fa-solid fa-bell"></i><div style="flex:1"><strong>Włącz powiadomienia</strong><p>Dostaniesz przypomnienie 3 dni i 24 h przed każdym swoim zleceniem.</p></div><a class="btn sm primary" href="#/powiadomienia">Włącz</a></div>` : ''}
        <section class="card pad" style="margin-bottom:16px"><div class="card-head"><h2>Dziś</h2></div>
          <div class="task-list">${today.map(t => RM.taskCard(t)).join('') || empty('fa-mug-hot', 'Dziś bez zleceń', 'Sprawdź kalendarz na kolejne dni.')}</div></section>
        <section class="card pad" style="margin-bottom:16px"><div class="card-head"><h2>Moje najbliższe zlecenia</h2><a class="link" href="#/kalendarz">Kalendarz →</a></div>
          ${next.length ? groupByDay(next) : empty('fa-calendar', 'Brak kolejnych zleceń', 'Gdy zostaniesz przypisany, dostaniesz powiadomienie.')}</section>
        ${free.length ? `<section class="card pad"><div class="card-head"><div><h2>Zlecenia bez ekipy</h2><p>Najbliższe 2 tygodnie</p></div></div><div class="task-list">${free.map(t => RM.taskCard(t, { showDay: true })).join('')}</div></section>` : ''}`;
    }
  };

  /* ------------------------------------------------------------------ */
  /* Zlecenia                                                            */
  /* ------------------------------------------------------------------ */
  const FILTERS = [
    ['active', 'Aktywne', t => ['quoted', 'planned', 'progress'].includes(t.status)],
    ['today', 'Dziś', t => RM.sameDay(new Date(t.dateStart), new Date()) && t.status !== 'cancelled' && t.status !== 'new'],
    ['planned', 'Zaplanowane', t => t.status === 'planned'],
    ['progress', 'W realizacji', t => t.status === 'progress'],
    ['quoted', 'Wycenione', t => t.status === 'quoted'],
    ['completed', 'Zakończone', t => t.status === 'completed'],
    ['cancelled', 'Anulowane', t => t.status === 'cancelled'],
    ['all', 'Wszystkie', t => t.status !== 'new']
  ];

  views.zlecenia = {
    title: 'Zlecenia',
    render(el) {
      const ui = S.ui;
      const q = ui.search;
      const base = S.tasks.filter(t => searchMatch(t, q)).filter(t => !ui.ordersMine || RM.isMine(t)).filter(t => !ui.ordersDivision || RM.taskDivision(t) === ui.ordersDivision);
      const counts = Object.fromEntries(FILTERS.map(([k, , fn]) => [k, base.filter(fn).length]));
      const fn = (FILTERS.find(f => f[0] === ui.ordersFilter) || FILTERS[0])[2];
      let list = base.filter(fn);
      const past = ['completed', 'cancelled', 'all'].includes(ui.ordersFilter);
      list.sort((a, b) => ui.ordersSort === 'price'
        ? (b.finalPrice ?? b.price ?? 0) - (a.finalPrice ?? a.price ?? 0)
        : (past ? -1 : 1) * (new Date(a.dateStart) - new Date(b.dateStart)));

      const board = ui.ordersView === 'board' && window.matchMedia('(min-width: 901px)').matches;
      el.innerHTML = `
        <div class="page-head"><div><h1>Zlecenia</h1><p>${q ? `Wyniki dla „${esc(q)}”` : ui.ordersDivision ? `Dział ${esc(RM.divName(ui.ordersDivision))}` : 'Plan pracy, statusy i ekipy'}</p></div>
          <div class="page-actions">
            ${RM.isAdmin() ? '<a class="btn desktop-only" href="/api/export/tasks.csv"><i class="fa-solid fa-file-csv"></i> Eksport CSV</a>' : ''}
            <div class="segmented desktop-only"><button data-oview="list" class="${!board ? 'active' : ''}"><i class="fa-solid fa-list"></i> Lista</button><button data-oview="board" class="${board ? 'active' : ''}"><i class="fa-solid fa-table-columns"></i> Tablica</button></div>
            ${RM.isAdmin() ? '<button class="btn primary desktop-only" data-action="new-task"><i class="fa-solid fa-plus"></i> Dodaj</button>' : ''}
          </div></div>
        <div class="toolbar">
          ${board ? '<span class="muted small">Przeciągnij kartę, aby zmienić status.</span>' : `<div class="segmented" id="orderFilters">${FILTERS.map(([k, label]) => `<button data-ofilter="${k}" class="${ui.ordersFilter === k ? 'active' : ''}">${label}<span class="n">${counts[k]}</span></button>`).join('')}</div>`}
          <div class="btn-row" style="align-items:center">
            ${S.me.employeeId ? `<label class="toggle-line"><span class="switch"><input type="checkbox" id="mineToggle" ${ui.ordersMine ? 'checked' : ''}><span></span></span> Tylko moje</label>` : ''}
            <select class="select" id="orderDivision" aria-label="Dział">${RM.divOptions('Wszystkie działy').map(([v, l]) => `<option value="${esc(v)}" ${ui.ordersDivision === v ? 'selected' : ''}>${esc(v ? RM.divName(v) : l)}</option>`).join('')}</select>
            ${!board ? `<select class="select" id="orderSort"><option value="date" ${ui.ordersSort === 'date' ? 'selected' : ''}>Wg terminu</option>${RM.isAdmin() ? `<option value="price" ${ui.ordersSort === 'price' ? 'selected' : ''}>Wg wartości</option>` : ''}</select>` : ''}
          </div>
        </div>
        <div id="ordersBody">${board ? kanban(base) : (list.length ? (ui.ordersSort === 'price' ? `<div class="task-list">${list.map(t => RM.taskCard(t, { showDay: true })).join('')}</div>` : groupByDay(list)) : empty('fa-clipboard-list', 'Brak zleceń', q ? 'Zmień wyszukiwaną frazę.' : 'W tej kategorii nic nie ma.', RM.isAdmin() ? '<button class="btn primary" data-action="new-task"><i class="fa-solid fa-plus"></i> Nowe zlecenie</button>' : ''))}</div>`;

      $$('[data-ofilter]', el).forEach(b => b.addEventListener('click', () => { ui.ordersFilter = b.dataset.ofilter; views.zlecenia.render(el); }));
      $$('[data-oview]', el).forEach(b => b.addEventListener('click', () => { ui.ordersView = b.dataset.oview; RM.remember('rm.ordersView', ui.ordersView); views.zlecenia.render(el); }));
      $('#orderSort', el)?.addEventListener('change', e => { ui.ordersSort = e.target.value; views.zlecenia.render(el); });
      $('#orderDivision', el)?.addEventListener('change', e => { ui.ordersDivision = e.target.value; views.zlecenia.render(el); });
      $('#mineToggle', el)?.addEventListener('change', e => { ui.ordersMine = e.target.checked; RM.remember('rm.ordersMine', e.target.checked ? '1' : '0'); views.zlecenia.render(el); });
      if (board) bindKanban(el);
    }
  };

  function kanban(tasks) {
    const cols = ['quoted', 'planned', 'progress', 'completed', 'cancelled'];
    const limitDone = t => t.status !== 'completed' || (Date.now() - new Date(t.completedAt || t.dateStart)) < 1000 * 60 * 60 * 24 * 30;
    return `<div class="board">${cols.map(s => {
      const items = tasks.filter(t => t.status === s && limitDone(t)).sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart));
      return `<div class="col" data-col="${s}"><div class="col-head">${RM.statusBadge(s)}<span class="muted">${items.length}</span></div><div class="col-body">${items.map(t => `
        <div class="kcard" draggable="${RM.canWork(t)}" data-task="${esc(RM.id(t))}" data-drag="${esc(RM.id(t))}">
          <h4>${esc(t.name)}</h4>
          <p><i class="fa-regular fa-clock"></i> ${esc(RM.formatWhen(t.dateStart))}</p>
          ${RM.place(t) ? `<p><i class="fa-solid fa-location-dot"></i> ${esc(RM.place(t))}</p>` : ''}
          <div class="kcard-foot">${crew(t) || '<span class="muted small">bez ekipy</span>'}${RM.isAdmin() && RM.taskPrice(t) ? `<strong class="small">${esc(RM.taskPrice(t))}</strong>` : ''}</div>
        </div>`).join('') || '<p class="muted small" style="padding:8px">—</p>'}</div></div>`;
    }).join('')}</div>`;
  }

  function bindKanban(el) {
    let dragId = null;
    $$('[data-drag]', el).forEach(card => {
      card.addEventListener('dragstart', e => { dragId = card.dataset.drag; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
    $$('[data-col]', el).forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drop'); });
      col.addEventListener('dragleave', () => col.classList.remove('drop'));
      col.addEventListener('drop', async e => {
        e.preventDefault();
        col.classList.remove('drop');
        const t = RM.task(dragId);
        if (!t || t.status === col.dataset.col) return;
        try { await RM.setStatus(t, col.dataset.col); views.zlecenia.render(el); } catch (err) { RM.fail(err); }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Wyceny                                                              */
  /* ------------------------------------------------------------------ */
  views.wyceny = {
    title: 'Wyceny',
    admin: true,
    render(el) {
      const list = S.tasks.filter(t => t.status === 'new' && searchMatch(t, S.ui.search)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const quoted = S.tasks.filter(t => t.status === 'quoted' && searchMatch(t, S.ui.search)).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      el.innerHTML = `
        <div class="page-head"><div><h1>Wyceny</h1><p>Zgłoszenia z formularza na stronie i wysłane oferty</p></div></div>
        <section style="margin-bottom:22px"><h4 class="day-title">Nowe zgłoszenia · ${list.length}</h4>
          <div class="grid grid-auto">${list.map(quoteCard).join('') || empty('fa-inbox', 'Brak nowych wycen', 'Nowe zgłoszenia pojawią się tutaj i przyjdą jako powiadomienie.')}</div></section>
        <section><h4 class="day-title">Wycenione — czekają na decyzję klienta · ${quoted.length}</h4>
          <div class="task-list">${quoted.map(t => RM.taskCard(t, { showDay: true })).join('') || '<p class="muted small">Brak.</p>'}</div></section>`;
      $$('[data-qaction]', el).forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        const t = RM.task(b.dataset.id);
        if (b.dataset.qaction === 'price') RM.taskForm(t, { status: 'quoted' }, 'Wyceń zgłoszenie');
        if (b.dataset.qaction === 'plan') RM.taskForm(t, { status: 'planned', name: t.name.replace(/^Wycena:\s*/, '') }, 'Zaplanuj zlecenie');
        if (b.dataset.qaction === 'reject') RM.confirm('Oznaczyć zgłoszenie jako anulowane?', { ok: 'Anuluj zgłoszenie' }).then(ok => ok && RM.setStatus(t, 'cancelled').then(() => views.wyceny.render(el)).catch(RM.fail));
      }));
    }
  };

  function quoteCard(t) {
    const details = RM.entries(t.quoteDetails).slice(0, 4);
    return `<article class="card res-card" data-task="${esc(RM.id(t))}" style="cursor:pointer">
      <div class="res-top"><span class="row-icon orange"><i class="fa-solid fa-inbox"></i></span><div style="min-width:0"><h3>${esc(t.type || t.name)}</h3><p>${esc(RM.ago(t.createdAt))} · ${esc(t.number)}</p></div></div>
      <div class="task-meta" style="display:grid;gap:4px">
        ${t.clientName ? `<span><i class="fa-regular fa-user"></i>${esc(t.clientName)}</span>` : ''}
        ${t.clientPhone ? `<span><i class="fa-solid fa-phone"></i>${esc(t.clientPhone)}</span>` : ''}
        ${RM.place(t) ? `<span><i class="fa-solid fa-location-dot"></i>${esc(RM.place(t))}</span>` : ''}
        ${t.clientPreferredDate ? `<span><i class="fa-regular fa-calendar"></i>${esc(t.clientPreferredDate)}</span>` : ''}
        ${details.map(([k, v]) => `<span><i class="fa-solid fa-angle-right"></i>${esc(k)}: ${esc(v)}</span>`).join('')}
        ${t.quotePhotoCount ? `<span><i class="fa-solid fa-camera"></i>${t.quotePhotoCount} zdjęć</span>` : ''}
      </div>
      <div class="res-actions" style="flex-wrap:wrap">
        ${t.clientPhone ? `<a class="btn sm" href="${esc(RM.telUrl(t.clientPhone))}"><i class="fa-solid fa-phone"></i> Zadzwoń</a>` : ''}
        <button class="btn sm" data-qaction="price" data-id="${esc(RM.id(t))}"><i class="fa-solid fa-tag"></i> Wyceń</button>
        <button class="btn sm primary" data-qaction="plan" data-id="${esc(RM.id(t))}"><i class="fa-solid fa-calendar-plus"></i> Zaplanuj</button>
        <button class="btn sm ghost danger" data-qaction="reject" data-id="${esc(RM.id(t))}" title="Odrzuć"><i class="fa-solid fa-xmark"></i></button>
      </div></article>`;
  }

  /* ------------------------------------------------------------------ */
  /* Kalendarz                                                           */
  /* ------------------------------------------------------------------ */
  views.kalendarz = {
    title: 'Kalendarz',
    render(el) {
      const ui = S.ui;
      const cursor = new Date(ui.calCursor.getFullYear(), ui.calCursor.getMonth(), 1);
      const first = new Date(cursor);
      first.setDate(1 - ((cursor.getDay() + 6) % 7));
      const mineOnly = !RM.isAdmin() && ui.ordersMine;
      const tasks = S.tasks.filter(t => !['new', 'cancelled'].includes(t.status)).filter(t => !mineOnly || RM.isMine(t));
      const byDay = new Map();
      for (const t of tasks) {
        const d = RM.toDate(t.dateStart);
        if (!RM.valid(d)) continue;
        const k = RM.dayKey(d);
        if (!byDay.has(k)) byDay.set(k, []);
        byDay.get(k).push(t);
      }
      for (const list of byDay.values()) list.sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart));
      const selected = ui.calSelected || RM.dayKey(new Date());
      const days = [];
      for (let i = 0; i < 42; i++) {
        const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
        if (i >= 35 && d.getMonth() !== cursor.getMonth()) break;
        const k = RM.dayKey(d);
        const items = byDay.get(k) || [];
        days.push(`<div class="cal-day ${d.getMonth() !== cursor.getMonth() ? 'out' : ''} ${RM.sameDay(d, new Date()) ? 'today' : ''} ${k === selected ? 'sel' : ''}" data-day="${k}">
          <span class="cal-num">${d.getDate()}</span>
          ${items.slice(0, 3).map(t => `<span class="ev st-${t.status}" data-task="${esc(RM.id(t))}">${esc(RM.fmt.time.format(new Date(t.dateStart)))} ${esc(t.name)}</span>`).join('')}
          ${items.length > 3 ? `<div class="cal-more">+${items.length - 3} więcej</div>` : ''}
          <div class="cal-dots">${items.slice(0, 4).map(t => `<i class="st-${t.status}" style="background:currentColor"></i>`).join('')}</div>
        </div>`);
      }
      const [y, m, dd] = selected.split('-').map(Number);
      const selDate = new Date(y, m - 1, dd);
      const selItems = byDay.get(selected) || [];
      el.innerHTML = `
        <div class="page-head"><div><h1>Kalendarz</h1><p>Terminy zleceń i obsada ekipy</p></div>
          <div class="page-actions">${S.me.employeeId && !RM.isAdmin() ? `<label class="toggle-line"><span class="switch"><input type="checkbox" id="calMine" ${ui.ordersMine ? 'checked' : ''}><span></span></span> Tylko moje</label>` : ''}</div></div>
        <div class="cal-layout">
          <section class="card pad">
            <div class="cal-top"><h2>${esc(RM.fmt.month.format(cursor))}</h2>
              <div class="btn-row"><button class="icon-btn" data-cal="-1" aria-label="Poprzedni"><i class="fa-solid fa-chevron-left"></i></button><button class="btn sm" data-cal="0">Dziś</button><button class="icon-btn" data-cal="1" aria-label="Następny"><i class="fa-solid fa-chevron-right"></i></button></div></div>
            <div class="cal-grid">${['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'].map(w => `<div class="cal-wd">${w}</div>`).join('')}${days.join('')}</div>
          </section>
          <section class="card pad"><div class="card-head"><div><h2>${esc(RM.relDay(selDate))}</h2><p>${esc(RM.fmt.dayLong.format(selDate))}</p></div>
            ${RM.isAdmin() ? `<button class="btn sm primary" data-newon="${selected}"><i class="fa-solid fa-plus"></i> Dodaj</button>` : ''}</div>
            <div class="task-list">${selItems.map(t => RM.taskCard(t)).join('') || '<p class="muted small">Brak zleceń tego dnia.</p>'}</div></section>
        </div>`;
      $$('[data-cal]', el).forEach(b => b.addEventListener('click', () => {
        const step = Number(b.dataset.cal);
        ui.calCursor = step === 0 ? new Date() : new Date(cursor.getFullYear(), cursor.getMonth() + step, 1);
        if (step === 0) ui.calSelected = RM.dayKey(new Date());
        views.kalendarz.render(el);
      }));
      $$('[data-day]', el).forEach(d => d.addEventListener('click', e => {
        if (e.target.closest('[data-task]') && window.matchMedia('(min-width: 901px)').matches) return;
        e.stopPropagation();
        ui.calSelected = d.dataset.day;
        views.kalendarz.render(el);
      }));
      $('[data-newon]', el)?.addEventListener('click', b => {
        const [yy, mm, d2] = b.currentTarget.dataset.newon.split('-').map(Number);
        RM.taskForm(null, { dateStart: new Date(yy, mm - 1, d2, 8, 0).toISOString() });
      });
      $('#calMine', el)?.addEventListener('change', e => { ui.ordersMine = e.target.checked; RM.remember('rm.ordersMine', e.target.checked ? '1' : '0'); views.kalendarz.render(el); });
    }
  };

  /* ------------------------------------------------------------------ */
  /* Klienci                                                             */
  /* ------------------------------------------------------------------ */
  views.klienci = {
    title: 'Klienci',
    admin: true,
    async render(el) {
      el.innerHTML = '<div class="skeleton"></div>';
      const { clients } = await RM.api('/api/clients');
      S.clients = clients;
      const q = S.ui.search.toLowerCase();
      const list = clients.filter(c => !q || [c.name, c.company, c.phone, c.email, c.address].join(' ').toLowerCase().includes(q));
      el.innerHTML = `
        <div class="page-head"><div><h1>Klienci</h1><p>${clients.length} kontaktów w CRM</p></div>
          <div class="page-actions"><button class="btn primary" id="addClient"><i class="fa-solid fa-user-plus"></i> Nowy klient</button></div></div>
        <div class="grid grid-auto">${list.map(c => `
          <article class="card res-card">
            <div class="res-top"><span class="avatar">${esc(RM.initials(c.name))}</span><div style="min-width:0"><h3>${esc(c.name)}</h3><p>${c.type === 'company' ? 'Firma' : 'Osoba prywatna'}${c.company ? ' · ' + esc(c.company) : ''}</p></div></div>
            <div class="task-meta" style="display:grid;gap:4px">${c.phone ? `<a href="${esc(RM.telUrl(c.phone))}"><i class="fa-solid fa-phone"></i>${esc(c.phone)}</a>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}"><i class="fa-regular fa-envelope"></i>${esc(c.email)}</a>` : ''}${c.address ? `<span><i class="fa-solid fa-location-dot"></i>${esc(c.address)}</span>` : ''}</div>
            <div class="res-stats"><div><small>Zlecenia</small><strong>${c.stats.orders}</strong></div><div><small>Wartość</small><strong>${esc(RM.money(c.stats.value))}</strong></div><div><small>Ostatnio</small><strong>${c.stats.lastOrderAt ? esc(RM.fmt.date.format(new Date(c.stats.lastOrderAt))) : '—'}</strong></div></div>
            <div class="res-actions"><button class="btn sm" data-cview="${esc(c._id)}"><i class="fa-solid fa-clock-rotate-left"></i> Historia</button><button class="btn sm" data-cedit="${esc(c._id)}"><i class="fa-solid fa-pen"></i> Edytuj</button><button class="btn sm primary" data-cnew="${esc(c._id)}"><i class="fa-solid fa-plus"></i> Zlecenie</button></div>
          </article>`).join('') || empty('fa-address-book', 'Brak klientów', 'Dodaj klienta lub utwórz go ze zlecenia.')}</div>`;
      $('#addClient', el).addEventListener('click', () => clientForm(null, () => views.klienci.render(el)));
      $$('[data-cedit]', el).forEach(b => b.addEventListener('click', () => clientForm(clients.find(c => c._id === b.dataset.cedit), () => views.klienci.render(el))));
      $$('[data-cnew]', el).forEach(b => b.addEventListener('click', () => {
        const c = clients.find(x => x._id === b.dataset.cnew);
        RM.taskForm(null, { client: c._id, clientName: c.name, clientPhone: c.phone, clientEmail: c.email, address: c.address });
      }));
      $$('[data-cview]', el).forEach(b => b.addEventListener('click', () => clientHistory(b.dataset.cview)));
    }
  };

  function clientForm(c, done) {
    RM.form({
      title: c ? 'Edytuj klienta' : 'Nowy klient',
      values: c || { type: 'person' },
      fields: [
        { name: 'name', label: 'Imię i nazwisko / nazwa', required: true },
        { name: 'type', label: 'Typ', type: 'select', options: [['person', 'Osoba prywatna'], ['company', 'Firma (B2B)']] },
        { name: 'phone', label: 'Telefon', type: 'tel', inputmode: 'tel' },
        { name: 'email', label: 'E-mail', type: 'email' },
        { name: 'company', label: 'Firma' },
        { name: 'nip', label: 'NIP' },
        { name: 'address', label: 'Adres', full: true },
        { name: 'source', label: 'Skąd klient', type: 'datalist', options: ['Formularz WWW', 'Telefon', 'Polecenie', 'Facebook', 'Google', 'Stały klient', 'Inne'] },
        { name: 'notes', label: 'Notatki', type: 'textarea', full: true }
      ],
      danger: c ? { label: 'Archiwizuj', confirm: 'Przenieść klienta do archiwum?', action: async () => { await RM.api('/api/clients/' + c._id, { method: 'DELETE' }); RM.toast('Klient zarchiwizowany'); done(); } } : null,
      async onSubmit(data) {
        await RM.api(c ? '/api/clients/' + c._id : '/api/clients', { method: c ? 'PUT' : 'POST', body: data });
        RM.toast(c ? 'Zapisano klienta' : 'Dodano klienta');
        done();
      }
    });
  }

  async function clientHistory(id) {
    try {
      const { client, tasks } = await RM.api('/api/clients/' + id);
      RM.form({
        title: client.name,
        subtitle: 'Historia zleceń klienta',
        fields: [{ type: 'html', full: true, html: `<div class="task-list">${tasks.map(t => RM.taskCard(t, { showDay: true })).join('') || '<p class="muted">Brak zleceń.</p>'}</div>` }],
        submitLabel: 'Zamknij',
        onSubmit: () => true
      });
    } catch (e) { RM.fail(e); }
  }

  /* ------------------------------------------------------------------ */
  /* Finanse                                                             */
  /* ------------------------------------------------------------------ */
  views.finanse = {
    title: 'Finanse',
    admin: true,
    async render(el) {
      const ui = S.ui;
      const from = new Date(ui.financeMonth.getFullYear(), ui.financeMonth.getMonth(), 1);
      const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
      el.innerHTML = '<div class="skeleton"></div>';
      const data = await RM.api(`/api/finances?from=${from.toISOString()}&to=${to.toISOString()}`);
      const taskIncome = data.completedTasks.reduce((s, t) => s + (t.finalPrice ?? t.price ?? 0), 0);
      const extra = data.incomes.reduce((s, i) => s + i.price, 0);
      const costs = data.expenses.reduce((s, e) => s + e.price, 0);
      const revenue = taskIncome + extra;
      const profit = revenue - costs;
      const cats = {};
      data.expenses.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.price; });
      const catList = Object.entries(cats).sort((a, b) => b[1] - a[1]);
      const maxCat = Math.max(1, ...catList.map(c => c[1]));
      const ops = [
        ...data.incomes.map(i => ({ ...i, kind: 'income' })),
        ...data.expenses.map(e => ({ ...e, kind: 'expense' }))
      ].sort((a, b) => new Date(b.date) - new Date(a.date));

      el.innerHTML = `
        <div class="page-head"><div><h1>Finanse</h1><p>Przychody ze zleceń, dodatkowe wpływy i koszty</p></div>
          <div class="page-actions"><div class="btn-row"><button class="icon-btn" data-fm="-1"><i class="fa-solid fa-chevron-left"></i></button><button class="btn" data-fm="0" style="text-transform:capitalize">${esc(RM.fmt.month.format(from))}</button><button class="icon-btn" data-fm="1"><i class="fa-solid fa-chevron-right"></i></button></div>
            <button class="btn primary" data-addop="expense"><i class="fa-solid fa-minus"></i> Koszt</button><button class="btn" data-addop="income"><i class="fa-solid fa-plus"></i> Przychód</button></div></div>
        <div class="kpis">
          <div class="card kpi"><div class="kpi-label">Przychód <i class="fa-solid fa-arrow-trend-up"></i></div><div class="kpi-value">${RM.money(revenue)}</div><div class="kpi-sub">zlecenia ${RM.money(taskIncome)} · inne ${RM.money(extra)}</div></div>
          <div class="card kpi" style="--tone:var(--orange)"><div class="kpi-label">Koszty <i class="fa-solid fa-gas-pump"></i></div><div class="kpi-value">${RM.money(costs)}</div><div class="kpi-sub">${data.expenses.length} wpisów</div></div>
          <div class="card kpi" style="--tone:var(--purple)"><div class="kpi-label">Wynik <i class="fa-solid fa-scale-balanced"></i></div><div class="kpi-value" style="color:${profit < 0 ? 'var(--red)' : 'inherit'}">${RM.money(profit)}</div><div class="kpi-sub">marża ${revenue ? Math.round(profit / revenue * 100) : 0}%</div></div>
          <div class="card kpi" style="--tone:var(--blue)"><div class="kpi-label">Zakończone zlecenia <i class="fa-solid fa-circle-check"></i></div><div class="kpi-value">${data.completedTasks.length}</div><div class="kpi-sub">${data.completedTasks.filter(t => t.paymentStatus !== 'paid').length} nieopłaconych</div></div>
        </div>
        <div class="grid grid-2">
          <section class="card pad"><div class="card-head"><h2>Operacje</h2></div><div class="rows">${ops.map(o => `
            <div class="row"><span class="row-icon ${o.kind === 'expense' ? 'red' : ''}"><i class="fa-solid ${o.kind === 'expense' ? 'fa-arrow-down' : 'fa-arrow-up'}"></i></span>
              <span class="row-main"><strong>${esc(o.category)}</strong><small>${esc(RM.fmt.date.format(new Date(o.date)))}${o.desc ? ' · ' + esc(o.desc) : ''}</small></span>
              <span class="${o.kind === 'expense' ? 'amount-minus' : 'amount-plus'} nowrap">${o.kind === 'expense' ? '−' : '+'}${esc(RM.money(o.price))}</span>
              <button class="icon-btn ghost" data-delop="${o.kind}:${esc(o._id)}" title="Usuń"><i class="fa-regular fa-trash-can"></i></button></div>`).join('') || '<p class="muted small">Brak operacji w tym miesiącu.</p>'}</div></section>
          <div class="stack">
            <section class="card pad"><div class="card-head"><h2>Struktura kosztów</h2></div>${catList.map(([k, v]) => `<div class="hbar"><span>${esc(k)}</span><div><i style="width:${v / maxCat * 100}%;--c:var(--orange)"></i></div><strong>${esc(RM.money(v))}</strong></div>`).join('') || '<p class="muted small">Brak kosztów.</p>'}</section>
            <section class="card pad"><div class="card-head"><h2>Zlecenia zakończone</h2></div><div class="rows">${data.completedTasks.map(t => `
              <div class="row"><span class="row-main"><strong>${esc(t.name)}</strong><small>${esc(t.number)} · ${esc(RM.fmt.date.format(new Date(t.completedAt)))}${t.clientName ? ' · ' + esc(t.clientName) : ''}</small></span>
                <span class="nowrap"><strong>${esc(RM.money(t.finalPrice ?? t.price))}</strong></span>
                ${t.paymentStatus === 'paid' ? RM.payBadge('paid') : `<button class="btn sm" data-paid="${esc(t._id)}">Opłacone</button>`}</div>`).join('') || '<p class="muted small">Brak.</p>'}</div></section>
          </div>
        </div>`;

      $$('[data-fm]', el).forEach(b => b.addEventListener('click', () => {
        const s = Number(b.dataset.fm);
        ui.financeMonth = s === 0 ? new Date() : new Date(from.getFullYear(), from.getMonth() + s, 1);
        views.finanse.render(el);
      }));
      $$('[data-addop]', el).forEach(b => b.addEventListener('click', () => financeForm(b.dataset.addop, () => views.finanse.render(el))));
      $$('[data-delop]', el).forEach(b => b.addEventListener('click', async () => {
        const [kind, id] = b.dataset.delop.split(':');
        if (!await RM.confirm('Usunąć tę operację?', { ok: 'Usuń' })) return;
        try { await RM.api(`/api/${kind === 'expense' ? 'expenses' : 'incomes'}/${id}`, { method: 'DELETE' }); RM.toast('Usunięto'); views.finanse.render(el); } catch (e) { RM.fail(e); }
      }));
      $$('[data-paid]', el).forEach(b => b.addEventListener('click', async () => {
        try { const { task } = await RM.api('/api/tasks/' + b.dataset.paid, { method: 'PUT', body: { paymentStatus: 'paid' } }); RM.upsertTask(task); RM.toast('Oznaczono jako opłacone'); views.finanse.render(el); } catch (e) { RM.fail(e); }
      }));
    }
  };

  function financeForm(kind, done) {
    const expense = kind === 'expense';
    RM.form({
      title: expense ? 'Nowy koszt' : 'Nowy przychód',
      values: { date: new Date().toISOString() },
      fields: [
        { name: 'price', label: 'Kwota (zł)', type: 'number', min: 0, step: '0.01', required: true, inputmode: 'decimal' },
        { name: 'date', label: 'Data', type: 'date', required: true },
        { name: 'category', label: 'Kategoria', type: 'datalist', required: true, full: true, options: expense ? ['Paliwo', 'Serwis pojazdu', 'Ubezpieczenie', 'Wynagrodzenia', 'Materiały', 'Utylizacja / PSZOK', 'Opłaty drogowe', 'Marketing', 'Sprzęt', 'Inne'] : ['Zlecenie', 'Zaliczka', 'Dopłata', 'Inne'] },
        { name: 'desc', label: 'Opis', full: true },
        expense ? { name: 'receiptNumber', label: 'Nr paragonu / faktury' } : { name: 'paymentMethod', label: 'Forma płatności', type: 'select', options: ['', 'Gotówka', 'Przelew', 'BLIK', 'Karta'] },
        expense ? { name: 'vehicle', label: 'Pojazd (opcjonalnie)', type: 'select', options: [['', '—'], ...S.fleet.map(v => [v._id, `${v.name} (${v.plates})`])] } : null
      ].filter(Boolean),
      async onSubmit(data) {
        if (data.date) data.date = new Date(data.date + 'T12:00:00').toISOString();
        await RM.api('/api/finances', { method: 'POST', body: { ...data, kind: expense ? 'expense' : 'income' } });
        RM.toast('Zapisano operację');
        done?.();
      }
    });
  }
  RM.financeForm = financeForm;

  /* ------------------------------------------------------------------ */
  /* Zespół                                                              */
  /* ------------------------------------------------------------------ */
  views.zespol = {
    title: 'Zespół',
    admin: true,
    async render(el) {
      el.innerHTML = '<div class="skeleton"></div>';
      const { employees, adminDevices } = await RM.api('/api/employees');
      const load = id => upcoming(14, t => RM.assignedIds(t).includes(String(id))).length;
      el.innerHTML = `
        <div class="page-head"><div><h1>Zespół</h1><p>Pracownicy, dostęp do panelu (PIN) i urządzenia z powiadomieniami</p></div>
          <div class="page-actions"><button class="btn" id="broadcast"><i class="fa-solid fa-bullhorn"></i> Powiadom zespół</button><button class="btn primary" id="addEmp"><i class="fa-solid fa-user-plus"></i> Dodaj pracownika</button></div></div>
        <div class="alert accent" style="margin-bottom:16px"><i class="fa-solid fa-mobile-screen"></i><div><strong>Jak pracownik dostaje powiadomienia?</strong><p>Otwiera na telefonie <b>${esc(location.origin)}/revmi</b>, loguje się swoim PIN-em, dodaje aplikację do ekranu głównego i włącza powiadomienia. Twoje urządzenia (główny PIN): ${adminDevices}.</p></div></div>
        <div class="grid grid-auto">${employees.map(e => `
          <article class="card res-card">
            <div class="res-top"><span class="avatar" style="color:${esc(e.color || 'var(--accent)')}">${esc(RM.initials(e.name))}</span><div style="min-width:0"><h3>${esc(e.name)}</h3><p>${esc(e.role)}${e.systemRole === 'admin' ? ' · <b style="color:var(--accent)">Administrator</b>' : ''}</p></div></div>
            <div class="chips"><span class="badge plain">${esc(RM.EMP_STATUS[e.status] || e.status)}</span><span class="badge plain" title="Urządzenia z włączonymi powiadomieniami"><i class="fa-solid fa-bell"></i> ${e.pushDevices}</span></div>
            <div class="res-stats"><div><small>Telefon</small><strong>${e.phone ? `<a href="${esc(RM.telUrl(e.phone))}">${esc(e.phone)}</a>` : '—'}</strong></div><div><small>Zlecenia 14 dni</small><strong>${load(e._id)}</strong></div><div><small>Stawka</small><strong>${e.hourlyRate ? esc(RM.money(e.hourlyRate)) + '/h' : '—'}</strong></div></div>
            <div class="res-actions"><button class="btn sm" data-eedit="${esc(e._id)}"><i class="fa-solid fa-pen"></i> Edytuj</button></div>
          </article>`).join('') || empty('fa-users', 'Brak pracowników', 'Dodaj pierwszą osobę i nadaj jej PIN do logowania.')}</div>`;
      const done = () => { RM.reload().then(() => views.zespol.render(el)); };
      $('#addEmp', el).addEventListener('click', () => employeeForm(null, done));
      $$('[data-eedit]', el).forEach(b => b.addEventListener('click', () => employeeForm(employees.find(x => x._id === b.dataset.eedit), done)));
      $('#broadcast', el).addEventListener('click', () => RM.form({
        title: 'Powiadomienie do zespołu', subtitle: 'Wyślij push na telefony pracowników',
        fields: [
          { name: 'title', label: 'Tytuł', required: true, full: true, maxlength: 120, placeholder: 'np. Jutro zbiórka 7:00 na bazie' },
          { name: 'body', label: 'Treść', type: 'textarea', full: true, maxlength: 300 },
          { name: 'employees', label: 'Odbiorcy (puste = wszyscy)', type: 'picks', full: true, options: employees.map(e => ({ value: e._id, label: e.name, avatar: true, color: e.color })) }
        ],
        submitLabel: 'Wyślij',
        async onSubmit(data) {
          const r = await RM.api('/api/push/broadcast', { method: 'POST', body: data });
          RM.toast(`Wysłano na ${r.sent || 0} urządzeń`);
        }
      }));
    }
  };

  function employeeForm(e, done) {
    RM.form({
      title: e ? 'Edytuj pracownika' : 'Nowy pracownik',
      values: e || { systemRole: 'worker', status: 'available', color: '#03f0ba', role: 'Pomocnik' },
      fields: [
        { name: 'name', label: 'Imię i nazwisko', required: true },
        { name: 'role', label: 'Stanowisko', type: 'datalist', options: ['Kierowca', 'Pomocnik', 'Kierownik ekipy', 'Operator myjki', 'Dyspozytor'], required: true },
        { name: 'phone', label: 'Telefon', type: 'tel', inputmode: 'tel' },
        { name: 'email', label: 'E-mail', type: 'email' },
        { name: 'status', label: 'Dostępność', type: 'select', options: Object.entries(RM.EMP_STATUS) },
        { name: 'hourlyRate', label: 'Stawka godzinowa (zł)', type: 'number', min: 0, step: '0.5' },
        { name: 'color', label: 'Kolor w kalendarzu', type: 'color' },
        { type: 'section', label: 'Dostęp do panelu RevMi' },
        { name: 'pin', label: e ? 'Nowy PIN (zostaw puste, by nie zmieniać)' : 'PIN do logowania (4–8 cyfr)', inputmode: 'numeric', pattern: '\\d{4,8}', maxlength: 8, value: '', required: !e },
        { name: 'systemRole', label: 'Uprawnienia', type: 'select', options: [['worker', 'Pracownik — swoje zlecenia i kalendarz'], ['admin', 'Administrator — pełny dostęp']] }
      ],
      danger: e ? { label: 'Dezaktywuj', confirm: 'Dezaktywować pracownika? Straci dostęp do panelu i powiadomień.', action: async () => { await RM.api('/api/employees/' + e._id, { method: 'DELETE' }); RM.toast('Pracownik dezaktywowany'); done(); } } : null,
      async onSubmit(data) {
        if (!data.pin) delete data.pin;
        await RM.api(e ? '/api/employees/' + e._id : '/api/employees', { method: e ? 'PUT' : 'POST', body: data });
        RM.toast(e ? 'Zapisano zmiany' : 'Dodano pracownika');
        done();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Flota                                                               */
  /* ------------------------------------------------------------------ */
  views.flota = {
    title: 'Flota',
    admin: true,
    render(el) {
      el.innerHTML = `
        <div class="page-head"><div><h1>Flota</h1><p>Pojazdy, przebiegi i terminy (OC, przegląd, serwis)</p></div>
          <div class="page-actions"><button class="btn primary" id="addVeh"><i class="fa-solid fa-plus"></i> Dodaj pojazd</button></div></div>
        <div class="grid grid-auto">${S.fleet.map(v => `
          <article class="card res-card">
            <div class="res-top"><span class="row-icon blue"><i class="fa-solid fa-truck"></i></span><div style="min-width:0"><h3>${esc(v.name)}</h3><p class="mono">${esc(v.plates)}${v.capacity ? ' · ' + esc(v.capacity) : ''}</p></div><span class="badge plain" style="margin-left:auto">${esc(RM.FLEET_STATUS[v.status] || v.status)}</span></div>
            <div class="res-stats"><div><small>Przebieg</small><strong>${esc(new Intl.NumberFormat('pl-PL').format(v.mileage || 0))} km</strong></div><div><small>OC do</small><strong>${dateFlag(v.insuranceUntil)}</strong></div><div><small>Przegląd</small><strong>${dateFlag(v.inspectionUntil)}</strong></div></div>
            <div class="res-stats" style="border-top:0;padding-top:0"><div><small>Serwis</small><strong>${dateFlag(v.nextServiceDate)}</strong></div><div><small>Serwis przy</small><strong>${v.serviceMileage ? esc(new Intl.NumberFormat('pl-PL').format(v.serviceMileage)) + ' km' : '—'}</strong></div><div><small>Spalanie</small><strong>${v.fuelConsumption ? esc(v.fuelConsumption) + ' l' : '—'}</strong></div></div>
            ${v.notes ? `<p class="muted small" style="margin:0">${esc(v.notes)}</p>` : ''}
            <div class="res-actions"><button class="btn sm" data-vedit="${esc(v._id)}"><i class="fa-solid fa-pen"></i> Edytuj</button><button class="btn sm" data-vcost="${esc(v._id)}"><i class="fa-solid fa-gas-pump"></i> Koszt</button></div>
          </article>`).join('') || empty('fa-truck', 'Brak pojazdów', 'Dodaj pojazd, aby przypisywać go do zleceń i pilnować terminów.')}</div>`;
      const done = () => RM.reload().then(() => views.flota.render(el));
      $('#addVeh', el).addEventListener('click', () => vehicleForm(null, done));
      $$('[data-vedit]', el).forEach(b => b.addEventListener('click', () => vehicleForm(RM.vehicle(b.dataset.vedit), done)));
      $$('[data-vcost]', el).forEach(b => b.addEventListener('click', () => {
        financeForm('expense');
        setTimeout(() => { const s = document.querySelector('#f_vehicle'); if (s) s.value = b.dataset.vcost; }, 0);
      }));
    }
  };

  function vehicleForm(v, done) {
    RM.form({
      title: v ? 'Edytuj pojazd' : 'Nowy pojazd',
      values: v || { status: 'available' },
      fields: [
        { name: 'name', label: 'Nazwa / model', required: true, placeholder: 'np. Renault Master kontener' },
        { name: 'plates', label: 'Nr rejestracyjny', required: true },
        { name: 'status', label: 'Status', type: 'select', options: Object.entries(RM.FLEET_STATUS) },
        { name: 'capacity', label: 'Ładowność / miejsca', placeholder: 'np. 3,5 t / 9 os.' },
        { name: 'mileage', label: 'Przebieg (km)', type: 'number', min: 0 },
        { name: 'fuelConsumption', label: 'Spalanie (l/100 km)', type: 'number', min: 0, step: '0.1' },
        { name: 'insuranceUntil', label: 'OC ważne do', type: 'date' },
        { name: 'inspectionUntil', label: 'Przegląd ważny do', type: 'date' },
        { name: 'nextServiceDate', label: 'Następny serwis', type: 'date' },
        { name: 'serviceMileage', label: 'Serwis przy przebiegu (km)', type: 'number', min: 0 },
        { name: 'notes', label: 'Notatki', type: 'textarea', full: true }
      ],
      danger: v ? { label: 'Usuń', confirm: 'Usunąć pojazd z floty?', action: async () => { await RM.api('/api/fleet/' + v._id, { method: 'DELETE' }); RM.toast('Usunięto pojazd'); done(); } } : null,
      async onSubmit(data) {
        await RM.api(v ? '/api/fleet/' + v._id : '/api/fleet', { method: v ? 'PUT' : 'POST', body: data });
        RM.toast('Zapisano pojazd');
        done();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Powiadomienia                                                       */
  /* ------------------------------------------------------------------ */
  const NOTIF_ICON = { quote: 'fa-inbox', task: 'fa-clipboard-list', assignment: 'fa-user-check', reminder: 'fa-alarm-clock', status: 'fa-arrows-rotate', message: 'fa-bullhorn', test: 'fa-bell', contact: 'fa-envelope', note: 'fa-note-sticky', billing: 'fa-file-invoice-dollar', storage: 'fa-box-archive' };

  views.powiadomienia = {
    title: 'Powiadomienia',
    async render(el) {
      const [state, inbox, devices] = await Promise.all([
        RM.push.status(),
        RM.api('/api/notifications'),
        RM.api('/api/push/devices')
      ]);
      S.notifications = inbox.notifications;
      const iosHelp = RM.push.isIOS && !RM.push.standalone;
      const stateBox = {
        on: `<div class="alert accent"><i class="fa-solid fa-circle-check"></i><div style="flex:1"><strong>Powiadomienia włączone na tym urządzeniu</strong><p>Dostaniesz push z logo RevSerwis, nawet gdy aplikacja jest zamknięta.</p></div><div class="btn-row"><button class="btn sm" id="pushTest">Wyślij test</button><button class="btn sm ghost" id="pushOff">Wyłącz</button></div></div>`,
        off: `<div class="alert"><i class="fa-solid fa-bell-slash"></i><div style="flex:1"><strong>Powiadomienia wyłączone na tym urządzeniu</strong><p>Włącz, aby dostawać nowe wyceny, zlecenia i przypomnienia (3 dni i 24 h przed).</p></div><button class="btn primary" id="pushOn"><i class="fa-solid fa-bell"></i> Włącz powiadomienia</button></div>`,
        denied: `<div class="alert red"><i class="fa-solid fa-ban"></i><div><strong>Powiadomienia są zablokowane</strong><p>Odblokuj je w ustawieniach: iPhone → Ustawienia → Powiadomienia → RevMi; Android/Chrome → ikona kłódki przy adresie → Powiadomienia → Zezwalaj.</p></div></div>`,
        'ios-install': `<div class="alert"><i class="fa-brands fa-apple"></i><div><strong>iPhone: najpierw dodaj aplikację do ekranu początkowego</strong><p>1) W Safari stuknij <i class="fa-solid fa-arrow-up-from-bracket"></i> Udostępnij → „Do ekranu początkowego”. 2) Otwórz RevMi z ikony na ekranie. 3) Wejdź tutaj i włącz powiadomienia. (Wymaga iOS 16.4 lub nowszego.)</p></div></div>`,
        unsupported: '<div class="alert red"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>Ta przeglądarka nie obsługuje powiadomień push</strong><p>Użyj Chrome, Edge, Firefox lub Safari (iOS 16.4+ z aplikacją na ekranie początkowym).</p></div></div>'
      }[state];

      el.innerHTML = `
        <div class="page-head"><div><h1>Powiadomienia</h1><p>Push na telefonie i komputerze + historia</p></div>
          <div class="page-actions">${inbox.unread ? '<button class="btn" id="readAll"><i class="fa-solid fa-check-double"></i> Oznacz jako przeczytane</button>' : ''}</div></div>
        ${stateBox}
        ${iosHelp && state !== 'ios-install' ? '' : ''}
        <div class="grid grid-2" style="margin-top:16px">
          <section class="card pad"><div class="card-head"><h2>Ostatnie</h2><span class="muted small">${inbox.unread} nieprzeczytanych</span></div>
            <div class="rows">${inbox.notifications.map(n => `
              <a class="row ${n.read ? '' : 'unread'}" href="${esc(n.url && n.url.includes('#') ? n.url.slice(n.url.indexOf('#')) : '#/powiadomienia')}" data-nid="${esc(n._id)}">
                <span class="row-icon ${n.type === 'quote' ? 'orange' : n.type === 'reminder' ? 'blue' : ''}"><i class="fa-solid ${NOTIF_ICON[n.type] || 'fa-bell'}"></i></span>
                <span class="row-main"><strong>${esc(n.title)}</strong><small>${esc(n.body)} · ${esc(RM.ago(n.createdAt))}</small></span></a>`).join('') || '<p class="muted small">Brak powiadomień.</p>'}</div></section>
          <div class="stack">
            <section class="card pad"><div class="card-head"><h2>Moje urządzenia</h2></div><div class="rows">${devices.devices.map(d => `
              <div class="row"><span class="row-icon"><i class="fa-solid ${/iPhone|Android/.test(d.deviceLabel) ? 'fa-mobile-screen' : 'fa-laptop'}"></i></span><span class="row-main"><strong>${esc(d.deviceLabel)}</strong><small>dodano ${esc(RM.ago(d.createdAt))}${d.lastSuccessAt ? ' · ostatni push ' + esc(RM.ago(d.lastSuccessAt)) : ''}</small></span>
              <button class="icon-btn ghost" data-dev="${esc(d._id)}" title="Usuń"><i class="fa-regular fa-trash-can"></i></button></div>`).join('') || '<p class="muted small">Żadne urządzenie nie ma włączonych powiadomień.</p>'}</div></section>
            <section class="card pad"><div class="card-head"><h2>Co przychodzi?</h2></div><div class="rows">
              ${RM.isAdmin() ? '<div class="row"><span class="row-icon orange"><i class="fa-solid fa-inbox"></i></span><span class="row-main"><strong>Nowa wycena z formularza</strong><small>do administratorów</small></span></div><div class="row"><span class="row-icon orange"><i class="fa-solid fa-envelope"></i></span><span class="row-main"><strong>Wiadomość z formularza kontaktowego</strong><small>do administratorów</small></span></div><div class="row"><span class="row-icon"><i class="fa-solid fa-file-invoice-dollar"></i></span><span class="row-main"><strong>Abonament do rozliczenia, koniec przechowania</strong><small>do administratorów</small></span></div>' : ''}
              <div class="row"><span class="row-icon"><i class="fa-solid fa-note-sticky"></i></span><span class="row-main"><strong>Przypomnienie z notatnika</strong><small>do autora notatki (lub całego zespołu)</small></span></div>
              <div class="row"><span class="row-icon"><i class="fa-solid fa-clipboard-list"></i></span><span class="row-main"><strong>Nowe zlecenie w planie</strong><small>do wszystkich w zespole</small></span></div>
              <div class="row"><span class="row-icon"><i class="fa-solid fa-user-check"></i></span><span class="row-main"><strong>Przypisanie do zlecenia</strong><small>do przypisanej osoby</small></span></div>
              <div class="row"><span class="row-icon blue"><i class="fa-solid fa-alarm-clock"></i></span><span class="row-main"><strong>Przypomnienie 3 dni i 24 h przed</strong><small>do osób przypisanych do zlecenia</small></span></div>
              ${RM.isAdmin() ? '<div class="row"><span class="row-icon"><i class="fa-solid fa-sliders"></i></span><span class="row-main"><strong>Zmień zasady</strong><small><a class="link" href="#/ustawienia">Ustawienia powiadomień →</a></small></span></div>' : ''}
            </div></section>
          </div>
        </div>`;

      const rerender = () => views.powiadomienia.render(el);
      $('#pushOn', el)?.addEventListener('click', async e => {
        e.currentTarget.disabled = true;
        try { await RM.push.enable(); RM.toast('Powiadomienia włączone'); rerender(); } catch (err) { RM.fail(err); e.currentTarget.disabled = false; }
      });
      $('#pushOff', el)?.addEventListener('click', async () => { await RM.push.disable(); RM.toast('Powiadomienia wyłączone na tym urządzeniu'); rerender(); });
      $('#pushTest', el)?.addEventListener('click', async () => {
        try { await RM.api('/api/push/test', { method: 'POST' }); RM.toast('Wysłano — powiadomienie powinno pojawić się za chwilę'); } catch (err) { RM.fail(err); }
      });
      $('#readAll', el)?.addEventListener('click', async () => { await RM.api('/api/notifications/read', { method: 'POST', body: {} }); RM.refreshNotifications(); rerender(); });
      $$('[data-dev]', el).forEach(b => b.addEventListener('click', async () => { await RM.api('/api/push/devices/' + b.dataset.dev, { method: 'DELETE' }); rerender(); }));
      $$('[data-nid]', el).forEach(a => a.addEventListener('click', () => RM.api('/api/notifications/read', { method: 'POST', body: { ids: [a.dataset.nid] } }).then(RM.refreshNotifications).catch(() => null)));
    }
  };

  /* ------------------------------------------------------------------ */
  /* Ustawienia                                                          */
  /* ------------------------------------------------------------------ */
  views.ustawienia = {
    title: 'Ustawienia',
    admin: true,
    async render(el) {
      const { settings: s } = await RM.api('/api/settings');
      const sw = (name, label, hint) => `<div class="switch-row"><div><strong>${esc(label)}</strong><small>${esc(hint)}</small></div><label class="switch"><input type="checkbox" name="${name}" ${s[name] ? 'checked' : ''}><span></span></label></div>`;
      el.innerHTML = `
        <div class="page-head"><div><h1>Ustawienia</h1><p>Zasady powiadomień, przypomnień i dane firmy</p></div></div>
        <form id="settingsForm" class="grid grid-2">
          <section class="card pad"><div class="card-head"><h2>Powiadomienia push</h2></div>
            ${sw('notifyNewQuote', 'Nowa wycena z formularza', 'Push do administratorów, gdy klient wyśle zapytanie na stronie')}
            ${sw('notifyNewTask', 'Nowe zlecenie', 'Push do wszystkich, gdy zlecenie trafia do planu (także zaakceptowana wycena)')}
            ${sw('notifyAssignment', 'Przypisanie do zlecenia', 'Push do osoby, którą dodano do ekipy')}
            ${sw('notifyStatusToAdmins', 'Zmiany statusu przez ekipę', 'Push do administratorów, gdy pracownik rozpocznie lub zakończy zlecenie')}
            ${sw('notifyNewMessage', 'Wiadomość z formularza kontaktowego', 'Push do administratorów o nowej wiadomości (e-mail idzie niezależnie)')}
            ${sw('notifyBusinessReminders', 'Abonamenty i magazyn', 'Push o abonamentach do rozliczenia (3 dni przed) i końcu przechowania (7 dni przed)')}
          </section>
          <section class="card pad"><div class="card-head"><h2>Przypomnienia o zleceniach</h2></div>
            <div class="switch-row"><div><strong>Pierwsze przypomnienie</strong><small>domyślnie 3 dni (72 h) przed terminem</small></div><div class="inline-input"><input class="input" type="number" name="reminderFirstHours" min="2" max="336" value="${s.reminderFirstHours}"> h <label class="switch"><input type="checkbox" name="reminderFirstEnabled" ${s.reminderFirstEnabled ? 'checked' : ''}><span></span></label></div></div>
            <div class="switch-row"><div><strong>Drugie przypomnienie</strong><small>domyślnie 24 h przed terminem</small></div><div class="inline-input"><input class="input" type="number" name="reminderSecondHours" min="1" max="168" value="${s.reminderSecondHours}"> h <label class="switch"><input type="checkbox" name="reminderSecondEnabled" ${s.reminderSecondEnabled ? 'checked' : ''}><span></span></label></div></div>
            ${sw('remindersCopyToAdmins', 'Kopia przypomnień do administratorów', 'Gdy wyłączone, admin dostaje przypomnienie tylko o zleceniach bez ekipy')}
            <div class="switch-row"><div><strong>Przypominaj dla statusów</strong><small>zlecenia w tych statusach dostają przypomnienia</small></div><div class="pick-list">${['quoted', 'planned', 'progress'].map(st => `<label class="pick ${s.reminderStatuses.includes(st) ? 'on' : ''}"><input type="checkbox" name="reminderStatuses" value="${st}" ${s.reminderStatuses.includes(st) ? 'checked' : ''}>${esc(RM.STATUS[st].label)}</label>`).join('')}</div></div>
          </section>
          <section class="card pad"><div class="card-head"><div><h2>Domyślna checklista</h2><p>Dodawana do każdego nowego zlecenia — jedna pozycja w wierszu</p></div></div>
            <div class="field"><textarea name="defaultChecklist" rows="6" placeholder="Folia stretch i koce&#10;Pasy i wózek&#10;Zdjęcia przed i po&#10;Rozliczenie z klientem">${esc((s.defaultChecklist || []).join('\n'))}</textarea></div></section>
          <section class="card pad"><div class="card-head"><div><h2>Dane firmy</h2><p>Pojawiają się na ofertach (PDF / wydruk)</p></div></div>
            <div class="form-grid"><div class="field"><label>Nazwa</label><input name="companyName" value="${esc(s.companyName)}"></div><div class="field"><label>Telefon</label><input name="companyPhone" value="${esc(s.companyPhone)}"></div><div class="field"><label>E-mail</label><input name="companyEmail" value="${esc(s.companyEmail)}"></div><div class="field"><label>NIP</label><input name="companyNip" value="${esc(s.companyNip || '')}"></div><div class="field full"><label>Adres</label><input name="companyAddress" value="${esc(s.companyAddress || '')}"></div><div class="field full"><label>Numer konta</label><input name="companyBank" value="${esc(s.companyBank || '')}" placeholder="np. 00 0000 0000 0000 0000 0000 0000"></div></div></section>
          <section class="card pad"><div class="card-head"><div><h2>Oferty i formularz kontaktowy</h2><p>Domyślne warunki oferty i autoodpowiedź</p></div></div>
            <div class="field"><label>Domyślne warunki oferty</label><textarea name="offerTerms" rows="4">${esc(s.offerTerms || '')}</textarea></div>
            ${sw('contactAutoReply', 'Automatyczne potwierdzenie e-mail', 'Klient dostaje e-mail „otrzymaliśmy wiadomość” (wymaga skonfigurowanej poczty)')}
          </section>
          <div style="grid-column:1/-1;display:flex;justify-content:flex-end"><button class="btn primary" type="submit"><i class="fa-solid fa-check"></i> Zapisz ustawienia</button></div>
        </form>`;
      const form = $('#settingsForm', el);
      $$('.pick input', form).forEach(i => i.addEventListener('change', () => i.closest('.pick').classList.toggle('on', i.checked)));
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const f = form.elements;
        const body = {
          notifyNewQuote: f.notifyNewQuote.checked, notifyNewTask: f.notifyNewTask.checked, notifyAssignment: f.notifyAssignment.checked,
          notifyStatusToAdmins: f.notifyStatusToAdmins.checked, reminderFirstEnabled: f.reminderFirstEnabled.checked, reminderSecondEnabled: f.reminderSecondEnabled.checked,
          reminderFirstHours: Number(f.reminderFirstHours.value), reminderSecondHours: Number(f.reminderSecondHours.value), remindersCopyToAdmins: f.remindersCopyToAdmins.checked,
          reminderStatuses: $$('input[name=reminderStatuses]:checked', form).map(i => i.value),
          defaultChecklist: f.defaultChecklist.value.split('\n').map(x => x.trim()).filter(Boolean),
          companyName: f.companyName.value, companyPhone: f.companyPhone.value, companyEmail: f.companyEmail.value,
          companyNip: f.companyNip.value, companyAddress: f.companyAddress.value, companyBank: f.companyBank.value, offerTerms: f.offerTerms.value,
          notifyNewMessage: f.notifyNewMessage.checked, notifyBusinessReminders: f.notifyBusinessReminders.checked, contactAutoReply: f.contactAutoReply.checked
        };
        try { const r = await RM.api('/api/settings', { method: 'PUT', body }); S.settings = r.settings; RM.toast('Zapisano ustawienia'); } catch (err) { RM.fail(err); }
      });
    }
  };

  RM.helpers = { empty, crew, groupByDay, upcoming, dateFlag };
})();
