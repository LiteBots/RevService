'use strict';

/**
 * 9.0: administracja nowych modułów w RevMi (wymaga logowania PIN-em administratora).
 * Prefiks: /api/v9/*
 *  - konta klientów + nadawanie dostępu B2B (hotel / partner), powiązanie zleceń i magazynu z kontem
 *  - RevOutlet (przedmioty, zdjęcia, rezerwacje), RevPowrót (kursy, rezerwacje)
 *  - abonamenty (plany, subskrypcje, wizyty → umowa w „Abonamentach”)
 *  - polecenia partnerów (statusy, prowizje), hotele (akceptacja stałych tras), rekrutacja
 */
const express = require('express');
const { Task, StorageItem, SortingEntry, Contract } = require('../models');
const V = require('../models-v9');
const P = require('../../lib/portal-input');
const portal = require('../services/portal');
const { preparePhotos } = require('../../lib/quote-input');
const { requireAdmin, validateId } = require('../middleware/auth');
const { asyncRoute, httpError, isObjectId, escapeRegex } = require('../utils');
const { recordActivity } = require('../services/activity');

const router = express.Router();
router.use('/v9', requireAdmin);

const found = (doc, message = 'Nie znaleziono') => {
    if (!doc) throw httpError(404, message);
    return doc;
};
const round2 = v => Math.round((Number(v) || 0) * 100) / 100;

/* ------------------------------------------------------------------ */
/* Liczniki do menu RevMi                                               */
/* ------------------------------------------------------------------ */

router.get('/v9/counts', asyncRoute(async (req, res) => {
    const [accounts, b2bPending, outletOrders, bookings, subs, referrals, routes, applications] = await Promise.all([
        V.Account.countDocuments({}),
        V.Account.countDocuments({ $or: [{ deletionRequestedAt: { $ne: null } }, { $expr: { $gt: [{ $size: { $setDifference: [{ $ifNull: ['$accessRequested', []] }, { $ifNull: ['$access', []] }] } }, 0] } }] }),
        V.OutletOrder.countDocuments({ status: 'new' }),
        V.TripBooking.countDocuments({ status: 'new' }),
        V.Subscription.countDocuments({ $or: [{ status: 'pending' }, { pauseRequestedAt: { $ne: null }, status: 'active' }] }),
        V.PartnerReferral.countDocuments({ status: 'new' }),
        V.HotelRoute.countDocuments({ approved: false, active: true }),
        V.JobApplication.countDocuments({ status: 'new' })
    ]);
    const [chatUnread, devLeads, newsletterPending] = await Promise.all([
        Task.countDocuments({ chatUnreadStaff: { $gt: 0 } }),
        V.DevLead.countDocuments({ status: 'new' }),
        V.Campaign.countDocuments({ status: { $in: ['sending', 'paused'] } })
    ]);
    res.json({ accounts, accountsAttention: b2bPending, outletOrders, bookings, subscriptions: subs, referrals, routes, applications, chatUnread, devLeads, campaignsRunning: newsletterPending });
}));

/* ================================================================== */
/* KONTA KLIENTÓW I DOSTĘP B2B                                          */
/* ================================================================== */

const accountView = a => ({
    _id: String(a._id),
    email: a.email,
    name: a.name,
    phone: a.phone,
    kind: a.kind,
    company: a.company,
    nip: a.nip,
    address: a.address,
    city: a.city,
    client: a.client ? String(a.client) : null,
    access: a.access || [],
    accessRequested: (a.accessRequested || []).filter(k => !(a.access || []).includes(k)),
    accessGrantedAt: a.accessGrantedAt,
    accessGrantedBy: a.accessGrantedBy,
    partner: a.partner || {},
    hotel: a.hotel || {},
    emailVerified: Boolean(a.emailVerified),
    status: a.status,
    marketingConsent: Boolean(a.marketingConsent),
    lastLoginAt: a.lastLoginAt,
    loginCount: a.loginCount || 0,
    deletionRequestedAt: a.deletionRequestedAt,
    adminNotes: a.adminNotes,
    createdAt: a.createdAt
});

router.get('/v9/accounts', asyncRoute(async (req, res) => {
    const filter = {};
    if (P.ACCESS_KINDS.includes(req.query.access)) filter.access = req.query.access;
    if (req.query.access === 'none') filter.access = { $size: 0 };
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    if (q) {
        const rx = new RegExp(escapeRegex(q), 'i');
        filter.$or = [{ email: rx }, { name: rx }, { company: rx }, { phone: rx }, { nip: rx }];
    }
    const accounts = await V.Account.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    const ids = accounts.map(a => a._id);
    const taskCounts = await Task.aggregate([{ $match: { account: { $in: ids } } }, { $group: { _id: '$account', n: { $sum: 1 }, value: { $sum: { $ifNull: ['$finalPrice', 0] } } } }]);
    const byId = new Map(taskCounts.map(t => [String(t._id), t]));
    res.json({
        accounts: accounts.map(a => ({ ...accountView(a), orders: byId.get(String(a._id))?.n || 0, value: round2(byId.get(String(a._id))?.value || 0) })),
        accessKinds: P.ACCESS_KINDS.map(k => ({ value: k, label: P.ACCESS_LABELS[k] }))
    });
}));

