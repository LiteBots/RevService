'use strict';

/**
 * RevMi 2.0.0 — czysta logika (bez bazy i paczek npm), testowana w tests/v2.test.js.
 */

const DAY = 86_400_000;
const round2 = v => Math.round((Number(v) || 0) * 100) / 100;

/* ------------------------------------------------------------------ */
/* Daty i okresy                                                        */
/* ------------------------------------------------------------------ */

const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** Zakres okresu: day | week (od poniedziałku) | month | year. `offset` przesuwa o całe okresy. */
function periodRange(kind, now = new Date(), offset = 0) {
    const base = startOfDay(now);
    if (kind === 'day') {
        const from = new Date(base.getTime());
        from.setDate(from.getDate() + offset);
        const to = new Date(from); to.setDate(to.getDate() + 1);
        return { from, to };
    }
    if (kind === 'week') {
        const dow = (base.getDay() + 6) % 7; // pon = 0
        const from = new Date(base); from.setDate(base.getDate() - dow + offset * 7);
        const to = new Date(from); to.setDate(from.getDate() + 7);
        return { from, to };
    }
    if (kind === 'year') {
        const from = new Date(base.getFullYear() + offset, 0, 1);
        return { from, to: new Date(from.getFullYear() + 1, 0, 1) };
    }
    const from = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    return { from, to: new Date(from.getFullYear(), from.getMonth() + 1, 1) };
}

/** Numer tygodnia ISO (do etykiet wykresu „T45”). */
function isoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / DAY + 1) / 7);
}

const dayKey = d => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

function addPeriod(date, period, times = 1) {
    const d = new Date(date);
    const months = period === 'year' ? 12 : period === 'quarter' ? 3 : 1;
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months * times);
    // 31 stycznia + miesiąc = 28/29 lutego (nie 3 marca)
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return d;
}

/* ------------------------------------------------------------------ */
/* Prognoza przychodu (B1)                                              */
/* ------------------------------------------------------------------ */

const FORECAST_STATUSES = ['planned', 'progress', 'completed'];

/** Kwota zlecenia: cena końcowa, a gdy jej nie ma — cena z wyceny. */
const taskAmount = t => {
    const v = t.finalPrice !== null && t.finalPrice !== undefined ? t.finalPrice : t.price;
    return Number(v) || 0;
};

/** Kwota brutto wg ustawień (ceny w systemie brutto albo netto + VAT). */
const toGross = (amount, cfg = {}) => (cfg.pricesAreGross === false ? round2(amount * (1 + (Number(cfg.vatRate) || 0) / 100)) : round2(amount));

/**
 * Ile zarobimy w okresie: suma zleceń zaplanowanych, w realizacji i zakończonych z terminem w [from, to).
 * `done` = już zakończone, `planned` = jeszcze do zrobienia.
 */
function forecast(tasks, { from, to }, cfg = {}) {
    const out = { total: 0, done: 0, planned: 0, count: 0, doneCount: 0, plannedCount: 0, unpriced: 0 };
    for (const t of tasks || []) {
        if (!FORECAST_STATUSES.includes(t.status)) continue;
        const when = new Date(t.dateStart);
        if (!(when >= from && when < to)) continue;
        const amount = toGross(taskAmount(t), cfg);
        out.count += 1;
        out.total += amount;
        if (!amount) out.unpriced += 1;
        if (t.status === 'completed') { out.done += amount; out.doneCount += 1; } else { out.planned += amount; out.plannedCount += 1; }
    }
    for (const k of ['total', 'done', 'planned']) out[k] = round2(out[k]);
    return out;
}

/** Seria tygodniowa: `weeks` tygodni wstecz + `ahead` do przodu, każdy z podziałem zrobione / zaplanowane. */
function weeklySeries(tasks, now = new Date(), { back = 5, ahead = 2 } = {}, cfg = {}) {
    const series = [];
    for (let i = -back; i <= ahead; i += 1) {
        const range = periodRange('week', now, i);
        const f = forecast(tasks, range, cfg);
        series.push({ label: 'T' + isoWeek(range.from), from: range.from, done: f.done, planned: f.planned, current: i === 0 });
    }
    return series;
}

/** Przychód per oddział w okresie. */
function byBranch(tasks, range, branches, cfg = {}) {
    return (branches || []).map(b => ({ _id: b._id, name: b.name, color: b.color, ...forecast((tasks || []).filter(t => String(t.branch || '') === String(b._id)), range, cfg) }))
        .concat([{ _id: null, name: 'Bez oddziału', ...forecast((tasks || []).filter(t => !t.branch), range, cfg) }])
        .filter(r => r.count > 0);
}

/* ------------------------------------------------------------------ */
/* Budżety (B5)                                                         */
/* ------------------------------------------------------------------ */

