'use strict';

// 8.0 — Wycena RevBot: walidacja, integracja z Claude API (fetch podstawiony), API /api/quotes/ai.
// Bez połączenia z bazą i bez prawdziwych zapytań do Claude API.
process.env.SESSION_SECRET = 'test-only-secret';
process.env.ADMIN_PIN = '8246';
process.env.AUTH_DISABLED = 'false';
process.env.DISCORD_WEBHOOK_URL = '';
process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.ANTHROPIC_API_KEY = '';
process.env.GEO_DISABLED = 'true';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');
const request = require('supertest');
const session = require('express-session');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const { Task, Counter, RevBotMemory } = require('../src/models');
const settingsService = require('../src/services/settings');
settingsService.getSettings = async () => ({ revbot: null });
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
    const chain = rows => { const q = { sort: () => q, limit: () => q, select: () => q, lean: async () => rows }; return q; };
    Task.find = () => chain([]);
    RevBotMemory.find = () => chain([{ _id: 'm1', kind: 'rule', service: '', text: 'Reguła testowa: pianino zawsze minimum 600 zł', weight: 5 }]);
    RevBotMemory.updateMany = async () => ({});
    notify.newQuote = async task => { notified.push(task.number); };
    app = createApp({ sessionStore: new session.MemoryStore() });
});

test('katalog usług: unikalne id, brak stawek w pliku publicznym, cena z silnika ≥ minimum', () => {
    const pricing = require('../lib/revbot/pricing');
    const ids = catalog.SERVICES.map(s => s.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(catalog.basePrice, undefined, 'stawki nie mogą być w publicznym katalogu');
    for (const s of catalog.SERVICES) {
        assert.equal(typeof s.price, 'undefined', s.id);
        const r = pricing.priceService(s.id, catalog.normalize(s.id, {}), { routeKm: 20 }, pricing.mergeParams(null));
        assert.ok(r.mid >= 250, s.id);
    }
});

test('walidacja: poprawne zgłoszenie i normalizacja odpowiedzi', () => {
    const q = validateAiQuote(body({ services: [{ id: 'move', answers: { scope: 99, floorFrom: 50, extras: [0, 0, 7] } }] }));
    assert.equal(q.services[0].values.scope, undefined, 'spoza listy → nie podano');
    assert.equal(q.services[0].values.floorFrom, 20, 'obcięte do max');
    assert.deepEqual(q.services[0].values.extras, [0]);
    assert.equal(q.contact.phone, '600000000');
    assert.equal(q.location.km, 22);
    assert.equal(detailsMap(q)['Zakres'], undefined);
    const q2 = validateAiQuote(body({ services: [{ id: 'wash' }], location: { address: 'Słupsk' } }));
    assert.equal(q2.location.destination, '');
    assert.equal(q2.location.km, 0);
});

test('walidacja: odrzuca błędne dane', () => {
    for (const change of [
        { consent: false }, { services: [] }, { services: [{ id: 'nieznana' }] }, { website: 'spam' }, { requestId: 'x' },
        { location: { address: 'A', destination: '', km: 5 } }, { location: {} },
        { photos: Array(11).fill('x') }, { photos: ['data:image/svg+xml;base64,PHN2Zz4='] },
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
        const svc = (id, extra) => ({ serviceId: id, volumeM3: 0, crew: 0, hours: 0, floorsFrom: -1, floorsTo: -1, lift: -1, packing: false, assembly: 0, heavy: [], disposal: [], suggestedPrice: 0, note: '', ...extra });
        return { ok: true, json: async () => ({ model: 'claude-test', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ confidence: 'high', summary: 'OK', services: [svc('move', { volumeM3: 30, heavy: ['pianino', 'nieznane'], note: 'Schody' }), svc('obca')], inventory: [{ item: 'Szafa', qty: 2, photo: 1, disposal: '' }], photoFindings: ['Zdj. 1: klatka'], routeKmEstimate: 22, observations: ['a', 'b', 'c', 'd', 'e', 'f'], priceFactors: ['x'], questions: ['q'], needsOnsite: false, admin: { crew: '3 osoby', vehicle: 'bus', hours: '6 h', notes: '', risk: '' } }) }] }) };
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
        assert.equal(content[0].type, 'text');
        assert.equal(content[1].type, 'image');
        assert.equal(content[1].source.media_type, 'image/jpeg');
        assert.equal((await sharp(Buffer.from(content[1].source.data, 'base64')).metadata()).width, 1280);
        const text = content[content.length - 1].text;
        assert.match(text, /serviceId=move/);
        assert.match(text, /Reguła testowa/);
        assert.match(text, /POUFNE/);
        assert.equal(e.source, 'ai');
        assert.equal(e.items[1].serviceId, 'trees', 'brakująca pozycja → silnik bez AI');
        assert.equal(e.low, e.items[0].low + e.items[1].low);
        assert.ok(e.engine[0].lines.some(l => l.label === 'Pianino'), 'ciężka rzecz rozpoznana przez AI');
        assert.equal(e.observations.length, 5);
        const pub = ai.publicEstimate(e);
        for (const k of ['admin', 'engine', 'cost', 'profitLow', 'inventory', 'photoFindings']) assert.ok(!(k in pub), k);
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
    assert.ok(!('engine' in a.body));
    const task = rows.find(r => r.number === a.body.number);
    assert.equal(task.status, 'new');
    assert.equal(task.source, 'Wycena RevBot');
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
