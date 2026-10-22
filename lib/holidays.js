'use strict';

/**
 * Dni ustawowo wolne od pracy w Polsce + weekendy (do dopłaty weekendowej / świątecznej w wycenie).
 * Od 2025 r. Wigilia (24.12) jest dniem wolnym.
 */

function easterSunday(year) {
    // Algorytm Meeusa/Jonesa/Butchera (kalendarz gregoriański)
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return { month, day };
}

const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function addDays(y, m, d, days) {
    const t = new Date(Date.UTC(y, m - 1, d + days));
    return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

const cache = new Map();

/** Mapa 'YYYY-MM-DD' → nazwa święta dla danego roku. */
function holidays(year) {
    if (cache.has(year)) return cache.get(year);
    const e = easterSunday(year);
    const list = {
        [ymd(year, 1, 1)]: 'Nowy Rok',
        [ymd(year, 1, 6)]: 'Trzech Króli',
        [ymd(year, e.month, e.day)]: 'Wielkanoc',
        [addDays(year, e.month, e.day, 1)]: 'Poniedziałek Wielkanocny',
        [ymd(year, 5, 1)]: 'Święto Pracy',
        [ymd(year, 5, 3)]: 'Święto Konstytucji 3 Maja',
        [addDays(year, e.month, e.day, 49)]: 'Zielone Świątki',
        [addDays(year, e.month, e.day, 60)]: 'Boże Ciało',
        [ymd(year, 8, 15)]: 'Wniebowzięcie NMP',
        [ymd(year, 11, 1)]: 'Wszystkich Świętych',
        [ymd(year, 11, 11)]: 'Święto Niepodległości',
        [ymd(year, 12, 25)]: 'Boże Narodzenie',
        [ymd(year, 12, 26)]: 'Drugi dzień Bożego Narodzenia'
    };
    if (year >= 2025) list[ymd(year, 12, 24)] = 'Wigilia';
    cache.set(year, list);
    return list;
}

/**
 * Sprawdza datę 'YYYY-MM-DD' (lub Date): { weekend, holiday, name, surcharge } — surcharge = true dla soboty, niedzieli i świąt.
 */
function dayInfo(value) {
    let key = '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) key = ymd(value.getFullYear(), value.getMonth() + 1, value.getDate());
    else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) key = value;
    if (!key) return { date: '', weekend: false, holiday: false, name: '', surcharge: false };
    const [y, m, d] = key.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const name = holidays(y)[key] || '';
    return { date: key, weekend, holiday: Boolean(name), name: name || (dow === 6 ? 'sobota' : dow === 0 ? 'niedziela' : ''), surcharge: weekend || Boolean(name) };
}

module.exports = { easterSunday, holidays, dayInfo };
