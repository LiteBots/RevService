'use strict';

/**
 * RevSerwis 9.2 — API pod /api/v92:
 *  2FA, dziennik zmian, integracje (status, test R2/S3, migracja zdjęć), opinie Google,
 *  grafik ekip (dispatch), mapa dnia i trasa, należności z przypomnieniami, automatyzacje „jeśli → to”,
 *  asystent RevBot (pytania o dane, odpowiedź na czacie, szkic oferty), OCR paragonów,
 *  urlopy i dostępność, koszty floty (tankowania, naprawy, koszt/km, przypomnienia).
 *
 * Dostęp: trasy z requireAdmin przechodzą przez tabelę ról (lib/v11-input.js → ROUTE_PERMS).
 */
const express = require('express');
const { Task, Employee, Fleet, Expense, Settings, PriceItem, Branch } = require('../models');
const { AuditLog, Leave, FuelLog, Repair, Rule, LEAVE_KINDS, LEAVE_LABELS, REPAIR_KINDS, RULE_TRIGGERS, RULE_ACTIONS } = require('../models-v11');
const V = require('../../lib/v11-input');
const scope = require('../services/scope');
const storage = require('../services/storage');
const reviews = require('../services/reviews-live');
const geo = require('../services/geo');
const sms = require('../services/sms');
const mail = require('../services/mail');
const config = require('../config');
const { getSettings, resetSettingsCache } = require('../services/settings');
const { requireAdmin, requireOwnerAdmin, requirePerm, validateId } = require('../middleware/auth');
const { asyncRoute, httpError, isObjectId, userKeyOf, money } = require('../utils');
const { recordActivity } = require('../services/activity');

const router = express.Router();
const found = (doc, msg = 'Nie znaleziono') => { if (!doc) throw httpError(404, msg); return doc; };
const DAY = 86_400_000;

/* ================================================================== */
/* 2FA — każdy może włączyć dla swojego konta                          */
/* ================================================================== */

async function totpDoc(user) {
    if (user.employeeId) return { model: Employee, filter: { _id: user.employeeId }, prefix: 'totp' };
    return { model: Settings, filter: { key: 'main' }, prefix: 'ownerTotp' };
}
const field = (prefix, name) => (prefix === 'totp' ? 'totp' + name : 'ownerTotp' + name);

router.get('/v92/2fa', asyncRoute(async (req, res) => {
    const { model, filter, prefix } = await totpDoc(req.user);
    const doc = await model.findOne(filter).select(field(prefix, 'Enabled')).lean();
    const settings = await getSettings();
    res.json({ enabled: Boolean(doc?.[field(prefix, 'Enabled')]), required: Boolean(settings.require2faForAdmins) && req.user.role === 'admin' });
}));

router.post('/v92/2fa/setup', asyncRoute(async (req, res) => {
    const { model, filter, prefix } = await totpDoc(req.user);
    const secret = V.generateTotpSecret();
    await model.updateOne(filter, { $set: { [field(prefix, 'Pending')]: secret } });
    res.json({ secret, otpauth: V.otpauthUrl(secret, req.user.name || 'RevMi') });
}));

router.post('/v92/2fa/enable', asyncRoute(async (req, res) => {
    const { model, filter, prefix } = await totpDoc(req.user);
    const doc = await model.findOne(filter).select('+' + field(prefix, 'Pending')).lean();
    const pending = doc?.[field(prefix, 'Pending')];
    if (!pending) throw httpError(400, 'Najpierw zeskanuj nowy kod QR');
    if (!V.verifyTotp(pending, req.body?.code)) throw httpError(400, 'Nieprawidłowy kod — wpisz 6 cyfr z aplikacji');
    await model.updateOne(filter, { $set: { [field(prefix, 'Secret')]: pending, [field(prefix, 'Enabled')]: true }, $unset: { [field(prefix, 'Pending')]: 1 } });
    resetSettingsCache();
    if (req.session?.user) { delete req.session.user.must2faSetup; }
    await recordActivity('security', `Włączono logowanie dwuetapowe (2FA): ${req.user.name}`, null, null, req.user.name);
    res.json({ success: true });
}));

router.post('/v92/2fa/disable', asyncRoute(async (req, res) => {
    const { model, filter, prefix } = await totpDoc(req.user);
    const settings = await getSettings();
    if (!req.user.employeeId && settings.require2faForAdmins) throw httpError(400, 'Najpierw wyłącz „Wymagaj 2FA dla administratorów”.');
    const doc = await model.findOne(filter).select('+' + field(prefix, 'Secret')).lean();
    if (!V.verifyTotp(doc?.[field(prefix, 'Secret')], req.body?.code)) throw httpError(400, 'Nieprawidłowy kod');
    await model.updateOne(filter, { $set: { [field(prefix, 'Enabled')]: false }, $unset: { [field(prefix, 'Secret')]: 1 } });
    resetSettingsCache();
    await recordActivity('security', `Wyłączono 2FA: ${req.user.name}`, null, null, req.user.name);
    res.json({ success: true });
}));

/** Administrator może zresetować 2FA pracownikowi (zgubiony telefon). */
router.post('/v92/2fa/reset/:id', requireOwnerAdmin, validateId, asyncRoute(async (req, res) => {
    const e = found(await Employee.findByIdAndUpdate(req.params.id, { $set: { totpEnabled: false }, $unset: { totpSecret: 1, totpPending: 1 } }, { new: true }), 'Nie znaleziono pracownika');
    await recordActivity('security', `Zresetowano 2FA: ${e.name}`, 'Employee', e._id, req.user.name);
    res.json({ success: true });
}));

/* ================================================================== */
/* Role                                                                */
/* ================================================================== */

router.get('/v92/roles', (req, res) => {
    res.json({ roles: V.ROLES.map(r => ({ key: r, label: V.ROLE_LABELS[r], hint: V.ROLE_HINTS[r] })), me: { role: req.user.role, perms: V.permsOf(req.user.role) } });
});

/* ================================================================== */
/* Dziennik zmian                                                      */
/* ================================================================== */

