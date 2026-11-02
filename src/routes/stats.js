'use strict';

/**
 * 8.0: statystyki administratora — przychody, koszty (w tym koszty zleceń i wypłaty), zysk, podatek,
 * oddziały, pracownicy, usługi, skuteczność RevBota, konwersja wycen i prośby o opinie.
 */
const express = require('express');
const { Task, Expense, Income, Employee, Branch, PayEntry, RevBotMemory } = require('../models');
const { requireAdmin } = require('../middleware/auth');
const { asyncRoute } = require('../utils');
const { getSettings } = require('../services/settings');
const { yearlyTax } = require('../../lib/tax');

const router = express.Router();
const TZ = () => process.env.TZ || 'Europe/Warsaw';
const monthKey = field => ({ $dateToString: { format: '%Y-%m', date: field, timezone: TZ() } });
const value = { $ifNull: ['$finalPrice', '$price'] };
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;

function taxOpts(s) {
    return { rate: s.taxRate ?? 12, upperRate: s.taxUpperRate ?? 32, threshold: s.taxThreshold ?? 120000, freeAmount: s.taxFreeAmount ?? 0 };
}

/** Przychody i koszty miesiąc po miesiącu w danym roku (+ podatek narastająco). */
async function yearFinance(year, settings) {
    const from = new Date(year, 0, 1);
    const to = new Date(year + 1, 0, 1);
    const [tasks, incomes, expenses] = await Promise.all([
        Task.aggregate([
            { $match: { status: 'completed', completedAt: { $gte: from, $lt: to } } },
            { $group: { _id: monthKey('$completedAt'), total: { $sum: value }, count: { $sum: 1 } } }
        ]),
        Income.aggregate([{ $match: { date: { $gte: from, $lt: to } } }, { $group: { _id: monthKey('$date'), total: { $sum: '$price' } } }]),
        Expense.aggregate([{ $match: { date: { $gte: from, $lt: to } } }, { $group: { _id: monthKey('$date'), total: { $sum: '$price' } } }])
    ]);
    const months = [];
    const now = new Date();
    const last = year === now.getFullYear() ? now.getMonth() : 11;
    for (let m = 0; m <= last; m++) {
        const key = `${year}-${String(m + 1).padStart(2, '0')}`;
        const t = tasks.find(x => x._id === key);
        months.push({
            key,
            label: new Date(year, m, 1).toLocaleDateString('pl-PL', { month: 'short' }),
            revenue: r2((t?.total || 0) + (incomes.find(x => x._id === key)?.total || 0)),
            expenses: r2(expenses.find(x => x._id === key)?.total || 0),
            completed: t?.count || 0
        });
    }
    return yearlyTax(months, taxOpts(settings));
}

