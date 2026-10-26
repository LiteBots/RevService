'use strict';

/**
 * 9.2: zadania w tle
 *  - automatyzacje „jeśli → to” (co 15 minut),
 *  - poranne podsumowanie push o ustawionej godzinie (domyślnie 7:00) — każdy dostaje swój plan dnia, biuro przegląd,
 *  - automatyczne przypomnienia o płatności (raz dziennie, po 9:00),
 *  - przypomnienia floty (OC, przegląd, serwis, opony) — raz dziennie do biura.
 * Bezpieczne przy wielu instancjach: dzień jest „zajmowany” atomowo w ustawieniach, reguła działa raz na zlecenie.
 */
const { Task, Employee, Fleet, Settings } = require('../models');
const { Rule, Leave } = require('../models-v11');
const V = require('../../lib/v11-input');
const notify = require('./notify');
const sms = require('./sms');
const mail = require('./mail');
const config = require('../config');
const { getSettings, resetSettingsCache } = require('./settings');
const { formatWhen } = require('../utils');

const H = 3_600_000;
const DAY = 24 * H;

/* ------------------------------------------------------------------ */
/* Automatyzacje                                                       */
/* ------------------------------------------------------------------ */

function ruleQuery(rule, now) {
    const ago = new Date(now.getTime() - rule.hours * H);
    const base = rule.division ? { division: rule.division } : {};
    switch (rule.trigger) {
        case 'quote_stale': return { ...base, status: 'quoted', clientAcceptedAt: null, updatedAt: { $lte: ago }, createdAt: { $gte: new Date(now - 60 * DAY) } };
        case 'task_completed': return { ...base, status: 'completed', completedAt: { $lte: ago, $gte: new Date(ago - 7 * DAY) } };
        case 'unpaid_after': return { ...base, status: 'completed', paymentStatus: { $ne: 'paid' }, completedAt: { $lte: ago, $gte: new Date(now - 120 * DAY) } };
        case 'task_tomorrow': return { ...base, status: 'planned', dateStart: { $gt: now, $lte: new Date(now.getTime() + rule.hours * H) } };
        case 'new_request_unanswered': return { ...base, status: 'new', createdAt: { $lte: ago, $gte: new Date(now - 30 * DAY) } };
        default: return null;
    }
}

const fill = (text, t, settings) => String(text || '')
    .replace(/\{numer\}/g, t.number || '').replace(/\{klient\}/g, t.clientName || '').replace(/\{nazwa\}/g, t.name || '')
    .replace(/\{termin\}/g, t.dateStart ? formatWhen(t.dateStart) : '').replace(/\{kwota\}/g, String(V.amountDue(t) || t.finalPrice || t.price || ''))
    .replace(/\{firma\}/g, settings.companyName || 'RevSerwis').replace(/\{telefon\}/g, settings.companyPhone || '');

async function runRules(now = new Date()) {
    const rules = await Rule.find({ enabled: true }).select('+firedFor').lean();
    if (!rules.length) return { rules: 0, fired: 0 };
    const settings = await getSettings();
    let fired = 0;
    for (const rule of rules) {
        const q = ruleQuery(rule, now);
        if (!q) continue;
        const done = new Set((rule.firedFor || []).map(String));
        const tasks = (await Task.find(q).limit(100).lean()).filter(t => !done.has(String(t._id)));
        for (const t of tasks) {
            // Najpierw rezerwujemy zlecenie dla reguły (atomowo) — druga instancja serwera go nie weźmie.
            const lock = await Rule.updateOne({ _id: rule._id, firedFor: { $ne: t._id } }, { $push: { firedFor: { $each: [t._id], $slice: -5000 } }, $inc: { runCount: 1 }, $set: { lastRunAt: now } });
            if (!lock.modifiedCount) continue;
            try {
                const text = fill(rule.message, t, settings);
                if (rule.action === 'notify_admins') {
                    await notify.notify({ type: 'automation', title: rule.name, body: text || `${t.number} · ${t.name}`, task: t._id, url: `/revmi/#/zlecenia/${t._id}`, recipients: await notify.adminKeys(), dedupeKey: `rule:${rule._id}:${t._id}` });
                } else if (rule.action === 'sms_client' && t.clientPhone) {
                    await sms.send(t.clientPhone, text);
                } else if (rule.action === 'email_client' && t.clientEmail && mail.isConfigured()) {
                    await mail.send({ to: t.clientEmail, subject: `${settings.companyName || 'RevSerwis'} — ${t.name}`.slice(0, 140), text });
                } else if (rule.action === 'add_note') {
                    await Task.updateOne({ _id: t._id }, { $push: { notes: { text: text.slice(0, 2000), author: 'Automatyzacja: ' + rule.name.slice(0, 100) } } });
                } else if (rule.action === 'set_priority_high') {
                    await Task.updateOne({ _id: t._id }, { $set: { priority: 'high' } });
                }
                fired++;
            } catch (error) {
                console.warn('[RevSerwis] Automatyzacja', rule.name, error.message);
            }
        }
    }
    return { rules: rules.length, fired };
}

