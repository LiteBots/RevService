/* Klienci (CRM) — lejek, lista, karta klienta: historia kontaktu, następny krok z przypomnieniem, zlecenia, pakiety */
import { S, api, esc, money, icon, fmtDate, fmtDateTime, relDay, go, toast, busy, formModal, emptyState, statusPill, confirmBox, reloadData, plural, toLocalInput } from '../core.js';

const STAGE_CLS = { lead: 'amber', offer: 'blue', negotiation: 'violet', won: 'mint', client: 'mint', lost: 'red' };
const KIND = { '': '', hotel: 'Hotel', partner: 'Partner', developer: 'Deweloper', b2b: 'Firma B2B' };
const EV = { note: ['Notatka', 'note'], call: ['Telefon', 'phone'], email: ['E-mail', 'mail'], sms: ['SMS', 'sms'], meeting: ['Spotkanie', 'users'], offer: ['Oferta', 'file'], stage: ['Etap', 'layers'], payment: ['Płatność', 'wallet'], task: ['Zlecenie', 'list'] };

function clientFields(c = {}, stages) {
  return [
    { name: 'name', label: 'Nazwa / imię i nazwisko', value: c.name, required: true, full: true },
    { name: 'type', label: 'Rodzaj', type: 'select', value: c.type || 'person', options: [['person', 'Osoba prywatna'], ['company', 'Firma']] },
    { name: 'kind', label: 'Segment', type: 'select', value: c.kind || '', options: Object.entries(KIND).map(([k, v]) => [k, v || '— zwykły —']) },
    { name: 'stage', label: 'Etap', type: 'select', value: c.stage || 'lead', options: Object.entries(stages) },
    { name: 'value', label: 'Wartość szansy (zł)', type: 'number', value: c.value || '', min: 0 },
    { name: 'company', label: 'Firma', value: c.company },
    { name: 'nip', label: 'NIP', value: c.nip },
    { name: 'phone', label: 'Telefon', type: 'tel', value: c.phone },
    { name: 'email', label: 'E-mail', type: 'email', value: c.email },
    { name: 'address', label: 'Adres', value: c.address, full: true },
    { name: 'source', label: 'Źródło', value: c.source || '', placeholder: 'Google, polecenie, Facebook…' },
    { name: 'owner', label: 'Opiekun', value: c.owner || S.me.name },
    { name: 'nextAction', label: 'Następny krok', value: c.nextAction, placeholder: 'np. zadzwonić w sprawie oferty', full: true },
    { name: 'nextActionAt', label: 'Przypomnij (push)', type: 'datetime', value: c.nextActionAt || '' },
    { name: 'notes', label: 'Notatki', type: 'textarea', value: c.notes, full: true }
  ];
}

