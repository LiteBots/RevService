'use strict';

/**
 * RevMi 2.0.0 — zadania cykliczne (co 5 minut, bezpieczne przy kilku instancjach dzięki claimJob / dedupeKey):
 * SMS dzień przed, przypomnienia CRM, odnowienia pakietów, alerty budżetów, raporty PDF, niezamknięty czas pracy.
 */
const { Task, Client, Expense } = require('../models');
const { PackageSub, TimeEntry } = require('../models-v2');
const V = require('../../lib/v2');
const notify = require('./notify');
const sms = require('./sms');
const { getV2, claimJob } = require('./v2-config');

const localHour = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: process.env.TZ }).format(d));

async function smsReminders(cfg, now) {
    if (!cfg.smsReminderEnabled || sms.provider() !== 'smsapi') return;
    if (localHour(now) < cfg.smsReminderHour) return;
    if (!await claimJob('smsReminder', V.dayKey(now))) return;
    const tomorrow = V.periodRange('day', now, 1);
    const tasks = await Task.find({ status: 'planned', dateStart: { $gte: tomorrow.from, $lt: tomorrow.to }, clientPhone: { $ne: '' }, smsReminderAt: null }).lean();
    const { sendTaskSms } = require('./v2-sms');
    for (const t of tasks) await sendTaskSms(t, 'reminder').catch(e => console.error('[RevMi 2.0] SMS:', e.message));
    if (tasks.length) console.log(`[RevMi 2.0] Wysłano ${tasks.length} SMS z przypomnieniem`);
}

async function crmReminders(now) {
    const due = await Client.find({ nextActionAt: { $lte: now }, nextActionNotifiedAt: null, archived: false }).select('name company nextAction').limit(50).lean();
    if (!due.length) return;
    const keys = await notify.adminKeys();
    for (const c of due) {
        await Client.updateOne({ _id: c._id }, { $set: { nextActionNotifiedAt: now } });
        void notify.notify({ type: 'crm', title: '⏰ Przypomnienie: klient', body: `${c.company || c.name}: ${c.nextAction || 'kontakt'}`, url: `/revmi/#/klienci/${c._id}`, recipients: keys, dedupeKey: `crm-${c._id}-${V.dayKey(now)}` });
    }
}

async function packageRenewals(now) {
    const keys = await notify.adminKeys();
    // Odnowienie okresu + faktura
    const ended = await PackageSub.find({ status: 'active', renewDate: { $lte: now } }).limit(100);
    for (const sub of ended) {
        if (!sub.autoRenew) {
            void notify.notify({ type: 'package', title: '📦 Pakiet wygasł', body: `${sub.clientName}: ${sub.planName} — bez automatycznego odnowienia`, url: '/revmi/#/pakiety', recipients: keys, dedupeKey: `pkg-end-${sub._id}-${V.dayKey(sub.renewDate)}` });
            sub.status = 'paused';
            await sub.save();
            continue;
        }
        sub.periodStart = sub.renewDate;
        sub.renewDate = V.addPeriod(sub.renewDate, sub.period);
        sub.invoices.push({ periodStart: sub.periodStart, periodEnd: sub.renewDate, amountNet: sub.priceNet, amountGross: V.grossOf(sub.priceNet, sub.vatRate), status: 'due', number: `${sub.number}/${V.dayKey(sub.periodStart).slice(0, 7)}` });
        await sub.save();
        void notify.notify({ type: 'package', title: '📦 Nowy okres pakietu — faktura', body: `${sub.clientName}: ${sub.planName}, ${V.grossOf(sub.priceNet, sub.vatRate)} zł brutto`, url: '/revmi/#/pakiety', recipients: keys, dedupeKey: `pkg-inv-${sub._id}-${V.dayKey(sub.periodStart)}` });
    }
    // Uprzedzenie 7 dni przed odnowieniem
    const soon = await PackageSub.find({ status: 'active', renewDate: { $lte: new Date(now.getTime() + 7 * V.DAY), $gt: now } }).limit(100);
    for (const sub of soon) {
        if (sub.renewAlertFor && sub.renewAlertFor.getTime() === sub.renewDate.getTime()) continue;
        sub.renewAlertFor = sub.renewDate;
        await sub.save();
        void notify.notify({ type: 'package', title: '📦 Pakiet do odnowienia', body: `${sub.clientName}: ${sub.planName} · ${sub.renewDate.toLocaleDateString('pl-PL', { timeZone: process.env.TZ })}${sub.autoRenew ? ' (odnowi się sam)' : ' — zadzwoń do klienta'}`, url: '/revmi/#/pakiety', recipients: keys });
    }
}

