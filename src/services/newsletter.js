'use strict';

/**
 * 9.1: newsletter RevSerwis.
 *  - zapis z podwójnym potwierdzeniem (link w e-mailu) — wymóg zgody na informację handlową (RODO, UŚUDE),
 *  - konto klienta ze zgodą marketingową: potwierdzenie e-maila konta = potwierdzenie zapisu,
 *  - wypis jednym kliknięciem z każdej wiadomości,
 *  - kampanie wysyłane z kolejki w paczkach (nie blokują serwera, wznawiają się po restarcie).
 */
const { randomBytes } = require('crypto');
const config = require('../config');
const mail = require('./mail');
const portal = require('./portal');
const { NewsletterSubscriber, Campaign } = require('../models-v9');
const { renderCampaign, NEWSLETTER_TOPIC_LABELS } = require('../../lib/v10-input');
const { escapeRegex } = require('../utils');

const CONSENT_TEXT = 'Zgoda na otrzymywanie od Rev Serwis Kacper Taczała informacji handlowych (oferty, promocje, nowości) na podany adres e-mail. Zgodę można wycofać w każdej chwili linkiem w wiadomości.';
const BATCH = Number(process.env.NEWSLETTER_BATCH) || 25;

const unsubscribeUrl = s => `${config.publicUrl}/newsletter.html?wypisz=${s.unsubscribeToken}`;

/**
 * Zapis (lub ponowny zapis). Zwraca { status, needsConfirmation }.
 * active=true tylko gdy zgoda została już potwierdzona inną drogą (np. potwierdzony e-mail konta).
 */
async function subscribe({ email, name = '', city = '', topics = [], source = 'stopka', kind = '', account = null, active = false }) {
    let sub = await NewsletterSubscriber.findOne({ email });
    if (sub && sub.status === 'active') {
        const merged = [...new Set([...(sub.topics || []), ...topics])];
        await NewsletterSubscriber.updateOne({ _id: sub._id }, { $set: { topics: merged, ...(name && !sub.name ? { name } : {}), ...(city && !sub.city ? { city } : {}), ...(account && !sub.account ? { account } : {}) } });
        return { status: 'active', needsConfirmation: false, already: true };
    }
    const token = portal.createToken(24 * 14);
    const data = {
        email, name, city, topics, source, kind,
        status: active ? 'active' : 'pending',
        confirmTokenHash: active ? undefined : token.hash,
        unsubscribeToken: sub?.unsubscribeToken || randomBytes(24).toString('hex'),
        consentText: CONSENT_TEXT,
        consentAt: new Date(),
        confirmedAt: active ? new Date() : null,
        unsubscribedAt: null,
        ...(account ? { account } : {})
    };
    if (sub) {
        sub.set(data);
        await sub.save();
    } else {
        try {
            sub = await NewsletterSubscriber.create(data);
        } catch (error) {
            if (error.code !== 11000) throw error;
            return subscribe({ email, name, city, topics, source, kind, account, active });
        }
    }
    if (!active) await sendConfirmation(sub, token.token, topics);
    return { status: sub.status, needsConfirmation: !active };
}

function sendConfirmation(sub, token, topics = []) {
    const what = (topics.length ? topics : ['promocje']).map(t => NEWSLETTER_TOPIC_LABELS[t]).filter(Boolean).join(', ');
    return portal.sendMail({
        to: sub.email,
        subject: 'Potwierdź zapis na newsletter RevSerwis',
        title: 'Jeszcze jedno kliknięcie',
        text: `Potwierdź, że chcesz dostawać od RevSerwis: ${what}. Jeśli to nie Ty — zignoruj tę wiadomość, nie zapiszemy Cię.`,
        cta: { label: 'Potwierdzam zapis', url: `${config.publicUrl}/newsletter.html?potwierdz=${token}` }
    });
}

async function confirm(token) {
    const sub = await NewsletterSubscriber.findOne({ confirmTokenHash: portal.hashToken(token) });
    if (!sub) return null;
    sub.status = 'active';
    sub.confirmedAt = new Date();
    sub.confirmTokenHash = undefined;
    await sub.save();
    return sub;
}

async function unsubscribe(token) {
    const sub = await NewsletterSubscriber.findOne({ unsubscribeToken: token });
    if (!sub) return null;
    if (sub.status !== 'unsubscribed') {
        sub.status = 'unsubscribed';
        sub.unsubscribedAt = new Date();
        await sub.save();
        if (sub.account) {
            const { Account } = require('../models-v9');
            await Account.updateOne({ _id: sub.account }, { $set: { marketingConsent: false } });
        }
    }
    return sub;
}

