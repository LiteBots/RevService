/* RevSerwis — wspólny skrypt strony: menu, animacje, cookies/Analytics, treści dynamiczne */
(function () {
  'use strict';

  var GA_ID = 'G-VTLZW64VGN';
  var CONSENT_KEY = 'rv-cookie-consent';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>'"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]; });
  }
  function store(key, value) {
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; }
    return null;
  }

  /* --- Nagłówek i menu mobilne --------------------------------------- */
  function initHeader() {
    var header = document.getElementById('siteHeader');
    if (!header) return;
    var toggle = document.getElementById('menuToggle');
    var menu = document.getElementById('mobileMenu');
    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 20); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    if (toggle && menu) {
      var setOpen = function (open) {
        menu.hidden = !open;
        header.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Zamknij menu' : 'Otwórz menu');
        var icon = toggle.querySelector('i');
        if (icon) icon.className = 'fa-solid ' + (open ? 'fa-xmark' : 'fa-bars');
      };
      toggle.addEventListener('click', function () { setOpen(menu.hidden); });
      menu.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    }

    var drop = header.querySelector('.sh-drop');
    if (drop) {
      var btn = drop.querySelector('button');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = !drop.classList.contains('open');
        drop.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', String(open));
      });
      document.addEventListener('click', function () { drop.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); });
    }

    // Aktywny link
    var here = location.pathname.split('/').pop() || 'index.html';
    Array.prototype.forEach.call(header.querySelectorAll('.sh-menu a, .sh-mobile a'), function (a) {
      if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
    });

    // Pasek dolny chowa się przy przewijaniu w dół
    var bar = document.getElementById('mobileBar');
    if (bar) {
      var last = window.scrollY;
      window.addEventListener('scroll', function () {
        var y = window.scrollY;
        bar.classList.toggle('hide', y > last && y > 400);
        last = y;
      }, { passive: true });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-year]'), function (el) { el.textContent = new Date().getFullYear(); });
  }

  /* --- Animacje wejścia ---------------------------------------------- */
  function initFade() {
    var items = document.querySelectorAll('.fade-up');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(items, function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
      });
    }, { threshold: 0.1 });
    Array.prototype.forEach.call(items, function (el) { io.observe(el); });
  }

  /* --- Cookies i Google Analytics (dopiero po zgodzie) --------------- */
  function loadAnalytics() {
    if (window.__rvGaLoaded) return;
    window.__rvGaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { anonymize_ip: true });
  }

  function showCookieBanner() {
    var old = document.querySelector('.rv-cookie');
    if (old) old.remove();
    var box = document.createElement('div');
    box.className = 'rv-cookie';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Ustawienia cookies');
    box.innerHTML = '<h2>Pliki cookies</h2><p>Używamy Google Analytics, aby sprawdzać, jak korzystasz ze strony. Formularz działa także bez zgody. <a href="polityka-prywatnosci.html">Polityka prywatności</a>.</p>' +
      '<div><button type="button" data-choice="no">Tylko niezbędne</button><button type="button" data-choice="yes">Akceptuję</button></div>';
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-choice]');
      if (!b) return;
      store(CONSENT_KEY, b.getAttribute('data-choice'));
      box.remove();
      if (b.getAttribute('data-choice') === 'yes') loadAnalytics();
    });
    document.body.appendChild(box);
  }

  function initCookies() {
    var choice = store(CONSENT_KEY);
    if (choice === 'yes') loadAnalytics();
    else if (choice !== 'no') showCookieBanner();
    Array.prototype.forEach.call(document.querySelectorAll('[data-cookie-settings]'), function (b) {
      b.addEventListener('click', showCookieBanner);
    });
  }

  /* --- Wyszukiwarka miejscowości (obszar działania) ------------------ */
  function initCitySearch() {
    var input = document.getElementById('city-search');
    if (!input) return;
    var chips = document.querySelectorAll('[data-city]');
    var result = document.getElementById('city-result');
    var norm = function (s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l'); };
    input.addEventListener('input', function () {
      var q = norm(input.value.trim());
      var hits = 0;
      Array.prototype.forEach.call(chips, function (c) {
        var ok = !q || norm(c.getAttribute('data-city')).indexOf(q) !== -1;
        c.classList.toggle('dim', !ok);
        if (ok && q) hits++;
      });
      if (!result) return;
      if (!q) result.textContent = '';
      else if (hits) result.textContent = 'Obsługujemy tę okolicę — kliknij miejscowość, aby przejść do wyceny.';
      else result.innerHTML = 'Nie ma jej na liście, ale to nie problem — <a class="text-brand-400" href="wycena.html?miasto=' + encodeURIComponent(input.value.trim()) + '">zapytaj o wycenę</a>.';
    });
  }

  /* --- Realizacje, opinie, dane firmy (assets/content.json) ---------- */
  function renderContent(data) {
    data = data || {};
    var projects = Array.isArray(data.projects) ? data.projects : [];
    var reviews = Array.isArray(data.reviews) ? data.reviews : [];

    var projectSections = document.querySelectorAll('[data-projects-section]');
    Array.prototype.forEach.call(projectSections, function (section) {
      var box = section.querySelector('[data-projects]');
      if (!box || !projects.length) { section.hidden = true; return; }
      var limit = Number(box.getAttribute('data-limit')) || projects.length;
      var filters = section.querySelector('[data-project-filters]');
      var draw = function (category) {
        box.innerHTML = projects.filter(function (p) { return !category || p.category === category; }).slice(0, limit).map(function (p) {
          return '<article class="glass-card rounded-3xl p-5 rv-project">' + (p.image ? '<img loading="lazy" src="' + esc(p.image) + '" alt="' + esc(p.title) + '">' : '') +
            '<span class="text-brand-500 text-xs font-bold uppercase tracking-widest">' + esc(p.category || '') + (p.city ? ' · ' + esc(p.city) : '') + '</span>' +
            '<h3 class="text-xl font-bold mt-2 mb-2">' + esc(p.title) + '</h3><p class="text-gray-400 leading-relaxed">' + esc(p.description || '') + '</p></article>';
        }).join('');
      };
      if (filters) {
        var cats = projects.map(function (p) { return p.category; }).filter(function (c, i, a) { return c && a.indexOf(c) === i; });
        filters.innerHTML = ['<button type="button" class="rv-filter active" data-cat="">Wszystkie</button>'].concat(cats.map(function (c) { return '<button type="button" class="rv-filter" data-cat="' + esc(c) + '">' + esc(c) + '</button>'; })).join('');
        filters.addEventListener('click', function (e) {
          var b = e.target.closest('[data-cat]');
          if (!b) return;
          Array.prototype.forEach.call(filters.children, function (x) { x.classList.toggle('active', x === b); });
          draw(b.getAttribute('data-cat'));
        });
      }
      draw('');
      section.hidden = false;
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-reviews-section]'), function (section) {
      var box = section.querySelector('[data-reviews]');
      if (!box || !reviews.length) { section.hidden = true; return; }
      box.innerHTML = reviews.map(function (r) {
        var stars = Math.max(0, Math.min(5, Number(r.rating) || 5));
        return '<article class="glass-card rounded-3xl p-7"><div class="rv-stars" aria-label="Ocena ' + stars + ' na 5">' + '★★★★★'.slice(0, stars) + '</div>' +
          '<p class="text-gray-300 leading-relaxed my-4">„' + esc(r.text) + '”</p><strong>' + esc(r.author) + '</strong>' + (r.source ? '<span class="text-gray-500 text-sm"> · ' + esc(r.source) + '</span>' : '') + '</article>';
      }).join('');
      section.hidden = false;
    });

    var company = data.company || {};
    var details = document.querySelector('[data-company-details]');
    if (details && company && (company.name || company.nip || company.address)) {
      details.innerHTML = '<div class="glass-card rounded-3xl p-7"><h2 class="text-xl font-bold mb-3">Dane firmy</h2><p class="text-gray-400 leading-relaxed">' +
        [company.name, company.address, company.nip ? 'NIP: ' + company.nip : '', company.regon ? 'REGON: ' + company.regon : ''].filter(Boolean).map(esc).join('<br>') + '</p></div>';
      details.hidden = false;
    }
  }

  function initContent() {
    if (!document.querySelector('[data-projects-section], [data-reviews-section], [data-company-details]')) return;
    if (typeof fetch !== 'function') return renderContent({});
    fetch('assets/content.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(renderContent)
      .catch(function () { renderContent({}); });
  }

  /* --- Filtrowanie usług na stronie głównej -------------------------- */
  function initServiceTabs() {
    var tabs = document.querySelector('.rv-tabs');
    var grid = document.querySelector('[data-svc-grid]');
    if (!tabs || !grid) return;
    tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-filter]');
      if (!btn) return;
      var cat = btn.getAttribute('data-filter');
      Array.prototype.forEach.call(tabs.querySelectorAll('[data-filter]'), function (b) {
        var on = b === btn;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      Array.prototype.forEach.call(grid.querySelectorAll('[data-cat]'), function (card) {
        card.hidden = cat !== 'all' && card.getAttribute('data-cat') !== cat;
        if (!card.hidden) card.classList.add('is-visible');
      });
    });
  }

  /* --- Wyszukiwarka usług (strona główna) i filtr listy usług ------------ */
  function norm(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
  }
  function escHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>'"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]; });
  }

  function initFinder() {
    var input = document.getElementById('finderInput');
    var out = document.getElementById('finderResults');
    var popular = document.getElementById('finderPopular');
    var catalog = window.RV_DIVISIONS;
    if (!input || !out || !catalog) return;
    var index = [];
    catalog.divisions.forEach(function (d) {
      index.push({ d: d, service: '', hay: norm(d.name + ' ' + d.tagline) });
      d.services.forEach(function (s) { index.push({ d: d, service: s, hay: norm(s + ' ' + d.name) }); });
    });
    function render() {
      var q = norm(input.value.trim());
      popular.hidden = Boolean(q);
      if (!q) { out.innerHTML = ''; return; }
      var words = q.split(/\s+/);
      var hits = index.filter(function (it) { return words.every(function (w) { return it.hay.indexOf(w) !== -1; }); }).slice(0, 7);
      out.innerHTML = hits.length ? hits.map(function (it) {
        var href = it.d.soon ? 'kontakt.html?temat=winter&dzial=' + it.d.slug : (it.service ? 'wycena.html?dzial=' + it.d.slug + '&zakres=' + encodeURIComponent(it.service) : it.d.slug + '.html');
        return '<a href="' + escHtml(href) + '"><i class="fa-solid ' + escHtml(it.d.icon) + '" aria-hidden="true"></i><span><strong>' + escHtml(it.service || it.d.name) + '</strong><small>' + escHtml(it.d.name + (it.service ? ' · ' + it.d.tagline : '')) + '</small></span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>';
      }).join('') : '<p class="v4-finder-empty">Brak dopasowań — <a href="kontakt.html">napisz do nas</a>, sprawdzimy, czy pomożemy.</p>';
    }
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var first = out.querySelector('a'); if (first) { e.preventDefault(); location.href = first.getAttribute('href'); } }
    });
  }

  function initServiceFilter() {
    var input = document.getElementById('serviceFilter');
    if (!input) return;
    var cards = Array.prototype.slice.call(document.querySelectorAll('[data-div]'));
    var counter = document.getElementById('serviceCount');
    var empty = document.getElementById('serviceEmpty');
    function apply() {
      var q = norm(input.value.trim());
      var shown = 0;
      cards.forEach(function (card) {
        var head = card.querySelector('header');
        var nameHit = Boolean(q) && norm(head ? head.textContent : '').indexOf(q) !== -1;
        var items = Array.prototype.slice.call(card.querySelectorAll('li[data-q]'));
        var any = false;
        items.forEach(function (li) {
          var hit = !q || nameHit || norm(li.getAttribute('data-q')).indexOf(q) !== -1;
          li.classList.toggle('hit', Boolean(q) && hit && !nameHit);
          li.hidden = !hit;
          if (hit) { any = true; shown++; }
        });
        card.hidden = !any;
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-group-block]'), function (g) {
        g.hidden = !g.querySelector('[data-div]:not([hidden])');
      });
      if (counter) counter.textContent = q ? shown + ' wyników' : '';
      if (empty) empty.hidden = shown > 0;
    }
    input.addEventListener('input', apply);
    var q = new URLSearchParams(location.search).get('q');
    if (q) { input.value = q; apply(); }
  }

  ready(function () {
    initHeader();
    initServiceTabs();
    initFinder();
    initServiceFilter();
    initFade();
    initCookies();
    initCitySearch();
    initContent();
  });
})();
