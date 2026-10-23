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
        // 8.0: „before” = sprzęt / rzeczy do zabrania przed wyjazdem (z checklisty oddziału), „task” = zwykła pozycja
        phase: { type: String, enum: ['before', 'task'], default: 'task' },
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
        // 7.0: wycena AI z formularza (widełki, pozycje, obserwacje, uwagi dla ekipy) i dane wejściowe do ponownej wyceny
        aiEstimate: { type: Schema.Types.Mixed, default: null },
        aiInput: { type: Schema.Types.Mixed, default: null, select: false },

        discordPending: { type: Boolean, default: false },
        discordNextAttempt: { type: Date, default: Date.now },

        number: { type: String, trim: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 160 },
        type: str(80, { default: 'Inne' }),
        division: str(40, { index: true }),
        // free = bezpłatne widełki, onsite = płatna wycena z dojazdem (oględziny)
        quoteType: { type: String, enum: ['free', 'onsite', ''], default: '' },
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

        // 8.0: oddział (osobna ekipa, bus i zlecenia) — przypisuje WYŁĄCZNIE administrator, nigdy automatycznie
        branch: { type: ObjectId, ref: 'Branch', default: null, index: true },
        // 8.0: raport z zakończenia (zdjęcia, koszty, pobrana kwota, zgoda na SMS z prośbą o opinię)
        mediaCount: {
            before: { type: Number, default: 0 },
            after: { type: Number, default: 0 },
            other: { type: Number, default: 0 }
        },
        costs: {
            fuel: { type: Number, min: 0, default: null },
            materials: { type: Number, min: 0, default: null },
            disposal: { type: Number, min: 0, default: null },
            other: { type: Number, min: 0, default: null },
            note: str(500),
            reportedBy: str(140),
            reportedAt: { type: Date, default: null }
        },
        hoursWorked: { type: Number, min: 0, max: 500, default: null },
        cashCollected: { type: Number, min: 0, default: null },
        cashMethod: str(40),
        completionNote: str(2000),
        reviewRequest: {
            consent: { type: Boolean, default: false },
            consentBy: str(140),
            status: { type: String, enum: ['', 'sent', 'manual', 'failed', 'skipped'], default: '' },
            sentAt: { type: Date, default: null },
            error: str(300)
        },
        // 8.0: RevBot — czy zlecenie zostało już wykorzystane do nauki
        learnedAt: { type: Date, default: null },

        // 9.0: panel klienta (/konto) i panele B2B
        account: { type: ObjectId, ref: 'Account', default: null, index: true },
        portalKind: { type: String, enum: ['', 'client', 'hotel', 'partner', 'outlet', 'trip', 'subscription', 'storage', 'developer'], default: '' },
        portalRef: { type: ObjectId, default: null },
        clientAcceptedAt: { type: Date, default: null },
        clientCancelRequestedAt: { type: Date, default: null },
        clientCancelReason: str(500),
        clientRating: { type: Number, min: 1, max: 5, default: null },
        clientFeedback: str(1500),
        trackingNote: str(300),
        etaAt: { type: Date, default: null },
        // 9.1: dodatki wybrane przy zamówieniu, etapy lejka sprzedaży, czat w zleceniu
        addons: {
            type: [{ addon: { type: ObjectId, default: null }, name: str(80), unit: str(10), qty: { type: Number, default: 1 }, price: { type: Number, default: null }, total: { type: Number, default: null }, _id: false }],
            default: []
        },
        addonsTotal: { type: Number, default: 0 },
        quotedAt: { type: Date, default: null },
        plannedAt: { type: Date, default: null },
        chatUnreadStaff: { type: Number, default: 0 },
        chatUnreadClient: { type: Number, default: 0 },
        lastChatAt: { type: Date, default: null },
        chatClientMailAt: { type: Date, default: null },

        createdBy: str(140)
    },
    { timestamps: true }
);

TaskSchema.index({ status: 1, dateStart: 1 });
TaskSchema.index({ branch: 1, dateStart: 1 });
TaskSchema.index({ 'workers.employee': 1, dateStart: 1 });
TaskSchema.index({ account: 1, createdAt: -1 });
TaskSchema.index({ clientEmail: 1, createdAt: -1 });

