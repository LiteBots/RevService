'use strict';

const config = require('./config');

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

const isObjectId = value => value != null && /^[a-f0-9]{24}$/i.test(String(value));

/** Klucz użytkownika używany przez powiadomienia: id pracownika albo "admin" dla głównego PIN-u. */
const userKeyOf = user => (user?.employeeId ? String(user.employeeId) : 'admin');

function pick(source, keys) {
    const out = {};
    for (const key of keys) if (source && source[key] !== undefined) out[key] = source[key];
    return out;
}

const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const startOfMonth = value => new Date(value.getFullYear(), value.getMonth(), 1);
const startOfNextMonth = value => new Date(value.getFullYear(), value.getMonth() + 1, 1);

function dateParts(date, timeZone = config.timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date);
    const get = type => parts.find(p => p.type === type)?.value;
    return { ymd: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

function formatWhen(date, timeZone = config.timeZone) {
    return new Intl.DateTimeFormat('pl-PL', {
        timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    }).format(date);
}

/** Opis w stylu „jutro o 08:00”, „za 3 dni (pt, 3 paź, 08:00)”. */
function relativeWhen(date, now = new Date(), timeZone = config.timeZone) {
    const target = dateParts(date, timeZone);
    const today = dateParts(now, timeZone);
    const dayDiff = Math.round((Date.parse(target.ymd + 'T00:00:00Z') - Date.parse(today.ymd + 'T00:00:00Z')) / 86_400_000);
    if (dayDiff === 0) return `dziś o ${target.time}`;
    if (dayDiff === 1) return `jutro o ${target.time}`;
    if (dayDiff === 2) return `pojutrze o ${target.time}`;
    if (dayDiff > 2) return `za ${dayDiff} dni (${formatWhen(date, timeZone)})`;
    return formatWhen(date, timeZone);
}

const money = value => new Intl.NumberFormat('pl-PL').format(Number(value) || 0) + ' zł';

module.exports = {
    asyncRoute,
    httpError,
    isObjectId,
    userKeyOf,
    pick,
    escapeRegex,
    startOfMonth,
    startOfNextMonth,
    dateParts,
    formatWhen,
    relativeWhen,
    money
};
