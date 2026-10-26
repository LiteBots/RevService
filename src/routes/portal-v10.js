'use strict';

/**
 * 9.1: panel klienta — czat w zleceniu; panel dewelopera (inwestycje, kod dla nabywców, zgłoszenia).
 */
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { Task } = require('../models');
const { DevInvestment, DevLead } = require('../models-v9');
const L = require('../../lib/v10-input');
const portal = require('../services/portal');
const chat = require('../services/chat');
const dev = require('../services/developer');
const { requireAccount, requireAccess } = require('../middleware/account');
const { asyncRoute, httpError, isObjectId } = require('../utils');

const router = express.Router();
const chatLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, message: 'Za dużo wiadomości — spróbuj za chwilę.' } });

/* ---------- Czat w zleceniu (klient) ---------- */
async function ownTask(account, id) {
    if (!isObjectId(id)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const task = await Task.findOne({ _id: id, ...portal.accountTaskFilter(account) }).select('number name account workers status');
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    return task;
}

router.get('/konto/orders/:id/messages', requireAccount, asyncRoute(async (req, res) => {
    const task = await ownTask(req.account, req.params.id);
    res.json({ messages: await chat.list(task._id, 'client') });
}));

router.post('/konto/orders/:id/messages', requireAccount, chatLimiter, express.json({ limit: '4mb' }), asyncRoute(async (req, res) => {
    const task = await ownTask(req.account, req.params.id);
    if (task.status === 'cancelled') throw httpError(400, 'Zlecenie jest anulowane — zadzwoń: 735 396 534.');
    const data = L.validateChat(req.body);
    const message = await chat.post(task, { from: 'client', authorName: req.account.company || req.account.name, authorKey: 'client:' + req.account._id, ...data });
    res.status(201).json({ success: true, message });
}));

router.get('/konto/orders/:id/messages/:msgId/photo', requireAccount, asyncRoute(async (req, res) => {
    const task = await ownTask(req.account, req.params.id);
    if (!isObjectId(req.params.msgId)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const p = await chat.photo(task._id, req.params.msgId);
    if (!p) throw httpError(404, 'Nie znaleziono zdjęcia');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(p.contentType).send(p.data);
}));

/* ---------- Panel dewelopera ---------- */
const devr = express.Router();
router.use('/b2b/developer', requireAccount, requireAccess('developer'), devr);

const STATUS_PL = { new: 'Nowe', contacted: 'Kontakt z nabywcą', planned: 'Zaplanowane', completed: 'Zrealizowane', lost: 'Bez realizacji' };
const leadView = l => ({ id: String(l._id), number: l.number, investment: String(l.investment), via: l.via, name: l.name, phone: l.phone, email: l.email, unit: l.unit, handoverDate: l.handoverDate, moveDate: l.moveDate, services: l.services, status: l.status, statusLabel: STATUS_PL[l.status] || l.status, commissionAmount: l.commissionAmount || 0, createdAt: l.createdAt });

devr.get('/overview', asyncRoute(async (req, res) => {
    const [investments, leads] = await Promise.all([
        DevInvestment.find({ account: req.account._id }).sort({ active: -1, createdAt: -1 }).lean(),
        DevLead.find({ developer: req.account._id }).sort({ createdAt: -1 }).limit(500).lean()
    ]);
    res.json({
        investments: investments.map(i => {
            const own = leads.filter(l => String(l.investment) === String(i._id));
            return { ...i, _id: String(i._id), leads: own.length, completed: own.filter(l => l.status === 'completed').length, link: `/odbior.html?kod=${i.code}` };
        }),
        leads: leads.map(leadView),
        stats: {
            investments: investments.filter(i => i.active).length,
            leads: leads.length,
            completed: leads.filter(l => l.status === 'completed').length,
            self: leads.filter(l => l.via === 'buyer').length,
            commission: Math.round(leads.reduce((s, l) => s + (l.commissionAmount || 0), 0) * 100) / 100
        },
        services: L.DEV_LEAD_SERVICES
    });
}));

devr.post('/investments', asyncRoute(async (req, res) => {
    const data = L.validateInvestment(req.body);
    if (await DevInvestment.countDocuments({ account: req.account._id }) >= 100) throw httpError(400, 'Limit 100 inwestycji.');
    const inv = await DevInvestment.create({ ...data, account: req.account._id, code: await dev.uniqueCode(data.name) });
    void portal.notifyAdmins({ type: 'portal', title: '🏗️ Nowa inwestycja dewelopera', body: `${req.account.company || req.account.name} · ${inv.name} (${inv.city}) — ustaw rabat i prowizję`, url: '/revmi/#/deweloperzy' });
    res.status(201).json({ success: true, investment: inv });
}));

devr.put('/investments/:id', asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const data = L.validateInvestment(req.body);
    const inv = await DevInvestment.findOneAndUpdate({ _id: req.params.id, account: req.account._id }, { $set: data }, { new: true });
    if (!inv) throw httpError(404, 'Nie znaleziono inwestycji');
    res.json({ success: true, investment: inv });
}));

devr.post('/leads', chatLimiter, asyncRoute(async (req, res) => {
    const data = L.validateDevLead(req.body);
    const existing = await DevLead.findOne({ requestId: data.requestId, developer: req.account._id }).lean();
    if (existing) return res.json({ success: true, lead: leadView(existing) });
    const inv = await DevInvestment.findOne({ _id: data.investment, account: req.account._id }).lean();
    if (!inv) throw httpError(404, 'Nie znaleziono inwestycji');
    const lead = await dev.createLead({ inv, data, via: 'developer', agent: req.account.name });
    res.status(201).json({ success: true, lead: leadView(lead.toObject()) });
}));

module.exports = router;
module.exports._internal = { leadView };