router.get('/v92/audit', requireOwnerAdmin, asyncRoute(async (req, res) => {
    const q = {};
    if (req.query.actor) q.actorKey = String(req.query.actor).slice(0, 60);
    if (req.query.entity) q.entity = String(req.query.entity).slice(0, 40);
    if (req.query.entityId && isObjectId(req.query.entityId)) q.entityId = req.query.entityId;
    if (req.query.before) q.at = { $lt: new Date(req.query.before) };
    const items = await AuditLog.find(q).sort({ at: -1 }).limit(Math.min(Number(req.query.limit) || 100, 300)).lean();
    const actors = await AuditLog.aggregate([{ $group: { _id: '$actorKey', name: { $last: '$actor' }, n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 50 }]);
    res.json({ items, actors });
}));

/* ================================================================== */
/* Integracje — status, zdjęcia R2/S3, opinie Google                   */
/* ================================================================== */

let migration = { running: false, moved: 0, error: '', finishedAt: null };

router.get('/v92/integrations', requireOwnerAdmin, asyncRoute(async (req, res) => {
    const settings = await getSettings();
    const { TaskMedia } = require('../models');
    const [inDb, inBucket] = await Promise.all([
        TaskMedia.countDocuments({ $or: [{ storageKey: '' }, { storageKey: { $exists: false } }] }),
        TaskMedia.countDocuments({ storageKey: { $nin: ['', null] } })
    ]);
    res.json({
        mail: { ok: mail.isConfigured(), provider: mail.provider() },
        sms: { ok: sms.provider() !== 'manual', provider: sms.provider() },
        claude: { ok: Boolean(config.ai.apiKey), model: config.ai.model },
        storage: { ok: storage.configured(), inDb, inBucket, migration },
        google: { ok: reviews.configured(), placeId: settings.googlePlaceId || '', live: settings.reviewsLive || null },
        reviews: await reviews.current(),
        manual: { rating: settings.reviewsManualRating ?? null, count: settings.reviewsManualCount ?? null },
        security: { require2faForAdmins: Boolean(settings.require2faForAdmins) }
    });
}));

router.post('/v92/storage/test', requireOwnerAdmin, asyncRoute(async (req, res) => res.json(await storage.selfTest())));

router.post('/v92/storage/migrate', requireOwnerAdmin, asyncRoute(async (req, res) => {
    if (!storage.configured()) throw httpError(400, 'Najpierw ustaw zmienne S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID i S3_SECRET_ACCESS_KEY');
    if (migration.running) return res.json({ success: true, migration });
    migration = { running: true, moved: 0, error: '', finishedAt: null };
    const { TaskMedia } = require('../models');
    storage.migrate(TaskMedia, { log: n => { migration.moved = n; } })
        .then(n => { migration = { running: false, moved: n, error: '', finishedAt: new Date() }; })
        .catch(e => { migration = { running: false, moved: migration.moved, error: e.message, finishedAt: new Date() }; });
    res.json({ success: true, migration });
}));

router.post('/v92/reviews/refresh', requireOwnerAdmin, asyncRoute(async (req, res) => {
    const r = await reviews.refresh();
    res.json({ ...r, current: await reviews.current() });
}));

/* ================================================================== */
/* Grafik ekip (dispatch)                                              */
/* ================================================================== */

const dayStart = d => { const x = new Date(d + 'T00:00:00'); return Number.isNaN(x.getTime()) ? null : x; };

router.get('/v92/dispatch', requireAdmin, asyncRoute(async (req, res) => {
    const from = dayStart(req.query.from) || new Date(new Date().setHours(0, 0, 0, 0));
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 31);
    const to = new Date(from.getTime() + days * DAY);
    const branchFilter = req.user.role === 'manager' ? { branch: req.user.branch || null } : (req.query.branch ? { branch: req.query.branch === 'none' ? null : req.query.branch } : {});
    const [tasks, unscheduled, employees, fleet, leaves] = await Promise.all([
        Task.find({ status: { $in: ['planned', 'progress', 'quoted', 'completed'] }, dateStart: { $gte: from, $lt: to }, ...branchFilter })
            .select('number name status dateStart dateEnd workers vehicle car address addressFrom addressTo division branch clientName price finalPrice priority').sort({ dateStart: 1 }).lean(),
        Task.find({ status: { $in: ['new', 'quoted'] }, ...branchFilter }).select('number name status dateStart clientName address division price clientPreferredDate').sort({ createdAt: -1 }).limit(40).lean(),
        Employee.find({ active: true, ...(req.user.role === 'manager' ? { branch: req.user.branch || null } : {}) }).select('name role systemRole color branch status').sort({ name: 1 }).lean(),
        Fleet.find({ active: true }).select('name plates status').lean(),
        Leave.find({ status: { $ne: 'rejected' }, from: { $lt: to }, to: { $gte: from } }).lean()
    ]);
    res.json({ from, days, tasks, unscheduled, employees, fleet, leaves, conflicts: V.scheduleConflicts(tasks, leaves.filter(l => l.status === 'approved')) });
}));

