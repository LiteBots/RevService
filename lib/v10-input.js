'use strict';

/**
 * RevSerwis 9.1 — czysta logika (bez bazy): dodatki do zamówień, czat w zleceniu, newsletter,
 * panel dewelopera oraz obliczenia: rentowność per usługa i miasto, lejek sprzedaży.
 */
const P = require('./portal-input');
const { isDivision, divisionName } = require('./divisions');

const { bad, text, email, phone, num, dateValue, idValue, oneOf } = P;
const round2 = v => Math.round((Number(v) || 0) * 100) / 100;

/* ------------------------------------------------------------------ */
/* Dodatki do zamówień                                                 */
/* ------------------------------------------------------------------ */

const ADDON_UNITS = ['usł.', 'szt.', 'm³', 'godz.', 'km', 'kg'];

function validateAddon(input) {
    if (!input || typeof input !== 'object') bad('Nieprawidłowe dane.');
    const divisions = (Array.isArray(input.divisions) ? input.divisions : []).filter(isDivision);
    return {
        name: text(input.name, 80, 'Nazwa', { required: true, min: 2 }),
        description: text(input.description, 300, 'Opis'),
        icon: /^fa-[a-z0-9-]{2,40}$/.test(String(input.icon || '')) ? input.icon : 'fa-plus',
        price: num(input.price, 'Cena', { min: 0, max: 100000 }),
        unit: oneOf(input.unit, ADDON_UNITS, 'usł.'),
        allowQty: input.allowQty === true,
        maxQty: num(input.maxQty, 'Maks. ilość', { min: 1, max: 999, integer: true }) || 20,
        divisions: [...new Set(divisions)],
        active: input.active !== false,
        order: num(input.order, 'Kolejność', { min: 0, max: 999, integer: true }) || 0
    };
}

/**
 * Wybór dodatków przez klienta → pozycje z ceną z katalogu (nigdy z przeglądarki).
 * selection: [{ id, qty }], catalog: aktywne dodatki z bazy.
 */
function pickAddons(selection, catalog, division = '') {
    const list = Array.isArray(selection) ? selection.slice(0, 20) : [];
    const byId = new Map(catalog.map(a => [String(a._id), a]));
    const out = [];
    const seen = new Set();
    for (const s of list) {
        const id = s && typeof s.id === 'string' ? s.id : '';
        const a = byId.get(id);
        if (!a || seen.has(id) || a.active === false) continue;
        if (a.divisions && a.divisions.length && division && !a.divisions.includes(division)) continue;
        seen.add(id);
        const qty = a.allowQty ? Math.min(Math.max(Math.round(Number(s.qty) || 1), 1), a.maxQty || 20) : 1;
        out.push({ addon: a._id, name: a.name, unit: a.unit || 'usł.', qty, price: a.price ?? null, total: a.price == null ? null : round2(a.price * qty) });
    }
    return { items: out, total: round2(out.reduce((s, i) => s + (i.total || 0), 0)), hasQuoteOnly: out.some(i => i.price == null) };
}

/* ------------------------------------------------------------------ */
/* Czat w zleceniu                                                     */
/* ------------------------------------------------------------------ */

function validateChat(input) {
    if (!input || typeof input !== 'object') bad('Nieprawidłowe dane.');
    const msg = text(input.text, 2000, 'Wiadomość');
    const photo = input.photo === undefined || input.photo === null || input.photo === '' ? null : input.photo;
    if (photo !== null && (typeof photo !== 'string' || photo.length > 2_800_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo))) bad('Nieprawidłowe zdjęcie.');
    if (!msg && !photo) bad('Napisz wiadomość albo dodaj zdjęcie.');
    return { text: msg, photo };
}

/* ------------------------------------------------------------------ */
/* Newsletter                                                          */
/* ------------------------------------------------------------------ */

const NEWSLETTER_TOPICS = ['promocje', 'outlet', 'powrot', 'sezon', 'firmy'];
const NEWSLETTER_TOPIC_LABELS = { promocje: 'Promocje i rabaty', outlet: 'Nowości w RevOutlet', powrot: 'Wolne kursy RevPowrót', sezon: 'Przypomnienia sezonowe (zima, ogród)', firmy: 'Oferty dla firm' };
const NEWSLETTER_SOURCES = ['stopka', 'konto', 'outlet', 'powrot', 'wycena', 'import', 'admin', 'odbior'];

