'use strict';

/**
 * 9.0: panele B2B w panelu klienta. Dostęp nadaje administrator w RevMi (Konta → dostęp B2B).
 *  - /api/b2b/hotel/*    panel hoteli i pensjonatów: obiekty, stałe trasy, jednorazowe zamówienia, zestawienie miesięczne
 *  - /api/b2b/partner/*  portal partnerski biur nieruchomości: polecenia klientów, statusy, prowizje
 */
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { Task } = require('../models');
const { HotelProperty, HotelRoute, PartnerReferral } = require('../models-v9');
const P = require('../../lib/portal-input');
const portal = require('../services/portal');
const { requireAccount, requireAccess } = require('../middleware/account');
const { asyncRoute, httpError, isObjectId } = require('../utils');
const { recordActivity } = require('../services/activity');

const router = express.Router();
router.use('/b2b', requireAccount);

const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Za dużo zgłoszeń. Spróbuj za chwilę.' }
});

const TASK_FIELDS = '-quotePhotos -quoteFingerprint -aiInput -costs -notes -checklist -reviewRequest -learnedAt';
const dayFmt = d => new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);

/* ================================================================== */
/* HOTELE I PENSJONATY                                                  */
/* ================================================================== */

const hotel = express.Router();
router.use('/b2b/hotel', requireAccess('hotel'), hotel);

const routeView = (r, props) => ({
    id: String(r._id),
    property: String(r.property),
    propertyName: props.get(String(r.property))?.name || '—',
    service: r.service,
    weekdays: r.weekdays,
    time: r.time,
    description: r.description,
    startDate: r.startDate,
    endDate: r.endDate,
    active: r.active,
    approved: r.approved,
    pricePerRun: r.pricePerRun
});

hotel.get('/overview', asyncRoute(async (req, res) => {
    const a = req.account;
    const [properties, routes, tasks] = await Promise.all([
        HotelProperty.find({ account: a._id, active: true }).sort({ name: 1 }).lean(),
        HotelRoute.find({ account: a._id }).sort({ createdAt: -1 }).lean(),
        Task.find({ account: a._id, portalKind: 'hotel' }).select(TASK_FIELDS).sort({ dateStart: -1 }).limit(300).lean()
    ]);
    const props = new Map(properties.map(p => [String(p._id), p]));
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const views = tasks.map(t => ({ ...portal.clientTask(t), property: t.portalRef ? props.get(String(t.portalRef))?.name || '' : '' }));
    const month = tasks.filter(t => t.status === 'completed' && t.completedAt && new Date(t.completedAt) >= monthStart);
    res.json({
        properties: properties.map(p => ({ ...p, _id: String(p._id) })),
        routes: routes.map(r => routeView(r, props)),
        upcoming: views.filter(t => ['new', 'quoted', 'planned', 'progress'].includes(t.status)).sort((x, y) => new Date(x.dateStart || x.createdAt) - new Date(y.dateStart || y.createdAt)).slice(0, 30),
        history: views.filter(t => ['completed', 'cancelled'].includes(t.status)).slice(0, 50),
        stats: {
            properties: properties.length,
            activeRoutes: routes.filter(r => r.active && r.approved).length,
            pendingRoutes: routes.filter(r => !r.approved).length,
            monthCompleted: month.length,
            monthValue: Math.round(month.reduce((s, t) => s + (t.finalPrice ?? t.price ?? 0), 0)),
            next7: views.filter(t => t.dateStart && new Date(t.dateStart).getTime() > now && new Date(t.dateStart).getTime() < now + 7 * 86_400_000).length
        }
    });
}));

hotel.post('/properties', asyncRoute(async (req, res) => {
    const data = P.validateHotelProperty(req.body);
    if (await HotelProperty.countDocuments({ account: req.account._id, active: true }) >= 50) throw httpError(400, 'Limit 50 obiektów — skontaktuj się z nami.');
    const property = await HotelProperty.create({ ...data, account: req.account._id });
    res.status(201).json({ success: true, property });
}));