router.get('/stats', requireAdmin, asyncRoute(async (req, res) => {
    const settings = await getSettings();
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const months = await yearFinance(year, settings);
    const monthIdx = req.query.month ? Math.min(11, Math.max(0, Number(req.query.month) - 1)) : (year === now.getFullYear() ? now.getMonth() : 11);
    const from = req.query.period === 'year' ? new Date(year, 0, 1) : new Date(year, monthIdx, 1);
    const to = req.query.period === 'year' ? new Date(year + 1, 0, 1) : new Date(year, monthIdx + 1, 1);

    const [branches, employees, completed, costByCat, payOpen, paySettled, quotes, revbotTasks, memoryCount, reviews] = await Promise.all([
        Branch.find({}).sort({ order: 1, name: 1 }).lean(),
        Employee.find({ active: true }).select('name branch isOwner color').lean(),
        Task.find({ status: 'completed', completedAt: { $gte: from, $lt: to } })
            .select('number type division branch finalPrice price costs hoursWorked workers aiEstimate.low aiEstimate.high reviewRequest.status').lean(),
        Expense.aggregate([{ $match: { date: { $gte: from, $lt: to } } }, { $group: { _id: { cat: '$category', branch: '$branch', source: '$source' }, total: { $sum: '$price' } } }]),
        PayEntry.aggregate([{ $match: { settled: false } }, { $group: { _id: '$employee', total: { $sum: '$amount' }, n: { $sum: 1 } } }]),
        PayEntry.aggregate([{ $match: { settled: true, settledAt: { $gte: from, $lt: to } } }, { $group: { _id: '$employee', total: { $sum: '$amount' } } }]),
        Task.aggregate([
            { $match: { source: { $in: ['Wycena AI', 'Wycena RevBot', 'Formularz WWW'] }, createdAt: { $gte: from, $lt: to } } },
            { $group: { _id: '$status', n: { $sum: 1 } } }
        ]),
        Task.find({ status: 'completed', 'aiEstimate.high': { $gt: 0 }, completedAt: { $gte: new Date(now.getTime() - 365 * 86_400_000) } })
            .select('finalPrice price aiEstimate.low aiEstimate.high aiEstimate.source').limit(400).lean(),
        RevBotMemory.countDocuments({ active: true }),
        Task.aggregate([{ $match: { 'reviewRequest.consent': true, completedAt: { $gte: from, $lt: to } } }, { $group: { _id: '$reviewRequest.status', n: { $sum: 1 } } }])
    ]);

    const val = t => Number(t.finalPrice ?? t.price) || 0;
    const taskCost = t => ['fuel', 'materials', 'disposal', 'other'].reduce((s, k) => s + (Number(t.costs?.[k]) || 0), 0);
    const revenue = completed.reduce((s, t) => s + val(t), 0);
    const expensesTotal = costByCat.reduce((s, c) => s + c.total, 0);
    const categories = {};
    for (const c of costByCat) categories[c._id.cat] = r2((categories[c._id.cat] || 0) + c.total);

    // Oddziały
    const branchRows = [{ _id: null, name: 'Ekipa główna (bez oddziału)', color: '#8a8f98' }, ...branches].map(b => {
        const id = b._id ? String(b._id) : '';
        const list = completed.filter(t => String(t.branch || '') === id);
        const bRevenue = list.reduce((s, t) => s + val(t), 0);
        const bCosts = costByCat.filter(c => String(c._id.branch || '') === id).reduce((s, c) => s + c.total, 0);
        return {
            _id: b._id, name: b.name, color: b.color, active: b.active !== false,
            members: employees.filter(e => String(e.branch || '') === id).length,
            completed: list.length, revenue: r2(bRevenue), costs: r2(bCosts), profit: r2(bRevenue - bCosts),
            hours: r2(list.reduce((s, t) => s + (t.hoursWorked || 0), 0))
        };
    }).filter(b => b._id || b.completed || b.members);

    // Pracownicy
    const empRows = employees.map(e => {
        const id = String(e._id);
        const mine = completed.filter(t => (t.workers || []).some(w => String(w.employee) === id));
        return {
            _id: e._id, name: e.name, color: e.color, isOwner: e.isOwner, branch: e.branch,
            tasks: mine.length, revenue: r2(mine.reduce((s, t) => s + val(t) / Math.max(1, (t.workers || []).length), 0)),
            toPay: r2(payOpen.find(p => String(p._id) === id)?.total || 0),
            paid: r2(paySettled.find(p => String(p._id) === id)?.total || 0)
        };
    }).sort((a, b) => b.tasks - a.tasks);

    // Usługi
    const byType = new Map();
    for (const t of completed) {
        const k = t.type || 'Inne';
        const row = byType.get(k) || { type: k, count: 0, revenue: 0, costs: 0, hours: 0 };
        row.count += 1;
        row.revenue += val(t);
        row.costs += taskCost(t);
        row.hours += t.hoursWorked || 0;
        byType.set(k, row);
    }
    const services = [...byType.values()].map(r => ({ ...r, revenue: r2(r.revenue), costs: r2(r.costs), avg: r2(r.revenue / r.count), margin: r.revenue ? Math.round(((r.revenue - r.costs) / r.revenue) * 100) : 0 }))
        .sort((a, b) => b.revenue - a.revenue);

    // RevBot — trafność wycen
    const errs = [];
    let inRange = 0;
    for (const t of revbotTasks) {
        const final = Number(t.finalPrice ?? t.price) || 0;
        if (!final) continue;
        const mid = (t.aiEstimate.low + t.aiEstimate.high) / 2;
        errs.push(Math.abs(final - mid) / final);
        if (final >= t.aiEstimate.low * 0.95 && final <= t.aiEstimate.high * 1.05) inRange += 1;
    }
    const revbot = {
        compared: errs.length,
        accuracy: errs.length ? Math.round((1 - errs.reduce((a, b) => a + b, 0) / errs.length) * 100) : null,
        inRange: errs.length ? Math.round((inRange / errs.length) * 100) : null,
        memory: memoryCount
    };

    const qMap = Object.fromEntries(quotes.map(q => [q._id, q.n]));
    const qTotal = quotes.reduce((s, q) => s + q.n, 0);
    const won = (qMap.planned || 0) + (qMap.progress || 0) + (qMap.completed || 0);

    const periodProfit = revenue - expensesTotal;
    const ytd = months.reduce((s, m) => s + m.profit, 0);
    res.json({
        period: { from, to, kind: req.query.period === 'year' ? 'year' : 'month' },
        totals: {
            revenue: r2(revenue), expenses: r2(expensesTotal), profit: r2(periodProfit),
            margin: revenue ? Math.round((periodProfit / revenue) * 100) : 0,
            completed: completed.length, avgTicket: completed.length ? r2(revenue / completed.length) : 0,
            taskCosts: r2(completed.reduce((s, t) => s + taskCost(t), 0)),
            payroll: r2(costByCat.filter(c => c._id.source === 'payroll').reduce((s, c) => s + c.total, 0)),
            toPay: r2(payOpen.reduce((s, p) => s + p.total, 0))
        },
        tax: {
            rate: settings.taxRate ?? 12,
            month: req.query.period === 'year' ? null : (months[monthIdx]?.tax ?? 0),
            ytd: r2(months.reduce((s, m) => s + m.tax, 0)),
            ytdProfit: r2(ytd),
            threshold: settings.taxThreshold ?? 120000,
            upperRate: settings.taxUpperRate ?? 32,
            freeAmount: settings.taxFreeAmount ?? 0
        },
        months,
        categories,
        branches: branchRows,
        employees: empRows,
        services,
        revbot,
        quotes: { total: qTotal, won, conversion: qTotal ? Math.round((won / qTotal) * 100) : 0, byStatus: qMap },
        reviews: Object.fromEntries(reviews.map(r => [r._id || 'pending', r.n]))
    });
}));

module.exports = router;
module.exports.yearFinance = yearFinance;