function validateNewsletter(input) {
    if (!input || typeof input !== 'object') bad('Nieprawidłowe dane.');
    if (input.website) bad('Nie udało się zapisać.');
    if (input.consent !== true) bad('Zaznacz zgodę na otrzymywanie newslettera.');
    const topics = (Array.isArray(input.topics) ? input.topics : []).filter(t => NEWSLETTER_TOPICS.includes(t));
    return {
        email: email(input.email),
        name: text(input.name, 80, 'Imię'),
        city: text(input.city, 80, 'Miasto'),
        topics: topics.length ? [...new Set(topics)] : ['promocje', 'outlet', 'sezon'],
        source: oneOf(input.source, NEWSLETTER_SOURCES, 'stopka')
    };
}

const CAMPAIGN_SEGMENTS = ['all', 'person', 'company', 'topic', 'city'];

function validateCampaign(input) {
    if (!input || typeof input !== 'object') bad('Nieprawidłowe dane.');
    const segment = oneOf(input.segment, CAMPAIGN_SEGMENTS, 'all');
    const blocks = (Array.isArray(input.blocks) ? input.blocks : []).slice(0, 30).map(b => {
        const type = oneOf(b && b.type, ['heading', 'text', 'button', 'image', 'divider'], null);
        if (!type) return null;
        if (type === 'divider') return { type };
        if (type === 'button') {
            const url = text(b.url, 500, 'Adres przycisku');
            if (url && !/^https?:\/\/\S+$/i.test(url)) bad('Adres przycisku musi zaczynać się od http:// lub https://');
            return { type, text: text(b.text, 80, 'Tekst przycisku', { required: true }), url };
        }
        if (type === 'image') {
            const url = text(b.url, 500, 'Adres obrazka', { required: true });
            if (!/^https:\/\/\S+$/i.test(url)) bad('Obrazek musi mieć adres https://');
            return { type, url, alt: text(b.alt, 160, 'Opis obrazka') };
        }
        return { type, text: text(b.text, type === 'heading' ? 200 : 5000, type === 'heading' ? 'Nagłówek' : 'Tekst', { required: true }) };
    }).filter(Boolean);
    if (!blocks.length) bad('Dodaj treść kampanii (przynajmniej jeden blok).');
    return {
        subject: text(input.subject, 150, 'Temat', { required: true, min: 3 }),
        preheader: text(input.preheader, 200, 'Zajawka'),
        blocks,
        segment,
        segmentValue: segment === 'topic' ? oneOf(input.segmentValue, NEWSLETTER_TOPICS, 'promocje') : segment === 'city' ? text(input.segmentValue, 80, 'Miasto', { required: true }) : ''
    };
}

const escHtml = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);