hotel.put('/properties/:id', asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const data = P.validateHotelProperty(req.body);
    const property = await HotelProperty.findOneAndUpdate({ _id: req.params.id, account: req.account._id }, { $set: data }, { new: true });
    if (!property) throw httpError(404, 'Nie znaleziono obiektu');
    res.json({ success: true, property });
}));

hotel.delete('/properties/:id', asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const property = await HotelProperty.findOneAndUpdate({ _id: req.params.id, account: req.account._id }, { $set: { active: false } });
    if (!property) throw httpError(404, 'Nie znaleziono obiektu');
    await HotelRoute.updateMany({ property: property._id, account: req.account._id }, { $set: { active: false } });
    res.json({ success: true });
}));

async function ownProperty(account, id) {
    const property = await HotelProperty.findOne({ _id: id, account: account._id, active: true }).lean();
    if (!property) throw httpError(404, 'Nie znaleziono obiektu');
    return property;
}

hotel.post('/routes', limiter, asyncRoute(async (req, res) => {
    const data = P.validateHotelRoute(req.body);
    const property = await ownProperty(req.account, data.property);
    const route = await HotelRoute.create({ ...data, account: req.account._id, approved: false });
    const days = data.weekdays.map(d => P.WEEKDAYS[d - 1]).join(', ');
    void portal.notifyAdmins({ type: 'portal', title: '🏨 Nowa stała trasa do akceptacji', body: `${req.account.company || req.account.name} · ${property.name} · ${data.service} · ${days} ${data.time}`, url: '/revmi/#/hotele', dedupeKey: `route:${route._id}` });
    await recordActivity('hotel_route', `Stała trasa (do akceptacji): ${property.name} · ${data.service}`, 'HotelRoute', route._id, req.account.name);
    res.status(201).json({ success: true, route: routeView(route.toObject(), new Map([[String(property._id), property]])) });
}));

hotel.put('/routes/:id', asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const route = await HotelRoute.findOne({ _id: req.params.id, account: req.account._id });
    if (!route) throw httpError(404, 'Nie znaleziono trasy');
    // Samo wstrzymanie / wznowienie nie wymaga ponownej akceptacji.
    if (Object.keys(req.body || {}).length === 1 && typeof req.body.active === 'boolean') {
        route.active = req.body.active;
    } else {
        const data = P.validateHotelRoute(req.body);
        await ownProperty(req.account, data.property);
        const changedSchedule = JSON.stringify([route.weekdays, route.time, route.service, String(route.property)]) !== JSON.stringify([data.weekdays, data.time, data.service, data.property]);
        route.set(data);
        if (changedSchedule) route.approved = false;
    }
    await route.save();
    if (!route.approved) void portal.notifyAdmins({ type: 'portal', title: '🏨 Zmieniona stała trasa — do akceptacji', body: `${req.account.company || req.account.name} · ${route.service}`, url: '/revmi/#/hotele' });
    const props = new Map((await HotelProperty.find({ account: req.account._id }).lean()).map(p => [String(p._id), p]));
    res.json({ success: true, route: routeView(route.toObject(), props) });
}));

hotel.delete('/routes/:id', asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const r = await HotelRoute.deleteOne({ _id: req.params.id, account: req.account._id });
    if (!r.deletedCount) throw httpError(404, 'Nie znaleziono trasy');
    res.json({ success: true });
}));

