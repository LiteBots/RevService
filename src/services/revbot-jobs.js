'use strict';

/**
 * 8.0: zadania RevBota w tle.
 * - co 30 min: nauka z zakończonych zleceń, z których jeszcze nie wyciągnięto wniosków,
 * - raz w tygodniu (gdy jest klucz Claude API i REVBOT_RESEARCH nie jest „false”): aktualizacja wiedzy rynkowej z internetu.
 * Bezpieczne przy kilku instancjach — blokada przez licznik w MongoDB.
 */
const config = require('../config');
const { Task, Counter, RevBotMemory } = require('../models');
const revbot = require('./ai-quote');

async function lock(key, ttlMs) {
    const now = Date.now();
    try {
        const doc = await Counter.findOneAndUpdate(
            { key, seq: { $lt: now - ttlMs } },
            { $set: { seq: now } },
            { new: true }
        ).lean();
        if (doc) return true;
        await Counter.create({ key, seq: now });
        return true;
    } catch {
        return false;
    }
}

async function learnPending() {
    const tasks = await Task.find({ status: 'completed', learnedAt: null, 'aiEstimate.high': { $gt: 0 } }).select('_id').limit(10).lean();
    for (const t of tasks) await revbot.learnFromTask(t._id);
}

async function weeklyResearch() {
    if (!config.ai.apiKey || String(process.env.REVBOT_RESEARCH || 'true').toLowerCase() === 'false') return;
    const fresh = await RevBotMemory.exists({ kind: 'market', createdAt: { $gt: new Date(Date.now() - 7 * 86_400_000) } });
    if (fresh) return;
    if (!await lock('revbot-research', 6 * 86_400_000)) return;
    await revbot.researchMarket({ actor: 'RevBot (automatycznie)' });
}

function startRevBotJobs() {
    const tick = async () => {
        try { if (await lock('revbot-learn', 25 * 60_000)) await learnPending(); } catch (e) { console.error('[RevBot] nauka:', e.message); }
        try { await weeklyResearch(); } catch (e) { console.error('[RevBot] wiedza rynkowa:', e.message); }
    };
    setTimeout(tick, 90_000).unref?.();
    setInterval(tick, 30 * 60_000).unref?.();
}

module.exports = { startRevBotJobs, learnPending, weeklyResearch };
