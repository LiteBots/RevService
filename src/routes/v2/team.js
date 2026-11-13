'use strict';

/** RevMi 2.0.0 — ekipa: czas pracy z GPS (C2), zarobki (C3), dyspozycyjność i wymiana zmian (C4), ranking (C9). */
const express = require('express');
const { Employee, Task, PayEntry } = require('../../models');
const { TimeEntry, Availability, SwapRequest, FaultReport } = require('../../models-v2');
const V = require('../../../lib/v2');
const roles = require('../../../lib/v11-input');
const scope = require('../../services/scope');
const notify = require('../../services/notify');
const { validateId } = require('../../middleware/auth');
const { asyncRoute, httpError, isObjectId } = require('../../utils');
const { recordActivity } = require('../../services/activity');
const { getV2 } = require('../../services/v2-config');

const router = express.Router();

const me = req => scope.selfId(req.user);
const canManageTime = role => roles.can(role, 'dispatch') || roles.can(role, 'payroll');
const monthRange = q => V.periodRange('month', /^\d{4}-\d{2}$/.test(String(q || '')) ? new Date(q + '-15T12:00:00') : new Date());
const dayRe = /^\d{4}-\d{2}-\d{2}$/;

function requireSelf(req) {
    const id = me(req);
    if (!id) throw httpError(400, 'To konto nie ma profilu pracownika');
    return id;
}

function entryOut(e, now = new Date()) {
    if (!e) return null;
    const t = V.timeTotals(e.events, now);
    return { _id: e._id, day: e.day, employee: e.employee, employeeName: e.employeeName, events: e.events, minutes: t.minutes, breakMinutes: t.breakMinutes, state: t.state, startedAt: t.startedAt, approved: e.approved, correctedBy: e.correctedBy };
}

/* ------------------------------------------------------------------ */
/* Czas pracy                                                          */
/* ------------------------------------------------------------------ */

router.get('/v2/time/me', asyncRoute(async (req, res) => {
    const id = requireSelf(req);
    const now = new Date();
    const today = V.dayKey(now);
    const week = V.periodRange('week', now);
    const [open, entries, employee, tasks, cfg] = await Promise.all([
        TimeEntry.findOne({ employee: id, open: true }).lean(),
        TimeEntry.find({ employee: id, day: { $gte: V.dayKey(week.from), $lt: V.dayKey(week.to) } }).sort({ day: 1 }).lean(),
        Employee.findById(id).select('gpsConsent').lean(),
        Task.find({ status: { $in: ['planned', 'progress'] }, dateStart: { $gte: V.startOfDay(now), $lt: new Date(V.startOfDay(now).getTime() + V.DAY) }, 'workers.employee': id })
            .select('name dateStart address addressFrom addressTo geo status').sort({ dateStart: 1 }).lean(),
        getV2()
    ]);
    const current = open || entries.find(e => e.day === today) || null;
    res.json({
        today,
        entry: entryOut(current, now),
        week: entries.map(e => ({ day: e.day, minutes: V.timeTotals(e.events, now).minutes })),
        weekMinutes: entries.reduce((s, e) => s + V.timeTotals(e.events, now).minutes, 0),
        gpsConsent: Boolean(employee?.gpsConsent),
        gpsEnabled: cfg.gpsEnabled !== false,
        geofenceMeters: cfg.geofenceMeters || 150,
        tasks: tasks.map(t => ({ _id: t._id, name: t.name, dateStart: t.dateStart, status: t.status, place: t.address || [t.addressFrom, t.addressTo].filter(Boolean).join(' → '), geo: t.geo?.lat ? { lat: t.geo.lat, lon: t.geo.lon } : null }))
    });
}));