export default async function klienci(el, { params, query, ctx }) {
  if (params[0]) return clientCard(el, params[0], ctx);
  let filter = { stage: '', kind: '', q: '' };
  let d;
  async function load() {
    const qs = new URLSearchParams({ ...(filter.stage ? { stage: filter.stage } : {}), ...(filter.kind ? { kind: filter.kind } : {}), ...(filter.q ? { q: filter.q } : {}) });
    d = await api('/v2/crm?' + qs);
  }
  function draw() {
    const f = d.funnel;
    ctx.setTitle('Klienci', `${plural(d.clients.length, 'klient', 'klientów', 'klientów')} · ${d.wonThisMonth} wygranych w tym miesiącu`, `<button class="btn primary sm" data-new>${icon('plus', 'sm')} <span class="hide-m">Klient</span></button>`);
    document.querySelector('[data-new]').addEventListener('click', newClient);
    el.innerHTML = `
      <div class="grid g4">
        ${[['lead', 'Nowe leady'], ['offer', 'Oferta wysłana'], ['negotiation', 'Negocjacje'], ['client', 'Klienci']].map(([k, l]) => `<button class="card click kpi" data-stage="${k}" style="text-align:left;border-top:3px solid var(--${STAGE_CLS[k] === 'mint' ? 'accent' : STAGE_CLS[k]});${filter.stage === k ? 'background:var(--surface-2)' : ''}"><div class="label">${l}</div><div class="value">${f[k].count}${f[k].value ? ` <span class="small muted">· ${money(f[k].value)}</span>` : ''}</div></button>`).join('')}
      </div>
      <div class="row wrap between">
        <div class="chips">${[['', 'Wszyscy'], ['company', 'Firmy'], ['person', 'Osoby'], ['hotel', 'Hotele'], ['partner', 'Partnerzy'], ['developer', 'Deweloperzy']].map(([k, l]) => `<button class="chip ${filter.kind === k ? 'on' : ''}" data-kind="${k}">${l}</button>`).join('')}${filter.stage ? `<button class="chip on" data-stage="">${esc(d.stages[filter.stage])} ✕</button>` : ''}</div>
        <input class="input sm" data-q placeholder="Szukaj: nazwa, telefon, NIP…" value="${esc(filter.q)}" style="width:240px">
      </div>
      <div class="card pad-0"><div class="table-wrap">${d.clients.length ? `<table class="table"><thead><tr><th>Klient</th><th>Etap</th><th class="hide-m">Zlecenia</th><th class="hide-m">Przychód</th><th>Następny krok</th></tr></thead><tbody>
        ${d.clients.map(c => `<tr class="click" data-open="${c._id}"><td><b>${esc(c.company || c.name)}</b>${c.package ? ` <span class="pill violet">${esc(c.package)}</span>` : ''}<div class="tiny muted">${esc([KIND[c.kind] || (c.type === 'company' ? 'Firma' : 'Osoba'), c.phone].filter(Boolean).join(' · '))}</div></td>
          <td><span class="pill ${STAGE_CLS[c.stage]}">${esc(d.stages[c.stage])}</span>${c.value ? `<div class="tiny muted">${money(c.value)}</div>` : ''}</td>
          <td class="hide-m">${c.tasks || '—'}</td><td class="hide-m num">${c.revenue ? money(c.revenue) : '—'}</td>
          <td>${c.nextAction ? `<div class="small">${esc(c.nextAction)}</div>${c.nextActionAt ? `<div class="tiny ${new Date(c.nextActionAt) < new Date() ? 'red' : 'accent'}">${relDay(c.nextActionAt)}</div>` : ''}` : '<span class="muted small">—</span>'}</td></tr>`).join('')}
      </tbody></table>` : emptyState('Brak klientów', 'Dodaj pierwszego klienta albo leada.', 'user')}</div></div>`;
  }
  async function newClient() {
    formModal({
      title: 'Nowy klient / lead', wide: true, fields: clientFields({ stage: 'lead' }, d.stages), submit: 'Dodaj',
      onSubmit: async v => { const r = await api('/v2/crm', { method: 'POST', body: { ...v, nextActionAt: v.nextActionAt || null } }); toast('Dodano klienta', 'ok'); reloadData().catch(() => null); go('klienci/' + r.client._id); }
    });
  }
  el.addEventListener('click', async e => {
    const s = e.target.closest('[data-stage]');
    if (s) { filter.stage = filter.stage === s.dataset.stage ? '' : s.dataset.stage; await load(); return draw(); }
    const k = e.target.closest('[data-kind]');
    if (k) { filter.kind = k.dataset.kind; await load(); return draw(); }
    const o = e.target.closest('[data-open]');
    if (o) go('klienci/' + o.dataset.open);
  });
  let t;
  el.addEventListener('input', e => { if (e.target.matches('[data-q]')) { clearTimeout(t); t = setTimeout(async () => { filter.q = e.target.value; await load(); draw(); el.querySelector('[data-q]').focus(); el.querySelector('[data-q]').setSelectionRange(99, 99); }, 300); } });
  await load();
  draw();
  if (query.nowy) newClient();
}

