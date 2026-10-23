'use strict';

/**
 * 9.0: panel klienta (/konto) — wymaga zalogowania kontem klienta (e-mail + hasło).
 * Zlecenia ze śledzeniem, zamawianie usług, RevStorage, subskrypcje, zamówienia RevOutlet,
 * rezerwacje RevPowrót, profil, zmiana hasła, eksport danych (RODO).
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const { Task, TaskMedia, StorageItem, StorageUnit } = require('../models');
const { Account, Subscription, Plan, OutletOrder, TripBooking, PartnerReferral } = require('../models-v9');
const P = require('../../lib/portal-input');
const portal = require('../services/portal');
const { preparePhotos } = require('../../lib/quote-input');
const { divisionName } = require('../../lib/divisions');
const { requireAccount } = require('../middleware/account');
const { asyncRoute, httpError, isObjectId } = require('../utils');
const { recordActivity } = require('../services/activity');

const router = express.Router();
// Trasy logowania (/konto/login, /register…) obsługuje wcześniej portal-auth.js — tu wszystko wymaga konta.
router.use('/konto', requireAccount);

const orderLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 15,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Za dużo zgłoszeń. Spróbuj za godzinę albo zadzwoń: 735 396 534.' }
});

const PUBLIC_TASK_FIELDS = '-quotePhotos -quoteFingerprint -aiInput -costs -notes -checklist -reviewRequest -learnedAt -discordPending -discordNextAttempt';

async function findOwnTask(account, id) {
    if (!isObjectId(id)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const task = await Task.findOne({ _id: id, ...portal.accountTaskFilter(account) }).select(PUBLIC_TASK_FIELDS);
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    return task;
}

/* ------------------------------------------------------------------ */
/* Pulpit                                                               */
/* ------------------------------------------------------------------ */

router.get('/konto/dashboard', asyncRoute(async (req, res) => {
    const a = req.account;
    const filter = portal.accountTaskFilter(a);
    const [tasks, storage, subs, outlet, bookings, referrals] = await Promise.all([
        Task.find(filter).select(PUBLIC_TASK_FIELDS).sort({ createdAt: -1 }).limit(200).lean(),
        StorageItem.countDocuments({ account: a._id, visibleToClient: { $ne: false }, status: { $in: ['reserved', 'stored'] } }),
        Subscription.find({ account: a._id, status: { $in: ['pending', 'active', 'paused'] } }).select('planName status price billingPeriod visits').lean(),
        OutletOrder.countDocuments({ account: a._id, status: { $in: ['new', 'confirmed'] } }),
        TripBooking.countDocuments({ account: a._id, status: { $in: ['new', 'confirmed'] } }),
        (a.access || []).includes('partner') ? PartnerReferral.countDocuments({ partner: a._id, status: { $in: ['new', 'contacted', 'planned'] } }) : 0
    ]);
    const views = tasks.map(t => portal.clientTask(t));
    const active = views.filter(t => ['new', 'quoted', 'planned', 'progress'].includes(t.status));
    const completed = views.filter(t => t.status === 'completed');
    const now = Date.now();
    const nextVisit = subs.flatMap(s => (s.visits || []).filter(v => v.status === 'planned' && new Date(v.date).getTime() > now).map(v => ({ date: v.date, plan: s.planName })))
        .sort((x, y) => new Date(x.date) - new Date(y.date))[0] || null;
    res.json({
        stats: {
            active: active.length,
            completed: completed.length,
            spent: Math.round(completed.reduce((s, t) => s + (Number(t.finalPrice) || 0), 0)),
            awaitingAcceptance: views.filter(t => t.canAccept).length,
            storage,
            subscriptions: subs.length,
            outletOrders: outlet,
            bookings,
            referralsOpen: referrals,
            unpaid: completed.filter(t => t.paymentStatus !== 'paid' && t.finalPrice).length
        },
        active: active.slice(0, 6),
        recent: completed.slice(0, 4),
        upcoming: active.filter(t => t.dateStart && new Date(t.dateStart).getTime() > now).sort((x, y) => new Date(x.dateStart) - new Date(y.dateStart))[0] || null,
        nextVisit,
        emailVerified: Boolean(a.emailVerified)
    });
}));

/* ------------------------------------------------------------------ */
/* Zlecenia                                                             */
/* ------------------------------------------------------------------ */

