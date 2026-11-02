/* Więcej (pracownik) — ranking, usterki, urlopy, zamiany zmian, dyspozycyjność, zarobki, notatnik */
import { S, icon, tile, esc, go } from '../core.js';
import { rankingPart, faultsPart, leavesPart, swapsPart, availabilityPart } from '../parts.js';

const TILES = [
  ['zarobki', 'wallet', 'lime', 'Moje zarobki', 'Godziny, premie, wypłata'],
  ['ranking', 'trophy', 'amber', 'Ranking', 'Punkty i odznaki'],
  ['usterki', 'wrench', 'red', 'Zgłoś usterkę', 'Bus, sprzęt — ze zdjęciem'],
  ['zamiany', 'swap', 'cyan', 'Zamiana zmiany', 'Poproś kolegę o zastępstwo'],
  ['dyspozycyjnosc', 'calendar', 'violet', 'Dyspozycyjność', 'Kiedy możesz pracować'],
  ['urlopy', 'sun', 'orange', 'Urlopy', 'Wnioski i decyzje'],
  ['notatnik', 'note', 'slate', 'Notatnik', 'Twoje notatki i listy'],
  ['ustawienia', 'settings', 'slate', 'Ustawienia', 'Hasło, PIN, Face ID']
];
const TITLES = { ranking: 'Ranking ekipy', usterki: 'Usterki', zamiany: 'Zamiany zmian', dyspozycyjnosc: 'Moja dyspozycyjność', urlopy: 'Urlopy' };

export default async function wiecej(el, { params, query, ctx }) {
  const tab = params[0];
  if (!tab) {
    ctx.setTitle('Więcej', S.me.name);
    el.innerHTML = `<div class="card"><div class="apps-label">Wszystkie moduły</div><div class="apps">${TILES.map(([k, ic, c, t]) => `<button class="app-ic" data-go="${['zarobki', 'notatnik', 'ustawienia', 'czas', 'trasa'].includes(k) ? k : 'wiecej/' + k}">${tile(ic, c, 'xl')}${k === 'zamiany' && S.badges.grafik ? `<span class="count">${S.badges.grafik}</span>` : ''}<span>${esc(t)}</span></button>`).join('')}</div></div>`;
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
