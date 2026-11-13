'use strict';

/**
 * RevSerwis 13 — publiczne API:
 *  - POST /api/quotes/v13              szczegółowy formularz wyceny (bez AI) → „Wyceny” w RevMi, odpowiedź do 24 h
 *  - GET  /api/realizacje              opublikowane realizacje (zdjęcia przed / po dodane w RevMi)
 *  - GET  /api/realizacje/:id/zdjecie/:photoId
 *  - Konto klienta numerem telefonu + hasłem: /api/konto/telefon/{konto,kod-konto,rejestracja,logowanie,reset,haslo}
 *    Po zalogowaniu działa ta sama sesja co w routes/portal-phone.js — klient widzi WSZYSTKIE zlecenia z RevMi
 *    zapisane na jego numer (także dodane ręcznie przez biuro, z telefonu i WhatsAppa).
 *
 * Montowane przed routes/portal.js (tam całe /konto wymaga konta e-mail).
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const config = require('../config');
const { Task } = require('../models');
const { PhoneCode } = require('../models-v12');
const { PhoneUser, Realization } = require('../models-v13');
const Q = require('../../lib/quote-v13');
const A = require('../../lib/phone-access');
const { preparePhotos } = require('../../lib/quote-input');
const phonePortal = require('./portal-phone');
const sms = require('../services/sms');
const notify = require('../services/notify');
const { flushDiscord } = require('../services/discord');
const { recordActivity } = require('../services/activity');
const { asyncRoute, httpError, isObjectId } = require('../utils');

const router = express.Router();

const limiter = (limit, minutes, message) => rateLimit({
    windowMs: minutes * 60 * 1000, limit, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { success: false, message: message || 'Za dużo prób. Spróbuj za kilka minut albo zadzwoń: 735 396 534.' }
});

/* ================================================================== */
/* Wycena                                                               */
/* ================================================================== */

router.post('/quotes/v13', limiter(8, 15, 'Za dużo zgłoszeń. Spróbuj za 15 minut albo zadzwoń: 735 396 534.'), express.json({ limit: '24mb' }), asyncRoute(async (req, res) => {
    const q = Q.validateQuoteV13(req.body);
    const hash = Q.fingerprint(q);
    let task = await Task.findOne({ quoteRequestId: q.requestId }).select('+quoteFingerprint');
    if (task) {
        if (task.quoteFingerprint && task.quoteFingerprint !== hash) throw httpError(409, 'To zgłoszenie zostało już zapisane z innymi danymi. Odśwież stronę, aby wysłać nowe.');
        return res.json({ success: true, number: task.number, dueAt: task.quoteDueAt });
    }

    const quotePhotos = await preparePhotos(q.photos.map(data => ({ data })));
    const f = q.form;
    const route = f.to ? { addressFrom: f.from.address, addressTo: f.to.address, address: '' } : { address: f.from.address, addressFrom: '', addressTo: '' };
    const details = Q.detailsMap(q);
    const crew = Q.suggestedCrew(f);
    const dueAt = new Date(Date.now() + Q.QUOTE_HOURS * 3_600_000);
    const clientName = q.contact.company ? `${q.contact.name} (${q.contact.company})` : q.contact.name;

    try {
        task = await Task.create({
            quoteRequestId: q.requestId,
            quoteFingerprint: hash,
            name: `Wycena: ${f.serviceName}${f.to ? ` — ${f.from.address.split(',').pop().trim()} → ${f.to.address.split(',').pop().trim()}` : ''}`.slice(0, 160),
            type: f.serviceName.slice(0, 80),
            division: '',
            quoteType: 'free',
            status: 'new',
            source: 'Formularz wyceny',
            price: 0,
            dateStart: new Date(),
            clientName: clientName.slice(0, 140),
            clientPhone: q.contact.phone,
            clientEmail: q.contact.email,
            ...route,
            clientPreferredDate: [f.schedule.date || 'Do ustalenia', f.schedule.time !== 'Obojętnie' ? f.schedule.time : '', f.schedule.flexible ? 'elastycznie' : ''].filter(Boolean).join(' · '),
            desc: Q.descriptionText(q),
            quoteDetails: details,
            quoteForm: { ...f, description: q.description, contact: { email: q.contact.email, company: q.contact.company, nip: q.contact.nip } },
            quoteDueAt: dueAt,
            people: crew,
            quotePhotos,
            quotePhotoCount: quotePhotos.length,
            discordPending: Boolean(config.discordWebhookUrl),
            discordNextAttempt: new Date()
        });
    } catch (error) {
        if (error.code !== 11000) throw error;
        task = await Task.findOne({ quoteRequestId: q.requestId });
        if (!task) throw error;
        return res.json({ success: true, number: task.number, dueAt: task.quoteDueAt });
    }

    const key = A.phoneKey(q.contact.phone);
    const hasAccount = key ? Boolean(await PhoneUser.exists({ key })) : false;
    res.status(201).json({ success: true, number: task.number, dueAt, hasAccount });

    void recordActivity('quote_received', `Nowe zgłoszenie do wyceny ${task.number}: ${f.serviceName} (${task.clientName}) — odpowiedź do ${dueAt.toLocaleString('pl-PL', { timeZone: config.timeZone })}`, 'Task', task._id, 'Formularz wyceny');
    void notify.newQuote(task.toObject());
    void flushDiscord();
}));