/** Jednorazowe zamówienie dla obiektu → zlecenie w RevMi. */
hotel.post('/orders', limiter, asyncRoute(async (req, res) => {
    const a = req.account;
    const data = P.validateHotelOrder(req.body);
    const existing = await Task.findOne({ quoteRequestId: data.requestId, account: a._id }).select(TASK_FIELDS);
    if (existing) return res.json({ success: true, order: portal.clientTask(existing.toObject()) });
    const property = await ownProperty(a, data.property);
    const when = new Date(data.date);
    if (data.time) { const [h, m] = data.time.split(':').map(Number); when.setHours(h, m, 0, 0); } else when.setHours(8, 0, 0, 0);
    const company = a.hotel?.companyName || a.company || a.name;
    const task = await portal.createPortalTask({
        quoteRequestId: data.requestId,
        name: `RevHotel: ${data.service} — ${property.name}`.slice(0, 160),
        type: data.service.slice(0, 80),
        division: 'revhotel',
        source: 'Panel hoteli',
        portalKind: 'hotel',
        portalRef: property._id,
        priority: data.urgent ? 'high' : 'normal',
        account: a._id,
        client: a.client || null,
        clientName: `${company} (${property.name})`.slice(0, 140),
        clientPhone: property.contactPhone || a.phone,
        clientEmail: a.email,
        address: property.address,
        dateStart: when,
        clientPreferredDate: dayFmt(when) + (data.time ? ' ' + data.time : '') + (data.urgent ? ' · PILNE' : ''),
        desc: [`Termin zgłoszony przez klienta: ${dayFmt(when)}${data.time ? ' ' + data.time : ''}`, '', data.description,
            property.contactName ? `\nOsoba kontaktowa: ${property.contactName} ${property.contactPhone || ''}` : '',
            property.accessNotes ? `Dojazd / klucze: ${property.accessNotes}` : ''].filter(Boolean).join('\n').slice(0, 4000)
    });
    res.status(201).json({ success: true, order: portal.clientTask(task.toObject()) });
}));

/** Zestawienie miesięczne (do faktury zbiorczej). ?month=2026-10 */
hotel.get('/summary', asyncRoute(async (req, res) => {
    const m = String(req.query.month || '').match(/^(\d{4})-(\d{2})$/);
    const now = new Date();
    const year = m ? Number(m[1]) : now.getFullYear();
    const month = m ? Number(m[2]) - 1 : now.getMonth();
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 1);
    const [tasks, properties] = await Promise.all([
        Task.find({ account: req.account._id, portalKind: 'hotel', status: 'completed', completedAt: { $gte: from, $lt: to } }).select(TASK_FIELDS).sort({ completedAt: 1 }).lean(),
        HotelProperty.find({ account: req.account._id }).select('name').lean()
    ]);
    const props = new Map(properties.map(p => [String(p._id), p.name]));
    const rows = tasks.map(t => ({ number: t.number, date: t.completedAt, service: t.type, property: props.get(String(t.portalRef)) || '', value: t.finalPrice ?? t.price ?? 0, paymentStatus: t.paymentStatus }));
    const byProperty = {};
    for (const r of rows) byProperty[r.property || '—'] = Math.round(((byProperty[r.property || '—'] || 0) + r.value) * 100) / 100;
    res.json({ month: `${year}-${String(month + 1).padStart(2, '0')}`, rows, total: Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100, byProperty });
}));

/* ================================================================== */
/* PORTAL PARTNERSKI — BIURA NIERUCHOMOŚCI                              */
/* ================================================================== */

const partner = express.Router();
router.use('/b2b/partner', requireAccess('partner'), partner);

const STATUS_PL = { new: 'Nowe', contacted: 'Kontakt z klientem', planned: 'Zaplanowane', completed: 'Zrealizowane', lost: 'Bez realizacji' };
const COMMISSION_PL = { none: '—', pending: 'Naliczona', approved: 'Zatwierdzona', paid: 'Wypłacona' };

const referralView = r => ({
    id: String(r._id),
    number: r.number,
    clientName: r.clientName,
    clientPhone: r.clientPhone,
    propertyAddress: r.propertyAddress,
    targetAddress: r.targetAddress,
    services: r.services,
    preferredDate: r.preferredDate,
    notes: r.notes,
    status: r.status,
    statusLabel: STATUS_PL[r.status] || r.status,
    statusNote: r.statusNote,
    orderValue: r.status === 'completed' ? r.orderValue : null,
    commissionPct: r.commissionPct,
    commissionAmount: r.commissionAmount,
    commissionStatus: r.commissionStatus,
    commissionLabel: COMMISSION_PL[r.commissionStatus] || '—',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
});

