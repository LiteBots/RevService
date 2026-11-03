'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const catalog = require('../lib/divisions.json');

const publicDir = path.join(__dirname, '../Public');
const asset = name => fs.readFileSync(path.join(publicDir, 'assets', name), 'utf8');

function setup(file = 'wycena.html', query = '') {
    const dom = new JSDOM(fs.readFileSync(path.join(publicDir, file), 'utf8'), { url: 'https://www.revserwis.pl/' + file + query, runScripts: 'outside-only' });
    const w = dom.window;
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.fetch = async () => ({ ok: true, json: async () => ({ success: true, number: 'RV-TEST' }) });
    w.AbortController = AbortController;
    return dom;
}

function withQuote(file, query) {
    const dom = setup(file, query);
    dom.window.eval(asset('divisions.js'));
    dom.window.eval(asset('quote.js'));
    return dom;
}

test('all JS parses; every page has one h1, canonical, unique IDs and valid local links', () => {
    const pages = fs.readdirSync(publicDir).filter(n => n.endsWith('.html') && !n.startsWith('google'));
    assert.ok(pages.includes('wycena.html') && pages.includes('kontakt.html') && pages.includes('uslugi.html'));
    for (const filename of pages) {
        const d = setup(filename);
        const doc = d.window.document;
        for (const s of doc.scripts) if (!s.src && s.type !== 'application/ld+json') new vm.Script(s.textContent, { filename });
        for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) JSON.parse(s.textContent);
        assert.equal(doc.querySelectorAll('h1').length, 1, filename);
        assert.ok(doc.querySelector('link[rel="canonical"]'), filename);
        const ids = [...doc.querySelectorAll('[id]')].map(x => x.id);
        assert.equal(new Set(ids).size, ids.length, 'duplicate IDs ' + filename);
        for (const a of doc.querySelectorAll('a[href]')) {
            const raw = a.getAttribute('href');
            if (!raw || /^(https?:|tel:|mailto:|sms:|#|\/)/.test(raw)) continue;
            const target = raw.split(/[?#]/)[0];
            if (target.endsWith('.html')) assert.ok(fs.existsSync(path.join(publicDir, target)), filename + ' → ' + target);
        }
        d.window.close();
    }
    for (const filename of ['site.js', 'quote.js', 'contact.js', 'divisions.js', 'ai-services.js', 'quote-ai.js']) new vm.Script(asset(filename));
    for (const filename of ['app-core.js', 'app-views.js', 'app-biz.js', 'app-ops.js', 'app-v8.js', 'app-v9.js', 'app-v10.js', 'app-main.js', 'sw.js']) new vm.Script(fs.readFileSync(path.join(publicDir, 'revmi', filename), 'utf8'));
    JSON.parse(fs.readFileSync(path.join(publicDir, 'revmi', 'manifest.webmanifest'), 'utf8'));
});

test('17 division pages exist, are linked from home, in sitemap; merged pages are gone', () => {
    const sitemap = fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8');
    const index = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    const services = fs.readFileSync(path.join(publicDir, 'uslugi.html'), 'utf8');
    assert.equal(catalog.divisions.length, 17);
    for (const d of catalog.divisions) {
        const file = d.slug + '.html';
        const html = fs.readFileSync(path.join(publicDir, file), 'utf8');
        assert.ok(html.includes(d.name.slice(3)), file);
        assert.ok(sitemap.includes('https://www.revserwis.pl/' + file), 'sitemap ' + file);
        assert.ok(services.includes('href="' + file + '"') && services.includes('id="' + d.slug + '"'), 'uslugi ' + file);
        for (const s of d.services) assert.ok(html.includes(s.replace(/&/g, '&amp;')), file + ' → ' + s);
    }
    assert.ok(index.includes('href="uslugi.html"'), 'index → uslugi');
    for (const c of catalog.categories) assert.ok(index.includes('wycena.html?kat=' + c.key), 'index tile ' + c.key);
    for (const old of Object.keys(catalog.redirects)) assert.ok(!fs.existsSync(path.join(publicDir, old)), 'should be redirected: ' + old);
});

const tick = (ms = 220) => new Promise(r => setTimeout(r, ms));
const question = doc => doc.querySelector('.wz-q').textContent;

test('quote wizard: one question per screen, back button, full path and payload', async () => {
    const dom = withQuote('wycena-klasyczna.html', '');
    const w = dom.window;
    let sent;
    w.fetch = async (url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ success: true, number: 'RV-TEST' }) }; };
    const doc = w.document;
    const click = sel => doc.querySelector(sel).click();
    assert.equal(question(doc), 'Czego potrzebujesz?');
    assert.equal(doc.querySelectorAll('.wz-step').length, 1);
    assert.equal(doc.querySelectorAll('[data-cat]').length, catalog.categories.length + 1);
    click('[data-cat=przeprowadzka]'); await tick();
    assert.equal(question(doc), 'Co przeprowadzamy?');
    click('#wz-back'); await tick();
    assert.equal(question(doc), 'Czego potrzebujesz?');
    assert.ok(doc.querySelector('[data-cat=przeprowadzka]').classList.contains('on'));
    click('[data-cat=przeprowadzka]'); await tick();
    click('[data-option="0"]'); await tick();
    assert.equal(question(doc), 'Skąd i dokąd?');
    doc.getElementById('detail-from').value = 'Słupsk';
    doc.getElementById('detail-to').value = 'Gdańsk';
    click('[data-next]'); await tick();
    click('[data-value="2 pokoje"]'); await tick();
    assert.equal(question(doc), 'Piętra i winda');
    click('[data-skip]'); await tick();
    click('[data-skip]'); await tick();
    assert.equal(question(doc), 'Kiedy?');
    click('[data-when="W tym tygodniu"]'); await tick();
    doc.getElementById('description').value = 'Szafa i kartony';
    click('[data-next]'); await tick();
    assert.equal(question(doc), 'Jaką wycenę wybierasz?');
    click('[data-type=free]'); await tick();
    assert.match(doc.getElementById('quote-submit').textContent, /widełki/);
    doc.getElementById('phone').value = '+49 151 12345678';
    doc.getElementById('quote-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await tick(40);
    assert.equal(sent.phone, '+4915112345678');
    assert.equal(sent.division, 'revhome');
    assert.equal(sent.service, 'RevHome — Przeprowadzki');
    assert.equal(sent.route, 'Słupsk → Gdańsk');
    assert.equal(sent.date, 'W tym tygodniu');
    assert.equal(sent.quoteType, 'free');
    assert.equal(sent.details['Rodzaj wyceny'], 'Bezpłatna — widełki cenowe');
    assert.equal(sent.details['Kategoria'], 'Przeprowadzka');
    assert.equal(sent.details['Wielkość'], '2 pokoje');
    assert.match(sent.requestId, /^[a-zA-Z0-9-]{16,80}$/);
    assert.equal(doc.getElementById('quote-success').hidden, false);
    assert.equal(doc.getElementById('quote-number').textContent, 'RV-TEST');
    dom.window.close();
});

test('quote wizard: ?dzial=&zakres= starts at details, legacy ?usluga= works, invalid phone blocks', async () => {
    let dom = withQuote('wycena-klasyczna.html', '?dzial=revgarden&zakres=' + encodeURIComponent('Wycinka drzew'));
    let doc = dom.window.document;
    assert.equal(question(doc), 'Gdzie jest działka?');
    doc.getElementById('wz-back').click(); await tick();
    assert.equal(question(doc), 'Co dokładnie mamy zrobić?');
    assert.ok(doc.querySelector('[data-scope="Wycinka drzew"]').classList.contains('on'));
    dom.window.close();

    dom = withQuote('wycena-klasyczna.html', '?usluga=osoby');
    doc = dom.window.document;
    assert.equal(question(doc), 'Skąd i dokąd?');
    dom.window.close();

    dom = withQuote('wycena-klasyczna.html', '?kat=inne');
    const w = dom.window;
    doc = w.document;
    let called = false;
    w.fetch = async () => { called = true; return { ok: true, json: async () => ({}) }; };
    assert.equal(question(doc), 'Gdzie?');
    for (let i = 0; i < 6 && !doc.getElementById('phone'); i++) {
        const b = doc.querySelector('[data-skip]:not([hidden])') || doc.querySelector('[data-when]') || doc.querySelector('[data-type]') || doc.querySelector('[data-next]');
        b.click(); await tick();
    }
    doc.getElementById('phone').value = 'abc';
    doc.getElementById('quote-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await tick(20);
    assert.equal(called, false);
    assert.equal(doc.getElementById('quote-error').hidden, false);
    dom.window.close();
});

test('contact form: company variant, validation and payload to /api/contact', async () => {
    const dom = setup('kontakt.html', '?temat=b2b&dzial=revb2b');
    const w = dom.window;
    w.eval(asset('divisions.js'));
    let sent, url;
    w.fetch = async (u, options) => { url = u; sent = JSON.parse(options.body); return { ok: true, json: async () => ({ success: true }) }; };
    w.eval(asset('contact.js'));
    const doc = w.document;
    assert.equal(doc.querySelector('[name=kind]:checked').value, 'company');
    assert.equal(doc.getElementById('cf-topic').value, 'Współpraca B2B');
    assert.equal(doc.getElementById('cf-division').value, 'revb2b');
    const submit = () => doc.getElementById('contact-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    doc.getElementById('cf-name').value = 'Jan Kowalski';
    doc.getElementById('cf-email').value = 'jan@firma.pl';
    doc.getElementById('cf-message').value = 'Dzień dobry, prosimy o ofertę stałej współpracy.';
    submit();
    await new Promise(r => setTimeout(r, 10));
    assert.equal(sent, undefined, 'company name required');
    doc.getElementById('cf-company').value = 'Firma ABC';
    submit();
    await new Promise(r => setTimeout(r, 10));
    assert.equal(sent, undefined, 'consent required');
    doc.getElementById('cf-consent').checked = true;
    submit();
    await new Promise(r => setTimeout(r, 30));
    assert.equal(url, '/api/contact');
    assert.equal(sent.kind, 'company');
    assert.equal(sent.company, 'Firma ABC');
    assert.equal(sent.division, 'revb2b');
    assert.equal(sent.consent, true);
    assert.match(sent.requestId, /^[a-zA-Z0-9-]{16,80}$/);
    assert.equal(doc.getElementById('cf-success').hidden, false);
    dom.window.close();
});

test('analytics off before consent, empty proof sections stay hidden', async () => {
    const dom = setup('index.html');
    const w = dom.window;
    w.fetch = async () => ({ ok: true, json: async () => ({ projects: [], reviews: [], company: {} }) });
    w.eval(asset('divisions.js'));
    w.eval(asset('site.js'));
    await new Promise(r => setTimeout(r, 20));
    assert.equal(w.document.querySelectorAll('script[src*="googletagmanager"]').length, 0);
    assert.ok(w.document.querySelector('.rv-cookie'));
    w.document.querySelector('[data-choice="no"]').click();
    assert.equal(w.document.querySelector('.rv-cookie'), null);
    assert.equal(w.document.querySelector('[data-projects-section]').hidden, true);
    // 8.0: opinie z Google są wyrenderowane statycznie (widoczne dla wyszukiwarek)
    assert.match(w.document.getElementById('opinie').textContent, /Jan Matejek/);
    dom.window.close();
});

test('every page links to WhatsApp and Instagram', () => {
    for (const file of fs.readdirSync(publicDir).filter(n => n.endsWith('.html') && !n.startsWith('google'))) {
        const html = fs.readFileSync(path.join(publicDir, file), 'utf8');
        assert.ok(html.includes('https://wa.me/48735396534'), 'WhatsApp ' + file);
        assert.ok(html.includes('https://www.instagram.com/revserwis_/'), 'Instagram ' + file);
    }
});

test('quote wizard: ?rodzaj=ogledziny preselects paid on-site quote', async () => {
    const dom = withQuote('wycena-klasyczna.html', '?rodzaj=ogledziny&kat=ogrod');
    const w = dom.window;
    let sent;
    w.fetch = async (url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ success: true, number: 'RV-OG' }) }; };
    const doc = w.document;
    assert.equal(question(doc), 'Co robimy na działce?');
    doc.querySelector('[data-option="0"]').click(); await tick();
    for (let i = 0; i < 12 && question(doc) !== 'Jaką wycenę wybierasz?'; i++) {
        const b = doc.querySelector('[data-skip]:not([hidden])') || doc.querySelector('[data-when]') || doc.querySelector('[data-next]');
        b.click(); await tick();
    }
    assert.ok(doc.querySelector('[data-type=onsite]').classList.contains('on'));
    doc.querySelector('[data-type=onsite]').click(); await tick();
    assert.match(doc.getElementById('quote-submit').textContent, /dojazdem/);
    doc.getElementById('phone').value = '600100200';
    doc.getElementById('quote-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await tick(40);
    assert.equal(sent.quoteType, 'onsite');
    assert.equal(sent.division, 'revgarden');
    assert.equal(sent.details['Rodzaj wyceny'], 'Płatna z dojazdem (oględziny)');
    dom.window.close();
});

/* 7.0 — formularz „Wycena AI” (wycena.html) */
function withAiQuote(query = '') {
    const dom = setup('wycena.html', query);
    dom.window.eval(asset('ai-services.js'));
    dom.window.eval(asset('quote-ai.js'));
    return dom;
}

test('wycena RevBot: jeden widok, walidacja, dane do /api/quotes/ai i wynik z widełkami', async () => {
    const dom = withAiQuote('?kat=przeprowadzka');
    const w = dom.window;
    const doc = w.document;
    let sent, url;
    w.fetch = async (u, options) => {
        url = u;
        sent = JSON.parse(options.body);
        return { ok: true, status: 201, json: async () => ({ success: true, number: 'RV-TEST', estimate: { low: 1500, high: 2100, currency: 'PLN', confidence: 'high' }, summary: 'Test', items: [{ serviceId: 'move', name: 'Przeprowadzka', low: 1500, high: 2100, note: '' }], observations: ['Widać schody'], priceFactors: ['Dostęp'], questions: [], needsOnsite: false, source: 'ai' }) };
    };
    const submit = () => doc.getElementById('quoteForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.equal(doc.querySelector('[data-group="przeprowadzka"]').getAttribute('aria-pressed'), 'true');
    assert.equal(doc.getElementById('destWrap').hidden, false, 'przeprowadzka pokazuje pole „Dokąd”');
    doc.querySelector('[data-field="scope"][data-i="3"]').click();
    doc.querySelector('[data-num="floorFrom"] [data-d="1"]').click();
    doc.querySelector('[data-num="floorFrom"] [data-d="1"]').click();
    submit();
    await tick(20);
    assert.match(doc.getElementById('formError').textContent, /adres/i);
    doc.getElementById('address').value = 'Słupsk, Długa 1';
    doc.getElementById('destination').value = 'Ustka';
    doc.getElementById('description').value = 'Trzy pokoje, sporo kartonów.';
    doc.getElementById('name').value = 'Jan';
    doc.getElementById('phone').value = '600 000 000';
    submit();
    await tick(20);
    assert.equal(sent, undefined, 'bez zgody nie wysyła');
    doc.getElementById('consent').checked = true;
    submit();
    await tick(60);
    assert.equal(url, '/api/quotes/ai');
    assert.deepEqual(sent.services, [{ id: 'move', answers: { scope: 3, floorFrom: 1 } }]);
    assert.deepEqual(sent.location, { address: 'Słupsk, Długa 1', destination: 'Ustka', km: 0 });
    assert.equal(sent.contact.phone, '600 000 000');
    assert.equal(sent.quoteType, 'free');
    assert.equal(sent.consent, true);
    assert.deepEqual(sent.photos, []);
    assert.match(sent.requestId, /^[a-zA-Z0-9-]{16,80}$/);
    const result = doc.getElementById('sheetIn').textContent;
    assert.match(result, /RV-TEST/);
    assert.match(result, /1\s?500/);
    assert.match(result, /nie ostateczna/i);
    dom.window.close();
});

test('wycena RevBot: linki ?dzial=&zakres= / ?rodzaj=ogledziny / ?miasto= ustawiają formularz; publiczny katalog bez stawek', () => {
    let dom = withAiQuote('?dzial=revgarden&zakres=' + encodeURIComponent('Wycinka drzew') + '&miasto=Ustka&rodzaj=ogledziny');
    let doc = dom.window.document;
    assert.equal(doc.querySelector('[data-group="ogrod"]').getAttribute('aria-pressed'), 'true');
    assert.equal(doc.querySelector('[data-variant="trees"]').getAttribute('aria-pressed'), 'true');
    assert.equal(doc.getElementById('address').value, 'Ustka');
    assert.equal(doc.getElementById('onsite').checked, true);
    dom.window.close();
    dom = withAiQuote('?kat=zima');
    doc = dom.window.document;
    assert.equal(doc.querySelector('[data-group="zima"]').getAttribute('aria-pressed'), 'true');
    assert.equal(doc.getElementById('destWrap').hidden, true);
    dom.window.close();
    const src = asset('ai-services.js');
    assert.ok(!/price\s*:/.test(src) && !/kmRate|floorRate/.test(src), 'stawki tylko na serwerze');
});

test('8.0: 30 stron lokalnych (5 usług × 6 miast) w sitemap, z FAQ, okruszkami i linkami; favicon dla Google', () => {
    const sitemap = fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8');
    const services = ['przeprowadzki', 'oproznianie-i-wywoz', 'transport-rzeczy', 'odsniezanie', 'ogrod-i-dzialka'];
    const cities = ['slupsk', 'ustka', 'koszalin', 'slawno', 'bytow', 'miastko'];
    const titles = new Set();
    for (const s of services) for (const c of cities) {
        const file = `${s}-${c}.html`;
        const html = fs.readFileSync(path.join(publicDir, file), 'utf8');
        assert.ok(sitemap.includes('https://www.revserwis.pl/' + file), file);
        assert.match(html, /"@type": "FAQPage"/, file);
        assert.match(html, /"@type": "BreadcrumbList"/, file);
        assert.match(html, /8393269274/, file);
        titles.add(html.match(/<title>([^<]+)<\/title>/)[1]);
    }
    assert.equal(titles.size, 30, 'unikalne tytuły');
    for (const f of ['favicon.ico', 'favicon.svg', 'favicon-48x48.png', 'favicon-96x96.png', 'apple-touch-icon.png', 'site.webmanifest']) assert.ok(fs.existsSync(path.join(publicDir, f)), f);
    const index = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    assert.match(index, /<link rel="icon" href="\/favicon.ico" sizes="48x48">/);
    assert.ok(!/zachodniopomorskie<\/h2>/.test(fs.readFileSync(path.join(publicDir, 'obszar-dzialania.html'), 'utf8')));
    assert.match(fs.readFileSync(path.join(publicDir, 'polityka-prywatnosci.html'), 'utf8'), /REGON 545866163/);
});
