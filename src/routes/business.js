'use strict';

/**
 * RevMi 4.0 — moduły biznesowe: abonamenty, oferty, magazyn (RevStorage),
 * cennik, raporty i globalna wyszukiwarka.
 */
const express = require('express');
const {
    Contract, Offer, StorageItem, PriceItem, Task, Income, Expense, Client, Message, PadNote,
    CONTRACT_STATUSES, OFFER_STATUSES, STORAGE_STATUSES
} = require('../models');
const { requireAdmin, validateId } = require('../middleware/auth');
const { asyncRoute, httpError, pick, isObjectId, escapeRegex, money, userKeyOf } = require('../utils');
const { recordActivity } = require('../services/activity');
const { getSettings } = require('../services/settings');
const { nextNumber } = require('../services/numbers');
const { isDivision, divisionName, SLUGS } = require('../../lib/divisions');

const router = express.Router();

const found = (doc, message = 'Nie znaleziono') => {
    if (!doc) throw httpError(404, message);
    return doc;
};
const toDate = (value, label) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw httpError(400, `Nieprawidłowa data: ${label}`);
    return date;
};
const toNumber = (value, fallback = 0) => (value === '' || value === null || value === undefined ? fallback : Number(value));
const division = value => (isDivision(value) ? value : '');

/*
|--------------------------------------------------------------------------
| Abonamenty (RevFacility, Winter Care, B2B)
|--------------------------------------------------------------------------
*/

/** Najbliższy dzień rozliczenia (dzień miesiąca 1–28) nie wcześniej niż `from`. */
function nextBillingDate(from, billingDay) {
    const day = Math.min(Math.max(Number(billingDay) || 1, 1), 28);
    const base = new Date(from);
    let candidate = new Date(base.getFullYear(), base.getMonth(), day, 9, 0, 0);
    if (candidate < new Date(base.getFullYear(), base.getMonth(), base.getDate())) {
        candidate = new Date(base.getFullYear(), base.getMonth() + 1, day, 9, 0, 0);
    }
    return candidate;
}

/** Ten sam dzień rozliczenia w następnym miesiącu. */
function followingBillingDate(current, billingDay) {
    const d = new Date(current);
    return new Date(d.getFullYear(), d.getMonth() + 1, Math.min(Math.max(Number(billingDay) || 1, 1), 28), 9, 0, 0);
}

const CONTRACT_FIELDS = ['title', 'client', 'clientName', 'clientPhone', 'clientEmail', 'address', 'division', 'services', 'scope', 'monthlyPrice', 'vatRate', 'billingDay', 'startDate', 'endDate', 'nextBillingDate', 'status', 'notes'];

function contractPayload(body = {}) {
    const data = pick(body, CONTRACT_FIELDS);
    if (data.client !== undefined && !isObjectId(data.client)) data.client = null;
    if (data.division !== undefined) data.division = division(data.division);
    if (data.services !== undefined) {
        const raw = Array.isArray(data.services) ? data.services : String(data.services || '').split(/[\n,]/);
        data.services = raw.map(s => String(s).trim().slice(0, 120)).filter(Boolean).slice(0, 40);
    }
    for (const key of ['monthlyPrice', 'vatRate', 'billingDay']) if (data[key] !== undefined) data[key] = toNumber(data[key], key === 'billingDay' ? 1 : key === 'vatRate' ? 23 : 0);
    for (const key of ['startDate', 'endDate', 'nextBillingDate']) if (data[key] !== undefined) data[key] = toDate(data[key], key);
    if (data.status !== undefined && !CONTRACT_STATUSES.includes(data.status)) throw httpError(400, 'Nieprawidłowy status abonamentu');
    return data;
}

router.get('/contracts', requireAdmin, asyncRoute(async (req, res) => {
    const contracts = await Contract.find({}).sort({ status: 1, nextBillingDate: 1 }).lean();
    const active = contracts.filter(c => c.status === 'active');
    res.json({ contracts, mrr: active.reduce((s, c) => s + (c.monthlyPrice || 0), 0), activeCount: active.length });
}));

