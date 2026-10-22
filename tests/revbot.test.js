'use strict';

// 8.0 — RevBot (silnik cenowy), święta, podatek, SMS, widoczność oddziałów. Bez bazy i bez zależności npm.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const pricing = require('../lib/revbot/pricing');
const { dayInfo, easterSunday } = require('../lib/holidays');
const { taxOnIncome, yearlyTax } = require('../lib/tax');
const catalog = require('../Public/assets/ai-services');

const P = pricing.mergeParams(null);
const line = (r, label) => r.lines.find(l => l.label.startsWith(label));

test('stawki firmy: 2,5 zł/km, 30 zł/piętro, +20% weekend i święto', () => {
    assert.equal(P.kmRate, 2.5);
    assert.equal(P.floorRate, 30);
    assert.equal(P.weekendSurcharge, 20);
    const base = pricing.priceService('move', { scope: 1, floorFrom: 3, floorTo: 0, lift: 0 }, { routeKm: 100 }, P);
    assert.equal(line(base, 'Trasa').amount, 250, '100 km × 2,5 zł');
    assert.equal(line(base, 'Piętra').amount, 90, '3 piętra × 30 zł');
    const weekend = pricing.priceService('move', { scope: 1, floorFrom: 3, floorTo: 0, lift: 0 }, { routeKm: 100, surcharge: true, dayName: 'sobota' }, P);
    const sub = base.lines.filter(l => !/marży|Minimalna/.test(l.label)).reduce((s, l) => s + l.amount, 0);
    assert.ok(Math.abs(line(weekend, 'Dopłata').amount - sub * 0.2) <= 2, 'dopłata 20% od kwoty');
});

test('ciężkie rzeczy i pakowanie są dodatkowo płatne; winda obniża dopłatę za piętra', () => {
    const plain = pricing.priceService('move', { scope: 3, floorFrom: 4, lift: 0 }, { routeKm: 10 }, P);
    const extra = pricing.priceService('move', { scope: 3, floorFrom: 4, lift: 0, extras: [0, 2] }, { routeKm: 10 }, P);
    assert.ok(line(extra, 'Pianino'));
    assert.ok(line(extra, 'Pakowanie'));
    assert.ok(extra.mid > plain.mid + 400);
    const lift = pricing.priceService('move', { scope: 3, floorFrom: 4, lift: 1 }, { routeKm: 10 }, P);
    assert.ok(line(lift, 'Piętra').amount < line(plain, 'Piętra').amount);
    const fromText = pricing.priceService('move', { scope: 1 }, { routeKm: 10, text: 'mamy stary sejf i bieżnię' }, P);
    assert.ok(line(fromText, 'Sejf') && line(fromText, 'Sprzęt siłowni'), 'rozpoznanie z opisu klienta');
});

test('opróżnianie: utylizacja liczona z kosztów + narzut, cena nigdy poniżej kosztów + marży', () => {
    const r = pricing.priceService('clear', { area: 60, fill: 2, floor: 2 }, { ai: { disposal: [{ key: 'furniture', m3: 10 }, { key: 'electro', qty: 3 }, { key: 'rubble', m3: 2 }] } }, P);
    assert.equal(r.disposal.cost, 10 * 50 + 3 * 0 + 2 * 140);
    assert.equal(line(r, 'Utylizacja').amount, Math.round(r.disposal.cost * 1.4));
    assert.ok(r.mid >= r.cost * (1 + P.margin / 100) - 10);
    const scrap = pricing.disposalCost(P, [{ key: 'scrap', m3: 5 }]);
    assert.ok(scrap.cost < 0 && scrap.price === 0, 'złom obniża koszt, ale nie daje ujemnej ceny');
});

test('każda usługa z katalogu daje cenę ≥ minimum i widełki low ≤ high', () => {
    for (const s of catalog.SERVICES) {
        const r = pricing.priceService(s.id, catalog.normalize(s.id, {}), { routeKm: 30, approachKm: 40 }, P);
        assert.ok(r.mid >= P.minOrder, s.id);
        for (const c of ['high', 'medium', 'low']) {
            const range = pricing.rangeFor(r.mid, c, r.cost * 1.3);
            assert.ok(range.low <= range.high && range.low >= Math.round(r.cost * 1.3 / 10) * 10 - 10, s.id + ' ' + c);
        }
    }
});

