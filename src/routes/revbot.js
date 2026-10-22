'use strict';

/**
 * 8.0: RevBot w panelu (tylko administrator) — ukryte parametry wyceny, pamięć, wiedza z internetu, pytania, symulacja.
 */
const express = require('express');
const { RevBotMemory, Settings, REVBOT_MEMORY_KINDS } = require('../models');
const { requireAdmin, validateId } = require('../middleware/auth');
const { asyncRoute, httpError } = require('../utils');
const { getSettings, resetSettingsCache } = require('../services/settings');
const { recordActivity } = require('../services/activity');
const pricing = require('../../lib/revbot/pricing');
const revbot = require('../services/ai-quote');
const config = require('../config');
const catalog = require('../../Public/assets/ai-services');
const { validateAiQuote } = require('../../lib/ai-quote-input');

const router = express.Router();
router.use('/revbot', requireAdmin);

router.get('/revbot', asyncRoute(async (req, res) => {
    const s = await getSettings();
    const [memory, counts] = await Promise.all([
        RevBotMemory.find(req.query.all === '1' ? {} : { active: true }).sort({ updatedAt: -1 }).limit(300).lean(),
        RevBotMemory.aggregate([{ $group: { _id: '$kind', n: { $sum: 1 } } }])
    ]);
    res.json({
        params: pricing.mergeParams(s.revbot),
        defaults: pricing.DEFAULT_PARAMS,
        memory,
        counts: Object.fromEntries(counts.map(c => [c._id, c.n])),
        ai: { enabled: Boolean(config.ai.apiKey), model: config.ai.model, dailyLimit: config.ai.dailyLimit },
        services: catalog.SERVICES.map(x => ({ id: x.id, name: x.name }))
    });
}));

router.put('/revbot/params', asyncRoute(async (req, res) => {
    const merged = pricing.mergeParams(req.body?.reset ? null : req.body?.params);
    await Settings.findOneAndUpdate({ key: 'main' }, { $set: { revbot: req.body?.reset ? null : merged } }, { upsert: true });
    resetSettingsCache();
    await recordActivity('revbot_params', req.body?.reset ? 'Przywrócono domyślne parametry RevBota' : 'Zmieniono parametry wyceny RevBota', 'Settings', null, req.user.name);
    res.json({ success: true, params: merged });
}));

function memoryPayload(b) {
    const out = {};
    if (b.text !== undefined) out.text = String(b.text).trim().slice(0, 1500);
    if (b.kind !== undefined) out.kind = REVBOT_MEMORY_KINDS.includes(b.kind) ? b.kind : 'rule';
    if (b.service !== undefined) out.service = catalog.BY_ID[b.service] ? b.service : '';
    if (b.weight !== undefined) out.weight = Math.min(10, Math.max(0, Number(b.weight) || 1));
    if (b.active !== undefined) out.active = Boolean(b.active);
    if (b.expiresAt !== undefined) out.expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
    return out;
}

router.post('/revbot/memory', asyncRoute(async (req, res) => {
    const data = memoryPayload({ kind: 'rule', weight: 5, ...req.body });
    if (!data.text || data.text.length < 5) throw httpError(400, 'Wpisz treść reguły (min. 5 znaków).');
    const memory = await RevBotMemory.create({ ...data, createdBy: req.user.name });
    res.status(201).json({ success: true, memory });
}));

router.put('/revbot/memory/:id', validateId, asyncRoute(async (req, res) => {
    const memory = await RevBotMemory.findByIdAndUpdate(req.params.id, memoryPayload(req.body || {}), { new: true, runValidators: true });
    if (!memory) throw httpError(404, 'Nie znaleziono wpisu');
    res.json({ success: true, memory });
}));

router.delete('/revbot/memory/:id', validateId, asyncRoute(async (req, res) => {
    const memory = await RevBotMemory.findByIdAndDelete(req.params.id);
    if (!memory) throw httpError(404, 'Nie znaleziono wpisu');
    res.json({ success: true });
}));

router.post('/revbot/research', asyncRoute(async (req, res) => {
    const topic = String(req.body?.topic || '').trim().slice(0, 300);
    const saved = await revbot.researchMarket(topic ? { topics: [topic], actor: req.user.name } : { actor: req.user.name });
    await recordActivity('revbot_research', `RevBot: zapisano ${saved.length} wpisów wiedzy rynkowej`, 'Settings', null, req.user.name);
    res.json({ success: true, saved });
}));

router.post('/revbot/ask', asyncRoute(async (req, res) => {
    const question = String(req.body?.question || '').trim();
    if (question.length < 3) throw httpError(400, 'Zadaj pytanie');
    res.json({ success: true, ...(await revbot.ask(question)) });
}));

/** Symulacja wyceny (bez zdjęć i bez zapisu) — do sprawdzania parametrów. */
router.post('/revbot/simulate', asyncRoute(async (req, res) => {
    const b = req.body || {};
    const q = validateAiQuote({
        requestId: 'symulacja-' + Date.now().toString(36) + '-panel',
        consent: true,
        services: Array.isArray(b.services) ? b.services : [{ id: b.service || 'move', answers: b.answers || {} }],
        location: { address: b.address || 'Słupsk', destination: b.destination || '', km: b.km || 0 },
        description: b.description || '',
        photos: [],
        schedule: { date: b.date || '', time: 3, urgency: b.urgent ? 1 : 0 },
        contact: { client: 0, name: 'Symulacja', phone: '600000000' },
        quoteType: 'free'
    });
    const estimate = b.useAi ? await revbot.estimateQuote(q, [], { skipGeo: !b.geo }) : revbot.baselineEstimate(q, 0, await revbot.quoteContext(q, { skipGeo: !b.geo }), await revbot.getParams());
    res.json({ success: true, estimate });
}));

module.exports = router;
