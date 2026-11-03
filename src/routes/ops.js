'use strict';

/**
 * RevMi 7.0 — operacje:
 *  - Magazyn: miejsca (boksy/regały/strefy) z pojemnością w m³, zajętość, zdjęcia rzeczy klienta
 *  - Sortownia: pojemniki/frakcje odpadów, przyjęcia z wagą, ilością i zdjęciami, opróżnianie, korekty, historia
 *  - Ponowna wycena AI zgłoszenia z formularza
 */
const express = require('express');
const {
    StorageItem, StorageUnit, SortingBin, SortingEntry, Task, SORTING_UNITS
} = require('../models');
const { requireAdmin, validateId } = require('../middleware/auth');
const { asyncRoute, httpError, pick, isObjectId, userKeyOf } = require('../utils');
const { recordActivity } = require('../services/activity');
const { preparePhotos } = require('../../lib/quote-input');
const notify = require('../services/notify');
const aiQuote = require('../services/ai-quote');

const router = express.Router();
const bigJson = express.json({ limit: '10mb' });

const found = (doc, message = 'Nie znaleziono') => {
    if (!doc) throw httpError(404, message);
    return doc;
};
const num = (value, fallback = 0) => {
    if (value === '' || value === null || value === undefined) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) throw httpError(400, 'Nieprawidłowa liczba');
    return n;
};
const round = (v, d = 2) => Math.round((Number(v) || 0) * 10 ** d) / 10 ** d;
const text = (v, max) => String(v ?? '').trim().slice(0, max);

/** Zdjęcia z panelu: tablica data-URL (JPEG/PNG/WebP) → bufory JPEG 1600 px. */
async function photosFrom(body, max) {
    const list = Array.isArray(body?.photos) ? body.photos : [];
    if (list.length > max) throw httpError(400, `Maksymalnie ${max} zdjęć naraz.`);
    for (const d of list) {
        if (typeof d !== 'string' || d.length > 1_400_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(d)) throw httpError(400, 'Nieprawidłowy plik zdjęcia.');
    }
    return preparePhotos(list.map(data => ({ data })));
}

function sendPhoto(res, photo, name) {
    if (!photo) return res.sendStatus(404);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', `inline; filename="${name}.jpg"`);
    res.type(photo.contentType || 'image/jpeg').send(photo.data);
}

/*
|--------------------------------------------------------------------------
| Magazyn — miejsca i zajętość
|--------------------------------------------------------------------------
*/

const UNIT_KINDS = ['boks', 'regal', 'strefa', 'kontener', 'inne'];

function unitPayload(body = {}) {
    const data = pick(body, ['name', 'kind', 'capacity', 'notes', 'active', 'order']);
    if (data.name !== undefined) data.name = text(data.name, 80);
    if (data.kind !== undefined && !UNIT_KINDS.includes(data.kind)) data.kind = 'inne';
    if (data.capacity !== undefined) data.capacity = Math.max(0, num(data.capacity));
    if (data.order !== undefined) data.order = num(data.order);
    if (data.active !== undefined) data.active = Boolean(data.active);
    return data;
}

/** Zajętość: objętość rzeczy „w magazynie” i „rezerwacje” per miejsce + suma. */
function occupancy(units, items) {
    const active = items.filter(i => i.status !== 'released');
    const rows = units.map(u => {
        const mine = active.filter(i => i.unit && String(i.unit) === String(u._id));
        const used = round(mine.filter(i => i.status === 'stored').reduce((s, i) => s + (i.volume || 0), 0), 1);
        const reserved = round(mine.filter(i => i.status === 'reserved').reduce((s, i) => s + (i.volume || 0), 0), 1);
        const capacity = u.capacity || 0;
        const pct = capacity ? Math.round(((used + reserved) / capacity) * 100) : null;
        return { ...u, used, reserved, free: capacity ? round(Math.max(0, capacity - used - reserved), 1) : null, pct, items: mine.length };
    });
    const capacity = round(units.filter(u => u.active !== false).reduce((s, u) => s + (u.capacity || 0), 0), 1);
    const used = round(active.filter(i => i.status === 'stored').reduce((s, i) => s + (i.volume || 0), 0), 1);
    const reserved = round(active.filter(i => i.status === 'reserved').reduce((s, i) => s + (i.volume || 0), 0), 1);
    const unassigned = round(active.filter(i => !i.unit).reduce((s, i) => s + (i.volume || 0), 0), 1);
    return {
        units: rows,
        totals: { capacity, used, reserved, free: capacity ? round(Math.max(0, capacity - used - reserved), 1) : null, pct: capacity ? Math.round(((used + reserved) / capacity) * 100) : null, unassigned }
    };
}

