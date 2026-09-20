'use strict';

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const https = require('https');
const { randomUUID } = require('crypto');
const { validateQuote, preparePhotos, fingerprint } = require('./lib/quote-input');

const app = express();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

const PORT = Number(process.env.PORT) || 3000;

const MONGO_URL =
    process.env.MONGO_URL ||
    process.env.MONGO_URI ||
    'mongodb://localhost:27017/revmi';

const ADMIN_PIN = String(process.env.ADMIN_PIN || '1234');

const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    'revmi-dev-secret-change-me-immediately';

const AUTH_DISABLED =
    String(process.env.AUTH_DISABLED || 'false').toLowerCase() === 'true';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const ALLOWED_ORIGINS = String(
    process.env.ALLOWED_ORIGINS ||
    process.env.FRONTEND_URL ||
    ''
)
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

const USE_CROSS_SITE_SESSION =
    String(process.env.CROSS_SITE_SESSION || 'false')
        .toLowerCase() === 'true';

app.set('trust proxy', 1);
app.disable('x-powered-by');

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

app.use((req, res, next) => {
    const origin = req.get('Origin');

    if (!origin) {
        return next();
    }

    const requestOrigin = `${req.protocol}://${req.get('host')}`;
    const normalizedOrigin = origin.replace(/\/$/, '');

    const allowed =
        normalizedOrigin === requestOrigin ||
        ALLOWED_ORIGINS.includes(normalizedOrigin);

    if (!allowed) {
        if (req.method === 'OPTIONS') {
            return res.status(403).json({
                success: false,
                message: 'Adres panelu nie jest dozwolony przez CORS'
            });
        }

        return next();
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, X-Requested-With'
    );

    res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );

    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
});

/*
|--------------------------------------------------------------------------
| ZABEZPIECZENIA I GOOGLE ANALYTICS
|--------------------------------------------------------------------------
*/

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],

                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    'https://www.googletagmanager.com',
                    'https://cdn.tailwindcss.com',
                    'https://cdn.jsdelivr.net',
                    'https://cdnjs.cloudflare.com'
                ],

                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    'https://fonts.googleapis.com',
                    'https://cdnjs.cloudflare.com'
                ],

                fontSrc: [
                    "'self'",
                    'https://fonts.gstatic.com',
                    'https://cdnjs.cloudflare.com',
                    'data:'
                ],

                imgSrc: [
                    "'self'",
                    'blob:',
                    'data:',
                    'https://i.imgur.com',
                    'https://*.google-analytics.com',
                    'https://*.googletagmanager.com'
                ],

                connectSrc: [
                    "'self'",
                    'https://*.google-analytics.com',
                    'https://*.analytics.google.com',
                    'https://*.googletagmanager.com'
                ],

                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                frameAncestors: ["'self'"]
            }
        },

        crossOriginEmbedderPolicy: false
    })
);

const smallJson = express.json({ limit: '250kb' });
app.use((req, res, next) => req.path === '/api/quotes' && req.method === 'POST' ? next() : smallJson(req, res, next));

app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

mongoose.set('strictQuery', true);

/*
|--------------------------------------------------------------------------
| SCHEMAT PRZYPISANIA PRACOWNIKA
|--------------------------------------------------------------------------
*/

const WorkerAssignmentSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Employee',
            default: null
        },

        name: {
            type: String,
            trim: true,
            maxlength: 100
        },

        role: {
            type: String,
            trim: true,
            maxlength: 80,
            default: 'Pomocnik'
        }
    },
    {
        _id: false
    }
);

/*
|--------------------------------------------------------------------------
| ZLECENIA I WYCENY
|--------------------------------------------------------------------------
*/

const TaskSchema = new mongoose.Schema(
    {
        quoteRequestId: {
            type: String,
            unique: true,
            sparse: true
        },

        quoteFingerprint: { type: String, select: false },
        quoteDetails: { type: Map, of: String, default: {} },
        quotePhotoCount: { type: Number, default: 0 },
        quotePhotos: { type: [{ data: Buffer, contentType: String }], default: [], select: false },
        discordPending: {
            type: Boolean,
            default: false
        },

        discordNextAttempt: {
            type: Date,
            default: Date.now
        },

        number: {
            type: String,
            trim: true,
            index: true
        },

        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 160
        },

        type: {
            type: String,
            trim: true,
            maxlength: 80,
            default: 'Inne'
        },

        status: {
            type: String,
            enum: [
                'new',
                'quoted',
                'planned',
                'progress',
                'completed',
                'cancelled'
            ],
            default: 'new',
            index: true
        },

        priority: {
            type: String,
            enum: ['low', 'normal', 'high'],
            default: 'normal'
        },

        price: {
            type: Number,
            min: 0,
            default: 0
        },

        priceMax: {
            type: Number,
            min: 0,
            default: null
        },

        finalPrice: {
            type: Number,
            min: 0,
            default: null
        },

        paymentStatus: {
            type: String,
            enum: ['unpaid', 'partial', 'paid'],
            default: 'unpaid'
        },

        paymentMethod: {
            type: String,
            trim: true,
            maxlength: 40,
            default: ''
        },

        dateStart: {
            type: Date,
            required: true,
            index: true
        },

        dateEnd: {
            type: Date,
            default: null
        },

        completedAt: {
            type: Date,
            default: null
        },

        client: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Client',
            default: null
        },

        clientName: {
            type: String,
            trim: true,
            maxlength: 140,
            default: ''
        },

        clientPhone: {
            type: String,
            trim: true,
            maxlength: 40,
            default: ''
        },

        clientEmail: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: 160,
            default: ''
        },

        address: {
            type: String,
            trim: true,
            maxlength: 300,
            default: ''
        },

        addressFrom: {
            type: String,
            trim: true,
            maxlength: 220,
            default: ''
        },

        addressTo: {
            type: String,
            trim: true,
            maxlength: 220,
            default: ''
        },

        desc: {
            type: String,
            trim: true,
            maxlength: 4000,
            default: ''
        },

        people: {
            type: Number,
            min: 0,
            max: 30,
            default: 0
        },

        workers: {
            type: [WorkerAssignmentSchema],
            default: []
        },

        vehicle: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Fleet',
            default: null
        },

        car: {
            type: String,
            trim: true,
            maxlength: 120,
            default: ''
        },

        source: {
            type: String,
            trim: true,
            maxlength: 80,
            default: 'Ręcznie'
        },

        completed: {
            type: Boolean,
            default: false,
            index: true
        }
    },
    {
        timestamps: true
    }
);

