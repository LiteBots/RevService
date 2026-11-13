'use strict';

/**
 * RevMi 2.0.0 — raport tygodniowy / miesięczny: dane, PDF (pdfkit + Noto Sans z polskimi znakami) i wysyłka e-mailem.
 */
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { Task, Expense, Income, Branch, Employee } = require('../models');
const V = require('../../lib/v2');
const V11 = require('../../lib/v11-input');
const { getV2 } = require('./v2-config');
const { getSettings } = require('./settings');

const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const fmtDay = d => `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
const zlecen = n => `${n} ${n === 1 ? 'zlecenie' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'zlecenia' : 'zleceń'}`;
const money = v => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0)) + ' zł';

async function buildReport({ kind, from, to }) {
    const cfg = await getV2();
    const [tasks, expenses, incomes, branches, employees, unpaid] = await Promise.all([
        Task.find({ dateStart: { $gte: from, $lt: to } }).select('name type status price finalPrice dateStart branch workers hoursWorked clientRating complaint mediaCount costs startedAt division').lean(),
        Expense.find({ date: { $gte: from, $lt: to } }).select('price category source branch').lean(),
        Income.find({ date: { $gte: from, $lt: to }, task: null }).select('price category').lean(),
        Branch.find({ active: true }).select('name color').lean(),
        Employee.find({ active: true }).select('name color').lean(),
        Task.find({ status: 'completed', paymentStatus: { $ne: 'paid' } }).select('finalPrice price cashCollected paymentStatus').lean()
    ]);
    const completed = tasks.filter(t => t.status === 'completed');
    const done = V.forecast(completed, { from, to }, cfg).done;
    const otherIncome = V.round2(incomes.reduce((s, i) => s + (i.price || 0), 0));
    const revenue = V.round2(done + otherIncome);
    const costs = V.round2(expenses.reduce((s, e) => s + (e.price || 0), 0));
    const profit = V.round2(revenue - costs);

    const groups = {};
    for (const t of completed) {
        const k = t.type || 'Inne';
        groups[k] = groups[k] || { name: k, total: 0, count: 0 };
        groups[k].total = V.round2(groups[k].total + V.toGross(V.taskAmount(t), cfg));
        groups[k].count += 1;
    }
    const costByCat = {};
    for (const e of expenses) { const c = V.budgetCategory(e); costByCat[c] = V.round2((costByCat[c] || 0) + (e.price || 0)); }

    const crew = new Map();
    for (const t of completed) {
        for (const w of t.workers || []) {
            const k = String(w.employee || w.name);
            const r = crew.get(k) || { name: w.name, tasks: 0, hours: 0 };
            r.tasks += 1;
            r.hours = Math.round((r.hours + (Number(t.hoursWorked) || 0)) * 10) / 10;
            crew.set(k, r);
        }
    }

    let title;
    let slug;
    if (kind === 'week') {
        const last = new Date(to.getTime() - V.DAY);
        title = `Tydzień ${V.isoWeek(from)} (${fmtDay(from)}–${fmtDay(last)}.${last.getFullYear()})`;
        slug = `${from.getFullYear()}-T${String(V.isoWeek(from)).padStart(2, '0')}`;
    } else {
        title = `${MONTHS[from.getMonth()]} ${from.getFullYear()}`;
        slug = V.dayKey(from).slice(0, 7);
    }

    return {
        kind, title, slug, from, to,
        gross: cfg.pricesAreGross !== false,
        revenue, costs, profit, margin: revenue > 0 ? Math.round((profit / revenue) * 100) : null,
        otherIncome,
        counts: { completed: completed.length, planned: tasks.filter(t => ['planned', 'progress'].includes(t.status)).length, cancelled: tasks.filter(t => t.status === 'cancelled').length },
        services: Object.values(groups).sort((a, b) => b.total - a.total).slice(0, 8),
        costsByCategory: Object.entries(costByCat).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total),
        branches: V.byBranch(completed, { from, to }, branches, cfg).map(b => ({ name: b.name, total: b.done, count: b.doneCount })),
        crew: [...crew.values()].sort((a, b) => b.tasks - a.tasks).slice(0, 12),
        ranking: V.ranking(completed, employees, cfg.rankingPoints).slice(0, 3).map(r => ({ name: r.name, points: r.points, tasks: r.tasks })),
        budgets: kind === 'month' ? V.budgetStatus(cfg.budgets || [], expenses) : [],
        receivables: V.round2(unpaid.reduce((s, t) => s + V11.amountDue(t), 0)),
        generatedAt: new Date()
    };
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

const FONT_DIR = path.join(__dirname, '..', '..', 'assets-src', 'fonts');

function renderPdf(data) {
    let PDFDocument;
    try { PDFDocument = require('pdfkit'); } catch { return Promise.reject(new Error('Brak paczki pdfkit — uruchom npm install')); }
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `RevSerwis — raport ${data.title}`, Author: 'RevMi 2.0' } });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const regular = path.join(FONT_DIR, 'NotoSans-Regular.ttf');
        const bold = path.join(FONT_DIR, 'NotoSans-Bold.ttf');
        const hasFonts = fs.existsSync(regular) && fs.existsSync(bold);
        if (hasFonts) { doc.registerFont('R', regular); doc.registerFont('B', bold); }
        const R = hasFonts ? 'R' : 'Helvetica';
        const B = hasFonts ? 'B' : 'Helvetica-Bold';

        const INK = '#14181A';
        const MUTED = '#5B6461';
        const MINT = '#03C999';
        const W = doc.page.width - 80;

        // Nagłówek
        doc.rect(0, 0, doc.page.width, 92).fill('#0D0E11');
        doc.fill('#03F0BA').font(B).fontSize(22).text('Rev', 40, 30, { continued: true }).fill('#EEF1F0').text('Serwis');
        doc.fill('#8F9895').font(R).fontSize(10).text('Raport RevMi 2.0', 40, 60);
        doc.fill('#EEF1F0').font(B).fontSize(16).text(data.title, 40, 34, { width: W, align: 'right' });
        doc.fill('#8F9895').font(R).fontSize(9).text(`kwoty ${data.gross ? 'brutto' : 'netto + VAT'} · wygenerowano ${data.generatedAt.toLocaleString('pl-PL', { timeZone: config.timeZone })}`, 40, 58, { width: W, align: 'right' });

        // KPI
        let y = 116;
        const kpis = [['Przychód', money(data.revenue)], ['Koszty', money(data.costs)], ['Zysk', money(data.profit)], ['Marża', data.margin === null ? '—' : data.margin + '%']];
        const kw = (W - 30) / 4;
        kpis.forEach(([label, value], i) => {
            const x = 40 + i * (kw + 10);
            doc.roundedRect(x, y, kw, 62, 8).fill(i === 2 ? '#E6FBF5' : '#F3F5F4');
            doc.fill(MUTED).font(R).fontSize(9).text(label.toUpperCase(), x + 12, y + 12);
            doc.fill(i === 2 ? '#04855F' : INK).font(B).fontSize(17).text(value, x + 12, y + 28, { width: kw - 20 });
        });
        y += 80;
        doc.fill(MUTED).font(R).fontSize(10).text(`Zakończone zlecenia: ${data.counts.completed} · zaplanowane / w toku: ${data.counts.planned} · anulowane: ${data.counts.cancelled} · należności łącznie: ${money(data.receivables)}`, 40, y, { width: W });
        y += 28;

        const section = title => {
            if (y > doc.page.height - 140) { doc.addPage(); y = 40; }
            doc.fill(INK).font(B).fontSize(13).text(title, 40, y);
            y += 22;
        };
        const bars = (rows, color = MINT) => {
            const max = Math.max(1, ...rows.map(r => r.total));
            for (const r of rows) {
                if (y > doc.page.height - 60) { doc.addPage(); y = 40; }
                doc.fill(INK).font(R).fontSize(10).text(r.name, 40, y, { width: 150, ellipsis: true });
                const bw = Math.max(2, ((W - 280) * r.total) / max);
                doc.roundedRect(195, y + 1, bw, 11, 3).fill(color);
                doc.fill(INK).font(B).fontSize(10).text(money(r.total) + (r.count !== undefined ? `  ·  ${r.count}` : ''), 200 + bw, y, { width: 120 });
                y += 19;
            }
            y += 10;
        };

        if (data.services.length) { section('Przychód wg usług'); bars(data.services); }
        if (data.branches.length) { section('Oddziały'); bars(data.branches, '#60A5FA'); }
        if (data.costsByCategory.length) { section('Koszty wg kategorii'); bars(data.costsByCategory, '#F59E0B'); }

        if (data.budgets.length) {
            section('Budżety');
            for (const b of data.budgets) {
                if (y > doc.page.height - 60) { doc.addPage(); y = 40; }
                const color = b.level === 'over' ? '#EF4444' : b.level === 'warn' ? '#F59E0B' : MINT;
                doc.fill(INK).font(R).fontSize(10).text(b.category, 40, y, { width: 150 });
                doc.roundedRect(195, y + 1, W - 300, 11, 3).fill('#E5E8E7');
                doc.roundedRect(195, y + 1, Math.max(2, Math.min(1, b.pct / 100) * (W - 300)), 11, 3).fill(color);
                doc.fill(INK).font(B).fontSize(10).text(`${money(b.spent)} / ${money(b.amount)} (${b.pct}%)`, W - 95, y, { width: 135, align: 'right' });
                y += 19;
            }
            y += 10;
        }

        if (data.crew.length) {
            section('Ekipa');
            for (const c of data.crew) {
                if (y > doc.page.height - 60) { doc.addPage(); y = 40; }
                doc.fill(INK).font(R).fontSize(10).text(c.name, 40, y, { width: 200 });
                doc.text(zlecen(c.tasks), 250, y, { width: 100 });
                doc.fill(MUTED).text(c.hours ? `${c.hours} h` : '', 360, y, { width: 100 });
                y += 17;
            }
            y += 10;
        }
        if (data.ranking.length) {
            section('Ranking ekipy');
            data.ranking.forEach((r, i) => { doc.fill(INK).font(i === 0 ? B : R).fontSize(10).text(`${i + 1}. ${r.name} — ${r.points} pkt (${zlecen(r.tasks)})`, 40, y); y += 17; });
        }

        // stopka poza marginesem dolnym — bez tego pdfkit dodaje pustą stronę
        doc.page.margins.bottom = 0;
        doc.fill(MUTED).font(R).fontSize(8).text('RevSerwis · raport wygenerowany automatycznie przez RevMi 2.0', 40, doc.page.height - 30, { width: W, align: 'center', lineBreak: false });
        doc.end();
    });
}

/* ------------------------------------------------------------------ */
/* Wysyłka                                                             */
/* ------------------------------------------------------------------ */

async function recipients(kind, override) {
    if (override?.length) return override.map(e => String(e).trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)).slice(0, 10);
    const cfg = await getV2();
    const settings = await getSettings();
    const list = [...(cfg.reportRecipients || [])];
    if (!list.length) list.push(settings.companyEmail || config.mail.contactTo);
    if (kind === 'month') {
        const accountants = await Employee.find({ active: true, systemRole: 'accountant', email: { $ne: '' } }).select('email').lean();
        list.push(...accountants.map(a => a.email));
    }
    return [...new Set(list.filter(Boolean))];
}

async function sendReport(range, { to } = {}) {
    const mail = require('./mail');
    if (!mail.isConfigured()) return { ok: false, error: 'Poczta nie jest skonfigurowana (RESEND_API_KEY lub SMTP).' };
    const data = await buildReport(range);
    const pdf = await renderPdf(data);
    const list = await recipients(range.kind, to);
    if (!list.length) return { ok: false, error: 'Brak odbiorców raportu' };
    const summary = `Przychód ${money(data.revenue)} · koszty ${money(data.costs)} · zysk ${money(data.profit)}${data.margin !== null ? ' · marża ' + data.margin + '%' : ''}`;
    await mail.send({
        to: list,
        subject: `RevSerwis — raport: ${data.title}`,
        text: `Raport RevMi 2.0: ${data.title}\n\n${summary}\nZakończone zlecenia: ${data.counts.completed}\n\nPełny raport w załączniku (PDF).`,
        html: `<div style="font-family:Arial,sans-serif;color:#14181A"><h2 style="margin:0 0 8px">Raport: ${data.title}</h2><p style="font-size:15px">${summary}</p><p>Zakończone zlecenia: <b>${data.counts.completed}</b></p><p style="color:#5B6461">Pełny raport w załączniku (PDF).</p></div>`,
        attachments: [{ filename: `RevSerwis-raport-${data.slug}.pdf`, content: pdf, contentType: 'application/pdf' }]
    });
    return { ok: true, to: list };
}

module.exports = { buildReport, renderPdf, sendReport };
