'use strict';

/**
 * RevSerwis 9.0 — wspólna logika panelu klienta i paneli B2B:
 * tokeny e-mail, maile do klientów, oś czasu zlecenia, bezpieczny widok zlecenia (bez kosztów i notatek
 * wewnętrznych), powiązanie konta z kartą klienta w CRM oraz powiadomienia dla administratorów.
 */
const { createHash, randomBytes } = require('crypto');
const config = require('../config');
const { Client, Task } = require('../models');
const mail = require('./mail');
const notify = require('./notify');

/* ------------------------------------------------------------------ */
/* Tokeny (weryfikacja e-maila, reset hasła)                            */
/* ------------------------------------------------------------------ */

const hashToken = token => createHash('sha256').update(String(token)).digest('hex');

function createToken(hours = 24) {
    const token = randomBytes(32).toString('hex');
    return { token, hash: hashToken(token), expires: new Date(Date.now() + hours * 3_600_000) };
}

/* ------------------------------------------------------------------ */
/* E-mail                                                               */
/* ------------------------------------------------------------------ */

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);

function layout(title, bodyHtml, cta) {
    return `<div style="font-family:Arial,sans-serif;background:#0b0c0f;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#14161b;border-radius:14px;padding:28px;color:#e8eaee">
<div style="font-size:20px;font-weight:800;margin-bottom:18px">Rev<span style="color:#00F0BE">Serwis</span></div>
<h1 style="font-size:19px;margin:0 0 12px;color:#fff">${escapeHtml(title)}</h1>
<div style="font-size:15px;line-height:1.6;color:#c9ccd3">${bodyHtml}</div>
${cta ? `<p style="margin:22px 0 4px"><a href="${escapeHtml(cta.url)}" style="background:#00F0BE;color:#04110d;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block">${escapeHtml(cta.label)}</a></p>` : ''}
<p style="font-size:12px;color:#7d828c;margin-top:26px">RevSerwis · tel. 735 396 534 · kontakt@revserwis.pl · Rev Serwis Kacper Taczała, Słupsk</p>
</div></div>`;
}

/** Wysyła e-mail, jeśli poczta jest skonfigurowana. Nigdy nie rzuca błędem do wywołującego. */
async function sendMail({ to, subject, title, text, html, cta }) {
    if (!to || !mail.isConfigured()) return false;
    try {
        await mail.send({ to, subject, text: text + (cta ? `\n\n${cta.label}: ${cta.url}` : ''), html: layout(title || subject, html || escapeHtml(text).replace(/\n/g, '<br>'), cta) });
        return true;
    } catch (error) {
        console.error('[RevSerwis] E-mail do klienta nie wysłany:', error.message);
        return false;
    }
}

const accountUrl = path => `${config.publicUrl}/konto${path ? '#/' + path : ''}`;

function sendVerification(account, token) {
    return sendMail({
        to: account.email,
        subject: 'Potwierdź adres e-mail — konto RevSerwis',
        title: `Cześć ${account.name.split(' ')[0]}!`,
        text: 'Dziękujemy za założenie konta w RevSerwis. Potwierdź adres e-mail, aby w panelu pojawiły się też zlecenia zgłoszone wcześniej na ten adres.',
        cta: { label: 'Potwierdź e-mail', url: `${config.publicUrl}/konto?weryfikacja=${token}` }
    });
}

function sendReset(account, token) {
    return sendMail({
        to: account.email,
        subject: 'Reset hasła — konto RevSerwis',
        title: 'Ustaw nowe hasło',
        text: 'Otrzymaliśmy prośbę o zmianę hasła do Twojego konta RevSerwis. Link jest ważny 1 godzinę. Jeśli to nie Ty — zignoruj tę wiadomość.',
        cta: { label: 'Ustaw nowe hasło', url: `${config.publicUrl}/konto?reset=${token}` }
    });
}

/* ------------------------------------------------------------------ */
/* Śledzenie zlecenia                                                   */
/* ------------------------------------------------------------------ */

const STATUS_LABELS = {
    new: 'Przyjęte — czekamy na wycenę',
    quoted: 'Wycena gotowa',
    planned: 'Zaplanowane',
    progress: 'W realizacji',
    completed: 'Zakończone',
    cancelled: 'Anulowane'
};
const ORDER = ['new', 'quoted', 'planned', 'progress', 'completed'];

