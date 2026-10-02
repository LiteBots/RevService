'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const publicDir = path.join(__dirname, '../Public');

function setup(file = 'wycena.html', query = '') {
    const dom = new JSDOM(fs.readFileSync(path.join(publicDir, file), 'utf8'), { url: 'https://www.revserwis.pl/' + file + query, runScripts: 'outside-only' });
    const w = dom.window;
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.fetch = async () => ({ ok: true, json: async () => ({ success: true, number: 'RV-TEST' }) });
    w.AbortController = AbortController;
    return dom;
}

test('all JS parses; every page has one h1, canonical, unique IDs and valid local links', () => {
    const pages = fs.readdirSync(publicDir).filter(n => n.endsWith('.html'));
    assert.ok(pages.includes('wycena.html') && pages.includes('transport.html'));
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
    for (const filename of ['site.js', 'quote.js']) new vm.Script(fs.readFileSync(path.join(publicDir, 'assets', filename), 'utf8'));
    for (const filename of ['app-core.js', 'app-views.js', 'app-main.js', 'sw.js']) new vm.Script(fs.readFileSync(path.join(publicDir, 'revmi', filename), 'utf8'));
    JSON.parse(fs.readFileSync(path.join(publicDir, 'revmi', 'manifest.webmanifest'), 'utf8'));
});

test('quote service preselection, fields, draft preservation and confirmation', async () => {
    const dom = setup('wycena.html', '?usluga=osoby');
    const w = dom.window;
    let sent;
    w.fetch = async (url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ success: true, number: 'RV-TEST' }) }; };
    w.eval(fs.readFileSync(path.join(publicDir, 'assets/quote.js'), 'utf8'));
    const doc = w.document;
    assert.ok(doc.getElementById('detail-passengers'));
    doc.getElementById('detail-from').value = 'Słupsk';
    const change = value => {
        const r = doc.querySelector('[name=service][value=' + value + ']');
        r.checked = true;
        r.dispatchEvent(new w.Event('change', { bubbles: true }));
    };
    change('mycie');
    assert.ok(doc.getElementById('detail-water'));
    change('osoby');
    assert.equal(doc.getElementById('detail-from').value, 'Słupsk');
    doc.getElementById('detail-to').value = 'Gdańsk';
    doc.getElementById('detail-passengers').value = '4';
    doc.getElementById('phone').value = '+49 151 12345678';
    doc.getElementById('quote-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 30));
    assert.equal(sent.phone, '+4915112345678');
    assert.equal(sent.service, 'Przewóz osób / Transfer');
    assert.equal(sent.route, 'Słupsk → Gdańsk');
    assert.equal(sent.details['Liczba pasażerów'], '4');
    assert.match(sent.requestId, /^[a-zA-Z0-9-]{16,80}$/);
    assert.equal(doc.getElementById('quote-success').hidden, false);
    assert.equal(doc.getElementById('quote-number').textContent, 'RV-TEST');
    dom.window.close();
});

test('invalid phone blocks submission', async () => {
    const dom = setup('wycena.html');
    const w = dom.window;
    let called = false;
    w.fetch = async () => { called = true; return { ok: true, json: async () => ({}) }; };
    w.eval(fs.readFileSync(path.join(publicDir, 'assets/quote.js'), 'utf8'));
    w.document.getElementById('phone').value = 'abc';
    w.document.getElementById('quote-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 10));
    assert.equal(called, false);
    assert.equal(w.document.getElementById('quote-error').hidden, false);
    dom.window.close();
});

test('analytics off before consent, empty proof sections stay hidden', async () => {
    const dom = setup('index.html');
    const w = dom.window;
    w.fetch = async () => ({ ok: true, json: async () => ({ projects: [], reviews: [], company: {} }) });
    w.eval(fs.readFileSync(path.join(publicDir, 'assets/site.js'), 'utf8'));
    await new Promise(r => setTimeout(r, 20));
    assert.equal(w.document.querySelectorAll('script[src*="googletagmanager"]').length, 0);
    assert.ok(w.document.querySelector('.rv-cookie'));
    w.document.querySelector('[data-choice="no"]').click();
    assert.equal(w.document.querySelector('.rv-cookie'), null);
    assert.equal(w.document.querySelector('[data-projects-section]').hidden, true);
    assert.equal(w.document.querySelector('[data-reviews-section]').hidden, true);
    dom.window.close();
});

test('v3.1: new service pages exist, are linked, in sitemap and map to quote services', () => {
    const quote = fs.readFileSync(path.join(publicDir, 'assets/quote.js'), 'utf8');
    const keys = [...quote.matchAll(/\{ key: '([a-z0-9]+)'/g)].map(m => m[1]);
    assert.ok(keys.length >= 18, 'quote services: ' + keys.length);
    const sitemap = fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8');
    const index = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    const pages = ['rozbiorki-i-wyburzenia.html', 'wycinka-drzew-i-krzewow.html', 'usuwanie-pni-i-korzeni.html', 'prace-ziemne-i-koparkowe.html',
        'porzadkowanie-dzialek-i-posesji.html', 'przygotowanie-nieruchomosci-do-sprzedazy.html', 'czyszczenie-hal-i-garazy.html',
        'magazynowanie-mienia.html', 'transport-motocykli.html', 'stale-dostawy-dla-firm.html', 'trasy-dla-hoteli-i-pensjonatow.html'];
    for (const file of pages) {
        const html = fs.readFileSync(path.join(publicDir, file), 'utf8');
        assert.ok(sitemap.includes('https://www.revserwis.pl/' + file), 'sitemap ' + file);
        assert.ok(index.includes('href="' + file + '"'), 'index link ' + file);
        const key = (html.match(/wycena\.html\?usluga=([a-z0-9]+)/) || [])[1];
        assert.ok(key && keys.includes(key), 'quote key ' + file + ' → ' + key);
    }
});

test('v3.1: new quote services render their own fields', () => {
    const dom = setup('wycena.html', '?usluga=moto');
    const w = dom.window;
    w.eval(fs.readFileSync(path.join(publicDir, 'assets/quote.js'), 'utf8'));
    const doc = w.document;
    assert.equal(doc.querySelector('[name=service]:checked').value, 'moto');
    assert.ok(doc.getElementById('detail-vehicle'));
    const r = doc.querySelector('[name=service][value=wycinka]');
    r.checked = true;
    r.dispatchEvent(new w.Event('change', { bubbles: true }));
    assert.ok(doc.getElementById('detail-height'));
    assert.ok(doc.getElementById('detail-stumps'));
    dom.window.close();
});

test('v3.1: every page links to WhatsApp and Instagram', () => {
    for (const file of fs.readdirSync(publicDir).filter(n => n.endsWith('.html'))) {
        const html = fs.readFileSync(path.join(publicDir, file), 'utf8');
        assert.ok(html.includes('https://wa.me/48735396534'), 'WhatsApp ' + file);
        assert.ok(html.includes('https://www.instagram.com/revserwis_/'), 'Instagram ' + file);
    }
});
