'use strict';

const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

mongoose.set('strictQuery', true);

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;
const str = (max, extra = {}) => ({ type: String, trim: true, maxlength: max, default: '', ...extra });

/*
|--------------------------------------------------------------------------
| Zlecenia i wyceny
| Schemat jest zgodny wstecz z danymi zapisanymi przez poprzednią wersję.
|--------------------------------------------------------------------------
*/

const TASK_STATUSES = ['new', 'quoted', 'planned', 'progress', 'completed', 'cancelled'];

const WorkerAssignmentSchema = new Schema(
    {
        employee: { type: ObjectId, ref: 'Employee', default: null },
        name: { type: String, trim: true, maxlength: 100 },
        role: { type: String, trim: true, maxlength: 80, default: 'Pomocnik' }
    },
    { _id: false }
);

const NoteSchema = new Schema(
    {
        text: { type: String, trim: true, maxlength: 2000, required: true },
        author: { type: String, trim: true, maxlength: 140, default: 'System' },
        authorKey: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now }
    },
    { _id: true }
);

const ChecklistItemSchema = new Schema(
    {
        text: { type: String, trim: true, maxlength: 200, required: true },
        done: { type: Boolean, default: false },
        doneBy: { type: String, trim: true, maxlength: 140, default: '' },
        doneAt: { type: Date, default: null }
    },
    { _id: true }
);

const TaskSchema = new Schema(
    {
        quoteRequestId: { type: String, unique: true, sparse: true },
        quoteFingerprint: { type: String, select: false },
        quoteDetails: { type: Map, of: String, default: {} },
        quotePhotoCount: { type: Number, default: 0 },
        quotePhotos: { type: [{ data: Buffer, contentType: String }], default: [], select: false },
        clientPreferredDate: str(200),

        discordPending: { type: Boolean, default: false },
        discordNextAttempt: { type: Date, default: Date.now },

        number: { type: String, trim: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 160 },
        type: str(80, { default: 'Inne' }),
        status: { type: String, enum: TASK_STATUSES, default: 'new', index: true },
        priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },

        price: { type: Number, min: 0, default: 0 },
        priceMax: { type: Number, min: 0, default: null },
        finalPrice: { type: Number, min: 0, default: null },
        paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
        paymentMethod: str(40),

        dateStart: { type: Date, required: true, index: true },
        dateEnd: { type: Date, default: null },
        completedAt: { type: Date, default: null },

        client: { type: ObjectId, ref: 'Client', default: null },
        clientName: str(140),
        clientPhone: str(40),
        clientEmail: str(160, { lowercase: true }),

        address: str(300),
        addressFrom: str(220),
        addressTo: str(220),
        desc: str(4000),

        people: { type: Number, min: 0, max: 30, default: 0 },
        workers: { type: [WorkerAssignmentSchema], default: [] },
        vehicle: { type: ObjectId, ref: 'Fleet', default: null },
        car: str(120),
        source: str(80, { default: 'Ręcznie' }),
        completed: { type: Boolean, default: false, index: true },

        notes: { type: [NoteSchema], default: [] },
        checklist: { type: [ChecklistItemSchema], default: [] },

        reminders: {
            firstSentAt: { type: Date, default: null },
            secondSentAt: { type: Date, default: null }
        },

        createdBy: str(140)
    },
    { timestamps: true }
);

TaskSchema.index({ status: 1, dateStart: 1 });
TaskSchema.index({ 'workers.employee': 1, dateStart: 1 });

TaskSchema.pre('validate', function syncTaskState(next) {
    if (!this.number) {
        this.number = 'RV-' + randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
    }
    if (this.status === 'completed') this.completed = true;
    if (this.completed && this.status !== 'completed') this.status = 'completed';
    if (this.status === 'completed' && !this.completedAt) this.completedAt = new Date();

    if (this.dateEnd && this.dateStart && this.dateEnd < this.dateStart) {
        return next(new Error('Data końcowa nie może być wcześniejsza od początkowej'));
    }
    if (this.priceMax !== null && this.priceMax !== undefined && this.priceMax < this.price) {
        return next(new Error('Kwota maksymalna nie może być mniejsza od minimalnej'));
    }
    next();
});

