'use strict';

/** RevMi 2.0.0 — magazyn sprzętu i materiałów (B7) oraz zgłoszenia usterek (C7). */
const express = require('express');
const { Employee, Fleet, Task, Expense } = require('../../models');
const { Repair } = require('../../models-v11');
const { Equipment, EquipmentMove, FaultReport } = require('../../models-v2');
const { preparePhotos } = require('../../../lib/quote-input');
const scope = require('../../services/scope');
const roles = require('../../../lib/v11-input');
const notify = require('../../services/notify');
const { requireAdmin, validateId } = require('../../middleware/auth');
const { asyncRoute, httpError, isObjectId, userKeyOf } = require('../../utils');
const { recordActivity } = require('../../services/activity');

const router = express.Router();
const bigJson = express.json({ limit: '12mb' });

/* ------------------------------------------------------------------ */
/* Magazyn sprzętu                                                     */
/* ------------------------------------------------------------------ */

function itemPayload(b) {
    const name = String(b.name || '').trim().slice(0, 120);
    if (!name) throw httpError(400, 'Podaj nazwę');
    const num = (v, d = 0) => (v === '' || v === null || v === undefined ? d : (Number.isFinite(Number(v)) ? Number(v) : d));
    return {
        name,
        kind: b.kind === 'material' ? 'material' : 'equipment',
        category: String(b.category || '').trim().slice(0, 60),
        unit: String(b.unit || 'szt.').trim().slice(0, 12) || 'szt.',
        minQty: Math.max(0, num(b.minQty)),
        total: b.total === '' || b.total === null || b.total === undefined ? null : Math.max(0, num(b.total)),
        location: String(b.location || '').trim().slice(0, 120),
        branch: isObjectId(b.branch) ? b.branch : null,
        status: ['ok', 'service', 'lost'].includes(b.status) ? b.status : 'ok',
        notes: String(b.notes || '').trim().slice(0, 1000)
    };
}

router.get('/v2/equipment', requireAdmin, asyncRoute(async (req, res) => {
    const filter = { active: true };
    if (['equipment', 'material'].includes(req.query.kind)) filter.kind = req.query.kind;
    const [items, moves] = await Promise.all([
        Equipment.find(filter).sort({ kind: 1, name: 1 }).lean(),
        EquipmentMove.find().sort({ createdAt: -1 }).limit(60).lean()
    ]);
    res.json({
        items,
        moves,
        kpi: {
            positions: items.length,
            issued: items.reduce((s, i) => s + (i.holders || []).reduce((a, h) => a + (h.qty || 0), 0), 0),
            low: items.filter(i => i.minQty > 0 && i.qty <= i.minQty).length,
            service: items.filter(i => i.status === 'service').length
        }
    });
}));

router.post('/v2/equipment', requireAdmin, asyncRoute(async (req, res) => {
    const data = itemPayload(req.body || {});
    const qty = Number(req.body?.qty) || 0;
    const item = await Equipment.create({ ...data, qty, total: data.total ?? (data.kind === 'equipment' ? qty : null) });
    if (qty) await EquipmentMove.create({ item: item._id, itemName: item.name, type: 'in', qty, note: 'Stan początkowy', by: req.user.name });
    res.status(201).json({ success: true, item });
}));

router.put('/v2/equipment/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const item = await Equipment.findByIdAndUpdate(req.params.id, { $set: itemPayload(req.body || {}) }, { new: true, runValidators: true });
    if (!item) throw httpError(404, 'Nie znaleziono pozycji');
    res.json({ success: true, item });
}));

router.delete('/v2/equipment/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    await Equipment.updateOne({ _id: req.params.id }, { $set: { active: false } });
    res.json({ success: true });
}));

