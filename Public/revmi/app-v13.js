/* RevMi 13 — pełne szczegóły z formularza wyceny (adresy, piętra, windy, lista rzeczy pokój po pokoju, odpady, prace),
   wysyłka wyceny klientowi (SMS + panel klienta) i moduł „Realizacje” (zdjęcia przed / po na stronę). */
'use strict';

(function () {
  const RM = window.RM;
  const { esc, $, $$ } = RM;
  const views = RM.views;

  if (!document.getElementById('v13css')) {
    const st = document.createElement('style');
    st.id = 'v13css';
    st.textContent = `
      .qf{display:grid;gap:12px}
      .qf-due{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;border-radius:12px;padding:10px 14px;font-weight:800;font-size:13.5px;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.35);color:#fbbf24}
      .qf-due.late{background:rgba(248,113,113,.12);border-color:rgba(248,113,113,.4);color:#f87171}
      .qf-due small{font-weight:600;color:var(--muted)}
      .qf-locs{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      @media(max-width:700px){.qf-locs{grid-template-columns:1fr}}
      .qf-loc{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--bg-2,#121317)}
      .qf-loc h4{font-size:12px;color:var(--muted);margin:0 0 4px;font-weight:700}
      .qf-loc .a{font-weight:800;margin-bottom:10px;overflow-wrap:anywhere}
      .qf-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(86px,1fr));gap:6px}
      .qf-fact{background:var(--surface-2,#1c1d22);border-radius:9px;padding:7px 8px;min-width:0}
      .qf-fact small{display:block;font-size:10.5px;color:var(--muted);font-weight:600}
      .qf-fact b{font-size:13px;overflow-wrap:normal;word-break:normal;hyphens:auto}
      .qf-fact.warn{background:rgba(251,191,36,.12)}.qf-fact.warn b{color:#fbbf24}
      .qf-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
      .qf-tbl th{text-align:left;color:var(--muted);font-size:11.5px;font-weight:700;padding:0 8px 6px}
      .qf-tbl td{padding:7px 8px;border-top:1px solid var(--line);vertical-align:top}
      .qf-tbl tr.room td{color:var(--accent);font-weight:800;font-size:12px;background:var(--bg-2,#121317)}
      .qf-tbl td.q{font-weight:800;text-align:center;width:52px}
      .qf-flag{display:inline-block;font-size:11px;font-weight:700;padding:2px 7px;border-radius:6px;background:var(--surface-3,#24262c);margin:0 4px 3px 0}
      .qf-flag.w{background:rgba(251,191,36,.14);color:#fbbf24}
      .qf-tot{display:flex;gap:8px;flex-wrap:wrap}
      .qf-tot span{background:var(--surface-2,#1c1d22);border-radius:9px;padding:6px 10px;font-size:12.5px;font-weight:700}
      .qf-tot b{color:var(--accent)}
      .qf-kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13.5px}
      .qf-kv dt{color:var(--muted)}.qf-kv dd{margin:0;font-weight:700;text-align:right;overflow-wrap:anywhere}
      .qf-note{background:var(--bg-2,#121317);border-radius:10px;padding:12px;font-size:13.5px;white-space:pre-line}
      .rz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
      .rz{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--surface)}
      .rz .ph{display:grid;grid-template-columns:1fr 1fr;aspect-ratio:16/9;background:#0e0f11}
      .rz .ph img{width:100%;height:100%;object-fit:cover}
      .rz .ph.one{grid-template-columns:1fr}
      .rz .c{padding:12px 14px;display:grid;gap:6px}
      .rz .c b{font-size:15px}
      .rz-thumbs{display:flex;gap:6px;flex-wrap:wrap}
      .rz-thumbs figure{position:relative;margin:0;width:78px;height:78px;border-radius:9px;overflow:hidden}
      .rz-thumbs img{width:100%;height:100%;object-fit:cover}
      .rz-thumbs figcaption{position:absolute;left:3px;top:3px;font-size:10px;font-weight:800;background:rgba(0,0,0,.7);padding:1px 5px;border-radius:5px;color:#fff}
      .rz-thumbs button{position:absolute;right:3px;top:3px;width:22px;height:22px;border-radius:6px;border:0;background:rgba(0,0,0,.75);color:#fff;cursor:pointer;font-size:11px}
      .rz-file{display:grid;gap:6px}
      .rz-file input{font-size:13px}
    `;
    document.head.appendChild(st);
  }

  const floorTxt = f => (f === null || f === undefined || f === '' ? '—' : Number(f) === 0 ? 'parter' : Number(f) < 0 ? `${f} (piwn.)` : `${f}.`);
  const LABELS = { scope: 'Rodzaj', area: 'Metraż (m²)', boxes: 'Kartony', place: 'Miejsce', purpose: 'Powód', rooms: 'Pomieszczenia', fill: 'Zapełnienie', bags: 'Worki / kartony', pickup: 'Odbiór z', weight: 'Najcięższa rzecz (kg)', where: 'Gdzie leżą odpady', volume: 'Ilość', occupied: 'Meble w lokalu', debris: 'Wywóz gruzu', utilities: 'Prąd i woda', passengers: 'Liczba osób', luggage: 'Bagaże', time: 'Godzina wyjazdu', return: 'Kurs powrotny', flight: 'Numer lotu' };

  function locBox(title, p, transportOnly) {
    if (!p) return '';
    const noLift = p.lift === 'Brak windy' && Number(p.floor) >= 2;
    const facts = transportOnly ? '' : `<div class="qf-facts">
      <div class="qf-fact ${noLift ? 'warn' : ''}"><small>Piętro</small><b>${esc(floorTxt(p.floor))}</b></div>
      <div class="qf-fact ${noLift ? 'warn' : ''}"><small>Winda</small><b>${esc((p.lift || '—').replace('Winda ', ''))}</b></div>
      <div class="qf-fact ${p.parking === 'ponad 30 m' ? 'warn' : ''}"><small>Parking</small><b>${esc(p.parking || '—')}</b></div>
      <div class="qf-fact"><small>Rodzaj</small><b>${esc(p.place || '—')}</b></div></div>`;
    return `<div class="qf-loc"><h4>${esc(title)}</h4><div class="a"><a href="${esc(RM.mapsUrl(p.address))}" target="_blank" rel="noopener">${esc(p.address)}</a></div>${facts}${p.note ? `<div class="muted small" style="margin-top:8px"><i class="fa-solid fa-circle-info"></i> ${esc(p.note)}</div>` : ''}</div>`;
  }

  function itemsTable(items) {
    const rooms = [...new Set(items.map(i => i.room || ''))];
    const rows = rooms.map(r => (r ? `<tr class="room"><td colspan="3">${esc(r)}</td></tr>` : '') + items.filter(i => (i.room || '') === r).map(i => `<tr><td>${esc(i.name)}</td><td class="q">${i.qty}</td><td>${(i.flags || []).map(f => `<span class="qf-flag ${['do rozkręcenia', 'do skręcenia', 'ciężkie', 'trzeba odłączyć'].includes(f) ? 'w' : ''}">${esc(f)}</span>`).join('')}${i.note ? `<span class="qf-flag">${esc(i.note)}</span>` : ''}</td></tr>`).join('')).join('');
    const total = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
    const count = flag => items.filter(i => (i.flags || []).includes(flag)).reduce((s, i) => s + i.qty, 0);
    return `<table class="qf-tbl"><thead><tr><th>Przedmiot</th><th style="text-align:center">Ilość</th><th>Uwagi klienta</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="qf-tot" style="margin-top:10px"><span>Razem: <b>${total} szt.</b></span>${count('do rozkręcenia') ? `<span>Do rozkręcenia: <b>${count('do rozkręcenia')}</b></span>` : ''}${count('ciężkie') ? `<span>Ciężkie: <b>${count('ciężkie')}</b></span>` : ''}${count('delikatne') ? `<span>Delikatne: <b>${count('delikatne')}</b></span>` : ''}${count('trzeba odłączyć') ? `<span>Do odłączenia: <b>${count('trzeba odłączyć')}</b></span>` : ''}</div>`;
  }

  /** Sekcja w szczegółach zlecenia (app-main.js → renderDrawer). */
  RM.quoteFormSection = function (t) {
    const f = t.quoteForm;
    if (!f || f.v !== 13) return '';
    const parts = [];
    if (t.status === 'new' && t.quoteDueAt) {
      const left = new Date(t.quoteDueAt).getTime() - Date.now();
      const h = Math.floor(Math.abs(left) / 3_600_000), m = Math.floor((Math.abs(left) % 3_600_000) / 60_000);
      parts.push(`<div class="qf-due ${left < 0 ? 'late' : ''}"><span><i class="fa-solid fa-stopwatch"></i> ${left < 0 ? `Po terminie o ${h} h ${m} min` : `Zostało ${h} h ${m} min na wysłanie wyceny`}</span><small>termin: ${esc(RM.fmt.full.format(new Date(t.quoteDueAt)))}</small></div>`);
    }
    const transportOnly = f.service === 'przewoz';
    parts.push(`<div class="qf-locs" ${f.to ? '' : 'style="grid-template-columns:1fr"'}>${locBox(f.to ? (transportOnly ? 'Skąd' : 'Załadunek') : 'Adres', f.from, transportOnly)}${f.to ? locBox(transportOnly ? 'Dokąd' : 'Rozładunek', f.to, transportOnly) : ''}</div>`);
    const answers = Object.entries(f.answers || {});
    const sched = f.schedule ? [f.schedule.date ? RM.fmt.dayLong.format(new Date(f.schedule.date + 'T12:00')) : 'do ustalenia', f.schedule.time, f.schedule.flexible ? 'elastycznie' : ''].filter(Boolean).join(' · ') : '';
    parts.push(`<dl class="qf-kv">${answers.map(([k, v]) => `<dt>${esc(LABELS[k] || k)}</dt><dd>${esc(Array.isArray(v) ? v.join(', ') : v)}</dd>`).join('')}${sched ? `<dt>Termin klienta</dt><dd>${esc(sched)}</dd>` : ''}${f.contact?.company ? `<dt>Firma</dt><dd>${esc(f.contact.company)}${f.contact.nip ? ' · NIP ' + esc(f.contact.nip) : ''}</dd>` : ''}${f.contact?.email ? `<dt>E-mail</dt><dd><a href="mailto:${esc(f.contact.email)}">${esc(f.contact.email)}</a></dd>` : ''}</dl>`);
    if (f.items?.length) parts.push(`<div><h4 style="font-size:13px;margin:4px 0 8px">Lista rzeczy od klienta</h4>${itemsTable(f.items)}</div>`);
    if (f.waste?.length) parts.push(`<div><h4 style="font-size:13px;margin:4px 0 8px">Odpady</h4><table class="qf-tbl"><tbody>${f.waste.map(w => `<tr><td>${esc(w.name)}${w.note ? `<div class="muted small">${esc(w.note)}</div>` : ''}</td><td class="q" style="width:90px">${w.qty || '?'} ${esc(w.unit)}</td></tr>`).join('')}</tbody></table></div>`);
    if (f.works?.length) parts.push(`<div><h4 style="font-size:13px;margin:4px 0 8px">Zakres prac</h4><table class="qf-tbl"><tbody>${f.works.map(w => `<tr><td>${esc(w.name)}${w.note ? `<div class="muted small">${esc(w.note)}</div>` : ''}</td><td class="q" style="width:90px">${w.qty || '?'} ${esc(w.unit)}</td></tr>`).join('')}</tbody></table></div>`);
    if (f.extras?.length) parts.push(`<div class="qf-tot">${f.extras.map(x => `<span><i class="fa-solid fa-check" style="color:var(--accent)"></i> ${esc(x)}</span>`).join('')}</div>`);
    if (f.description) parts.push(`<div class="qf-note">„${esc(f.description)}”</div>`);
    if (t.status === 'quoted' && t.price) parts.push(`<div class="qf-note" style="border:1px solid var(--line)"><b>Wysłana wycena:</b> ${esc(RM.taskPrice(t))}${t.quoteProposedDate ? ' · termin: ' + esc(t.quoteProposedDate) : ''}${t.quoteNote ? '\n' + esc(t.quoteNote) : ''}${t.clientAcceptedAt ? '\n✅ Klient zaakceptował ' + esc(RM.fmt.full.format(new Date(t.clientAcceptedAt))) : '\nCzeka na akceptację klienta'}</div>`);
    return `<div class="section"><h3>Formularz wyceny: ${esc(f.serviceName || t.type)}</h3><div class="qf">${parts.join('')}</div></div>`;
  };

  /** „Wyceń” → cena, ekipa, termin, co obejmuje → klient dostaje SMS i widzi wycenę w panelu. */
  RM.sendQuote = function (t) {
    const valid = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    RM.form({
      title: t.status === 'quoted' ? 'Popraw wycenę' : 'Wyślij wycenę klientowi',
      subtitle: `${t.number || ''} · ${t.clientName || ''} ${t.clientPhone ? '· ' + t.clientPhone : ''}`,
      values: { price: t.price || '', priceMax: t.priceMax || '', people: t.people || '', proposedDate: t.quoteProposedDate || t.clientPreferredDate || '', note: t.quoteNote || '', validUntil: t.quoteValidUntil ? String(t.quoteValidUntil).slice(0, 10) : valid, sms: true },
      fields: [
        { name: 'price', label: 'Cena dla klienta (zł brutto)', type: 'number', min: 1, step: 1, required: true, inputmode: 'decimal' },
        { name: 'priceMax', label: 'Cena maks. (opcjonalnie, dla widełek)', type: 'number', min: 0, step: 1, inputmode: 'decimal' },
        { name: 'people', label: 'Ekipa (osoby)', type: 'number', min: 0, max: 30 },
        { name: 'validUntil', label: 'Wycena ważna do', type: 'date' },
        { name: 'proposedDate', label: 'Proponowany termin (widzi klient)', full: true, maxlength: 120, placeholder: 'Np. sob. 22.11, 8:00' },
        { name: 'note', label: 'Co obejmuje cena (widzi klient)', type: 'textarea', full: true, maxlength: 600, placeholder: 'Np. demontaż i montaż mebli, zabezpieczenie, wniesienie pianina, utylizacja.' },
        { name: 'sms', label: 'Wyślij SMS z ceną i linkiem do panelu', type: 'switch', full: true, hint: 'Wymaga bramki SMS (SMSAPI_TOKEN). Klient zawsze zobaczy wycenę w panelu /konto.' }
      ],
      submitLabel: 'Wyślij wycenę',
      async onSubmit(v) {
        const r = await RM.api(`/api/v13/quotes/${RM.id(t)}/send`, { method: 'POST', body: v, label: 'Wycena' });
        RM.upsertTask(r.task);
        RM.toast(r.sms === 'sent' ? 'Wycena wysłana: SMS + panel klienta' : r.sms === 'no-gateway' ? 'Wycena zapisana w panelu klienta (brak bramki SMS — zadzwoń lub wyślij SMS ręcznie)' : r.sms === 'failed' ? 'Wycena zapisana, ale SMS się nie wysłał' : 'Wycena zapisana w panelu klienta', r.sms === 'failed' ? 'error' : 'ok');
        RM.openTask?.(RM.id(t));
        RM.rerender();
      }
    });
  };

  /* ================================================================== */
  /* Realizacje                                                           */
  /* ================================================================== */
  const readFiles = input => Promise.all(Array.from(input?.files || []).slice(0, 8).map(file => new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  }))).then(list => list.filter(Boolean));

  const photoUrl = (r, id) => `/api/v13/realizacje/${r.id}/zdjecia/${id}`;
  const fileFields = `<div class="rz-file"><label><b>Zdjęcia PRZED</b> (do 8 na raz)</label><input type="file" accept="image/*" multiple data-rz="before"></div><div class="rz-file" style="margin-top:10px"><label><b>Zdjęcia PO</b> (do 8 na raz)</label><input type="file" accept="image/*" multiple data-rz="after"></div>`;

  function realizationForm(r, services, rerender) {
    const thumbs = r ? `<div class="rz-thumbs">${[...r.before.map(id => ['before', id]), ...r.after.map(id => ['after', id])].map(([k, id]) => `<figure><img src="${photoUrl(r, id)}" alt=""><figcaption>${k === 'before' ? 'przed' : 'po'}</figcaption><button type="button" data-rzdel="${id}" aria-label="Usuń zdjęcie">✕</button></figure>`).join('') || '<span class="muted small">Brak zdjęć</span>'}</div>` : '';
    const form = RM.form({
      title: r ? 'Edytuj realizację' : 'Nowa realizacja',
      subtitle: 'Pojawi się na stronie w „Opinie i realizacje” oraz na stronach usług.',
      values: r ? { ...r } : { published: true, service: services[0] },
      fields: [
        { name: 'title', label: 'Tytuł', full: true, required: true, maxlength: 140, placeholder: 'Np. Opróżnienie piwnicy, Słupsk' },
        { name: 'service', label: 'Usługa', type: 'select', options: services },
        { name: 'city', label: 'Miasto', maxlength: 80 },
        { name: 'when', label: 'Kiedy', maxlength: 40, placeholder: 'Np. listopad 2026' },
        { name: 'crew', label: 'Ekipa / czas', maxlength: 80, placeholder: 'Np. 3 osoby · 1 dzień' },
        { name: 'summary', label: 'Krótki opis', type: 'textarea', full: true, maxlength: 600 },
        { name: 'published', label: 'Widoczna na stronie', type: 'switch' },
        { name: 'featured', label: 'Wyróżniona (na górze listy)', type: 'switch' },
        { type: 'html', full: true, html: (r ? `<div style="margin-bottom:10px"><span class="label">Zdjęcia</span>${thumbs}</div>` : '') + fileFields }
      ],
      submitLabel: r ? 'Zapisz' : 'Dodaj realizację',
      danger: r ? { label: 'Usuń', confirm: 'Usunąć realizację ze strony?', action: async () => { await RM.api(`/api/v13/realizacje/${r.id}`, { method: 'DELETE' }); RM.toast('Usunięto'); rerender(); } } : null,
      async onSubmit(v, f) {
        const [before, after] = await Promise.all([readFiles($('[data-rz=before]', f)), readFiles($('[data-rz=after]', f))]);
        if (!r && !before.length && !after.length && !await RM.confirm('Dodać realizację bez zdjęć?', { ok: 'Dodaj', danger: false })) return false;
        const body = { ...v, before, after };
        await RM.api(r ? `/api/v13/realizacje/${r.id}` : '/api/v13/realizacje', { method: r ? 'PUT' : 'POST', body, label: 'Realizacja' });
        RM.toast(r ? 'Zapisano' : 'Dodano realizację');
        rerender();
      },
      onRender(f) {
        $$('[data-rzdel]', f).forEach(b => b.addEventListener('click', async () => {
          if (!await RM.confirm('Usunąć to zdjęcie?', { ok: 'Usuń' })) return;
          try { await RM.api(`/api/v13/realizacje/${r.id}/zdjecia/${b.dataset.rzdel}`, { method: 'DELETE' }); b.closest('figure').remove(); } catch (e) { RM.fail(e); }
        }));
      }
    });
    return form;
  }

  views.realizacje = {
    title: 'Realizacje',
    async render(el) {
      el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v13/realizacje');
      const rerender = () => views.realizacje.render(el);
      const card = r => {
        const b = r.before[0], a = r.after[0];
        const ph = b || a ? `<div class="ph ${b && a ? '' : 'one'}">${b ? `<img loading="lazy" src="${photoUrl(r, b)}" alt="Przed">` : ''}${a ? `<img loading="lazy" src="${photoUrl(r, a)}" alt="Po">` : ''}</div>` : '';
        return `<div class="rz">${ph}<div class="c"><b>${esc(r.title)}</b><span class="muted small">${esc([r.service, r.city, r.when].filter(Boolean).join(' · '))} · ${r.before.length} przed / ${r.after.length} po</span>
          <div class="btn-row"><span class="badge plain">${r.published ? '<i class="fa-solid fa-eye"></i> Na stronie' : '<i class="fa-solid fa-eye-slash"></i> Ukryta'}</span>${r.featured ? '<span class="badge plain"><i class="fa-solid fa-star"></i> Wyróżniona</span>' : ''}<button class="btn sm" data-rzedit="${esc(r.id)}" style="margin-left:auto"><i class="fa-solid fa-pen"></i> Edytuj</button></div></div></div>`;
      };
      el.innerHTML = `<div class="page-head"><div><h1>Realizacje</h1><p>Zdjęcia przed i po pokazywane na stronie (Opinie i realizacje, strony usług). Dodaj ręcznie albo jednym kliknięciem ze zdjęć zakończonego zlecenia.</p></div>
        <div class="btn-row"><button class="btn" data-rzfrom><i class="fa-solid fa-file-import"></i> Ze zlecenia</button><button class="btn primary" data-rzadd><i class="fa-solid fa-plus"></i> Dodaj realizację</button></div></div>
        ${d.realizations.length ? `<div class="rz-grid">${d.realizations.map(card).join('')}</div>` : '<div class="empty"><i class="fa-solid fa-images"></i><h3>Brak realizacji</h3><p>Dodaj pierwszą: zdjęcia przed i po z dowolnego zlecenia.</p></div>'}`;
      $('[data-rzadd]', el).addEventListener('click', () => realizationForm(null, d.services, rerender));
      $$('[data-rzedit]', el).forEach(b => b.addEventListener('click', () => realizationForm(d.realizations.find(r => r.id === b.dataset.rzedit), d.services, rerender)));
      $('[data-rzfrom]', el).addEventListener('click', async () => {
        try {
          const list = await RM.api('/api/v13/realizacje-zlecenia');
          if (!list.tasks.length) return RM.toast('Brak zakończonych zleceń ze zdjęciami przed / po', 'error');
          RM.form({
            title: 'Realizacja ze zlecenia',
            subtitle: 'Zdjęcia przed / po zostaną skopiowane. Realizacja będzie ukryta, dopóki jej nie opublikujesz.',
            values: { task: list.tasks.find(t => !t.used)?.id || list.tasks[0].id },
            fields: [{ name: 'task', label: 'Zakończone zlecenie', type: 'select', full: true, required: true, options: list.tasks.map(t => [t.id, `${t.number} · ${t.type || t.name} · ${t.place.slice(0, 40)} · ${t.before}/${t.after} zdj.${t.used ? ' (już dodane)' : ''}`]) }, { name: 'title', label: 'Tytuł (opcjonalnie)', full: true, maxlength: 140 }],
            submitLabel: 'Utwórz',
            async onSubmit(v) {
              const r = await RM.api(`/api/v13/realizacje/ze-zlecenia/${v.task}`, { method: 'POST', body: { title: v.title || undefined }, label: 'Realizacja' });
              RM.toast('Utworzono — sprawdź opis i opublikuj');
              await rerender();
              realizationForm(r.realization, d.services, rerender);
            }
          });
        } catch (e) { RM.fail(e); }
      });
    }
  };
})();