router.get('/storage-units', requireAdmin, asyncRoute(async (req, res) => {
    const [units, items] = await Promise.all([
        StorageUnit.find({}).sort({ active: -1, order: 1, name: 1 }).lean(),
        StorageItem.find({ status: { $ne: 'released' } }).select('unit volume status').lean()
    ]);
    res.json(occupancy(units, items));
}));

router.post('/storage-units', requireAdmin, asyncRoute(async (req, res) => {
    const data = unitPayload(req.body);
    if (!data.name) throw httpError(400, 'Podaj nazwę miejsca');
    const unit = await StorageUnit.create(data);
    res.status(201).json({ success: true, unit });
}));

router.put('/storage-units/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const unit = found(await StorageUnit.findByIdAndUpdate(req.params.id, unitPayload(req.body), { new: true, runValidators: true }), 'Nie znaleziono miejsca');
    res.json({ success: true, unit });
}));

router.delete('/storage-units/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const inUse = await StorageItem.countDocuments({ unit: req.params.id, status: { $ne: 'released' } });
    if (inUse) throw httpError(409, `W tym miejscu są rzeczy (${inUse}). Przenieś je albo wydaj przed usunięciem.`);
    found(await StorageUnit.findByIdAndDelete(req.params.id), 'Nie znaleziono miejsca');
    await StorageItem.updateMany({ unit: req.params.id }, { $set: { unit: null } });
    res.json({ success: true });
}));

/* Przypisanie pozycji do miejsca (z kontrolą pojemności — ostrzeżenie, nie blokada). */
router.post('/storage/:id/unit', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const unitId = req.body?.unit;
    if (unitId && !isObjectId(unitId)) throw httpError(400, 'Nieprawidłowe miejsce');
    const unit = unitId ? found(await StorageUnit.findById(unitId).lean(), 'Nie znaleziono miejsca') : null;
    const item = found(await StorageItem.findByIdAndUpdate(req.params.id, { unit: unit ? unit._id : null, ...(unit ? { location: unit.name } : {}) }, { new: true }), 'Nie znaleziono pozycji');
    res.json({ success: true, item });
}));

/* Zdjęcia rzeczy w magazynie */
router.post('/storage/:id/photos', requireAdmin, validateId, bigJson, asyncRoute(async (req, res) => {
    const item = found(await StorageItem.findById(req.params.id).select('+photos'), 'Nie znaleziono pozycji');
    const photos = await photosFrom(req.body, 8);
    if (item.photos.length + photos.length > 12) throw httpError(400, 'Maksymalnie 12 zdjęć na pozycję magazynu.');
    item.photos.push(...photos.map(p => ({ ...p, addedAt: new Date() })));
    item.photoCount = item.photos.length;
    await item.save();
    res.status(201).json({ success: true, photoCount: item.photoCount });
}));

router.get('/storage/:id/photos/:index', requireAdmin, validateId, asyncRoute(async (req, res) => {
    if (!/^\d{1,2}$/.test(req.params.index)) return res.sendStatus(404);
    const item = await StorageItem.findById(req.params.id).select('+photos');
    sendPhoto(res, item?.photos?.[Number(req.params.index)], 'magazyn');
}));

router.delete('/storage/:id/photos/:index', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const item = found(await StorageItem.findById(req.params.id).select('+photos'), 'Nie znaleziono pozycji');
    const i = Number(req.params.index);
    if (!Number.isInteger(i) || !item.photos[i]) throw httpError(404, 'Nie znaleziono zdjęcia');
    item.photos.splice(i, 1);
    item.photoCount = item.photos.length;
    await item.save();
    res.json({ success: true, photoCount: item.photoCount });
}));

/*
|--------------------------------------------------------------------------
| Sortownia
|--------------------------------------------------------------------------
*/

const BIN_FIELDS = ['name', 'fraction', 'wasteCode', 'unit', 'capacity', 'warnAt', 'pricePerUnit', 'location', 'destination', 'color', 'notes', 'active', 'order'];

