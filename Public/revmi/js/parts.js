/* RevMi 2.0.0 — części wspólne dla biura i ekipy: ranking, usterki, urlopy, zamiany zmian, dyspozycyjność */
import { S, api, esc, icon, money, avatar, fmtDate, fmtDay, fmtTime, ago, toast, busy, formModal, modal, pickPhotos, lightbox, emptyState, dayKey, addDays, startOfWeek, isOffice, can, relDay, confirmBox } from './core.js';

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

export async function rankingPart(el) {
  let month = dayKey(new Date()).slice(0, 7);
  async function draw() {
    const r = await api('/v2/ranking?month=' + month);
    const top = r.ranking.slice(0, 3);
    const label = new Date(month + '-15').toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    const podium = [top[1], top[0], top[2]].filter(Boolean);
    const heights = { 1: 96, 2: 70, 3: 52 };
    const colors = { 1: 'var(--accent)', 2: '#9aa3a0', 3: '#b98a5a' };
    el.innerHTML = `
      <div class="row between"><button class="icon-btn" data-m="-1">${icon('left')}</button><div style="text-align:center"><b style="text-transform:capitalize">${label}</b>${r.daysLeft ? `<div class="tiny muted">zostało ${r.daysLeft} dni</div>` : ''}</div><button class="icon-btn" data-m="1">${icon('right')}</button></div>
      ${r.bonus ? `<div class="card hero"><b>${icon('trophy', 'sm')} Nagroda miesiąca:</b> ${esc(r.bonus)}</div>` : ''}
      ${top.length ? `<div class="card"><div class="podium">${podium.map(p => `<div class="pl">${avatar(p.name, p.color, 'lg')}<b class="small">${esc(p.name.split(' ')[0])}${String(p._id) === String(r.self) ? ' · Ty' : ''}</b><span class="tiny muted">${p.points} pkt</span><div class="block" style="height:${heights[p.place]}px;background:${colors[p.place]}">${p.place}</div></div>`).join('')}</div></div>` : ''}
      <div class="card">${r.ranking.length ? `<div class="list">${r.ranking.map(p => `<div class="li"><b style="width:22px">${p.place}.</b>${avatar(p.name, p.color, 'sm')}<div class="grow"><div class="b">${esc(p.name)}${String(p._id) === String(r.self) ? ' <span class="pill mint">Ty</span>' : ''}</div><div class="li-sub">${p.tasks} zleceń · na czas ${p.onTime}/${p.tasks}${p.avgRating ? ` · ocena ${p.avgRating}★` : ''}${p.complaints ? ` · <span class="red">reklamacje ${p.complaints}</span>` : ''}</div>${p.badges.length ? `<div class="chips" style="margin-top:5px">${p.badges.map(b => `<span class="pill">${esc(b.label)}</span>`).join('')}</div>` : ''}</div><b class="num" style="font-size:16px">${p.points}</b></div>`).join('')}</div>` : emptyState('Ranking jeszcze pusty', 'Punkty pojawią się po pierwszych zakończonych zleceniach w tym miesiącu.', 'trophy')}</div>
      <div class="card"><div class="card-head"><h3>Za co są punkty</h3></div><div class="list">
        <div class="li"><span class="grow">⭐ Ocena klienta 5★</span><b class="accent">+${r.points.rating5}</b></div>
        <div class="li"><span class="grow">⭐ Ocena klienta 4★</span><b class="accent">+${r.points.rating4}</b></div>
        <div class="li"><span class="grow">⏱ Przyjazd na czas (do 15 min)</span><b class="accent">+${r.points.onTime}</b></div>
        <div class="li"><span class="grow">📸 Pełny raport ze zdjęciami „po” i kosztami</span><b class="accent">+${r.points.fullReport}</b></div>
        <div class="li"><span class="grow">⚠ Reklamacja</span><b class="red">${r.points.complaint}</b></div>
      </div></div>`;
  }
  el.addEventListener('click', e => { const m = e.target.closest('[data-m]'); if (m) { const d = new Date(month + '-15'); d.setMonth(d.getMonth() + Number(m.dataset.m)); month = dayKey(d).slice(0, 7); draw(); } });
  await draw();
}

/* ------------------------------------------------------------------ */
/* Usterki                                                             */
/* ------------------------------------------------------------------ */

