'use strict';

/** Skrzynka wiadomości z formularza kontaktowego (tylko administratorzy). */
const express = require('express');
const { Message, MESSAGE_STATUSES, Client, Task } = require('../models');
const { requireAdmin, validateId } = require('../middleware/auth');
const { asyncRoute, httpError } = require('../utils');
const { recordActivity } = require('../services/activity');
const { divisionName } = require('../../lib/divisions');
const mail = require('../services/mail');

const router = express.Router();
router.use('/messages', requireAdmin);

const found = doc => {
    if (!doc) throw httpError(404, 'Nie znaleziono wiadomości');
    return doc;
};

router.get('/messages', asyncRoute(async (req, res) => {
    const status = String(req.query.status || 'inbox');
    const filter = status === 'inbox' ? { status: { $in: ['new', 'read', 'replied'] } }
        : MESSAGE_STATUSES.includes(status) ? { status } : {};
    const [messages, counts] = await Promise.all([
        Message.find(filter).sort({ createdAt: -1 }).limit(300).lean(),
        Message.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }])
    ]);
    res.json({
        messages,
        counts: Object.fromEntries(counts.map(c => [c._id, c.n])),
        mail: { configured: mail.isConfigured(), provider: mail.provider() }
    });
}));

router.get('/messages/:id', validateId, asyncRoute(async (req, res) => {
    const message = found(await Message.findById(req.params.id));
    if (message.status === 'new') {
        message.status = 'read';
        message.handledBy = req.user.name;
        await message.save();
    }
    res.json({ message: message.toObject() });
}));

router.patch('/messages/:id', validateId, asyncRoute(async (req, res) => {
    const update = {};
    if (req.body?.status !== undefined) {
        if (!MESSAGE_STATUSES.includes(req.body.status)) throw httpError(400, 'Nieprawidłowy status');
        update.status = req.body.status;
        update.handledBy = req.user.name;
    }
    if (req.body?.internalNotes !== undefined) update.internalNotes = String(req.body.internalNotes || '').slice(0, 3000);
    const message = found(await Message.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true }).lean());
    res.json({ success: true, message });
}));

router.delete('/messages/:id', validateId, asyncRoute(async (req, res) => {
    found(await Message.findByIdAndDelete(req.params.id));
    res.json({ success: true });
}));

/** Zapisz nadawcę jako klienta CRM (albo podepnij istniejącego po telefonie / e-mailu). */
router.post('/messages/:id/client', validateId, asyncRoute(async (req, res) => {
    const message = found(await Message.findById(req.params.id));
    let client = message.client ? await Client.findById(message.client) : null;
    if (!client) {
        const or = [message.phone && { phone: message.phone }, message.email && { email: message.email }].filter(Boolean);
        client = or.length ? await Client.findOne({ $or: or, archived: false }) : null;
    }
    if (!client) {
        client = await Client.create({
            name: (message.kind === 'company' && message.company ? message.company : message.name).slice(0, 160),
            company: message.company,
            type: message.kind,
            phone: message.phone,
            email: message.email,
            nip: message.nip,
            source: 'Formularz kontaktowy',
            notes: `Kontakt: ${message.name}`
        });
        await recordActivity('client_created', `Dodano klienta ${client.name} z formularza kontaktowego`, 'Client', client._id, req.user.name);
    }
    message.client = client._id;
    await message.save();
    res.json({ success: true, client, message: message.toObject() });
}));

/** Utwórz wycenę (zlecenie w statusie „Nowa wycena”) na podstawie wiadomości. */
router.post('/messages/:id/task', validateId, asyncRoute(async (req, res) => {
    const message = found(await Message.findById(req.params.id));
    if (message.task) {
        const existing = await Task.findById(message.task).lean();
        if (existing) return res.json({ success: true, task: existing, existing: true });
    }
    const division = divisionName(message.division);
    const task = await Task.create({
        name: `Wycena: ${message.topic}${division ? ' · ' + division : ''}`,
        type: division || message.topic,
        division: message.division,
        status: 'new',
        source: 'Formularz kontaktowy',
        dateStart: new Date(),
        clientName: (message.kind === 'company' && message.company ? `${message.company} (${message.name})` : message.name).slice(0, 140),
        clientPhone: message.phone,
        clientEmail: message.email,
        client: message.client || null,
        desc: message.message.slice(0, 4000),
        createdBy: req.user.name
    });
    message.task = task._id;
    if (message.status === 'new') message.status = 'read';
    await message.save();
    await recordActivity('task_created', `Utworzono wycenę ${task.number} z wiadomości (${message.name})`, 'Task', task._id, req.user.name);
    res.status(201).json({ success: true, task: task.toObject(), message: message.toObject() });
}));

/** Ponów wysyłkę e-maila na skrzynkę firmową. */
router.post('/messages/:id/resend', validateId, asyncRoute(async (req, res) => {
    if (!mail.isConfigured()) throw httpError(400, 'Poczta nie jest skonfigurowana. Dodaj RESEND_API_KEY albo SMTP_HOST/SMTP_USER/SMTP_PASS w Railway.');
    const message = found(await Message.findById(req.params.id));
    await mail.send(mail.contactEmail(message));
    await Message.updateOne({ _id: message._id }, { $set: { 'mail.pending': false, 'mail.sentAt': new Date(), 'mail.error': '' } });
    res.json({ success: true });
}));

module.exports = router;
