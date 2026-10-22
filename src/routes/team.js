'use strict';

/**
 * 8.0: Oddziały (osobna ekipa, bus i zlecenia) oraz Rozliczenia pracowników.
 */
const express = require('express');
const { Branch, Employee, Task, PayEntry, Expense, Fleet } = require('../models');
const { requireAdmin, validateId } = require('../middleware/auth');
const { asyncRoute, httpError, isObjectId, money } = require('../utils');
const { recordActivity } = require('../services/activity');
const { resetOwnerCache } = require('../services/scope');

const router = express.Router();
const text = (v, max) => String(v ?? '').trim().slice(0, max);

/*
|--------------------------------------------------------------------------
| Oddziały
|--------------------------------------------------------------------------
*/

async function branchPayload(body) {
    const data = {};
    if (body.name !== undefined) data.name = text(body.name, 80);
    for (const [k, max] of [['specialty', 200], ['city', 80], ['color', 20], ['vehicleText', 160], ['notes', 1000]]) if (body[k] !== undefined) data[k] = text(body[k], max);
    if (body.equipment !== undefined) {
        const list = Array.isArray(body.equipment) ? body.equipment : String(body.equipment).split('\n');
        data.equipment = list.map(x => text(x, 120)).filter(Boolean).slice(0, 40);
    }
    if (body.minPhotos !== undefined) data.minPhotos = Math.min(10, Math.max(0, Math.round(Number(body.minPhotos) || 0)));
    if (body.vehicles !== undefined) {
        const ids = (Array.isArray(body.vehicles) ? body.vehicles : [body.vehicles]).filter(isObjectId);
        data.vehicles = ids.length ? (await Fleet.find({ _id: { $in: ids } }).select('_id').lean()).map(v => v._id) : [];
    }
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.order !== undefined) data.order = Number(body.order) || 0;
    return data;
}

/** Ustawia skład oddziału: pracownicy z listy dostają branch, pozostali z tego oddziału — wypisani. */
async function setMembers(branchId, ids) {
    const list = (Array.isArray(ids) ? ids : []).filter(isObjectId);
    await Employee.updateMany({ branch: branchId, _id: { $nin: list } }, { $set: { branch: null } });
    if (list.length) await Employee.updateMany({ _id: { $in: list }, isOwner: { $ne: true } }, { $set: { branch: branchId } });
}

router.get('/branches', requireAdmin, asyncRoute(async (req, res) => {
    const branches = await Branch.find(req.query.all === '1' ? {} : { active: true }).sort({ order: 1, name: 1 }).lean();
    const ids = branches.map(b => b._id);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [members, active, month, costs] = await Promise.all([
        Employee.find({ active: true, branch: { $in: ids } }).select('name role branch color phone').lean(),
        Task.aggregate([{ $match: { branch: { $in: ids }, status: { $in: ['planned', 'progress'] } } }, { $group: { _id: '$branch', n: { $sum: 1 } } }]),
        Task.aggregate([
            { $match: { branch: { $in: ids }, status: 'completed', completedAt: { $gte: monthStart } } },
            { $group: { _id: '$branch', n: { $sum: 1 }, revenue: { $sum: { $ifNull: ['$finalPrice', '$price'] } } } }
        ]),
        Expense.aggregate([{ $match: { branch: { $in: ids }, date: { $gte: monthStart } } }, { $group: { _id: '$branch', total: { $sum: '$price' } } }])
    ]);
    const by = (list, id) => list.find(x => String(x._id) === String(id));
    res.json({
        branches: branches.map(b => ({
            ...b,
            members: members.filter(m => String(m.branch) === String(b._id)),
            stats: {
                active: by(active, b._id)?.n || 0,
                completedMonth: by(month, b._id)?.n || 0,
                revenueMonth: by(month, b._id)?.revenue || 0,
                costsMonth: by(costs, b._id)?.total || 0
            }
        }))
    });
}));

router.post('/branches', requireAdmin, asyncRoute(async (req, res) => {
    const data = await branchPayload(req.body || {});
    if (!data.name) throw httpError(400, 'Podaj nazwę oddziału');
    const branch = await Branch.create(data);
    if (req.body?.members) await setMembers(branch._id, req.body.members);
    await recordActivity('branch_created', `Dodano oddział ${branch.name}`, 'Branch', branch._id, req.user.name);
    res.status(201).json({ success: true, branch });
}));

