'use strict';

/**
 * 9.0: publiczne API nowych modułów (bez logowania RevMi):
 *  - RevOutlet   GET /api/outlet, /api/outlet/:id, zdjęcia, POST /api/outlet/orders
 *  - RevPowrót   GET /api/powrot, POST /api/powrot/bookings
 *  - Abonamenty  GET /api/plany
 *  - Kariera     POST /api/kariera (dział / marketing / franczyza)
 *  - Partnerzy   POST /api/partnerzy/zgloszenie (biuro nieruchomości chce dołączyć)
 * Zalogowany klient (/konto) dostaje zamówienia i rezerwacje przypisane do swojego konta.
 */
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const config = require('../config');
const { Message } = require('../models');
const { OutletItem, OutletOrder, ReturnTrip, TripBooking, Plan, JobApplication } = require('../models-v9');
const P = require('../../lib/portal-input');
const portal = require('../services/portal');
const mail = require('../services/mail');
const { divisionName } = require('../../lib/divisions');
const { optionalAccount } = require('../middleware/account');
const { asyncRoute, httpError, isObjectId, escapeRegex } = require('../utils');
const { recordActivity } = require('../services/activity');

const router = express.Router();

const formLimiter = (limit = 8) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Za dużo zgłoszeń. Spróbuj za 15 minut albo zadzwoń: 735 396 534.' }
});

const money = v => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(Number(v) || 0) + ' zł';
const dayFmt = d => new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date(d));

/* ================================================================== */
/* RevOutlet                                                            */
/* ================================================================== */

const outletView = (i, { full = false } = {}) => ({
    id: String(i._id),
    number: i.number,
    title: i.title,
    category: i.category,
    condition: i.condition,
    price: i.price,
    oldPrice: i.oldPrice,
    dimensions: i.dimensions,
    location: i.location,
    deliveryAvailable: i.deliveryAvailable,
    deliveryPrice: i.deliveryPrice,
    status: i.status,
    featured: i.featured,
    photoCount: i.photoCount || 0,
    secondLife: Boolean(i.sortingEntry || i.task),
    publishedAt: i.publishedAt,
    ...(full ? { description: i.description, quantity: i.quantity } : { excerpt: String(i.description || '').slice(0, 140) })
});

router.get('/outlet', asyncRoute(async (req, res) => {
    const filter = { status: { $in: ['available', 'reserved'] } };
    if (P.OUTLET_CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    if (q) filter.$or = [{ title: new RegExp(escapeRegex(q), 'i') }, { description: new RegExp(escapeRegex(q), 'i') }];
    const sort = req.query.sort === 'price' ? { price: 1 } : req.query.sort === 'price-desc' ? { price: -1 } : { featured: -1, status: 1, publishedAt: -1 };
    const items = await OutletItem.find(filter).sort(sort).limit(300).lean();
    const counts = await OutletItem.aggregate([{ $match: { status: { $in: ['available', 'reserved'] } } }, { $group: { _id: '$category', n: { $sum: 1 } } }]);
    res.json({ items: items.map(i => outletView(i)), categories: P.OUTLET_CATEGORIES.map(c => ({ name: c, count: counts.find(x => x._id === c)?.n || 0 })) });
}));

router.get('/outlet/:id', asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const item = await OutletItem.findOneAndUpdate({ _id: req.params.id, status: { $in: ['available', 'reserved', 'sold'] } }, { $inc: { views: 1 } }, { new: true }).lean();
    if (!item) throw httpError(404, 'Ta rzecz nie jest już dostępna');
    res.json({ item: outletView(item, { full: true }) });
}));

router.get('/outlet/:id/photos/:index', asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const item = await OutletItem.findOne({ _id: req.params.id, status: { $in: ['available', 'reserved', 'sold'] } }).select('+photos');
    const photo = item?.photos?.[Number(req.params.index)];
    if (!photo) throw httpError(404, 'Nie znaleziono zdjęcia');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type(photo.contentType || 'image/jpeg').send(photo.data);
}));