/* ------------------------------------------------------------------ */
/* Poranne podsumowanie                                                */
/* ------------------------------------------------------------------ */

const hhmm = d => new Date(d).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: config.timeZone });

/** Zajmuje dzień atomowo — tylko jedna instancja wyśle podsumowanie. */
async function claimDay(field, day) {
    const r = await Settings.updateOne({ key: 'main', [field]: { $ne: day } }, { $set: { [field]: day } });
    resetSettingsCache();
    return r.modifiedCount > 0;
}

async function morningSummary({ now = new Date(), force = false, only = null } = {}) {
    const settings = await getSettings();
    const { day, hour } = V.localParts(now, config.timeZone);
    if (!force) {
        if (settings.morningSummaryEnabled === false || hour < (settings.morningSummaryHour ?? 7)) return { sent: 0, skipped: 'not-yet' };
        if (!(await claimDay('morningSummaryLastDay', day))) return { sent: 0, skipped: 'done' };
    }
    const start = new Date(day + 'T00:00:00');
    const end = new Date(start.getTime() + DAY);
    const [tasks, people, newCount, unpaid, leaves, fleet] = await Promise.all([
        Task.find({ status: { $in: ['planned', 'progress'] }, dateStart: { $gte: start, $lt: end } }).select('number name dateStart address addressFrom workers branch clientName').sort({ dateStart: 1 }).lean(),
        Employee.find({ active: true }).select('name systemRole branch isOwner').lean(),
        Task.countDocuments({ status: 'new' }),
        Task.find({ status: 'completed', paymentStatus: { $ne: 'paid' } }).select('finalPrice price paymentStatus cashCollected').lean(),
        Leave.find({ status: 'approved', from: { $lte: end }, to: { $gte: start } }).select('employeeName').lean(),
        Fleet.find({ active: true }).lean()
    ]);
    const fleetAlerts = fleet.flatMap(v => require('../routes/admin-v11')._internal.fleetReminders(v).filter(r => r.level !== 'info').map(r => `${v.name}: ${r.label}`));
    const due = unpaid.reduce((s, t) => s + V.amountDue(t), 0);
    let sent = 0;
    const send = async (keys, title, body) => {
        const list = only ? keys.filter(k => k === only) : keys;
        if (!list.length) return;
        await notify.notify({ type: 'morning', title, body: body.slice(0, 400), url: '/revmi/#/pulpit', recipients: list, dedupeKey: force ? undefined : `morning:${day}:${list.join(',')}` });
        sent += list.length;
    };

    // Biuro (administrator, dyspozytor, kierownik — kierownik tylko swój oddział)
    const officeLine = (list) => list.length ? `${list.length} zleceń, start ${hhmm(list[0].dateStart)}` : 'brak zleceń';
    const officeBody = [
        `Dziś: ${officeLine(tasks)}.`,
        newCount ? `Nowe zgłoszenia do wyceny: ${newCount}.` : '',
        due > 0 ? `Należności: ${Math.round(due)} zł.` : '',
        leaves.length ? `Nieobecni: ${leaves.map(l => l.employeeName).join(', ')}.` : '',
        fleetAlerts.length ? `Flota: ${fleetAlerts.slice(0, 3).join('; ')}.` : ''
    ].filter(Boolean).join(' ');
    const officeKeys = ['admin', ...people.filter(p => ['admin', 'dispatcher'].includes(p.systemRole) && !p.isOwner).map(p => String(p._id))];
    await send(officeKeys, `Dzień dobry — plan na ${new Date(start).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}`, officeBody);
    for (const m of people.filter(p => p.systemRole === 'manager')) {
        const own = tasks.filter(t => String(t.branch || '') === String(m.branch || ''));
        await send([String(m._id)], 'Plan oddziału na dziś', `Dziś: ${officeLine(own)}.` + (own[0] ? ` Pierwsze: ${own[0].name} (${own[0].address || own[0].addressFrom || ''}).` : ''));
    }
    // Pracownicy — ich własne zlecenia
    for (const p of people.filter(x => ['worker', 'accountant'].includes(x.systemRole))) {
        const mine = tasks.filter(t => (t.workers || []).some(w => String(w.employee) === String(p._id)));
        if (!mine.length) continue;
        const first = mine[0];
        await send([String(p._id)], `Dziś masz ${mine.length} ${mine.length === 1 ? 'zlecenie' : mine.length < 5 ? 'zlecenia' : 'zleceń'}`,
            `Start ${hhmm(first.dateStart)}: ${first.name}${first.address || first.addressFrom ? ' — ' + (first.address || first.addressFrom) : ''}.` + (mine.length > 1 ? ` Potem: ${mine.slice(1, 4).map(t => hhmm(t.dateStart) + ' ' + t.name).join(', ')}.` : ''));
    }
    return { sent, day };
}