TaskSchema.pre('validate', function syncTaskState(next) {
    if (!this.number) {
        this.number = 'RV-' + randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
    }
    if (this.status === 'completed') this.completed = true;
    if (this.completed && this.status !== 'completed') this.status = 'completed';
    if (this.status === 'completed' && !this.completedAt) this.completedAt = new Date();
    // 9.1: lejek sprzedaży — kiedy zlecenie pierwszy raz dostało wycenę / zostało zaplanowane
    if (['quoted', 'planned', 'progress', 'completed'].includes(this.status) && !this.quotedAt && (this.isNew || this.isModified('status'))) this.quotedAt = new Date();
    if (['planned', 'progress', 'completed'].includes(this.status) && !this.plannedAt && (this.isNew || this.isModified('status'))) this.plannedAt = new Date();

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
    // 8.0: koszty zleceń (paliwo, materiały, utylizacja), wypłaty z rozliczeń i koszty oddziałów
    branch: { type: ObjectId, ref: 'Branch', default: null, index: true },
    source: { type: String, enum: ['manual', 'task', 'payroll'], default: 'manual' },
    payroll: { type: ObjectId, ref: 'PayEntry', default: null },
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
        active: { type: Boolean, default: true },
        // 8.0: oddział pracownika (widzi tylko zlecenia swojego oddziału); isOwner = właściciel/główny administrator
        branch: { type: ObjectId, ref: 'Branch', default: null, index: true },
        isOwner: { type: Boolean, default: false },
        payRate: { type: Number, min: 0, default: 0 },
        payRateUnit: { type: String, enum: ['task', 'hour', 'day'], default: 'task' }
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
    companyNip: '8393269274',
    companyAddress: 'Słupsk',
    companyBank: '',
    offerTerms: 'Oferta ważna 14 dni. Termin realizacji ustalany po akceptacji oferty. Ceny netto + VAT według stawki w pozycji.',
    defaultChecklist: [],
    notifyNewMessage: true,
    notifyBusinessReminders: true,
    contactAutoReply: false,
    // 8.0
    taxRate: 12,
    taxUpperRate: 32,
    taxThreshold: 120000,
    taxFreeAmount: 0,
    googleReviewUrl: 'https://www.google.com/maps?cid=2360414228630652549',
    reviewSmsTemplate: 'Dzień dobry! Dziękujemy za skorzystanie z usług RevSerwis. Będziemy wdzięczni za krótką opinię: {link} Pozdrawiamy, RevSerwis',
    requireCompletionPhotos: true,
    requireCostReport: true,
    requireBeforeChecklist: true
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
        companyNip: str(20),
        companyAddress: str(300, { default: DEFAULT_SETTINGS.companyAddress }),
        companyBank: str(60),
        offerTerms: str(3000, { default: DEFAULT_SETTINGS.offerTerms }),
        notifyNewMessage: { type: Boolean, default: DEFAULT_SETTINGS.notifyNewMessage },
        notifyBusinessReminders: { type: Boolean, default: DEFAULT_SETTINGS.notifyBusinessReminders },
        contactAutoReply: { type: Boolean, default: DEFAULT_SETTINGS.contactAutoReply },
        taxRate: { type: Number, min: 0, max: 100, default: DEFAULT_SETTINGS.taxRate },
        taxUpperRate: { type: Number, min: 0, max: 100, default: DEFAULT_SETTINGS.taxUpperRate },
        taxThreshold: { type: Number, min: 0, default: DEFAULT_SETTINGS.taxThreshold },
        taxFreeAmount: { type: Number, min: 0, default: DEFAULT_SETTINGS.taxFreeAmount },
        googleReviewUrl: str(500, { default: DEFAULT_SETTINGS.googleReviewUrl }),
        reviewSmsTemplate: str(480, { default: DEFAULT_SETTINGS.reviewSmsTemplate }),
        requireCompletionPhotos: { type: Boolean, default: DEFAULT_SETTINGS.requireCompletionPhotos },
        requireCostReport: { type: Boolean, default: DEFAULT_SETTINGS.requireCostReport },
        requireBeforeChecklist: { type: Boolean, default: DEFAULT_SETTINGS.requireBeforeChecklist },
        // 8.0: parametry wyceny RevBota (tylko serwer i administrator — nigdy na stronie)
        revbot: { type: Schema.Types.Mixed, default: null },
        vapidPublicKey: { type: String, select: false },
        vapidPrivateKey: { type: String, select: false }
    },
    { timestamps: true }
);