router.post('/outlet/orders', formLimiter(6), optionalAccount, asyncRoute(async (req, res) => {
    const data = P.validateOutletOrder(req.body);
    const existing = await OutletOrder.findOne({ requestId: data.requestId }).lean();
    if (existing) return res.json({ success: true, number: existing.number });

    // Atomowo: zmniejszamy ilość; ostatnia sztuka → „zarezerwowane”, żeby nikt inny jej nie kupił.
    const item = await OutletItem.findOneAndUpdate(
        { _id: data.item, status: 'available', quantity: { $gte: 1 } },
        { $inc: { quantity: -1 } },
        { new: true }
    );
    if (!item) throw httpError(409, 'Ktoś właśnie zarezerwował tę rzecz. Zobacz inne w RevOutlet.');
    if (item.quantity <= 0) await OutletItem.updateOne({ _id: item._id }, { $set: { status: 'reserved' } });
    if (data.delivery === 'delivery' && !item.deliveryAvailable) {
        await OutletItem.updateOne({ _id: item._id }, { $inc: { quantity: 1 }, $set: { status: 'available' } });
        throw httpError(400, 'Ta rzecz jest tylko do odbioru osobistego.');
    }

    const a = req.account;
    let order;
    try {
        order = await OutletOrder.create({
            ...data,
            number: await portal.nextNumber('OUT'),
            itemTitle: item.title,
            price: item.price,
            deliveryPrice: data.delivery === 'delivery' ? item.deliveryPrice || 0 : 0,
            account: a ? a._id : null,
            email: data.email || a?.email || ''
        });
    } catch (error) {
        await OutletItem.updateOne({ _id: item._id }, { $inc: { quantity: 1 }, $set: { status: 'available' } });
        if (error.code === 11000) {
            const again = await OutletOrder.findOne({ requestId: data.requestId }).lean();
            if (again) return res.json({ success: true, number: again.number });
        }
        throw error;
    }
    res.status(201).json({ success: true, number: order.number });

    if (req.body.newsletter === true && order.email) void require('../services/newsletter').subscribe({ email: order.email, name: data.name.split(' ')[0], topics: ['outlet', 'promocje'], source: 'outlet' }).catch(() => null);
    void recordActivity('outlet_order', `RevOutlet ${order.number}: ${item.title} — ${data.name}`, 'OutletOrder', order._id, 'RevOutlet');
    void portal.notifyAdmins({ type: 'portal', title: '🛋️ RevOutlet: nowa rezerwacja', body: `${item.title} · ${money(item.price)} · ${data.name} ${data.phone} · ${data.delivery === 'delivery' ? 'dowóz' : 'odbiór'}`, url: '/revmi/#/outlet', dedupeKey: `outlet:${order._id}` });
    if (order.email) {
        void portal.sendMail({
            to: order.email,
            subject: `Rezerwacja ${order.number} — RevOutlet`,
            title: 'Zarezerwowaliśmy dla Ciebie',
            text: `„${item.title}” za ${money(item.price)} czeka na Ciebie. Zadzwonimy, żeby potwierdzić ${data.delivery === 'delivery' ? 'termin dowozu' : 'odbiór'}. Numer rezerwacji: ${order.number}.`,
            cta: a ? { label: 'Moje konto', url: portal.accountUrl('outlet') } : null
        });
    }
}));

/* ================================================================== */
/* RevPowrót                                                            */
/* ================================================================== */

const tripView = t => ({
    id: String(t._id),
    number: t.number,
    from: t.from,
    to: t.to,
    via: t.via,
    date: t.date,
    dateFlexDays: t.dateFlexDays,
    capacityM3: t.capacityM3,
    remainingM3: t.remainingM3,
    maxWeightKg: t.maxWeightKg,
    pricePerM3: t.pricePerM3,
    minPrice: t.minPrice,
    discountPct: t.discountPct,
    vehicle: t.vehicle,
    notes: t.notes,
    status: t.status
});

router.get('/powrot', asyncRoute(async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const trips = await ReturnTrip.find({ published: true, status: { $in: ['open', 'full'] }, date: { $gte: today } }).sort({ date: 1 }).limit(100).lean();
    res.json({ trips: trips.map(tripView) });
}));