function binPayload(body = {}) {
    const data = pick(body, BIN_FIELDS);
    for (const k of ['name', 'fraction', 'location', 'destination', 'color']) if (data[k] !== undefined) data[k] = text(data[k], k === 'destination' ? 160 : 80);
    if (data.wasteCode !== undefined) data.wasteCode = text(data.wasteCode, 20);
    if (data.notes !== undefined) data.notes = text(data.notes, 1000);
    if (data.unit !== undefined && !SORTING_UNITS.includes(data.unit)) throw httpError(400, 'Nieprawidłowa jednostka');
    if (data.capacity !== undefined) data.capacity = Math.max(0, num(data.capacity));
    if (data.warnAt !== undefined) data.warnAt = Math.min(100, Math.max(10, num(data.warnAt, 80)));
    if (data.pricePerUnit !== undefined) data.pricePerUnit = num(data.pricePerUnit);
    if (data.order !== undefined) data.order = num(data.order);
    if (data.active !== undefined) data.active = Boolean(data.active);
    return data;
}

/** Stan pojemnika: procent zapełnienia i co trzeba zrobić. */
function binState(b) {
    const pct = b.capacity ? Math.round((b.current / b.capacity) * 100) : null;
    let status = 'none';
    if (pct !== null) status = pct >= 100 ? 'full' : pct >= (b.warnAt || 80) ? 'warn' : 'ok';
    return { ...b, pct, status, free: b.capacity ? round(Math.max(0, b.capacity - b.current)) : null, value: round((b.current || 0) * (b.pricePerUnit || 0)) };
}

const entryOut = e => ({ ...e, photos: undefined });

router.get('/sorting', asyncRoute(async (req, res) => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [bins, recent, monthAgg] = await Promise.all([
        SortingBin.find(req.query.all === '1' ? {} : { active: true }).sort({ order: 1, name: 1 }).lean(),
        SortingEntry.find({}).sort({ createdAt: -1 }).limit(Math.min(200, Number(req.query.limit) || 40)).lean(),
        SortingEntry.aggregate([
            { $match: { createdAt: { $gte: monthStart } } },
            { $group: { _id: '$kind', weight: { $sum: '$weightKg' }, value: { $sum: '$value' }, count: { $sum: 1 } } }
        ])
    ]);
    const list = bins.map(binState);
    const month = Object.fromEntries(monthAgg.map(m => [m._id, { weight: round(m.weight, 1), value: round(m.value), count: m.count }]));
    res.json({
        bins: list,
        entries: recent.map(entryOut),
        summary: {
            bins: list.length,
            toEmpty: list.filter(b => b.status === 'warn' || b.status === 'full').length,
            full: list.filter(b => b.status === 'full').length,
            weightNow: round(list.reduce((s, b) => s + (b.currentWeight || 0), 0), 1),
            valueNow: round(list.reduce((s, b) => s + b.value, 0)),
            monthIn: month.in || { weight: 0, value: 0, count: 0 },
            monthOut: month.out || { weight: 0, value: 0, count: 0 }
        }
    });
}));

router.get('/sorting/bins/:id/entries', validateId, asyncRoute(async (req, res) => {
    const entries = await SortingEntry.find({ bin: req.params.id }).sort({ createdAt: -1 }).limit(300).lean();
    res.json({ entries: entries.map(entryOut) });
}));

router.post('/sorting/bins', requireAdmin, asyncRoute(async (req, res) => {
    const data = binPayload(req.body);
    if (!data.name) throw httpError(400, 'Podaj nazwę pojemnika / frakcji');
    const bin = await SortingBin.create(data);
    await recordActivity('sorting_bin', `Sortownia: nowy pojemnik „${bin.name}”`, 'SortingBin', bin._id, req.user.name);
    res.status(201).json({ success: true, bin: binState(bin.toObject()) });
}));

router.put('/sorting/bins/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const bin = found(await SortingBin.findByIdAndUpdate(req.params.id, binPayload(req.body), { new: true, runValidators: true }).lean(), 'Nie znaleziono pojemnika');
    res.json({ success: true, bin: binState(bin) });
}));

router.delete('/sorting/bins/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const bin = found(await SortingBin.findById(req.params.id), 'Nie znaleziono pojemnika');
    const entries = await SortingEntry.countDocuments({ bin: bin._id });
    if (entries && req.query.force !== '1') {
        // Pojemnik z historią archiwizujemy, żeby nie zgubić ewidencji.
        bin.active = false;
        await bin.save();
        return res.json({ success: true, archived: true });
    }
    await SortingEntry.deleteMany({ bin: bin._id });
    await bin.deleteOne();
    res.json({ success: true });
}));