/** HTML i tekst e-maila kampanii. {{imie}} zastępowane imieniem odbiorcy. */
function renderCampaign(c, { name = '', unsubscribeUrl = '#', webUrl = 'https://www.revserwis.pl' } = {}) {
    const fill = s => String(s).replace(/\{\{\s*imie\s*\}\}/gi, name || '').replace(/\s+([,!.])/g, '$1');
    const html = c.blocks.map(b => {
        if (b.type === 'heading') return `<h2 style="margin:22px 0 10px;font-size:22px;line-height:1.25;color:#ffffff">${escHtml(fill(b.text))}</h2>`;
        if (b.type === 'text') return `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#c9ccd3">${escHtml(fill(b.text)).replace(/\n/g, '<br>')}</p>`;
        if (b.type === 'button') return `<p style="margin:20px 0"><a href="${escHtml(b.url || webUrl)}" style="background:#00F0BE;color:#04110d;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;display:inline-block">${escHtml(b.text)}</a></p>`;
        if (b.type === 'image') return `<p style="margin:16px 0"><img src="${escHtml(b.url)}" alt="${escHtml(b.alt || '')}" style="max-width:100%;border-radius:12px;display:block"></p>`;
        return '<hr style="border:0;border-top:1px solid #2a2d33;margin:22px 0">';
    }).join('\n');
    const full = `<!doctype html><html lang="pl"><body style="margin:0;background:#0b0c0f">
<div style="display:none;max-height:0;overflow:hidden">${escHtml(c.preheader || '')}</div>
<div style="font-family:Arial,sans-serif;padding:24px 12px"><div style="max-width:600px;margin:0 auto;background:#14161b;border-radius:16px;padding:30px 28px">
<div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:6px">Rev<span style="color:#00F0BE">Serwis</span></div>
${html}
<p style="margin-top:30px;font-size:12px;line-height:1.6;color:#7d828c">Dostajesz tę wiadomość, bo zapisałeś(-aś) się na newsletter RevSerwis. Rev Serwis Kacper Taczała, Słupsk · tel. 735 396 534<br><a href="${escHtml(unsubscribeUrl)}" style="color:#9ca3af">Wypisz się z newslettera</a></p>
</div></div></body></html>`;
    const textOut = c.blocks.map(b => (b.type === 'button' ? `${b.text}: ${b.url || webUrl}` : b.type === 'image' ? '' : b.type === 'divider' ? '—' : fill(b.text))).filter(Boolean).join('\n\n') + `\n\n—\nWypisz się: ${unsubscribeUrl}`;
    return { html: full, text: textOut };
}

/* ------------------------------------------------------------------ */
/* Panel dewelopera                                                    */
/* ------------------------------------------------------------------ */

const DEV_LEAD_SERVICES = ['Przeprowadzka', 'Transport mebli z wniesieniem', 'Montaż mebli', 'Sprzątanie po odbiorze / remoncie', 'Wywóz gruzu i odpadów', 'Magazynowanie rzeczy', 'Inne'];
const DEV_LEAD_STATUSES = ['new', 'contacted', 'planned', 'completed', 'lost'];

function validateInvestment(input) {
    if (!input || typeof input !== 'object') bad('Nieprawidłowe dane.');
    return {
        name: text(input.name, 140, 'Nazwa inwestycji', { required: true, min: 2 }),
        address: text(input.address, 300, 'Adres', { required: true, min: 3 }),
        city: text(input.city, 80, 'Miasto', { required: true, min: 2 }),
        units: num(input.units, 'Liczba lokali', { min: 0, max: 100000, integer: true }),
        handoverFrom: dateValue(input.handoverFrom, 'Odbiory od'),
        handoverTo: dateValue(input.handoverTo, 'Odbiory do'),
        buyerOffer: text(input.buyerOffer, 300, 'Oferta dla nabywców'),
        active: input.active !== false
    };
}

function validateDevLead(input, { now = new Date(), publicForm = false } = {}) {
    if (!input || typeof input !== 'object') bad('Nieprawidłowe dane.');
    if (input.website) bad('Nie udało się wysłać.');
    if (publicForm ? input.consent !== true : input.buyerConsent !== true) bad(publicForm ? 'Zaznacz zgodę na kontakt.' : 'Potwierdź, że nabywca zgodził się na kontakt z RevSerwis.');
    const services = (Array.isArray(input.services) ? input.services : []).filter(s => DEV_LEAD_SERVICES.includes(s));
    if (!services.length) bad('Wybierz przynajmniej jedną usługę.');
    return {
        requestId: P.text(input.requestId, 80, 'id') && /^[a-zA-Z0-9-]{16,80}$/.test(input.requestId) ? input.requestId : bad('Odśwież stronę i spróbuj ponownie.'),
        investment: publicForm ? null : idValue(input.investment, 'inwestycja'),
        name: text(input.name, 140, 'Imię i nazwisko', { required: true, min: 2 }),
        phone: phone(input.phone, { required: true }),
        email: email(input.email, { required: false }),
        unit: text(input.unit, 40, 'Numer lokalu'),
        handoverDate: dateValue(input.handoverDate, 'Odbiór kluczy'),
        moveDate: dateValue(input.moveDate, 'Termin przeprowadzki', { future: true, now }),
        fromAddress: text(input.fromAddress, 300, 'Skąd (obecny adres)'),
        services: [...new Set(services)],
        notes: text(input.notes, 1500, 'Uwagi'),
        newsletter: input.newsletter === true
    };
}

