'use strict';

// 7.0 — Wycena AI: walidacja, integracja z Claude API (fetch podstawiony), API /api/quotes/ai.
// Bez połączenia z bazą i bez prawdziwych zapytań do Claude API.
process.env.SESSION_SECRET = 'test-only-secret';
process.env.ADMIN_PIN = '8246';
process.env.AUTH_DISABLED = 'false';
process.env.DISCORD_WEBHOOK_URL = '';
process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.ANTHROPIC_API_KEY = '';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');
const request = require('supertest');
const session = require('express-session');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const { Task, Counter, PriceItem } = require('../src/models');
const notify = require('../src/services/notify');
const config = require('../src/config');
const ai = require('../src/services/ai-quote');
const { validateAiQuote, detailsMap } = require('../lib/ai-quote-input');
const catalog = require('../Public/assets/ai-services');
const { createApp } = require('../src/app');

let app;
const rows = [];
const notified = [];
let jpg;

const body = extra => ({
    requestId: randomUUID(),
    consent: true,
    services: [{ id: 'move', answers: { scope: 3, floorFrom: 4, floorTo: 0, lift: 0, assembly: 2, extras: [0] } }, { id: 'trees', answers: { count: 2, height: 1, near: 1 } }],
    location: { address: 'Słupsk, ul. Długa 1', destination: 'Ustka', km: 22 },
    description: 'Trzy pokoje, sporo kartonów, dwa drzewa przy domu.',
    photos: [],
    schedule: { date: '2026-11-02', time: 0, urgency: 0 },
    contact: { client: 0, name: 'Jan Test', phone: '600 000 000', email: 'jan@example.pl' },
    quoteType: 'free',
    ...extra
});

before(async () => {
    jpg = 'data:image/jpeg;base64,' + (await sharp({ create: { width: 64, height: 48, channels: 3, background: '#3a7' } }).jpeg().toBuffer()).toString('base64');
    const query = row => ({ select: async () => row, lean: async () => row, then: (ok, fail) => Promise.resolve(row).then(ok, fail) });
    Task.findOne = filter => query(rows.find(x => x.quoteRequestId === filter.quoteRequestId) || null);
    Task.create = async data => { const doc = new Task(data); await doc.validate(); rows.push(doc); return doc; };
    Task.updateOne = async (filter, update) => { const doc = rows.find(x => String(x._id) === String(filter._id)); if (doc) Object.assign(doc, update.$set); return { acknowledged: true }; };
    let seq = 0;
    Counter.findOneAndUpdate = () => ({ lean: async () => ({ seq: ++seq }) });
    PriceItem.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [{ name: 'Wywóz 1 m³', division: 'revhome', unit: 'm³', price: 180, priceMax: 250 }] }) }) });
    notify.newQuote = async task => { notified.push(task.number); };
    app = createApp({ sessionStore: new session.MemoryStore() });
});

test('katalog usług: unikalne id, poprawne działy, ceny bazowe > 0 dla domyślnych odpowiedzi', () => {
    const ids = catalog.SERVICES.map(s => s.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const s of catalog.SERVICES) {
        const values = catalog.normalize(s.id, {});
        assert.ok(catalog.basePrice(s.id, values, { km: 20 }) >= 150, s.id);
        assert.equal(Object.keys(catalog.readable(s.id, values)).length, s.fields.length, s.id);
    }
});

test('walidacja: poprawne zgłoszenie i normalizacja odpowiedzi', () => {
    const q = validateAiQuote(body({ services: [{ id: 'move', answers: { scope: 99, floorFrom: 50, extras: [0, 0, 7] } }] }));
    assert.equal(q.services[0].values.scope, 2, 'spoza listy → domyślna');
    assert.equal(q.services[0].values.floorFrom, 20, 'obcięte do max');
    assert.deepEqual(q.services[0].values.extras, [0]);
    assert.equal(q.contact.phone, '600000000');
    assert.equal(q.location.km, 22);
    assert.equal(detailsMap(q)['Zakres'], '2 pokoje');
    const q2 = validateAiQuote(body({ services: [{ id: 'wash' }], location: { address: 'Słupsk' } }));
    assert.equal(q2.location.destination, '');
    assert.equal(q2.location.km, 0);
});

test('walidacja: odrzuca błędne dane', () => {
    for (const change of [
        { consent: false }, { services: [] }, { services: [{ id: 'nieznana' }] }, { website: 'spam' }, { requestId: 'x' },
        { location: { address: 'A', destination: '', km: 5 } }, { location: { address: 'A', destination: 'B', km: 0 } }, { location: {} },
        { photos: Array(7).fill('x') }, { photos: ['data:image/svg+xml;base64,PHN2Zz4='] },
        { contact: { name: 'Jan', phone: 'abc' } }, { contact: { name: 'Jan', phone: '600000000', email: 'zly' } },
        { services: [{ id: 'other' }], description: 'krótko' }
    ]) assert.throws(() => validateAiQuote(body(change)), /./, JSON.stringify(change).slice(0, 80));
});

