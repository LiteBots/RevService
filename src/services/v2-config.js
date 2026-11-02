'use strict';

/** RevMi 2.0.0 — ustawienia nowych modułów (jeden dokument V2Config „main”, cache 30 s). */
const { V2Config, DEFAULT_V2 } = require('../models-v2');
const { BUDGET_CATEGORIES } = require('../../lib/v2');

let cache = { value: null, at: 0 };

async function getV2({ fresh = false } = {}) {
    if (!fresh && cache.value && Date.now() - cache.at < 30_000) return cache.value;
    let doc = await V2Config.findOne({ key: 'main' }).lean();
    if (!doc) {
        try { doc = (await V2Config.create({ key: 'main' })).toObject(); } catch { doc = await V2Config.findOne({ key: 'main' }).lean(); }
    }
    const value = { ...DEFAULT_V2, ...doc, rankingPoints: { ...DEFAULT_V2.rankingPoints, ...(doc?.rankingPoints || {}) }, modules: { ...DEFAULT_V2.modules, ...(doc?.modules || {}) } };
    cache = { value, at: Date.now() };
    return value;
}

const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined; };
const bool = v => (typeof v === 'boolean' ? v : undefined);
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);

/** Zapis tylko znanych pól, z walidacją zakresów. */
async function updateV2(input = {}) {
    const set = {};
    const put = (k, v) => { if (v !== undefined) set[k] = v; };
    put('pricesAreGross', bool(input.pricesAreGross));
    put('vatRate', num(input.vatRate, 0, 30));
    put('monthlyGoal', num(input.monthlyGoal, 0, 100_000_000));
    put('weeklyGoal', num(input.weeklyGoal, 0, 100_000_000));
    put('lockMinutes', num(input.lockMinutes, 0, 240));
    put('newDeviceAlerts', bool(input.newDeviceAlerts));
    put('gpsEnabled', bool(input.gpsEnabled));
    put('geofenceMeters', num(input.geofenceMeters, 50, 1000));
    put('smsReminderEnabled', bool(input.smsReminderEnabled));
    put('smsReminderHour', num(input.smsReminderHour, 8, 21));
    put('smsReminderTemplate', text(input.smsReminderTemplate, 480));
    put('smsOnTheWayEnabled', bool(input.smsOnTheWayEnabled));
    put('smsOnTheWayTemplate', text(input.smsOnTheWayTemplate, 480));
    put('reportWeekly', bool(input.reportWeekly));
    put('reportMonthly', bool(input.reportMonthly));
    put('rankingBonus', text(input.rankingBonus, 200));
    if (Array.isArray(input.reportRecipients)) {
        set.reportRecipients = input.reportRecipients.map(e => String(e).trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)).slice(0, 10);
    }
    if (input.branchGoals && typeof input.branchGoals === 'object') {
        set.branchGoals = Object.fromEntries(Object.entries(input.branchGoals).filter(([k]) => /^[a-f0-9]{24}$/.test(k)).map(([k, v]) => [k, num(v, 0, 100_000_000) || 0]));
    }
    if (input.rankingPoints && typeof input.rankingPoints === 'object') {
        const p = {};
        for (const k of Object.keys(DEFAULT_V2.rankingPoints)) { const v = num(input.rankingPoints[k], -500, 500); if (v !== undefined) p[k] = Math.round(v); }
        set.rankingPoints = { ...DEFAULT_V2.rankingPoints, ...p };
    }
    if (input.modules && typeof input.modules === 'object') {
        set.modules = Object.fromEntries(Object.keys(DEFAULT_V2.modules).map(k => [k, input.modules[k] !== false]));
    }
    if (Array.isArray(input.budgets)) {
        set.budgets = input.budgets.slice(0, 100).map(b => ({
            branch: /^[a-f0-9]{24}$/.test(String(b.branch || '')) ? b.branch : null,
            category: BUDGET_CATEGORIES.includes(b.category) ? b.category : 'Inne',
            amount: num(b.amount, 0, 100_000_000) || 0
        })).filter(b => b.amount > 0);
    }
    await V2Config.updateOne({ key: 'main' }, { $set: set }, { upsert: true });
    cache = { value: null, at: 0 };
    return getV2({ fresh: true });
}

/** Znacznik zadania cyklicznego: zwraca true tylko raz dla danego klucza (bezpieczne przy kilku instancjach). */
async function claimJob(name, key) {
    const r = await V2Config.updateOne({ key: 'main', [`jobs.${name}`]: { $ne: key } }, { $set: { [`jobs.${name}`]: key } });
    if (r.modifiedCount === 1) cache = { value: null, at: 0 };
    return r.modifiedCount === 1;
}

function resetV2Cache() { cache = { value: null, at: 0 }; }

module.exports = { getV2, updateV2, claimJob, resetV2Cache };