router.get('/konto/orders', asyncRoute(async (req, res) => {
    const filter = portal.accountTaskFilter(req.account);
    const tasks = await Task.find(filter).select(PUBLIC_TASK_FIELDS).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ orders: tasks.map(t => portal.clientTask(t)) });
}));

router.get('/konto/orders/:id', asyncRoute(async (req, res) => {
    const task = await findOwnTask(req.account, req.params.id);
    const media = await TaskMedia.find({ task: task._id, kind: { $in: ['before', 'after'] } }).select('kind createdAt').sort({ createdAt: 1 }).lean();
    res.json({ order: portal.clientTask(task.toObject(), { media }) });
}));

router.get('/konto/orders/:id/media/:mediaId', asyncRoute(async (req, res) => {
    const task = await findOwnTask(req.account, req.params.id);
    if (!isObjectId(req.params.mediaId)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const media = await TaskMedia.findOne({ _id: req.params.mediaId, task: task._id, kind: { $in: ['before', 'after'] } }).select('+data contentType');
    if (!media || !media.data) throw httpError(404, 'Nie znaleziono zdjęcia');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(media.contentType || 'image/jpeg').send(media.data);
}));

router.post('/konto/orders', orderLimiter, express.json({ limit: '20mb' }), asyncRoute(async (req, res) => {
    const a = req.account;
    const data = P.validateClientOrder(req.body);
    const existing = await Task.findOne({ quoteRequestId: data.requestId, account: a._id }).select(PUBLIC_TASK_FIELDS);
    if (existing) return res.json({ success: true, order: portal.clientTask(existing.toObject()) });

    const photos = await preparePhotos(data.photos.map(d => ({ data: d })));
    // 9.1: dodatki — ceny zawsze z katalogu w bazie
    const { Addon } = require('../models-v9');
    const catalog = Array.isArray(req.body.addons) && req.body.addons.length ? await Addon.find({ active: true }).lean() : [];
    const addons = require('../../lib/v10-input').pickAddons(req.body.addons, catalog, data.division);
    const addonsText = addons.items.length ? '\n\nDodatki: ' + addons.items.map(i => `${i.name}${i.qty > 1 ? ' × ' + i.qty : ''}${i.total != null ? ' (' + i.total + ' zł)' : ' (w wycenie)'}`).join(', ') : '';
    const dateText = data.date ? new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }).format(data.date) + (data.dateFlexible ? ' (elastycznie)' : '') : 'Do ustalenia';
    const task = await portal.createPortalTask({
        quoteRequestId: data.requestId,
        name: ((data.quoteType === 'onsite' ? 'Oględziny: ' : 'Wycena: ') + data.service).slice(0, 160),
        type: data.service.slice(0, 80),
        division: data.division,
        quoteType: data.quoteType,
        source: 'Panel klienta',
        portalKind: 'client',
        account: a._id,
        client: a.client || null,
        clientName: (a.company ? `${a.name} (${a.company})` : a.name).slice(0, 140),
        clientPhone: data.phone || a.phone,
        clientEmail: a.email,
        address: data.addressTo ? '' : data.address,
        addressFrom: data.addressTo ? data.address : '',
        addressTo: data.addressTo,
        clientPreferredDate: dateText,
        desc: (`Termin zgłoszony przez klienta: ${dateText}\n\n${data.description}${addonsText}`).slice(0, 4000),
        addons: addons.items,
        addonsTotal: addons.total,
        quotePhotos: photos,
        quotePhotoCount: photos.length
    });
    await recordActivity('quote_received', `Zamówienie z panelu klienta ${task.number}: ${data.service} (${a.name})`, 'Task', task._id, 'Panel klienta');
    if (addons.items.length) void require('../models-v9').Addon.updateMany({ _id: { $in: addons.items.map(i => i.addon) } }, { $inc: { timesOrdered: 1 } }).catch(() => null);
    res.status(201).json({ success: true, order: portal.clientTask(task.toObject()) });
}));

router.post('/konto/orders/:id/accept', asyncRoute(async (req, res) => {
    const task = await findOwnTask(req.account, req.params.id);
    if (task.status !== 'quoted') throw httpError(400, 'Tę wycenę nie można już zaakceptować.');
    if (!task.clientAcceptedAt) {
        await Task.updateOne({ _id: task._id }, {
            $set: { clientAcceptedAt: new Date() },
            $push: { notes: { text: 'Klient zaakceptował wycenę w panelu klienta.', author: req.account.name, authorKey: 'client' } }
        });
        task.clientAcceptedAt = new Date();
        void portal.notifyAdmins({ type: 'portal', title: '✅ Klient zaakceptował wycenę', body: `${task.number} · ${task.name} · ${req.account.name}`, url: `/revmi/#/zlecenia/${task._id}`, dedupeKey: `accept:${task._id}` });
        void recordActivity('client_accepted', `Klient zaakceptował wycenę ${task.number}`, 'Task', task._id, req.account.name);
    }
    res.json({ success: true, order: portal.clientTask(task.toObject()) });
}));

