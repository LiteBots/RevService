'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const config = require('../config');
const { Task, Message, mongoose } = require('../models');
const { validateQuote, preparePhotos, fingerprint } = require('../../lib/quote-input');
const { validateContact } = require('../../lib/contact-input');
const { validateAiQuote, fingerprintAi, detailsMap } = require('../../lib/ai-quote-input');
const aiQuote = require('../services/ai-quote');
const { divisionName } = require('../../lib/divisions');
const mail = require('../services/mail');
const { getSettings } = require('../services/settings');
const { asyncRoute } = require('../utils');
const { flushDiscord } = require('../services/discord');
const notify = require('../services/notify');
const { recordActivity } = require('../services/activity');

const router = express.Router();

router.get('/health', (req, res) => {
    res.json({
        ok: true,
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        authDisabled: config.authDisabled,
        version: '7.0.0',
        ai: config.ai.apiKey ? config.ai.model : 'fallback',
        mail: mail.provider()
    });
});

const quoteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Za dużo zgłoszeń. Spróbuj za 15 minut.' }
});

// Publiczny formularz wyceny (przed logowaniem); większy limit tylko dla zdjęć.
router.post('/quotes', quoteLimiter, express.json({ limit: '5mb' }), asyncRoute(async (req, res) => {
    const input = validateQuote(req.body);
    const hash = fingerprint(input);
    let task = await Task.findOne({ quoteRequestId: input.requestId }).select('+quoteFingerprint');
    let created = false;

    if (task && task.quoteFingerprint && task.quoteFingerprint !== hash) {
        return res.status(409).json({
            success: false,
            message: 'To zgłoszenie zostało już zapisane z innymi danymi. Odśwież stronę, aby wysłać nowe zapytanie.'
        });
    }

    if (!task) {
        const quotePhotos = await preparePhotos(input.photos);
        try {
            task = await Task.create({
                quoteRequestId: input.requestId,
                quoteFingerprint: hash,
                name: (input.quoteType === 'onsite' ? 'Oględziny: ' : 'Wycena: ') + input.service,
                type: input.service,
                division: input.division,
                quoteType: input.quoteType,
                status: 'new',
                source: 'Formularz WWW',
                price: 0,
                // Data operacyjna nie jest obietnicą ani rezerwacją terminu klienta.
                dateStart: new Date(),
                clientName: input.clientName,
                clientPhone: input.phone,
                address: input.route,
                clientPreferredDate: input.date || 'Do ustalenia',
                desc: 'Termin zgłoszony przez klienta: ' + (input.date || 'Do ustalenia') + '\n\n' + input.description,
                quoteDetails: input.details,
                quotePhotos,
                quotePhotoCount: quotePhotos.length,
                discordPending: Boolean(config.discordWebhookUrl),
                discordNextAttempt: new Date()
            });
            created = true;
        } catch (error) {
            if (error.code !== 11000) throw error;
            task = await Task.findOne({ quoteRequestId: input.requestId }).select('+quoteFingerprint');
            if (!task) throw error;
            if (task.quoteFingerprint !== hash) {
                return res.status(409).json({ success: false, message: 'Identyfikator zgłoszenia został już użyty. Odśwież stronę.' });
            }
        }
    }

    res.status(201).json({ success: true, number: task.number });

    if (created) {
        void recordActivity('quote_received', `Nowa wycena ${task.number}: ${task.type} (${task.clientName})`, 'Task', task._id, 'Formularz WWW');
        void notify.newQuote(task.toObject());
        void flushDiscord();
    }
}));

const aiQuoteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 6,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Za dużo zgłoszeń. Spróbuj za 15 minut albo zadzwoń: 735 396 534.' }
});

/**
 * 7.0: formularz „Wycena AI” — zapisuje zgłoszenie w panelu (Wyceny), wycenia przez Claude API
 * i zwraca klientowi wstępne widełki. Ponowne wysłanie tego samego zgłoszenia zwraca tę samą wycenę.
 */
