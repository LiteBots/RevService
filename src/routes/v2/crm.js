'use strict';

/** RevMi 2.0.0 — CRM: lejek, historia kontaktu, następny krok z przypomnieniem. */
const express = require('express');
const { Client, Task } = require('../../models');
const { CrmEvent, PackageSub } = require('../../models-v2');
const V = require('../../../lib/v2');
const { requireAdmin, validateId } = require('../../middleware/auth');
const { asyncRoute, httpError, escapeRegex } = require('../../utils');
const { getV2 } = require('../../services/v2-config');

const router = express.Router();
router.use('/v2/crm', requireAdmin);

const STAGES = ['lead', 'offer', 'negotiation', 'won', 'client', 'lost'];
const STAGE_LABELS = { lead: 'Nowy lead', offer: 'Oferta wysłana', negotiation: 'Negocjacje', won: 'Wygrany', client: 'Klient', lost: 'Utracony' };
const KINDS = ['', 'hotel', 'partner', 'developer', 'b2b'];
const EVENT_TYPES = ['note', 'call', 'email', 'sms', 'meeting', 'offer', 'payment'];

function clientPayload(b, { partial }) {
    const out = {};
    const s = (k, max) => { if (b[k] !== undefined) out[k] = String(b[k] ?? '').trim().slice(0, max); };
    s('name', 160); s('company', 180); s('phone', 40); s('email', 160); s('address', 300); s('nip', 20); s('source', 80); s('notes', 4000);
    s('nextAction', 200); s('owner', 140); s('lostReason', 300);
    if (out.email) out.email = out.email.toLowerCase();
    if (b.type !== undefined) out.type = b.type === 'company' ? 'company' : 'person';
    if (b.stage !== undefined) { if (!STAGES.includes(b.stage)) throw httpError(400, 'Nieprawidłowy etap'); out.stage = b.stage; }
    if (b.kind !== undefined) out.kind = KINDS.includes(b.kind) ? b.kind : '';
    if (b.value !== undefined) { const v = Number(b.value); out.value = Number.isFinite(v) && v >= 0 ? v : 0; }
    if (b.nextActionAt !== undefined) {
        out.nextActionAt = b.nextActionAt ? new Date(b.nextActionAt) : null;
        if (out.nextActionAt && Number.isNaN(out.nextActionAt.getTime())) throw httpError(400, 'Nieprawidłowa data przypomnienia');
        out.nextActionNotifiedAt = null;
    }
    if (Array.isArray(b.tags)) out.tags = b.tags.map(t => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 12);
    if (!partial && !out.name) throw httpError(400, 'Podaj nazwę klienta');
    return out;
}

router.get('/v2/crm', asyncRoute(async (req, res) => {
    const cfg = await getV2();
    const filter = { archived: false };
    if (STAGES.includes(req.query.stage)) filter.stage = req.query.stage;
    if (req.query.kind === 'company') filter.type = 'company';
    else if (req.query.kind === 'person') filter.type = 'person';
    else if (KINDS.includes(req.query.kind) && req.query.kind) filter.kind = req.query.kind;
    if (req.query.q) {
        const q = escapeRegex(String(req.query.q).slice(0, 80));
        filter.$or = ['name', 'company', 'phone', 'email', 'nip'].map(f => ({ [f]: { $regex: q, $options: 'i' } }));
    }
    const clients = await Client.find(filter).sort({ updatedAt: -1 }).limit(500).lean();
    const ids = clients.map(c => c._id);
    const [stats, subs, monthWon, allStages] = await Promise.all([
        Task.aggregate([
            { $match: { client: { $in: ids }, status: { $ne: 'cancelled' } } },
            { $group: { _id: '$client', count: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, { $ifNull: ['$finalPrice', '$price'] }, 0] } }, last: { $max: '$dateStart' } } }
        ]),
        PackageSub.find({ client: { $in: ids }, status: 'active' }).select('client planName').lean(),
        CrmEvent.countDocuments({ type: 'stage', text: { $regex: '→ Wygrany' }, at: { $gte: V.periodRange('month').from } }),
        Client.aggregate([{ $match: { archived: false } }, { $group: { _id: '$stage', n: { $sum: 1 }, value: { $sum: '$value' } } }])
    ]);
    const statBy = new Map(stats.map(s => [String(s._id), s]));
    const subBy = new Map(subs.map(s => [String(s.client), s.planName]));
    const funnel = Object.fromEntries(STAGES.map(s => [s, { count: 0, value: 0 }]));
    for (const g of allStages) if (funnel[g._id || 'client']) funnel[g._id || 'client'] = { count: g.n, value: g.value };
    res.json({
        stages: STAGE_LABELS,
        funnel,
        wonThisMonth: monthWon,
        clients: clients.map(c => {
            const s = statBy.get(String(c._id));
            return { ...c, stage: c.stage || 'client', tasks: s?.count || 0, revenue: V.toGross(s?.done || 0, cfg), lastTaskAt: s?.last || null, package: subBy.get(String(c._id)) || '' };
        })
    });
}));

