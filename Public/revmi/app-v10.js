/* RevMi 9.1 — analityka (rentowność per usługa i miasto, lejek sprzedaży), newsletter (subskrybenci, kampanie),
   deweloperzy, dodatki do zamówień oraz czat z klientem i dodatki w szczegółach zlecenia. */
'use strict';

(function () {
  const RM = window.RM;
  const { esc, $, $$ } = RM;
  const S = RM.state;
  const views = RM.views;
  const H = () => RM.helpers;
  const empty = (...a) => H().empty(...a);
  const day = v => (v ? RM.fmt.date.format(new Date(v)) : '—');
  const when = v => (v ? RM.fmt.full.format(new Date(v)) : '—');
  const pct = v => (v == null ? '—' : String(v).replace('.', ',') + '%');
  const kpi = (label, value, sub = '', tone = '') => `<div class="card kpi" ${tone ? `style="--tone:var(--${tone})"` : ''}><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
  const seg = (items, active, attr) => `<div class="segmented">${items.map(([k, l, n]) => `<button type="button" class="${active === k ? 'active' : ''}" data-${attr}="${esc(k)}">${esc(l)}${n !== undefined ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>`;
  const ui = (S.ui.v10 = S.ui.v10 || { anTab: 'profit', anGroup: 'byService', anFrom: '', anTo: '', nlTab: 'campaigns', nlStatus: 'active' });
  const isoDay = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  if (!document.getElementById('v10css')) {
    const st = document.createElement('style');
    st.id = 'v10css';
    st.textContent = `
      .an-bar{position:relative;height:10px;border-radius:99px;background:var(--surface-2,rgba(255,255,255,.06));overflow:hidden;min-width:80px}
      .an-bar i{position:absolute;inset:0 auto 0 0;border-radius:99px;background:var(--accent)}
      .an-bar.neg i{background:var(--red,#f87171)}
      .an-funnel{display:grid;gap:10px}
      .an-stage{display:grid;grid-template-columns:200px 1fr 90px;gap:12px;align-items:center}
      .an-stage .an-f{height:38px;border-radius:12px;background:linear-gradient(90deg,var(--accent),color-mix(in srgb,var(--accent) 45%,transparent));display:flex;align-items:center;padding:0 12px;color:#04110d;font-weight:800;min-width:46px;transition:width .4s}
      .an-step{font-size:12px;color:var(--muted);padding-left:212px;margin:-4px 0}
      @media(max-width:700px){.an-stage{grid-template-columns:1fr;gap:4px}.an-step{padding-left:0}}
      .an-period{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .an-period input{height:36px;border-radius:10px;border:1px solid var(--line-2);background:var(--surface);color:var(--text);padding:0 10px}
      .chat-v10{display:flex;flex-direction:column;gap:8px;max-height:320px;overflow-y:auto;padding:2px}
      .chat-v10 .m{max-width:85%;display:flex;flex-direction:column;gap:2px}
      .chat-v10 .m.st{align-self:flex-end;align-items:flex-end}
      .chat-v10 .b{padding:8px 11px;border-radius:14px 14px 14px 4px;background:var(--surface-3,#23262c);font-size:13.5px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
      .chat-v10 .m.st .b{border-radius:14px 14px 4px 14px;background:var(--accent);color:#04110d}
      .chat-v10 img{max-width:180px;border-radius:10px;margin-top:4px;display:block}
      .chat-v10 small{font-size:10.5px;color:var(--muted)}
      .chat-form-v10{display:grid;grid-template-columns:1fr auto;gap:6px;margin-top:8px}
      .chat-form-v10 textarea{min-height:42px;resize:vertical;border-radius:12px;border:1px solid var(--line-2);background:var(--surface);color:var(--text);padding:9px 11px;font:inherit}
      .nl-block{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:start;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
      .nl-block textarea,.nl-block input{width:100%;border-radius:10px;border:1px solid var(--line-2);background:var(--bg,#0d0e11);color:var(--text);padding:8px 10px;font:inherit}
      .nl-block textarea{min-height:90px}
      .nl-block .tag{font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;padding-top:9px;width:70px}
      .nl-preview{width:100%;height:520px;border:1px solid var(--line);border-radius:12px;background:#0b0c0f}`;
    document.head.appendChild(st);
  }

  /* ================================================================== */
  /* ANALITYKA                                                            */
  /* ================================================================== */
  views.analityka = {
    title: 'Analityka',
    admin: true,
    async render(el) {
      if (!el.querySelector('.v10-an')) el.innerHTML = '<div class="skeleton"></div>';
      const now = new Date();
      const from = ui.anFrom || isoDay(new Date(now.getFullYear(), now.getMonth() - 2, 1));
      const to = ui.anTo || isoDay(now);
      const qs = `?from=${from}&to=${to}`;
      const tab = ui.anTab;
      const data = await RM.api((tab === 'profit' ? '/api/v9/analytics/profitability' : '/api/v9/analytics/funnel') + qs);
      const presets = [['Ten miesiąc', isoDay(new Date(now.getFullYear(), now.getMonth(), 1))], ['3 miesiące', isoDay(new Date(now.getFullYear(), now.getMonth() - 2, 1))], ['Ten rok', isoDay(new Date(now.getFullYear(), 0, 1))], ['12 mies.', isoDay(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()))]];
      el.innerHTML = `<div class="v10-an">
        <div class="page-head"><div><h1>Analityka</h1><p>${tab === 'profit' ? 'Na czym zarabiasz najwięcej — po usłudze, mieście i ich kombinacji. Koszty z raportów zakończenia + wypłaty przypisane do zleceń.' : 'Ile zgłoszeń zamienia się w zlecenia, gdzie klienci odpadają i jak szybko odpowiadasz.'}</p></div></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-bottom:14px">
          ${seg([['profit', 'Rentowność'], ['funnel', 'Lejek sprzedaży']], tab, 'antab')}
          <div class="an-period">${presets.map(([l, f]) => `<button class="btn sm ${from === f && to === isoDay(now) ? 'primary' : ''}" data-preset="${f}">${l}</button>`).join('')}<input type="date" id="anFrom" value="${from}" aria-label="Od"><span class="muted">—</span><input type="date" id="anTo" value="${to}" aria-label="Do"></div>
        </div>
        ${tab === 'profit' ? profitHtml(data) : funnelHtml(data)}</div>`;
      const rerender = () => views.analityka.render(el);
      $$('[data-antab]', el).forEach(b => b.addEventListener('click', () => { ui.anTab = b.dataset.antab; rerender(); }));
      $$('[data-preset]', el).forEach(b => b.addEventListener('click', () => { ui.anFrom = b.dataset.preset; ui.anTo = isoDay(new Date()); rerender(); }));
      $('#anFrom', el).addEventListener('change', e => { ui.anFrom = e.target.value; rerender(); });
      $('#anTo', el).addEventListener('change', e => { ui.anTo = e.target.value; rerender(); });
      $$('[data-angroup]', el).forEach(b => b.addEventListener('click', () => { ui.anGroup = b.dataset.angroup; rerender(); }));
    }
  };

  function profitHtml(d) {
    const t = d.total;
    const rows = d[ui.anGroup] || [];
    const maxProfit = Math.max(1, ...rows.map(r => Math.abs(r.profit)));
    const best = d.byService[0];
    const bestCity = d.byCity[0];
    return `<div class="kpis">${kpi('Przychód', esc(RM.money(t.revenue)), `${t.count} zakończonych zleceń`)}${kpi('Koszty', esc(RM.money(t.cost)), `bezpośrednie ${esc(RM.money(t.direct || 0))} · ekipa ${esc(RM.money(t.labor || 0))}`, 'orange')}${kpi('Zysk', esc(RM.money(t.profit)), `marża ${pct(t.margin)}`, 'purple')}${kpi('Zysk / godzinę', t.profitPerHour != null ? esc(RM.money(t.profitPerHour)) : '—', `${String(t.hours || 0).replace('.', ',')} h pracy w raportach`, 'blue')}</div>
      ${t.count ? `<div class="card" style="padding:14px 16px;margin-bottom:14px;display:flex;gap:18px;flex-wrap:wrap">${best ? `<span><i class="fa-solid fa-trophy" style="color:var(--accent)"></i> Najbardziej opłacalna usługa: <b>${esc(best.key)}</b> (${esc(RM.money(best.profit))}, marża ${pct(best.margin)})</span>` : ''}${bestCity ? `<span><i class="fa-solid fa-location-dot" style="color:var(--accent)"></i> Najlepsze miasto: <b>${esc(bestCity.key)}</b> (${esc(RM.money(bestCity.profit))})</span>` : ''}${d.missingCosts ? `<span style="color:var(--orange)"><i class="fa-solid fa-triangle-exclamation"></i> ${d.missingCosts} zleceń bez kosztów w raporcie — zysk może być zawyżony</span>` : ''}</div>` : ''}
      <div style="margin-bottom:10px">${seg([['byService', 'Usługi'], ['byCity', 'Miasta'], ['matrix', 'Usługa × miasto']], ui.anGroup, 'angroup')}</div>
      <div class="card table-wrap"><table class="table"><thead><tr><th>${ui.anGroup === 'byCity' ? 'Miasto' : ui.anGroup === 'matrix' ? 'Usługa · miasto' : 'Usługa'}</th><th>Zleceń</th><th>Przychód</th><th>Koszty</th><th>Zysk</th><th style="min-width:140px"></th><th>Marża</th><th>Śr. zlecenie</th><th>Zysk / h</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td><b>${esc(r.key)}</b></td><td>${r.count}</td><td class="nowrap">${esc(RM.money(r.revenue))}</td><td class="nowrap">${esc(RM.money(r.cost))}</td><td class="nowrap"><b style="color:${r.profit < 0 ? 'var(--red)' : 'inherit'}">${esc(RM.money(r.profit))}</b></td><td><div class="an-bar ${r.profit < 0 ? 'neg' : ''}"><i style="width:${Math.round(Math.abs(r.profit) / maxProfit * 100)}%"></i></div></td><td>${pct(r.margin)}</td><td class="nowrap">${esc(RM.money(r.avgTicket))}</td><td class="nowrap">${r.profitPerHour != null ? esc(RM.money(r.profitPerHour)) : '—'}</td></tr>`).join('') || `<tr><td colspan="9">${empty('fa-chart-pie', 'Brak zakończonych zleceń w tym okresie', 'Zmień okres albo zakończ zlecenia z raportem kosztów.')}</td></tr>`}
      </tbody></table></div>
      <p class="muted small" style="margin-top:10px">Miasto ustalamy z adresu zlecenia (przy przeprowadzkach — z miejsca odbioru). Koszty: paliwo, materiały, utylizacja i inne z raportu zakończenia oraz wypłaty i premie przypisane w Rozliczeniach do zlecenia.</p>`;
  }

  function funnelHtml(d) {
    const max = Math.max(1, d.stages[0].count);
    const stage = (s, i) => `<div class="an-stage"><div><b>${esc(s.label)}</b><div class="muted small">${pct(s.pct)} zgłoszeń</div></div><div><div class="an-f" style="width:${Math.max(4, Math.round(s.count / max * 100))}%">${s.count}</div></div><div class="small muted">${i ? `${i === 1 ? 'z' : 'z'} poprz.: <b style="color:var(--text)">${pct(d.steps[i - 1])}</b>` : ''}</div></div>`;
    const table = (rows, first) => `<div class="card table-wrap"><table class="table"><thead><tr><th>${first}</th><th>Zgłoszenia</th><th>Wycenione</th><th>Wygrane</th><th>Zrealizowane</th><th>Konwersja</th><th>Wartość</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.key)}</b></td><td>${r.leads}</td><td>${r.quoted}</td><td>${r.won}</td><td>${r.completed}</td><td><b>${pct(r.conversion)}</b></td><td class="nowrap">${esc(RM.money(r.value))}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Brak danych.</td></tr>'}</tbody></table></div>`;
    return `<div class="kpis">${kpi('Zgłoszenia', d.stages[0].count, `${d.open} czeka na wycenę`, d.open ? 'orange' : '')}${kpi('Konwersja', pct(d.stages[2].pct), 'zgłoszenie → zaakceptowane', 'purple')}${kpi('Czas odpowiedzi', d.responseMedianHours != null ? String(d.responseMedianHours).replace('.', ',') + ' h' : '—', 'mediana do wyceny', 'blue')}${kpi('Odpowiedź do 2 h', pct(d.responseUnder2h), 'szybka wycena = więcej zleceń')}</div>
      <section class="card" style="padding:18px;margin-bottom:14px"><h3 style="margin:0 0 14px">Lejek</h3><div class="an-funnel">${d.stages.map(stage).join('')}</div></section>
      <div class="grid" style="display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr))">
        <section><h3 style="margin:6px 0 10px">Źródła zgłoszeń</h3>${table(d.bySource, 'Źródło')}</section>
        <section><h3 style="margin:6px 0 10px">Usługi</h3>${table(d.byService, 'Usługa')}</section>
      </div>
      <section class="card" style="padding:16px;margin-top:14px"><h3 style="margin:0 0 10px">Dlaczego tracisz klientów</h3>${d.lost.length ? d.lost.map(l => `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(l.reason)}</span><b>${l.count}</b></div>`).join('') : '<p class="muted small">Brak anulowanych zgłoszeń w tym okresie.</p>'}<p class="muted small" style="margin:10px 0 0">Powody wpisują klienci przy anulowaniu w panelu. Zgłoszenia anulowane bez wyceny to zwykle brak szybkiej odpowiedzi.</p></section>`;
  }

  /* ================================================================== */
  /* DODATKI                                                              */
  /* ================================================================== */
  views.dodatki = {
    title: 'Dodatki',
    admin: true,
    async render(el) {
      if (!el.querySelector('.v10-ad')) el.innerHTML = '<div class="skeleton"></div>';
      const { addons, units } = await RM.api('/api/v9/addons');
      el.innerHTML = `<div class="v10-ad">
        <div class="page-head"><div><h1>Dodatki do zamówień</h1><p>Klient zaznacza je w formularzu zamówienia w panelu /konto. Bez ceny = „w wycenie” (wyceniasz indywidualnie). Dodatek bez działów pokazuje się przy każdej usłudze.</p></div>
          <div class="page-actions"><button class="btn primary" id="adNew"><i class="fa-solid fa-plus"></i> Nowy dodatek</button></div></div>
        <div class="card table-wrap"><table class="table"><thead><tr><th>Dodatek</th><th>Cena</th><th>Działy</th><th>Zamówiono</th><th>Status</th><th></th></tr></thead><tbody>
          ${addons.map(a => `<tr><td><i class="fa-solid ${esc(a.icon || 'fa-plus')}" style="color:var(--accent);width:18px"></i> <b>${esc(a.name)}</b><div class="muted small">${esc(a.description || '')}</div></td><td class="nowrap">${a.price == null ? '<span class="muted">w wycenie</span>' : esc(RM.money(a.price)) + ' / ' + esc(a.unit)}${a.allowQty ? `<div class="muted small">ilość do ${a.maxQty}</div>` : ''}</td><td class="small">${(a.divisions || []).length ? a.divisions.map(d => esc(RM.divName(d))).join(', ') : '<span class="muted">wszystkie</span>'}</td><td>${a.timesOrdered || 0}×</td><td>${a.active ? RM.tag(['Aktywny', 'green']) : RM.tag(['Ukryty', 'muted'])}</td><td><button class="btn sm" data-adedit="${esc(a._id)}"><i class="fa-solid fa-pen"></i></button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Brak dodatków.</td></tr>'}
        </tbody></table></div></div>`;
      const rerender = () => views.dodatki.render(el);
      const form = a => RM.form({
        title: a ? 'Edytuj dodatek' : 'Nowy dodatek', subtitle: 'Widoczny w formularzu zamówienia klienta',
        values: { unit: 'usł.', active: true, maxQty: 20, icon: 'fa-plus', ...(a || {}) },
        fields: [
          { name: 'name', label: 'Nazwa', required: true, full: true },
          { name: 'description', label: 'Krótki opis', full: true, maxlength: 300 },
          { name: 'price', label: 'Cena (zł) — puste = w wycenie', type: 'number', min: 0, step: '1' },
          { name: 'unit', label: 'Jednostka', type: 'select', options: units },
          { name: 'icon', label: 'Ikona (Font Awesome, np. fa-box)', placeholder: 'fa-box' },
          { name: 'order', label: 'Kolejność', type: 'number', min: 0 },
          { name: 'divisions', label: 'Działy (puste = wszystkie)', type: 'picks', full: true, options: RM.DIVISIONS.map(d => ({ value: d.slug, label: d.name })) },
          { name: 'allowQty', label: 'Klient wybiera ilość', type: 'switch' },
          { name: 'maxQty', label: 'Maks. ilość', type: 'number', min: 1, max: 999 },
          { name: 'active', label: 'Widoczny dla klientów', type: 'switch' }
        ],
        danger: a ? { label: 'Usuń', confirm: 'Usunąć dodatek? (Zamówienia, w których go wybrano, zachowają nazwę i cenę.)', action: async () => { await RM.api('/api/v9/addons/' + a._id, { method: 'DELETE' }); rerender(); } } : null,
        async onSubmit(v) { await RM.api(a ? '/api/v9/addons/' + a._id : '/api/v9/addons', { method: a ? 'PUT' : 'POST', body: v }); RM.toast('Zapisano'); rerender(); }
      });
      $('#adNew', el).addEventListener('click', () => form(null));
      $$('[data-adedit]', el).forEach(b => b.addEventListener('click', () => form(addons.find(a => a._id === b.dataset.adedit))));
    }
  };

  /* ================================================================== */
  /* NEWSLETTER                                                           */
  /* ================================================================== */
  const CAMP_ST = { draft: ['Szkic', ''], sending: ['Wysyłanie…', 'blue'], paused: ['Wstrzymana', 'orange'], sent: ['Wysłana', 'green'] };
  const SUB_ST = { active: ['Aktywny', 'green'], pending: ['Czeka na potwierdzenie', 'orange'], unsubscribed: ['Wypisany', 'muted'] };
  const SEGMENTS = [['all', 'Wszyscy aktywni'], ['person', 'Osoby prywatne'], ['company', 'Firmy'], ['topic', 'Temat'], ['city', 'Miasto']];

  views.newsletter = {
    title: 'Newsletter',
    admin: true,
    async render(el) {
      if (!el.querySelector('.v10-nl')) el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v9/newsletter' + (ui.nlTab === 'subs' ? '?status=' + ui.nlStatus : ''));
      const tab = ui.nlTab;
      el.innerHTML = `<div class="v10-nl">
        <div class="page-head"><div><h1>Newsletter</h1><p>Zapisy ze stopki strony, panelu klienta, RevOutlet, RevPowrót i strony dla nabywców. Każdy zapis jest potwierdzany linkiem w e-mailu (RODO) — wysyłamy tylko do aktywnych.</p></div>
          <div class="page-actions"><button class="btn" id="nlAdd"><i class="fa-solid fa-user-plus"></i> Dodaj</button><button class="btn primary" id="nlNew"><i class="fa-solid fa-pen-to-square"></i> Nowa kampania</button></div></div>
        ${!d.mailConfigured ? '<div class="card" style="padding:14px;margin-bottom:14px;border-color:var(--orange)"><i class="fa-solid fa-triangle-exclamation" style="color:var(--orange)"></i> Poczta nie jest skonfigurowana — ustaw <b>RESEND_API_KEY</b> albo SMTP w Railway. Bez tego nie wyślemy potwierdzeń ani kampanii.</div>' : ''}
        <div class="kpis">${kpi('Aktywni', d.counts.active, 'potwierdzeni subskrybenci')}${kpi('Czekają', d.counts.pending, 'nie kliknęli potwierdzenia', 'orange')}${kpi('Wypisani', d.counts.unsubscribed, '', 'blue')}${kpi('Źródła', d.bySource.slice(0, 3).map(s => `${esc(s.source)} ${s.n}`).join(' · ') || '—', '', 'purple')}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between;margin-bottom:14px">${seg([['campaigns', 'Kampanie', d.campaigns.length], ['subs', 'Subskrybenci', d.counts.active]], tab, 'nltab')}
          ${tab === 'subs' ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${seg([['active', 'Aktywni'], ['pending', 'Czekają'], ['unsubscribed', 'Wypisani']], ui.nlStatus, 'nlst')}<button class="btn sm" id="nlSync"><i class="fa-solid fa-rotate"></i> Z kont klientów</button><button class="btn sm" id="nlResend"><i class="fa-solid fa-paper-plane"></i> Ponów potwierdzenia</button><a class="btn sm" href="/api/v9/newsletter/export.csv"><i class="fa-solid fa-file-csv"></i> CSV</a></div>` : ''}</div>
        ${tab === 'campaigns' ? `<div class="grid grid-auto">${d.campaigns.map(c => `<article class="card res-card">
            <div class="res-top"><span class="row-icon"><i class="fa-solid fa-envelope"></i></span><div style="min-width:0"><h3>${esc(c.subject)}</h3><p>${esc(day(c.createdAt))} · ${esc(SEGMENTS.find(s => s[0] === c.segment)?.[1] || '')}${c.segmentValue ? ': ' + esc(d.topics[c.segmentValue] || c.segmentValue) : ''}</p></div><span style="margin-left:auto">${RM.tag(CAMP_ST[c.status])}</span></div>
            ${c.status !== 'draft' ? `<div class="res-stats"><div><small>Odbiorcy</small><strong>${c.stats.total}</strong></div><div><small>Wysłano</small><strong>${c.stats.sent}</strong></div><div><small>Błędy</small><strong>${c.stats.failed}</strong></div></div><div class="an-bar"><i style="width:${c.stats.total ? Math.round((c.stats.sent + c.stats.failed) / c.stats.total * 100) : 0}%"></i></div>` : ''}
            <div class="res-actions">${c.status === 'draft' ? `<button class="btn sm" data-cedit="${esc(c._id)}"><i class="fa-solid fa-pen"></i> Edytuj</button><button class="btn sm primary" data-csend="${esc(c._id)}"><i class="fa-solid fa-paper-plane"></i> Wyślij</button>` : ''}${c.status === 'sending' ? `<button class="btn sm" data-cpause="${esc(c._id)}">Wstrzymaj</button>` : ''}${c.status === 'paused' ? `<button class="btn sm primary" data-cresume="${esc(c._id)}">Wznów</button>` : ''}<a class="btn sm" href="/api/v9/campaigns/${esc(c._id)}/preview" target="_blank" rel="noopener"><i class="fa-solid fa-eye"></i></a><button class="btn sm" data-cdup="${esc(c._id)}" title="Kopiuj"><i class="fa-solid fa-copy"></i></button></div></article>`).join('') || empty('fa-envelope', 'Brak kampanii', 'Utwórz pierwszą kampanię — np. „Winter Care: zapisy na sezon” albo „Nowości w RevOutlet”.')}</div>`
        : `<div class="card table-wrap"><table class="table"><thead><tr><th>E-mail</th><th>Imię / miasto</th><th>Tematy</th><th>Źródło</th><th>Zapis</th><th>Wysłano</th><th></th></tr></thead><tbody>
            ${d.subscribers.map(s => `<tr><td><b>${esc(s.email)}</b>${s.account ? ' <span class="badge plain tone-blue">konto</span>' : ''}<div>${RM.tag(SUB_ST[s.status])}</div></td><td class="small">${esc(s.name || '—')}${s.city ? `<div class="muted">${esc(s.city)}</div>` : ''}</td><td class="small">${(s.topics || []).map(t => esc(d.topics[t] || t)).join(', ')}</td><td class="small">${esc(s.source || '—')}</td><td class="small">${esc(day(s.createdAt))}${s.confirmedAt ? `<div class="muted">potw. ${esc(day(s.confirmedAt))}</div>` : ''}</td><td>${s.sentCount || 0}</td><td><button class="btn sm" data-sdel="${esc(s._id)}" title="Usuń (RODO)"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Brak subskrybentów w tej grupie.</td></tr>'}
          </tbody></table></div>`}</div>`;
      const rerender = () => views.newsletter.render(el);
      $$('[data-nltab]', el).forEach(b => b.addEventListener('click', () => { ui.nlTab = b.dataset.nltab; rerender(); }));
      $$('[data-nlst]', el).forEach(b => b.addEventListener('click', () => { ui.nlStatus = b.dataset.nlst; rerender(); }));
      $('#nlNew', el).addEventListener('click', () => campaignEditor(null, d.topics, rerender));
      $$('[data-cedit]', el).forEach(b => b.addEventListener('click', () => campaignEditor(d.campaigns.find(c => c._id === b.dataset.cedit), d.topics, rerender)));
      $('#nlAdd', el).addEventListener('click', () => RM.form({
        title: 'Dodaj do newslettera', subtitle: 'Wyślemy e-mail z prośbą o potwierdzenie zapisu',
        fields: [{ name: 'email', label: 'E-mail', type: 'email', required: true, full: true }, { name: 'name', label: 'Imię' }, { name: 'city', label: 'Miasto' },
          { name: 'consent', label: 'Osoba wyraziła zgodę na informacje handlowe (np. telefonicznie)', type: 'switch' }],
        async onSubmit(v) { if (!v.consent) throw new Error('Bez zgody nie można dodać osoby do newslettera.'); await RM.api('/api/v9/newsletter/subscribers', { method: 'POST', body: v }); RM.toast('Wysłano prośbę o potwierdzenie'); rerender(); }
      }));
      $('#nlSync', el)?.addEventListener('click', async () => { try { const r = await RM.api('/api/v9/newsletter/sync-accounts', { method: 'POST' }); RM.toast(`Sprawdzono ${r.checked} kont, dodano ${r.added}`); rerender(); } catch (e) { RM.fail(e); } });
      $('#nlResend', el)?.addEventListener('click', async () => { try { const r = await RM.api('/api/v9/newsletter/resend-confirmations', { method: 'POST' }); RM.toast(`Wysłano ponownie: ${r.sent}`); } catch (e) { RM.fail(e); } });
      $$('[data-sdel]', el).forEach(b => b.addEventListener('click', async () => { if (!await RM.confirm('Usunąć subskrybenta całkowicie (np. na prośbę — RODO)?')) return; try { await RM.api('/api/v9/newsletter/subscribers/' + b.dataset.sdel, { method: 'DELETE' }); rerender(); } catch (e) { RM.fail(e); } }));
      $$('[data-csend]', el).forEach(b => b.addEventListener('click', async () => {
        try {
          const { audience } = await RM.api(`/api/v9/campaigns/${b.dataset.csend}/audience`);
          if (!await RM.confirm(`Wysłać kampanię do ${audience} ${audience === 1 ? 'osoby' : 'osób'}? Tego nie da się cofnąć.`, { ok: 'Wyślij', danger: false })) return;
          const r = await RM.api(`/api/v9/campaigns/${b.dataset.csend}/send`, { method: 'POST' });
          RM.toast(`Wysyłka ruszyła: ${r.total} odbiorców (paczkami co minutę)`);
          rerender();
        } catch (e) { RM.fail(e); }
      }));
      for (const [attr, action] of [['cpause', 'pause'], ['cresume', 'resume'], ['cdup', 'duplicate']]) {
        $$(`[data-${attr}]`, el).forEach(b => b.addEventListener('click', async () => { try { await RM.api(`/api/v9/campaigns/${b.dataset[attr]}/${action}`, { method: 'POST' }); rerender(); } catch (e) { RM.fail(e); } }));
      }
    }
  };

  /** Edytor kampanii z blokami (nagłówek, tekst, przycisk, obrazek, linia) i podglądem. */
  function campaignEditor(c, topics, done) {
    let blocks = c ? JSON.parse(JSON.stringify(c.blocks || [])) : [{ type: 'heading', text: 'Cześć {{imie}}!' }, { type: 'text', text: '' }, { type: 'button', text: 'Sprawdź ofertę', url: 'https://www.revserwis.pl/' }];
    const LABEL = { heading: 'Nagłówek', text: 'Tekst', button: 'Przycisk', image: 'Obrazek', divider: 'Linia' };
    const blockHtml = (b, i) => `<div class="nl-block" data-i="${i}"><span class="tag">${LABEL[b.type]}</span><div style="display:grid;gap:6px">
        ${b.type === 'heading' ? `<input data-k="text" value="${esc(b.text || '')}" maxlength="200">` : ''}
        ${b.type === 'text' ? `<textarea data-k="text" maxlength="5000" placeholder="Treść… {{imie}} wstawi imię odbiorcy">${esc(b.text || '')}</textarea>` : ''}
        ${b.type === 'button' ? `<input data-k="text" value="${esc(b.text || '')}" placeholder="Tekst przycisku"><input data-k="url" value="${esc(b.url || '')}" placeholder="https://…">` : ''}
        ${b.type === 'image' ? `<input data-k="url" value="${esc(b.url || '')}" placeholder="https://… (adres obrazka)"><input data-k="alt" value="${esc(b.alt || '')}" placeholder="Opis obrazka">` : ''}
        ${b.type === 'divider' ? '<hr style="border:0;border-top:1px solid var(--line-2);width:100%">' : ''}</div>
      <div style="display:flex;flex-direction:column;gap:4px"><button type="button" class="icon-btn" data-up="${i}" aria-label="W górę"><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="icon-btn" data-rm="${i}" aria-label="Usuń"><i class="fa-solid fa-xmark"></i></button></div></div>`;
    const form = RM.form({
      title: c ? 'Edytuj kampanię' : 'Nowa kampania', subtitle: 'Wiadomość w kolorach RevSerwis z linkiem do wypisu — dodawanym automatycznie',
      values: { subject: c?.subject || '', preheader: c?.preheader || '', segment: c?.segment || 'all', segmentValue: c?.segmentValue || '' },
      fields: [
        { name: 'subject', label: 'Temat', required: true, full: true, maxlength: 150, placeholder: 'np. Zima idzie — zapisy na Winter Care' },
        { name: 'preheader', label: 'Zajawka (widoczna w skrzynce obok tematu)', full: true, maxlength: 200 },
        { name: 'segment', label: 'Do kogo', type: 'select', options: SEGMENTS },
        { name: 'segmentValue', label: 'Temat / miasto (dla segmentu)', type: 'datalist', options: [...Object.keys(topics), 'Słupsk', 'Ustka', 'Koszalin'], hint: Object.entries(topics).map(([k, l]) => `${k} = ${l}`).join(' · ') },
        { type: 'html', full: true, html: '<span class="label">Treść</span><div id="nlBlocks" style="display:grid;gap:8px"></div><div class="btn-row" style="margin-top:8px;flex-wrap:wrap">' + Object.entries(LABEL).map(([k, l]) => `<button type="button" class="btn sm" data-add="${k}"><i class="fa-solid fa-plus"></i> ${l}</button>`).join('') + '</div>' },
        { type: 'html', full: true, html: `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input type="email" id="nlTestTo" placeholder="E-mail do testu" value="${esc(S.settings?.companyEmail || '')}" style="flex:1;min-width:200px;height:38px;border-radius:10px;border:1px solid var(--line-2);background:var(--surface);color:var(--text);padding:0 10px"><button type="button" class="btn sm" id="nlTest"><i class="fa-solid fa-flask"></i> Zapisz i wyślij test</button><button type="button" class="btn sm" id="nlPrev"><i class="fa-solid fa-eye"></i> Podgląd</button></div><div id="nlAud" class="muted small" style="margin-top:6px"></div>` }
      ],
      submitLabel: 'Zapisz szkic',
      danger: c ? { label: 'Usuń', confirm: 'Usunąć kampanię?', action: async () => { await RM.api('/api/v9/campaigns/' + c._id, { method: 'DELETE' }); done(); } } : null,
      async onSubmit(v) { await save(v); RM.toast('Zapisano szkic'); done(); }
    });
    let saved = c;
    const box = $('#nlBlocks', form);
    const sync = () => $$('.nl-block', box).forEach(n => { const b = blocks[Number(n.dataset.i)]; $$('[data-k]', n).forEach(i => { b[i.dataset.k] = i.value; }); });
    const draw = () => {
      box.innerHTML = blocks.map(blockHtml).join('') || '<p class="muted small">Dodaj bloki treści poniżej.</p>';
      $$('[data-rm]', box).forEach(b => b.addEventListener('click', () => { sync(); blocks.splice(Number(b.dataset.rm), 1); draw(); }));
      $$('[data-up]', box).forEach(b => b.addEventListener('click', () => { sync(); const i = Number(b.dataset.up); if (i > 0) [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]]; draw(); }));
    };
    $$('[data-add]', form).forEach(b => b.addEventListener('click', () => { sync(); blocks.push({ type: b.dataset.add, text: '', url: '' }); draw(); }));
    draw();
    async function save(v) {
      sync();
      const body = { ...v, blocks: blocks.filter(b => b.type === 'divider' || b.text || b.url) };
      const r = await RM.api(saved ? '/api/v9/campaigns/' + saved._id : '/api/v9/campaigns', { method: saved ? 'PUT' : 'POST', body });
      saved = r.campaign;
      $('#nlAud', form).textContent = `Odbiorcy w tym segmencie: ${r.audience}`;
      return r;
    }
    const values = () => ({ subject: form.elements.subject.value, preheader: form.elements.preheader.value, segment: form.elements.segment.value, segmentValue: form.elements.segmentValue.value });
    $('#nlTest', form).addEventListener('click', async e => {
      e.target.disabled = true;
      try { await save(values()); await RM.api(`/api/v9/campaigns/${saved._id}/test`, { method: 'POST', body: { email: $('#nlTestTo', form).value } }); RM.toast('Wysłano test na ' + $('#nlTestTo', form).value); } catch (err) { RM.fail(err); }
      e.target.disabled = false;
    });
    $('#nlPrev', form).addEventListener('click', async () => { try { await save(values()); window.open(`/api/v9/campaigns/${saved._id}/preview`, '_blank', 'noopener'); } catch (err) { RM.fail(err); } });
  }

  /* ================================================================== */
  /* DEWELOPERZY                                                          */
  /* ================================================================== */
  const LEAD_ST = { new: ['Nowe', 'orange'], contacted: ['Kontakt', 'blue'], planned: ['Zaplanowane', 'blue'], completed: ['Zrealizowane', 'green'], lost: ['Bez realizacji', 'muted'] };
  views.deweloperzy = {
    title: 'Deweloperzy',
    admin: true,
    async render(el) {
      if (!el.querySelector('.v10-dev')) el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v9/developers');
      const invById = new Map(d.developers.flatMap(x => x.investments).map(i => [String(i._id), i]));
      el.innerHTML = `<div class="v10-dev">
        <div class="page-head"><div><h1>Deweloperzy (B2B)</h1><p>Inwestycje i nabywcy mieszkań. Dostęp „Panel dewelopera” nadajesz w Kontach klientów. Nabywcy zgłaszają się sami przez <b>odbior.html?kod=…</b> albo dodaje ich deweloper.</p></div></div>
        <div class="kpis">${kpi('Inwestycje', d.summary.investments)}${kpi('Nabywcy', d.summary.leads, `${d.summary.newLeads} nowych`, 'orange')}${kpi('Zrealizowane', d.summary.completed, '', 'purple')}${kpi('Deweloperzy', d.developers.filter(x => x.hasAccess).length, `${d.developers.filter(x => !x.hasAccess).length} czeka na dostęp`, 'blue')}</div>
        ${d.developers.map(x => `<article class="card" style="padding:18px;margin-bottom:12px">
          <div class="res-top"><span class="row-icon purple"><i class="fa-solid fa-city"></i></span><div><h3>${esc(x.company || x.name)}</h3><p>${esc(x.name)} · ${esc(x.email)} · ${esc(x.phone || '')}</p></div><span style="margin-left:auto">${x.hasAccess ? RM.tag(['Dostęp aktywny', 'green']) : RM.tag(['Prosi o dostęp — Konta klientów', 'orange'])}</span></div>
          ${x.investments.length ? `<div class="table-wrap" style="margin-top:10px"><table class="table"><thead><tr><th>Inwestycja</th><th>Kod</th><th>Nabywcy</th><th>Wejścia</th><th>Rabat</th><th>Prowizja</th><th></th></tr></thead><tbody>${x.investments.map(i => `<tr><td><b>${esc(i.name)}</b><div class="muted small">${esc(i.city)} · ${esc(i.address)}</div></td><td class="mono"><a href="/odbior.html?kod=${esc(i.code)}" target="_blank" rel="noopener">${esc(i.code)}</a></td><td>${i.leads}</td><td>${i.visits || 0}</td><td>${i.discountPct || 0}%</td><td>${i.commissionPct || 0}%</td><td><button class="btn sm" data-inv="${esc(i._id)}">Warunki</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small" style="margin:10px 0 0">Brak inwestycji — deweloper dodaje je w swoim panelu.</p>'}
        </article>`).join('') || empty('fa-city', 'Brak deweloperów', 'Deweloper zakłada konto (typ „Deweloper”) — dostaniesz powiadomienie i nadasz dostęp w Kontach klientów.')}
        ${d.leads.length ? `<h3 style="margin:18px 0 10px">Nabywcy</h3><div class="card table-wrap"><table class="table"><thead><tr><th>Zgłoszenie</th><th>Inwestycja</th><th>Nabywca</th><th>Usługi</th><th>Status</th><th></th></tr></thead><tbody>${d.leads.map(l => `<tr><td><b>${esc(l.number)}</b><div class="muted small">${esc(day(l.createdAt))} · ${l.via === 'buyer' ? 'sam' : 'od dewelopera'}</div></td><td>${esc(invById.get(String(l.investment))?.name || '—')}</td><td>${esc(l.name)}${l.unit ? ' · ' + esc(l.unit) : ''}<div class="small">${esc(l.phone)}</div></td><td class="small">${esc((l.services || []).join(', '))}</td><td>${RM.tag(LEAD_ST[l.status])}${l.commissionAmount ? `<div class="small">prowizja ${esc(RM.money(l.commissionAmount))}</div>` : ''}</td><td class="nowrap"><button class="btn sm" data-lead="${esc(l._id)}"><i class="fa-solid fa-sliders"></i></button>${l.task ? ` <a class="btn sm" href="#/zlecenia/${esc(l.task)}">Zlecenie</a>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>`;
      const rerender = () => views.deweloperzy.render(el);
      $$('[data-inv]', el).forEach(b => b.addEventListener('click', () => {
        const i = invById.get(b.dataset.inv);
        RM.form({ title: i.name, subtitle: 'Warunki dla inwestycji', values: { discountPct: i.discountPct || 0, commissionPct: i.commissionPct || 0, active: i.active },
          fields: [{ name: 'discountPct', label: 'Rabat dla nabywców (%)', type: 'number', min: 0, max: 50, hint: 'Pokazywany nabywcom na ich stronie i w zleceniu' }, { name: 'commissionPct', label: 'Prowizja dla dewelopera (%)', type: 'number', min: 0, max: 50 }, { name: 'active', label: 'Link aktywny', type: 'switch' }],
          async onSubmit(v) { await RM.api('/api/v9/investments/' + i._id, { method: 'PUT', body: v }); RM.toast('Zapisano'); rerender(); } });
      }));
      $$('[data-lead]', el).forEach(b => b.addEventListener('click', () => {
        const l = d.leads.find(x => x._id === b.dataset.lead);
        RM.form({ title: l.name, subtitle: l.number, values: { status: l.status, orderValue: l.orderValue },
          fields: [{ name: 'status', label: 'Status (widzi deweloper)', type: 'select', options: Object.entries(LEAD_ST).map(([k, [lb]]) => [k, lb]) }, { name: 'orderValue', label: 'Wartość zlecenia (zł)', type: 'number', min: 0, hint: 'Puste = kwota ze zlecenia w RevMi' }],
          async onSubmit(v) { await RM.api('/api/v9/dev-leads/' + l._id, { method: 'PUT', body: v }); RM.toast('Zapisano'); RM.loadV9Counts?.(); rerender(); } });
      }));
    }
  };

  /* ================================================================== */
  /* CZAT Z KLIENTAMI — lista rozmów                                      */
  /* ================================================================== */
  views.czat = {
    title: 'Czat z klientami',
    async render(el) {
      await RM.reload().catch(() => null);
      const list = S.tasks.filter(t => t.lastChatAt).sort((a, b) => (b.chatUnreadStaff || 0) - (a.chatUnreadStaff || 0) || new Date(b.lastChatAt) - new Date(a.lastChatAt));
      el.innerHTML = `<div class="page-head"><div><h1>Czat z klientami</h1><p>Rozmowy w zleceniach z panelu klienta. Klient dostaje e-mail o Twojej odpowiedzi.</p></div></div>
        <div style="display:grid;gap:8px">${list.map(t => `<a class="card" href="#/zlecenia/${esc(RM.id(t))}" style="padding:14px 16px;display:flex;gap:12px;align-items:center;text-decoration:none;color:inherit;${t.chatUnreadStaff ? 'border-color:var(--accent)' : ''}"><span class="row-icon"><i class="fa-solid fa-comments"></i></span><div style="min-width:0;flex:1"><b>${esc(t.clientName || t.name)}</b><div class="muted small">${esc(t.number)} · ${esc(t.name)}</div></div><div style="text-align:right"><div class="small muted">${esc(when(t.lastChatAt))}</div>${t.chatUnreadStaff ? `<span class="count hot">${t.chatUnreadStaff} nowe</span>` : ''}</div></a>`).join('') || empty('fa-comments', 'Brak rozmów', 'Gdy klient napisze w zleceniu w panelu /konto, rozmowa pojawi się tutaj.')}</div>`;
    }
  };

  /* ================================================================== */
  /* Szczegóły zlecenia: dodatki + czat z klientem                        */
  /* ================================================================== */
  const baseMedia = RM.mediaSection;
  const baseBind = RM.bindMedia;
  RM.mediaSection = (t, media, canWork) => {
    let html = baseMedia ? baseMedia(t, media, canWork) : '';
    if ((t.addons || []).length) {
      html = `<div class="section"><h3><i class="fa-solid fa-puzzle-piece"></i> Dodatki zamówione przez klienta</h3>${t.addons.map(a => `<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--line)"><span>${esc(a.name)}${a.qty > 1 ? ' × ' + a.qty : ''}</span><b>${a.total != null ? esc(RM.money(a.total)) : '<span class="muted">do wyceny</span>'}</b></div>`).join('')}${t.addonsTotal ? `<p class="small" style="margin:8px 0 0">Razem dodatki: <b>${esc(RM.money(t.addonsTotal))}</b></p>` : ''}</div>` + html;
    }
    if (t.account || t.lastChatAt) {
      html += `<div class="section" id="v10Chat"><h3><i class="fa-solid fa-comments"></i> Czat z klientem${t.chatUnreadStaff ? ` <span class="count hot">${t.chatUnreadStaff}</span>` : ''}</h3><div class="chat-v10" data-chat><p class="muted small">Wczytuję…</p></div>
        ${t.account ? '<form class="chat-form-v10" data-chatform><textarea name="text" placeholder="Odpowiedz klientowi (dostanie e-mail i zobaczy to w panelu)…" maxlength="2000"></textarea><button class="btn primary" aria-label="Wyślij"><i class="fa-solid fa-paper-plane"></i></button></form>' : '<p class="muted small">Klient nie ma konta — odpowiedz telefonicznie.</p>'}</div>`;
    }
    return html;
  };
  RM.bindMedia = (drawer, t) => {
    baseBind?.(drawer, t);
    const box = $('[data-chat]', drawer);
    if (!box) return;
    const id = RM.id(t);
    const load = async () => {
      try {
        const { messages } = await RM.api(`/api/tasks/${id}/messages`);
        box.innerHTML = messages.length ? messages.map(m => `<div class="m ${m.from === 'staff' ? 'st' : ''}"><div class="b">${esc(m.text)}${m.hasPhoto ? `<a href="/api/tasks/${id}/messages/${esc(m.id)}/photo" target="_blank" rel="noopener"><img src="/api/tasks/${id}/messages/${esc(m.id)}/photo" alt=""></a>` : ''}</div><small>${esc(m.from === 'staff' ? m.authorName : m.authorName)} · ${esc(when(m.createdAt))}</small></div>`).join('') : '<p class="muted small">Brak wiadomości. Klient może napisać z panelu /konto.</p>';
        box.scrollTop = box.scrollHeight;
        if (t.chatUnreadStaff) { t.chatUnreadStaff = 0; RM.loadV9Counts?.(); }
      } catch (e) { box.innerHTML = `<p class="muted small">${esc(e.message)}</p>`; }
    };
    load();
    const f = $('[data-chatform]', drawer);
    f?.addEventListener('submit', async e => {
      e.preventDefault();
      const text = f.text.value.trim();
      if (!text) return;
      const btn = $('button', f);
      btn.disabled = true;
      try { await RM.api(`/api/tasks/${id}/messages`, { method: 'POST', body: { text } }); f.text.value = ''; await load(); } catch (err) { RM.fail(err); }
      btn.disabled = false;
    });
  };
})();