/* ------------------------------------------------------------------ */
/* Analityka: miasto z adresu, rentowność, lejek                        */
/* ------------------------------------------------------------------ */

const KNOWN_CITIES = ['Słupsk', 'Ustka', 'Koszalin', 'Sławno', 'Bytów', 'Miastko', 'Lębork', 'Kobylnica', 'Redzikowo', 'Damnica', 'Główczyce', 'Kępice', 'Dębnica Kaszubska', 'Gdańsk', 'Gdynia', 'Sopot', 'Szczecin', 'Kołobrzeg', 'Darłowo', 'Poznań', 'Warszawa', 'Kraków', 'Wrocław', 'Łódź', 'Bydgoszcz', 'Toruń'];
const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase();
const CITY_INDEX = KNOWN_CITIES.map(c => [strip(c), c]);

/** Miasto z adresu zlecenia: znane miasto w tekście, inaczej pierwszy człon przed przecinkiem. */
function cityOf(task) {
    const raw = [task.address, task.addressFrom, task.addressTo].filter(Boolean).join(' | ');
    if (!raw) return 'Nieznane';
    const s = strip(raw);
    let best = null;
    for (const [k, c] of CITY_INDEX) {
        const i = s.search(new RegExp('(^|[^a-z])' + k.replace(/ /g, '\\s+') + '([^a-z]|$)'));
        if (i >= 0 && (best === null || i < best[0])) best = [i, c];
    }
    if (best) return best[1];
    const first = String(task.address || task.addressFrom || '').split(/[,|\n]/)[0].replace(/\d{2}-\d{3}/, '').replace(/\b(ul|al|os|pl)\.?\s.*$/i, '').replace(/\s+\d+[a-z]?(\/\d+[a-z]?)?\s*$/i, '').trim();
    return first && first.length <= 40 && !/\d/.test(first) ? first.charAt(0).toUpperCase() + first.slice(1) : 'Inne';
}

const serviceOf = t => {
    const d = t.division ? divisionName(t.division) : '';
    return (t.type && t.type !== 'Inne' ? t.type : '') || d || 'Inne';
};

/**
 * Rentowność zakończonych zleceń.
 * tasks: [{ _id, type, division, address…, finalPrice, price, costs, hoursWorked }]
 * payByTask: Map(taskId → suma wypłat pracowników przypisanych do zlecenia)
 */
function profitability(tasks, payByTask = new Map()) {
    const rows = tasks.map(t => {
        const revenue = Number(t.finalPrice ?? t.price) || 0;
        const c = t.costs || {};
        const direct = ['fuel', 'materials', 'disposal', 'other'].reduce((s, k) => s + (Number(c[k]) || 0), 0);
        const labor = Number(payByTask.get(String(t._id))) || 0;
        const cost = direct + labor;
        return { service: serviceOf(t), division: t.division || '', city: cityOf(t), revenue, direct, labor, cost, profit: revenue - cost, hours: Number(t.hoursWorked) || 0 };
    });
    const group = key => {
        const map = new Map();
        for (const r of rows) {
            const k = typeof key === 'function' ? key(r) : r[key];
            const g = map.get(k) || { key: k, count: 0, revenue: 0, direct: 0, labor: 0, cost: 0, profit: 0, hours: 0 };
            g.count++; g.revenue += r.revenue; g.direct += r.direct; g.labor += r.labor; g.cost += r.cost; g.profit += r.profit; g.hours += r.hours;
            map.set(k, g);
        }
        return [...map.values()].map(g => ({
            ...g,
            revenue: round2(g.revenue), direct: round2(g.direct), labor: round2(g.labor), cost: round2(g.cost), profit: round2(g.profit), hours: round2(g.hours),
            margin: g.revenue ? Math.round(g.profit / g.revenue * 1000) / 10 : 0,
            avgTicket: g.count ? round2(g.revenue / g.count) : 0,
            profitPerHour: g.hours ? round2(g.profit / g.hours) : null
        })).sort((a, b) => b.profit - a.profit);
    };
    const total = group(() => 'Razem')[0] || { count: 0, revenue: 0, cost: 0, profit: 0, margin: 0, hours: 0, profitPerHour: null, avgTicket: 0 };
    return {
        total,
        byService: group('service'),
        byCity: group('city'),
        matrix: group(r => `${r.service} · ${r.city}`).slice(0, 40),
        missingCosts: rows.filter(r => !r.direct && !r.labor).length
    };
}

