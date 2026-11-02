/* Pulpit właściciela — prognoza brutto (tydzień / miesiąc) z celem, wykres, dziś w terenie, mapa ekip, budżety, ranking, wymaga uwagi */
import { S, api, esc, money, icon, tile, serviceTile, fmtTime, fmtDayLong, fmtDay, go, statusPill, emptyState, plural, can, avatar, local } from '../core.js';
import { mountAreaChart, sparkline, osmMap } from '../charts.js';

const LVL = { high: ['alert', 'red'], mid: ['clock', 'amber'], low: ['bell', 'blue'] };
const KIND = { receivable: ['receipt', 'orange'], quote: ['file', 'amber'], reschedule: ['sms', 'blue'], fault: ['wrench', 'red'], leave: ['sun', 'amber'], swap: ['swap', 'cyan'], stock: ['box', 'amber'], package: ['layers', 'indigo'], budget: ['wallet', 'lime'], crew: ['users', 'teal'], fleet: ['car', 'slate'] };

export default async function pulpit(el, { ctx }) {
  const first = String(S.me.name || '').split(' ')[0];
  ctx.setTitle('Pulpit', fmtDayLong(new Date()));

  const [d, rank, route] = await Promise.all([
    api('/v2/dashboard'),
    api('/v2/ranking').catch(() => null),
    can('dispatch') ? api('/v92/route').catch(() => null) : Promise.resolve(null)
  ]);
  const gross = d.gross ? 'brutto' : 'netto + VAT';
  const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
  const weekPct = d.week.goal ? d.week.goalPct : pct(d.week.done, d.week.total);
  const monthPct = d.month.goal ? d.month.goalPct : pct(d.month.done, d.month.total);
  const crews = new Set(d.today.flatMap(t => t.workers)).size;
  ctx.setTitle('Pulpit', fmtDayLong(new Date()));

  const totals = d.series.map(s => s.done + s.planned);
  const prevTotal = d.prevMonth?.total || 0;
  const monthDiff = prevTotal ? Math.round(((d.month.total - prevTotal) / prevTotal) * 100) : null;

  // Mapa: zlecenia dnia (numer = kolejność godzinowa) + ekipy z ostatnią pozycją GPS
  const mapPoints = route ? [
    ...route.tasks.filter(t => t.geo?.lat).map((t, i) => ({ lat: t.geo.lat, lon: t.geo.lon, label: i + 1, color: t.status === 'completed' ? 'slate' : t.status === 'progress' ? 'mint' : 'blue', title: `${fmtTime(t.dateStart)} ${t.name}` })),
    ...(route.crews || []).map(c => ({ lat: c.lat, lon: c.lon, label: '●', color: 'orange', title: `Ekipa: ${c.by || ''}` }))
  ] : [];

  el.innerHTML = `
    <div class="page-head">
      <div><h2>Dzień dobry, ${esc(first)} 👋</h2><p>Dziś ${plural(d.today.length, 'zlecenie', 'zlecenia', 'zleceń')}${crews ? `, ${plural(crews, 'osoba', 'osoby', 'osób')} w terenie` : ''}. ${d.week.goal ? `Tydzień: ${d.week.goalPct}% celu.` : ''}</p></div>
      <div class="row wrap">${d.attention.length ? `<span class="pill amber">${icon('alert', 'sm')} ${plural(d.attention.length, 'sprawa', 'sprawy', 'spraw')} do uwagi</span>` : `<span class="pill mint">${icon('check', 'sm')} Wszystko pod kontrolą</span>`}${can('finance') ? `<button class="btn" data-go="finanse/raporty">${icon('download')} Raport PDF</button>` : ''}</div>
    </div>

    <div class="grid pulpit-kpis">
      <div class="card hero kpi click c-mint" data-go="zlecenia?okres=tydzien">
        <div class="kpi-top">${tile('trend', 'mint', 'lg')}<div class="label">Zarobimy w tym tygodniu<div class="tiny muted-2">${gross} · zaplanowane + wykonane</div></div>${d.week.goal ? `<span class="pill ${d.week.goalPct >= 100 ? 'mint' : ''}">${d.week.goalPct}% celu</span>` : ''}</div>
        <div class="value lg" style="margin-top:16px">${money(d.week.total).replace(' zł', '')} <small>zł</small></div>
        <div class="progress"><i style="width:${Math.min(100, weekPct)}%"></i></div>
        <div class="row between small muted" style="margin-top:8px"><span>${plural(d.week.count, 'zlecenie', 'zlecenia', 'zleceń')} · <span class="accent">${money(d.week.done)} zrobione</span></span><span>${d.week.goal ? `cel ${money(d.week.goal)}` : ''}</span></div>
      </div>
      <div class="card kpi click c-blue" data-go="zlecenia?okres=miesiac"><div class="glow"></div>
        <div class="kpi-top">${tile('calendar', 'blue')}<div class="label">W tym miesiącu</div></div>
        <div class="value">${money(d.month.total).replace(' zł', '')} <small>zł</small></div>
        <div class="row between" style="margin-top:6px">${monthDiff === null ? `<span class="hint">${d.month.goal ? `cel ${money(d.month.goal)} · ${d.month.goalPct}%` : `${money(d.month.planned)} do zrobienia`}</span>` : `<span class="${monthDiff >= 0 ? 'up' : 'down'}">${monthDiff >= 0 ? '▲' : '▼'} ${Math.abs(monthDiff)}% vs poprz. mies.</span>`}${sparkline(totals, '#5b9bff')}</div>
        ${d.month.goal ? `<div class="progress c-blue"><i style="width:${Math.min(100, monthPct)}%"></i></div>` : ''}
      </div>
      <div class="card kpi c-violet"><div class="glow"></div>
        <div class="kpi-top">${tile('chart', 'violet')}<div class="label">Marża (miesiąc)</div></div>
        <div class="value">${d.margin.pct === null ? '—' : d.margin.pct + '%'}</div>
        <div class="row between" style="margin-top:6px">${d.margin.diff === null ? `<span class="hint">zysk ${money(d.margin.profit)}</span>` : `<span class="${d.margin.diff >= 0 ? 'up' : 'down'}">${d.margin.diff >= 0 ? '▲' : '▼'} ${Math.abs(d.margin.diff)} pp. vs poprz.</span>`}${sparkline(d.series.map(s => s.done), '#a77bff')}</div>
      </div>
      <div class="card kpi click c-orange" data-go="finanse/naleznosci"><div class="glow"></div>
        <div class="kpi-top">${tile('receipt', 'orange')}<div class="label">Należności</div></div>
        <div class="value">${money(d.receivables.total).replace(' zł', '')} <small>zł</small></div>
        <div class="row between" style="margin-top:6px">${d.receivables.overdue ? `<span class="down">${plural(d.receivables.overdue, 'po terminie', 'po terminie', 'po terminie')}</span><span class="pill red">przypomnij</span>` : `<span class="hint">${plural(d.receivables.count, 'zlecenie czeka', 'zlecenia czekają', 'zleceń czeka')} na zapłatę</span>`}</div>
      </div>
    </div>

    <div class="card" data-stats></div>

    <div class="split">
      <div class="col" style="gap:18px">
        <div class="card">
          <div class="card-head">${tile('chart', 'mint', 'sm')}<h3>Przychód ${gross} · tygodnie</h3><div class="legend"><span><i></i>zrobione + zaplanowane</span></div></div>
          <div data-chart></div>
        </div>
        <div class="card">
          <div class="card-head">${tile('clock', 'blue', 'sm')}<h3>Dziś w terenie</h3><span class="pill blue">${plural(d.today.length, 'zlecenie', 'zlecenia', 'zleceń')}</span><button class="btn ghost sm" data-go="grafik">Grafik ${icon('right', 'sm')}</button></div>
          ${d.today.length ? `<div class="list">${d.today.map(t => `<div class="li click" data-go="zlecenia/${t._id}">
            <span class="time mono">${fmtTime(t.dateStart)}</span>${serviceTile(t.type)}
            <div class="grow"><div class="li-title ellipsis">${esc(t.name)}</div><div class="li-sub ellipsis">${esc(t.type || '')}${t.place ? ' · ' + esc(t.place) : ''}</div></div>
            <span class="avatars hide-m">${t.workers.slice(0, 3).map(n => avatar(n, workerColor(n), 'sm')).join('')}</span>
            <span class="hide-m">${statusPill(t.status)}</span>
            <b class="num" style="min-width:80px;text-align:right">${money(t.amount)}</b></div>`).join('')}</div>` : emptyState('Dziś bez zleceń', 'Zaplanuj coś w grafiku.', 'calendar')}
        </div>
      </div>

      <div class="col" style="gap:18px">
        ${route ? `<div class="card pad-0" style="position:relative">
          <div class="osm-head">${tile('pin', 'cyan', 'sm')}<h3>Ekipy na mapie</h3>${route.crews?.length ? '<span class="pill mint">● na żywo</span>' : ''}</div>
          ${osmMap(mapPoints, { w: 620, h: 270 })}
          ${route.km ? `<div class="osm-legend"><span>${icon('route', 'sm')} trasa dnia ${route.km} km</span>${route.plannedKm && route.plannedKm > route.km ? `<span>oszczędność ${Math.round((route.plannedKm - route.km) * 10) / 10} km po ułożeniu</span>` : ''}</div>` : ''}
        </div>` : ''}
        <div class="grid g2">
          ${d.budgets.length ? `<div class="card click" data-go="finanse/budzety"><div class="card-head">${tile('wallet', 'lime', 'sm')}<h3>Budżety</h3></div>
            ${d.budgets.slice(0, 3).map(b => `<div style="margin-bottom:10px"><div class="row between small"><span class="ellipsis">${esc(b.category)}</span><b class="${b.level === 'over' ? 'red' : b.level === 'warn' ? 'amber' : ''}">${b.pct}%</b></div><div class="progress ${b.level} c-lime" style="margin-top:5px"><i style="width:${Math.min(100, b.pct)}%"></i></div></div>`).join('')}</div>`
          : `<div class="card click" data-go="finanse/budzety"><div class="card-head">${tile('wallet', 'lime', 'sm')}<h3>Budżety</h3></div><p class="small muted">Ustaw limity kosztów (paliwo, wywóz, materiały), a pulpit ostrzeże przy 80%.</p></div>`}
          <div class="card click" data-go="zespol/ranking"><div class="card-head">${tile('trophy', 'amber', 'sm')}<h3>Ranking</h3></div>
            ${rank?.ranking?.length ? rank.ranking.slice(0, 3).map((p, i) => `<div class="row" style="margin-bottom:9px"><b class="small ${i ? 'muted' : ''}" style="width:12px">${i + 1}</b>${avatar(p.name, p.color, 'sm')}<span class="grow small b ellipsis">${esc(p.name)}</span><span class="small mono" style="color:${['#ffd34f', 'var(--text-2)', '#ff9a4d'][i]}">${p.points}</span></div>`).join('') : '<p class="small muted">Punkty pojawią się po pierwszych zakończonych zleceniach.</p>'}
          </div>
        </div>
        <div class="card">
          <div class="card-head">${tile('alert', 'red', 'sm')}<h3>Wymaga uwagi</h3>${d.attention.length ? `<span class="pill red">${d.attention.length}</span>` : ''}</div>
          ${d.attention.length ? `<div class="list">${d.attention.map(a => { const [ic, c] = KIND[a.kind] || LVL[a.level] || LVL.low; return `<div class="li click" data-go="${esc(a.link.replace(/^#\//, ''))}">${tile(ic, c, 'sm')}<div class="grow"><div class="small b">${esc(a.text)}</div>${a.when ? `<div class="li-sub">${fmtDay(a.when)} ${fmtTime(a.when)}</div>` : ''}</div>${icon('right', 'sm')}</div>`; }).join('')}</div>` : emptyState('Wszystko pod kontrolą', 'Brak pilnych spraw.', 'check')}
        </div>
        ${d.branches.length > 1 ? `<div class="card"><div class="card-head">${tile('pin', 'teal', 'sm')}<h3>Oddziały · ten miesiąc</h3></div>
          ${d.branches.map(b => `<div class="hbar"><span class="ellipsis"><span class="dot" style="background:${esc(b.color || 'var(--accent)')}"></span> ${esc(b.name)}</span><span class="track"><i style="width:${(b.total / Math.max(...d.branches.map(x => x.total), 1)) * 100}%;background:${esc(b.color || 'var(--accent)')}"></i></span><b class="num">${money(b.total)}</b></div>`).join('')}</div>` : ''}
      </div>
    </div>`;

  // Statystyki: dziś / tydzień / miesiąc (wybór zapamiętany na tym urządzeniu)
  let period = local.get('statsPeriod', 'week');
  const drawStats = () => {
    const box = el.querySelector('[data-stats]');
    if (!d.stats) { box.remove(); return; }
    const st = d.stats[period];
    const label = { day: 'dziś', week: 'w tym tygodniu', month: 'w tym miesiącu' }[period];
    box.innerHTML = `
      <div class="card-head">${tile('chart', 'indigo', 'sm')}<h3>Statystyki ${label}</h3>
        <div class="seg">${[['day', 'Dziś'], ['week', 'Tydzień'], ['month', 'Miesiąc']].map(([k, l]) => `<button data-period="${k}" class="${period === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="grid stats-grid">
        <div class="stat c-mint">${tile('trend', 'mint')}<div><div class="label">Przychód (zakończone)</div><div class="value">${money(st.revenue)}</div><div class="hint">${gross}</div></div></div>
        <div class="stat c-violet">${tile('check', 'violet')}<div><div class="label">Zakończone zlecenia</div><div class="value">${st.completed}</div><div class="hint">z ${plural(st.count, 'zlecenia', 'zleceń', 'zleceń')} w okresie</div></div></div>
        <div class="stat c-blue">${tile('calendar', 'blue')}<div><div class="label">Zarobimy łącznie</div><div class="value">${money(st.forecast)}</div><div class="hint">${money(st.planned)} jeszcze do zrobienia</div></div></div>
        <div class="stat c-teal">${tile('users', 'teal')}<div><div class="label">Pracownicy</div><div class="value">${d.stats.employees}</div><div class="hint">${plural(st.workers, 'osoba pracuje', 'osoby pracują', 'osób pracuje')} ${label}</div></div></div>
        <div class="stat c-orange">${tile('receipt', 'orange')}<div><div class="label">Podatek ${st.taxRate}%</div><div class="value">${money(st.tax)}</div><div class="hint">zostaje <b style="color:var(--text)">${money(st.afterTax)}</b></div></div></div>
      </div>
      <p class="tiny muted" style="margin-top:12px">Podatek = ${st.taxRate}% przychodu z zakończonych zleceń (ryczałt). Od wszystkich zaplanowanych w okresie byłoby to ${money(st.taxForecast)}. Stawkę zmienisz w Ustawienia → Firma.</p>`;
  };
  drawStats();
  el.addEventListener('click', e => { const p = e.target.closest('[data-period]'); if (p) { period = p.dataset.period; local.set('statsPeriod', period); drawStats(); } });

  const current = d.series.findIndex(s => s.current);
  const stop = mountAreaChart(el.querySelector('[data-chart]'), d.series.map(s => ({ label: s.label, value: s.done + s.planned })), { mark: current >= 0 ? current : d.series.length - 1 });
  el.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });
  return stop;
}

function workerColor(name) {
  return S.data?.employees?.find(e => e.name === name)?.color || '#03F0BA';
}
