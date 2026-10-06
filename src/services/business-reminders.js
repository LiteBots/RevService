'use strict';

/**
 * Przypomnienia biznesowe (co 2 min):
 *  - notatki z ustawionym przypomnieniem → push do autora (albo zespołu, gdy notatka zespołowa),
 *  - abonamenty do rozliczenia w ciągu 3 dni → push do administratorów,
 *  - pozycje magazynu RevStorage kończące się w ciągu 7 dni → push do administratorów.
 * Powiadomienia mają klucze deduplikacji, więc każde przychodzi tylko raz.
 */
const DAY = 86_400_000;

function startBusinessReminders({ intervalMs = 120_000 } = {}) {
    const { PadNote, Contract, StorageItem } = require('../models');
    const { getSettings } = require('./settings');
    const notify = require('./notify');
    const { formatWhen, money } = require('../utils');

    let busy = false;

    async function tick() {
        if (busy || PadNote.db.readyState !== 1) return;
        busy = true;
        try {
            const now = new Date();

            const dueNotes = await PadNote.find({ reminderAt: { $ne: null, $lte: now }, reminderSentAt: null, archived: false }).limit(50).lean();
            for (const note of dueNotes) {
                const claimed = await PadNote.findOneAndUpdate({ _id: note._id, reminderSentAt: null }, { $set: { reminderSentAt: now } }, { new: true }).lean();
                if (!claimed) continue;
                const recipients = claimed.visibility === 'team' ? await notify.allKeys() : [claimed.ownerKey];
                await notify.notify({
                    type: 'note',
                    title: '📝 ' + (claimed.title || 'Przypomnienie z notatnika'),
                    body: String(claimed.content || claimed.checklist?.map(i => i.text).join(', ') || '').slice(0, 160),
                    url: `/revmi/#/notatnik/${claimed._id}`,
                    recipients,
                    dedupeKey: `note:${claimed._id}:${new Date(claimed.reminderAt).getTime()}`
                });
            }

            const settings = await getSettings();
            if (!settings.notifyBusinessReminders) return;
            const admins = await notify.adminKeys();

            const contracts = await Contract.find({ status: 'active', nextBillingDate: { $ne: null, $lte: new Date(now.getTime() + 3 * DAY) } }).limit(100).lean();
            for (const c of contracts) {
                await notify.notify({
                    type: 'billing',
                    title: '💳 Abonament do rozliczenia',
                    body: `${c.title}${c.clientName ? ' · ' + c.clientName : ''} · ${money(c.monthlyPrice)} · ${formatWhen(new Date(c.nextBillingDate))}`,
                    url: '/revmi/#/abonamenty',
                    recipients: admins,
                    dedupeKey: `billing:${c._id}:${new Date(c.nextBillingDate).getTime()}`
                });
            }

            const ending = await StorageItem.find({ status: 'stored', endDate: { $ne: null, $lte: new Date(now.getTime() + 7 * DAY) } }).limit(100).lean();
            for (const item of ending) {
                await notify.notify({
                    type: 'storage',
                    title: '📦 Koniec przechowania',
                    body: `${item.description} · ${item.clientName} · do ${formatWhen(new Date(item.endDate))}`,
                    url: '/revmi/#/magazyn',
                    recipients: admins,
                    dedupeKey: `storage:${item._id}:${new Date(item.endDate).getTime()}`
                });
            }
        } catch (error) {
            console.error('[RevMi] Przypomnienia biznesowe:', error.message);
        } finally {
            busy = false;
        }
    }

    const timer = setInterval(tick, intervalMs);
    timer.unref();
    setTimeout(tick, 10_000).unref();
    return { tick, stop: () => clearInterval(timer) };
}

module.exports = { startBusinessReminders };
