'use strict';

/**
 * RevBot — silnik wyceny RevSerwis (TYLKO SERWER).
 *
 * Tu są stawki firmy: kilometr, piętro, dopłata weekendowa i świąteczna, ciężkie rzeczy, pakowanie,
 * koszty i marża na utylizacji. Klient nigdy ich nie widzi — strona dostaje wyłącznie wynik (widełki).
 * Administrator zmienia parametry w panelu RevMi → RevBot (zapis w ustawieniach, nadpisuje wartości domyślne).
 *
 * Silnik liczy cenę deterministycznie z ilości (m³, piętra, km, sztuki). Ilości pochodzą z formularza,
 * a gdy klient ich nie podał — z analizy zdjęć przez AI (RevBot). Dzięki temu AI nie „wymyśla” ceny od zera,
 * tylko dostarcza dane, a cena wynika z cennika firmy + kalibracji na historii zleceń.
 */

const DEFAULT_PARAMS = Object.freeze({
    kmRate: 2.5,                // zł za 1 km trasy
    floorRate: 30,              // zł za każde piętro (odbiór + dostawa), bez windy
    liftFactor: 0.5,            // ile stawki za piętro liczymy, gdy jest winda (0–1)
    weekendSurcharge: 20,       // % dopłaty w sobotę, niedzielę i święto
    urgentSurcharge: 15,        // % dopłaty za termin pilny (do 48 h)
    freeRadiusKm: 15,           // dojazd z bazy w tym promieniu jest wliczony
    approachReturn: true,       // dojazd liczony w obie strony (baza → klient → baza)
    laborRate: 70,              // zł za roboczogodzinę jednej osoby (cena dla klienta)
    minOrder: 250,              // minimalna kwota zlecenia
    margin: 30,                 // % minimalnej marży ponad koszty (pracownicy, paliwo, utylizacja)
    workerCostRate: 30,         // koszt firmy za roboczogodzinę (do kontroli marży)
    fuelCostPerKm: 0.9,         // koszt paliwa i auta na 1 km
    vanM3: 18,                  // pojemność jednego kursu busa (m³)
    extraCourse: 90,            // dopłata za każdy kolejny kurs lokalny
    packingPerM3: 45,           // pakowanie przez ekipę: praca + materiały za m³
    assemblyPerM3: 25,          // demontaż i montaż mebli za m³ (pełny); sam demontaż = połowa
    disposalMarkup: 40,         // % narzutu na koszt utylizacji (zarobek na utylizacji)
    moveM3PerWorkerHour: 1.6,   // wydajność przy przeprowadzce (załadunek + rozładunek, z noszeniem po schodach)
    clearM3PerWorkerHour: 1.6,  // wydajność przy opróżnianiu (z wynoszeniem)
    heavyItems: [
        { key: 'pianino', label: 'Pianino', price: 400, words: ['pianin'] },
        { key: 'fortepian', label: 'Fortepian', price: 900, words: ['fortepian'] },
        { key: 'sejf', label: 'Sejf (do 150 kg)', price: 250, words: ['sejf'] },
        { key: 'sejf_ciezki', label: 'Sejf ciężki (ponad 150 kg)', price: 600, words: ['ciężki sejf', 'duży sejf'] },
        { key: 'bilard', label: 'Stół bilardowy', price: 600, words: ['bilard'] },
        { key: 'akwarium', label: 'Duże akwarium', price: 200, words: ['akwarium'] },
        { key: 'agd_duze', label: 'Duże AGD (lodówka side-by-side, zamrażarka skrzyniowa)', price: 100, words: ['side by side', 'side-by-side', 'zamrażark'] },
        { key: 'silownia', label: 'Sprzęt siłowni (bieżnia, atlas)', price: 150, words: ['bieżni', 'atlas', 'orbitrek'] },
        { key: 'kamien', label: 'Blat kamienny / marmur', price: 200, words: ['marmur', 'granit', 'blat kamien'] }
    ],
    disposal: [
        { key: 'furniture', label: 'Meble i gabaryty', unit: 'm3', cost: 50 },
        { key: 'mixed', label: 'Odpady zmieszane / rzeczy z mieszkania', unit: 'm3', cost: 80 },
        { key: 'rubble', label: 'Gruz czysty', unit: 'm3', cost: 140 },
        { key: 'rubble_mixed', label: 'Gruz zmieszany / odpady remontowe', unit: 'm3', cost: 260 },
        { key: 'green', label: 'Odpady zielone (gałęzie, trawa)', unit: 'm3', cost: 40 },
        { key: 'wood', label: 'Drewno', unit: 'm3', cost: 45 },
        { key: 'electro', label: 'AGD / RTV (elektroodpady)', unit: 'szt', cost: 0 },
        { key: 'tires', label: 'Opony', unit: 'szt', cost: 15 },
        { key: 'mattress', label: 'Materace', unit: 'szt', cost: 30 },
        { key: 'scrap', label: 'Złom (przychód ze skupu)', unit: 'm3', cost: -40 },
        { key: 'hazardous', label: 'Niebezpieczne (farby, chemia, eternit)', unit: 'm3', cost: 650 }
    ]
});

