'use strict';

/**
 * RevSerwis 9.0 — nowe kolekcje:
 *  - Account            konto klienta (/konto): e-mail + hasło; dostęp B2B (hotel / partner) nadaje administrator w RevMi
 *  - OutletItem/Order   RevOutlet — sklep z rzeczami z opróżniania (powiązany z Sortownią)
 *  - ReturnTrip/Booking RevPowrót — giełda pustych kursów powrotnych
 *  - Plan/Subscription  abonamenty (RevWinter, RevFacility, RevGarden…) z wizytami
 *  - PartnerReferral    portal partnerski biur nieruchomości (polecenia + prowizje)
 *  - HotelProperty/Route panel hoteli i pensjonatów (obiekty + stałe trasy → zlecenia w RevMi)
 *  - JobApplication     portal rekrutacyjny (działy, marketing, franczyza)
 */
const { mongoose } = require('./models');
const P = require('../lib/portal-input');

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;
const str = (max, extra = {}) => ({ type: String, trim: true, maxlength: max, default: '', ...extra });
const photoList = () => ({ type: [{ data: Buffer, contentType: String, addedAt: { type: Date, default: Date.now } }], default: [], select: false });

/* ------------------------------------------------------------------ */
/* Konto klienta                                                       */
/* ------------------------------------------------------------------ */