async function clientCard(el, id, ctx) {
  let d;
  async function load() { d = await api('/v2/crm/' + id); }
  function draw() {
    const c = d.client;
    ctx.setTitle(c.company || c.name, d.stages[c.stage], `<button class="btn sm" data-edit>${icon('edit', 'sm')} <span class="hide-m">Edytuj</span></button>`);
    document.querySelector('[data-edit]').addEventListener('click', edit);
    el.innerHTML = `
      <button class="back" data-back>${icon('left', 'sm')} Klienci</button>
      <div class="split">
        <div class="col" style="gap:14px">
          <div class="card">
            <div class="row wrap between"><div class="row"><span class="avatar lg" style="background:var(--blue)">${esc((c.company || c.name).slice(0, 2).toUpperCase())}</span><div><h2 style="font-size:18px">${esc(c.company || c.name)}</h2><div class="small muted">${esc([c.company && c.name !== c.company ? c.name : '', c.nip ? 'NIP ' + c.nip : '', KIND[c.kind]].filter(Boolean).join(' · '))}</div></div></div>
            <select class="input sm" data-stage style="width:auto">${Object.entries(d.stages).map(([k, v]) => `<option value="${k}" ${c.stage === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
            <div class="grid g4" style="margin-top:14px">
              <div class="kpi"><div class="label">Zlecenia</div><div class="value">${d.stats.tasks}</div></div>
              <div class="kpi"><div class="label">Łącznie</div><div class="value">${money(d.stats.revenue)}</div></div>
              <div class="kpi"><div class="label">Ocena</div><div class="value">${d.stats.rating ? d.stats.rating + '★' : '—'}</div></div>
              <div class="kpi"><div class="label">Nieopłacone</div><div class="value ${d.stats.unpaid ? 'amber' : ''}">${d.stats.unpaid}</div></div>
            </div>
            <div class="row wrap" style="margin-top:12px;gap:6px">
              ${c.phone ? `<a class="btn primary sm" href="tel:${esc(c.phone)}" data-log="call">${icon('phone', 'sm')} Zadzwoń</a>` : ''}
              ${c.email ? `<a class="btn sm" href="mailto:${esc(c.email)}" data-log="email">${icon('mail', 'sm')} E-mail</a>` : ''}
              <button class="btn sm" data-task>${icon('plus', 'sm')} Nowe zlecenie</button>
              ${c.type === 'company' ? `<button class="btn sm" data-pkg>${icon('tag', 'sm')} Sprzedaj pakiet</button>` : ''}
            </div>
          </div>

          <div class="card ${c.nextActionAt && new Date(c.nextActionAt) < new Date() ? 'warn' : ''}">
            <div class="card-head"><h3>⏰ Następny krok</h3><button class="btn ghost sm" data-next>${icon('edit', 'sm')}</button></div>
            ${c.nextAction ? `<b>${esc(c.nextAction)}</b><div class="small ${c.nextActionAt && new Date(c.nextActionAt) < new Date() ? 'red' : 'muted'}">${c.nextActionAt ? fmtDateTime(c.nextActionAt) + ' · dostaniesz push' : 'bez przypomnienia'}</div>` : '<p class="muted small">Ustaw, co dalej z tym klientem — przypomnimy.</p>'}
          </div>

          <div class="card">
            <div class="card-head"><h3>Historia kontaktu</h3></div>
            <div class="row wrap" style="gap:6px;margin-bottom:10px"><select class="input sm" data-ev-type style="width:auto">${['note', 'call', 'email', 'sms', 'meeting', 'offer'].map(k => `<option value="${k}">${EV[k][0]}</option>`).join('')}</select><input class="input sm grow" data-ev-text placeholder="Co ustaliliście?"><button class="btn primary sm" data-ev-add>Dodaj</button></div>
            <div class="timeline">${d.events.map(ev => `<div class="tl"><span class="avatar sm" style="background:var(--surface-3);color:var(--text-2)">${icon(EV[ev.type]?.[1] || 'note', 'sm')}</span><div class="grow"><div style="white-space:pre-wrap">${esc(ev.text)}</div><div class="when">${EV[ev.type]?.[0] || ''} · ${esc(ev.by)} · ${fmtDateTime(ev.at)}</div></div>${!['stage', 'payment'].includes(ev.type) ? `<button class="btn ghost sm" data-ev-del="${ev._id}">${icon('trash', 'sm')}</button>` : ''}</div>`).join('') || '<p class="muted small">Brak wpisów.</p>'}</div>
          </div>
        </div>
        <div class="col" style="gap:14px">
          <div class="card"><div class="card-head"><h3>Kontakt</h3></div>
            <div class="list">${[['phone', c.phone], ['mail', c.email], ['pin', c.address], ['user', c.owner ? 'Opiekun: ' + c.owner : ''], ['external', c.source ? 'Źródło: ' + c.source : '']].filter(([, v]) => v).map(([ic, v]) => `<div class="li">${icon(ic, 'sm')}<span class="grow">${esc(v)}</span></div>`).join('') || '<p class="muted small">—</p>'}</div>
            ${c.notes ? `<p class="small" style="white-space:pre-wrap;margin-top:10px">${esc(c.notes)}</p>` : ''}
          </div>
          ${d.packages.length ? `<div class="card"><div class="card-head"><h3>Pakiety</h3></div><div class="list">${d.packages.map(p => `<div class="li click" data-go="pakiety"><div class="grow"><b>${esc(p.planName)}</b><div class="li-sub">${esc(p.number)} · odnowienie ${fmtDate(p.renewDate)}</div></div><span class="pill ${p.status === 'active' ? 'mint' : ''}">${p.status === 'active' ? 'Aktywny' : p.status === 'paused' ? 'Wstrzymany' : 'Zakończony'}</span></div>`).join('')}</div></div>` : ''}
          <div class="card"><div class="card-head"><h3>Zlecenia</h3></div>${d.tasks.length ? `<div class="list">${d.tasks.map(t => `<div class="li click" data-go="zlecenia/${t._id}"><div class="grow"><div class="li-title ellipsis">${esc(t.name)}</div><div class="li-sub">${fmtDate(t.dateStart)}</div></div>${statusPill(t.status)}<b class="num hide-m">${money(t.finalPrice ?? t.price)}</b></div>`).join('')}</div>` : '<p class="muted small">Brak zleceń.</p>'}</div>
          <button class="btn ghost" data-archive>${icon('trash', 'sm')} Usuń klienta</button>
        </div>
      </div>`;
  }
  function edit() {
    formModal({ title: 'Edycja klienta', wide: true, fields: clientFields(d.client, d.stages), onSubmit: async v => { await api('/v2/crm/' + id, { method: 'PUT', body: { ...v, nextActionAt: v.nextActionAt || null } }); toast('Zapisano', 'ok'); await load(); draw(); } });
  }
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-back]')) return go('klienci');
    const g = e.target.closest('[data-go]');
    if (g) return go(g.dataset.go);
    if (e.target.closest('[data-next]')) {
      return formModal({ title: 'Następny krok', fields: [{ name: 'nextAction', label: 'Co zrobić', value: d.client.nextAction, full: true }, { name: 'nextActionAt', label: 'Kiedy przypomnieć', type: 'datetime', value: d.client.nextActionAt || '', full: true }], onSubmit: async v => { await api('/v2/crm/' + id, { method: 'PUT', body: { nextAction: v.nextAction, nextActionAt: v.nextActionAt || null } }); await load(); draw(); } });
    }
    if (e.target.closest('[data-ev-add]')) {
      const text = el.querySelector('[data-ev-text]').value.trim();
      if (!text) return;
      return busy(e.target.closest('button'), async () => { await api(`/v2/crm/${id}/events`, { method: 'POST', body: { type: el.querySelector('[data-ev-type]').value, text } }); await load(); draw(); });
    }
    const del = e.target.closest('[data-ev-del]');
    if (del) return busy(del, async () => { await api('/v2/crm/events/' + del.dataset.evDel, { method: 'DELETE' }); await load(); draw(); });
    const log = e.target.closest('[data-log]');
    if (log) api(`/v2/crm/${id}/events`, { method: 'POST', body: { type: log.dataset.log, text: log.dataset.log === 'call' ? 'Telefon do klienta' : 'E-mail do klienta' } }).catch(() => null);
    if (e.target.closest('[data-task]')) { const c = d.client; const m = await import('../taskform.js'); return m.openTaskForm(undefined, { client: c._id, clientName: c.company || c.name, clientPhone: c.phone, clientEmail: c.email, address: c.address }); }
    if (e.target.closest('[data-pkg]')) return go('pakiety?klient=' + id);
    if (e.target.closest('[data-archive]')) {
      if (!await confirmBox(`Usunąć klienta „${d.client.company || d.client.name}”? Zlecenia zostaną.`, { ok: 'Usuń', danger: true })) return;
      await api('/clients/' + id, { method: 'DELETE' });
      toast('Usunięto klienta', 'ok');
      reloadData().catch(() => null);
      go('klienci');
    }
  });
  el.addEventListener('change', async e => {
    if (e.target.matches('[data-stage]')) { await api('/v2/crm/' + id, { method: 'PUT', body: { stage: e.target.value } }); toast('Etap zmieniony', 'ok'); await load(); draw(); }
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-ev-text]')) el.querySelector('[data-ev-add]').click(); });
  void toLocalInput;
  await load();
  draw();
}
