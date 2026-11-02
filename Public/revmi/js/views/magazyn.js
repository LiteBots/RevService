/* Magazyn — sprzęt i materiały (stany, wydania na osobę, zwroty, alert „zamów”), rzeczy klientów (RevStorage) */
import { S, api, esc, money, icon, fmtDate, ago, go, toast, busy, formModal, emptyState, confirmBox, avatar, employeeColor } from '../core.js';

const MOVE = { in: 'Przyjęcie', out: 'Zużycie', issue: 'Wydanie', return: 'Zwrot', adjust: 'Korekta' };

export default async function magazyn(el, { params, ctx }) {
  const tabs = [['', 'Sprzęt'], ['materialy', 'Materiały'], ['klienci', 'Rzeczy klientów'], ['ruchy', 'Historia ruchów']];
  const tab = tabs.some(t => t[0] === (params[0] || '')) ? params[0] || '' : '';
  let d;
  async function load() { d = await api('/v2/equipment'); }

  async function draw() {
    ctx.setTitle('Magazyn', tabs.find(t => t[0] === tab)[1], tab === '' || tab === 'materialy' ? `<button class="btn primary sm" data-new>${icon('plus', 'sm')} <span class="hide-m">Pozycja</span></button>` : '');
    document.querySelector('[data-new]')?.addEventListener('click', () => edit({ kind: tab === 'materialy' ? 'material' : 'equipment' }));
    const k = d.kpi;
    const head = `<div class="seg">${tabs.map(([key, l]) => `<button data-tab="${key}" class="${tab === key ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="grid g4"><div class="card kpi"><div class="label">Pozycje</div><div class="value">${k.positions}</div></div><div class="card kpi"><div class="label">Wydane teraz</div><div class="value">${k.issued}</div></div><div class="card kpi"><div class="label">Do zamówienia</div><div class="value ${k.low ? 'amber' : ''}">${k.low}</div></div><div class="card kpi"><div class="label">W serwisie</div><div class="value ${k.service ? 'red' : ''}">${k.service}</div></div></div>`;
    if (tab === 'klienci') {
      const r = await api('/storage').catch(() => ({ items: [] }));
      const items = r.items || r.storage || [];
      el.innerHTML = `${head}<div class="card pad-0"><div class="table-wrap">${items.length ? `<table class="table"><thead><tr><th>Klient</th><th>Rzeczy</th><th class="hide-m">m³</th><th class="hide-m">Opłata</th><th>Do</th></tr></thead><tbody>${items.map(i => `<tr><td><b>${esc(i.clientName)}</b><div class="tiny muted">${esc(i.number || '')}</div></td><td class="small">${esc(i.description || '')}</td><td class="hide-m">${i.volume || '—'}</td><td class="hide-m">${i.monthlyPrice ? money(i.monthlyPrice) + '/mies.' : '—'}</td><td>${i.endDate ? fmtDate(i.endDate) : '—'} <span class="pill ${i.status === 'stored' ? 'mint' : ''}">${i.status === 'stored' ? 'W magazynie' : i.status === 'released' ? 'Wydane' : esc(i.status)}</span></td></tr>`).join('')}</tbody></table>` : emptyState('Brak rzeczy klientów', '', 'box')}</div></div>
        <p class="small muted">Przyjęcia, miejsca w magazynie i zdjęcia rzeczy klientów: <a href="/revmi-9/#/magazyn">panel klasyczny → Magazyn</a>.</p>`;
      return;
    }
    if (tab === 'ruchy') {
      el.innerHTML = `${head}<div class="card">${d.moves.length ? `<div class="list">${d.moves.map(m => `<div class="li"><span class="pill ${m.type === 'in' || m.type === 'return' ? 'mint' : m.type === 'issue' ? 'blue' : m.type === 'out' ? 'amber' : ''}">${MOVE[m.type]}</span><div class="grow"><b>${esc(m.itemName)}</b> · ${m.type === 'adjust' ? 'stan' : ''} ${m.qty}${m.employeeName ? ` · ${esc(m.employeeName)}` : ''}<div class="li-sub">${esc(m.by)} · ${ago(m.createdAt)}${m.note ? ' · ' + esc(m.note) : ''}</div></div></div>`).join('')}</div>` : emptyState('Brak ruchów', '', 'box')}</div>`;
      return;
    }
    const kind = tab === 'materialy' ? 'material' : 'equipment';
    const items = d.items.filter(i => i.kind === kind);
    el.innerHTML = `${head}<div class="card pad-0"><div class="table-wrap">${items.length ? `<table class="table"><thead><tr><th>Pozycja</th><th>Stan</th><th class="hide-m">Gdzie / u kogo</th><th>Status</th><th></th></tr></thead><tbody>
      ${items.map(i => { const low = i.minQty > 0 && i.qty <= i.minQty; const total = i.total || (i.qty + (i.holders || []).reduce((s, h) => s + h.qty, 0)); const pct = kind === 'equipment' && total ? Math.round((i.qty / total) * 100) : i.minQty ? Math.min(100, Math.round((i.qty / (i.minQty * 2)) * 100)) : 100;
        return `<tr><td class="click" data-edit="${i._id}"><b>${esc(i.name)}</b><div class="tiny muted">${esc(i.category || '')}</div></td>
        <td style="min-width:130px"><div class="row" style="gap:8px"><div class="progress grow ${low ? 'warn' : ''}" style="margin:0"><i style="width:${pct}%"></i></div><span class="small b">${i.qty}${kind === 'equipment' && total ? ' / ' + total : ''} ${esc(i.unit)}</span></div>${i.minQty ? `<div class="tiny muted">próg ${i.minQty}</div>` : ''}</td>
        <td class="hide-m small">${(i.holders || []).map(h => `<span class="row" style="gap:5px;display:inline-flex;margin-right:8px">${avatar(h.name, employeeColor(h.employee), 'sm')}${esc(h.name.split(' ')[0])} (${h.qty})</span>`).join('') || esc(i.location || '—')}</td>
        <td>${i.status === 'service' ? '<span class="pill red">Serwis</span>' : low ? '<span class="pill amber">Zamów</span>' : '<span class="pill mint">OK</span>'}</td>
        <td style="text-align:right;white-space:nowrap"><button class="btn sm" data-move="${i._id}">${kind === 'equipment' ? 'Wydaj / zwrot' : 'Ruch'}</button></td></tr>`; }).join('')}
    </tbody></table>` : emptyState(kind === 'equipment' ? 'Brak sprzętu' : 'Brak materiałów', 'Dodaj pozycje, żeby wiedzieć, kto ma wózek i kiedy kończy się folia.', 'box')}</div></div>`;
  }

  function edit(i = {}) {
    formModal({
      title: i._id ? i.name : i.kind === 'material' ? 'Nowy materiał' : 'Nowy sprzęt',
      fields: [
        { name: 'name', label: 'Nazwa', value: i.name, required: true },
        { name: 'kind', label: 'Rodzaj', type: 'select', value: i.kind || 'equipment', options: [['equipment', 'Sprzęt (wydawany i zwracany)'], ['material', 'Materiał (zużywalny)']] },
        { name: 'category', label: 'Kategoria', value: i.category },
        { name: 'unit', label: 'Jednostka', value: i.unit || 'szt.' },
        ...(i._id ? [] : [{ name: 'qty', label: 'Stan początkowy', type: 'number', value: 0, min: 0 }]),
        { name: 'minQty', label: 'Alert „zamów”, gdy zostanie (0 = bez)', type: 'number', value: i.minQty ?? 0, min: 0 },
        { name: 'location', label: 'Miejsce', value: i.location, placeholder: 'Regał A2, bus GSL…' },
        { name: 'status', label: 'Status', type: 'select', value: i.status || 'ok', options: [['ok', 'OK'], ['service', 'W serwisie'], ['lost', 'Zgubiony']] },
        ...(S.data.branches?.length ? [{ name: 'branch', label: 'Oddział', type: 'select', value: i.branch || '', options: [['', 'Wspólny'], ...S.data.branches.map(b => [b._id, b.name])] }] : []),
        { name: 'notes', label: 'Uwagi', type: 'textarea', value: i.notes, full: true }
      ],
      extraFoot: i._id ? `<button class="btn danger" data-del>${icon('trash', 'sm')}</button><span class="grow"></span>` : '',
      onSubmit: async v => { await api(i._id ? '/v2/equipment/' + i._id : '/v2/equipment', { method: i._id ? 'PUT' : 'POST', body: v }); toast('Zapisano', 'ok'); await load(); draw(); },
      onMount: (m, close) => m.querySelector('[data-del]')?.addEventListener('click', async e => { if (!await confirmBox(`Usunąć ${i.name}?`, { ok: 'Usuń', danger: true })) return; await busy(e.target, async () => { await api('/v2/equipment/' + i._id, { method: 'DELETE' }); close(); await load(); draw(); }); })
    });
  }

  function move(i) {
    const types = i.kind === 'equipment' ? [['issue', 'Wydaj osobie'], ['return', 'Zwrot od osoby'], ['in', 'Przyjęcie (dokupione)'], ['adjust', 'Korekta stanu']] : [['out', 'Zużycie'], ['in', 'Przyjęcie (dostawa)'], ['adjust', 'Korekta stanu']];
    formModal({
      title: `${i.name} · stan ${i.qty} ${i.unit}`,
      fields: [
        { name: 'type', label: 'Ruch', type: 'select', options: types, full: true },
        { name: 'qty', label: 'Ilość (przy korekcie — nowy stan)', type: 'number', value: 1, min: 0, required: true },
        { name: 'employee', label: 'Osoba (wydanie / zwrot)', type: 'select', options: [['', '—'], ...S.data.employees.map(e => [e._id, e.name])] },
        { name: 'task', label: 'Zlecenie (opcjonalnie)', type: 'select', options: [['', '—'], ...S.data.tasks.filter(t => ['planned', 'progress'].includes(t.status)).slice(0, 60).map(t => [t._id, t.name])] },
        { name: 'note', label: 'Uwagi', full: true }
      ],
      submit: 'Zapisz ruch',
      onSubmit: async v => { const r = await api(`/v2/equipment/${i._id}/move`, { method: 'POST', body: { ...v, employee: v.employee || null, task: v.task || null } }); toast(`Zapisano · stan: ${r.item.qty} ${r.item.unit}`, 'ok'); await load(); draw(); }
    });
  }

  el.addEventListener('click', e => {
    const t = e.target.closest('[data-tab]');
    if (t) return go('magazyn' + (t.dataset.tab ? '/' + t.dataset.tab : ''));
    const ed = e.target.closest('[data-edit]');
    if (ed) return edit(d.items.find(x => String(x._id) === ed.dataset.edit));
    const mv = e.target.closest('[data-move]');
    if (mv) return move(d.items.find(x => String(x._id) === mv.dataset.move));
  });
  await load();
  await draw();
}
