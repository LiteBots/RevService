'use strict';

const express = require('express');
const { Task, Expense, Income, Employee, Fleet, Client, Activity, Message, Contract, StorageItem, PadNote, Branch, PayEntry } = require('../models');
const scope = require('../services/scope');
const roles = require('../../lib/v11-input');
const { yearlyTax } = require('../../lib/tax');
const { SLUGS, divisionName } = require('../../lib/divisions');
const { requireAdmin } = require('../middleware/auth');
const { asyncRoute, startOfMonth, startOfNextMonth, userKeyOf } = require('../utils');
const { getSettings } = require('../services/settings');

const router = express.Router();

function publicEmployee(employee, { admin = true } = {}) {
    const object = employee.toObject ? employee.toObject() : { ...employee };
    delete object.pin;
    delete object.pinHash;
    if (!admin) {
        delete object.hourlyRate;
        delete object.payRate;
        delete object.payRateUnit;
        delete object.email;
    }
    return object;
}

/** Pracownik nie widzi cen z wyceny RevBota ani kosztów — tylko uwagi praktyczne. */
function workerTask(t) {
    if (t.aiEstimate) t.aiEstimate = { admin: t.aiEstimate.admin, inventory: t.aiEstimate.inventory, source: t.aiEstimate.source };
    return t;
}

/** Jeden request startowy dla panelu — dane zależne od roli. */
router.get('/data', asyncRoute(async (req, res) => {
    const isAdmin = req.user.role === 'admin';
    // 9.2: role biurowe — klienci dla dyspozytora/księgowej, finanse dla księgowej, ceny w zleceniach dla biura.
    const role = req.user.role;
    const office = scope.fullView(req.user);
    const seeClients = roles.can(role, 'clients');
    const seeFinance = roles.can(role, 'finance');
    const allBranches = isAdmin || roles.seesAllTasks(role);
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 400);
    const taskFilter = { $or: [{ dateStart: { $gte: since } }, { status: { $in: ['new', 'quoted', 'planned', 'progress'] } }], ...scope.taskFilterFor(req.user) };
    const [tasks, employees, fleet, clients, expenses, incomes, settings, branches] = await Promise.all([
        Task.find(taskFilter).sort({ dateStart: 1 }).lean(),
        Employee.find({ active: true }).sort({ name: 1 }).lean(),
        Fleet.find({ active: true }).sort({ name: 1 }).lean(),
        seeClients ? Client.find({ archived: false }).sort({ name: 1 }).lean() : [],
        seeFinance ? Expense.find({ date: { $gte: since } }).sort({ date: -1 }).lean() : [],
        seeFinance ? Income.find({ date: { $gte: since } }).sort({ date: -1 }).lean() : [],
        office ? getSettings() : null,
        Branch.find(allBranches ? { active: true } : { _id: req.user.branch || null }).sort({ order: 1, name: 1 }).lean()
    ]);
    let settingsOut = settings ? { ...settings } : null;
    if (settingsOut) delete settingsOut.revbot;
    // Inne role biurowe dostają tylko ustawienia potrzebne do pracy (bez kluczy, stawek i konfiguracji).
    if (settingsOut && !isAdmin) {
        const keep = ['companyName', 'companyPhone', 'companyEmail', 'companyAddress', 'baseLat', 'baseLon', 'baseAddress', 'divisions', 'workDayStart', 'workDayEnd', 'liveLocationEnabled', 'googleReviewUrl'];
        settingsOut = Object.fromEntries(Object.entries(settingsOut).filter(([k]) => keep.includes(k)));
    }

    res.json({
        me: { role: req.user.role, roleLabel: roles.ROLE_LABELS[req.user.role] || req.user.role, perms: roles.permsOf(req.user.role), name: req.user.name, employeeId: req.user.employeeId || null, ownerEmployeeId: req.user.ownerEmployeeId || null, branch: req.user.branch || null, demo: Boolean(req.user.demo) },
        tasks: office ? tasks : tasks.map(workerTask),
        employees: employees.map(e => publicEmployee(e, { admin: isAdmin || roles.can(role, 'payroll') })),
        fleet,
        clients,
        expenses,
        incomes,
        settings: settingsOut,
        branches
    });
}));