const PRIO = { low: ['Może poczekać', ''], high: ['Pilne', 'amber'], critical: ['Stoimy!', 'red'] };
const FSTAT = { open: ['Nowa', 'amber'], progress: ['W naprawie', 'blue'], resolved: ['Naprawiona', 'mint'] };

export async function faultsPart(el, { openNew = false } = {}) {
  let d;
  async function load() { d = await api('/v2/faults'); }
  function draw() {
    el.innerHTML = `
      <div class="row between"><span class="small muted">${d.manage ? 'Zgłoszenia ekipy — napraw i zamknij' : 'Twoje zgłoszenia'}</span><button class="btn primary sm" data-new>${icon('wrench', 'sm')} Zgłoś usterkę</button></div>
      <div class="card">${d.faults.length ? `<div class="list">${d.faults.map(f => `<div class="li ${d.manage ? 'click' : ''}" data-f="${f._id}">
        <span class="avatar" style="background:${f.priority === 'critical' ? 'var(--red)' : f.priority === 'high' ? 'var(--amber)' : 'var(--surface-3)'};color:#03241b">${icon(f.kind === 'vehicle' ? 'truck' : 'wrench', 'sm')}</span>
        <div class="grow"><div class="li-title">${esc(f.subject)}</div><div class="li-sub">${esc(f.description.slice(0, 120))}</div><div class="li-sub">${esc(f.reportedBy)} · ${ago(f.createdAt)}${f.mileage ? ` · ${f.mileage} km` : ''}${f.photoCount ? ` · 📷 ${f.photoCount}` : ''}${f.resolution ? ` · ${esc(f.resolution)}` : ''}</div></div>
        <div class="col" style="align-items:flex-end;gap:4px"><span class="pill ${FSTAT[f.status][1]}">${FSTAT[f.status][0]}</span><span class="pill ${PRIO[f.priority][1]}">${PRIO[f.priority][0]}</span></div>
      </div>`).join('')}</div>` : emptyState('Brak zgłoszeń', 'Coś się zepsuło? Zgłoś to ze zdjęciem.', 'wrench')}</div>`;
  }
  function report() {
    const photos = [];
    const paint = m => { m.querySelector('[data-ph]').innerHTML = photos.map((p, i) => `<div class="ph" style="background-image:url('${p}')"><button class="x" data-rm="${i}">×</button></div>`).join('') + (photos.length < 4 ? '<button class="add-ph" data-add>+</button>' : ''); };
    modal({
      title: 'Zgłoś usterkę',
      body: `<div class="chips" data-kind>${[['vehicle', 'Pojazd'], ['equipment', 'Sprzęt'], ['other', 'Inne']].map(([k, l], i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
        <label class="field" data-veh><span>Pojazd</span><select class="input" name="vehicle">${d.vehicles.map(v => `<option value="${v._id}">${esc(v.name)} ${esc(v.plates)}</option>`).join('')}</select></label>
        <label class="field hidden" data-eq><span>Sprzęt</span><select class="input" name="equipment">${d.equipment.map(v => `<option value="${v._id}">${esc(v.name)}</option>`).join('')}</select></label>
        <label class="field hidden" data-subj><span>Czego dotyczy</span><input class="input" name="subject"></label>
        <div class="field"><span>Zdjęcia</span><div class="photo-grid" data-ph></div></div>
        <label class="field"><span>Opis *</span><textarea class="input" name="description" placeholder="Co się dzieje? Np. stuka z przodu przy hamowaniu"></textarea></label>
        <div class="field"><span>Jak pilne</span><div class="seg" data-prio>${Object.entries(PRIO).map(([k, [l]], i) => `<button type="button" data-p="${k}" class="${i === 0 ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <label class="field" data-mil><span>Przebieg (km, opcjonalnie)</span><input class="input" type="number" name="mileage" inputmode="numeric"></label>`,
      foot: '<button class="btn ghost" data-close>Anuluj</button><button class="btn primary" data-send>Wyślij do biura</button>',
      onMount: (m, close) => {
        let kind = 'vehicle';
        let prio = 'low';
        paint(m);
        m.addEventListener('click', async e => {
          const k = e.target.closest('[data-k]');
          if (k) { kind = k.dataset.k; m.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('on', x === k)); m.querySelector('[data-veh]').classList.toggle('hidden', kind !== 'vehicle'); m.querySelector('[data-mil]').classList.toggle('hidden', kind !== 'vehicle'); m.querySelector('[data-eq]').classList.toggle('hidden', kind !== 'equipment'); m.querySelector('[data-subj]').classList.toggle('hidden', kind !== 'other'); }
          const p = e.target.closest('[data-p]');
          if (p) { prio = p.dataset.p; m.querySelectorAll('[data-p]').forEach(x => x.classList.toggle('on', x === p)); }
          if (e.target.closest('[data-add]')) { photos.push(...(await pickPhotos({ camera: true }))); photos.splice(4); paint(m); }
          const rm = e.target.closest('[data-rm]');
          if (rm) { photos.splice(Number(rm.dataset.rm), 1); paint(m); }
        });
        m.querySelector('[data-send]').addEventListener('click', e => busy(e.currentTarget, async () => {
          const val = n => m.querySelector(`[name=${n}]`)?.value || '';
          await api('/v2/faults', { method: 'POST', body: { kind, vehicle: val('vehicle'), equipment: val('equipment'), subject: val('subject'), description: val('description'), priority: prio, mileage: val('mileage'), photos } });
          close();
          toast('Zgłoszenie wysłane — biuro dostało powiadomienie', 'ok');
          await load(); draw();
        }));
      }
    });
  }
  function manage(f) {
    modal({
      title: `${f.number}: ${f.subject}`,
      body: `<p style="white-space:pre-wrap">${esc(f.description)}</p><p class="small muted">${esc(f.reportedBy)} · ${fmtDate(f.createdAt)}${f.mileage ? ` · ${f.mileage} km` : ''}</p>
        ${f.photoCount ? `<div class="photo-grid">${Array.from({ length: f.photoCount }, (_, i) => `<div class="ph" data-img="/api/v2/faults/${f._id}/photos/${i}" style="background-image:url('/api/v2/faults/${f._id}/photos/${i}')"></div>`).join('')}</div>` : ''}
        <label class="field"><span>Status</span><select class="input" name="status">${Object.entries(FSTAT).map(([k, [l]]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Co zrobiono</span><textarea class="input" name="resolution">${esc(f.resolution || '')}</textarea></label>
        <label class="field"><span>Koszt naprawy (zł)</span><input class="input" type="number" name="cost" value="${f.cost ?? ''}"></label>
        ${f.vehicle ? '<p class="small muted">Po oznaczeniu jako naprawione koszt trafi do historii napraw pojazdu i kosztów firmy.</p>' : ''}`,
      foot: '<button class="btn ghost" data-close>Zamknij</button><button class="btn primary" data-save>Zapisz</button>',
      onMount: (m, close) => {
        m.addEventListener('click', e => { const i = e.target.closest('[data-img]'); if (i) lightbox(i.dataset.img); });
        m.querySelector('[data-save]').addEventListener('click', e => busy(e.currentTarget, async () => {
          const v = n => m.querySelector(`[name=${n}]`).value;
          await api(`/v2/faults/${f._id}`, { method: 'PUT', body: { status: v('status'), resolution: v('resolution'), cost: v('cost') } });
          close(); toast('Zapisano', 'ok'); await load(); draw();
        }));
      }
    });
  }
  el.addEventListener('click', e => {
    if (e.target.closest('[data-new]')) return report();
    const f = e.target.closest('[data-f]');
    if (f && d.manage) manage(d.faults.find(x => String(x._id) === f.dataset.f));
  });
  await load();
  draw();
  if (openNew) report();
}

