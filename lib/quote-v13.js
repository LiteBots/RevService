'use strict';

/**
 * RevSerwis 13 — walidacja szczegółowego formularza wyceny (wycena.html → POST /api/quotes/v13).
 * Bez wyceny AI: zgłoszenie trafia do „Wycen” w RevMi, klient dostaje informację „wycena do 24 h”.
 * Czyste funkcje (bez bazy) — testy: tests/v13.test.js.
 */
const { createHash } = require('crypto');
const C = require('./quote-form');

function bad(message) {
    const e = new Error(message);
    e.status = 400;
    throw e;
}

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = v => (Array.isArray(v) ? v : []);

function text(value, max, label, { required = false, min = 0 } = {}) {
    if (value === undefined || value === null) value = '';
    if (typeof value === 'number') value = String(value);
    if (typeof value !== 'string') bad('Nieprawidłowe pole: ' + label);
    const v = value.replace(/\s+/g, ' ').trim();
    if (v.length > max) bad(`Pole „${label}” jest za długie (maks. ${max} znaków).`);
    if (required && v.length < Math.max(1, min)) bad(`Uzupełnij pole „${label}”.`);
    return v;
}

function longText(value, max, label) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') bad('Nieprawidłowe pole: ' + label);
    const v = value.replace(/\r/g, '').trim();
    if (v.length > max) bad(`Pole „${label}” jest za długie (maks. ${max} znaków).`);
    return v;
}

function num(value, label, { max = 100000, required = false, integer = true } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) bad(`Uzupełnij pole „${label}”.`);
        return null;
    }
    const n = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > max) bad(`Sprawdź pole „${label}”.`);
    return integer ? Math.round(n) : Math.round(n * 10) / 10;
}

const oneOf = (value, list) => (list.includes(value) ? value : '');

function phone(value) {
    const raw = text(value, 40, 'Telefon', { required: true });
    let digits = raw.replace(/\D/g, '');
    if (raw.startsWith('00')) digits = digits.slice(2);
    if (!/^[+\d\s()-]+$/.test(raw) || digits.length < 9 || digits.length > 15) bad('Wpisz prawidłowy numer telefonu (np. 600 123 456).');
    return (raw.startsWith('+') || raw.startsWith('00') ? '+' : '') + digits;
}

function place(input, label, { required, building = true }) {
    const p = obj(input);
    const address = text(p.address, 220, `${label}: adres`, { required, min: 5 });
    if (!address) return null;
    const floorRaw = p.floor === '' || p.floor === undefined || p.floor === null ? null : Number(p.floor);
    if (floorRaw !== null && (!Number.isInteger(floorRaw) || floorRaw < -2 || floorRaw > 40)) bad(`${label}: sprawdź piętro.`);
    if (required && building && floorRaw === null) bad(`${label}: podaj piętro (0 = parter).`);
    const lift = oneOf(p.lift, C.LIFTS);
    if (required && building && !lift) bad(`${label}: zaznacz, czy jest winda.`);
    return {
        address,
        floor: floorRaw,
        lift,
        parking: oneOf(p.parking, C.PARKING),
        place: oneOf(p.place, C.PLACES),
        note: text(p.note, 200, `${label}: uwagi`)
    };
}

function answers(service, input) {
    const a = obj(input);
    const out = {};
    for (const f of service.fields) {
        const v = a[f.id];
        if (f.type === 'chips') {
            const list = (f.multi ? arr(v) : [v]).filter(x => typeof x === 'string' && f.options.includes(x));
            if (f.required && !list.length) bad(`Zaznacz: „${f.label}”.`);
            if (list.length) out[f.id] = f.multi ? Array.from(new Set(list)) : list[0];
        } else if (f.type === 'number') {
            const n = num(v, f.label, { max: f.max || 100000, required: f.required });
            if (n !== null) out[f.id] = n;
        } else if (f.type === 'time') {
            const t = text(v, 5, f.label, { required: f.required });
            if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) bad(`Sprawdź pole „${f.label}”.`);
            if (t) out[f.id] = t;
        } else {
            const t = text(v, f.max || 200, f.label, { required: f.required });
            if (t) out[f.id] = t;
        }
    }
    return out;
}