/* ================================================================== */
/* Realizacje                                                           */
/* ================================================================== */

const realizationView = r => ({
    id: String(r._id),
    title: r.title,
    service: r.service,
    city: r.city,
    when: r.when,
    summary: r.summary,
    crew: r.crew,
    featured: Boolean(r.featured),
    before: (r.photos || []).filter(p => p.kind === 'before').map(p => String(p._id)),
    after: (r.photos || []).filter(p => p.kind === 'after').map(p => String(p._id))
});

router.get('/realizacje', asyncRoute(async (req, res) => {
    const list = await Realization.find({ published: true }).sort({ featured: -1, sort: -1, createdAt: -1 }).limit(60).lean();
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ realizations: list.map(realizationView) });
}));

router.get('/realizacje/:id/zdjecie/:photoId', asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id) || !isObjectId(req.params.photoId)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const r = await Realization.findOne({ _id: req.params.id, published: true }).select('+photos.data').lean();
    const photo = r && (r.photos || []).find(p => String(p._id) === req.params.photoId);
    if (!photo || !photo.data) throw httpError(404, 'Nie znaleziono zdjęcia');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.type(photo.contentType || 'image/jpeg').send(photo.data.buffer ? Buffer.from(photo.data.buffer) : photo.data);
}));

/* ================================================================== */
/* Konto klienta: numer telefonu + hasło                                */
/* ================================================================== */

const REMEMBER_MS = 30 * 24 * 3_600_000;
const MAX_FAILED = 8;
const LOCK_MS = 15 * 60 * 1000;