router.post('/konto/orders/:id/cancel', asyncRoute(async (req, res) => {
    const task = await findOwnTask(req.account, req.params.id);
    const reason = P.text(req.body?.reason, 500, 'Powód');
    if (['new', 'quoted'].includes(task.status)) {
        await Task.updateOne({ _id: task._id }, {
            $set: { status: 'cancelled', clientCancelReason: reason },
            $push: { notes: { text: 'Klient anulował zgłoszenie w panelu.' + (reason ? ' Powód: ' + reason : ''), author: req.account.name, authorKey: 'client' } }
        });
        task.status = 'cancelled';
        void portal.notifyAdmins({ type: 'portal', title: '🚫 Klient anulował zgłoszenie', body: `${task.number} · ${task.name}${reason ? ' · ' + reason : ''}`, url: `/revmi/#/zlecenia/${task._id}` });
    } else if (task.status === 'planned') {
        if (!task.clientCancelRequestedAt) {
            await Task.updateOne({ _id: task._id }, {
                $set: { clientCancelRequestedAt: new Date(), clientCancelReason: reason },
                $push: { notes: { text: 'Klient prosi o anulowanie zaplanowanego zlecenia.' + (reason ? ' Powód: ' + reason : ''), author: req.account.name, authorKey: 'client' } }
            });
            task.clientCancelRequestedAt = new Date();
            void portal.notifyAdmins({ type: 'portal', title: '⚠️ Prośba o anulowanie zlecenia', body: `${task.number} · ${task.name} · zadzwoń do klienta${reason ? ' · ' + reason : ''}`, url: `/revmi/#/zlecenia/${task._id}` });
        }
    } else {
        throw httpError(400, 'Zlecenia w realizacji lub zakończonego nie można anulować w panelu. Zadzwoń: 735 396 534.');
    }
    await recordActivity('client_cancel', `Klient: anulowanie ${task.number}`, 'Task', task._id, req.account.name);
    res.json({ success: true, order: portal.clientTask(task.toObject()) });
}));

router.post('/konto/orders/:id/rate', asyncRoute(async (req, res) => {
    const task = await findOwnTask(req.account, req.params.id);
    if (task.status !== 'completed') throw httpError(400, 'Ocenić można zakończone zlecenie.');
    const rating = P.num(req.body?.rating, 'Ocena', { min: 1, max: 5, required: true, integer: true });
    const feedback = P.text(req.body?.feedback, 1500, 'Komentarz');
    await Task.updateOne({ _id: task._id }, { $set: { clientRating: rating, clientFeedback: feedback } });
    task.clientRating = rating;
    task.clientFeedback = feedback;
    void portal.notifyAdmins({ type: 'portal', title: `${'★'.repeat(rating)} Ocena klienta`, body: `${task.number} · ${req.account.name}${feedback ? ': ' + feedback.slice(0, 120) : ''}`, url: `/revmi/#/zlecenia/${task._id}` });
    const settings = await require('../services/settings').getSettings();
    res.json({ success: true, order: portal.clientTask(task.toObject()), googleReviewUrl: rating >= 4 ? settings.googleReviewUrl : null });
}));

/** „Zamów ponownie” — nowe zgłoszenie z tymi samymi danymi (usługa, adres, opis). */
router.post('/konto/orders/:id/repeat', orderLimiter, asyncRoute(async (req, res) => {
    const task = await findOwnTask(req.account, req.params.id);
    const a = req.account;
    const copy = await portal.createPortalTask({
        name: ('Wycena: ' + (task.type || task.name)).slice(0, 160),
        type: task.type,
        division: task.division,
        quoteType: 'free',
        source: 'Panel klienta (ponownie)',
        portalKind: 'client',
        account: a._id,
        client: a.client || task.client || null,
        clientName: task.clientName || a.name,
        clientPhone: task.clientPhone || a.phone,
        clientEmail: a.email,
        address: task.address,
        addressFrom: task.addressFrom,
        addressTo: task.addressTo,
        clientPreferredDate: 'Do ustalenia',
        desc: `Ponowne zamówienie na podstawie ${task.number}.\n\n` + String(task.desc || '').replace(/^Termin zgłoszony przez klienta:[^\n]*\n\n?/, '').slice(0, 3800)
    });
    res.status(201).json({ success: true, order: portal.clientTask(copy.toObject()) });
}));

