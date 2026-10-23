'use strict';

/**
 * 9.1: RevMi — analityka (rentowność per usługa i miasto, lejek sprzedaży), dodatki do zamówień,
 * newsletter (subskrybenci, kampanie), deweloperzy, czat w zleceniu (biuro i ekipa).
 */
const express = require('express');
const { Task, PayEntry } = require('../models');
const V = require('../models-v9');
const L = require('../../lib/v10-input');
const P = require('../../lib/portal-input');
const newsletter = require('../services/newsletter');
const chat = require('../services/chat');
const scope = require('../services/scope');
const mail = require('../services/mail');
const { requireAdmin, validateId } = require('../middleware/auth');
const { asyncRoute, httpError, isObjectId, escapeRegex } = require('../utils');
const { recordActivity } = require('../services/activity');

const router = express.Router();
const round2 = v => Math.round((Number(v) || 0) * 100) / 100;
const found = (doc, msg = 'Nie znaleziono') => { if (!doc) throw httpError(404, msg); return doc; };

function period(q) {
    const now = new Date();
    const to = q.to ? new Date(q.to) : now;
    const from = q.from ? new Date(q.from) : new Date(now.getFullYear(), now.getMonth() - 2, 1);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw httpError(400, 'Nieprawidłowy okres');
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
    return { from, to: end };
}

/* ================================================================== */
/* ANALITYKA                                                            */
/* ================================================================== */

router.get('/v9/analytics/profitability', requireAdmin, asyncRoute(async (req, res) => {
    const { from, to } = period(req.query);
    const tasks = await Task.find({ status: 'completed', completedAt: { $gte: from, $lte: to } })
        .select('type division address addressFrom addressTo finalPrice price costs hoursWorked completedAt').lean();
    const pays = await PayEntry.aggregate([
        { $match: { task: { $in: tasks.map(t => t._id) }, kind: { $in: ['pay', 'bonus'] } } },
        { $group: { _id: '$task', total: { $sum: '$amount' } } }
    ]);
    const r = L.profitability(tasks, new Map(pays.map(p => [String(p._id), p.total])));
    res.json({ from, to, ...r });
}));

router.get('/v9/analytics/funnel', requireAdmin, asyncRoute(async (req, res) => {
    const { from, to } = period(req.query);
    const tasks = await Task.find({ createdAt: { $gte: from, $lte: to }, source: { $nin: ['Harmonogram', 'Stała trasa (panel hoteli)', 'Abonament'] } })
        .select('status source type division price finalPrice aiEstimate quotedAt plannedAt clientAcceptedAt clientCancelReason createdAt').lean();
    res.json({ from, to, ...L.funnel(tasks) });
}));

/* ================================================================== */
/* DODATKI                                                              */
/* ================================================================== */

/** Lista startowa — bez cen („w wycenie”), administrator ustawia ceny sam. */
const DEFAULT_ADDONS = [
    { name: 'Kartony i materiały', description: 'Kartony, taśma, folia stretch — dowieziemy przed przeprowadzką', icon: 'fa-box', unit: 'szt.', allowQty: true, maxQty: 100, divisions: ['revhome', 'revcargo'], order: 1 },
    { name: 'Pakowanie rzeczy', description: 'Spakujemy i opiszemy kartony', icon: 'fa-box-open', divisions: ['revhome'], order: 2 },
    { name: 'Demontaż i montaż mebli', description: 'Rozkręcimy i złożymy szafy, łóżka, biurka', icon: 'fa-screwdriver-wrench', divisions: ['revhome', 'revcargo'], order: 3 },
    { name: 'Wywóz starych mebli', description: 'Zabierzemy i zutylizujemy to, czego nie bierzesz', icon: 'fa-trash-can', divisions: ['revhome', 'revclean', 'revfacility'], order: 4 },
    { name: 'Sprzątanie po wyprowadzce', description: 'Mieszkanie gotowe do oddania kluczy', icon: 'fa-broom', divisions: ['revhome', 'revclean'], order: 5 },
    { name: 'Przechowanie rzeczy (RevStorage)', description: 'Rzeczy poczekają w magazynie, aż będziesz gotowy', icon: 'fa-box-archive', unit: 'm³', allowQty: true, maxQty: 50, order: 6 },
    { name: 'Termin ekspresowy (do 48 h)', description: 'Pierwszeństwo w grafiku ekip', icon: 'fa-bolt', order: 7 },
    { name: 'Weekend lub święto', description: 'Realizacja w sobotę, niedzielę lub święto', icon: 'fa-calendar-day', order: 8 }
];

