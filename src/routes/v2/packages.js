'use strict';

/** RevMi 2.0.0 — pakiety dla firm: plany, sprzedane pakiety, licznik wykorzystania, faktury cykliczne, zamówienia usług. */
const express = require('express');
const { Client, Task, Income } = require('../../models');
const { PackagePlan, PackageSub, CrmEvent } = require('../../models-v2');
const V = require('../../../lib/v2');
const { requireAdmin, validateId } = require('../../middleware/auth');
const { asyncRoute, httpError, isObjectId } = require('../../utils');
const { recordActivity } = require('../../services/activity');

const router = express.Router();
router.use('/v2/packages', requireAdmin);

const PERIODS = ['month', 'quarter', 'year'];
const PERIOD_LABELS = { month: 'mies.', quarter: 'kwartał', year: 'rok' };
const optNum = (v, min = 0) => (v === '' || v === null || v === undefined ? null : (Number.isFinite(Number(v)) && Number(v) >= min ? Number(v) : null));

function planPayload(b) {
    const name = String(b.name || '').trim().slice(0, 80);
    if (!name) throw httpError(400, 'Podaj nazwę planu');
    const priceNet = Number(b.priceNet);
    if (!Number.isFinite(priceNet) || priceNet < 0) throw httpError(400, 'Podaj cenę netto');
    return {
        name,
        tagline: String(b.tagline || '').trim().slice(0, 160),
        priceNet,
        vatRate: optNum(b.vatRate) ?? 23,
        period: PERIODS.includes(b.period) ? b.period : 'month',
        serviceLimit: optNum(b.serviceLimit),
        responseHours: optNum(b.responseHours) ?? 48,
        features: (Array.isArray(b.features) ? b.features : String(b.features || '').split('\n')).map(s => String(s).trim().slice(0, 140)).filter(Boolean).slice(0, 12),
        services: (Array.isArray(b.services) ? b.services : String(b.services || '').split(',')).map(s => String(s).trim().slice(0, 80)).filter(Boolean).slice(0, 20),
        extraServicePrice: optNum(b.extraServicePrice),
        highlight: b.highlight === true,
        color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#03F0BA',
        active: b.active !== false,
        order: Number(b.order) || 0
    };
}

const invoiceFor = (sub, periodStart, periodEnd) => ({
    periodStart, periodEnd,
    amountNet: sub.priceNet,
    amountGross: V.grossOf(sub.priceNet, sub.vatRate),
    status: 'due',
    number: `${sub.number}/${V.dayKey(periodStart).slice(0, 7)}`
});

async function withUsage(subs) {
    if (!subs.length) return [];
    const minFrom = new Date(Math.min(...subs.map(s => new Date(s.periodStart))));
    const tasks = await Task.find({ packageSub: { $in: subs.map(s => s._id) }, dateStart: { $gte: minFrom } }).select('packageSub status dateStart').lean();
    return subs.map(s => ({ ...s, usage: V.packageUsage(s, tasks), due: (s.invoices || []).filter(i => i.status === 'due').reduce((sum, i) => sum + (i.amountGross || 0), 0) }));
}

router.get('/v2/packages', asyncRoute(async (req, res) => {
    const [plans, subsRaw] = await Promise.all([
        PackagePlan.find().sort({ order: 1, priceNet: 1 }).lean(),
        PackageSub.find({ status: { $ne: 'cancelled' } }).sort({ renewDate: 1 }).lean()
    ]);
    const subs = await withUsage(subsRaw);
    const active = subs.filter(s => s.status === 'active');
    const soon = new Date(Date.now() + 30 * V.DAY);
    const withLimit = active.filter(s => s.usage.pct !== null);
    res.json({
        plans: plans.map(p => ({ ...p, subscribers: active.filter(s => String(s.plan) === String(p._id)).length })),
        subs,
        periodLabels: PERIOD_LABELS,
        kpi: {
            mrrNet: V.round2(active.reduce((s, x) => s + V.monthlyNet(x), 0)),
            mrrGross: V.round2(active.reduce((s, x) => s + V.grossOf(V.monthlyNet(x), x.vatRate), 0)),
            active: active.length,
            renewSoon: active.filter(s => new Date(s.renewDate) <= soon).length,
            avgUsage: withLimit.length ? Math.round(withLimit.reduce((s, x) => s + x.usage.pct, 0) / withLimit.length) : null,
            dueGross: V.round2(subs.reduce((s, x) => s + x.due, 0))
        }
    });
}));