/* ------------------------------------------------------------------ */
/* RevStorage — rzeczy klienta w magazynie                              */
/* ------------------------------------------------------------------ */

router.get('/konto/storage', asyncRoute(async (req, res) => {
    const items = await StorageItem.find({ account: req.account._id, visibleToClient: { $ne: false } }).sort({ status: 1, startDate: -1 }).lean();
    const unitIds = items.map(i => i.unit).filter(Boolean);
    const units = unitIds.length ? await StorageUnit.find({ _id: { $in: unitIds } }).select('name kind').lean() : [];
    const unitName = new Map(units.map(u => [String(u._id), u.name]));
    const pickups = await Task.find({ account: req.account._id, portalKind: 'storage' }).select(PUBLIC_TASK_FIELDS).sort({ createdAt: -1 }).limit(20).lean();
    const active = items.filter(i => i.status !== 'released');
    res.json({
        items: items.map(i => ({
            id: String(i._id),
            number: i.number,
            description: i.description,
            inventory: i.inventory,
            status: i.status,
            volume: i.volume,
            unit: i.unit ? unitName.get(String(i.unit)) || '' : '',
            location: i.location,
            startDate: i.startDate,
            endDate: i.endDate,
            releasedAt: i.releasedAt,
            monthlyPrice: i.monthlyPrice,
            photoCount: i.photoCount || 0
        })),
        summary: {
            items: active.length,
            volume: Math.round(active.reduce((s, i) => s + (i.volume || 0), 0) * 10) / 10,
            monthly: Math.round(active.reduce((s, i) => s + (i.monthlyPrice || 0), 0) * 100) / 100,
            nextEnd: active.map(i => i.endDate).filter(Boolean).sort((x, y) => new Date(x) - new Date(y))[0] || null
        },
        requests: pickups.map(t => portal.clientTask(t))
    });
}));

router.get('/konto/storage/:id/photos/:index', asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const item = await StorageItem.findOne({ _id: req.params.id, account: req.account._id, visibleToClient: { $ne: false } }).select('+photos');
    const photo = item?.photos?.[Number(req.params.index)];
    if (!photo) throw httpError(404, 'Nie znaleziono zdjęcia');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(photo.contentType || 'image/jpeg').send(photo.data);
}));

/** Zamówienie dowozu / wydania wybranych rzeczy z magazynu → zlecenie w RevMi. */
router.post('/konto/storage/request', orderLimiter, asyncRoute(async (req, res) => {
    const a = req.account;
    const data = P.validateStoragePickup(req.body);
    const items = await StorageItem.find({ _id: { $in: data.items }, account: a._id, status: { $in: ['stored', 'reserved'] } }).lean();
    if (!items.length) throw httpError(400, 'Nie znaleziono wybranych rzeczy w magazynie.');
    const list = items.map(i => `• ${i.number} — ${i.description}${i.volume ? ` (${i.volume} m³)` : ''}`).join('\n');
    const dateText = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }).format(data.date);
    const task = await portal.createPortalTask({
        name: (data.mode === 'pickup' ? 'RevStorage: odbiór osobisty z magazynu' : 'RevStorage: dowóz z magazynu').slice(0, 160),
        type: 'Magazynowanie mienia',
        division: 'revstorage',
        source: 'Panel klienta — RevStorage',
        portalKind: 'storage',
        account: a._id,
        client: a.client || null,
        clientName: a.name,
        clientPhone: a.phone,
        clientEmail: a.email,
        addressFrom: 'Magazyn RevStorage',
        addressTo: data.address,
        clientPreferredDate: dateText,
        dateStart: data.date,
        desc: `Termin zgłoszony przez klienta: ${dateText}\n\n${data.mode === 'pickup' ? 'Klient odbierze rzeczy osobiście.' : 'Dowóz pod adres: ' + data.address}\n\nRzeczy:\n${list}${data.note ? '\n\nUwagi: ' + data.note : ''}`.slice(0, 4000)
    });
    res.status(201).json({ success: true, order: portal.clientTask(task.toObject()) });
}));

