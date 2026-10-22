'use strict';

const express = require('express');
const { Task, Employee, Fleet, Client, Activity, Branch, TaskMedia, Expense, TASK_STATUSES } = require('../models');
const scope = require('../services/scope');
const sms = require('../services/sms');
const revbot = require('../services/ai-quote');
const { preparePhotos } = require('../../lib/quote-input');
const { requireAdmin, validateId } = require('../middleware/auth');
const { asyncRoute, httpError, isObjectId, userKeyOf, escapeRegex } = require('../utils');
const { recordActivity } = require('../services/activity');
const { getSettings } = require('../services/settings');
const notify = require('../services/notify');
const { isDivision, divisionName } = require('../../lib/divisions');

const router = express.Router();

const EDITABLE = [
    'number', 'name', 'type', 'division', 'quoteType', 'status', 'priority', 'price', 'priceMax', 'finalPrice', 'paymentStatus',
    'paymentMethod', 'dateStart', 'dateEnd', 'client', 'clientName', 'clientPhone', 'clientEmail', 'address',
    'addressFrom', 'addressTo', 'desc', 'people', 'workers', 'vehicle', 'car', 'source', 'checklist', 'branch'
];

const ACTIVE_STATUSES = ['planned', 'progress'];
const assignedIds = task => (task.workers || []).map(w => w.employee && String(w.employee)).filter(Boolean);

function isAssigned(task, user) {
    const me = scope.selfId(user);
    return Boolean(me) && assignedIds(task).includes(me);
}

/** Admin — zawsze; pracownik — zlecenia, które widzi, gdy jest przypisany, ekipa jest pusta albo to zlecenie jego oddziału. */
function canWorkOn(task, user) {
    if (user.role === 'admin') return true;
    if (!scope.canSeeTask(task, user)) return false;
    return isAssigned(task, user) || !assignedIds(task).length || Boolean(task.branch && user.branch && String(task.branch) === String(user.branch));
}