TaskSchema.pre('validate', function syncTaskState(next) {
    if (!this.number) {
        this.number = `RV-${String(Date.now()).slice(-6)}`;
    }

    if (this.status === 'completed') {
        this.completed = true;
    }

    if (this.completed && this.status !== 'completed') {
        this.status = 'completed';
    }

    if (
        this.dateEnd &&
        this.dateStart &&
        this.dateEnd < this.dateStart
    ) {
        return next(
            new Error(
                'Data końcowa nie może być wcześniejsza od początkowej'
            )
        );
    }

    if (
        this.priceMax !== null &&
        this.priceMax < this.price
    ) {
        return next(
            new Error(
                'Kwota maksymalna nie może być mniejsza od minimalnej'
            )
        );
    }

    next();
});

/*
|--------------------------------------------------------------------------
| KLIENCI CRM
|--------------------------------------------------------------------------
*/

const ClientSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 160
        },

        company: {
            type: String,
            trim: true,
            maxlength: 180,
            default: ''
        },

        type: {
            type: String,
            enum: ['person', 'company'],
            default: 'person'
        },

        phone: {
            type: String,
            trim: true,
            maxlength: 40,
            default: '',
            index: true
        },

        email: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: 160,
            default: ''
        },

        address: {
            type: String,
            trim: true,
            maxlength: 300,
            default: ''
        },

        source: {
            type: String,
            trim: true,
            maxlength: 80,
            default: 'Inne'
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 4000,
            default: ''
        },

        tags: [
            {
                type: String,
                trim: true,
                maxlength: 40
            }
        ],

        archived: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

/*
|--------------------------------------------------------------------------
| KOSZTY
|--------------------------------------------------------------------------
*/

const ExpenseSchema = new mongoose.Schema({
    price: {
        type: Number,
        required: true,
        min: 0
    },

    category: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },

    desc: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ''
    },

    date: {
        type: Date,
        default: Date.now,
        index: true
    },

    task: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
        default: null
    },

    vehicle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Fleet',
        default: null
    },

    receiptNumber: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ''
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

/*
|--------------------------------------------------------------------------
| PRZYCHODY
|--------------------------------------------------------------------------
*/

const IncomeSchema = new mongoose.Schema({
    price: {
        type: Number,
        required: true,
        min: 0
    },

    category: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },

    desc: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ''
    },

    date: {
        type: Date,
        default: Date.now,
        index: true
    },

    task: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
        default: null
    },

    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        default: null
    },

    paymentMethod: {
        type: String,
        trim: true,
        maxlength: 40,
        default: ''
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

/*
|--------------------------------------------------------------------------
| PRACOWNICY
|--------------------------------------------------------------------------
*/

const EmployeeSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 140
        },

        role: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },

        systemRole: {
            type: String,
            enum: ['admin', 'worker'],
            default: 'worker'
        },

        phone: {
            type: String,
            trim: true,
            maxlength: 40,
            default: ''
        },

        status: {
            type: String,
            enum: ['available', 'busy', 'off'],
            default: 'available'
        },

        hourlyRate: {
            type: Number,
            min: 0,
            default: 0
        },

        pin: {
            type: String,
            select: false
        },

        pinHash: {
            type: String,
            select: false
        },

        active: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

/*
|--------------------------------------------------------------------------
| FLOTA
|--------------------------------------------------------------------------
*/

const FleetSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 140
        },

        plates: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
            maxlength: 20
        },

        status: {
            type: String,
            enum: ['available', 'route', 'service', 'inactive'],
            default: 'available'
        },

        mileage: {
            type: Number,
            min: 0,
            default: 0
        },

        fuelConsumption: {
            type: Number,
            min: 0,
            default: 0
        },

        nextServiceDate: {
            type: Date,
            default: null
        },

        serviceMileage: {
            type: Number,
            min: 0,
            default: null
        },

        insuranceUntil: {
            type: Date,
            default: null
        },

        inspectionUntil: {
            type: Date,
            default: null
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: ''
        },

        active: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

/*
|--------------------------------------------------------------------------
| AUTOMATYZACJE
|--------------------------------------------------------------------------
*/

const AutomationSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        description: {
            type: String,
            trim: true,
            default: ''
        },

        enabled: {
            type: Boolean,
            default: false
        },

        config: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },

        runCount: {
            type: Number,
            min: 0,
            default: 0
        },

        lastRunAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

/*
|--------------------------------------------------------------------------
| HISTORIA AKTYWNOŚCI
|--------------------------------------------------------------------------
*/

const ActivitySchema = new mongoose.Schema(
    {
        type: {
            type: String,
            required: true,
            trim: true
        },

        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500
        },

        entityType: {
            type: String,
            trim: true,
            default: ''
        },

        entityId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },

        actorName: {
            type: String,
            trim: true,
            default: 'System'
        }
    },
    {
        timestamps: true
    }
);

const Task = mongoose.model('Task', TaskSchema);
const Client = mongoose.model('Client', ClientSchema);
const Expense = mongoose.model('Expense', ExpenseSchema);
const Income = mongoose.model('Income', IncomeSchema);
const Employee = mongoose.model('Employee', EmployeeSchema);
const Fleet = mongoose.model('Fleet', FleetSchema);
const Automation = mongoose.model('Automation', AutomationSchema);
const Activity = mongoose.model('Activity', ActivitySchema);

/*
|--------------------------------------------------------------------------
| SESJE
|--------------------------------------------------------------------------
*/

