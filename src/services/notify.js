'use strict';

const { Employee, Notification } = require('../models');
const { getSettings } = require('./settings');
const push = require('./push');
const { relativeWhen, formatWhen } = require('../utils');

const STATUS_LABELS = {
    new: 'Nowa wycena', quoted: 'Wycenione', planned: 'Zaplanowane',
    progress: 'W realizacji', completed: 'Zakończone', cancelled: 'Anulowane'
};

async function adminKeys() {
    const admins = await Employee.find({ active: true, systemRole: 'admin' }).select('_id').lean();
    return ['admin', ...admins.map(a => String(a._id))];
}

async function allKeys() {
    const people = await Employee.find({ active: true }).select('_id').lean();
    return ['admin', ...people.map(p => String(p._id))];
}

function assignedKeys(task) {
    return (task.workers || []).map(w => w.employee && String(w.employee)).filter(Boolean);
}

const taskUrl = task => `/revmi/#/zlecenia/${task._id}`;
const place = task => task.address || [task.addressFrom, task.addressTo].filter(Boolean).join(' → ');

/**
 * Zapisuje powiadomienie w skrzynce i wysyła push.
 * Błędy nigdy nie przerywają operacji biznesowej.
 */
async function notify({ type, title, body, url, task, recipients, exclude = [], dedupeKey, urgency }) {
    try {
        const excluded = new Set(exclude.filter(Boolean).map(String));
        const keys = [...new Set(recipients.map(String))].filter(k => !excluded.has(k));
        if (!keys.length) return { sent: 0, recipients: 0 };

        if (dedupeKey) {
            try {
                await Notification.create({ type, title, body, url, task: task?._id || null, recipients: keys, dedupeKey });
            } catch (error) {
                if (error.code === 11000) return { sent: 0, recipients: 0, duplicate: true };
                throw error;
            }
        } else {
            await Notification.create({ type, title, body, url, task: task?._id || null, recipients: keys });
        }

        const result = await push.sendToUsers(keys, { type, title, body, url, urgency, tag: task ? `${type}-${task._id}` : type });
        return { ...result, recipients: keys.length };
    } catch (error) {
        console.error('[RevMi] Błąd powiadomienia:', error.message);
        return { sent: 0, error: error.message };
    }
}

async function newQuote(task) {
    const settings = await getSettings();
    if (!settings.notifyNewQuote) return;
    const photos = task.quotePhotoCount ? ` · 📷 ${task.quotePhotoCount}` : '';
    return notify({
        type: 'quote',
        title: 'Nowa wycena — ' + (task.type || 'zapytanie'),
        body: [task.clientName, place(task)].filter(Boolean).join(' · ') + photos,
        url: taskUrl(task),
        task,
        recipients: await adminKeys(),
        dedupeKey: `quote:${task._id}`
    });
}

async function newTask(task, actorKey, alsoExclude = []) {
    const settings = await getSettings();
    if (!settings.notifyNewTask) return;
    return notify({
        type: 'task',
        title: 'Nowe zlecenie: ' + task.name,
        body: [formatWhen(new Date(task.dateStart)), place(task)].filter(Boolean).join(' · '),
        url: taskUrl(task),
        task,
        recipients: await allKeys(),
        exclude: [actorKey, ...alsoExclude],
        dedupeKey: `task:${task._id}`
    });
}

async function assigned(task, employeeIds, actorKey) {
    const settings = await getSettings();
    if (!settings.notifyAssignment || !employeeIds.length) return;
    return notify({
        type: 'assignment',
        title: 'Przypisano Cię do zlecenia',
        body: `${task.name} · ${relativeWhen(new Date(task.dateStart))}` + (place(task) ? ` · ${place(task)}` : ''),
        url: taskUrl(task),
        task,
        recipients: employeeIds.map(String),
        exclude: [actorKey]
    });
}

async function statusChanged(task, previous, actor) {
    const settings = await getSettings();
    if (!settings.notifyStatusToAdmins || actor?.role === 'admin') return;
    return notify({
        type: 'status',
        title: `${actor?.name || 'Pracownik'}: ${STATUS_LABELS[task.status] || task.status}`,
        body: `${task.name} (${STATUS_LABELS[previous] || previous} → ${STATUS_LABELS[task.status] || task.status})`,
        url: taskUrl(task),
        task,
        recipients: await adminKeys(),
        exclude: [actor?.employeeId]
    });
}

/** which: 'first' (domyślnie 3 dni) albo 'second' (domyślnie 24 h) */
async function reminder(task, which, now = new Date()) {
    const settings = await getSettings();
    let recipients = assignedKeys(task);
    if (!recipients.length || settings.remindersCopyToAdmins) recipients = recipients.concat(await adminKeys());
    const when = relativeWhen(new Date(task.dateStart), now);
    return notify({
        type: 'reminder',
        title: which === 'second' ? `⏰ Zlecenie ${when}` : `📅 Przypomnienie: zlecenie ${when}`,
        body: [task.name, place(task), task.clientName].filter(Boolean).join(' · '),
        url: taskUrl(task),
        task,
        recipients,
        dedupeKey: `reminder:${which}:${task._id}:${new Date(task.dateStart).getTime()}`
    });
}

module.exports = { notify, newQuote, newTask, assigned, statusChanged, reminder, adminKeys, allKeys, assignedKeys, STATUS_LABELS };
