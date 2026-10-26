'use strict';

/**
 * RevSerwis 9.2 — czysta logika (bez bazy i paczek npm):
 * role i uprawnienia, TOTP (2FA), podpis AWS SigV4 (Cloudflare R2 / S3), trasa dnia, czas pracy,
 * konflikty w grafiku, należności, odmiana „opinia”, CID wizytówki Google.
 */
const crypto = require('crypto');

/* ------------------------------------------------------------------ */
/* Role i uprawnienia                                                  */
/* ------------------------------------------------------------------ */

const ROLES = ['admin', 'dispatcher', 'manager', 'accountant', 'worker'];
const ROLE_LABELS = {
    admin: 'Administrator',
    dispatcher: 'Dyspozytor',
    manager: 'Kierownik oddziału',
    accountant: 'Księgowa (finanse — podgląd)',
    worker: 'Pracownik'
};
const ROLE_HINTS = {
    admin: 'Wszystko, łącznie z ustawieniami, cennikiem i zespołem.',
    dispatcher: 'Zlecenia, wyceny, grafik, mapa, klienci, sprzedaż (outlet, kursy, B2B), magazyn, flota. Bez finansów i ustawień.',
    manager: 'Zlecenia, grafik i urlopy swojego oddziału, mapa dnia, magazyn, flota. Bez finansów.',
    accountant: 'Finanse, statystyki, rozliczenia, należności i koszty floty. Zlecenia tylko do podglądu.',
    worker: 'Swoje zlecenia, zdjęcia, raport z zakończenia, notatnik, urlopy.'
};

/** „perm” = pełny dostęp, „perm:read” = tylko odczyt (GET). */
const PERMS = {
    admin: ['*'],
    dispatcher: ['tasks', 'dashboard', 'clients', 'sales', 'storage', 'fleet', 'dispatch', 'assistant', 'team:read', 'leaves'],
    manager: ['tasks', 'dashboard', 'storage', 'fleet', 'dispatch', 'team:read', 'leaves'],
    accountant: ['finance', 'payroll', 'dashboard', 'tasks:read', 'clients:read', 'fleet:read', 'assistant', 'team:read'],
    worker: []
};

/** Ścieżka API (bez /api) → wymagane uprawnienie. Pierwsze dopasowanie wygrywa; brak dopasowania = tylko administrator. */
const ROUTE_PERMS = [
    [/^\/v9\/analytics\b/, 'finance'],
    [/^\/v9\/counts$/, 'dashboard'],
    [/^\/v9\/account-options$/, 'tasks'],
    [/^\/v9\/(tasks|storage)\/[a-f0-9]{24}\/account$/, 'tasks'],
    [/^\/v9\/(outlet|outlet-orders|trips|bookings|subscriptions|referrals|hotels|hotel-routes|developers|investments|dev-leads)\b/, 'sales'],
    [/^\/v92\/(dispatch|map|route)\b/, 'dispatch'],
    [/^\/v92\/receivables\b/, 'finance'],
    [/^\/v92\/assistant\b/, 'assistant'],
    [/^\/v92\/leaves\/admin\b/, 'leaves'],
    [/^\/v92\/(fleet|fuel|repairs)\b/, 'fleet'],
    [/^\/tasks\b/, 'tasks'],
    [/^\/export\/tasks\.csv$/, 'tasks'],
    [/^\/activity$/, 'tasks'],
    [/^\/dashboard$/, 'dashboard'],
    [/^\/clients\b/, 'clients'],
    [/^\/messages\b/, 'sales'],
    [/^\/offers\b/, 'sales'],
    [/^\/(storage|storage-units|sorting)\b/, 'storage'],
    [/^\/fleet\b/, 'fleet'],
    [/^\/branches$/, 'team:read'],
    [/^\/employees$/, 'team:read'],
    [/^\/payroll\b/, 'payroll'],
    [/^\/(finances|stats|reports|contracts|incomes|expenses)\b/, 'finance']
];

function permsOf(role) {
    return PERMS[role] || [];
}

/** Czy rola ma uprawnienie (np. „finance”, „tasks”) dla danej metody. */
function can(role, perm, method = 'GET') {
    const list = permsOf(role);
    if (list.includes('*')) return true;
    if (list.includes(perm)) return true;
    return list.includes(perm + ':read') && (method === 'GET' || method === 'HEAD');
}

