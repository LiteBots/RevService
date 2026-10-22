'use strict';

/**
 * Wysyłka e-maili z formularza kontaktowego na kontakt@revserwis.pl.
 *
 * Dwa sposoby (wystarczy jeden):
 *  1) RESEND_API_KEY — wysyłka przez API Resend (HTTPS, działa na każdym planie Railway),
 *  2) SMTP_HOST / SMTP_USER / SMTP_PASS — klasyczna skrzynka (np. poczta w hostingu domeny).
 *
 * Każda wiadomość jest najpierw zapisywana w MongoDB (panel → Wiadomości),
 * a e-mail wysyłany z kolejki z ponawianiem — nic nie ginie przy chwilowej awarii.
 */
const config = require('../config');
const { Message } = require('../models');
const { divisionName } = require('../../lib/divisions');

const MAX_ATTEMPTS = 8;
let transport = null;

const isConfigured = () => Boolean(config.mail.resendApiKey || (config.mail.smtp.host && config.mail.smtp.user));
const provider = () => (config.mail.resendApiKey ? 'resend' : config.mail.smtp.host ? 'smtp' : 'none');

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);

async function sendViaResend({ to, subject, text, html, replyTo }) {
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.mail.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: config.mail.from, to: [].concat(to), subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
        signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Resend HTTP ${response.status} ${detail.slice(0, 160)}`);
    }
}

async function sendViaSmtp({ to, subject, text, html, replyTo }) {
    if (!transport) {
        let nodemailer;
        try {
            nodemailer = require('nodemailer');
        } catch {
            throw new Error('Brak paczki nodemailer — uruchom npm install');
        }
        const { host, port, secure, user, pass } = config.mail.smtp;
        transport = nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined, connectionTimeout: 15_000, greetingTimeout: 15_000 });
    }
    await transport.sendMail({ from: config.mail.from, to, subject, text, html, replyTo });
}

async function send(mail) {
    if (config.mail.resendApiKey) return sendViaResend(mail);
    if (config.mail.smtp.host) return sendViaSmtp(mail);
    throw new Error('Poczta nie jest skonfigurowana (RESEND_API_KEY lub SMTP_HOST)');
}

function contactEmail(m) {
    const who = m.kind === 'company' ? `${m.company} (${m.name})` : m.name;
    const division = divisionName(m.division);
    const rows = [
        ['Typ', m.kind === 'company' ? 'Firma' : 'Osoba prywatna'],
        ['Imię i nazwisko', m.name],
        ...(m.kind === 'company' ? [['Firma', m.company], ['NIP', m.nip]] : []),
        ['E-mail', m.email],
        ['Telefon', m.phone],
        ['Temat', m.topic],
        ...(division ? [['Dział', division]] : [])
    ].filter(([, v]) => v);
    const panelUrl = `${config.publicUrl}/revmi/#/wiadomosci/${m._id}`;
    const subject = `[Kontakt] ${m.topic} — ${who}`;
    const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nWiadomość:\n${m.message}\n\nPanel: ${panelUrl}`;
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;max-width:640px">
<h2 style="margin:0 0 12px;font-size:18px">Nowa wiadomość z formularza kontaktowego</h2>
<table cellpadding="6" style="border-collapse:collapse;margin-bottom:14px">${rows.map(([k, v]) => `<tr><td style="color:#666;padding-right:14px">${escapeHtml(k)}</td><td><strong>${escapeHtml(v)}</strong></td></tr>`).join('')}</table>
<div style="white-space:pre-wrap;background:#f4f6f5;border-radius:8px;padding:14px;line-height:1.55">${escapeHtml(m.message)}</div>
<p style="margin-top:16px"><a href="${escapeHtml(panelUrl)}" style="color:#00a37e">Otwórz w panelu RevMi</a> · odpowiedz na ten e-mail, aby napisać do klienta.</p></div>`;
    return { to: config.mail.contactTo, subject, text, html, replyTo: m.email || undefined };
}