router.get('/v9/accounts/:id', validateId, asyncRoute(async (req, res) => {
    const account = found(await V.Account.findById(req.params.id).lean(), 'Nie znaleziono konta');
    const [tasks, storage, subs, properties, referrals] = await Promise.all([
        Task.find({ $or: [{ account: account._id }, ...(account.emailVerified ? [{ clientEmail: account.email }] : [])] }).select('number name status dateStart finalPrice price createdAt portalKind account').sort({ createdAt: -1 }).limit(100).lean(),
        StorageItem.find({ account: account._id }).select('number description status volume monthlyPrice').lean(),
        V.Subscription.find({ account: account._id }).select('number planName status price').lean(),
        V.HotelProperty.find({ account: account._id, active: true }).select('name address').lean(),
        V.PartnerReferral.countDocuments({ partner: account._id })
    ]);
    res.json({ account: accountView(account), tasks, storage, subscriptions: subs, properties, referrals });
}));

router.put('/v9/accounts/:id', validateId, asyncRoute(async (req, res) => {
    const account = found(await V.Account.findById(req.params.id), 'Nie znaleziono konta');
    const b = req.body || {};
    if (b.access !== undefined) {
        const access = (Array.isArray(b.access) ? b.access : []).filter(k => P.ACCESS_KINDS.includes(k));
        const added = access.filter(k => !account.access.includes(k));
        if (JSON.stringify([...access].sort()) !== JSON.stringify([...account.access].sort())) {
            account.access = [...new Set(access)];
            account.accessGrantedAt = new Date();
            account.accessGrantedBy = req.user.name;
            if (added.length) {
                void portal.sendMail({
                    to: account.email,
                    subject: 'Masz dostęp do panelu B2B — RevSerwis',
                    title: 'Panel B2B aktywny',
                    text: `Włączyliśmy dla Twojego konta: ${added.map(k => P.ACCESS_LABELS[k]).join(', ')}. Zaloguj się, aby zacząć.`,
                    cta: { label: 'Otwórz panel', url: portal.accountUrl(added[0] === 'hotel' ? 'hotel' : 'partner') }
                });
            }
        }
    }
    if (b.partner && typeof b.partner === 'object') {
        if (b.partner.agencyName !== undefined) account.partner.agencyName = P.text(b.partner.agencyName, 180, 'Nazwa biura');
        if (b.partner.commissionPct !== undefined) account.partner.commissionPct = P.num(b.partner.commissionPct, 'Prowizja', { min: 0, max: 50 }) ?? 10;
        if (b.partner.notes !== undefined) account.partner.notes = P.text(b.partner.notes, 1000, 'Uwagi');
    }
    if (b.hotel && typeof b.hotel === 'object') {
        if (b.hotel.companyName !== undefined) account.hotel.companyName = P.text(b.hotel.companyName, 180, 'Firma');
        if (b.hotel.billingNote !== undefined) account.hotel.billingNote = P.text(b.hotel.billingNote, 1000, 'Rozliczenie');
        if (b.hotel.monthlyInvoice !== undefined) account.hotel.monthlyInvoice = b.hotel.monthlyInvoice !== false;
    }
    if (b.status !== undefined) account.status = b.status === 'blocked' ? 'blocked' : 'active';
    if (b.emailVerified === true && !account.emailVerified) { account.emailVerified = true; account.emailVerifiedAt = new Date(); }
    if (b.client !== undefined) account.client = isObjectId(b.client) ? b.client : null;
    if (b.adminNotes !== undefined) account.adminNotes = P.text(b.adminNotes, 2000, 'Notatki');
    for (const key of ['name', 'phone', 'company', 'nip']) {
        if (b[key] !== undefined) Object.assign(account, P.validateProfile({ [key]: b[key] }));
    }
    await account.save();
    await recordActivity('account_updated', `Konto ${account.email}: dostęp ${account.access.join(', ') || 'brak B2B'}${account.status === 'blocked' ? ' · ZABLOKOWANE' : ''}`, 'Account', account._id, req.user.name);
    res.json({ success: true, account: accountView(account.toObject()) });
}));

router.delete('/v9/accounts/:id', validateId, asyncRoute(async (req, res) => {
    const account = found(await V.Account.findById(req.params.id), 'Nie znaleziono konta');
    // Zlecenia i dokumenty zostają (księgowość) — odpinamy je od konta.
    await Promise.all([
        Task.updateMany({ account: account._id }, { $set: { account: null } }),
        StorageItem.updateMany({ account: account._id }, { $set: { account: null } }),
        V.OutletOrder.updateMany({ account: account._id }, { $set: { account: null } }),
        V.TripBooking.updateMany({ account: account._id }, { $set: { account: null } }),
        V.HotelRoute.updateMany({ account: account._id }, { $set: { active: false } })
    ]);
    await V.Account.deleteOne({ _id: account._id });
    await recordActivity('account_deleted', `Usunięto konto klienta ${account.email}`, 'Account', null, req.user.name);
    res.json({ success: true });
}));

/** Przypięcie zlecenia do konta klienta (zlecenie pojawi się w panelu klienta ze śledzeniem). */
router.post('/v9/tasks/:id/account', validateId, asyncRoute(async (req, res) => {
    const accountId = req.body?.account || null;
    if (accountId && !isObjectId(accountId)) throw httpError(400, 'Nieprawidłowe konto');
    const account = accountId ? found(await V.Account.findById(accountId).lean(), 'Nie znaleziono konta') : null;
    const task = found(await Task.findByIdAndUpdate(req.params.id, { $set: { account: account ? account._id : null, ...(account && account.client ? { client: account.client } : {}) } }, { new: true }), 'Nie znaleziono zlecenia');
    res.json({ success: true, task });
}));

/** Przypięcie pozycji magazynu do konta (RevStorage w panelu klienta). */
router.post('/v9/storage/:id/account', validateId, asyncRoute(async (req, res) => {
    const accountId = req.body?.account || null;
    if (accountId && !isObjectId(accountId)) throw httpError(400, 'Nieprawidłowe konto');
    if (accountId) found(await V.Account.exists({ _id: accountId }), 'Nie znaleziono konta');
    const item = found(await StorageItem.findByIdAndUpdate(req.params.id, { $set: { account: accountId, visibleToClient: req.body?.visibleToClient !== false } }, { new: true }), 'Nie znaleziono pozycji');
    res.json({ success: true, item });
}));