/* ------------------------------------------------------------------ */
/* Urlopy                                                              */
/* ------------------------------------------------------------------ */

const LSTAT = { pending: ['Czeka', 'amber'], approved: ['Zatwierdzony', 'mint'], rejected: ['Odrzucony', 'red'] };

export async function leavesPart(el) {
  let d;
  async function load() { d = await api('/v92/leaves'); }
  function draw() {
    const kinds = d.kinds || {};
    el.innerHTML = `
      <div class="row between"><span class="small muted">${d.manage ? `${d.pending} do decyzji` : 'Twoje wnioski'}</span><button class="btn primary sm" data-new>${icon('plus', 'sm')} ${d.manage ? 'Dodaj urlop' : 'Złóż wniosek'}</button></div>
      <div class="card">${d.leaves.length ? `<div class="list">${d.leaves.map(l => `<div class="li"><div class="grow"><div class="b">${esc(l.employeeName)} · ${esc(kinds[l.kind] || l.kind)}</div><div class="li-sub">${fmtDate(l.from)} – ${fmtDate(l.to)}${l.note ? ` · ${esc(l.note)}` : ''}</div></div><span class="pill ${LSTAT[l.status][1]}">${LSTAT[l.status][0]}</span>
        ${d.manage && l.status === 'pending' ? `<button class="btn primary sm" data-dec="${l._id}|approved">Zatwierdź</button><button class="btn ghost sm" data-dec="${l._id}|rejected">Odrzuć</button>` : ''}
        ${!d.manage && l.status === 'pending' ? `<button class="btn ghost sm" data-del="${l._id}">${icon('trash', 'sm')}</button>` : ''}</div>`).join('')}</div>` : emptyState('Brak urlopów', '', 'calendar')}</div>`;
  }
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-new]')) {
      const kinds = Object.entries(d.kinds || { vacation: 'Urlop' });
      return formModal({
        title: d.manage ? 'Dodaj urlop' : 'Wniosek urlopowy',
        fields: [
          ...(d.manage ? [{ name: 'employee', label: 'Pracownik', type: 'select', options: S.data.employees.map(x => [x._id, x.name]), full: true }] : []),
          { name: 'kind', label: 'Rodzaj', type: 'select', options: kinds, full: true },
          { name: 'from', label: 'Od', type: 'date', value: dayKey(addDays(new Date(), 7)), required: true },
          { name: 'to', label: 'Do', type: 'date', value: dayKey(addDays(new Date(), 7)), required: true },
          { name: 'note', label: 'Uwagi', full: true }
        ],
        submit: d.manage ? 'Dodaj' : 'Wyślij wniosek',
        onSubmit: async v => {
          const r = await api('/v92/leaves', { method: 'POST', body: v });
          toast(r.clashes?.length ? `Zapisano — uwaga: ${r.clashes.length} zleceń w tym czasie` : 'Zapisano', r.clashes?.length ? 'err' : 'ok');
          await load(); draw(); S.hooks.refreshBadges?.();
        }
      });
    }
    const dec = e.target.closest('[data-dec]');
    if (dec) { const [id, status] = dec.dataset.dec.split('|'); return busy(dec, async () => { await api(`/v92/leaves/admin/${id}`, { method: 'PATCH', body: { status } }); await load(); draw(); S.hooks.refreshBadges?.(); }); }
    const del = e.target.closest('[data-del]');
    if (del && await confirmBox('Wycofać wniosek?', { ok: 'Wycofaj', danger: true })) return busy(del, async () => { await api(`/v92/leaves/${del.dataset.del}`, { method: 'DELETE' }); await load(); draw(); });
  });
  await load();
  draw();
}

