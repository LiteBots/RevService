'use strict';

const { Counter } = require('../models');

/**
 * Kolejne numery dokumentów, np. OF/2026/10/007 (oferty), AB/2026/012 (abonamenty), MG/2026/003 (magazyn).
 * Atomowy licznik w MongoDB — bezpieczny przy wielu instancjach.
 */
async function nextNumber(prefix, { monthly = false, date = new Date() } = {}) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const period = monthly ? `${y}/${m}` : `${y}`;
    const counter = await Counter.findOneAndUpdate(
        { key: `${prefix}:${period}` },
        { $inc: { seq: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return `${prefix}/${period}/${String(counter.seq).padStart(3, '0')}`;
}

module.exports = { nextNumber };
