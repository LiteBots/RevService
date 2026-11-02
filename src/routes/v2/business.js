'use strict';

/** RevMi 2.0.0 — pulpit właściciela (prognoza brutto), budżety, raporty PDF, liczniki menu. */
const express = require('express');
const { Task, Expense, Income, Fleet, Branch, Message, Notification, Employee } = require('../../models');
const { Leave } = require('../../models-v11');
const { SwapRequest, FaultReport, Equipment, PackageSub, ChatChannel, ChatMessage, ChatRead } = require('../../models-v2');
const V = require('../../../lib/v2');
const V11 = require('../../../lib/v11-input');
const scope = require('../../services/scope');
const { requireAdmin } = require('../../middleware/auth');
const { asyncRoute, httpError, userKeyOf } = require('../../utils');
const { getSettings } = require('../../services/settings');
const { getV2, updateV2 } = require('../../services/v2-config');
const report = require('../../services/v2-report');

const router = express.Router();

const FIELDS = 'number name type status price finalPrice dateStart dateEnd branch workers address addressFrom addressTo clientName paymentStatus cashCollected completedAt division priority';

/** Filtr oddziału: kierownik widzi swój oddział, reszta biura — wszystko albo wybrany oddział. */
function branchFilter(req) {
    if (req.user.role === 'manager') return { branch: req.user.branch || null };
    if (req.query.branch === 'none') return { branch: null };
    if (/^[a-f0-9]{24}$/.test(String(req.query.branch || ''))) return { branch: req.query.branch };
    return {};
}

