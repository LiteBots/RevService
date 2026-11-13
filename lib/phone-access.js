'use strict';

/**
 * 12.0: panel klienta po numerze telefonu — czyste funkcje (bez bazy), testowane w tests/phone-portal.test.js.
 *
 * Klucz telefonu (phoneKey): same cyfry; polskie numery sprowadzone do 9 cyfr (bez 48 / +48 / 0048),
 * zagraniczne — pełny numer z prefiksem kraju (bez + / 00). Ten sam numer wpisany jako „+48 600-000-000”,
 * „600000000” czy „0048 600 000 000” daje ten sam klucz.
 */
const { createHash, randomInt } = require('crypto');

function bad(message, status = 400) {
    const e = new Error(message);
    e.status = status;
    throw e;
}

/** '' gdy numer jest niepoprawny. */
function phoneKey(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw.length > 40 || !/^[+\d\s()./-]+$/.test(raw)) return '';
    const intl = raw.startsWith('+') || raw.startsWith('00');
    let d = raw.replace(/\D/g, '');
    if (raw.startsWith('00')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('48')) d = d.slice(2);
    if (d.length === 9) return d;
    return intl && d.length >= 10 && d.length <= 15 ? d : '';
}

/**
 * Wyrażenie dopasowujące zapisany w zleceniu numer (dowolny format) do klucza — dla starszych zleceń bez clientPhoneKey.
 * Kotwiczone na początku i końcu: „600000000” NIE dopasuje „+44 1600000000”.
 */
function phoneRegex(key) {
    if (!/^\d{7,15}$/.test(key)) return null;
    const digits = key.split('').join('\\D*');
    const prefix = key.length === 9 ? '(?:(?:\\+|00)?\\D*4\\D*8)?' : '(?:\\+|00)?';
    return new RegExp('^\\D*' + prefix + '\\D*' + digits + '\\D*$');
}

/** Numer do wyświetlenia: „+48 600 *** 789”. */
function maskPhone(key) {
    if (key.length === 9) return `+48 ${key.slice(0, 3)} *** ${key.slice(6)}`;
    return `+${key.slice(0, key.length - 6)} *** ${key.slice(-3)}`;
}

/** Numer w formacie bramki SMS (48XXXXXXXXX). */
function smsNumber(key) {
    return key.length === 9 ? '48' + key : key;
}

function newCode() {
    return String(randomInt(100000, 1000000));
}

function hashCode(key, code) {
    return createHash('sha256').update(`revserwis-phone:${key}:${code}`).digest('hex');
}

function validatePhone(input) {
    const key = phoneKey(input);
    if (!key) bad('Wpisz prawidłowy numer telefonu (np. 600 000 000). Dla numerów zagranicznych dodaj prefiks kraju.');
    return key;
}

function validateCode(input) {
    const code = String(input ?? '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) bad('Kod ma 6 cyfr.');
    return code;
}

/** Numer zlecenia z SMS-a / e-maila / wyceny (np. RV/2026/0123, RV-0123). Porównujemy bez wielkości liter i separatorów. */
function normalizeNumber(input) {
    const v = String(input ?? '').trim().toUpperCase();
    if (v.length < 3 || v.length > 40 || !/^[A-Z0-9/ ._-]+$/.test(v)) bad('Wpisz numer zlecenia, np. z SMS-a lub wyceny.');
    return v.replace(/[^A-Z0-9]/g, '');
}

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 30 * 60 * 1000;
const SESSION_MS = 12 * 60 * 60 * 1000;

const smsText = code => `RevSerwis: Twój kod do panelu klienta to ${code}. Ważny 10 minut. Nie podawaj go nikomu — nie dzwonimy z prośbą o kod.`;

module.exports = {
    phoneKey, phoneRegex, maskPhone, smsNumber, newCode, hashCode, validatePhone, validateCode, normalizeNumber, smsText,
    CODE_TTL_MS, RESEND_MS, MAX_ATTEMPTS, LOCK_MS, SESSION_MS
};