/* ------------------------------------------------------------------ */
/* Zamiany zmian (pracownik)                                           */
/* ------------------------------------------------------------------ */

const SSTAT = { pending: ['Czeka na biuro', 'amber'], approved: ['Zatwierdzona', 'mint'], rejected: ['Odrzucona', 'red'], cancelled: ['Wycofana', ''] };

export async function swapsPart(el) {
  let d;
  async function load() { d = await api('/v2/swaps'); }
  function draw() {
    const mine = (S.data.tasks || []).filter(t => ['planned'].includes(t.status) && new Date(t.dateStart) > new Date() && (t.workers || []).some(w => String(w.employee) === String(S.me.selfId)));
    el.innerHTML = `
      <div class="row between"><span class="small muted">Nie możesz przyjść? Poproś kolegę o zamianę — biuro zatwierdzi.</span><button class="btn primary sm" data-new ${mine.length ? '' : 'disabled'}>${icon('swap', 'sm')} Poproś o zamianę</button></div>
      <div class="card">${d.swaps.length ? `<div class="list">${d.swaps.map(s => {
        const toMe = String(s.to) === String(d.self);
        return `<div class="li"><div class="grow"><div class="b">${esc(s.taskName)}</div><div class="li-sub">${relDay(s.taskDate)} ${fmtTime(s.taskDate)} · ${toMe ? `prosi ${esc(s.fromName)}` : s.toName ? `zastępca: ${esc(s.toName)}` : 'bez zastępcy'}${s.reason ? ` · „${esc(s.reason)}”` : ''}</div></div>
          <span class="pill ${SSTAT[s.status][1]}">${SSTAT[s.status][0]}</span>
          ${toMe && s.status === 'pending' && s.peerStatus === 'pending' ? `<button class="btn primary sm" data-peer="${s._id}|1">Zgoda</button><button class="btn ghost sm" data-peer="${s._id}|0">Nie</button>` : ''}
          ${!toMe && s.status === 'pending' ? `<button class="btn ghost sm" data-cancel="${s._id}">Wycofaj</button>` : ''}</div>`;
      }).join('')}</div>` : emptyState('Brak próśb o zamianę', '', 'swap')}</div>`;
    el._mine = mine;
  }
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-new]')) {
      return formModal({
        title: 'Prośba o zamianę zmiany',
        fields: [
          { name: 'task', label: 'Zlecenie', type: 'select', options: el._mine.map(t => [t._id, `${fmtDay(t.dateStart)} ${fmtTime(t.dateStart)} · ${t.name}`]), full: true },
          { name: 'to', label: 'Kto Cię zastąpi (opcjonalnie)', type: 'select', options: [['', '— niech biuro wybierze —'], ...S.data.employees.filter(x => String(x._id) !== String(S.me.selfId)).map(x => [x._id, x.name])], full: true },
          { name: 'reason', label: 'Powód', type: 'textarea', full: true, placeholder: 'np. wizyta u lekarza' }
        ],
        submit: 'Wyślij prośbę',
        onSubmit: async v => { await api('/v2/swaps', { method: 'POST', body: { ...v, to: v.to || null } }); toast('Prośba wysłana', 'ok'); await load(); draw(); }
      });
    }
    const p = e.target.closest('[data-peer]');
    if (p) { const [id, ok] = p.dataset.peer.split('|'); return busy(p, async () => { await api(`/v2/swaps/${id}/peer`, { method: 'POST', body: { accept: ok === '1' } }); await load(); draw(); }); }
    const c = e.target.closest('[data-cancel]');
    if (c) return busy(c, async () => { await api(`/v2/swaps/${c.dataset.cancel}`, { method: 'DELETE' }); await load(); draw(); });
  });
  await load();
  draw();
}