router.get('/v2/dashboard', requireAdmin, asyncRoute(async (req, res) => {
    const now = new Date();
    const cfg = await getV2();
    const settings = await getSettings();
    const week = V.periodRange('week', now);
    const month = V.periodRange('month', now);
    const prevMonth = V.periodRange('month', now, -1);
    const today = V.periodRange('day', now);
    const seriesFrom = V.periodRange('week', now, -5).from;
    const seriesTo = V.periodRange('week', now, 3).from;
    const from = new Date(Math.min(seriesFrom, prevMonth.from));
    const to = new Date(Math.max(seriesTo, month.to));
    const bf = branchFilter(req);

    const [tasks, expenses, incomes, branches, unpaid, newQuotes, fleet, leaves, swaps, faults, lowStock, renewals, reschedules, unassigned, employeeCount] = await Promise.all([
        Task.find({ status: { $in: V.FORECAST_STATUSES }, dateStart: { $gte: from, $lt: to }, ...bf }).select(FIELDS).lean(),
        Expense.find({ date: { $gte: prevMonth.from, $lt: month.to }, ...(bf.branch !== undefined ? { branch: bf.branch } : {}) }).select('price category source branch date').lean(),
        Income.find({ date: { $gte: prevMonth.from, $lt: month.to }, task: null }).select('price date').lean(),
        Branch.find({ active: true }).select('name color').sort({ order: 1, name: 1 }).lean(),
        Task.find({ status: 'completed', paymentStatus: { $ne: 'paid' }, ...bf }).select('finalPrice price cashCollected paymentStatus completedAt dateStart').lean(),
        Task.find({ status: 'new', ...bf }).select('name createdAt clientName').sort({ createdAt: 1 }).lean(),
        Fleet.find({ active: true }).select('name plates insuranceUntil inspectionUntil nextServiceDate').lean(),
        Leave.countDocuments({ status: 'pending', ...(req.user.role === 'manager' ? { branch: req.user.branch || null } : {}) }),
        SwapRequest.countDocuments({ status: 'pending' }),
        FaultReport.find({ status: { $ne: 'resolved' } }).select('subject priority kind createdAt').sort({ createdAt: -1 }).limit(20).lean(),
        Equipment.find({ active: true, minQty: { $gt: 0 }, $expr: { $lte: ['$qty', '$minQty'] } }).select('name qty minQty unit').limit(20).lean(),
        PackageSub.find({ status: 'active', renewDate: { $lte: new Date(now.getTime() + 7 * V.DAY) } }).select('clientName planName renewDate').lean(),
        Task.find({ status: { $in: ['planned', 'quoted'] }, clientRescheduleNote: { $ne: '' }, dateStart: { $gte: today.from }, ...bf }).select('name dateStart clientRescheduleNote').limit(10).lean(),
        Task.find({ status: 'planned', dateStart: { $gte: now, $lt: new Date(now.getTime() + 2 * V.DAY) }, workers: { $size: 0 }, ...bf }).select('name dateStart address').sort({ dateStart: 1 }).lean(),
        Employee.countDocuments({ active: true, isOwner: { $ne: true }, ...(req.user.role === 'manager' ? { branch: req.user.branch || null } : {}) })
    ]);

    // Prognoza (B1)
    const fWeek = V.forecast(tasks, week, cfg);
    const fMonth = V.forecast(tasks, month, cfg);
    const fPrevMonth = V.forecast(tasks, prevMonth, cfg);
    const goal = req.user.role === 'manager' && req.user.branch ? Number(cfg.branchGoals?.[req.user.branch] || 0) : Number(cfg.monthlyGoal || 0);

    // Marża (zrealizowane + inne przychody − koszty)
    const inRange = (d, r) => new Date(d) >= r.from && new Date(d) < r.to;
    const sum = list => V.round2(list.reduce((s, x) => s + (Number(x.price) || 0), 0));
    const margin = r => {
        const revenue = V.forecast(tasks.filter(t => t.status === 'completed'), r, cfg).done + sum(incomes.filter(i => inRange(i.date, r)));
        const costs = sum(expenses.filter(e => inRange(e.date, r)));
        return { revenue: V.round2(revenue), costs, profit: V.round2(revenue - costs), pct: revenue > 0 ? Math.round(((revenue - costs) / revenue) * 100) : null };
    };
    const mNow = margin(month);
    const mPrev = margin(prevMonth);

    // Należności
    const firstDays = settings.receivablesFirstDays || 7;
    const dues = unpaid.map(t => ({ due: V11.amountDue(t), days: Math.floor((now - new Date(t.completedAt || t.dateStart)) / V.DAY) })).filter(x => x.due > 0);
    const receivables = { total: V.round2(dues.reduce((s, x) => s + x.due, 0)), count: dues.length, overdue: dues.filter(x => x.days > firstDays).length };

    // Budżety
    const budgets = V.budgetStatus((cfg.budgets || []).filter(b => !bf.branch || String(b.branch || '') === String(bf.branch)), expenses.filter(e => inRange(e.date, month)));

    // Wymaga uwagi
    const attention = [];
    for (const t of unassigned) attention.push({ level: 'high', kind: 'crew', text: `${t.name} — bez ekipy`, when: t.dateStart, link: `#/zlecenia/${t._id}` });
    const staleQuotes = newQuotes.filter(q => now - new Date(q.createdAt) > 48 * 3600_000);
    if (staleQuotes.length) attention.push({ level: 'mid', kind: 'quote', text: `${staleQuotes.length} ${staleQuotes.length === 1 ? 'wycena czeka' : 'wyceny czekają'} ponad 2 dni${staleQuotes[0].clientName ? ' · ' + staleQuotes[0].clientName : ''}`, link: '#/wyceny' });
    for (const r of reschedules) attention.push({ level: 'mid', kind: 'reschedule', text: `Klient prosi o zmianę terminu: ${r.name}`, when: r.dateStart, link: `#/zlecenia/${r._id}` });
    const soon = new Date(now.getTime() + 14 * V.DAY);
    for (const v of fleet) {
        for (const [k, label] of [['insuranceUntil', 'OC'], ['inspectionUntil', 'Przegląd'], ['nextServiceDate', 'Serwis']]) {
            if (v[k] && new Date(v[k]) <= soon) attention.push({ level: new Date(v[k]) < now ? 'high' : 'mid', kind: 'fleet', text: `${label} ${v.name} ${v.plates}`, when: v[k], link: '#/flota' });
        }
    }
    for (const b of budgets.filter(x => x.level !== 'ok')) attention.push({ level: b.level === 'over' ? 'high' : 'low', kind: 'budget', text: `${b.category}: ${b.pct}% budżetu`, link: '#/finanse/budzety' });
    for (const f of faults.filter(x => x.priority !== 'low')) attention.push({ level: f.priority === 'critical' ? 'high' : 'mid', kind: 'fault', text: `Usterka: ${f.subject || 'zgłoszenie'}`, when: f.createdAt, link: '#/flota/usterki' });
    if (leaves) attention.push({ level: 'low', kind: 'leave', text: `${leaves} ${leaves === 1 ? 'wniosek urlopowy' : 'wnioski urlopowe'} do decyzji`, link: '#/zespol/urlopy' });
    if (swaps) attention.push({ level: 'low', kind: 'swap', text: `${swaps} ${swaps === 1 ? 'prośba' : 'prośby'} o zamianę zmiany`, link: '#/grafik' });
    for (const e of lowStock) attention.push({ level: 'low', kind: 'stock', text: `Kończy się: ${e.name} (${e.qty} ${e.unit})`, link: '#/magazyn' });
    for (const p of renewals) attention.push({ level: 'low', kind: 'package', text: `Odnowienie pakietu ${p.planName} · ${p.clientName}`, when: p.renewDate, link: '#/pakiety' });
    const order = { high: 0, mid: 1, low: 2 };
    attention.sort((a, b) => order[a.level] - order[b.level]);

    // 2.1: cel tygodniowy — wpisany ręcznie albo wyliczony z miesięcznego (proporcjonalnie do 7 dni)
    const daysInMonth = Math.round((month.to - month.from) / 86_400_000) || 30;
    const weekGoal = Number(cfg.weeklyGoal || 0) || (goal ? Math.round((goal * 7) / daysInMonth) : 0);

    const todayTasks = tasks.filter(t => new Date(t.dateStart) >= today.from && new Date(t.dateStart) < today.to).sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart));

    res.json({
        now,
        gross: cfg.pricesAreGross !== false,
        week: { ...fWeek, from: week.from, to: week.to, goal: weekGoal, goalPct: weekGoal ? Math.round((fWeek.total / weekGoal) * 100) : null },
        month: { ...fMonth, from: month.from, to: month.to, goal, goalPct: goal ? Math.round((fMonth.total / goal) * 100) : null },
        prevMonth: fPrevMonth,
        margin: { ...mNow, prevPct: mPrev.pct, diff: mNow.pct !== null && mPrev.pct !== null ? mNow.pct - mPrev.pct : null },
        receivables,
        series: V.weeklySeries(tasks, now, { back: 5, ahead: 2 }, cfg).map(s => ({ label: s.label, done: s.done, planned: s.planned, current: s.current })),
        branches: V.byBranch(tasks, month, branches, cfg).map(b => ({ name: b.name, color: b.color, total: b.total, count: b.count })),
        today: todayTasks.map(t => ({ _id: t._id, name: t.name, type: t.type, status: t.status, dateStart: t.dateStart, place: t.address || [t.addressFrom, t.addressTo].filter(Boolean).join(' → '), workers: (t.workers || []).map(w => w.name), amount: V.toGross(V.taskAmount(t), cfg) })),
        attention: attention.slice(0, 12),
        budgets,
        newQuotes: newQuotes.length,
        // 2.1: statystyki dzień / tydzień / miesiąc (przychód z zakończonych, ludzie, podatek)
        stats: {
            employees: employeeCount,
            day: V.periodStats(tasks, today, cfg, settings.taxRate ?? 12),
            week: V.periodStats(tasks, week, cfg, settings.taxRate ?? 12),
            month: V.periodStats(tasks, month, cfg, settings.taxRate ?? 12)
        }
    });
}));