/** Łączy zapisane w ustawieniach parametry z domyślnymi (bezpiecznie — tylko znane klucze i liczby). */
function mergeParams(saved) {
    const out = JSON.parse(JSON.stringify(DEFAULT_PARAMS));
    if (!saved || typeof saved !== 'object') return out;
    for (const [k, v] of Object.entries(saved)) {
        if (!(k in out)) continue;
        if (typeof out[k] === 'number') {
            const n = Number(v);
            if (Number.isFinite(n)) out[k] = n;
        } else if (typeof out[k] === 'boolean') {
            out[k] = Boolean(v);
        } else if (Array.isArray(out[k]) && Array.isArray(v)) {
            const list = v.filter(x => x && typeof x === 'object' && String(x.key || '').trim() && String(x.label || '').trim()).slice(0, 40).map(x => {
                const item = { key: String(x.key).trim().slice(0, 40), label: String(x.label).trim().slice(0, 120) };
                if (k === 'heavyItems') {
                    item.price = Math.max(0, Number(x.price) || 0);
                    item.words = (Array.isArray(x.words) ? x.words : String(x.words || '').split(',')).map(w => String(w).trim().toLowerCase()).filter(Boolean).slice(0, 10);
                } else {
                    item.unit = ['m3', 'szt', 'kg'].includes(x.unit) ? x.unit : 'm3';
                    item.cost = Number(x.cost) || 0;
                }
                return item;
            });
            if (list.length) out[k] = list;
        }
    }
    return out;
}

const round10 = n => Math.round((Number(n) || 0) / 10) * 10;
const pos = n => Math.max(0, Number(n) || 0);
const has = (v, k) => v && v[k] !== undefined && v[k] !== null && v[k] !== '';

/* Typowe objętości (m³) dla zakresu przeprowadzki: Kilka rzeczy, Kawalerka, 2 pokoje, 3 pokoje, 4+ pokoi, Dom, Biuro */
const MOVE_VOLUME = [3, 12, 20, 30, 40, 55, 30];
/* Opróżnianie: m³ rzeczy na 1 m² powierzchni wg „ile jest rzeczy” (Mało, Średnio, Dużo, Bardzo dużo) */
const CLEAR_DENSITY = [0.1, 0.2, 0.35, 0.5];
const WASTE_VOLUME = [1.5, 3.5, 7.5, 13];

/** Liczba osób w ekipie wg objętości. */
const crewFor = m3 => (m3 <= 4 ? 2 : m3 <= 25 ? 2 : m3 <= 45 ? 3 : 4);