const BUDGET_CATEGORIES = ['Paliwo', 'Materiały', 'Utylizacja', 'Wypłaty', 'Naprawy floty', 'Marketing', 'Inne'];

/** Przypisanie wydatku do kategorii budżetu (kategorie wydatków są wpisywane ręcznie, więc dopasowujemy po słowach). */
function budgetCategory(expense) {
    if (expense.source === 'payroll') return 'Wypłaty';
    const c = String(expense.category || '').toLowerCase();
    if (/paliw|tankow|diesel|benzyn|lpg/.test(c)) return 'Paliwo';
    if (/materia|karton|foli|taśm|tasm/.test(c)) return 'Materiały';
    if (/utyliz|wywóz odpad|odpad|psz|bdo|gruz/.test(c)) return 'Utylizacja';
    if (/wypłat|wyplat|pensj|premi|zaliczk|wynagrodz/.test(c)) return 'Wypłaty';
    if (/napraw|serwis|mechanik|opon|przegląd|przeglad|części|czesci|warsztat/.test(c)) return 'Naprawy floty';
    if (/marketing|reklam|ads|ulotk|facebook|google/.test(c)) return 'Marketing';
    return 'Inne';
}

/**
 * Stan budżetów w miesiącu. `budgets` = [{ branch, category, amount }], `expenses` = wydatki z miesiąca.
 * Budżet z branch=null liczy wydatki całej firmy, z oddziałem — tylko wydatki tego oddziału.
 */