/* ================================================================== */
/* RevOutlet                                                            */
/* ================================================================== */

router.get('/v9/outlet', asyncRoute(async (req, res) => {
    const [items, orders] = await Promise.all([
        V.OutletItem.find(req.query.all === '1' ? {} : { status: { $ne: 'archived' } }).sort({ status: 1, updatedAt: -1 }).limit(500).lean(),
        V.OutletOrder.find({}).sort({ createdAt: -1 }).limit(300).lean()
    ]);
    const sold = items.filter(i => i.status === 'sold');
    res.json({
        items,
        orders,
        summary: {
            available: items.filter(i => i.status === 'available').length,
            reserved: items.filter(i => i.status === 'reserved').length,
            drafts: items.filter(i => i.status === 'draft').length,
            soldCount: sold.length,
            soldValue: round2(orders.filter(o => o.status === 'completed').reduce((s, o) => s + (o.price || 0) + (o.deliveryPrice || 0), 0)),
            stockValue: round2(items.filter(i => i.status === 'available').reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0)),
            newOrders: orders.filter(o => o.status === 'new').length
        },
        categories: P.OUTLET_CATEGORIES,
        conditions: P.OUTLET_CONDITIONS
    });
}));

async function outletSave(item, data) {
    const wasPublished = item.status === 'available';
    item.set(data);
    if (!wasPublished && item.status === 'available' && !item.publishedAt) item.publishedAt = new Date();
    if (item.status === 'sold' && !item.soldAt) item.soldAt = new Date();
    await item.save();
    return item;
}

router.post('/v9/outlet', asyncRoute(async (req, res) => {
    const data = P.validateOutletItem(req.body);
    const item = await outletSave(new V.OutletItem({ number: await portal.nextNumber('RO'), createdBy: req.user.name }), data);
    await recordActivity('outlet_item', `RevOutlet ${item.number}: ${item.title} (${item.price} zł)`, 'OutletItem', item._id, req.user.name);
    res.status(201).json({ success: true, item });
}));

router.put('/v9/outlet/:id', validateId, asyncRoute(async (req, res) => {
    const item = found(await V.OutletItem.findById(req.params.id), 'Nie znaleziono przedmiotu');
    const data = P.validateOutletItem({ ...item.toObject(), sortingEntry: item.sortingEntry ? String(item.sortingEntry) : '', task: item.task ? String(item.task) : '', ...req.body });
    res.json({ success: true, item: await outletSave(item, data) });
}));

router.delete('/v9/outlet/:id', validateId, asyncRoute(async (req, res) => {
    const item = found(await V.OutletItem.findById(req.params.id), 'Nie znaleziono przedmiotu');
    if (await V.OutletOrder.exists({ item: item._id })) {
        item.status = 'archived';
        await item.save();
        return res.json({ success: true, archived: true });
    }
    await item.deleteOne();
    res.json({ success: true });
}));

router.post('/v9/outlet/:id/photos', validateId, express.json({ limit: '30mb' }), asyncRoute(async (req, res) => {
    const item = found(await V.OutletItem.findById(req.params.id).select('+photos'), 'Nie znaleziono przedmiotu');
    const raw = Array.isArray(req.body?.photos) ? req.body.photos : [];
    if (!raw.length) throw httpError(400, 'Dodaj zdjęcia');
    if ((item.photos || []).length + raw.length > 12) throw httpError(400, 'Maksymalnie 12 zdjęć przedmiotu');
    const photos = await preparePhotos(raw.map(d => ({ data: typeof d === 'string' ? d : d?.data })).filter(p => typeof p.data === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(p.data)));
    item.photos.push(...photos);
    item.photoCount = item.photos.length;
    await item.save();
    res.json({ success: true, photoCount: item.photoCount });
}));

router.get('/v9/outlet/:id/photos/:index', validateId, asyncRoute(async (req, res) => {
    const item = found(await V.OutletItem.findById(req.params.id).select('+photos'), 'Nie znaleziono przedmiotu');
    const photo = item.photos?.[Number(req.params.index)];
    if (!photo) throw httpError(404, 'Nie znaleziono zdjęcia');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.type(photo.contentType || 'image/jpeg').send(photo.data);
}));

router.delete('/v9/outlet/:id/photos/:index', validateId, asyncRoute(async (req, res) => {
    const item = found(await V.OutletItem.findById(req.params.id).select('+photos'), 'Nie znaleziono przedmiotu');
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || !item.photos[index]) throw httpError(404, 'Nie znaleziono zdjęcia');
    item.photos.splice(index, 1);
    item.photoCount = item.photos.length;
    await item.save();
    res.json({ success: true, photoCount: item.photoCount });
}));

