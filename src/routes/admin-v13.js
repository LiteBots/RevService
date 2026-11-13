'use strict';

/**
 * RevSerwis 13 — API RevMi pod /api/v13:
 *  - POST /v13/quotes/:id/send        wyślij wycenę klientowi (cena, ekipa, termin, co obejmuje, ważność) → status „Wycena”,
 *                                     SMS z ceną i linkiem do panelu (gdy jest bramka SMS), widoczne w panelu klienta
 *  - Realizacje (strona „Opinie i realizacje”): lista, dodawanie ze zdjęciami przed / po, edycja, publikacja,
 *    import zdjęć z zakończonego zlecenia.
 * Uprawnienia: lib/v11-input.js → ROUTE_PERMS (/v13/quotes = „tasks”, /v13/realizacje = „sales”).
 */
const express = require('express');
const sharp = require('sharp');
const { Task, TaskMedia } = require('../models');
const { Realization } = require('../models-v13');
const { realizationView } = require('./public-v13');
const storage = require('../services/storage');
const portal = require('../services/portal');
const sms = require('../services/sms');
const config = require('../config');
const { requireAdmin, validateId } = require('../middleware/auth');
const { asyncRoute, httpError, isObjectId } = require('../utils');
const { recordActivity } = require('../services/activity');

const router = express.Router();
const money = n => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(n) + ' zł';

function numIn(v, label, { min = 0, max = 1e7, required = false } = {}) {
    if (v === undefined || v === null || v === '') {
        if (required) throw httpError(400, `Uzupełnij: ${label}`);
        return null;
    }
    const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
    if (!Number.isFinite(n) || n < min || n > max) throw httpError(400, `Sprawdź: ${label}`);
    return Math.round(n * 100) / 100;
}
const textIn = (v, max) => String(v ?? '').trim().slice(0, max);

/* ================================================================== */
/* Wyślij wycenę                                                        */
/* ================================================================== */

router.post('/v13/quotes/:id/send', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    if (!['new', 'quoted'].includes(task.status)) throw httpError(400, 'Wycenę można wysłać tylko dla nowego zgłoszenia albo poprawić istniejącą.');
    const before = task.toObject();
    const price = numIn(req.body?.price, 'Cena', { min: 1, required: true });
    const priceMax = numIn(req.body?.priceMax, 'Cena maks.');
    if (priceMax !== null && priceMax < price) throw httpError(400, 'Cena maksymalna nie może być niższa od ceny.');
    const people = numIn(req.body?.people, 'Liczba osób', { max: 30 });
    let validUntil = null;
    if (req.body?.validUntil) {
        validUntil = new Date(String(req.body.validUntil) + 'T23:59:00');
        if (Number.isNaN(validUntil.getTime())) throw httpError(400, 'Sprawdź datę ważności.');
    }

    task.set({
        price,
        priceMax: priceMax && priceMax > price ? priceMax : null,
        ...(people !== null ? { people } : {}),
        quoteNote: textIn(req.body?.note, 600),
        quoteProposedDate: textIn(req.body?.proposedDate, 120),
        quoteValidUntil: validUntil,
        quoteSentAt: new Date(),
        status: 'quoted',
        clientAcceptedAt: null
    });
    await task.save();
    await recordActivity('quote_sent', `Wysłano wycenę ${task.number}: ${money(price)}${task.priceMax ? '–' + money(task.priceMax) : ''}`, 'Task', task._id, req.user.name);
    void portal.taskChanged(task.toObject(), before);

    let smsResult = 'skipped';
    if (req.body?.sms !== false && task.clientPhone) {
        if (sms.provider() === 'smsapi') {
            const base = (config.publicUrl || 'https://www.revserwis.pl').replace(/\/$/, '');
            const text = `RevSerwis: wycena zlecenia ${task.number}: ${money(price)}${task.priceMax ? '–' + money(task.priceMax) : ''}${task.quoteProposedDate ? ', termin: ' + task.quoteProposedDate : ''}. Zaakceptuj w panelu: ${base}/konto lub zadzwoń 735 396 534.`;
            const sent = await sms.send(task.clientPhone, text.slice(0, 450));
            smsResult = sent.ok ? 'sent' : 'failed';
        } else smsResult = 'no-gateway';
    }
    res.json({ success: true, task, sms: smsResult });
}));