router.post('/quotes/ai', aiQuoteLimiter, express.json({ limit: '10mb' }), asyncRoute(async (req, res) => {
    const q = validateAiQuote(req.body);
    const hash = fingerprintAi(q);
    let task = await Task.findOne({ quoteRequestId: q.requestId }).select('+quoteFingerprint');
    if (task) {
        if (task.quoteFingerprint && task.quoteFingerprint !== hash) {
            return res.status(409).json({ success: false, message: 'To zgłoszenie zostało już zapisane z innymi danymi. Odśwież stronę, aby wysłać nowe.' });
        }
        const estimate = task.aiEstimate || aiQuote.baselineEstimate(q);
        return res.status(200).json({ success: true, number: task.number, ...aiQuote.publicEstimate({ ...estimate, source: task.aiEstimate ? estimate.source : 'pending' }) });
    }

    const quotePhotos = await preparePhotos(q.photos.map(data => ({ data })));
    const names = q.services.map(s => s.name);
    const dest = q.location.destination;
    const { photos, ...stored } = q;
    try {
        task = await Task.create({
            quoteRequestId: q.requestId,
            quoteFingerprint: hash,
            name: ((q.quoteType === 'onsite' ? 'Oględziny: ' : 'Wycena AI: ') + names.join(', ')).slice(0, 160),
            type: (names.length > 1 ? names[0] + ' + ' + (names.length - 1) : names[0]).slice(0, 80),
            division: q.services[0].division || '',
            quoteType: q.quoteType,
            status: 'new',
            source: 'Wycena AI',
            price: 0,
            dateStart: new Date(),
            clientName: q.contact.company ? `${q.contact.name} (${q.contact.company})`.slice(0, 140) : q.contact.name,
            clientPhone: q.contact.phone,
            clientEmail: q.contact.email,
            address: dest ? '' : q.location.address,
            addressFrom: dest ? q.location.address : '',
            addressTo: dest || '',
            clientPreferredDate: [q.schedule.date || 'Do ustalenia', q.schedule.time !== 'Obojętnie' ? q.schedule.time : '', q.schedule.urgent ? 'PILNE' : ''].filter(Boolean).join(' · '),
            desc: ['Termin zgłoszony przez klienta: ' + (q.schedule.date || 'Do ustalenia') + ' · ' + q.schedule.urgency, '', q.description || '(bez opisu)'].join('\n').slice(0, 4000),
            quoteDetails: detailsMap(q),
            quotePhotos,
            quotePhotoCount: quotePhotos.length,
            aiInput: stored,
            discordPending: Boolean(config.discordWebhookUrl),
            discordNextAttempt: new Date()
        });
    } catch (error) {
        if (error.code !== 11000) throw error;
        task = await Task.findOne({ quoteRequestId: q.requestId });
        if (!task) throw error;
        const estimate = task.aiEstimate || aiQuote.baselineEstimate(q);
        return res.status(200).json({ success: true, number: task.number, ...aiQuote.publicEstimate(estimate) });
    }

    const estimate = await aiQuote.estimateQuote(q, quotePhotos.map(p => p.data));
    task.aiEstimate = estimate;
    try { await Task.updateOne({ _id: task._id }, { $set: { aiEstimate: estimate } }); } catch (e) { console.error('[RevSerwis] Nie zapisano wyceny AI', e.message); }

    res.status(201).json({ success: true, number: task.number, ...aiQuote.publicEstimate(estimate) });

    void recordActivity('quote_received', `Nowa wycena AI ${task.number}: ${names.join(', ')} (${task.clientName}) — ${estimate.low}–${estimate.high} zł${estimate.source === 'ai' ? '' : ' [bez AI]'}`, 'Task', task._id, 'Wycena AI');
    void notify.newQuote(typeof task.toObject === 'function' ? task.toObject() : task);
    void flushDiscord();
}));

const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 6,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Za dużo wiadomości. Spróbuj za 15 minut albo zadzwoń: 735 396 534.' }
});

// Formularz kontaktowy (osoby prywatne i firmy) → panel „Wiadomości” + e-mail na kontakt@revserwis.pl.
router.post('/contact', contactLimiter, asyncRoute(async (req, res) => {
    const input = validateContact(req.body);
    let message = await Message.findOne({ requestId: input.requestId });
    let created = false;
    if (!message) {
        const settings = await getSettings();
        try {
            message = await Message.create({
                ...input,
                mail: { pending: true, attempts: 0, nextAttempt: new Date() },
                autoReply: { pending: Boolean(settings.contactAutoReply && mail.isConfigured()) },
                discordPending: Boolean(config.discordWebhookUrl),
                discordNextAttempt: new Date()
            });
            created = true;
        } catch (error) {
            if (error.code !== 11000) throw error;
            message = await Message.findOne({ requestId: input.requestId });
            if (!message) throw error;
        }
    }
    res.status(201).json({ success: true, id: String(message._id) });

    if (created) {
        const who = message.kind === 'company' && message.company ? `${message.company} (${message.name})` : message.name;
        const division = divisionName(message.division);
        void recordActivity('message_received', `Wiadomość z formularza: ${message.topic}${division ? ' · ' + division : ''} — ${who}`, 'Message', message._id, 'Formularz kontaktowy');
        void notify.newMessage(message.toObject());
        void mail.flushMail();
        void flushDiscord();
    }
}));

module.exports = router;