/** „Na sprzedaż” z Sortowni — szkic przedmiotu ze zdjęciami pozycji sortowni. */
router.post('/v9/outlet/from-sorting/:id', validateId, asyncRoute(async (req, res) => {
    const entry = found(await SortingEntry.findById(req.params.id).select('+photos'), 'Nie znaleziono pozycji sortowni');
    const existing = await V.OutletItem.findOne({ sortingEntry: entry._id }).lean();
    if (existing) return res.json({ success: true, item: existing, existed: true });
    const item = await V.OutletItem.create({
        number: await portal.nextNumber('RO'),
        title: (entry.item || entry.binName || 'Przedmiot z odzysku').slice(0, 140),
        description: [entry.note, entry.taskNumber ? `Pochodzi z opróżniania ${entry.taskNumber}.` : ''].filter(Boolean).join('\n').slice(0, 4000),
        price: 0,
        status: 'draft',
        sortingEntry: entry._id,
        task: entry.task || null,
        photos: (entry.photos || []).slice(0, 12).map(p => ({ data: p.data, contentType: p.contentType })),
        photoCount: Math.min((entry.photos || []).length, 12),
        createdBy: req.user.name
    });
    await recordActivity('outlet_item', `RevOutlet ${item.number}: szkic z Sortowni (${item.title})`, 'OutletItem', item._id, req.user.name);
    const plain = item.toObject();
    delete plain.photos;
    res.status(201).json({ success: true, item: plain });
}));

router.put('/v9/outlet-orders/:id', validateId, asyncRoute(async (req, res) => {
    const order = found(await V.OutletOrder.findById(req.params.id), 'Nie znaleziono rezerwacji');
    const status = req.body?.status;
    if (!P.OUTLET_ORDER_STATUSES.includes(status)) throw httpError(400, 'Nieprawidłowy status');
    const before = order.status;
    if (before === status) return res.json({ success: true, order });
    if (['completed', 'cancelled'].includes(before)) throw httpError(400, 'Ta rezerwacja jest już zamknięta.');

    const item = await V.OutletItem.findById(order.item);
    if (status === 'cancelled' && item) {
        item.quantity = (item.quantity || 0) + 1;
        if (['reserved', 'sold'].includes(item.status)) item.status = 'available';
        await item.save();
    }
    if (status === 'completed' && item && item.quantity <= 0) {
        item.status = 'sold';
        item.soldAt = new Date();
        await item.save();
    }
    if (status === 'confirmed' && order.delivery === 'delivery' && !order.task) {
        const task = await Task.create({
            name: `RevOutlet: dowóz — ${order.itemTitle}`.slice(0, 160),
            type: 'Transport z wniesieniem',
            division: 'revcargo',
            status: 'planned',
            source: 'RevOutlet',
            portalKind: 'outlet',
            portalRef: order._id,
            account: order.account || null,
            price: order.deliveryPrice || 0,
            dateStart: req.body?.dateStart ? new Date(req.body.dateStart) : new Date(Date.now() + 86_400_000),
            clientName: order.name,
            clientPhone: order.phone,
            clientEmail: order.email,
            addressFrom: 'Magazyn RevOutlet',
            addressTo: order.address,
            desc: `Dowóz z RevOutlet: ${order.itemTitle} (${order.number}). Do pobrania przy odbiorze: ${order.price + (order.deliveryPrice || 0)} zł.${order.note ? '\nUwagi: ' + order.note : ''}`,
            createdBy: req.user.name
        });
        order.task = task._id;
    }
    order.status = status;
    order.handledBy = req.user.name;
    await order.save();
    await recordActivity('outlet_order', `RevOutlet ${order.number}: ${before} → ${status}`, 'OutletOrder', order._id, req.user.name);
    res.json({ success: true, order });
}));

/* ================================================================== */
/* RevPowrót                                                            */
/* ================================================================== */

router.get('/v9/trips', asyncRoute(async (req, res) => {
    const since = new Date(Date.now() - 45 * 86_400_000);
    const [trips, bookings] = await Promise.all([
        V.ReturnTrip.find(req.query.all === '1' ? {} : { date: { $gte: since } }).sort({ date: 1 }).lean(),
        V.TripBooking.find({}).sort({ createdAt: -1 }).limit(500).lean()
    ]);
    const byTrip = new Map();
    for (const b of bookings) {
        const k = String(b.trip);
        if (!byTrip.has(k)) byTrip.set(k, []);
        byTrip.get(k).push(b);
    }
    res.json({
        trips: trips.map(t => {
            const list = byTrip.get(String(t._id)) || [];
            const live = list.filter(b => b.status !== 'cancelled');
            return { ...t, bookings: list, bookedM3: round2(live.reduce((s, b) => s + b.volumeM3, 0)), revenue: round2(live.reduce((s, b) => s + (b.price || 0), 0)) };
        }),
        summary: {
            open: trips.filter(t => t.status === 'open').length,
            newBookings: bookings.filter(b => b.status === 'new').length,
            revenue: round2(bookings.filter(b => b.status === 'completed').reduce((s, b) => s + (b.price || 0), 0))
        }
    });
}));

router.post('/v9/trips', asyncRoute(async (req, res) => {
    const data = P.validateTrip(req.body);
    const trip = await V.ReturnTrip.create({ ...data, remainingM3: data.capacityM3, number: await portal.nextNumber('KR'), createdBy: req.user.name });
    await recordActivity('trip_created', `RevPowrót ${trip.number}: ${trip.from} → ${trip.to}, ${trip.capacityM3} m³`, 'ReturnTrip', trip._id, req.user.name);
    res.status(201).json({ success: true, trip });
}));

router.put('/v9/trips/:id', validateId, asyncRoute(async (req, res) => {
    const trip = found(await V.ReturnTrip.findById(req.params.id), 'Nie znaleziono kursu');
    const data = P.validateTrip({ ...trip.toObject(), branch: trip.branch ? String(trip.branch) : '', ...req.body });
    const booked = await V.TripBooking.aggregate([{ $match: { trip: trip._id, status: { $ne: 'cancelled' } } }, { $group: { _id: null, v: { $sum: '$volumeM3' } } }]);
    const used = booked[0]?.v || 0;
    if (data.capacityM3 < used) throw httpError(400, `Zarezerwowano już ${round2(used)} m³ — nie można zmniejszyć miejsca poniżej tej wartości.`);
    trip.set(data);
    trip.remainingM3 = round2(data.capacityM3 - used);
    if (trip.status === 'full' && trip.remainingM3 > 0.24) trip.status = 'open';
    await trip.save();
    res.json({ success: true, trip });
}));