/* ================================================================== */
/* Realizacje                                                           */
/* ================================================================== */

const SERVICES = ['Przeprowadzki', 'Opróżnianie', 'Transport z wniesieniem', 'Odbiór odpadów', 'Rozbiórki i skuwanie', 'Przewóz osób'];

async function photoBuffer(dataUrl) {
    if (typeof dataUrl !== 'string' || dataUrl.length > 9_000_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) throw httpError(400, 'Nieprawidłowy plik zdjęcia (JPG, PNG lub WebP).');
    return toJpeg(Buffer.from(dataUrl.split(',')[1], 'base64'));
}
async function toJpeg(bytes) {
    try {
        return await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer();
    } catch {
        throw httpError(400, 'Nie można odczytać zdjęcia.');
    }
}

function meta(body, partial = false) {
    const out = {};
    const set = (k, v) => { if (!partial || body[k] !== undefined) out[k] = v; };
    const title = textIn(body.title, 140);
    if (!partial && title.length < 3) throw httpError(400, 'Podaj tytuł realizacji, np. „Opróżnienie piwnicy, Słupsk”.');
    if (partial && body.title !== undefined && title.length < 3) throw httpError(400, 'Tytuł jest za krótki.');
    set('title', title);
    set('service', SERVICES.includes(body.service) ? body.service : textIn(body.service, 40));
    set('city', textIn(body.city, 80));
    set('when', textIn(body.when, 40));
    set('summary', textIn(body.summary, 600));
    set('crew', textIn(body.crew, 80));
    if (body.published !== undefined) out.published = body.published === true || body.published === 'true';
    if (body.featured !== undefined) out.featured = body.featured === true || body.featured === 'true';
    if (body.sort !== undefined) out.sort = Number(body.sort) || 0;
    return out;
}

async function addPhotos(body) {
    const out = [];
    for (const kind of ['before', 'after']) {
        const list = Array.isArray(body[kind]) ? body[kind] : [];
        if (list.length > 8) throw httpError(400, 'Maksymalnie 8 zdjęć „przed” i 8 „po” na raz.');
        for (const d of list) {
            const data = await photoBuffer(d);
            out.push({ kind, data, contentType: 'image/jpeg', size: data.length });
        }
    }
    return out;
}

const adminView = r => ({ ...realizationView(r), published: Boolean(r.published), sort: r.sort || 0, task: r.task ? String(r.task) : null, createdAt: r.createdAt, createdBy: r.createdBy });

router.get('/v13/realizacje', requireAdmin, asyncRoute(async (req, res) => {
    const list = await Realization.find().sort({ featured: -1, sort: -1, createdAt: -1 }).limit(300).lean();
    res.json({ realizations: list.map(adminView), services: SERVICES });
}));

router.post('/v13/realizacje', requireAdmin, express.json({ limit: '60mb' }), asyncRoute(async (req, res) => {
    const photos = await addPhotos(req.body || {});
    const r = await Realization.create({ ...meta(req.body || {}), photos, createdBy: req.user.name });
    await recordActivity('realization_added', `Dodano realizację: ${r.title}`, 'Realization', r._id, req.user.name);
    res.status(201).json({ success: true, realization: adminView(r.toObject()) });
}));

router.put('/v13/realizacje/:id', requireAdmin, validateId, express.json({ limit: '60mb' }), asyncRoute(async (req, res) => {
    const r = await Realization.findById(req.params.id);
    if (!r) throw httpError(404, 'Nie znaleziono realizacji');
    r.set(meta(req.body || {}, true));
    const photos = await addPhotos(req.body || {});
    if (r.photos.length + photos.length > 30) throw httpError(400, 'Maksymalnie 30 zdjęć w jednej realizacji.');
    for (const p of photos) r.photos.push(p);
    await r.save();
    res.json({ success: true, realization: adminView(r.toObject()) });
}));