/* ------------------------------------------------------------------ */
/* Należności — automatyczne przypomnienia                             */
/* ------------------------------------------------------------------ */

async function autoReceivables(now = new Date()) {
    const settings = await getSettings();
    if (!settings.receivablesAutoRemind) return { sent: 0 };
    const { day, hour } = V.localParts(now, config.timeZone);
    if (hour < 9 || hour >= 19) return { sent: 0 };
    if (!(await claimDay('receivablesLastDay', day))) return { sent: 0 };
    const tasks = await Task.find({ status: 'completed', paymentStatus: { $ne: 'paid' }, completedAt: { $gte: new Date(now - 180 * DAY) } }).lean();
    const { sendReminder } = require('../routes/admin-v11')._internal;
    let sent = 0;
    for (const t of tasks) {
        if (!V.reminderDue(t, { firstDays: settings.receivablesFirstDays, everyDays: settings.receivablesEveryDays, max: settings.receivablesMaxReminders }, now)) continue;
        if (!t.clientEmail && !(t.clientPhone && sms.provider() !== 'manual')) continue; // bez kanału automatycznego
        try {
            await sendReminder(t, { channel: t.clientEmail && mail.isConfigured() ? 'email' : 'sms', auto: true });
            sent++;
        } catch (error) {
            console.warn('[RevSerwis] Przypomnienie o płatności', t.number, error.message);
        }
    }
    if (sent) await notify.notify({ type: 'receivables', title: 'Przypomnienia o płatności', body: `Wysłano ${sent} przypomnień do klientów.`, url: '/revmi/#/naleznosci', recipients: await notify.adminKeys(), dedupeKey: `recv:${day}` });
    return { sent };
}

/* ------------------------------------------------------------------ */
/* Flota — przypomnienia                                               */
/* ------------------------------------------------------------------ */

async function fleetDaily(now = new Date()) {
    const { day, hour } = V.localParts(now, config.timeZone);
    if (hour < 8) return { sent: 0 };
    if (!(await claimDay('fleetRemindersLastDay', day))) return { sent: 0 };
    const fleet = await Fleet.find({ active: true }).lean();
    const { fleetReminders } = require('../routes/admin-v11')._internal;
    // Tylko „pilne” (≤7 dni, po terminie, opony w sezonie) i maks. raz w tygodniu na pozycję.
    const lines = [];
    for (const v of fleet) {
        for (const r of fleetReminders(v, now.getTime()).filter(x => x.level !== 'info')) {
            const key = r.label.replace(/[^a-z]/gi, '').slice(0, 30);
            const last = v.fleetRemindedAt?.[key] ? new Date(v.fleetRemindedAt[key]) : null;
            if (last && now - last < 7 * DAY) continue;
            lines.push(`${v.name} (${v.plates}): ${r.label}${r.left != null ? (r.left < 0 ? ` — po terminie ${-r.left} dni` : ` — za ${r.left} dni`) : ''}`);
            await Fleet.updateOne({ _id: v._id }, { $set: { ['fleetRemindedAt.' + key]: now } });
        }
    }
    if (lines.length) await notify.notify({ type: 'fleet', title: 'Flota — terminy', body: lines.slice(0, 6).join('\n'), url: '/revmi/#/flota-koszty', recipients: await notify.adminKeys(), dedupeKey: `fleet:${day}` });
    return { sent: lines.length };
}

let started = false;
function startV11Jobs() {
    if (started) return;
    started = true;
    const safe = (name, fn) => () => fn().catch(error => console.error(`[RevSerwis] ${name}:`, error.message));
    setTimeout(safe('Automatyzacje', runRules), 45_000).unref?.();
    setInterval(safe('Automatyzacje', runRules), 15 * 60_000).unref?.();
    const everyFew = async () => { await morningSummary(); await autoReceivables(); await fleetDaily(); };
    setInterval(safe('Podsumowania', everyFew), 5 * 60_000).unref?.();
    setTimeout(safe('Podsumowania', everyFew), 90_000).unref?.();
}

module.exports = { runRules, morningSummary, autoReceivables, fleetDaily, startV11Jobs, ruleQuery, fill };
