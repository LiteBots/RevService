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

const sharp = require('sharp');
const { createHash } = require('crypto');
function bad(message){const e=new Error(message);e.status=400;throw e}
function validateQuote(input){
 if(!input||typeof input!=='object'||Array.isArray(input))bad('Nieprawidłowe zgłoszenie.');
 const limits={service:80,route:300,date:200,description:3500,clientName:140,phone:40,requestId:80};
 for(const [key,max] of Object.entries(limits))if(typeof input[key]!=='string'||input[key].length>max)bad('Nieprawidłowe pole: '+key);
 if(input.website)bad('Nie udało się przyjąć zgłoszenia. Skontaktuj się telefonicznie.');
 const raw=input.phone.trim();let digits=raw.replace(/\D/g,'');if(raw.startsWith('00'))digits=digits.slice(2);
 if(!/^[+\d\s()-]+$/.test(raw)||digits.length<7||digits.length>15)bad('Wpisz prawidłowy numer telefonu. Dla numerów zagranicznych dodaj prefiks.');
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId)||!input.service.trim())bad('Sprawdź usługę i spróbuj ponownie.');
 const photos=input.photos===undefined?[]:input.photos;
 if(!Array.isArray(photos)||photos.length>3)bad('Maksymalnie 3 zdjęcia.');
 for(const photo of photos)if(!photo||typeof photo.data!=='string'||photo.data.length>1400000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo.data))bad('Nieprawidłowy plik zdjęcia.');
 const details=input.details===undefined?{}:input.details;
 if(!details||typeof details!=='object'||Array.isArray(details)||Object.keys(details).length>20)bad('Nieprawidłowe szczegóły zlecenia.');
 const cleanDetails={};for(const [k,v] of Object.entries(details)){if(k.length>80||/[.$]/.test(k)||['__proto__','constructor','prototype'].includes(k)||typeof v!=='string'||v.length>200)bad('Nieprawidłowe szczegóły zlecenia.');cleanDetails[k]=v.trim()}
 return {...Object.fromEntries(Object.keys(limits).map(k=>[k,input[k].trim()])),phone:(raw.startsWith('+')||raw.startsWith('00')?'+':'')+digits,details:cleanDetails,photos};
}
async function preparePhotos(photos){const output=[];for(const p of photos){try{const bytes=Buffer.from(p.data.split(',')[1],'base64');const img=sharp(bytes,{limitInputPixels:24000000,failOn:'warning'});const meta=await img.metadata();if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)bad('Obsługiwane są statyczne zdjęcia JPG, PNG i WebP.');const data=await img.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:80}).toBuffer();output.push({data,contentType:'image/jpeg'})}catch(e){if(e.status)throw e;bad('Nie można odczytać zdjęcia. Wybierz inny plik JPG, PNG lub WebP.')}}return output}
function fingerprint(input){return createHash('sha256').update(JSON.stringify([input.service,input.route,input.date,input.description,input.clientName,input.phone,input.details,input.photos.map(p=>createHash('sha256').update(p.data).digest('hex'))])).digest('hex')}



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
        offerScope: {type:String, default:'', maxlength:2500},
        offerMessage: {type:String, default:'', maxlength:5000},
        offerDate: Date, acceptedAt: Date,
        workflowEvents: {type:[{requestId:String,at:Date,from:String,to:String,cost:{type:Number,min:0},costDescription:String,costCategory:String,vehicle:{type:mongoose.Schema.Types.ObjectId,ref:'Fleet'},actor:String}], default:[]},
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
        phoneNormalized: {type:String,unique:true,sparse:true},
        services: {type:[String],default:[]},
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
    requestId: {type:String,unique:true,sparse:true},
    employee: {type:mongoose.Schema.Types.ObjectId,ref:'Employee',default:null},
    hours: {type:Number,min:0,default:0}, rateSnapshot:{type:Number,min:0,default:0},
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
    requestId: {type:String,unique:true,sparse:true},
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
        monthlySalary:{type:Number,min:0,default:0},
        employmentType:{type:String,default:'',maxlength:80},
        startDate:Date,notes:{type:String,default:'',maxlength:2000},
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