function password(value) {
    if (typeof value !== 'string' || value.length < 8) throw httpError(400, 'Hasło musi mieć co najmniej 8 znaków.');
    if (value.length > 200) throw httpError(400, 'Hasło jest za długie.');
    if (!/[A-Za-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(value) || !/\d/.test(value)) throw httpError(400, 'Hasło musi zawierać literę i cyfrę.');
    return value;
}

async function checkCode(key, code) {
    const c = A.validateCode(code);
    const doc = await PhoneCode.findOne({ key });
    if (doc && doc.lockedUntil && doc.lockedUntil > new Date()) throw httpError(429, 'Za dużo błędnych prób. Spróbuj za 30 minut.');
    if (!doc || !doc.codeHash || !doc.expiresAt || doc.expiresAt < new Date()) throw httpError(400, 'Kod wygasł albo nie został wysłany. Zamów nowy kod.');
    if (doc.codeHash !== A.hashCode(key, c)) {
        const after = await PhoneCode.findOneAndUpdate({ key }, { $inc: { attempts: 1 }, $set: { touchedAt: new Date() } }, { new: true });
        if ((after?.attempts || 0) >= A.MAX_ATTEMPTS) await PhoneCode.updateOne({ key }, { $set: { lockedUntil: new Date(Date.now() + A.LOCK_MS), codeHash: '', attempts: 0 } });
        throw httpError(400, 'Nieprawidłowy kod. Sprawdź SMS.');
    }
    await PhoneCode.updateOne({ key }, { $set: { codeHash: '', expiresAt: null, attempts: 0, touchedAt: new Date() } });
}

async function checkOrderNumber(key, number) {
    const wanted = A.normalizeNumber(number);
    const tasks = await Task.find(phonePortal.phoneFilter(key)).select('number').limit(500).lean();
    if (!tasks.some(t => String(t.number || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === wanted)) {
        throw httpError(400, 'Nie znaleźliśmy zlecenia o tym numerze dla podanego telefonu. Numer jest w SMS-ie i na ekranie po wysłaniu wyceny.');
    }
}

router.get('/konto/telefon/konto', asyncRoute(async (req, res) => {
    const key = phonePortal.sessionKey(req);
    const user = key ? await PhoneUser.findOne({ key }).lean() : null;
    res.json({
        active: Boolean(key),
        phone: key ? A.maskPhone(key) : '',
        account: user ? { name: user.name, email: user.email, since: user.createdAt } : null,
        sms: sms.provider() === 'smsapi'
    });
}));

/** Kod SMS do rejestracji albo resetu hasła (gdy jest bramka SMS). */
router.post('/konto/telefon/kod-konto', limiter(5, 15), asyncRoute(async (req, res) => {
    const key = A.validatePhone(req.body?.phone);
    const purpose = req.body?.purpose === 'reset' ? 'reset' : 'register';
    if (sms.provider() !== 'smsapi') {
        return res.json({ success: true, sms: false, message: purpose === 'reset' ? 'Zmianę hasła zrobimy przez telefon: 735 396 534.' : 'Potwierdź numer numerem zlecenia (z SMS-a lub ekranu po wysłaniu wyceny).' });
    }
    const exists = await PhoneUser.exists({ key });
    if (purpose === 'register' && exists) throw httpError(409, 'Konto z tym numerem już istnieje. Zaloguj się albo zresetuj hasło.');
    const generic = { success: true, sms: true, message: `Jeśli wszystko się zgadza, za chwilę wyślemy SMS z kodem na numer ${A.maskPhone(key)}.` };
    if (purpose === 'reset' && !exists) return res.json(generic);
    const doc = await PhoneCode.findOne({ key });
    if (doc && doc.lockedUntil && doc.lockedUntil > new Date()) throw httpError(429, 'Za dużo prób dla tego numeru. Spróbuj za 30 minut.');
    if (doc && doc.lastSentAt && Date.now() - doc.lastSentAt.getTime() < A.RESEND_MS) throw httpError(429, 'Kod został już wysłany. Nowy możesz zamówić za minutę.');
    const code = A.newCode();
    await PhoneCode.updateOne({ key }, {
        $set: { codeHash: A.hashCode(key, code), expiresAt: new Date(Date.now() + A.CODE_TTL_MS), attempts: 0, lastSentAt: new Date(), touchedAt: new Date() },
        $inc: { sends: 1 }
    }, { upsert: true });
    const sent = await sms.send(A.smsNumber(key), `RevSerwis: kod ${purpose === 'reset' ? 'do zmiany hasła' : 'do założenia konta'}: ${code}. Ważny 10 minut. Nie podawaj go nikomu.`);
    if (!sent.ok) throw httpError(502, 'Nie udało się wysłać SMS-a. Zadzwoń: 735 396 534.');
    res.json(generic);
}));

router.post('/konto/telefon/rejestracja', limiter(10, 15), asyncRoute(async (req, res) => {
    const key = A.validatePhone(req.body?.phone);
    const pass = password(req.body?.password);
    const name = String(req.body?.name || '').trim().slice(0, 140);
    if (name.length < 2) throw httpError(400, 'Podaj imię.');
    if (req.body?.consent !== true) throw httpError(400, 'Zaakceptuj politykę prywatności.');
    if (await PhoneUser.exists({ key })) throw httpError(409, 'Konto z tym numerem już istnieje. Zaloguj się.');

    let verifiedBy;
    if (req.body?.code) { await checkCode(key, req.body.code); verifiedBy = 'sms'; }
    else if (req.body?.number) { await checkOrderNumber(key, req.body.number); verifiedBy = 'order'; }
    else throw httpError(400, sms.provider() === 'smsapi' ? 'Wpisz kod z SMS-a.' : 'Wpisz numer zlecenia, żeby potwierdzić, że to Twój numer.');

    let user;
    try {
        user = await PhoneUser.create({ key, passwordHash: await bcrypt.hash(pass, 11), name, email: String(req.body?.email || '').trim().toLowerCase().slice(0, 160), verifiedBy, lastLoginAt: new Date() });
    } catch (error) {
        if (error.code === 11000) throw httpError(409, 'Konto z tym numerem już istnieje. Zaloguj się.');
        throw error;
    }
    await phonePortal.grant(req, key, REMEMBER_MS);
    void recordActivity('client_register', `Nowe konto klienta: ${name} (${A.maskPhone(key)})`, 'PhoneUser', user._id, 'Panel klienta');
    res.status(201).json({ success: true, phone: A.maskPhone(key), name });
}));

router.post('/konto/telefon/logowanie', limiter(20, 15), asyncRoute(async (req, res) => {
    const key = A.validatePhone(req.body?.phone);
    const pass = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = await PhoneUser.findOne({ key }).select('+passwordHash');
    if (user && user.lockedUntil && user.lockedUntil > new Date()) throw httpError(429, 'Za dużo nieudanych prób. Spróbuj za 15 minut albo zresetuj hasło.');
    const ok = user && user.status === 'active' && pass && await bcrypt.compare(pass, user.passwordHash);
    if (!ok) {
        if (user) {
            const failed = (user.failedLogins || 0) + 1;
            await PhoneUser.updateOne({ _id: user._id }, failed >= MAX_FAILED ? { $set: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } } : { $set: { failedLogins: failed } });
        }
        throw httpError(401, 'Nieprawidłowy numer telefonu lub hasło.');
    }
    await PhoneUser.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await phonePortal.grant(req, key, req.body?.remember === false ? A.SESSION_MS : REMEMBER_MS);
    res.json({ success: true, phone: A.maskPhone(key), name: user.name });
}));

router.post('/konto/telefon/reset', limiter(10, 15), asyncRoute(async (req, res) => {
    const key = A.validatePhone(req.body?.phone);
    const pass = password(req.body?.password);
    const user = await PhoneUser.findOne({ key });
    if (!user) throw httpError(400, 'Nieprawidłowy kod.');
    await checkCode(key, req.body?.code);
    await PhoneUser.updateOne({ _id: user._id }, { $set: { passwordHash: await bcrypt.hash(pass, 11), failedLogins: 0, lockedUntil: null } });
    await phonePortal.grant(req, key, REMEMBER_MS);
    res.json({ success: true, phone: A.maskPhone(key), name: user.name });
}));

router.post('/konto/telefon/haslo', phonePortal.requirePhone, asyncRoute(async (req, res) => {
    const user = await PhoneUser.findOne({ key: req.phoneKey }).select('+passwordHash');
    if (!user) throw httpError(404, 'Nie masz jeszcze konta z hasłem.');
    if (!await bcrypt.compare(String(req.body?.current || ''), user.passwordHash)) throw httpError(400, 'Obecne hasło jest nieprawidłowe.');
    await PhoneUser.updateOne({ _id: user._id }, { $set: { passwordHash: await bcrypt.hash(password(req.body?.password), 11) } });
    res.json({ success: true });
}));

router.post('/konto/telefon/profil', phonePortal.requirePhone, asyncRoute(async (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 140);
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 160);
    if (name.length < 2) throw httpError(400, 'Podaj imię.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Sprawdź adres e-mail.');
    const r = await PhoneUser.updateOne({ key: req.phoneKey }, { $set: { name, email } });
    if (!r.matchedCount) throw httpError(404, 'Nie masz jeszcze konta z hasłem.');
    res.json({ success: true });
}));

