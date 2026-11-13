'use strict';

/**
 * RevSerwis 13 — konta klientów logujących się numerem telefonu i hasłem oraz realizacje (zdjęcia przed / po).
 */
const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);
const str = (max, extra = {}) => ({ type: String, trim: true, maxlength: max, default: '', ...extra });

/** Konto klienta: login = numer telefonu (klucz z lib/phone-access.js), hasło bcrypt. */
const PhoneUserSchema = new Schema(
    {
        key: { type: String, required: true, unique: true, maxlength: 15 },
        passwordHash: { type: String, required: true, select: false },
        name: str(140),
        email: str(160, { lowercase: true }),
        failedLogins: { type: Number, default: 0 },
        lockedUntil: { type: Date, default: null },
        lastLoginAt: { type: Date, default: null },
        verifiedBy: { type: String, enum: ['sms', 'order', 'admin'], default: 'order' },
        status: { type: String, enum: ['active', 'blocked'], default: 'active' }
    },
    { timestamps: true }
);

const RealizationPhotoSchema = new Schema(
    {
        kind: { type: String, enum: ['before', 'after'], required: true },
        data: { type: Buffer, select: false },
        contentType: { type: String, default: 'image/jpeg' },
        size: { type: Number, default: 0 }
    },
    { _id: true }
);

/** Realizacja na stronę „Opinie i realizacje” — dodawana w RevMi (ręcznie albo ze zdjęć zakończonego zlecenia). */
const RealizationSchema = new Schema(
    {
        title: { type: String, required: true, trim: true, maxlength: 140 },
        service: str(40),
        city: str(80),
        when: str(40),
        summary: str(600),
        crew: str(80),
        photos: { type: [RealizationPhotoSchema], default: [] },
        task: { type: ObjectId, ref: 'Task', default: null },
        published: { type: Boolean, default: true, index: true },
        featured: { type: Boolean, default: false },
        sort: { type: Number, default: 0 },
        createdBy: str(140)
    },
    { timestamps: true }
);

module.exports = {
    PhoneUser: model('PhoneUser', PhoneUserSchema),
    Realization: model('Realization', RealizationSchema)
};