/** Dodaje do checklisty sprzęt oddziału („przed wyjazdem”), którego jeszcze nie ma. */
async function withBranchEquipment(checklist, branchId) {
    if (!branchId) return checklist;
    const branch = await Branch.findById(branchId).select('equipment').lean();
    const list = Array.isArray(checklist) ? [...checklist] : [];
    const have = new Set(list.map(i => String(i.text).trim().toLowerCase()));
    for (const text of branch?.equipment || []) {
        if (!have.has(text.toLowerCase())) list.unshift({ text, phase: 'before', done: false });
    }
    return list;
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
    if (data.division !== undefined && !isDivision(data.division)) data.division = '';
    if (data.quoteType !== undefined && !['free', 'onsite', ''].includes(data.quoteType)) data.quoteType = '';
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
    if (data.branch !== undefined) {
        if (!data.branch) data.branch = null;
        else if (!isObjectId(data.branch) || !await Branch.exists({ _id: data.branch, active: true })) throw httpError(400, 'Nie znaleziono oddziału');
    }

    if (data.checklist !== undefined) {
        data.checklist = (Array.isArray(data.checklist) ? data.checklist : [])
            .slice(0, 40)
            .map(item => (typeof item === 'string' ? { text: item } : item))
            .filter(item => item && String(item.text || '').trim())
            .map(item => ({
                ...(isObjectId(item._id) ? { _id: item._id } : {}),
                text: String(item.text).trim().slice(0, 200),
                phase: item.phase === 'before' ? 'before' : 'task',
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
    const filter = { ...scope.taskFilterFor(req.user) };
    if (req.query.status && req.query.status !== 'all') {
        const wanted = String(req.query.status).split(',');
        filter.status = { $in: req.user.role === 'admin' ? wanted : wanted.filter(s => scope.WORKER_STATUSES.includes(s)) };
    }
    if (req.user.role === 'admin' && req.query.branch) filter.branch = req.query.branch === 'none' ? null : (isObjectId(req.query.branch) ? req.query.branch : undefined);
    if (req.query.from || req.query.to) {
        filter.dateStart = {};
        if (req.query.from) filter.dateStart.$gte = new Date(req.query.from);
        if (req.query.to) filter.dateStart.$lt = new Date(req.query.to);
    }
    if (req.query.mine === '1' && scope.selfId(req.user)) filter['workers.employee'] = scope.selfId(req.user);
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
    if (!task || !scope.canSeeTask(task, req.user)) throw httpError(404, 'Nie znaleziono zlecenia');
    const [activity, media] = await Promise.all([
        Activity.find({ entityId: task._id }).sort({ createdAt: -1 }).limit(50).lean(),
        TaskMedia.find({ task: task._id }).sort({ createdAt: 1 }).select('kind by byKey createdAt size').lean()
    ]);
    if (req.user.role !== 'admin' && task.aiEstimate) {
        // Pracownik widzi tylko praktyczne uwagi RevBota, bez cen, kosztów i zysku.
        task.aiEstimate = { admin: task.aiEstimate.admin, inventory: task.aiEstimate.inventory, source: task.aiEstimate.source };
    }
    res.json({ task, activity, media });
}));

router.get('/calendar', asyncRoute(async (req, res) => {
    const now = new Date();
    const from = req.query.from ? new Date(req.query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = req.query.to ? new Date(req.query.to) : new Date(from.getFullYear(), from.getMonth() + 1, 1);
    const filter = { dateStart: { $gte: from, $lt: to }, status: { $nin: ['cancelled', 'new'] }, ...scope.taskFilterFor(req.user) };
    if (req.user.role !== 'admin') filter.status = { $in: ['planned', 'progress', 'completed'] };
    if (req.query.mine === '1' && scope.selfId(req.user)) filter['workers.employee'] = scope.selfId(req.user);
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
    if (data.branch) data.checklist = await withBranchEquipment(data.checklist, data.branch);
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
    if (data.status === 'completed' && before.status !== 'completed') {
        throw httpError(400, 'Zakończ zlecenie przyciskiem „Zakończ” — trzeba dodać zdjęcia i koszty.');
    }
    if (data.status && data.status !== 'completed') {
        data.completed = false;
        data.completedAt = null;
    }
    if (data.branch && String(data.branch) !== String(before.branch || '')) {
        data.checklist = await withBranchEquipment(data.checklist || before.checklist, data.branch);
    }
    task.set(data);
    await task.save();
    if (before.status === 'new' && task.status === 'quoted' && task.price > 0) void revbot.learnCorrection(task.toObject(), task.price, task.priceMax, req.user.name);

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
    if (status === 'completed') return completeTask(req, res);
    const task = await Task.findById(req.params.id);
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    if (!canWorkOn(task, req.user)) throw httpError(403, 'To zlecenie jest przypisane do innej osoby');
    if (req.user.role !== 'admin' && ['new', 'quoted', 'cancelled'].includes(status)) {
        throw httpError(403, 'Ten status może ustawić tylko administrator');
    }
    if (status === 'progress' && req.user.role !== 'admin') {
        const settings = await getSettings();
        const missing = (task.checklist || []).filter(i => i.phase === 'before' && !i.done).map(i => i.text);
        if (settings.requireBeforeChecklist && missing.length) {
            throw httpError(400, 'Najpierw odhacz sprzęt przed wyjazdem: ' + missing.slice(0, 6).join(', ') + (missing.length > 6 ? '…' : ''));
        }
    }

    const before = task.toObject();
    task.status = status;
    task.completed = false;
    task.completedAt = null;
    await task.save();

    await recordActivity('task_status', `${task.number}: ${notify.STATUS_LABELS[before.status]} → ${notify.STATUS_LABELS[status]}`, 'Task', task._id, req.user.name);
    if (before.status !== status) void notify.statusChanged(task.toObject(), before.status, req.user);
    afterSave(task, before, req.user);
    res.json({ success: true, task });
}

const COST_KEYS = { fuel: 'Paliwo', materials: 'Materiały', disposal: 'Utylizacja', other: 'Inne koszty zlecenia' };
const money2 = v => Math.round((Number(v) || 0) * 100) / 100;

function costNumber(value, label, required) {
    if (value === undefined || value === null || value === '') {
        if (required) throw httpError(400, `Wpisz koszt: ${label} (0, jeśli nie było).`);
        return null;
    }
    const n = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw httpError(400, `Nieprawidłowa kwota: ${label}`);
    return money2(n);
}

/**
 * 8.0: zakończenie zlecenia = raport ekipy.
 * Wymagane (ustawienia): min. zdjęć z realizacji (przed/po), koszty paliwa, materiałów, utylizacji i innych (0 lub kwota).
 * Koszty trafiają do finansów (Expense, źródło „task”), prośba o opinię SMS — tylko za zgodą zamykającego.
 */
async function completeTask(req, res) {
    const body = req.body || {};
    const task = await Task.findById(req.params.id);
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    if (!canWorkOn(task, req.user)) throw httpError(403, 'To zlecenie jest przypisane do innej osoby');
    if (['new', 'cancelled'].includes(task.status)) throw httpError(400, 'Tego zlecenia nie można zakończyć w obecnym statusie');
    const settings = await getSettings();
    const admin = req.user.role === 'admin';

    const branch = task.branch ? await Branch.findById(task.branch).select('minPhotos name').lean() : null;
    const minPhotos = branch ? Math.max(0, branch.minPhotos ?? 1) : 1;
    const mediaCount = await TaskMedia.countDocuments({ task: task._id });
    if (settings.requireCompletionPhotos && mediaCount < minPhotos && !(admin && body.skipPhotos === true)) {
        throw httpError(400, minPhotos === 1 ? 'Dodaj przynajmniej jedno zdjęcie z realizacji (przed lub po).' : `Dodaj co najmniej ${minPhotos} zdjęcia z realizacji (przed i po).`);
    }

    const costsIn = body.costs && typeof body.costs === 'object' ? body.costs : {};
    const costs = {};
    for (const [key, label] of Object.entries(COST_KEYS)) costs[key] = costNumber(costsIn[key], label, settings.requireCostReport);
    const hours = body.hoursWorked === undefined || body.hoursWorked === '' || body.hoursWorked === null ? null : Number(body.hoursWorked);
    if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 500)) throw httpError(400, 'Nieprawidłowa liczba godzin');
    const cash = body.cashCollected === undefined || body.cashCollected === '' || body.cashCollected === null ? null : costNumber(body.cashCollected, 'pobrana kwota', false);

    const before = task.toObject();
    task.status = 'completed';
    task.completed = true;
    task.completedAt = task.completedAt || new Date();
    task.costs = { ...costs, note: String(costsIn.note || '').trim().slice(0, 500), reportedBy: req.user.name, reportedAt: new Date() };
    task.hoursWorked = hours;
    task.cashCollected = cash;
    task.cashMethod = String(body.cashMethod || '').trim().slice(0, 40);
    task.completionNote = String(body.completionNote || '').trim().slice(0, 2000);
    if (admin && body.finalPrice !== undefined && body.finalPrice !== '' && body.finalPrice !== null) {
        const fp = Number(body.finalPrice);
        if (!Number.isFinite(fp) || fp < 0) throw httpError(400, 'Nieprawidłowa kwota końcowa');
        task.finalPrice = fp;
    }
    if (admin && body.paymentStatus && ['unpaid', 'partial', 'paid'].includes(body.paymentStatus)) task.paymentStatus = body.paymentStatus;
    else if (cash && cash >= (task.finalPrice ?? task.price ?? 0) && cash > 0) task.paymentStatus = 'paid';

    // Prośba o opinię — wyłącznie za wyraźną zgodą osoby zamykającej zlecenie.
    let smsLink = '';
    const consent = body.reviewConsent === true;
    task.reviewRequest = { consent, consentBy: consent ? req.user.name : '', status: consent ? '' : 'skipped', sentAt: null, error: '' };
    await task.save();

    // Koszty zlecenia → finanse (podmieniamy poprzedni raport, jeśli zlecenie zamknięto ponownie).
    await Expense.deleteMany({ task: task._id, source: 'task' });
    const rows = Object.entries(COST_KEYS).filter(([k]) => costs[k] > 0).map(([k, label]) => ({
        price: costs[k], category: label, desc: `${task.number}: ${task.name}`.slice(0, 1000), date: task.completedAt,
        task: task._id, branch: task.branch || null, vehicle: task.vehicle || null, source: 'task'
    }));
    if (rows.length) await Expense.insertMany(rows);

    if (consent) {
        if (!task.clientPhone) {
            task.reviewRequest.status = 'failed';
            task.reviewRequest.error = 'Brak numeru telefonu klienta';
        } else {
            const message = sms.reviewMessage(settings.reviewSmsTemplate, settings.googleReviewUrl);
            const result = await sms.send(task.clientPhone, message);
            task.reviewRequest.status = result.status;
            task.reviewRequest.error = result.error || '';
            if (result.ok) task.reviewRequest.sentAt = new Date();
            if (result.status === 'manual') {
                const to = String(task.clientPhone).replace(/[^\d+]/g, '');
                smsLink = `sms:${to}?&body=${encodeURIComponent(message)}`;
            }
        }
        await Task.updateOne({ _id: task._id }, { $set: { reviewRequest: task.reviewRequest } });
    }

    const costTotal = rows.reduce((s, r) => s + r.price, 0);
    await recordActivity('task_status', `${task.number}: ${notify.STATUS_LABELS[before.status]} → Zakończone · zdjęcia ${mediaCount}, koszty ${costTotal} zł${consent ? ' · prośba o opinię: ' + task.reviewRequest.status : ''}`, 'Task', task._id, req.user.name);
    if (before.status !== 'completed') void notify.statusChanged(task.toObject(), before.status, req.user);
    void revbot.learnFromTask(task._id);
    res.json({ success: true, task, smsLink, review: task.reviewRequest });
}

router.patch('/tasks/:id/status', validateId, asyncRoute((req, res) => changeStatus(req, res, req.body?.status)));
router.post('/tasks/:id/complete', validateId, asyncRoute(completeTask));

/** Ręczne ponowienie prośby o opinię (np. gdy SMS się nie wysłał). */
router.post('/tasks/:id/review-request', validateId, asyncRoute(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    if (!canWorkOn(task, req.user)) throw httpError(403, 'Brak dostępu do zlecenia');
    if (req.body?.consent !== true) throw httpError(400, 'Potwierdź zgodę na wysłanie SMS-a z prośbą o opinię.');
    if (!task.clientPhone) throw httpError(400, 'Brak numeru telefonu klienta');
    const settings = await getSettings();
    const message = sms.reviewMessage(settings.reviewSmsTemplate, settings.googleReviewUrl);
    const result = await sms.send(task.clientPhone, message);
    task.reviewRequest = { consent: true, consentBy: req.user.name, status: result.status, sentAt: result.ok ? new Date() : null, error: result.error || '' };
    await task.save();
    const to = String(task.clientPhone).replace(/[^\d+]/g, '');
    res.json({ success: true, review: task.reviewRequest, smsLink: result.status === 'manual' ? `sms:${to}?&body=${encodeURIComponent(message)}` : '' });
}));

/*
|--------------------------------------------------------------------------
| Zdjęcia z realizacji (przed / po)
|--------------------------------------------------------------------------
*/

const MEDIA_MAX = 30;

router.post('/tasks/:id/media', validateId, asyncRoute(async (req, res) => {
    const task = await Task.findById(req.params.id).select('status branch workers number');
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    if (!canWorkOn(task, req.user)) throw httpError(403, 'Brak dostępu do zlecenia');
    const kind = ['before', 'after', 'other'].includes(req.body?.kind) ? req.body.kind : 'other';
    const list = Array.isArray(req.body?.photos) ? req.body.photos : [];
    if (!list.length) throw httpError(400, 'Dodaj zdjęcie');
    if (list.length > 10) throw httpError(400, 'Maksymalnie 10 zdjęć naraz');
    for (const d of list) {
        if (typeof d !== 'string' || d.length > 1_400_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(d)) throw httpError(400, 'Nieprawidłowy plik zdjęcia');
    }
    const count = await TaskMedia.countDocuments({ task: task._id });
    if (count + list.length > MEDIA_MAX) throw httpError(400, `Limit ${MEDIA_MAX} zdjęć na zlecenie`);
    const photos = await preparePhotos(list.map(data => ({ data })));
    const docs = await TaskMedia.insertMany(photos.map(p => ({ task: task._id, kind, data: p.data, contentType: p.contentType, size: p.data.length, by: req.user.name, byKey: userKeyOf(req.user) })));
    const counts = await TaskMedia.aggregate([{ $match: { task: task._id } }, { $group: { _id: '$kind', n: { $sum: 1 } } }]);
    const mediaCount = { before: 0, after: 0, other: 0 };
    for (const c of counts) mediaCount[c._id] = c.n;
    await Task.updateOne({ _id: task._id }, { $set: { mediaCount } });
    res.status(201).json({ success: true, media: docs.map(d => ({ _id: d._id, kind: d.kind, by: d.by, createdAt: d.createdAt })), mediaCount });
}));

router.get('/tasks/:id/media/:mediaId', validateId, asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.mediaId)) return res.sendStatus(404);
    const task = await Task.findById(req.params.id).select('status branch workers').lean();
    if (!task || !scope.canSeeTask(task, req.user)) return res.sendStatus(404);
    const media = await TaskMedia.findOne({ _id: req.params.mediaId, task: task._id }).select('+data contentType').lean();
    if (!media) return res.sendStatus(404);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(media.contentType || 'image/jpeg').send(media.data.buffer ? Buffer.from(media.data.buffer) : media.data);
}));