test('parametry z panelu: tylko znane klucze i liczby; listy walidowane', () => {
    const m = pricing.mergeParams({ kmRate: '3', hack: 1, floorRate: 'abc', heavyItems: [{ key: 'x', label: 'Szafa pancerna', price: 500, words: 'pancern, szafa pancerna' }, { label: 'bez klucza' }] });
    assert.equal(m.kmRate, 3);
    assert.equal(m.floorRate, 30);
    assert.ok(!('hack' in m));
    assert.deepEqual(m.heavyItems.map(h => h.key), ['x']);
    assert.deepEqual(m.heavyItems[0].words, ['pancern', 'szafa pancerna']);
});

test('publiczny katalog nie zawiera stawek; brak odpowiedzi = „nie podano”', () => {
    for (const s of catalog.SERVICES) assert.equal(s.price, undefined, s.id);
    assert.deepEqual(catalog.normalize('move', {}), {});
    assert.deepEqual(catalog.normalize('move', { scope: 2, floorFrom: 99, extras: [0, 0, 9] }), { scope: 2, floorFrom: 20, extras: [0] });
    assert.deepEqual(Object.keys(catalog.readable('move', { scope: 2 })), ['Zakres']);
    assert.equal(catalog.MAX_PHOTOS, 10);
    for (const g of catalog.GROUPS) for (const [id] of g.variants) assert.ok(catalog.BY_ID[id], id);
    assert.deepEqual(catalog.GROUPS.filter(g => g.main).map(g => g.key), ['przeprowadzka', 'oproznianie', 'transport', 'zima', 'ogrod']);
});

test('święta w Polsce (z Wigilią od 2025) i weekendy', () => {
    assert.deepEqual(easterSunday(2026), { month: 4, day: 5 });
    assert.equal(dayInfo('2026-04-06').name, 'Poniedziałek Wielkanocny');
    assert.equal(dayInfo('2026-06-04').name, 'Boże Ciało');
    assert.equal(dayInfo('2026-12-24').holiday, true);
    assert.equal(dayInfo('2024-12-24').holiday, false);
    assert.equal(dayInfo('2026-10-24').surcharge, true, 'sobota');
    assert.equal(dayInfo('2026-10-21').surcharge, false, 'środa');
    assert.equal(dayInfo('').surcharge, false);
});

test('podatek 12% (zasady ogólne), próg 120 000 zł → 32%, narastająco w roku', () => {
    assert.equal(taxOnIncome(100000), 12000);
    assert.equal(taxOnIncome(150000), 120000 * 0.12 + 30000 * 0.32);
    assert.equal(taxOnIncome(-5000), 0);
    assert.equal(taxOnIncome(100000, { freeAmount: 30000 }), 12000 - 3600);
    const y = yearlyTax([{ revenue: 10000, expenses: 2000 }, { revenue: 1000, expenses: 5000 }, { revenue: 8000, expenses: 1000 }]);
    assert.deepEqual(y.map(m => m.tax), [960, 0, 360]);
    assert.equal(y[2].taxToDate, 1320);
});

test('SMS z prośbą o opinię: numer i treść z linkiem', () => {
    const sms = require('../src/services/sms');
    assert.equal(sms.normalizePhone('600 100 200'), '48600100200');
    assert.equal(sms.normalizePhone('+49 151 1234567'), '491511234567');
    assert.equal(sms.normalizePhone('123'), '');
    assert.equal(sms.reviewMessage('Dziękujemy! {link} Pozdrawiamy', 'https://g.page/x'), 'Dziękujemy! https://g.page/x Pozdrawiamy');
    assert.match(sms.reviewMessage('Bez linku', 'https://g.page/x'), /https:\/\/g\.page\/x$/);
});
