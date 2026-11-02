/* Więcej (pracownik) — ranking, usterki, urlopy, zamiany zmian, dyspozycyjność, zarobki, notatnik */
import { S, icon, esc, go } from '../core.js';
import { rankingPart, faultsPart, leavesPart, swapsPart, availabilityPart } from '../parts.js';

const TILES = [
  ['zarobki', 'wallet', 'Moje zarobki', 'Godziny, premie, wypłata'],
  ['ranking', 'trophy', 'Ranking', 'Punkty i odznaki'],
  ['usterki', 'wrench', 'Zgłoś usterkę', 'Bus, sprzęt — ze zdjęciem'],
  ['zamiany', 'swap', 'Zamiana zmiany', 'Poproś kolegę o zastępstwo'],
  ['dyspozycyjnosc', 'calendar', 'Dyspozycyjność', 'Kiedy możesz pracować'],
  ['urlopy', 'sun', 'Urlopy', 'Wnioski i decyzje'],
  ['notatnik', 'note', 'Notatnik', 'Twoje notatki i listy'],
  ['ustawienia', 'settings', 'Ustawienia', 'Hasło, PIN, powiadomienia']
];
const TITLES = { ranking: 'Ranking ekipy', usterki: 'Usterki', zamiany: 'Zamiany zmian', dyspozycyjnosc: 'Moja dyspozycyjność', urlopy: 'Urlopy' };

export default async function wiecej(el, { params, query, ctx }) {
  const tab = params[0];
  if (!tab) {
    ctx.setTitle('Więcej', S.me.name);
    el.innerHTML = `<div class="grid g2">${TILES.map(([k, ic, t, sub]) => `<button class="card click row" data-go="${['zarobki', 'notatnik', 'ustawienia'].includes(k) ? k : 'wiecej/' + k}" style="text-align:left;gap:12px">${icon(ic, 'lg')}<div class="grow"><b>${esc(t)}</b><div class="small muted">${esc(sub)}</div></div>${k === 'zamiany' && S.badges.grafik ? `<span class="pill mint">${S.badges.grafik}</span>` : ''}${icon('right', 'sm')}</button>`).join('')}</div>`;
    el.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });
    return;
  }
  ctx.setTitle(TITLES[tab] || 'Więcej', '', `<button class="btn ghost sm" data-back>${icon('left', 'sm')} Więcej</button>`);
  document.querySelector('[data-back]')?.addEventListener('click', () => go('wiecej'));
  el.innerHTML = '<div class="col" data-part style="gap:12px"></div>';
  const part = el.querySelector('[data-part]');
  if (tab === 'ranking') return rankingPart(part);
  if (tab === 'usterki') return faultsPart(part, { openNew: query.nowa === '1' });
  if (tab === 'urlopy') return leavesPart(part);
  if (tab === 'zamiany') return swapsPart(part);
  if (tab === 'dyspozycyjnosc') return availabilityPart(part);
  go('wiecej');
}
