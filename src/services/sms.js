'use strict';

/**
 * SMS z prośbą o opinię w Google (po zakończeniu zlecenia, tylko za zgodą osoby, która zamyka zlecenie).
 * Bramka: SMSAPI.pl (zmienne SMSAPI_TOKEN i opcjonalnie SMS_SENDER — zarejestrowana nazwa nadawcy).
 * Bez skonfigurowanej bramki panel otwiera gotowego SMS-a w telefonie pracownika (link sms:).
 */
const TOKEN = () => process.env.SMSAPI_TOKEN || '';
const SENDER = () => process.env.SMS_SENDER || '';
const API = () => (process.env.SMSAPI_URL || 'https://api.smsapi.pl').replace(/\/$/, '');

const provider = () => (TOKEN() ? 'smsapi' : 'manual');

/** Numer w formacie 48XXXXXXXXX (lub międzynarodowy bez „+”). Zwraca '' dla niepoprawnego. */
function normalizePhone(value) {
    let d = String(value || '').replace(/[^\d+]/g, '');
    if (d.startsWith('+')) d = d.slice(1);
    else if (d.startsWith('00')) d = d.slice(2);
    d = d.replace(/\D/g, '');
    if (d.length === 9) d = '48' + d;
    return d.length >= 10 && d.length <= 15 ? d : '';
}

function reviewMessage(template, link) {
    const text = String(template || '').includes('{link}') ? String(template) : `${template || ''} {link}`;
    return text.replace('{link}', link || '').replace(/\s+/g, ' ').trim().slice(0, 480);
}

async function send(phone, message) {
    const to = normalizePhone(phone);
    if (!to) return { ok: false, status: 'failed', error: 'Nieprawidłowy numer telefonu klienta' };
    if (!TOKEN()) return { ok: false, status: 'manual', error: '' };
    try {
        const body = new URLSearchParams({ to, message, format: 'json', encoding: 'utf-8', normalize: '1' });
        if (SENDER()) body.set('from', SENDER());
        const res = await fetch(API() + '/sms.do', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + TOKEN(), 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            signal: AbortSignal.timeout(10000)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) return { ok: false, status: 'failed', error: String(data.message || data.error || 'HTTP ' + res.status).slice(0, 300) };
        return { ok: true, status: 'sent', id: data.list?.[0]?.id || '' };
    } catch (error) {
        return { ok: false, status: 'failed', error: String(error.message).slice(0, 300) };
    }
}

module.exports = { send, provider, normalizePhone, reviewMessage };