router.post('/contracts', requireAdmin, asyncRoute(async (req, res) => {
    const data = contractPayload(req.body);
    if (!data.title) throw httpError(400, 'Podaj nazwę abonamentu');
    const start = data.startDate || new Date();
    const contract = await Contract.create({
        ...data,
        startDate: start,
        nextBillingDate: data.nextBillingDate || nextBillingDate(start, data.billingDay),
        number: await nextNumber('AB'),
        createdBy: req.user.name
    });
    await recordActivity('contract_created', `Nowy abonament ${contract.number}: ${contract.title} (${money(contract.monthlyPrice)}/mies.)`, 'Contract', contract._id, req.user.name);
    res.status(201).json({ success: true, contract });
}));

router.put('/contracts/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const contract = found(await Contract.findById(req.params.id), 'Nie znaleziono abonamentu');
    const data = contractPayload(req.body);
    Object.assign(contract, data);
    if ((data.billingDay !== undefined || data.status === 'active') && data.nextBillingDate === undefined && contract.status === 'active' && !contract.nextBillingDate) {
        contract.nextBillingDate = nextBillingDate(new Date(), contract.billingDay);
    }
    await contract.save();
    res.json({ success: true, contract });
}));

router.delete('/contracts/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const contract = found(await Contract.findByIdAndDelete(req.params.id), 'Nie znaleziono abonamentu');
    await recordActivity('contract_deleted', `Usunięto abonament ${contract.number}: ${contract.title}`, 'Contract', null, req.user.name);
    res.json({ success: true });
}));

/** Rozlicz bieżący okres: zapisuje przychód i przesuwa termin na kolejny miesiąc. */
router.post('/contracts/:id/bill', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const contract = found(await Contract.findById(req.params.id), 'Nie znaleziono abonamentu');
    const amount = toNumber(req.body?.amount, contract.monthlyPrice);
    if (!(amount >= 0)) throw httpError(400, 'Nieprawidłowa kwota');
    const date = toDate(req.body?.date, 'data') || new Date();
    let income = null;
    if (req.body?.createIncome !== false && amount > 0) {
        income = await Income.create({
            price: amount,
            category: 'Abonament',
            desc: `${contract.number} · ${contract.title}${contract.clientName ? ' · ' + contract.clientName : ''}`,
            date,
            client: contract.client || null,
            paymentMethod: String(req.body?.paymentMethod || 'Przelew').slice(0, 40)
        });
    }
    contract.billings.push({ date, amount, income: income?._id || null });
    if (contract.billings.length > 60) contract.billings = contract.billings.slice(-60);
    contract.lastBilledAt = date;
    contract.nextBillingDate = followingBillingDate(contract.nextBillingDate || date, contract.billingDay);
    await contract.save();
    await recordActivity('contract_billed', `Rozliczono abonament ${contract.number} (${money(amount)})`, 'Contract', contract._id, req.user.name);
    res.json({ success: true, contract, income });
}));

/*
|--------------------------------------------------------------------------
| Oferty i kosztorysy
|--------------------------------------------------------------------------
*/

const OFFER_FIELDS = ['title', 'status', 'division', 'client', 'clientName', 'clientCompany', 'clientNip', 'clientEmail', 'clientPhone', 'clientAddress', 'items', 'discount', 'terms', 'notes', 'validUntil', 'message'];

function offerPayload(body = {}) {
    const data = pick(body, OFFER_FIELDS);
    if (data.client !== undefined && !isObjectId(data.client)) data.client = null;
    if (data.message !== undefined && !isObjectId(data.message)) data.message = null;
    if (data.division !== undefined) data.division = division(data.division);
    if (data.status !== undefined && !OFFER_STATUSES.includes(data.status)) throw httpError(400, 'Nieprawidłowy status oferty');
    if (data.discount !== undefined) data.discount = Math.min(Math.max(toNumber(data.discount), 0), 100);
    if (data.validUntil !== undefined) data.validUntil = toDate(data.validUntil, 'ważna do');
    if (data.items !== undefined) {
        data.items = (Array.isArray(data.items) ? data.items : []).slice(0, 80)
            .filter(item => item && String(item.name || '').trim())
            .map(item => ({
                name: String(item.name).trim().slice(0, 200),
                qty: Math.max(0, toNumber(item.qty, 1)),
                unit: String(item.unit || 'usł.').slice(0, 20),
                price: Math.max(0, toNumber(item.price)),
                vatRate: [0, 5, 8, 23].includes(Number(item.vatRate)) ? Number(item.vatRate) : 23
            }));
    }
    return data;
}