router.get('/v9/addons', requireAdmin, asyncRoute(async (req, res) => {
    if (await V.Addon.estimatedDocumentCount() === 0) await V.Addon.insertMany(DEFAULT_ADDONS.map(a => ({ unit: 'usł.', allowQty: false, maxQty: 20, divisions: [], ...a, price: null, active: true }))).catch(() => null);
    res.json({ addons: await V.Addon.find({}).sort({ order: 1, name: 1 }).lean(), units: L.ADDON_UNITS });
}));
router.post('/v9/addons', requireAdmin, asyncRoute(async (req, res) => res.status(201).json({ success: true, addon: await V.Addon.create(L.validateAddon(req.body)) })));
router.put('/v9/addons/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const a = found(await V.Addon.findById(req.params.id), 'Nie znaleziono dodatku');
    a.set(L.validateAddon({ ...a.toObject(), ...req.body }));
    await a.save();
    res.json({ success: true, addon: a });
}));
router.delete('/v9/addons/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    found(await V.Addon.findByIdAndDelete(req.params.id), 'Nie znaleziono dodatku');
    res.json({ success: true });
}));

/* ================================================================== */
/* NEWSLETTER                                                           */
/* ================================================================== */

router.get('/v9/newsletter', requireAdmin, asyncRoute(async (req, res) => {
    const filter = {};
    if (['pending', 'active', 'unsubscribed'].includes(req.query.status)) filter.status = req.query.status;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
    if (q) filter.$or = [{ email: new RegExp(escapeRegex(q), 'i') }, { name: new RegExp(escapeRegex(q), 'i') }, { city: new RegExp(escapeRegex(q), 'i') }];
    const [subs, counts, bySource, campaigns] = await Promise.all([
        V.NewsletterSubscriber.find(filter).sort({ createdAt: -1 }).limit(1000).lean(),
        V.NewsletterSubscriber.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
        V.NewsletterSubscriber.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$source', n: { $sum: 1 } } }]),
        V.Campaign.find({}).sort({ createdAt: -1 }).limit(100).lean()
    ]);
    const c = Object.fromEntries(counts.map(x => [x._id, x.n]));
    res.json({
        subscribers: subs.map(s => ({ _id: String(s._id), email: s.email, name: s.name, city: s.city, kind: s.kind, topics: s.topics, source: s.source, status: s.status, createdAt: s.createdAt, confirmedAt: s.confirmedAt, sentCount: s.sentCount, account: s.account ? String(s.account) : null })),
        counts: { active: c.active || 0, pending: c.pending || 0, unsubscribed: c.unsubscribed || 0 },
        bySource: bySource.map(x => ({ source: x._id || '—', n: x.n })).sort((a, b) => b.n - a.n),
        campaigns,
        topics: L.NEWSLETTER_TOPIC_LABELS,
        mailConfigured: mail.isConfigured()
    });
}));

/** Ręczne dodanie (np. klient poprosił telefonicznie) — zawsze z mailem potwierdzającym. */
router.post('/v9/newsletter/subscribers', requireAdmin, asyncRoute(async (req, res) => {
    const data = L.validateNewsletter({ ...req.body, source: 'admin', consent: req.body?.consent === true });
    const r = await newsletter.subscribe(data);
    res.status(201).json({ success: true, ...r });
}));

router.delete('/v9/newsletter/subscribers/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    found(await V.NewsletterSubscriber.findByIdAndDelete(req.params.id), 'Nie znaleziono');
    res.json({ success: true });
}));

/** Konta klientów z potwierdzonym e-mailem i zgodą marketingową → aktywni subskrybenci. */
router.post('/v9/newsletter/sync-accounts', requireAdmin, asyncRoute(async (req, res) => {
    const accounts = await V.Account.find({ marketingConsent: true, emailVerified: true, status: 'active' }).lean();
    let added = 0;
    for (const a of accounts) {
        const before = await V.NewsletterSubscriber.findOne({ email: a.email }).select('status').lean();
        if (before?.status === 'unsubscribed') continue; // wypisany — szanujemy decyzję
        const r = await newsletter.syncAccount(a);
        if (r && !r.already) added++;
    }
    res.json({ success: true, added, checked: accounts.length });
}));

