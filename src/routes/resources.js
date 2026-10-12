'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { Client, Task, Expense, Income, Employee, Fleet, PushSubscription } = require('../models');
const { requireAdmin, validateId } = require('../middleware/auth');
const { asyncRoute, httpError, pick, startOfMonth, startOfNextMonth, isObjectId, money } = require('../utils');
const { recordActivity } = require('../services/activity');
const { publicEmployee } = require('./dashboard');

const router = express.Router();

const found = (doc, message) => {
    if (!doc) throw httpError(404, message);
    return doc;
};

/*
|--------------------------------------------------------------------------
| Klienci CRM
|--------------------------------------------------------------------------
*/

const CLIENT_FIELDS = ['name', 'company', 'type', 'phone', 'email', 'address', 'nip', 'source', 'notes', 'tags'];

router.get('/clients', requireAdmin, asyncRoute(async (req, res) => {
    const clients = await Client.find({ archived: req.query.archived === 'true' }).sort({ name: 1 }).lean();
    const ids = clients.map(c => c._id);
    const totals = await Task.aggregate([
        { $match: { client: { $in: ids } } },
        {
            $group: {
                _id: '$client',
                orders: { $sum: 1 },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                value: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, { $ifNull: ['$finalPrice', '$price'] }, 0] } },
                lastOrderAt: { $max: '$dateStart' }
            }
        }
    ]);
    const stats = new Map(totals.map(t => [String(t._id), t]));
    res.json({
        clients: clients.map(c => ({ ...c, stats: stats.get(String(c._id)) || { orders: 0, completed: 0, value: 0, lastOrderAt: null } }))
    });
}));

router.get('/clients/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const client = found(await Client.findById(req.params.id).lean(), 'Nie znaleziono klienta');
    const tasks = await Task.find({ $or: [{ client: client._id }, ...(client.phone ? [{ clientPhone: client.phone }] : [])] })
        .sort({ dateStart: -1 }).limit(100).lean();
    res.json({ client, tasks });
}));

router.post('/clients', requireAdmin, asyncRoute(async (req, res) => {
    const client = await Client.create(pick(req.body, CLIENT_FIELDS));
    await recordActivity('client_created', `Dodano klienta ${client.name}`, 'Client', client._id, req.user.name);
    res.status(201).json({ success: true, client });
}));

router.put('/clients/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const client = found(await Client.findByIdAndUpdate(req.params.id, pick(req.body, [...CLIENT_FIELDS, 'archived']), { new: true, runValidators: true }), 'Nie znaleziono klienta');
    res.json({ success: true, client });
}));

router.delete('/clients/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    found(await Client.findByIdAndUpdate(req.params.id, { archived: true }), 'Nie znaleziono klienta');
    res.json({ success: true });
}));

/*
|--------------------------------------------------------------------------
| Finanse
|--------------------------------------------------------------------------
*/

const EXPENSE_FIELDS = ['price', 'category', 'desc', 'date', 'task', 'vehicle', 'receiptNumber'];
const INCOME_FIELDS = ['price', 'category', 'desc', 'date', 'task', 'client', 'paymentMethod'];

function financePayload(body, fields) {
    const data = pick(body, fields);
    if (body.amount !== undefined && data.price === undefined) data.price = body.amount;
    if (data.price !== undefined) data.price = Number(data.price);
    if (data.date === '' || data.date === undefined) delete data.date;
    for (const ref of ['task', 'vehicle', 'client']) if (data[ref] !== undefined && !isObjectId(data[ref])) data[ref] = null;
    return data;
}

router.get('/finances', requireAdmin, asyncRoute(async (req, res) => {
    const from = req.query.from ? new Date(req.query.from) : startOfMonth(new Date());
    const to = req.query.to ? new Date(req.query.to) : startOfNextMonth(from);
    const range = { date: { $gte: from, $lt: to } };
    const [expenses, incomes, completedTasks] = await Promise.all([
        Expense.find(range).sort({ date: -1 }).lean(),
        Income.find(range).sort({ date: -1 }).lean(),
        Task.find({ status: 'completed', completedAt: { $gte: from, $lt: to } })
            .select('number name finalPrice price completedAt paymentStatus clientName').sort({ completedAt: -1 }).lean()
    ]);
    res.json({ from, to, expenses, incomes, completedTasks });
}));

router.post('/finances', requireAdmin, asyncRoute(async (req, res) => {
    const isIncome = req.body?.kind === 'income';
    const Model = isIncome ? Income : Expense;
    const entry = await Model.create({ date: new Date(), ...financePayload(req.body, isIncome ? INCOME_FIELDS : EXPENSE_FIELDS) });
    await recordActivity('finance_created', `Dodano ${isIncome ? 'przychód' : 'koszt'}: ${entry.category} ${money(entry.price)}`, Model.modelName, entry._id, req.user.name);
    res.status(201).json({ success: true, entry });
}));

