'use strict';

const HOUR = 3_600_000;

/**
 * Czyste wyliczenie, które przypomnienie należy teraz wysłać.
 * Zwraca 'second' (np. 24 h), 'first' (np. 3 dni) albo null.
 */
function dueReminder(task, settings, now = new Date()) {
    if (!task?.dateStart) return null;
    if (!(settings.reminderStatuses || ['planned', 'progress']).includes(task.status)) return null;
    const diff = new Date(task.dateStart).getTime() - now.getTime();
    if (diff <= 0) return null;

    const sent = task.reminders || {};
    const firstH = Number(settings.reminderFirstHours) || 72;
    const secondH = Number(settings.reminderSecondHours) || 24;

    if (settings.reminderSecondEnabled && diff <= secondH * HOUR && !sent.secondSentAt) return 'second';

    // Pierwsze przypomnienie tylko gdy do drugiego zostało jeszcze min. 12 h —
    // zlecenie dodane „na ostatnią chwilę” nie dostaje dwóch pushy pod rząd.
    if (
        settings.reminderFirstEnabled &&
        diff <= firstH * HOUR &&
        diff > (secondH + 12) * HOUR &&
        !sent.firstSentAt
    ) return 'first';

    return null;
}

function startReminderScheduler({ intervalMs = 60_000 } = {}) {
    const { Task } = require('../models');
    const { getSettings } = require('./settings');
    const notify = require('./notify');

    let busy = false;

    async function tick() {
        if (busy || Task.db.readyState !== 1) return;
        busy = true;
        try {
            const settings = await getSettings();
            if (!settings.reminderFirstEnabled && !settings.reminderSecondEnabled) return;
            const now = new Date();
            const horizon = new Date(now.getTime() + Math.max(settings.reminderFirstHours, settings.reminderSecondHours) * HOUR);
            const candidates = await Task.find({
                status: { $in: settings.reminderStatuses },
                dateStart: { $gt: now, $lte: horizon },
                $or: [{ 'reminders.firstSentAt': null }, { 'reminders.secondSentAt': null }]
            }).limit(200).lean();

            for (const task of candidates) {
                const which = dueReminder(task, settings, now);
                if (!which) continue;
                const field = which === 'second' ? 'reminders.secondSentAt' : 'reminders.firstSentAt';
                const set = { [field]: now };
                if (which === 'second' && !task.reminders?.firstSentAt) set['reminders.firstSentAt'] = now;

                // Atomowa rezerwacja — bezpieczne także przy kilku instancjach aplikacji.
                const claimed = await Task.findOneAndUpdate(
                    { _id: task._id, [field]: null, dateStart: task.dateStart },
                    { $set: set },
                    { new: true }
                ).lean();
                if (claimed) await notify.reminder(claimed, which, now);
            }
        } catch (error) {
            console.error('[RevMi] Harmonogram przypomnień:', error.message);
        } finally {
            busy = false;
        }
    }

    const timer = setInterval(tick, intervalMs);
    timer.unref();
    setTimeout(tick, 5_000).unref();
    return { tick, stop: () => clearInterval(timer) };
}

module.exports = { dueReminder, startReminderScheduler };