/*
|--------------------------------------------------------------------------
| RevMi 4.0 — notatnik, wiadomości, abonamenty, oferty, magazyn, cennik
|--------------------------------------------------------------------------
*/

const NOTE_COLORS = ['default', 'mint', 'blue', 'amber', 'rose', 'violet'];

const PadChecklistSchema = new Schema(
    {
        text: { type: String, trim: true, maxlength: 300, required: true },
        done: { type: Boolean, default: false }
    },
    { _id: true }
);

const PadNoteSchema = new Schema(
    {
        title: str(160),
        content: str(20000),
        color: { type: String, enum: NOTE_COLORS, default: 'default' },
        pinned: { type: Boolean, default: false },
        archived: { type: Boolean, default: false, index: true },
        tags: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] },
        checklist: { type: [PadChecklistSchema], default: [] },
        visibility: { type: String, enum: ['private', 'team'], default: 'private' },
        ownerKey: { type: String, required: true, index: true },
        ownerName: str(140),
        lastEditedBy: str(140),
        task: { type: ObjectId, ref: 'Task', default: null },
        client: { type: ObjectId, ref: 'Client', default: null },
        division: str(40),
        reminderAt: { type: Date, default: null },
        reminderSentAt: { type: Date, default: null }
    },
    { timestamps: true }
);
PadNoteSchema.index({ visibility: 1, archived: 1, updatedAt: -1 });
PadNoteSchema.index({ reminderAt: 1, reminderSentAt: 1 });

const MESSAGE_STATUSES = ['new', 'read', 'replied', 'archived', 'spam'];

const MessageSchema = new Schema(
    {
        requestId: { type: String, unique: true, sparse: true },
        kind: { type: String, enum: ['person', 'company'], default: 'person' },
        name: { type: String, required: true, trim: true, maxlength: 140 },
        company: str(180),
        nip: str(20),
        email: str(160, { lowercase: true }),
        phone: str(40),
        topic: str(80, { default: 'Pytanie ogólne' }),
        division: str(40),
        message: { type: String, required: true, trim: true, maxlength: 5000 },
        status: { type: String, enum: MESSAGE_STATUSES, default: 'new', index: true },
        source: str(80, { default: 'Formularz kontaktowy' }),
        internalNotes: str(3000),
        handledBy: str(140),
        task: { type: ObjectId, ref: 'Task', default: null },
        client: { type: ObjectId, ref: 'Client', default: null },
        mail: {
            pending: { type: Boolean, default: false },
            attempts: { type: Number, default: 0 },
            nextAttempt: { type: Date, default: Date.now },
            sentAt: { type: Date, default: null },
            error: str(300)
        },
        autoReply: {
            pending: { type: Boolean, default: false },
            sentAt: { type: Date, default: null }
        },
        discordPending: { type: Boolean, default: false },
        discordNextAttempt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);
MessageSchema.index({ createdAt: -1 });
MessageSchema.index({ 'mail.pending': 1, 'mail.nextAttempt': 1 });

const CounterSchema = new Schema({ key: { type: String, unique: true, required: true }, seq: { type: Number, default: 0 } });

const CONTRACT_STATUSES = ['offer', 'active', 'paused', 'ended'];

const ContractSchema = new Schema(
    {
        number: { type: String, trim: true, index: true },
        title: { type: String, required: true, trim: true, maxlength: 160 },
        client: { type: ObjectId, ref: 'Client', default: null },
        clientName: str(160),
        clientPhone: str(40),
        clientEmail: str(160, { lowercase: true }),
        address: str(300),
        division: str(40),
        services: { type: [{ type: String, trim: true, maxlength: 120 }], default: [] },
        scope: str(4000),
        monthlyPrice: { type: Number, min: 0, default: 0 },
        vatRate: { type: Number, min: 0, max: 23, default: 23 },
        billingDay: { type: Number, min: 1, max: 28, default: 1 },
        startDate: { type: Date, default: Date.now },
        endDate: { type: Date, default: null },
        nextBillingDate: { type: Date, default: null, index: true },
        lastBilledAt: { type: Date, default: null },
        status: { type: String, enum: CONTRACT_STATUSES, default: 'active', index: true },
        billings: {
            type: [{ date: Date, amount: Number, income: { type: ObjectId, ref: 'Income', default: null }, _id: false }],
            default: []
        },
        notes: str(3000),
        createdBy: str(140),
        // 9.0: subskrypcja z panelu klienta
        account: { type: ObjectId, ref: 'Account', default: null, index: true },
        subscription: { type: ObjectId, ref: 'Subscription', default: null }
    },
    { timestamps: true }
);

const OFFER_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

const OfferItemSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 200 },
        qty: { type: Number, min: 0, default: 1 },
        unit: str(20, { default: 'usł.' }),
        price: { type: Number, min: 0, default: 0 },
        vatRate: { type: Number, min: 0, max: 23, default: 23 }
    },
    { _id: false }
);

