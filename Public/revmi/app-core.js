/* RevMi — rdzeń: API, stan, narzędzia, komponenty UI, powiadomienia push */
'use strict';

(function () {
  const RM = (window.RM = window.RM || {});

  /* ------------------------------------------------------------------ */
  /* Stan                                                                */
  /* ------------------------------------------------------------------ */
  RM.state = {
    me: null,
    tasks: [],
    employees: [],
    fleet: [],
    clients: [],
    expenses: [],
    incomes: [],
    settings: null,
    dashboard: null,
    notes: [],
    messagesNew: 0,
    notifications: [],
    unread: 0,
    loadedAt: 0,
    ui: {
      ordersFilter: 'active',
      ordersView: localStore('rm.ordersView', 'list'),
      ordersMine: localStore('rm.ordersMine', '0') === '1',
      ordersSort: 'date',
      search: '',
      calCursor: new Date(),
      calSelected: null,
      financeMonth: new Date(),
      financeData: null,
      ordersDivision: '',
      notesFilter: 'all',
      notesTag: '',
      messagesFilter: 'inbox',
      offersFilter: 'all',
      reportYear: new Date().getFullYear()
    }
  };

  function localStore(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  }
  RM.remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* ignore */ } };

  /* ------------------------------------------------------------------ */
  /* Słowniki                                                            */
  /* ------------------------------------------------------------------ */
  RM.STATUS = {
    new: { label: 'Nowa wycena', short: 'Wycena', icon: 'fa-inbox' },
    quoted: { label: 'Wycenione', short: 'Wycenione', icon: 'fa-file-invoice-dollar' },
    planned: { label: 'Zaplanowane', short: 'Plan', icon: 'fa-calendar-check' },
    progress: { label: 'W realizacji', short: 'W toku', icon: 'fa-truck-fast' },
    completed: { label: 'Zakończone', short: 'Gotowe', icon: 'fa-circle-check' },
    cancelled: { label: 'Anulowane', short: 'Anul.', icon: 'fa-ban' }
  };
  RM.PAYMENT = { unpaid: 'Nieopłacone', partial: 'Częściowo', paid: 'Opłacone' };
  RM.PRIORITY = { low: 'Niski', normal: 'Normalny', high: 'Wysoki' };
  RM.SERVICES = [
    'Przeprowadzka', 'Transport z wniesieniem', 'Transport motocykla / quada / skutera', 'Przewóz osób / Transfer',
    'Magazynowanie mienia', 'Opróżnianie i utylizacja', 'Przygotowanie nieruchomości do sprzedaży', 'Czyszczenie hal i garaży',
    'Odbiór odpadów i gabarytów', 'Mycie ciśnieniowe', 'Rozbiórki i wyburzenia', 'Wycinka drzew i krzewów',
    'Usuwanie pni i korzeni', 'Prace ziemne i koparkowe', 'Porządkowanie działek i posesji',
    'Stałe dostawy dla firm', 'Stałe trasy — hotele i pensjonaty', 'Współpraca B2B', 'Inne'
  ];
  for (const d of (window.RV_DIVISIONS?.divisions || [])) for (const s of d.services) if (!RM.SERVICES.includes(s)) RM.SERVICES.push(s);
  /* Działy RevSerwis 4.0 (z /assets/divisions.js — to samo źródło co strona) */
  const CATALOG = window.RV_DIVISIONS || { groups: [], divisions: [] };
  RM.DIVISIONS = CATALOG.divisions;
  RM.DIV_GROUPS = CATALOG.groups;
  RM.division = slug => RM.DIVISIONS.find(d => d.slug === slug) || null;
  RM.divName = slug => RM.division(slug)?.name || '';
  RM.divOptions = (emptyLabel = '— bez działu —') => [['', emptyLabel], ...RM.DIVISIONS.map(d => [d.slug, `${d.name} — ${d.tagline}`])];
  const GUESS = [
    [/rev(home|clean|storage|moto|assist|bud|garden|site|winter|cargo|event|facility|b2b|office|shop|warehouse|hotel)\b/i, m => 'rev' + m[1].toLowerCase()],
    [/przeprowadz|opróżni|oprozni|sprzedaż|sprzedaz|wynajm/i, () => 'revhome'],
    [/motocykl|quad|skuter/i, () => 'revmoto'],
    [/przewóz osób|przewoz osob|transfer|wesel|impreza/i, () => 'revevent'],
    [/magazynow|przechow/i, () => 'revstorage'],
    [/sprzątan|sprzatan|czyszczenie hal|garaż/i, () => 'revclean'],
    [/rozbiór|rozbior|skuwan|demontaż ścian/i, () => 'revbud'],
    [/wycink|pni|korzeni|koszen|działek|dzialek|ogród|ogrod/i, () => 'revgarden'],
    [/ziemne|koparkow|budow/i, () => 'revsite'],
    [/odśnież|odsniez|zimow/i, () => 'revwinter'],
    [/mycie|odpad|gabaryt|obiekt/i, () => 'revfacility'],
    [/hotel|pensjonat|airbnb/i, () => 'revhotel'],
    [/biur/i, () => 'revoffice'],
    [/sklep/i, () => 'revshop'],
    [/b2b|współprac/i, () => 'revb2b'],
    [/transport|dostaw|palet/i, () => 'revcargo']
  ];
  RM.guessDivision = text => {
    for (const [rx, fn] of GUESS) { const m = String(text || '').match(rx); if (m) { const slug = fn(m); if (RM.division(slug)) return slug; } }
    return '';
  };
  RM.taskDivision = t => (t && (t.division || RM.guessDivision(t.type || t.name))) || '';
  RM.divBadge = (slug, { short = false } = {}) => {
    const d = RM.division(slug);
    return d ? `<span class="div-badge" title="${esc(d.tagline)}"><i class="fa-solid ${esc(d.icon)}"></i>${short ? '' : esc(d.name)}</span>` : '';
  };
  RM.divMark = name => `<span class="dvm">Rev<b>${esc(String(name || '').slice(3))}</b></span>`;
  RM.NOTE_COLORS = { default: 'Bez koloru', mint: 'Miętowy', blue: 'Niebieski', amber: 'Bursztynowy', rose: 'Różowy', violet: 'Fioletowy' };
  RM.OFFER_STATUS = { draft: ['Szkic', ''], sent: ['Wysłana', 'blue'], accepted: ['Zaakceptowana', 'green'], rejected: ['Odrzucona', 'red'], expired: ['Wygasła', 'muted'] };
  RM.CONTRACT_STATUS = { offer: ['Oferta', 'blue'], active: ['Aktywny', 'green'], paused: ['Wstrzymany', 'orange'], ended: ['Zakończony', 'muted'] };
  RM.STORAGE_STATUS = { reserved: ['Rezerwacja', 'blue'], stored: ['W magazynie', 'green'], released: ['Wydane', 'muted'] };
  RM.MESSAGE_STATUS = { new: ['Nowa', 'orange'], read: ['Przeczytana', ''], replied: ['Odpowiedziano', 'green'], archived: ['Archiwum', 'muted'], spam: ['Spam', 'red'] };
  RM.tag = ([label, tone] = ['—', '']) => `<span class="badge plain tone-${esc(tone || 'none')}">${esc(label)}</span>`;
  RM.dateInput = value => (value ? RM.toDateInput(value) : '');

  RM.EMP_STATUS = { available: 'Dostępny', busy: 'Na zleceniu', off: 'Wolne' };
  RM.FLEET_STATUS = { available: 'Dostępny', route: 'W trasie', service: 'Serwis', inactive: 'Nieaktywny' };

  /* ------------------------------------------------------------------ */
  /* Narzędzia                                                           */
  /* ------------------------------------------------------------------ */
  const esc = (RM.esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]));
  RM.$ = (sel, root = document) => root.querySelector(sel);
  RM.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  RM.money = v => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(Number(v) || 0) + ' zł';
  RM.initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
  RM.id = obj => String(obj?._id || obj?.id || obj || '');
  RM.isAdmin = () => RM.state.me?.role === 'admin';
  RM.userKey = () => RM.state.me?.employeeId || 'admin';

  const dtf = (opts) => new Intl.DateTimeFormat('pl-PL', opts);
  const fmt = {
    time: dtf({ hour: '2-digit', minute: '2-digit' }),
    day: dtf({ day: 'numeric', month: 'short' }),
    dayLong: dtf({ weekday: 'long', day: 'numeric', month: 'long' }),
    full: dtf({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    date: dtf({ day: '2-digit', month: '2-digit', year: 'numeric' }),
    month: dtf({ month: 'long', year: 'numeric' }),
    wd: dtf({ weekday: 'short' })
  };
  RM.fmt = fmt;
  RM.toDate = v => (v ? new Date(v) : null);
  RM.valid = d => d instanceof Date && !Number.isNaN(d.getTime());
  RM.sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  RM.dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  RM.startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  RM.formatWhen = value => {
    const d = RM.toDate(value);
    return RM.valid(d) ? fmt.full.format(d) : 'Brak terminu';
  };
  RM.relDay = value => {
    const d = RM.toDate(value);
    if (!RM.valid(d)) return '';
    const diff = Math.round((RM.startOfDay(d) - RM.startOfDay(new Date())) / 86400000);
    if (diff === 0) return 'Dziś';
    if (diff === 1) return 'Jutro';
    if (diff === -1) return 'Wczoraj';
    if (diff > 1 && diff < 7) return 'Za ' + diff + ' dni';
    return fmt.dayLong.format(d);
  };
  RM.ago = value => {
    const d = RM.toDate(value);
    if (!RM.valid(d)) return '';
    const s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return 'przed chwilą';
    if (s < 3600) return Math.floor(s / 60) + ' min temu';
    if (s < 86400) return Math.floor(s / 3600) + ' godz. temu';
    if (s < 86400 * 7) return Math.floor(s / 86400) + ' dni temu';
    return fmt.date.format(d);
  };
  RM.toLocalInput = value => {
    const d = RM.toDate(value);
    if (!RM.valid(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  RM.toDateInput = value => RM.toLocalInput(value).slice(0, 10);
  RM.fromLocalInput = value => (value ? new Date(value).toISOString() : null);

  RM.place = t => t.address || [t.addressFrom, t.addressTo].filter(Boolean).join(' → ');
  RM.taskPrice = t => {
    if (t.finalPrice !== null && t.finalPrice !== undefined) return RM.money(t.finalPrice);
    if (t.priceMax) return `${RM.money(t.price)} – ${RM.money(t.priceMax)}`;
    return t.price ? RM.money(t.price) : '';
  };
  RM.assignedIds = t => (t.workers || []).map(w => w.employee && String(w.employee)).filter(Boolean);
  RM.isMine = t => RM.state.me?.employeeId && RM.assignedIds(t).includes(String(RM.state.me.employeeId));
  RM.canWork = t => RM.isAdmin() || RM.isMine(t) || !RM.assignedIds(t).length;
  RM.mapsUrl = address => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
  RM.telUrl = phone => 'tel:' + String(phone || '').replace(/[^+\d]/g, '');
  RM.entries = obj => {
    if (!obj) return [];
    if (obj instanceof Map) return [...obj.entries()];
    return Object.entries(obj).filter(([k]) => !k.startsWith('$'));
  };
  RM.statusBadge = s => `<span class="badge st-${esc(s)}">${esc(RM.STATUS[s]?.label || s)}</span>`;
  RM.payBadge = p => `<span class="badge plain pay-${esc(p)}">${esc(RM.PAYMENT[p] || p)}</span>`;
  RM.debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  RM.employee = id => RM.state.employees.find(e => RM.id(e) === String(id));
  RM.vehicle = id => RM.state.fleet.find(v => RM.id(v) === String(id));
  RM.task = id => RM.state.tasks.find(t => RM.id(t) === String(id));
  RM.upsertTask = task => {
    if (!task) return;
    const i = RM.state.tasks.findIndex(t => RM.id(t) === RM.id(task));
    if (i >= 0) RM.state.tasks[i] = task; else RM.state.tasks.push(task);
  };

  /* ------------------------------------------------------------------ */
  /* API                                                                 */
  /* ------------------------------------------------------------------ */
  RM.api = async function api(path, { method = 'GET', body, silent401 } = {}) {
    let res;
    try {
      res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch {
      throw new Error(navigator.onLine ? 'Brak połączenia z serwerem' : 'Brak internetu');
    }
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json().catch(() => ({})) : {};
    if (!res.ok) {
      if (res.status === 401 && !silent401 && !path.includes('/api/login')) RM.onUnauthorized?.();
      throw new Error(data.message || `Błąd serwera (${res.status})`);
    }
    return data;
  };

  /* ------------------------------------------------------------------ */
  /* Toast                                                               */
  /* ------------------------------------------------------------------ */
  RM.toast = (message, type = 'ok') => {
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' error' : '');
    el.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><span>${esc(message)}</span>`;
    RM.$('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('hide'), 3200);
    setTimeout(() => el.remove(), 3600);
  };
  RM.fail = error => RM.toast(error?.message || String(error), 'error');

  /* ------------------------------------------------------------------ */
  /* Modal + generator formularzy                                        */
  /* ------------------------------------------------------------------ */
  const modal = () => RM.$('#modal');
  RM.closeModal = () => { const m = modal(); if (m.open) m.close(); };

  document.addEventListener('DOMContentLoaded', () => {
    const m = modal();
    m.addEventListener('click', e => { if (e.target === m) m.close(); });
    m.addEventListener('close', () => { m.innerHTML = ''; });
  });

  function fieldHtml(f, values) {
    const v = values[f.name] ?? f.value ?? '';
    const id = 'f_' + f.name;
    const req = f.required ? 'required' : '';
    const cls = 'field' + (f.full ? ' full' : '');
    const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : '';
    const attrs = [f.min !== undefined ? `min="${f.min}"` : '', f.max !== undefined ? `max="${f.max}"` : '', f.step ? `step="${f.step}"` : '',
      f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '', f.maxlength ? `maxlength="${f.maxlength}"` : '',
      f.inputmode ? `inputmode="${f.inputmode}"` : '', f.pattern ? `pattern="${f.pattern}"` : '', f.autocomplete ? `autocomplete="${f.autocomplete}"` : 'autocomplete="off"'].join(' ');
    switch (f.type) {
      case 'section':
        return `<div class="form-section">${esc(f.label)}</div>`;
      case 'textarea':
        return `<div class="${cls}"><label for="${id}">${esc(f.label)}</label><textarea id="${id}" name="${f.name}" ${req} ${attrs}>${esc(v)}</textarea>${hint}</div>`;
      case 'select': {
        const opts = (f.options || []).map(o => {
          const [val, lab] = Array.isArray(o) ? o : [o, o];
          return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`;
        }).join('');
        return `<div class="${cls}"><label for="${id}">${esc(f.label)}</label><select id="${id}" name="${f.name}" ${req}>${opts}</select>${hint}</div>`;
      }
      case 'datalist': {
        const opts = (f.options || []).map(o => `<option value="${esc(o)}">`).join('');
        return `<div class="${cls}"><label for="${id}">${esc(f.label)}</label><input id="${id}" name="${f.name}" list="${id}_l" value="${esc(v)}" ${req} ${attrs}><datalist id="${id}_l">${opts}</datalist>${hint}</div>`;
      }
      case 'switch':
        return `<div class="${cls}"><div class="switch-row"><div><strong>${esc(f.label)}</strong>${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div><label class="switch"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}><span></span></label></div></div>`;
      case 'picks': {
        const selected = new Set((Array.isArray(v) ? v : []).map(String));
        const items = (f.options || []).map(o => `<label class="pick ${selected.has(String(o.value)) ? 'on' : ''}"><input type="checkbox" name="${f.name}" value="${esc(o.value)}" ${selected.has(String(o.value)) ? 'checked' : ''}>${o.avatar ? `<span class="avatar sm" style="${o.color ? `color:${esc(o.color)}` : ''}">${esc(RM.initials(o.label))}</span>` : ''}${esc(o.label)}</label>`).join('');
        return `<div class="${cls}"><span class="label">${esc(f.label)}</span><div class="pick-list">${items || '<span class="muted small">Brak pozycji</span>'}</div>${hint}</div>`;
      }
      case 'html':
        return `<div class="${cls}">${f.html}</div>`;
      default: {
        let val = v;
        if (f.type === 'datetime-local') val = RM.toLocalInput(v);
        if (f.type === 'date') val = RM.toDateInput(v);
        return `<div class="${cls}"><label for="${id}">${esc(f.label)}</label><input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}" ${req} ${attrs}>${hint}</div>`;
      }
    }
  }

  function readForm(form, fields) {
    const out = {};
    for (const f of fields) {
      if (!f.name || f.type === 'section' || f.type === 'html') continue;
      if (f.type === 'picks') { out[f.name] = RM.$$(`input[name="${f.name}"]:checked`, form).map(i => i.value); continue; }
      const el = form.elements[f.name];
      if (!el) continue;
      if (f.type === 'switch') out[f.name] = el.checked;
      else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
      else if (f.type === 'datetime-local') out[f.name] = RM.fromLocalInput(el.value);
      else if (f.type === 'date') out[f.name] = el.value || null;
      else out[f.name] = el.value.trim();
    }
    return out;
  }

  /**
   * RM.form({ title, subtitle, fields, values, submitLabel, onSubmit, extraButtons })
   * onSubmit(data, form) — zwróć false, aby nie zamykać okna.
   */
  RM.form = function ({ title, subtitle, fields, values = {}, submitLabel = 'Zapisz', danger, onSubmit, onRender }) {
    const m = modal();
    m.innerHTML = `
      <form novalidate>
        <div class="modal-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
          <button type="button" class="icon-btn ghost" data-close aria-label="Zamknij"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><div class="form-grid">${fields.map(f => fieldHtml(f, values)).join('')}</div></div>
        <div class="modal-foot">
          ${danger ? `<button type="button" class="btn danger" data-danger style="margin-right:auto"><i class="fa-solid fa-trash"></i> ${esc(danger.label)}</button>` : ''}
          <button type="button" class="btn" data-close>Anuluj</button>
          <button type="submit" class="btn primary"><i class="fa-solid fa-check"></i> ${esc(submitLabel)}</button>
        </div>
      </form>`;
    const form = m.querySelector('form');
    RM.$$('[data-close]', m).forEach(b => b.addEventListener('click', () => m.close()));
    RM.$$('.pick input', m).forEach(i => i.addEventListener('change', () => i.closest('.pick').classList.toggle('on', i.checked)));
    if (danger) RM.$('[data-danger]', m).addEventListener('click', async () => {
      if (await RM.confirm(danger.confirm || 'Na pewno?')) { try { await danger.action(); m.close(); } catch (e) { RM.fail(e); } }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const result = await onSubmit(readForm(form, fields), form);
        if (result !== false) m.close();
      } catch (err) {
        RM.fail(err);
      } finally {
        btn.disabled = false;
      }
    });
    if (!m.open) m.showModal();
    onRender?.(form);
    const first = form.querySelector('input:not([type=checkbox]):not([type=hidden]), textarea, select');
    if (first && window.matchMedia('(min-width: 901px)').matches) first.focus();
    return form;
  };

  RM.confirm = (message, { ok = 'Potwierdź', danger = true } = {}) => new Promise(resolve => {
    const m = modal();
    const wasOpen = m.open;
    const previous = wasOpen ? m.innerHTML : null;
    const box = document.createElement('dialog');
    box.className = 'modal';
    box.style.width = 'min(420px, calc(100vw - 28px))';
    box.style.height = 'auto';
    box.innerHTML = `<form method="dialog"><div class="modal-body" style="padding:24px"><h2 style="margin:0 0 8px;font-size:18px">Potwierdź</h2><p class="muted" style="margin:0">${esc(message)}</p></div>
      <div class="modal-foot"><button class="btn" value="no">Anuluj</button><button class="btn ${danger ? 'danger' : 'primary'}" value="yes">${esc(ok)}</button></div></form>`;
    document.body.appendChild(box);
    box.addEventListener('close', () => { resolve(box.returnValue === 'yes'); box.remove(); if (previous !== null && !m.innerHTML) m.innerHTML = previous; });
    box.showModal();
  });

  /* Menu kontekstowe */
  RM.menu = (anchor, items) => {
    RM.$$('.menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.innerHTML = items.filter(Boolean).map((it, i) => it.href
      ? `<a href="${esc(it.href)}" ${it.external ? 'target="_blank" rel="noopener"' : ''} class="${it.danger ? 'danger' : ''}"><i class="fa-solid ${it.icon}"></i>${esc(it.label)}</a>`
      : `<button type="button" data-i="${i}" class="${it.danger ? 'danger' : ''}"><i class="fa-solid ${it.icon}"></i>${esc(it.label)}</button>`).join('');
    const wrap = anchor.closest('.menu-wrap') || anchor.parentElement;
    wrap.appendChild(menu);
    const list = items.filter(Boolean);
    menu.addEventListener('click', e => {
      const b = e.target.closest('button[data-i]');
      if (b) { menu.remove(); list[Number(b.dataset.i)].action(); }
    });
    setTimeout(() => document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
    }), 0);
  };

  /* ------------------------------------------------------------------ */
  /* Powiadomienia push (klient)                                         */
  /* ------------------------------------------------------------------ */
  const push = (RM.push = {});
  push.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  push.standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  push.supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  push.registration = async () => {
    if (!('serviceWorker' in navigator)) return null;
    return navigator.serviceWorker.getRegistration('/revmi/') || null;
  };

  push.status = async () => {
    if (!push.supported) return push.isIOS && !push.standalone ? 'ios-install' : 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    const reg = await push.registration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted') return 'on';
    return 'off';
  };

  function b64ToUint8(base64) {
    const pad = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  push.enable = async () => {
    if (!push.supported) {
      if (push.isIOS && !push.standalone) throw new Error('Na iPhonie najpierw dodaj RevMi do ekranu początkowego (Udostępnij → Do ekranu początkowego), a potem włącz powiadomienia w aplikacji.');
      throw new Error('Ta przeglądarka nie obsługuje powiadomień push.');
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Powiadomienia są zablokowane. Zezwól na nie w ustawieniach przeglądarki / telefonu.');
    const reg = (await push.registration()) || await navigator.serviceWorker.register('/revmi/sw.js', { scope: '/revmi/' });
    await navigator.serviceWorker.ready;
    const { publicKey } = await RM.api('/api/push/public-key');
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const current = sub.options?.applicationServerKey;
      const currentB64 = current ? btoa(String.fromCharCode(...new Uint8Array(current))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : publicKey;
      if (currentB64 !== publicKey) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(publicKey) });
    await RM.api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
    return true;
  };

  /** Po zalogowaniu przypisuje istniejącą subskrypcję urządzenia do aktualnego użytkownika. */
  push.sync = async () => {
    try {
      if (!push.supported || Notification.permission !== 'granted') return;
      const reg = await push.registration();
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) await RM.api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
      else await push.enable();
    } catch { /* cicho */ }
  };

  push.disable = async () => {
    const reg = await push.registration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) {
      await RM.api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => null);
      await sub.unsubscribe().catch(() => null);
    }
  };

  RM.setBadge = count => {
    try {
      if (count > 0) navigator.setAppBadge?.(count);
      else navigator.clearAppBadge?.();
    } catch { /* ignore */ }
  };
})();