async function budgetAlerts(cfg, now) {
    if (!cfg.budgets?.length) return;
    const month = V.periodRange('month', now);
    const expenses = await Expense.find({ date: { $gte: month.from, $lt: month.to } }).select('price category source branch').lean();
    const status = V.budgetStatus(cfg.budgets, expenses).filter(b => b.level !== 'ok');
    if (!status.length) return;
    const keys = await notify.adminKeys();
    const mk = V.dayKey(month.from).slice(0, 7);
    for (const b of status) {
        void notify.notify({
            type: 'budget',
            title: b.level === 'over' ? `⚠️ Budżet przekroczony: ${b.category}` : `Budżet ${b.category}: ${b.pct}%`,
            body: `${Math.round(b.spent)} zł z ${Math.round(b.amount)} zł w tym miesiącu`,
            url: '/revmi/#/finanse/budzety',
            recipients: keys,
            dedupeKey: `budget-${b._id}-${mk}-${b.level}`
        });
    }
}

async function reports(cfg, now) {
    if (localHour(now) < 7) return;
    const report = require('./v2-report');
    const dow = (now.getDay() + 6) % 7;
    if (cfg.reportWeekly && dow === 0) {
        const r = V.periodRange('week', now, -1);
        if (await claimJob('reportWeek', V.dayKey(r.from))) {
            const res = await report.sendReport({ kind: 'week', ...r }).catch(e => ({ ok: false, error: e.message }));
            if (!res.ok) console.warn('[RevMi 2.0] Raport tygodniowy:', res.error);
        }
    }
    if (cfg.reportMonthly && now.getDate() === 1) {
        const r = V.periodRange('month', now, -1);
        if (await claimJob('reportMonth', V.dayKey(r.from))) {
            const res = await report.sendReport({ kind: 'month', ...r }).catch(e => ({ ok: false, error: e.message }));
            if (!res.ok) console.warn('[RevMi 2.0] Raport miesięczny:', res.error);
        }
    }
}

async function forgottenTime(now) {
    const open = await TimeEntry.find({ open: true }).select('employee employeeName events day').lean();
    for (const e of open) {
        const t = V.timeTotals(e.events, now);
        if (t.minutes < 11 * 60) continue;
        void notify.notify({ type: 'time', title: '⏱ Nadal liczysz czas pracy', body: `Licznik działa od ${t.startedAt ? t.startedAt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: process.env.TZ }) : 'rana'}. Zakończ pracę w aplikacji, jeśli już skończyłeś.`, url: '/revmi/#/czas', recipients: [String(e.employee)], dedupeKey: `time-open-${e._id}-${e.day}` });
    }
}

async function tick() {
    const now = new Date();
    const cfg = await getV2({ fresh: true });
    for (const [name, job] of [
        ['sms', () => smsReminders(cfg, now)],
        ['crm', () => crmReminders(now)],
        ['packages', () => packageRenewals(now)],
        ['budgets', () => budgetAlerts(cfg, now)],
        ['reports', () => reports(cfg, now)],
        ['time', () => forgottenTime(now)]
    ]) {
        try { await job(); } catch (error) { console.error(`[RevMi 2.0] Zadanie ${name}:`, error.message); }
    }
}

function startV2Jobs({ intervalMs = 5 * 60_000 } = {}) {
    setTimeout(() => void tick(), 20_000);
    const timer = setInterval(() => void tick(), intervalMs);
    timer.unref?.();
    return timer;
}

module.exports = { startV2Jobs, tick };