/** Konto: zmiana zgody marketingowej w profilu / potwierdzenie e-maila. */
async function syncAccount(account) {
    try {
        if (account.marketingConsent) {
            return subscribe({ email: account.email, name: String(account.name || '').split(' ')[0], city: account.city || '', topics: account.kind === 'company' ? ['promocje', 'firmy', 'sezon'] : ['promocje', 'outlet', 'sezon'], source: 'konto', kind: account.kind, account: account._id, active: Boolean(account.emailVerified) });
        }
        await NewsletterSubscriber.updateOne({ email: account.email, status: { $ne: 'unsubscribed' } }, { $set: { status: 'unsubscribed', unsubscribedAt: new Date() } });
        return null;
    } catch (error) {
        console.error('[RevSerwis] Newsletter (konto):', error.message);
        return null;
    }
}

function segmentFilter(c) {
    const f = { status: 'active' };
    if (c.segment === 'person' || c.segment === 'company') f.kind = c.segment;
    if (c.segment === 'topic') f.topics = c.segmentValue;
    if (c.segment === 'city' && c.segmentValue) f.city = new RegExp('^' + escapeRegex(c.segmentValue.trim()) + '$', 'i');
    return f;
}

async function countSegment(c) {
    return NewsletterSubscriber.countDocuments(segmentFilter(c));
}

/** Start wysyłki: lista odbiorców zamrażana w momencie kliknięcia „Wyślij”. */
async function startCampaign(id) {
    const c = await Campaign.findById(id).select('+recipients');
    if (!c) throw Object.assign(new Error('Nie znaleziono kampanii'), { status: 404 });
    if (c.status !== 'draft') throw Object.assign(new Error('Ta kampania była już wysyłana.'), { status: 400 });
    if (!mail.isConfigured()) throw Object.assign(new Error('Poczta nie jest skonfigurowana (RESEND_API_KEY lub SMTP) — nie można wysłać kampanii.'), { status: 400 });
    const subs = await NewsletterSubscriber.find(segmentFilter(c)).select('_id').lean();
    if (!subs.length) throw Object.assign(new Error('Brak odbiorców w tym segmencie.'), { status: 400 });
    c.recipients = subs.map(s => ({ subscriber: s._id, status: 'queued' }));
    c.stats = { total: subs.length, sent: 0, failed: 0 };
    c.status = 'sending';
    c.startedAt = new Date();
    await c.save();
    setTimeout(() => processQueue().catch(() => null), 500);
    return c;
}

async function sendOne(c, sub) {
    const { html, text } = renderCampaign(c, { name: sub.name, unsubscribeUrl: unsubscribeUrl(sub), webUrl: config.publicUrl });
    await mail.send({ to: sub.email, subject: c.subject, text, html });
}

async function sendTest(c, to) {
    const fake = { name: 'Jan', unsubscribeToken: 'test' };
    const { html, text } = renderCampaign(c, { name: fake.name, unsubscribeUrl: unsubscribeUrl(fake), webUrl: config.publicUrl });
    await mail.send({ to, subject: '[TEST] ' + c.subject, text, html });
}

let running = false;
/** Jedna paczka wysyłki dla każdej trwającej kampanii. */
async function processQueue() {
    if (running || !mail.isConfigured()) return;
    running = true;
    try {
        const campaigns = await Campaign.find({ status: 'sending' }).select('+recipients');
        for (const c of campaigns) {
            const queued = c.recipients.filter(r => r.status === 'queued').slice(0, BATCH);
            if (!queued.length) {
                c.status = 'sent';
                c.finishedAt = new Date();
                await c.save();
                continue;
            }
            const subs = await NewsletterSubscriber.find({ _id: { $in: queued.map(r => r.subscriber) } }).lean();
            const byId = new Map(subs.map(s => [String(s._id), s]));
            for (const r of queued) {
                const s = byId.get(String(r.subscriber));
                if (!s || s.status !== 'active') { r.status = 'failed'; r.error = 'wypisany'; c.stats.failed++; continue; }
                try {
                    await sendOne(c, s);
                    r.status = 'sent';
                    c.stats.sent++;
                    await NewsletterSubscriber.updateOne({ _id: s._id }, { $set: { lastSentAt: new Date() }, $inc: { sentCount: 1 } });
                } catch (error) {
                    r.status = 'failed';
                    r.error = String(error.message).slice(0, 200);
                    c.stats.failed++;
                    await NewsletterSubscriber.updateOne({ _id: s._id }, { $inc: { bounces: 1 } });
                }
            }
            c.markModified('recipients');
            c.markModified('stats');
            if (!c.recipients.some(r => r.status === 'queued')) { c.status = 'sent'; c.finishedAt = new Date(); }
            await c.save();
        }
    } catch (error) {
        console.error('[RevSerwis] Newsletter — wysyłka:', error.message);
    } finally {
        running = false;
    }
}

module.exports = { CONSENT_TEXT, subscribe, sendConfirmation, confirm, unsubscribe, syncAccount, segmentFilter, countSegment, startCampaign, sendTest, processQueue, unsubscribeUrl };