router.delete('/tasks/:id/media/:mediaId', validateId, asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.mediaId)) throw httpError(404, 'Nie znaleziono zdjęcia');
    const media = await TaskMedia.findOne({ _id: req.params.mediaId, task: req.params.id });
    if (!media) throw httpError(404, 'Nie znaleziono zdjęcia');
    if (req.user.role !== 'admin' && media.byKey !== userKeyOf(req.user)) throw httpError(403, 'Możesz usuwać tylko swoje zdjęcia');
    await media.deleteOne();
    const counts = await TaskMedia.aggregate([{ $match: { task: media.task } }, { $group: { _id: '$kind', n: { $sum: 1 } } }]);
    const mediaCount = { before: 0, after: 0, other: 0 };
    for (const c of counts) mediaCount[c._id] = c.n;
    await Task.updateOne({ _id: media.task }, { $set: { mediaCount } });
    res.json({ success: true, mediaCount });
}));

router.post('/tasks/:id/notes', validateId, asyncRoute(async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) throw httpError(400, 'Notatka jest pusta');
    const existing = await Task.findById(req.params.id).select('status branch workers').lean();
    if (!existing || !scope.canSeeTask(existing, req.user)) throw httpError(404, 'Nie znaleziono zlecenia');
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
    if (!/^\d$/.test(req.params.index)) return res.sendStatus(404);
    const task = await Task.findById(req.params.id).select('+quotePhotos workers status branch');
    if (!task) return res.sendStatus(404);
    if (req.user.role !== 'admin' && !(scope.canSeeTask(task, req.user) && canWorkOn(task, req.user))) return res.sendStatus(403);
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
        ['Numer', t => t.number], ['Nazwa', t => t.name], ['Dział', t => divisionName(t.division)], ['Rodzaj wyceny', t => (t.quoteType === 'onsite' ? 'płatna z dojazdem' : t.quoteType === 'free' ? 'widełki' : '')], ['Usługa', t => t.type], ['Status', t => notify.STATUS_LABELS[t.status]],
        ['Termin', t => t.dateStart ? new Date(t.dateStart).toLocaleString('pl-PL', { timeZone: process.env.TZ }) : ''],
        ['Klient', t => t.clientName], ['Telefon', t => t.clientPhone], ['Adres', t => t.address],
        ['Cena', t => t.price], ['Cena końcowa', t => t.finalPrice ?? ''], ['Płatność', t => t.paymentStatus],
        ['Ekipa', t => (t.workers || []).map(w => w.name).join(', ')], ['Pojazd', t => t.car], ['Źródło', t => t.source],
        ['Paliwo', t => t.costs?.fuel ?? ''], ['Materiały', t => t.costs?.materials ?? ''], ['Utylizacja', t => t.costs?.disposal ?? ''], ['Inne koszty', t => t.costs?.other ?? ''],
        ['Godziny', t => t.hoursWorked ?? ''], ['Pobrano', t => t.cashCollected ?? ''], ['Opinia SMS', t => t.reviewRequest?.status || '']
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