router.delete('/v9/trips/:id', validateId, asyncRoute(async (req, res) => {
    const trip = found(await V.ReturnTrip.findById(req.params.id), 'Nie znaleziono kursu');
    if (await V.TripBooking.exists({ trip: trip._id, status: { $in: ['new', 'confirmed'] } })) throw httpError(400, 'Kurs ma aktywne rezerwacje — najpierw je anuluj albo oznacz kurs jako „Anulowany”.');
    await V.TripBooking.deleteMany({ trip: trip._id });
    await trip.deleteOne();
    res.json({ success: true });
}));

router.put('/v9/bookings/:id', validateId, asyncRoute(async (req, res) => {
    const booking = found(await V.TripBooking.findById(req.params.id), 'Nie znaleziono rezerwacji');
    const b = req.body || {};
    const before = booking.status;
    if (b.price !== undefined) booking.price = P.num(b.price, 'Cena', { min: 0, max: 1e6 }) ?? booking.price;
    if (b.status !== undefined) {
        if (!P.BOOKING_STATUSES.includes(b.status)) throw httpError(400, 'Nieprawidłowy status');
        if (before === 'cancelled' && b.status !== 'cancelled') throw httpError(400, 'Anulowanej rezerwacji nie można przywrócić — dodaj nową.');
        booking.status = b.status;
    }
    if (before !== 'cancelled' && booking.status === 'cancelled') {
        await V.ReturnTrip.updateOne({ _id: booking.trip }, { $inc: { remainingM3: booking.volumeM3 } });
        await V.ReturnTrip.updateOne({ _id: booking.trip, status: 'full' }, { $set: { status: 'open' } });
    }
    if (booking.status === 'confirmed' && !booking.task && b.createTask !== false) {
        const trip = await V.ReturnTrip.findById(booking.trip).lean();
        const task = await Task.create({
            name: `RevPowrót: ${trip.from} → ${trip.to} — ${booking.name}`.slice(0, 160),
            type: 'Transport z wniesieniem',
            division: 'revcargo',
            status: 'planned',
            source: 'RevPowrót',
            portalKind: 'trip',
            portalRef: booking._id,
            account: booking.account || null,
            branch: trip.branch || null,
            price: booking.price,
            dateStart: trip.date,
            clientName: booking.name,
            clientPhone: booking.phone,
            clientEmail: booking.email,
            addressFrom: booking.pickupAddress,
            addressTo: booking.dropAddress,
            desc: `Rezerwacja ${booking.number} w kursie ${trip.number} (${trip.from} → ${trip.to}).\nObjętość: ${booking.volumeM3} m³\nCo: ${booking.items}${booking.floorInfo ? '\nPiętra/winda: ' + booking.floorInfo : ''}${booking.note ? '\nUwagi: ' + booking.note : ''}`.slice(0, 4000),
            createdBy: req.user.name
        });
        booking.task = task._id;
    }
    await booking.save();
    res.json({ success: true, booking });
}));

/* ================================================================== */
/* ABONAMENTY — plany i subskrypcje                                     */
/* ================================================================== */

/** Plany startowe — NIEAKTYWNE: administrator ustawia ceny i publikuje je w RevMi. */
const DEFAULT_PLANS = [
    { slug: 'winter-care-dom', name: 'Winter Care — dom', division: 'revwinter', tagline: 'Odśnieżanie posesji przez cały sezon', season: 'listopad – marzec', billingPeriod: 'season', audience: 'person', features: ['Wyjazd po każdym opadzie (od ok. 5 cm)', 'Podjazd, chodnik i dojście do drzwi', 'Posypywanie przy oblodzeniu', 'Pierwszeństwo przed zleceniami jednorazowymi'], highlight: true, order: 1 },
    { slug: 'winter-care-firma', name: 'Winter Care — firma', division: 'revwinter', tagline: 'Parkingi, place i wejścia do obiektów', season: 'listopad – marzec', billingPeriod: 'season', audience: 'company', features: ['Odśnieżanie parkingu i dojazdów', 'Dyżur w nocy i o świcie', 'Raport ze zdjęciami po wyjeździe', 'Faktura zbiorcza'], order: 2 },
    { slug: 'facility-start', name: 'RevFacility — obsługa obiektu', division: 'revfacility', tagline: 'Stała opieka nad budynkiem i terenem', billingPeriod: 'month', visitsPerPeriod: 2, audience: 'company', features: ['Dwie wizyty w miesiącu', 'Drobne naprawy i przeglądy', 'Wywóz gabarytów i odpadów', 'Raport z każdej wizyty'], order: 3 },
    { slug: 'garden-sezon', name: 'RevGarden — sezon', division: 'revgarden', tagline: 'Koszenie i porządek w ogrodzie', season: 'kwiecień – październik', billingPeriod: 'month', visitsPerPeriod: 2, audience: 'all', features: ['Koszenie co dwa tygodnie', 'Przycinanie krawędzi', 'Wywóz skoszonej trawy', 'Jesienne grabienie liści'], order: 4 }
];

async function seedPlans() {
    if (await V.Plan.estimatedDocumentCount() > 0) return;
    await V.Plan.insertMany(DEFAULT_PLANS.map(p => ({ ...p, price: 0, active: false, description: '' })), { ordered: false }).catch(() => null);
}