/*
|--------------------------------------------------------------------------
| CRM, finanse, zespół, flota
|--------------------------------------------------------------------------
*/

const ClientSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 160 },
        company: str(180),
        type: { type: String, enum: ['person', 'company'], default: 'person' },
        phone: str(40, { index: true }),
        email: str(160, { lowercase: true }),
        address: str(300),
        nip: str(20),
        source: str(80, { default: 'Inne' }),
        notes: str(4000),
        tags: [{ type: String, trim: true, maxlength: 40 }],
        archived: { type: Boolean, default: false }
    },
    { timestamps: true }
);

const ExpenseSchema = new Schema({
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true, maxlength: 100 },
    desc: str(1000),
    date: { type: Date, default: Date.now, index: true },
    task: { type: ObjectId, ref: 'Task', default: null },
    vehicle: { type: ObjectId, ref: 'Fleet', default: null },
    receiptNumber: str(100),
    createdAt: { type: Date, default: Date.now }
});

const IncomeSchema = new Schema({
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true, maxlength: 100 },
    desc: str(1000),
    date: { type: Date, default: Date.now, index: true },
    task: { type: ObjectId, ref: 'Task', default: null },
    client: { type: ObjectId, ref: 'Client', default: null },
    paymentMethod: str(40),
    createdAt: { type: Date, default: Date.now }
});

const EmployeeSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 140 },
        role: { type: String, required: true, trim: true, maxlength: 100 },
        systemRole: { type: String, enum: ['admin', 'worker'], default: 'worker' },
        phone: str(40),
        email: str(160, { lowercase: true }),
        status: { type: String, enum: ['available', 'busy', 'off'], default: 'available' },
        hourlyRate: { type: Number, min: 0, default: 0 },
        color: str(20, { default: '#10b981' }),
        pin: { type: String, select: false },
        pinHash: { type: String, select: false },
        active: { type: Boolean, default: true }
    },
    { timestamps: true }
);

const FleetSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 140 },
        plates: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
        status: { type: String, enum: ['available', 'route', 'service', 'inactive'], default: 'available' },
        mileage: { type: Number, min: 0, default: 0 },
        fuelConsumption: { type: Number, min: 0, default: 0 },
        capacity: str(80),
        nextServiceDate: { type: Date, default: null },
        serviceMileage: { type: Number, min: 0, default: null },
        insuranceUntil: { type: Date, default: null },
        inspectionUntil: { type: Date, default: null },
        notes: str(2000),
        active: { type: Boolean, default: true }
    },
    { timestamps: true }
);

// Kolekcja pozostawiona dla zgodności z poprzednią wersją panelu.
const AutomationSchema = new Schema(
    {
        key: { type: String, required: true, unique: true, trim: true },
        name: { type: String, required: true, trim: true },
        description: str(1000),
        enabled: { type: Boolean, default: false },
        config: { type: Schema.Types.Mixed, default: {} },
        runCount: { type: Number, min: 0, default: 0 },
        lastRunAt: { type: Date, default: null }
    },
    { timestamps: true }
);

const ActivitySchema = new Schema(
    {
        type: { type: String, required: true, trim: true },
        message: { type: String, required: true, trim: true, maxlength: 500 },
        entityType: str(40),
        entityId: { type: ObjectId, default: null },
        actorName: str(140, { default: 'System' })
    },
    { timestamps: true }
);
ActivitySchema.index({ createdAt: -1 });
ActivitySchema.index({ entityId: 1, createdAt: -1 });

/*
|--------------------------------------------------------------------------
| Powiadomienia push, skrzynka powiadomień, ustawienia
|--------------------------------------------------------------------------
*/