const OfferSchema = new Schema(
    {
        number: { type: String, trim: true, index: true },
        title: { type: String, required: true, trim: true, maxlength: 160 },
        status: { type: String, enum: OFFER_STATUSES, default: 'draft', index: true },
        division: str(40),
        client: { type: ObjectId, ref: 'Client', default: null },
        clientName: str(160),
        clientCompany: str(180),
        clientNip: str(20),
        clientEmail: str(160, { lowercase: true }),
        clientPhone: str(40),
        clientAddress: str(300),
        items: { type: [OfferItemSchema], default: [] },
        discount: { type: Number, min: 0, max: 100, default: 0 },
        totals: {
            net: { type: Number, default: 0 },
            vat: { type: Number, default: 0 },
            gross: { type: Number, default: 0 }
        },
        terms: str(3000),
        notes: str(3000),
        validUntil: { type: Date, default: null },
        sentAt: { type: Date, default: null },
        decidedAt: { type: Date, default: null },
        task: { type: ObjectId, ref: 'Task', default: null },
        message: { type: ObjectId, ref: 'Message', default: null },
        createdBy: str(140)
    },
    { timestamps: true }
);

const round2 = value => Math.round((Number(value) || 0) * 100) / 100;

/** Sumy oferty: ceny pozycji netto, rabat procentowy, VAT liczony od pozycji po rabacie. */
function offerTotals(items = [], discount = 0) {
    const factor = 1 - Math.min(Math.max(Number(discount) || 0, 0), 100) / 100;
    let net = 0;
    let vat = 0;
    for (const item of items) {
        const line = (Number(item.qty) || 0) * (Number(item.price) || 0) * factor;
        net += line;
        vat += line * ((Number(item.vatRate) || 0) / 100);
    }
    return { net: round2(net), vat: round2(vat), gross: round2(net + vat) };
}

OfferSchema.pre('validate', function computeTotals(next) {
    this.totals = offerTotals(this.items, this.discount);
    next();
});

const STORAGE_STATUSES = ['reserved', 'stored', 'released'];

const StorageItemSchema = new Schema(
    {
        number: { type: String, trim: true, index: true },
        client: { type: ObjectId, ref: 'Client', default: null },
        clientName: { type: String, required: true, trim: true, maxlength: 160 },
        clientPhone: str(40),
        description: { type: String, required: true, trim: true, maxlength: 300 },
        inventory: str(4000),
        location: str(80),
        volume: { type: Number, min: 0, default: 0 },
        startDate: { type: Date, default: Date.now },
        endDate: { type: Date, default: null, index: true },
        releasedAt: { type: Date, default: null },
        monthlyPrice: { type: Number, min: 0, default: 0 },
        status: { type: String, enum: STORAGE_STATUSES, default: 'stored', index: true },
        pickupAddress: str(300),
        notes: str(3000),
        // 7.0: przypisanie do miejsca w magazynie (boks/regał/strefa) i zdjęcia rzeczy
        unit: { type: ObjectId, ref: 'StorageUnit', default: null, index: true },
        photos: { type: [{ data: Buffer, contentType: String, addedAt: { type: Date, default: Date.now } }], default: [], select: false },
        photoCount: { type: Number, default: 0 },
        // 9.0: RevStorage w panelu klienta — konto, które widzi te rzeczy
        account: { type: ObjectId, ref: 'Account', default: null, index: true },
        visibleToClient: { type: Boolean, default: true }
    },
    { timestamps: true }
);

