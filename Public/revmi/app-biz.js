/* RevMi 4.0 — notatnik, wiadomości, działy, oferty, abonamenty, magazyn, cennik, raporty, wyszukiwarka i szybkie dodawanie */
'use strict';

(function () {
  const RM = window.RM;
  const { esc, $, $$ } = RM;
  const S = RM.state;
  const views = RM.views;
  const H = () => RM.helpers;
  const empty = (...a) => H().empty(...a);
  const plural = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
  const nl2br = text => esc(text).replace(/\n/g, '<br>');
  const digits = phone => String(phone || '').replace(/[^\d]/g, '');
  const waUrl = (phone, text = '') => {
    let d = digits(phone);
    if (d.length === 9) d = '48' + d;
    return `https://wa.me/${d}${text ? '?text=' + encodeURIComponent(text) : ''}`;
  };

  /* ================================================================== */
  /* NOTATNIK                                                            */
  /* ================================================================== */

  async function loadNotes(archived = false) {
    const { notes } = await RM.api('/api/notes' + (archived ? '?archived=1' : ''));
    if (!archived) S.notes = notes;
    return notes;
  }

  const checklistToText = items => (items || []).map(i => (i.done ? '[x] ' : '') + i.text).join('\n');
  function textToChecklist(text, previous = []) {
    const old = new Map((previous || []).map(i => [i.text, i]));
    return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const done = /^\[(x|X)\]/.test(line);
      const clean = line.replace(/^\[( |x|X)?\]\s*/, '').replace(/^[-•]\s*/, '').trim();
      const prev = old.get(clean);
      return { ...(prev?._id ? { _id: prev._id } : {}), text: clean, done };
    }).filter(i => i.text);
  }

  RM.noteForm = function (note, preset = {}, done) {
    const editing = Boolean(note);
    const values = { color: 'default', visibility: 'private', ...(note || {}), ...preset };
    values.checklistText = checklistToText(values.checklist);
    values.tagsText = (values.tags || []).join(', ');
    values.reminderAt = values.reminderAt || '';
    const canChangeVisibility = !editing || note.mine;
    RM.form({
      title: editing ? 'Edytuj notatkę' : 'Nowa notatka',
      subtitle: editing ? `${note.mine ? 'Twoja notatka' : 'Notatka: ' + (note.ownerName || 'zespół')} · zapisano ${RM.ago(note.updatedAt)}${note.lastEditedBy ? ' (' + note.lastEditedBy + ')' : ''}` : 'Zapisuje się w bazie — dostępna na telefonie i komputerze',
      values,
      fields: [
        { name: 'title', label: 'Tytuł', full: true, maxlength: 160, placeholder: 'np. Ustalenia z klientem, lista zakupów na budowę…' },
        { name: 'content', label: 'Treść', type: 'textarea', full: true, maxlength: 20000, placeholder: 'Pisz swobodnie…' },
        { name: 'checklistText', label: 'Lista zadań (jedna pozycja w wierszu, „[x]” = zrobione)', type: 'textarea', full: true, placeholder: 'Kupić folię stretch\n[x] Zadzwonić do klienta' },
        { name: 'tagsText', label: 'Tagi (po przecinku)', placeholder: 'np. klient, budowa, pilne' },
        { name: 'color', label: 'Kolor', type: 'select', options: Object.entries(RM.NOTE_COLORS) },
        canChangeVisibility ? { name: 'visibility', label: 'Widoczność', type: 'select', options: [['private', 'Prywatna — tylko ja'], ['team', 'Zespołowa — cały zespół']] } : { type: 'html', html: `<p class="muted small" style="margin:0"><i class="fa-solid fa-users"></i> Notatka zespołowa — autor: ${esc(note.ownerName || '')}</p>` },
        { name: 'reminderAt', label: 'Przypomnienie (push)', type: 'datetime-local', hint: 'Dostaniesz powiadomienie o tej godzinie' },
        { name: 'division', label: 'Dział', type: 'select', options: RM.divOptions('— brak —') },
        { name: 'pinned', label: 'Przypnij na górze', type: 'switch' }
      ],
      submitLabel: editing ? 'Zapisz' : 'Dodaj notatkę',
      danger: editing && (note.mine || RM.isAdmin()) ? { label: 'Usuń', confirm: 'Usunąć notatkę? Tej operacji nie można cofnąć.', action: async () => { await RM.api('/api/notes/' + note._id, { method: 'DELETE' }); RM.toast('Usunięto notatkę'); done?.(); } } : null,
      async onSubmit(data) {
        const body = {
          title: data.title, content: data.content, color: data.color, pinned: data.pinned, division: data.division,
          tags: data.tagsText, checklist: textToChecklist(data.checklistText, note?.checklist), reminderAt: data.reminderAt || null
        };
        if (data.visibility) body.visibility = data.visibility;
        if (preset.task) body.task = preset.task;
        if (!body.title && !body.content && !body.checklist.length) throw new Error('Notatka jest pusta');
        await RM.api(editing ? '/api/notes/' + note._id : '/api/notes', { method: editing ? 'PUT' : 'POST', body });
        RM.toast(editing ? 'Zapisano notatkę' : 'Dodano notatkę');
        if (location.hash.startsWith('#/notatnik/')) history.replaceState(null, '', '#/notatnik');
        done?.();
        if (!done && location.hash.startsWith('#/notatnik')) RM.rerender();
      }
    });
  };

  function noteCard(n) {
    const items = n.checklist || [];
    const doneCount = items.filter(i => i.done).length;
    const reminder = n.reminderAt && !n.reminderSentAt ? `<span class="note-chip ${new Date(n.reminderAt) < new Date() ? 'late' : ''}"><i class="fa-regular fa-bell"></i>${esc(RM.formatWhen(n.reminderAt))}</span>` : '';
    return `<article class="pad-note nc-${esc(n.color || 'default')}" data-note="${esc(n._id)}">
      <div class="pad-note-head">
        ${n.title ? `<h3>${esc(n.title)}</h3>` : '<span></span>'}
        <button class="icon-btn ghost sm ${n.pinned ? 'on' : ''}" data-pin="${esc(n._id)}" title="${n.pinned ? 'Odepnij' : 'Przypnij'}" aria-label="Przypnij"><i class="fa-solid fa-thumbtack"></i></button>
      </div>
      ${n.content ? `<div class="pad-note-text">${nl2br(String(n.content).slice(0, 900))}${String(n.content).length > 900 ? '…' : ''}</div>` : ''}
      ${items.length ? `<div class="pad-check">${items.slice(0, 8).map(i => `<button class="pad-check-item ${i.done ? 'done' : ''}" data-ncheck="${esc(n._id)}" data-item="${esc(i._id)}"><span class="box"><i class="fa-solid fa-check"></i></span><span>${esc(i.text)}</span></button>`).join('')}${items.length > 8 ? `<small class="muted">+ ${items.length - 8} więcej</small>` : ''}<div class="progress"><i style="width:${(doneCount / items.length) * 100}%"></i></div></div>` : ''}
      <div class="pad-note-foot">
        ${(n.tags || []).map(t => `<button class="note-tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}
        ${n.division ? RM.divBadge(n.division) : ''}
        ${reminder}
        <span class="pad-note-meta">${n.visibility === 'team' ? '<i class="fa-solid fa-users" title="Zespołowa"></i>' : '<i class="fa-solid fa-lock" title="Prywatna"></i>'} ${n.mine ? '' : esc(n.ownerName || '') + ' · '}${esc(RM.ago(n.updatedAt))}</span>
      </div>
    </article>`;
  }

  views.notatnik = {
    title: 'Notatnik',
    async render(el) {
      const ui = S.ui;
      if (!el.querySelector('.pad-grid')) el.innerHTML = '<div class="skeleton"></div>';
      const archived = ui.notesFilter === 'archived';
      const notes = archived ? await loadNotes(true) : await loadNotes();
      const q = (ui.notesQuery || '').toLowerCase();
      const tags = [...new Set(S.notes.flatMap(n => n.tags || []))].sort();
      const filters = [['all', 'Wszystkie'], ['mine', 'Moje'], ['team', 'Zespołowe'], ['reminders', 'Przypomnienia'], ['archived', 'Archiwum']];
      const list = notes.filter(n => {
        if (ui.notesFilter === 'mine' && !n.mine) return false;
        if (ui.notesFilter === 'team' && n.visibility !== 'team') return false;
        if (ui.notesFilter === 'reminders' && !(n.reminderAt && !n.reminderSentAt)) return false;
        if (ui.notesTag && !(n.tags || []).includes(ui.notesTag)) return false;
        if (q && ![n.title, n.content, ...(n.tags || []), ...(n.checklist || []).map(i => i.text)].join(' ').toLowerCase().includes(q)) return false;
        return true;
      });
      const pinned = list.filter(n => n.pinned);
      const rest = list.filter(n => !n.pinned);
      el.innerHTML = `
        <div class="page-head"><div><h1>Notatnik</h1><p>${S.notes.length} ${plural(S.notes.length, 'notatka', 'notatki', 'notatek')} · zapisywane w bazie, dostępne na każdym urządzeniu</p></div>
          <div class="page-actions"><button class="btn primary" id="noteNew"><i class="fa-solid fa-plus"></i> Nowa notatka</button></div></div>
        ${archived ? '' : `<form class="quick-note" id="quickNote"><i class="fa-regular fa-pen-to-square"></i><input name="text" maxlength="2000" placeholder="Szybka notatka — wpisz i naciśnij Enter…" autocomplete="off"><button class="btn sm primary" aria-label="Zapisz"><i class="fa-solid fa-arrow-up"></i></button></form>`}
        <div class="toolbar">
          <div class="segmented">${filters.map(([k, l]) => `<button data-nfilter="${k}" class="${ui.notesFilter === k ? 'active' : ''}">${l}</button>`).join('')}</div>
          <input class="input" id="noteSearch" type="search" placeholder="Szukaj w notatkach…" value="${esc(ui.notesQuery || '')}" style="min-width:220px">
        </div>
        ${tags.length ? `<div class="chips" style="margin:-4px 0 16px">${ui.notesTag ? `<button class="note-tag on" data-tag="">#${esc(ui.notesTag)} <i class="fa-solid fa-xmark"></i></button>` : tags.map(t => `<button class="note-tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
        ${pinned.length ? `<h4 class="day-title"><i class="fa-solid fa-thumbtack"></i> Przypięte</h4><div class="pad-grid">${pinned.map(noteCard).join('')}</div>` : ''}
        ${rest.length ? `${pinned.length ? '<h4 class="day-title">Pozostałe</h4>' : ''}<div class="pad-grid">${rest.map(noteCard).join('')}</div>` : ''}
        ${!list.length ? empty('fa-note-sticky', archived ? 'Archiwum jest puste' : 'Brak notatek', q || ui.notesTag ? 'Zmień filtr lub wyszukiwanie.' : 'Zapisz ustalenia, listy zakupów, kody do bram, pomysły — wszystko trafia do bazy MongoDB.', '<button class="btn primary" data-action="note-new"><i class="fa-solid fa-plus"></i> Pierwsza notatka</button>') : ''}`;

      const rerender = () => views.notatnik.render(el);
      $('#noteNew', el).addEventListener('click', () => RM.noteForm(null, {}, rerender));
      $('[data-action="note-new"]', el)?.addEventListener('click', () => RM.noteForm(null, {}, rerender));
      $('#quickNote', el)?.addEventListener('submit', async e => {
        e.preventDefault();
        const text = e.target.elements.text.value.trim();
        if (!text) return;
        try { await RM.api('/api/notes', { method: 'POST', body: { content: text } }); e.target.reset(); RM.toast('Zapisano'); rerender(); } catch (err) { RM.fail(err); }
      });
      $$('[data-nfilter]', el).forEach(b => b.addEventListener('click', () => { ui.notesFilter = b.dataset.nfilter; rerender(); }));
      $$('[data-tag]', el).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); ui.notesTag = b.dataset.tag; rerender(); }));
      $('#noteSearch', el).addEventListener('input', RM.debounce(e => { ui.notesQuery = e.target.value; rerender(); }, 250));
      $$('[data-pin]', el).forEach(b => b.addEventListener('click', async e => {
        e.stopPropagation();
        const n = notes.find(x => x._id === b.dataset.pin);
        try { await RM.api('/api/notes/' + n._id, { method: 'PUT', body: { pinned: !n.pinned } }); rerender(); } catch (err) { RM.fail(err); }
      }));
      $$('[data-ncheck]', el).forEach(b => b.addEventListener('click', async e => {
        e.stopPropagation();
        b.classList.toggle('done');
        try { await RM.api(`/api/notes/${b.dataset.ncheck}/checklist/${b.dataset.item}`, { method: 'PATCH', body: {} }); rerender(); } catch (err) { b.classList.toggle('done'); RM.fail(err); }
      }));
      $$('[data-note]', el).forEach(card => card.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        const n = notes.find(x => x._id === card.dataset.note);
        noteActions(n, rerender);
      }));
      if (RM.routeId) {
        const n = notes.find(x => x._id === RM.routeId) || (await loadNotes(true)).find(x => x._id === RM.routeId);
        RM.routeId = null;
        if (n) noteActions(n, rerender);
      }
    }
  };

  function noteActions(n, rerender) {
    RM.noteForm(n, {}, rerender);
    const foot = $('#modal .modal-foot');
    if (!foot) return;
    const extra = document.createElement('div');
    extra.className = 'btn-row';
    extra.style.marginRight = 'auto';
    extra.innerHTML = `<button type="button" class="btn sm" data-arch>${n.archived ? '<i class="fa-solid fa-box-open"></i> Przywróć' : '<i class="fa-solid fa-box-archive"></i> Archiwizuj'}</button><button type="button" class="btn sm" data-dup><i class="fa-regular fa-copy"></i> Kopia</button>`;
    foot.prepend(extra);
    $('[data-arch]', extra).addEventListener('click', async () => {
      try { await RM.api('/api/notes/' + n._id, { method: 'PUT', body: { archived: !n.archived } }); RM.closeModal(); RM.toast(n.archived ? 'Przywrócono' : 'Przeniesiono do archiwum'); rerender(); } catch (err) { RM.fail(err); }
    });
    $('[data-dup]', extra).addEventListener('click', async () => {
      try { await RM.api('/api/notes', { method: 'POST', body: { title: (n.title || 'Notatka') + ' (kopia)', content: n.content, checklist: (n.checklist || []).map(i => ({ text: i.text, done: i.done })), tags: n.tags, color: n.color, division: n.division } }); RM.closeModal(); RM.toast('Utworzono kopię'); rerender(); } catch (err) { RM.fail(err); }
    });
  }

  /* ================================================================== */
  /* WIADOMOŚCI (formularz kontaktowy)                                   */
  /* ================================================================== */

  views.wiadomosci = {
    title: 'Wiadomości',
    admin: true,
    async render(el) {
      const ui = S.ui;
      if (!el.querySelector('.msg-list')) el.innerHTML = '<div class="skeleton"></div>';
      const r = await RM.api('/api/messages?status=' + encodeURIComponent(ui.messagesFilter));
      const c = r.counts || {};
      S.messagesNew = c.new || 0;
      const filters = [['inbox', 'Skrzynka', (c.new || 0) + (c.read || 0) + (c.replied || 0)], ['new', 'Nowe', c.new || 0], ['replied', 'Odpowiedziano', c.replied || 0], ['archived', 'Archiwum', c.archived || 0], ['spam', 'Spam', c.spam || 0], ['all', 'Wszystkie', Object.values(c).reduce((a, b) => a + b, 0)]];
      el.innerHTML = `
        <div class="page-head"><div><h1>Wiadomości</h1><p>Formularz kontaktowy ze strony — osoby prywatne i firmy</p></div></div>
        ${r.mail.configured ? `<div class="alert accent" style="margin-bottom:14px"><i class="fa-solid fa-envelope-circle-check"></i><div><strong>Kopie wiadomości trafiają na e-mail</strong><p>Wysyłka przez ${r.mail.provider === 'resend' ? 'Resend' : 'SMTP'} na adres firmowy. Odpowiadając z panelu, otworzysz swoją pocztę z gotowym tematem.</p></div></div>`
          : '<div class="alert" style="margin-bottom:14px"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>Wysyłka e-mail nie jest skonfigurowana</strong><p>Wiadomości zapisują się tutaj i przychodzą jako push. Aby dostawać je także na kontakt@revserwis.pl, ustaw w Railway <b>RESEND_API_KEY</b> albo <b>SMTP_HOST / SMTP_USER / SMTP_PASS</b> (instrukcja w README).</p></div></div>'}
        <div class="toolbar"><div class="segmented">${filters.map(([k, l, n]) => `<button data-mfilter="${k}" class="${ui.messagesFilter === k ? 'active' : ''}">${l}<span class="n">${n}</span></button>`).join('')}</div></div>
        <div class="card msg-list">${r.messages.map(m => `
          <button class="msg-row ${m.status === 'new' ? 'unread' : ''}" data-msg="${esc(m._id)}">
            <span class="row-icon ${m.kind === 'company' ? 'blue' : ''}"><i class="fa-solid ${m.kind === 'company' ? 'fa-building' : 'fa-user'}"></i></span>
            <span class="msg-main"><span class="msg-top"><strong>${esc(m.kind === 'company' && m.company ? m.company : m.name)}</strong>${m.kind === 'company' ? `<span class="muted small">${esc(m.name)}</span>` : ''}${RM.divBadge(m.division)}</span>
              <span class="msg-topic">${esc(m.topic)}</span><span class="msg-snippet">${esc(String(m.message).slice(0, 160))}</span></span>
            <span class="msg-side"><small>${esc(RM.ago(m.createdAt))}</small>${RM.tag(RM.MESSAGE_STATUS[m.status])}${m.mail?.sentAt ? '<i class="fa-solid fa-envelope-circle-check" title="Wysłano na e-mail" style="color:var(--accent)"></i>' : m.mail?.error ? `<i class="fa-solid fa-envelope" title="${esc(m.mail.error)}" style="color:var(--red)"></i>` : ''}</span>
          </button>`).join('') || empty('fa-envelope-open', 'Brak wiadomości', 'Wiadomości z formularza kontaktowego pojawią się tutaj.')}</div>`;
      const rerender = () => views.wiadomosci.render(el);
      $$('[data-mfilter]', el).forEach(b => b.addEventListener('click', () => { ui.messagesFilter = b.dataset.mfilter; rerender(); }));
      $$('[data-msg]', el).forEach(b => b.addEventListener('click', () => openMessage(b.dataset.msg, rerender)));
      if (RM.routeId) { const id = RM.routeId; RM.routeId = null; openMessage(id, rerender); }
    }
  };

  async function openMessage(id, rerender) {
    let m;
    try { ({ message: m } = await RM.api('/api/messages/' + id)); } catch (err) { return RM.fail(err); }
    const who = m.kind === 'company' && m.company ? `${m.company} (${m.name})` : m.name;
    const replySubject = `Re: ${m.topic} — RevSerwis`;
    const replyBody = `Dzień dobry,\n\n\n\nPozdrawiamy\nRevSerwis · 735 396 534\n\n— — —\n${who} napisał(a):\n${m.message}`;
    const mailto = m.email ? `mailto:${m.email}?subject=${encodeURIComponent(replySubject)}&body=${encodeURIComponent(replyBody)}` : '';
    const html = `
      <div class="msg-detail">
        <div class="btn-row" style="margin-bottom:14px">${RM.tag(RM.MESSAGE_STATUS[m.status])}<span class="badge plain">${m.kind === 'company' ? 'Firma' : 'Osoba prywatna'}</span>${RM.divBadge(m.division)}<span class="muted small">${esc(RM.formatWhen(m.createdAt))}</span></div>
        <dl class="details-table">
          <dt>Od</dt><dd>${esc(m.name)}</dd>
          ${m.company ? `<dt>Firma</dt><dd>${esc(m.company)}${m.nip ? ' · NIP ' + esc(m.nip) : ''}</dd>` : ''}
          <dt>E-mail</dt><dd>${m.email ? `<a class="link" href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : '—'}</dd>
          <dt>Telefon</dt><dd>${m.phone ? `<a class="link" href="${esc(RM.telUrl(m.phone))}">${esc(m.phone)}</a>` : '—'}</dd>
          <dt>Temat</dt><dd>${esc(m.topic)}</dd>
          <dt>E-mail firmowy</dt><dd>${m.mail?.sentAt ? 'wysłano ' + esc(RM.ago(m.mail.sentAt)) : m.mail?.error ? '<span style="color:var(--red)">błąd: ' + esc(m.mail.error) + '</span> <button type="button" class="link" data-resend>Wyślij ponownie</button>' : m.mail?.pending ? 'w kolejce' : '—'}</dd>
        </dl>
        <div class="desc msg-body">${nl2br(m.message)}</div>
        <div class="quick" style="margin-top:14px">
          ${mailto ? `<a href="${esc(mailto)}" data-replied><i class="fa-solid fa-reply"></i>Odpowiedz</a>` : '<button disabled style="opacity:.4"><i class="fa-solid fa-reply"></i>Brak e-mail</button>'}
          ${m.phone ? `<a href="${esc(RM.telUrl(m.phone))}"><i class="fa-solid fa-phone"></i>Zadzwoń</a>` : '<button disabled style="opacity:.4"><i class="fa-solid fa-phone"></i>Brak tel.</button>'}
          ${m.phone ? `<a href="${esc(waUrl(m.phone, `Dzień dobry, tu RevSerwis — odpowiadamy na wiadomość (${m.topic}).`))}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i>WhatsApp</a>` : '<button disabled style="opacity:.4"><i class="fa-brands fa-whatsapp"></i>WhatsApp</button>'}
          <button type="button" data-totask><i class="fa-solid fa-inbox"></i>${m.task ? 'Otwórz wycenę' : 'Utwórz wycenę'}</button>
        </div>
        <div class="btn-row" style="margin-top:12px">
          <button type="button" class="btn sm" data-offer><i class="fa-solid fa-file-signature"></i> Oferta</button>
          <button type="button" class="btn sm" data-client><i class="fa-solid fa-address-book"></i> ${m.client ? 'Klient w CRM ✓' : 'Zapisz klienta'}</button>
          <button type="button" class="btn sm" data-note><i class="fa-solid fa-note-sticky"></i> Do notatnika</button>
          ${['replied', 'archived', 'spam'].filter(st => st !== m.status).map(st => `<button type="button" class="btn sm" data-status="${st}">${esc(RM.MESSAGE_STATUS[st][0])}</button>`).join('')}
        </div>
      </div>`;
    const form = RM.form({
      title: who,
      subtitle: m.topic,
      values: { internalNotes: m.internalNotes || '' },
      fields: [{ type: 'html', full: true, html }, { name: 'internalNotes', label: 'Notatka wewnętrzna (widzą tylko administratorzy)', type: 'textarea', full: true }],
      submitLabel: 'Zapisz notatkę',
      danger: { label: 'Usuń', confirm: 'Usunąć wiadomość na stałe?', action: async () => { await RM.api('/api/messages/' + m._id, { method: 'DELETE' }); RM.toast('Usunięto'); rerender?.(); } },
      async onSubmit(data) {
        await RM.api('/api/messages/' + m._id, { method: 'PATCH', body: { internalNotes: data.internalNotes } });
        RM.toast('Zapisano');
        rerender?.();
      }
    });
    const setStatus = async status => {
      try { await RM.api('/api/messages/' + m._id, { method: 'PATCH', body: { status } }); RM.toast('Status: ' + RM.MESSAGE_STATUS[status][0]); RM.closeModal(); rerender?.(); } catch (err) { RM.fail(err); }
    };
    $$('[data-status]', form).forEach(b => b.addEventListener('click', () => setStatus(b.dataset.status)));
    $('[data-replied]', form)?.addEventListener('click', () => { if (m.status !== 'replied') RM.api('/api/messages/' + m._id, { method: 'PATCH', body: { status: 'replied' } }).then(() => rerender?.()).catch(() => null); });
    $('[data-resend]', form)?.addEventListener('click', async () => { try { await RM.api(`/api/messages/${m._id}/resend`, { method: 'POST' }); RM.toast('Wysłano na e-mail'); } catch (err) { RM.fail(err); } });
    $('[data-totask]', form).addEventListener('click', async () => {
      try { const r = await RM.api(`/api/messages/${m._id}/task`, { method: 'POST' }); RM.upsertTask(r.task); RM.closeModal(); RM.toast(r.existing ? 'Otwieram wycenę' : 'Utworzono wycenę'); RM.openTask(r.task._id); } catch (err) { RM.fail(err); }
    });
    $('[data-client]', form).addEventListener('click', async () => {
      try { await RM.api(`/api/messages/${m._id}/client`, { method: 'POST' }); RM.toast('Klient zapisany w CRM'); RM.closeModal(); rerender?.(); } catch (err) { RM.fail(err); }
    });
    $('[data-offer]', form).addEventListener('click', () => {
      RM.closeModal();
      RM.offerForm(null, { title: m.topic, division: m.division, client: m.client || '', clientName: m.name, clientCompany: m.company, clientNip: m.nip, clientEmail: m.email, clientPhone: m.phone, message: m._id, notes: m.message.slice(0, 1000) });
    });
    $('[data-note]', form).addEventListener('click', () => {
      RM.closeModal();
      RM.noteForm(null, { title: `${who} — ${m.topic}`, content: `${m.message}\n\n${[m.email, m.phone].filter(Boolean).join(' · ')}`, division: m.division, tags: ['wiadomość'] });
    });
    if (m.status === 'new') { S.messagesNew = Math.max(0, S.messagesNew - 1); RM.rerender?.(); }
  }

  /* ================================================================== */
  /* DZIAŁY                                                              */
  /* ================================================================== */

  views.dzialy = {
    title: 'Działy',
    admin: true,
    async render(el) {
      if (!S.dashboard) S.dashboard = await RM.api('/api/dashboard').catch(() => null);
      const stats = new Map((S.dashboard?.business?.divisions || []).map(d => [d.slug, d]));
      const open = slug => S.tasks.filter(t => RM.taskDivision(t) === slug && ['new', 'quoted', 'planned', 'progress'].includes(t.status));
      const slug = RM.routeId;
      if (slug && RM.division(slug)) return divisionDetail(el, RM.division(slug), stats.get(slug) || {}, open(slug));
      const unassigned = S.tasks.filter(t => !RM.taskDivision(t) && ['new', 'quoted', 'planned', 'progress'].includes(t.status)).length;
      el.innerHTML = `
        <div class="page-head"><div><h1>Działy</h1><p>17 działów RevSerwis — zlecenia i wyniki w bieżącym miesiącu</p></div>
          <div class="page-actions"><a class="btn" href="/uslugi.html" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Strona działów</a></div></div>
        ${unassigned ? `<div class="alert" style="margin-bottom:16px"><i class="fa-solid fa-tags"></i><div><strong>${unassigned} ${plural(unassigned, 'otwarte zlecenie', 'otwarte zlecenia', 'otwartych zleceń')} bez działu</strong><p>Ustaw dział w edycji zlecenia — raporty pokażą wtedy wyniki każdego działu.</p></div></div>` : ''}
        ${RM.DIV_GROUPS.map(g => `<h4 class="day-title">${esc(g.name)}</h4><div class="grid grid-auto div-grid">${RM.DIVISIONS.filter(d => d.group === g.key).map(d => {
          const st = stats.get(d.slug) || {};
          const o = open(d.slug);
          return `<a class="card div-card" href="#/dzialy/${esc(d.slug)}">
            <div class="div-card-top"><span class="row-icon"><i class="fa-solid ${esc(d.icon)}"></i></span>${RM.divMark(d.name)}${d.soon ? '<span class="badge plain tone-blue">Wkrótce</span>' : ''}</div>
            <p class="muted small">${esc(d.tagline)}</p>
            <div class="res-stats"><div><small>Otwarte</small><strong>${o.length}</strong></div><div><small>Zakończone (mies.)</small><strong>${st.completed || 0}</strong></div><div><small>Przychód (mies.)</small><strong>${esc(RM.money(st.revenue || 0))}</strong></div></div>
          </a>`;
        }).join('')}</div>`).join('')}`;
    }
  };

  function divisionDetail(el, d, st, open) {
    const recent = S.tasks.filter(t => RM.taskDivision(t) === d.slug && ['completed', 'cancelled'].includes(t.status)).sort((a, b) => new Date(b.dateStart) - new Date(a.dateStart)).slice(0, 8);
    el.innerHTML = `
      <div class="page-head"><div><a class="link small" href="#/dzialy"><i class="fa-solid fa-arrow-left"></i> Wszystkie działy</a><h1 style="margin-top:6px">${RM.divMark(d.name)}</h1><p>${esc(d.tagline)}</p></div>
        <div class="page-actions"><button class="btn" id="divOrders"><i class="fa-solid fa-filter"></i> Zlecenia działu</button><button class="btn" id="divOffer"><i class="fa-solid fa-file-signature"></i> Oferta</button><button class="btn primary" id="divTask"><i class="fa-solid fa-plus"></i> Zlecenie</button></div></div>
      <div class="kpis">
        <div class="card kpi"><div class="kpi-label">Otwarte zlecenia <i class="fa-solid ${esc(d.icon)}"></i></div><div class="kpi-value">${open.length}</div><div class="kpi-sub">${open.filter(t => t.status === 'new').length} nowych wycen</div></div>
        <div class="card kpi"><div class="kpi-label">Zakończone (mies.) <i class="fa-solid fa-flag-checkered"></i></div><div class="kpi-value">${st.completed || 0}</div><div class="kpi-sub">w bieżącym miesiącu</div></div>
        <div class="card kpi"><div class="kpi-label">Przychód (mies.) <i class="fa-solid fa-wallet"></i></div><div class="kpi-value">${esc(RM.money(st.revenue || 0))}</div><div class="kpi-sub">z zakończonych zleceń</div></div>
        <a class="card kpi" href="/${esc(d.slug)}.html" target="_blank" rel="noopener"><div class="kpi-label">Strona działu <i class="fa-solid fa-arrow-up-right-from-square"></i></div><div class="kpi-value" style="font-size:18px">/${esc(d.slug)}</div><div class="kpi-sub">revserwis.pl</div></a>
      </div>
      <div class="grid grid-2">
        <section class="card pad"><div class="card-head"><h2>Otwarte zlecenia</h2></div><div class="task-list">${open.sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart)).map(t => RM.taskCard(t, { showDay: true })).join('') || '<p class="muted small">Brak otwartych zleceń.</p>'}</div></section>
        <div class="stack">
          <section class="card pad"><div class="card-head"><h2>Zakres usług</h2></div><div class="chips">${d.services.map(s => `<span class="chip" style="padding-left:10px">${esc(s)}</span>`).join('')}</div></section>
          <section class="card pad"><div class="card-head"><h2>Ostatnio zakończone</h2></div><div class="task-list">${recent.map(t => RM.taskCard(t, { showDay: true })).join('') || '<p class="muted small">Brak.</p>'}</div></section>
        </div>
      </div>`;
    $('#divOrders', el).addEventListener('click', () => { S.ui.ordersDivision = d.slug; S.ui.ordersFilter = 'all'; location.hash = '#/zlecenia'; });
    $('#divTask', el).addEventListener('click', () => RM.taskForm(null, { division: d.slug, type: d.services[0] }));
    $('#divOffer', el).addEventListener('click', () => RM.offerForm(null, { division: d.slug }));
  }

  /* ================================================================== */
  /* ABONAMENTY                                                          */
  /* ================================================================== */

  views.abonamenty = {
    title: 'Abonamenty',
    admin: true,
    async render(el) {
      if (!el.querySelector('.contract-grid')) el.innerHTML = '<div class="skeleton"></div>';
      const { contracts, mrr, activeCount } = await RM.api('/api/contracts');
      const soon = new Date(Date.now() + 7 * 86400000);
      const due = contracts.filter(c => c.status === 'active' && c.nextBillingDate && new Date(c.nextBillingDate) <= soon);
      el.innerHTML = `
        <div class="page-head"><div><h1>Abonamenty</h1><p>Miesięczna obsługa obiektów (RevFacility), Winter Care, stała współpraca B2B</p></div>
          <div class="page-actions"><button class="btn primary" id="addContract"><i class="fa-solid fa-plus"></i> Nowy abonament</button></div></div>
        <div class="kpis">
          <div class="card kpi"><div class="kpi-label">MRR <i class="fa-solid fa-arrows-rotate"></i></div><div class="kpi-value">${esc(RM.money(mrr))}</div><div class="kpi-sub">miesięczny przychód z abonamentów</div></div>
          <div class="card kpi" style="--tone:var(--blue)"><div class="kpi-label">Aktywne <i class="fa-solid fa-circle-check"></i></div><div class="kpi-value">${activeCount}</div><div class="kpi-sub">z ${contracts.length} wszystkich</div></div>
          <div class="card kpi" style="--tone:var(--orange)"><div class="kpi-label">Do rozliczenia <i class="fa-solid fa-file-invoice-dollar"></i></div><div class="kpi-value">${due.length}</div><div class="kpi-sub">w ciągu 7 dni</div></div>
          <div class="card kpi" style="--tone:var(--purple)"><div class="kpi-label">Rocznie <i class="fa-solid fa-calendar"></i></div><div class="kpi-value">${esc(RM.money(mrr * 12))}</div><div class="kpi-sub">przy obecnych umowach</div></div>
        </div>
        <div class="grid grid-auto contract-grid">${contracts.map(c => `
          <article class="card res-card">
            <div class="res-top"><span class="row-icon"><i class="fa-solid ${esc(RM.division(c.division)?.icon || 'fa-arrows-rotate')}"></i></span><div style="min-width:0"><h3>${esc(c.title)}</h3><p>${esc(c.number || '')}${c.clientName ? ' · ' + esc(c.clientName) : ''}</p></div><span style="margin-left:auto">${RM.tag(RM.CONTRACT_STATUS[c.status])}</span></div>
            ${c.division || (c.services || []).length ? `<div class="chips">${RM.divBadge(c.division)}${(c.services || []).slice(0, 6).map(s => `<span class="chip" style="padding-left:10px">${esc(s)}</span>`).join('')}</div>` : ''}
            <div class="res-stats"><div><small>Miesięcznie</small><strong>${esc(RM.money(c.monthlyPrice))}</strong></div><div><small>Następne rozliczenie</small><strong>${c.status === 'active' ? H().dateFlag(c.nextBillingDate) : '—'}</strong></div><div><small>Ostatnio</small><strong>${c.lastBilledAt ? esc(RM.fmt.date.format(new Date(c.lastBilledAt))) : '—'}</strong></div></div>
            <div class="res-actions">${c.status === 'active' ? `<button class="btn sm primary" data-bill="${esc(c._id)}"><i class="fa-solid fa-check"></i> Rozlicz</button>` : ''}<button class="btn sm" data-cedit="${esc(c._id)}"><i class="fa-solid fa-pen"></i> Edytuj</button>${c.clientPhone ? `<a class="btn sm" href="${esc(RM.telUrl(c.clientPhone))}"><i class="fa-solid fa-phone"></i></a>` : ''}</div>
          </article>`).join('') || empty('fa-arrows-rotate', 'Brak abonamentów', 'Dodaj stałą obsługę obiektu, Winter Care lub współpracę B2B — panel przypomni o rozliczeniu.')}</div>`;
      const rerender = () => views.abonamenty.render(el);
      $('#addContract', el).addEventListener('click', () => contractForm(null, rerender));
      $$('[data-cedit]', el).forEach(b => b.addEventListener('click', () => contractForm(contracts.find(c => c._id === b.dataset.cedit), rerender)));
      $$('[data-bill]', el).forEach(b => b.addEventListener('click', () => billContract(contracts.find(c => c._id === b.dataset.bill), rerender)));
    }
  };

  function contractForm(c, done, preset = {}) {
    const values = { status: 'active', vatRate: 23, billingDay: 1, startDate: new Date().toISOString(), ...(c || {}), ...preset };
    values.servicesText = (values.services || []).join('\n');
    values.client = values.client ? String(values.client) : '';
    RM.form({
      title: c ? 'Edytuj abonament' : 'Nowy abonament',
      subtitle: c ? c.number : 'Stała, miesięczna współpraca',
      values,
      fields: [
        { name: 'title', label: 'Nazwa', required: true, full: true, placeholder: 'np. Obsługa parkingu — Market XYZ' },
        { name: 'division', label: 'Dział', type: 'select', options: RM.divOptions() },
        { name: 'status', label: 'Status', type: 'select', options: Object.entries(RM.CONTRACT_STATUS).map(([k, v]) => [k, v[0]]) },
        { type: 'section', label: 'Klient' },
        { name: 'client', label: 'Klient w CRM', type: 'select', options: [['', '— nie przypisano —'], ...S.clients.map(x => [x._id, x.name])] },
        { name: 'clientName', label: 'Nazwa klienta' },
        { name: 'clientPhone', label: 'Telefon', type: 'tel' },
        { name: 'clientEmail', label: 'E-mail', type: 'email' },
        { name: 'address', label: 'Adres obiektu', full: true },
        { type: 'section', label: 'Zakres i rozliczenie' },
        { name: 'servicesText', label: 'Usługi w abonamencie (jedna w wierszu)', type: 'textarea', full: true, placeholder: 'Koszenie\nOdśnieżanie\nMycie kostki 2× w roku' },
        { name: 'scope', label: 'Szczegóły zakresu / harmonogram', type: 'textarea', full: true },
        { name: 'monthlyPrice', label: 'Kwota miesięczna (zł)', type: 'number', min: 0, step: '0.01', inputmode: 'decimal' },
        { name: 'vatRate', label: 'VAT %', type: 'select', options: [[23, '23%'], [8, '8%'], [5, '5%'], [0, '0% / zw.']] },
        { name: 'billingDay', label: 'Dzień rozliczenia (1–28)', type: 'number', min: 1, max: 28 },
        { name: 'nextBillingDate', label: 'Najbliższe rozliczenie', type: 'date', hint: 'Puste = wyliczy się z dnia rozliczenia' },
        { name: 'startDate', label: 'Początek', type: 'date' },
        { name: 'endDate', label: 'Koniec (opcjonalnie)', type: 'date' },
        { name: 'notes', label: 'Notatki', type: 'textarea', full: true }
      ],
      danger: c ? { label: 'Usuń', confirm: 'Usunąć abonament? Historia rozliczeń w finansach zostanie.', action: async () => { await RM.api('/api/contracts/' + c._id, { method: 'DELETE' }); RM.toast('Usunięto'); done(); } } : null,
      onRender(form) {
        form.elements.client.addEventListener('change', () => {
          const cl = S.clients.find(x => x._id === form.elements.client.value);
          if (!cl) return;
          for (const [k, v] of [['clientName', cl.name], ['clientPhone', cl.phone], ['clientEmail', cl.email], ['address', cl.address]]) if (!form.elements[k].value) form.elements[k].value = v || '';
        });
      },
      async onSubmit(data) {
        data.services = data.servicesText.split('\n').map(x => x.trim()).filter(Boolean);
        delete data.servicesText;
        if (!data.client) data.client = null;
        if (!data.nextBillingDate && !c) delete data.nextBillingDate;
        await RM.api(c ? '/api/contracts/' + c._id : '/api/contracts', { method: c ? 'PUT' : 'POST', body: data });
        RM.toast(c ? 'Zapisano abonament' : 'Dodano abonament');
        done();
      }
    });
  }
  RM.contractForm = contractForm;

  function billContract(c, done) {
    RM.form({
      title: 'Rozlicz abonament',
      subtitle: `${c.title} · ${c.number}`,
      values: { amount: c.monthlyPrice, date: new Date().toISOString(), paymentMethod: 'Przelew', createIncome: true },
      fields: [
        { name: 'amount', label: 'Kwota (zł)', type: 'number', min: 0, step: '0.01', required: true },
        { name: 'date', label: 'Data', type: 'date' },
        { name: 'paymentMethod', label: 'Forma płatności', type: 'select', options: ['Przelew', 'Gotówka', 'BLIK', 'Karta', 'Faktura'] },
        { name: 'createIncome', label: 'Zapisz jako przychód w Finansach', type: 'switch' }
      ],
      submitLabel: 'Rozlicz',
      async onSubmit(data) {
        const r = await RM.api(`/api/contracts/${c._id}/bill`, { method: 'POST', body: data });
        RM.toast(`Rozliczono · następne ${RM.fmt.date.format(new Date(r.contract.nextBillingDate))}`);
        done();
      }
    });
  }

  /* ================================================================== */
  /* OFERTY                                                              */
  /* ================================================================== */

  const offerTotals = (items, discount) => {
    const f = 1 - Math.min(Math.max(Number(discount) || 0, 0), 100) / 100;
    let net = 0;
    let vat = 0;
    for (const i of items) { const line = (Number(i.qty) || 0) * (Number(i.price) || 0) * f; net += line; vat += line * (Number(i.vatRate) || 0) / 100; }
    const r = v => Math.round(v * 100) / 100;
    return { net: r(net), vat: r(vat), gross: r(net + vat) };
  };

  async function loadPriceList() {
    if (!S.priceList) S.priceList = (await RM.api('/api/pricelist').catch(() => ({ items: [] }))).items;
    return S.priceList;
  }

  const itemRow = (i = {}) => `<div class="oi-row">
      <input class="input oi-name" placeholder="Usługa / pozycja" value="${esc(i.name || '')}" maxlength="200">
      <input class="input oi-qty" type="number" min="0" step="0.01" value="${esc(i.qty ?? 1)}" aria-label="Ilość">
      <input class="input oi-unit" value="${esc(i.unit || 'usł.')}" list="oiUnits" aria-label="Jednostka">
      <input class="input oi-price" type="number" min="0" step="0.01" value="${esc(i.price ?? '')}" placeholder="cena netto" aria-label="Cena netto">
      <select class="select oi-vat" aria-label="VAT">${[23, 8, 5, 0].map(v => `<option value="${v}" ${Number(i.vatRate ?? 23) === v ? 'selected' : ''}>${v}%</option>`).join('')}</select>
      <button type="button" class="icon-btn ghost oi-del" aria-label="Usuń pozycję"><i class="fa-solid fa-xmark"></i></button>
    </div>`;

  RM.offerForm = async function (offer, preset = {}, done) {
    const prices = await loadPriceList();
    const values = { status: 'draft', discount: 0, ...(offer || {}), ...preset };
    values.client = values.client ? String(values.client) : '';
    const items = (values.items && values.items.length ? values.items : [{}]);
    const editor = `<div class="oi">
        <div class="oi-head"><span>Pozycja</span><span>Ilość</span><span>J.m.</span><span>Cena netto</span><span>VAT</span><span></span></div>
        <div class="oi-body" id="oiBody">${items.map(itemRow).join('')}</div>
        <datalist id="oiUnits">${['usł.', 'h', 'szt.', 'm²', 'm³', 'km', 'kurs', 'mies.', 'kpl.'].map(u => `<option value="${u}">`).join('')}</datalist>
        <div class="btn-row" style="margin-top:10px"><button type="button" class="btn sm" id="oiAdd"><i class="fa-solid fa-plus"></i> Pozycja</button>
          ${prices.length ? `<select class="select" id="oiPrice" style="height:34px;max-width:320px"><option value="">+ Z cennika…</option>${prices.map(p => `<option value="${esc(p._id)}">${esc(p.name)} — ${esc(RM.money(p.price))}/${esc(p.unit)}</option>`).join('')}</select>` : '<a class="link small" href="#/cennik">Dodaj cennik, aby wstawiać pozycje jednym kliknięciem →</a>'}</div>
        <div class="oi-totals" id="oiTotals"></div>
      </div>`;
    RM.form({
      title: offer ? 'Edytuj ofertę' : 'Nowa oferta',
      subtitle: offer ? offer.number : 'Kosztorys z pozycjami, rabatem i VAT',
      values,
      fields: [
        { name: 'title', label: 'Tytuł oferty', required: true, full: true, placeholder: 'np. Rozbiórka łazienki i wywóz gruzu' },
        { name: 'division', label: 'Dział', type: 'select', options: RM.divOptions() },
        { name: 'status', label: 'Status', type: 'select', options: Object.entries(RM.OFFER_STATUS).map(([k, v]) => [k, v[0]]) },
        { type: 'section', label: 'Pozycje' },
        { type: 'html', full: true, html: editor },
        { name: 'discount', label: 'Rabat %', type: 'number', min: 0, max: 100, step: '0.5' },
        { name: 'validUntil', label: 'Ważna do', type: 'date' },
        { type: 'section', label: 'Klient' },
        { name: 'client', label: 'Klient w CRM', type: 'select', options: [['', '— nie przypisano —'], ...S.clients.map(x => [x._id, x.name])] },
        { name: 'clientName', label: 'Imię i nazwisko' },
        { name: 'clientCompany', label: 'Firma' },
        { name: 'clientNip', label: 'NIP' },
        { name: 'clientPhone', label: 'Telefon', type: 'tel' },
        { name: 'clientEmail', label: 'E-mail', type: 'email' },
        { name: 'clientAddress', label: 'Adres / miejsce realizacji', full: true },
        { type: 'section', label: 'Treść' },
        { name: 'notes', label: 'Opis / zakres prac (widoczny na ofercie)', type: 'textarea', full: true },
        { name: 'terms', label: 'Warunki (puste = domyślne z ustawień)', type: 'textarea', full: true }
      ],
      submitLabel: offer ? 'Zapisz ofertę' : 'Utwórz ofertę',
      danger: offer ? { label: 'Usuń', confirm: 'Usunąć ofertę?', action: async () => { await RM.api('/api/offers/' + offer._id, { method: 'DELETE' }); RM.toast('Usunięto ofertę'); location.hash = '#/oferty'; done?.(); } } : null,
      onRender(form) {
        const body = $('#oiBody', form);
        const totals = () => {
          const list = readItems(form);
          const t = offerTotals(list, form.elements.discount.value);
          $('#oiTotals', form).innerHTML = `<span>Netto <b>${esc(RM.money(t.net))}</b></span><span>VAT <b>${esc(RM.money(t.vat))}</b></span><span class="gross">Brutto <b>${esc(RM.money(t.gross))}</b></span>`;
        };
        form.addEventListener('input', totals);
        form.addEventListener('change', totals);
        $('#oiAdd', form).addEventListener('click', () => { body.insertAdjacentHTML('beforeend', itemRow()); body.lastElementChild.querySelector('.oi-name').focus(); totals(); });
        body.addEventListener('click', e => { const del = e.target.closest('.oi-del'); if (del) { del.closest('.oi-row').remove(); if (!body.children.length) body.insertAdjacentHTML('beforeend', itemRow()); totals(); } });
        $('#oiPrice', form)?.addEventListener('change', e => {
          const p = prices.find(x => x._id === e.target.value);
          if (!p) return;
          const firstEmpty = [...body.querySelectorAll('.oi-row')].find(r => !r.querySelector('.oi-name').value.trim());
          const html = itemRow({ name: p.name, qty: 1, unit: p.unit, price: p.price, vatRate: p.vatRate });
          if (firstEmpty) firstEmpty.outerHTML = html; else body.insertAdjacentHTML('beforeend', html);
          if (!form.elements.division.value && p.division) form.elements.division.value = p.division;
          e.target.value = '';
          totals();
        });
        form.elements.client.addEventListener('change', () => {
          const cl = S.clients.find(x => x._id === form.elements.client.value);
          if (!cl) return;
          for (const [k, v] of [['clientName', cl.name], ['clientCompany', cl.company], ['clientNip', cl.nip], ['clientPhone', cl.phone], ['clientEmail', cl.email], ['clientAddress', cl.address]]) if (!form.elements[k].value) form.elements[k].value = v || '';
        });
        totals();
      },
      async onSubmit(data, form) {
        data.items = readItems(form);
        if (!data.items.length) throw new Error('Dodaj przynajmniej jedną pozycję');
        if (!data.client) data.client = null;
        if (!data.terms) delete data.terms;
        if (preset.message) data.message = preset.message;
        const r = await RM.api(offer ? '/api/offers/' + offer._id : '/api/offers', { method: offer ? 'PUT' : 'POST', body: data });
        RM.toast(offer ? 'Zapisano ofertę' : `Utworzono ofertę ${r.offer.number}`);
        if (done) done(r.offer); else location.hash = '#/oferty/' + r.offer._id;
      }
    });
  };

  function readItems(form) {
    return [...form.querySelectorAll('.oi-row')].map(r => ({
      name: r.querySelector('.oi-name').value.trim(),
      qty: Number(r.querySelector('.oi-qty').value) || 0,
      unit: r.querySelector('.oi-unit').value.trim() || 'usł.',
      price: Number(r.querySelector('.oi-price').value) || 0,
      vatRate: Number(r.querySelector('.oi-vat').value)
    })).filter(i => i.name);
  }

  views.oferty = {
    title: 'Oferty',
    admin: true,
    async render(el) {
      if (RM.routeId) { const id = RM.routeId; RM.routeId = null; return offerView(el, id); }
      if (!el.querySelector('.offer-table')) el.innerHTML = '<div class="skeleton"></div>';
      const ui = S.ui;
      const { offers } = await RM.api('/api/offers');
      const counts = Object.fromEntries(Object.keys(RM.OFFER_STATUS).map(k => [k, offers.filter(o => o.status === k).length]));
      const list = offers.filter(o => ui.offersFilter === 'all' || o.status === ui.offersFilter);
      const sum = st => offers.filter(o => o.status === st).reduce((a, o) => a + (o.totals?.gross || 0), 0);
      el.innerHTML = `
        <div class="page-head"><div><h1>Oferty</h1><p>Kosztorysy z pozycjami, VAT i wydrukiem do PDF</p></div>
          <div class="page-actions"><a class="btn" href="#/cennik"><i class="fa-solid fa-tags"></i> Cennik</a><button class="btn primary" id="addOffer"><i class="fa-solid fa-plus"></i> Nowa oferta</button></div></div>
        <div class="kpis">
          <div class="card kpi" style="--tone:var(--blue)"><div class="kpi-label">Wysłane <i class="fa-solid fa-paper-plane"></i></div><div class="kpi-value">${counts.sent}</div><div class="kpi-sub">${esc(RM.money(sum('sent')))} brutto czeka na decyzję</div></div>
          <div class="card kpi"><div class="kpi-label">Zaakceptowane <i class="fa-solid fa-circle-check"></i></div><div class="kpi-value">${counts.accepted}</div><div class="kpi-sub">${esc(RM.money(sum('accepted')))} brutto</div></div>
          <div class="card kpi" style="--tone:var(--purple)"><div class="kpi-label">Skuteczność <i class="fa-solid fa-bullseye"></i></div><div class="kpi-value">${counts.accepted + counts.rejected ? Math.round((counts.accepted / (counts.accepted + counts.rejected)) * 100) + '%' : '—'}</div><div class="kpi-sub">zaakceptowane / rozstrzygnięte</div></div>
          <div class="card kpi" style="--tone:var(--orange)"><div class="kpi-label">Szkice <i class="fa-solid fa-pen-ruler"></i></div><div class="kpi-value">${counts.draft}</div><div class="kpi-sub">do dokończenia</div></div>
        </div>
        <div class="toolbar"><div class="segmented">${[['all', 'Wszystkie', offers.length], ...Object.entries(RM.OFFER_STATUS).map(([k, v]) => [k, v[0], counts[k]])].map(([k, l, n]) => `<button data-ofil="${k}" class="${ui.offersFilter === k ? 'active' : ''}">${esc(l)}<span class="n">${n}</span></button>`).join('')}</div></div>
        <div class="card offer-table">${list.map(o => `
          <a class="offer-row" href="#/oferty/${esc(o._id)}">
            <span class="mono muted">${esc(o.number)}</span>
            <span class="offer-main"><strong>${esc(o.title)}</strong><small>${esc([o.clientCompany, o.clientName].filter(Boolean).join(' · ') || '—')}</small></span>
            <span>${RM.divBadge(o.division)}</span>
            <span class="nowrap"><strong>${esc(RM.money(o.totals?.gross))}</strong><small class="muted"> brutto</small></span>
            <span>${RM.tag(RM.OFFER_STATUS[o.status])}</span>
            <span class="muted small nowrap">${o.validUntil ? 'do ' + esc(RM.fmt.date.format(new Date(o.validUntil))) : ''}</span>
          </a>`).join('') || empty('fa-file-signature', 'Brak ofert', 'Utwórz ofertę z pozycjami — także z wiadomości, wyceny lub działu.')}</div>`;
      $('#addOffer', el).addEventListener('click', () => RM.offerForm(null));
      $$('[data-ofil]', el).forEach(b => b.addEventListener('click', () => { ui.offersFilter = b.dataset.ofil; views.oferty.render(el); }));
    }
  };

  async function offerView(el, id) {
    el.innerHTML = '<div class="skeleton"></div>';
    const { offer: o, company } = await RM.api('/api/offers/' + id);
    const rerender = () => offerView(el, id);
    el.innerHTML = `
      <div class="page-head"><div><a class="link small" href="#/oferty"><i class="fa-solid fa-arrow-left"></i> Oferty</a><h1 style="margin-top:6px">${esc(o.title)}</h1><p><span class="mono">${esc(o.number)}</span> · ${RM.tag(RM.OFFER_STATUS[o.status])} ${RM.divBadge(o.division)}</p></div>
        <div class="page-actions">
          <button class="btn" id="ofPrint"><i class="fa-solid fa-print"></i> Drukuj / PDF</button>
          <button class="btn" id="ofEdit"><i class="fa-solid fa-pen"></i> Edytuj</button>
          <div class="menu-wrap"><button class="btn" id="ofMenu"><i class="fa-solid fa-ellipsis"></i> Więcej</button></div>
          ${o.task ? `<a class="btn primary" href="#/zlecenia/${esc(o.task)}"><i class="fa-solid fa-clipboard-list"></i> Zlecenie</a>` : '<button class="btn primary" id="ofTask"><i class="fa-solid fa-clipboard-check"></i> Akceptuj → zlecenie</button>'}
        </div></div>
      <div class="offer-doc card">${offerDocument(o, company)}</div>`;
    $('#ofPrint', el).addEventListener('click', () => printOffer(o, company));
    $('#ofEdit', el).addEventListener('click', () => RM.offerForm(o, {}, rerender));
    $('#ofTask', el)?.addEventListener('click', async () => {
      if (!await RM.confirm('Oznaczyć ofertę jako zaakceptowaną i utworzyć zlecenie (status „Wycenione”)?', { ok: 'Utwórz zlecenie', danger: false })) return;
      try { const r = await RM.api(`/api/offers/${o._id}/task`, { method: 'POST' }); RM.upsertTask(r.task); RM.toast('Utworzono zlecenie'); RM.taskForm(r.task, { status: 'planned' }, 'Zaplanuj zlecenie z oferty'); rerender(); } catch (err) { RM.fail(err); }
    });
    $('#ofMenu', el).addEventListener('click', e => {
      e.stopPropagation();
      const setStatus = status => RM.api('/api/offers/' + o._id, { method: 'PUT', body: { status } }).then(() => { RM.toast('Status: ' + RM.OFFER_STATUS[status][0]); rerender(); }).catch(RM.fail);
      const text = offerText(o, company);
      RM.menu(e.currentTarget, [
        ...Object.keys(RM.OFFER_STATUS).filter(st => st !== o.status).map(st => ({ icon: 'fa-flag', label: 'Status: ' + RM.OFFER_STATUS[st][0], action: () => setStatus(st) })),
        o.clientEmail && { icon: 'fa-envelope', label: 'Wyślij e-mailem (tekst)', href: `mailto:${o.clientEmail}?subject=${encodeURIComponent(`Oferta ${o.number} — ${o.title}`)}&body=${encodeURIComponent(text)}` },
        o.clientPhone && { icon: 'fa-comment', label: 'Wyślij na WhatsApp', href: waUrl(o.clientPhone, text.slice(0, 1500)), external: true },
        { icon: 'fa-copy', label: 'Kopiuj tekst oferty', action: () => navigator.clipboard?.writeText(text).then(() => RM.toast('Skopiowano')) },
        { icon: 'fa-clone', label: 'Duplikuj', action: () => RM.api(`/api/offers/${o._id}/duplicate`, { method: 'POST' }).then(r => { RM.toast('Utworzono kopię'); location.hash = '#/oferty/' + r.offer._id; }).catch(RM.fail) },
        { icon: 'fa-trash', label: 'Usuń', danger: true, action: async () => { if (await RM.confirm('Usunąć ofertę?', { ok: 'Usuń' })) { await RM.api('/api/offers/' + o._id, { method: 'DELETE' }).catch(RM.fail); location.hash = '#/oferty'; } } }
      ]);
    });
  }

  function offerText(o, company) {
    const lines = o.items.map((i, n) => `${n + 1}. ${i.name} — ${i.qty} ${i.unit} × ${RM.money(i.price)} netto (VAT ${i.vatRate}%)`);
    return `Oferta ${o.number}: ${o.title}\n\n${o.notes ? o.notes + '\n\n' : ''}${lines.join('\n')}\n${o.discount ? `Rabat: ${o.discount}%\n` : ''}\nRazem netto: ${RM.money(o.totals.net)}\nVAT: ${RM.money(o.totals.vat)}\nRazem brutto: ${RM.money(o.totals.gross)}\n${o.validUntil ? `Ważna do: ${RM.fmt.date.format(new Date(o.validUntil))}\n` : ''}\n${o.terms || company.offerTerms || ''}\n\n${company.companyName || 'RevSerwis'} · ${company.companyPhone || ''} · ${company.companyEmail || ''}`;
  }

  function offerDocument(o, c) {
    const f = 1 - (Number(o.discount) || 0) / 100;
    return `
      <div class="od">
        <header class="od-head"><div><img src="/revmi/icons/mark-256.png" alt="" class="od-logo"><div><strong class="od-company">${esc(c.companyName || 'RevSerwis')}</strong><div>${esc(c.companyAddress || '')}</div>${c.companyNip ? `<div>NIP ${esc(c.companyNip)}</div>` : ''}<div>${esc(c.companyPhone || '')} · ${esc(c.companyEmail || '')}</div><div>www.revserwis.pl</div></div></div>
          <div class="od-meta"><h2>OFERTA</h2><div class="od-num">${esc(o.number)}</div><div>Data: ${esc(RM.fmt.date.format(new Date(o.createdAt)))}</div>${o.validUntil ? `<div>Ważna do: ${esc(RM.fmt.date.format(new Date(o.validUntil)))}</div>` : ''}${o.division ? `<div>Dział: ${esc(RM.divName(o.division))}</div>` : ''}</div></header>
        <section class="od-client"><small>Dla</small><strong>${esc(o.clientCompany || o.clientName || '—')}</strong>${o.clientCompany && o.clientName ? `<div>${esc(o.clientName)}</div>` : ''}${o.clientNip ? `<div>NIP ${esc(o.clientNip)}</div>` : ''}${o.clientAddress ? `<div>${esc(o.clientAddress)}</div>` : ''}${[o.clientPhone, o.clientEmail].filter(Boolean).length ? `<div>${esc([o.clientPhone, o.clientEmail].filter(Boolean).join(' · '))}</div>` : ''}</section>
        <h3 class="od-title">${esc(o.title)}</h3>
        ${o.notes ? `<p class="od-notes">${nl2br(o.notes)}</p>` : ''}
        <table class="od-table"><thead><tr><th>#</th><th>Pozycja</th><th class="r">Ilość</th><th class="r">Cena netto</th><th class="r">VAT</th><th class="r">Wartość netto</th></tr></thead><tbody>
          ${o.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}</td><td class="r">${esc(String(i.qty).replace('.', ','))} ${esc(i.unit)}</td><td class="r">${esc(RM.money(i.price))}</td><td class="r">${esc(i.vatRate)}%</td><td class="r">${esc(RM.money(i.qty * i.price * f))}</td></tr>`).join('')}
        </tbody></table>
        <div class="od-totals">${o.discount ? `<div><span>Rabat</span><b>${esc(o.discount)}%</b></div>` : ''}<div><span>Razem netto</span><b>${esc(RM.money(o.totals.net))}</b></div><div><span>VAT</span><b>${esc(RM.money(o.totals.vat))}</b></div><div class="g"><span>Do zapłaty brutto</span><b>${esc(RM.money(o.totals.gross))}</b></div></div>
        ${o.terms || c.offerTerms ? `<div class="od-terms"><small>Warunki</small><p>${nl2br(o.terms || c.offerTerms)}</p></div>` : ''}
        ${c.companyBank ? `<div class="od-terms"><small>Płatność</small><p>Przelew na rachunek: ${esc(c.companyBank)}</p></div>` : ''}
        <footer class="od-foot">${esc(c.companyName || 'RevSerwis')} · ${esc(c.companyPhone || '')} · ${esc(c.companyEmail || '')} · www.revserwis.pl</footer>
      </div>`;
  }

  function printOffer(o, c) {
    const w = window.open('', '_blank');
    if (!w) return RM.toast('Przeglądarka zablokowała okno wydruku — zezwól na wyskakujące okna.', 'error');
    const css = `body{font:13px/1.5 Arial,Helvetica,sans-serif;color:#111;margin:0;padding:32px}.od-head{display:flex;justify-content:space-between;gap:24px;padding-bottom:18px;border-bottom:3px solid #03c99a}.od-head>div:first-child{display:flex;gap:14px}.od-logo{width:58px;height:58px;border-radius:12px;background:#0d0e11}.od-company{font-size:17px}.od-meta{text-align:right}.od-meta h2{margin:0;font-size:24px;letter-spacing:.08em;color:#03a37e}.od-num{font-weight:700;margin-bottom:4px}.od-client{margin:22px 0;padding:14px;border:1px solid #ddd;border-radius:8px}.od-client small,.od-terms small{display:block;color:#777;text-transform:uppercase;font-size:10px;letter-spacing:.1em}.od-title{font-size:18px;margin:6px 0}.od-notes{white-space:normal;color:#333}.od-table{width:100%;border-collapse:collapse;margin:16px 0}.od-table th{background:#f1f5f4;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em}.od-table th,.od-table td{padding:8px;border-bottom:1px solid #e3e3e3}.r{text-align:right;white-space:nowrap}.od-totals{margin-left:auto;width:300px}.od-totals div{display:flex;justify-content:space-between;padding:5px 0}.od-totals .g{border-top:2px solid #111;margin-top:4px;padding-top:8px;font-size:16px}.od-terms{margin-top:20px}.od-foot{margin-top:40px;padding-top:10px;border-top:1px solid #ddd;color:#777;font-size:11px;text-align:center}@page{margin:14mm}`;
    w.document.write(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Oferta ${esc(o.number)}</title><style>${css}</style></head><body>${offerDocument(o, c)}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  /* ================================================================== */
  /* MAGAZYN — RevStorage                                                */
  /* ================================================================== */

  views.magazyn = {
    title: 'Magazyn',
    admin: true,
    async render(el) {
      if (!el.querySelector('.storage-grid')) el.innerHTML = '<div class="skeleton"></div>';
      const all = S.ui.storageAll;
      const { items, summary } = await RM.api('/api/storage' + (all ? '?all=1' : ''));
      el.innerHTML = `
        <div class="page-head"><div><h1>Magazyn <span class="dvm">Rev<b>Storage</b></span></h1><p>Przechowywanie rzeczy klientów — odbiór, magazyn, dowóz</p></div>
          <div class="page-actions"><label class="toggle-line"><span class="switch"><input type="checkbox" id="stAll" ${all ? 'checked' : ''}><span></span></span> Pokaż wydane</label><button class="btn primary" id="addStorage"><i class="fa-solid fa-plus"></i> Przyjmij do magazynu</button></div></div>
        <div class="kpis">
          <div class="card kpi"><div class="kpi-label">W magazynie <i class="fa-solid fa-box-archive"></i></div><div class="kpi-value">${summary.stored}</div><div class="kpi-sub">${summary.reserved} rezerwacji</div></div>
          <div class="card kpi" style="--tone:var(--blue)"><div class="kpi-label">Zajęte miejsce <i class="fa-solid fa-cubes"></i></div><div class="kpi-value">${esc(String(summary.volume).replace('.', ','))} m³</div><div class="kpi-sub">suma objętości</div></div>
          <div class="card kpi" style="--tone:var(--purple)"><div class="kpi-label">Przychód miesięczny <i class="fa-solid fa-wallet"></i></div><div class="kpi-value">${esc(RM.money(summary.monthly))}</div><div class="kpi-sub">z aktywnych przechowań</div></div>
          <div class="card kpi" style="--tone:var(--orange)"><div class="kpi-label">Kończy się (14 dni) <i class="fa-solid fa-hourglass-half"></i></div><div class="kpi-value">${items.filter(i => i.status === 'stored' && i.endDate && new Date(i.endDate) < new Date(Date.now() + 14 * 86400000)).length}</div><div class="kpi-sub">dostaniesz push 7 dni przed</div></div>
        </div>
        <div class="grid grid-auto storage-grid">${items.map(i => `
          <article class="card res-card">
            <div class="res-top"><span class="row-icon blue"><i class="fa-solid fa-box"></i></span><div style="min-width:0"><h3>${esc(i.description)}</h3><p>${esc(i.number || '')} · ${esc(i.clientName)}</p></div><span style="margin-left:auto">${RM.tag(RM.STORAGE_STATUS[i.status])}</span></div>
            <div class="res-stats"><div><small>Miejsce</small><strong>${esc(i.location || '—')}</strong></div><div><small>Objętość</small><strong>${i.volume ? esc(String(i.volume).replace('.', ',')) + ' m³' : '—'}</strong></div><div><small>Miesięcznie</small><strong>${esc(RM.money(i.monthlyPrice))}</strong></div></div>
            <div class="res-stats" style="border-top:0;padding-top:0"><div><small>Od</small><strong>${i.startDate ? esc(RM.fmt.date.format(new Date(i.startDate))) : '—'}</strong></div><div><small>Do</small><strong>${i.status === 'stored' ? H().dateFlag(i.endDate) : i.endDate ? esc(RM.fmt.date.format(new Date(i.endDate))) : '—'}</strong></div><div><small>Telefon</small><strong>${i.clientPhone ? `<a href="${esc(RM.telUrl(i.clientPhone))}">${esc(i.clientPhone)}</a>` : '—'}</strong></div></div>
            ${i.inventory ? `<p class="muted small" style="margin:0;white-space:pre-line">${esc(i.inventory.slice(0, 220))}${i.inventory.length > 220 ? '…' : ''}</p>` : ''}
            <div class="res-actions"><button class="btn sm" data-sedit="${esc(i._id)}"><i class="fa-solid fa-pen"></i> Edytuj</button>${i.status !== 'released' ? `<button class="btn sm" data-release="${esc(i._id)}"><i class="fa-solid fa-truck-ramp-box"></i> Wydaj</button>` : ''}</div>
          </article>`).join('') || empty('fa-box-archive', 'Magazyn jest pusty', 'Przyjmij rzeczy klienta — panel przypomni o końcu przechowania.')}</div>`;
      const rerender = () => views.magazyn.render(el);
      $('#stAll', el).addEventListener('change', e => { S.ui.storageAll = e.target.checked; rerender(); });
      $('#addStorage', el).addEventListener('click', () => storageForm(null, rerender));
      $$('[data-sedit]', el).forEach(b => b.addEventListener('click', () => storageForm(items.find(i => i._id === b.dataset.sedit), rerender)));
      $$('[data-release]', el).forEach(b => b.addEventListener('click', async () => {
        if (!await RM.confirm('Oznaczyć rzeczy jako wydane klientowi?', { ok: 'Wydaj', danger: false })) return;
        try { await RM.api(`/api/storage/${b.dataset.release}/release`, { method: 'POST' }); RM.toast('Wydano z magazynu'); rerender(); } catch (err) { RM.fail(err); }
      }));
    }
  };

  function storageForm(i, done) {
    const values = { status: 'stored', startDate: new Date().toISOString(), ...(i || {}) };
    values.client = values.client ? String(values.client) : '';
    RM.form({
      title: i ? 'Edytuj pozycję magazynu' : 'Przyjęcie do magazynu',
      subtitle: i ? i.number : 'RevStorage',
      values,
      fields: [
        { name: 'description', label: 'Co przechowujemy', required: true, full: true, placeholder: 'np. Meble z mieszkania 2-pokojowego' },
        { name: 'client', label: 'Klient w CRM', type: 'select', options: [['', '— nie przypisano —'], ...S.clients.map(x => [x._id, x.name])] },
        { name: 'clientName', label: 'Klient', required: true },
        { name: 'clientPhone', label: 'Telefon', type: 'tel' },
        { name: 'status', label: 'Status', type: 'select', options: Object.entries(RM.STORAGE_STATUS).map(([k, v]) => [k, v[0]]) },
        { name: 'location', label: 'Miejsce w magazynie', placeholder: 'np. Regał B2 / boks 4' },
        { name: 'volume', label: 'Objętość (m³)', type: 'number', min: 0, step: '0.1' },
        { name: 'monthlyPrice', label: 'Opłata miesięczna (zł)', type: 'number', min: 0, step: '0.01' },
        { name: 'startDate', label: 'Od', type: 'date' },
        { name: 'endDate', label: 'Do (planowo)', type: 'date', hint: 'Push 7 dni przed końcem' },
        { name: 'pickupAddress', label: 'Adres odbioru / dowozu', full: true },
        { name: 'inventory', label: 'Spis rzeczy', type: 'textarea', full: true, placeholder: 'Szafa 2-drzwiowa\n12 kartonów (opisane)\nRower' },
        { name: 'notes', label: 'Notatki', type: 'textarea', full: true }
      ],
      danger: i ? { label: 'Usuń', confirm: 'Usunąć pozycję magazynu?', action: async () => { await RM.api('/api/storage/' + i._id, { method: 'DELETE' }); RM.toast('Usunięto'); done(); } } : null,
      onRender(form) {
        form.elements.client.addEventListener('change', () => {
          const cl = S.clients.find(x => x._id === form.elements.client.value);
          if (!cl) return;
          if (!form.elements.clientName.value) form.elements.clientName.value = cl.name;
          if (!form.elements.clientPhone.value) form.elements.clientPhone.value = cl.phone || '';
          if (!form.elements.pickupAddress.value) form.elements.pickupAddress.value = cl.address || '';
        });
      },
      async onSubmit(data) {
        if (!data.client) data.client = null;
        await RM.api(i ? '/api/storage/' + i._id : '/api/storage', { method: i ? 'PUT' : 'POST', body: data });
        RM.toast(i ? 'Zapisano' : 'Przyjęto do magazynu');
        done();
      }
    });
  }
  RM.storageForm = storageForm;

  /* ================================================================== */
  /* CENNIK                                                              */
  /* ================================================================== */

  views.cennik = {
    title: 'Cennik',
    admin: true,
    async render(el) {
      el.innerHTML = '<div class="skeleton"></div>';
      const { items } = await RM.api('/api/pricelist?all=1');
      S.priceList = items.filter(i => i.active);
      const groups = [...RM.DIVISIONS.map(d => d.slug), ''].map(slug => [slug, items.filter(i => (i.division || '') === slug)]).filter(([, list]) => list.length);
      el.innerHTML = `
        <div class="page-head"><div><h1>Cennik</h1><p>Ceny bazowe usług — wstawiasz je do ofert jednym kliknięciem</p></div>
          <div class="page-actions"><button class="btn primary" id="addPrice"><i class="fa-solid fa-plus"></i> Pozycja cennika</button></div></div>
        ${groups.map(([slug, list]) => `<section class="card pad" style="margin-bottom:14px"><div class="card-head"><h2>${slug ? RM.divMark(RM.divName(slug)) : 'Bez działu'}</h2><span class="muted small">${list.length} poz.</span></div>
          <div class="rows">${list.map(p => `<button class="row price-row ${p.active ? '' : 'inactive'}" data-pedit="${esc(p._id)}"><span class="row-main"><strong>${esc(p.name)}</strong><small>${esc(p.description || '')}${p.active ? '' : ' · nieaktywna'}</small></span><span class="nowrap"><strong>${esc(RM.money(p.price))}${p.priceMax ? ' – ' + esc(RM.money(p.priceMax)) : ''}</strong><small class="muted"> netto / ${esc(p.unit)} · VAT ${esc(p.vatRate)}%</small></span></button>`).join('')}</div></section>`).join('')
          || empty('fa-tags', 'Cennik jest pusty', 'Dodaj stawki, np. „Koszenie trawy — 0,50 zł/m²”, „Godzina ekipy 2 os. — 140 zł/h”.')}`;
      const rerender = () => views.cennik.render(el);
      $('#addPrice', el).addEventListener('click', () => priceForm(null, rerender));
      $$('[data-pedit]', el).forEach(b => b.addEventListener('click', () => priceForm(items.find(p => p._id === b.dataset.pedit), rerender)));
    }
  };

  function priceForm(p, done) {
    const allServices = [...new Set(RM.DIVISIONS.flatMap(d => d.services))];
    RM.form({
      title: p ? 'Edytuj pozycję cennika' : 'Nowa pozycja cennika',
      values: p || { unit: 'usł.', vatRate: 23, active: true },
      fields: [
        { name: 'name', label: 'Nazwa usługi', required: true, full: true, type: 'datalist', options: allServices },
        { name: 'division', label: 'Dział', type: 'select', options: RM.divOptions() },
        { name: 'unit', label: 'Jednostka', type: 'datalist', options: ['usł.', 'h', 'szt.', 'm²', 'm³', 'km', 'kurs', 'mies.', 'kpl.'] },
        { name: 'price', label: 'Cena netto (zł)', type: 'number', min: 0, step: '0.01', required: true },
        { name: 'priceMax', label: 'Cena maks. (widełki)', type: 'number', min: 0, step: '0.01' },
        { name: 'vatRate', label: 'VAT', type: 'select', options: [[23, '23%'], [8, '8%'], [5, '5%'], [0, '0% / zw.']] },
        { name: 'description', label: 'Opis / uwagi', full: true },
        { name: 'active', label: 'Aktywna (widoczna w ofertach)', type: 'switch' }
      ],
      danger: p ? { label: 'Usuń', confirm: 'Usunąć pozycję z cennika?', action: async () => { await RM.api('/api/pricelist/' + p._id, { method: 'DELETE' }); S.priceList = null; done(); } } : null,
      onRender(form) {
        form.elements.name.addEventListener('change', () => { if (!form.elements.division.value) form.elements.division.value = RM.DIVISIONS.find(d => d.services.includes(form.elements.name.value))?.slug || ''; });
      },
      async onSubmit(data) {
        await RM.api(p ? '/api/pricelist/' + p._id : '/api/pricelist', { method: p ? 'PUT' : 'POST', body: data });
        S.priceList = null;
        RM.toast('Zapisano cennik');
        done();
      }
    });
  }

  /* ================================================================== */
  /* RAPORTY                                                             */
  /* ================================================================== */

  views.raporty = {
    title: 'Raporty',
    admin: true,
    async render(el) {
      el.innerHTML = '<div class="skeleton"></div>';
      const year = S.ui.reportYear;
      const r = await RM.api('/api/reports?year=' + year);
      const maxM = Math.max(1, ...r.months.map(m => Math.max(m.revenue, m.expenses)));
      const maxD = Math.max(1, ...r.divisions.map(d => d.revenue));
      const maxS = Math.max(1, ...r.sources.map(s => s.count));
      el.innerHTML = `
        <div class="page-head"><div><h1>Raporty ${year}</h1><p>Wyniki firmy, działów i źródeł zleceń</p></div>
          <div class="page-actions"><div class="segmented">${[year - 1, year, year + 1].filter(y => y <= new Date().getFullYear()).map(y => `<button data-year="${y}" class="${y === year ? 'active' : ''}">${y}</button>`).join('')}</div><button class="btn" id="repCsv"><i class="fa-solid fa-file-csv"></i> CSV działów</button></div></div>
        <div class="kpis">
          <div class="card kpi"><div class="kpi-label">Przychód <i class="fa-solid fa-wallet"></i></div><div class="kpi-value">${esc(RM.money(r.totals.revenue))}</div><div class="kpi-sub">${r.totals.completed} zakończonych zleceń</div></div>
          <div class="card kpi" style="--tone:var(--orange)"><div class="kpi-label">Koszty <i class="fa-solid fa-receipt"></i></div><div class="kpi-value">${esc(RM.money(r.totals.expenses))}</div><div class="kpi-sub">w roku ${year}</div></div>
          <div class="card kpi" style="--tone:var(--purple)"><div class="kpi-label">Zysk <i class="fa-solid fa-chart-line"></i></div><div class="kpi-value">${esc(RM.money(r.totals.profit))}</div><div class="kpi-sub">marża ${r.totals.revenue ? Math.round((r.totals.profit / r.totals.revenue) * 100) : 0}%</div></div>
          <div class="card kpi" style="--tone:var(--blue)"><div class="kpi-label">Przychód stały <i class="fa-solid fa-arrows-rotate"></i></div><div class="kpi-value">${esc(RM.money(r.recurring.mrr + r.recurring.storageMonthly))}</div><div class="kpi-sub">/ mies.: abonamenty ${esc(RM.money(r.recurring.mrr))} + magazyn ${esc(RM.money(r.recurring.storageMonthly))}</div></div>
        </div>
        <section class="card pad" style="margin-bottom:16px"><div class="card-head"><div><h2>Miesiące</h2><p>Przychody i koszty</p></div><div class="legend"><span style="--c:var(--accent)">Przychód</span><span style="--c:rgba(251,191,36,.7)">Koszty</span></div></div>
          <div class="bars bars-12">${r.months.map(m => `<div class="bar-col" title="${esc(m.label)}: przychód ${esc(RM.money(m.revenue))}, koszty ${esc(RM.money(m.expenses))}, zysk ${esc(RM.money(m.profit))}"><div class="bar-pair"><i style="height:${(m.revenue / maxM) * 100}%"></i><i class="exp" style="height:${(m.expenses / maxM) * 100}%"></i></div><small>${esc(m.label)}</small></div>`).join('')}</div></section>
        <div class="grid grid-2">
          <section class="card pad"><div class="card-head"><div><h2>Działy</h2><p>Przychód, wyceny i skuteczność (wyceny z formularzy)</p></div></div>
            ${r.divisions.length ? `<div class="rep-div">${r.divisions.map(d => `<div class="rep-div-row"><span>${d.slug ? RM.divBadge(d.slug) : '<span class="muted small">Bez działu</span>'}</span><span class="div-bar"><i style="width:${(d.revenue / maxD) * 100}%"></i></span><strong class="nowrap">${esc(RM.money(d.revenue))}</strong><small class="muted nowrap">${d.completed} zak. · ${d.quotes ? Math.round((d.won / d.quotes) * 100) + '% z ' + d.quotes + ' wycen' : 'brak wycen'}${d.mrr ? ' · MRR ' + esc(RM.money(d.mrr)) : ''}</small></div>`).join('')}</div>` : '<p class="muted small">Brak danych w tym roku.</p>'}</section>
          <div class="stack">
            <section class="card pad"><div class="card-head"><h2>Źródła zleceń</h2></div>${r.sources.map(s => `<div class="hbar"><span>${esc(s.source)}</span><div><i style="width:${(s.count / maxS) * 100}%"></i></div><strong>${s.count}</strong></div>`).join('') || '<p class="muted small">Brak danych.</p>'}</section>
            <section class="card pad"><div class="card-head"><h2>Najlepsi klienci</h2></div><div class="rows">${r.topClients.map((c, i) => `<div class="row"><span class="row-icon">${i + 1}</span><span class="row-main"><strong>${esc(c.name)}</strong><small>${c.count} ${plural(c.count, 'zlecenie', 'zlecenia', 'zleceń')}</small></span><strong>${esc(RM.money(c.total))}</strong></div>`).join('') || '<p class="muted small">Brak danych.</p>'}</div></section>
            <section class="card pad"><div class="card-head"><h2>Wiadomości wg tematu</h2></div>${r.messages.map(m => `<div class="hbar"><span>${esc(m.topic)}</span><div><i style="width:${(m.count / Math.max(1, r.messages[0].count)) * 100}%;--c:var(--orange)"></i></div><strong>${m.count}</strong></div>`).join('') || '<p class="muted small">Brak wiadomości.</p>'}</section>
          </div>
        </div>`;
      $$('[data-year]', el).forEach(b => b.addEventListener('click', () => { S.ui.reportYear = Number(b.dataset.year); views.raporty.render(el); }));
      $('#repCsv', el).addEventListener('click', () => {
        const cell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
        const rows = [['Dział', 'Przychód', 'Zakończone', 'Wyceny', 'Wygrane', 'MRR'], ...r.divisions.map(d => [d.name, d.revenue, d.completed, d.quotes, d.won, d.mrr])];
        const blob = new Blob(['﻿' + rows.map(x => x.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `raport-dzialy-${year}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
    }
  };

  /* ================================================================== */
  /* WYSZUKIWARKA (Ctrl+K) i SZYBKIE DODAWANIE                            */
  /* ================================================================== */

  const SEARCH_ICON = { task: 'fa-clipboard-list', note: 'fa-note-sticky', client: 'fa-address-book', message: 'fa-envelope', offer: 'fa-file-signature', contract: 'fa-arrows-rotate', storage: 'fa-box-archive', action: 'fa-bolt', view: 'fa-arrow-right' };
  const SEARCH_LABEL = { task: 'Zlecenie', note: 'Notatka', client: 'Klient', message: 'Wiadomość', offer: 'Oferta', contract: 'Abonament', storage: 'Magazyn', action: 'Akcja', view: 'Przejdź' };

  function quickActions() {
    const admin = RM.isAdmin();
    return [
      admin && { type: 'action', title: 'Nowe zlecenie', run: () => RM.taskForm(null) },
      { type: 'action', title: 'Nowa notatka', run: () => RM.noteForm(null, {}, () => location.hash.startsWith('#/notatnik') && RM.rerender()) },
      admin && { type: 'action', title: 'Nowa oferta', run: () => RM.offerForm(null) },
      admin && { type: 'action', title: 'Nowy abonament', run: () => contractForm(null, () => RM.rerender()) },
      admin && { type: 'action', title: 'Przyjęcie do magazynu', run: () => storageForm(null, () => RM.rerender()) },
      admin && { type: 'action', title: 'Dodaj koszt', run: () => RM.financeForm('expense') },
      ...[['pulpit', 'Pulpit'], ['zlecenia', 'Zlecenia'], admin && ['wyceny', 'Wyceny'], admin && ['wiadomosci', 'Wiadomości'], ['kalendarz', 'Kalendarz'], ['notatnik', 'Notatnik'], admin && ['oferty', 'Oferty'], admin && ['abonamenty', 'Abonamenty'], admin && ['magazyn', 'Magazyn'], admin && ['dzialy', 'Działy'], admin && ['raporty', 'Raporty'], admin && ['finanse', 'Finanse'], admin && ['klienci', 'Klienci'], ['powiadomienia', 'Powiadomienia']]
        .filter(Boolean).map(([r, l]) => ({ type: 'view', title: l, url: '#/' + r }))
    ].filter(Boolean);
  }

  RM.palette = function (initial = '') {
    RM.$$('.palette').forEach(p => p.remove());
    const box = document.createElement('dialog');
    box.className = 'modal palette';
    box.innerHTML = `<div class="pal-input"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Szukaj zleceń, notatek, klientów, ofert… lub wpisz akcję" autocomplete="off" value="${esc(initial)}"><kbd>Esc</kbd></div><div class="pal-results" role="listbox"></div><div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> wybór</span><span><kbd>Enter</kbd> otwórz</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> w każdej chwili</span></div>`;
    document.body.appendChild(box);
    const input = box.querySelector('input');
    const out = box.querySelector('.pal-results');
    let items = [];
    let active = 0;
    let seq = 0;
    const draw = () => {
      out.innerHTML = items.map((it, i) => `<button type="button" class="pal-item ${i === active ? 'on' : ''}" data-i="${i}"><i class="fa-solid ${SEARCH_ICON[it.type] || 'fa-circle'}"></i><span><strong>${esc(it.title)}</strong>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span><em>${esc(SEARCH_LABEL[it.type] || '')}</em></button>`).join('') || '<p class="muted small" style="padding:14px">Brak wyników.</p>';
      out.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' });
    };
    const choose = it => {
      if (!it) return;
      box.close();
      if (it.run) it.run();
      else if (it.url) location.hash = it.url;
    };
    const update = RM.debounce(async () => {
      const q = input.value.trim();
      const local = quickActions().filter(a => !q || a.title.toLowerCase().includes(q.toLowerCase()));
      if (q.length < 2) { items = local; active = 0; draw(); return; }
      const mine = ++seq;
      try {
        const { results } = await RM.api('/api/search?q=' + encodeURIComponent(q));
        if (mine !== seq) return;
        items = [...results, ...local.slice(0, 4)];
      } catch { items = local; }
      active = 0;
      draw();
    }, 180);
    input.addEventListener('input', update);
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); draw(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); draw(); }
      if (e.key === 'Enter') { e.preventDefault(); choose(items[active]); }
    });
    out.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) choose(items[Number(b.dataset.i)]); });
    box.addEventListener('click', e => { if (e.target === box) box.close(); });
    box.addEventListener('close', () => box.remove());
    box.showModal();
    input.focus();
    update();
  };

  RM.quickAdd = function () {
    const admin = RM.isAdmin();
    const items = [
      admin && ['task', 'fa-clipboard-list', 'Zlecenie'],
      ['note', 'fa-note-sticky', 'Notatka'],
      admin && ['offer', 'fa-file-signature', 'Oferta'],
      admin && ['cost', 'fa-receipt', 'Koszt'],
      admin && ['contract', 'fa-arrows-rotate', 'Abonament'],
      admin && ['storage', 'fa-box-archive', 'Magazyn'],
      ['search', 'fa-magnifying-glass', 'Szukaj']
    ].filter(Boolean);
    const sheet = $('#moreSheet');
    sheet.innerHTML = `<div class="sheet-grip"></div><p class="muted small" style="margin:0 0 10px;text-align:center">Szybko dodaj</p><div class="sheet-grid">${items.map(([k, i, l]) => `<button type="button" data-q="${k}"><i class="fa-solid ${i}"></i>${l}</button>`).join('')}</div>`;
    sheet.hidden = false;
    $('#moreBackdrop').hidden = false;
    const close = () => { sheet.hidden = true; $('#moreBackdrop').hidden = true; };
    $('#moreBackdrop').onclick = close;
    $$('[data-q]', sheet).forEach(b => b.addEventListener('click', () => {
      close();
      const done = () => RM.rerender();
      ({
        task: () => RM.taskForm(null),
        note: () => RM.noteForm(null, {}, () => location.hash.startsWith('#/notatnik') && done()),
        offer: () => RM.offerForm(null),
        cost: () => RM.financeForm('expense'),
        contract: () => contractForm(null, done),
        storage: () => storageForm(null, done),
        search: () => RM.palette()
      })[b.dataset.q]();
    }));
  };
})();