router.post('/powrot/bookings', formLimiter(6), optionalAccount, asyncRoute(async (req, res) => {
    const pre = P.validateTripBooking(req.body);
    const existing = await TripBooking.findOne({ requestId: pre.requestId }).lean();
    if (existing) return res.json({ success: true, number: existing.number, price: existing.price });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Atomowa rezerwacja miejsca — nie da się sprzedać więcej m³ niż jest w busie.
    const trip = await ReturnTrip.findOneAndUpdate(
        { _id: pre.trip, published: true, status: 'open', date: { $gte: today }, remainingM3: { $gte: pre.volumeM3 } },
        { $inc: { remainingM3: -pre.volumeM3 } },
        { new: true }
    );
    if (!trip) {
        const t = await ReturnTrip.findById(pre.trip).lean();
        if (!t || t.status !== 'open') throw httpError(409, 'Ten kurs nie przyjmuje już rezerwacji.');
        throw httpError(409, `W tym kursie zostało ${t.remainingM3} m³ wolnego miejsca.`);
    }
    if (trip.remainingM3 <= 0.24) await ReturnTrip.updateOne({ _id: trip._id }, { $set: { status: 'full' } });

    const a = req.account;
    const price = P.tripPrice(trip, pre.volumeM3);
    let booking;
    try {
        booking = await TripBooking.create({ ...pre, number: await portal.nextNumber('POW'), price, account: a ? a._id : null, email: pre.email || a?.email || '' });
    } catch (error) {
        await ReturnTrip.updateOne({ _id: trip._id }, { $inc: { remainingM3: pre.volumeM3 }, $set: { status: 'open' } });
        throw error;
    }
    res.status(201).json({ success: true, number: booking.number, price });

    if (req.body.newsletter === true && booking.email) void require('../services/newsletter').subscribe({ email: booking.email, name: pre.name.split(' ')[0], topics: ['powrot', 'promocje'], source: 'powrot' }).catch(() => null);
    void recordActivity('trip_booking', `RevPowrót ${booking.number}: ${trip.from} → ${trip.to}, ${pre.volumeM3} m³ — ${pre.name}`, 'TripBooking', booking._id, 'RevPowrót');
    void portal.notifyAdmins({ type: 'portal', title: '🚚 RevPowrót: nowa rezerwacja', body: `${trip.from} → ${trip.to} (${dayFmt(trip.date)}) · ${pre.volumeM3} m³ · ${money(price)} · ${pre.name} ${pre.phone}`, url: '/revmi/#/powrot', dedupeKey: `booking:${booking._id}` });
    if (booking.email) {
        void portal.sendMail({
            to: booking.email,
            subject: `Rezerwacja ${booking.number} — RevPowrót`,
            title: 'Miejsce w kursie zarezerwowane',
            text: `Kurs ${trip.from} → ${trip.to}, ${dayFmt(trip.date)}. Zarezerwowane miejsce: ${pre.volumeM3} m³, cena orientacyjna ${money(price)}. Zadzwonimy, żeby potwierdzić godzinę odbioru.`,
            cta: a ? { label: 'Moje konto', url: portal.accountUrl('powrot') } : null
        });
    }
}));

/* ================================================================== */
/* Abonamenty                                                           */
/* ================================================================== */

router.get('/plany', asyncRoute(async (req, res) => {
    const plans = await Plan.find({ active: true }).sort({ order: 1, price: 1 }).lean();
    res.json({ plans: plans.map(p => ({ id: String(p._id), slug: p.slug, name: p.name, division: p.division, divisionName: divisionName(p.division), tagline: p.tagline, description: p.description, features: p.features, price: p.price, billingPeriod: p.billingPeriod, visitsPerPeriod: p.visitsPerPeriod, season: p.season, audience: p.audience, highlight: p.highlight })) });
}));

/* ================================================================== */
/* Portal rekrutacyjny                                                  */
/* ================================================================== */

