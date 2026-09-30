'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const config = require('../config');
const { Task, mongoose } = require('../models');
const { validateQuote, preparePhotos, fingerprint } = require('../../lib/quote-input');
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
        version: '3.0.0'
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
                name: 'Wycena: ' + input.service,
                type: input.service,
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

module.exports = router;
