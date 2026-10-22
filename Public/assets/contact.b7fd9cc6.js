/* RevSerwis 4.0 — formularz kontaktowy dla osób prywatnych i firm (wstawiany w [data-contact-form]).
   Wiadomość trafia do panelu RevMi (Wiadomości) i na adres kontakt@revserwis.pl. */
(function () {
  'use strict';

  var PHONE = '735 396 534';
  var PHONE_TEL = '+48735396534';
  var EMAIL = 'kontakt@revserwis.pl';
  var TOPICS = ['Pytanie ogólne', 'Wycena usługi', 'Współpraca B2B', 'Abonament RevFacility', 'Zapis na RevWinter / Winter Care', 'Magazynowanie RevStorage', 'Reklamacja lub uwagi', 'Praca w RevSerwis', 'Inne'];
  var TOPIC_PARAM = { winter: 4, facility: 3, b2b: 2, storage: 5, wycena: 1, praca: 7 };
  var COMPANY_TOPICS = [2, 3, 4];
  var CATALOG = window.RV_DIVISIONS || { divisions: [] };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>'"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]; });
  }
  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'rv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
  }

  function init(root) {
    var params = new URLSearchParams(location.search);
    var topicIndex = TOPIC_PARAM[params.get('temat')];
    var topic = topicIndex !== undefined ? TOPICS[topicIndex] : TOPICS[0];
    var division = params.get('dzial') || '';
    var kind = topicIndex !== undefined && COMPANY_TOPICS.indexOf(topicIndex) !== -1 ? 'company' : (params.get('typ') === 'firma' ? 'company' : 'person');
    var requestId = uuid();
    var busy = false;

    root.innerHTML =
      '<form class="qf-card rv-form cf" id="contact-form" novalidate>' +
      '<p class="qf-title">Formularz kontaktowy</p><p class="qf-sub">Odpowiemy na podany adres e-mail. Pola z * są wymagane.</p>' +
      '<div class="cf-kind" role="radiogroup" aria-label="Piszesz jako">' +
      '<label><input type="radio" name="kind" value="person"' + (kind === 'person' ? ' checked' : '') + '><span><i class="fa-solid fa-user" aria-hidden="true"></i> Osoba prywatna</span></label>' +
      '<label><input type="radio" name="kind" value="company"' + (kind === 'company' ? ' checked' : '') + '><span><i class="fa-solid fa-building" aria-hidden="true"></i> Firma</span></label>' +
      '</div>' +
      '<div class="qf-grid">' +
      '<div class="qf-field"><label for="cf-name">Imię i nazwisko *</label><input id="cf-name" name="name" autocomplete="name" maxlength="140" required></div>' +
      '<div class="qf-field cf-company"><label for="cf-company">Nazwa firmy *</label><input id="cf-company" name="company" autocomplete="organization" maxlength="180"></div>' +
      '<div class="qf-field cf-company"><label for="cf-nip">NIP (opcjonalnie)</label><input id="cf-nip" name="nip" inputmode="numeric" maxlength="20" placeholder="np. 839-000-00-00"></div>' +
      '<div class="qf-field"><label for="cf-email">E-mail *</label><input id="cf-email" name="email" type="email" autocomplete="email" maxlength="160" required></div>' +
      '<div class="qf-field"><label for="cf-phone">Telefon</label><input id="cf-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="40" placeholder="opcjonalnie"></div>' +
      '<div class="qf-field"><label for="cf-topic">Temat</label><select id="cf-topic" name="topic">' + TOPICS.map(function (t) { return '<option' + (t === topic ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
      '<div class="qf-field"><label for="cf-division">Dział (opcjonalnie)</label><select id="cf-division" name="division"><option value="">— nie wiem / ogólne —</option>' +
      CATALOG.divisions.map(function (d) { return '<option value="' + esc(d.slug) + '"' + (d.slug === division ? ' selected' : '') + '>' + esc(d.name) + ' — ' + esc(d.tagline) + '</option>'; }).join('') + '</select></div>' +
      '<div class="qf-field full"><label for="cf-message">Wiadomość *</label><textarea id="cf-message" name="message" maxlength="5000" required placeholder="W czym możemy pomóc?"></textarea><span class="hint"><span id="cf-count">0</span>/5000</span></div>' +
      '</div>' +
      '<div class="qf-honey" aria-hidden="true"><label>Strona www<input id="cf-website" name="website" tabindex="-1" autocomplete="off"></label></div>' +
      '<label class="cf-consent"><input type="checkbox" id="cf-consent" name="consent"><span>Zgadzam się na kontakt w sprawie tej wiadomości. Administratorem danych jest RevSerwis — szczegóły w <a href="polityka-prywatnosci.html">polityce prywatności</a>. *</span></label>' +
      '<div class="qf-error" id="cf-error" role="alert" hidden></div>' +
      '<div class="qf-actions"><button class="rv-button" type="submit" id="cf-submit">Wyślij wiadomość <i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button></div>' +
      '</form>' +
      '<div class="qf-card qf-success" id="cf-success" hidden><div class="icon"><i class="fa-solid fa-envelope-circle-check" aria-hidden="true"></i></div><h3>Dziękujemy! Wiadomość wysłana.</h3><p>Odpowiemy na podany adres e-mail najszybciej, jak to możliwe. Pilna sprawa? Zadzwoń: <a class="text-brand-400" href="tel:' + PHONE_TEL + '">' + PHONE + '</a>.</p><div class="qf-actions" style="justify-content:center"><button type="button" class="rv-button ghost" id="cf-again">Napisz kolejną wiadomość</button></div></div>';

    var form = root.querySelector('#contact-form');
    var errorBox = root.querySelector('#cf-error');
    var submit = root.querySelector('#cf-submit');

    function syncKind() {
      var company = form.querySelector('[name=kind]:checked').value === 'company';
      Array.prototype.forEach.call(form.querySelectorAll('.cf-company'), function (el) { el.hidden = !company; });
      form.querySelector('#cf-company').required = company;
      form.querySelector('#cf-name').previousElementSibling.textContent = company ? 'Osoba kontaktowa *' : 'Imię i nazwisko *';
    }
    function showError(message) {
      errorBox.textContent = message || '';
      errorBox.hidden = !message;
    }
    function value(name) { return String(form.elements[name].value || '').trim(); }

    form.addEventListener('change', function (e) { if (e.target.name === 'kind') syncKind(); });
    form.querySelector('#cf-message').addEventListener('input', function (e) { root.querySelector('#cf-count').textContent = e.target.value.length; });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      var data = {
        kind: form.querySelector('[name=kind]:checked').value,
        name: value('name'), company: value('company'), nip: value('nip'), email: value('email'), phone: value('phone'),
        topic: value('topic'), division: value('division'), message: value('message'),
        consent: form.querySelector('#cf-consent').checked, website: value('website'), requestId: requestId
      };
      if (data.kind !== 'company') { data.company = ''; data.nip = ''; }
      var problem = data.name.length < 2 ? 'Podaj imię i nazwisko.'
        : data.kind === 'company' && data.company.length < 2 ? 'Podaj nazwę firmy.'
        : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email) ? 'Podaj prawidłowy adres e-mail — na niego odpowiemy.'
        : data.message.length < 10 ? 'Napisz kilka słów więcej w wiadomości (min. 10 znaków).'
        : !data.consent ? 'Zaznacz zgodę na kontakt w sprawie wiadomości.' : '';
      if (problem) { showError(problem); return; }
      showError('');
      busy = true;
      submit.disabled = true;
      submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Wysyłanie…';
      fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (r) {
            if (!res.ok || !r.success) throw new Error(r.message || 'Nie udało się wysłać wiadomości. Napisz na ' + EMAIL + ' lub zadzwoń: ' + PHONE + '.');
            return r;
          });
        })
        .then(function () {
          form.hidden = true;
          root.querySelector('#cf-success').hidden = false;
          if (typeof window.gtag === 'function') window.gtag('event', 'contact', { topic: data.topic });
        })
        .catch(function (err) { showError(err.message || 'Błąd wysyłania.'); })
        .then(function () {
          busy = false;
          submit.disabled = false;
          submit.innerHTML = 'Wyślij wiadomość <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>';
        });
    });

    root.querySelector('#cf-again').addEventListener('click', function () {
      requestId = uuid();
      form.reset();
      syncKind();
      form.hidden = false;
      root.querySelector('#cf-success').hidden = true;
    });

    syncKind();
  }

  function start() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-contact-form]'), function (root) {
      if (!root.getAttribute('data-ready')) { root.setAttribute('data-ready', '1'); init(root); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