router.post('/v2/time/event', asyncRoute(async (req, res) => {
    const id = requireSelf(req);
    const b = req.body || {};
    const type = String(b.type || '');
    if (!['start', 'pause', 'resume', 'stop', 'arrive', 'leave'].includes(type)) throw httpError(400, 'Nieznana akcja');
    const now = new Date();
    const employee = await Employee.findById(id).select('name branch gpsConsent').lean();
    if (!employee) throw httpError(404, 'Nie znaleziono pracownika');
    let entry = await TimeEntry.findOne({ employee: id, open: true });
    if (!entry && type === 'start') {
        entry = await TimeEntry.findOne({ employee: id, day: V.dayKey(now) }) || new TimeEntry({ employee: id, employeeName: employee.name, branch: employee.branch || null, day: V.dayKey(now), events: [] });
    }
    if (!entry) throw httpError(400, 'Najpierw rozpocznij pracę');
    const state = V.timeTotals(entry.events, now).state;
    if (!V.canTimeEvent(state, type)) {
        if (b.auto) return res.json({ success: true, ignored: true, entry: entryOut(entry, now) });
        throw httpError(400, { off: 'Najpierw rozpocznij pracę', working: 'Praca już trwa', paused: 'Najpierw wznów pracę' }[state] || 'Niedozwolona akcja');
    }
    const lat = Number(b.lat);
    const lon = Number(b.lon);
    const hasPos = employee.gpsConsent && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    let task = null;
    if (isObjectId(b.task)) task = await Task.findById(b.task).select('name').lean();
    // Automatyczny przyjazd/wyjazd — raz na zlecenie na dzień
    if (b.auto && (type === 'arrive' || type === 'leave') && task && entry.events.some(e => e.type === type && String(e.task) === String(task._id))) {
        return res.json({ success: true, ignored: true, entry: entryOut(entry, now) });
    }
    entry.events.push({ type, at: now, lat: hasPos ? lat : null, lon: hasPos ? lon : null, accuracy: hasPos && Number.isFinite(Number(b.accuracy)) ? Math.round(Number(b.accuracy)) : null, task: task?._id || null, taskName: task?.name || '', auto: Boolean(b.auto), note: String(b.note || '').slice(0, 200) });
    const totals = V.timeTotals(entry.events, now);
    entry.minutes = totals.minutes;
    entry.breakMinutes = totals.breakMinutes;
    entry.open = totals.open;
    await entry.save();
    res.json({ success: true, entry: entryOut(entry, now) });
}));

/** Biuro: lista obecności (kto pracuje teraz, godziny z dni). */
router.get('/v2/time/admin', asyncRoute(async (req, res) => {
    if (!canManageTime(req.user.role)) throw httpError(403, 'Brak uprawnień');
    const from = dayRe.test(req.query.from || '') ? req.query.from : V.dayKey(V.periodRange('week').from);
    const to = dayRe.test(req.query.to || '') ? req.query.to : V.dayKey(V.periodRange('week').to);
    const filter = { day: { $gte: from, $lt: to } };
    if (isObjectId(req.query.employee)) filter.employee = req.query.employee;
    if (req.user.role === 'manager') filter.branch = req.user.branch || null;
    const now = new Date();
    const [entries, live, employees] = await Promise.all([
        TimeEntry.find(filter).sort({ day: -1, employeeName: 1 }).lean(),
        TimeEntry.find({ open: true }).lean(),
        Employee.find({ active: true, ...(req.user.role === 'manager' ? { branch: req.user.branch || null } : {}) }).select('name color').sort({ name: 1 }).lean()
    ]);
    const totals = {};
    for (const e of entries) {
        const m = V.timeTotals(e.events, now).minutes;
        totals[e.employee] = (totals[e.employee] || 0) + m;
    }
    res.json({
        from, to,
        entries: entries.map(e => entryOut(e, now)),
        live: live.map(e => ({ ...entryOut(e, now), lastEvent: e.events[e.events.length - 1] || null })),
        employees: employees.map(e => ({ ...e, minutes: totals[e._id] || 0 }))
    });
}));

/** Korekta wpisu przez biuro (np. ktoś zapomniał zakończyć pracę). */
router.put('/v2/time/admin/:id', validateId, asyncRoute(async (req, res) => {
    if (!canManageTime(req.user.role)) throw httpError(403, 'Brak uprawnień');
    const entry = await TimeEntry.findById(req.params.id);
    if (!entry) throw httpError(404, 'Nie znaleziono wpisu');
    const b = req.body || {};
    if (b.stopAt) {
        const at = new Date(b.stopAt);
        if (Number.isNaN(at.getTime())) throw httpError(400, 'Nieprawidłowa godzina');
        const state = V.timeTotals(entry.events, at).state;
        if (state !== 'off') entry.events.push({ type: 'stop', at, note: `korekta: ${req.user.name}` });
    }
    if (Array.isArray(b.events)) {
        entry.events = b.events.filter(e => ['start', 'pause', 'resume', 'stop', 'arrive', 'leave'].includes(e.type) && !Number.isNaN(new Date(e.at).getTime()))
            .map(e => ({ type: e.type, at: new Date(e.at), note: String(e.note || '').slice(0, 200), task: isObjectId(e.task) ? e.task : null, taskName: String(e.taskName || '').slice(0, 160) }));
    }
    if (b.approved !== undefined) entry.approved = b.approved === true;
    const totals = V.timeTotals(entry.events);
    entry.minutes = totals.minutes;
    entry.breakMinutes = totals.breakMinutes;
    entry.open = totals.open;
    entry.correctedBy = req.user.name;
    await entry.save();
    res.json({ success: true, entry: entryOut(entry) });
}));

