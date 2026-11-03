'use strict';

/** RevMi 2.0.0 — SMS do klienta: przypomnienie dzień przed (z potwierdzeniem terminu) i „ekipa jedzie”. */
const { randomBytes } = require('crypto');
const config = require('../config');
const { Task } = require('../models');
const { SmsConfirm } = require('../models-v2');
const sms = require('./sms');
const { fillTemplate } = require('../../lib/v2');
const { getV2 } = require('./v2-config');

const tz = () => config.timeZone || 'Europe/Warsaw';
const fmt = (d, opts) => new Intl.DateTimeFormat('pl-PL', { timeZone: tz(), ...opts }).format(new Date(d));

function vars(task, link) {
    const eta = task.etaAt || null;
    return {
        data: fmt(task.dateStart, { weekday: 'long', day: 'numeric', month: 'long' }),
        godzina: fmt(eta || task.dateStart, { hour: '2-digit', minute: '2-digit' }),
        usluga: String(task.name || '').toLowerCase().slice(0, 60),
        adres: task.address || task.addressFrom || '',
        ekipa: (task.workers || []).map(w => String(w.name || '').split(' ')[0]).filter(Boolean).join(' i '),
        link
    };
}

/**
 * Wysyła SMS dla zlecenia. Bez bramki SMS (SMSAPI_TOKEN) zwraca gotowy link sms:, żeby wysłać z telefonu.
 * @returns {Promise<{ status: 'sent'|'manual'|'failed', error?: string, smsLink?: string, text: string }>}
 */
async function sendTaskSms(taskOrId, kind = 'reminder') {
    const task = taskOrId && taskOrId._id && taskOrId.dateStart ? taskOrId : await Task.findById(taskOrId).lean();
    if (!task) return { status: 'failed', error: 'Nie znaleziono zlecenia', text: '' };
    if (!task.clientPhone) return { status: 'failed', error: 'Brak numeru telefonu klienta', text: '' };
    const cfg = await getV2();
    const token = randomBytes(12).toString('base64url');
    const link = `${config.publicUrl}/potwierdz?t=${token}`;
    const template = kind === 'ontheway' ? cfg.smsOnTheWayTemplate : cfg.smsReminderTemplate;
    const text = fillTemplate(template, vars(task, link));
    const result = await sms.send(task.clientPhone, text);
    await SmsConfirm.create({ token, task: task._id, kind, phone: task.clientPhone, status: result.status, error: result.error || '' });
    if (kind === 'reminder') await Task.updateOne({ _id: task._id }, { $set: { smsReminderAt: new Date() } });
    const to = String(task.clientPhone).replace(/[^\d+]/g, '');
    return { status: result.status, error: result.error || '', text, smsLink: result.status === 'manual' ? `sms:${to}?&body=${encodeURIComponent(text)}` : '' };
}

module.exports = { sendTaskSms };