function floorsCharge(p, from, to, lift) {
    // lift: 0 brak, 1 przy odbiorze, 2 przy dostawie, 3 w obu miejscach
    const f1 = pos(from) * (lift === 1 || lift === 3 ? p.liftFactor : 1);
    const f2 = pos(to) * (lift === 2 || lift === 3 ? p.liftFactor : 1);
    return { floors: pos(from) + pos(to), amount: (f1 + f2) * p.floorRate };
}

function heavyFrom(p, keys = [], extrasText = '') {
    const found = new Map();
    for (const k of keys) {
        const def = p.heavyItems.find(h => h.key === k);
        if (def) found.set(def.key, def);
    }
    const text = String(extrasText || '').toLowerCase();
    if (text) for (const h of p.heavyItems) if ((h.words || []).some(w => text.includes(w))) found.set(h.key, h);
    return [...found.values()];
}

/**
 * Utylizacja: lista { key, m3?, qty? } → { cost (dla firmy), price (dla klienta z narzutem), lines }.
 * Ujemny koszt (np. złom) obniża koszt, ale cena klienta nigdy nie spada poniżej 0.
 */
function disposalCost(p, list = []) {
    let cost = 0;
    const lines = [];
    for (const d of Array.isArray(list) ? list : []) {
        const def = p.disposal.find(x => x.key === d.key);
        if (!def) continue;
        const amount = def.unit === 'szt' ? pos(d.qty) : def.unit === 'kg' ? pos(d.kg) : pos(d.m3);
        if (!amount) continue;
        const c = amount * def.cost;
        cost += c;
        lines.push({ key: def.key, label: def.label, amount: Math.round(amount * 10) / 10, unit: def.unit, cost: Math.round(c) });
    }
    const price = Math.max(0, cost) * (1 + p.disposalMarkup / 100);
    return { cost: Math.round(cost), price: Math.round(price), lines };
}

/** Domyślny podział odpadów, gdy AI nie rozpoznało zdjęć. */
function guessDisposal(serviceId, values, m3) {
    if (serviceId === 'waste') {
        const kinds = values.kinds || [];
        const map = ['furniture', 'electro', 'rubble', 'green', 'tires', 'mixed'];
        const chosen = kinds.length ? kinds.map(i => map[i]).filter(Boolean) : ['mixed'];
        const volKinds = chosen.filter(k => !['electro', 'tires'].includes(k));
        return chosen.map(k => (k === 'electro' ? { key: k, qty: 2 } : k === 'tires' ? { key: k, qty: 4 } : { key: k, m3: m3 / Math.max(1, volKinds.length) }));
    }
    if (serviceId === 'clear') return [{ key: 'furniture', m3: m3 * 0.5 }, { key: 'mixed', m3: m3 * 0.5 }];
    if (serviceId === 'demo') return [{ key: [2].includes(values.mat) ? 'rubble' : values.mat === 1 ? 'scrap' : 'wood', m3: pos(values.area) * 0.25 }];
    if (serviceId === 'strip') return [{ key: 'rubble_mixed', m3: pos(values.area) * 0.06 }];
    if (serviceId === 'trees') return [{ key: 'green', m3: pos(values.count) * [1.5, 3, 6, 10][values.height || 0] }];
    if (serviceId === 'plot') return [{ key: 'green', m3: pos(values.area) * [0.004, 0.01, 0.02][values.state || 0] }];
    return [];
}

