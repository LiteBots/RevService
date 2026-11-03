'use strict';

// RevSerwis 12.0 — panel klienta po numerze telefonu, szczegóły formularza wyceny i checklista ekipy.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const request = require('supertest');

const A = require('../lib/phone-access');
const catalog = require('../Public/assets/ai-services');
const { validateAiQuote, detailsMap } = require('../lib/ai-quote-input');
const { crewPrep } = require('../lib/crew-prep');

/* ------------------------------------------------------------------ */
/* Numer telefonu                                                       */
/* ------------------------------------------------------------------ */

test('phoneKey: ten sam numer w różnych formatach daje ten sam klucz', () => {
    for (const v of ['600 000 789', '600-000-789', '+48 600 000 789', '0048600000789', '48600000789', '(+48) 600 000 789']) assert.equal(A.phoneKey(v), '600000789', v);
    assert.equal(A.phoneKey('+44 7700 900123'), '447700900123');
    assert.equal(A.phoneKey('0044 7700 900123'), '447700900123');
    for (const v of ['', '123', 'abc600000789', '7700900123', '600 000 789 999 999 999', null]) assert.equal(A.phoneKey(v), '', String(v));
});

test('phoneRegex: dopasowuje stare zapisy numeru, ale nie cudze numery z tą samą końcówką', () => {
    const rx = A.phoneRegex('600000789');
    for (const v of ['600000789', '+48 600 000 789', '+48600000789', '0048 600-000-789', '48 600 000 789']) assert.ok(rx.test(v), v);
    for (const v of ['+44 1600000789', '1600000789', '600000788', '600000789 1']) assert.ok(!rx.test(v), v);
    assert.equal(A.phoneRegex('12'), null);
});

test('maskowanie, kod i numer zlecenia', () => {
    assert.equal(A.maskPhone('600000789'), '+48 600 *** 789');
    assert.match(A.newCode(), /^\d{6}$/);
    assert.notEqual(A.hashCode('600000789', '123456'), A.hashCode('600000780', '123456'));
    assert.equal(A.validateCode(' 123 456 '), '123456');
    assert.throws(() => A.validateCode('12345'), /6 cyfr/);
    assert.equal(A.normalizeNumber('rv/2026/0123'), 'RV20260123');
    assert.throws(() => A.normalizeNumber('<script>'));
    assert.equal(A.smsNumber('600000789'), '48600000789');
});

/* ------------------------------------------------------------------ */
/* Trasy /api/konto/telefon — modele zastąpione stubami                 */
/* ------------------------------------------------------------------ */

function chain(result) {
    const q = { select: () => q, sort: () => q, limit: () => q, lean: async () => result, then: (ok, err) => Promise.resolve(result).then(ok, err) };
    return q;
}

function phoneApp() {
    const models = require('../src/models');
    const { PhoneCode } = require('../src/models-v12');
    const { Account } = require('../src/models-v9');
    const sms = require('../src/services/sms');
    const activity = require('../src/services/activity');
    const portal = require('../src/services/portal');

    const mine = { _id: '65f000000000000000000001', number: 'RV-ABC123', name: 'Wycena RevBot: Przeprowadzka', status: 'quoted', clientPhone: '+48 600 000 789', clientPhoneKey: '', createdAt: new Date(), price: 1500, priceMax: 2000 };
    const codes = new Map();
    const sent = [];
    const updates = [];
    const matches = (task, filter) => filter.$or.some(c => (c.clientPhoneKey && c.clientPhoneKey === task.clientPhoneKey) || (c.clientPhone instanceof RegExp && c.clientPhone.test(task.clientPhone)));

    models.Task.exists = async filter => (matches(mine, filter) ? { _id: mine._id } : null);
    models.Task.find = filter => chain(matches(mine, filter) ? [mine] : []);
    models.Task.findOne = filter => chain(filter._id === mine._id && matches(mine, filter) ? { ...mine, toObject: () => ({ ...mine }) } : null);
    models.Task.updateOne = async (q, u) => { updates.push(u); if (u.$set?.clientAcceptedAt) mine.clientAcceptedAt = u.$set.clientAcceptedAt; return {}; };
    models.Task.updateMany = async (q, u) => { updates.push(u); return {}; };
    models.TaskMedia.find = () => chain([]);
    PhoneCode.findOne = async ({ key }) => codes.get(key) || null;
    PhoneCode.updateOne = async ({ key }, u) => { const d = { ...(codes.get(key) || { key }), ...(u.$set || {}) }; for (const [k, v] of Object.entries(u.$inc || {})) d[k] = (d[k] || 0) + v; codes.set(key, d); return {}; };
    PhoneCode.findOneAndUpdate = async ({ key }, u) => { await PhoneCode.updateOne({ key }, u); return codes.get(key); };
    Account.updateOne = async () => ({});
    sms.provider = () => 'smsapi';
    sms.send = async (to, message) => { sent.push({ to, message }); return { ok: true }; };
    activity.recordActivity = async () => null;
    portal.notifyAdmins = async () => null;

    delete require.cache[require.resolve('../src/routes/portal-phone')];
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    app.use('/api', require('../src/routes/portal-phone'));
    app.use((err, req, res, next) => res.status(err.status || 500).json({ success: false, message: err.message })); // eslint-disable-line no-unused-vars
    return { app, mine, sent, codes, updates };
}