function autoReplyEmail(m) {
    const subject = 'RevSerwis — otrzymaliśmy Twoją wiadomość';
    const text = `Dzień dobry ${m.name},\n\ndziękujemy za wiadomość (temat: ${m.topic}). Odpowiemy najszybciej, jak to możliwe.\nW pilnych sprawach zadzwoń lub napisz na WhatsApp: 735 396 534.\n\nZespół RevSerwis\n${config.publicUrl}`;
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;line-height:1.6;max-width:600px"><p>Dzień dobry ${escapeHtml(m.name)},</p><p>dziękujemy za wiadomość (temat: <strong>${escapeHtml(m.topic)}</strong>). Odpowiemy najszybciej, jak to możliwe.</p><p>W pilnych sprawach zadzwoń lub napisz na WhatsApp: <a href="tel:+48735396534">735 396 534</a>.</p><p>Zespół RevSerwis<br><a href="${escapeHtml(config.publicUrl)}">${escapeHtml(config.publicUrl.replace(/^https?:\/\//, ''))}</a></p></div>`;
    return { to: m.email, subject, text, html, replyTo: config.mail.contactTo };
}

let busy = false;

/** Kolejka e-maili z ponawianiem (co 15 s, rosnące odstępy po błędach). */
async function flushMail() {
    if (busy || !isConfigured() || Message.db.readyState !== 1) return;
    busy = true;
    try {
        for (let i = 0; i < 5; i++) {
            const now = new Date();
            const message = await Message.findOneAndUpdate(
                { 'mail.pending': true, 'mail.nextAttempt': { $lte: now }, createdAt: { $gte: new Date(Date.now() - 7 * 86_400_000) } },
                { $set: { 'mail.nextAttempt': new Date(Date.now() + 5 * 60_000) } },
                { new: true }
            );
            if (!message) break;
            try {
                await send(contactEmail(message));
                await Message.updateOne({ _id: message._id }, { $set: { 'mail.pending': false, 'mail.sentAt': new Date(), 'mail.error': '' }, $inc: { 'mail.attempts': 1 } });
            } catch (error) {
                const attempts = (message.mail?.attempts || 0) + 1;
                const delay = Math.min(60, 2 ** attempts) * 60_000;
                await Message.updateOne({ _id: message._id }, {
                    $set: { 'mail.attempts': attempts, 'mail.error': String(error.message).slice(0, 300), 'mail.nextAttempt': new Date(Date.now() + delay), 'mail.pending': attempts < MAX_ATTEMPTS }
                });
                console.error('[RevMi] E-mail kontaktowy nie został wysłany:', error.message);
                break;
            }
        }
        const reply = await Message.findOneAndUpdate(
            { 'autoReply.pending': true, createdAt: { $gte: new Date(Date.now() - 86_400_000) } },
            { $set: { 'autoReply.pending': false } },
            { new: true }
        );
        if (reply?.email) {
            await send(autoReplyEmail(reply)).then(
                () => Message.updateOne({ _id: reply._id }, { $set: { 'autoReply.sentAt': new Date() } }),
                error => console.error('[RevMi] Autoodpowiedź nie została wysłana:', error.message)
            );
        }
    } catch (error) {
        console.error('[RevMi] Kolejka e-maili:', error.message);
    } finally {
        busy = false;
    }
}

function startMailQueue() {
    if (!isConfigured()) {
        console.warn('[RevMi] Poczta nie jest skonfigurowana — wiadomości z formularza trafią do panelu (Wiadomości), ale nie na e-mail. Ustaw RESEND_API_KEY albo SMTP_HOST/SMTP_USER/SMTP_PASS.');
    }
    const timer = setInterval(flushMail, 15_000);
    timer.unref();
    return timer;
}

module.exports = { send, flushMail, startMailQueue, isConfigured, provider, contactEmail, autoReplyEmail };
