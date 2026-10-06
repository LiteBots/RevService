/* RevMi — start aplikacji, logowanie, nawigacja, szczegóły zlecenia */
'use strict';

(function () {
  const RM = window.RM;
  const { esc, $, $$ } = RM;
  const S = RM.state;

  /* ------------------------------------------------------------------ */
  /* Nawigacja                                                           */
  /* ------------------------------------------------------------------ */
  const NAV = [
    { group: 'Praca' },
    { route: 'pulpit', icon: 'fa-gauge-high', label: 'Pulpit', workerLabel: 'Mój plan' },
    { route: 'zlecenia', icon: 'fa-clipboard-list', label: 'Zlecenia', count: () => S.tasks.filter(t => ['planned', 'progress'].includes(t.status) && new Date(t.dateStart) >= RM.startOfDay(new Date()) && (RM.isAdmin() || RM.isMine(t))).length },
    { route: 'wyceny', icon: 'fa-inbox', label: 'Wyceny', admin: true, count: () => S.tasks.filter(t => t.status === 'new').length, hot: true },
    { route: 'wiadomosci', icon: 'fa-envelope', label: 'Wiadomości', admin: true, count: () => S.messagesNew, hot: true },
    { route: 'kalendarz', icon: 'fa-regular fa-calendar', label: 'Kalendarz' },
    { route: 'notatnik', icon: 'fa-note-sticky', label: 'Notatnik' },
    { route: 'klienci', icon: 'fa-address-book', label: 'Klienci', admin: true },
    { group: 'Sprzedaż i obsługa', admin: true },
    { route: 'oferty', icon: 'fa-file-signature', label: 'Oferty', admin: true },
    { route: 'abonamenty', icon: 'fa-arrows-rotate', label: 'Abonamenty', admin: true },
    { route: 'magazyn', icon: 'fa-box-archive', label: 'Magazyn', admin: true },
    { route: 'cennik', icon: 'fa-tags', label: 'Cennik', admin: true },
    { group: 'Firma', admin: true },
    { route: 'dzialy', icon: 'fa-layer-group', label: 'Działy', admin: true },
    { route: 'raporty', icon: 'fa-chart-pie', label: 'Raporty', admin: true },
    { route: 'finanse', icon: 'fa-chart-line', label: 'Finanse', admin: true },
    { route: 'zespol', icon: 'fa-users', label: 'Zespół', admin: true },
    { route: 'flota', icon: 'fa-truck', label: 'Flota', admin: true },
    { group: 'Aplikacja' },
    { route: 'powiadomienia', icon: 'fa-bell', label: 'Powiadomienia', count: () => S.unread, hot: true },
    { route: 'ustawienia', icon: 'fa-sliders', label: 'Ustawienia', admin: true }
  ];
  const iconCls = icon => (icon.includes(' ') ? icon : 'fa-solid ' + icon);

  function renderNav(active) {
    const admin = RM.isAdmin();
    const items = NAV.filter(n => !n.admin || admin);
    $('#sideNav').innerHTML = items.map(n => {
      if (n.group) return `<div class="nav-label">${esc(n.group)}</div>`;
      const count = n.count?.() || 0;
      return `<a href="#/${n.route}" class="${active === n.route ? 'active' : ''}"><i class="${iconCls(n.icon)}"></i>${esc(!admin && n.workerLabel ? n.workerLabel : n.label)}${count ? `<span class="count ${n.hot ? 'hot' : ''}">${count}</span>` : ''}</a>`;
    }).join('');

    const tabs = admin
      ? [['pulpit', 'fa-gauge-high', 'Pulpit'], ['zlecenia', 'fa-clipboard-list', 'Zlecenia'], ['wyceny', 'fa-inbox', 'Wyceny'], ['notatnik', 'fa-note-sticky', 'Notatnik']]
      : [['pulpit', 'fa-house', 'Mój plan'], ['zlecenia', 'fa-clipboard-list', 'Zlecenia'], ['notatnik', 'fa-note-sticky', 'Notatnik'], ['powiadomienia', 'fa-bell', 'Alerty']];
    const quoteCount = S.tasks.filter(t => t.status === 'new').length;
    $('#tabbar').innerHTML = tabs.map(([r, icon, label]) => {
      const c = r === 'wyceny' ? quoteCount + S.messagesNew : r === 'powiadomienia' ? S.unread : 0;
      return `<a href="#/${r}" class="${active === r ? 'active' : ''}"><i class="${iconCls(icon)}"></i>${esc(label)}${c ? `<span class="count">${c}</span>` : ''}</a>`;
    }).join('') + `<button type="button" id="moreBtn" class="${tabs.some(t => t[0] === active) ? '' : 'active'}"><i class="fa-solid fa-grip"></i>Więcej</button>`;
    $('#moreBtn').addEventListener('click', openMore);
  }

  function openMore() {
    const admin = RM.isAdmin();
    const items = [
      admin && ['wiadomosci', 'fa-envelope', 'Wiadomości' + (S.messagesNew ? ` (${S.messagesNew})` : '')],
      ['kalendarz', 'fa-calendar', 'Kalendarz'],
      admin && ['oferty', 'fa-file-signature', 'Oferty'],
      admin && ['abonamenty', 'fa-arrows-rotate', 'Abonamenty'],
      admin && ['magazyn', 'fa-box-archive', 'Magazyn'],
      admin && ['klienci', 'fa-address-book', 'Klienci'],
      admin && ['dzialy', 'fa-layer-group', 'Działy'],
      admin && ['raporty', 'fa-chart-pie', 'Raporty'],
      admin && ['finanse', 'fa-chart-line', 'Finanse'],
      admin && ['cennik', 'fa-tags', 'Cennik'],
      admin && ['zespol', 'fa-users', 'Zespół'],
      admin && ['flota', 'fa-truck', 'Flota'],
      admin && ['powiadomienia', 'fa-bell', 'Powiadomienia'],
      admin && ['ustawienia', 'fa-sliders', 'Ustawienia'],
      !admin && ['pulpit', 'fa-house', 'Mój plan']
    ].filter(Boolean);
    const sheet = $('#moreSheet');
    sheet.innerHTML = `<div class="sheet-grip"></div><div class="sheet-grid">${items.map(([r, i, l]) => `<a href="#/${r}"><i class="fa-solid ${i}"></i>${l}</a>`).join('')}
      ${deferredInstall ? '<button type="button" data-install><i class="fa-solid fa-mobile-screen"></i>Zainstaluj</button>' : ''}
      <button type="button" data-palette><i class="fa-solid fa-magnifying-glass"></i>Szukaj</button>
      ${admin ? '<button type="button" data-cost><i class="fa-solid fa-receipt"></i>Dodaj koszt</button>' : ''}
      <button type="button" data-logout><i class="fa-solid fa-arrow-right-from-bracket"></i>Wyloguj</button></div>
      <p class="muted small" style="text-align:center;margin:14px 0 0">${esc(S.me.name)} · ${RM.isAdmin() ? 'Administrator' : 'Pracownik'}</p>`;
    sheet.hidden = false;
    $('#moreBackdrop').hidden = false;
    const close = () => { sheet.hidden = true; $('#moreBackdrop').hidden = true; };
    $('#moreBackdrop').onclick = close;
    $$('a', sheet).forEach(a => a.addEventListener('click', close));
    $('[data-logout]', sheet).addEventListener('click', () => { close(); logout(); });
    $('[data-install]', sheet)?.addEventListener('click', () => { close(); install(); });
    $('[data-cost]', sheet)?.addEventListener('click', () => { close(); RM.financeForm('expense'); });
    $('[data-palette]', sheet)?.addEventListener('click', () => { close(); RM.palette(); });
  }

  /* ------------------------------------------------------------------ */
  /* Router                                                              */
  /* ------------------------------------------------------------------ */
  function parseRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return { name: parts[0] || 'pulpit', id: parts[1] || null };
  }

  let lastViewName = null;
  async function route() {
    if (!S.me) return;
    const { name, id } = parseRoute();
    RM.routeId = name === 'zlecenia' ? null : id;
    let viewName = name;
    if (viewName === 'zlecenia' && id) {
      if (lastViewName !== 'zlecenia' && lastViewName) viewName = lastViewName;
      else viewName = lastViewName || 'zlecenia';
      openTask(id);
    } else {
      closeDrawer(false);
    }
    const view = RM.views[viewName] || RM.views.pulpit;
    if (view.admin && !RM.isAdmin()) { location.hash = '#/pulpit'; return; }
    const changed = viewName !== lastViewName;
    lastViewName = viewName;
    renderNav(viewName);
    $('#topbarTitle').textContent = !RM.isAdmin() && viewName === 'pulpit' ? 'Mój plan' : view.title;
    document.title = `${view.title} · RevMi`;
    if (changed || !id || viewName !== 'zlecenia') await renderView(view);
    if (changed) { window.scrollTo(0, 0); $('#view').focus({ preventScroll: true }); }
  }

  async function renderView(view = RM.views[lastViewName] || RM.views.pulpit) {
    try {
      await view.render($('#view'));
    } catch (err) {
      $('#view').innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Nie udało się wczytać widoku</h3><p>${esc(err.message)}</p><button class="btn" data-reload>Odśwież</button></div>`;
      $('[data-reload]', $('#view'))?.addEventListener('click', () => location.reload());
    }
  }
  RM.rerender = () => { renderNav(lastViewName); return renderView(); };

  /* ------------------------------------------------------------------ */
  /* Dane                                                                */
  /* ------------------------------------------------------------------ */
  RM.reload = async function reload({ quiet = true } = {}) {
    const btn = $('#refreshBtn');
    btn.classList.add('spin');
    try {
      const data = await RM.api('/api/data');
      Object.assign(S, { me: { ...S.me, ...data.me }, tasks: data.tasks, employees: data.employees, fleet: data.fleet, clients: data.clients, expenses: data.expenses, incomes: data.incomes, settings: data.settings, loadedAt: Date.now() });
      if (RM.isAdmin()) {
        S.dashboard = await RM.api('/api/dashboard').catch(() => S.dashboard);
        S.messagesNew = S.dashboard?.business?.newMessages || 0;
      }
      cacheSnapshot();
      if (!quiet) RM.toast('Dane odświeżone');
    } finally {
      btn.classList.remove('spin');
    }
  };

  function cacheSnapshot() {
    try { localStorage.setItem('rm.snapshot', JSON.stringify({ at: Date.now(), me: S.me, tasks: S.tasks, employees: S.employees, fleet: S.fleet })); } catch { /* pełny magazyn */ }
  }
  function restoreSnapshot() {
    try {
      const snap = JSON.parse(localStorage.getItem('rm.snapshot') || 'null');
      if (snap && snap.me) { Object.assign(S, { tasks: snap.tasks, employees: snap.employees, fleet: snap.fleet }); return snap; }
    } catch { /* ignore */ }
    return null;
  }

  RM.refreshNotifications = async function () {
    try {
      const r = await RM.api('/api/notifications');
      S.unread = r.unread;
      S.notifications = r.notifications;
      const dot = $('#bellDot');
      dot.hidden = !r.unread;
      dot.textContent = r.unread > 9 ? '9+' : r.unread;
      RM.setBadge(r.unread);
      renderNav(lastViewName);
    } catch { /* offline */ }
  };

  /* ------------------------------------------------------------------ */
  /* Zmiana statusu                                                      */
  /* ------------------------------------------------------------------ */
  RM.setStatus = async function (task, status) {
    let body = { status };
    if (status === 'completed' && RM.isAdmin()) {
      const suggested = task.finalPrice ?? task.price ?? '';
      const value = await askFinalPrice(suggested);
      if (value === null) return;
      if (value !== '') body.finalPrice = Number(value);
    }
    const { task: updated } = await RM.api(`/api/tasks/${RM.id(task)}/status`, { method: 'PATCH', body });
    RM.upsertTask(updated);
    RM.toast(`Status: ${RM.STATUS[status].label}`);
    if (RM.isAdmin()) RM.api('/api/dashboard').then(d => { S.dashboard = d; }).catch(() => null);
    return updated;
  };

  function askFinalPrice(suggested) {
    return new Promise(resolve => {
      let resolved = false;
      const form = RM.form({
        title: 'Zakończ zlecenie',
        subtitle: 'Podaj kwotę końcową — trafi do przychodów',
        values: { finalPrice: suggested },
        fields: [{ name: 'finalPrice', label: 'Kwota końcowa (zł)', type: 'number', min: 0, step: '0.01', inputmode: 'decimal', full: true, hint: 'Zostaw puste, aby użyć ceny ze zlecenia.' }],
        submitLabel: 'Zakończ',
        onSubmit(data) { resolved = true; resolve(data.finalPrice === null ? '' : String(data.finalPrice)); }
      });
      form.closest('dialog').addEventListener('close', () => { if (!resolved) resolve(null); }, { once: true });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Formularz zlecenia                                                  */
  /* ------------------------------------------------------------------ */
  RM.taskForm = function (task, preset = {}, title) {
    const editing = Boolean(task);
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0);
    const values = {
      status: 'planned', priority: 'normal', paymentStatus: 'unpaid', type: 'Przeprowadzka', dateStart: defaultStart.toISOString(),
      ...(task || {}),
      ...preset
    };
    values.workers = (values.workers || []).map(w => (typeof w === 'string' ? w : w.employee && String(w.employee))).filter(Boolean);
    values.vehicle = values.vehicle ? String(values.vehicle) : '';
    values.checklistText = (task?.checklist || []).map(i => i.text).join('\n');
    values.division = values.division || RM.guessDivision(values.type || values.name);
    if (task?.status === 'new' && preset.status === 'planned' && RM.valid(new Date(task.dateStart)) && Math.abs(new Date(task.dateStart) - new Date(task.createdAt)) < 60000) values.dateStart = defaultStart.toISOString();

    const fields = [
      { name: 'name', label: 'Nazwa zlecenia', required: true, full: true, placeholder: 'np. Przeprowadzka 2 pokoi Słupsk → Gdańsk' },
      { name: 'type', label: 'Usługa', type: 'datalist', options: RM.SERVICES },
      { name: 'division', label: 'Dział', type: 'select', options: RM.divOptions() },
      { name: 'status', label: 'Status', type: 'select', options: Object.entries(RM.STATUS).map(([k, v]) => [k, v.label]) },
      { name: 'dateStart', label: 'Termin (start)', type: 'datetime-local', required: true },
      { name: 'dateEnd', label: 'Planowany koniec', type: 'datetime-local' },
      { name: 'priority', label: 'Priorytet', type: 'select', options: Object.entries(RM.PRIORITY) },
      { name: 'people', label: 'Liczba osób w ekipie', type: 'number', min: 0, max: 30 },
      { type: 'section', label: 'Ekipa i pojazd' },
      { name: 'workers', label: 'Przypisane osoby — dostaną powiadomienie i przypomnienia', type: 'picks', full: true, options: S.employees.map(e => ({ value: e._id, label: e.name, avatar: true, color: e.color })) },
      { name: 'vehicle', label: 'Pojazd', type: 'select', options: [['', '— brak —'], ...S.fleet.map(v => [v._id, `${v.name} (${v.plates})`])] },
      { name: 'car', label: 'Inny pojazd (opis)', placeholder: 'gdy spoza floty' },
      { type: 'section', label: 'Klient i miejsce' },
      { name: 'clientName', label: 'Klient' },
      { name: 'clientPhone', label: 'Telefon', type: 'tel', inputmode: 'tel' },
      { name: 'client', label: 'Klient w CRM', type: 'select', options: [['', '— nie przypisano —'], ...S.clients.map(c => [c._id, c.name + (c.phone ? ` (${c.phone})` : '')])] },
      { name: 'clientEmail', label: 'E-mail', type: 'email' },
      { name: 'address', label: 'Adres / trasa', full: true, placeholder: 'np. Słupsk, ul. Długa 5 → Gdańsk, ul. Morska 1' },
      { type: 'section', label: 'Rozliczenie' },
      { name: 'price', label: 'Cena (zł)', type: 'number', min: 0, step: '0.01', inputmode: 'decimal' },
      { name: 'priceMax', label: 'Cena maks. (widełki)', type: 'number', min: 0, step: '0.01', inputmode: 'decimal' },
      { name: 'finalPrice', label: 'Kwota końcowa', type: 'number', min: 0, step: '0.01', inputmode: 'decimal' },
      { name: 'paymentStatus', label: 'Płatność', type: 'select', options: Object.entries(RM.PAYMENT) },
      { name: 'paymentMethod', label: 'Forma płatności', type: 'select', options: ['', 'Gotówka', 'Przelew', 'BLIK', 'Karta', 'Faktura'] },
      { type: 'section', label: 'Szczegóły' },
      { name: 'desc', label: 'Opis / notatki operacyjne', type: 'textarea', full: true },
      { name: 'checklistText', label: 'Checklista (jedna pozycja w wierszu)', type: 'textarea', full: true, hint: editing ? 'Zmiana listy resetuje odhaczenia usuniętych pozycji.' : 'Puste = domyślna checklista z ustawień.' }
    ];

    RM.form({
      onRender(form) {
        const type = form.elements.type;
        const div = form.elements.division;
        type?.addEventListener('change', () => { if (!div.value) div.value = RM.guessDivision(type.value); });
      },
      title: title || (editing ? 'Edytuj zlecenie' : 'Nowe zlecenie'),
      subtitle: editing ? `${task.number}` : 'Osoby przypisane dostaną powiadomienie push',
      values,
      fields,
      submitLabel: editing ? 'Zapisz' : 'Dodaj zlecenie',
      async onSubmit(data) {
        const lines = data.checklistText.split('\n').map(s => s.trim()).filter(Boolean);
        delete data.checklistText;
        if (editing) {
          const old = new Map((task.checklist || []).map(i => [i.text, i]));
          data.checklist = lines.map(text => old.get(text) || { text });
        } else if (lines.length) {
          data.checklist = lines.map(text => ({ text }));
        }
        if (!data.client) data.client = null;
        const res = await RM.api(editing ? '/api/tasks/' + RM.id(task) : '/api/tasks', { method: editing ? 'PUT' : 'POST', body: data });
        RM.upsertTask(res.task);
        RM.toast(editing ? 'Zapisano zlecenie' : 'Dodano zlecenie');
        RM.api('/api/dashboard').then(d => { S.dashboard = d; }).catch(() => null);
        await RM.rerender();
        if (editing && !$('#drawer').hidden) openTask(RM.id(res.task));
        else if (!editing) location.hash = '#/zlecenia/' + RM.id(res.task);
      }
    });
  };

  /* ------------------------------------------------------------------ */
  /* Szczegóły zlecenia (drawer)                                         */
  /* ------------------------------------------------------------------ */
  let drawerTaskId = null;

  async function openTask(id) {
    drawerTaskId = id;
    const drawer = $('#drawer');
    drawer.hidden = false;
    $('#drawerBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    const cached = RM.task(id);
    if (cached) renderDrawer(cached, null);
    else drawer.innerHTML = '<div class="drawer-body"><div class="skeleton"></div></div>';
    try {
      const { task, activity } = await RM.api('/api/tasks/' + id);
      if (drawerTaskId !== id) return;
      RM.upsertTask(task);
      renderDrawer(task, activity);
    } catch (err) {
      if (!cached) drawer.innerHTML = `<div class="drawer-body"><div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>${esc(err.message)}</h3><button class="btn" data-close-drawer>Zamknij</button></div></div>`;
      $('[data-close-drawer]', drawer)?.addEventListener('click', () => closeDrawer());
    }
  }
  RM.openTask = id => { location.hash = '#/zlecenia/' + id; };

  function closeDrawer(updateHash = true) {
    const drawer = $('#drawer');
    if (drawer.hidden) return;
    drawer.hidden = true;
    $('#drawerBackdrop').hidden = true;
    document.body.style.overflow = '';
    drawerTaskId = null;
    if (updateHash && /^#\/?zlecenia\/.+/.test(location.hash)) {
      history.replaceState(null, '', '#/' + (lastViewName || 'zlecenia'));
      renderNav(lastViewName);
      renderView();
    }
  }

  const NEXT_ACTION = {
    new: null,
    quoted: ['planned', 'fa-calendar-check', 'Zaplanuj'],
    planned: ['progress', 'fa-play', 'Rozpocznij'],
    progress: ['completed', 'fa-flag-checkered', 'Zakończ'],
    completed: null,
    cancelled: null
  };

  function renderDrawer(t, activity) {
    const drawer = $('#drawer');
    const admin = RM.isAdmin();
    const canWork = RM.canWork(t);
    const d = RM.toDate(t.dateStart);
    const place = RM.place(t);
    const details = RM.entries(t.quoteDetails);
    const checklist = t.checklist || [];
    const done = checklist.filter(i => i.done).length;
    const next = NEXT_ACTION[t.status];
    const photoCount = t.quotePhotoCount || 0;
    const canSeePhotos = admin || RM.isMine(t);

    drawer.innerHTML = `
      <div class="drawer-head">
        <button class="icon-btn" data-close-drawer aria-label="Zamknij"><i class="fa-solid fa-arrow-left"></i></button>
        <div class="grow"><div class="btn-row" style="align-items:center">${RM.statusBadge(t.status)}${t.priority === 'high' ? '<span class="badge plain prio-high"><i class="fa-solid fa-bolt"></i> Pilne</span>' : ''}<span class="mono muted">${esc(t.number || '')}</span></div>
          <h2>${esc(t.name)}</h2></div>
        <div class="menu-wrap"><button class="icon-btn" id="taskMenu" aria-label="Więcej"><i class="fa-solid fa-ellipsis"></i></button></div>
      </div>
      <div class="drawer-body">
        <div class="quick">
          ${t.clientPhone ? `<a href="${esc(RM.telUrl(t.clientPhone))}"><i class="fa-solid fa-phone"></i>Zadzwoń</a>` : '<button disabled style="opacity:.4"><i class="fa-solid fa-phone"></i>Brak tel.</button>'}
          ${t.clientPhone ? `<a href="sms:${esc(String(t.clientPhone).replace(/[^+\d]/g, ''))}"><i class="fa-solid fa-comment-sms"></i>SMS</a>` : '<button disabled style="opacity:.4"><i class="fa-solid fa-comment-sms"></i>SMS</button>'}
          ${place ? `<a href="${esc(RM.mapsUrl(place))}" target="_blank" rel="noopener"><i class="fa-solid fa-diamond-turn-right"></i>Nawiguj</a>` : '<button disabled style="opacity:.4"><i class="fa-solid fa-map"></i>Brak adresu</button>'}
          <button data-scroll="notesSection"><i class="fa-regular fa-note-sticky"></i>Notatka</button>
        </div>

        <div class="section"><div class="info-grid">
          <div class="info"><small>${t.status === 'new' ? 'Zgłoszono' : 'Termin'}</small><strong>${t.status === 'new' ? esc(RM.formatWhen(t.createdAt)) : RM.valid(d) ? `${esc(RM.relDay(d))}, ${esc(RM.fmt.time.format(d))}` : '—'}</strong>${t.status !== 'new' && RM.valid(d) ? `<div class="muted small">${esc(RM.fmt.dayLong.format(d))}${t.dateEnd ? ' – do ' + esc(RM.fmt.time.format(new Date(t.dateEnd))) : ''}</div>` : ''}</div>
          <div class="info"><small>Usługa</small><strong>${esc(t.type || '—')}</strong>${RM.taskDivision(t) ? `<div style="margin-top:4px">${RM.divBadge(RM.taskDivision(t))}</div>` : ''}</div>
          ${t.clientPreferredDate ? `<div class="info full"><small>Termin podany przez klienta</small><strong>${esc(t.clientPreferredDate)}</strong></div>` : ''}
          <div class="info"><small>Klient</small><strong>${esc(t.clientName || '—')}</strong>${t.clientPhone ? `<div><a href="${esc(RM.telUrl(t.clientPhone))}">${esc(t.clientPhone)}</a></div>` : ''}</div>
          <div class="info"><small>Adres / trasa</small>${place ? `<a href="${esc(RM.mapsUrl(place))}" target="_blank" rel="noopener">${esc(place)}</a>` : '<strong>—</strong>'}</div>
          ${admin ? `<div class="info"><small>Cena</small><strong>${esc(RM.taskPrice(t) || '—')}</strong></div><div class="info"><small>Płatność</small>${RM.payBadge(t.paymentStatus || 'unpaid')}${t.paymentMethod ? ` <span class="muted small">${esc(t.paymentMethod)}</span>` : ''}</div>` : ''}
          <div class="info full"><small>Ekipa${t.people ? ` (${t.people} os.)` : ''}</small>${(t.workers || []).length ? `<div class="chips" style="margin-top:4px">${t.workers.map(w => { const e = RM.employee(w.employee); return `<span class="chip">${`<span class="avatar" style="${e?.color ? `color:${esc(e.color)}` : ''}">${esc(RM.initials(w.name))}</span>`}${esc(w.name)}${e?.phone ? ` <a href="${esc(RM.telUrl(e.phone))}" title="Zadzwoń"><i class="fa-solid fa-phone" style="color:var(--accent);font-size:11px"></i></a>` : ''}</span>`; }).join('')}</div>` : `<strong class="muted">Nikt nie jest przypisany</strong>${admin ? ' <button class="link" data-edit>Przypisz →</button>' : ''}`}</div>
          ${t.car ? `<div class="info full"><small>Pojazd</small><strong>${esc(t.car)}</strong></div>` : ''}
        </div></div>

        ${details.length ? `<div class="section"><h3>Szczegóły z formularza</h3><dl class="details-table">${details.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>` : ''}
        ${t.desc ? `<div class="section"><h3>Opis</h3><div class="desc">${esc(t.desc)}</div></div>` : ''}
        ${photoCount && canSeePhotos ? `<div class="section"><h3>Zdjęcia (${photoCount})</h3><div class="photos">${Array.from({ length: photoCount }, (_, i) => `<a href="/api/tasks/${esc(RM.id(t))}/photos/${i}" target="_blank" rel="noopener"><img loading="lazy" src="/api/tasks/${esc(RM.id(t))}/photos/${i}" alt="Zdjęcie ${i + 1}"></a>`).join('')}</div></div>` : ''}

        ${checklist.length ? `<div class="section"><h3>Checklista · ${done}/${checklist.length}</h3><div class="progress"><i style="width:${(done / checklist.length) * 100}%"></i></div><div class="checklist">${checklist.map(i => `
          <button class="check ${i.done ? 'done' : ''}" data-check="${esc(i._id)}" ${canWork ? '' : 'disabled'}><span class="box"><i class="fa-solid fa-check"></i></span><span class="check-text">${esc(i.text)}</span>${i.done && i.doneBy ? `<small>${esc(i.doneBy)}</small>` : ''}</button>`).join('')}</div></div>` : ''}

        <div class="section" id="notesSection"><h3>Notatki ekipy</h3><div class="notes">${(t.notes || []).slice().reverse().map(n => `
          <div class="note"><div class="note-head"><span><b>${esc(n.author)}</b> · ${esc(RM.ago(n.createdAt))}</span>${admin || n.authorKey === RM.userKey() ? `<button class="link" data-delnote="${esc(n._id)}" style="color:var(--muted)">Usuń</button>` : ''}</div><p>${esc(n.text)}</p></div>`).join('') || '<p class="muted small">Brak notatek.</p>'}</div>
          <form class="note-form" id="noteForm"><textarea name="text" placeholder="Dodaj notatkę, np. kod do bramy, piętro, uwagi po zleceniu…" required></textarea><button class="btn primary" aria-label="Dodaj notatkę"><i class="fa-solid fa-paper-plane"></i></button></form></div>

        ${activity ? `<div class="section"><h3>Historia</h3><div class="timeline">${activity.map(a => `<div class="tl">${esc(a.message)}<small>${esc(a.actorName || '')} · ${esc(RM.formatWhen(a.createdAt))}</small></div>`).join('') || '<p class="muted small" style="padding-left:14px">Brak wpisów.</p>'}${t.createdAt ? `<div class="tl">Utworzono (${esc(t.source || '')})<small>${esc(RM.formatWhen(t.createdAt))}</small></div>` : ''}</div></div>` : ''}
      </div>
      <div class="drawer-foot">
        ${t.status === 'new' && admin ? `<button class="btn" data-quote-price><i class="fa-solid fa-tag"></i> Wyceń</button><button class="btn primary" data-quote-plan><i class="fa-solid fa-calendar-plus"></i> Zaplanuj</button>` : ''}
        ${admin && t.status !== 'new' ? '<button class="btn" data-edit><i class="fa-solid fa-pen"></i> Edytuj</button>' : ''}
        ${next && canWork && (admin || next[0] !== 'planned') ? `<button class="btn primary" data-next="${next[0]}"><i class="fa-solid ${next[1]}"></i> ${next[2]}</button>` : ''}
        ${!admin && !canWork ? '<p class="muted small" style="margin:auto">Zlecenie przypisane do innej ekipy.</p>' : ''}
      </div>`;

    $$('[data-close-drawer]', drawer).forEach(b => b.addEventListener('click', () => closeDrawer()));
    $$('[data-edit]', drawer).forEach(b => b.addEventListener('click', () => RM.taskForm(t)));
    $('[data-quote-price]', drawer)?.addEventListener('click', () => RM.taskForm(t, { status: 'quoted' }, 'Wyceń zgłoszenie'));
    $('[data-quote-plan]', drawer)?.addEventListener('click', () => RM.taskForm(t, { status: 'planned', name: t.name.replace(/^Wycena:\s*/, '') }, 'Zaplanuj zlecenie'));
    $('[data-next]', drawer)?.addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try { const u = await RM.setStatus(t, btn.dataset.next); if (u) { renderDrawer(u, activity); RM.rerender(); } } catch (err) { RM.fail(err); } finally { btn.disabled = false; }
    });
    $('[data-scroll]', drawer)?.addEventListener('click', () => { $('#notesSection').scrollIntoView({ behavior: 'smooth' }); setTimeout(() => $('#noteForm textarea').focus(), 300); });
    $$('[data-check]', drawer).forEach(b => b.addEventListener('click', async () => {
      b.classList.toggle('done');
      try { const r = await RM.api(`/api/tasks/${RM.id(t)}/checklist/${b.dataset.check}`, { method: 'PATCH', body: {} }); RM.upsertTask(r.task); renderDrawer(r.task, activity); } catch (err) { b.classList.toggle('done'); RM.fail(err); }
    }));
    $('#noteForm', drawer).addEventListener('submit', async e => {
      e.preventDefault();
      const text = e.target.elements.text.value.trim();
      if (!text) return;
      try { const r = await RM.api(`/api/tasks/${RM.id(t)}/notes`, { method: 'POST', body: { text } }); RM.upsertTask(r.task); renderDrawer(r.task, activity); RM.toast('Dodano notatkę'); } catch (err) { RM.fail(err); }
    });
    $$('[data-delnote]', drawer).forEach(b => b.addEventListener('click', async () => {
      if (!await RM.confirm('Usunąć notatkę?', { ok: 'Usuń' })) return;
      try { const r = await RM.api(`/api/tasks/${RM.id(t)}/notes/${b.dataset.delnote}`, { method: 'DELETE' }); RM.upsertTask(r.task); renderDrawer(r.task, activity); } catch (err) { RM.fail(err); }
    }));

    $('#taskMenu', drawer).addEventListener('click', e => {
      e.stopPropagation();
      const items = [];
      if (admin) {
        items.push({ icon: 'fa-pen', label: 'Edytuj zlecenie', action: () => RM.taskForm(t) });
        for (const s of ['quoted', 'planned', 'progress', 'completed', 'cancelled']) {
          if (s !== t.status) items.push({ icon: RM.STATUS[s].icon, label: 'Status: ' + RM.STATUS[s].label, action: () => RM.setStatus(t, s).then(u => { if (u) { renderDrawer(u, activity); RM.rerender(); } }).catch(RM.fail) });
        }
        if (t.paymentStatus !== 'paid') items.push({ icon: 'fa-money-bill-wave', label: 'Oznacz jako opłacone', action: () => RM.api('/api/tasks/' + RM.id(t), { method: 'PUT', body: { paymentStatus: 'paid' } }).then(r => { RM.upsertTask(r.task); renderDrawer(r.task, activity); RM.toast('Opłacone'); }).catch(RM.fail) });
        items.push({ icon: 'fa-copy', label: 'Duplikuj', action: () => RM.api(`/api/tasks/${RM.id(t)}/duplicate`, { method: 'POST' }).then(r => { RM.upsertTask(r.task); RM.toast('Utworzono kopię'); RM.taskForm(r.task, {}, 'Kopia — ustaw termin'); }).catch(RM.fail) });
        items.push({ icon: 'fa-file-signature', label: 'Utwórz ofertę', action: () => RM.offerForm?.(null, { title: t.name.replace(/^Wycena:\s*/, ''), division: RM.taskDivision(t), client: t.client || '', clientName: t.clientName, clientPhone: t.clientPhone, clientEmail: t.clientEmail, clientAddress: RM.place(t) }) });
        items.push({ icon: 'fa-note-sticky', label: 'Notatka w notatniku', action: () => RM.noteForm?.(null, { title: t.name, task: RM.id(t), division: RM.taskDivision(t), content: [t.clientName, t.clientPhone, RM.place(t)].filter(Boolean).join(' · ') }) });
        if (!t.client) items.push({ icon: 'fa-address-book', label: 'Dodaj klienta do CRM', action: () => RM.api(`/api/tasks/${RM.id(t)}/client`, { method: 'POST' }).then(r => { RM.upsertTask(r.task); RM.toast('Klient zapisany w CRM'); }).catch(RM.fail) });
      } else if (canWork) {
        if (t.status === 'planned') items.push({ icon: 'fa-play', label: 'Rozpocznij', action: () => RM.setStatus(t, 'progress').then(u => u && renderDrawer(u, activity)).catch(RM.fail) });
        if (t.status === 'progress') items.push({ icon: 'fa-flag-checkered', label: 'Zakończ', action: () => RM.setStatus(t, 'completed').then(u => u && renderDrawer(u, activity)).catch(RM.fail) });
      }
      items.push({ icon: 'fa-share-nodes', label: 'Kopiuj link', action: () => navigator.clipboard?.writeText(location.origin + '/revmi/#/zlecenia/' + RM.id(t)).then(() => RM.toast('Skopiowano link')) });
      if (admin) items.push({ icon: 'fa-trash', label: 'Usuń zlecenie', danger: true, action: async () => {
        if (!await RM.confirm(`Usunąć zlecenie ${t.number}? Tej operacji nie można cofnąć.`, { ok: 'Usuń' })) return;
        try { await RM.api('/api/tasks/' + RM.id(t), { method: 'DELETE' }); S.tasks = S.tasks.filter(x => RM.id(x) !== RM.id(t)); closeDrawer(); RM.toast('Usunięto'); } catch (err) { RM.fail(err); }
      } });
      RM.menu(e.currentTarget, items);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Logowanie                                                           */
  /* ------------------------------------------------------------------ */
  let pin = '';
  function renderPin() {
    const len = Math.max(4, pin.length);
    $('#pinDots').innerHTML = Array.from({ length: len }, (_, i) => `<span class="${i < pin.length ? 'on' : ''}"></span>`).join('');
    $('#loginSubmit').disabled = pin.length < 4;
    $('#pinInput').value = pin;
  }

  function showLogin() {
    S.me = null;
    $('#app').hidden = true;
    $('#drawer').hidden = true;
    $('#drawerBackdrop').hidden = true;
    $('#login').hidden = false;
    document.body.classList.remove('booting');
    pin = '';
    renderPin();
    if (window.matchMedia('(pointer: fine)').matches) $('#pinInput').focus();
  }
  RM.onUnauthorized = () => { if (S.me) { RM.toast('Sesja wygasła — zaloguj się ponownie', 'error'); showLogin(); } };

  async function submitPin() {
    if (pin.length < 4) return;
    $('#loginSubmit').disabled = true;
    try {
      await RM.api('/api/login', { method: 'POST', body: { pin } });
      $('#loginError').textContent = '';
      await enterApp();
      RM.push.sync();
    } catch (err) {
      $('#loginError').textContent = err.message;
      $('#pinDots').classList.add('shake');
      setTimeout(() => $('#pinDots').classList.remove('shake'), 450);
      pin = '';
      renderPin();
    }
  }

  function bindLogin() {
    $('#keypad').addEventListener('click', e => {
      const b = e.target.closest('button[data-key]');
      if (!b) return;
      if (b.dataset.key === 'back') pin = pin.slice(0, -1);
      else if (pin.length < 8) pin += b.dataset.key;
      $('#loginError').textContent = '';
      renderPin();
    });
    $('#pinInput').addEventListener('input', e => { pin = e.target.value.replace(/\D/g, '').slice(0, 8); renderPin(); });
    $('#login').addEventListener('click', e => { if (!e.target.closest('button') && window.matchMedia('(pointer: fine)').matches) $('#pinInput').focus(); });
    document.addEventListener('keydown', e => {
      if ($('#login').hidden || document.activeElement === $('#pinInput')) return;
      if (/^\d$/.test(e.key) && pin.length < 8) { pin += e.key; renderPin(); }
      if (e.key === 'Backspace') { pin = pin.slice(0, -1); renderPin(); }
      if (e.key === 'Enter') submitPin();
    });
    $('#loginForm').addEventListener('submit', e => { e.preventDefault(); submitPin(); });
    const clock = () => { $('#loginClock').textContent = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' }).format(new Date()); };
    clock();
    setInterval(clock, 30000);
  }

  async function logout() {
    if (!await RM.confirm('Wylogować? Na tym urządzeniu przestaną przychodzić powiadomienia dla Twojego konta.', { ok: 'Wyloguj', danger: false })) return;
    await RM.push.disable().catch(() => null);
    await RM.api('/api/logout', { method: 'POST' }).catch(() => null);
    try { localStorage.removeItem('rm.snapshot'); } catch { /* ignore */ }
    location.hash = '';
    showLogin();
  }

  async function enterApp() {
    const session = await RM.api('/api/auth/session', { silent401: true });
    if (!session.authenticated) return showLogin();
    S.me = { role: session.role, name: session.name, employeeId: session.employeeId || null, demo: session.demo };
    await RM.reload();
    applyRole();
    $('#login').hidden = true;
    $('#app').hidden = false;
    document.body.classList.remove('booting');
    if (!location.hash) history.replaceState(null, '', '#/pulpit');
    await route();
    RM.refreshNotifications();
  }

  function applyRole() {
    const admin = RM.isAdmin();
    document.body.classList.toggle('worker', !admin);
    $$('.admin-only').forEach(el => { el.hidden = !admin; });
    $('#meName').textContent = S.me.name;
    $('#meRole').textContent = admin ? 'Administrator' : 'Pracownik';
    $('#meAvatar').textContent = RM.initials(S.me.name);
    const emp = RM.employee(S.me.employeeId);
    if (emp?.color) $('#meAvatar').style.color = emp.color;
  }

  /* ------------------------------------------------------------------ */
  /* PWA: service worker, instalacja, offline                            */
  /* ------------------------------------------------------------------ */
  let deferredInstall = null;
  async function install() {
    if (deferredInstall) {
      deferredInstall.prompt();
      await deferredInstall.userChoice.catch(() => null);
      deferredInstall = null;
      $('#installBtn').hidden = true;
    } else if (RM.push.isIOS) {
      RM.form({ title: 'Dodaj RevMi do ekranu', fields: [{ type: 'html', full: true, html: '<ol class="muted" style="line-height:2;margin:0;padding-left:18px"><li>Otwórz tę stronę w <b>Safari</b>.</li><li>Stuknij <i class="fa-solid fa-arrow-up-from-bracket"></i> <b>Udostępnij</b>.</li><li>Wybierz <b>„Do ekranu początkowego”</b> i potwierdź.</li><li>Uruchom RevMi z ikony i włącz powiadomienia.</li></ol>' }], submitLabel: 'OK', onSubmit: () => true });
    }
  }

  function setupPwa() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/revmi/sw.js', { scope: '/revmi/' }).catch(err => console.warn('SW:', err));
      navigator.serviceWorker.addEventListener('message', e => {
        const msg = e.data || {};
        if (msg.type === 'push') { RM.refreshNotifications(); RM.reload().then(() => RM.rerender()).catch(() => null); }
        if (msg.type === 'navigate' && msg.url) {
          const hash = msg.url.includes('#') ? msg.url.slice(msg.url.indexOf('#')) : '#/pulpit';
          if (location.hash !== hash) location.hash = hash; else route();
        }
      });
    }
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredInstall = e;
      $('#installBtn').hidden = false;
    });
    $('#installBtn').addEventListener('click', install);
    if (RM.push.isIOS && !RM.push.standalone) $('#installBtn').hidden = false;
    if (RM.push.standalone) document.body.classList.add('standalone');

    const net = () => { $('#offlineBar').hidden = navigator.onLine; };
    window.addEventListener('online', () => { net(); if (S.me) RM.reload().then(() => RM.rerender()).catch(() => null); });
    window.addEventListener('offline', net);
    net();
  }

  /* ------------------------------------------------------------------ */
  /* Globalne zdarzenia                                                  */
  /* ------------------------------------------------------------------ */
  function bindGlobal() {
    window.addEventListener('hashchange', route);
    document.addEventListener('click', e => {
      const taskEl = e.target.closest('[data-task]');
      if (taskEl && !e.target.closest('a, [data-qaction], [data-check], .menu')) {
        e.preventDefault();
        RM.openTask(taskEl.dataset.task);
        return;
      }
      const act = e.target.closest('[data-action="new-task"]');
      if (act) { e.preventDefault(); RM.taskForm(null); }
      if (e.target.closest('[data-action="quick-add"]')) { e.preventDefault(); RM.quickAdd(); }
      if (e.target.closest('[data-action="palette"]')) { e.preventDefault(); RM.palette(); }
    });
    $('#drawerBackdrop').addEventListener('click', () => closeDrawer());
    $('#logoutBtn').addEventListener('click', logout);
    $('#refreshBtn').addEventListener('click', () => RM.reload({ quiet: false }).then(() => RM.rerender()).catch(RM.fail));

    const search = $('#globalSearch');
    const onSearch = RM.debounce(() => {
      S.ui.search = search.value.trim();
      if (S.ui.search && !['zlecenia', 'klienci', 'wyceny'].includes(lastViewName)) { S.ui.ordersFilter = 'all'; location.hash = '#/zlecenia'; } else renderView();
    }, 220);
    search.addEventListener('input', onSearch);
    $('#searchToggle').addEventListener('click', () => RM.palette());
    search.addEventListener('blur', () => { if (!search.value) document.body.classList.remove('searching'); });

    document.addEventListener('keydown', e => {
      if (S.me && e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); RM.palette(); return; }
      if (e.key === 'Escape') {
        if ($('#modal').open) return;
        if (!$('#drawer').hidden) closeDrawer();
        if (!$('#moreSheet').hidden) { $('#moreSheet').hidden = true; $('#moreBackdrop').hidden = true; }
      }
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
      if (!S.me || typing || $('#modal').open) return;
      if (e.key === '/') { e.preventDefault(); search.focus(); }
      if (e.key.toLowerCase() === 'n' && RM.isAdmin() && !e.ctrlKey && !e.metaKey) { e.preventDefault(); RM.taskForm(null); }
    });

    // Odświeżanie w tle: dane co 2 min, powiadomienia co 45 s (gdy karta aktywna).
    setInterval(() => { if (S.me && !document.hidden) RM.refreshNotifications(); }, 45000);
    setInterval(() => { if (S.me && !document.hidden && !$('#modal').open) RM.reload().then(() => { if ($('#drawer').hidden) RM.rerender(); }).catch(() => null); }, 120000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && S.me && Date.now() - S.loadedAt > 30000) {
        RM.reload().then(() => { if ($('#drawer').hidden) RM.rerender(); }).catch(() => null);
        RM.refreshNotifications();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', async () => {
    bindLogin();
    bindGlobal();
    setupPwa();
    try {
      await enterApp();
    } catch (err) {
      // Brak sieci: pokaż ostatnie dane, jeśli są.
      const snap = !navigator.onLine && restoreSnapshot();
      if (snap) {
        S.me = snap.me;
        applyRole();
        $('#app').hidden = false;
        document.body.classList.remove('booting');
        route();
      } else {
        showLogin();
        if (!navigator.onLine) $('#loginError').textContent = 'Brak internetu';
      }
    }
  });
})();