const WF_TRANSITIONS={new:['quoted','cancelled'],quoted:['quoted','planned','cancelled'],planned:['progress','cancelled'],progress:['planned','completed','cancelled'],completed:[],cancelled:[]};
function wfError(message,status=400){const e=new Error(message);e.status=status;throw e;}
function wfMoney(value,label='Kwota'){if(value===''||value===null||value===undefined)wfError(label+' jest wymagana (wpisz 0, jeśli brak kosztów).');const n=Number(String(value).replace(',','.'));if(!Number.isFinite(n)||n<0||n>100000000)wfError(label+' musi być liczbą od 0 do 100 000 000.');return Math.round(n*100)/100;}
function wfText(value,max=1000){if(value===undefined||value===null)return '';if(typeof value!=='string'||value.length>max)wfError('Nieprawidłowa długość tekstu.');return value.trim();}
function wfMonth(date){if(!date)return '';const d=new Date(date);if(Number.isNaN(d.getTime()))return '';return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit'}).format(d).slice(0,7);}
function wfId(value){return value?String(value._id||value):'';}
function wfDate(value,required=false){if(!value){if(required)wfError('Podaj datę.');return null;}const d=new Date(value);if(Number.isNaN(d.getTime()))wfError('Nieprawidłowa data.');return d;}
function wfPhone(value){let x=String(value||'').replace(/\D/g,'');if(x.startsWith('00'))x=x.slice(2);if(x.length===9)x='48'+x;return x;}
function wfLedger(tasks,expenses,incomes,month){
 const costs=expenses.map(e=>({id:wfId(e),date:e.date||e.createdAt,amount:e.price,description:e.desc,category:e.category,task:wfId(e.task),employee:wfId(e.employee),vehicle:wfId(e.vehicle),hours:e.hours||0,origin:'expense'}));
 for(const t of tasks)for(const e of t.workflowEvents||[])if(e.cost>0)costs.push({id:wfId(t)+':'+e.requestId,date:e.at,amount:e.cost,description:e.costDescription,category:e.costCategory||'Koszt zlecenia',task:wfId(t),employee:'',vehicle:wfId(e.vehicle||t.vehicle),origin:'status'});
 const revenue=tasks.filter(t=>t.status==='completed'||t.completed).map(t=>({id:'task:'+wfId(t),date:t.completedAt||t.updatedAt||t.dateStart,amount:t.finalPrice??t.price??0,description:t.name,category:'Zrealizowane zlecenie',task:wfId(t),client:wfId(t.client),paymentStatus:t.paymentStatus||'unpaid',origin:'task'}));
 for(const i of incomes)revenue.push({id:wfId(i),date:i.date||i.createdAt,amount:i.price,description:i.desc,category:i.category,task:wfId(i.task),client:wfId(i.client),origin:'manual'});
 const sum=arr=>Math.round(arr.reduce((n,x)=>n+Math.round(Number(x.amount||0)*100),0))/100;
 const allIncome=sum(revenue),allCost=sum(costs),income=sum(revenue.filter(x=>wfMonth(x.date)===month)),cost=sum(costs.filter(x=>wfMonth(x.date)===month));
 return {costs:costs.sort((a,b)=>new Date(b.date)-new Date(a.date)),revenue:revenue.sort((a,b)=>new Date(b.date)-new Date(a.date)),totals:{income,cost,profit:Math.round((income-cost)*100)/100,allIncome,allCost,allProfit:Math.round((allIncome-allCost)*100)/100,completed:tasks.filter(t=>t.status==='completed'&&wfMonth(t.completedAt||t.updatedAt||t.dateStart)===month).length,newQuotes:tasks.filter(t=>wfMonth(t.createdAt)===month&&t.source==='Formularz index').length}};
}

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
    try { await wfSyncClient(task); } catch (error) { console.error('Synchronizacja klienta zostanie ponowiona w panelu.'); }
    res.status(201).json({ success: true, number: task.number });
    void flushQuoteNotifications();
}));

/*
|--------------------------------------------------------------------------
| OD TEGO MIEJSCA API WYMAGA LOGOWANIA
|--------------------------------------------------------------------------
*/

app.use('/api', requireAuth);