const STAGE_ORDER = { new: 0, quoted: 1, planned: 2, progress: 2, completed: 3, cancelled: -1 };

/** Lejek sprzedaży dla zleceń utworzonych w okresie. */
function funnel(tasks) {
    const reached = t => {
        if (t.status === 'cancelled') return t.plannedAt ? 2 : t.quotedAt || t.clientAcceptedAt || (t.price > 0) || (t.aiEstimate && t.aiEstimate.high) ? 1 : 0;
        const s = STAGE_ORDER[t.status] ?? 0;
        return Math.max(s, t.plannedAt ? 2 : 0, t.quotedAt ? 1 : 0);
    };
    const stages = [0, 0, 0, 0];
    const bySource = new Map();
    const byService = new Map();
    const lost = new Map();
    const responseHours = [];
    for (const t of tasks) {
        const r = reached(t);
        for (let i = 0; i <= r; i++) stages[i]++;
        for (const [map, key] of [[bySource, t.source || 'Inne'], [byService, serviceOf(t)]]) {
            const g = map.get(key) || { key, leads: 0, quoted: 0, won: 0, completed: 0, value: 0 };
            g.leads++;
            if (r >= 1) g.quoted++;
            if (r >= 2) g.won++;
            if (r >= 3) { g.completed++; g.value += Number(t.finalPrice ?? t.price) || 0; }
            map.set(key, g);
        }
        if (t.status === 'cancelled') {
            const reason = (t.clientCancelReason || '').trim() || (r === 0 ? 'Brak odpowiedzi / bez wyceny' : r === 1 ? 'Odrzucona wycena' : 'Anulowane po zaplanowaniu');
            lost.set(reason, (lost.get(reason) || 0) + 1);
        }
        if (t.quotedAt && t.createdAt) {
            const h = (new Date(t.quotedAt) - new Date(t.createdAt)) / 3_600_000;
            if (h >= 0 && h < 24 * 60) responseHours.push(h);
        }
    }
    const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : 0);
    const sorted = responseHours.sort((a, b) => a - b);
    const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
    const table = map => [...map.values()].map(g => ({ ...g, value: round2(g.value), conversion: pct(g.won, g.leads) })).sort((a, b) => b.leads - a.leads);
    return {
        stages: [
            { key: 'leads', label: 'Zgłoszenia', count: stages[0], pct: 100 },
            { key: 'quoted', label: 'Wycenione', count: stages[1], pct: pct(stages[1], stages[0]) },
            { key: 'won', label: 'Zaakceptowane / zaplanowane', count: stages[2], pct: pct(stages[2], stages[0]) },
            { key: 'completed', label: 'Zrealizowane', count: stages[3], pct: pct(stages[3], stages[0]) }
        ],
        steps: [pct(stages[1], stages[0]), pct(stages[2], stages[1]), pct(stages[3], stages[2])],
        bySource: table(bySource),
        byService: table(byService),
        lost: [...lost.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
        responseMedianHours: median === null ? null : Math.round(median * 10) / 10,
        responseUnder2h: sorted.length ? pct(sorted.filter(h => h <= 2).length, sorted.length) : null,
        open: tasks.filter(t => t.status === 'new').length
    };
}

module.exports = {
    ADDON_UNITS, validateAddon, pickAddons,
    validateChat,
    NEWSLETTER_TOPICS, NEWSLETTER_TOPIC_LABELS, NEWSLETTER_SOURCES, CAMPAIGN_SEGMENTS, validateNewsletter, validateCampaign, renderCampaign,
    DEV_LEAD_SERVICES, DEV_LEAD_STATUSES, validateInvestment, validateDevLead,
    KNOWN_CITIES, cityOf, serviceOf, profitability, funnel
};