/** Kroki osi czasu (jak u kuriera). */
function timeline(task) {
    const idx = ORDER.indexOf(task.status);
    const cancelled = task.status === 'cancelled';
    const steps = [
        { key: 'new', label: 'Zgłoszenie przyjęte', at: task.createdAt, icon: 'fa-inbox' },
        { key: 'quoted', label: task.clientAcceptedAt ? 'Wycena zaakceptowana' : 'Wycena', at: task.clientAcceptedAt || null, icon: 'fa-file-invoice-dollar' },
        { key: 'planned', label: 'Termin potwierdzony', at: idx >= 2 ? task.dateStart : null, icon: 'fa-calendar-check' },
        { key: 'progress', label: 'Ekipa w drodze / w realizacji', at: task.etaAt || null, icon: 'fa-truck-fast' },
        { key: 'completed', label: 'Zakończone', at: task.completedAt || null, icon: 'fa-circle-check' }
    ];
    return steps.map((s, i) => ({ ...s, done: !cancelled && idx >= i, current: !cancelled && idx === i }))
        .concat(cancelled ? [{ key: 'cancelled', label: 'Anulowane', at: task.updatedAt, icon: 'fa-ban', done: true, current: true }] : []);
}

function estimateOf(task) {
    if (task.aiEstimate && task.aiEstimate.high) return { low: task.aiEstimate.low, high: task.aiEstimate.high, source: 'revbot' };
    if (task.price > 0) return { low: task.price, high: task.priceMax || task.price, source: 'admin' };
    return null;
}

const firstName = name => String(name || '').trim().split(/\s+/)[0] || '';

/** Widok zlecenia dla klienta — bez kosztów, zysku, notatek wewnętrznych i danych RevBota. */
function clientTask(task, { media = [] } = {}) {
    const status = task.status;
    const planned = ['planned', 'progress', 'completed'].includes(status);
    const estimate = ['new'].includes(status) ? (task.aiEstimate && task.aiEstimate.high ? { low: task.aiEstimate.low, high: task.aiEstimate.high, source: 'revbot', preliminary: true } : null) : estimateOf(task);
    return {
        id: String(task._id),
        number: task.number,
        name: String(task.name || '').replace(/^(Wycena RevBot|Wycena|Oględziny): /, ''),
        type: task.type,
        division: task.division || '',
        status,
        statusLabel: STATUS_LABELS[status] || status,
        portalKind: task.portalKind || 'client',
        quoteType: task.quoteType || '',
        estimate,
        finalPrice: status === 'completed' ? (task.finalPrice ?? task.price ?? null) : null,
        paymentStatus: task.paymentStatus || 'unpaid',
        preferredDate: task.clientPreferredDate || '',
        dateStart: planned ? task.dateStart : null,
        dateEnd: planned ? task.dateEnd : null,
        etaAt: ['planned', 'progress'].includes(status) ? task.etaAt || null : null,
        trackingNote: task.trackingNote || '',
        // 9.2: ekipa w drodze / na miejscu — klient widzi pozycję na mapie
        live: ['planned', 'progress'].includes(status) && Boolean((task.onTheWayAt && Date.now() - new Date(task.onTheWayAt).getTime() < 12 * 3_600_000) || status === 'progress'),
        address: task.address || '',
        addressFrom: task.addressFrom || '',
        addressTo: task.addressTo || '',
        description: String(task.desc || '').replace(/^Termin zgłoszony przez klienta:[^\n]*\n\n?/, ''),
        crew: planned ? (task.workers || []).map(w => firstName(w.name)).filter(Boolean) : [],
        vehicle: planned && task.car ? String(task.car).replace(/\s*\(.*\)$/, '') : '',
        photos: media.filter(m => m.kind === 'before' || m.kind === 'after').map(m => ({ id: String(m._id), kind: m.kind })),
        quotePhotoCount: task.quotePhotoCount || 0,
        timeline: timeline(task),
        canAccept: status === 'quoted' && !task.clientAcceptedAt,
        accepted: Boolean(task.clientAcceptedAt),
        canCancel: ['new', 'quoted'].includes(status) || (status === 'planned' && !task.clientCancelRequestedAt),
        cancelRequested: Boolean(task.clientCancelRequestedAt),
        canRate: status === 'completed' && !task.clientRating,
        rating: task.clientRating || null,
        feedback: task.clientFeedback || '',
        addons: (task.addons || []).map(a => ({ name: a.name, qty: a.qty, unit: a.unit, total: a.total })),
        addonsTotal: task.addonsTotal || 0,
        chatUnread: task.chatUnreadClient || 0,
        canChat: task.status !== 'cancelled',
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        completedAt: task.completedAt || null
    };
}

/** Filtr zleceń widocznych dla konta: przypisane do konta + (po weryfikacji e-maila) zgłoszone na ten adres. */
function accountTaskFilter(account) {
    const or = [{ account: account._id }];
    if (account.emailVerified && account.email) or.push({ clientEmail: account.email });
    return { $or: or };
}