router.post('/kariera', formLimiter(5), asyncRoute(async (req, res) => {
    const data = P.validateApplication(req.body);
    const existing = await JobApplication.findOne({ requestId: data.requestId }).lean();
    if (existing) return res.json({ success: true, number: existing.number });
    const app = await JobApplication.create({ ...data, number: await portal.nextNumber('REK'), franchise: data.franchise || undefined });
    res.status(201).json({ success: true, number: app.number });

    const what = data.track === 'dzial' ? data.department : data.track === 'marketing' ? 'Marketing: ' + data.role : 'Franczyza: ' + data.franchise.city;
    void recordActivity('job_application', `Zgłoszenie ${app.number} (${P.APPLICATION_TRACK_LABELS[data.track]}): ${data.name} — ${what}`, 'JobApplication', app._id, 'Kariera');
    void portal.notifyAdmins({ type: 'portal', title: data.track === 'franczyza' ? '🏙️ Zapytanie o franczyzę' : '🧑‍🔧 Nowe zgłoszenie do pracy', body: `${data.name} · ${what} · ${data.city}`, url: '/revmi/#/rekrutacja', dedupeKey: `job:${app._id}` });
    if (mail.isConfigured()) {
        const rows = [['Ścieżka', P.APPLICATION_TRACK_LABELS[data.track]], ['Gdzie', what], ['Imię i nazwisko', data.name], ['E-mail', data.email], ['Telefon', data.phone], ['Miasto', data.city],
            ['Dostępność', data.availability], ['Prawo jazdy', data.licenses.join(', ')], ['Doświadczenie', data.experience], ['Link', data.link], ['O sobie', data.message],
            ...(data.franchise ? [['Budżet', data.franchise.budget], ['Kiedy', data.franchise.timeline], ['Firma', data.franchise.hasCompany ? 'tak' : 'nie'], ['Pojazd', data.franchise.hasVehicle ? 'tak' : 'nie'], ['Ekipa', data.franchise.hasTeam ? 'tak' : 'nie'], ['Doświadczenie w biznesie', data.franchise.businessExperience]] : [])
        ].filter(([, v]) => v);
        void mail.send({
            to: config.mail.contactTo,
            subject: `[Kariera ${app.number}] ${what} — ${data.name}`,
            text: rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nPanel: ${config.publicUrl}/revmi/#/rekrutacja`,
            html: `<h2 style="font-family:Arial">Nowe zgłoszenie — ${portal.escapeHtml(P.APPLICATION_TRACK_LABELS[data.track])}</h2><table cellpadding="6" style="font-family:Arial;font-size:14px">${rows.map(([k, v]) => `<tr><td style="color:#666">${portal.escapeHtml(k)}</td><td><strong>${portal.escapeHtml(v)}</strong></td></tr>`).join('')}</table>`,
            replyTo: data.email
        }).catch(e => console.error('[RevSerwis] E-mail rekrutacji:', e.message));
        void portal.sendMail({ to: data.email, subject: 'Dziękujemy za zgłoszenie — RevSerwis', title: `Dziękujemy, ${data.name.split(' ')[0]}!`, text: `Dostaliśmy Twoje zgłoszenie (${app.number}). Odezwiemy się telefonicznie lub mailowo w ciągu kilku dni roboczych.` });
    }
}));

/* ================================================================== */
/* Portal partnerski — zgłoszenie biura                                 */
/* ================================================================== */

router.post('/partnerzy/zgloszenie', formLimiter(4), asyncRoute(async (req, res) => {
    const data = P.validatePartnerApplication(req.body);
    let message = await Message.findOne({ requestId: data.requestId });
    if (!message) {
        message = await Message.create({
            requestId: data.requestId,
            kind: 'company',
            name: data.name,
            company: data.agencyName,
            nip: data.nip,
            email: data.email,
            phone: data.phone,
            topic: 'Portal partnerski — biuro nieruchomości',
            division: 'revb2b',
            source: 'Strona partnerzy.html',
            message: [`Biuro: ${data.agencyName} (${data.city})`, data.agents ? `Liczba agentów: ${data.agents}` : '', data.message || 'Chcemy dołączyć do programu partnerskiego RevSerwis.',
                '', 'Po weryfikacji: poproś biuro o założenie konta na /konto i nadaj dostęp „partner” w RevMi → Konta.'].filter(Boolean).join('\n'),
            mail: { pending: true, attempts: 0, nextAttempt: new Date() },
            discordPending: Boolean(config.discordWebhookUrl),
            discordNextAttempt: new Date()
        });
        void mail.flushMail();
        void require('../services/notify').newMessage(message.toObject());
        try { void require('../services/discord').flushDiscord(); } catch { /* ignore */ }
    }
    res.status(201).json({ success: true });
}));

module.exports = router;
module.exports._internal = { outletView, tripView };