const PushSubscriptionSchema = new Schema(
    {
        endpoint: { type: String, required: true, unique: true },
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true }
        },
        userKey: { type: String, required: true, index: true },
        userName: str(140),
        deviceLabel: str(140),
        userAgent: str(400),
        lastSuccessAt: { type: Date, default: null },
        failures: { type: Number, default: 0 }
    },
    { timestamps: true }
);

const NotificationSchema = new Schema(
    {
        type: { type: String, required: true },
        title: { type: String, required: true, maxlength: 140 },
        body: str(400),
        url: str(300),
        task: { type: ObjectId, ref: 'Task', default: null },
        recipients: { type: [String], index: true, default: [] },
        readBy: { type: [String], default: [] },
        dedupeKey: { type: String, default: undefined }
    },
    { timestamps: true }
);
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 120 });
NotificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

const DEFAULT_SETTINGS = {
    notifyNewQuote: true,
    notifyNewTask: true,
    notifyAssignment: true,
    notifyStatusToAdmins: true,
    reminderFirstEnabled: true,
    reminderFirstHours: 72,
    reminderSecondEnabled: true,
    reminderSecondHours: 24,
    remindersCopyToAdmins: false,
    reminderStatuses: ['planned', 'progress'],
    companyName: 'RevSerwis',
    companyPhone: '735 396 534',
    companyEmail: 'kontakt@revserwis.pl',
    defaultChecklist: []
};

const SettingsSchema = new Schema(
    {
        key: { type: String, unique: true, default: 'main' },
        notifyNewQuote: { type: Boolean, default: DEFAULT_SETTINGS.notifyNewQuote },
        notifyNewTask: { type: Boolean, default: DEFAULT_SETTINGS.notifyNewTask },
        notifyAssignment: { type: Boolean, default: DEFAULT_SETTINGS.notifyAssignment },
        notifyStatusToAdmins: { type: Boolean, default: DEFAULT_SETTINGS.notifyStatusToAdmins },
        reminderFirstEnabled: { type: Boolean, default: DEFAULT_SETTINGS.reminderFirstEnabled },
        reminderFirstHours: { type: Number, min: 2, max: 336, default: DEFAULT_SETTINGS.reminderFirstHours },
        reminderSecondEnabled: { type: Boolean, default: DEFAULT_SETTINGS.reminderSecondEnabled },
        reminderSecondHours: { type: Number, min: 1, max: 168, default: DEFAULT_SETTINGS.reminderSecondHours },
        remindersCopyToAdmins: { type: Boolean, default: DEFAULT_SETTINGS.remindersCopyToAdmins },
        reminderStatuses: { type: [String], default: DEFAULT_SETTINGS.reminderStatuses },
        companyName: str(120, { default: DEFAULT_SETTINGS.companyName }),
        companyPhone: str(40, { default: DEFAULT_SETTINGS.companyPhone }),
        companyEmail: str(160, { default: DEFAULT_SETTINGS.companyEmail }),
        defaultChecklist: [{ type: String, trim: true, maxlength: 200 }],
        vapidPublicKey: { type: String, select: false },
        vapidPrivateKey: { type: String, select: false }
    },
    { timestamps: true }
);

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

module.exports = {
    mongoose,
    TASK_STATUSES,
    DEFAULT_SETTINGS,
    Task: model('Task', TaskSchema),
    Client: model('Client', ClientSchema),
    Expense: model('Expense', ExpenseSchema),
    Income: model('Income', IncomeSchema),
    Employee: model('Employee', EmployeeSchema),
    Fleet: model('Fleet', FleetSchema),
    Automation: model('Automation', AutomationSchema),
    Activity: model('Activity', ActivitySchema),
    PushSubscription: model('PushSubscription', PushSubscriptionSchema),
    Notification: model('Notification', NotificationSchema),
    Settings: model('Settings', SettingsSchema)
};
