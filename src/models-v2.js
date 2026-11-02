'use strict';

/**
 * RevMi 2.0.0 — nowe kolekcje. Tworzą się same przy pierwszym zapisie (bez migracji).
 * Istniejące schematy (Employee, Client, Task) dostają tylko nowe pola z wartościami domyślnymi — patrz src/models.js.
 */
const { mongoose } = require('./models');

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;
const str = (max, extra = {}) => ({ type: String, trim: true, maxlength: max, default: '', ...extra });
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

/* ------------------------------------------------------------------ */
/* Ustawienia 2.0 (jeden dokument „main”)                               */
/* ------------------------------------------------------------------ */

const DEFAULT_V2 = {
    pricesAreGross: true,
    vatRate: 8,
    monthlyGoal: 0,
    weeklyGoal: 0,
    weekStartsMonday: true,
    lockMinutes: 15,
    newDeviceAlerts: true,
    gpsEnabled: true,
    geofenceMeters: 150,
    smsReminderEnabled: false,
    smsReminderHour: 18,
    smsReminderTemplate: 'Dzień dobry! Przypominamy: {data} o {godzina} {usluga}, {adres}. Potwierdź termin: {link} Pozdrawiamy, RevSerwis',
    smsOnTheWayEnabled: false,
    smsOnTheWayTemplate: 'Ekipa RevSerwis jedzie do Państwa! Będziemy ok. {godzina}. Śledź na mapie: {link}',
    reportWeekly: true,
    reportMonthly: true,
    reportRecipients: [],
    rankingPoints: { rating5: 20, rating4: 8, onTime: 10, fullReport: 5, complaint: -30, fault: 0 },
    rankingBonus: '',
    modules: { outlet: true, powrot: true, newsletter: true, rekrutacja: true, sortownia: true, dodatki: true, deweloperzy: true, hotele: true, partnerzy: true, abonamenty: true }
};

const BudgetSchema = new Schema(
    {
        branch: { type: ObjectId, ref: 'Branch', default: null },
        category: { type: String, required: true, trim: true, maxlength: 60 },
        amount: { type: Number, min: 0, required: true }
    },
    { _id: true }
);

const V2ConfigSchema = new Schema(
    {
        key: { type: String, unique: true, default: 'main' },
        pricesAreGross: { type: Boolean, default: DEFAULT_V2.pricesAreGross },
        vatRate: { type: Number, min: 0, max: 30, default: DEFAULT_V2.vatRate },
        monthlyGoal: { type: Number, min: 0, default: DEFAULT_V2.monthlyGoal },
        weeklyGoal: { type: Number, min: 0, default: DEFAULT_V2.weeklyGoal },
        branchGoals: { type: Map, of: Number, default: {} },
        budgets: { type: [BudgetSchema], default: [] },
        lockMinutes: { type: Number, min: 0, max: 240, default: DEFAULT_V2.lockMinutes },
        newDeviceAlerts: { type: Boolean, default: DEFAULT_V2.newDeviceAlerts },
        gpsEnabled: { type: Boolean, default: DEFAULT_V2.gpsEnabled },
        geofenceMeters: { type: Number, min: 50, max: 1000, default: DEFAULT_V2.geofenceMeters },
        smsReminderEnabled: { type: Boolean, default: DEFAULT_V2.smsReminderEnabled },
        smsReminderHour: { type: Number, min: 8, max: 21, default: DEFAULT_V2.smsReminderHour },
        smsReminderTemplate: str(480, { default: DEFAULT_V2.smsReminderTemplate }),
        smsOnTheWayEnabled: { type: Boolean, default: DEFAULT_V2.smsOnTheWayEnabled },
        smsOnTheWayTemplate: str(480, { default: DEFAULT_V2.smsOnTheWayTemplate }),
        reportWeekly: { type: Boolean, default: DEFAULT_V2.reportWeekly },
        reportMonthly: { type: Boolean, default: DEFAULT_V2.reportMonthly },
        reportRecipients: { type: [{ type: String, trim: true, lowercase: true, maxlength: 160 }], default: [] },
        rankingPoints: { type: Schema.Types.Mixed, default: () => ({ ...DEFAULT_V2.rankingPoints }) },
        rankingBonus: str(200),
        modules: { type: Schema.Types.Mixed, default: () => ({ ...DEFAULT_V2.modules }) },
        // znaczniki zadań cyklicznych (żeby nie wysyłać dwa razy przy kilku instancjach)
        jobs: { type: Schema.Types.Mixed, default: () => ({}) }
    },
    { timestamps: true, minimize: false }
);