test('panel telefoniczny: kod SMS → zlecenia → akceptacja wyceny', async () => {
    const { app, sent, codes } = phoneApp();
    const agent = request.agent(app);
    assert.equal((await agent.get('/api/konto/telefon/zlecenia')).status, 401);
    const r1 = await agent.post('/api/konto/telefon/kod').send({ phone: '600 000 789' });
    assert.equal(r1.status, 200);
    assert.equal(r1.body.sms, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, '48600000789');
    const code = sent[0].message.match(/\d{6}/)[0];
    assert.ok(codes.get('600000789').codeHash && !JSON.stringify(codes.get('600000789')).includes(code), 'kod tylko jako hash');

    const bad = await agent.post('/api/konto/telefon/weryfikuj').send({ phone: '600000789', code: code === '111111' ? '222222' : '111111' });
    assert.equal(bad.status, 400);
    const ok = await agent.post('/api/konto/telefon/weryfikuj').send({ phone: '+48 600-000-789', code });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.phone, '+48 600 *** 789');

    const list = await agent.get('/api/konto/telefon/zlecenia');
    assert.equal(list.status, 200);
    assert.equal(list.body.orders.length, 1);
    assert.equal(list.body.orders[0].number, 'RV-ABC123');
    assert.equal(list.body.orders[0].canAccept, true);
    assert.equal(list.body.orders[0].checklist, undefined, 'bez danych wewnętrznych');

    const acc = await agent.post('/api/konto/telefon/zlecenia/65f000000000000000000001/akceptuj');
    assert.equal(acc.status, 200);
    assert.equal(acc.body.order.accepted, true);
    assert.equal((await agent.post('/api/konto/telefon/wyloguj')).status, 200);
    assert.equal((await agent.get('/api/konto/telefon/zlecenia')).status, 401);
});

test('panel telefoniczny: numer zlecenia zamiast SMS, cudzy numer nic nie widzi, blokada po błędach', async () => {
    const { app, sent } = phoneApp();
    const agent = request.agent(app);
    const other = await agent.post('/api/konto/telefon/kod').send({ phone: '511 222 333' });
    assert.equal(other.status, 200, 'ta sama odpowiedź dla numeru bez zleceń');
    assert.equal(sent.length, 0, 'bez zleceń nie wysyłamy SMS');
    assert.equal((await agent.post('/api/konto/telefon/weryfikuj').send({ phone: '511222333', number: 'RV-ABC123' })).status, 400);
    const ok = await agent.post('/api/konto/telefon/weryfikuj').send({ phone: '600000789', number: 'rv abc 123' });
    assert.equal(ok.status, 200);
    assert.equal((await agent.get('/api/konto/telefon/zlecenia/65f000000000000000000099')).status, 404);

    const attacker = request.agent(app);
    for (let i = 0; i < 8; i++) await attacker.post('/api/konto/telefon/weryfikuj').send({ phone: '600000789', number: 'RV-ZLY' + i });
    const locked = await attacker.post('/api/konto/telefon/weryfikuj').send({ phone: '600000789', number: 'RV-ABC123' });
    assert.equal(locked.status, 429);
});

/* ------------------------------------------------------------------ */
/* Formularz wyceny: szczegóły dla ekipy                                */
/* ------------------------------------------------------------------ */

test('formularz: szczegóły i dojazd dopisane NA KOŃCU pól (indeksy dla cennika bez zmian)', () => {
    const move = catalog.BY_ID.move;
    assert.deepEqual(move.fields.slice(0, 6).map(f => f.id), ['scope', 'floorFrom', 'floorTo', 'lift', 'assembly', 'extras']);
    assert.ok(move.fields.some(f => f.id === 'heavy' && f.sec === 'details'));
    assert.ok(move.fields.some(f => f.id === 'a_parking' && f.sec === 'access'));
    assert.ok(!catalog.BY_ID.people.fields.some(f => f.sec === 'access'));
    for (const s of catalog.SERVICES) {
        const ids = s.fields.map(f => f.id);
        assert.equal(new Set(ids).size, ids.length, 'duplikat pola w ' + s.id);
    }
});

test('formularz: pole tekstowe czyszczone, odpowiedzi trafiają do zlecenia i checklisty ekipy', () => {
    const q = validateAiQuote({
        requestId: 'abcdefabcdef123456', consent: true,
        services: [{ id: 'move', answers: { scope: 3, floorFrom: 4, lift: 0, heavy: [5, 99], disconnect: 2, a_parking: 3, a_notes: ' <b>Brama</b>\n od podwórza ' } }],
        location: { address: 'Słupsk, Długa 1', destination: 'Gdynia' }, contact: { name: 'Jan', phone: '600 000 789' }
    });
    assert.deepEqual(q.services[0].values.heavy, [5]);
    assert.equal(q.services[0].values.a_notes, 'b Brama /b od podwórza');
    const details = detailsMap(q);
    assert.equal(details['Duże i ciężkie rzeczy'], 'Pianino');
    assert.equal(details['Gdzie stanie auto?'], 'Ponad 100 m / zakaz wjazdu');
    const prep = crewPrep(q);
    const texts = prep.checklist.map(c => c.text).join('\n');
    assert.match(texts, /pianin/i);
    assert.match(texts, /bez windy/i);
    assert.match(texts, /wózek transportowy/i);
    assert.match(texts, /Uwagi klienta/);
    assert.ok(prep.checklist.every(c => ['before', 'task'].includes(c.phase) && c.text.length <= 200));
    assert.ok(prep.crew >= 4);
});

test('checklista: ryzyka wycinki i rozbiórki', () => {
    const trees = crewPrep({ services: [{ id: 'trees', name: 'Wycinka', values: { hazards: [0, 1], permit: 2, stumpsAfter: 1 } }] }).checklist.map(c => c.text).join('\n');
    assert.match(trees, /LINIA ENERGETYCZNA/);
    assert.match(trees, /sekcyjna/);
    assert.match(trees, /Frezarka/);
    const demo = crewPrep({ services: [{ id: 'demo', name: 'Rozbiórka', values: { roof: 3 } }] }).checklist.map(c => c.text).join('\n');
    assert.match(demo, /AZBEST/);
});
