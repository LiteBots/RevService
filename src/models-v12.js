'use strict';

/**
 * RevSerwis 12.0 — kody SMS do panelu klienta po numerze telefonu.
 * Jeden dokument na numer (klucz z lib/phone-access.js). Kod przechowujemy tylko jako hash.
 * Dokument znika sam dobę po ostatniej aktywności (TTL).
 */
const mongoose = require('mongoose');

const { Schema } = mongoose;
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

const PhoneCodeSchema = new Schema(
    {
        key: { type: String, required: true, unique: true, maxlength: 15 },
        codeHash: { type: String, default: '' },
        expiresAt: { type: Date, default: null },
        attempts: { type: Number, default: 0 },
        failedNumbers: { type: Number, default: 0 },
        sends: { type: Number, default: 0 },
        lastSentAt: { type: Date, default: null },
        lockedUntil: { type: Date, default: null },
        touchedAt: { type: Date, default: Date.now }
    },
    { versionKey: false }
);
PhoneCodeSchema.index({ touchedAt: 1 }, { expireAfterSeconds: 24 * 3600 });

module.exports = { PhoneCode: model('PhoneCode', PhoneCodeSchema) };