async function maybeAlert(bin, actor) {
    const s = binState(bin);
    if ((s.status !== 'warn' && s.status !== 'full') || bin.alertSentAt) return;
    await SortingBin.updateOne({ _id: bin._id, alertSentAt: null }, { $set: { alertSentAt: new Date() } });
    void notify.notify({
        type: 'sorting',
        title: s.status === 'full' ? `🗑️ Sortownia: „${bin.name}” pełny — opróżnij` : `Sortownia: „${bin.name}” zapełniony w ${s.pct}%`,
        body: `${round(bin.current)} / ${bin.capacity} ${bin.unit}${bin.destination ? ' · odbiór: ' + bin.destination : ''}`,
        url: '/revmi/#/sortownia',
        recipients: await notify.adminKeys(),
        exclude: [userKeyOf(actor)].filter(k => k !== 'admin'),
        dedupeKey: `sorting:${bin._id}:${new Date().toISOString().slice(0, 13)}`
    });
}

/* Przyjęcie na sortownię */
router.post('/sorting/bins/:id/entries', validateId, bigJson, asyncRoute(async (req, res) => {
    const bin = found(await SortingBin.findById(req.params.id).lean(), 'Nie znaleziono pojemnika');
    const b = req.body || {};
    let amount = num(b.amount, NaN);
    let weightKg = Math.max(0, num(b.weightKg, 0));
    let quantity = Math.max(0, num(b.quantity, 0));
    if (!Number.isFinite(amount)) amount = bin.unit === 'kg' ? weightKg : bin.unit === 'szt' ? quantity : NaN;
    if (!Number.isFinite(amount) || amount <= 0) throw httpError(400, `Podaj ilość (${bin.unit === 'm3' ? 'm³' : bin.unit}).`);
    if (amount > 1_000_000) throw httpError(400, 'Za duża ilość');
    if (bin.unit === 'kg' && !weightKg) weightKg = amount;
    if (bin.unit === 'szt' && !quantity) quantity = amount;
    const photos = await photosFrom(b, 6);
    let task = null;
    if (b.task && isObjectId(b.task)) task = await Task.findById(b.task).select('number').lean();
    const entry = await SortingEntry.create({
        bin: bin._id, binName: bin.name, kind: 'in',
        amount: round(amount, 3), weightKg: round(weightKg, 2), quantity: round(quantity, 2),
        item: text(b.item, 160), note: text(b.note, 1000),
        value: round(amount * (bin.pricePerUnit || 0)),
        task: task?._id || null, taskNumber: task?.number || text(b.taskNumber, 40),
        photos, photoCount: photos.length, createdBy: req.user.name
    });
    const updated = await SortingBin.findByIdAndUpdate(bin._id, { $inc: { current: round(amount, 3), currentWeight: round(weightKg, 2), currentQty: round(quantity, 2) } }, { new: true }).lean();
    await maybeAlert(updated, req.user);
    void recordActivity('sorting_in', `Sortownia „${bin.name}”: +${round(amount, 2)} ${bin.unit}${entry.item ? ' · ' + entry.item : ''}`, 'SortingBin', bin._id, req.user.name);
    res.status(201).json({ success: true, entry: entryOut(entry.toObject()), bin: binState(updated) });
}));

/* Opróżnienie (całość albo część) — odbiór przez firmę, PSZOK, skup itp. */
router.post('/sorting/bins/:id/empty', validateId, asyncRoute(async (req, res) => {
    const bin = found(await SortingBin.findById(req.params.id).lean(), 'Nie znaleziono pojemnika');
    const b = req.body || {};
    const all = b.amount === undefined || b.amount === null || b.amount === '';
    const amount = all ? bin.current : Math.min(bin.current, Math.max(0, num(b.amount)));
    if (!amount) throw httpError(400, 'Pojemnik jest pusty.');
    const share = bin.current ? amount / bin.current : 1;
    const weightKg = round(all ? bin.currentWeight : bin.currentWeight * share, 2);
    const quantity = round(all ? bin.currentQty : bin.currentQty * share, 2);
    const entry = await SortingEntry.create({
        bin: bin._id, binName: bin.name, kind: 'out',
        amount: -round(amount, 3), weightKg, quantity,
        destination: text(b.destination || bin.destination, 160), note: text(b.note, 1000),
        value: round(num(b.value, 0)), createdBy: req.user.name
    });
    const set = all
        ? { current: 0, currentWeight: 0, currentQty: 0 }
        : { current: round(bin.current - amount, 3), currentWeight: round(Math.max(0, bin.currentWeight - weightKg), 2), currentQty: round(Math.max(0, bin.currentQty - quantity), 2) };
    const updated = await SortingBin.findByIdAndUpdate(bin._id, { $set: { ...set, lastEmptiedAt: new Date(), alertSentAt: null } }, { new: true }).lean();
    void recordActivity('sorting_out', `Sortownia „${bin.name}”: opróżniono ${round(amount, 2)} ${bin.unit}${entry.destination ? ' → ' + entry.destination : ''}`, 'SortingBin', bin._id, req.user.name);
    res.json({ success: true, entry: entryOut(entry.toObject()), bin: binState(updated) });
}));

