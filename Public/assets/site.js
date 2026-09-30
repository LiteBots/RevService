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

  ready(function () {
    initHeader();
    initFade();
    initCookies();
    initCitySearch();
    initContent();
  });
})();