const sessionStore = MongoStore.create({mongoUrl: MONGO_URL, collectionName: 'sessions', ttl: 60 * 60 * 12});

app.use(
    session({
        name: 'revmi.sid',
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        proxy: IS_PRODUCTION,

        store: sessionStore,

        cookie: {
            httpOnly: true,
            secure: IS_PRODUCTION || USE_CROSS_SITE_SESSION,
            sameSite: USE_CROSS_SITE_SESSION ? 'none' : 'lax',
            maxAge: 1000 * 60 * 60 * 12
        }
    })
);

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false
});

const asyncRoute = function (fn) {
    return function (req, res, next) {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

const isObjectId = value => mongoose.isValidObjectId(value);

const startOfMonth = value =>
    new Date(value.getFullYear(), value.getMonth(), 1);

const startOfNextMonth = value =>
    new Date(value.getFullYear(), value.getMonth() + 1, 1);

const recordActivity = (
    type,
    message,
    entityType = '',
    entityId = null,
    actorName = 'System'
) => {
    return Activity.create({
        type,
        message,
        entityType,
        entityId,
        actorName
    }).catch(() => null);
};

/*
|--------------------------------------------------------------------------
| UPRAWNIENIA I FUNKCJE POMOCNICZE
|--------------------------------------------------------------------------
*/

async function requireAuth(req, res, next) {
    if (AUTH_DISABLED) {
        req.user = {
            role: 'admin',
            name: 'Gracjan Błachnio',
            demo: true
        };

        return next();
    }

    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'Zaloguj się ponownie'
        });
    }

    try {
        if (req.session.user.employeeId) {
            const employee = await Employee.findOne({
                _id: req.session.user.employeeId,
                active: true
            }).select('name systemRole');

            if (!employee) {
                return req.session.destroy(() => {
                    res.status(401).json({
                        success: false,
                        message:
                            'Konto pracownika jest nieaktywne. Zaloguj się ponownie'
                    });
                });
            }

            req.session.user.role = employee.systemRole || 'worker';
            req.session.user.name = employee.name;
        }

        req.user = req.session.user;
        next();
    } catch (error) {
        next(error);
    }
}

function saveSession(req) {
    return new Promise((resolve, reject) => {
        req.session.save(error => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Brak uprawnień administratora'
        });
    }

    next();
}

function validateId(req, res, next) {
    if (!isObjectId(req.params.id)) {
        return res.status(400).json({
            success: false,
            message: 'Nieprawidłowy identyfikator'
        });
    }

    next();
}

function taskPayload(body, partial = false) {
    const allowed = [
        'number',
        'name',
        'type',
        'status',
        'priority',
        'price',
        'priceMax',
        'finalPrice',
        'paymentStatus',
        'paymentMethod',
        'dateStart',
        'dateEnd',
        'client',
        'clientName',
        'clientPhone',
        'clientEmail',
        'address',
        'addressFrom',
        'addressTo',
        'desc',
        'people',
        'workers',
        'vehicle',
        'car',
        'source'
    ];

    const data = {};

    for (const key of allowed) {
        if (body[key] !== undefined) {
            data[key] = body[key];
        }
    }

    if (!partial && (!data.name || !data.dateStart)) {
        const error = new Error(
            'Nazwa i termin zlecenia są wymagane'
        );

        error.status = 400;
        throw error;
    }

    return data;
}

function publicEmployee(employee) {
    const object = employee.toObject
        ? employee.toObject()
        : { ...employee };

    delete object.pin;
    delete object.pinHash;

    return object;
}

/*
|--------------------------------------------------------------------------
| LOGOWANIE
|--------------------------------------------------------------------------
*/

app.post(
    '/api/login',
    loginLimiter,
    asyncRoute(async (req, res) => {
        const pin = String(req.body.pin || '');

        if (!/^\d{4,8}$/.test(pin)) {
            return res.status(400).json({
                success: false,
                message: 'PIN musi mieć od 4 do 8 cyfr'
            });
        }

        if (pin === ADMIN_PIN) {
            req.session.user = {
                role: 'admin',
                name: 'Gracjan Błachnio'
            };

            await saveSession(req);

            return res.json({
                success: true,
                role: 'admin',
                name: 'Gracjan Błachnio'
            });
        }

        const employees = await Employee.find({
            active: true
        }).select('+pin +pinHash');

        let employee = null;

        for (const candidate of employees) {
            const hashMatches =
                candidate.pinHash &&
                await bcrypt.compare(pin, candidate.pinHash);

            const oldPinMatches =
                !candidate.pinHash &&
                candidate.pin === pin;

            if (hashMatches || oldPinMatches) {
                employee = candidate;

                if (!candidate.pinHash) {
                    candidate.pinHash = await bcrypt.hash(pin, 12);
                    candidate.pin = undefined;
                    await candidate.save();
                }

                break;
            }
        }

        if (!employee) {
            return res.status(401).json({
                success: false,
                message: 'Nieprawidłowy PIN'
            });
        }

        const sysRole = employee.systemRole || 'worker';

        req.session.user = {
            role: sysRole,
            name: employee.name,
            employeeId: employee._id.toString()
        };

        await saveSession(req);

        res.json({
            success: true,
            role: sysRole,
            name: employee.name
        });
    })
);

app.get('/api/auth/session', (req, res) => {
    if (AUTH_DISABLED) {
        return res.json({
            authenticated: true,
            role: 'admin',
            name: 'Gracjan Błachnio',
            demo: true
        });
    }

    res.json({
        authenticated: Boolean(req.session.user),
        ...(req.session.user || {})
    });
});

app.post('/api/logout', (req, res, next) => {
    req.session.destroy(error => {
        if (error) {
            return next(error);
        }

        res.json({
            success: true
        });
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        database:
            mongoose.connection.readyState === 1
                ? 'connected'
                : 'disconnected',
        authDisabled: AUTH_DISABLED
    });
});

/*
|--------------------------------------------------------------------------
| PUBLICZNE WYCENY I POWIADOMIENIA DISCORD
|--------------------------------------------------------------------------
*/

const quoteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,

    message: {
        success: false,
        message: 'Za dużo zgłoszeń. Spróbuj za 15 minut.'
    }
});

function sendQuoteNotification() {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            content: '<@913479364883136532> Wpadła nowa wycena',

            allowed_mentions: {
                parse: [],
                users: ['913479364883136532']
            }
        });

        const request = https.request(
            DISCORD_WEBHOOK_URL,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            },
            response => {
                response.resume();

                response.on('end', () => {
                    if (
                        response.statusCode >= 200 &&
                        response.statusCode < 300
                    ) {
                        resolve();
                    } else {
                        reject(
                            new Error(
                                'Discord HTTP ' + response.statusCode
                            )
                        );
                    }
                });

                response.on('error', reject);
            }
        );

        request.setTimeout(10000, () => {
            request.destroy(new Error('Discord timeout'));
        });

        request.on('error', reject);
        request.end(payload);
    });
}

let quoteNotificationsBusy = false;

async function flushQuoteNotifications() {
    if (
        !DISCORD_WEBHOOK_URL ||
        quoteNotificationsBusy ||
        mongoose.connection.readyState !== 1
    ) {
        return;
    }

    quoteNotificationsBusy = true;

    try {
        // Rezerwacja wiadomości również przy kilku instancjach backendu.
        const task = await Task.findOneAndUpdate(
            {
                discordPending: true,

                discordNextAttempt: {
                    $lte: new Date()
                }
            },
            {
                $set: {
                    discordNextAttempt: new Date(
                        Date.now() + 60000
                    )
                }
            },
            {
                new: true
            }
        );

        if (!task) {
            return;
        }

        await sendQuoteNotification();

        await Task.updateOne(
            {
                _id: task._id
            },
            {
                $set: {
                    discordPending: false
                }
            }
        );
    } catch (error) {
        console.error(
            'Powiadomienie wyceny nie zostało wysłane; ponowienie za minutę.'
        );
    } finally {
        quoteNotificationsBusy = false;
    }
}

setInterval(flushQuoteNotifications, 5000).unref();

// Endpoint publiczny przed requireAuth; większy limit tylko dla zdjęć wyceny.
app.post('/api/quotes', quoteLimiter, express.json({ limit: '5mb' }), asyncRoute(async (req, res) => {
    const input = validateQuote(req.body);
    const hash = fingerprint(input);
    let task = await Task.findOne({ quoteRequestId: input.requestId }).select('+quoteFingerprint');
    if (task && task.quoteFingerprint && task.quoteFingerprint !== hash) {
        return res.status(409).json({ success: false, message: 'To zgłoszenie zostało już zapisane z innymi danymi. Odśwież stronę, aby wysłać nowe zapytanie.' });
    }
    if (!task) {
        const quotePhotos = await preparePhotos(input.photos);
        try {
            task = await Task.create({
                quoteRequestId: input.requestId,
                quoteFingerprint: hash,
                number: 'RV-' + randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase(),
                name: 'Wycena: ' + input.service,
                type: input.service,
                status: 'new', source: 'Formularz index', price: 0,
                // Data operacyjna nie jest obietnicą ani rezerwacją terminu klienta.
                dateStart: new Date(), clientName: input.clientName,
                clientPhone: input.phone, address: input.route,
                desc: 'Termin zgłoszony przez klienta: ' + (input.date || 'Do ustalenia') + '\n\n' + input.description,
                quoteDetails: input.details, quotePhotos, quotePhotoCount: quotePhotos.length,
                discordPending: Boolean(DISCORD_WEBHOOK_URL), discordNextAttempt: new Date()
            });
        } catch (error) {
            if (error.code !== 11000) throw error;
            task = await Task.findOne({ quoteRequestId: input.requestId }).select('+quoteFingerprint');
            if (!task) throw error;
            if (task.quoteFingerprint !== hash) return res.status(409).json({ success: false, message: 'Identyfikator zgłoszenia został już użyty. Odśwież stronę.' });
        }
    }
    res.status(201).json({ success: true, number: task.number });
    void flushQuoteNotifications();
}));

/*
|--------------------------------------------------------------------------
| OD TEGO MIEJSCA API WYMAGA LOGOWANIA
|--------------------------------------------------------------------------
*/

app.use('/api', requireAuth);

// Zdjęcia są prywatne. Pobiera je wyłącznie zalogowany administrator RevMi.
app.get('/api/tasks/:id/photos/:index', requireAdmin, validateId, asyncRoute(async (req, res) => {
    if (!/^[0-2]$/.test(req.params.index)) return res.sendStatus(404);
    const task = await Task.findById(req.params.id).select('+quotePhotos');
    const photo = task?.quotePhotos?.[Number(req.params.index)];
    if (!photo) return res.sendStatus(404);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline; filename="zdjecie-wyceny.jpg"');
    res.type('image/jpeg').send(photo.data);
}));


/*
|--------------------------------------------------------------------------
| DASHBOARD
|--------------------------------------------------------------------------
*/

