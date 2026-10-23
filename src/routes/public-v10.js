'use strict';

/**
 * 9.1: publiczne API — dodatki do zamówień, newsletter (zapis / potwierdzenie / wypis),
 * strona dla nabywców mieszkań od dewelopera (kod inwestycji → zgłoszenie przeprowadzki).
 */
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { Addon, DevInvestment, DevLead } = require('../models-v9');
const L = require('../../lib/v10-input');
const portal = require('../services/portal');
const newsletter = require('../services/newsletter');
const { isDivision } = require('../../lib/divisions');
const { asyncRoute, httpError } = require('../utils');
const { recordActivity } = require('../services/activity');

const router = express.Router();
const limiter = (limit, minutes = 15) => rateLimit({
    windowMs: minutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Za dużo prób. Spróbuj za kilka minut.' }
});

/* ---------- Dodatki ---------- */
router.get('/dodatki', asyncRoute(async (req, res) => {
    const division = isDivision(req.query.division) ? req.query.division : '';
    const filter = { active: true };
    if (division) filter.$or = [{ divisions: { $size: 0 } }, { divisions: division }];
    const addons = await Addon.find(filter).sort({ order: 1, name: 1 }).lean();
    res.json({ addons: addons.map(a => ({ id: String(a._id), name: a.name, description: a.description, icon: a.icon, price: a.price, unit: a.unit, allowQty: a.allowQty, maxQty: a.maxQty, divisions: a.divisions })) });
}));

/* ---------- Newsletter ---------- */
router.post('/newsletter', limiter(6), asyncRoute(async (req, res) => {
    const data = L.validateNewsletter(req.body);
    const r = await newsletter.subscribe(data);
    res.status(201).json({
        success: true,
        status: r.status,
        message: r.already ? 'Już jesteś na liście — dziękujemy!' : 'Sprawdź skrzynkę i potwierdź zapis (link ważny 14 dni).'
    });
    if (!r.already) void recordActivity('newsletter', `Zapis na newsletter: ${data.email} (${data.source})`, 'NewsletterSubscriber', null, 'Strona');
}));

router.post('/newsletter/potwierdz', limiter(20), asyncRoute(async (req, res) => {
    const token = String(req.body?.token || '');
    if (!/^[a-f0-9]{64}$/.test(token)) throw httpError(400, 'Nieprawidłowy link.');
    const sub = await newsletter.confirm(token);
    if (!sub) throw httpError(400, 'Link wygasł albo zapis został już potwierdzony.');
    res.json({ success: true, message: 'Dziękujemy! Zapis potwierdzony.' });
}));

router.post('/newsletter/wypisz', limiter(20), asyncRoute(async (req, res) => {
    const token = String(req.body?.token || '');
    if (!/^[a-f0-9]{48}$/.test(token)) throw httpError(400, 'Nieprawidłowy link.');
    const sub = await newsletter.unsubscribe(token);
    if (!sub) throw httpError(404, 'Nie znaleźliśmy tego zapisu.');
    res.json({ success: true, message: 'Wypisaliśmy Cię z newslettera. Nie dostaniesz już ofert e-mailem.' });
}));

/* ---------- Nabywcy od dewelopera ---------- */
const CODE = /^[A-Z0-9]{4,12}$/;

router.get('/deweloper/:code', limiter(60), asyncRoute(async (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    if (!CODE.test(code)) throw httpError(404, 'Nieprawidłowy kod inwestycji.');
    const inv = await DevInvestment.findOneAndUpdate({ code, active: true }, { $inc: { visits: 1 } }, { new: true }).lean();
    if (!inv) throw httpError(404, 'Nie znaleźliśmy inwestycji z tym kodem. Sprawdź kod od dewelopera.');
    res.json({ investment: { name: inv.name, city: inv.city, address: inv.address, handoverFrom: inv.handoverFrom, handoverTo: inv.handoverTo, buyerOffer: inv.buyerOffer, discountPct: inv.discountPct }, services: L.DEV_LEAD_SERVICES });
}));

router.post('/deweloper/:code/zgloszenie', limiter(5), asyncRoute(async (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    if (!CODE.test(code)) throw httpError(404, 'Nieprawidłowy kod inwestycji.');
    const inv = await DevInvestment.findOne({ code, active: true }).lean();
    if (!inv) throw httpError(404, 'Nie znaleźliśmy inwestycji z tym kodem.');
    const data = L.validateDevLead(req.body, { publicForm: true });
    const existing = await DevLead.findOne({ requestId: data.requestId }).lean();
    if (existing) return res.json({ success: true, number: existing.number });
    const lead = await require('../services/developer').createLead({ inv, data, via: 'buyer' });
    if (data.newsletter && data.email) void newsletter.subscribe({ email: data.email, name: data.name.split(' ')[0], city: inv.city, topics: ['promocje', 'sezon'], source: 'odbior', kind: 'person' }).catch(() => null);
    res.status(201).json({ success: true, number: lead.number });
}));

module.exports = router;