router.delete('/v13/realizacje/:id/zdjecia/:photoId', requireAdmin, validateId, asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.photoId)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const r = await Realization.findByIdAndUpdate(req.params.id, { $pull: { photos: { _id: req.params.photoId } } }, { new: true });
    if (!r) throw httpError(404, 'Nie znaleziono realizacji');
    res.json({ success: true, realization: adminView(r.toObject()) });
}));

router.delete('/v13/realizacje/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const r = await Realization.findByIdAndDelete(req.params.id);
    if (!r) throw httpError(404, 'Nie znaleziono realizacji');
    await recordActivity('realization_deleted', `Usunięto realizację: ${r.title}`, 'Realization', null, req.user.name);
    res.json({ success: true });
}));

router.get('/v13/realizacje/:id/zdjecia/:photoId', requireAdmin, validateId, asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.photoId)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const r = await Realization.findById(req.params.id).select('+photos.data').lean();
    const p = r && (r.photos || []).find(x => String(x._id) === req.params.photoId);
    if (!p || !p.data) throw httpError(404, 'Nie znaleziono zdjęcia');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(p.contentType || 'image/jpeg').send(p.data.buffer ? Buffer.from(p.data.buffer) : p.data);
}));

/** Zakończone zlecenia ze zdjęciami przed / po — do importu jako realizacja. */
router.get('/v13/realizacje-zlecenia', requireAdmin, asyncRoute(async (req, res) => {
    const tasks = await Task.find({ status: 'completed', $or: [{ 'mediaCount.before': { $gt: 0 } }, { 'mediaCount.after': { $gt: 0 } }] })
        .select('number name type address addressFrom addressTo completedAt mediaCount people').sort({ completedAt: -1 }).limit(80).lean();
    const used = new Set((await Realization.find({ task: { $in: tasks.map(t => t._id) } }).select('task').lean()).map(r => String(r.task)));
    res.json({ tasks: tasks.map(t => ({ id: String(t._id), number: t.number, name: t.name, type: t.type, place: t.address || [t.addressFrom, t.addressTo].filter(Boolean).join(' → '), completedAt: t.completedAt, before: t.mediaCount?.before || 0, after: t.mediaCount?.after || 0, people: t.people || 0, used: used.has(String(t._id)) })) });
}));

router.post('/v13/realizacje/ze-zlecenia/:id', requireAdmin, validateId, asyncRoute(async (req, res) => {
    const task = await Task.findById(req.params.id).lean();
    if (!task) throw httpError(404, 'Nie znaleziono zlecenia');
    const media = await TaskMedia.find({ task: task._id, kind: { $in: ['before', 'after'] } }).select('+data kind contentType storageKey').sort({ createdAt: 1 }).limit(24).lean();
    if (!media.length) throw httpError(400, 'To zlecenie nie ma zdjęć przed / po.');
    const photos = [];
    for (const m of media) {
        const raw = await storage.readMedia(m);
        if (!raw) continue;
        const data = await toJpeg(raw);
        photos.push({ kind: m.kind, data, contentType: 'image/jpeg', size: data.length });
    }
    if (!photos.length) throw httpError(400, 'Nie udało się odczytać zdjęć zlecenia.');
    const place = task.address || task.addressTo || task.addressFrom || '';
    const city = textIn(req.body?.city, 80) || place.split(',').pop().trim().replace(/^\d{2}-\d{3}\s*/, '');
    const r = await Realization.create({
        ...meta({
            title: req.body?.title || `${task.type || 'Realizacja'}${city ? ', ' + city : ''}`,
            service: req.body?.service || task.type,
            city,
            when: req.body?.when || (task.completedAt ? new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(new Date(task.completedAt)) : ''),
            summary: req.body?.summary || '',
            crew: req.body?.crew || (task.people ? `${task.people} os.` : ''),
            published: req.body?.published === undefined ? false : req.body.published
        }),
        photos,
        task: task._id,
        createdBy: req.user.name
    });
    await recordActivity('realization_added', `Realizacja ze zlecenia ${task.number}: ${r.title}`, 'Realization', r._id, req.user.name);
    res.status(201).json({ success: true, realization: adminView(r.toObject()) });
}));

module.exports = router;
