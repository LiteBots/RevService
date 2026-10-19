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
    cacheAt = Date.now();
    return cache;
}

const EDITABLE = [
    'notifyNewQuote', 'notifyNewTask', 'notifyAssignment', 'notifyStatusToAdmins',
    'reminderFirstEnabled', 'reminderFirstHours', 'reminderSecondEnabled', 'reminderSecondHours',
    'remindersCopyToAdmins', 'reminderStatuses', 'companyName', 'companyPhone', 'companyEmail', 'defaultChecklist',
    'companyNip', 'companyAddress', 'companyBank', 'offerTerms', 'notifyNewMessage', 'notifyBusinessReminders', 'contactAutoReply'
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
