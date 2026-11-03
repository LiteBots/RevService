'use strict';

/**
 * RevMi 2.0.0 — trasy publiczne (przed requireAuth):
 * - logowanie e-mailem lub telefonem i hasłem (drugi krok 2FA obsługuje istniejące /api/login/2fa),
 * - potwierdzenie terminu przez klienta z linku w SMS.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const { Employee, Settings, Task } = require('../models');
const { SmsConfirm } = require('../models-v2');
const V = require('../../lib/v2');
const { asyncRoute, httpError } = require('../utils');
const sessions = require('../services/v2-sessions');

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Za dużo prób logowania. Spróbuj za kilka minut.' }
});

const saveSession = req => new Promise((resolve, reject) => req.session.save(err => (err ? reject(err) : resolve())));
const regenerate = req => new Promise((resolve, reject) => req.session.regenerate(err => (err ? reject(err) : resolve())));

// Stały „pusty” hash — porównanie trwa tyle samo, gdy konto nie istnieje (bez zgadywania loginów po czasie odpowiedzi).
const DUMMY_HASH = bcrypt.hashSync('revmi-brak-konta', 10);

async function findByLogin(login) {
    const people = await Employee.find({ active: true, $or: [{ email: { $ne: '' } }, { phone: { $ne: '' } }] })
        .select('+passwordHash name email phone systemRole branch isOwner failedLogins lockedUntil').limit(500);
    return people.find(e => (login.kind === 'email' ? e.email === login.value : V.phoneDigits(e.phone) === login.value)) || null;
}

router.post('/v2/login', loginLimiter, asyncRoute(async (req, res) => {
    let login;
    try { login = V.normalizeLogin(req.body?.login); } catch (error) { throw httpError(400, error.message); }
    const password = String(req.body?.password || '');
    if (!password) throw httpError(400, 'Podaj hasło');

    const employee = await findByLogin(login);
    if (employee?.lockedUntil && employee.lockedUntil > new Date()) {
        throw httpError(429, 'Konto chwilowo zablokowane po wielu błędnych próbach. Spróbuj za kilkanaście minut albo zaloguj się PIN-em.');
    }
    const ok = await bcrypt.compare(password, employee?.passwordHash || DUMMY_HASH);
    if (!employee || !employee.passwordHash || !ok) {
        if (employee) {
            const failed = (employee.failedLogins || 0) + 1;
            await Employee.updateOne({ _id: employee._id }, { $set: { failedLogins: failed, lockedUntil: failed >= 8 ? new Date(Date.now() + 15 * 60_000) : null } });
        }
        throw httpError(401, 'Nieprawidłowy login lub hasło');
    }
    if (employee.failedLogins || employee.lockedUntil) await Employee.updateOne({ _id: employee._id }, { $set: { failedLogins: 0, lockedUntil: null } });

    // Właściciel loguje się jako „admin” (ten sam klucz powiadomień co główny PIN).
    const user = employee.isOwner
        ? { role: 'admin', name: employee.name, ownerEmployeeId: String(employee._id) }
        : { role: employee.systemRole || 'worker', name: employee.name, employeeId: String(employee._id), branch: employee.branch ? String(employee.branch) : null };

    const totp = employee.isOwner
        ? (await Settings.findOne({ key: 'main' }).select('ownerTotpEnabled').lean())?.ownerTotpEnabled
        : (await Employee.findById(employee._id).select('totpEnabled').lean())?.totpEnabled;

    await regenerate(req);
    if (totp) {
        req.session.user = { ...user, pending2fa: true, tries2fa: 0, loginMethod: 'password' };
        await saveSession(req);
        return res.json({ success: true, need2fa: true, name: user.name });
    }
    await sessions.register(req, user, 'password');
    req.session.user = user;
    await saveSession(req);
    res.json({ success: true, role: user.role, name: user.name, employeeId: user.employeeId || null, ownerEmployeeId: user.ownerEmployeeId || null, branch: user.branch || null, must2faSetup: Boolean(user.must2faSetup) });
}));

/* ------------------------------------------------------------------ */
/* Potwierdzenie terminu z SMS (strona /potwierdz.html?t=…)            */
/* ------------------------------------------------------------------ */

const confirmLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false });

async function confirmDoc(token) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(token || ''))) throw httpError(404, 'Link jest nieprawidłowy lub wygasł');
    const doc = await SmsConfirm.findOne({ token });
    if (!doc) throw httpError(404, 'Link jest nieprawidłowy lub wygasł');
    const task = await Task.findById(doc.task).select('name dateStart address addressFrom addressTo status clientConfirmedAt workers onTheWayAt etaAt').lean();
    if (!task) throw httpError(404, 'Zlecenie nie istnieje');
    return { doc, task };
}

const publicTask = (task, doc) => ({
    name: task.name,
    dateStart: task.dateStart,
    address: task.address || [task.addressFrom, task.addressTo].filter(Boolean).join(' → '),
    status: task.status,
    confirmed: Boolean(task.clientConfirmedAt),
    crew: (task.workers || []).map(w => String(w.name || '').split(' ')[0]).filter(Boolean),
    etaAt: task.etaAt || null,
    kind: doc.kind,
    state: doc.status
});

router.get('/v2/public/confirm/:token', confirmLimiter, asyncRoute(async (req, res) => {
    const { doc, task } = await confirmDoc(req.params.token);
    res.json({ success: true, task: publicTask(task, doc) });
}));

router.post('/v2/public/confirm/:token', confirmLimiter, asyncRoute(async (req, res) => {
    const { doc, task } = await confirmDoc(req.params.token);
    if (['cancelled', 'completed'].includes(task.status)) throw httpError(400, 'To zlecenie jest już zamknięte');
    const action = req.body?.action === 'reschedule' ? 'reschedule' : 'confirm';
    const note = String(req.body?.note || '').trim().slice(0, 500);
    doc.status = action === 'confirm' ? 'confirmed' : 'reschedule';
    doc.confirmedAt = new Date();
    doc.clientNote = note;
    await doc.save();
    const set = action === 'confirm' ? { clientConfirmedAt: new Date() } : { clientRescheduleNote: note || 'Klient prosi o zmianę terminu' };
    await Task.updateOne({ _id: task._id }, { $set: set });
    const notify = require('../services/notify');
    void notify.notify({
        type: 'sms_confirm',
        title: action === 'confirm' ? '✅ Klient potwierdził termin' : '📅 Klient prosi o zmianę terminu',
        body: `${task.name} · ${new Date(task.dateStart).toLocaleString('pl-PL', { timeZone: process.env.TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${note ? ' · „' + note + '”' : ''}`,
        url: `/revmi/#/zlecenia/${task._id}`,
        task,
        recipients: await notify.adminKeys()
    });
    res.json({ success: true, state: doc.status });
}));

module.exports = router;