router.post('/v2/packages/plans', asyncRoute(async (req, res) => {
    const plan = await PackagePlan.create(planPayload(req.body || {}));
    res.status(201).json({ success: true, plan });
}));

router.put('/v2/packages/plans/:id', validateId, asyncRoute(async (req, res) => {
    const plan = await PackagePlan.findByIdAndUpdate(req.params.id, { $set: planPayload(req.body || {}) }, { new: true, runValidators: true });
    if (!plan) throw httpError(404, 'Nie znaleziono planu');
    res.json({ success: true, plan });
}));

router.delete('/v2/packages/plans/:id', validateId, asyncRoute(async (req, res) => {
    if (await PackageSub.exists({ plan: req.params.id, status: { $ne: 'cancelled' } })) throw httpError(400, 'Plan ma aktywne pakiety — najpierw je zakończ albo ukryj plan.');
    await PackagePlan.deleteOne({ _id: req.params.id });
    res.json({ success: true });
}));

/** Sprzedaż pakietu: istniejący klient albo nowa firma (od razu w CRM). */
router.post('/v2/packages/subs', asyncRoute(async (req, res) => {
    const b = req.body || {};
    if (!isObjectId(b.plan)) throw httpError(400, 'Wybierz plan');
    const plan = await PackagePlan.findById(b.plan).lean();
    if (!plan) throw httpError(404, 'Nie znaleziono planu');
    let client;
    if (isObjectId(b.client)) client = await Client.findById(b.client);
    else if (b.newClient?.name) {
        client = await Client.create({ name: String(b.newClient.name).trim().slice(0, 160), company: String(b.newClient.name).trim().slice(0, 180), type: 'company', kind: 'b2b', stage: 'won', nip: String(b.newClient.nip || '').replace(/\D/g, '').slice(0, 10), phone: String(b.newClient.phone || '').slice(0, 40), email: String(b.newClient.email || '').toLowerCase().slice(0, 160), address: String(b.newClient.address || '').slice(0, 300), source: 'Pakiet firmowy' });
    }
    if (!client) throw httpError(400, 'Wybierz albo dodaj firmę');
    const start = b.startDate ? new Date(b.startDate + 'T00:00:00') : V.startOfDay(new Date());
    if (Number.isNaN(start.getTime())) throw httpError(400, 'Nieprawidłowa data startu');
    const count = await PackageSub.countDocuments();
    const sub = new PackageSub({
        number: `PK/${start.getFullYear()}/${String(count + 1).padStart(3, '0')}`,
        client: client._id,
        clientName: client.company || client.name,
        plan: plan._id,
        planName: plan.name,
        priceNet: optNum(b.priceNet) ?? plan.priceNet,
        vatRate: plan.vatRate ?? 23,
        serviceLimit: b.serviceLimit === undefined ? plan.serviceLimit : optNum(b.serviceLimit),
        period: plan.period,
        status: 'active',
        startDate: start,
        periodStart: start,
        renewDate: V.addPeriod(start, plan.period),
        autoRenew: b.autoRenew !== false,
        branch: isObjectId(b.branch) ? b.branch : null,
        contactName: String(b.contactName || '').slice(0, 140),
        contactPhone: String(b.contactPhone || client.phone || '').slice(0, 40),
        contactEmail: String(b.contactEmail || client.email || '').toLowerCase().slice(0, 160),
        address: String(b.address || client.address || '').slice(0, 300),
        notes: String(b.notes || '').slice(0, 2000),
        createdBy: req.user.name
    });
    sub.invoices.push(invoiceFor(sub, sub.periodStart, sub.renewDate));
    await sub.save();
    if (!['won', 'client'].includes(client.stage)) await Client.updateOne({ _id: client._id }, { $set: { stage: 'won' } });
    await CrmEvent.create({ client: client._id, type: 'payment', text: `Sprzedano pakiet ${plan.name} (${sub.priceNet} zł netto / ${PERIOD_LABELS[plan.period]})`, by: req.user.name });
    await recordActivity('package', `Nowy pakiet ${plan.name}: ${sub.clientName}`, null, null, req.user.name);
    res.status(201).json({ success: true, sub });
}));