function items(input, service) {
    const list = arr(input);
    if (list.length > C.MAX_ITEMS) bad(`Maksymalnie ${C.MAX_ITEMS} pozycji na liście rzeczy.`);
    const out = [];
    for (const raw of list) {
        const it = obj(raw);
        const name = text(it.name, 120, 'Nazwa przedmiotu');
        if (!name) continue;
        const qty = num(it.qty, `Ilość: ${name}`, { max: 1000, required: true });
        if (!qty) bad(`Podaj ilość dla: ${name}.`);
        out.push({
            room: service.rooms ? (oneOf(it.room, C.ROOMS) || text(it.room, 40, 'Pomieszczenie')) : '',
            name,
            qty,
            flags: Array.from(new Set(arr(it.flags).filter(f => C.ITEM_FLAGS.includes(f)))),
            note: text(it.note, 160, `Uwagi: ${name}`)
        });
    }
    if (service.items === 'required' && !out.length) bad('Dodaj przynajmniej jedną rzecz do listy i podaj ilość.');
    return out;
}

function quantities(input, catalog, label) {
    const out = [];
    for (const raw of arr(input).slice(0, catalog.length)) {
        const it = obj(raw);
        const def = catalog.find(c => c.id === it.id);
        if (!def || out.some(o => o.id === def.id)) continue;
        const qty = num(it.qty, def.name, { max: 100000, integer: false });
        out.push({ id: def.id, name: def.name, unit: def.unit, qty: qty || 0, note: text(it.note, 200, `Uwagi: ${def.name}`) });
    }
    if (!out.length) bad(`Zaznacz przynajmniej jedną pozycję: ${label}.`);
    return out;
}

function validateQuoteV13(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) bad('Nieprawidłowe zgłoszenie.');
    for (const k of Object.keys(input)) if (BAD_KEYS.has(k)) bad('Nieprawidłowe zgłoszenie.');
    if (input.website) bad('Nie udało się przyjąć zgłoszenia. Zadzwoń: 735 396 534.');
    if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId)) bad('Odśwież stronę i spróbuj ponownie.');
    if (input.consent !== true) bad('Zaznacz zgodę na kontakt w sprawie wyceny.');

    const service = C.BY_ID[input.service];
    if (!service) bad('Wybierz usługę.');

    const building = service.id !== "przewoz";
    const from = place(input.from, service.route ? "Skąd" : "Adres", { required: true, building });
    const to = service.route ? place(input.to, "Dokąd", { required: true, building }) : null;
    if (service.id === 'przewoz' && !to) bad('Dokąd: podaj adres docelowy.');

    const form = {
        v: 13,
        service: service.id,
        serviceName: service.name,
        answers: answers(service, input.answers),
        from,
        to,
        items: service.items ? items(input.items, service) : [],
        waste: service.waste ? quantities(input.waste, C.WASTE, 'rodzaj odpadów') : [],
        works: service.works ? quantities(input.works, C.DEMOLITION, 'prace rozbiórkowe') : [],
        extras: Array.from(new Set(arr(input.extras).filter(x => service.extras.includes(x))))
    };

    const s = obj(input.schedule);
    let date = text(s.date, 10, 'Data');
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) date = '';
    form.schedule = { date, time: oneOf(s.time, C.TIMES) || 'Obojętnie', flexible: s.flexible === true };

    const description = longText(input.description, 3000, 'Opis');
    const photos = arr(input.photos);
    if (photos.length > C.MAX_PHOTOS) bad(`Maksymalnie ${C.MAX_PHOTOS} zdjęć.`);
    for (const data of photos) {
        if (typeof data !== 'string' || data.length > 1_400_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) bad('Nieprawidłowy plik zdjęcia.');
    }

    const c = obj(input.contact);
    const name = text(c.name, 140, 'Imię i nazwisko', { required: true, min: 2 });
    const email = text(c.email, 160, 'E-mail').toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad('Sprawdź adres e-mail.');
    const contact = { name, phone: phone(c.phone), email, company: text(c.company, 200, 'Firma'), nip: text(c.nip, 20, 'NIP') };

    return { requestId: input.requestId, form, description, photos, contact };
}

/* ------------------------------------------------------------------ */
/* Czytelne podsumowanie (RevMi, SMS / Discord, opis zlecenia)          */
/* ------------------------------------------------------------------ */

const floorText = f => (f === null || f === undefined ? '' : f === 0 ? 'parter' : f < 0 ? `${f} (piwnica)` : `${f}. piętro`);

function placeLine(p) {
    if (!p) return '';
    return [p.address, p.place, floorText(p.floor), p.lift, p.parking ? 'parking ' + p.parking : '', p.note].filter(Boolean).join(', ');
}

function answerText(service, form) {
    return service.fields
        .filter(f => form.answers[f.id] !== undefined)
        .map(f => [f.label, Array.isArray(form.answers[f.id]) ? form.answers[f.id].join(', ') : String(form.answers[f.id])]);
}