function budgetStatus(budgets, expenses) {
    return (budgets || []).map(b => {
        const spent = round2((expenses || []).filter(e => budgetCategory(e) === b.category && (!b.branch || String(e.branch || '') === String(b.branch)))
            .reduce((s, e) => s + (Number(e.price) || 0), 0));
        const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
        return { _id: b._id, branch: b.branch || null, category: b.category, amount: b.amount, spent, left: round2(b.amount - spent), pct, level: pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok' };
    });
}

/* ------------------------------------------------------------------ */
/* Czas pracy i GPS (C2)                                                */
/* ------------------------------------------------------------------ */

/** Odległość w metrach (haversine). */
function distanceMeters(a, b) {
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) return Infinity;
    const R = 6371000;
    const toRad = x => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const withinGeofence = (pos, target, meters = 150) => distanceMeters(pos, target) <= meters + Math.min(Number(pos?.accuracy) || 0, 100);

/**
 * Suma minut pracy z dziennika zdarzeń: start/resume otwiera odcinek, pause/stop go zamyka.
 * arrive/leave nie zmieniają czasu (to znaczniki miejsca). Otwarty odcinek liczony do `now`.
 */
function timeTotals(events, now = new Date()) {
    let minutes = 0;
    let breakMinutes = 0;
    let openAt = null;
    let pauseAt = null;
    let state = 'off';
    const sorted = [...(events || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
    for (const e of sorted) {
        const at = new Date(e.at);
        if (e.type === 'start' || e.type === 'resume') {
            if (pauseAt) { breakMinutes += (at - pauseAt) / 60000; pauseAt = null; }
            if (!openAt) openAt = at;
            state = 'working';
        } else if (e.type === 'pause' || e.type === 'stop') {
            if (openAt) { minutes += (at - openAt) / 60000; openAt = null; }
            if (e.type === 'pause') { pauseAt = at; state = 'paused'; } else { pauseAt = null; state = 'off'; }
        }
    }
    if (openAt) minutes += (now - openAt) / 60000;
    if (pauseAt) breakMinutes += (now - pauseAt) / 60000;
    const first = sorted.find(e => e.type === 'start');
    return { minutes: Math.max(0, Math.round(minutes)), breakMinutes: Math.max(0, Math.round(breakMinutes)), state, open: state !== 'off', startedAt: first ? new Date(first.at) : null };
}

const TIME_TRANSITIONS = {
    off: ['start'],
    working: ['pause', 'stop', 'arrive', 'leave'],
    paused: ['resume', 'stop']
};

/** Czy zdarzenie jest dozwolone w danym stanie (np. nie można „wznowić” bez pauzy). */
function canTimeEvent(state, type) {
    if (type === 'arrive' || type === 'leave') return state === 'working' || state === 'paused';
    return (TIME_TRANSITIONS[state] || []).includes(type);
}

/* ------------------------------------------------------------------ */
/* Ranking (C9)                                                         */
/* ------------------------------------------------------------------ */

const DEFAULT_POINTS = { rating5: 20, rating4: 8, onTime: 10, fullReport: 5, complaint: -30, fault: 0 };
const ON_TIME_MINUTES = 15;

/**
 * Punkty pracowników za zakończone zlecenia w okresie.
 * - ocena klienta 5★ / 4★, przyjazd na czas (start ≤ termin + 15 min), pełny raport (zdjęcia „po” + koszty), reklamacja.
 * `arrivals` (opcjonalnie) = Map(taskId → najwcześniejszy „arrive” z GPS) — dokładniejsze niż start zlecenia.
 */
function ranking(tasks, employees, points = {}, { arrivals = new Map(), faults = [] } = {}) {
    const P = { ...DEFAULT_POINTS, ...points };
    const rows = new Map((employees || []).map(e => [String(e._id), { _id: e._id, name: e.name, color: e.color, points: 0, tasks: 0, rating5: 0, onTime: 0, fullReports: 0, complaints: 0, faults: 0, ratings: [] }]));
    for (const t of tasks || []) {
        if (t.status !== 'completed') continue;
        const ids = [...new Set((t.workers || []).map(w => w.employee && String(w.employee)).filter(Boolean))];
        const arrive = arrivals.get(String(t._id));
        const startRef = arrive || t.startedAt;
        const onTime = startRef && t.dateStart && new Date(startRef) <= new Date(new Date(t.dateStart).getTime() + ON_TIME_MINUTES * 60000);
        const fullReport = (t.mediaCount?.after || 0) > 0 && Boolean(t.costs?.reportedAt);
        for (const id of ids) {
            const r = rows.get(id);
            if (!r) continue;
            r.tasks += 1;
            if (t.clientRating === 5) { r.points += P.rating5; r.rating5 += 1; }
            else if (t.clientRating === 4) r.points += P.rating4;
            if (t.clientRating) r.ratings.push(t.clientRating);
            if (onTime) { r.points += P.onTime; r.onTime += 1; }
            if (fullReport) { r.points += P.fullReport; r.fullReports += 1; }
            if (t.complaint) { r.points += P.complaint; r.complaints += 1; }
        }
    }
    for (const f of faults || []) {
        const r = rows.get(String(f.reportedByKey || ''));
        if (r && P.fault) { r.points += P.fault; r.faults += 1; }
    }
    const list = [...rows.values()].filter(r => r.tasks > 0 || r.points !== 0).map(r => {
        const avg = r.ratings.length ? Math.round((r.ratings.reduce((s, x) => s + x, 0) / r.ratings.length) * 10) / 10 : null;
        const badges = [];
        if (r.tasks >= 3 && r.onTime === r.tasks) badges.push({ key: 'punctual', label: 'Zawsze na czas' });
        if (r.rating5 >= 3) badges.push({ key: 'stars', label: `${r.rating5}× ocena 5★` });
        if (r.tasks >= 5 && r.complaints === 0) badges.push({ key: 'clean', label: 'Zero reklamacji' });
        if (r.tasks >= 3 && r.fullReports === r.tasks) badges.push({ key: 'report', label: 'Wzorowe raporty' });
        if (r.tasks >= 20) badges.push({ key: 'hero', label: `${r.tasks} zleceń w miesiącu` });
        const { ratings, ...rest } = r;
        return { ...rest, avgRating: avg, badges };
    });
    list.sort((a, b) => b.points - a.points || b.tasks - a.tasks || String(a.name).localeCompare(String(b.name), 'pl'));
    list.forEach((r, i) => { r.place = i + 1; });
    return list;
}

/* ------------------------------------------------------------------ */
/* Zarobki pracownika (C3)                                              */
/* ------------------------------------------------------------------ */

/**
 * Zarobki w miesiącu: zapisane w Rozliczeniach (PayEntry) + szacunek za to, czego biuro jeszcze nie wpisało
 * (godziny z ewidencji × stawka godzinowa, zakończone zlecenia × stawka za zlecenie, dni pracy × stawka dzienna).
 */
function earnings(employee, { payEntries = [], timeEntries = [], tasks = [] } = {}) {
    const rate = Number(employee.payRate) || Number(employee.hourlyRate) || 0;
    const unit = employee.payRate ? employee.payRateUnit || 'task' : (employee.hourlyRate ? 'hour' : 'task');
    const sum = kind => round2(payEntries.filter(p => p.kind === kind).reduce((s, p) => s + (Number(p.amount) || 0), 0));
    const pay = sum('pay');
    const bonus = sum('bonus');
    const advance = sum('advance');
    const deduction = sum('deduction');
    const minutes = timeEntries.reduce((s, e) => s + (Number(e.minutes) || 0), 0);
    const hours = Math.round((minutes / 60) * 10) / 10;
    const days = timeEntries.filter(e => (e.minutes || 0) > 0).length;
    const paidTasks = new Set(payEntries.filter(p => p.task).map(p => String(p.task)));
    const myTasks = tasks.filter(t => t.status === 'completed');
    const unpaidTasks = myTasks.filter(t => !paidTasks.has(String(t._id)));
    let estimate = 0;
    let estimateLabel = '';
    if (rate > 0) {
        if (unit === 'hour' && !pay) { estimate = round2(hours * rate); estimateLabel = `${hours} h × ${rate} zł`; }
        else if (unit === 'task' && unpaidTasks.length) { estimate = round2(unpaidTasks.length * rate); estimateLabel = `${unpaidTasks.length} zleceń × ${rate} zł (jeszcze nierozliczone)`; }
        else if (unit === 'day' && !pay) { estimate = round2(days * rate); estimateLabel = `${days} dni × ${rate} zł`; }
    }
    const total = round2(pay + bonus + estimate - advance - deduction);
    return { rate, unit, pay, bonus, advance, deduction, estimate, estimateLabel, hours, days, tasks: myTasks.length, total, entries: payEntries.length };
}

/* ------------------------------------------------------------------ */
/* Pakiety firmowe                                                      */
/* ------------------------------------------------------------------ */

/** Wykorzystanie pakietu w bieżącym okresie (zlecenia przypięte do pakietu, bez anulowanych). */
function packageUsage(sub, tasks) {
    const from = new Date(sub.periodStart);
    const to = new Date(sub.renewDate);
    const used = (tasks || []).filter(t => String(t.packageSub || '') === String(sub._id) && t.status !== 'cancelled' && new Date(t.dateStart) >= from && new Date(t.dateStart) < to).length;
    const limit = sub.serviceLimit === null || sub.serviceLimit === undefined ? null : Number(sub.serviceLimit);
    return { used, limit, left: limit === null ? null : Math.max(0, limit - used), over: limit === null ? 0 : Math.max(0, used - limit), pct: limit ? Math.min(100, Math.round((used / limit) * 100)) : null };
}

const grossOf = (net, vat) => round2((Number(net) || 0) * (1 + (Number(vat) || 0) / 100));

/** Miesięczny przychód z pakietów (netto) — kwartalne/roczne przeliczone na miesiąc. */
const monthlyNet = sub => round2((Number(sub.priceNet) || 0) / (sub.period === 'year' ? 12 : sub.period === 'quarter' ? 3 : 1));

/* ------------------------------------------------------------------ */
/* Logowanie                                                            */
/* ------------------------------------------------------------------ */

function validatePassword(pw) {
    const s = String(pw || '');
    if (s.length < 8) throw new Error('Hasło musi mieć co najmniej 8 znaków');
    if (s.length > 128) throw new Error('Hasło jest za długie');
    if (!/[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/.test(s) || !/\d/.test(s)) throw new Error('Hasło musi zawierać litery i cyfry');
    return s;
}

/** E-mail (małe litery) albo telefon (same cyfry, bez +48). */
function normalizeLogin(value) {
    const s = String(value || '').trim();
    if (s.includes('@')) {
        const email = s.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Nieprawidłowy e-mail');
        return { kind: 'email', value: email };
    }
    let digits = s.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('48')) digits = digits.slice(2);
    if (digits.length !== 9) throw new Error('Podaj e-mail albo 9-cyfrowy numer telefonu');
    return { kind: 'phone', value: digits };
}

const phoneDigits = v => { let d = String(v || '').replace(/\D/g, ''); if (d.length === 11 && d.startsWith('48')) d = d.slice(2); return d; };

/** Czytelna nazwa urządzenia z User-Agent: „iPhone · Safari”, „Mac · Chrome”. */
function deviceLabel(ua) {
    const s = String(ua || '');
    const os = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? 'Android' : /Mac OS X|Macintosh/.test(s) ? 'Mac' : /Windows/.test(s) ? 'Windows' : /Linux/.test(s) ? 'Linux' : 'Urządzenie';
    const browser = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /CriOS|Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'przeglądarka';
    return `${os} · ${browser}`;
}

/* ------------------------------------------------------------------ */
/* SMS                                                                  */
/* ------------------------------------------------------------------ */

function fillTemplate(template, vars) {
    return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : '')).replace(/\s+/g, ' ')
        // puste zmienne: bez „ , .” i podwójnych przecinków
        .replace(/\s+([,.])/g, '$1').replace(/,(\s*[,.])+/g, m => m.trim().slice(-1)).trim().slice(0, 480);
}

module.exports = {
    DAY, round2, startOfDay, periodRange, isoWeek, dayKey, addPeriod,
    FORECAST_STATUSES, taskAmount, toGross, forecast, weeklySeries, byBranch,
    BUDGET_CATEGORIES, budgetCategory, budgetStatus,
    distanceMeters, withinGeofence, timeTotals, canTimeEvent,
    DEFAULT_POINTS, ranking, earnings,
    packageUsage, grossOf, monthlyNet,
    validatePassword, normalizeLogin, phoneDigits, deviceLabel, fillTemplate
};