app.get(
    '/api/dashboard',
    asyncRoute(async (req, res) => {
        const now = new Date();
        const from = startOfMonth(now);
        const to = startOfNextMonth(now);

        const completedFilter = {
            status: 'completed',

            completedAt: {
                $gte: from,
                $lt: to
            }
        };

        const [
            taskTotals,
            manualIncome,
            expenseTotals,
            activeTasks,
            unpaidTasks,
            recentActivity,
            costCategories
        ] = await Promise.all([
            Task.aggregate([
                {
                    $match: completedFilter
                },
                {
                    $group: {
                        _id: null,

                        total: {
                            $sum: {
                                $ifNull: ['$finalPrice', '$price']
                            }
                        },

                        count: {
                            $sum: 1
                        }
                    }
                }
            ]),

            Income.aggregate([
                {
                    $match: {
                        date: {
                            $gte: from,
                            $lt: to
                        }
                    }
                },
                {
                    $group: {
                        _id: null,

                        total: {
                            $sum: '$price'
                        }
                    }
                }
            ]),

            Expense.aggregate([
                {
                    $match: {
                        date: {
                            $gte: from,
                            $lt: to
                        }
                    }
                },
                {
                    $group: {
                        _id: null,

                        total: {
                            $sum: '$price'
                        }
                    }
                }
            ]),

            Task.countDocuments({
                status: {
                    $in: [
                        'new',
                        'quoted',
                        'planned',
                        'progress'
                    ]
                }
            }),

            Task.countDocuments({
                status: 'completed',

                paymentStatus: {
                    $ne: 'paid'
                }
            }),

            Activity.find()
                .sort({ createdAt: -1 })
                .limit(8)
                .lean(),

            Expense.aggregate([
                {
                    $match: {
                        date: {
                            $gte: from,
                            $lt: to
                        }
                    }
                },
                {
                    $group: {
                        _id: '$category',

                        total: {
                            $sum: '$price'
                        }
                    }
                },
                {
                    $sort: {
                        total: -1
                    }
                }
            ])
        ]);

        const taskIncome = taskTotals[0]?.total || 0;
        const extraIncome = manualIncome[0]?.total || 0;
        const expenses = expenseTotals[0]?.total || 0;
        const revenue = taskIncome + extraIncome;

        res.json({
            period: {
                from,
                to
            },

            stats: {
                revenue,
                expenses,
                profit: revenue - expenses,

                margin: revenue
                    ? ((revenue - expenses) / revenue) * 100
                    : 0,

                completedTasks: taskTotals[0]?.count || 0,
                activeTasks,
                unpaidTasks
            },

            costCategories,
            recentActivity
        });
    })
);

app.get(
    '/api/data',
    asyncRoute(async (req, res) => {
        const [
            tasks,
            expenses,
            incomes,
            employees,
            fleet,
            clients,
            automations
        ] = await Promise.all([
            // Pracownicy widzą wszystkie zlecenia operacyjne.
            Task.find({})
                .sort({ dateStart: 1 })
                .lean(),

            req.user.role === 'admin'
                ? Expense.find()
                    .sort({ date: -1 })
                    .lean()
                : [],

            req.user.role === 'admin'
                ? Income.find()
                    .sort({ date: -1 })
                    .lean()
                : [],

            Employee.find({ active: true })
                .sort({ name: 1 })
                .lean(),

            Fleet.find({ active: true })
                .sort({ name: 1 })
                .lean(),

            req.user.role === 'admin'
                ? Client.find({ archived: false })
                    .sort({ name: 1 })
                    .lean()
                : [],

            req.user.role === 'admin'
                ? Automation.find()
                    .sort({ name: 1 })
                    .lean()
                : []
        ]);

        res.json({
            tasks,
            expenses,
            incomes,
            employees: employees.map(publicEmployee),
            fleet,
            clients,
            automations
        });
    })
);

/*
|--------------------------------------------------------------------------
| ZLECENIA I KALENDARZ
|--------------------------------------------------------------------------
*/

app.get(
    '/api/tasks',
    asyncRoute(async (req, res) => {
        const filter = {};

        if (
            req.query.status &&
            req.query.status !== 'all'
        ) {
            filter.status = req.query.status;
        }

        if (req.query.from || req.query.to) {
            filter.dateStart = {};

            if (req.query.from) {
                filter.dateStart.$gte = new Date(req.query.from);
            }

            if (req.query.to) {
                filter.dateStart.$lt = new Date(req.query.to);
            }
        }

        if (req.query.q) {
            const query = String(req.query.q)
                .slice(0, 100)
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            filter.$or = [
                'name',
                'clientName',
                'clientPhone',
                'address',
                'number'
            ].map(field => ({
                [field]: {
                    $regex: query,
                    $options: 'i'
                }
            }));
        }

        const tasks = await Task.find(filter)
            .sort({
                dateStart: 1,
                createdAt: -1
            })
            .limit(500)
            .lean();

        res.json({
            tasks
        });
    })
);

app.get(
    '/api/calendar',
    asyncRoute(async (req, res) => {
        const from = req.query.from
            ? new Date(req.query.from)
            : startOfMonth(new Date());

        const to = req.query.to
            ? new Date(req.query.to)
            : startOfNextMonth(from);

        const filter = {
            dateStart: {
                $gte: from,
                $lt: to
            },

            status: {
                $ne: 'cancelled'
            }
        };

        const tasks = await Task.find(filter)
            .sort({ dateStart: 1 })
            .lean();

        res.json({
            from,
            to,
            tasks
        });
    })
);

app.post(
    '/api/tasks',
    requireAdmin,
    asyncRoute(async (req, res) => {
        const task = await Task.create(
            taskPayload(req.body)
        );

        await recordActivity(
            'task_created',
            `Dodano zlecenie ${task.number}: ${task.name}`,
            'Task',
            task._id,
            req.user.name
        );

        res.status(201).json({
            success: true,
            task
        });
    })
);

app.put(
    '/api/tasks/:id',
    requireAdmin,
    validateId,
    asyncRoute(async (req, res) => {
        const task = await Task.findByIdAndUpdate(
            req.params.id,
            taskPayload(req.body, true),
            {
                new: true,
                runValidators: true
            }
        );

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Nie znaleziono zlecenia'
            });
        }

        await recordActivity(
            'task_updated',
            `Zaktualizowano zlecenie ${task.number}`,
            'Task',
            task._id,
            req.user.name
        );

        res.json({
            success: true,
            task
        });
    })
);