router.get('/v2/crm/:id', validateId, asyncRoute(async (req, res) => {
    const cfg = await getV2();
    const client = await Client.findById(req.params.id).lean();
    if (!client) throw httpError(404, 'Nie znaleziono klienta');
    const or = [{ client: client._id }];
    if (client.phone && client.phone.replace(/\D/g, '').length >= 9) or.push({ clientPhone: client.phone });
    if (client.email) or.push({ clientEmail: client.email });
    const [events, tasks, packages] = await Promise.all([
        CrmEvent.find({ client: client._id }).sort({ at: -1 }).limit(100).lean(),
        Task.find({ $or: or }).select('number name status dateStart price finalPrice paymentStatus clientRating type').sort({ dateStart: -1 }).limit(50).lean(),
        PackageSub.find({ client: client._id }).select('number planName status renewDate priceNet serviceLimit').lean()
    ]);
    const completed = tasks.filter(t => t.status === 'completed');
    const ratings = completed.map(t => t.clientRating).filter(Boolean);
    res.json({
        client: { ...client, stage: client.stage || 'client' },
        events,
        tasks,
        packages,
        stats: {
            tasks: tasks.length,
            revenue: V.toGross(completed.reduce((s, t) => s + V.taskAmount(t), 0), cfg),
            rating: ratings.length ? Math.round((ratings.reduce((s, x) => s + x, 0) / ratings.length) * 10) / 10 : null,
            unpaid: completed.filter(t => t.paymentStatus !== 'paid').length
        },
        stages: STAGE_LABELS
    });
}));

router.post('/v2/crm', asyncRoute(async (req, res) => {
    const data = clientPayload(req.body || {}, { partial: false });
    if (!data.stage) data.stage = 'lead';
    const client = await Client.create(data);
    await CrmEvent.create({ client: client._id, type: 'stage', text: `Dodano klienta · ${STAGE_LABELS[client.stage]}`, by: req.user.name });
    res.status(201).json({ success: true, client });
}));

router.put('/v2/crm/:id', validateId, asyncRoute(async (req, res) => {
    const client = await Client.findById(req.params.id);
    if (!client) throw httpError(404, 'Nie znaleziono klienta');
    const data = clientPayload(req.body || {}, { partial: true });
    const prevStage = client.stage || 'client';
    Object.assign(client, data);
    await client.save();
    if (data.stage && data.stage !== prevStage) {
        await CrmEvent.create({ client: client._id, type: 'stage', text: `${STAGE_LABELS[prevStage]} → ${STAGE_LABELS[data.stage]}${data.stage === 'lost' && client.lostReason ? ' (' + client.lostReason + ')' : ''}`, by: req.user.name });
    }
    res.json({ success: true, client });
}));

router.post('/v2/crm/:id/events', validateId, asyncRoute(async (req, res) => {
    const client = await Client.findById(req.params.id).select('_id');
    if (!client) throw httpError(404, 'Nie znaleziono klienta');
    const text = String(req.body?.text || '').trim().slice(0, 2000);
    if (!text) throw httpError(400, 'Wpisz treść');
    const type = EVENT_TYPES.includes(req.body?.type) ? req.body.type : 'note';
    const at = req.body?.at ? new Date(req.body.at) : new Date();
    const event = await CrmEvent.create({ client: client._id, type, text, at: Number.isNaN(at.getTime()) ? new Date() : at, by: req.user.name });
    if (['call', 'email', 'sms', 'meeting', 'offer'].includes(type)) await Client.updateOne({ _id: client._id }, { $set: { lastContactAt: event.at } });
    res.status(201).json({ success: true, event });
}));

router.delete('/v2/crm/events/:id', validateId, asyncRoute(async (req, res) => {
    const r = await CrmEvent.deleteOne({ _id: req.params.id, type: { $ne: 'stage' } });
    if (!r.deletedCount) throw httpError(404, 'Nie znaleziono wpisu');
    res.json({ success: true });
}));

module.exports = router;