/* ------------------------------------------------------------------ */
/* Subskrypcje                                                          */
/* ------------------------------------------------------------------ */

function subView(s) {
    const now = Date.now();
    return {
        id: String(s._id),
        number: s.number,
        planName: s.planName,
        plan: String(s.plan),
        price: s.price,
        billingPeriod: s.billingPeriod,
        address: s.address,
        area: s.area,
        note: s.note,
        status: s.status,
        startDate: s.startDate,
        activatedAt: s.activatedAt,
        pauseRequestedAt: s.pauseRequestedAt,
        visits: (s.visits || []).map(v => ({ id: String(v._id), date: v.date, status: v.status, note: v.note })).sort((x, y) => new Date(x.date) - new Date(y.date)),
        nextVisit: (s.visits || []).filter(v => v.status === 'planned' && new Date(v.date).getTime() > now).map(v => v.date).sort((x, y) => new Date(x) - new Date(y))[0] || null,
        createdAt: s.createdAt
    };
}

router.get('/konto/subscriptions', asyncRoute(async (req, res) => {
    const [subs, plans] = await Promise.all([
        Subscription.find({ account: req.account._id }).sort({ createdAt: -1 }).lean(),
        Plan.find({ active: true }).sort({ order: 1, price: 1 }).lean()
    ]);
    res.json({ subscriptions: subs.map(subView), plans: plans.map(p => ({ ...p, _id: String(p._id), divisionName: divisionName(p.division) })) });
}));

router.post('/konto/subscriptions', orderLimiter, asyncRoute(async (req, res) => {
    const a = req.account;
    const data = P.validateSubscribe(req.body);
    const plan = await Plan.findOne({ _id: data.plan, active: true }).lean();
    if (!plan) throw httpError(404, 'Ten plan nie jest już dostępny.');
    const dup = await Subscription.findOne({ account: a._id, plan: plan._id, address: data.address, status: { $in: ['pending', 'active', 'paused'] } });
    if (dup) throw httpError(409, 'Masz już ten abonament dla tego adresu.');
    const sub = await Subscription.create({
        number: await portal.nextNumber('SUB'),
        account: a._id,
        plan: plan._id,
        planName: plan.name,
        price: plan.price,
        billingPeriod: plan.billingPeriod,
        address: data.address,
        area: data.area,
        note: data.note,
        startDate: data.startDate,
        status: 'pending'
    });
    void portal.notifyAdmins({ type: 'portal', title: '🔁 Nowy abonament do aktywacji', body: `${plan.name} · ${a.name} · ${data.address}`, url: '/revmi/#/subskrypcje', dedupeKey: `sub:${sub._id}` });
    void recordActivity('subscription_created', `Abonament ${sub.number}: ${plan.name} (${a.name})`, 'Subscription', sub._id, 'Panel klienta');
    res.status(201).json({ success: true, subscription: subView(sub.toObject()) });
}));

router.post('/konto/subscriptions/:id/:action(cancel|pause|resume)', asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const sub = await Subscription.findOne({ _id: req.params.id, account: req.account._id });
    if (!sub) throw httpError(404, 'Nie znaleziono abonamentu');
    const action = req.params.action;
    const reason = P.text(req.body?.reason, 500, 'Powód');
    if (action === 'cancel') {
        if (sub.status === 'cancelled') throw httpError(400, 'Abonament jest już anulowany.');
        if (sub.status === 'pending') { sub.status = 'cancelled'; sub.cancelledAt = new Date(); }
        sub.cancelReason = reason || 'Rezygnacja w panelu klienta';
    } else if (action === 'pause') {
        if (sub.status !== 'active') throw httpError(400, 'Wstrzymać można aktywny abonament.');
        sub.pauseRequestedAt = new Date();
    } else {
        if (sub.status !== 'paused') throw httpError(400, 'Abonament nie jest wstrzymany.');
        sub.pauseRequestedAt = null;
    }
    await sub.save();
    const labels = { cancel: sub.status === 'cancelled' ? 'anulował zgłoszenie abonamentu' : 'prosi o rezygnację z abonamentu', pause: 'prosi o wstrzymanie abonamentu', resume: 'prosi o wznowienie abonamentu' };
    void portal.notifyAdmins({ type: 'portal', title: '🔁 Abonament: ' + labels[action], body: `${sub.number} · ${sub.planName} · ${req.account.name}${reason ? ' · ' + reason : ''}`, url: '/revmi/#/subskrypcje' });
    res.json({ success: true, subscription: subView(sub.toObject()) });
}));

