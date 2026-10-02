'use strict';

const express = require('express');
const { Task, Employee, Fleet, Client, Activity, TASK_STATUSES } = require('../models');
const { requireAdmin, validateId } = require('../middleware/auth');
const { asyncRoute, httpError, isObjectId, userKeyOf, escapeRegex } = require('../utils');
const { recordActivity } = require('../services/activity');
const { getSettings } = require('../services/settings');
const notify = require('../services/notify');

const router = express.Router();

const EDITABLE = [
    'number', 'name', 'type', 'status', 'priority', 'price', 'priceMax', 'finalPrice', 'paymentStatus',
    'paymentMethod', 'dateStart', 'dateEnd', 'client', 'clientName', 'clientPhone', 'clientEmail', 'address',
    'addressFrom', 'addressTo', 'desc', 'people', 'workers', 'vehicle', 'car', 'source', 'checklist'
];

const ACTIVE_STATUSES = ['planned', 'progress'];
const assignedIds = task => (task.workers || []).map(w => w.employee && String(w.employee)).filter(Boolean);

function isAssigned(task, user) {
    return Boolean(user?.employeeId) && assignedIds(task).includes(String(user.employeeId));
}

function canWorkOn(task, user) {
    return user.role === 'admin' || isAssigned(task, user) || !assignedIds(task).length;
}

async function normalizeWorkers(input) {
    const list = Array.isArray(input) ? input.slice(0, 30) : [];
    const ids = list.map(item => (typeof item === 'string' ? item : item?.employee)).filter(isObjectId);
    const employees = ids.length ? await Employee.find({ _id: { $in: ids } }).select('name role').lean() : [];
    const byId = new Map(employees.map(e => [String(e._id), e]));
    const seen = new Set();
    const out = [];
    for (const item of list) {
        const id = typeof item === 'string' ? item : item?.employee;
        if (id && byId.has(String(id))) {
            if (seen.has(String(id))) continue;
            seen.add(String(id));
            const employee = byId.get(String(id));
            out.push({ employee: employee._id, name: employee.name, role: (item?.role || employee.role || 'Pomocnik').slice(0, 80) });
        } else if (item && typeof item === 'object' && item.name && !item.employee) {
            out.push({ employee: null, name: String(item.name).slice(0, 100), role: String(item.role || 'Pomocnik').slice(0, 80) });
        }
    }
    return out;
}

async function buildPayload(body, { partial }) {
    const data = {};
    for (const key of EDITABLE) if (body[key] !== undefined) data[key] = body[key];

    if (!partial && (!data.name || !data.dateStart)) throw httpError(400, 'Nazwa i termin zlecenia są wymagane');

    for (const key of ['dateStart', 'dateEnd']) {
        if (data[key] === '' || data[key] === null) {
            if (key === 'dateStart') throw httpError(400, 'Termin zlecenia jest wymagany');
            data[key] = null;
        } else if (data[key] !== undefined) {
            const date = new Date(data[key]);
            if (Number.isNaN(date.getTime())) throw httpError(400, 'Nieprawidłowa data');
            data[key] = date;
        }
    }
    for (const key of ['price', 'priceMax', 'finalPrice', 'people']) {
        if (data[key] === '' || data[key] === null) data[key] = key === 'price' || key === 'people' ? 0 : null;
        else if (data[key] !== undefined) data[key] = Number(data[key]);
    }
    if (data.status && !TASK_STATUSES.includes(data.status)) throw httpError(400, 'Nieprawidłowy status');
    if (data.workers !== undefined) data.workers = await normalizeWorkers(data.workers);

    if (data.vehicle !== undefined) {
        if (!data.vehicle) {
            data.vehicle = null;
        } else if (isObjectId(data.vehicle)) {
            const vehicle = await Fleet.findById(data.vehicle).select('name plates').lean();
            if (!vehicle) throw httpError(400, 'Nie znaleziono pojazdu');
            data.car = `${vehicle.name} (${vehicle.plates})`;
        } else {
            data.vehicle = null;
        }
    }
    if (data.client !== undefined && !isObjectId(data.client)) data.client = null;

    if (data.checklist !== undefined) {
        data.checklist = (Array.isArray(data.checklist) ? data.checklist : [])
            .slice(0, 40)
            .map(item => (typeof item === 'string' ? { text: item } : item))
            .filter(item => item && String(item.text || '').trim())
            .map(item => ({
                ...(isObjectId(item._id) ? { _id: item._id } : {}),
                text: String(item.text).trim().slice(0, 200),
                done: Boolean(item.done),
                doneBy: item.doneBy || '',
                doneAt: item.done ? (item.doneAt ? new Date(item.doneAt) : new Date()) : null
            }));
    }
    return data;
}

