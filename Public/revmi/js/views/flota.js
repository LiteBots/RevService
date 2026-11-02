/* Flota — pojazdy (OC, przegląd, serwis, opony), koszty (paliwo, naprawy, koszt/km), usterki zgłaszane przez ekipę */
import { S, api, esc, money, icon, fmtDate, go, toast, busy, formModal, emptyState, confirmBox, reloadData, dayKey } from '../core.js';
import { faultsPart } from '../parts.js';

export default async function flota(el, { params, query, ctx }) {
  const tabs = [['', 'Pojazdy i koszty'], ['usterki', 'Usterki']];
  const tab = params[0] === 'usterki' ? 'usterki' : '';
  ctx.setTitle('Flota', tabs.find(t => t[0] === tab)[1], tab === '' ? `<button class="btn sm" data-fuel>${icon('plus', 'sm')} Tankowanie</button><button class="btn primary sm" data-new>${icon('plus', 'sm')} <span class="hide-m">Pojazd</span></button>` : '');
  el.innerHTML = `<div class="seg">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="col" data-part style="gap:14px"></div>`;
  el.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) go('flota' + (b.dataset.tab ? '/' + b.dataset.tab : '')); });
  const part = el.querySelector('[data-part]');
  if (tab === 'usterki') return faultsPart(part, { openNew: query.nowa === '1' });

  let d;
  async function load() { d = await api('/v92/fleet/costs?months=6'); }
  const soon = x => x && new Date(x) < new Date(Date.now() + 14 * 86_400_000);
  function draw() {
    const total = d.vehicles.reduce((s, v) => s + v.fuelCost + v.repairCost, 0);
    part.innerHTML = `
      <div class="grid g3"><div class="card kpi"><div class="label">Koszty floty (6 mies.)</div><div class="value">${money(total)}</div></div><div class="card kpi"><div class="label">Paliwo</div><div class="value">${money(d.vehicles.reduce((s, v) => s + v.fuelCost, 0))}</div></div><div class="card kpi"><div class="label">Naprawy</div><div class="value">${money(d.vehicles.reduce((s, v) => s + v.repairCost, 0))}</div></div></div>
      ${d.vehicles.length ? `<div class="grid g2">${d.vehicles.map(v => `<div class="card">
        <div class="row between"><div class="row">${icon('truck', 'lg')}<div><b style="font-size:15px">${esc(v.name)}</b><div class="small muted">${esc(v.plates)} · ${v.mileage ? v.mileage.toLocaleString('pl-PL') + ' km' : 'przebieg —'}</div></div></div><button class="btn ghost sm" data-edit="${v._id}">${icon('edit', 'sm')}</button></div>
        <div class="grid g3" style="margin-top:12px">
          <div class="kpi"><div class="label">Paliwo</div><div class="value" style="font-size:18px">${money(v.fuelCost)}</div><div class="hint">${v.per100 ? v.per100 + ' l/100' : ''}</div></div>
          <div class="kpi"><div class="label">Naprawy</div><div class="value" style="font-size:18px">${money(v.repairCost)}</div></div>
          <div class="kpi"><div class="label">Koszt/km</div><div class="value" style="font-size:18px">${v.costPerKm ? v.costPerKm.toFixed(2).replace('.', ',') + ' zł' : '—'}</div></div>
        </div>
        <div class="chips" style="margin-top:10px">
          ${[['OC', v.insuranceUntil], ['Przegląd', v.inspectionUntil], ['Serwis', v.nextServiceDate]].map(([l, x]) => `<span class="pill ${!x ? '' : new Date(x) < new Date() ? 'red' : soon(x) ? 'amber' : 'mint'}">${l}: ${x ? fmtDate(x) : '—'}</span>`).join('')}
          ${v.tyreSeason ? `<span class="pill">Opony: ${{ summer: 'letnie', winter: 'zimowe', allseason: 'całoroczne' }[v.tyreSeason]}</span>` : ''}
        </div>
        <div class="row" style="margin-top:10px;gap:6px"><button class="btn sm" data-fuel="${v._id}">${icon('plus', 'sm')} Tankowanie</button><button class="btn sm" data-repair="${v._id}">${icon('wrench', 'sm')} Naprawa</button></div>
      </div>`).join('')}</div>` : `<div class="card">${emptyState('Brak pojazdów', 'Dodaj busy, żeby pilnować OC, przeglądów i kosztów.', 'truck')}</div>`}
      <div class="split">
        <div class="card"><div class="card-head"><h3>Ostatnie tankowania</h3></div><div class="list">${d.fuel.slice(0, 10).map(f => `<div class="li"><div class="grow"><b>${esc(d.vehicles.find(v => String(v._id) === String(f.vehicle))?.name || '')}</b><div class="li-sub">${fmtDate(f.date)} · ${f.liters} l${f.mileage ? ` · ${f.mileage} km` : ''} · ${esc(f.by || '')}</div></div><b class="num">${money(f.price)}</b></div>`).join('') || '<p class="muted small">—</p>'}</div></div>
        <div class="card"><div class="card-head"><h3>Naprawy i serwis</h3></div><div class="list">${d.repairs.slice(0, 10).map(r => `<div class="li"><div class="grow"><b>${esc(d.vehicles.find(v => String(v._id) === String(r.vehicle))?.name || '')}</b><div class="li-sub">${fmtDate(r.date)} · ${esc(r.description || '')}</div></div><b class="num">${money(r.price)}</b></div>`).join('') || '<p class="muted small">—</p>'}</div></div>
      </div>`;
  }
  function edit(v = {}) {
    formModal({
      title: v._id ? v.name : 'Nowy pojazd',
      fields: [
        { name: 'name', label: 'Nazwa', value: v.name, required: true, placeholder: 'Iveco Daily' },
        { name: 'plates', label: 'Rejestracja', value: v.plates, required: true },
        { name: 'mileage', label: 'Przebieg (km)', type: 'number', value: v.mileage || '', min: 0 },
        { name: 'insuranceUntil', label: 'OC do', type: 'date', value: v.insuranceUntil || '' },
        { name: 'inspectionUntil', label: 'Przegląd do', type: 'date', value: v.inspectionUntil || '' },
        { name: 'nextServiceDate', label: 'Następny serwis', type: 'date', value: v.nextServiceDate || '' }
      ],
      extraFoot: v._id ? `<button class="btn danger" data-del>${icon('trash', 'sm')}</button><span class="grow"></span>` : '',
      onSubmit: async x => { const body = { ...x, insuranceUntil: x.insuranceUntil || null, inspectionUntil: x.inspectionUntil || null, nextServiceDate: x.nextServiceDate || null }; await api(v._id ? '/fleet/' + v._id : '/fleet', { method: v._id ? 'PUT' : 'POST', body }); toast('Zapisano', 'ok'); await load(); draw(); reloadData().catch(() => null); },
      onMount: (m, close) => m.querySelector('[data-del]')?.addEventListener('click', async e => { if (!await confirmBox(`Usunąć ${v.name}?`, { ok: 'Usuń', danger: true })) return; await busy(e.target, async () => { await api('/fleet/' + v._id, { method: 'DELETE' }); close(); await load(); draw(); }); })
    });
  }
  const vehOpts = () => d.vehicles.map(v => [v._id, `${v.name} ${v.plates}`]);
  function fuel(id) {
    formModal({ title: 'Tankowanie', fields: [{ name: 'vehicle', label: 'Pojazd', type: 'select', value: id || '', options: vehOpts(), full: true }, { name: 'liters', label: 'Litry', type: 'number', required: true, min: 0, step: 0.01 }, { name: 'price', label: 'Kwota (zł)', type: 'number', required: true, min: 0, step: 0.01 }, { name: 'mileage', label: 'Przebieg (km)', type: 'number', min: 0 }, { name: 'date', label: 'Data', type: 'date', value: dayKey(new Date()) }, { name: 'station', label: 'Stacja' }],
      onSubmit: async v => { await api('/v92/fuel', { method: 'POST', body: v }); toast('Zapisano tankowanie — koszt trafił do finansów', 'ok'); await load(); draw(); } });
  }
  function repair(id) {
    formModal({ title: 'Naprawa / serwis', fields: [{ name: 'vehicle', label: 'Pojazd', type: 'select', value: id || '', options: vehOpts(), full: true }, { name: 'kind', label: 'Rodzaj', type: 'select', options: [['repair', 'Naprawa'], ['service', 'Serwis'], ['tyres', 'Opony'], ['inspection', 'Przegląd'], ['insurance', 'Ubezpieczenie'], ['other', 'Inne']] }, { name: 'price', label: 'Kwota (zł)', type: 'number', required: true, min: 0 }, { name: 'mileage', label: 'Przebieg (km)', type: 'number', min: 0 }, { name: 'date', label: 'Data', type: 'date', value: dayKey(new Date()) }, { name: 'workshop', label: 'Warsztat' }, { name: 'description', label: 'Opis', full: true }],
      onSubmit: async v => { await api('/v92/repairs', { method: 'POST', body: v }); toast('Zapisano', 'ok'); await load(); draw(); } });
  }
  document.querySelector('[data-new]')?.addEventListener('click', () => edit());
  document.querySelector('[data-fuel]')?.addEventListener('click', () => fuel());
  part.addEventListener('click', e => {
    const ed = e.target.closest('[data-edit]');
    if (ed) return edit(S.data.fleet.find(x => String(x._id) === ed.dataset.edit) || d.vehicles.find(x => String(x._id) === ed.dataset.edit));
    const f = e.target.closest('[data-fuel]');
    if (f) return fuel(f.dataset.fuel);
    const r = e.target.closest('[data-repair]');
    if (r) return repair(r.dataset.repair);
  });
  await load();
  draw();
}
