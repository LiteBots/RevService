'use strict';

/**
 * RevSerwis 9.2 — nowe kolekcje: dziennik zmian (audyt), urlopy, tankowania, naprawy floty,
 * reguły automatyzacji „jeśli → to”, klucze idempotencji (tryb offline) i paragony z OCR.
 */
const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;
const str = (max, extra = {}) => ({ type: String, trim: true, maxlength: max, default: '', ...extra });
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

/** Kto, co i kiedy zmienił w panelu. Wpisy starsze niż 365 dni usuwa MongoDB (TTL). */
const AuditLogSchema = new Schema(
    {
        at: { type: Date, default: Date.now },
        actor: str(140),
        actorKey: str(60),
        role: str(20),
        method: str(10),
        path: str(300),
        status: { type: Number, default: 0 },
        entity: str(40),
        entityId: str(40),
        summary: str(500),
        ip: str(64),
        ua: str(200)
    },
    { versionKey: false }
);
AuditLogSchema.index({ at: -1 });
AuditLogSchema.index({ at: 1 }, { expireAfterSeconds: 365 * 86_400 });
AuditLogSchema.index({ actorKey: 1, at: -1 });

const LEAVE_KINDS = ['vacation', 'sick', 'unavailable', 'other'];
const LEAVE_LABELS = { vacation: 'Urlop', sick: 'Chorobowe', unavailable: 'Niedostępny', other: 'Inne' };
const LeaveSchema = new Schema(
    {
        employee: { type: ObjectId, ref: 'Employee', required: true, index: true },
        employeeName: str(140),
        branch: { type: ObjectId, ref: 'Branch', default: null },
        kind: { type: String, enum: LEAVE_KINDS, default: 'vacation' },
        from: { type: Date, required: true },
        to: { type: Date, required: true },
        note: str(500),
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
        decidedBy: str(140),
        decidedAt: { type: Date, default: null },
        createdBy: str(140)
    },
    { timestamps: true }
);
LeaveSchema.index({ from: 1, to: 1 });

const FuelLogSchema = new Schema(
    {
        vehicle: { type: ObjectId, ref: 'Fleet', required: true, index: true },
        date: { type: Date, default: Date.now },
        liters: { type: Number, min: 0, default: 0 },
        price: { type: Number, min: 0, default: 0 },
        mileage: { type: Number, min: 0, default: null },
        full: { type: Boolean, default: true },
        station: str(140),
        by: str(140),
        expense: { type: ObjectId, ref: 'Expense', default: null }
    },
    { timestamps: true }
);
FuelLogSchema.index({ vehicle: 1, date: -1 });

const REPAIR_KINDS = ['service', 'repair', 'tyres', 'inspection', 'insurance', 'other'];
const RepairSchema = new Schema(
    {
        vehicle: { type: ObjectId, ref: 'Fleet', required: true, index: true },
        date: { type: Date, default: Date.now },
        kind: { type: String, enum: REPAIR_KINDS, default: 'repair' },
        description: str(1000),
        workshop: str(140),
        price: { type: Number, min: 0, default: 0 },
        mileage: { type: Number, min: 0, default: null },
        by: str(140),
        expense: { type: ObjectId, ref: 'Expense', default: null }
    },
    { timestamps: true }
);
RepairSchema.index({ vehicle: 1, date: -1 });

/**
 * Reguła „jeśli → to”. Wyzwalacze są sprawdzane co 15 minut; każda reguła działa raz na zlecenie
 * (lista firedFor), więc nic nie wyśle się dwa razy.
 */
const RULE_TRIGGERS = ['quote_stale', 'task_completed', 'unpaid_after', 'task_tomorrow', 'new_request_unanswered'];
const RULE_ACTIONS = ['notify_admins', 'sms_client', 'email_client', 'add_note', 'set_priority_high'];
const RuleSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 140 },
        enabled: { type: Boolean, default: true },
        trigger: { type: String, enum: RULE_TRIGGERS, required: true },
        hours: { type: Number, min: 0, max: 24 * 90, default: 48 },
        division: str(40),
        action: { type: String, enum: RULE_ACTIONS, required: true },
        message: str(600),
        firedFor: { type: [{ type: ObjectId }], default: [], select: false },
        runCount: { type: Number, default: 0 },
        lastRunAt: { type: Date, default: null },
        createdBy: str(140)
    },
    { timestamps: true }
);

/** Tryb offline: ten sam klucz z telefonu nie wykona akcji dwa razy (np. po ponowieniu kolejki). */
const IdempotencySchema = new Schema(
    {
        key: { type: String, required: true, unique: true },
        userKey: str(60),
        status: { type: Number, default: 200 },
        body: { type: Schema.Types.Mixed, default: null },
        createdAt: { type: Date, default: Date.now, expires: 7 * 86_400 }
    },
    { versionKey: false }
);

module.exports = {
    LEAVE_KINDS, LEAVE_LABELS, REPAIR_KINDS, RULE_TRIGGERS, RULE_ACTIONS,
    AuditLog: model('AuditLog', AuditLogSchema),
    Leave: model('Leave', LeaveSchema),
    FuelLog: model('FuelLog', FuelLogSchema),
    Repair: model('Repair', RepairSchema),
    Rule: model('Rule', RuleSchema),
    Idempotency: model('Idempotency', IdempotencySchema)
};