const AccountSchema = new Schema(
    {
        email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 160 },
        passwordHash: { type: String, required: true, select: false },
        name: { type: String, required: true, trim: true, maxlength: 140 },
        phone: str(40, { index: true }),
        kind: { type: String, enum: ['person', 'company'], default: 'person' },
        company: str(180),
        nip: str(20),
        address: str(300),
        city: str(80),
        postalCode: str(10),
        invoiceEmail: str(160, { lowercase: true }),

        // Powiązanie z kartą klienta w CRM RevMi (zakładka Klienci)
        client: { type: ObjectId, ref: 'Client', default: null, index: true },

        // Dostęp do paneli B2B — nadaje WYŁĄCZNIE administrator w RevMi
        access: { type: [{ type: String, enum: P.ACCESS_KINDS }], default: [] },
        accessRequested: { type: [{ type: String, enum: P.ACCESS_KINDS }], default: [] },
        accessGrantedAt: { type: Date, default: null },
        accessGrantedBy: str(140),
        partner: {
            agencyName: str(180),
            commissionPct: { type: Number, min: 0, max: 50, default: 10 },
            notes: str(1000)
        },
        hotel: {
            companyName: str(180),
            billingNote: str(1000),
            monthlyInvoice: { type: Boolean, default: true }
        },

        emailVerified: { type: Boolean, default: false },
        emailVerifiedAt: { type: Date, default: null },
        verifyTokenHash: { type: String, select: false },
        verifyTokenExpires: { type: Date, select: false },
        resetTokenHash: { type: String, select: false },
        resetTokenExpires: { type: Date, select: false },

        status: { type: String, enum: ['active', 'blocked'], default: 'active', index: true },
        notifyEmail: { type: Boolean, default: true },
        notifySms: { type: Boolean, default: true },
        marketingConsent: { type: Boolean, default: false },
        termsAcceptedAt: { type: Date, default: Date.now },

        lastLoginAt: { type: Date, default: null },
        loginCount: { type: Number, default: 0 },
        failedLogins: { type: Number, default: 0, select: false },
        lockedUntil: { type: Date, default: null, select: false },
        deletionRequestedAt: { type: Date, default: null },
        adminNotes: str(2000)
    },
    { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* RevOutlet                                                           */
/* ------------------------------------------------------------------ */

const OutletItemSchema = new Schema(
    {
        number: { type: String, trim: true, index: true },
        slug: { type: String, trim: true, index: true },
        title: { type: String, required: true, trim: true, maxlength: 140 },
        category: { type: String, enum: P.OUTLET_CATEGORIES, default: 'Inne', index: true },
        condition: { type: String, enum: P.OUTLET_CONDITIONS, default: 'Dobry' },
        description: str(4000),
        price: { type: Number, min: 0, required: true },
        oldPrice: { type: Number, min: 0, default: null },
        dimensions: str(120),
        location: str(120, { default: 'Słupsk' }),
        deliveryAvailable: { type: Boolean, default: true },
        deliveryPrice: { type: Number, min: 0, default: null },
        quantity: { type: Number, min: 0, default: 1 },
        status: { type: String, enum: P.OUTLET_STATUSES, default: 'draft', index: true },
        featured: { type: Boolean, default: false },
        photos: photoList(),
        photoCount: { type: Number, default: 0 },
        // Skąd pochodzi (Sortownia / zlecenie opróżniania) — „drugie życie rzeczy”
        sortingEntry: { type: ObjectId, ref: 'SortingEntry', default: null },
        task: { type: ObjectId, ref: 'Task', default: null },
        views: { type: Number, default: 0 },
        publishedAt: { type: Date, default: null },
        soldAt: { type: Date, default: null },
        createdBy: str(140)
    },
    { timestamps: true }
);
OutletItemSchema.index({ status: 1, featured: -1, publishedAt: -1 });

const OutletOrderSchema = new Schema(
    {
        number: { type: String, trim: true, index: true },
        requestId: { type: String, unique: true, sparse: true },
        item: { type: ObjectId, ref: 'OutletItem', required: true, index: true },
        itemTitle: str(140),
        price: { type: Number, min: 0, default: 0 },
        deliveryPrice: { type: Number, min: 0, default: 0 },
        account: { type: ObjectId, ref: 'Account', default: null, index: true },
        name: { type: String, required: true, trim: true, maxlength: 140 },
        phone: str(40),
        email: str(160, { lowercase: true }),
        delivery: { type: String, enum: P.DELIVERY, default: 'pickup' },
        address: str(300),
        note: str(1000),
        status: { type: String, enum: P.OUTLET_ORDER_STATUSES, default: 'new', index: true },
        task: { type: ObjectId, ref: 'Task', default: null },
        handledBy: str(140)
    },
    { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* RevPowrót                                                           */
/* ------------------------------------------------------------------ */

const ReturnTripSchema = new Schema(
    {
        number: { type: String, trim: true, index: true },
        from: { type: String, required: true, trim: true, maxlength: 120 },
        to: { type: String, required: true, trim: true, maxlength: 120 },
        via: str(300),
        date: { type: Date, required: true, index: true },
        dateFlexDays: { type: Number, min: 0, max: 14, default: 0 },
        capacityM3: { type: Number, min: 0, required: true },
        remainingM3: { type: Number, min: 0, default: 0 },
        maxWeightKg: { type: Number, min: 0, default: null },
        pricePerM3: { type: Number, min: 0, default: null },
        minPrice: { type: Number, min: 0, default: null },
        discountPct: { type: Number, min: 0, max: 90, default: 0 },
        vehicle: str(120),
        notes: str(1500),
        status: { type: String, enum: P.TRIP_STATUSES, default: 'open', index: true },
        published: { type: Boolean, default: true },
        branch: { type: ObjectId, ref: 'Branch', default: null },
        task: { type: ObjectId, ref: 'Task', default: null },
        createdBy: str(140)
    },
    { timestamps: true }
);

const TripBookingSchema = new Schema(
    {
        number: { type: String, trim: true, index: true },
        requestId: { type: String, unique: true, sparse: true },
        trip: { type: ObjectId, ref: 'ReturnTrip', required: true, index: true },
        account: { type: ObjectId, ref: 'Account', default: null, index: true },
        name: { type: String, required: true, trim: true, maxlength: 140 },
        phone: str(40),
        email: str(160, { lowercase: true }),
        volumeM3: { type: Number, min: 0, required: true },
        pickupAddress: str(300),
        dropAddress: str(300),
        items: str(2000),
        floorInfo: str(200),
        note: str(1000),
        price: { type: Number, min: 0, default: 0 },
        status: { type: String, enum: P.BOOKING_STATUSES, default: 'new', index: true },
        task: { type: ObjectId, ref: 'Task', default: null }
    },
    { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* Abonamenty                                                          */
/* ------------------------------------------------------------------ */

const PlanSchema = new Schema(
    {
        slug: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 60 },
        name: { type: String, required: true, trim: true, maxlength: 100 },
        division: str(40),
        tagline: str(200),
        description: str(3000),
        features: { type: [{ type: String, trim: true, maxlength: 160 }], default: [] },
        price: { type: Number, min: 0, required: true },
        billingPeriod: { type: String, enum: P.BILLING_PERIODS, default: 'month' },
        visitsPerPeriod: { type: Number, min: 0, default: 0 },
        season: str(80),
        audience: { type: String, enum: ['all', 'person', 'company'], default: 'all' },
        highlight: { type: Boolean, default: false },
        active: { type: Boolean, default: true, index: true },
        order: { type: Number, default: 0 }
    },
    { timestamps: true }
);

const VisitSchema = new Schema(
    {
        date: { type: Date, required: true },
        status: { type: String, enum: ['planned', 'done', 'skipped'], default: 'planned' },
        note: str(1000),
        task: { type: ObjectId, ref: 'Task', default: null }
    },
    { _id: true }
);

const SubscriptionSchema = new Schema(
    {
        number: { type: String, trim: true, index: true },
        account: { type: ObjectId, ref: 'Account', required: true, index: true },
        plan: { type: ObjectId, ref: 'Plan', required: true },
        planName: str(100),
        price: { type: Number, min: 0, default: 0 },
        billingPeriod: { type: String, enum: P.BILLING_PERIODS, default: 'month' },
        address: str(300),
        area: str(120),
        note: str(1500),
        status: { type: String, enum: P.SUBSCRIPTION_STATUSES, default: 'pending', index: true },
        startDate: { type: Date, default: null },
        activatedAt: { type: Date, default: null },
        cancelledAt: { type: Date, default: null },
        cancelReason: str(500),
        pauseRequestedAt: { type: Date, default: null },
        visits: { type: [VisitSchema], default: [] },
        contract: { type: ObjectId, ref: 'Contract', default: null },
        adminNotes: str(2000)
    },
    { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* Portal partnerski                                                   */
/* ------------------------------------------------------------------ */

const PartnerReferralSchema = new Schema(
    {
        number: { type: String, trim: true, index: true },
        requestId: { type: String, unique: true, sparse: true },
        partner: { type: ObjectId, ref: 'Account', required: true, index: true },
        agencyName: str(180),
        agentName: str(140),
        clientName: { type: String, required: true, trim: true, maxlength: 140 },
        clientPhone: str(40),
        clientEmail: str(160, { lowercase: true }),
        propertyAddress: str(300),
        targetAddress: str(300),
        services: { type: [{ type: String, trim: true, maxlength: 120 }], default: [] },
        preferredDate: { type: Date, default: null },
        listingUrl: str(400),
        notes: str(2000),
        status: { type: String, enum: P.REFERRAL_STATUSES, default: 'new', index: true },
        statusNote: str(500),
        task: { type: ObjectId, ref: 'Task', default: null },
        orderValue: { type: Number, min: 0, default: null },
        commissionPct: { type: Number, min: 0, max: 50, default: 10 },
        commissionAmount: { type: Number, min: 0, default: 0 },
        commissionStatus: { type: String, enum: P.COMMISSION_STATUSES, default: 'none', index: true },
        commissionPaidAt: { type: Date, default: null }
    },
    { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* Panel hoteli i pensjonatów                                          */
/* ------------------------------------------------------------------ */

const HotelPropertySchema = new Schema(
    {
        account: { type: ObjectId, ref: 'Account', required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 140 },
        address: str(300),
        rooms: { type: Number, min: 0, default: null },
        contactName: str(140),
        contactPhone: str(40),
        accessNotes: str(1000),
        notes: str(1500),
        active: { type: Boolean, default: true }
    },
    { timestamps: true }
);

const HotelRouteSchema = new Schema(
    {
        account: { type: ObjectId, ref: 'Account', required: true, index: true },
        property: { type: ObjectId, ref: 'HotelProperty', required: true },
        service: { type: String, enum: P.HOTEL_SERVICES, default: 'Inne' },
        weekdays: { type: [Number], default: [] },
        time: { type: String, default: '08:00' },
        description: str(1500),
        startDate: { type: Date, default: null },
        endDate: { type: Date, default: null },
        active: { type: Boolean, default: true, index: true },
        // Trasa czeka na akceptację administratora (cena, ekipa) zanim zacznie generować zlecenia
        approved: { type: Boolean, default: false },
        pricePerRun: { type: Number, min: 0, default: null },
        branch: { type: ObjectId, ref: 'Branch', default: null },
        lastGeneratedAt: { type: Date, default: null }
    },
    { timestamps: true }
);

/** Znacznik „ta trasa w tym terminie ma już zlecenie” — chroni przed duplikatami przy wielu instancjach. */
const RouteRunSchema = new Schema({
    key: { type: String, required: true, unique: true },
    route: { type: ObjectId, ref: 'HotelRoute', index: true },
    task: { type: ObjectId, ref: 'Task', default: null },
    createdAt: { type: Date, default: Date.now }
});

/* ------------------------------------------------------------------ */
/* Portal rekrutacyjny                                                 */
/* ------------------------------------------------------------------ */

const APPLICATION_STATUSES = ['new', 'review', 'interview', 'accepted', 'rejected'];

const JobApplicationSchema = new Schema(
    {
        number: { type: String, trim: true, index: true },
        requestId: { type: String, unique: true, sparse: true },
        track: { type: String, enum: P.APPLICATION_TRACKS, required: true, index: true },
        department: str(80),
        role: str(80),
        name: { type: String, required: true, trim: true, maxlength: 140 },
        email: str(160, { lowercase: true }),
        phone: str(40),
        city: str(80),
        availability: str(60),
        licenses: { type: [String], default: [] },
        experience: str(1500),
        message: str(3000),
        link: str(400),
        franchise: {
            city: str(120),
            budget: str(60),
            timeline: str(60),
            hasCompany: { type: Boolean, default: false },
            hasVehicle: { type: Boolean, default: false },
            hasTeam: { type: Boolean, default: false },
            businessExperience: str(1500)
        },
        status: { type: String, enum: APPLICATION_STATUSES, default: 'new', index: true },
        rating: { type: Number, min: 0, max: 5, default: 0 },
        internalNotes: str(3000),
        handledBy: str(140),
        mailPending: { type: Boolean, default: false }
    },
    { timestamps: true }
);
JobApplicationSchema.index({ createdAt: -1 });

/* ------------------------------------------------------------------ */
/* 9.1 — dodatki, czat, newsletter, deweloperzy                        */
/* ------------------------------------------------------------------ */

const AddonSchema = new Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        description: str(300),
        icon: str(50, { default: 'fa-plus' }),
        price: { type: Number, min: 0, default: null },
        unit: str(10, { default: 'usł.' }),
        allowQty: { type: Boolean, default: false },
        maxQty: { type: Number, min: 1, default: 20 },
        divisions: { type: [String], default: [] },
        active: { type: Boolean, default: true, index: true },
        order: { type: Number, default: 0 },
        timesOrdered: { type: Number, default: 0 }
    },
    { timestamps: true }
);

const TaskMessageSchema = new Schema(
    {
        task: { type: ObjectId, ref: 'Task', required: true, index: true },
        from: { type: String, enum: ['client', 'staff'], required: true },
        authorName: str(140),
        authorKey: str(40),
        text: str(2000),
        photo: { type: { data: Buffer, contentType: String }, default: undefined, select: false },
        hasPhoto: { type: Boolean, default: false }
    },
    { timestamps: true }
);
TaskMessageSchema.index({ task: 1, createdAt: 1 });

const NewsletterSubscriberSchema = new Schema(
    {
        email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 160 },
        name: str(80),
        city: str(80),
        kind: { type: String, enum: ['person', 'company', ''], default: '' },
        topics: { type: [String], default: [] },
        source: str(20),
        status: { type: String, enum: ['pending', 'active', 'unsubscribed'], default: 'pending', index: true },
        account: { type: ObjectId, ref: 'Account', default: null },
        confirmTokenHash: { type: String, select: false },
        unsubscribeToken: { type: String, index: true },
        consentText: str(500),
        consentAt: { type: Date, default: null },
        confirmedAt: { type: Date, default: null },
        unsubscribedAt: { type: Date, default: null },
        lastSentAt: { type: Date, default: null },
        sentCount: { type: Number, default: 0 },
        bounces: { type: Number, default: 0 }
    },
    { timestamps: true }
);

const CampaignSchema = new Schema(
    {
        subject: { type: String, required: true, trim: true, maxlength: 150 },
        preheader: str(200),
        blocks: { type: Schema.Types.Mixed, default: [] },
        segment: { type: String, default: 'all' },
        segmentValue: str(80),
        status: { type: String, enum: ['draft', 'sending', 'sent', 'paused'], default: 'draft', index: true },
        recipients: { type: [{ subscriber: ObjectId, status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued' }, error: String, _id: false }], default: [], select: false },
        stats: { total: { type: Number, default: 0 }, sent: { type: Number, default: 0 }, failed: { type: Number, default: 0 } },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
        createdBy: str(140)
    },
    { timestamps: true }
);

const DevInvestmentSchema = new Schema(
    {
        account: { type: ObjectId, ref: 'Account', required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 140 },
        address: str(300),
        city: str(80),
        units: { type: Number, min: 0, default: null },
        handoverFrom: { type: Date, default: null },
        handoverTo: { type: Date, default: null },
        buyerOffer: str(300),
        code: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
        discountPct: { type: Number, min: 0, max: 50, default: 0 },
        commissionPct: { type: Number, min: 0, max: 50, default: 0 },
        visits: { type: Number, default: 0 },
        active: { type: Boolean, default: true }
    },
    { timestamps: true }
);

const DevLeadSchema = new Schema(
    {
        number: { type: String, trim: true, index: true },
        requestId: { type: String, unique: true, sparse: true },
        investment: { type: ObjectId, ref: 'DevInvestment', required: true, index: true },
        developer: { type: ObjectId, ref: 'Account', required: true, index: true },
        via: { type: String, enum: ['developer', 'buyer'], default: 'developer' },
        name: { type: String, required: true, trim: true, maxlength: 140 },
        phone: str(40),
        email: str(160, { lowercase: true }),
        unit: str(40),
        handoverDate: { type: Date, default: null },
        moveDate: { type: Date, default: null },
        fromAddress: str(300),
        services: { type: [String], default: [] },
        notes: str(1500),
        status: { type: String, enum: ['new', 'contacted', 'planned', 'completed', 'lost'], default: 'new', index: true },
        task: { type: ObjectId, ref: 'Task', default: null },
        orderValue: { type: Number, default: null },
        commissionAmount: { type: Number, default: 0 }
    },
    { timestamps: true }
);

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

module.exports = {
    APPLICATION_STATUSES,
    Account: model('Account', AccountSchema),
    OutletItem: model('OutletItem', OutletItemSchema),
    OutletOrder: model('OutletOrder', OutletOrderSchema),
    ReturnTrip: model('ReturnTrip', ReturnTripSchema),
    TripBooking: model('TripBooking', TripBookingSchema),
    Plan: model('Plan', PlanSchema),
    Subscription: model('Subscription', SubscriptionSchema),
    PartnerReferral: model('PartnerReferral', PartnerReferralSchema),
    HotelProperty: model('HotelProperty', HotelPropertySchema),
    HotelRoute: model('HotelRoute', HotelRouteSchema),
    RouteRun: model('RouteRun', RouteRunSchema),
    JobApplication: model('JobApplication', JobApplicationSchema),
    Addon: model('Addon', AddonSchema),
    TaskMessage: model('TaskMessage', TaskMessageSchema),
    NewsletterSubscriber: model('NewsletterSubscriber', NewsletterSubscriberSchema),
    Campaign: model('Campaign', CampaignSchema),
    DevInvestment: model('DevInvestment', DevInvestmentSchema),
    DevLead: model('DevLead', DevLeadSchema)
};
