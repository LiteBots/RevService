/* Wyceny — zgłoszenia z formularza i telefonu, wycena AI na karcie, szybkie akcje */
import { S, api, esc, money, icon, ago, go, reloadData, toast, busy, formModal, confirmBox, emptyState, fmtDay, fmtTime, taskPlace, plural } from '../core.js';

export default async function wyceny(el, { ctx }) {
  let tab = 'new';
  await reloadData().catch(() => null);

  function draw() {
    const list = (S.data.tasks || []).filter(t => t.status === tab).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const counts = { new: S.data.tasks.filter(t => t.status === 'new').length, quoted: S.data.tasks.filter(t => t.status === 'quoted').length };
    ctx.setTitle('Wyceny', `${plural(counts.new, 'nowe zgłoszenie', 'nowe zgłoszenia', 'nowych zgłoszeń')} · ${counts.quoted} czeka na decyzję klienta`, `<button class="btn primary sm" data-new>${icon('plus', 'sm')} <span class="hide-m">Dodaj zgłoszenie</span></button>`);
    document.querySelector('[data-new]').addEventListener('click', () => import('../taskform.js').then(m => m.openTaskForm(undefined, { status: 'new', source: 'Telefon' })));
    el.innerHTML = `
      <div class="seg">${[['new', 'Nowe'], ['quoted', 'Wycenione — czekają na klienta']].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}${counts[k] ? `<span class="count">${counts[k]}</span>` : ''}</button>`).join('')}</div>
      ${list.length ? `<div class="grid g3">${list.map(card).join('')}</div>` : `<div class="card">${emptyState(tab === 'new' ? 'Brak nowych zgłoszeń' : 'Nic nie czeka na klienta', tab === 'new' ? 'Nowe wyceny z formularza na stronie pojawią się tutaj.' : '', 'inbox')}</div>`}`;
  }

  const card = t => {
    const ai = t.aiEstimate;
    const stale = Date.now() - new Date(t.createdAt) > 48 * 3600_000;
    return `<div class="card col ${stale && t.status === 'new' ? 'warn' : ''}" style="gap:8px">
      <div class="row between"><span class="small muted">${ago(t.createdAt)} · ${esc(t.source || 'Formularz')}</span>${t.quoteType === 'onsite' ? '<span class="pill violet">Z dojazdem</span>' : ''}</div>
      <div class="li-title click" data-open="${t._id}" style="cursor:pointer;font-size:15px">${esc(t.name)}</div>
      <div class="small muted">${esc([t.clientName, t.clientPhone].filter(Boolean).join(' · '))}</div>
      <div class="small">${icon('pin', 'sm')} ${esc(taskPlace(t) || '—')}</div>
      ${t.clientPreferredDate ? `<div class="small">${icon('calendar', 'sm')} Termin klienta: ${esc(t.clientPreferredDate)}</div>` : `<div class="small">${icon('calendar', 'sm')} ${fmtDay(t.dateStart)} ${fmtTime(t.dateStart)}</div>`}
      ${t.desc ? `<p class="small muted" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(t.desc)}</p>` : ''}
      ${ai?.low ? `<div class="ai-box">✦ AI: ${money(ai.low)} – ${money(ai.high)}${ai.admin?.crew ? ` · ${esc(ai.admin.crew)}` : ''}</div>` : ''}
      ${t.price ? `<div class="b">Twoja wycena: ${money(t.price)}${t.priceMax ? ' – ' + money(t.priceMax) : ''}</div>` : ''}
      ${t.quotePhotoCount ? `<div class="small accent">${icon('camera', 'sm')} ${t.quotePhotoCount} zdjęć od klienta</div>` : ''}
      <div class="row wrap" style="gap:6px;margin-top:auto">
        ${t.status === 'new' ? `<button class="btn primary sm" data-quote="${t._id}">Wyceń</button>${ai?.low ? `<button class="btn sm" data-ai="${t._id}">Wg AI</button>` : ''}` : ''}
        <button class="btn sm" data-plan="${t._id}">${icon('calendar', 'sm')} Zaplanuj</button>
        ${t.clientPhone ? `<a class="btn ghost sm" href="tel:${esc(t.clientPhone)}">${icon('phone', 'sm')}</a>` : ''}
        <button class="btn ghost sm" data-reject="${t._id}" title="Odrzuć">${icon('x', 'sm')}</button>
      </div>
    </div>`;
  };

  const find = id => S.data.tasks.find(t => String(t._id) === id);
  async function save(id, body, msg) {
    await api(`/tasks/${id}`, { method: 'PUT', body });
    await reloadData();
    S.hooks.refreshBadges?.();
    toast(msg, 'ok');
    draw();
  }

  el.addEventListener('click', async e => {
    const b = e.target.closest('button, [data-open]');
    if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; return draw(); }
    if (b.dataset.open) return go('zlecenia/' + b.dataset.open);
    if (b.dataset.quote) {
      const t = find(b.dataset.quote);
      return formModal({
        title: `Wycena: ${t.name}`,
        fields: [
          { name: 'price', label: 'Cena od (zł brutto)', type: 'number', value: t.aiEstimate?.low || t.price || '', required: true, min: 0 },
          { name: 'priceMax', label: 'Cena do (opcjonalnie)', type: 'number', value: t.aiEstimate?.high || '', min: 0 }
        ],
        submit: 'Zapisz wycenę',
        onSubmit: v => save(t._id, { price: v.price, priceMax: v.priceMax === '' ? null : v.priceMax, status: 'quoted' }, 'Wycena zapisana')
      });
    }
    if (b.dataset.ai) { const t = find(b.dataset.ai); return busy(b, () => save(t._id, { price: t.aiEstimate.low, priceMax: t.aiEstimate.high, status: 'quoted' }, 'Wycena wg widełek AI zapisana')); }
    if (b.dataset.plan) { const m = await import('../taskform.js'); const saved = await m.openTaskForm(find(b.dataset.plan), { status: 'planned' }); if (saved) { await reloadData(); draw(); } return; }
    if (b.dataset.reject) {
      if (!await confirmBox('Odrzucić zgłoszenie? Trafi do anulowanych.', { ok: 'Odrzuć', danger: true })) return;
      return busy(b, () => save(b.dataset.reject, { status: 'cancelled' }, 'Zgłoszenie odrzucone'));
    }
  });

  draw();
}