function stampStatus(offer, status) {
    if (status === 'sent' && !offer.sentAt) offer.sentAt = new Date();
    if (['accepted', 'rejected'].includes(status)) offer.decidedAt = new Date();
}

router.get('/offers', requireAdmin, asyncRoute(async (req, res) => {
    const filter = req.query.status && OFFER_STATUSES.includes(req.query.status) ? { status: req.query.status } : {};
    const offers = await Offer.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ offers });
}));

router.get('/offers/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const offer = found(await Offer.findById(req.params.id).lean(), 'Nie znaleziono oferty');
    res.json({ offer, company: await getSettings() });
}));

router.post('/offers', requireAdmin, asyncRoute(async (req, res) => {
    const data = offerPayload(req.body);
    if (!data.title) throw httpError(400, 'Podaj tytuł oferty');
    const settings = await getSettings();
    const offer = new Offer({
        status: 'draft',
        terms: settings.offerTerms,
        validUntil: new Date(Date.now() + 14 * 86_400_000),
        ...data,
        number: await nextNumber('OF', { monthly: true }),
        createdBy: req.user.name
    });
    stampStatus(offer, offer.status);
    await offer.save();
    await recordActivity('offer_created', `Nowa oferta ${offer.number}: ${offer.title} (${money(offer.totals.gross)} brutto)`, 'Offer', offer._id, req.user.name);
    res.status(201).json({ success: true, offer });
}));

router.put('/offers/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const offer = found(await Offer.findById(req.params.id), 'Nie znaleziono oferty');
    const data = offerPayload(req.body);
    if (data.status && data.status !== offer.status) stampStatus(offer, data.status);
    Object.assign(offer, data);
    await offer.save();
    res.json({ success: true, offer });
}));

router.delete('/offers/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const offer = found(await Offer.findByIdAndDelete(req.params.id), 'Nie znaleziono oferty');
    await recordActivity('offer_deleted', `Usunięto ofertę ${offer.number}`, 'Offer', null, req.user.name);
    res.json({ success: true });
}));

router.post('/offers/:id/duplicate', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const source = found(await Offer.findById(req.params.id).lean(), 'Nie znaleziono oferty');
    const { _id, number, createdAt, updatedAt, sentAt, decidedAt, task, totals, ...rest } = source;
    const offer = await Offer.create({ ...rest, title: `${source.title} (kopia)`, status: 'draft', validUntil: new Date(Date.now() + 14 * 86_400_000), number: await nextNumber('OF', { monthly: true }), createdBy: req.user.name });
    res.status(201).json({ success: true, offer });
}));

/** Zaakceptowana oferta → zlecenie w panelu (status „Wycenione”). */
router.post('/offers/:id/task', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const offer = found(await Offer.findById(req.params.id), 'Nie znaleziono oferty');
    if (offer.task) {
        const existing = await Task.findById(offer.task).lean();
        if (existing) return res.json({ success: true, task: existing, existing: true });
    }
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(8, 0, 0, 0);
    const task = await Task.create({
        name: offer.title,
        type: divisionName(offer.division) || 'Inne',
        division: offer.division,
        status: 'quoted',
        price: offer.totals.gross,
        dateStart: start,
        client: offer.client || null,
        clientName: (offer.clientCompany ? `${offer.clientCompany}${offer.clientName ? ' (' + offer.clientName + ')' : ''}` : offer.clientName).slice(0, 140),
        clientPhone: offer.clientPhone,
        clientEmail: offer.clientEmail,
        address: offer.clientAddress,
        desc: (`Oferta ${offer.number}\n` + offer.items.map(i => `• ${i.name} — ${i.qty} ${i.unit} × ${money(i.price)}`).join('\n') + (offer.notes ? `\n\n${offer.notes}` : '')).slice(0, 4000),
        source: 'Oferta',
        createdBy: req.user.name
    });
    offer.task = task._id;
    if (offer.status !== 'accepted') {
        offer.status = 'accepted';
        offer.decidedAt = new Date();
    }
    await offer.save();
    await recordActivity('task_created', `Utworzono zlecenie ${task.number} z oferty ${offer.number}`, 'Task', task._id, req.user.name);
    res.status(201).json({ success: true, task: task.toObject(), offer });
}));

