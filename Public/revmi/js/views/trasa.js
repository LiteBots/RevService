/* Moja trasa (pracownik) — kolejność objazdu, kilometry, „Nawiguj do następnego” */
import { api, esc, icon, fmtTime, go, emptyState, taskPlace, minutesLabel, statusPill, dayKey, addDays, fmtDayLong } from '../core.js';

export default async function trasa(el, { ctx, query }) {
  let day = query.dzien || dayKey(new Date());
  async function draw() {
    ctx.setTitle('Moja trasa', fmtDayLong(day + 'T12:00:00'));
    el.innerHTML = '<div class="skeleton"></div>';
    const r = await api('/v92/my-route?day=' + day);
    const next = r.tasks.find(t => String(t._id) === String(r.next));
    el.innerHTML = `
      <div class="seg">${[[dayKey(new Date()), 'Dziś'], [dayKey(addDays(new Date(), 1)), 'Jutro'], [dayKey(addDays(new Date(), 2)), 'Pojutrze']].map(([k, l]) => `<button data-day="${k}" class="${day === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${next ? `<a class="btn primary lg block" href="${esc(next.navUrl)}" target="_blank" rel="noopener">${icon('nav')} Nawiguj do następnego: ${esc(next.name)}</a>` : ''}
      ${r.km ? `<div class="grid g2"><div class="card kpi"><div class="label">Trasa</div><div class="value">${r.km} km</div></div><div class="card kpi"><div class="label">Jazda</div><div class="value">${minutesLabel(r.minutes)}</div></div></div>` : ''}
      <div class="card">${r.tasks.length ? `<div class="list">${r.tasks.map((t, i) => `<div class="li">
        <span class="avatar" style="background:${t.status === 'completed' ? 'var(--surface-3)' : 'var(--accent)'};color:${t.status === 'completed' ? 'var(--muted)' : '#03241b'}">${i + 1}</span>
        <div class="grow click" data-go="zlecenia/${t._id}" style="cursor:pointer"><div class="li-title ellipsis">${fmtTime(t.dateStart)} · ${esc(t.name)}</div><div class="li-sub ellipsis">${esc(taskPlace(t))}${t.clientName ? ' · ' + esc(t.clientName) : ''}</div></div>
        ${statusPill(t.status)}
        <a class="icon-btn" href="${esc(t.navUrl)}" target="_blank" rel="noopener" aria-label="Nawiguj">${icon('nav')}</a>
        ${t.clientPhone ? `<a class="icon-btn" href="tel:${esc(t.clientPhone)}" aria-label="Zadzwoń">${icon('phone')}</a>` : ''}
      </div>`).join('')}</div>` : emptyState('Brak zleceń tego dnia', '', 'route')}</div>`;
  }
  el.addEventListener('click', e => {
    const d = e.target.closest('[data-day]');
    if (d) { day = d.dataset.day; return draw(); }
    const g = e.target.closest('[data-go]');
    if (g) go(g.dataset.go);
  });
  await draw();
}