/** Czy rola może wykonać żądanie do trasy oznaczonej jako „administracyjna”. */
function permits(role, method, apiPath) {
    if (role === 'admin') return true;
    const rule = ROUTE_PERMS.find(([re]) => re.test(apiPath));
    if (!rule) return false;
    const perm = rule[1];
    if (perm.endsWith(':read')) return (method === 'GET' || method === 'HEAD') && can(role, perm.slice(0, -5), method);
    return can(role, perm, method);
}

/** Biuro = role, które zarządzają zleceniami (widzą wyceny, edytują, przypisują). */
const isOffice = role => role === 'admin' || role === 'dispatcher' || role === 'manager';
/** Widzi wszystkie zlecenia firmy (bez ograniczenia do oddziału). */
const seesAllTasks = role => role === 'admin' || role === 'dispatcher' || role === 'accountant';

/* ------------------------------------------------------------------ */
/* TOTP (RFC 6238) — aplikacje Google Authenticator, Microsoft Authenticator, Authy…                         */
/* ------------------------------------------------------------------ */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += B32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
}

function base32Decode(str) {
    const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = 0;
    let value = 0;
    const out = [];
    for (const ch of clean) {
        value = (value << 5) | B32.indexOf(ch);
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

function totp(secret, time = Date.now(), step = 30, digits = 6) {
    const counter = Math.floor(time / 1000 / step);
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
    buf.writeUInt32BE(counter >>> 0, 4);
    const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 15;
    const code = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
    return String(code % 10 ** digits).padStart(digits, '0');
}

/** Sprawdza kod z tolerancją ±1 krok (30 s) na rozjechany zegar telefonu. */
function verifyTotp(secret, code, time = Date.now(), window = 1) {
    const c = String(code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(c) || !secret) return false;
    for (let w = -window; w <= window; w++) {
        const expected = totp(secret, time + w * 30_000);
        if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return true;
    }
    return false;
}

function otpauthUrl(secret, account, issuer = 'RevMi') {
    const label = encodeURIComponent(`${issuer}:${account}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/* ------------------------------------------------------------------ */
/* AWS Signature V4 — Cloudflare R2 / Amazon S3 / Backblaze B2 / MinIO  */
/* ------------------------------------------------------------------ */

const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const encodeRfc3986 = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/**
 * Podpisuje żądanie HTTP. Zwraca nagłówki do dołączenia (Authorization, x-amz-date, x-amz-content-sha256).
 * url: pełny adres, np. https://<konto>.r2.cloudflarestorage.com/<bucket>/<klucz>
 */
function signV4({ method, url, headers = {}, body = '', accessKeyId, secretAccessKey, region = 'auto', service = 's3', date = new Date(), payloadHash }) {
    const u = new URL(url);
    const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const day = amzDate.slice(0, 8);
    const hash = payloadHash || sha256(body || '');
    const allHeaders = { ...headers, host: u.host, 'x-amz-date': amzDate };
    if (service === 's3') allHeaders['x-amz-content-sha256'] = hash;
    const names = Object.keys(allHeaders).map(h => h.toLowerCase()).sort();
    const lower = Object.fromEntries(Object.entries(allHeaders).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
    const canonicalHeaders = names.map(n => `${n}:${lower[n]}\n`).join('');
    const signedHeaders = names.join(';');
    const canonicalPath = service === 's3'
        ? u.pathname.split('/').map(seg => encodeRfc3986(decodeURIComponent(seg))).join('/')
        : u.pathname;
    const query = [...u.searchParams.entries()].map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)]).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
    const canonicalRequest = [method, canonicalPath || '/', query, canonicalHeaders, signedHeaders, hash].join('\n');
    const scope = `${day}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
    const kSigning = hmac(hmac(hmac(hmac('AWS4' + secretAccessKey, day), region), service), 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    const out = { 'x-amz-date': amzDate, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
    if (service === 's3') out['x-amz-content-sha256'] = hash;
    return { headers: out, signature, canonicalRequest, stringToSign };
}

/* ------------------------------------------------------------------ */
/* Trasa dnia                                                          */
/* ------------------------------------------------------------------ */

function haversineKm(a, b) {
    const R = 6371;
    const rad = x => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

const ROAD = 1.3;
const roadKm = (a, b) => haversineKm(a, b) * ROAD;

function routeLength(base, points, order, back = true) {
    let km = 0;
    let prev = base;
    for (const i of order) { km += roadKm(prev, points[i]); prev = points[i]; }
    if (back && order.length) km += roadKm(prev, base);
    return km;
}

/**
 * Najkrótsza kolejność odwiedzin (najbliższy sąsiad + poprawki 2-opt).
 * Punkty z „fixed: true” (zlecenia z konkretną godziną) zostają w kolejności godzin, reszta jest wstawiana optymalnie.
 * Zwraca { order: [indeksy], km, minutes }.
 */
function optimizeRoute(base, points, { back = true, avgKmh = 50, stopMinutes = 0 } = {}) {
    const n = points.length;
    if (!n) return { order: [], km: 0, minutes: 0 };
    const left = new Set(points.map((_, i) => i));
    const order = [];
    let cur = base;
    while (left.size) {
        let best = null;
        for (const i of left) {
            const d = roadKm(cur, points[i]);
            if (!best || d < best[1]) best = [i, d];
        }
        order.push(best[0]);
        left.delete(best[0]);
        cur = points[best[0]];
    }
    let improved = true;
    let guard = 0;
    while (improved && guard++ < 200) {
        improved = false;
        for (let i = 0; i < n - 1; i++) {
            for (let k = i + 1; k < n; k++) {
                const cand = order.slice(0, i).concat(order.slice(i, k + 1).reverse(), order.slice(k + 1));
                if (routeLength(base, points, cand, back) + 1e-9 < routeLength(base, points, order, back)) {
                    order.splice(0, n, ...cand);
                    improved = true;
                }
            }
        }
    }
    const km = routeLength(base, points, order, back);
    return { order, km: Math.round(km * 10) / 10, minutes: Math.round((km / avgKmh) * 60 + n * stopMinutes) };
}

/** Przewidywany czas dojazdu w minutach (linia prosta × 1,3, średnio 45 km/h w terenie mieszanym). */
function etaMinutes(from, to, avgKmh = 45) {
    if (!from || !to) return null;
    return Math.max(1, Math.round((roadKm(from, to) / avgKmh) * 60));
}

/* ------------------------------------------------------------------ */
/* Czas pracy (start zlecenia = stoper)                                */
/* ------------------------------------------------------------------ */

/** Suma odcinków pracy w godzinach (otwarty odcinek liczony do „now”), zaokrąglona do 0,25 h. */
function workedHours(workLog = [], now = new Date()) {
    let ms = 0;
    for (const s of workLog) {
        const a = new Date(s.start).getTime();
        const b = s.end ? new Date(s.end).getTime() : now.getTime();
        if (Number.isFinite(a) && Number.isFinite(b) && b > a) ms += b - a;
    }
    return Math.round((ms / 3_600_000) * 4) / 4;
}

const timerRunning = (workLog = []) => workLog.some(s => s.start && !s.end);

/* ------------------------------------------------------------------ */
/* Grafik ekip — konflikty i dostępność                                */
/* ------------------------------------------------------------------ */

const DEFAULT_TASK_HOURS = 4;
const span = t => {
    const a = new Date(t.dateStart).getTime();
    const b = t.dateEnd ? new Date(t.dateEnd).getTime() : a + DEFAULT_TASK_HOURS * 3_600_000;
    return [a, Math.max(b, a + 30 * 60_000)];
};
const overlaps = (x, y) => x[0] < y[1] && y[0] < x[1];

/**
 * Konflikty w grafiku: ta sama osoba albo ten sam pojazd w dwóch zleceniach naraz, albo osoba na urlopie.
 * tasks: [{ _id, dateStart, dateEnd, workers: [{employee}], vehicle }], leaves: [{ employee, from, to }]
 */
function scheduleConflicts(tasks, leaves = []) {
    const out = [];
    const list = tasks.filter(t => !['cancelled', 'completed'].includes(t.status));
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const a = list[i];
            const b = list[j];
            if (!overlaps(span(a), span(b))) continue;
            const ea = new Set((a.workers || []).map(w => String(w.employee || '')).filter(Boolean));
            for (const w of b.workers || []) {
                const id = String(w.employee || '');
                if (id && ea.has(id)) out.push({ kind: 'person', employee: id, name: w.name || '', tasks: [String(a._id), String(b._id)] });
            }
            if (a.vehicle && b.vehicle && String(a.vehicle) === String(b.vehicle)) out.push({ kind: 'vehicle', vehicle: String(a.vehicle), tasks: [String(a._id), String(b._id)] });
        }
        for (const l of leaves) {
            const ls = [new Date(l.from).getTime(), new Date(l.to).getTime() + 86_400_000 - 1];
            if (!overlaps(span(list[i]), ls)) continue;
            const w = (list[i].workers || []).find(x => String(x.employee || '') === String(l.employee));
            if (w) out.push({ kind: 'leave', employee: String(l.employee), name: w.name || '', tasks: [String(list[i]._id)], leave: String(l._id || '') });
        }
    }
    return out;
}

/** Czy pracownik jest na urlopie danego dnia (YYYY-MM-DD w czasie lokalnym). */
function onLeave(leaves, employeeId, day) {
    const d = new Date(day + 'T12:00:00');
    return leaves.some(l => String(l.employee) === String(employeeId) && l.status !== 'rejected' && new Date(l.from) <= d && d <= new Date(new Date(l.to).getTime() + 86_399_999));
}

/* ------------------------------------------------------------------ */
/* Należności                                                          */
/* ------------------------------------------------------------------ */

/** Kwota do zapłaty za zlecenie: kwota końcowa (lub cena) minus pobrane (dla „częściowo”). */
function amountDue(t) {
    const total = Number(t.finalPrice ?? t.price ?? 0) || 0;
    if (t.paymentStatus === 'paid') return 0;
    const paid = t.paymentStatus === 'partial' ? Number(t.cashCollected || t.paidAmount || 0) : 0;
    return Math.max(0, Math.round((total - paid) * 100) / 100);
}

const AGING = [[0, 7, '0–7 dni'], [8, 30, '8–30 dni'], [31, 60, '31–60 dni'], [61, Infinity, 'ponad 60 dni']];

function agingBucket(days) {
    return (AGING.find(([a, b]) => days >= a && days <= b) || AGING[AGING.length - 1])[2];
}

/** Czy wysłać kolejne przypomnienie o płatności (automatycznie). */
function reminderDue(t, { firstDays = 7, everyDays = 7, max = 3 } = {}, now = new Date()) {
    if (amountDue(t) <= 0) return false;
    const done = new Date(t.completedAt || t.dateStart).getTime();
    const days = (now.getTime() - done) / 86_400_000;
    const sent = (t.paymentReminders || []).filter(r => r.auto !== false);
    if (sent.length >= max) return false;
    if (!sent.length) return days >= firstDays;
    const last = new Date(sent[sent.length - 1].at).getTime();
    return (now.getTime() - last) / 86_400_000 >= everyDays;
}

/* ------------------------------------------------------------------ */
/* Różne                                                               */
/* ------------------------------------------------------------------ */

function reviewsPlural(n) {
    if (n === 1) return 'opinia';
    const d = n % 10;
    const t = n % 100;
    return d >= 2 && d <= 4 && (t < 12 || t > 14) ? 'opinie' : 'opinii';
}

const cidOf = url => (String(url || '').match(/[?&]cid=(\d{5,25})/) || [])[1] || '';

/** Dzień w strefie firmy (YYYY-MM-DD) i godzina (0–23). */
function localParts(date = new Date(), timeZone = process.env.TZ || 'Europe/Warsaw') {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const g = t => p.find(x => x.type === t)?.value;
    return { day: `${g('year')}-${g('month')}-${g('day')}`, hour: Number(g('hour')) };
}

module.exports = {
    ROLES, ROLE_LABELS, ROLE_HINTS, PERMS, ROUTE_PERMS, permsOf, can, permits, isOffice, seesAllTasks,
    base32Encode, base32Decode, generateTotpSecret, totp, verifyTotp, otpauthUrl,
    signV4, sha256,
    haversineKm, roadKm, optimizeRoute, routeLength, etaMinutes,
    workedHours, timerRunning,
    scheduleConflicts, onLeave, DEFAULT_TASK_HOURS,
    amountDue, agingBucket, reminderDue,
    reviewsPlural, cidOf, localParts
};