/*
|--------------------------------------------------------------------------
| Magazyn — RevStorage
|--------------------------------------------------------------------------
*/

const STORAGE_FIELDS = ['client', 'clientName', 'clientPhone', 'description', 'inventory', 'location', 'volume', 'startDate', 'endDate', 'monthlyPrice', 'status', 'pickupAddress', 'notes'];

function storagePayload(body = {}) {
    const data = pick(body, STORAGE_FIELDS);
    if (data.client !== undefined && !isObjectId(data.client)) data.client = null;
    for (const key of ['volume', 'monthlyPrice']) if (data[key] !== undefined) data[key] = Math.max(0, toNumber(data[key]));
    for (const key of ['startDate', 'endDate']) if (data[key] !== undefined) data[key] = toDate(data[key], key);
    if (data.status !== undefined && !STORAGE_STATUSES.includes(data.status)) throw httpError(400, 'Nieprawidłowy status');
    return data;
}

router.get('/storage', requireAdmin, asyncRoute(async (req, res) => {
    const items = await StorageItem.find(req.query.all === '1' ? {} : { status: { $ne: 'released' } }).sort({ status: 1, endDate: 1 }).lean();
    const stored = items.filter(i => i.status === 'stored');
    res.json({
        items,
        summary: {
            stored: stored.length,
            reserved: items.filter(i => i.status === 'reserved').length,
            volume: Math.round(stored.reduce((s, i) => s + (i.volume || 0), 0) * 10) / 10,
            monthly: stored.reduce((s, i) => s + (i.monthlyPrice || 0), 0)
        }
    });
}));

router.post('/storage', requireAdmin, asyncRoute(async (req, res) => {
    const data = storagePayload(req.body);
    const item = await StorageItem.create({ ...data, number: await nextNumber('MG') });
    await recordActivity('storage_created', `Magazyn ${item.number}: ${item.description} (${item.clientName})`, 'StorageItem', item._id, req.user.name);
    res.status(201).json({ success: true, item });
}));

router.put('/storage/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const data = storagePayload(req.body);
    if (data.status === 'released') data.releasedAt = new Date();
    const item = found(await StorageItem.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true }), 'Nie znaleziono pozycji');
    res.json({ success: true, item });
}));

router.post('/storage/:id/release', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const item = found(await StorageItem.findByIdAndUpdate(req.params.id, { status: 'released', releasedAt: new Date() }, { new: true }), 'Nie znaleziono pozycji');
    await recordActivity('storage_released', `Wydano z magazynu ${item.number}: ${item.description}`, 'StorageItem', item._id, req.user.name);
    res.json({ success: true, item });
}));

router.delete('/storage/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    found(await StorageItem.findByIdAndDelete(req.params.id), 'Nie znaleziono pozycji');
    res.json({ success: true });
}));

/*
|--------------------------------------------------------------------------
| Cennik usług (do szybkich ofert)
|--------------------------------------------------------------------------
*/

const PRICE_FIELDS = ['name', 'division', 'unit', 'price', 'priceMax', 'vatRate', 'description', 'active'];

function pricePayload(body = {}) {
    const data = pick(body, PRICE_FIELDS);
    if (data.division !== undefined) data.division = division(data.division);
    if (data.price !== undefined) data.price = Math.max(0, toNumber(data.price));
    if (data.priceMax !== undefined) data.priceMax = data.priceMax === '' || data.priceMax === null ? null : Math.max(0, toNumber(data.priceMax));
    if (data.vatRate !== undefined) data.vatRate = [0, 5, 8, 23].includes(Number(data.vatRate)) ? Number(data.vatRate) : 23;
    if (data.active !== undefined) data.active = Boolean(data.active);
    return data;
}

router.get('/pricelist', requireAdmin, asyncRoute(async (req, res) => {
    res.json({ items: await PriceItem.find(req.query.all === '1' ? {} : { active: true }).sort({ division: 1, name: 1 }).lean() });
}));

router.post('/pricelist', requireAdmin, asyncRoute(async (req, res) => {
    const item = await PriceItem.create(pricePayload(req.body));
    res.status(201).json({ success: true, item });
}));