test('bez klucza Claude API: wycena zapasowa z katalogu', async () => {
    config.ai.apiKey = '';
    const q = validateAiQuote(body());
    const e = await ai.estimateQuote(q, []);
    assert.equal(e.source, 'fallback');
    assert.equal(e.items.length, 2);
    assert.equal(e.low, e.items[0].low + e.items[1].low);
    assert.ok(e.high > e.low);
});

test('Claude API: zapytanie ze schematem JSON i zdjęciem, odpowiedź oczyszczona', async () => {
    config.ai.apiKey = 'sk-ant-test';
    config.ai.dailyLimit = 100;
    const original = global.fetch;
    let sent;
    global.fetch = async (url, opts) => {
        sent = { url, body: JSON.parse(opts.body), key: opts.headers['x-api-key'], version: opts.headers['anthropic-version'] };
        return { ok: true, json: async () => ({ model: 'claude-test', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ low: 1, high: 2, confidence: 'high', summary: 'OK', items: [{ serviceId: 'move', name: 'x', low: 1203, high: 1688, note: 'Schody' }, { serviceId: 'obca', name: 'x', low: 1, high: 2, note: '' }], observations: ['a', 'b', 'c', 'd', 'e', 'f'], priceFactors: ['x'], questions: ['q'], needsOnsite: false, admin: { crew: '3 osoby', vehicle: 'bus', hours: '6 h', notes: '', risk: '' } }) }] }) };
    };
    try {
        const q = validateAiQuote(body());
        const buf = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#555' } }).jpeg().toBuffer();
        const e = await ai.estimateQuote(q, [buf]);
        assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
        assert.equal(sent.key, 'sk-ant-test');
        assert.equal(sent.version, '2023-06-01');
        assert.equal(sent.body.output_config.format.type, 'json_schema');
        assert.equal(sent.body.output_config.format.schema.additionalProperties, false);
        assert.match(sent.body.system, /RevSerwis/);
        const content = sent.body.messages[0].content;
        assert.equal(content[0].type, 'image');
        assert.equal(content[0].source.media_type, 'image/jpeg');
        assert.equal((await sharp(Buffer.from(content[0].source.data, 'base64')).metadata()).width, 1024);
        assert.match(content[1].text, /serviceId=move/);
        assert.match(content[1].text, /Wywóz 1 m³/);
        assert.equal(e.source, 'ai');
        assert.equal(e.items[0].low, 1200);
        assert.equal(e.items[1].serviceId, 'trees', 'brakująca pozycja → stawka bazowa');
        assert.equal(e.low, e.items[0].low + e.items[1].low);
        assert.equal(e.observations.length, 5);
        assert.ok(!('admin' in ai.publicEstimate(e)));
    } finally {
        global.fetch = original;
        config.ai.apiKey = '';
    }
});

test('Claude API: błąd API → wycena zapasowa (formularz działa dalej)', async () => {
    config.ai.apiKey = 'sk-ant-test';
    const original = global.fetch;
    global.fetch = async () => ({ ok: false, status: 529, json: async () => ({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }) });
    try {
        const e = await ai.estimateQuote(validateAiQuote(body()), []);
        assert.equal(e.source, 'fallback');
        assert.match(e.error, /Overloaded/);
    } finally {
        global.fetch = original;
        config.ai.apiKey = '';
    }
});

test('API: zgłoszenie trafia do panelu, zwraca widełki; ponowienie = ta sama wycena; zmiana danych = 409', async () => {
    const data = body({ photos: [jpg] });
    const a = await request(app).post('/api/quotes/ai').send(data);
    assert.equal(a.status, 201, JSON.stringify(a.body));
    assert.match(a.body.number, /^RV-[A-F0-9]{12}$/);
    assert.ok(a.body.estimate.low > 0 && a.body.estimate.high >= a.body.estimate.low);
    assert.equal(a.body.source, 'fallback');
    assert.ok(!('admin' in a.body));
    const task = rows.find(r => r.number === a.body.number);
    assert.equal(task.status, 'new');
    assert.equal(task.source, 'Wycena AI');
    assert.equal(task.quotePhotoCount, 1);
    assert.equal(task.addressFrom, 'Słupsk, ul. Długa 1');
    assert.equal(task.addressTo, 'Ustka');
    assert.equal(task.division, 'revhome');
    assert.ok(task.aiEstimate && task.aiEstimate.items.length === 2);
    await new Promise(r => setTimeout(r, 20));
    assert.ok(notified.includes(a.body.number));

    const b = await request(app).post('/api/quotes/ai').send(data);
    assert.equal(b.status, 200);
    assert.equal(b.body.number, a.body.number);
    assert.equal(b.body.estimate.low, a.body.estimate.low);

    const c = await request(app).post('/api/quotes/ai').send({ ...data, description: 'Inny opis zlecenia' });
    assert.equal(c.status, 409);

    const d = await request(app).post('/api/quotes/ai').send(body({ consent: false }));
    assert.equal(d.status, 400);
});

test('panel: magazyn i sortownia wymagają logowania', async () => {
    for (const url of ['/api/storage-units', '/api/sorting']) assert.equal((await request(app).get(url)).status, 401, url);
    assert.equal((await request(app).post('/api/tasks/' + 'a'.repeat(24) + '/ai-quote')).status, 401);
});