/** Przeciągnięcie zlecenia: nowy dzień (zachowuje godzinę), opcjonalnie godzina, ekipa i pojazd. */
router.post('/v92/dispatch/move', requireAdmin, asyncRoute(async (req, res) => {
    const b = req.body || {};
    if (!isObjectId(b.taskId)) throw httpError(400, 'Brak zlecenia');
    const task = found(await Task.findById(b.taskId), 'Nie znaleziono zlecenia');
    if (!scope.canSeeTask(task, req.user)) throw httpError(403, 'To zlecenie należy do innego oddziału');
    const before = task.toObject();
    if (b.date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw httpError(400, 'Nieprawidłowa data');
        const old = new Date(task.dateStart);
        const [h, m] = b.time && /^\d{1,2}:\d{2}$/.test(b.time) ? b.time.split(':').map(Number) : [old.getHours(), old.getMinutes()];
        const start = new Date(`${b.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
        const dur = task.dateEnd ? new Date(task.dateEnd) - old : null;
        task.dateStart = start;
        if (dur && dur > 0) task.dateEnd = new Date(start.getTime() + dur);
        if (task.status === 'quoted' && b.plan === true) task.status = 'planned';
    }
    if (Array.isArray(b.employeeIds)) {
        const ids = b.employeeIds.filter(isObjectId).slice(0, 20);
        const people = await Employee.find({ _id: { $in: ids }, active: true }).select('name role').lean();
        const prev = new Map((task.workers || []).map(w => [String(w.employee), w.role]));
        task.workers = people.map(p => ({ employee: p._id, name: p.name, role: prev.get(String(p._id)) || p.role || 'Pomocnik' }));
    }
    if (b.vehicle !== undefined) {
        if (b.vehicle && !isObjectId(b.vehicle)) throw httpError(400, 'Nieprawidłowy pojazd');
        const v = b.vehicle ? await Fleet.findById(b.vehicle).select('name plates').lean() : null;
        task.vehicle = v ? v._id : null;
        task.car = v ? `${v.name} (${v.plates})` : '';
    }
    await task.save();
    await recordActivity('task_updated', `${task.number}: zmiana w grafiku (${new Date(task.dateStart).toLocaleString('pl-PL', { timeZone: config.timeZone })})`, 'Task', task._id, req.user.name);
    const newIds = (task.workers || []).map(w => String(w.employee)).filter(id => !(before.workers || []).some(o => String(o.employee) === id));
    if (newIds.length) void require('../services/notify').assigned(task.toObject(), newIds, userKeyOf(req.user));
    const window = [new Date(task.dateStart.getTime() - DAY), new Date(task.dateStart.getTime() + 2 * DAY)];
    const around = await Task.find({ status: { $in: ['planned', 'progress', 'quoted'] }, dateStart: { $gte: window[0], $lt: window[1] } }).select('number dateStart dateEnd workers vehicle status').lean();
    const leaves = await Leave.find({ status: 'approved', from: { $lt: window[1] }, to: { $gte: window[0] } }).lean();
    const conflicts = V.scheduleConflicts(around, leaves).filter(c => c.tasks.includes(String(task._id)));
    res.json({ success: true, task, conflicts });
}));

/* ================================================================== */
/* Mapa dnia i trasa                                                   */
/* ================================================================== */

const taskPlace = t => t.address || t.addressFrom || t.addressTo || '';

async function ensureGeo(tasks, max = 12) {
    let n = 0;
    for (const t of tasks) {
        const q = taskPlace(t);
        if (!q) continue;
        if (t.geo && Number.isFinite(t.geo.lat) && t.geo.q === q) continue;
        if (n++ >= max) break;
        const hit = await geo.geocode(q);
        if (hit) {
            t.geo = { lat: hit.lat, lon: hit.lon, q };
            await Task.updateOne({ _id: t._id }, { $set: { geo: t.geo } });
        }
    }
}

router.get('/v92/route', requireAdmin, asyncRoute(async (req, res) => {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(req.query.day || '') ? req.query.day : V.localParts().day;
    const from = dayStart(day);
    const filter = { status: { $in: ['planned', 'progress', 'completed'] }, dateStart: { $gte: from, $lt: new Date(from.getTime() + DAY) }, ...scope.taskFilterFor(req.user) };
    if (req.query.employee && isObjectId(req.query.employee)) filter['workers.employee'] = req.query.employee;
    if (req.query.vehicle && isObjectId(req.query.vehicle)) filter.vehicle = req.query.vehicle;
    if (req.query.branch && req.user.role !== 'manager') filter.branch = req.query.branch === 'none' ? null : req.query.branch;
    const tasks = await Task.find(filter).select('number name status dateStart dateEnd address addressFrom addressTo workers car vehicle clientName clientPhone geo crewLocation division').sort({ dateStart: 1 }).lean();
    await ensureGeo(tasks);
    const located = tasks.filter(t => t.geo && Number.isFinite(t.geo.lat));
    const settings = await getSettings();
    const base = { lat: Number(settings.baseLat) || geo.BASE.lat, lon: Number(settings.baseLon) || geo.BASE.lon, name: geo.BASE.name };
    const opt = V.optimizeRoute(base, located.map(t => t.geo), { stopMinutes: 0 });
    const asPlanned = V.routeLength(base, located.map(t => t.geo), located.map((_, i) => i));
    res.json({
        day, base,
        tasks: tasks.map(t => ({ ...t, navUrl: t.geo?.lat ? `https://www.google.com/maps/dir/?api=1&destination=${t.geo.lat},${t.geo.lon}` : (taskPlace(t) ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(taskPlace(t))}` : '') })),
        order: opt.order.map(i => String(located[i]._id)),
        km: opt.km, minutes: opt.minutes, plannedKm: Math.round(asPlanned * 10) / 10,
        missing: tasks.filter(t => !(t.geo && Number.isFinite(t.geo.lat))).map(t => String(t._id)),
        crews: tasks.filter(t => t.crewLocation?.at && Date.now() - new Date(t.crewLocation.at).getTime() < 30 * 60_000).map(t => ({ task: String(t._id), ...t.crewLocation }))
    });
}));