router.post('/v9/newsletter/resend-confirmations', requireAdmin, asyncRoute(async (req, res) => {
    const pending = await V.NewsletterSubscriber.find({ status: 'pending', createdAt: { $gte: new Date(Date.now() - 60 * 86_400_000) } }).limit(200).lean();
    let sent = 0;
    for (const s of pending) { const r = await newsletter.subscribe({ email: s.email, name: s.name, city: s.city, topics: s.topics, source: s.source, kind: s.kind }); if (r.needsConfirmation) sent++; }
    res.json({ success: true, sent });
}));

router.get('/v9/newsletter/export.csv', requireAdmin, asyncRoute(async (req, res) => {
    const subs = await V.NewsletterSubscriber.find({ status: 'active' }).sort({ createdAt: 1 }).lean();
    const cell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['email', 'imie', 'miasto', 'typ', 'tematy', 'zrodlo', 'zgoda', 'potwierdzono'].join(';'), ...subs.map(s => [s.email, s.name, s.city, s.kind, (s.topics || []).join(','), s.source, s.consentAt?.toISOString(), s.confirmedAt?.toISOString()].map(cell).join(';'))];
    res.setHeader('Content-Disposition', 'attachment; filename="newsletter-revserwis.csv"');
    res.type('text/csv; charset=utf-8').send('﻿' + rows.join('\n'));
}));

router.post('/v9/campaigns', requireAdmin, asyncRoute(async (req, res) => {
    const data = L.validateCampaign(req.body);
    const c = await V.Campaign.create({ ...data, createdBy: req.user.name });
    res.status(201).json({ success: true, campaign: c, audience: await newsletter.countSegment(c) });
}));

router.put('/v9/campaigns/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const c = found(await V.Campaign.findById(req.params.id), 'Nie znaleziono kampanii');
    if (c.status !== 'draft') throw httpError(400, 'Wysłanej kampanii nie można edytować — skopiuj ją.');
    c.set(L.validateCampaign({ ...c.toObject(), ...req.body }));
    c.markModified('blocks');
    await c.save();
    res.json({ success: true, campaign: c, audience: await newsletter.countSegment(c) });
}));

router.delete('/v9/campaigns/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const c = found(await V.Campaign.findById(req.params.id), 'Nie znaleziono kampanii');
    if (c.status === 'sending') throw httpError(400, 'Najpierw wstrzymaj wysyłkę.');
    await c.deleteOne();
    res.json({ success: true });
}));

router.get('/v9/campaigns/:id/audience', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const c = found(await V.Campaign.findById(req.params.id).lean(), 'Nie znaleziono kampanii');
    res.json({ audience: await newsletter.countSegment(c) });
}));

router.get('/v9/campaigns/:id/preview', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const c = found(await V.Campaign.findById(req.params.id).lean(), 'Nie znaleziono kampanii');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'");
    res.type('html').send(L.renderCampaign(c, { name: 'Jan', unsubscribeUrl: '#' }).html);
}));

router.post('/v9/campaigns/:id/test', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const c = found(await V.Campaign.findById(req.params.id).lean(), 'Nie znaleziono kampanii');
    const to = P.email(req.body?.email);
    if (!mail.isConfigured()) throw httpError(400, 'Poczta nie jest skonfigurowana (RESEND_API_KEY lub SMTP).');
    await newsletter.sendTest(c, to);
    res.json({ success: true });
}));

router.post('/v9/campaigns/:id/send', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const c = await newsletter.startCampaign(req.params.id);
    await recordActivity('campaign', `Kampania „${c.subject}” — wysyłka do ${c.stats.total} osób`, 'Campaign', c._id, req.user.name);
    res.json({ success: true, total: c.stats.total });
}));

router.post('/v9/campaigns/:id/:action(pause|resume)', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const c = found(await V.Campaign.findById(req.params.id), 'Nie znaleziono kampanii');
    if (req.params.action === 'pause' && c.status === 'sending') c.status = 'paused';
    else if (req.params.action === 'resume' && c.status === 'paused') c.status = 'sending';
    else throw httpError(400, 'Nie można zmienić stanu tej kampanii.');
    await c.save();
    res.json({ success: true, status: c.status });
}));

router.post('/v9/campaigns/:id/duplicate', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const c = found(await V.Campaign.findById(req.params.id).lean(), 'Nie znaleziono kampanii');
    const copy = await V.Campaign.create({ subject: c.subject + ' (kopia)', preheader: c.preheader, blocks: c.blocks, segment: c.segment, segmentValue: c.segmentValue, createdBy: req.user.name });
    res.status(201).json({ success: true, campaign: copy });
}));