/** Ruch magazynowy: przyjęcie, zużycie, wydanie osobie, zwrot, korekta stanu. */
router.post('/v2/equipment/:id/move', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const item = await Equipment.findById(req.params.id);
    if (!item || !item.active) throw httpError(404, 'Nie znaleziono pozycji');
    const b = req.body || {};
    const type = ['in', 'out', 'issue', 'return', 'adjust'].includes(b.type) ? b.type : null;
    if (!type) throw httpError(400, 'Wybierz rodzaj ruchu');
    const qty = Number(b.qty);
    if (!Number.isFinite(qty) || qty < 0 || (type !== 'adjust' && qty === 0)) throw httpError(400, 'Podaj ilość');
    let employee = null;
    if (['issue', 'return'].includes(type)) {
        if (!isObjectId(b.employee)) throw httpError(400, 'Wybierz osobę');
        employee = await Employee.findById(b.employee).select('name').lean();
        if (!employee) throw httpError(404, 'Nie znaleziono pracownika');
    }
    const task = isObjectId(b.task) ? await Task.findById(b.task).select('name').lean() : null;

    if (type === 'in') item.qty += qty;
    else if (type === 'out') item.qty -= qty;
    else if (type === 'adjust') item.qty = qty;
    else if (type === 'issue') {
        if (qty > item.qty) throw httpError(400, `Na stanie jest tylko ${item.qty} ${item.unit}`);
        item.qty -= qty;
        const h = item.holders.find(x => String(x.employee) === String(employee._id));
        if (h) { h.qty += qty; h.since = new Date(); } else item.holders.push({ employee: employee._id, name: employee.name, qty, task: task?._id || null, since: new Date() });
        item.markModified('holders');
    } else if (type === 'return') {
        const h = item.holders.find(x => String(x.employee) === String(employee._id));
        if (!h || h.qty < qty) throw httpError(400, `${employee.name} nie ma tylu sztuk`);
        h.qty -= qty;
        item.holders = item.holders.filter(x => x.qty > 0);
        item.qty += qty;
        item.markModified('holders');
    }
    if (item.qty < 0) item.qty = 0;
    const low = item.minQty > 0 && item.qty <= item.minQty;
    if (!low) item.lowAlertAt = null;
    const alert = low && (!item.lowAlertAt || Date.now() - item.lowAlertAt > 3 * 86_400_000);
    if (alert) item.lowAlertAt = new Date();
    await item.save();
    const move = await EquipmentMove.create({ item: item._id, itemName: item.name, type, qty, employee: employee?._id || null, employeeName: employee?.name || '', task: task?._id || null, note: String(b.note || '').slice(0, 300), by: req.user.name });
    if (alert) void notify.notify({ type: 'stock', title: '📦 Kończy się w magazynie', body: `${item.name}: zostało ${item.qty} ${item.unit} (próg ${item.minQty})`, url: '/revmi/#/magazyn', recipients: await notify.adminKeys(), dedupeKey: `stock-${item._id}-${new Date().toISOString().slice(0, 10)}` });
    res.json({ success: true, item, move });
}));

/* ------------------------------------------------------------------ */
/* Usterki                                                             */
/* ------------------------------------------------------------------ */

const FAULT_FIELDS = '-photos';

router.get('/v2/faults', asyncRoute(async (req, res) => {
    const manage = roles.can(req.user.role, 'fleet');
    const filter = manage ? {} : { reportedByKey: userKeyOf(req.user) };
    if (['open', 'progress', 'resolved'].includes(req.query.status)) filter.status = req.query.status;
    const faults = await FaultReport.find(filter).select(FAULT_FIELDS).sort({ status: 1, createdAt: -1 }).limit(200).lean();
    const [vehicles, equipment] = await Promise.all([
        Fleet.find({ active: true }).select('name plates mileage').lean(),
        Equipment.find({ active: true, kind: 'equipment' }).select('name').sort({ name: 1 }).lean()
    ]);
    res.json({ faults, vehicles, equipment, manage });
}));