app.patch(
    '/api/tasks/:id/status',
    validateId,
    asyncRoute(async (req, res) => {
        const allowedStatuses = [
            'new',
            'quoted',
            'planned',
            'progress',
            'completed',
            'cancelled'
        ];

        if (!allowedStatuses.includes(req.body.status)) {
            return res.status(400).json({
                success: false,
                message: 'Nieprawidłowy status'
            });
        }

        const update = {
            status: req.body.status,
            completed: req.body.status === 'completed'
        };

        if (req.body.status === 'completed') {
            update.completedAt = new Date();

            if (req.body.finalPrice !== undefined) {
                update.finalPrice = Number(req.body.finalPrice);
            }
        } else {
            update.completedAt = null;
        }

        const task = await Task.findByIdAndUpdate(
            req.params.id,
            update,
            {
                new: true,
                runValidators: true
            }
        );

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Nie znaleziono zlecenia'
            });
        }

        await recordActivity(
            'task_status',
            `Zmieniono status ${task.number} na ${task.status}`,
            'Task',
            task._id,
            req.user.name
        );

        res.json({
            success: true,
            task
        });
    })
);

app.post(
    '/api/tasks/:id/complete',
    validateId,
    asyncRoute(async (req, res) => {
        const update = {
            status: 'completed',
            completed: true,
            completedAt: new Date()
        };

        if (req.body.finalPrice !== undefined) {
            update.finalPrice = Number(req.body.finalPrice);
        }

        const task = await Task.findByIdAndUpdate(
            req.params.id,
            update,
            {
                new: true,
                runValidators: true
            }
        );

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Nie znaleziono zlecenia'
            });
        }

        await recordActivity(
            'task_completed',
            `Zakończono zlecenie ${task.number}`,
            'Task',
            task._id,
            req.user.name
        );

        res.json({
            success: true,
            task
        });
    })
);

app.delete(
    '/api/tasks/:id',
    requireAdmin,
    validateId,
    asyncRoute(async (req, res) => {
        const task = await Task.findByIdAndDelete(
            req.params.id
        );

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Nie znaleziono zlecenia'
            });
        }

        await recordActivity(
            'task_deleted',
            `Usunięto zlecenie ${task.number}`,
            'Task',
            task._id,
            req.user.name
        );

        res.json({
            success: true
        });
    })
);

/*
|--------------------------------------------------------------------------
| KLIENCI CRM
|--------------------------------------------------------------------------
*/

app.get(
    '/api/clients',
    requireAdmin,
    asyncRoute(async (req, res) => {
        const clients = await Client.find({
            archived: req.query.archived === 'true'
        })
            .sort({ name: 1 })
            .lean();

        const ids = clients.map(client => client._id);

        const totals = await Task.aggregate([
            {
                $match: {
                    client: {
                        $in: ids
                    },

                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: '$client',

                    orders: {
                        $sum: 1
                    },

                    value: {
                        $sum: {
                            $ifNull: ['$finalPrice', '$price']
                        }
                    },

                    lastOrderAt: {
                        $max: '$completedAt'
                    }
                }
            }
        ]);

        const statsMap = new Map(
            totals.map(item => [
                String(item._id),
                item
            ])
        );

        res.json({
            clients: clients.map(client => ({
                ...client,

                stats:
                    statsMap.get(String(client._id)) || {
                        orders: 0,
                        value: 0,
                        lastOrderAt: null
                    }
            }))
        });
    })
);

app.post(
    '/api/clients',
    requireAdmin,
    asyncRoute(async (req, res) => {
        const client = await Client.create(req.body);

        await recordActivity(
            'client_created',
            `Dodano klienta ${client.name}`,
            'Client',
            client._id,
            req.user.name
        );

        res.status(201).json({
            success: true,
            client
        });
    })
);

app.put(
    '/api/clients/:id',
    requireAdmin,
    validateId,
    asyncRoute(async (req, res) => {
        const client = await Client.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Nie znaleziono klienta'
            });
        }

        res.json({
            success: true,
            client
        });
    })
);

app.delete(
    '/api/clients/:id',
    requireAdmin,
    validateId,
    asyncRoute(async (req, res) => {
        const client = await Client.findByIdAndUpdate(
            req.params.id,
            {
                archived: true
            },
            {
                new: true
            }
        );

        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'Nie znaleziono klienta'
            });
        }

        res.json({
            success: true
        });
    })
);

/*
|--------------------------------------------------------------------------
| FINANSE
|--------------------------------------------------------------------------
*/

app.get(
    '/api/finances',
    requireAdmin,
    asyncRoute(async (req, res) => {
        const from = req.query.from
            ? new Date(req.query.from)
            : startOfMonth(new Date());

        const to = req.query.to
            ? new Date(req.query.to)
            : startOfNextMonth(from);

        const [expenses, incomes] = await Promise.all([
            Expense.find({
                date: {
                    $gte: from,
                    $lt: to
                }
            })
                .sort({ date: -1 })
                .lean(),

            Income.find({
                date: {
                    $gte: from,
                    $lt: to
                }
            })
                .sort({ date: -1 })
                .lean()
        ]);

        res.json({
            from,
            to,
            expenses,
            incomes
        });
    })
);

app.post(
    '/api/finances',
    requireAdmin,
    asyncRoute(async (req, res) => {
        const Model =
            req.body.kind === 'income'
                ? Income
                : Expense;

        const entry = await Model.create({
            ...req.body,

            price: Number(
                req.body.price ?? req.body.amount
            ),

            date: req.body.date || new Date()
        });

        await recordActivity(
            'finance_created',
            `Dodano ${
                req.body.kind === 'income'
                    ? 'przychód'
                    : 'koszt'
            }: ${entry.price} zł`,
            Model.modelName,
            entry._id,
            req.user.name
        );

        res.status(201).json({
            success: true,
            entry
        });
    })
);

app.post(
    '/api/expenses',
    requireAdmin,
    asyncRoute(async (req, res) => {
        const expense = await Expense.create({
            ...req.body,
            date: req.body.date || new Date()
        });

        res.status(201).json({
            success: true,
            expense
        });
    })
);

app.put(
    '/api/expenses/:id',
    requireAdmin,
    validateId,
    asyncRoute(async (req, res) => {
        const expense = await Expense.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        res.json({
            success: true,
            expense
        });
    })
);

app.delete(
    '/api/expenses/:id',
    requireAdmin,
    validateId,
    asyncRoute(async (req, res) => {
        await Expense.findByIdAndDelete(req.params.id);

        res.json({
            success: true
        });
    })
);