router.get('/v2/time/export.csv', asyncRoute(async (req, res) => {
    if (!canManageTime(req.user.role)) throw httpError(403, 'Brak uprawnień');
    const r = monthRange(req.query.month);
    const entries = await TimeEntry.find({ day: { $gte: V.dayKey(r.from), $lt: V.dayKey(r.to) } }).sort({ employeeName: 1, day: 1 }).lean();
    const hhmm = d => (d ? new Date(d).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: process.env.TZ }) : '');
    const rows = [['Pracownik', 'Dzień', 'Start', 'Koniec', 'Godziny', 'Przerwy (min)', 'Zatwierdzone']];
    for (const e of entries) {
        const t = V.timeTotals(e.events);
        const stop = [...e.events].reverse().find(x => x.type === 'stop');
        rows.push([e.employeeName, e.day, hhmm(t.startedAt), hhmm(stop?.at), (t.minutes / 60).toFixed(2).replace('.', ','), t.breakMinutes, e.approved ? 'tak' : 'nie']);
    }
    const csv = '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="czas-pracy-${V.dayKey(r.from).slice(0, 7)}.csv"`);
    res.send(csv);
}));

/* ------------------------------------------------------------------ */
/* Zarobki                                                             */
/* ------------------------------------------------------------------ */

async function earningsFor(employeeId, month) {
    const r = monthRange(month);
    const [employee, payEntries, timeEntries, tasks] = await Promise.all([
        Employee.findById(employeeId).select('name payRate payRateUnit hourlyRate').lean(),
        PayEntry.find({ employee: employeeId, date: { $gte: r.from, $lt: r.to } }).sort({ date: -1 }).lean(),
        TimeEntry.find({ employee: employeeId, day: { $gte: V.dayKey(r.from), $lt: V.dayKey(r.to) } }).sort({ day: 1 }).lean(),
        Task.find({ 'workers.employee': employeeId, status: 'completed', completedAt: { $gte: r.from, $lt: r.to } }).select('number name completedAt hoursWorked clientRating').sort({ completedAt: -1 }).lean()
    ]);
    if (!employee) throw httpError(404, 'Nie znaleziono pracownika');
    // trwający dzień liczony na żywo (zapisane „minutes” aktualizują się dopiero przy kolejnym zdarzeniu)
    const live = timeEntries.map(e => ({ ...e, minutes: V.timeTotals(e.events).minutes }));
    const sum = V.earnings(employee, { payEntries, timeEntries: live, tasks: tasks.map(t => ({ ...t, status: 'completed' })) });
    const unsettled = await PayEntry.aggregate([{ $match: { employee: employee._id, settled: false } }, { $group: { _id: '$kind', v: { $sum: '$amount' } } }]);
    const u = Object.fromEntries(unsettled.map(x => [x._id, x.v]));
    return {
        month: V.dayKey(r.from).slice(0, 7),
        name: employee.name,
        summary: sum,
        toPay: V.round2((u.pay || 0) + (u.bonus || 0) - (u.advance || 0) - (u.deduction || 0)),
        entries: payEntries.map(p => ({ _id: p._id, kind: p.kind, amount: p.amount, description: p.description, taskNumber: p.taskNumber, date: p.date, settled: p.settled })),
        days: timeEntries.map(e => ({ day: e.day, minutes: V.timeTotals(e.events).minutes })),
        tasks: tasks.slice(0, 40)
    };
}

router.get('/v2/earnings/me', asyncRoute(async (req, res) => {
    res.json(await earningsFor(requireSelf(req), req.query.month));
}));

router.get('/v2/earnings/:id', validateId, asyncRoute(async (req, res) => {
    if (!roles.can(req.user.role, 'payroll') && String(req.params.id) !== String(me(req))) throw httpError(403, 'Brak uprawnień');
    res.json(await earningsFor(req.params.id, req.query.month));
}));

/* ------------------------------------------------------------------ */
/* Dyspozycyjność                                                      */
/* ------------------------------------------------------------------ */

