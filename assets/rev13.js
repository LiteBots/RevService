/* RevSerwis 13 — wspólny skrypt strony: menu, filtr opinii, realizacje, „Po drodze”, formularze kontaktowe. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var rid = function () { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12); };
  window.Rev = { esc: esc, rid: rid, $: $, $$: $$ };

  /* Menu na telefonie */
  var mb = $('.menu-btn'), mn = $('#mnav');
  if (mb && mn) {
    mb.addEventListener('click', function () {
      var open = !mn.classList.contains('open');
      mn.classList.toggle('open', open);
      mb.setAttribute('aria-expanded', open ? 'true' : 'false');
      mb.innerHTML = open ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
      document.body.style.overflow = open ? 'hidden' : '';
    });
    $$('a', mn).forEach(function (a) { a.addEventListener('click', function () { mn.classList.remove('open'); document.body.style.overflow = ''; }); });
  }

  /* Filtr opinii Google / Fixly */
  $$('[data-rev]').forEach(function (b) {
    b.addEventListener('click', function () {
      var src = b.getAttribute('data-rev');
      $$('[data-rev]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      $$('.rev').forEach(function (r) { r.hidden = src !== 'all' && r.getAttribute('data-src') !== src; });
    });
  });

  /* Realizacje (dodawane w RevMi) */
  $$('[data-realizacje]').forEach(function (box) {
    var limit = Number(box.getAttribute('data-limit')) || 60;
    var service = box.getAttribute('data-service') || '';
    fetch('/api/realizacje', { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : { realizations: [] }; }).then(function (d) {
      var list = (d.realizations || []).filter(function (x) { return !service || x.service === service || x.title.toLowerCase().indexOf(service.toLowerCase().split(' ')[0]) >= 0; });
      if (!list.length && service) list = d.realizations || [];
      list = list.slice(0, limit);
      if (!list.length) {
        var sec = box.closest('section');
        if (sec && box.getAttribute('data-limit') !== '60') sec.hidden = true;
        else box.innerHTML = '<div class="empty-box" style="grid-column:1/-1">Wkrótce dodamy tu zdjęcia przed i po z naszych zleceń.</div>';
        return;
      }
      var img = function (r, id, label) { return '<figure><img loading="lazy" src="/api/realizacje/' + esc(r.id) + '/zdjecie/' + esc(id) + '" alt="' + esc(label + ': ' + r.title) + '" data-zoom><figcaption>' + label + '</figcaption></figure>'; };
      box.innerHTML = list.map(function (r) {
        var b = r.before[0], a = r.after[0];
        var pics = b && a ? img(r, b, 'Przed') + img(r, a, 'Po') : b ? img(r, b, 'Przed') : a ? img(r, a, 'Po') : '';
        var extra = Math.max(0, r.before.length + r.after.length - (b ? 1 : 0) - (a ? 1 : 0));
        var meta = [r.service, r.when, r.crew].filter(Boolean).join(' · ');
        return '<article class="case">' + (pics ? '<div class="ba' + (b && a ? '' : ' single') + '">' + pics + '</div>' : '') +
          '<div class="c"><b>' + esc(r.title) + '</b>' + (meta ? '<small>' + esc(meta) + '</small>' : '') + (r.summary ? '<p>' + esc(r.summary) + '</p>' : '') +
          (extra ? '<button class="more" type="button" data-gallery="' + esc(r.id) + '" style="background:none;border:0;cursor:pointer;padding:0;font:inherit">+ ' + extra + ' zdjęć</button>' : '') + '</div></article>';
      }).join('');
      box._data = list;
    }).catch(function () { box.innerHTML = '<div class="empty-box" style="grid-column:1/-1">Nie udało się wczytać realizacji.</div>'; });
    box.addEventListener('click', function (e) {
      var t = e.target;
      if (t.matches('[data-zoom]')) return lightbox([t.src], 0);
      var g = t.closest('[data-gallery]');
      if (g) {
        var r = (box._data || []).filter(function (x) { return x.id === g.getAttribute('data-gallery'); })[0];
        if (r) lightbox(r.before.concat(r.after).map(function (id) { return '/api/realizacje/' + r.id + '/zdjecie/' + id; }), 0);
      }
    });
  });

  function lightbox(srcs, i) {
    var lb = document.createElement('div');
    lb.className = 'lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true');
    var show = function () { lb.innerHTML = '<img src="' + esc(srcs[i]) + '" alt=""><button class="icon-btn" type="button" aria-label="Zamknij"><i class="fa-solid fa-xmark"></i></button>' + (srcs.length > 1 ? '<div style="position:absolute;bottom:20px;display:flex;gap:10px"><button class="btn btn-ghost btn-sm" data-p>Poprzednie</button><span class="muted" style="align-self:center">' + (i + 1) + ' / ' + srcs.length + '</span><button class="btn btn-ghost btn-sm" data-n>Następne</button></div>' : ''); };
    var close = function () { lb.remove(); document.removeEventListener('keydown', key); };
    var key = function (e) { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight' && srcs.length > 1) { i = (i + 1) % srcs.length; show(); } if (e.key === 'ArrowLeft' && srcs.length > 1) { i = (i - 1 + srcs.length) % srcs.length; show(); } };
    lb.addEventListener('click', function (e) {
      if (e.target.closest('[data-n]')) { i = (i + 1) % srcs.length; return show(); }
      if (e.target.closest('[data-p]')) { i = (i - 1 + srcs.length) % srcs.length; return show(); }
      if (e.target === lb || e.target.closest('.icon-btn')) close();
    });
    document.addEventListener('keydown', key);
    show(); document.body.appendChild(lb);
  }

  /* Po drodze — kursy z RevMi */
  var DAYS = new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'long' });
  var money = function (n) { return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(n) + ' zł'; };
  var tripPrice = function (t, m3) { var p = (Number(t.pricePerM3) || 0) * m3; return Math.max(Number(t.minPrice) || 0, Math.round(p)); };
  $$('[data-trips]').forEach(function (box) {
    var limit = Number(box.getAttribute('data-limit')) || 100;
    var book = box.hasAttribute('data-book');
    fetch('/api/powrot', { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : { trips: [] }; }).then(function (d) {
      var trips = (d.trips || []).slice(0, limit);
      if (!trips.length) { box.innerHTML = '<div class="trip-empty"><b style="color:var(--text)">Teraz nie mamy wolnych tras.</b><br>Nowe kursy pojawiają się co tydzień. <a href="/wycena.html?usluga=transport" style="color:var(--mint)">Zapytaj o swoją trasę</a>.</div>'; return; }
      box.innerHTML = trips.map(function (t) {
        var used = t.capacityM3 ? Math.round(100 - (t.remainingM3 / t.capacityM3) * 100) : 0;
        var from = t.minPrice || t.pricePerM3 ? tripPrice(t, 1) : 0;
        var full = t.status === 'full' || t.remainingM3 <= 0.24;
        return '<div class="trip"><div><div class="route">' + esc(t.from) + ' <i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i> ' + esc(t.to) + '</div><div class="meta">' + esc(DAYS.format(new Date(t.date))) + (t.dateFlexDays ? ' (± ' + t.dateFlexDays + ' dni)' : '') + (t.via ? ' · przez ' + esc(t.via) : '') + '</div></div>' +
          '<div class="cap"><div class="bar"><i style="width:' + Math.min(100, Math.max(4, used)) + '%"></i></div><small>' + (full ? 'Brak miejsca' : 'Wolne ' + String(t.remainingM3).replace('.', ',') + ' z ' + t.capacityM3 + ' m³') + '</small></div>' +
          '<div class="price">' + (from ? 'od ' + money(from) : 'wycena') + (t.discountPct ? '<small>' + t.discountPct + '% taniej niż osobny kurs</small>' : '<small>za 1 m³</small>') + '</div>' +
          (book && !full ? '<button class="btn btn-mint btn-sm" type="button" data-trip="' + esc(t.id) + '">Rezerwuj miejsce</button>' : '') + '</div>';
      }).join('');
      box._trips = trips;
    }).catch(function () { box.innerHTML = '<div class="trip-empty">Nie udało się wczytać tras. Zadzwoń: 735 396 534.</div>'; });
    if (!book) return;
    var dlg = $('#bookDlg'), form = $('[data-book-form]');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-trip]'); if (!b || !dlg) return;
      var t = (box._trips || []).filter(function (x) { return x.id === b.getAttribute('data-trip'); })[0]; if (!t) return;
      form._trip = t; form._rid = rid();
      $('[data-book-route]', form).textContent = t.from + ' → ' + t.to + ', ' + DAYS.format(new Date(t.date)) + ' · wolne ' + t.remainingM3 + ' m³';
      form.volumeM3.max = t.remainingM3; $('.form-msg', form).innerHTML = '';
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    });
    if (form) {
      $('[data-close]', form).addEventListener('click', function () { dlg.close ? dlg.close() : dlg.removeAttribute('open'); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var t = form._trip, msg = $('.form-msg', form), btn = $('[type=submit]', form);
        if (!form.reportValidity()) return;
        var body = { requestId: form._rid, trip: t.id, name: form.name.value, phone: form.phone.value, volumeM3: Number(form.volumeM3.value), pickupAddress: form.pickupAddress.value, dropAddress: form.dropAddress.value, items: form.items.value, floorInfo: form.floorInfo.value, consent: form.consent.checked, website: form.website.value };
        btn.disabled = true;
        post('/api/powrot/bookings', body).then(function (d) {
          msg.innerHTML = '<div class="alert ok" style="margin-bottom:14px"><i class="fa-solid fa-check"></i><span>Zarezerwowane, numer ' + esc(d.number) + '. Orientacyjna cena: ' + money(d.price) + '. Zadzwonimy, żeby potwierdzić godzinę odbioru.</span></div>';
          btn.hidden = true;
        }).catch(function (err) { msg.innerHTML = '<div class="alert err" style="margin-bottom:14px"><i class="fa-solid fa-triangle-exclamation"></i><span>' + esc(err.message) + '</span></div>'; btn.disabled = false; });
      });
    }
  });

  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || d.success === false) throw new Error(d.message || 'Nie udało się wysłać. Zadzwoń: 735 396 534.'); return d; }); });
  }
  window.Rev.post = post;

  /* Formularze kontaktowe (kontakt, dla firm) */
  $$('[data-contact-form]').forEach(function (form) {
    var id = rid();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('.form-msg', form), btn = $('[type=submit]', form);
      if (!form.reportValidity()) return;
      var f = function (n) { return form.elements[n] ? form.elements[n].value : ''; };
      var body = { requestId: id, kind: form.getAttribute('data-kind') === 'company' ? 'company' : 'person', name: f('name'), company: f('company'), nip: f('nip'), email: f('email'), phone: f('phone'), topic: f('topic'), message: f('message'), consent: form.elements.consent.checked, website: f('website') };
      btn.disabled = true;
      post('/api/contact', body).then(function () {
        form.innerHTML = '<div class="alert ok"><i class="fa-solid fa-check"></i><span>Dziękujemy, wiadomość dotarła. Odpowiemy na podany e-mail w ciągu jednego dnia roboczego.</span></div>';
      }).catch(function (err) { msg.innerHTML = '<div class="alert err" style="margin-bottom:14px"><i class="fa-solid fa-triangle-exclamation"></i><span>' + esc(err.message) + '</span></div>'; btn.disabled = false; });
    });
  });
})();