for (const [path, Model, fields, label] of [['expenses', Expense, EXPENSE_FIELDS, 'koszt'], ['incomes', Income, INCOME_FIELDS, 'przychód']]) {
    router.post(`/${path}`, requireAdmin, asyncRoute(async (req, res) => {
        const entry = await Model.create({ date: new Date(), ...financePayload(req.body, fields) });
        await recordActivity('finance_created', `Dodano ${label}: ${entry.category} ${money(entry.price)}`, Model.modelName, entry._id, req.user.name);
        res.status(201).json({ success: true, entry, [path.slice(0, -1)]: entry });
    }));
    router.put(`/${path}/:id`, requireAdmin, validateId, asyncRoute(async (req, res) => {
        const entry = found(await Model.findByIdAndUpdate(req.params.id, financePayload(req.body, fields), { new: true, runValidators: true }), 'Nie znaleziono wpisu');
        res.json({ success: true, entry });
    }));
    router.delete(`/${path}/:id`, requireAdmin, validateId, asyncRoute(async (req, res) => {
        const entry = found(await Model.findByIdAndDelete(req.params.id), 'Nie znaleziono wpisu');
        await recordActivity('finance_deleted', `Usunięto ${label}: ${entry.category} ${money(entry.price)}`, Model.modelName, null, req.user.name);
        res.json({ success: true });
    }));
}

/*
|--------------------------------------------------------------------------
| Zespół
|--------------------------------------------------------------------------
*/

const EMPLOYEE_FIELDS = ['name', 'role', 'systemRole', 'phone', 'email', 'status', 'hourlyRate', 'color'];

async function pinHashFor(pin, excludeId) {
    const value = String(pin || '');
    if (!value) return undefined;
    if (!/^\d{4,8}$/.test(value)) throw httpError(400, 'PIN musi mieć od 4 do 8 cyfr');
    if (value === String(require('../config').adminPin)) throw httpError(400, 'Ten PIN jest zajęty. Wybierz inny.');
    const others = await Employee.find({ active: true, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).select('+pinHash +pin');
    for (const other of others) {
        if ((other.pinHash && await bcrypt.compare(value, other.pinHash)) || (!other.pinHash && other.pin === value)) {
            throw httpError(400, 'Ten PIN jest już używany przez innego pracownika.');
        }
    }
    return bcrypt.hash(value, 12);
}

router.get('/employees', requireAdmin, asyncRoute(async (req, res) => {
    const [employees, devices] = await Promise.all([
        Employee.find(req.query.all === '1' ? {} : { active: true }).sort({ name: 1 }),
        PushSubscription.aggregate([{ $group: { _id: '$userKey', count: { $sum: 1 } } }])
    ]);
    const deviceMap = new Map(devices.map(d => [d._id, d.count]));
    res.json({ employees: employees.map(e => ({ ...publicEmployee(e), pushDevices: deviceMap.get(String(e._id)) || 0 })), adminDevices: deviceMap.get('admin') || 0 });
}));

router.post('/employees', requireAdmin, asyncRoute(async (req, res) => {
    const pinHash = await pinHashFor(req.body?.pin);
    const employee = await Employee.create({ ...pick(req.body, EMPLOYEE_FIELDS), role: req.body?.role || 'Pracownik', pinHash });
    await recordActivity('employee_created', `Dodano pracownika ${employee.name}`, 'Employee', employee._id, req.user.name);
    res.status(201).json({ success: true, employee: publicEmployee(employee) });
}));

router.put('/employees/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const update = pick(req.body, [...EMPLOYEE_FIELDS, 'active']);
    if (req.body?.pin) update.pinHash = await pinHashFor(req.body.pin, req.params.id);
    const employee = found(await Employee.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }), 'Nie znaleziono pracownika');
    res.json({ success: true, employee: publicEmployee(employee) });
}));

router.delete('/employees/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const employee = found(await Employee.findByIdAndUpdate(req.params.id, { active: false }), 'Nie znaleziono pracownika');
    await PushSubscription.deleteMany({ userKey: String(employee._id) });
    await recordActivity('employee_deactivated', `Dezaktywowano pracownika ${employee.name}`, 'Employee', employee._id, req.user.name);
    res.json({ success: true });
}));

/*
|--------------------------------------------------------------------------
| Flota
|--------------------------------------------------------------------------
*/

const FLEET_FIELDS = ['name', 'plates', 'status', 'mileage', 'fuelConsumption', 'capacity', 'nextServiceDate', 'serviceMileage', 'insuranceUntil', 'inspectionUntil', 'notes'];

function fleetPayload(body) {
    const data = pick(body, FLEET_FIELDS);
    for (const key of ['nextServiceDate', 'insuranceUntil', 'inspectionUntil']) if (data[key] === '') data[key] = null;
    for (const key of ['mileage', 'fuelConsumption', 'serviceMileage']) {
        if (data[key] === '') data[key] = key === 'serviceMileage' ? null : 0;
        else if (data[key] !== undefined && data[key] !== null) data[key] = Number(data[key]);
    }
    return data;
}

router.get('/fleet', asyncRoute(async (req, res) => {
    res.json({ fleet: await Fleet.find({ active: true }).sort({ name: 1 }).lean() });
}));

router.post('/fleet', requireAdmin, asyncRoute(async (req, res) => {
    const fleet = await Fleet.create(fleetPayload(req.body));
    res.status(201).json({ success: true, fleet });
}));

router.put('/fleet/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const fleet = found(await Fleet.findByIdAndUpdate(req.params.id, fleetPayload(req.body), { new: true, runValidators: true }), 'Nie znaleziono pojazdu');
    res.json({ success: true, fleet });
}));

router.delete('/fleet/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    found(await Fleet.findByIdAndUpdate(req.params.id, { active: false }), 'Nie znaleziono pojazdu');
    res.json({ success: true });
}));

module.exports = router;