/* ================================================================== */
/* DEWELOPERZY                                                          */
/* ================================================================== */

router.get('/v9/developers', requireAdmin, asyncRoute(async (req, res) => {
    const accounts = await V.Account.find({ $or: [{ access: 'developer' }, { accessRequested: 'developer' }] }).select('name email phone company access').lean();
    const ids = accounts.map(a => a._id);
    const [investments, leads] = await Promise.all([
        V.DevInvestment.find({ account: { $in: ids } }).sort({ createdAt: -1 }).lean(),
        V.DevLead.find({ developer: { $in: ids } }).sort({ createdAt: -1 }).limit(1000).lean()
    ]);
    res.json({
        developers: accounts.map(a => ({ ...a, _id: String(a._id), hasAccess: (a.access || []).includes('developer'), investments: investments.filter(i => String(i.account) === String(a._id)).map(i => ({ ...i, leads: leads.filter(l => String(l.investment) === String(i._id)).length })) })),
        leads,
        summary: { investments: investments.length, leads: leads.length, newLeads: leads.filter(l => l.status === 'new').length, completed: leads.filter(l => l.status === 'completed').length }
    });
}));

router.put('/v9/investments/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const inv = found(await V.DevInvestment.findById(req.params.id), 'Nie znaleziono inwestycji');
    const b = req.body || {};
    if (b.discountPct !== undefined) inv.discountPct = P.num(b.discountPct, 'Rabat', { min: 0, max: 50 }) || 0;
    if (b.commissionPct !== undefined) inv.commissionPct = P.num(b.commissionPct, 'Prowizja', { min: 0, max: 50 }) || 0;
    if (b.active !== undefined) inv.active = b.active === true;
    await inv.save();
    res.json({ success: true, investment: inv });
}));

router.put('/v9/dev-leads/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const lead = found(await V.DevLead.findById(req.params.id), 'Nie znaleziono zgłoszenia');
    const b = req.body || {};
    if (b.status !== undefined) {
        if (!L.DEV_LEAD_STATUSES.includes(b.status)) throw httpError(400, 'Nieprawidłowy status');
        lead.status = b.status;
    }
    if (b.orderValue !== undefined) lead.orderValue = P.num(b.orderValue, 'Wartość', { min: 0, max: 1e7 });
    if (lead.status === 'completed' && (lead.orderValue == null) && lead.task) {
        const t = await Task.findById(lead.task).select('finalPrice price').lean();
        if (t) lead.orderValue = t.finalPrice ?? t.price ?? 0;
    }
    const inv = await V.DevInvestment.findById(lead.investment).select('commissionPct').lean();
    lead.commissionAmount = lead.status === 'completed' ? round2((lead.orderValue || 0) * (inv?.commissionPct || 0) / 100) : 0;
    await lead.save();
    res.json({ success: true, lead });
}));

/* ================================================================== */
/* CZAT W ZLECENIU — biuro i ekipa                                      */
/* ================================================================== */

async function visibleTask(req, id) {
    if (!isObjectId(id)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const task = await Task.findById(id).select('number name account workers status branch');
    if (!task || !scope.canSeeTask(task, req.user)) throw httpError(404, 'Nie znaleziono zlecenia');
    return task;
}

router.get('/tasks/:id/messages', asyncRoute(async (req, res) => {
    const task = await visibleTask(req, req.params.id);
    res.json({ messages: await chat.list(task._id, 'staff'), canReply: Boolean(task.account) });
}));

router.post('/tasks/:id/messages', express.json({ limit: '4mb' }), asyncRoute(async (req, res) => {
    const task = await visibleTask(req, req.params.id);
    if (!task.account) throw httpError(400, 'Klient nie ma konta w panelu — przypnij zlecenie do konta albo zadzwoń.');
    const data = L.validateChat(req.body);
    const message = await chat.post(task, { from: 'staff', authorName: req.user.name, authorKey: req.user.employeeId || 'admin', ...data });
    res.status(201).json({ success: true, message });
}));

router.get('/tasks/:id/messages/:msgId/photo', asyncRoute(async (req, res) => {
    const task = await visibleTask(req, req.params.id);
    if (!isObjectId(req.params.msgId)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const p = found(await chat.photo(task._id, req.params.msgId), 'Nie znaleziono zdjęcia');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(p.contentType).send(p.data);
}));

module.exports = router;
module.exports._internal = { DEFAULT_ADDONS, period };
