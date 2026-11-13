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
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, X-Idempotency-Key');
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
                imgSrc: ["'self'", 'blob:', 'data:', 'https://*.tile.openstreetmap.org', 'https://cdnjs.cloudflare.com', 'https://i.imgur.com', 'https://images.unsplash.com', 'https://*.google-analytics.com', 'https://*.googletagmanager.com'],
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
    const bigBody = /^\/api\/(quotes(\/ai)?|storage\/[a-f0-9]{24}\/photos|sorting\/bins\/[a-f0-9]{24}\/entries|tasks\/[a-f0-9]{24}\/(media|complete)|konto\/orders|v9\/outlet\/[a-f0-9]{24}\/photos|konto\/orders\/[a-f0-9]{24}\/messages|tasks\/[a-f0-9]{24}\/messages|v92\/receipts\/scan|v2\/faults|v2\/chat\/channels\/[a-f0-9]{24}\/messages|quotes\/v13|v13\/realizacje(\/[a-f0-9]{24})?|konto\/telefon\/zlecenia\/[a-f0-9]{24}\/wiadomosci)$/i;
    app.use((req, res, next) => ((req.method === 'POST' || req.method === 'PUT') && bigBody.test(req.path) ? next() : smallJson(req, res, next)));

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
    // 2.0.0: logowanie hasłem i potwierdzenie terminu z SMS (publiczne)
    app.use('/api', require('./routes/v2-auth'));
    // 9.0: publiczne moduły (RevOutlet, RevPowrót, abonamenty, kariera, partnerzy) i panel klienta /konto (+ B2B).
    // Mają własne logowanie (konto klienta), dlatego są przed requireAuth panelu RevMi.
    app.use('/api', require('./routes/public-v9'));
    app.use('/api', require('./routes/portal-auth'));
    // 12.0: panel klienta po numerze telefonu (kod SMS lub numer zlecenia) — przed portal.js, który wymaga konta e-mail
    app.use('/api', require('./routes/portal-phone'));
    // 13.0: wycena bez AI (do 24 h), konto klienta numerem + hasłem, czat dla zalogowanych numerem, realizacje (publicznie)
    app.use('/api', require('./routes/public-v13'));
    app.use('/api', require('./routes/portal'));
    app.use('/api', require('./routes/b2b'));
    // 9.1: dodatki, newsletter, nabywcy od dewelopera, czat klienta, panel dewelopera
    app.use('/api', require('./routes/public-v10'));
    app.use('/api', require('./routes/portal-v10'));
    app.use('/api', requireAuth);
    // 9.2: tryb offline (ponowienia bez duplikatów) i dziennik zmian
    const { audit, idempotency } = require('./middleware/audit');
    app.use('/api', idempotency, audit);
    // 2.0.0: obowiązkowe 2FA dla administratorów + lista urządzeń
    app.use('/api', require('./middleware/v2').v2Guard);
    app.use('/api', require('./routes/v2'));
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
    app.use('/api', require('./routes/admin-v11'));
    // 13.0: wysyłka wyceny klientowi (SMS + panel) i realizacje (zdjęcia przed / po) w RevMi
    app.use('/api', require('./routes/admin-v13'));
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
    // 2.0.0: stary panel 9.2 (moduły dodatkowe) — /revmi-9/
    app.get('/revmi-9', (req, res, next) => (req.originalUrl.split('?')[0].endsWith('/') ? next() : res.redirect(302, '/revmi-9/')));
    app.use('/revmi-9', (req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });
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
    app.get(['/rev-outlet', '/revoutlet', '/revoutlet.html'], (req, res) => res.redirect(301, '/'));
    app.get(['/rev-powrot', '/revpowrot', '/revpowrot.html', '/powrot'], (req, res) => res.redirect(301, '/po-drodze.html'));
    app.get(['/praca', '/franczyza'], (req, res) => res.redirect(301, '/'));

    /* Stare adresy strony */
    /* 13.0: strona ograniczona do 6 usług — stare adresy przekierowane trwale (301), żeby nie stracić pozycji w Google */
    const V13_REDIRECTS = {
        'oproznianie-utylizacja.html': 'oproznianie.html', 'przygotowanie-nieruchomosci-do-sprzedazy.html': 'oproznianie.html', 'revclean.html': 'oproznianie.html', 'revstorage.html': 'oproznianie.html', 'magazynowanie-mienia.html': 'oproznianie.html',
        'revhome.html': 'przeprowadzki.html', 'revoffice.html': 'przeprowadzki.html', 'revshop.html': 'przeprowadzki.html', 'revwarehouse.html': 'przeprowadzki.html',
        'revcargo.html': 'transport.html', 'revmoto.html': 'transport.html', 'stale-dostawy-dla-firm.html': 'transport.html', 'transport-motocykli.html': 'transport.html', 'revassist.html': 'transport.html',
        'revbud.html': 'rozbiorki.html', 'revsite.html': 'rozbiorki.html', 'prace-ziemne-i-koparkowe.html': 'rozbiorki.html',
        'revevent.html': 'przewozy-osob.html', 'rozbiorki-i-wyburzenia.html': 'rozbiorki.html',
        'revb2b.html': 'dla-firm.html', 'revfacility.html': 'dla-firm.html', 'revhotel.html': 'dla-firm.html', 'trasy-dla-hoteli-i-pensjonatow.html': 'dla-firm.html', 'partnerzy.html': 'dla-firm.html',
        'powrot.html': 'po-drodze.html', 'cennik.html': 'wycena.html', 'wycena-klasyczna.html': 'wycena.html',
        'revgarden.html': '', 'revwinter.html': '', 'czyszczenie-hal-i-garazy.html': '', 'mycie-cisnieniowe.html': '', 'porzadkowanie-dzialek-i-posesji.html': '',
        'usuwanie-pni-i-korzeni.html': '', 'wycinka-drzew-i-krzewow.html': '', 'abonamenty.html': '', 'kariera.html': '', 'outlet.html': '', 'newsletter.html': '', 'odbior.html': ''
    };
    for (const [from, to] of Object.entries(V13_REDIRECTS)) {
        app.get(['/' + from, '/' + from.replace(/\.html$/, '')], (req, res) => res.redirect(301, '/' + to));
    }
    // Strony usług, których już nie ma, w miastach → strona usług w tym mieście
    app.get(/^\/(odsniezanie|ogrod-i-dzialka|mycie-cisnieniowe|sprzatanie|wycinka-drzew)-([a-z-]+?)(\.html)?$/, (req, res, next) => {
        const city = req.params[1];
        if (!fs.existsSync(path.join(publicDir, `uslugi-${city}.html`))) return res.redirect(301, '/obszar-dzialania.html');
        res.redirect(301, `/uslugi-${city}.html`);
    });
    app.get(['/polityka-prywatności.html', '/polityka-prywatności'], (req, res) => res.redirect(301, '/polityka-prywatnosci.html'));
    app.get('/testowe.html', (req, res) => res.redirect(302, '/'));

    // 13.0: katalogi formularzy leżą w lib/ (serwer ich potrzebuje do walidacji) — strona pobiera te same pliki stąd.
    // Dzięki temu usunięcie plików strony nie psuje startu serwera.
    app.get(['/assets/quote-form.js', '/assets/ai-services.js'], (req, res) => {
        res.type('application/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.join(__dirname, '..', 'lib', path.basename(req.path)));
    });

    app.use(express.static(publicDir, {
        extensions: ['html'],
        maxAge: config.isProduction ? '1h' : 0,
        setHeaders(res, filePath) {
            const rel = path.relative(publicDir, filePath).split(path.sep).join('/');
            if ((rel.startsWith('revmi/') || rel.startsWith('revmi-9/')) && (rel.endsWith('.html') || rel.endsWith('.js') || rel.endsWith('.css'))) {
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