/** Liczniki do menu (odświeżane co ~30 s). */
router.get('/v2/badges', asyncRoute(async (req, res) => {
    const key = userKeyOf(req.user);
    const office = scope.isOffice(req.user);
    const tf = scope.taskFilterFor(req.user);
    const [quotes, messages, taskChats, swaps, leaves, notifications, chat] = await Promise.all([
        office ? Task.countDocuments({ status: 'new', ...tf }) : 0,
        office ? Message.countDocuments({ status: 'new' }) : 0,
        office ? Task.countDocuments({ chatUnreadStaff: { $gt: 0 }, ...tf }) : 0,
        V11.can(req.user.role, 'dispatch') ? SwapRequest.countDocuments({ status: 'pending' }) : SwapRequest.countDocuments({ to: scope.selfId(req.user), peerStatus: 'pending', status: 'pending' }),
        V11.can(req.user.role, 'leaves') ? Leave.countDocuments({ status: 'pending' }) : 0,
        Notification.countDocuments({ recipients: key, readBy: { $ne: key } }),
        teamChatUnread(req.user)
    ]);
    res.json({ wyceny: quotes, skrzynka: messages + taskChats, grafik: swaps, urlopy: leaves, powiadomienia: notifications, czat: chat });
}));

async function teamChatUnread(user) {
    const key = userKeyOf(user);
    const channels = await ChatChannel.find(require('./chat').channelFilter(user)).select('_id lastMessageAt').lean();
    if (!channels.length) return 0;
    const reads = await ChatRead.find({ userKey: key, channel: { $in: channels.map(c => c._id) } }).lean();
    const readBy = new Map(reads.map(r => [String(r.channel), r.lastReadAt]));
    let n = 0;
    for (const c of channels) {
        if (!c.lastMessageAt) continue;
        const since = readBy.get(String(c._id)) || new Date(0);
        if (c.lastMessageAt > since) n += await ChatMessage.countDocuments({ channel: c._id, createdAt: { $gt: since }, authorKey: { $ne: key }, deletedAt: null });
    }
    return n;
}