/** Karta klienta w CRM RevMi — szuka po e-mailu / telefonie, w razie potrzeby tworzy. */
async function ensureClient(account) {
    try {
        if (account.client) return account.client;
        const or = [{ email: account.email }];
        if (account.phone) or.push({ phone: account.phone });
        let client = await Client.findOne({ $or: or, archived: { $ne: true } });
        if (!client) {
            client = await Client.create({
                name: account.name,
                company: account.company || '',
                type: account.kind === 'company' ? 'company' : 'person',
                phone: account.phone || '',
                email: account.email,
                nip: account.nip || '',
                source: 'Panel klienta',
                notes: 'Konto w panelu klienta /konto'
            });
        }
        account.client = client._id;
        await account.constructor.updateOne({ _id: account._id }, { $set: { client: client._id } });
        return client._id;
    } catch (error) {
        console.error('[RevSerwis] Nie powiązano konta z CRM:', error.message);
        return null;
    }
}

/* ------------------------------------------------------------------ */
/* Powiadomienia                                                        */
/* ------------------------------------------------------------------ */

async function notifyAdmins({ type = 'portal', title, body, url, dedupeKey }) {
    try {
        return await notify.notify({ type, title, body, url, recipients: await notify.adminKeys(), dedupeKey });
    } catch (error) {
        console.error('[RevSerwis] Powiadomienie portalu:', error.message);
        return null;
    }
}

const fmtDate = d => new Intl.DateTimeFormat('pl-PL', { timeZone: config.timeZone, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(d));

/**
 * Wywoływane po każdej zmianie zlecenia w RevMi. Klient z kontem (powiązany przez account) dostaje e-mail,
 * gdy zmieni się status albo termin. Błędy nie wpływają na zapis zlecenia.
 */
async function taskChanged(task, before) {
    try {
        if (!task || !task.account) return;
        const statusChanged = !before || before.status !== task.status;
        const dateChanged = before && ['planned', 'progress'].includes(task.status) &&
            new Date(before.dateStart).getTime() !== new Date(task.dateStart).getTime();
        if (!statusChanged && !dateChanged) return;
        const { Account } = require('../models-v9');
        const account = await Account.findById(task.account).select('email name notifyEmail status').lean();
        if (!account || account.status !== 'active' || account.notifyEmail === false) return;

        const t = clientTask(task);
        let text;
        if (task.status === 'quoted' && t.estimate) text = `Przygotowaliśmy wycenę zlecenia ${task.number}: ${t.estimate.low}${t.estimate.high !== t.estimate.low ? '–' + t.estimate.high : ''} zł. Możesz ją zaakceptować w panelu klienta.`;
        else if (task.status === 'planned') text = `Zlecenie ${task.number} jest zaplanowane na ${fmtDate(task.dateStart)}.`;
        else if (task.status === 'progress') text = `Zlecenie ${task.number} jest w realizacji — nasza ekipa jest w drodze lub już działa.${task.etaAt ? ' Przewidywany przyjazd: ' + fmtDate(task.etaAt) + '.' : ''}`;
        else if (task.status === 'completed') text = `Zlecenie ${task.number} zostało zakończone. Dziękujemy! W panelu znajdziesz zdjęcia z realizacji i możesz ocenić naszą pracę.`;
        else if (task.status === 'cancelled') text = `Zlecenie ${task.number} zostało anulowane. Jeśli to pomyłka — zadzwoń: 735 396 534.`;
        else return;

        await sendMail({
            to: account.email,
            subject: `${t.statusLabel} — ${task.number} · RevSerwis`,
            title: t.statusLabel,
            text,
            cta: { label: 'Zobacz w panelu', url: accountUrl('zlecenia/' + task._id) }
        });
    } catch (error) {
        console.error('[RevSerwis] Powiadomienie klienta:', error.message);
    }
}

/** Numer dokumentu, np. OUT/2026/014 (z atomowego licznika w MongoDB). */
function nextNumber(prefix) {
    return require('./numbers').nextNumber(prefix);
}

/** Tworzy zlecenie w RevMi (status „new”, trafia do Wycen) z danych portalu. */
async function createPortalTask(fields) {
    const task = await Task.create({
        status: 'new',
        price: 0,
        dateStart: fields.dateStart || new Date(),
        source: fields.source || 'Panel klienta',
        discordPending: Boolean(config.discordWebhookUrl),
        discordNextAttempt: new Date(),
        ...fields
    });
    void notify.newQuote(task.toObject());
    try { void require('./discord').flushDiscord(); } catch { /* ignore */ }
    return task;
}

module.exports = {
    hashToken, createToken, sendMail, sendVerification, sendReset, accountUrl,
    STATUS_LABELS, timeline, clientTask, accountTaskFilter, ensureClient,
    notifyAdmins, taskChanged, nextNumber, createPortalTask, escapeHtml
};