router.get('/v2/availability', asyncRoute(async (req, res) => {
    const from = dayRe.test(req.query.from || '') ? req.query.from : V.dayKey(new Date());
    const to = dayRe.test(req.query.to || '') ? req.query.to : V.dayKey(new Date(Date.now() + 31 * V.DAY));
    const office = roles.can(req.user.role, 'dispatch');
    const filter = { day: { $gte: from, $lt: to } };
    if (!office) filter.employee = requireSelf(req);
    const list = await Availability.find(filter).lean();
    res.json({ from, to, availability: list });
}));

router.put('/v2/availability', asyncRoute(async (req, res) => {
    const office = roles.can(req.user.role, 'dispatch');
    const employee = office && isObjectId(req.body?.employee) ? req.body.employee : requireSelf(req);
    const days = Array.isArray(req.body?.days) ? req.body.days : [req.body];
    for (const d of days.slice(0, 62)) {
        if (!dayRe.test(d?.day || '')) continue;
        if (d.status === 'clear') { await Availability.deleteOne({ employee, day: d.day }); continue; }
        const status = ['available', 'partial', 'unavailable'].includes(d.status) ? d.status : 'available';
        await Availability.updateOne({ employee, day: d.day }, { $set: { status, note: String(d.note || '').slice(0, 160) } }, { upsert: true });
    }
    res.json({ success: true });
}));

/* ------------------------------------------------------------------ */
/* Wymiana zmian                                                       */
/* ------------------------------------------------------------------ */

router.get('/v2/swaps', asyncRoute(async (req, res) => {
    const office = roles.can(req.user.role, 'dispatch');
    const self = me(req);
    const filter = office ? { $or: [{ status: 'pending' }, { updatedAt: { $gte: new Date(Date.now() - 14 * V.DAY) } }] } : { $or: [{ from: self }, { to: self }] };
    const swaps = await SwapRequest.find(filter).sort({ status: 1, createdAt: -1 }).limit(100).lean();
    res.json({ swaps, office, self });
}));