/* 7.0 — miejsca w magazynie (pojemność w m³) */
const StorageUnitSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        kind: { type: String, enum: ['boks', 'regal', 'strefa', 'kontener', 'inne'], default: 'boks' },
        capacity: { type: Number, min: 0, max: 100000, default: 0 },
        notes: str(500),
        active: { type: Boolean, default: true },
        order: { type: Number, default: 0 }
    },
    { timestamps: true }
);

/* 7.0 — sortownia: pojemniki/frakcje odpadów i ruchy (przyjęcie, opróżnienie, korekta) */
const SORTING_UNITS = ['kg', 'szt', 'm3'];
const SortingBinSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        fraction: str(60),
        wasteCode: str(20),
        unit: { type: String, enum: SORTING_UNITS, default: 'kg' },
        capacity: { type: Number, min: 0, max: 10000000, default: 0 },
        current: { type: Number, min: 0, default: 0 },
        currentWeight: { type: Number, min: 0, default: 0 },
        currentQty: { type: Number, min: 0, default: 0 },
        warnAt: { type: Number, min: 10, max: 100, default: 80 },
        pricePerUnit: { type: Number, default: 0 },
        location: str(80),
        destination: str(160),
        color: str(20, { default: 'mint' }),
        notes: str(1000),
        active: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
        lastEmptiedAt: { type: Date, default: null },
        alertSentAt: { type: Date, default: null }
    },
    { timestamps: true }
);

const SortingEntrySchema = new Schema(
    {
        bin: { type: ObjectId, ref: 'SortingBin', required: true, index: true },
        binName: str(80),
        kind: { type: String, enum: ['in', 'out', 'adjust'], default: 'in', index: true },
        amount: { type: Number, default: 0 },
        weightKg: { type: Number, min: 0, default: 0 },
        quantity: { type: Number, min: 0, default: 0 },
        item: str(160),
        note: str(1000),
        destination: str(160),
        value: { type: Number, default: 0 },
        task: { type: ObjectId, ref: 'Task', default: null },
        taskNumber: str(40),
        photos: { type: [{ data: Buffer, contentType: String }], default: [], select: false },
        photoCount: { type: Number, default: 0 },
        createdBy: str(140)
    },
    { timestamps: true }
);
SortingEntrySchema.index({ createdAt: -1 });

const PriceItemSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 200 },
        division: str(40),
        unit: str(20, { default: 'usł.' }),
        price: { type: Number, min: 0, default: 0 },
        priceMax: { type: Number, min: 0, default: null },
        vatRate: { type: Number, min: 0, max: 23, default: 23 },
        description: str(500),
        active: { type: Boolean, default: true }
    },
    { timestamps: true }
);

/*
|--------------------------------------------------------------------------
| RevMi 8.0 — oddziały, zdjęcia z realizacji, rozliczenia pracowników, pamięć RevBota
|--------------------------------------------------------------------------
*/

/** Oddział = osobna ekipa + osobny bus + osobne zlecenia (dodawane tylko ręcznie przez administratora). */
const BranchSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        specialty: str(200),
        city: str(80),
        color: str(20, { default: '#03F0BE' }),
        vehicles: { type: [{ type: ObjectId, ref: 'Fleet' }], default: [] },
        vehicleText: str(160),
        // Co ekipa musi mieć przed zleceniem (np. pasy transportowe, koc, folia stretch) — kopiowane do każdego zlecenia oddziału
        equipment: { type: [{ type: String, trim: true, maxlength: 120 }], default: [] },
        minPhotos: { type: Number, min: 0, max: 10, default: 1 },
        notes: str(1000),
        active: { type: Boolean, default: true },
        order: { type: Number, default: 0 }
    },
    { timestamps: true }
);