function itemLine(i) {
    return `${i.qty} × ${i.name}${i.flags.length ? ' (' + i.flags.join(', ') + ')' : ''}${i.note ? ' — ' + i.note : ''}`;
}

/** Map<string,string> dla starszych widoków RevMi (maks. 60 kluczy, wartości do 200 znaków). */
function detailsMap(q) {
    const f = q.form;
    const service = C.BY_ID[f.service];
    const out = {};
    const put = (k, v) => { if (v !== '' && v !== null && v !== undefined) out[String(k).replace(/[.$]/g, '').slice(0, 80)] = String(v).slice(0, 200); };
    put(service.route ? 'Skąd' : 'Adres', placeLine(f.from));
    if (f.to) put('Dokąd', placeLine(f.to));
    for (const [k, v] of answerText(service, f)) put(k, v);
    if (f.items.length) put('Rzeczy (razem)', `${f.items.reduce((s, i) => s + i.qty, 0)} szt. w ${f.items.length} pozycjach`);
    for (const w of f.waste) put('Odpady: ' + w.name, `${w.qty || '?'} ${w.unit}${w.note ? ' — ' + w.note : ''}`);
    for (const w of f.works) put('Prace: ' + w.name, `${w.qty || '?'} ${w.unit}${w.note ? ' — ' + w.note : ''}`);
    if (f.extras.length) put('Dodatkowo', f.extras.join(', '));
    put('Termin', [f.schedule.date || 'do ustalenia', f.schedule.time, f.schedule.flexible ? 'elastycznie' : ''].filter(Boolean).join(' · '));
    if (q.contact.company || q.contact.nip) put('Firma', [q.contact.company, q.contact.nip ? 'NIP ' + q.contact.nip : ''].filter(Boolean).join(' · '));
    return Object.fromEntries(Object.entries(out).slice(0, 60));
}

/** Pełny opis tekstowy (pole „Opis” zlecenia) — także pełna lista rzeczy pokój po pokoju. */
function descriptionText(q) {
    const f = q.form;
    const lines = [`Termin zgłoszony przez klienta: ${f.schedule.date || 'Do ustalenia'} · ${f.schedule.time}${f.schedule.flexible ? ' · elastycznie' : ''}`, ''];
    if (f.items.length) {
        lines.push('LISTA RZECZY:');
        const rooms = [...new Set(f.items.map(i => i.room || ''))];
        for (const r of rooms) {
            if (r) lines.push(`[${r}]`);
            for (const i of f.items.filter(x => (x.room || '') === r)) lines.push('• ' + itemLine(i));
        }
        lines.push('');
    }
    if (f.waste.length) { lines.push('ODPADY:'); for (const w of f.waste) lines.push(`• ${w.name}: ${w.qty || '?'} ${w.unit}${w.note ? ' — ' + w.note : ''}`); lines.push(''); }
    if (f.works.length) { lines.push('PRACE:'); for (const w of f.works) lines.push(`• ${w.name}: ${w.qty || '?'} ${w.unit}${w.note ? ' — ' + w.note : ''}`); lines.push(''); }
    if (f.extras.length) lines.push('Dodatkowo: ' + f.extras.join(', '), '');
    lines.push(q.description || '(bez dodatkowego opisu)');
    return lines.join('\n').slice(0, 4000);
}

/** Sugerowana liczba osób w ekipie (podpowiedź dla biura, nie dla klienta). */
function suggestedCrew(form) {
    if (form.service === 'przewoz') return 1;
    let crew = 2;
    const heavy = form.items.some(i => i.flags.includes('ciężkie') || /pianino|sejf/i.test(i.name));
    const high = [form.from, form.to].some(p => p && p.floor >= 3 && p.lift === 'Brak windy');
    const many = form.items.reduce((s, i) => s + i.qty, 0) > 60;
    if (heavy) crew += 1;
    if (high && many) crew += 1;
    if (form.service === 'rozbiorki' && form.works.reduce((s, w) => s + (w.unit === 'm²' ? w.qty : 0), 0) > 60) crew += 1;
    return Math.min(crew, 5);
}

function fingerprint(q) {
    return createHash('sha256').update(JSON.stringify([
        q.form, q.description, q.contact,
        q.photos.map(p => createHash('sha256').update(p).digest('hex'))
    ])).digest('hex');
}

/** Termin odpowiedzi: 24 h od zgłoszenia. */
const QUOTE_HOURS = 24;

module.exports = { validateQuoteV13, detailsMap, descriptionText, suggestedCrew, fingerprint, placeLine, floorText, itemLine, QUOTE_HOURS };
