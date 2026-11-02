/* Powiadomienia — skrzynka powiadomień (te same co push) */
import { api, esc, icon, ago, go, emptyState, S } from '../core.js';

export default async function powiadomienia(el, { ctx }) {
  const r = await api('/notifications');
  ctx.setTitle('Powiadomienia', r.unread ? `${r.unread} nieprzeczytanych` : 'Wszystko przeczytane', r.unread ? '<button class="btn sm" data-all>Oznacz wszystkie</button>' : '');
  document.querySelector('[data-all]')?.addEventListener('click', async () => { await api('/notifications/read', { method: 'POST', body: {} }); S.hooks.refreshBadges?.(); el.innerHTML = ''; powiadomienia(el, { ctx }); });
  el.innerHTML = `<div class="card">${r.notifications.length ? `<div class="list">${r.notifications.map(n => `<div class="li click" data-n="${n._id}" data-url="${esc(n.url || '')}"><span class="dot" style="background:${n.read ? 'transparent' : 'var(--accent)'}"></span><div class="grow"><div class="li-title">${esc(n.title)}</div><div class="li-sub">${esc(n.body || '')}</div></div><span class="tiny muted">${ago(n.createdAt)}</span></div>`).join('')}</div>` : emptyState('Brak powiadomień', '', 'bell')}</div>
    ${'Notification' in window && Notification.permission !== 'granted' ? `<div class="card hero row between"><div><b>${icon('bell', 'sm')} Włącz powiadomienia push</b><div class="small muted">Nowe zlecenia, zmiany w grafiku, wiadomości — od razu w telefonie.</div></div><button class="btn primary sm" data-push>Włącz</button></div>` : ''}`;
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-push]')) { try { await S.hooks.enablePush(); e.target.closest('.card').remove(); } catch (error) { alert(error.message); } return; }
    const n = e.target.closest('[data-n]');
    if (!n) return;
    await api('/notifications/read', { method: 'POST', body: { ids: [n.dataset.n] } }).catch(() => null);
    S.hooks.refreshBadges?.();
    const url = n.dataset.url;
    if (url && url.includes('#')) location.hash = url.slice(url.indexOf('#'));
  });
}