/** Zdjęcia z realizacji (przed / po / inne) — osobna kolekcja, żeby nie powiększać dokumentu zlecenia. */
const TaskMediaSchema = new Schema(
    {
        task: { type: ObjectId, ref: 'Task', required: true, index: true },
        kind: { type: String, enum: ['before', 'after', 'other'], default: 'other' },
        data: { type: Buffer, select: false },
        contentType: { type: String, default: 'image/jpeg' },
        size: { type: Number, default: 0 },
        by: str(140),
        byKey: str(40)
    },
    { timestamps: true }
);

/** Wypłata / premia / zaliczka pracownika. Sumuje się, dopóki administrator nie kliknie „Rozliczono”. */
const PayEntrySchema = new Schema(
    {
        employee: { type: ObjectId, ref: 'Employee', required: true, index: true },
        employeeName: str(140),
        branch: { type: ObjectId, ref: 'Branch', default: null },
        kind: { type: String, enum: ['pay', 'bonus', 'advance', 'deduction'], default: 'pay' },
        amount: { type: Number, required: true },
        description: str(300),
        task: { type: ObjectId, ref: 'Task', default: null },
        taskNumber: str(40),
        date: { type: Date, default: Date.now },
        settled: { type: Boolean, default: false, index: true },
        settledAt: { type: Date, default: null },
        settledBy: str(140),
        settlement: str(60),
        createdBy: str(140)
    },
    { timestamps: true }
);
PayEntrySchema.index({ employee: 1, settled: 1, date: -1 });

/**
 * Pamięć RevBota: reguły od administratora, wnioski z zakończonych zleceń (porównanie wyceny z ceną końcową)
 * i wiedza rynkowa z internetu (np. ceny utylizacji). Trafia do kontekstu każdej wyceny.
 */
const REVBOT_MEMORY_KINDS = ['rule', 'lesson', 'market', 'correction'];
const RevBotMemorySchema = new Schema(
    {
        kind: { type: String, enum: REVBOT_MEMORY_KINDS, default: 'lesson', index: true },
        service: str(40, { index: true }),
        text: { type: String, required: true, trim: true, maxlength: 1500 },
        sources: { type: [{ type: String, trim: true, maxlength: 400 }], default: [] },
        task: { type: ObjectId, ref: 'Task', default: null },
        weight: { type: Number, min: 0, max: 10, default: 1 },
        uses: { type: Number, default: 0 },
        active: { type: Boolean, default: true, index: true },
        expiresAt: { type: Date, default: null },
        createdBy: str(140, { default: 'RevBot' })
    },
    { timestamps: true }
);
RevBotMemorySchema.index({ active: 1, service: 1, updatedAt: -1 });

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
    Settings: model('Settings', SettingsSchema),
    NOTE_COLORS,
    MESSAGE_STATUSES,
    CONTRACT_STATUSES,
    OFFER_STATUSES,
    STORAGE_STATUSES,
    offerTotals,
    PadNote: model('PadNote', PadNoteSchema),
    Message: model('Message', MessageSchema),
    Counter: model('Counter', CounterSchema),
    Contract: model('Contract', ContractSchema),
    Offer: model('Offer', OfferSchema),
    StorageItem: model('StorageItem', StorageItemSchema),
    PriceItem: model('PriceItem', PriceItemSchema),
    SORTING_UNITS,
    StorageUnit: model('StorageUnit', StorageUnitSchema),
    SortingBin: model('SortingBin', SortingBinSchema),
    SortingEntry: model('SortingEntry', SortingEntrySchema),
    REVBOT_MEMORY_KINDS,
    Branch: model('Branch', BranchSchema),
    TaskMedia: model('TaskMedia', TaskMediaSchema),
    PayEntry: model('PayEntry', PayEntrySchema),
    RevBotMemory: model('RevBotMemory', RevBotMemorySchema)
};
