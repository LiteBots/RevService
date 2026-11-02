/* Czat zespołu — kanały (cała ekipa, oddziały, biuro), zdjęcia, @wzmianki, odświeżanie co kilka sekund */
import { S, api, esc, icon, fmtTime, relDay, dayKey, avatar, toast, pickPhotos, lightbox, go, emptyState, isOffice } from '../core.js';

export default async function czat(el, { params, ctx }) {
  let channels = [];
  let me = '';
  let current = params[0] || null;
  let messages = [];
  let poll = null;

  ctx.setTitle('Czat ekipy', 'Kanały zespołu RevSerwis');
  el.innerHTML = `<div class="chat-wrap ${current ? 'in-channel' : ''}">
    <div class="card chat-list" data-list></div>
    <div class="card chat-pane" data-pane>${emptyState('Wybierz kanał', '', 'chat')}</div>
  </div>`;
  const wrap = el.querySelector('.chat-wrap');
  const list = el.querySelector('[data-list]');
  const pane = el.querySelector('[data-pane]');

  async function loadChannels() {
    const r = await api('/v2/chat/channels');
    channels = r.channels;
    me = r.me;
    list.innerHTML = `<div class="row between" style="padding:4px 6px 10px"><b>Kanały</b>${isOffice() ? `<button class="btn ghost sm" data-new-ch>${icon('plus', 'sm')}</button>` : ''}</div>` + channels.map(c => `<div class="channel ${String(c._id) === String(current) ? 'on' : ''}" data-ch="${c._id}">
      <span class="hash">${c.kind === 'office' ? icon('lock', 'sm') : '#'}</span>
      <div class="grow" style="min-width:0"><div class="row between"><b class="ellipsis">${esc(c.name)}</b>${c.lastMessageAt ? `<span class="tiny muted">${dayKey(c.lastMessageAt) === dayKey(new Date()) ? fmtTime(c.lastMessageAt) : relDay(c.lastMessageAt)}</span>` : ''}</div>
      <div class="row between"><span class="small muted ellipsis">${esc(c.lastMessage || 'Brak wiadomości')}</span>${c.unread ? `<span class="pill mint">${c.unread}</span>` : ''}</div></div></div>`).join('');
    if (!current && channels.length && window.innerWidth > 960) open(channels[0]._id);
  }

  const fmtText = t => esc(t).replace(/@([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]+)/g, '<span class="mention">@$1</span>');

  function paintMessages(scroll = true) {
    const box = pane.querySelector('.msgs');
    if (!box) return;
    let lastDay = '';
    box.innerHTML = messages.length ? messages.map(m => {
      const day = dayKey(m.createdAt);
      const sep = day !== lastDay ? `<div class="day-sep">${relDay(m.createdAt)}</div>` : '';
      lastDay = day;
      const mine = m.authorKey === me;
      const color = S.data.employees.find(e => String(e._id) === m.authorKey)?.color || '#03F0BA';
      return `${sep}<div class="msg ${mine ? 'me' : ''}">${mine ? '' : avatar(m.authorName, color, 'sm')}<div class="bubble">${mine ? '' : `<small>${esc(m.authorName)}</small>`}${m.deleted ? '<i class="muted">wiadomość usunięta</i>' : fmtText(m.text)}${m.hasPhoto ? `<img src="/api/v2/chat/messages/${m._id}/photo" data-img="/api/v2/chat/messages/${m._id}/photo" alt="zdjęcie">` : ''}<small style="text-align:right;margin:3px 0 0">${fmtTime(m.createdAt)}${mine && !m.deleted ? ` · <span data-del="${m._id}" style="cursor:pointer">usuń</span>` : ''}</small></div></div>`;
    }).join('') : '<div class="empty">Napisz pierwszą wiadomość 👋</div>';
    if (scroll) box.scrollTop = box.scrollHeight;
  }

  async function open(id) {
    current = id;
    wrap.classList.add('in-channel');
    if (location.hash !== `#/czat/${id}`) history.replaceState(null, '', `#/czat/${id}`);
    list.querySelectorAll('[data-ch]').forEach(c => c.classList.toggle('on', c.dataset.ch === String(id)));
    const r = await api(`/v2/chat/channels/${id}/messages`);
    messages = r.messages;
    pane.innerHTML = `
      <div class="chat-head"><button class="icon-btn hide-d" data-back>${icon('left')}</button><span class="hash" style="width:32px;height:32px;border-radius:10px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font-weight:800">#</span><div class="grow"><b>${esc(r.channel.name)}</b><div class="tiny muted">${r.channel.kind === 'office' ? 'Tylko biuro' : r.channel.kind === 'branch' ? 'Oddział' : 'Wszyscy w firmie'}</div></div>${isOffice() ? `<button class="btn ghost sm" data-pin>${icon('pin', 'sm')} Przypnij</button>` : ''}</div>
      ${r.channel.pinnedText ? `<div class="chat-pin">📌 ${esc(r.channel.pinnedText)}</div>` : ''}
      <div class="msgs"></div>
      <div class="composer"><button class="icon-btn" data-photo aria-label="Zdjęcie">${icon('camera')}</button><textarea class="input" rows="1" placeholder="Napisz do ekipy… (@imię, żeby oznaczyć)" data-text></textarea><button class="btn primary" data-send aria-label="Wyślij" style="border-radius:50%;width:42px;height:42px;padding:0">${icon('send', 'sm')}</button></div>`;
    paintMessages();
    S.hooks.refreshBadges?.();
    loadChannels();
  }

  async function send(photo) {
    const ta = pane.querySelector('[data-text]');
    const text = ta.value.trim();
    if (!text && !photo) return;
    ta.value = '';
    ta.style.height = '';
    try {
      const r = await api(`/v2/chat/channels/${current}/messages`, { method: 'POST', body: { text, photo } });
      messages.push(r.message);
      paintMessages();
    } catch (error) { toast(error.message, 'err'); ta.value = text; }
  }

  async function refresh() {
    if (!current || document.visibilityState !== 'visible') return;
    const last = messages[messages.length - 1]?.createdAt;
    try {
      const r = await api(`/v2/chat/channels/${current}/messages${last ? '?after=' + encodeURIComponent(last) : ''}`);
      if (r.messages.length) {
        const box = pane.querySelector('.msgs');
        const atBottom = box && box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        const ids = new Set(messages.map(m => String(m._id)));
        messages.push(...r.messages.filter(m => !ids.has(String(m._id))));
        paintMessages(atBottom);
      }
    } catch { /* offline */ }
  }

  el.addEventListener('click', async e => {
    const ch = e.target.closest('[data-ch]');
    if (ch) return open(ch.dataset.ch);
    if (e.target.closest('[data-back]')) { current = null; wrap.classList.remove('in-channel'); history.replaceState(null, '', '#/czat'); return loadChannels(); }
    if (e.target.closest('[data-send]')) return send();
    if (e.target.closest('[data-photo]')) { const [p] = await pickPhotos({ multiple: false, camera: false }); if (p) send(p); return; }
    const img = e.target.closest('[data-img]');
    if (img) return lightbox(img.dataset.img);
    const del = e.target.closest('[data-del]');
    if (del) { await api(`/v2/chat/messages/${del.dataset.del}`, { method: 'DELETE' }); const m = messages.find(x => String(x._id) === del.dataset.del); if (m) { m.deleted = true; m.text = ''; m.hasPhoto = false; } return paintMessages(false); }
    if (e.target.closest('[data-pin]')) { const text = prompt('Przypięta wiadomość (puste = usuń)', ''); if (text === null) return; await api(`/v2/chat/channels/${current}`, { method: 'PUT', body: { pinnedText: text } }); return open(current); }
    if (e.target.closest('[data-new-ch]')) { const name = prompt('Nazwa nowego kanału'); if (!name) return; await api('/v2/chat/channels', { method: 'POST', body: { name } }); return loadChannels(); }
  });
  el.addEventListener('keydown', e => { if (e.target.matches('[data-text]') && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  el.addEventListener('input', e => { if (e.target.matches('[data-text]')) { e.target.style.height = ''; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; } });

  await loadChannels();
  if (current) open(current);
  poll = setInterval(refresh, 5000);
  return () => clearInterval(poll);
}

export { go };