/* ------------------------------------------------------------------ */
/* Budżety (B5)                                                        */
/* ------------------------------------------------------------------ */

router.get('/v2/budgets', requireAdmin, asyncRoute(async (req, res) => {
    const cfg = await getV2();
    const base = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? new Date(req.query.month + '-01T12:00:00') : new Date();
    const range = V.periodRange('month', base);
    const [expenses, branches] = await Promise.all([
        Expense.find({ date: { $gte: range.from, $lt: range.to } }).select('price category source branch date desc').lean(),
        Branch.find({ active: true }).select('name color').sort({ order: 1, name: 1 }).lean()
    ]);
    const byCategory = {};
    for (const e of expenses) { const c = V.budgetCategory(e); byCategory[c] = V.round2((byCategory[c] || 0) + (Number(e.price) || 0)); }
    res.json({
        month: V.dayKey(range.from).slice(0, 7),
        categories: V.BUDGET_CATEGORIES,
        budgets: V.budgetStatus(cfg.budgets || [], expenses),
        spentByCategory: byCategory,
        total: V.round2(expenses.reduce((s, e) => s + (Number(e.price) || 0), 0)),
        branches,
        monthlyGoal: cfg.monthlyGoal || 0,
        branchGoals: cfg.branchGoals || {}
    });
}));

router.put('/v2/budgets', requireAdmin, asyncRoute(async (req, res) => {
    const cfg = await updateV2({ budgets: req.body?.budgets, monthlyGoal: req.body?.monthlyGoal, branchGoals: req.body?.branchGoals });
    res.json({ success: true, budgets: cfg.budgets, monthlyGoal: cfg.monthlyGoal, branchGoals: cfg.branchGoals });
}));

/* ------------------------------------------------------------------ */
/* Raporty (B9)                                                        */
/* ------------------------------------------------------------------ */

const reportRange = req => {
    const kind = req.query.kind === 'week' || req.body?.kind === 'week' ? 'week' : 'month';
    const offset = Math.max(-24, Math.min(0, Number(req.query.offset ?? req.body?.offset ?? -1) || 0));
    return { kind, offset, ...V.periodRange(kind, new Date(), offset) };
};

router.get('/v2/reports/data', requireAdmin, asyncRoute(async (req, res) => {
    const r = reportRange(req);
    res.json(await report.buildReport(r));
}));

router.get('/v2/reports/pdf', requireAdmin, asyncRoute(async (req, res) => {
    const r = reportRange(req);
    const data = await report.buildReport(r);
    const pdf = await report.renderPdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="RevSerwis-raport-${data.slug}.pdf"`);
    res.send(pdf);
}));

router.post('/v2/reports/send', requireAdmin, asyncRoute(async (req, res) => {
    const r = reportRange(req);
    const to = Array.isArray(req.body?.to) && req.body.to.length ? req.body.to : undefined;
    const result = await report.sendReport(r, { to });
    if (!result.ok) throw httpError(400, result.error || 'Nie udało się wysłać raportu');
    res.json({ success: true, to: result.to });
}));

module.exports = router;
