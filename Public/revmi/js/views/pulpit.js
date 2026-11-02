/* Pulpit właściciela — prognoza brutto (tydzień / miesiąc), marża, należności, wymaga uwagi, dziś */
import { S, api, esc, money, icon, fmtTime, fmtDayLong, fmtDay, go, statusPill, emptyState, plural, can } from '../core.js';

export default async function pulpit(el, { ctx }) {
  const first = String(S.me.name || '').split(' ')[0];
  const actions = can('tasks') ? `<button class="btn primary sm" data-new>${icon('plus', 'sm')} <span class="hide-m">Nowe zlecenie</span></button>` : '';
  ctx.setTitle(`Dzień dobry, ${first}`, fmtDayLong(new Date()));

  const d = await api('/v2/dashboard');
  const gross = d.gross ? 'brutto' : 'netto+VAT';
  const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
  const max = Math.max(1, ...d.series.map(s => s.done + s.planned));
  ctx.setTitle(`Dzień dobry, ${first}`, `${fmtDayLong(new Date())} · ${plural(d.today.length, 'zlecenie', 'zlecenia', 'zleceń')} dziś`, actions);
  document.querySelector('[data-new]')?.addEventListener('click', () => import('../taskform.js').then(m => m.openTaskForm()));

  const lvl = { high: 'var(--red)', mid: 'var(--amber)', low: 'var(--blue)' };
  el.innerHTML = `
    <div class="grid g4">
      <div class="card hero kpi click" data-go="zlecenia?okres=tydzien">
        <div class="label">Zarobimy w tym tygodniu · ${gross}</div>
        <div class="value lg">${money(d.week.total)}</div>
        <div class="hint">${plural(d.week.count, 'zlecenie', 'zlecenia', 'zleceń')} · <span class="accent">${money(d.week.done)} już zrobione</span></div>
        <div class="progress"><i style="width:${pct(d.week.done, d.week.total)}%"></i></div>
      </div>
      <div class="card hero kpi click" data-go="zlecenia?okres=miesiac">
        <div class="label">Zarobimy w tym miesiącu · ${gross}</div>
        <div class="value lg">${money(d.month.total)}</div>
        <div class="hint">${plural(d.month.count, 'zlecenie', 'zlecenia', 'zleceń')}${d.month.goal ? ` · cel ${money(d.month.goal)} (${d.month.goalPct}%)` : ` · <span class="accent">${money(d.month.planned)} do zrobienia</span>`}</div>
        <div class="progress"><i style="width:${d.month.goal ? Math.min(100, d.month.goalPct) : pct(d.month.done, d.month.total)}%"></i></div>
      </div>
      <div class="card kpi">
        <div class="label">Marża (miesiąc)</div>
        <div class="value">${d.margin.pct === null ? '—' : d.margin.pct + '%'}</div>
        <div class="hint">${d.margin.diff === null ? `zysk ${money(d.margin.profit)}` : `<span class="${d.margin.diff >= 0 ? 'accent' : 'red'}">${d.margin.diff >= 0 ? '▲' : '▼'} ${Math.abs(d.margin.diff)} pp.</span> vs poprzedni miesiąc`}</div>
      </div>
      <div class="card kpi click" data-go="finanse/naleznosci">
        <div class="label">Do zapłaty od klientów</div>
        <div class="value">${money(d.receivables.total)}</div>
        <div class="hint ${d.receivables.overdue ? 'red' : ''}">${d.receivables.overdue ? plural(d.receivables.overdue, 'płatność po terminie', 'płatności po terminie', 'płatności po terminie') : plural(d.receivables.count, 'zlecenie', 'zlecenia', 'zleceń') + ' czeka na zapłatę'}</div>
      </div>
    </div>

    <div class="split">
      <div class="card">
        <div class="card-head"><h3>Przychód ${gross} · tygodnie</h3><div class="legend"><span><i></i>zrobione</span><span><i class="plan"></i>zaplanowane</span></div></div>
        <div class="bars">${d.series.map(s => `<div class="bar ${s.current ? 'now' : ''}" title="${esc(s.label)}: ${money(s.done + s.planned)}">
          ${s.planned ? `<b class="plan" style="height:${(s.planned / max) * 100}%"></b>` : ''}${s.done ? `<b style="height:${(s.done / max) * 100}%"></b>` : ''}${!s.done && !s.planned ? '<b style="height:2px;opacity:.3"></b>' : ''}
          <span>${esc(s.label)}</span></div>`).join('')}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Wymaga uwagi</h3>${d.newQuotes ? `<button class="btn sm" data-go="wyceny">${plural(d.newQuotes, 'wycena', 'wyceny', 'wycen')}</button>` : ''}</div>
        ${d.attention.length ? `<div class="list">${d.attention.map(a => `<div class="li click" data-go="${esc(a.link.replace(/^#\//, ''))}"><span class="dot" style="background:${lvl[a.level]}"></span><div class="grow"><div class="small b">${esc(a.text)}</div>${a.when ? `<div class="li-sub">${fmtDay(a.when)} ${fmtTime(a.when)}</div>` : ''}</div>${icon('right', 'sm')}</div>`).join('')}</div>` : emptyState('Wszystko pod kontrolą', 'Brak pilnych spraw.', 'check')}
      </div>
    </div>

    <div class="split">
      <div class="card">
        <div class="card-head"><h3>Dziś</h3><button class="btn ghost sm" data-go="grafik">Grafik ${icon('right', 'sm')}</button></div>
        ${d.today.length ? `<div class="list">${d.today.map(t => `<div class="li click" data-go="zlecenia/${t._id}"><span class="time">${fmtTime(t.dateStart)}</span>${statusPill(t.status)}<div class="grow"><div class="li-title ellipsis">${esc(t.name)}</div><div class="li-sub ellipsis">${esc(t.place || '')}</div></div><div class="hide-m small muted" style="text-align:right">${esc(t.workers.join(', ') || 'bez ekipy')}<br><b class="num" style="color:var(--text)">${money(t.amount)}</b></div></div>`).join('')}</div>` : emptyState('Dziś bez zleceń', 'Zaplanuj coś w grafiku.', 'calendar')}
      </div>
      <div class="col" style="gap:14px">
        <div class="card">
          <div class="card-head"><h3>Oddziały · ten miesiąc</h3></div>
          ${d.branches.length ? d.branches.map(b => `<div class="hbar"><span class="ellipsis"><span class="dot" style="background:${esc(b.color || 'var(--accent)')}"></span> ${esc(b.name)}</span><span class="track"><i style="width:${(b.total / Math.max(...d.branches.map(x => x.total), 1)) * 100}%;background:${esc(b.color || 'var(--accent)')}"></i></span><b class="num">${money(b.total)}</b></div>`).join('') : '<p class="muted small">Brak zleceń w tym miesiącu.</p>'}
        </div>
        ${d.budgets.length ? `<div class="card click" data-go="finanse/budzety">
          <div class="card-head"><h3>Budżety · ten miesiąc</h3>${icon('right', 'sm')}</div>
          ${d.budgets.slice(0, 4).map(b => `<div style="margin-bottom:8px"><div class="row between small"><span>${esc(b.category)}</span><b class="${b.level === 'over' ? 'red' : b.level === 'warn' ? 'amber' : ''}">${b.pct}%</b></div><div class="progress ${b.level}"><i style="width:${Math.min(100, b.pct)}%"></i></div></div>`).join('')}
        </div>` : ''}
      </div>
    </div>`;

  el.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });
}