/* RevSerwis Business Panel — isolated collections; existing RevMi APIs retained. */
const business = (() => {
    const S = mongoose.Schema;
    const opts = {timestamps:true, optimisticConcurrency:true};
    const Contact = mongoose.model('BusinessContact', new S({
        company:{type:String,required:true},name:String,email:String,phone:String,industry:String,city:String,
        list:String,stage:{type:String,default:'new'},owner:String,source:String,notes:String,
        emailPermission:{type:Boolean,default:false},permissionNote:String,blocked:{type:Boolean,default:false},
        history:{type:[{at:Date,channel:String,note:String,actor:String}],default:[]}
    },opts));
    Contact.schema.index({email:1},{unique:true,partialFilterExpression:{email:{$type:'string',$gt:''}}});
    const List = mongoose.model('BusinessList',new S({name:{type:String,required:true,unique:true},description:String},opts));
    const Action = mongoose.model('BusinessAction',new S({title:String,contact:String,due:Date,channel:String,owner:String,status:String,notes:String},opts));
    const Deal = mongoose.model('BusinessDeal',new S({title:String,contact:String,value:Number,stage:String,deadline:Date,notes:String},opts));
    const Contract = mongoose.model('BusinessContract',new S({title:String,contact:String,number:String,start:Date,end:Date,status:String,value:Number,noticeDays:Number,notes:String,url:String},opts));
    const Invoice = mongoose.model('BusinessInvoice',new S({number:{type:String,unique:true,required:true},contact:String,company:String,nip:String,address:String,issue:Date,due:Date,kind:String,net:Number,vat:Number,gross:Number,paid:Number,description:String,url:String},opts));
    const Template = mongoose.model('BusinessTemplate',new S({name:String,subject:String,body:String},opts));
    const Campaign = mongoose.model('BusinessCampaign',new S({name:String,subject:String,body:String,contactIds:[String],status:{type:String,default:'draft'},queuedAt:Date,finishedAt:Date,actor:String,recipients:{type:[{contact:String,email:String,name:String,company:String,status:String,at:Date,error:String,messageId:String}],default:[]}},opts));
    const Audit = mongoose.model('BusinessAudit',new S({actor:String,action:String,entity:String,entityId:String}, {timestamps:true}));
    const Settings = mongoose.model('BusinessSettings',new S({key:{type:String,unique:true},company:String,nip:String,address:String,email:String,phone:String,iban:String,signature:String},opts));
    const models={contacts:Contact,lists:List,actions:Action,deals:Deal,contracts:Contract,invoices:Invoice,templates:Template,campaigns:Campaign};
    function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
    const str=(v,n=500)=>{if(v===undefined||v===null)return '';if(typeof v!=='string'||v.length>n)fail('Nieprawidłowa długość lub typ pola.');return v.trim();};
    function num(v,max=100000000){if(v===''||v===undefined||v===null)return 0;const x=Number(v);if(!Number.isFinite(x)||x<0||x>max)fail('Nieprawidłowa kwota lub liczba.');return Math.round(x*100)/100;}
    function date(v){if(!v)return null;const x=new Date(v);if(isNaN(x.getTime()))fail('Nieprawidłowa data.');return x;}
    function choice(v,values){if(!values.includes(v))fail('Nieprawidłowy status.');return v;}
    function email(v){const x=str(v,200).toLowerCase();if(x&&!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(x))fail('Nieprawidłowy adres e-mail.');return x;}
    function url(v){const x=str(v,1000);if(x){try{if(new URL(x).protocol!=='https:')fail('Link musi zaczynać się od https://');}catch{fail('Nieprawidłowy link HTTPS.');}}return x;}
    async function reference(v){const x=str(v,24);if(x&&(!isObjectId(x)||!await Contact.exists({_id:x})))fail('Nie znaleziono kontaktu.');return x;}
    async function payload(type,b){
        if(!b||typeof b!=='object'||Array.isArray(b))fail('Nieprawidłowe dane.');
        let d={};
        if(type==='contacts'){
            for(const k of ['company','name','phone','industry','city','list','owner','source','permissionNote'])d[k]=str(b[k],300);
            if(!d.company)fail('Podaj nazwę firmy.');d.email=email(b.email);d.notes=str(b.notes,12000);
            d.stage=choice(b.stage,['new','contacted','interested','partner','lost']);
            d.emailPermission=b.emailPermission===true;d.blocked=b.blocked===true;
            if(d.emailPermission&&!d.permissionNote)fail('Opisz podstawę i źródło zgody na kontakt e-mail.');
            if(d.list&&!await List.exists({_id:d.list}).catch(()=>null))fail('Nie znaleziono listy.');
        }else if(type==='lists'){d={name:str(b.name,120),description:str(b.description,1000)};if(!d.name)fail('Podaj nazwę listy.');}
        else if(type==='templates'){d={name:str(b.name,160),subject:str(b.subject,200),body:str(b.body,16000)};if(!d.name||!d.subject||!d.body)fail('Uzupełnij nazwę, temat i treść.');}
        else if(type==='campaigns'){
            d={name:str(b.name,160),subject:str(b.subject,200),body:str(b.body,16000)};
            if(!d.name||!d.subject||!d.body||/[\r\n]/.test(d.subject))fail('Uzupełnij nazwę, poprawny temat i treść.');
            if(!Array.isArray(b.contactIds)||b.contactIds.length>500)fail('Wybierz maksymalnie 500 kontaktów.');
            d.contactIds=[...new Set(b.contactIds.map(x=>str(x,24)))];if(d.contactIds.some(x=>!isObjectId(x)))fail('Nieprawidłowy kontakt.');
            if(await Contact.countDocuments({_id:{$in:d.contactIds}})!==d.contactIds.length)fail('Nie znaleziono wszystkich kontaktów.');
        }else{
            d.contact=await reference(b.contact);d.notes=str(b.notes,12000);
            if(type!=='invoices'){d.title=str(b.title,200);if(!d.title)fail('Podaj nazwę.');}
            if(type==='actions'){
                d.due=date(b.due);if(!d.due)fail('Podaj termin działania.');d.channel=choice(b.channel,['email','phone','meeting','other']);d.owner=str(b.owner,160);d.status=choice(b.status,['planned','done','cancelled']);
            }
            if(type==='deals'){d.value=num(b.value);d.stage=choice(b.stage,['lead','offer','negotiation','won','lost']);d.deadline=date(b.deadline);}
            if(type==='contracts'){
                d.number=str(b.number,120);d.start=date(b.start);d.end=date(b.end);if(d.start&&d.end&&d.end<d.start)fail('Koniec umowy musi przypadać po początku.');
                d.value=num(b.value);d.noticeDays=num(b.noticeDays,3650);d.status=choice(b.status,['draft','negotiation','signed','ended']);d.url=url(b.url);
            }
            if(type==='invoices'){
                d.number=str(b.number,120);d.company=str(b.company,300);d.nip=str(b.nip,40);d.address=str(b.address,500);d.issue=date(b.issue);d.due=date(b.due);
                if(!d.number||!d.company||!d.issue||!d.due)fail('Podaj numer, kontrahenta i daty.');
                if(d.due<d.issue)fail('Termin płatności nie może poprzedzać daty dokumentu.');
                d.kind=choice(b.kind,['sale','purchase']);d.net=num(b.net);d.vat=num(b.vat);d.gross=Math.round((d.net+d.vat)*100)/100;d.paid=num(b.paid);if(d.paid>d.gross)fail('Zapłata przekracza kwotę brutto.');d.description=str(b.description,6000);d.url=url(b.url);delete d.notes;
            }
        }
        return d;
    }
    const log=(req,action,entity,entityId)=>Audit.create({actor:req.user.name||'Administrator',action,entity,entityId:String(entityId||'')}).catch(e=>console.error('Business audit:',e.message));
    const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){if(e.code===11000)return res.status(409).json({message:'Taki e-mail, numer dokumentu lub nazwa listy już istnieje.'});if(e.name==='VersionError')return res.status(409).json({message:'Wpis zmienił się w innym oknie. Odśwież panel.'});if(e.name==='CastError'||e.name==='ValidationError')return res.status(400).json({message:'Sprawdź dane formularza.'});next(e);}};
    const router=express.Router();
    router.use(requireAdmin,(req,res,next)=>{
        // Never expose business data through the legacy demo bypass.
        if(AUTH_DISABLED||!req.session.user)return res.status(403).json({message:'Panel biznesowy wymaga aktywnego logowania. Ustaw AUTH_DISABLED=false.'});
        if(!['GET','HEAD','OPTIONS'].includes(req.method)){
            const origin=req.get('Origin');const same=`${req.protocol}://${req.get('host')}`;
            if(origin&&origin!==same&&!ALLOWED_ORIGINS.includes(origin))return res.status(403).json({message:'Niedozwolone pochodzenie żądania.'});
            if(req.get('X-Requested-With')!=='RevBusiness')return res.status(403).json({message:'Odśwież panel przed zapisaniem.'});
            if(!req.is('application/json'))return res.status(415).json({message:'Wymagany JSON.'});
        }
        next();
    });
    let mailer=null;
    const smtpReady=()=>Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS&&process.env.SMTP_FROM);
    function transport(){
        if(!smtpReady())fail('Skonfiguruj SMTP_HOST, SMTP_USER, SMTP_PASS i SMTP_FROM na serwerze.',503);
        if(!mailer){let nodemailer;try{nodemailer=require('nodemailer');}catch{fail('Zainstaluj nodemailer na serwerze: npm install nodemailer',503);}
            const port=Number(process.env.SMTP_PORT||465);
            mailer=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,requireTLS:port!==465,
                auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},connectionTimeout:20000,greetingTimeout:20000,socketTimeout:60000,
                disableFileAccess:true,disableUrlAccess:true});
        }return mailer;
    }
    router.get('/data',wrap(async(req,res)=>{
        const result={};await Promise.all(Object.entries(models).map(async([k,M])=>{result[k]=await M.find().sort({createdAt:-1}).lean();}));
        result.audit=await Audit.find().sort({createdAt:-1}).limit(100).lean();result.settings=await Settings.findOne({key:'company'}).lean()||{};
        result.smtp={configured:smtpReady(),from:process.env.SMTP_FROM||'',intervalSeconds:Math.max(5,Number(process.env.BUSINESS_MAIL_INTERVAL_SECONDS)||10)};
        result.serverTime=new Date();res.json(result);
    }));
    router.put('/settings',wrap(async(req,res)=>{const d={};for(const k of ['company','nip','address','phone','iban'])d[k]=str(req.body[k],500);d.email=email(req.body.email);d.signature=str(req.body.signature,2000);const item=await Settings.findOneAndUpdate({key:'company'},{$set:d},{upsert:true,new:true,runValidators:true});await log(req,'Zmieniono ustawienia firmy','settings',item._id);res.json({item});}));
    router.post('/smtp/verify',wrap(async(req,res)=>{await transport().verify();res.json({message:'Połączenie ze skrzynką SMTP działa.'});}));
    router.post('/contacts/:id/history',validateId,wrap(async(req,res)=>{
        const note=str(req.body.note,4000);if(!note)fail('Wpisz notatkę.');const channel=choice(req.body.channel,['email','phone','meeting','other']);
        const c=await Contact.findByIdAndUpdate(req.params.id,{$push:{history:{at:new Date(),channel,note,actor:req.user.name}}},{new:true});if(!c)fail('Brak kontaktu.',404);await log(req,'Dodano notatkę kontaktu','contacts',c._id);res.json({item:c});
    }));
    router.post('/contacts/import',wrap(async(req,res)=>{
        if(!Array.isArray(req.body.rows)||req.body.rows.length>200)fail('Importuj maksymalnie 200 wierszy jednocześnie.');const report=[];
        for(const [i,row] of req.body.rows.entries()){try{const d=await payload('contacts',{...row,stage:'new',emailPermission:false,blocked:false});const c=await Contact.create(d);report.push({row:i+2,status:'created',id:c._id});}catch(e){report.push({row:i+2,status:'error',message:e.code===11000?'E-mail już istnieje.':e.message});}}
        await log(req,'Import kontaktów: '+report.filter(x=>x.status==='created').length,'contacts','');res.json({report});
    }));
    const eligible=c=>Boolean(c&&c.email&&c.emailPermission&&!c.blocked);
    async function recipients(c){const contacts=await Contact.find({_id:{$in:c.contactIds}}).lean();return {eligible:contacts.filter(eligible),excluded:contacts.filter(x=>!eligible(x)),missing:c.contactIds.length-contacts.length};}
    router.get('/campaigns/:id/preview',validateId,wrap(async(req,res)=>{const c=await Campaign.findById(req.params.id);if(!c)fail('Brak kampanii.',404);const r=await recipients(c);res.json({campaign:c,...r});}));
    router.post('/campaigns/:id/send',validateId,wrap(async(req,res)=>{
        transport();const c=await Campaign.findById(req.params.id);if(!c)fail('Brak kampanii.',404);
        if(c.status!=='draft')fail('Ta kampania została już zatwierdzona.',409);
        const r=await recipients(c);if(!r.eligible.length)fail('Brak odbiorców z adresem e-mail i zezwoleniem na kontakt.');
        if(req.body.expectedVersion!==c.__v||req.body.recipientCount!==r.eligible.length)fail('Lista lub treść uległa zmianie. Otwórz podgląd ponownie.',409);
        const saved=await Campaign.findOneAndUpdate({_id:c._id,status:'draft',__v:c.__v},{$set:{status:'queued',queuedAt:new Date(),actor:req.user.name,recipients:r.eligible.map(x=>({contact:String(x._id),email:x.email,name:x.name,company:x.company,status:'pending'}))},$inc:{__v:1}},{new:true});
        if(!saved)fail('Kampania została już zatwierdzona lub zmieniona.',409);
        await log(req,'Zatwierdzono wysyłkę do '+r.eligible.length+' odbiorców','campaigns',c._id);res.json({item:saved});
    }));
    router.post('/campaigns/:id/cancel',validateId,wrap(async(req,res)=>{
        const item=await Campaign.findOneAndUpdate({_id:req.params.id,status:{$in:['queued','sending']}},{$set:{status:'cancelled','recipients.$[r].status':'cancelled',finishedAt:new Date()},$inc:{__v:1}},{new:true,arrayFilters:[{'r.status':'pending'}]});
        if(!item)fail('Kampania nie oczekuje na wysyłkę.',409);await log(req,'Zatrzymano kampanię','campaigns',item._id);res.json({item});
    }));
    router.post('/:type',wrap(async(req,res)=>{const M=models[req.params.type];if(!M)fail('Brak zasobu.',404);const d=await payload(req.params.type,req.body);const item=await M.create(d);await log(req,'Dodano wpis',req.params.type,item._id);res.status(201).json({item});}));
    router.put('/:type/:id',validateId,wrap(async(req,res)=>{
        const M=models[req.params.type];if(!M)fail('Brak zasobu.',404);const item=await M.findById(req.params.id);if(!item)fail('Nie znaleziono wpisu.',404);
        if(req.body.__v!==item.__v)fail('Wpis zmienił się. Odśwież panel przed zapisem.',409);
        if(req.params.type==='campaigns'&&item.status!=='draft')fail('Treść zatwierdzonej kampanii jest zablokowana.',409);
        Object.assign(item,await payload(req.params.type,req.body));await item.save();await log(req,'Zmieniono wpis',req.params.type,item._id);res.json({item});
    }));
    router.delete('/:type/:id',validateId,wrap(async(req,res)=>{
        const type=req.params.type,M=models[type];if(!M)fail('Brak zasobu.',404);
        if(type==='contacts'){
            if(await Promise.all([Action,Deal,Contract,Invoice].map(m=>m.exists({contact:req.params.id}))).then(a=>a.some(Boolean))||await Campaign.exists({contactIds:req.params.id}))fail('Kontakt jest powiązany z dokumentami lub działaniami. Zablokuj go zamiast usuwać.',409);
        }
        if(type==='lists'&&await Contact.exists({list:req.params.id}))fail('Najpierw przenieś kontakty z tej listy.',409);
        const query={_id:req.params.id,__v:req.body.__v};if(type==='campaigns')query.status='draft';
        const item=await M.findOneAndDelete(query);if(!item)fail('Wpis zmieniono lub nie można go usunąć.',409);
        await log(req,'Usunięto wpis',type,item._id);res.json({success:true});
    }));
    app.use('/api/business',router);
    const personalize=(text,c)=>String(text).replace(/\{\{(firma|imie)\}\}/g,(_,k)=>k==='firma'?c.company||'':c.name||'');
    let working=false,timer;
    async function tick(){
        if(working||!smtpReady()||AUTH_DISABLED||mongoose.connection.readyState!==1)return;working=true;
        try{
            // A crash after SMTP acceptance is ambiguous: never resend automatically.
            await Campaign.updateMany({recipients:{$elemMatch:{status:'sending',at:{$lt:new Date(Date.now()-180000)}}}},{$set:{'recipients.$[r].status':'unknown','recipients.$[r].error':'Przerwano wysyłkę. Sprawdź skrzynkę nadawczą przed ponowieniem.'}}, {arrayFilters:[{'r.status':'sending','r.at':{$lt:new Date(Date.now()-180000)}}]});
            const c=await Campaign.findOne({status:{$in:['queued','sending']},'recipients.status':'pending'}).sort({queuedAt:1}).lean();
            if(c){
                const r=c.recipients.find(x=>x.status==='pending');
                const claim=await Campaign.updateOne({_id:c._id,status:{$in:['queued','sending']},recipients:{$elemMatch:{_id:r._id,status:'pending'}}},{$set:{status:'sending','recipients.$.status':'sending','recipients.$.at':new Date()}});
                if(claim.modifiedCount){
                    let update={status:'skipped',error:'Kontakt zablokowany, zmieniony adres lub brak zezwolenia.'};
                    const live=await Contact.findById(r.contact).lean();
                    const stillActive=await Campaign.exists({_id:c._id,status:'sending'});
                    if(stillActive&&eligible(live)&&live.email===r.email){
                        try{const info=await transport().sendMail({from:process.env.SMTP_FROM,to:r.email,subject:personalize(c.subject,r).replace(/[\r\n]/g,' '),text:personalize(c.body,r),disableFileAccess:true,disableUrlAccess:true});
                            update=info.accepted?.length?{status:'sent',messageId:info.messageId,error:''}:{status:'failed',error:'Serwer SMTP odrzucił odbiorcę.'};
                        }catch(e){update={status:['EENVELOPE','EAUTH'].includes(e.code)?'failed':'unknown',error:'Błąd SMTP ('+String(e.code||'SMTP')+'). Sprawdź skrzynkę i konfigurację.'};}
                    }
                    const fields={'recipients.$.at':new Date()};for(const [k,v] of Object.entries(update))fields['recipients.$.'+k]=v;
                    await Campaign.updateOne({_id:c._id,'recipients._id':r._id},{$set:fields});
                }
            }
            await Campaign.updateMany({status:{$in:['queued','sending']},recipients:{$not:{$elemMatch:{status:{$in:['pending','sending']}}}}},{$set:{status:'completed',finishedAt:new Date()}});
        }catch(e){console.error('Business queue:',e.message);}finally{working=false;}
    }
    async function start(){await Promise.all([...Object.values(models),Settings].map(m=>m.init()));timer=setInterval(tick,Math.max(5,Number(process.env.BUSINESS_MAIL_INTERVAL_SECONDS)||10)*1000);timer.unref();}
    function stop(){clearInterval(timer);if(mailer)mailer.close();}
    return {models,Settings,Audit,payload,personalize,eligible,tick,start,stop};
})();