router.put('/pricelist/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const item = found(await PriceItem.findByIdAndUpdate(req.params.id, pricePayload(req.body), { new: true, runValidators: true }), 'Nie znaleziono pozycji');
    res.json({ success: true, item });
}));

router.delete('/pricelist/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    found(await PriceItem.findByIdAndDelete(req.params.id), 'Nie znaleziono pozycji');
    res.json({ success: true });
}));

/*
|--------------------------------------------------------------------------
| Raporty
|--------------------------------------------------------------------------
*/

router.get('/reports', requireAdmin, asyncRoute(async (req, res) => {
    const year = Math.min(Math.max(Number(req.query.year) || new Date().getFullYear(), 2020), 2100);
    const from = new Date(year, 0, 1);
    const to = new Date(year + 1, 0, 1);
    const tz = process.env.TZ;
    const month = field => ({ $month: { date: field, timezone: tz } });
    const value = { $ifNull: ['$finalPrice', '$price'] };

    const [completedByMonth, incomesByMonth, expensesByMonth, byDivision, quotesByDivision, bySource, topClients, messagesByTopic, contracts, storage] = await Promise.all([
        Task.aggregate([{ $match: { status: 'completed', completedAt: { $gte: from, $lt: to } } }, { $group: { _id: month('$completedAt'), total: { $sum: value }, count: { $sum: 1 } } }]),
        Income.aggregate([{ $match: { date: { $gte: from, $lt: to } } }, { $group: { _id: month('$date'), total: { $sum: '$price' } } }]),
        Expense.aggregate([{ $match: { date: { $gte: from, $lt: to } } }, { $group: { _id: month('$date'), total: { $sum: '$price' } } }]),
        Task.aggregate([{ $match: { status: 'completed', completedAt: { $gte: from, $lt: to } } }, { $group: { _id: '$division', total: { $sum: value }, count: { $sum: 1 } } }]),
        Task.aggregate([{ $match: { source: { $in: ['Formularz WWW', 'Formularz kontaktowy'] }, createdAt: { $gte: from, $lt: to } } },
            { $group: { _id: '$division', total: { $sum: 1 }, won: { $sum: { $cond: [{ $in: ['$status', ['quoted', 'planned', 'progress', 'completed']] }, 1, 0] } } } }]),
        Task.aggregate([{ $match: { createdAt: { $gte: from, $lt: to } } }, { $group: { _id: '$source', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
        Task.aggregate([{ $match: { status: 'completed', completedAt: { $gte: from, $lt: to }, clientName: { $ne: '' } } },
            { $group: { _id: '$clientName', total: { $sum: value }, count: { $sum: 1 } } }, { $sort: { total: -1 } }, { $limit: 10 }]),
        Message.aggregate([{ $match: { createdAt: { $gte: from, $lt: to } } }, { $group: { _id: '$topic', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
        Contract.find({ status: 'active' }).select('monthlyPrice division').lean(),
        StorageItem.find({ status: 'stored' }).select('monthlyPrice volume').lean()
    ]);

    const months = Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const tasks = completedByMonth.find(r => r._id === m);
        const revenue = (tasks?.total || 0) + (incomesByMonth.find(r => r._id === m)?.total || 0);
        const expenses = expensesByMonth.find(r => r._id === m)?.total || 0;
        return { month: m, label: new Date(year, i, 1).toLocaleDateString('pl-PL', { month: 'short' }), revenue, expenses, profit: revenue - expenses, completed: tasks?.count || 0 };
    });

    const divisions = [...SLUGS, ''].map(slug => {
        const done = byDivision.find(r => (r._id || '') === slug);
        const quotes = quotesByDivision.find(r => (r._id || '') === slug);
        const mrr = contracts.filter(c => (c.division || '') === slug).reduce((s, c) => s + (c.monthlyPrice || 0), 0);
        return { slug, name: divisionName(slug) || 'Bez działu', revenue: done?.total || 0, completed: done?.count || 0, quotes: quotes?.total || 0, won: quotes?.won || 0, mrr };
    }).filter(d => d.revenue || d.completed || d.quotes || d.mrr);

    const totals = months.reduce((acc, m) => ({ revenue: acc.revenue + m.revenue, expenses: acc.expenses + m.expenses, completed: acc.completed + m.completed }), { revenue: 0, expenses: 0, completed: 0 });
    res.json({
        year,
        months,
        totals: { ...totals, profit: totals.revenue - totals.expenses },
        divisions: divisions.sort((a, b) => b.revenue - a.revenue),
        sources: bySource.map(s => ({ source: s._id || 'Inne', count: s.count })),
        topClients: topClients.map(c => ({ name: c._id, total: c.total, count: c.count })),
        messages: messagesByTopic.map(m => ({ topic: m._id || 'Inne', count: m.count })),
        recurring: {
            mrr: contracts.reduce((s, c) => s + (c.monthlyPrice || 0), 0),
            contracts: contracts.length,
            storageMonthly: storage.reduce((s, i) => s + (i.monthlyPrice || 0), 0),
            storageVolume: Math.round(storage.reduce((s, i) => s + (i.volume || 0), 0) * 10) / 10
        }
    });
}));

/*
|--------------------------------------------------------------------------
| Wyszukiwarka globalna (Ctrl+K)
|--------------------------------------------------------------------------
*/

router.get('/search', asyncRoute(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q.length < 2) return res.json({ results: [] });
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    const admin = req.user.role === 'admin';
    const key = userKeyOf(req.user);
    const any = fields => ({ $or: fields.map(f => ({ [f]: rx })) });

    const [tasks, notes, clients, messages, offers, contracts, storage] = await Promise.all([
        Task.find(any(['name', 'number', 'clientName', 'clientPhone', 'address', 'type'])).sort({ dateStart: -1 }).limit(8).select('name number clientName status dateStart division').lean(),
        PadNote.find({ $and: [{ $or: [{ ownerKey: key }, { visibility: 'team' }] }, any(['title', 'content', 'tags', 'checklist.text'])] }).sort({ updatedAt: -1 }).limit(6).select('title content color').lean(),
        admin ? Client.find({ archived: false, ...any(['name', 'company', 'phone', 'email', 'nip']) }).limit(6).select('name company phone').lean() : [],
        admin ? Message.find(any(['name', 'company', 'email', 'phone', 'message', 'topic'])).sort({ createdAt: -1 }).limit(6).select('name company topic status createdAt').lean() : [],
        admin ? Offer.find(any(['number', 'title', 'clientName', 'clientCompany'])).sort({ createdAt: -1 }).limit(6).select('number title status totals').lean() : [],
        admin ? Contract.find(any(['number', 'title', 'clientName'])).limit(6).select('number title status monthlyPrice').lean() : [],
        admin ? StorageItem.find(any(['number', 'clientName', 'description', 'location', 'inventory'])).limit(6).select('number clientName description status').lean() : []
    ]);

    const results = [
        ...tasks.map(t => ({ type: 'task', id: t._id, title: t.name, sub: [t.number, t.clientName, divisionName(t.division)].filter(Boolean).join(' · '), url: `#/zlecenia/${t._id}` })),
        ...notes.map(n => ({ type: 'note', id: n._id, title: n.title || String(n.content || '').slice(0, 60) || 'Notatka', sub: String(n.content || '').slice(0, 90), url: `#/notatnik/${n._id}` })),
        ...clients.map(c => ({ type: 'client', id: c._id, title: c.name, sub: [c.company, c.phone].filter(Boolean).join(' · '), url: '#/klienci' })),
        ...messages.map(m => ({ type: 'message', id: m._id, title: m.company ? `${m.company} (${m.name})` : m.name, sub: m.topic, url: `#/wiadomosci/${m._id}` })),
        ...offers.map(o => ({ type: 'offer', id: o._id, title: o.title, sub: `${o.number} · ${money(o.totals?.gross)}`, url: `#/oferty/${o._id}` })),
        ...contracts.map(c => ({ type: 'contract', id: c._id, title: c.title, sub: `${c.number} · ${money(c.monthlyPrice)}/mies.`, url: '#/abonamenty' })),
        ...storage.map(s => ({ type: 'storage', id: s._id, title: s.description, sub: `${s.number} · ${s.clientName}`, url: '#/magazyn' }))
    ];
    res.json({ results });
}));

module.exports = router;
module.exports._internal = { nextBillingDate, followingBillingDate, offerPayload, contractPayload };