router.put('/branches/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const branch = await Branch.findByIdAndUpdate(req.params.id, await branchPayload(req.body || {}), { new: true, runValidators: true });
    if (!branch) throw httpError(404, 'Nie znaleziono oddziału');
    if (req.body?.members !== undefined) await setMembers(branch._id, req.body.members);
    res.json({ success: true, branch });
}));

router.delete('/branches/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const branch = await Branch.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
    if (!branch) throw httpError(404, 'Nie znaleziono oddziału');
    const open = await Task.countDocuments({ branch: branch._id, status: { $in: ['planned', 'progress'] } });
    await Employee.updateMany({ branch: branch._id }, { $set: { branch: null } });
    await recordActivity('branch_closed', `Zamknięto oddział ${branch.name}${open ? ` (${open} otwartych zleceń zostało przy oddziale)` : ''}`, 'Branch', branch._id, req.user.name);
    res.json({ success: true, openTasks: open });
}));

/** Przypisanie zlecenia do oddziału (zawsze ręcznie, przez administratora). */
router.post('/tasks/:id/branch', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    const branchId = req.body?.branch || null;
    let branch = null;
    if (branchId) {
        branch = isObjectId(branchId) ? await Branch.findOne({ _id: branchId, active: true }).lean() : null;
        if (!branch) throw httpError(400, 'Nie znaleziono oddziału');
    }
    task.branch = branch ? branch._id : null;
    if (branch) {
        const have = new Set((task.checklist || []).map(i => String(i.text).toLowerCase()));
        for (const t of branch.equipment || []) if (!have.has(t.toLowerCase())) task.checklist.unshift({ text: t, phase: 'before' });
        if (!task.vehicle && branch.vehicles?.length) {
            const v = await Fleet.findById(branch.vehicles[0]).select('name plates').lean();
            if (v) { task.vehicle = v._id; task.car = `${v.name} (${v.plates})`; }
        }
    }
    await task.save();
    await recordActivity('task_branch', `${task.number} → ${branch ? 'oddział ' + branch.name : 'ekipa główna'}`, 'Task', task._id, req.user.name);
    res.json({ success: true, task });
}));

/*
|--------------------------------------------------------------------------
| Rozliczenia (wypłaty pracowników)
|--------------------------------------------------------------------------
*/

const KIND_LABEL = { pay: 'Wypłata', bonus: 'Premia', advance: 'Zaliczka', deduction: 'Potrącenie' };

router.get('/payroll', requireAdmin, asyncRoute(async (req, res) => {
    const [employees, open, history, branches] = await Promise.all([
        Employee.find({ active: true }).select('name role branch color isOwner payRate payRateUnit phone').sort({ isOwner: -1, name: 1 }).lean(),
        PayEntry.find({ settled: false }).sort({ date: -1 }).lean(),
        PayEntry.find({ settled: true }).sort({ settledAt: -1 }).limit(Number(req.query.limit) || 200).lean(),
        Branch.find({}).select('name color').lean()
    ]);
    const rows = employees.map(e => {
        const mine = open.filter(p => String(p.employee) === String(e._id));
        return { ...e, open: mine, balance: Math.round(mine.reduce((s, p) => s + p.amount, 0) * 100) / 100 };
    });
    res.json({ employees: rows, history, branches, total: Math.round(rows.reduce((s, r) => s + r.balance, 0) * 100) / 100 });
}));

router.post('/payroll', requireAdmin, asyncRoute(async (req, res) => {
    const b = req.body || {};
    const employee = isObjectId(b.employee) ? await Employee.findById(b.employee).select('name branch').lean() : null;
    if (!employee) throw httpError(400, 'Wybierz pracownika');
    const kind = KIND_LABEL[b.kind] ? b.kind : 'pay';
    let amount = Number(String(b.amount ?? '').replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) throw httpError(400, 'Podaj kwotę większą od 0');
    if (kind === 'deduction') amount = -amount;
    let task = null;
    if (b.task && isObjectId(b.task)) task = await Task.findById(b.task).select('number name').lean();
    const entry = await PayEntry.create({
        employee: employee._id, employeeName: employee.name, branch: employee.branch || null, kind, amount: Math.round(amount * 100) / 100,
        description: text(b.description, 300) || (task ? `${task.number}: ${task.name}` : KIND_LABEL[kind]),
        task: task?._id || null, taskNumber: task?.number || '', date: b.date ? new Date(b.date) : new Date(), createdBy: req.user.name
    });
    res.status(201).json({ success: true, entry });
}));