/* ------------------------------------------------------------------ */
/* Sesje logowania (lista urządzeń, zdalne wylogowanie)                */
/* ------------------------------------------------------------------ */

const LoginSessionSchema = new Schema(
    {
        sid: { type: String, required: true, unique: true },
        userKey: { type: String, required: true, index: true },
        name: str(140),
        role: str(20),
        device: str(160),
        deviceHash: { type: String, index: true },
        userAgent: str(400),
        ip: str(60),
        method: { type: String, enum: ['password', 'pin', '2fa'], default: 'pin' },
        lastSeenAt: { type: Date, default: Date.now },
        revokedAt: { type: Date, default: null },
        revokedBy: str(140)
    },
    { timestamps: true }
);
LoginSessionSchema.index({ userKey: 1, revokedAt: 1, lastSeenAt: -1 });

/* ------------------------------------------------------------------ */
/* Magazyn sprzętu i materiałów                                         */
/* ------------------------------------------------------------------ */

const EquipmentSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 120 },
        kind: { type: String, enum: ['equipment', 'material'], default: 'equipment', index: true },
        category: str(60),
        unit: str(12, { default: 'szt.' }),
        qty: { type: Number, default: 0 },
        total: { type: Number, min: 0, default: null },
        minQty: { type: Number, min: 0, default: 0 },
        location: str(120),
        branch: { type: ObjectId, ref: 'Branch', default: null },
        status: { type: String, enum: ['ok', 'service', 'lost'], default: 'ok' },
        holders: { type: [{ employee: { type: ObjectId, ref: 'Employee' }, name: str(140), qty: Number, task: { type: ObjectId, default: null }, since: Date, _id: false }], default: [] },
        notes: str(1000),
        lowAlertAt: { type: Date, default: null },
        active: { type: Boolean, default: true, index: true }
    },
    { timestamps: true }
);

const EquipmentMoveSchema = new Schema(
    {
        item: { type: ObjectId, ref: 'Equipment', required: true, index: true },
        itemName: str(120),
        type: { type: String, enum: ['in', 'out', 'issue', 'return', 'adjust'], required: true },
        qty: { type: Number, required: true },
        employee: { type: ObjectId, ref: 'Employee', default: null },
        employeeName: str(140),
        task: { type: ObjectId, ref: 'Task', default: null },
        note: str(300),
        by: str(140)
    },
    { timestamps: true }
);
EquipmentMoveSchema.index({ createdAt: -1 });

/* ------------------------------------------------------------------ */
/* CRM — historia kontaktu                                              */
/* ------------------------------------------------------------------ */

const CrmEventSchema = new Schema(
    {
        client: { type: ObjectId, ref: 'Client', required: true, index: true },
        type: { type: String, enum: ['note', 'call', 'email', 'sms', 'meeting', 'offer', 'stage', 'task', 'payment'], default: 'note' },
        text: { type: String, trim: true, maxlength: 2000, required: true },
        at: { type: Date, default: Date.now },
        by: str(140)
    },
    { timestamps: true }
);
CrmEventSchema.index({ client: 1, at: -1 });

/* ------------------------------------------------------------------ */
/* Pakiety dla firm                                                     */
/* ------------------------------------------------------------------ */

const PackagePlanSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        tagline: str(160),
        priceNet: { type: Number, min: 0, required: true },
        vatRate: { type: Number, min: 0, max: 30, default: 23 },
        period: { type: String, enum: ['month', 'quarter', 'year'], default: 'month' },
        serviceLimit: { type: Number, min: 0, default: null }, // null = bez limitu
        responseHours: { type: Number, min: 0, default: 48 },
        features: { type: [{ type: String, trim: true, maxlength: 140 }], default: [] },
        services: { type: [{ type: String, trim: true, maxlength: 80 }], default: [] },
        extraServicePrice: { type: Number, min: 0, default: null },
        highlight: { type: Boolean, default: false },
        color: str(20, { default: '#03F0BA' }),
        active: { type: Boolean, default: true },
        order: { type: Number, default: 0 }
    },
    { timestamps: true }
);

const PackageInvoiceSchema = new Schema(
    {
        periodStart: Date,
        periodEnd: Date,
        amountNet: Number,
        amountGross: Number,
        extraServices: { type: Number, default: 0 },
        status: { type: String, enum: ['due', 'paid', 'void'], default: 'due' },
        paidAt: { type: Date, default: null },
        income: { type: ObjectId, default: null },
        number: str(40)
    },
    { _id: true }
);