/** Trasa dla pracownika (jego zlecenia dziś) — też dla roli „pracownik”. */
router.get('/v92/my-route', asyncRoute(async (req, res) => {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(req.query.day || '') ? req.query.day : V.localParts().day;
    const from = dayStart(day);
    const me = scope.selfId(req.user);
    const filter = { status: { $in: ['planned', 'progress', 'completed'] }, dateStart: { $gte: from, $lt: new Date(from.getTime() + DAY) }, ...scope.taskFilterFor(req.user) };
    if (me && !scope.isOffice(req.user)) filter.$or = [{ 'workers.employee': me }, { workers: { $size: 0 } }];
    const tasks = await Task.find(filter).select('number name status dateStart address addressFrom addressTo geo clientName clientPhone').sort({ dateStart: 1 }).lean();
    await ensureGeo(tasks, 8);
    const located = tasks.filter(t => t.geo && Number.isFinite(t.geo.lat));
    const opt = V.optimizeRoute(geo.BASE, located.map(t => t.geo));
    const order = opt.order.map(i => located[i]);
    const next = order.find(t => t.status !== 'completed') || tasks.find(t => t.status !== 'completed') || null;
    res.json({
        day, km: opt.km, minutes: opt.minutes,
        tasks: (order.length ? order.concat(tasks.filter(t => !located.includes(t))) : tasks).map(t => ({ ...t, navUrl: t.geo?.lat ? `https://www.google.com/maps/dir/?api=1&destination=${t.geo.lat},${t.geo.lon}` : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(taskPlace(t))}` })),
        next: next ? String(next._id) : null
    });
}));

/* ================================================================== */
/* Należności                                                          */
/* ================================================================== */

router.get('/v92/receivables', requireAdmin, asyncRoute(async (req, res) => {
    const tasks = await Task.find({ status: 'completed', paymentStatus: { $ne: 'paid' } })
        .select('number name clientName clientPhone clientEmail finalPrice price paymentStatus cashCollected completedAt dateStart paymentReminders division account').sort({ completedAt: 1 }).limit(500).lean();
    const now = Date.now();
    const settings = await getSettings();
    const items = tasks.map(t => {
        const days = Math.floor((now - new Date(t.completedAt || t.dateStart).getTime()) / DAY);
        return { ...t, due: V.amountDue(t), days, bucket: V.agingBucket(days), nextAuto: V.reminderDue(t, { firstDays: settings.receivablesFirstDays, everyDays: settings.receivablesEveryDays, max: settings.receivablesMaxReminders }) };
    }).filter(t => t.due > 0);
    const buckets = {};
    for (const t of items) buckets[t.bucket] = (buckets[t.bucket] || 0) + t.due;
    res.json({
        items, buckets, total: Math.round(items.reduce((s, t) => s + t.due, 0) * 100) / 100,
        settings: { auto: Boolean(settings.receivablesAutoRemind), firstDays: settings.receivablesFirstDays, everyDays: settings.receivablesEveryDays, max: settings.receivablesMaxReminders }
    });
}));

const reminderText = (t, settings) => `Dzień dobry, przypominamy o płatności ${money(V.amountDue(t))} za zlecenie ${t.number} (${t.name}). Jeśli już zapłacono — dziękujemy i prosimy zignorować wiadomość. ${settings.companyName || 'RevSerwis'}, tel. ${settings.companyPhone || '735 396 534'}`;

/** Wysyła przypomnienie (SMS lub e-mail). Używane ręcznie i przez zadanie automatyczne. */
async function sendReminder(task, { channel = 'auto', auto = false, by = 'System' } = {}) {
    const settings = await getSettings();
    const text = reminderText(task, settings);
    const ch = channel === 'auto' ? (task.clientEmail && mail.isConfigured() ? 'email' : 'sms') : channel;
    let result = { ok: false, status: 'failed', link: '' };
    if (ch === 'email') {
        if (!task.clientEmail) throw httpError(400, 'Klient nie ma adresu e-mail');
        await mail.send({ to: task.clientEmail, subject: `Przypomnienie o płatności — ${task.number}`, text });
        result = { ok: true, status: 'sent' };
    } else {
        if (!task.clientPhone) throw httpError(400, 'Klient nie ma numeru telefonu');
        const r = await sms.send(task.clientPhone, text);
        result = { ok: r.ok, status: r.status, link: r.status === 'manual' ? `sms:${String(task.clientPhone).replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(text)}` : '' };
    }
    if (result.ok || result.status === 'manual') {
        await Task.updateOne({ _id: task._id }, { $push: { paymentReminders: { at: new Date(), channel: ch, auto, by } } });
    }
    return { ...result, channel: ch, text };
}

router.post('/v92/receivables/:id/remind', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const task = found(await Task.findById(req.params.id).lean(), 'Nie znaleziono zlecenia');
    const channel = ['sms', 'email', 'auto'].includes(req.body?.channel) ? req.body.channel : 'auto';
    const r = await sendReminder(task, { channel, auto: false, by: req.user.name });
    res.json({ success: true, ...r });
}));

router.post('/v92/receivables/:id/paid', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const task = found(await Task.findByIdAndUpdate(req.params.id, { $set: { paymentStatus: 'paid', paidAt: new Date(), ...(req.body?.method ? { paymentMethod: String(req.body.method).slice(0, 40) } : {}) } }, { new: true }), 'Nie znaleziono zlecenia');
    await recordActivity('payment', `${task.number}: oznaczono jako opłacone`, 'Task', task._id, req.user.name);
    res.json({ success: true });
}));

/* ================================================================== */
/* Automatyzacje „jeśli → to”                                          */
/* ================================================================== */

const TRIGGER_LABELS = {
    quote_stale: 'Wycena bez odpowiedzi klienta od X godzin',
    task_completed: 'Zlecenie zakończone X godzin temu',
    unpaid_after: 'Nieopłacone X godzin po zakończeniu',
    task_tomorrow: 'Zlecenie za mniej niż X godzin',
    new_request_unanswered: 'Nowe zgłoszenie bez wyceny od X godzin'
};
const ACTION_LABELS = {
    notify_admins: 'Powiadom biuro (push)', sms_client: 'SMS do klienta', email_client: 'E-mail do klienta',
    add_note: 'Dodaj notatkę do zlecenia', set_priority_high: 'Ustaw wysoki priorytet'
};

router.get('/v92/rules', requireAdmin, asyncRoute(async (req, res) => {
    res.json({ rules: await Rule.find().sort({ createdAt: 1 }).lean(), triggers: TRIGGER_LABELS, actions: ACTION_LABELS });
}));

function rulePayload(b) {
    const out = {
        name: String(b.name || '').trim().slice(0, 140),
        enabled: b.enabled !== false,
        trigger: b.trigger, action: b.action,
        hours: Math.max(0, Math.min(24 * 90, Number(b.hours) || 0)),
        division: String(b.division || '').slice(0, 40),
        message: String(b.message || '').trim().slice(0, 600)
    };
    if (!out.name) throw httpError(400, 'Podaj nazwę reguły');
    if (!RULE_TRIGGERS.includes(out.trigger)) throw httpError(400, 'Wybierz warunek');
    if (!RULE_ACTIONS.includes(out.action)) throw httpError(400, 'Wybierz akcję');
    if (['sms_client', 'email_client', 'add_note'].includes(out.action) && !out.message) throw httpError(400, 'Wpisz treść wiadomości / notatki');
    return out;
}

router.post('/v92/rules', requireAdmin, asyncRoute(async (req, res) => {
    const rule = await Rule.create({ ...rulePayload(req.body || {}), createdBy: req.user.name });
    res.status(201).json({ success: true, rule });
}));
router.put('/v92/rules/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const rule = found(await Rule.findByIdAndUpdate(req.params.id, rulePayload(req.body || {}), { new: true, runValidators: true }));
    res.json({ success: true, rule });
}));
router.delete('/v92/rules/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    found(await Rule.findByIdAndDelete(req.params.id));
    res.json({ success: true });
}));
router.post('/v92/rules/run', requireAdmin, asyncRoute(async (req, res) => {
    res.json({ success: true, ...(await require('../services/v11-jobs').runRules()) });
}));
router.post('/v92/morning/test', requireOwnerAdmin, asyncRoute(async (req, res) => {
    res.json({ success: true, ...(await require('../services/v11-jobs').morningSummary({ force: true, only: userKeyOf(req.user) })) });
}));

/* ================================================================== */
/* Asystent RevBot (biuro)                                             */
/* ================================================================== */

async function claude(opts) {
    if (!config.ai.apiKey) throw httpError(503, 'Asystent wymaga klucza Claude API (ANTHROPIC_API_KEY).');
    const { callClaude } = require('../services/ai-quote');
    try {
        return await callClaude(opts);
    } catch (error) {
        throw httpError(error.status === 503 || error.aiUnavailable ? 503 : 502, error.message);
    }
}

/** Zwięzły obraz firmy dla pytań o dane — tylko to, co rola może zobaczyć. */
async function businessSnapshot(user) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const finance = V.can(user.role, 'finance');
    const tf = scope.taskFilterFor(user);
    const [byStatus, upcoming, completedMonth, unpaid, byDivision, topClients] = await Promise.all([
        Task.aggregate([{ $match: tf }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
        Task.find({ ...tf, status: { $in: ['planned', 'progress'] }, dateStart: { $gte: new Date(now.getTime() - DAY), $lt: new Date(now.getTime() + 14 * DAY) } }).select('number name dateStart clientName address workers.name division price').sort({ dateStart: 1 }).limit(40).lean(),
        Task.find({ ...tf, status: 'completed', completedAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 2, 1) } }).select('number name completedAt finalPrice price division clientName hoursWorked costs').limit(300).lean(),
        Task.find({ ...tf, status: 'completed', paymentStatus: { $ne: 'paid' } }).select('number clientName finalPrice price paymentStatus cashCollected completedAt').limit(100).lean(),
        Task.aggregate([{ $match: { ...tf, status: 'completed', completedAt: { $gte: yearStart } } }, { $group: { _id: { d: '$division', m: { $month: '$completedAt' } }, n: { $sum: 1 }, v: { $sum: { $ifNull: ['$finalPrice', '$price'] } } } }]),
        Task.aggregate([{ $match: { ...tf, status: 'completed', completedAt: { $gte: yearStart } } }, { $group: { _id: '$clientName', n: { $sum: 1 }, v: { $sum: { $ifNull: ['$finalPrice', '$price'] } } } }, { $sort: { v: -1 } }, { $limit: 15 }])
    ]);
    let expenses = null;
    if (finance) {
        expenses = await Expense.aggregate([{ $match: { date: { $gte: new Date(now.getFullYear(), now.getMonth() - 2, 1) } } }, { $group: { _id: { c: '$category', m: { $month: '$date' } }, v: { $sum: '$price' } } }]);
    }
    const hideMoney = x => (finance ? x : undefined);
    return {
        today: now.toISOString(), timeZone: config.timeZone, role: V.ROLE_LABELS[user.role] || user.role,
        tasksByStatus: Object.fromEntries(byStatus.map(r => [r._id, r.n])),
        upcoming: upcoming.map(t => ({ nr: t.number, nazwa: t.name, kiedy: t.dateStart, klient: t.clientName, adres: t.address, ekipa: (t.workers || []).map(w => w.name), dzial: t.division, cena: hideMoney(t.price) })),
        completedLast3Months: completedMonth.map(t => ({ nr: t.number, nazwa: t.name, kiedy: t.completedAt, kwota: hideMoney(t.finalPrice ?? t.price), dzial: t.division, klient: t.clientName, godziny: t.hoursWorked })),
        unpaid: finance ? unpaid.map(t => ({ nr: t.number, klient: t.clientName, doZaplaty: V.amountDue(t), od: t.completedAt })) : `${unpaid.length} zleceń nieopłaconych`,
        revenueByDivisionMonth: finance ? byDivision : byDivision.map(r => ({ _id: r._id, n: r.n })),
        topClientsThisYear: finance ? topClients : topClients.map(c => ({ _id: c._id, n: c.n })),
        expensesByCategoryMonth: expenses || 'brak uprawnień do finansów',
        monthStart
    };
}

router.post('/v92/assistant/ask', requireAdmin, asyncRoute(async (req, res) => {
    const question = String(req.body?.question || '').trim().slice(0, 1500);
    if (!question) throw httpError(400, 'Zadaj pytanie');
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-6).map(h => `${h.role === 'assistant' ? 'Asystent' : 'Użytkownik'}: ${String(h.text || '').slice(0, 1500)}`).join('\n') : '';
    const data = await businessSnapshot(req.user);
    const r = await claude({
        system: 'Jesteś RevBot — asystentem biura firmy usługowej RevSerwis (przeprowadzki, opróżnianie mieszkań, wywóz, ogród, odśnieżanie; Słupsk i okolice). Odpowiadasz po polsku, krótko i konkretnie, na podstawie danych JSON od użytkownika. Liczysz dokładnie; jeśli danych brakuje, mówisz wprost czego brakuje. Kwoty w zł. Nie wymyślaj zleceń ani klientów. Formatuj: krótkie akapity lub lista, bez tabel Markdown szerszych niż 4 kolumny.',
        content: `DANE FIRMY (JSON):\n${JSON.stringify(data)}\n\n${history ? 'WCZEŚNIEJ:\n' + history + '\n\n' : ''}PYTANIE: ${question}`,
        maxTokens: 1500
    });
    res.json({ success: true, answer: r.text });
}));

router.post('/v92/assistant/reply', requireAdmin, asyncRoute(async (req, res) => {
    if (!isObjectId(req.body?.taskId)) throw httpError(400, 'Brak zlecenia');
    const task = found(await Task.findById(req.body.taskId).lean(), 'Nie znaleziono zlecenia');
    if (!scope.canSeeTask(task, req.user)) throw httpError(403, 'Brak dostępu');
    const msgs = await require('../services/chat').list(task._id, 'staff').catch(() => []);
    const settings = await getSettings();
    const r = await claude({
        system: `Piszesz odpowiedź biura ${settings.companyName || 'RevSerwis'} do klienta w czacie zlecenia. Po polsku, uprzejmie, krótko (2–5 zdań), konkretnie. Nie obiecuj terminów ani cen, których nie ma w danych — wtedy napisz, że sprawdzimy i oddzwonimy. Bez podpisu.`,
        content: `ZLECENIE: ${JSON.stringify({ nr: task.number, nazwa: task.name, status: task.status, termin: task.dateStart, adres: task.address || task.addressFrom, cena: task.finalPrice ?? task.price, opis: String(task.desc || '').slice(0, 1200) })}\n\nCZAT (od najstarszych):\n${msgs.slice(-12).map(m => `${m.from === 'client' ? 'Klient' : 'Biuro'}: ${m.text}`).join('\n')}\n\n${req.body?.hint ? 'WSKAZÓWKA OD BIURA: ' + String(req.body.hint).slice(0, 500) + '\n' : ''}Napisz odpowiedź biura na ostatnią wiadomość klienta.`,
        maxTokens: 600
    });
    res.json({ success: true, reply: r.text });
}));

const OFFER_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['title', 'items', 'notes'],
    properties: {
        title: { type: 'string' },
        notes: { type: 'string' },
        items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'qty', 'unit', 'price'], properties: { name: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string' }, price: { type: 'number' } } } }
    }
};

router.post('/v92/assistant/offer', requireAdmin, asyncRoute(async (req, res) => {
    const text = String(req.body?.text || '').trim().slice(0, 4000);
    if (text.length < 10) throw httpError(400, 'Opisz zakres prac (np. z rozmowy telefonicznej)');
    const prices = await PriceItem.find({ active: { $ne: false } }).select('name unit price category').limit(150).lean().catch(() => []);
    const r = await claude({
        system: 'Przygotowujesz szkic oferty dla firmy RevSerwis na podstawie opisu klienta. Używaj pozycji i cen z cennika, jeśli pasują (nie zmieniaj cen z cennika). Gdy pozycji nie ma — zaproponuj rozsądną cenę rynkową w zł netto dla regionu słupskiego. Ilości realistyczne. Notatki: założenia i czego nie obejmuje oferta, po polsku.',
        content: `CENNIK: ${JSON.stringify(prices.map(p => ({ n: p.name, j: p.unit, c: p.price, k: p.category })))}\n\nOPIS OD KLIENTA:\n${text}`,
        schema: OFFER_SCHEMA,
        maxTokens: 2000
    });
    res.json({ success: true, offer: r.json });
}));

/* ================================================================== */
/* OCR paragonów (zdjęcie → kwota, data, sprzedawca, kategoria)       */
/* ================================================================== */

const RECEIPT_SCHEMA = {
    type: 'object', additionalProperties: false,
    required: ['vendor', 'date', 'total', 'vat', 'category', 'liters', 'description', 'readable'],
    properties: {
        readable: { type: 'boolean' },
        vendor: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD albo pusty' },
        total: { type: 'number', description: 'Suma brutto w zł' },
        vat: { type: 'number' },
        category: { type: 'string', enum: ['Paliwo', 'Materiały', 'Utylizacja', 'Naprawy', 'Narzędzia', 'Jedzenie', 'Opłaty', 'Inne'] },
        liters: { type: 'number', description: 'Litry paliwa, 0 gdy to nie paliwo' },
        description: { type: 'string' }
    }
};

router.post('/v92/receipts/scan', express.json({ limit: '8mb' }), asyncRoute(async (req, res) => {
    const d = String(req.body?.photo || '');
    const m = d.match(/^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!m || d.length > 7_000_000) throw httpError(400, 'Dodaj zdjęcie paragonu (JPG/PNG)');
    const r = await claude({
        system: 'Odczytujesz polskie paragony i faktury. Zwróć dokładne wartości z dokumentu. Jeśli zdjęcie nie jest paragonem albo jest nieczytelne, ustaw readable=false i pozostałe pola puste/0.',
        content: [
            { type: 'image', source: { type: 'base64', media_type: m[1], data: m[3] } },
            { type: 'text', text: 'Odczytaj paragon: sprzedawca, data, suma brutto, VAT, kategoria kosztu, litry (dla paliwa) i krótki opis zakupów.' }
        ],
        schema: RECEIPT_SCHEMA,
        maxTokens: 800
    });
    const out = r.json || {};
    let expense = null;
    // Biuro może od razu zapisać koszt (opcjonalnie z pojazdem → wpis tankowania).
    if (req.body?.save === true && V.can(req.user.role, 'finance', 'POST') && out.readable && out.total > 0) {
        const vehicle = isObjectId(req.body.vehicle) ? req.body.vehicle : null;
        expense = await Expense.create({ price: out.total, category: out.category, desc: `${out.vendor} — ${out.description}`.slice(0, 1000), date: out.date ? new Date(out.date) : new Date(), vehicle });
        if (vehicle && out.category === 'Paliwo') await FuelLog.create({ vehicle, date: expense.date, liters: out.liters || 0, price: out.total, station: out.vendor, by: req.user.name, expense: expense._id });
    }
    res.json({ success: true, receipt: out, expense });
}));

/* ================================================================== */
/* Urlopy i dostępność                                                 */
/* ================================================================== */

router.get('/v92/leaves', asyncRoute(async (req, res) => {
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 31 * DAY);
    const to = req.query.to ? new Date(req.query.to) : new Date(Date.now() + 180 * DAY);
    const q = { to: { $gte: from }, from: { $lte: to } };
    const manage = V.can(req.user.role, 'leaves');
    if (!manage) q.employee = scope.selfId(req.user);
    else if (req.user.role === 'manager') q.branch = req.user.branch || null;
    const leaves = await Leave.find(q).sort({ from: 1 }).lean();
    res.json({ leaves, kinds: LEAVE_LABELS, manage, pending: manage ? leaves.filter(l => l.status === 'pending').length : 0 });
}));

router.post('/v92/leaves', asyncRoute(async (req, res) => {
    const b = req.body || {};
    const manage = V.can(req.user.role, 'leaves');
    const me = scope.selfId(req.user);
    const employeeId = manage && isObjectId(b.employee) ? b.employee : me;
    if (!employeeId) throw httpError(400, 'Wybierz pracownika');
    const e = found(await Employee.findById(employeeId).select('name branch').lean(), 'Nie znaleziono pracownika');
    if (req.user.role === 'manager' && String(e.branch || '') !== String(req.user.branch || '')) throw httpError(403, 'Pracownik z innego oddziału');
    const from = new Date(String(b.from || '') + 'T00:00:00');
    const to = new Date(String(b.to || b.from || '') + 'T00:00:00');
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) throw httpError(400, 'Nieprawidłowe daty');
    if (to - from > 120 * DAY) throw httpError(400, 'Maksymalnie 120 dni naraz');
    const kind = LEAVE_KINDS.includes(b.kind) ? b.kind : 'vacation';
    const approved = manage && b.status !== 'pending';
    const leave = await Leave.create({ employee: e._id, employeeName: e.name, branch: e.branch || null, kind, from, to, note: String(b.note || '').slice(0, 500), status: approved ? 'approved' : 'pending', decidedBy: approved ? req.user.name : '', decidedAt: approved ? new Date() : null, createdBy: req.user.name });
    const clashes = await Task.find({ status: { $in: ['planned', 'progress'] }, 'workers.employee': e._id, dateStart: { $gte: from, $lt: new Date(to.getTime() + DAY) } }).select('number name dateStart').lean();
    if (!approved) void require('../services/notify').notify({ type: 'leave', title: 'Wniosek urlopowy', body: `${e.name}: ${LEAVE_LABELS[kind]} ${b.from} – ${b.to || b.from}`, url: '/revmi/#/urlopy', recipients: await require('../services/notify').adminKeys() }).catch(() => null);
    res.status(201).json({ success: true, leave, clashes });
}));

router.patch('/v92/leaves/admin/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const status = ['approved', 'rejected', 'pending'].includes(req.body?.status) ? req.body.status : null;
    if (!status) throw httpError(400, 'Nieprawidłowy status');
    const leave = found(await Leave.findById(req.params.id));
    if (req.user.role === 'manager' && String(leave.branch || '') !== String(req.user.branch || '')) throw httpError(403, 'Pracownik z innego oddziału');
    leave.status = status;
    leave.decidedBy = req.user.name;
    leave.decidedAt = new Date();
    await leave.save();
    void require('../services/notify').notify({ type: 'leave', title: status === 'approved' ? 'Urlop zatwierdzony' : status === 'rejected' ? 'Urlop odrzucony' : 'Urlop do ponownej decyzji', body: `${LEAVE_LABELS[leave.kind]}: ${leave.from.toLocaleDateString('pl-PL')} – ${leave.to.toLocaleDateString('pl-PL')}`, url: '/revmi/#/urlopy', recipients: [String(leave.employee)] }).catch(() => null);
    res.json({ success: true, leave });
}));

router.delete('/v92/leaves/:id', validateId, asyncRoute(async (req, res) => {
    const leave = found(await Leave.findById(req.params.id));
    const own = String(leave.employee) === String(scope.selfId(req.user));
    if (!(V.can(req.user.role, 'leaves') || (own && leave.status === 'pending'))) throw httpError(403, 'Możesz wycofać tylko swój niezatwierdzony wniosek');
    await leave.deleteOne();
    res.json({ success: true });
}));

/* ================================================================== */
/* Flota: koszty, tankowania, naprawy, przypomnienia                   */
/* ================================================================== */

function fleetReminders(v, now = Date.now()) {
    const out = [];
    const check = (date, label, days = 30) => {
        if (!date) return;
        const left = Math.ceil((new Date(date).getTime() - now) / DAY);
        if (left <= days) out.push({ label, date, left, level: left < 0 ? 'danger' : left <= 7 ? 'warn' : 'info' });
    };
    check(v.insuranceUntil, 'OC / ubezpieczenie');
    check(v.inspectionUntil, 'Przegląd techniczny');
    check(v.nextServiceDate, 'Serwis');
    if (v.serviceMileage && v.mileage && v.serviceMileage - v.mileage <= 1500) out.push({ label: `Serwis za ${Math.max(0, v.serviceMileage - v.mileage)} km`, left: null, level: v.serviceMileage <= v.mileage ? 'danger' : 'warn' });
    // Opony: zimowe od listopada (do 1 XII), letnie od kwietnia — gdy sezon nie zgadza się z miesiącem.
    const m = new Date(now).getMonth();
    if (v.tyreSeason === 'summer' && (m >= 9 || m <= 1)) out.push({ label: 'Wymiana opon na zimowe', left: null, level: m === 10 || m === 11 ? 'warn' : 'info' });
    if (v.tyreSeason === 'winter' && m >= 3 && m <= 8) out.push({ label: 'Wymiana opon na letnie', left: null, level: m >= 4 ? 'warn' : 'info' });
    return out;
}

router.get('/v92/fleet/costs', requireAdmin, asyncRoute(async (req, res) => {
    const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 24);
    const since = new Date(Date.now() - months * 30 * DAY);
    const [fleet, fuel, repairs, taskCosts] = await Promise.all([
        Fleet.find({ active: true }).lean(),
        FuelLog.find({ date: { $gte: since } }).sort({ date: 1 }).lean(),
        Repair.find({ date: { $gte: since } }).sort({ date: -1 }).lean(),
        Expense.aggregate([{ $match: { date: { $gte: since }, vehicle: { $ne: null } } }, { $group: { _id: '$vehicle', v: { $sum: '$price' } } }])
    ]);
    const settings = await getSettings();
    const vehicles = fleet.map(v => {
        const f = fuel.filter(x => String(x.vehicle) === String(v._id));
        const r = repairs.filter(x => String(x.vehicle) === String(v._id));
        const fuelCost = f.reduce((s, x) => s + (x.price || 0), 0);
        const liters = f.reduce((s, x) => s + (x.liters || 0), 0);
        const repairCost = r.reduce((s, x) => s + (x.price || 0), 0);
        const miles = f.map(x => x.mileage).filter(Number.isFinite);
        const km = miles.length >= 2 ? Math.max(...miles) - Math.min(...miles) : 0;
        // Spalanie liczone między pełnymi tankowaniami (bez pierwszego).
        const fullAfterFirst = f.slice(1).reduce((s, x) => s + (x.liters || 0), 0);
        const per100 = km > 50 ? Math.round((fullAfterFirst / km) * 1000) / 10 : (v.fuelConsumption || null);
        const total = fuelCost + repairCost;
        return {
            _id: v._id, name: v.name, plates: v.plates, mileage: v.mileage, status: v.status,
            fuelCost: Math.round(fuelCost), liters: Math.round(liters), repairCost: Math.round(repairCost), km,
            costPerKm: km > 0 ? Math.round((total / km) * 100) / 100 : (per100 ? Math.round((per100 / 100) * (settings.fuelPrice || 6.5) * 100) / 100 : null),
            per100, otherCosts: Math.round(taskCosts.find(t => String(t._id) === String(v._id))?.v || 0),
            reminders: fleetReminders(v), insuranceUntil: v.insuranceUntil, inspectionUntil: v.inspectionUntil, nextServiceDate: v.nextServiceDate, tyreSeason: v.tyreSeason || '', tyreChangeDate: v.tyreChangeDate
        };
    });
    res.json({ months, vehicles, fuel: fuel.slice(-200).reverse(), repairs: repairs.slice(0, 200), kinds: REPAIR_KINDS, fuelPrice: settings.fuelPrice || 6.5 });
}));

async function addFuel(b, user, { asExpense = true } = {}) {
    if (!isObjectId(b.vehicle)) throw httpError(400, 'Wybierz pojazd');
    const v = found(await Fleet.findById(b.vehicle), 'Nie znaleziono pojazdu');
    const price = Number(String(b.price ?? '').replace(',', '.'));
    const liters = Number(String(b.liters ?? '').replace(',', '.'));
    const mileage = b.mileage === '' || b.mileage == null ? null : Number(b.mileage);
    if (!Number.isFinite(price) || price <= 0 || price > 20000) throw httpError(400, 'Podaj kwotę tankowania');
    if (!Number.isFinite(liters) || liters < 0 || liters > 1000) throw httpError(400, 'Nieprawidłowa liczba litrów');
    if (mileage !== null && (!Number.isFinite(mileage) || mileage < 0)) throw httpError(400, 'Nieprawidłowy przebieg');
    const date = b.date ? new Date(b.date) : new Date();
    const expense = asExpense ? await Expense.create({ price, category: 'Paliwo', desc: `Tankowanie ${v.name} (${v.plates}) ${liters} l`, date, vehicle: v._id }) : null;
    const log = await FuelLog.create({ vehicle: v._id, date, liters, price, mileage, full: b.full !== false, station: String(b.station || '').slice(0, 140), by: user.name, expense: expense?._id || null });
    if (mileage && mileage > (v.mileage || 0)) await Fleet.updateOne({ _id: v._id }, { $set: { mileage } });
    return log;
}

router.post('/v92/fuel', requireAdmin, asyncRoute(async (req, res) => res.status(201).json({ success: true, log: await addFuel(req.body || {}, req.user) })));
/** Tankowanie z telefonu ekipy (każdy zalogowany). */
router.post('/v92/crew/fuel', asyncRoute(async (req, res) => res.status(201).json({ success: true, log: await addFuel(req.body || {}, req.user) })));
router.delete('/v92/fuel/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const log = found(await FuelLog.findByIdAndDelete(req.params.id));
    if (log.expense) await Expense.deleteOne({ _id: log.expense });
    res.json({ success: true });
}));

router.post('/v92/repairs', requireAdmin, asyncRoute(async (req, res) => {
    const b = req.body || {};
    if (!isObjectId(b.vehicle)) throw httpError(400, 'Wybierz pojazd');
    const v = found(await Fleet.findById(b.vehicle), 'Nie znaleziono pojazdu');
    const kind = REPAIR_KINDS.includes(b.kind) ? b.kind : 'repair';
    const price = Math.max(0, Number(String(b.price ?? 0).replace(',', '.')) || 0);
    const date = b.date ? new Date(b.date) : new Date();
    const label = { service: 'Serwis', repair: 'Naprawa', tyres: 'Opony', inspection: 'Przegląd', insurance: 'Ubezpieczenie', other: 'Pojazd' }[kind];
    const expense = price > 0 ? await Expense.create({ price, category: kind === 'insurance' ? 'Ubezpieczenia' : 'Naprawy i serwis', desc: `${label} ${v.name} (${v.plates}): ${String(b.description || '').slice(0, 300)}`, date, vehicle: v._id }) : null;
    const repair = await Repair.create({ vehicle: v._id, date, kind, description: String(b.description || '').slice(0, 1000), workshop: String(b.workshop || '').slice(0, 140), price, mileage: Number(b.mileage) || null, by: req.user.name, expense: expense?._id || null });
    // Aktualizacja terminów pojazdu, jeśli podano
    const set = {};
    if (b.nextDate && kind === 'inspection') set.inspectionUntil = new Date(b.nextDate);
    if (b.nextDate && kind === 'insurance') set.insuranceUntil = new Date(b.nextDate);
    if (b.nextDate && kind === 'service') set.nextServiceDate = new Date(b.nextDate);
    if (kind === 'service' && Number(b.nextMileage)) set.serviceMileage = Number(b.nextMileage);
    if (kind === 'tyres') { set.tyreChangeDate = date; if (['summer', 'winter', 'allseason'].includes(b.tyreSeason)) set.tyreSeason = b.tyreSeason; }
    if (Number(b.mileage) > (v.mileage || 0)) set.mileage = Number(b.mileage);
    if (Object.keys(set).length) await Fleet.updateOne({ _id: v._id }, { $set: set });
    res.status(201).json({ success: true, repair });
}));
router.delete('/v92/repairs/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const r = found(await Repair.findByIdAndDelete(req.params.id));
    if (r.expense) await Expense.deleteOne({ _id: r.expense });
    res.json({ success: true });
}));
router.put('/v92/fleet/:id/tyres', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const season = ['summer', 'winter', 'allseason', ''].includes(req.body?.tyreSeason) ? req.body.tyreSeason : '';
    await Fleet.updateOne({ _id: req.params.id }, { $set: { tyreSeason: season } });
    res.json({ success: true });
}));

/* ================================================================== */
/* Czas pracy (stoper) — zestawienie                                   */
/* ================================================================== */

router.get('/v92/dispatch/hours', requireAdmin, asyncRoute(async (req, res) => {
    const from = dayStart(req.query.from) || new Date(Date.now() - 30 * DAY);
    const tasks = await Task.find({ ...scope.taskFilterFor(req.user), 'workLog.0': { $exists: true }, dateStart: { $gte: from } }).select('number name workers workLog hoursWorked status').lean();
    const per = {};
    for (const t of tasks) {
        const h = V.workedHours(t.workLog);
        for (const w of t.workers || []) {
            const k = w.name || '—';
            per[k] = per[k] || { name: k, hours: 0, tasks: 0 };
            per[k].hours += h;
            per[k].tasks += 1;
        }
    }
    res.json({ tasks: tasks.map(t => ({ _id: t._id, number: t.number, name: t.name, hours: V.workedHours(t.workLog), declared: t.hoursWorked, status: t.status })), people: Object.values(per).sort((a, b) => b.hours - a.hours) });
}));

module.exports = router;
module.exports._internal = { sendReminder, fleetReminders, businessSnapshot };