/* Korekta stanu (inwentaryzacja) — tylko administrator */
router.post('/sorting/bins/:id/adjust', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const bin = found(await SortingBin.findById(req.params.id).lean(), 'Nie znaleziono pojemnika');
    const current = Math.max(0, num(req.body?.current));
    const currentWeight = req.body?.currentWeight === undefined ? (bin.unit === 'kg' ? current : bin.currentWeight) : Math.max(0, num(req.body.currentWeight));
    const currentQty = req.body?.currentQty === undefined ? (bin.unit === 'szt' ? current : bin.currentQty) : Math.max(0, num(req.body.currentQty));
    await SortingEntry.create({ bin: bin._id, binName: bin.name, kind: 'adjust', amount: round(current - bin.current, 3), weightKg: Math.abs(round(currentWeight - bin.currentWeight, 2)), note: text(req.body?.note, 1000) || 'Korekta stanu', createdBy: req.user.name });
    const updated = await SortingBin.findByIdAndUpdate(bin._id, { $set: { current, currentWeight, currentQty } }, { new: true }).lean();
    await maybeAlert(updated, req.user);
    res.json({ success: true, bin: binState(updated) });
}));

router.get('/sorting/entries/:id/photos/:index', validateId, asyncRoute(async (req, res) => {
    if (!/^[0-9]$/.test(req.params.index)) return res.sendStatus(404);
    const entry = await SortingEntry.findById(req.params.id).select('+photos');
    sendPhoto(res, entry?.photos?.[Number(req.params.index)], 'sortownia');
}));

/* Usunięcie wpisu cofa jego wpływ na stan pojemnika. */
router.delete('/sorting/entries/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const entry = found(await SortingEntry.findById(req.params.id).lean(), 'Nie znaleziono wpisu');
    if (entry.kind === 'in') {
        const bin = await SortingBin.findById(entry.bin).lean();
        if (bin) await SortingBin.updateOne({ _id: bin._id }, { $set: {
            current: round(Math.max(0, bin.current - entry.amount), 3),
            currentWeight: round(Math.max(0, bin.currentWeight - entry.weightKg), 2),
            currentQty: round(Math.max(0, bin.currentQty - entry.quantity), 2)
        } });
    }
    await SortingEntry.deleteOne({ _id: entry._id });
    res.json({ success: true });
}));

/*
|--------------------------------------------------------------------------
| Wycena AI — ponowne przeliczenie zgłoszenia (np. po dodaniu klucza Claude API)
|--------------------------------------------------------------------------
*/

router.post('/tasks/:id/ai-quote', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const task = found(await Task.findById(req.params.id).select('+aiInput +quotePhotos'), 'Nie znaleziono zlecenia');
    if (!task.aiInput) throw httpError(400, 'To zgłoszenie nie pochodzi z formularza „Wycena AI”.');
    const q = { ...task.aiInput, photos: (task.quotePhotos || []).map(() => '') };
    const estimate = await aiQuote.estimateQuote(q, (task.quotePhotos || []).map(p => p.data));
    await Task.updateOne({ _id: task._id }, { $set: { aiEstimate: estimate } });
    await recordActivity('ai_quote', `Ponowna wycena AI ${task.number}: ${estimate.low}–${estimate.high} zł${estimate.source === 'ai' ? '' : ' (bez AI: ' + estimate.error + ')'}`, 'Task', task._id, req.user.name);
    res.json({ success: true, aiEstimate: estimate });
}));

module.exports = router;
module.exports._internal = { occupancy, binState, binPayload, unitPayload };