/* ------------------------------------------------------------------ */
/* Dyspozycyjność (pracownik)                                          */
/* ------------------------------------------------------------------ */

export async function availabilityPart(el) {
  const from = startOfWeek(new Date());
  const days = Array.from({ length: 28 }, (_, i) => addDays(from, i));
  const r = await api(`/v2/availability?from=${dayKey(from)}&to=${dayKey(addDays(from, 28))}`);
  const map = new Map(r.availability.map(a => [a.day, a]));
  const ST = { available: ['Mogę', 'mint'], partial: ['Częściowo', 'amber'], unavailable: ['Nie mogę', 'red'] };
  const next = { '': 'available', available: 'partial', partial: 'unavailable', unavailable: '' };
  function draw() {
    el.innerHTML = `<p class="small muted">Kliknij dzień, żeby zmienić: <span class="pill mint">Mogę</span> → <span class="pill amber">Częściowo</span> → <span class="pill red">Nie mogę</span> → brak. Biuro widzi to w grafiku.</p>
      <div class="card"><div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px">${['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map(x => `<div class="tiny muted b" style="text-align:center">${x}</div>`).join('')}
      ${days.map(d => { const k = dayKey(d); const a = map.get(k); const st = a?.status || ''; return `<button class="card click" data-day="${k}" style="padding:8px 4px;text-align:center;${d < addDays(new Date(), -1) ? 'opacity:.4' : ''};${st ? `border-color:var(--${ST[st][1] === 'mint' ? 'accent' : ST[st][1]})` : ''}"><b>${d.getDate()}</b><div class="tiny ${st ? (ST[st][1] === 'mint' ? 'accent' : ST[st][1]) : 'muted'}">${st ? ST[st][0] : '—'}</div></button>`; }).join('')}</div></div>`;
  }
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-day]');
    if (!b) return;
    const k = b.dataset.day;
    const cur = map.get(k)?.status || '';
    const status = next[cur];
    try {
      await api('/v2/availability', { method: 'PUT', body: { day: k, status: status || 'clear' } });
      if (status) map.set(k, { day: k, status }); else map.delete(k);
      draw();
    } catch (error) { toast(error.message, 'err'); }
  });
  draw();
}

export { isOffice, can, money };