/* Bazowe kwoty usług bez rozbicia na m³ (stawki RevSerwis — dawny katalog 7.0). Środek widełek, zł brutto. */
const LEGACY = {
    cleaning: f => Math.max(250, pos(f.area ?? 50) * [6, 9][f.scope || 0] * (f.place === 3 ? 1.4 : 1) + (f.windows ? pos(f.area ?? 50) * 2 : 0)),
    wash: f => Math.max(250, pos(f.area ?? 60) * [8, 10, 14][f.dirt ?? 1] * ([2, 3].includes(f.surface) ? 1.4 : 1) + (f.impreg ? pos(f.area ?? 60) * 6 : 0)),
    halls: f => Math.max(300, pos(f.area ?? 40) * [4, 6, 9][f.dirt ?? 1]),
    demo: f => 400 + pos(f.area ?? 12) * [35, 30, 70, 50][f.mat || 0],
    strip: f => 300 + pos(f.area ?? 15) * 45 * ((f.works || []).includes(2) ? 1.3 : 1),
    earth: f => [600, 1400, 3500, 7000][f.time ?? 1] + (f.access ? 300 : 0),
    trees: f => Math.max(250, pos(f.count ?? 1) * [200, 400, 800, 1400][f.height ?? 1] * (f.near ? 1.5 : 1) + [0, 200, 500][f.bushes || 0]),
    stumps: f => Math.max(200, pos(f.count ?? 1) * [150, 300, 500][f.dia ?? 1] * (f.method ? 1.6 : 1)),
    plot: f => Math.max(300, pos(f.area ?? 500) * [0.6, 1.2, 2.2][f.state ?? 1] + (f.scope || []).length * 150),
    sale: f => 300 + pos(f.area ?? 80) * 8 + (f.scope || []).length * 300,
    storage: f => [200, 450, 800, 1300][f.vol ?? 1] * [1, 2.5, 5, 9][f.period ?? 1] + (f.transport === 1 ? 0 : 300),
    snow: f => (f.mode ? Math.max(1500, pos(f.area ?? 100) * 1.2 * 20) : Math.max(150, pos(f.area ?? 100) * 1.5)),
    facility: f => [600, 2000, 4000, 8000][f.freq ?? 1],
    other: () => 400
};

/**
 * Wycena jednej usługi.
 * values — odpowiedzi klienta (znormalizowane; brakujące pola = nie podano),
 * ctx — { routeKm, approachKm, surcharge(dzień), urgent, ai: { volumeM3, heavy[], disposal[], packing, assembly, floorsFrom, floorsTo, lift, crew, hours, items } }
 * Zwraca { mid, cost, profit, crew, hours, volumeM3, lines[] } — lines to rozbicie dla administratora.
 */