/* ------------------------------------------------------------------ */
/* RevOutlet i RevPowrót — moje zamówienia                              */
/* ------------------------------------------------------------------ */

router.get('/konto/outlet-orders', asyncRoute(async (req, res) => {
    const orders = await OutletOrder.find({ account: req.account._id }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ orders: orders.map(o => ({ id: String(o._id), number: o.number, item: String(o.item), itemTitle: o.itemTitle, price: o.price, deliveryPrice: o.deliveryPrice, delivery: o.delivery, address: o.address, status: o.status, createdAt: o.createdAt })) });
}));

router.get('/konto/bookings', asyncRoute(async (req, res) => {
    const bookings = await TripBooking.find({ account: req.account._id }).sort({ createdAt: -1 }).limit(100).populate('trip', 'from to date number').lean();
    res.json({ bookings: bookings.map(b => ({ id: String(b._id), number: b.number, trip: b.trip ? { from: b.trip.from, to: b.trip.to, date: b.trip.date, number: b.trip.number } : null, volumeM3: b.volumeM3, price: b.price, status: b.status, pickupAddress: b.pickupAddress, dropAddress: b.dropAddress, createdAt: b.createdAt })) });
}));

/* ------------------------------------------------------------------ */
/* Profil, hasło, dane (RODO)                                           */
/* ------------------------------------------------------------------ */

router.put('/konto/profile', asyncRoute(async (req, res) => {
    const data = P.validateProfile(req.body || {});
    if (req.account.kind !== 'company') { delete data.company; delete data.nip; }
    await Account.updateOne({ _id: req.account._id }, { $set: data });
    const account = await Account.findById(req.account._id);
    if (data.marketingConsent !== undefined && data.marketingConsent !== Boolean(req.account.marketingConsent)) void require('../services/newsletter').syncAccount(account);
    res.json({ success: true, account: require('./portal-auth')._internal.me(account) });
}));

router.post('/konto/password', asyncRoute(async (req, res) => {
    const data = P.validatePasswordChange(req.body);
    const account = await Account.findById(req.account._id).select('+passwordHash');
    if (!await bcrypt.compare(data.current, account.passwordHash)) throw httpError(400, 'Obecne hasło jest nieprawidłowe.');
    await Account.updateOne({ _id: account._id }, { $set: { passwordHash: await bcrypt.hash(data.next, 12) } });
    res.json({ success: true });
}));

router.get('/konto/export', asyncRoute(async (req, res) => {
    const a = req.account;
    const [orders, storage, subs, outlet, bookings] = await Promise.all([
        Task.find(portal.accountTaskFilter(a)).select(PUBLIC_TASK_FIELDS).lean(),
        StorageItem.find({ account: a._id }).lean(),
        Subscription.find({ account: a._id }).lean(),
        OutletOrder.find({ account: a._id }).lean(),
        TripBooking.find({ account: a._id }).lean()
    ]);
    const payload = {
        exportedAt: new Date(),
        account: require('./portal-auth')._internal.me(a),
        orders: orders.map(t => portal.clientTask(t)),
        storage: storage.map(i => ({ number: i.number, description: i.description, inventory: i.inventory, status: i.status, startDate: i.startDate, endDate: i.endDate, monthlyPrice: i.monthlyPrice })),
        subscriptions: subs.map(subView),
        outletOrders: outlet.map(o => ({ number: o.number, itemTitle: o.itemTitle, price: o.price, status: o.status, createdAt: o.createdAt })),
        bookings: bookings.map(b => ({ number: b.number, volumeM3: b.volumeM3, price: b.price, status: b.status, createdAt: b.createdAt }))
    };
    res.setHeader('Content-Disposition', 'attachment; filename="revserwis-moje-dane.json"');
    res.type('application/json').send(JSON.stringify(payload, null, 2));
}));

router.post('/konto/delete-request', asyncRoute(async (req, res) => {
    await Account.updateOne({ _id: req.account._id }, { $set: { deletionRequestedAt: new Date() } });
    void portal.notifyAdmins({ type: 'portal', title: '🗑️ Prośba o usunięcie konta', body: `${req.account.name} · ${req.account.email}`, url: '/revmi/#/konta' });
    res.json({ success: true, message: 'Przyjęliśmy prośbę. Usuniemy konto w ciągu 14 dni (dokumenty księgowe przechowujemy zgodnie z prawem).' });
}));

module.exports = router;
module.exports._internal = { subView };