/** Szybkie naliczenie za zlecenie: kwota dla każdej osoby z ekipy (np. stawka za zlecenie). */
router.post('/payroll/from-task', requireAdmin, asyncRoute(async (req, res) => {
    const task = isObjectId(req.body?.task) ? await Task.findById(req.body.task).select('number name workers hoursWorked').lean() : null;
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    const amounts = req.body?.amounts && typeof req.body.amounts === 'object' ? req.body.amounts : {};
    const created = [];
    for (const w of task.workers || []) {
        if (!w.employee) continue;
        const amount = Number(String(amounts[String(w.employee)] ?? '').replace(',', '.'));
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const e = await Employee.findById(w.employee).select('name branch').lean();
        if (!e) continue;
        created.push(await PayEntry.create({
            employee: e._id, employeeName: e.name, branch: e.branch || null, kind: 'pay', amount: Math.round(amount * 100) / 100,
            description: `${task.number}: ${task.name}`.slice(0, 300), task: task._id, taskNumber: task.number, createdBy: req.user.name
        }));
    }
    res.status(201).json({ success: true, created: created.length });
}));

router.delete('/payroll/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const entry = await PayEntry.findOne({ _id: req.params.id, settled: false });
    if (!entry) throw httpError(404, 'Nie znaleziono pozycji (rozliczonych nie można usuwać)');
    await entry.deleteOne();
    res.json({ success: true });
}));

/**
 * „Rozliczono” — zamyka wszystkie nierozliczone pozycje pracownika i zapisuje wypłatę jako koszt firmy
 * (Expense „Wynagrodzenia”), więc statystyki, zysk i podatek od razu się aktualizują.
 */
router.post('/payroll/settle/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const employee = await Employee.findById(req.params.id).select('name branch').lean();
    if (!employee) throw httpError(404, 'Nie znaleziono pracownika');
    const entries = await PayEntry.find({ employee: employee._id, settled: false }).lean();
    if (!entries.length) throw httpError(400, 'Brak pozycji do rozliczenia');
    const total = Math.round(entries.reduce((s, p) => s + p.amount, 0) * 100) / 100;
    const settlement = 'RZ-' + Date.now().toString(36).toUpperCase();
    const now = new Date();
    let expense = null;
    if (total > 0) {
        expense = await Expense.create({
            price: total, category: 'Wynagrodzenia', desc: `Rozliczenie ${employee.name} (${entries.length} poz.) ${settlement}`,
            date: now, branch: employee.branch || null, source: 'payroll', receiptNumber: settlement
        });
    }
    await PayEntry.updateMany({ _id: { $in: entries.map(e => e._id) } }, { $set: { settled: true, settledAt: now, settledBy: req.user.name, settlement } });
    await recordActivity('payroll_settled', `Rozliczono ${employee.name}: ${money(total)}`, 'Employee', employee._id, req.user.name);
    res.json({ success: true, total, settlement, expense });
}));

/*
|--------------------------------------------------------------------------
| Właściciel / administrator jako członek zespołu
|--------------------------------------------------------------------------
*/

router.get('/owner', requireAdmin, asyncRoute(async (req, res) => {
    res.json({ owner: await Employee.findOne({ isOwner: true }).lean() });
}));

router.put('/owner', requireAdmin, asyncRoute(async (req, res) => {
    const b = req.body || {};
    const update = {};
    for (const [k, max] of [['name', 140], ['role', 100], ['phone', 40], ['color', 20]]) if (b[k] !== undefined) update[k] = text(b[k], max);
    const owner = await Employee.findOneAndUpdate({ isOwner: true }, { $set: update }, { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true });
    if (!owner.systemRole || owner.systemRole !== 'admin') { owner.systemRole = 'admin'; await owner.save(); }
    resetOwnerCache();
    res.json({ success: true, owner });
}));

module.exports = router;