router.get('/v9/plans', asyncRoute(async (req, res) => {
    await seedPlans();
    const [plans, counts] = await Promise.all([
        V.Plan.find({}).sort({ order: 1, price: 1 }).lean(),
        V.Subscription.aggregate([{ $match: { status: { $in: ['active', 'pending', 'paused'] } } }, { $group: { _id: '$plan', n: { $sum: 1 } } }])
    ]);
    const byPlan = new Map(counts.map(c => [String(c._id), c.n]));
    res.json({ plans: plans.map(p => ({ ...p, subscribers: byPlan.get(String(p._id)) || 0 })), periods: P.BILLING_PERIODS });
}));

router.post('/v9/plans', asyncRoute(async (req, res) => {
    const data = P.validatePlan(req.body);
    const plan = await V.Plan.create(data);
    res.status(201).json({ success: true, plan });
}));

router.put('/v9/plans/:id', validateId, asyncRoute(async (req, res) => {
    const plan = found(await V.Plan.findById(req.params.id), 'Nie znaleziono planu');
    const data = P.validatePlan({ ...plan.toObject(), ...req.body });
    if (data.active && !(data.price > 0)) throw httpError(400, 'Ustaw cenę większą od zera przed opublikowaniem planu.');
    plan.set(data);
    await plan.save();
    res.json({ success: true, plan });
}));

router.delete('/v9/plans/:id', validateId, asyncRoute(async (req, res) => {
    const plan = found(await V.Plan.findById(req.params.id), 'Nie znaleziono planu');
    if (await V.Subscription.exists({ plan: plan._id })) {
        plan.active = false;
        await plan.save();
        return res.json({ success: true, deactivated: true });
    }
    await plan.deleteOne();
    res.json({ success: true });
}));

router.get('/v9/subscriptions', asyncRoute(async (req, res) => {
    const subs = await V.Subscription.find({}).sort({ status: 1, createdAt: -1 }).limit(500).populate('account', 'name email phone company').lean();
    const active = subs.filter(s => s.status === 'active');
    const monthly = s => (s.billingPeriod === 'month' ? s.price : s.billingPeriod === 'year' ? s.price / 12 : s.price / 5);
    res.json({
        subscriptions: subs.map(s => ({ ...s, account: s.account ? { _id: String(s.account._id), name: s.account.name, email: s.account.email, phone: s.account.phone, company: s.account.company } : null })),
        summary: { active: active.length, pending: subs.filter(s => s.status === 'pending').length, mrr: round2(active.reduce((sum, s) => sum + monthly(s), 0)) }
    });
}));

router.put('/v9/subscriptions/:id', validateId, asyncRoute(async (req, res) => {
    const sub = found(await V.Subscription.findById(req.params.id), 'Nie znaleziono subskrypcji');
    const b = req.body || {};
    const before = sub.status;
    if (b.price !== undefined) sub.price = P.num(b.price, 'Cena', { min: 0, max: 1e6 }) ?? sub.price;
    if (b.startDate !== undefined) sub.startDate = P.dateValue(b.startDate, 'Start');
    if (b.adminNotes !== undefined) sub.adminNotes = P.text(b.adminNotes, 2000, 'Notatki');
    if (b.status !== undefined) {
        if (!P.SUBSCRIPTION_STATUSES.includes(b.status)) throw httpError(400, 'Nieprawidłowy status');
        sub.status = b.status;
        if (b.status === 'active') { sub.activatedAt = sub.activatedAt || new Date(); sub.pauseRequestedAt = null; }
        if (b.status === 'paused') sub.pauseRequestedAt = null;
        if (b.status === 'cancelled') sub.cancelledAt = new Date();
    }
    if (b.clearPauseRequest) sub.pauseRequestedAt = null;

    // Aktywacja → umowa w „Abonamentach” RevMi (cykliczne rozliczenia, przychody, MRR).
    if (before !== 'active' && sub.status === 'active' && !sub.contract) {
        const account = await V.Account.findById(sub.account).lean();
        if (account && !account.client) await portal.ensureClient(await V.Account.findById(sub.account));
        const fresh = await V.Account.findById(sub.account).lean();
        const plan = await V.Plan.findById(sub.plan).lean();
        const start = sub.startDate || new Date();
        const monthlyPrice = sub.billingPeriod === 'month' ? sub.price : sub.billingPeriod === 'year' ? round2(sub.price / 12) : round2(sub.price / 5);
        const contract = await Contract.create({
            number: await require('../services/numbers').nextNumber('AB'),
            title: `${sub.planName} — ${sub.address}`.slice(0, 160),
            client: fresh?.client || null,
            clientName: fresh ? (fresh.company ? `${fresh.company} (${fresh.name})` : fresh.name) : '',
            clientPhone: fresh?.phone || '',
            clientEmail: fresh?.email || '',
            address: sub.address,
            division: plan?.division || '',
            services: plan?.features || [],
            scope: [sub.area ? 'Zakres: ' + sub.area : '', sub.note, sub.billingPeriod !== 'month' ? `Cena ${sub.billingPeriod === 'year' ? 'roczna' : 'sezonowa'}: ${sub.price} zł (rozłożona na miesiące).` : ''].filter(Boolean).join('\n').slice(0, 4000),
            monthlyPrice,
            billingDay: Math.min(new Date(start).getDate(), 28),
            startDate: start,
            nextBillingDate: require('./business')._internal.nextBillingDate(start, Math.min(new Date(start).getDate(), 28)),
            status: 'active',
            account: sub.account,
            subscription: sub._id,
            createdBy: req.user.name
        });
        sub.contract = contract._id;
        if (fresh?.email) {
            void portal.sendMail({ to: fresh.email, subject: `Abonament ${sub.planName} aktywny — RevSerwis`, title: 'Abonament aktywny', text: `Aktywowaliśmy abonament ${sub.planName} dla adresu ${sub.address}. Terminy wizyt zobaczysz w panelu klienta.`, cta: { label: 'Moje abonamenty', url: portal.accountUrl('abonamenty') } });
        }
    }
    if (sub.contract && before !== sub.status && ['paused', 'cancelled', 'active'].includes(sub.status)) {
        await Contract.updateOne({ _id: sub.contract }, { $set: { status: sub.status === 'cancelled' ? 'ended' : sub.status, ...(sub.status === 'cancelled' ? { endDate: new Date() } : {}) } });
    }
    await sub.save();
    await recordActivity('subscription_updated', `Abonament ${sub.number}: ${before} → ${sub.status}`, 'Subscription', sub._id, req.user.name);
    res.json({ success: true, subscription: sub });
}));