module.exports = router;
module.exports.realizationView = realizationView;

/* ================================================================== */
/* Czat w zleceniu — klient zalogowany numerem telefonu                 */
/* ================================================================== */
{
    const chat = require('../services/chat');
    const L = require('../../lib/v10-input');
    const chatLimiter = limiter(40, 10, 'Za dużo wiadomości — spróbuj za chwilę.');
    const own = async (req) => {
        if (!isObjectId(req.params.id)) throw httpError(400, 'Nieprawidłowy identyfikator');
        const task = await Task.findOne({ _id: req.params.id, ...phonePortal.phoneFilter(req.phoneKey) }).select('number name account workers status clientName');
        if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
        return task;
    };
    router.get('/konto/telefon/zlecenia/:id/wiadomosci', phonePortal.requirePhone, asyncRoute(async (req, res) => {
        const task = await own(req);
        res.json({ messages: await chat.list(task._id, 'client') });
    }));
    router.post('/konto/telefon/zlecenia/:id/wiadomosci', phonePortal.requirePhone, chatLimiter, express.json({ limit: '4mb' }), asyncRoute(async (req, res) => {
        const task = await own(req);
        if (task.status === 'cancelled') throw httpError(400, 'Zlecenie jest anulowane — zadzwoń: 735 396 534.');
        const data = L.validateChat(req.body);
        const user = await PhoneUser.findOne({ key: req.phoneKey }).select('name').lean();
        const message = await chat.post(task, { from: 'client', authorName: user?.name || task.clientName || 'Klient', authorKey: 'phone:' + req.phoneKey, ...data });
        res.status(201).json({ success: true, message });
    }));
    router.get('/konto/telefon/zlecenia/:id/wiadomosci/:msgId/zdjecie', phonePortal.requirePhone, asyncRoute(async (req, res) => {
        const task = await own(req);
        if (!isObjectId(req.params.msgId)) throw httpError(400, 'Nieprawidłowy identyfikator');
        const p = await chat.photo(task._id, req.params.msgId);
        if (!p) throw httpError(404, 'Nie znaleziono zdjęcia');
        res.setHeader('Cache-Control', 'private, max-age=86400');
        res.type(p.contentType).send(p.data);
    }));
}
