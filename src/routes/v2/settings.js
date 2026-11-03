'use strict';

/** RevMi 2.0.0 — ustawienia nowych modułów, SMS z poziomu zlecenia. */
const express = require('express');
const { Task } = require('../../models');
const { SmsConfirm } = require('../../models-v2');
const scope = require('../../services/scope');
const sms = require('../../services/sms');
const { requireOwnerAdmin, validateId } = require('../../middleware/auth');
const { asyncRoute, httpError } = require('../../utils');
const { getV2, updateV2 } = require('../../services/v2-config');
const { sendTaskSms } = require('../../services/v2-sms');
const mail = require('../../services/mail');

const router = express.Router();

router.get('/v2/settings', requireOwnerAdmin, asyncRoute(async (req, res) => {
    const cfg = await getV2();
    const { jobs, _id, __v, key, ...rest } = cfg;
    res.json({ settings: rest, sms: { provider: sms.provider ? sms.provider() : 'none' }, mail: { configured: mail.isConfigured(), provider: mail.provider() } });
}));

router.put('/v2/settings', requireOwnerAdmin, asyncRoute(async (req, res) => {
    const cfg = await updateV2(req.body || {});
    const { jobs, _id, __v, key, ...rest } = cfg;
    res.json({ success: true, settings: rest });
}));

/** SMS do klienta z poziomu zlecenia: przypomnienie z potwierdzeniem albo „ekipa jedzie”. */
router.post('/v2/tasks/:id/sms', validateId, asyncRoute(async (req, res) => {
    const task = await Task.findById(req.params.id).lean();
    if (!task || !scope.canSeeTask(task, req.user)) throw httpError(404, 'Nie znaleziono zlecenia');
    const kind = req.body?.kind === 'ontheway' ? 'ontheway' : 'reminder';
    if (kind === 'reminder' && !scope.isOffice(req.user)) throw httpError(403, 'Przypomnienie wysyła biuro');
    const r = await sendTaskSms(task, kind);
    if (r.status === 'failed') throw httpError(400, r.error || 'Nie udało się wysłać SMS');
    res.json({ success: true, ...r });
}));

router.get('/v2/tasks/:id/sms', validateId, asyncRoute(async (req, res) => {
    const list = await SmsConfirm.find({ task: req.params.id }).select('kind status confirmedAt clientNote createdAt error').sort({ createdAt: -1 }).limit(20).lean();
    res.json({ sms: list });
}));

module.exports = router;
