'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const config = require('./config');
const { requireAuth } = require('./middleware/auth');
const { REDIRECTS } = require('../lib/divisions');

const publicDir = path.join(__dirname, '..', 'Public');

/**
 * Tworzy aplikację Express. Magazyn sesji jest wstrzykiwany,
 * dzięki czemu testy mogą użyć pamięci zamiast MongoDB.
 */
function createApp({ sessionStore } = {}) {
    const app = express();
    app.set('trust proxy', 1);
    app.disable('x-powered-by');

    /* CORS — tylko dla dozwolonych adresów panelu */
    app.use((req, res, next) => {
        const origin = req.get('Origin');
        if (!origin) return next();
        const normalized = origin.replace(/\/$/, '');
        const allowed = normalized === `${req.protocol}://${req.get('host')}` || config.allowedOrigins.includes(normalized);
        if (!allowed) {
            if (req.method === 'OPTIONS') return res.status(403).json({ success: false, message: 'Adres nie jest dozwolony przez CORS' });
            return next();
        }
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Vary', 'Origin');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });

    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", 'https://www.googletagmanager.com', 'https://cdnjs.cloudflare.com'],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
                imgSrc: ["'self'", 'blob:', 'data:', 'https://i.imgur.com', 'https://*.google-analytics.com', 'https://*.googletagmanager.com'],
                connectSrc: ["'self'", 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'],
                workerSrc: ["'self'"],
                manifestSrc: ["'self'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                frameAncestors: ["'self'"]
            }
        },
        crossOriginEmbedderPolicy: false
    }));

    // Duży limit JSON tylko dla formularza wyceny (zdjęcia) — reszta 250 kB.
    const smallJson = express.json({ limit: '250kb' });
    app.use((req, res, next) => (req.path === '/api/quotes' && req.method === 'POST' ? next() : smallJson(req, res, next)));

    app.use('/api', (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        next();
    });

    app.use(session({
        name: 'revmi.sid',
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        proxy: config.isProduction,
        store: sessionStore,
        cookie: {
            httpOnly: true,
            secure: config.isProduction || config.crossSiteSession,
            sameSite: config.crossSiteSession ? 'none' : 'lax',
            // 30 dni — aplikacja na telefonie nie wylogowuje ekipy co chwilę.
            maxAge: 1000 * 60 * 60 * 24 * 30
        }
    }));

    /* API */
    app.use('/api', require('./routes/public'));
    app.use('/api', require('./routes/auth'));
    app.use('/api', requireAuth);
    app.use('/api', require('./routes/dashboard'));
    app.use('/api', require('./routes/tasks'));
    app.use('/api', require('./routes/resources'));
    app.use('/api', require('./routes/notifications'));
    app.use('/api', require('./routes/notes'));
    app.use('/api', require('./routes/messages'));
    app.use('/api', require('./routes/business'));
    app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Nie znaleziono endpointu API' }));

    /* Panel RevMi (PWA) */
    // Uwaga: Express domyślnie nie rozróżnia „/revmi” i „/revmi/”, dlatego sprawdzamy
    // dokładną ścieżkę — inaczej „/revmi/” przekierowywałoby samo na siebie (pętla).
    app.get(['/revmi', '/revmi.html', '/panel', '/admin'], (req, res, next) => {
        const pathname = req.originalUrl.split('?')[0];
        if (pathname.endsWith('/')) return next();
        res.setHeader('Cache-Control', 'no-store');
        res.redirect(302, '/revmi/');
    });
    app.use('/revmi', (req, res, next) => {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        if (req.path === '/sw.js') {
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Service-Worker-Allowed', '/revmi/');
        }
        next();
    });
    app.get('/revmi/manifest.webmanifest', (req, res) => {
        res.type('application/manifest+json');
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.join(publicDir, 'revmi', 'manifest.webmanifest'));
    });

    /* Stare adresy strony */
    app.get(['/oproznianie.html', '/oproznianie'], (req, res) => res.redirect(301, '/oproznianie-utylizacja.html'));
    app.get(['/polityka-prywatności.html', '/polityka-prywatności'], (req, res) => res.redirect(301, '/polityka-prywatnosci.html'));
    app.get('/testowe.html', (req, res) => res.redirect(302, '/'));
    // 4.0: strony połączone w działy (RevMoto, RevStorage, RevCargo, RevHotel, RevB2B).
    for (const [from, to] of Object.entries(REDIRECTS)) {
        app.get(['/' + from, '/' + from.replace(/\.html$/, '')], (req, res) => res.redirect(301, '/' + to));
    }

    app.use(express.static(publicDir, {
        extensions: ['html'],
        maxAge: config.isProduction ? '1h' : 0,
        setHeaders(res, filePath) {
            const rel = path.relative(publicDir, filePath).split(path.sep).join('/');
            if (rel.startsWith('revmi/') && (rel.endsWith('.html') || rel.endsWith('.js') || rel.endsWith('.css'))) {
                res.setHeader('Cache-Control', 'no-cache');
            }
        }
    }));

    /* 404 dla stron */
    app.use((req, res, next) => {
        if (req.method !== 'GET' || !req.accepts('html')) return next();
        res.status(404).sendFile(path.join(publicDir, '404.html'), err => err && next());
    });

    /* Obsługa błędów */
    // eslint-disable-next-line no-unused-vars
    app.use((error, req, res, next) => {
        const status = error.status || error.statusCode || (error.code === 11000 ? 409 : 0) ||
            (error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500);
        if (status >= 500) console.error(error);
        let message = error.message;
        if (status === 500) message = 'Wewnętrzny błąd serwera';
        if (status === 413) message = 'Zdjęcia są za duże. Dodaj maksymalnie 3 pomniejszone zdjęcia.';
        if (error.name === 'ValidationError') {
            message = Object.values(error.errors || {}).map(e => e.message).join(', ') || 'Nieprawidłowe dane';
        }
        if (error.code === 11000) message = 'Taki wpis już istnieje';
        res.status(status).json({ success: false, message });
    });

    return app;
}

module.exports = { createApp, publicDir };
