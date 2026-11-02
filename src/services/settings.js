'use strict';

const { Settings, DEFAULT_SETTINGS } = require('../models');

let cache = null;
let cacheAt = 0;
const TTL = 30_000;

async function getSettings({ fresh = false } = {}) {
    if (!fresh && cache && Date.now() - cacheAt < TTL) return cache;
    const doc = await Settings.findOneAndUpdate(
        { key: 'main' },
        { $setOnInsert: { key: 'main' } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    cache = { ...DEFAULT_SETTINGS, ...doc };
    delete cache.vapidPublicKey;
    delete cache.vapidPrivateKey;
    delete cache.ownerTotpSecret;
    delete cache.ownerTotpPending;
    cacheAt = Date.now();
    return cache;
}

const EDITABLE = [
    'notifyNewQuote', 'notifyNewTask', 'notifyAssignment', 'notifyStatusToAdmins',
    'reminderFirstEnabled', 'reminderFirstHours', 'reminderSecondEnabled', 'reminderSecondHours',
    'remindersCopyToAdmins', 'reminderStatuses', 'companyName', 'companyPhone', 'companyEmail', 'defaultChecklist',
    'companyNip', 'companyAddress', 'companyBank', 'offerTerms', 'notifyNewMessage', 'notifyBusinessReminders', 'contactAutoReply',
    'taxRate', 'taxUpperRate', 'taxThreshold', 'taxFreeAmount', 'googleReviewUrl', 'reviewSmsTemplate',
    'requireCompletionPhotos', 'requireCostReport', 'requireBeforeChecklist',
    // 9.2
    'googlePlaceId', 'reviewsManualRating', 'reviewsManualCount', 'morningSummaryEnabled', 'morningSummaryHour',
    'receivablesAutoRemind', 'receivablesFirstDays', 'receivablesEveryDays', 'receivablesMaxReminders', 'fuelPrice',
    'require2faForAdmins', 'liveLocationEnabled'
];

async function updateSettings(input) {
    const update = {};
    for (const key of EDITABLE) if (input[key] !== undefined) update[key] = input[key];
    if (update.reminderStatuses) {
        update.reminderStatuses = [].concat(update.reminderStatuses).filter(s => ['quoted', 'planned', 'progress'].includes(s));
    }
    if (update.defaultChecklist) {
        update.defaultChecklist = [].concat(update.defaultChecklist).map(String).map(s => s.trim()).filter(Boolean).slice(0, 30);
    }
    for (const k of ['taxRate', 'taxUpperRate', 'taxThreshold', 'taxFreeAmount']) if (update[k] !== undefined) update[k] = Math.max(0, Number(update[k]) || 0);
    for (const k of ['reviewsManualRating', 'reviewsManualCount']) {
        if (update[k] === undefined) continue;
        update[k] = update[k] === '' || update[k] === null ? null : Number(String(update[k]).replace(',', '.'));
        if (update[k] !== null && !Number.isFinite(update[k])) update[k] = null;
    }
    if (update.googlePlaceId !== undefined) update.googlePlaceId = String(update.googlePlaceId || '').trim().slice(0, 200);
    if (update.require2faForAdmins === true) {
        const { Settings: S2 } = require('../models');
        const doc = await S2.findOne({ key: 'main' }).select('ownerTotpEnabled').lean();
        if (!doc?.ownerTotpEnabled) {
            const error = new Error('Najpierw włącz weryfikację dwuetapową dla swojego konta (Bezpieczeństwo → Włącz 2FA), inaczej zablokujesz sobie dostęp.');
            error.status = 400;
            throw error;
        }
    }
    if (update.googleReviewUrl && !/^https:\/\//.test(update.googleReviewUrl)) {
        const error = new Error('Link do opinii musi zaczynać się od https://');
        error.status = 400;
        throw error;
    }
    const first = Number(update.reminderFirstHours ?? cache?.reminderFirstHours ?? 72);
    const second = Number(update.reminderSecondHours ?? cache?.reminderSecondHours ?? 24);
    if (first <= second) {
        const error = new Error('Pierwsze przypomnienie musi być wcześniej niż drugie.');
        error.status = 400;
        throw error;
    }
    await Settings.findOneAndUpdate({ key: 'main' }, { $set: update }, { upsert: true, runValidators: true });
    return getSettings({ fresh: true });
}

function resetSettingsCache() {
    cache = null;
}

module.exports = { getSettings, updateSettings, resetSettingsCache };