router.post('/v2/swaps', asyncRoute(async (req, res) => {
    const self = requireSelf(req);
    const b = req.body || {};
    if (!isObjectId(b.task)) throw httpError(400, 'Wybierz zlecenie');
    const task = await Task.findById(b.task).select('name dateStart workers status branch').lean();
    if (!task || !['planned', 'progress'].includes(task.status)) throw httpError(400, 'Tego zlecenia nie można zamienić');
    if (!(task.workers || []).some(w => String(w.employee) === String(self))) throw httpError(403, 'Nie jesteś przypisany do tego zlecenia');
    if (await SwapRequest.exists({ task: task._id, from: self, status: 'pending' })) throw httpError(409, 'Prośba o zamianę już czeka');
    const from = await Employee.findById(self).select('name').lean();
    const to = isObjectId(b.to) ? await Employee.findOne({ _id: b.to, active: true }).select('name').lean() : null;
    if (to && (task.workers || []).some(w => String(w.employee) === String(to._id))) throw httpError(400, `${to.name} już jest w tym zleceniu`);
    const swap = await SwapRequest.create({
        task: task._id, taskName: task.name, taskDate: task.dateStart, from: self, fromName: from?.name || req.user.name,
        to: to?._id || null, toName: to?.name || '', reason: String(b.reason || '').slice(0, 400), peerStatus: to ? 'pending' : 'none'
    });
    const when = new Date(task.dateStart).toLocaleString('pl-PL', { timeZone: process.env.TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    if (to) void notify.notify({ type: 'swap', title: '⇄ Prośba o zamianę zmiany', body: `${swap.fromName} prosi, żebyś przejął: ${task.name} (${when})`, url: '/revmi/#/wiecej/zamiany', recipients: [String(to._id)] });
    void notify.notify({ type: 'swap', title: '⇄ Wymiana zmiany do decyzji', body: `${swap.fromName}${to ? ' ⇄ ' + to.name : ''}: ${task.name} (${when})`, url: '/revmi/#/grafik', recipients: await notify.adminKeys(), exclude: [String(self)] });
    res.status(201).json({ success: true, swap });
}));

router.post('/v2/swaps/:id/peer', validateId, asyncRoute(async (req, res) => {
    const swap = await SwapRequest.findById(req.params.id);
    if (!swap || swap.status !== 'pending') throw httpError(404, 'Prośba nie jest aktywna');
    if (String(swap.to) !== String(me(req))) throw httpError(403, 'To nie jest prośba do Ciebie');
    swap.peerStatus = req.body?.accept === true ? 'accepted' : 'declined';
    await swap.save();
    void notify.notify({ type: 'swap', title: swap.peerStatus === 'accepted' ? '⇄ Zgoda na zamianę' : '⇄ Odmowa zamiany', body: `${swap.toName}: ${swap.taskName}`, url: '/revmi/#/wiecej/zamiany', recipients: [String(swap.from)] });
    res.json({ success: true, swap });
}));

router.post('/v2/swaps/:id/decide', validateId, asyncRoute(async (req, res) => {
    if (!roles.can(req.user.role, 'dispatch')) throw httpError(403, 'Brak uprawnień');
    const swap = await SwapRequest.findById(req.params.id);
    if (!swap || swap.status !== 'pending') throw httpError(404, 'Prośba nie jest aktywna');
    const approve = req.body?.approve === true;
    let toId = swap.to;
    if (approve) {
        if (isObjectId(req.body?.to)) toId = req.body.to;
        if (!toId) throw httpError(400, 'Wybierz, kto przejmie zlecenie');
        const [task, to] = await Promise.all([Task.findById(swap.task), Employee.findById(toId).select('name role').lean()]);
        if (!task) throw httpError(404, 'Zlecenie nie istnieje');
        if (!to) throw httpError(404, 'Nie znaleziono pracownika');
        const workers = (task.workers || []).filter(w => String(w.employee) !== String(swap.from));
        if (!workers.some(w => String(w.employee) === String(to._id))) workers.push({ employee: to._id, name: to.name, role: to.role || 'Pomocnik' });
        task.workers = workers;
        await task.save();
        swap.to = to._id;
        swap.toName = to.name;
        await recordActivity('task_updated', `${task.number}: zamiana ${swap.fromName} → ${to.name}`, 'Task', task._id, req.user.name);
        void notify.assigned(task.toObject(), [String(to._id)], req.user.employeeId ? String(req.user.employeeId) : 'admin');
    }
    swap.status = approve ? 'approved' : 'rejected';
    swap.decidedBy = req.user.name;
    swap.decidedAt = new Date();
    await swap.save();
    void notify.notify({ type: 'swap', title: approve ? '✅ Zamiana zatwierdzona' : '❌ Zamiana odrzucona', body: `${swap.taskName}${approve ? ' → ' + swap.toName : ''}`, url: '/revmi/#/', recipients: [String(swap.from), ...(swap.to ? [String(swap.to)] : [])] });
    res.json({ success: true, swap });
}));

router.delete('/v2/swaps/:id', validateId, asyncRoute(async (req, res) => {
    const swap = await SwapRequest.findById(req.params.id);
    if (!swap || swap.status !== 'pending') throw httpError(404, 'Prośba nie jest aktywna');
    if (String(swap.from) !== String(me(req)) && !roles.can(req.user.role, 'dispatch')) throw httpError(403, 'Brak uprawnień');
    swap.status = 'cancelled';
    await swap.save();
    res.json({ success: true });
}));

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

router.get('/v2/ranking', asyncRoute(async (req, res) => {
    const r = monthRange(req.query.month);
    const cfg = await getV2();
    const [tasks, employees, entries, faults] = await Promise.all([
        Task.find({ status: 'completed', dateStart: { $gte: r.from, $lt: r.to } }).select('status dateStart startedAt workers clientRating complaint mediaCount costs.reportedAt').lean(),
        Employee.find({ active: true, isOwner: { $ne: true } }).select('name color').lean(),
        TimeEntry.find({ day: { $gte: V.dayKey(r.from), $lt: V.dayKey(r.to) }, 'events.type': 'arrive' }).select('events').lean(),
        FaultReport.find({ createdAt: { $gte: r.from, $lt: r.to } }).select('reportedByKey').lean()
    ]);
    const arrivals = new Map();
    for (const e of entries) for (const ev of e.events) {
        if (ev.type !== 'arrive' || !ev.task) continue;
        const k = String(ev.task);
        if (!arrivals.has(k) || ev.at < arrivals.get(k)) arrivals.set(k, ev.at);
    }
    const list = V.ranking(tasks, employees, cfg.rankingPoints, { arrivals, faults });
    const left = Math.max(0, Math.ceil((r.to - new Date()) / V.DAY));
    res.json({ month: V.dayKey(r.from).slice(0, 7), daysLeft: left, points: cfg.rankingPoints, bonus: cfg.rankingBonus || '', ranking: list, self: me(req) });
}));

module.exports = router;