/** Zdarzenia po zapisie: przypisania, nowe zlecenie, reset przypomnień. */
function afterSave(task, before, actor) {
    const actorKey = userKeyOf(actor);
    const plain = task.toObject ? task.toObject() : task;

    const oldIds = new Set(before ? assignedIds(before) : []);
    const added = assignedIds(plain).filter(id => !oldIds.has(id));

    const becameActive = ACTIVE_STATUSES.includes(plain.status) &&
        (!before || !ACTIVE_STATUSES.includes(before.status) && before.status !== 'completed');

    // Osoby dopisane do ekipy dostają jedno powiadomienie (o przypisaniu), a nie dwa.
    if (becameActive) void notify.newTask(plain, actorKey, added);
    if (added.length && plain.status !== 'cancelled' && plain.status !== 'completed') void notify.assigned(plain, added, actorKey);
}

function dateChanged(before, data) {
    return data.dateStart && before.dateStart && new Date(data.dateStart).getTime() !== new Date(before.dateStart).getTime();
}

/*
|--------------------------------------------------------------------------
| Lista, szczegóły, kalendarz
|--------------------------------------------------------------------------
*/

router.get('/tasks', asyncRoute(async (req, res) => {
    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.status = { $in: String(req.query.status).split(',') };
    if (req.query.from || req.query.to) {
        filter.dateStart = {};
        if (req.query.from) filter.dateStart.$gte = new Date(req.query.from);
        if (req.query.to) filter.dateStart.$lt = new Date(req.query.to);
    }
    if (req.query.mine === '1' && req.user.employeeId) filter['workers.employee'] = req.user.employeeId;
    if (req.query.q) {
        const query = escapeRegex(String(req.query.q).slice(0, 100));
        filter.$or = ['name', 'clientName', 'clientPhone', 'address', 'number', 'type']
            .map(field => ({ [field]: { $regex: query, $options: 'i' } }));
    }
    const tasks = await Task.find(filter).sort({ dateStart: 1, createdAt: -1 }).limit(1000).lean();
    res.json({ tasks });
}));

router.get('/tasks/:id', validateId, asyncRoute(async (req, res) => {
    const task = await Task.findById(req.params.id).lean();
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    const activity = await Activity.find({ entityId: task._id }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ task, activity });
}));

router.get('/calendar', asyncRoute(async (req, res) => {
    const now = new Date();
    const from = req.query.from ? new Date(req.query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = req.query.to ? new Date(req.query.to) : new Date(from.getFullYear(), from.getMonth() + 1, 1);
    const filter = { dateStart: { $gte: from, $lt: to }, status: { $nin: ['cancelled', 'new'] } };
    if (req.query.mine === '1' && req.user.employeeId) filter['workers.employee'] = req.user.employeeId;
    const tasks = await Task.find(filter).sort({ dateStart: 1 }).lean();
    res.json({ from, to, tasks });
}));

/*
|--------------------------------------------------------------------------
| Tworzenie i edycja (administrator)
|--------------------------------------------------------------------------
*/

router.post('/tasks', requireAdmin, asyncRoute(async (req, res) => {
    const data = await buildPayload(req.body || {}, { partial: false });
    if (!data.checklist) {
        const settings = await getSettings();
        if (settings.defaultChecklist?.length) data.checklist = settings.defaultChecklist.map(text => ({ text }));
    }
    if (!data.status) data.status = 'planned';
    const task = await Task.create({ ...data, createdBy: req.user.name, source: data.source || 'Panel RevMi' });
    await recordActivity('task_created', `Dodano zlecenie ${task.number}: ${task.name}`, 'Task', task._id, req.user.name);
    afterSave(task, null, req.user);
    res.status(201).json({ success: true, task });
}));

router.put('/tasks/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    const before = task.toObject();
    const data = await buildPayload(req.body || {}, { partial: true });

    if (dateChanged(before, data)) {
        data['reminders.firstSentAt'] = null;
        data['reminders.secondSentAt'] = null;
    }
    if (data.status && data.status !== 'completed') {
        data.completed = false;
        data.completedAt = null;
    }
    task.set(data);
    await task.save();

    const changes = [];
    if (before.status !== task.status) changes.push(`status: ${notify.STATUS_LABELS[task.status]}`);
    if (dateChanged(before, data)) changes.push('termin');
    if (JSON.stringify(assignedIds(before)) !== JSON.stringify(assignedIds(task))) changes.push('ekipa');
    await recordActivity('task_updated', `Zaktualizowano ${task.number}${changes.length ? ' (' + changes.join(', ') + ')' : ''}`, 'Task', task._id, req.user.name);
    afterSave(task, before, req.user);
    res.json({ success: true, task });
}));

