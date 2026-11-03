'use strict';

/**
 * 12.0: panel klienta po numerze telefonu — bez zakładania konta. Prefiks: /api/konto/telefon
 *
 * Logowanie:
 *   1) kod SMS (gdy skonfigurowana bramka SMSAPI_TOKEN) — POST /kod, potem POST /weryfikuj { phone, code }
 *   2) numer telefonu + numer zlecenia (zawsze dostępne, także bez bramki SMS) — POST /weryfikuj { phone, number }
 * Po weryfikacji sesja trzyma tylko klucz numeru (12 h). Klient widzi WYŁĄCZNIE zlecenia zgłoszone na ten numer.
 * Jeśli klient jest zalogowany kontem e-mail, potwierdzony numer zapisujemy w koncie — zlecenia z numeru pojawią się w panelu konta.
 *
 * Montowane PRZED routes/portal.js (tam całe /konto wymaga konta e-mail).
 */
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { Task, TaskMedia } = require('../models');
const { Account } = require('../models-v9');
const { PhoneCode } = require('../models-v12');
const A = require('../../lib/phone-access');
const P = require('../../lib/portal-input');
const portal = require('../services/portal');
const sms = require('../services/sms');
const { asyncRoute, httpError, isObjectId } = require('../utils');
const { recordActivity } = require('../services/activity');

const router = express.Router();

const limiter = (limit, minutes, message) => rateLimit({
    windowMs: minutes * 60 * 1000, limit, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { success: false, message: message || 'Za dużo prób. Spróbuj ponownie za kilka minut albo zadzwoń: 735 396 534.' }
});
const codeLimiter = limiter(5, 15);
const verifyLimiter = limiter(15, 15);

const PUBLIC_TASK_FIELDS = '-quotePhotos -quoteFingerprint -aiInput -costs -notes -checklist -reviewRequest -learnedAt -discordPending -discordNextAttempt';
const save = req => new Promise((resolve, reject) => req.session.save(err => (err ? reject(err) : resolve())));

/** Filtr zleceń dla numeru: szybki klucz + dopasowanie starszych zleceń (zapisanych przed 12.0) po dowolnym formacie numeru. */
function phoneFilter(key) {
    const rx = A.phoneRegex(key);
    return { $or: [{ clientPhoneKey: key }, ...(rx ? [{ clientPhone: rx }] : [])], portalKind: { $nin: ['hotel', 'partner', 'developer'] } };
}

/** Starsze zlecenia dostają klucz przy pierwszym wyszukaniu — kolejne zapytania idą po indeksie. */
function backfill(tasks, key) {
    const ids = tasks.filter(t => t.clientPhoneKey !== key).map(t => t._id);
    if (ids.length) Task.updateMany({ _id: { $in: ids } }, { $set: { clientPhoneKey: key } }).catch(() => {});
}

function sessionKey(req) {
    const a = req.session?.phoneAccess;
    if (!a || !a.key || Date.now() - a.at > A.SESSION_MS) return '';
    return a.key;
}

function requirePhone(req, res, next) {
    const key = sessionKey(req);
    if (!key) return res.status(401).json({ success: false, message: 'Potwierdź numer telefonu, aby zobaczyć zlecenia.' });
    req.phoneKey = key;
    next();
}

/** Nowa sesja po weryfikacji (ochrona przed przejęciem), z zachowaniem logowania do konta / RevMi. */
function grant(req, key) {
    return new Promise((resolve, reject) => {
        const keep = { user: req.session.user, account: req.session.account };
        req.session.regenerate(err => {
            if (err) return reject(err);
            if (keep.user) req.session.user = keep.user;
            if (keep.account) req.session.account = keep.account;
            req.session.phoneAccess = { key, at: Date.now() };
            req.session.save(e => (e ? reject(e) : resolve()));
        });
    });
}

async function lockState(key) {
    const doc = await PhoneCode.findOne({ key });
    if (doc && doc.lockedUntil && doc.lockedUntil > new Date()) throw httpError(429, 'Za dużo błędnych prób dla tego numeru. Spróbuj za 30 minut albo zadzwoń: 735 396 534.');
    return doc;
}

