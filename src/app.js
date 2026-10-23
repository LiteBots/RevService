'use strict';

const fs = require('fs');
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
                imgSrc: ["'self'", 'blob:', 'data:', 'https://i.imgur.com', 'https://images.unsplash.com', 'https://*.google-analytics.com', 'https://*.googletagmanager.com'],
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

    // Duży limit JSON tylko dla tras ze zdjęciami (wyceny, magazyn, sortownia) — reszta 250 kB.
    const smallJson = express.json({ limit: '250kb' });
    // 9.0: + zamówienie z panelu klienta (zdjęcia) i zdjęcia przedmiotów RevOutlet.
    const bigBody = /^\/api\/(quotes(\/ai)?|storage\/[a-f0-9]{24}\/photos|sorting\/bins\/[a-f0-9]{24}\/entries|tasks\/[a-f0-9]{24}\/(media|complete)|konto\/orders|v9\/outlet\/[a-f0-9]{24}\/photos|konto\/orders\/[a-f0-9]{24}\/messages|tasks\/[a-f0-9]{24}\/messages)$/i;
    app.use((req, res, next) => (req.method === 'POST' && bigBody.test(req.path) ? next() : smallJson(req, res, next)));

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
    // 9.0: publiczne moduły (RevOutlet, RevPowrót, abonamenty, kariera, partnerzy) i panel klienta /konto (+ B2B).
    // Mają własne logowanie (konto klienta), dlatego są przed requireAuth panelu RevMi.
    app.use('/api', require('./routes/public-v9'));
    app.use('/api', require('./routes/portal-auth'));
    app.use('/api', require('./routes/portal'));
    app.use('/api', require('./routes/b2b'));
    // 9.1: dodatki, newsletter, nabywcy od dewelopera, czat klienta, panel dewelopera
    app.use('/api', require('./routes/public-v10'));
    app.use('/api', require('./routes/portal-v10'));
    app.use('/api', requireAuth);
    app.use('/api', require('./routes/dashboard'));
    app.use('/api', require('./routes/tasks'));
    app.use('/api', require('./routes/resources'));
    app.use('/api', require('./routes/notifications'));
    app.use('/api', require('./routes/notes'));
    app.use('/api', require('./routes/messages'));
    app.use('/api', require('./routes/business'));
    app.use('/api', require('./routes/ops'));
    app.use('/api', require('./routes/team'));
    app.use('/api', require('./routes/stats'));
    app.use('/api', require('./routes/revbot'));
    app.use('/api', require('./routes/admin-v9'));
    app.use('/api', require('./routes/admin-v10'));
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

    /* 9.0: panel klienta — krótkie adresy */
    app.get(['/moje-konto', '/panel-klienta', '/logowanie'], (req, res) => res.redirect(302, '/konto'));
    // Express nie odróżnia „/konto” od „/konto/” — sprawdzamy dokładny adres, żeby nie zrobić pętli.
    app.get('/konto', (req, res, next) => {
        const pathname = req.originalUrl.split('?')[0];
        if (!pathname.endsWith('/')) return next();
        const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
        res.redirect(302, '/konto' + query);
    });
    app.get(['/rev-outlet', '/revoutlet', '/revoutlet.html'], (req, res) => res.redirect(301, '/outlet.html'));
    app.get(['/rev-powrot', '/revpowrot', '/revpowrot.html'], (req, res) => res.redirect(301, '/powrot.html'));
    app.get(['/praca', '/franczyza'], (req, res) => res.redirect(301, '/kariera.html' + (req.path === '/franczyza' ? '#franczyza' : '')));

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
            } else if (/\.[0-9a-f]{8}\.(css|js)$/.test(rel)) {
                // Pliki z hashem treści w nazwie nigdy się nie zmieniają.
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            } else if (rel.endsWith('.html')) {
                // Strony zawsze sprawdzane — po wdrożeniu od razu widać nowe style i skrypty.
                res.setHeader('Cache-Control', 'no-cache');
            }
        }
    }));

    /* 6.0.1: zapasowe pliki CSS/JS — gdy przy wgrywaniu zabraknie pliku z hashem
       (np. assets/site.1a2b3c4d.js), podajemy wersję bez hasha i odwrotnie. Strona nie „psuje się”
       przez jeden brakujący plik. */
    app.get(/^\/assets\/[a-z-]+(?:\.[0-9a-f]{8})?\.(?:css|js)$/, (req, res, next) => {
        const dir = path.join(publicDir, 'assets');
        const m = req.path.match(/^\/assets\/([a-z-]+)(?:\.([0-9a-f]{8}))?\.(css|js)$/);
        const [, name, hash, ext] = m;
        let candidates = [];
        try {
            const files = fs.readdirSync(dir);
            candidates = hash
                ? [name + '.' + ext]
                : files.filter(f => new RegExp('^' + name + '\\.[0-9a-f]{8}\\.' + ext + '$').test(f));
        } catch (e) { return next(); }
        const found = candidates.find(f => fs.existsSync(path.join(dir, f)));
        if (!found) return next();
        res.setHeader('Cache-Control', 'no-cache');
        res.type(ext === 'css' ? 'text/css' : 'application/javascript');
        return res.sendFile(path.join(dir, found));
    });

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
        if (status === 413) message = 'Zdjęcia są za duże. Dodaj mniej zdjęć albo pomniejsz je.';
        if (error.name === 'ValidationError') {
            message = Object.values(error.errors || {}).map(e => e.message).join(', ') || 'Nieprawidłowe dane';
        }
        if (error.code === 11000) message = 'Taki wpis już istnieje';
        res.status(status).json({ success: false, message });
    });

    return app;
}

module.exports = { createApp, publicDir };
