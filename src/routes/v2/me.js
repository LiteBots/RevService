'use strict';

/** RevMi 2.0.0 — moje konto: hasło, odblokowanie PIN-em, urządzenia (sesje), dostęp pracowników. */
const express = require('express');
const bcrypt = require('bcryptjs');
const { timingSafeEqual } = require('crypto');
const { rateLimit } = require('express-rate-limit');
const config = require('../../config');
const { Employee } = require('../../models');
const { LoginSession } = require('../../models-v2');
const V = require('../../../lib/v2');
const roles = require('../../../lib/v11-input');
const { requireOwnerAdmin, validateId } = require('../../middleware/auth');
const { asyncRoute, httpError, userKeyOf } = require('../../utils');
const { recordActivity } = require('../../services/activity');
const sessions = require('../../services/v2-sessions');
const { getV2 } = require('../../services/v2-config');

const router = express.Router();

const unlockLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, message: 'Za dużo prób. Zaloguj się ponownie.' } });

const sameSecret = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const selfEmployeeId = user => user.employeeId || user.ownerEmployeeId || null;

/** Kim jestem + ustawienia potrzebne aplikacji przed załadowaniem danych. */
router.get('/v2/me', asyncRoute(async (req, res) => {
    const u = req.user;
    const id = selfEmployeeId(u);
    const e = id ? await Employee.findById(id).select('+passwordHash name email phone color role systemRole totpEnabled gpsConsent pinHash branch').select('+pinHash').lean() : null;
    const cfg = await getV2().catch(() => ({}));
    res.json({
        name: u.name,
        role: u.role,
        roleLabel: roles.ROLE_LABELS[u.role] || u.role,
        perms: roles.permsOf(u.role),
        employeeId: u.employeeId || null,
        selfId: id ? String(id) : null,
        userKey: userKeyOf(u),
        branch: u.branch || null,
        must2faSetup: Boolean(req.session?.user?.must2faSetup),
        email: e?.email || '',
        phone: e?.phone || '',
        color: e?.color || '#03F0BA',
        hasPassword: Boolean(e?.passwordHash),
        hasPin: u.employeeId ? Boolean(e?.pinHash) : true,
        gpsConsent: Boolean(e?.gpsConsent),
        lockMinutes: cfg.lockMinutes ?? 15,
        gpsEnabled: cfg.gpsEnabled !== false,
        geofenceMeters: cfg.geofenceMeters || 150,
        modules: cfg.modules || {},
        demo: Boolean(u.demo)
    });
}));

/** Odblokowanie aplikacji PIN-em po bezczynności (sesja nadal ważna). */
router.post('/v2/unlock', unlockLimiter, asyncRoute(async (req, res) => {
    const pin = String(req.body?.pin || '');
    if (!/^\d{4,8}$/.test(pin)) throw httpError(400, 'PIN ma od 4 do 8 cyfr');
    let ok = false;
    if (req.user.employeeId) {
        const e = await Employee.findById(req.user.employeeId).select('+pinHash +pin').lean();
        ok = Boolean(e && ((e.pinHash && await bcrypt.compare(pin, e.pinHash)) || (!e.pinHash && e.pin && e.pin === pin)));
    } else {
        ok = sameSecret(pin, config.adminPin);
    }
    if (!ok) {
        req.session.unlockFails = (req.session.unlockFails || 0) + 1;
        if (req.session.unlockFails >= 5) return req.session.destroy(() => res.status(401).json({ success: false, loggedOut: true, message: 'Za dużo błędnych PIN-ów — zaloguj się ponownie.' }));
        throw httpError(401, 'Nieprawidłowy PIN');
    }
    req.session.unlockFails = 0;
    res.json({ success: true });
}));

/** Ustawienie / zmiana własnego hasła i danych logowania. */
router.post('/v2/me/password', asyncRoute(async (req, res) => {
    const id = selfEmployeeId(req.user);
    if (!id) throw httpError(400, 'To konto nie ma profilu pracownika');
    const e = await Employee.findById(id).select('+passwordHash email phone');
    if (!e) throw httpError(404, 'Nie znaleziono profilu');
    if (e.passwordHash && !(await bcrypt.compare(String(req.body?.current || ''), e.passwordHash))) throw httpError(400, 'Obecne hasło jest nieprawidłowe');
    let password;
    try { password = V.validatePassword(req.body?.password); } catch (error) { throw httpError(400, error.message); }
    if (req.body?.email !== undefined) {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw httpError(400, 'Nieprawidłowy e-mail');
        if (email && await Employee.exists({ _id: { $ne: e._id }, email, active: true })) throw httpError(409, 'Ten e-mail ma już inne konto');
        e.email = email;
    }
    if (!e.email && !V.phoneDigits(e.phone)) throw httpError(400, 'Podaj e-mail albo numer telefonu, którym będziesz się logować');
    e.passwordHash = await bcrypt.hash(password, 12);
    e.passwordSetAt = new Date();
    await e.save();
    await recordActivity('security', `Ustawiono hasło logowania: ${e.name}`, 'Employee', e._id, req.user.name);
    res.json({ success: true });
}));

/** Zgoda na GPS w czasie pracy (pracownik). */
router.post('/v2/me/gps-consent', asyncRoute(async (req, res) => {
    const id = selfEmployeeId(req.user);
    if (!id) throw httpError(400, 'Brak profilu pracownika');
    await Employee.updateOne({ _id: id }, { $set: { gpsConsent: req.body?.consent === true } });
    res.json({ success: true });
}));