partner.get('/overview', asyncRoute(async (req, res) => {
    const referrals = await PartnerReferral.find({ partner: req.account._id }).sort({ createdAt: -1 }).limit(500).lean();
    const sum = filter => Math.round(referrals.filter(filter).reduce((s, r) => s + (r.commissionAmount || 0), 0) * 100) / 100;
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    res.json({
        referrals: referrals.map(referralView),
        stats: {
            total: referrals.length,
            open: referrals.filter(r => ['new', 'contacted', 'planned'].includes(r.status)).length,
            completed: referrals.filter(r => r.status === 'completed').length,
            conversion: referrals.length ? Math.round(referrals.filter(r => r.status === 'completed').length / referrals.length * 100) : 0,
            commissionPending: sum(r => ['pending', 'approved'].includes(r.commissionStatus)),
            commissionPaid: sum(r => r.commissionStatus === 'paid'),
            commissionYear: sum(r => r.commissionStatus !== 'none' && new Date(r.createdAt) >= yearStart)
        },
        commissionPct: req.account.partner?.commissionPct ?? 10,
        services: P.REFERRAL_SERVICES
    });
}));

partner.post('/referrals', limiter, asyncRoute(async (req, res) => {
    const a = req.account;
    const data = P.validateReferral(req.body);
    const existing = await PartnerReferral.findOne({ requestId: data.requestId, partner: a._id }).lean();
    if (existing) return res.json({ success: true, referral: referralView(existing) });
    const agency = a.partner?.agencyName || a.company || a.name;
    const number = await portal.nextNumber('PAR');
    const dateText = data.preferredDate ? dayFmt(data.preferredDate) : 'Do ustalenia';
    const referral = await PartnerReferral.create({
        ...data,
        number,
        partner: a._id,
        agencyName: agency,
        agentName: a.name,
        commissionPct: a.partner?.commissionPct ?? 10
    });
    const task = await portal.createPortalTask({
        name: `Polecenie ${agency}: ${data.services.join(', ')}`.slice(0, 160),
        type: data.services[0].slice(0, 80),
        division: 'revhome',
        source: `Partner: ${agency}`.slice(0, 80),
        portalKind: 'partner',
        portalRef: referral._id,
        clientName: data.clientName,
        clientPhone: data.clientPhone,
        clientEmail: data.clientEmail,
        address: data.targetAddress ? '' : data.propertyAddress,
        addressFrom: data.targetAddress ? data.propertyAddress : '',
        addressTo: data.targetAddress,
        clientPreferredDate: dateText,
        desc: [`Termin zgłoszony przez klienta: ${dateText}`, '', `Polecenie od biura nieruchomości: ${agency} (agent: ${a.name}, ${a.phone || a.email}). Prowizja ${referral.commissionPct}%.`,
            `Usługi: ${data.services.join(', ')}`, data.listingUrl ? `Ogłoszenie: ${data.listingUrl}` : '', data.notes ? `\nUwagi: ${data.notes}` : ''].filter(Boolean).join('\n').slice(0, 4000)
    });
    await PartnerReferral.updateOne({ _id: referral._id }, { $set: { task: task._id } });
    await recordActivity('partner_referral', `Polecenie ${number} od ${agency}: ${data.clientName}`, 'PartnerReferral', referral._id, a.name);
    void portal.notifyAdmins({ type: 'portal', title: '🤝 Nowe polecenie od biura nieruchomości', body: `${agency} · ${data.clientName} · ${data.services.join(', ')}`, url: `/revmi/#/zlecenia/${task._id}`, dedupeKey: `referral:${referral._id}` });
    res.status(201).json({ success: true, referral: referralView(referral.toObject()) });
}));

module.exports = router;
module.exports._internal = { referralView, routeView };