router.delete('/tasks/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    await recordActivity('task_deleted', `Usunięto zlecenie ${task.number}: ${task.name}`, 'Task', null, req.user.name);
    res.json({ success: true });
}));

router.post('/tasks/:id/duplicate', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const source = await Task.findById(req.params.id).lean();
    if (!source) throw httpError(404, 'Nie znaleziono zlecenia');
    const copy = { ...source };
    for (const key of ['_id', 'number', 'quoteRequestId', 'quoteFingerprint', 'quotePhotos', 'createdAt', 'updatedAt', 'completedAt', 'reminders', 'notes', '__v']) delete copy[key];
    copy.quotePhotoCount = 0;
    copy.status = 'planned';
    copy.completed = false;
    copy.finalPrice = null;
    copy.paymentStatus = 'unpaid';
    copy.name = source.name.replace(/^Wycena:\s*/, '');
    copy.checklist = (source.checklist || []).map(item => ({ text: item.text }));
    copy.source = 'Kopia ' + source.number;
    copy.createdBy = req.user.name;
    const task = await Task.create(copy);
    await recordActivity('task_created', `Skopiowano ${source.number} → ${task.number}`, 'Task', task._id, req.user.name);
    afterSave(task, null, req.user);
    res.status(201).json({ success: true, task });
}));

/** Tworzy klienta w CRM na podstawie danych ze zlecenia (albo podpina istniejącego po telefonie). */
router.post('/tasks/:id/client', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    let client = task.clientPhone ? await Client.findOne({ phone: task.clientPhone, archived: false }) : null;
    if (!client) {
        client = await Client.create({
            name: task.clientName || 'Klient ' + task.number,
            phone: task.clientPhone,
            email: task.clientEmail,
            address: task.address,
            source: task.source || 'Zlecenie'
        });
    }
    task.client = client._id;
    await task.save();
    res.json({ success: true, client, task });
}));

/*
|--------------------------------------------------------------------------
| Akcje ekipy: status, notatki, checklista, zdjęcia
|--------------------------------------------------------------------------
*/

async function changeStatus(req, res, status) {
    if (!TASK_STATUSES.includes(status)) throw httpError(400, 'Nieprawidłowy status');
    const task = await Task.findById(req.params.id);
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    if (!canWorkOn(task, req.user)) throw httpError(403, 'To zlecenie jest przypisane do innej osoby');
    if (req.user.role !== 'admin' && ['new', 'quoted', 'cancelled'].includes(status)) {
        throw httpError(403, 'Ten status może ustawić tylko administrator');
    }

    const before = task.toObject();
    task.status = status;
    task.completed = status === 'completed';
    task.completedAt = status === 'completed' ? (task.completedAt || new Date()) : null;
    if (status === 'completed' && req.body?.finalPrice !== undefined && req.body.finalPrice !== '' && req.user.role === 'admin') {
        task.finalPrice = Number(req.body.finalPrice);
    }
    await task.save();

    await recordActivity('task_status', `${task.number}: ${notify.STATUS_LABELS[before.status]} → ${notify.STATUS_LABELS[status]}`, 'Task', task._id, req.user.name);
    if (before.status !== status) void notify.statusChanged(task.toObject(), before.status, req.user);
    afterSave(task, before, req.user);
    res.json({ success: true, task });
}