app.post(
    '/api/incomes',
    requireAdmin,
    asyncRoute(async (req, res) => {
        const income = await Income.create({
            ...req.body,
            date: req.body.date || new Date()
        });

        res.status(201).json({
            success: true,
            income
        });
    })
);

app.put(
    '/api/incomes/:id',
    requireAdmin,
    validateId,
    asyncRoute(async (req, res) => {
        const income = await Income.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        res.json({
            success: true,
            income
        });
    })
);

app.delete(
    '/api/incomes/:id',
    requireAdmin,
    validateId,
    asyncRoute(async (req, res) => {
        await Income.findByIdAndDelete(req.params.id);

        res.json({
            success: true
        });
    })
);

/*
|--------------------------------------------------------------------------
| PRACOWNICY
|--------------------------------------------------------------------------
*/

app.get(
    '/api/employees',
    requireAdmin,
    asyncRoute(async (req, res) => {
        const employees = await Employee.find()
            .sort({ name: 1 });

        res.json({
            employees: employees.map(publicEmployee)
        });
    })
);

app.post(
    '/api/employees',
    requireAdmin,
    asyncRoute(async (req, res) => {
        const pin = String(req.body.pin || '');

        if (pin && !/^\d{4,8}$/.test(pin)) {
            return res.status(400).json({
                success: false,
                message: 'PIN musi mieć od 4 do 8 cyfr'
            });
        }

        const employee = await Employee.create({
            ...req.body,
            pin: undefined,

            pinHash: pin
                ? await bcrypt.hash(pin, 12)
                : undefined
        });

        res.status(201).json({
            success: true,
            employee: publicEmployee(employee)
        });
    })
);

app.put(
    '/api/employees/:id',
    requireAdmin,
    validateId,
    asyncRoute(async (req, res) => {
        const update = {
            ...req.body
        };

        delete update.pin;
        delete update.pinHash;

        if (req.body.pin) {
            update.pinHash = await bcrypt.hash(
                String(req.body.pin),
                12
            );
        }

        const employee = await Employee.findByIdAndUpdate(
            req.params.id,
            update,
            {
                new: true,
                runValidators: true
            }
        );

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Nie znaleziono pracownika'
            });
        }

        res.json({
            success: true,
            employee: publicEmployee(employee)
        });
    })
);

app.delete(
    '/api/employees/:id',
    requireAdmin,
    validateId,
    asyncRoute(async (req, res) => {
        await Employee.findByIdAndUpdate(
            req.params.id,
            {
                active: false
            }
        );

        res.json({
            success: true
        });
    })
);

/*
|--------------------------------------------------------------------------
| FLOTA
|--------------------------------------------------------------------------
*/

app.get(
    '/api/fleet',
    asyncRoute(async (req, res) => {
        const fleet = await Fleet.find({
            active: true
        })
            .sort({ name: 1 })
            .lean();

        res.json({
            fleet
        });
    })
);

app.post(
    '/api/fleet',
    requireAdmin,
    asyncRoute(async (req, res) => {
        const fleet = await Fleet.create(req.body);

        res.status(201).json({
            success: true,
            fleet
        });
    })
);

app.put(
    '/api/fleet/:id',
    requireAdmin,
    validateId,
    asyncRoute(async (req, res) => {
        const fleet = await Fleet.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        if (!fleet) {
            return res.status(404).json({
                success: false,
                message: 'Nie znaleziono pojazdu'
            });
        }

        res.json({
            success: true,
            fleet
        });
    })
);

app.delete(
    '/api/fleet/:id',
    requireAdmin,
    validateId,
    asyncRoute(async (req, res) => {
        await Fleet.findByIdAndUpdate(
            req.params.id,
            {
                active: false
            }
        );

        res.json({
            success: true
        });
    })
);

/*
|--------------------------------------------------------------------------
| AUTOMATYZACJE
|--------------------------------------------------------------------------
*/

const defaultAutomations = [
    {
        key: 'sms_reminder',
        name: 'SMS przed zleceniem',
        description: 'Potwierdzenie 24 godziny przed terminem',
        enabled: true,
        config: {
            hoursBefore: 24
        }
    },
    {
        key: 'team_daily_plan',
        name: 'Plan dnia dla ekipy',
        description: 'Plan na kolejny dzień o 18:00',
        enabled: true,
        config: {
            sendAt: '18:00'
        }
    },
    {
        key: 'invoice_draft',
        name: 'Szkic faktury po realizacji',
        description: 'Tworzy szkic dokumentu po zakończeniu',
        enabled: true,
        config: {}
    },
    {
        key: 'google_review',
        name: 'Prośba o opinię Google',
        description: 'Wiadomość 2 godziny po zleceniu',
        enabled: false,
        config: {
            hoursAfter: 2
        }
    }
];

app.get(
    '/api/automations',
    requireAdmin,
    asyncRoute(async (req, res) => {
        const count = await Automation.countDocuments();

        if (count === 0) {
            await Automation.insertMany(
                defaultAutomations,
                {
                    ordered: false
                }
            ).catch(() => null);
        }

        const automations = await Automation.find()
            .sort({ name: 1 })
            .lean();

        res.json({
            automations
        });
    })
);

app.post(
    '/api/automations',
    requireAdmin,
    asyncRoute(async (req, res) => {
        const automation = await Automation.create(req.body);

        res.status(201).json({
            success: true,
            automation
        });
    })
);

app.put(
    '/api/automations/:id',
    requireAdmin,
    validateId,
    asyncRoute(async (req, res) => {
        const automation = await Automation.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        if (!automation) {
            return res.status(404).json({
                success: false,
                message: 'Nie znaleziono automatyzacji'
            });
        }

        res.json({
            success: true,
            automation
        });
    })
);