app.use('/api', (req,res,next) => { if(req.user.role !== 'admin' && req.path !== '/v3/data') return res.status(403).json({success:false,message:'Ta operacja wymaga administratora.'}); next(); });
async function wfSyncClient(task){
 const key=wfPhone(task.clientPhone);if(!key)return null;
 let client=task.client?await Client.findById(task.client):null;
 if(!client)client=await Client.findOne({phoneNormalized:key});
 if(!client){const old=await Client.find({phone:{$ne:''}}).select('phone');const match=old.find(c=>wfPhone(c.phone)===key);if(match)client=await Client.findById(match._id);}
 const data={phone:task.clientPhone,address:task.address||task.addressFrom||'',archived:false};if(task.clientName)data.name=task.clientName;
 try{if(client)client=await Client.findByIdAndUpdate(client._id,{$set:{...data,phoneNormalized:key},$addToSet:{services:task.type||'Inne'}},{new:true,runValidators:true});else client=await Client.findOneAndUpdate({phoneNormalized:key},{$set:{...data,name:task.clientName||'Klient '+task.clientPhone},$setOnInsert:{source:'Wycena / zlecenie'},$addToSet:{services:task.type||'Inne'}},{upsert:true,new:true,runValidators:true});}catch(e){if(e.code!==11000)throw e;client=await Client.findOne({phoneNormalized:key});}
 if(client&&!task.client)await Task.updateOne({_id:task._id,client:null},{$set:{client:client._id}});return client;
}
app.get('/api/v3/data',asyncRoute(async(req,res)=>{
 const month=String(req.query.month||wfMonth(new Date()));if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))wfError('Nieprawidłowy miesiąc.');const admin=req.user.role==='admin';
 if(admin){const pending=await Task.find({client:null,clientPhone:{$exists:true,$nin:['',null]}}).limit(100);for(const t of pending)await wfSyncClient(t);}
 const [tasks,employees,fleet,clients,expenses,incomes]=await Promise.all([Task.find({}).sort({createdAt:-1}).lean(),admin?Employee.find().sort({name:1}).lean():[],Fleet.find().sort({name:1}).lean(),admin?Client.find().sort({updatedAt:-1}).lean():[],admin?Expense.find().sort({date:-1}).lean():[],admin?Income.find().sort({date:-1}).lean():[]]);
 if(!admin)return res.json({month,tasks:tasks.filter(t=>['planned','progress'].includes(t.status)).map(t=>({_id:t._id,number:t.number,name:t.name,type:t.type,status:t.status,dateStart:t.dateStart,clientName:t.clientName,clientPhone:t.clientPhone,address:t.address,desc:t.desc,workers:t.workers,vehicle:t.vehicle,car:t.car,quotePhotoCount:0,updatedAt:t.updatedAt})),employees:[],fleet:fleet.map(f=>({_id:f._id,name:f.name,plates:f.plates,status:f.status})),clients:[],ledger:null});
 res.json({month,tasks,employees:employees.map(publicEmployee),fleet,clients,ledger:wfLedger(tasks,expenses,incomes,month)});
}));
app.post('/api/v3/tasks/:id/status',requireAdmin,validateId,asyncRoute(async(req,res)=>{
 const input=req.body||{},requestId=wfText(input.requestId,80);if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId))wfError('Brak identyfikatora operacji.');let current=await Task.findById(req.params.id);if(!current)wfError('Nie znaleziono zlecenia.',404);
 if((current.workflowEvents||[]).some(e=>e.requestId===requestId))return res.json({success:true,task:current});
 if(current.status!==input.expectedStatus)wfError('Status zmienił się w innym oknie. Odśwież dane.',409);
 const status=input.status;if(!(WF_TRANSITIONS[current.status]||[]).includes(status))wfError('Niedozwolona zmiana statusu.');
 const cost=wfMoney(input.cost,'Koszt'),costDescription=wfText(input.costDescription,1000);if(cost>0&&!costDescription)wfError('Opisz koszt, np. paliwo i bramki.');
 const at=new Date(),update={status,completed:status==='completed',updatedAt:at};
 if(status==='quoted'){update.price=wfMoney(input.price,'Cena oferty');update.offerScope=wfText(input.offerScope,2500);update.offerMessage=wfText(input.offerMessage,5000);update.offerDate=at;if(!update.offerMessage)wfError('Przygotuj treść wyceny.');}
 if(status==='planned'&&current.status==='quoted'){if(input.clientAccepted!==true)wfError('Potwierdź zgodę klienta.');update.acceptedAt=at;update.dateStart=wfDate(input.dateStart,true);}
 if(status==='completed'){update.finalPrice=wfMoney(input.finalPrice,'Kwota końcowa');update.completedAt=at;update.paymentStatus=input.paymentStatus==='paid'?'paid':'unpaid';}
 const event={requestId,at,from:current.status,to:status,vehicle:current.vehicle||null,cost,costDescription:costDescription||'Brak nowych kosztów',costCategory:wfText(input.costCategory||'Koszt zlecenia',100),actor:req.user.name||'Administrator'};
 const task=await Task.findOneAndUpdate({_id:current._id,status:current.status,updatedAt:current.updatedAt,'workflowEvents.requestId':{$ne:requestId}},{$set:update,$push:{workflowEvents:event}},{new:true,runValidators:true});
 if(!task){current=await Task.findById(req.params.id);if(current?.workflowEvents?.some(e=>e.requestId===requestId))return res.json({success:true,task:current});wfError('Zlecenie zostało zmienione. Odśwież i spróbuj ponownie.',409);}
 await recordActivity('workflow','Zmieniono '+task.number+' → '+status,'Task',task._id,req.user.name);res.json({success:true,task});
}));
app.post('/api/v3/tasks',requireAdmin,asyncRoute(async(req,res)=>{const b=req.body,name=wfText(b.name,160);if(!name)wfError('Podaj nazwę zlecenia.');const task=await Task.create({name,type:wfText(b.type,80)||'Inne',status:'new',source:'Ręcznie',price:0,dateStart:new Date(),clientName:wfText(b.clientName,140),clientPhone:wfText(b.clientPhone,40),address:wfText(b.address,300),desc:wfText(b.desc,4000)});await wfSyncClient(task);res.status(201).json({success:true,task});}));
app.put('/api/v3/tasks/:id',requireAdmin,validateId,asyncRoute(async(req,res)=>{
 const current=await Task.findById(req.params.id);if(!current)wfError('Brak zlecenia.',404);if(['completed','cancelled'].includes(current.status))wfError('Archiwalne zlecenie pozostaje tylko do odczytu.');
 const b=req.body,update={};for(const [key,max] of Object.entries({name:160,type:80,clientName:140,clientPhone:40,address:300,desc:4000}))if(b[key]!==undefined)update[key]=wfText(b[key],max);if(b.dateStart!==undefined)update.dateStart=wfDate(b.dateStart,true);
 if(b.vehicle!==undefined){if(b.vehicle){if(!isObjectId(b.vehicle))wfError('Nieprawidłowy pojazd.');const f=await Fleet.findOne({_id:b.vehicle,active:true,status:{$nin:['inactive','service']}});if(!f)wfError('Pojazd jest nieaktywny lub w serwisie.');update.vehicle=f._id;update.car=f.name+' '+f.plates;}else{update.vehicle=null;update.car='';}}
 if(b.workers!==undefined){if(!Array.isArray(b.workers)||b.workers.length>30)wfError('Nieprawidłowa ekipa.');const ids=[...new Set(b.workers.map(String))];if(ids.some(x=>!isObjectId(x)))wfError('Nieprawidłowy pracownik.');const crew=await Employee.find({_id:{$in:ids},active:true});if(crew.length!==ids.length)wfError('Wybrany pracownik jest nieaktywny.');update.workers=crew.map(e=>({employee:e._id,name:e.name,role:e.role}));}
 const task=await Task.findOneAndUpdate({_id:current._id,updatedAt:current.updatedAt},{$set:update},{new:true,runValidators:true});if(!task)wfError('Dane zmieniły się w innym oknie.',409);await wfSyncClient(task);res.json({success:true,task});
}));
app.patch('/api/v3/tasks/:id/payment',requireAdmin,validateId,asyncRoute(async(req,res)=>{if(!['paid','unpaid','partial'].includes(req.body.paymentStatus))wfError('Nieprawidłowa płatność.');const t=await Task.findByIdAndUpdate(req.params.id,{$set:{paymentStatus:req.body.paymentStatus}},{new:true,runValidators:true});if(!t)wfError('Brak zlecenia.',404);res.json({success:true});}));
app.post('/api/v3/finance',requireAdmin,asyncRoute(async(req,res)=>{
 const b=req.body,requestId=wfText(b.requestId,80);if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId))wfError('Brak identyfikatora operacji.');if(!['expense','income','payroll'].includes(b.kind))wfError('Nieprawidłowy rodzaj wpisu.');
 const Model=b.kind==='income'?Income:Expense,existing=await Model.findOne({requestId});if(existing)return res.json({success:true,entry:existing});
 const data={requestId,category:wfText(b.category,100)||'Inne',desc:wfText(b.desc,1000),price:wfMoney(b.price),date:wfDate(b.date,true)};if(!data.desc)wfError('Podaj opis: czego dotyczy wpis.');
 for(const [key,ModelRef] of [['task',Task],['vehicle',Fleet]])if(b[key]){if(b.kind==='income'&&key==='task')wfError('Przychód zakończonego zlecenia liczy się automatycznie.');if(!isObjectId(b[key])||!await ModelRef.exists({_id:b[key]}))wfError('Nie znaleziono '+key);data[key]=b[key];}
 if(b.kind==='payroll'){if(!isObjectId(b.employee))wfError('Wybierz pracownika.');const e=await Employee.findById(b.employee);if(!e)wfError('Brak pracownika.');data.employee=e._id;data.hours=wfMoney(b.hours??0,'Godziny');data.rateSnapshot=wfMoney(b.rate??0,'Stawka');data.category='Wynagrodzenie';}
 let entry;try{entry=await Model.create(data)}catch(e){if(e.code!==11000)throw e;entry=await Model.findOne({requestId});if(!entry)throw e;}res.status(201).json({success:true,entry});
}));
app.put('/api/v3/clients/:id',requireAdmin,validateId,asyncRoute(async(req,res)=>{const b=req.body,update={};for(const [key,max] of Object.entries({name:160,company:180,phone:40,email:160,address:300,notes:4000}))if(b[key]!==undefined)update[key]=wfText(b[key],max);if(update.phone!==undefined){if(!wfPhone(update.phone))wfError('Podaj telefon.');update.phoneNormalized=wfPhone(update.phone);}if(b.archived!==undefined)update.archived=Boolean(b.archived);const c=await Client.findByIdAndUpdate(req.params.id,{$set:update},{new:true,runValidators:true});if(!c)wfError('Brak klienta.',404);res.json({success:true});}));
async function wfEmployee(b,id){const data={};for(const [k,max] of Object.entries({name:140,role:100,phone:40,notes:2000,employmentType:80}))data[k]=wfText(b[k],max);if(!data.name||!data.role)wfError('Podaj imię, nazwisko i stanowisko.');data.hourlyRate=wfMoney(b.hourlyRate??0,'Stawka godzinowa');data.monthlySalary=wfMoney(b.monthlySalary??0,'Stawka miesięczna');data.status=['available','busy','off'].includes(b.status)?b.status:'available';data.systemRole=b.systemRole==='admin'?'admin':'worker';data.active=b.active!==false;data.startDate=wfDate(b.startDate);if(b.pin){const pin=String(b.pin);if(!/^\d{4,8}$/.test(pin))wfError('PIN musi mieć 4–8 cyfr.');if(pin===ADMIN_PIN)wfError('PIN jest już używany.');const all=await Employee.find({_id:{$ne:id||null}}).select('+pin +pinHash');for(const e of all)if(e.pin===pin||(e.pinHash&&await bcrypt.compare(pin,e.pinHash)))wfError('PIN jest już używany.');data.pinHash=await bcrypt.hash(pin,12);data.pin=undefined;}return data;}
app.post('/api/v3/employees',requireAdmin,asyncRoute(async(req,res)=>{const e=await Employee.create(await wfEmployee(req.body));res.status(201).json({success:true,employee:publicEmployee(e)});}));
app.put('/api/v3/employees/:id',requireAdmin,validateId,asyncRoute(async(req,res)=>{const d=await wfEmployee(req.body,req.params.id);if(req.user.employeeId===req.params.id&&(d.active===false||d.systemRole==='worker'))wfError('Nie możesz odebrać dostępu własnemu kontu.');const e=await Employee.findByIdAndUpdate(req.params.id,{$set:d},{new:true,runValidators:true});if(!e)wfError('Brak pracownika.',404);res.json({success:true,employee:publicEmployee(e)});}));
function wfFleet(b){const d={name:wfText(b.name,140),plates:wfText(b.plates,20),notes:wfText(b.notes,2000),status:b.status,active:b.active!==false};if(!d.name||!d.plates)wfError('Podaj pojazd i rejestrację.');if(!['available','route','service','inactive'].includes(d.status))wfError('Nieprawidłowy status pojazdu.');for(const k of ['mileage','fuelConsumption'])d[k]=wfMoney(b[k]??0,k);for(const k of ['nextServiceDate','insuranceUntil','inspectionUntil'])d[k]=wfDate(b[k]);d.serviceMileage=b.serviceMileage?wfMoney(b.serviceMileage):null;return d;}
app.post('/api/v3/fleet',requireAdmin,asyncRoute(async(req,res)=>{const f=await Fleet.create(wfFleet(req.body));res.status(201).json({success:true,vehicle:f});}));
app.put('/api/v3/fleet/:id',requireAdmin,validateId,asyncRoute(async(req,res)=>{const f=await Fleet.findByIdAndUpdate(req.params.id,{$set:wfFleet(req.body)},{new:true,runValidators:true});if(!f)wfError('Brak pojazdu.',404);res.json({success:true,vehicle:f});}));


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
    (req,res,next) => { if (['status','completed','completedAt','finalPrice','price'].some(k=>req.body[k]!==undefined)) return res.status(409).json({success:false,message:'Status i kwotę zmieniaj przez nowy obieg wyceny.'}); next(); },
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
    (req,res) => res.status(409).json({success:false,message:'Użyj nowego panelu: zmiana statusu wymaga podania kosztów.'}),
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
    (req,res) => res.status(409).json({success:false,message:'Zakończ zlecenie w nowym panelu z rozliczeniem kosztów.'}),
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
app.use(['/revmi', '/revmi.html', '/manage', '/manage.html', '/api'], (req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });

app.use(
    express.static(publicDir, {
        extensions: ['html'],
        maxAge: IS_PRODUCTION ? '1h' : 0,

        setHeaders: (res, filePath) => {
            if (['revmi.html','manage.html'].includes(path.basename(filePath))) {
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
    if (!error.status || error.status >= 500) console.error(error);

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

    await business.start();

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

    business.stop();
    await mongoose.disconnect();
    process.exit(0);
}

process.on('SIGTERM', () => {
    shutdown('SIGTERM');
});

process.on('SIGINT', () => {
    shutdown('SIGINT');
});
module.exports = { business, app, Task, Client, Employee, Fleet, Expense, Income, Activity, sessionStore, wfLedger, wfMonth, wfMoney, WF_TRANSITIONS };
