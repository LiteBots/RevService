/* Notatnik — prywatne i zespołowe notatki, listy zadań, kolory, przypięcie, przypomnienie push */
import { api, esc, icon, ago, toast, busy, modal, emptyState, confirmBox, fmtDateTime, toLocalInput } from '../core.js';

const COLORS = ['default', 'mint', 'blue', 'amber', 'rose', 'violet'];
const SW = { default: 'var(--surface-3)', mint: 'var(--accent)', blue: 'var(--blue)', amber: 'var(--amber)', rose: 'var(--red)', violet: 'var(--violet)' };

export default async function notatnik(el, { ctx, query }) {
  let notes = [];
  let q = '';
  let showArchived = false;
  async function load() { notes = (await api('/notes' + (showArchived ? '?archived=1' : ''))).notes; }
  function draw() {
    ctx.setTitle('Notatnik', `${notes.length} notatek`, `<button class="btn primary sm" data-new>${icon('plus', 'sm')} <span class="hide-m">Notatka</span></button>`);
    document.querySelector('[data-new]').addEventListener('click', () => edit());
    const list = notes.filter(n => !q || [n.title, n.content, ...(n.tags || []), ...(n.checklist || []).map(c => c.text)].some(v => String(v || '').toLowerCase().includes(q))).sort((a, b) => (b.pinned - a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt));
    el.innerHTML = `
      <div class="row wrap between"><input class="input sm" data-q placeholder="Szukaj w notatkach…" value="${esc(q)}" style="width:260px"><button class="chip ${showArchived ? 'on' : ''}" data-arch>Archiwum</button></div>
      ${list.length ? `<div class="notes">${list.map(n => `<div class="note ${n.color}" data-n="${n._id}">
        <div class="row between"><h4 class="ellipsis">${n.pinned ? '📌 ' : ''}${esc(n.title || 'Bez tytułu')}</h4>${n.visibility === 'team' ? '<span class="pill">Zespół</span>' : ''}</div>
        ${n.content ? `<p>${esc(n.content)}</p>` : ''}
        ${(n.checklist || []).length ? `<div class="list" style="margin-top:6px">${n.checklist.slice(0, 8).map(c => `<label class="row small" style="gap:8px;padding:3px 0;cursor:pointer"><input type="checkbox" data-ci="${n._id}|${c._id}" ${c.done ? 'checked' : ''} style="accent-color:var(--accent)"><span class="${c.done ? 'muted' : ''}" style="${c.done ? 'text-decoration:line-through' : ''}">${esc(c.text)}</span></label>`).join('')}</div>` : ''}
        <div class="tiny muted" style="margin-top:8px">${n.reminderAt && !n.reminderSentAt ? `⏰ ${fmtDateTime(n.reminderAt)} · ` : ''}${esc(n.lastEditedBy || n.ownerName || '')} · ${ago(n.updatedAt)}</div>
      </div>`).join('')}</div>` : `<div class="card">${emptyState(q ? 'Nic nie znaleziono' : 'Pusto', 'Zapisz pomysł, listę zakupów do magazynu albo ustalenia z klientem.', 'note')}</div>`}`;
  }
  function edit(n = { color: 'default', checklist: [], visibility: 'private' }) {
    const items = (n.checklist || []).map(c => ({ ...c }));
    let color = n.color || 'default';
    const paintItems = m => { m.querySelector('[data-items]').innerHTML = items.map((c, i) => `<div class="row" style="gap:6px"><input type="checkbox" data-done="${i}" ${c.done ? 'checked' : ''} style="accent-color:var(--accent)"><input class="input sm grow" data-txt="${i}" value="${esc(c.text)}"><button class="btn ghost sm" data-rmi="${i}">✕</button></div>`).join(''); };
    modal({
      title: n._id ? 'Notatka' : 'Nowa notatka',
      body: `<input class="input" name="title" placeholder="Tytuł" value="${esc(n.title || '')}" style="font-weight:700;font-size:16px">
        <textarea class="input" name="content" rows="6" placeholder="Treść…">${esc(n.content || '')}</textarea>
        <div class="col" data-items style="gap:6px"></div>
        <div class="row"><input class="input sm grow" data-newitem placeholder="+ pozycja listy (Enter)"></div>
        <div class="row wrap between"><div class="row" data-colors>${COLORS.map(c => `<button type="button" data-c="${c}" style="width:26px;height:26px;border-radius:50%;border:2px solid ${c === color ? 'var(--text)' : 'transparent'};background:${SW[c]};cursor:pointer"></button>`).join('')}</div>
        <label class="check small"><input type="checkbox" name="pinned" ${n.pinned ? 'checked' : ''}> Przypnij</label>
        <label class="check small"><input type="checkbox" name="team" ${n.visibility === 'team' ? 'checked' : ''}> Widoczna dla zespołu</label></div>
        <label class="field"><span>Przypomnienie (push)</span><input class="input" type="datetime-local" name="reminderAt" value="${n.reminderAt ? toLocalInput(n.reminderAt) : ''}"></label>`,
      foot: `${n._id ? `<button class="btn danger" data-del>${icon('trash', 'sm')}</button><button class="btn ghost" data-archive>${n.archived ? 'Przywróć' : 'Archiwizuj'}</button><span class="grow"></span>` : ''}<button class="btn ghost" data-close>Anuluj</button><button class="btn primary" data-save>Zapisz</button>`,
      onMount: (m, close) => {
        paintItems(m);
        const sync = () => m.querySelectorAll('[data-txt]').forEach(inp => { items[Number(inp.dataset.txt)].text = inp.value; });
        m.addEventListener('click', async e => {
          const c = e.target.closest('[data-c]');
          if (c) { color = c.dataset.c; m.querySelectorAll('[data-c]').forEach(b => { b.style.borderColor = b === c ? 'var(--text)' : 'transparent'; }); }
          const rm = e.target.closest('[data-rmi]');
          if (rm) { sync(); items.splice(Number(rm.dataset.rmi), 1); paintItems(m); }
          if (e.target.closest('[data-del]') && await confirmBox('Usunąć notatkę?', { ok: 'Usuń', danger: true })) { await api('/notes/' + n._id, { method: 'DELETE' }); close(); await load(); draw(); }
          if (e.target.closest('[data-archive]')) { await api('/notes/' + n._id, { method: 'PUT', body: { archived: !n.archived } }); close(); await load(); draw(); }
        });
        m.addEventListener('change', e => { const dn = e.target.closest('[data-done]'); if (dn) items[Number(dn.dataset.done)].done = dn.checked; });
        m.querySelector('[data-newitem]').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.value.trim()) { e.preventDefault(); sync(); items.push({ text: e.target.value.trim(), done: false }); e.target.value = ''; paintItems(m); } });
        m.querySelector('[data-save]').addEventListener('click', e => busy(e.currentTarget, async () => {
          sync();
          const v = n2 => m.querySelector(`[name=${n2}]`);
          const body = { title: v('title').value.trim(), content: v('content').value, color, pinned: v('pinned').checked, visibility: v('team').checked ? 'team' : 'private', checklist: items.filter(i => i.text.trim()).map(i => ({ text: i.text.trim(), done: Boolean(i.done) })), reminderAt: v('reminderAt').value ? new Date(v('reminderAt').value).toISOString() : null };
          if (!body.title && !body.content && !body.checklist.length) throw new Error('Notatka jest pusta');
          await api(n._id ? '/notes/' + n._id : '/notes', { method: n._id ? 'PUT' : 'POST', body });
          close(); toast('Zapisano', 'ok'); await load(); draw();
        }));
      }
    });
  }
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-arch]')) { showArchived = !showArchived; await load(); return draw(); }
    if (e.target.closest('[data-ci]')) return;
    const n = e.target.closest('[data-n]');
    if (n) edit(notes.find(x => String(x._id) === n.dataset.n));
  });
  el.addEventListener('change', async e => {
    const ci = e.target.closest('[data-ci]');
    if (ci) { const [id, item] = ci.dataset.ci.split('|'); await api(`/notes/${id}/checklist/${item}`, { method: 'PATCH', body: { done: ci.checked } }).catch(err => toast(err.message, 'err')); }
  });
  el.addEventListener('input', e => { if (e.target.matches('[data-q]')) { q = e.target.value.toLowerCase(); draw(); const i = el.querySelector('[data-q]'); i.focus(); i.setSelectionRange(99, 99); } });
  await load();
  draw();
  if (query.nowa) edit();
}
