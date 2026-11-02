/* Szczegóły zlecenia — akcje ekipy (start / pauza / zakończ), zdjęcia, checklista, notatki, czat z klientem, SMS, historia */
import { S, api, esc, money, icon, fmtTime, fmtDateTime, fmtDayLong, relDay, go, statusPill, reloadData, toast, modal, busy, isOffice, can, taskAmount, taskPlace, avatar, employeeColor, pickPhotos, lightbox, confirmBox, fieldHtml, readForm, ago, PAY, hhmmss } from '../core.js';

export default async function zlecenie(el, { id, ctx, query }) {
  const office = isOffice();
  let task;
  let media = [];
  let activity = [];
  let timer = null;

  async function load() {
    const r = await api(`/tasks/${id}`);
    task = r.task;
    media = r.media || [];
    activity = r.activity || [];
  }
  await load();

  const navUrl = t => (t.geo?.lat ? `https://www.google.com/maps/dir/?api=1&destination=${t.geo.lat},${t.geo.lon}` : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(taskPlace(t))}`);
  const running = () => (task.workLog || []).some(s => s.start && !s.end);
  const worked = () => (task.workLog || []).reduce((s, x) => s + ((x.end ? new Date(x.end) : new Date()) - new Date(x.start)), 0);

  function render() {
    const t = task;
    ctx.setTitle(t.name, `${t.number || ''} · ${relDay(t.dateStart)} ${fmtTime(t.dateStart)}`, office && can('tasks') ? `<button class="btn sm" data-edit>${icon('edit', 'sm')} <span class="hide-m">Edytuj</span></button>` : '');
    document.querySelector('[data-edit]')?.addEventListener('click', async () => { const m = await import('../taskform.js'); const saved = await m.openTaskForm(task); if (saved) { await load(); render(); } });
    const before = (t.checklist || []).filter(i => i.phase === 'before');
    const items = (t.checklist || []).filter(i => i.phase !== 'before');
    const ai = t.aiEstimate;

    el.innerHTML = `
      <button class="back" data-back>${icon('left', 'sm')} Zlecenia</button>
      <div class="split">
        <div class="col" style="gap:14px">
          <div class="card ${t.status === 'progress' ? 'hero' : ''}">
            <div class="row wrap between">
              <div class="row wrap">${statusPill(t.status)}${t.priority === 'high' ? '<span class="pill red">Pilne</span>' : ''}${t.packageSub ? '<span class="pill violet">Pakiet firmowy</span>' : ''}${t.clientConfirmedAt ? '<span class="pill mint">✓ Klient potwierdził</span>' : ''}${t.clientRescheduleNote ? '<span class="pill amber">Klient prosi o zmianę terminu</span>' : ''}</div>
              ${office ? `<b class="num" style="font-size:20px">${taskAmount(t) ? money(taskAmount(t)) : '—'}${t.priceMax ? ` – ${money(t.priceMax)}` : ''}</b>` : ''}
            </div>
            <h2 style="font-size:22px;margin-top:10px">${esc(t.name)}</h2>
            <p class="muted" style="margin-top:4px;text-transform:capitalize">${fmtDayLong(t.dateStart)}, ${fmtTime(t.dateStart)}${t.dateEnd ? ' – ' + fmtTime(t.dateEnd) : ''}</p>
            ${t.status === 'progress' ? `<div class="row" style="margin-top:12px"><span class="status-chip ${running() ? 'on' : 'pause'}">${running() ? '● W pracy' : '❚❚ Pauza'}</span><b class="num" data-timer style="font-size:20px">${hhmmss(worked())}</b></div>` : ''}
            <div class="row wrap" style="margin-top:14px;gap:8px" data-actions>${actionButtons(t)}</div>
          </div>

          ${t.clientRescheduleNote ? `<div class="card warn"><b>📅 Klient prosi o zmianę terminu</b><p class="muted small" style="margin-top:4px">${esc(t.clientRescheduleNote)}</p></div>` : ''}

          <div class="card">
            <div class="card-head"><h3>Szczegóły</h3></div>
            <div class="grid g2" style="gap:12px">
              ${detail('Adres', taskPlace(t) ? `<a href="${navUrl(t)}" target="_blank" rel="noopener">${esc(taskPlace(t))}</a>` : '—')}
              ${detail('Usługa', esc(t.type || '—'))}
              ${detail('Klient', esc(t.clientName || '—') + (t.clientPhone ? `<br><a href="tel:${esc(t.clientPhone)}">${esc(t.clientPhone)}</a>` : ''))}
              ${detail('Ekipa', (t.workers || []).length ? (t.workers || []).map(w => `<span class="row" style="gap:6px;margin-bottom:3px">${avatar(w.name, employeeColor(w.employee), 'sm')}${esc(w.name)}</span>`).join('') : '<span class="amber">Brak ekipy</span>')}
              ${detail('Pojazd', esc(t.car || '—'))}
              ${office ? detail('Płatność', `<span class="pill ${PAY[t.paymentStatus]?.cls || ''}">${PAY[t.paymentStatus]?.label || '—'}</span>${t.cashCollected ? ` · pobrano ${money(t.cashCollected)}` : ''}`) : ''}
            </div>
            ${t.desc ? `<hr class="sep" style="margin:14px 0"><div class="eyebrow">Opis</div><p style="white-space:pre-wrap;margin-top:6px">${esc(t.desc)}</p>` : ''}
            ${t.completionNote ? `<hr class="sep" style="margin:14px 0"><div class="eyebrow">Raport ekipy</div><p style="white-space:pre-wrap;margin-top:6px">${esc(t.completionNote)}</p>` : ''}
          </div>

          ${ai && (ai.low || ai.inventory || ai.admin) ? `<div class="card"><div class="card-head"><h3>✦ Wycena AI</h3>${ai.low ? `<span class="ai-box">${money(ai.low)} – ${money(ai.high)}</span>` : ''}</div>
            ${ai.admin?.crew ? `<p class="small">Sugerowana ekipa: <b>${esc(ai.admin.crew)}</b>${ai.admin.vehicle ? ` · pojazd: <b>${esc(ai.admin.vehicle)}</b>` : ''}${ai.admin.hours ? ` · czas: <b>${esc(ai.admin.hours)} h</b>` : ''}</p>` : ''}
            ${ai.summary ? `<p class="muted small" style="margin-top:6px">${esc(ai.summary)}</p>` : ''}
            ${Array.isArray(ai.observations) && ai.observations.length ? `<ul class="small" style="margin:8px 0 0;padding-left:18px;color:var(--text-2)">${ai.observations.slice(0, 6).map(o => `<li>${esc(typeof o === 'string' ? o : o.text || '')}</li>`).join('')}</ul>` : ''}
          </div>` : ''}

          <div class="card">
            <div class="card-head"><h3>Zdjęcia z realizacji</h3><div class="row"><button class="btn sm" data-photo="before">${icon('camera', 'sm')} Przed</button><button class="btn sm" data-photo="after">${icon('camera', 'sm')} Po</button></div></div>
            ${media.length ? `<div class="photo-grid">${media.map(m => `<div class="ph" data-img="/api/tasks/${t._id}/media/${m._id}" style="background-image:url('/api/tasks/${t._id}/media/${m._id}')" title="${m.kind === 'before' ? 'Przed' : m.kind === 'after' ? 'Po' : 'Inne'} · ${esc(m.by || '')}"></div>`).join('')}</div>` : '<p class="muted small">Brak zdjęć. Dodaj zdjęcia „przed” na miejscu i „po” na koniec.</p>'}
            ${t.quotePhotoCount ? `<p class="small muted" style="margin-top:10px">Zdjęcia od klienta z formularza: ${Array.from({ length: t.quotePhotoCount }, (_, i) => `<a href="/api/tasks/${t._id}/photos/${i}" target="_blank" rel="noopener">#${i + 1}</a>`).join(' ')}</p>` : ''}
          </div>

          <div class="card" data-chat-card>
            <div class="card-head"><h3>Czat z klientem</h3><span class="small muted" data-chat-info></span></div>
            <div class="msgs" data-chat style="max-height:340px;padding:0"></div>
            <div class="row" style="margin-top:10px" data-chat-form><input class="input" placeholder="Napisz do klienta…" data-chat-text><button class="btn primary" data-chat-send>${icon('send', 'sm')}</button></div>
          </div>
        </div>

        <div class="col" style="gap:14px">
          ${before.length ? `<div class="card"><div class="card-head"><h3>Sprzęt przed wyjazdem</h3><span class="small accent">${before.filter(i => i.done).length}/${before.length}</span></div>${checklist(before)}</div>` : ''}
          <div class="card"><div class="card-head"><h3>Checklista</h3><button class="btn ghost sm" data-add-check>${icon('plus', 'sm')}</button></div>${items.length ? checklist(items) : '<p class="muted small">Brak pozycji.</p>'}</div>

          <div class="card">
            <div class="card-head"><h3>Notatki ekipy</h3></div>
            <div class="timeline">${(t.notes || []).slice().reverse().map(n => `<div class="tl"><i></i><div class="grow"><div style="white-space:pre-wrap">${esc(n.text)}</div><div class="when">${esc(n.author)} · ${ago(n.createdAt)}</div></div></div>`).join('') || '<p class="muted small">Brak notatek.</p>'}</div>
            <div class="row" style="margin-top:10px"><input class="input" placeholder="Dodaj notatkę…" data-note-text><button class="btn" data-note-add>${icon('plus', 'sm')}</button></div>
          </div>

          ${office ? `<div class="card">
            <div class="card-head"><h3>SMS do klienta</h3><span class="small muted" data-sms-log></span></div>
            <div class="row wrap"><button class="btn sm" data-sms="reminder">${icon('sms', 'sm')} Przypomnienie z potwierdzeniem</button><button class="btn sm" data-sms="ontheway">${icon('truck', 'sm')} Ekipa jedzie</button></div>
          </div>
          <div class="card"><div class="card-head"><h3>Jakość</h3></div>
            ${t.clientRating ? `<p>Ocena klienta: <b>${'★'.repeat(t.clientRating)}${'☆'.repeat(5 - t.clientRating)}</b></p>${t.clientFeedback ? `<p class="muted small">„${esc(t.clientFeedback)}”</p>` : ''}` : '<p class="muted small">Klient jeszcze nie ocenił.</p>'}
            <label class="row between" style="margin-top:10px;cursor:pointer"><span><b>Reklamacja</b><br><span class="small muted">Liczy się do rankingu ekipy</span></span><span class="switch"><input type="checkbox" data-complaint ${t.complaint ? 'checked' : ''}><i></i></span></label>
          </div>` : ''}

          <div class="card"><div class="card-head"><h3>Historia</h3></div>
            <div class="timeline">${activity.slice(0, 12).map(a => `<div class="tl"><i style="background:var(--muted-2)"></i><div class="grow"><div class="small">${esc(a.message)}</div><div class="when">${esc(a.actorName)} · ${fmtDateTime(a.createdAt)}</div></div></div>`).join('') || '<p class="muted small">—</p>'}</div>
          </div>
        </div>
      </div>`;
    loadChat();
    if (office) api(`/v2/tasks/${t._id}/sms`).then(r => { const last = r.sms[0]; const box = el.querySelector('[data-sms-log]'); if (last && box) box.textContent = `${last.kind === 'reminder' ? 'Przypomnienie' : 'Ekipa jedzie'}: ${({ sent: 'wysłano', manual: 'do wysłania z telefonu', failed: 'błąd', confirmed: '✓ potwierdzone', reschedule: 'prośba o zmianę' })[last.status] || last.status} · ${ago(last.createdAt)}`; }).catch(() => null);
    clearInterval(timer);
    if (t.status === 'progress') timer = setInterval(() => { const x = el.querySelector('[data-timer]'); if (x) x.textContent = hhmmss(worked()); }, 1000);
  }

  const detail = (label, html) => `<div><div class="eyebrow">${label}</div><div style="margin-top:4px">${html}</div></div>`;
  const checklist = list => `<div class="list">${list.map(i => `<label class="li" style="cursor:pointer"><input type="checkbox" data-check="${i._id}" ${i.done ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent)"><div class="grow"><div class="${i.done ? 'muted' : ''}" style="${i.done ? 'text-decoration:line-through' : ''}">${esc(i.text)}</div>${i.doneBy ? `<div class="li-sub">${esc(i.doneBy)}</div>` : ''}</div></label>`).join('')}</div>`;

  function actionButtons(t) {
    const b = [];
    if (t.status === 'planned') {
      b.push(`<button class="btn primary" data-act="start">${icon('play', 'sm')} Rozpocznij</button>`);
      b.push(`<button class="btn" data-act="otw">${icon('truck', 'sm')} Jedziemy</button>`);
    }
    if (t.status === 'progress') {
      b.push(running() ? `<button class="btn" data-act="pause">${icon('pause', 'sm')} Pauza</button>` : `<button class="btn" data-act="resume">${icon('play', 'sm')} Wznów</button>`);
      b.push(`<button class="btn primary" data-act="complete">${icon('check', 'sm')} Zakończ zlecenie</button>`);
    }
    if (office && ['new', 'quoted'].includes(t.status)) b.push(`<button class="btn primary" data-act="plan">${icon('calendar', 'sm')} Zaplanuj</button>`);
    if (office && t.status === 'completed' && t.paymentStatus !== 'paid') b.push(`<button class="btn" data-act="paid">${icon('wallet', 'sm')} Oznacz jako opłacone</button>`);
    if (t.clientPhone) b.push(`<a class="btn" href="tel:${esc(t.clientPhone)}">${icon('phone', 'sm')} Zadzwoń</a>`);
    if (taskPlace(t)) b.push(`<a class="btn" href="${navUrl(t)}" target="_blank" rel="noopener">${icon('nav', 'sm')} Nawiguj</a>`);
    if (office) b.push(`<button class="btn ghost" data-act="dup">${icon('copy', 'sm')} Duplikuj</button>`);
    return b.join('');
  }

  async function loadChat() {
    const box = el.querySelector('[data-chat]');
    try {
      const r = await api(`/tasks/${task._id}/messages`);
      el.querySelector('[data-chat-info]').textContent = r.canReply ? 'Klient ma konto w panelu /konto' : 'Klient nie ma konta — czat niedostępny';
      if (!r.canReply) el.querySelector('[data-chat-form]').classList.add('hidden');
      box.innerHTML = r.messages.length ? r.messages.map(m => `<div class="msg ${m.from === 'staff' ? 'me' : ''}"><div class="bubble"><small>${esc(m.authorName)} · ${fmtTime(m.createdAt)}</small>${esc(m.text || '')}${m.hasPhoto ? `<img src="/api/tasks/${task._id}/messages/${m.id}/photo" data-img="/api/tasks/${task._id}/messages/${m.id}/photo" alt="">` : ''}</div></div>`).join('') : '<p class="muted small">Brak wiadomości.</p>';
      box.scrollTop = box.scrollHeight;
    } catch { el.querySelector('[data-chat-card]')?.classList.add('hidden'); }
  }

  async function act(action, btn) {
    await busy(btn, async () => {
      if (action === 'start') {
        await api(`/tasks/${id}/status`, { method: 'PATCH', body: { status: 'progress' } });
        toast('Zlecenie rozpoczęte — stoper liczy czas', 'ok');
      } else if (action === 'pause' || action === 'resume') {
        await api(`/tasks/${id}/timer`, { method: 'POST', body: { action } });
      } else if (action === 'otw') {
        return onTheWay();
      } else if (action === 'complete') {
        return completeWizard();
      } else if (action === 'plan') {
        const m = await import('../taskform.js');
        await m.openTaskForm(task, { status: 'planned' });
      } else if (action === 'paid') {
        await api(`/tasks/${id}`, { method: 'PUT', body: { paymentStatus: 'paid' } });
        toast('Oznaczono jako opłacone', 'ok');
      } else if (action === 'dup') {
        const r = await api(`/tasks/${id}/duplicate`, { method: 'POST' });
        toast('Utworzono kopię zlecenia', 'ok');
        await reloadData();
        return go('zlecenia/' + r.task._id);
      }
      await load();
      render();
      reloadData().catch(() => null);
    });
  }

  function onTheWay() {
    modal({
      title: 'Jedziemy do klienta',
      body: `${fieldHtml({ name: 'eta', label: 'Za ile minut będziecie?', type: 'number', value: 20, min: 1, max: 600 })}
        ${task.clientPhone ? fieldHtml({ name: 'sms', label: 'Wyślij klientowi SMS „Ekipa jedzie” z czasem przyjazdu', type: 'checkbox', value: true }) : '<p class="small muted">Brak telefonu klienta — SMS nie zostanie wysłany.</p>'}`,
      foot: '<button class="btn ghost" data-close>Anuluj</button><button class="btn primary" data-go>Jedziemy</button>',
      onMount: (m, close) => m.querySelector('[data-go]').addEventListener('click', e => busy(e.currentTarget, async () => {
        const v = readForm(m);
        await api(`/tasks/${id}/on-the-way`, { method: 'POST', body: { etaMinutes: v.eta || 20 } });
        if (v.sms) {
          const r = await api(`/v2/tasks/${id}/sms`, { method: 'POST', body: { kind: 'ontheway' } });
          if (r.smsLink) location.href = r.smsLink; else toast('Klient dostał SMS z czasem przyjazdu', 'ok');
        } else toast('Zapisano — klient widzi przyjazd w panelu', 'ok');
        close();
        await load(); render();
      }))
    });
  }

  function completeWizard() {
    const shots = { before: [], after: [] };
    const settings = S.data.settings || {};
    const paint = m => {
      for (const k of ['before', 'after']) {
        m.querySelector(`[data-shots="${k}"]`).innerHTML = shots[k].map((d, i) => `<div class="ph" style="background-image:url('${d}')"><button class="x" data-rm="${k}:${i}">×</button></div>`).join('') + `<button class="add-ph" data-add="${k}">+</button>`;
      }
    };
    modal({
      title: 'Zakończenie zlecenia — raport',
      wide: true,
      body: `
        <div class="eyebrow">Zdjęcia (${media.length} już dodanych)</div>
        <div class="grid g2"><div><div class="small b" style="margin-bottom:6px">Przed</div><div class="photo-grid" data-shots="before"></div></div><div><div class="small b" style="margin-bottom:6px">Po</div><div class="photo-grid" data-shots="after"></div></div></div>
        <div class="eyebrow" style="margin-top:6px">Koszty zlecenia (0, jeśli nie było)</div>
        <form class="form-grid" data-form>
          ${fieldHtml({ name: 'fuel', label: 'Paliwo (zł)', type: 'number', value: '', min: 0 })}
          ${fieldHtml({ name: 'materials', label: 'Materiały (zł)', type: 'number', value: '', min: 0 })}
          ${fieldHtml({ name: 'disposal', label: 'Utylizacja (zł)', type: 'number', value: '', min: 0 })}
          ${fieldHtml({ name: 'other', label: 'Inne (zł)', type: 'number', value: '', min: 0 })}
          ${fieldHtml({ name: 'hoursWorked', label: 'Godziny pracy', type: 'number', value: task.workLog?.length ? Math.round((worked() / 3600000) * 10) / 10 : '', min: 0, step: 0.5, hint: task.workLog?.length ? 'Ze stopera — możesz poprawić' : '' })}
          ${fieldHtml({ name: 'cashCollected', label: 'Pobrana kwota od klienta (zł)', type: 'number', value: '', min: 0 })}
          ${office ? fieldHtml({ name: 'finalPrice', label: 'Cena końcowa (zł)', type: 'number', value: taskAmount(task) || '', min: 0 }) : ''}
          ${office ? fieldHtml({ name: 'paymentStatus', label: 'Płatność', type: 'select', value: task.paymentStatus, options: [['unpaid', 'Nieopłacone'], ['partial', 'Częściowo'], ['paid', 'Opłacone']] }) : ''}
          ${fieldHtml({ name: 'completionNote', label: 'Uwagi z realizacji', type: 'textarea', full: true, value: '' })}
          ${task.clientPhone ? fieldHtml({ name: 'reviewConsent', label: 'Klient zadowolony — wyślij SMS z prośbą o opinię Google', type: 'checkbox', value: false, full: true }) : ''}
        </form>`,
      foot: '<button class="btn ghost" data-close>Anuluj</button><button class="btn primary" data-finish>Zakończ zlecenie</button>',
      onMount: (m, close) => {
        paint(m);
        m.addEventListener('click', async e => {
          const add = e.target.closest('[data-add]');
          if (add) { const list = await pickPhotos({ multiple: true }); shots[add.dataset.add].push(...list); paint(m); }
          const rm = e.target.closest('[data-rm]');
          if (rm) { const [k, i] = rm.dataset.rm.split(':'); shots[k].splice(Number(i), 1); paint(m); }
        });
        m.querySelector('[data-finish]').addEventListener('click', e => busy(e.currentTarget, async () => {
          for (const k of ['before', 'after']) {
            for (let i = 0; i < shots[k].length; i += 4) await api(`/tasks/${id}/media`, { method: 'POST', body: { kind: k, photos: shots[k].slice(i, i + 4) } });
          }
          shots.before = []; shots.after = [];
          const v = readForm(m.querySelector('[data-form]'));
          const body = {
            costs: { fuel: v.fuel, materials: v.materials, disposal: v.disposal, other: v.other },
            hoursWorked: v.hoursWorked, cashCollected: v.cashCollected, completionNote: v.completionNote, reviewConsent: v.reviewConsent === true
          };
          // Biuro może zamknąć zlecenie bez zdjęć (np. z komputera) — ekipę nadal obowiązuje wymóg zdjęć
          if (office) { body.finalPrice = v.finalPrice; body.paymentStatus = v.paymentStatus; body.skipPhotos = true; }
          if (settings.requireCostReport !== false) for (const k of ['fuel', 'materials', 'disposal', 'other']) if (body.costs[k] === '') body.costs[k] = 0;
          const r = await api(`/tasks/${id}/complete`, { method: 'POST', body });
          close();
          toast('Zlecenie zakończone — dziękujemy!', 'ok');
          if (r.smsLink) location.href = r.smsLink;
          await load(); render();
          reloadData().catch(() => null);
        }));
      }
    });
  }

  el.addEventListener('click', async e => {
    if (e.target.closest('[data-back]')) return history.length > 1 ? history.back() : go('zlecenia');
    const a = e.target.closest('[data-act]');
    if (a) return act(a.dataset.act, a);
    const img = e.target.closest('[data-img]');
    if (img) return lightbox(img.dataset.img);
    const ph = e.target.closest('[data-photo]');
    if (ph) {
      const list = await pickPhotos({ multiple: true, camera: true });
      if (!list.length) return;
      await busy(ph, async () => { for (let i = 0; i < list.length; i += 4) await api(`/tasks/${id}/media`, { method: 'POST', body: { kind: ph.dataset.photo, photos: list.slice(i, i + 4) } }); toast(`Dodano zdjęcia: ${list.length}`, 'ok'); await load(); render(); });
      return;
    }
    if (e.target.closest('[data-note-add]')) {
      const inp = el.querySelector('[data-note-text]');
      if (!inp.value.trim()) return;
      await busy(e.target.closest('button'), async () => { await api(`/tasks/${id}/notes`, { method: 'POST', body: { text: inp.value.trim() } }); await load(); render(); });
      return;
    }
    if (e.target.closest('[data-add-check]')) {
      const text = prompt('Nowa pozycja checklisty');
      if (!text) return;
      await busy(null, async () => { await api(`/tasks/${id}`, { method: 'PUT', body: { checklist: [...(task.checklist || []), { text, phase: 'task', done: false }] } }); await load(); render(); });
      return;
    }
    const sms = e.target.closest('[data-sms]');
    if (sms) {
      if (!task.clientPhone) return toast('Brak telefonu klienta', 'err');
      if (sms.dataset.sms === 'reminder' && !await confirmBox('Wysłać klientowi SMS z przypomnieniem i linkiem do potwierdzenia terminu?', { ok: 'Wyślij' })) return;
      await busy(sms, async () => {
        const r = await api(`/v2/tasks/${id}/sms`, { method: 'POST', body: { kind: sms.dataset.sms } });
        if (r.smsLink) { toast('Bramka SMS nie jest skonfigurowana — otwieram SMS w telefonie'); location.href = r.smsLink; } else toast('SMS wysłany', 'ok');
        render();
      });
      return;
    }
    if (e.target.closest('[data-chat-send]')) {
      const inp = el.querySelector('[data-chat-text]');
      if (!inp.value.trim()) return;
      await busy(e.target.closest('button'), async () => { await api(`/tasks/${id}/messages`, { method: 'POST', body: { text: inp.value.trim() } }); inp.value = ''; loadChat(); });
    }
  });
  el.addEventListener('change', async e => {
    const c = e.target.closest('[data-check]');
    if (c) {
      try { await api(`/tasks/${id}/checklist/${c.dataset.check}`, { method: 'PATCH', body: { done: c.checked } }); await load(); render(); } catch (error) { toast(error.message, 'err'); c.checked = !c.checked; }
    }
    if (e.target.matches('[data-complaint]')) {
      try { await api(`/tasks/${id}`, { method: 'PUT', body: { complaint: e.target.checked } }); toast(e.target.checked ? 'Oznaczono reklamację' : 'Usunięto reklamację', 'ok'); } catch (error) { toast(error.message, 'err'); }
    }
  });
  el.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.matches('[data-note-text]')) el.querySelector('[data-note-add]').click();
    if (e.target.matches('[data-chat-text]')) el.querySelector('[data-chat-send]').click();
  });

  render();
  if (query?.zakoncz && ['progress', 'planned'].includes(task.status)) completeWizard();
  return () => clearInterval(timer);
}
