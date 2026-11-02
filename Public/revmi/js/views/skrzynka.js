/* Skrzynka — wiadomości z formularza kontaktowego + czaty klientów w zleceniach (jedno miejsce zamiast trzech zakładek) */
import { S, api, esc, icon, ago, go, toast, busy, emptyState, fmtDateTime, confirmBox, reloadData, plural } from '../core.js';

const MSTAT = { new: ['Nowa', 'mint'], read: ['Przeczytana', ''], replied: ['Odpowiedziano', 'blue'], archived: ['Archiwum', ''], spam: ['Spam', 'red'] };

export default async function skrzynka(el, { ctx, params }) {
  let tab = params[0] === 'czaty' ? 'czaty' : 'wiadomosci';
  let msgs = { messages: [], counts: {} };
  let selected = null;

  async function load() {
    [msgs] = await Promise.all([api('/messages?status=' + (tab === 'archiwum' ? 'archived' : 'inbox')), reloadData().catch(() => null)]);
  }
  const chats = () => (S.data.tasks || []).filter(t => t.lastChatAt).sort((a, b) => (b.chatUnreadStaff || 0) - (a.chatUnreadStaff || 0) || new Date(b.lastChatAt) - new Date(a.lastChatAt));

  function draw() {
    const unreadChats = chats().filter(t => t.chatUnreadStaff).length;
    ctx.setTitle('Skrzynka', `${plural(msgs.counts.new || 0, 'nowa wiadomość', 'nowe wiadomości', 'nowych wiadomości')} · ${plural(unreadChats, 'czat', 'czaty', 'czatów')} z klientami do odpowiedzi`);
    const list = tab === 'czaty' ? chats() : msgs.messages;
    el.innerHTML = `
      <div class="seg">${[['wiadomosci', 'Wiadomości', msgs.counts.new], ['czaty', 'Czaty klientów', unreadChats], ['archiwum', 'Archiwum', 0]].map(([k, l, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}${n ? `<span class="count">${n}</span>` : ''}</button>`).join('')}</div>
      <div class="split">
        <div class="card pad-0">${list.length ? `<div class="list" style="padding:0 14px">${tab === 'czaty'
          ? list.map(t => `<div class="li click" data-task="${t._id}"><span class="dot" style="background:${t.chatUnreadStaff ? 'var(--accent)' : 'transparent'}"></span><div class="grow"><div class="li-title ellipsis">${esc(t.clientName || 'Klient')} · ${esc(t.name)}</div><div class="li-sub">${ago(t.lastChatAt)}${t.chatUnreadStaff ? ` · <b class="accent">${t.chatUnreadStaff} nowe</b>` : ''}</div></div>${icon('right', 'sm')}</div>`).join('')
          : list.map(m => `<div class="li click ${String(selected?._id) === String(m._id) ? 'sel' : ''}" data-msg="${m._id}"><span class="dot" style="background:${m.status === 'new' ? 'var(--accent)' : 'transparent'}"></span><div class="grow"><div class="row between"><span class="li-title ellipsis">${esc(m.company || m.name)}</span><span class="tiny muted">${ago(m.createdAt)}</span></div><div class="li-sub ellipsis">${esc(m.topic)} · ${esc(m.message)}</div></div></div>`).join('')}</div>` : emptyState(tab === 'czaty' ? 'Brak czatów z klientami' : 'Skrzynka pusta', tab === 'czaty' ? 'Klienci z kontem w panelu /konto mogą pisać w zleceniu.' : 'Wiadomości z formularza kontaktowego pojawią się tutaj.', 'mail')}</div>
        <div class="card" data-detail>${selected ? detail(selected) : emptyState('Wybierz wiadomość', '', 'mail')}</div>
      </div>`;
  }

  const detail = m => `
    <div class="row between"><span class="pill ${MSTAT[m.status]?.[1] || ''}">${MSTAT[m.status]?.[0] || m.status}</span><span class="small muted">${fmtDateTime(m.createdAt)}</span></div>
    <h2 style="font-size:18px;margin-top:10px">${esc(m.company || m.name)}</h2>
    <p class="small muted">${esc([m.name !== m.company ? m.name : '', m.phone, m.email, m.nip ? 'NIP ' + m.nip : ''].filter(Boolean).join(' · '))}</p>
    <div class="eyebrow" style="margin-top:12px">${esc(m.topic)}</div>
    <p style="white-space:pre-wrap;margin-top:6px">${esc(m.message)}</p>
    <div class="row wrap" style="margin-top:14px;gap:6px">
      ${m.email ? `<a class="btn primary sm" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: ' + m.topic + ' — RevSerwis')}&body=${encodeURIComponent('\n\n> ' + String(m.message).split('\n').join('\n> '))}" data-replied="${m._id}">${icon('mail', 'sm')} Odpowiedz e-mailem</a>` : ''}
      ${m.phone ? `<a class="btn sm" href="tel:${esc(m.phone)}">${icon('phone', 'sm')} Zadzwoń</a><a class="btn sm" href="https://wa.me/48${esc(String(m.phone).replace(/\D/g, '').slice(-9))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      <button class="btn sm" data-to-task="${m._id}">${icon('list', 'sm')} Utwórz wycenę</button>
      <button class="btn sm" data-to-client="${m._id}">${icon('user', 'sm')} Zapisz w CRM</button>
      <button class="btn ghost sm" data-status="${m._id}|archived">Archiwizuj</button>
      <button class="btn ghost sm" data-status="${m._id}|spam">Spam</button>
    </div>
    <label class="field" style="margin-top:14px"><span>Notatka wewnętrzna</span><textarea class="input" data-notes="${m._id}" placeholder="Widzi tylko biuro">${esc(m.internalNotes || '')}</textarea></label>`;

  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; selected = null; await load(); return draw(); }
    const task = e.target.closest('[data-task]');
    if (task) return go('zlecenia/' + task.dataset.task);
    const m = e.target.closest('[data-msg]');
    if (m) { const r = await api('/messages/' + m.dataset.msg); selected = r.message; const x = msgs.messages.find(y => String(y._id) === m.dataset.msg); if (x) x.status = selected.status; draw(); S.hooks.refreshBadges?.(); return; }
    const st = e.target.closest('[data-status]');
    if (st) { const [id, status] = st.dataset.status.split('|'); return busy(st, async () => { await api('/messages/' + id, { method: 'PATCH', body: { status } }); selected = null; await load(); draw(); toast('Zapisano', 'ok'); }); }
    const rep = e.target.closest('[data-replied]');
    if (rep) api('/messages/' + rep.dataset.replied, { method: 'PATCH', body: { status: 'replied' } }).catch(() => null);
    const tt = e.target.closest('[data-to-task]');
    if (tt) return busy(tt, async () => { const r = await api(`/messages/${tt.dataset.toTask}/task`, { method: 'POST' }); toast(r.existing ? 'Wycena już istnieje' : 'Utworzono wycenę', 'ok'); go('zlecenia/' + r.task._id); });
    const tc = e.target.closest('[data-to-client]');
    if (tc) return busy(tc, async () => { const r = await api(`/messages/${tc.dataset.toClient}/client`, { method: 'POST' }); toast('Zapisano w CRM', 'ok'); go('klienci/' + r.client._id); });
  });
  el.addEventListener('change', async e => {
    const n = e.target.closest('[data-notes]');
    if (n) { await api('/messages/' + n.dataset.notes, { method: 'PATCH', body: { internalNotes: n.value } }).catch(err => toast(err.message, 'err')); toast('Notatka zapisana', 'ok'); }
  });
  void confirmBox;

  await load();
  draw();
}