const PackageSubSchema = new Schema(
    {
        number: str(30, { index: true }),
        client: { type: ObjectId, ref: 'Client', required: true, index: true },
        clientName: str(180),
        account: { type: ObjectId, ref: 'Account', default: null },
        plan: { type: ObjectId, ref: 'PackagePlan', required: true },
        planName: str(80),
        priceNet: { type: Number, min: 0, required: true },
        vatRate: { type: Number, min: 0, max: 30, default: 23 },
        serviceLimit: { type: Number, min: 0, default: null },
        period: { type: String, enum: ['month', 'quarter', 'year'], default: 'month' },
        status: { type: String, enum: ['active', 'paused', 'cancelled'], default: 'active', index: true },
        startDate: { type: Date, required: true },
        periodStart: { type: Date, required: true },
        renewDate: { type: Date, required: true, index: true },
        autoRenew: { type: Boolean, default: true },
        branch: { type: ObjectId, ref: 'Branch', default: null },
        contactName: str(140),
        contactPhone: str(40),
        contactEmail: str(160, { lowercase: true }),
        address: str(300),
        notes: str(2000),
        invoices: { type: [PackageInvoiceSchema], default: [] },
        renewAlertFor: { type: Date, default: null },
        cancelledAt: { type: Date, default: null },
        createdBy: str(140)
    },
    { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* Czas pracy (GPS), dyspozycyjność, wymiana zmian                      */
/* ------------------------------------------------------------------ */

const TimeEventSchema = new Schema(
    {
        type: { type: String, enum: ['start', 'pause', 'resume', 'stop', 'arrive', 'leave'], required: true },
        at: { type: Date, default: Date.now },
        lat: { type: Number, default: null },
        lon: { type: Number, default: null },
        accuracy: { type: Number, default: null },
        task: { type: ObjectId, ref: 'Task', default: null },
        taskName: str(160),
        auto: { type: Boolean, default: false },
        note: str(200)
    },
    { _id: false }
);

const TimeEntrySchema = new Schema(
    {
        employee: { type: ObjectId, ref: 'Employee', required: true },
        employeeName: str(140),
        branch: { type: ObjectId, ref: 'Branch', default: null },
        day: { type: String, required: true }, // YYYY-MM-DD (czas firmy)
        events: { type: [TimeEventSchema], default: [] },
        minutes: { type: Number, default: 0 },
        breakMinutes: { type: Number, default: 0 },
        open: { type: Boolean, default: false },
        approved: { type: Boolean, default: false },
        correctedBy: str(140)
    },
    { timestamps: true }
);
TimeEntrySchema.index({ employee: 1, day: 1 }, { unique: true });
TimeEntrySchema.index({ day: 1 });

const AvailabilitySchema = new Schema(
    {
        employee: { type: ObjectId, ref: 'Employee', required: true },
        day: { type: String, required: true },
        status: { type: String, enum: ['available', 'partial', 'unavailable'], default: 'available' },
        note: str(160)
    },
    { timestamps: true }
);
AvailabilitySchema.index({ employee: 1, day: 1 }, { unique: true });

const SwapRequestSchema = new Schema(
    {
        task: { type: ObjectId, ref: 'Task', required: true, index: true },
        taskName: str(160),
        taskDate: Date,
        from: { type: ObjectId, ref: 'Employee', required: true },
        fromName: str(140),
        to: { type: ObjectId, ref: 'Employee', default: null },
        toName: str(140),
        reason: str(400),
        peerStatus: { type: String, enum: ['pending', 'accepted', 'declined', 'none'], default: 'pending' },
        status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending', index: true },
        decidedBy: str(140),
        decidedAt: { type: Date, default: null }
    },
    { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* Czat zespołowy                                                       */
/* ------------------------------------------------------------------ */

const ChatChannelSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 60 },
        kind: { type: String, enum: ['team', 'branch', 'task', 'office'], default: 'team' },
        branch: { type: ObjectId, ref: 'Branch', default: null },
        task: { type: ObjectId, ref: 'Task', default: null },
        pinnedText: str(300),
        archived: { type: Boolean, default: false },
        lastMessageAt: { type: Date, default: null },
        lastMessage: str(160)
    },
    { timestamps: true }
);

const ChatMessageSchema = new Schema(
    {
        channel: { type: ObjectId, ref: 'ChatChannel', required: true },
        authorKey: { type: String, required: true },
        authorName: str(140),
        text: str(2000),
        photo: { data: { type: Buffer, select: false }, storageKey: str(300), contentType: str(40) },
        hasPhoto: { type: Boolean, default: false },
        mentions: { type: [String], default: [] },
        task: { type: ObjectId, ref: 'Task', default: null },
        deletedAt: { type: Date, default: null }
    },
    { timestamps: true }
);
ChatMessageSchema.index({ channel: 1, createdAt: -1 });

const ChatReadSchema = new Schema(
    {
        channel: { type: ObjectId, ref: 'ChatChannel', required: true },
        userKey: { type: String, required: true },
        lastReadAt: { type: Date, default: Date.now }
    },
    { timestamps: false }
);
ChatReadSchema.index({ channel: 1, userKey: 1 }, { unique: true });

/* ------------------------------------------------------------------ */
/* Zgłoszenia usterek                                                   */
/* ------------------------------------------------------------------ */

const FaultReportSchema = new Schema(
    {
        number: str(30),
        kind: { type: String, enum: ['vehicle', 'equipment', 'other'], default: 'vehicle' },
        vehicle: { type: ObjectId, ref: 'Fleet', default: null },
        equipment: { type: ObjectId, ref: 'Equipment', default: null },
        subject: str(160),
        description: { type: String, trim: true, maxlength: 2000, required: true },
        priority: { type: String, enum: ['low', 'high', 'critical'], default: 'low' },
        mileage: { type: Number, min: 0, default: null },
        photos: { type: [{ data: { type: Buffer, select: false }, storageKey: str(300), contentType: str(40), _id: false }], default: [], select: false },
        photoCount: { type: Number, default: 0 },
        status: { type: String, enum: ['open', 'progress', 'resolved'], default: 'open', index: true },
        reportedBy: str(140),
        reportedByKey: str(40),
        resolution: str(1000),
        cost: { type: Number, min: 0, default: null },
        resolvedAt: { type: Date, default: null },
        resolvedBy: str(140)
    },
    { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* Potwierdzenie terminu z SMS                                          */
/* ------------------------------------------------------------------ */

const SmsConfirmSchema = new Schema(
    {
        token: { type: String, required: true, unique: true },
        task: { type: ObjectId, ref: 'Task', required: true, index: true },
        kind: { type: String, enum: ['reminder', 'ontheway'], default: 'reminder' },
        phone: str(40),
        status: { type: String, enum: ['sent', 'manual', 'failed', 'confirmed', 'reschedule'], default: 'sent' },
        error: str(300),
        confirmedAt: { type: Date, default: null },
        clientNote: str(500)
    },
    { timestamps: true }
);
SmsConfirmSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 });

/* ------------------------------------------------------------------ */
/* 2.1: klucze dostępu (Face ID / Touch ID / Windows Hello)            */
/* ------------------------------------------------------------------ */

const PasskeySchema = new Schema(
    {
        userKey: { type: String, required: true, index: true },     // 'admin' (główny PIN) albo id pracownika
        credentialId: { type: String, required: true, unique: true }, // base64url
        publicKey: { type: Buffer, required: true },
        counter: { type: Number, default: 0 },
        transports: { type: [String], default: [] },
        deviceType: str(20),
        backedUp: { type: Boolean, default: false },
        label: str(120),
        lastUsedAt: { type: Date, default: null }
    },
    { timestamps: true }
);

module.exports = {
    DEFAULT_V2,
    Passkey: model('Passkey', PasskeySchema),
    V2Config: model('V2Config', V2ConfigSchema),
    LoginSession: model('LoginSession', LoginSessionSchema),
    Equipment: model('Equipment', EquipmentSchema),
    EquipmentMove: model('EquipmentMove', EquipmentMoveSchema),
    CrmEvent: model('CrmEvent', CrmEventSchema),
    PackagePlan: model('PackagePlan', PackagePlanSchema),
    PackageSub: model('PackageSub', PackageSubSchema),
    TimeEntry: model('TimeEntry', TimeEntrySchema),
    Availability: model('Availability', AvailabilitySchema),
    SwapRequest: model('SwapRequest', SwapRequestSchema),
    ChatChannel: model('ChatChannel', ChatChannelSchema),
    ChatMessage: model('ChatMessage', ChatMessageSchema),
    ChatRead: model('ChatRead', ChatReadSchema),
    FaultReport: model('FaultReport', FaultReportSchema),
    SmsConfirm: model('SmsConfirm', SmsConfirmSchema)
};