app.patch(
    '/api/automations/:id',
    requireAdmin,
    validateId,
    asyncRoute(async (req, res) => {
        const allowed = {};

        for (const key of ['enabled', 'config']) {
            if (req.body[key] !== undefined) {
                allowed[key] = req.body[key];
            }
        }

        const automation = await Automation.findByIdAndUpdate(
            req.params.id,
            allowed,
            {
                new: true,
                runValidators: true
            }
        );

        if (!automation) {
            return res.status(404).json({
                success: false,
                message: 'Nie znaleziono automatyzacji'
            });
        }

        res.json({
            success: true,
            automation
        });
    })
);

app.post(
    '/api/automations/:id/run',
    requireAdmin,
    validateId,
    asyncRoute(async (req, res) => {
        const automation = await Automation.findByIdAndUpdate(
            req.params.id,
            {
                $inc: {
                    runCount: 1
                },

                lastRunAt: new Date()
            },
            {
                new: true
            }
        );

        if (!automation) {
            return res.status(404).json({
                success: false,
                message: 'Nie znaleziono automatyzacji'
            });
        }

        // Miejsce na podpięcie właściwego wykonania automatyzacji.
        res.json({
            success: true,
            message: 'Proces został uruchomiony pomyślnie',
            automation
        });
    })
);

/*
|--------------------------------------------------------------------------
| PLIKI HTML
|--------------------------------------------------------------------------
*/

const publicDir = path.join(__dirname, 'Public');

app.get(['/oproznianie.html', '/oproznianie'], (req, res) => res.redirect(301, '/oproznianie-utylizacja.html'));
app.get(['/polityka-prywatności.html'], (req, res) => res.redirect(301, '/polityka-prywatnosci.html'));
app.use(['/revmi', '/revmi.html', '/api'], (req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });

app.use(
    express.static(publicDir, {
        extensions: ['html'],
        maxAge: IS_PRODUCTION ? '1h' : 0,

        setHeaders: (res, filePath) => {
            if (path.basename(filePath) === 'revmi.html') {
                res.setHeader('Cache-Control', 'no-store');
            }
        }
    })
);

app.get('/', (req, res) => {
    res.sendFile(
        path.join(publicDir, 'index.html')
    );
});

app.get('/revmi', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    res.sendFile(
        path.join(publicDir, 'revmi.html')
    );
});

app.get('/przeprowadzki', (req, res) => {
    res.sendFile(
        path.join(publicDir, 'przeprowadzki.html')
    );
});

app.get('/przewozy-osob', (req, res) => {
    res.sendFile(
        path.join(publicDir, 'przewozy-osob.html')
    );
});

app.get('/oproznianie-utylizacja', (req, res) => {
    res.sendFile(
        path.join(
            publicDir,
            'oproznianie-utylizacja.html'
        )
    );
});

app.get('/transport', (req, res) => {
    res.sendFile(
        path.join(publicDir, 'transport.html')
    );
});

app.get(
    [
        '/polityka-prywatności',
        '/polityka-prywatnosci'
    ],
    (req, res) => {
        res.sendFile(
            path.join(
                publicDir,
                'polityka-prywatnosci.html'
            )
        );
    }
);

/*
|--------------------------------------------------------------------------
| OBSŁUGA BŁĘDÓW
|--------------------------------------------------------------------------
*/

app.use('/api', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Nie znaleziono endpointu API'
    });
});

app.use((error, req, res, next) => {
    console.error(error);

    const status =
        error.status ||
        (
            error.name === 'ValidationError' ||
            error.name === 'CastError'
                ? 400
                : 500
        );

    res.status(status).json({
        success: false,

        message:
            status === 500
                ? 'Wewnętrzny błąd serwera'
                : status === 413 ? 'Zdjęcia są za duże. Dodaj maksymalnie 3 pomniejszone zdjęcia.' : error.message
    });
});

/*
|--------------------------------------------------------------------------
| URUCHOMIENIE I MIGRACJA STARSZYCH DANYCH
|--------------------------------------------------------------------------
*/

async function start() {
    await mongoose.connect(MONGO_URL);

    console.log('Połączono z MongoDB');

    await Promise.all([
        Expense.updateMany(
            {
                date: {
                    $exists: false
                }
            },
            [
                {
                    $set: {
                        date: '$createdAt'
                    }
                }
            ]
        ),

        Income.updateMany(
            {
                date: {
                    $exists: false
                }
            },
            [
                {
                    $set: {
                        date: '$createdAt'
                    }
                }
            ]
        ),

        Task.updateMany(
            {
                dateStart: {
                    $type: 'string'
                }
            },
            [
                {
                    $set: {
                        dateStart: {
                            $convert: {
                                input: '$dateStart',
                                to: 'date',
                                onError: '$createdAt',
                                onNull: '$createdAt'
                            }
                        }
                    }
                }
            ]
        ),

        Task.updateMany(
            {
                dateEnd: {
                    $type: 'string'
                }
            },
            [
                {
                    $set: {
                        dateEnd: {
                            $convert: {
                                input: '$dateEnd',
                                to: 'date',
                                onError: null,
                                onNull: null
                            }
                        }
                    }
                }
            ]
        ),

        Task.updateMany(
            {
                completed: true,
                completedAt: null
            },
            [
                {
                    $set: {
                        completedAt: '$createdAt',
                        status: 'completed'
                    }
                }
            ]
        ),

        Task.updateMany(
            {
                completed: {
                    $ne: true
                },

                status: {
                    $exists: false
                }
            },
            {
                $set: {
                    status: 'planned'
                }
            }
        )
    ]);

    app.listen(PORT, () => {
        console.log(
            `RevMi działa na porcie ${PORT}${
                AUTH_DISABLED
                    ? ' (logowanie wyłączone)'
                    : ''
            }`
        );
    });
}

if (require.main === module) start().catch(error => {
    console.error(
        'Nie udało się uruchomić RevMi:',
        error
    );

    process.exit(1);
});

async function shutdown(signal) {
    console.log(
        `${signal}: zamykanie serwera…`
    );

    await mongoose.disconnect();
    process.exit(0);
}

process.on('SIGTERM', () => {
    shutdown('SIGTERM');
});

process.on('SIGINT', () => {
    shutdown('SIGINT');
});
module.exports = { app, Task, sessionStore };
