'use strict';

/* Walidacja zgłoszenia z formularza „Wycena AI” (wycena.html → POST /api/quotes/ai). */
const { createHash } = require('crypto');
const catalog = require('../Public/assets/ai-services');

const MAX_PHOTOS = 6;
const TIMES = ['Rano', 'Popołudnie', 'Wieczór', 'Obojętnie'];
const URGENCY = ['Standardowo', 'Pilne (do 48 h)', 'Nie spieszy się'];
const CLIENTS = ['Klient prywatny', 'Firma'];

function bad(message) {
    const e = new Error(message);
    e.status = 400;
    throw e;
}

const text = (value, max, label, { required = false } = {}) => {
    if (value === undefined || value === null) value = '';
    if (typeof value !== 'string') bad('Nieprawidłowe pole: ' + label);
    const v = value.trim();
    if (v.length > max) bad(`Pole „${label}” jest za długie.`);
    if (required && !v) bad(`Uzupełnij pole „${label}”.`);
    return v;
};

const index = (value, list, fallback = 0) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n < list.length ? n : fallback;
};

function phone(value) {
    const raw = text(value, 40, 'Telefon', { required: true });
    let digits = raw.replace(/\D/g, '');
    if (raw.startsWith('00')) digits = digits.slice(2);
    if (!/^[+\d\s()-]+$/.test(raw) || digits.length < 7 || digits.length > 15) bad('Wpisz prawidłowy numer telefonu. Dla numerów zagranicznych dodaj prefiks.');
    return (raw.startsWith('+') || raw.startsWith('00') ? '+' : '') + digits;
}

function validateAiQuote(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) bad('Nieprawidłowe zgłoszenie.');
    if (input.website) bad('Nie udało się przyjąć zgłoszenia. Skontaktuj się telefonicznie.');
    if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId)) bad('Odśwież stronę i spróbuj ponownie.');
    if (input.consent !== true) bad('Potwierdź, że rozumiesz, iż wycena jest wstępna.');

    const rawServices = Array.isArray(input.services) ? input.services : [];
    if (!rawServices.length) bad('Wybierz przynajmniej jedną usługę.');
    if (rawServices.length > 8) bad('Wybierz maksymalnie 8 usług w jednym zgłoszeniu.');
    const seen = new Set();
    const services = [];
    for (const s of rawServices) {
        const id = s && typeof s.id === 'string' ? s.id : '';
        const def = catalog.BY_ID[id];
        if (!def) bad('Nieznana usługa.');
        if (seen.has(id)) continue;
        seen.add(id);
        const values = catalog.normalize(id, s.answers);
        services.push({ id, name: def.name, division: def.division, dept: def.dept, values, answers: catalog.readable(id, values) });
    }

    const loc = input.location && typeof input.location === 'object' ? input.location : {};
    const needsDest = services.some(s => catalog.BY_ID[s.id].dest);
    const address = text(loc.address, 220, 'Adres', { required: true });
    const destination = needsDest ? text(loc.destination, 220, 'Adres docelowy', { required: true }) : '';
    const kmRaw = Number(loc.km);
    const km = needsDest ? (Number.isFinite(kmRaw) ? Math.min(5000, Math.max(0, Math.round(kmRaw))) : 0) : 0;
    if (needsDest && km < 1) bad('Podaj przybliżoną odległość w km.');

    const description = text(input.description, 2000, 'Opis');
    if (services.some(s => s.id === 'other') && description.length < 15) bad('Opisz zlecenie (min. 15 znaków).');

    const photos = input.photos === undefined ? [] : input.photos;
    if (!Array.isArray(photos) || photos.length > MAX_PHOTOS) bad(`Maksymalnie ${MAX_PHOTOS} zdjęć.`);
    const cleanPhotos = photos.map(p => (p && typeof p === 'object' ? p.data : p));
    for (const data of cleanPhotos) {
        if (typeof data !== 'string' || data.length > 1_400_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) bad('Nieprawidłowy plik zdjęcia.');
    }

    const sched = input.schedule && typeof input.schedule === 'object' ? input.schedule : {};
    let date = text(sched.date, 20, 'Data');
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) date = '';

    const c = input.contact && typeof input.contact === 'object' ? input.contact : {};
    const name = text(c.name, 140, 'Imię i nazwisko', { required: true });
    if (name.length < 2) bad('Podaj imię i nazwisko.');
    const email = text(c.email, 160, 'E-mail').toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad('Sprawdź adres e-mail.');

    return {
        requestId: input.requestId,
        services,
        location: { address, destination, km },
        description,
        photos: cleanPhotos,
        schedule: { date, time: TIMES[index(sched.time, TIMES, 3)], urgency: URGENCY[index(sched.urgency, URGENCY, 0)], urgent: index(sched.urgency, URGENCY, 0) === 1 },
        contact: { client: CLIENTS[index(c.client, CLIENTS, 0)], name, phone: phone(c.phone), email, company: text(c.company, 200, 'Firma') },
        quoteType: input.quoteType === 'onsite' ? 'onsite' : 'free'
    };
}

/** Odcisk treści zgłoszenia — ten sam requestId z innymi danymi = konflikt (409). */
function fingerprintAi(q) {
    return createHash('sha256').update(JSON.stringify([
        q.services.map(s => [s.id, s.values]), q.location, q.description, q.schedule, q.contact, q.quoteType,
        q.photos.map(p => createHash('sha256').update(p).digest('hex'))
    ])).digest('hex');
}

/** Szczegóły do zapisania w zleceniu (Map<string,string>, max 60 kluczy). */
function detailsMap(q) {
    const out = {};
    const multi = q.services.length > 1;
    for (const s of q.services) {
        for (const [k, v] of Object.entries(s.answers)) {
            const key = (multi ? `${s.name} · ${k}` : k).replace(/[.$]/g, '').slice(0, 80);
            out[key] = String(v).slice(0, 200);
        }
    }
    if (q.services.length > 1) out['Usługi'] = q.services.map(s => s.name).join(', ').slice(0, 200);
    out['Pora dnia'] = q.schedule.time;
    out['Pilność'] = q.schedule.urgency;
    out['Klient'] = q.contact.client + (q.contact.company ? ' · ' + q.contact.company : '');
    if (q.location.km) out['Odległość'] = q.location.km + ' km';
    out['Rodzaj wyceny'] = q.quoteType === 'onsite' ? 'Płatna wycena z dojazdem' : 'Bezpłatne widełki (AI)';
    return Object.fromEntries(Object.entries(out).slice(0, 60));
}

module.exports = { validateAiQuote, fingerprintAi, detailsMap, MAX_PHOTOS, TIMES, URGENCY, CLIENTS };