router.post('/v9/subscriptions/:id/visits', validateId, asyncRoute(async (req, res) => {
    const sub = found(await V.Subscription.findById(req.params.id), 'Nie znaleziono subskrypcji');
    const date = P.dateValue(req.body?.date, 'Data wizyty', { required: true });
    const note = P.text(req.body?.note, 1000, 'Notatka');
    let task = null;
    if (req.body?.createTask !== false) {
        const account = await V.Account.findById(sub.account).lean();
        const plan = await V.Plan.findById(sub.plan).lean();
        task = await Task.create({
            name: `${sub.planName}: wizyta abonamentowa`.slice(0, 160),
            type: sub.planName.slice(0, 80),
            division: plan?.division || '',
            status: 'planned',
            source: 'Abonament',
            portalKind: 'subscription',
            portalRef: sub._id,
            account: sub.account,
            client: account?.client || null,
            dateStart: date,
            clientName: account ? (account.company || account.name) : '',
            clientPhone: account?.phone || '',
            clientEmail: account?.email || '',
            address: sub.address,
            desc: `Wizyta w ramach abonamentu ${sub.number} (${sub.planName}).${sub.area ? '\nZakres: ' + sub.area : ''}${note ? '\n' + note : ''}`,
            createdBy: req.user.name
        });
    }
    sub.visits.push({ date, note, status: 'planned', task: task ? task._id : null });
    await sub.save();
    res.status(201).json({ success: true, subscription: sub });
}));

router.put('/v9/subscriptions/:id/visits/:visitId', validateId, asyncRoute(async (req, res) => {
    const sub = found(await V.Subscription.findById(req.params.id), 'Nie znaleziono subskrypcji');
    const visit = found(sub.visits.id(req.params.visitId), 'Nie znaleziono wizyty');
    if (req.body?.status !== undefined) visit.status = ['planned', 'done', 'skipped'].includes(req.body.status) ? req.body.status : visit.status;
    if (req.body?.note !== undefined) visit.note = P.text(req.body.note, 1000, 'Notatka');
    if (req.body?.date !== undefined) visit.date = P.dateValue(req.body.date, 'Data', { required: true });
    if (req.body?.remove === true) visit.deleteOne();
    await sub.save();
    res.json({ success: true, subscription: sub });
}));

/* ================================================================== */
/* POLECENIA PARTNERÓW                                                  */
/* ================================================================== */

router.get('/v9/referrals', asyncRoute(async (req, res) => {
    const referrals = await V.PartnerReferral.find({}).sort({ createdAt: -1 }).limit(500).lean();
    const sum = f => round2(referrals.filter(f).reduce((s, r) => s + (r.commissionAmount || 0), 0));
    res.json({
        referrals,
        summary: {
            new: referrals.filter(r => r.status === 'new').length,
            completed: referrals.filter(r => r.status === 'completed').length,
            toPay: sum(r => ['pending', 'approved'].includes(r.commissionStatus)),
            paid: sum(r => r.commissionStatus === 'paid')
        },
        statuses: P.REFERRAL_STATUSES,
        commissionStatuses: P.COMMISSION_STATUSES
    });
}));

router.put('/v9/referrals/:id', validateId, asyncRoute(async (req, res) => {
    const ref = found(await V.PartnerReferral.findById(req.params.id), 'Nie znaleziono polecenia');
    const b = req.body || {};
    if (b.status !== undefined) {
        if (!P.REFERRAL_STATUSES.includes(b.status)) throw httpError(400, 'Nieprawidłowy status');
        ref.status = b.status;
    }
    if (b.statusNote !== undefined) ref.statusNote = P.text(b.statusNote, 500, 'Komentarz dla partnera');
    if (b.commissionPct !== undefined) ref.commissionPct = P.num(b.commissionPct, 'Prowizja', { min: 0, max: 50 }) ?? ref.commissionPct;
    if (b.orderValue !== undefined) ref.orderValue = P.num(b.orderValue, 'Wartość zlecenia', { min: 0, max: 1e7 });

    // Wartość zlecenia z RevMi, jeśli nie podano ręcznie.
    if (ref.status === 'completed' && (ref.orderValue === null || ref.orderValue === undefined) && ref.task) {
        const task = await Task.findById(ref.task).select('finalPrice price status').lean();
        if (task) ref.orderValue = task.finalPrice ?? task.price ?? 0;
    }
    ref.commissionAmount = ref.status === 'completed' ? round2((ref.orderValue || 0) * (ref.commissionPct || 0) / 100) : 0;
    if (b.commissionStatus !== undefined) {
        if (!P.COMMISSION_STATUSES.includes(b.commissionStatus)) throw httpError(400, 'Nieprawidłowy status prowizji');
        ref.commissionStatus = b.commissionStatus;
    } else if (ref.status === 'completed' && ref.commissionStatus === 'none' && ref.commissionAmount > 0) {
        ref.commissionStatus = 'pending';
    }
    if (ref.status !== 'completed' && ref.commissionStatus !== 'paid') ref.commissionStatus = 'none';
    if (ref.commissionStatus === 'paid' && !ref.commissionPaidAt) ref.commissionPaidAt = new Date();
    await ref.save();
    await recordActivity('partner_referral', `Polecenie ${ref.number}: ${ref.status}, prowizja ${ref.commissionAmount} zł (${ref.commissionStatus})`, 'PartnerReferral', ref._id, req.user.name);
    res.json({ success: true, referral: ref });
}));

