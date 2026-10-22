'use strict';

const express = require('express');
const { PushSubscription, Notification, Employee } = require('../models');
const { requireAdmin } = require('../middleware/auth');
const { asyncRoute, httpError, userKeyOf, isObjectId } = require('../utils');
const push = require('../services/push');
const notify = require('../services/notify');
const { getSettings, updateSettings } = require('../services/settings');

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Web Push
|--------------------------------------------------------------------------
*/

router.get('/push/public-key', asyncRoute(async (req, res) => {
    res.json({ publicKey: await push.getPublicKey() });
}));

function deviceLabel(ua = '') {
    if (/iPhone|iPad/.test(ua)) return 'iPhone / iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/Macintosh/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    return 'Urządzenie';
}

router.post('/push/subscribe', asyncRoute(async (req, res) => {
    const sub = req.body?.subscription || req.body;
    const endpoint = String(sub?.endpoint || '');
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        throw httpError(400, 'Nieprawidłowa subskrypcja powiadomień');
    }
    const ua = String(req.get('user-agent') || '').slice(0, 400);
    await PushSubscription.findOneAndUpdate(
        { endpoint },
        {
            $set: {
                endpoint,
                keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) },
                userKey: userKeyOf(req.user),
                userName: req.user.name,
                userAgent: ua,
                deviceLabel: String(req.body?.deviceLabel || deviceLabel(ua)).slice(0, 140),
                failures: 0
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ success: true });
}));

router.post('/push/unsubscribe', asyncRoute(async (req, res) => {
    const endpoint = String(req.body?.endpoint || '');
    if (endpoint) await PushSubscription.deleteOne({ endpoint, userKey: userKeyOf(req.user) });
    res.json({ success: true });
}));

router.post('/push/test', asyncRoute(async (req, res) => {
    const result = await notify.notify({
        type: 'test',
        title: 'RevMi — test powiadomień',
        body: `Działa! Powiadomienia dla: ${req.user.name}`,
        url: '/revmi/#/powiadomienia',
        recipients: [userKeyOf(req.user)]
    });
    if (!result.sent) throw httpError(400, 'Brak aktywnego urządzenia. Włącz powiadomienia na tym telefonie lub komputerze.');
    res.json({ success: true, ...result });
}));

router.get('/push/devices', asyncRoute(async (req, res) => {
    const filter = req.user.role === 'admin' && req.query.all === '1' ? {} : { userKey: userKeyOf(req.user) };
    const devices = await PushSubscription.find(filter).select('userKey userName deviceLabel createdAt lastSuccessAt endpoint').sort({ createdAt: -1 }).lean();
    res.json({ devices: devices.map(d => ({ ...d, endpoint: undefined, endpointTail: d.endpoint.slice(-12) })) });
}));

router.delete('/push/devices/:id', asyncRoute(async (req, res) => {
    if (!isObjectId(req.params.id)) throw httpError(400, 'Nieprawidłowy identyfikator');
    const filter = { _id: req.params.id };
    if (req.user.role !== 'admin') filter.userKey = userKeyOf(req.user);
    await PushSubscription.deleteOne(filter);
    res.json({ success: true });
}));

/** Ręczne powiadomienie do zespołu (np. „Jutro zbiórka 7:00”). */
router.post('/push/broadcast', requireAdmin, asyncRoute(async (req, res) => {
    const title = String(req.body?.title || '').trim().slice(0, 120);
    const body = String(req.body?.body || '').trim().slice(0, 300);
    if (!title) throw httpError(400, 'Podaj tytuł powiadomienia');
    let recipients;
    if (Array.isArray(req.body?.employees) && req.body.employees.length) {
        const ids = req.body.employees.filter(isObjectId);
        recipients = (await Employee.find({ _id: { $in: ids }, active: true }).select('_id').lean()).map(e => String(e._id));
    } else {
        recipients = await notify.allKeys();
    }
    const result = await notify.notify({ type: 'message', title, body, url: '/revmi/#/powiadomienia', recipients, exclude: [userKeyOf(req.user)] });
    res.json({ success: true, ...result });
}));

/*
|--------------------------------------------------------------------------
| Skrzynka powiadomień w panelu
|--------------------------------------------------------------------------
*/

router.get('/notifications', asyncRoute(async (req, res) => {
    const key = userKeyOf(req.user);
    const items = await Notification.find({ recipients: key }).sort({ createdAt: -1 }).limit(60).lean();
    res.json({
        unread: items.filter(n => !n.readBy.includes(key)).length,
        notifications: items.map(n => ({
            _id: n._id, type: n.type, title: n.title, body: n.body, url: n.url, task: n.task,
            createdAt: n.createdAt, read: n.readBy.includes(key)
        }))
    });
}));

router.post('/notifications/read', asyncRoute(async (req, res) => {
    const key = userKeyOf(req.user);
    const filter = { recipients: key };
    if (Array.isArray(req.body?.ids)) filter._id = { $in: req.body.ids.filter(isObjectId) };
    await Notification.updateMany(filter, { $addToSet: { readBy: key } });
    res.json({ success: true });
}));

/*
|--------------------------------------------------------------------------
| Ustawienia
|--------------------------------------------------------------------------
*/

router.get('/settings', requireAdmin, asyncRoute(async (req, res) => {
    res.json({ settings: await getSettings({ fresh: true }) });
}));

router.put('/settings', requireAdmin, asyncRoute(async (req, res) => {
    res.json({ success: true, settings: await updateSettings(req.body || {}) });
}));

module.exports = router;