/* ------------------------------------------------------------------ */
/* Urządzenia (sesje)                                                  */
/* ------------------------------------------------------------------ */

router.get('/v2/sessions', asyncRoute(async (req, res) => {
    const key = userKeyOf(req.user);
    const all = req.user.role === 'admin' && req.query.all === '1';
    const since = new Date(Date.now() - 31 * V.DAY);
    const list = await LoginSession.find({ ...(all ? {} : { userKey: key }), revokedAt: null, lastSeenAt: { $gte: since } }).sort({ lastSeenAt: -1 }).limit(100).lean();
    res.json({
        sessions: list.map(s => ({ _id: s._id, name: s.name, role: s.role, device: s.device, ip: s.ip, method: s.method, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.sid === req.sessionID, mine: s.userKey === key }))
    });
}));

router.delete('/v2/sessions/:id', validateId, asyncRoute(async (req, res) => {
    const s = await LoginSession.findById(req.params.id);
    if (!s || s.revokedAt) throw httpError(404, 'Nie znaleziono sesji');
    if (s.userKey !== userKeyOf(req.user) && req.user.role !== 'admin') throw httpError(403, 'Możesz wylogować tylko swoje urządzenia');
    await sessions.destroySid(req.sessionStore, s.sid);
    s.revokedAt = new Date();
    s.revokedBy = req.user.name;
    await s.save();
    await recordActivity('security', `Wylogowano zdalnie: ${s.name} (${s.device})`, null, null, req.user.name);
    res.json({ success: true, current: s.sid === req.sessionID });
}));

router.post('/v2/sessions/logout-others', asyncRoute(async (req, res) => {
    const key = userKeyOf(req.user);
    const others = await LoginSession.find({ userKey: key, revokedAt: null, sid: { $ne: req.sessionID } });
    for (const s of others) await sessions.destroySid(req.sessionStore, s.sid);
    await LoginSession.updateMany({ _id: { $in: others.map(s => s._id) } }, { $set: { revokedAt: new Date(), revokedBy: req.user.name } });
    res.json({ success: true, count: others.length });
}));

/* ------------------------------------------------------------------ */
/* Dostęp pracownika (administrator)                                   */
/* ------------------------------------------------------------------ */

router.get('/v2/employees/access', requireOwnerAdmin, asyncRoute(async (req, res) => {
    const people = await Employee.find({ active: true }).select('+passwordHash +pinHash name email phone systemRole totpEnabled passwordSetAt lockedUntil isOwner').sort({ name: 1 }).lean();
    const last = await LoginSession.aggregate([{ $group: { _id: '$userKey', at: { $max: '$lastSeenAt' } } }]);
    const lastBy = new Map(last.map(l => [l._id, l.at]));
    res.json({
        employees: people.map(p => ({
            _id: p._id, name: p.name, email: p.email, phone: p.phone, systemRole: p.systemRole, isOwner: Boolean(p.isOwner),
            hasPassword: Boolean(p.passwordHash), hasPin: Boolean(p.pinHash) || Boolean(p.isOwner), totpEnabled: Boolean(p.totpEnabled),
            passwordSetAt: p.passwordSetAt, locked: Boolean(p.lockedUntil && p.lockedUntil > new Date()),
            lastSeenAt: lastBy.get(p.isOwner ? 'admin' : String(p._id)) || null
        }))
    });
}));

router.put('/v2/employees/:id/access', requireOwnerAdmin, validateId, asyncRoute(async (req, res) => {
    const e = await Employee.findById(req.params.id).select('+passwordHash');
    if (!e) throw httpError(404, 'Nie znaleziono pracownika');
    const b = req.body || {};
    if (b.email !== undefined) {
        const email = String(b.email || '').trim().toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw httpError(400, 'Nieprawidłowy e-mail');
        if (email && await Employee.exists({ _id: { $ne: e._id }, email, active: true })) throw httpError(409, 'Ten e-mail ma już inne konto');
        e.email = email;
    }
    if (b.phone !== undefined) e.phone = String(b.phone || '').trim().slice(0, 40);
    if (b.password) {
        try { e.passwordHash = await bcrypt.hash(V.validatePassword(b.password), 12); } catch (error) { throw httpError(400, error.message); }
        e.passwordSetAt = new Date();
    }
    if (b.removePassword === true) { e.passwordHash = undefined; e.passwordSetAt = null; }
    if (b.unlock === true) { e.failedLogins = 0; e.lockedUntil = null; }
    if (b.pin) {
        if (!/^\d{4,8}$/.test(String(b.pin))) throw httpError(400, 'PIN ma od 4 do 8 cyfr');
        const others = await Employee.find({ _id: { $ne: e._id }, active: true }).select('+pinHash').lean();
        for (const o of others) if (o.pinHash && await bcrypt.compare(String(b.pin), o.pinHash)) throw httpError(409, 'Ten PIN ma już inna osoba — wybierz inny');
        if (sameSecret(String(b.pin), config.adminPin)) throw httpError(409, 'Ten PIN jest zajęty');
        e.pinHash = await bcrypt.hash(String(b.pin), 12);
        e.pin = undefined;
    }
    await e.save();
    await recordActivity('security', `Zmieniono dostęp: ${e.name}`, 'Employee', e._id, req.user.name);
    res.json({ success: true });
}));

module.exports = router;
