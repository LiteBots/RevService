/* Moje zarobki (pracownik; biuro: podgląd dowolnej osoby) — godziny, stawki, premie, zaliczki, przewidywana wypłata */
import { api, esc, money, icon, fmtDate, minutesLabel, dayKey, go, emptyState } from '../core.js';

const KIND = { pay: 'Wypłata / stawka', bonus: 'Premia', advance: 'Zaliczka', deduction: 'Potrącenie' };
const UNIT = { hour: 'za godzinę', task: 'za zlecenie', day: 'za dzień' };

export async function earningsCard(el, { employeeId, ctx, title = 'Moje zarobki' }) {
  let month = dayKey(new Date()).slice(0, 7);
  async function draw() {
    const d = await api((employeeId ? `/v2/earnings/${employeeId}` : '/v2/earnings/me') + '?month=' + month);
    const s = d.summary;
    const label = new Date(month + '-15').toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    ctx?.setTitle(employeeId ? `Zarobki: ${d.name}` : title, label);
    const maxM = Math.max(480, ...d.days.map(x => x.minutes));
    el.innerHTML = `
      <div class="row between"><button class="icon-btn" data-m="-1">${icon('left')}</button><b style="text-transform:capitalize">${label}</b><button class="icon-btn" data-m="1">${icon('right')}</button></div>
      <div class="card hero kpi">
        <div class="label">Zarobione w tym miesiącu</div>
        <div class="value lg">${money(s.total)}</div>
        <div class="hint">${s.rate ? `Stawka ${money(s.rate)} ${UNIT[s.unit] || ''}` : 'Stawkę ustala biuro'}${d.toPay > 0 ? ` · do wypłaty po rozliczeniu: <b class="accent">${money(d.toPay)}</b>` : ''}</div>
      </div>
      <div class="grid g3 kpi-row">
        <div class="card kpi"><div class="label">Godziny</div><div class="value">${s.hours} h</div><div class="hint">${s.days} dni pracy</div></div>
        <div class="card kpi"><div class="label">Zlecenia</div><div class="value">${s.tasks}</div><div class="hint">zakończone</div></div>
        <div class="card kpi"><div class="label">Premie</div><div class="value accent">${money(s.bonus)}</div><div class="hint">${s.advance ? `zaliczki −${money(s.advance)}` : 'bez zaliczek'}</div></div>
      </div>
      <div class="card"><div class="card-head"><h3>Rozbicie</h3></div><div class="list">
        ${s.pay ? `<div class="li"><span class="grow">Wpisane wypłaty</span><b>${money(s.pay)}</b></div>` : ''}
        ${s.estimate ? `<div class="li"><span class="grow">${esc(s.estimateLabel)} <span class="muted small">· szacunek</span></span><b>${money(s.estimate)}</b></div>` : ''}
        ${s.bonus ? `<div class="li"><span class="grow">Premie</span><b class="accent">+ ${money(s.bonus)}</b></div>` : ''}
        ${s.advance ? `<div class="li"><span class="grow">Zaliczki</span><b class="red">− ${money(s.advance)}</b></div>` : ''}
        ${s.deduction ? `<div class="li"><span class="grow">Potrącenia</span><b class="red">− ${money(Math.abs(s.deduction))}</b></div>` : ''}
        <div class="li"><b class="grow">Razem</b><b>${money(s.total)}</b></div>
      </div></div>
      ${d.days.length ? `<div class="card"><div class="card-head"><h3>Godziny dzień po dniu</h3></div><div class="bars" style="height:110px">${d.days.map(x => `<div class="bar" title="${x.day}: ${minutesLabel(x.minutes)}"><b style="height:${Math.max(2, (x.minutes / maxM) * 100)}%"></b><span>${Number(x.day.slice(8))}</span></div>`).join('')}</div></div>` : ''}
      <div class="card"><div class="card-head"><h3>Wpisy z rozliczeń</h3></div>${d.entries.length ? `<div class="list">${d.entries.map(p => `<div class="li"><div class="grow"><div class="b">${KIND[p.kind] || p.kind}</div><div class="li-sub">${esc(p.description || '')} · ${fmtDate(p.date)}${p.settled ? ' · rozliczone' : ''}</div></div><b class="${p.amount < 0 || p.kind === 'advance' ? 'red' : ''}">${money(p.amount)}</b></div>`).join('')}</div>` : emptyState('Brak wpisów', 'Biuro dopisze wypłaty i premie w Rozliczeniach.', 'wallet')}</div>
      ${d.tasks.length ? `<div class="card"><div class="card-head"><h3>Zakończone zlecenia</h3></div><div class="list">${d.tasks.map(t => `<div class="li click" data-go="zlecenia/${t._id}"><div class="grow"><div class="li-title ellipsis">${esc(t.name)}</div><div class="li-sub">${fmtDate(t.completedAt)}${t.hoursWorked ? ` · ${t.hoursWorked} h` : ''}</div></div>${t.clientRating ? `<span class="pill mint">${'★'.repeat(t.clientRating)}</span>` : ''}</div>`).join('')}</div></div>` : ''}`;
  }
  el.addEventListener('click', e => {
    const m = e.target.closest('[data-m]');
    if (m) { const d = new Date(month + '-15'); d.setMonth(d.getMonth() + Number(m.dataset.m)); month = dayKey(d).slice(0, 7); return draw(); }
    const g = e.target.closest('[data-go]');
    if (g) go(g.dataset.go);
  });
  await draw();
}

export default async function zarobki(el, { ctx, query }) {
  await earningsCard(el, { ctx, employeeId: query.osoba });
}