router.get('/dashboard', requireAdmin, asyncRoute(async (req, res) => {
    const now = new Date();
    const from = startOfMonth(now);
    const to = startOfNextMonth(now);
    const seriesFrom = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const monthKey = { $dateToString: { format: '%Y-%m', date: '$d', timezone: process.env.TZ } };

    const soon = new Date(now.getTime() + 7 * 86_400_000);
    const [taskSeries, incomeSeries, expenseSeries, activeTasks, newQuotes, unpaidTasks, recentActivity, costCategories,
        newMessages, recentMessages, activeContracts, storageItems, divisionActive, divisionMonth, pinnedNotes] = await Promise.all([
        Task.aggregate([
            { $match: { status: 'completed', completedAt: { $gte: seriesFrom, $lt: to } } },
            { $project: { d: '$completedAt', v: { $ifNull: ['$finalPrice', '$price'] } } },
            { $group: { _id: monthKey, total: { $sum: '$v' }, count: { $sum: 1 } } }
        ]),
        Income.aggregate([
            { $match: { date: { $gte: seriesFrom, $lt: to } } },
            { $project: { d: '$date', v: '$price' } },
            { $group: { _id: monthKey, total: { $sum: '$v' } } }
        ]),
        Expense.aggregate([
            { $match: { date: { $gte: seriesFrom, $lt: to } } },
            { $project: { d: '$date', v: '$price' } },
            { $group: { _id: monthKey, total: { $sum: '$v' } } }
        ]),
        Task.countDocuments({ status: { $in: ['quoted', 'planned', 'progress'] } }),
        Task.countDocuments({ status: 'new' }),
        Task.countDocuments({ status: 'completed', paymentStatus: { $ne: 'paid' } }),
        Activity.find().sort({ createdAt: -1 }).limit(12).lean(),
        Expense.aggregate([
            { $match: { date: { $gte: from, $lt: to } } },
            { $group: { _id: '$category', total: { $sum: '$price' } } },
            { $sort: { total: -1 } },
            { $limit: 8 }
        ]),
        Message.countDocuments({ status: 'new' }),
        Message.find({ status: { $in: ['new', 'read'] } }).sort({ createdAt: -1 }).limit(5).select('name company topic status createdAt division').lean(),
        Contract.find({ status: 'active' }).select('number title clientName monthlyPrice nextBillingDate division').lean(),
        StorageItem.find({ status: { $in: ['stored', 'reserved'] } }).select('number clientName description endDate status volume monthlyPrice').lean(),
        Task.aggregate([{ $match: { status: { $in: ['new', 'quoted', 'planned', 'progress'] } } }, { $group: { _id: '$division', count: { $sum: 1 } } }]),
        Task.aggregate([
            { $match: { status: 'completed', completedAt: { $gte: from, $lt: to } } },
            { $group: { _id: '$division', total: { $sum: { $ifNull: ['$finalPrice', '$price'] } }, count: { $sum: 1 } } }
        ]),
        PadNote.find({ pinned: true, archived: false, $or: [{ ownerKey: userKeyOf(req.user) }, { visibility: 'team' }] }).sort({ updatedAt: -1 }).limit(4).lean()
    ]);

    const divisions = SLUGS.map(slug => {
        const active = divisionActive.find(r => r._id === slug)?.count || 0;
        const month = divisionMonth.find(r => r._id === slug);
        return { slug, name: divisionName(slug), active, completed: month?.count || 0, revenue: month?.total || 0 };
    });
    const business = {
        newMessages,
        recentMessages,
        mrr: activeContracts.reduce((sum, c) => sum + (c.monthlyPrice || 0), 0),
        activeContracts: activeContracts.length,
        contractsDue: activeContracts.filter(c => c.nextBillingDate && new Date(c.nextBillingDate) <= soon).sort((a, b) => new Date(a.nextBillingDate) - new Date(b.nextBillingDate)),
        storageCount: storageItems.filter(i => i.status === 'stored').length,
        storageVolume: Math.round(storageItems.filter(i => i.status === 'stored').reduce((sum, i) => sum + (i.volume || 0), 0) * 10) / 10,
        storageEnding: storageItems.filter(i => i.status === 'stored' && i.endDate && new Date(i.endDate) <= new Date(now.getTime() + 14 * 86_400_000)),
        divisions,
        pinnedNotes,
        toPay: (await PayEntry.aggregate([{ $match: { settled: false } }, { $group: { _id: null, total: { $sum: '$amount' } } }]))[0]?.total || 0,
        branches: await Branch.countDocuments({ active: true }),
        reviewsMonth: await Task.countDocuments({ 'reviewRequest.status': { $in: ['sent', 'manual'] }, completedAt: { $gte: from } })
    };

    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const tasksRow = taskSeries.find(r => r._id === key);
        const revenue = (tasksRow?.total || 0) + (incomeSeries.find(r => r._id === key)?.total || 0);
        const expenses = expenseSeries.find(r => r._id === key)?.total || 0;
        months.push({ key, label: d.toLocaleDateString('pl-PL', { month: 'short' }), revenue, expenses, completed: tasksRow?.count || 0 });
    }
    const current = months[months.length - 1];
    let tax = null;
    try {
        const settings = await getSettings();
        const year = await require('./stats').yearFinance(now.getFullYear(), settings);
        tax = { rate: settings.taxRate ?? 12, month: year[now.getMonth()]?.tax ?? 0, ytd: Math.round(year.reduce((s, m) => s + m.tax, 0) * 100) / 100, ytdProfit: Math.round(year.reduce((s, m) => s + m.profit, 0) * 100) / 100 };
    } catch { /* bez podatku */ }

    // 9.2: bez uprawnienia „finanse” — tylko liczby operacyjne (bez przychodów, kosztów, podatku i MRR).
    if (!roles.can(req.user.role, 'finance')) {
        return res.json({
            tax: null,
            limited: true,
            period: { from, to },
            stats: { revenue: null, expenses: null, profit: null, margin: null, completedTasks: current.completed, activeTasks, newQuotes, unpaidTasks },
            months: months.map(m => ({ key: m.key, label: m.label, completed: m.completed, revenue: 0, expenses: 0 })),
            costCategories: [],
            recentActivity,
            business: { ...business, mrr: null, toPay: null, contractsDue: business.contractsDue.map(c => ({ ...c, monthlyPrice: undefined })), divisions: business.divisions.map(d => ({ ...d, revenue: null })) }
        });
    }

    res.json({
        tax,
        period: { from, to },
        stats: {
            revenue: current.revenue,
            expenses: current.expenses,
            profit: current.revenue - current.expenses,
            margin: current.revenue ? ((current.revenue - current.expenses) / current.revenue) * 100 : 0,
            completedTasks: current.completed,
            activeTasks,
            newQuotes,
            unpaidTasks
        },
        months,
        costCategories,
        recentActivity,
        business
    });
}));

router.get('/activity', requireAdmin, asyncRoute(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const activity = await Activity.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ activity });
}));

module.exports = router;
module.exports.publicEmployee = publicEmployee;