router.put('/v2/packages/subs/:id', validateId, asyncRoute(async (req, res) => {
    const sub = await PackageSub.findById(req.params.id);
    if (!sub) throw httpError(404, 'Nie znaleziono pakietu');
    const b = req.body || {};
    if (['active', 'paused', 'cancelled'].includes(b.status) && b.status !== sub.status) {
        sub.status = b.status;
        if (b.status === 'cancelled') sub.cancelledAt = new Date();
        await CrmEvent.create({ client: sub.client, type: 'note', text: `Pakiet ${sub.planName}: ${b.status === 'active' ? 'wznowiony' : b.status === 'paused' ? 'wstrzymany' : 'zakończony'}`, by: req.user.name });
    }
    if (b.priceNet !== undefined) sub.priceNet = optNum(b.priceNet) ?? sub.priceNet;
    if (b.serviceLimit !== undefined) sub.serviceLimit = optNum(b.serviceLimit);
    if (b.autoRenew !== undefined) sub.autoRenew = b.autoRenew !== false;
    for (const k of ['contactName', 'contactPhone', 'contactEmail', 'address', 'notes']) if (b[k] !== undefined) sub[k] = String(b[k] || '').slice(0, k === 'notes' ? 2000 : 300);
    if (b.renewDate) { const d = new Date(b.renewDate + 'T00:00:00'); if (!Number.isNaN(d.getTime())) sub.renewDate = d; }
    await sub.save();
    res.json({ success: true, sub });
}));

router.post('/v2/packages/subs/:id/invoices/:invoiceId/paid', validateId, asyncRoute(async (req, res) => {
    const sub = await PackageSub.findById(req.params.id);
    if (!sub) throw httpError(404, 'Nie znaleziono pakietu');
    const inv = sub.invoices.id(req.params.invoiceId);
    if (!inv) throw httpError(404, 'Nie znaleziono faktury');
    if (inv.status === 'paid') return res.json({ success: true, sub });
    const income = await Income.create({ price: inv.amountGross, category: 'Pakiet firmowy', desc: `${inv.number} · ${sub.clientName} · ${sub.planName}`, date: new Date(), client: sub.client, paymentMethod: String(req.body?.method || 'przelew').slice(0, 40) });
    inv.status = 'paid';
    inv.paidAt = new Date();
    inv.income = income._id;
    await sub.save();
    await CrmEvent.create({ client: sub.client, type: 'payment', text: `Opłacono ${inv.number}: ${inv.amountGross} zł`, by: req.user.name });
    res.json({ success: true, sub });
}));

/** Zamówienie usługi w ramach pakietu → zlecenie przypięte do pakietu (liczy się do limitu). */
router.post('/v2/packages/subs/:id/order', validateId, asyncRoute(async (req, res) => {
    const sub = await PackageSub.findById(req.params.id).lean();
    if (!sub || sub.status !== 'active') throw httpError(400, 'Pakiet nie jest aktywny');
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 160);
    if (!name) throw httpError(400, 'Podaj nazwę usługi');
    const date = new Date(b.dateStart);
    if (Number.isNaN(date.getTime())) throw httpError(400, 'Podaj termin');
    const tasks = await Task.find({ packageSub: sub._id, dateStart: { $gte: sub.periodStart } }).select('packageSub status dateStart').lean();
    const usage = V.packageUsage(sub, tasks.concat([{ packageSub: sub._id, status: 'planned', dateStart: date }]));
    const plan = await PackagePlan.findById(sub.plan).select('extraServicePrice').lean();
    const extra = usage.over > 0 && date < new Date(sub.renewDate);
    const task = await Task.create({
        name, type: String(b.type || 'Pakiet firmowy').slice(0, 80), status: 'planned', dateStart: date,
        client: sub.client, clientName: sub.clientName, clientPhone: sub.contactPhone, clientEmail: sub.contactEmail,
        address: String(b.address || sub.address || '').slice(0, 300), desc: String(b.desc || '').slice(0, 4000),
        price: extra && plan?.extraServicePrice ? plan.extraServicePrice : 0,
        branch: sub.branch || null, packageSub: sub._id, source: 'Pakiet firmowy', createdBy: req.user.name
    });
    await recordActivity('task_created', `${task.number}: ${task.name} (pakiet ${sub.planName})`, 'Task', task._id, req.user.name);
    res.status(201).json({ success: true, task, extra, usage });
}));

module.exports = router;
