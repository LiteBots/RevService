'use strict';

const { isDivision } = require('./divisions');

const TOPICS = [
    'Pytanie ogólne',
    'Wycena usługi',
    'Współpraca B2B',
    'Abonament RevFacility',
    'Zapis na RevWinter / Winter Care',
    'Magazynowanie RevStorage',
    'Reklamacja lub uwagi',
    'Praca w RevSerwis',
    'Inne'
];

function bad(message) {
    const error = new Error(message);
    error.status = 400;
    throw error;
}

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function normalizePhone(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    let digits = value.replace(/\D/g, '');
    if (value.startsWith('00')) digits = digits.slice(2);
    if (!/^[+\d\s()-]+$/.test(value) || digits.length < 7 || digits.length > 15) bad('Wpisz prawidłowy numer telefonu lub zostaw pole puste.');
    return (value.startsWith('+') || value.startsWith('00') ? '+' : '') + digits;
}

/** Walidacja formularza kontaktowego (osoby prywatne i firmy). */
function validateContact(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) bad('Nieprawidłowe zgłoszenie.');
    for (const [key, max] of Object.entries({ name: 140, company: 180, nip: 20, email: 160, phone: 40, topic: 80, division: 40, message: 5000, requestId: 80, kind: 10 })) {
        if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > max)) bad('Nieprawidłowe pole: ' + key);
    }
    if (input.website) bad('Nie udało się wysłać wiadomości. Zadzwoń lub napisz na WhatsApp.');
    if (input.consent !== true) bad('Zaznacz zgodę na kontakt w sprawie wiadomości.');

    const kind = input.kind === 'company' ? 'company' : 'person';
    const name = text(input.name, 140);
    const company = text(input.company, 180);
    const email = text(input.email, 160).toLowerCase();
    const message = text(input.message, 5000);
    const requestId = text(input.requestId, 80);
    const nip = text(input.nip, 20);

    if (name.length < 2) bad('Podaj imię i nazwisko.');
    if (kind === 'company' && company.length < 2) bad('Podaj nazwę firmy.');
    if (!EMAIL.test(email)) bad('Podaj prawidłowy adres e-mail — na niego odpowiemy.');
    if (message.length < 10) bad('Napisz kilka słów więcej w wiadomości (min. 10 znaków).');
    if (nip && !/^[A-Z]{0,2}[\d\s-]{8,16}$/i.test(nip)) bad('Nieprawidłowy NIP.');
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) bad('Odśwież stronę i spróbuj ponownie.');

    const topic = TOPICS.includes(text(input.topic, 80)) ? text(input.topic, 80) : 'Pytanie ogólne';
    const division = isDivision(input.division) ? input.division : '';

    return {
        kind, name, email, message, requestId, topic, division,
        company: kind === 'company' ? company : '',
        nip: kind === 'company' ? nip.replace(/\s/g, '') : '',
        phone: normalizePhone(input.phone)
    };
}

module.exports = { validateContact, TOPICS };