function priceService(serviceId, values = {}, ctx = {}, params = DEFAULT_PARAMS) {
    const p = params;
    const ai = ctx.ai || {};
    const lines = [];
    const add = (label, amount, note = '') => { if (Math.round(amount)) lines.push({ label, amount: Math.round(amount), note }); return amount; };
    let price = 0;
    let workerHours = 0;
    let fuelKm = 0;
    let disposal = { cost: 0, price: 0, lines: [] };
    let crew = ai.crew || 2;
    let volume = 0;
    const routeKm = pos(ctx.routeKm);

    const approach = () => {
        const extra = Math.max(0, pos(ctx.approachKm) - p.freeRadiusKm) * (p.approachReturn ? 2 : 1);
        if (extra) { price += add('Dojazd z bazy', extra * p.kmRate, `${Math.round(extra)} km × ${p.kmRate} zł`); fuelKm += extra; }
    };
    const kmLine = (km, label = 'Trasa') => {
        if (!km) return;
        price += add(label, km * p.kmRate, `${Math.round(km)} km × ${p.kmRate} zł`);
        fuelKm += km;
    };

    switch (serviceId) {
        case 'move': {
            volume = pos(ai.volumeM3) || MOVE_VOLUME[has(values, 'scope') ? values.scope : 2];
            crew = ai.crew || crewFor(volume);
            const hours = ai.hours ? pos(ai.hours) : Math.max(2, volume / (p.moveM3PerWorkerHour * crew));
            workerHours = hours * crew;
            price += add('Praca ekipy', workerHours * p.laborRate, `${crew} os. × ${Math.round(hours * 10) / 10} h`);
            const courses = Math.max(1, Math.ceil(volume / p.vanM3));
            // Lokalnie (< 60 km) jeden bus robi kilka kursów; na długiej trasie jedzie kilka aut naraz — w obu przypadkach km × kursy.
            kmLine(routeKm * (routeKm < 60 ? (2 * courses - 1) : courses), courses > 1 ? `Trasa (${courses} ${routeKm < 60 ? 'kursy' : 'auta'})` : 'Trasa');
            approach();
            const from = has(values, 'floorFrom') ? values.floorFrom : pos(ai.floorsFrom);
            const to = has(values, 'floorTo') ? values.floorTo : pos(ai.floorsTo);
            const lift = has(values, 'lift') ? values.lift : (ai.lift ?? 0);
            const fl = floorsCharge(p, from, to, lift);
            price += add('Piętra', fl.amount, `${fl.floors} × ${p.floorRate} zł${lift ? ' (winda)' : ''}`);
            const asm = has(values, 'assembly') ? values.assembly : (ai.assembly ?? 0);
            if (asm) price += add(asm === 2 ? 'Demontaż i montaż mebli' : 'Demontaż mebli', volume * p.assemblyPerM3 * (asm === 2 ? 1 : 0.5));
            const extras = values.extras || [];
            if (extras.includes(0) || ai.packing) price += add('Pakowanie przez ekipę', volume * p.packingPerM3);
            if (extras.includes(1)) price += add('Kartony', Math.ceil(volume * 2) * 8);
            const heavyKeys = [...(ai.heavy || []), ...(extras.includes(2) ? ['pianino'] : []), ...(extras.includes(4) ? ['agd_duze'] : [])];
            for (const h of heavyFrom(p, heavyKeys, ctx.text)) price += add(h.label, h.price, 'ciężka rzecz');
            if (extras.includes(3)) price += add('Przedmioty wartościowe — zabezpieczenie', 100);
            break;
        }
        case 'cargo': {
            const w = has(values, 'weight') ? values.weight : 0;
            crew = values.help === 0 ? 1 : 2;
            const hours = [1.5, 2, 3, 4][w];
            workerHours = crew * hours;
            price += add('Załadunek i obsługa', 120 + (values.help === 0 ? 0 : hours * p.laborRate), crew + ' os.');
            price += add('Ciężar ładunku', [0, 80, 200, 450][w]);
            kmLine(routeKm);
            approach();
            for (const h of heavyFrom(p, ai.heavy, ctx.text)) price += add(h.label, h.price, 'ciężka rzecz');
            break;
        }
        case 'shop': {
            crew = 2;
            workerHours = 2 * 1.5;
            price += add('Odbiór i obsługa', 120 + pos(values.items ?? 1) * 20);
            const fl = floorsCharge(p, 0, values.floor ?? ai.floorsTo ?? 0, ai.lift ?? 0);
            if ((values.carry ?? 1) > 0) price += add('Wniesienie — piętra', fl.amount, `${fl.floors} × ${p.floorRate} zł`);
            price += add('Zakres', [0, 60, 150][values.carry ?? 1]);
            kmLine(routeKm);
            approach();
            break;
        }
        case 'moto': {
            crew = 1;
            workerHours = 2;
            price += add('Załadunek i zabezpieczenie', 150 + (pos(values.count ?? 1) - 1) * 90 + (values.state ? 80 : 0) + (values.type === 2 ? 60 : 0));
            kmLine(routeKm);
            approach();
            break;
        }
        case 'people': {
            crew = 1;
            const trip = values.trip ? 2 : 1;
            price += add('Kierowca i obsługa', 100 + (pos(values.persons ?? 4) > 8 ? 200 : 0));
            kmLine(routeKm * trip, trip > 1 ? 'Trasa (w obie strony)' : 'Trasa');
            approach();
            break;
        }
        case 'clear':
        case 'waste': {
            if (serviceId === 'clear') {
                const area = has(values, 'area') ? values.area : 50;
                volume = pos(ai.volumeM3) || area * CLEAR_DENSITY[has(values, 'fill') ? values.fill : 1];
            } else {
                volume = pos(ai.volumeM3) || WASTE_VOLUME[has(values, 'qty') ? values.qty : 1];
            }
            crew = ai.crew || (volume > 20 ? 3 : 2);
            const carry = serviceId === 'waste' && values.carry === 0 ? 0.4 : 1;
            const hours = ai.hours ? pos(ai.hours) : Math.max(1.5, (volume / (p.clearM3PerWorkerHour * crew)) * carry);
            workerHours = hours * crew;
            price += add('Praca ekipy (wynoszenie i załadunek)', workerHours * p.laborRate, `${crew} os. × ${Math.round(hours * 10) / 10} h`);
            const fl = floorsCharge(p, has(values, 'floor') ? values.floor : pos(ai.floorsFrom), 0, ai.lift ?? 0);
            price += add('Piętra', fl.amount, `${fl.floors} × ${p.floorRate} zł`);
            const courses = Math.max(1, Math.ceil(volume / p.vanM3));
            price += add('Transport do punktu odbioru', 80 + (courses - 1) * p.extraCourse, `${courses} kurs(y)`);
            fuelKm += 25 * courses;
            approach();
            disposal = disposalCost(p, ai.disposal && ai.disposal.length ? ai.disposal : guessDisposal(serviceId, values, volume));
            price += add('Utylizacja', disposal.price, 'koszt + narzut');
            for (const h of heavyFrom(p, ai.heavy, ctx.text)) price += add(h.label, h.price * 0.5, 'ciężka rzecz (wyniesienie)');
            break;
        }
        default: {
            const fn = LEGACY[serviceId] || LEGACY.other;
            const base = fn(values || {});
            price += add('Zakres usługi', base);
            workerHours = Math.max(2, base / (p.laborRate * 1.6));
            approach();
            if (['demo', 'strip', 'trees', 'plot'].includes(serviceId)) {
                const haul = serviceId === 'plot' ? (values.scope || []).some(i => i >= 3) : values.haul !== 1;
                if (haul) {
                    disposal = disposalCost(p, ai.disposal && ai.disposal.length ? ai.disposal : guessDisposal(serviceId, values, 0));
                    price += add('Wywóz i utylizacja', disposal.price, 'koszt + narzut');
                    fuelKm += 25;
                }
            }
        }
    }

    // Dopłaty procentowe
    const subtotal = price;
    if (ctx.surcharge) price += add(`Dopłata: ${ctx.dayName || 'weekend / święto'}`, subtotal * p.weekendSurcharge / 100, `+${p.weekendSurcharge}%`);
    if (ctx.urgent) price += add('Termin pilny', subtotal * p.urgentSurcharge / 100, `+${p.urgentSurcharge}%`);

    // Kontrola marży: cena nie może spaść poniżej kosztów + minimalnej marży
    const cost = workerHours * p.workerCostRate + fuelKm * p.fuelCostPerKm + Math.max(0, disposal.cost);
    const floor = cost * (1 + p.margin / 100);
    if (price < floor) price += add('Wyrównanie do minimalnej marży', floor - price);
    if (price < p.minOrder) price += add('Minimalna kwota zlecenia', p.minOrder - price);

    return {
        serviceId,
        mid: round10(price),
        cost: Math.round(cost),
        profit: Math.round(price - cost),
        crew,
        hours: Math.round((workerHours / Math.max(1, crew)) * 10) / 10,
        volumeM3: Math.round(volume * 10) / 10,
        disposal,
        lines
    };
}

const SPREAD = { high: [0.92, 1.12], medium: [0.88, 1.22], low: [0.82, 1.38] };

/** Widełki z kwoty środkowej: dolna granica nigdy poniżej kosztów + marży. */
function rangeFor(mid, confidence = 'medium', minimum = 0) {
    const [lo, hi] = SPREAD[confidence] || SPREAD.medium;
    const low = Math.max(round10(mid * lo), round10(minimum));
    return { low, high: Math.max(low + 10, round10(mid * hi)) };
}

module.exports = { DEFAULT_PARAMS, mergeParams, priceService, rangeFor, disposalCost, heavyFrom, round10, SPREAD, MOVE_VOLUME };