router.post('/v2/faults', bigJson, asyncRoute(async (req, res) => {
    const b = req.body || {};
    const description = String(b.description || '').trim().slice(0, 2000);
    if (description.length < 3) throw httpError(400, 'Opisz, co się stało');
    const kind = ['vehicle', 'equipment', 'other'].includes(b.kind) ? b.kind : 'other';
    const vehicle = kind === 'vehicle' && isObjectId(b.vehicle) ? await Fleet.findById(b.vehicle).select('name plates mileage') : null;
    const equipment = kind === 'equipment' && isObjectId(b.equipment) ? await Equipment.findById(b.equipment).select('name') : null;
    if (kind === 'vehicle' && !vehicle) throw httpError(400, 'Wybierz pojazd');
    if (kind === 'equipment' && !equipment) throw httpError(400, 'Wybierz sprzęt');
    const list = Array.isArray(b.photos) ? b.photos.slice(0, 4) : [];
    for (const d of list) if (typeof d !== 'string' || d.length > 3_000_000 || !/^data:image\/(jpeg|png|webp);base64,/.test(d)) throw httpError(400, 'Nieprawidłowe zdjęcie');
    const photos = list.length ? await preparePhotos(list.map(data => ({ data }))) : [];
    const mileage = Number(b.mileage) > 0 ? Math.round(Number(b.mileage)) : null;
    const count = await FaultReport.countDocuments();
    const fault = await FaultReport.create({
        number: `US/${new Date().getFullYear()}/${String(count + 1).padStart(3, '0')}`,
        kind, vehicle: vehicle?._id || null, equipment: equipment?._id || null,
        subject: String(b.subject || '').trim().slice(0, 160) || (vehicle ? `${vehicle.name} ${vehicle.plates}` : equipment ? equipment.name : 'Usterka'),
        description, priority: ['low', 'high', 'critical'].includes(b.priority) ? b.priority : 'low', mileage,
        photos: photos.map(p => ({ data: p.data, contentType: p.contentType })), photoCount: photos.length,
        reportedBy: req.user.name, reportedByKey: userKeyOf(req.user)
    });
    if (vehicle && mileage && mileage > (vehicle.mileage || 0)) await Fleet.updateOne({ _id: vehicle._id }, { $set: { mileage } });
    if (equipment) await Equipment.updateOne({ _id: equipment._id }, { $set: { status: 'service' } });
    const label = { low: 'może poczekać', high: 'pilne', critical: 'STOI — nie da się pracować' }[fault.priority];
    void notify.notify({ type: 'fault', title: fault.priority === 'critical' ? '🚨 Usterka — stoimy!' : '🛠 Nowa usterka', body: `${fault.subject}: ${description.slice(0, 120)} (${label}) · ${req.user.name}`, url: '/revmi/#/flota/usterki', recipients: await notify.adminKeys(), exclude: [userKeyOf(req.user)], urgency: fault.priority === 'critical' ? 'high' : undefined });
    await recordActivity('fault', `Zgłoszono usterkę ${fault.number}: ${fault.subject}`, null, null, req.user.name);
    const out = fault.toObject();
    delete out.photos;
    res.status(201).json({ success: true, fault: out });
}));

router.get('/v2/faults/:id/photos/:index', validateId, asyncRoute(async (req, res) => {
    const fault = await FaultReport.findById(req.params.id).select('+photos.data photos.contentType reportedByKey');
    if (!fault) throw httpError(404, 'Nie znaleziono');
    if (!roles.can(req.user.role, 'fleet') && fault.reportedByKey !== userKeyOf(req.user)) throw httpError(403, 'Brak dostępu');
    const p = fault.photos?.[Number(req.params.index)];
    if (!p?.data) throw httpError(404, 'Brak zdjęcia');
    res.setHeader('Content-Type', p.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(p.data);
}));

router.put('/v2/faults/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const fault = await FaultReport.findById(req.params.id).select(FAULT_FIELDS);
    if (!fault) throw httpError(404, 'Nie znaleziono');
    const b = req.body || {};
    const before = fault.status;
    if (['open', 'progress', 'resolved'].includes(b.status)) fault.status = b.status;
    if (b.resolution !== undefined) fault.resolution = String(b.resolution || '').slice(0, 1000);
    if (b.cost !== undefined) fault.cost = b.cost === '' || b.cost === null ? null : Math.max(0, Number(b.cost) || 0);
    if (fault.status === 'resolved' && before !== 'resolved') {
        fault.resolvedAt = new Date();
        fault.resolvedBy = req.user.name;
        if (fault.equipment) await Equipment.updateOne({ _id: fault.equipment }, { $set: { status: 'ok' } });
        // Koszt naprawy pojazdu → historia napraw floty i koszty firmy
        if (fault.vehicle && fault.cost > 0 && b.createRepair !== false) {
            const expense = await Expense.create({ price: fault.cost, category: 'Naprawa floty', desc: `${fault.number}: ${fault.subject} — ${fault.resolution || fault.description}`.slice(0, 1000), vehicle: fault.vehicle, date: new Date() });
            await Repair.create({ vehicle: fault.vehicle, kind: 'repair', description: `${fault.subject}: ${fault.resolution || fault.description}`.slice(0, 1000), price: fault.cost, mileage: fault.mileage, by: req.user.name, expense: expense._id });
        }
        const key = fault.reportedByKey;
        if (key) void notify.notify({ type: 'fault', title: '✅ Usterka naprawiona', body: `${fault.subject}${fault.resolution ? ': ' + fault.resolution : ''}`, url: '/revmi/#/usterki', recipients: [key] });
    }
    await fault.save();
    res.json({ success: true, fault });
}));

module.exports = router;