router.patch('/tasks/:id/status', validateId, asyncRoute((req, res) => changeStatus(req, res, req.body?.status)));
router.post('/tasks/:id/complete', validateId, asyncRoute((req, res) => changeStatus(req, res, 'completed')));

router.post('/tasks/:id/notes', validateId, asyncRoute(async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) throw httpError(400, 'Notatka jest pusta');
    const task = await Task.findByIdAndUpdate(
        req.params.id,
        { $push: { notes: { text: text.slice(0, 2000), author: req.user.name, authorKey: userKeyOf(req.user) } } },
        { new: true }
    );
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    res.status(201).json({ success: true, task });
}));

router.delete('/tasks/:id/notes/:noteId', validateId, asyncRoute(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    const note = task.notes.id(req.params.noteId);
    if (!note) throw httpError(404, 'Nie znaleziono notatki');
    if (req.user.role !== 'admin' && note.authorKey !== userKeyOf(req.user)) throw httpError(403, 'Możesz usuwać tylko swoje notatki');
    note.deleteOne();
    await task.save();
    res.json({ success: true, task });
}));

router.patch('/tasks/:id/checklist/:itemId', validateId, asyncRoute(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    if (!canWorkOn(task, req.user)) throw httpError(403, 'To zlecenie jest przypisane do innej osoby');
    const item = task.checklist.id(req.params.itemId);
    if (!item) throw httpError(404, 'Nie znaleziono pozycji');
    item.done = req.body?.done === undefined ? !item.done : Boolean(req.body.done);
    item.doneBy = item.done ? req.user.name : '';
    item.doneAt = item.done ? new Date() : null;
    await task.save();
    res.json({ success: true, task });
}));

// Zdjęcia z formularza są prywatne: administrator i osoby przypisane do zlecenia.
router.get('/tasks/:id/photos/:index', validateId, asyncRoute(async (req, res) => {
    if (!/^[0-2]$/.test(req.params.index)) return res.sendStatus(404);
    const task = await Task.findById(req.params.id).select('+quotePhotos workers');
    if (!task) return res.sendStatus(404);
    if (req.user.role !== 'admin' && !isAssigned(task, req.user)) return res.sendStatus(403);
    const photo = task.quotePhotos?.[Number(req.params.index)];
    if (!photo) return res.sendStatus(404);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', 'inline; filename="zdjecie-wyceny.jpg"');
    res.type(photo.contentType || 'image/jpeg').send(photo.data);
}));

/*
|--------------------------------------------------------------------------
| Eksport CSV (Excel)
|--------------------------------------------------------------------------
*/

router.get('/export/tasks.csv', requireAdmin, asyncRoute(async (req, res) => {
    const tasks = await Task.find({}).sort({ dateStart: -1 }).lean();
    const cols = [
        ['Numer', t => t.number], ['Nazwa', t => t.name], ['Usługa', t => t.type], ['Status', t => notify.STATUS_LABELS[t.status]],
        ['Termin', t => t.dateStart ? new Date(t.dateStart).toLocaleString('pl-PL', { timeZone: process.env.TZ }) : ''],
        ['Klient', t => t.clientName], ['Telefon', t => t.clientPhone], ['Adres', t => t.address],
        ['Cena', t => t.price], ['Cena końcowa', t => t.finalPrice ?? ''], ['Płatność', t => t.paymentStatus],
        ['Ekipa', t => (t.workers || []).map(w => w.name).join(', ')], ['Pojazd', t => t.car], ['Źródło', t => t.source]
    ];
    const cell = value => {
        const text = String(value ?? '');
        const safe = /^[=+\-@]/.test(text) ? "'" + text : text;
        return '"' + safe.replace(/"/g, '""') + '"';
    };
    const csv = '﻿' + [cols.map(c => cell(c[0])).join(';'), ...tasks.map(t => cols.map(c => cell(c[1](t))).join(';'))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="zlecenia-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
}));

module.exports = router;
module.exports._internal = { buildPayload, canWorkOn, isAssigned, assignedIds };
