'use strict';

/**
 * 9.2: dziennik zmian i tryb offline.
 *
 * audit — zapisuje każdą zmianę (POST/PUT/PATCH/DELETE) w panelu RevMi: kto, kiedy, co (ścieżka, obiekt, status).
 * Treści żądań nie zapisujemy (zdjęcia, PIN-y) — tylko krótkie streszczenie znanych pól.
 *
 * idempotency — telefon w trybie offline kolejkuje akcje i wysyła je po odzyskaniu zasięgu z nagłówkiem
 * X-Idempotency-Key. Jeśli ta sama akcja dotrze drugi raz (np. zerwane połączenie przy odpowiedzi),
 * zwracamy zapamiętaną odpowiedź zamiast wykonywać ją ponownie.
 */
const { AuditLog, Idempotency } = require('../models-v11');
const { userKeyOf } = require('../utils');

const SKIP = /^\/api\/(tasks\/[a-f0-9]{24}\/location|push\/|notifications\/(read|seen)|v92\/2fa\/|login|logout)/;
const ENTITY = [
    [/^\/api\/tasks\/([a-f0-9]{24})/, 'Zlecenie'], [/^\/api\/tasks$/, 'Zlecenie'], [/^\/api\/clients\/?([a-f0-9]{24})?/, 'Klient'],
    [/^\/api\/employees\/?([a-f0-9]{24})?/, 'Pracownik'], [/^\/api\/(finances|expenses|incomes)\/?([a-f0-9]{24})?/, 'Finanse'],
    [/^\/api\/settings/, 'Ustawienia'], [/^\/api\/fleet\/?([a-f0-9]{24})?/, 'Flota'], [/^\/api\/offers\/?([a-f0-9]{24})?/, 'Oferta'],
    [/^\/api\/payroll/, 'Rozliczenia'], [/^\/api\/branches/, 'Oddział'], [/^\/api\/pricelist/, 'Cennik'], [/^\/api\/storage/, 'Magazyn'],
    [/^\/api\/v92\/leaves/, 'Urlop'], [/^\/api\/v92\/rules/, 'Automatyzacja'], [/^\/api\/v92\/(fuel|repairs|crew\/fuel)/, 'Flota'],
    [/^\/api\/v92\/receivables/, 'Należność'], [/^\/api\/v92\/dispatch/, 'Grafik'], [/^\/api\/v9\//, 'Moduły 9.x']
];
const SUMMARY_KEYS = ['status', 'name', 'action', 'kind', 'paymentStatus', 'finalPrice', 'price', 'systemRole', 'date', 'time', 'title', 'category'];

function summarize(body) {
    if (!body || typeof body !== 'object') return '';
    const parts = [];
    for (const k of SUMMARY_KEYS) {
        const v = body[k];
        if (v === undefined || v === null || typeof v === 'object') continue;
        parts.push(`${k}=${String(v).slice(0, 60)}`);
    }
    const keys = Object.keys(body).filter(k => !SUMMARY_KEYS.includes(k) && !/pin|password|secret|token|photo|data|code/i.test(k));
    if (keys.length) parts.push('pola: ' + keys.slice(0, 12).join(', '));
    return parts.join(' · ').slice(0, 500);
}

function audit(req, res, next) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const path = String(req.originalUrl || '').split('?')[0];
    if (!path.startsWith('/api/') || SKIP.test(path) || !req.user) return next();
    res.on('finish', () => {
        if (res.statusCode >= 500 || res.statusCode === 401) return;
        const hit = ENTITY.find(([re]) => re.test(path));
        const id = hit ? (path.match(/([a-f0-9]{24})/) || [])[1] || '' : '';
        AuditLog.create({
            actor: req.user.name || '', actorKey: userKeyOf(req.user), role: req.user.role || '',
            method: req.method, path: path.slice(0, 300), status: res.statusCode,
            entity: hit ? hit[1] : '', entityId: id, summary: summarize(req.body),
            ip: String(req.ip || '').slice(0, 64), ua: String(req.get('user-agent') || '').slice(0, 200)
        }).catch(() => null);
    });
    next();
}

function idempotency(req, res, next) {
    const key = req.get('X-Idempotency-Key');
    if (!key || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !/^[A-Za-z0-9_-]{8,80}$/.test(key) || !req.user) return next();
    const fullKey = userKeyOf(req.user) + ':' + key;
    Idempotency.findOne({ key: fullKey }).lean().then(hit => {
        if (hit) {
            res.setHeader('X-Idempotent-Replay', '1');
            return res.status(hit.status).json(hit.body);
        }
        const json = res.json.bind(res);
        res.json = body => {
            if (res.statusCode < 500) Idempotency.create({ key: fullKey, userKey: userKeyOf(req.user), status: res.statusCode, body }).catch(() => null);
            return json(body);
        };
        next();
    }, () => next());
}

module.exports = { audit, idempotency, summarize };
