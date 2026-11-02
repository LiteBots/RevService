/* Pakiety dla firm — plany, sprzedane pakiety, licznik wykorzystania, faktury cykliczne, zamawianie usług w ramach pakietu */
import { S, api, esc, money, icon, fmtDate, go, toast, busy, formModal, modal, emptyState, plural, dayKey, addDays, fieldHtml, readForm, reloadData } from '../core.js';

const PER = { month: 'mies.', quarter: 'kwartał', year: 'rok' };
const SUB = { active: ['Aktywny', 'mint'], paused: ['Wstrzymany', 'amber'], cancelled: ['Zakończony', ''] };

export default async function pakiety(el, { ctx, query }) {
  let d;
  async function load() { d = await api('/v2/packages'); }

  function draw() {
    const k = d.kpi;
    ctx.setTitle('Pakiety firm', `${plural(k.active, 'aktywny pakiet', 'aktywne pakiety', 'aktywnych pakietów')}`, `<button class="btn sm hide-m" data-plan-new>${icon('edit', 'sm')} Nowy plan</button><button class="btn primary sm" data-sell>${icon('plus', 'sm')} Sprzedaj pakiet</button>`);
    document.querySelector('[data-sell]').addEventListener('click', () => sell());
    document.querySelector('[data-plan-new]').addEventListener('click', () => planForm());
    el.innerHTML = `
      <div class="grid g4">
        <div class="card hero kpi"><div class="label">Przychód miesięczny z pakietów</div><div class="value">${money(k.mrrGross)}</div><div class="hint">brutto · ${money(k.mrrNet)} netto</div></div>
        <div class="card kpi"><div class="label">Aktywne firmy</div><div class="value">${k.active}</div></div>
        <div class="card kpi"><div class="label">Do odnowienia (30 dni)</div><div class="value ${k.renewSoon ? 'amber' : ''}">${k.renewSoon}</div></div>
        <div class="card kpi"><div class="label">Do zapłaty</div><div class="value ${k.dueGross ? 'amber' : ''}">${money(k.dueGross)}</div><div class="hint">${k.avgUsage !== null ? `śr. wykorzystanie ${k.avgUsage}%` : ''}</div></div>
      </div>
      <div class="section-title"><h2>Plany</h2><button class="btn ghost sm" data-plan-new>${icon('plus', 'sm')} Nowy plan</button></div>
      ${d.plans.length ? `<div class="grid g3">${d.plans.map(p => `<div class="plan ${p.highlight ? 'hot' : ''}" style="${p.active ? '' : 'opacity:.55'}">${p.highlight ? '<span class="tag">NAJCZĘŚCIEJ</span>' : ''}
        <div class="row between"><b style="font-size:16px">${esc(p.name)}</b><button class="btn ghost sm" data-plan="${p._id}">${icon('edit', 'sm')}</button></div>
        ${p.tagline ? `<div class="small muted">${esc(p.tagline)}</div>` : ''}
        <div class="price">${money(p.priceNet)} <small>netto / ${PER[p.period]}</small></div>
        <ul>${[p.serviceLimit === null ? 'Bez limitu usług' : `${p.serviceLimit} usług w okresie`, `Reakcja do ${p.responseHours} h`, ...p.features].map(f => `<li>${esc(f)}</li>`).join('')}</ul>
        <div class="small muted">${plural(p.subscribers, 'firma', 'firmy', 'firm')}${p.active ? '' : ' · ukryty'}</div></div>`).join('')}</div>` : `<div class="card">${emptyState('Brak planów', 'Utwórz pierwszy plan (np. Start, Biznes, Premium), a potem sprzedawaj pakiety firmom.', 'tag')}<div style="text-align:center"><button class="btn primary" data-plan-new>Utwórz plan</button></div></div>`}
      <div class="section-title"><h2>Firmy z pakietem</h2></div>
      <div class="card pad-0"><div class="table-wrap">${d.subs.length ? `<table class="table"><thead><tr><th>Firma</th><th>Pakiet</th><th style="width:26%">Wykorzystanie</th><th class="hide-m">Odnowienie</th><th>Płatność</th></tr></thead><tbody>
        ${d.subs.map(s => `<tr class="click" data-sub="${s._id}"><td><b>${esc(s.clientName)}</b><div class="tiny muted">${esc(s.number)}</div></td><td>${esc(s.planName)}<div class="tiny muted">${money(s.priceNet)} netto / ${PER[s.period]}</div></td>
          <td><div class="row" style="gap:8px"><div class="progress grow ${s.usage.pct >= 100 ? 'warn' : ''}" style="margin:0"><i style="width:${s.usage.pct ?? Math.min(100, s.usage.used * 10)}%"></i></div><span class="small b">${s.usage.used}${s.usage.limit !== null ? ' / ' + s.usage.limit : ''}</span></div>${s.usage.over ? `<div class="tiny amber">+${s.usage.over} ponad limit — zaproponuj wyższy plan</div>` : ''}</td>
          <td class="hide-m">${fmtDate(s.renewDate)}${s.autoRenew ? '' : ' <span class="tiny muted">(ręcznie)</span>'}</td>
          <td>${s.status !== 'active' ? `<span class="pill ${SUB[s.status][1]}">${SUB[s.status][0]}</span>` : s.due ? `<span class="pill amber">Do zapłaty ${money(s.due)}</span>` : '<span class="pill mint">Opłacone</span>'}</td></tr>`).join('')}
      </tbody></table>` : emptyState('Nikt jeszcze nie ma pakietu', 'Kliknij „Sprzedaj pakiet”.', 'tag')}</div></div>`;
  }

  function planForm(p = {}) {
    formModal({
      title: p._id ? `Plan: ${p.name}` : 'Nowy plan pakietu', wide: true,
      fields: [
        { name: 'name', label: 'Nazwa', value: p.name, required: true, placeholder: 'np. Biznes' },
        { name: 'tagline', label: 'Krótki opis', value: p.tagline },
        { name: 'priceNet', label: 'Cena netto (zł)', type: 'number', value: p.priceNet ?? '', required: true, min: 0 },
        { name: 'period', label: 'Okres', type: 'select', value: p.period || 'month', options: [['month', 'Miesięcznie'], ['quarter', 'Kwartalnie'], ['year', 'Rocznie']] },
        { name: 'serviceLimit', label: 'Limit usług w okresie (puste = bez limitu)', type: 'number', value: p.serviceLimit ?? '', min: 0 },
        { name: 'responseHours', label: 'Czas reakcji (h)', type: 'number', value: p.responseHours ?? 48, min: 0 },
        { name: 'extraServicePrice', label: 'Cena usługi ponad limit (zł brutto)', type: 'number', value: p.extraServicePrice ?? '', min: 0 },
        { name: 'vatRate', label: 'VAT (%)', type: 'number', value: p.vatRate ?? 23, min: 0, max: 30 },
        { name: 'features', label: 'Co zawiera (jedna rzecz w linii)', type: 'textarea', value: (p.features || []).join('\n'), full: true },
        { name: 'highlight', label: 'Wyróżnij jako „najczęściej wybierany”', type: 'checkbox', value: p.highlight, full: true },
        { name: 'active', label: 'Plan dostępny do sprzedaży', type: 'checkbox', value: p.active !== false, full: true }
      ],
      extraFoot: p._id ? `<button class="btn danger" data-del-plan>${icon('trash', 'sm')}</button><span class="grow"></span>` : '',
      onSubmit: async v => {
        const body = { ...v, serviceLimit: v.serviceLimit === '' ? null : v.serviceLimit, extraServicePrice: v.extraServicePrice === '' ? null : v.extraServicePrice };
        await api(p._id ? '/v2/packages/plans/' + p._id : '/v2/packages/plans', { method: p._id ? 'PUT' : 'POST', body });
        toast('Plan zapisany', 'ok'); await load(); draw();
      },
      onMount: (m, close) => m.querySelector('[data-del-plan]')?.addEventListener('click', e => busy(e.currentTarget, async () => { await api('/v2/packages/plans/' + p._id, { method: 'DELETE' }); close(); toast('Usunięto plan', 'ok'); await load(); draw(); }))
    });
  }

  function sell(clientId) {
    if (!d.plans.filter(p => p.active).length) return toast('Najpierw utwórz plan pakietu', 'err');
    const companies = (S.data.clients || []).filter(c => c.type === 'company' || c.company);
    modal({
      title: 'Sprzedaj pakiet', wide: true,
      body: `<form class="form-grid">
        ${fieldHtml({ name: 'plan', label: 'Plan', type: 'select', options: d.plans.filter(p => p.active).map(p => [p._id, `${p.name} — ${money(p.priceNet)} netto / ${PER[p.period]}`]), full: true })}
        ${fieldHtml({ name: 'client', label: 'Firma', type: 'select', value: clientId || '', options: [['', '➕ Nowa firma (wpisz poniżej)'], ...companies.map(c => [c._id, c.company || c.name])], full: true })}
        <div class="full form-grid" data-newc style="padding:12px;border:1px dashed var(--line-2);border-radius:12px">
          ${fieldHtml({ name: 'nc_name', label: 'Nazwa firmy' })}${fieldHtml({ name: 'nc_nip', label: 'NIP' })}${fieldHtml({ name: 'nc_phone', label: 'Telefon', type: 'tel' })}${fieldHtml({ name: 'nc_email', label: 'E-mail', type: 'email' })}${fieldHtml({ name: 'nc_address', label: 'Adres', full: true })}
        </div>
        ${fieldHtml({ name: 'startDate', label: 'Start', type: 'date', value: dayKey(new Date()) })}
        ${fieldHtml({ name: 'priceNet', label: 'Cena netto (puste = z planu)', type: 'number', min: 0 })}
        ${fieldHtml({ name: 'contactName', label: 'Osoba kontaktowa' })}
        ${S.data.branches?.length ? fieldHtml({ name: 'branch', label: 'Oddział obsługujący', type: 'select', options: [['', 'Ekipa główna'], ...S.data.branches.map(b => [b._id, b.name])] }) : ''}
        ${fieldHtml({ name: 'autoRenew', label: 'Odnawiaj automatycznie i wystawiaj fakturę co okres', type: 'checkbox', value: true, full: true })}
        ${fieldHtml({ name: 'notes', label: 'Uwagi', type: 'textarea', full: true })}
      </form>`,
      foot: '<button class="btn ghost" data-close>Anuluj</button><button class="btn primary" data-go>Sprzedaj</button>',
      onMount: (m, close) => {
        const toggle = () => m.querySelector('[data-newc]').classList.toggle('hidden', Boolean(m.querySelector('[name=client]').value));
        m.querySelector('[name=client]').addEventListener('change', toggle);
        toggle();
        m.querySelector('[data-go]').addEventListener('click', e => busy(e.currentTarget, async () => {
          const v = readForm(m.querySelector('form'));
          const body = { plan: v.plan, startDate: v.startDate, priceNet: v.priceNet, contactName: v.contactName, branch: v.branch || null, autoRenew: v.autoRenew, notes: v.notes };
          if (v.client) body.client = v.client; else { if (!v.nc_name) throw new Error('Podaj nazwę firmy'); body.newClient = { name: v.nc_name, nip: v.nc_nip, phone: v.nc_phone, email: v.nc_email, address: v.nc_address }; }
          await api('/v2/packages/subs', { method: 'POST', body });
          close(); toast('Pakiet sprzedany — pierwsza faktura czeka na zapłatę', 'ok');
          reloadData().catch(() => null);
          await load(); draw();
        }));
      }
    });
  }

  function subCard(s) {
    modal({
      title: `${s.clientName} · ${s.planName}`, wide: true,
      body: `
        <div class="grid g3">
          <div class="kpi"><div class="label">Wykorzystanie</div><div class="value">${s.usage.used}${s.usage.limit !== null ? ' / ' + s.usage.limit : ''}</div><div class="hint">${fmtDate(s.periodStart)} – ${fmtDate(addDays(s.renewDate, -1))}</div></div>
          <div class="kpi"><div class="label">Cena</div><div class="value">${money(s.priceNet)}</div><div class="hint">netto / ${PER[s.period]}</div></div>
          <div class="kpi"><div class="label">Odnowienie</div><div class="value" style="font-size:18px">${fmtDate(s.renewDate)}</div><div class="hint">${s.autoRenew ? 'automatyczne' : 'ręczne'}</div></div>
        </div>
        ${s.status === 'active' ? `<div class="card" style="background:var(--surface-2)"><div class="card-head"><h3>Zamów usługę w ramach pakietu</h3></div><form class="form-grid" data-order>
          ${fieldHtml({ name: 'name', label: 'Usługa', placeholder: 'np. Odśnieżanie parkingu', required: true })}
          ${fieldHtml({ name: 'dateStart', label: 'Termin', type: 'datetime', value: (() => { const x = addDays(new Date(), 1); x.setHours(8, 0, 0, 0); return x; })() })}
          ${fieldHtml({ name: 'address', label: 'Adres', value: s.address, full: true })}
          ${fieldHtml({ name: 'desc', label: 'Opis', full: true })}
        </form><button class="btn primary sm" data-order-go style="margin-top:10px">Dodaj zlecenie</button></div>` : ''}
        <div><div class="eyebrow">Faktury</div><div class="list">${(s.invoices || []).slice().reverse().map(i => `<div class="li"><div class="grow"><b>${esc(i.number)}</b><div class="li-sub">${fmtDate(i.periodStart)} – ${fmtDate(addDays(i.periodEnd, -1))}</div></div><b>${money(i.amountGross)}</b>${i.status === 'paid' ? `<span class="pill mint">Opłacona ${fmtDate(i.paidAt)}</span>` : `<button class="btn primary sm" data-paid="${i._id}">Oznacz jako opłaconą</button>`}</div>`).join('') || '<p class="muted small">—</p>'}</div></div>
        <div class="row wrap">${s.status === 'active' ? '<button class="btn sm" data-st="paused">Wstrzymaj</button>' : '<button class="btn sm" data-st="active">Wznów</button>'}<button class="btn danger sm" data-st="cancelled">Zakończ pakiet</button><button class="btn ghost sm" data-client="${s.client}">Karta klienta ${icon('right', 'sm')}</button></div>`,
      onMount: (m, close) => m.addEventListener('click', async e => {
        const paid = e.target.closest('[data-paid]');
        if (paid) return busy(paid, async () => { await api(`/v2/packages/subs/${s._id}/invoices/${paid.dataset.paid}/paid`, { method: 'POST' }); close(); toast('Opłacono — przychód zapisany w finansach', 'ok'); await load(); draw(); });
        const st = e.target.closest('[data-st]');
        if (st) return busy(st, async () => { await api('/v2/packages/subs/' + s._id, { method: 'PUT', body: { status: st.dataset.st } }); close(); toast('Zapisano', 'ok'); await load(); draw(); });
        const og = e.target.closest('[data-order-go]');
        if (og) return busy(og, async () => {
          const v = readForm(m.querySelector('[data-order]'));
          if (!v.name) throw new Error('Podaj nazwę usługi');
          const r = await api(`/v2/packages/subs/${s._id}/order`, { method: 'POST', body: v });
          close(); toast(r.extra ? 'Dodano — usługa ponad limit (płatna dodatkowo)' : 'Dodano zlecenie w ramach pakietu', r.extra ? 'err' : 'ok');
          reloadData().catch(() => null);
          go('zlecenia/' + r.task._id);
        });
        const c = e.target.closest('[data-client]');
        if (c) { close(); go('klienci/' + c.dataset.client); }
      })
    });
  }

  el.addEventListener('click', e => {
    if (e.target.closest('[data-plan-new]')) return planForm();
    const p = e.target.closest('[data-plan]');
    if (p) return planForm(d.plans.find(x => String(x._id) === p.dataset.plan));
    const s = e.target.closest('[data-sub]');
    if (s) return subCard(d.subs.find(x => String(x._id) === s.dataset.sub));
  });

  await load();
  draw();
  if (query.klient) sell(query.klient);
}