/* ================================================================== */
/* HOTELE — obiekty i stałe trasy                                       */
/* ================================================================== */

router.get('/v9/hotels', asyncRoute(async (req, res) => {
    const accounts = await V.Account.find({ access: 'hotel' }).select('name email phone company hotel').lean();
    const ids = accounts.map(a => a._id);
    const [properties, routes, tasks] = await Promise.all([
        V.HotelProperty.find({ account: { $in: ids }, active: true }).lean(),
        V.HotelRoute.find({ account: { $in: ids } }).sort({ approved: 1, createdAt: -1 }).lean(),
        Task.aggregate([{ $match: { account: { $in: ids }, portalKind: 'hotel', status: 'completed', completedAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }, { $group: { _id: '$account', n: { $sum: 1 }, value: { $sum: { $ifNull: ['$finalPrice', '$price'] } } } }])
    ]);
    const month = new Map(tasks.map(t => [String(t._id), t]));
    res.json({
        hotels: accounts.map(a => ({
            ...a,
            _id: String(a._id),
            properties: properties.filter(p => String(p.account) === String(a._id)),
            routes: routes.filter(r => String(r.account) === String(a._id)),
            monthCompleted: month.get(String(a._id))?.n || 0,
            monthValue: round2(month.get(String(a._id))?.value || 0)
        })),
        pending: routes.filter(r => !r.approved && r.active).length,
        weekdays: P.WEEKDAYS
    });
}));

router.put('/v9/hotel-routes/:id', validateId, asyncRoute(async (req, res) => {
    const route = found(await V.HotelRoute.findById(req.params.id), 'Nie znaleziono trasy');
    const b = req.body || {};
    if (b.approved !== undefined) route.approved = b.approved === true;
    if (b.active !== undefined) route.active = b.active === true;
    if (b.pricePerRun !== undefined) route.pricePerRun = P.num(b.pricePerRun, 'Cena za kurs', { min: 0, max: 1e6 });
    if (b.branch !== undefined) route.branch = isObjectId(b.branch) ? b.branch : null;
    await route.save();
    if (b.approved === true) {
        const account = await V.Account.findById(route.account).select('email name').lean();
        if (account) void portal.sendMail({ to: account.email, subject: 'Stała trasa zaakceptowana — RevSerwis', title: 'Trasa zaakceptowana', text: `Zaakceptowaliśmy stałą trasę „${route.service}” (${route.weekdays.map(d => P.WEEKDAYS[d - 1]).join(', ')}, ${route.time}). Zlecenia będą pojawiać się automatycznie w Twoim panelu.`, cta: { label: 'Panel hotelu', url: portal.accountUrl('hotel') } });
        void require('../services/v9-jobs').generateRouteTasks().catch(() => null);
    }
    res.json({ success: true, route });
}));

/* ================================================================== */
/* REKRUTACJA                                                           */
/* ================================================================== */

router.get('/v9/applications', asyncRoute(async (req, res) => {
    const filter = {};
    if (P.APPLICATION_TRACKS.includes(req.query.track)) filter.track = req.query.track;
    if (V.APPLICATION_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    const apps = await V.JobApplication.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    const all = await V.JobApplication.aggregate([{ $group: { _id: { track: '$track', status: '$status' }, n: { $sum: 1 } } }]);
    res.json({ applications: apps, counts: all, tracks: P.APPLICATION_TRACK_LABELS, statuses: V.APPLICATION_STATUSES });
}));

router.put('/v9/applications/:id', validateId, asyncRoute(async (req, res) => {
    const app = found(await V.JobApplication.findById(req.params.id), 'Nie znaleziono zgłoszenia');
    const b = req.body || {};
    if (b.status !== undefined) {
        if (!V.APPLICATION_STATUSES.includes(b.status)) throw httpError(400, 'Nieprawidłowy status');
        app.status = b.status;
    }
    if (b.rating !== undefined) app.rating = P.num(b.rating, 'Ocena', { min: 0, max: 5, integer: true }) || 0;
    if (b.internalNotes !== undefined) app.internalNotes = P.text(b.internalNotes, 3000, 'Notatki');
    app.handledBy = req.user.name;
    await app.save();
    res.json({ success: true, application: app });
}));

router.delete('/v9/applications/:id', validateId, asyncRoute(async (req, res) => {
    found(await V.JobApplication.findByIdAndDelete(req.params.id), 'Nie znaleziono zgłoszenia');
    res.json({ success: true });
}));

/** Szybkie wyszukiwanie kont do list wyboru w RevMi (przypięcie zlecenia / magazynu). */
router.get('/v9/account-options', asyncRoute(async (req, res) => {
    const accounts = await V.Account.find({ status: 'active' }).select('name email company').sort({ name: 1 }).limit(1000).lean();
    res.json({ accounts: accounts.map(a => ({ _id: String(a._id), label: `${a.company ? a.company + ' · ' : ''}${a.name} · ${a.email}` })) });
}));

module.exports = router;
module.exports._internal = { DEFAULT_PLANS, accountView };