async function linkAccount(req, key) {
    const id = req.session?.account?.id;
    if (!id) return;
    await Account.updateOne({ _id: id }, { $set: { phoneKey: key, phoneVerifiedAt: new Date() } }).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Logowanie                                                            */
/* ------------------------------------------------------------------ */

router.get('/konto/telefon/me', asyncRoute(async (req, res) => {
    const key = sessionKey(req);
    res.json({ active: Boolean(key), phone: key ? A.maskPhone(key) : '', sms: sms.provider() === 'smsapi' });
}));

router.post('/konto/telefon/kod', codeLimiter, asyncRoute(async (req, res) => {
    const key = A.validatePhone(req.body?.phone);
    if (sms.provider() !== 'smsapi') return res.json({ success: true, sms: false, message: 'Potwierdź numer numerem zlecenia (z wyceny, SMS-a lub e-maila).' });
    const doc = await lockState(key);
    if (doc && doc.lastSentAt && Date.now() - doc.lastSentAt.getTime() < A.RESEND_MS) throw httpError(429, 'Kod został już wysłany. Nowy możesz zamówić za minutę.');
    const generic = { success: true, sms: true, message: `Jeśli mamy zlecenia na numer ${A.maskPhone(key)}, za chwilę dostaniesz SMS z kodem.` };
    // Nie zdradzamy, czy numer jest w bazie — ale SMS wysyłamy tylko, gdy są zlecenia (koszt i spam).
    const exists = await Task.exists(phoneFilter(key));
    if (!exists) return res.json(generic);
    const code = A.newCode();
    await PhoneCode.updateOne({ key }, {
        $set: { codeHash: A.hashCode(key, code), expiresAt: new Date(Date.now() + A.CODE_TTL_MS), attempts: 0, lastSentAt: new Date(), touchedAt: new Date() },
        $inc: { sends: 1 }
    }, { upsert: true });
    const sent = await sms.send(A.smsNumber(key), A.smsText(code));
    if (!sent.ok) throw httpError(502, 'Nie udało się wysłać SMS-a. Zaloguj się numerem zlecenia albo zadzwoń: 735 396 534.');
    res.json(generic);
}));

router.post('/konto/telefon/weryfikuj', verifyLimiter, asyncRoute(async (req, res) => {
    const key = A.validatePhone(req.body?.phone);
    const doc = await lockState(key);
    const fail = async (message, field) => {
        const inc = field === 'code' ? { attempts: 1 } : { failedNumbers: 1 };
        const after = await PhoneCode.findOneAndUpdate({ key }, { $inc: inc, $set: { touchedAt: new Date() } }, { upsert: true, new: true });
        if ((after.attempts || 0) >= A.MAX_ATTEMPTS || (after.failedNumbers || 0) >= A.MAX_ATTEMPTS + 3) {
            await PhoneCode.updateOne({ key }, { $set: { lockedUntil: new Date(Date.now() + A.LOCK_MS), codeHash: '', attempts: 0, failedNumbers: 0 } });
        }
        throw httpError(400, message);
    };

    if (req.body?.code !== undefined && req.body.code !== '') {
        const code = A.validateCode(req.body.code);
        if (!doc || !doc.codeHash || !doc.expiresAt || doc.expiresAt < new Date()) throw httpError(400, 'Kod wygasł albo nie został wysłany. Zamów nowy kod.');
        if (doc.codeHash !== A.hashCode(key, code)) await fail('Nieprawidłowy kod. Sprawdź SMS i spróbuj ponownie.', 'code');
        await PhoneCode.updateOne({ key }, { $set: { codeHash: '', expiresAt: null, attempts: 0, failedNumbers: 0, touchedAt: new Date() } });
    } else {
        const wanted = A.normalizeNumber(req.body?.number);
        const tasks = await Task.find(phoneFilter(key)).select('number').limit(500).lean();
        const ok = tasks.some(t => String(t.number || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === wanted);
        if (!ok) await fail('Nie znaleźliśmy zlecenia o tym numerze dla podanego telefonu.', 'number');
        await PhoneCode.updateOne({ key }, { $set: { failedNumbers: 0, touchedAt: new Date() } }, { upsert: true });
    }

    await grant(req, key);
    await linkAccount(req, key);
    void recordActivity('client_phone_login', `Panel klienta: logowanie numerem ${A.maskPhone(key)}`, 'PhoneCode', null, 'Klient');
    res.json({ success: true, phone: A.maskPhone(key), linkedAccount: Boolean(req.session.account) });
}));

router.post('/konto/telefon/wyloguj', asyncRoute(async (req, res) => {
    if (req.session) delete req.session.phoneAccess;
    if (req.session) await save(req);
    res.json({ success: true });
}));

/* ------------------------------------------------------------------ */
/* Zlecenia                                                             */
/* ------------------------------------------------------------------ */

async function ownTask(key, id) {
    if (!isObjectId(id)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const task = await Task.findOne({ _id: id, ...phoneFilter(key) }).select(PUBLIC_TASK_FIELDS);
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    return task;
}

router.get('/konto/telefon/zlecenia', requirePhone, asyncRoute(async (req, res) => {
    const tasks = await Task.find(phoneFilter(req.phoneKey)).select(PUBLIC_TASK_FIELDS).sort({ createdAt: -1 }).limit(200).lean();
    backfill(tasks, req.phoneKey);
    const orders = tasks.map(t => portal.clientTask(t));
    const active = orders.filter(o => !['completed', 'cancelled'].includes(o.status)).length;
    res.json({ phone: A.maskPhone(req.phoneKey), orders, active, hasAccount: Boolean(req.session.account) });
}));

router.get('/konto/telefon/zlecenia/:id', requirePhone, asyncRoute(async (req, res) => {
    const task = await ownTask(req.phoneKey, req.params.id);
    const media = await TaskMedia.find({ task: task._id, kind: { $in: ['before', 'after'] } }).select('kind createdAt').sort({ createdAt: 1 }).lean();
    res.json({ order: portal.clientTask(task.toObject(), { media }) });
}));

router.get('/konto/telefon/zlecenia/:id/media/:mediaId', requirePhone, asyncRoute(async (req, res) => {
    const task = await ownTask(req.phoneKey, req.params.id);
    if (!isObjectId(req.params.mediaId)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const media = await TaskMedia.findOne({ _id: req.params.mediaId, task: task._id, kind: { $in: ['before', 'after'] } }).select('+data contentType storageKey').lean();
    const data = media ? await require('../services/storage').readMedia(media) : null;
    if (!data) throw httpError(404, 'Nie znaleziono zdjęcia');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(media.contentType || 'image/jpeg').send(data);
}));

const who = task => `${task.clientName || 'Klient'} (tel.)`;

router.post('/konto/telefon/zlecenia/:id/akceptuj', requirePhone, asyncRoute(async (req, res) => {
    const task = await ownTask(req.phoneKey, req.params.id);
    if (task.status !== 'quoted') throw httpError(400, 'Tej wyceny nie można już zaakceptować.');
    if (!task.clientAcceptedAt) {
        await Task.updateOne({ _id: task._id }, {
            $set: { clientAcceptedAt: new Date() },
            $push: { notes: { text: 'Klient zaakceptował wycenę w panelu (logowanie numerem telefonu).', author: who(task), authorKey: 'client' } }
        });
        task.clientAcceptedAt = new Date();
        void portal.notifyAdmins({ type: 'portal', title: '✅ Klient zaakceptował wycenę', body: `${task.number} · ${task.name} · ${who(task)}`, url: `/revmi/#/zlecenia/${task._id}`, dedupeKey: `accept:${task._id}` });
        void recordActivity('client_accepted', `Klient zaakceptował wycenę ${task.number} (panel telefoniczny)`, 'Task', task._id, who(task));
    }
    res.json({ success: true, order: portal.clientTask(task.toObject()) });
}));

router.post('/konto/telefon/zlecenia/:id/anuluj', requirePhone, asyncRoute(async (req, res) => {
    const task = await ownTask(req.phoneKey, req.params.id);
    const reason = P.text(req.body?.reason, 500, 'Powód');
    if (['new', 'quoted'].includes(task.status)) {
        await Task.updateOne({ _id: task._id }, {
            $set: { status: 'cancelled', clientCancelReason: reason },
            $push: { notes: { text: 'Klient anulował zgłoszenie w panelu (numer telefonu).' + (reason ? ' Powód: ' + reason : ''), author: who(task), authorKey: 'client' } }
        });
        task.status = 'cancelled';
        void portal.notifyAdmins({ type: 'portal', title: '🚫 Klient anulował zgłoszenie', body: `${task.number} · ${task.name}${reason ? ' · ' + reason : ''}`, url: `/revmi/#/zlecenia/${task._id}` });
    } else if (task.status === 'planned') {
        if (!task.clientCancelRequestedAt) {
            await Task.updateOne({ _id: task._id }, {
                $set: { clientCancelRequestedAt: new Date(), clientCancelReason: reason },
                $push: { notes: { text: 'Klient prosi o anulowanie zaplanowanego zlecenia (panel telefoniczny).' + (reason ? ' Powód: ' + reason : ''), author: who(task), authorKey: 'client' } }
            });
            task.clientCancelRequestedAt = new Date();
            void portal.notifyAdmins({ type: 'portal', title: '⚠️ Prośba o anulowanie zlecenia', body: `${task.number} · ${task.name} · zadzwoń do klienta${reason ? ' · ' + reason : ''}`, url: `/revmi/#/zlecenia/${task._id}` });
        }
    } else {
        throw httpError(400, 'Zlecenia w realizacji lub zakończonego nie można anulować w panelu. Zadzwoń: 735 396 534.');
    }
    void recordActivity('client_cancel', `Klient (tel.): anulowanie ${task.number}`, 'Task', task._id, who(task));
    res.json({ success: true, order: portal.clientTask(task.toObject()) });
}));

router.post('/konto/telefon/zlecenia/:id/ocena', requirePhone, asyncRoute(async (req, res) => {
    const task = await ownTask(req.phoneKey, req.params.id);
    if (task.status !== 'completed') throw httpError(400, 'Ocenić można zakończone zlecenie.');
    const rating = P.num(req.body?.rating, 'Ocena', { min: 1, max: 5, required: true, integer: true });
    const feedback = P.text(req.body?.feedback, 1500, 'Komentarz');
    await Task.updateOne({ _id: task._id }, { $set: { clientRating: rating, clientFeedback: feedback } });
    task.clientRating = rating;
    task.clientFeedback = feedback;
    void portal.notifyAdmins({ type: 'portal', title: `${'★'.repeat(rating)} Ocena klienta`, body: `${task.number} · ${who(task)}${feedback ? ': ' + feedback.slice(0, 120) : ''}`, url: `/revmi/#/zlecenia/${task._id}` });
    const settings = await require('../services/settings').getSettings();
    res.json({ success: true, order: portal.clientTask(task.toObject()), googleReviewUrl: rating >= 4 ? settings.googleReviewUrl : null });
}));

module.exports = router;
module.exports.phoneFilter = phoneFilter;
