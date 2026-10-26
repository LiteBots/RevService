'use strict';

// RevSerwis 9.1 — testy czystej logiki: rentowność, lejek, dodatki, czat, newsletter, deweloperzy.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib/v10-input');

const RID = 'abcdefghijklmnop1234';

test('miasto z adresu zlecenia', () => {
    assert.equal(L.cityOf({ address: 'Słupsk, ul. Długa 1' }), 'Słupsk');
    assert.equal(L.cityOf({ addressFrom: 'ul. Morska 2, 76-270 Ustka', addressTo: 'Słupsk' }), 'Ustka');
    assert.equal(L.cityOf({ address: 'slupsk dluga 4' }), 'Słupsk', 'bez polskich znaków');
    assert.equal(L.cityOf({ address: 'Lędowo, Polna 3' }), 'Lędowo', 'nieznane miasto — pierwszy człon');
    assert.equal(L.cityOf({}), 'Nieznane');
    assert.equal(L.cityOf({ address: 'Ustkaowo 5' }), 'Ustkaowo', 'nie dopasowuje fragmentu słowa');
});

test('rentowność per usługa i miasto (z kosztami i wypłatami)', () => {
    const tasks = [
        { _id: 't1', type: 'Przeprowadzka', address: 'Słupsk, A 1', finalPrice: 1000, costs: { fuel: 100, materials: 50 }, hoursWorked: 5 },
        { _id: 't2', type: 'Przeprowadzka', address: 'Ustka, B 2', finalPrice: 800, costs: { fuel: 80 }, hoursWorked: 4 },
        { _id: 't3', type: 'Opróżnianie', address: 'Słupsk, C 3', price: 600, costs: { disposal: 200 }, hoursWorked: 0 }
    ];
    const r = L.profitability(tasks, new Map([['t1', 300], ['t3', 100]]));
    assert.equal(r.total.revenue, 2400);
    assert.equal(r.total.cost, 830);
    assert.equal(r.total.profit, 1570);
    const prz = r.byService.find(g => g.key === 'Przeprowadzka');
    assert.equal(prz.count, 2);
    assert.equal(prz.profit, 1000 - 450 + 800 - 80);
    assert.equal(prz.profitPerHour, Math.round((1270 / 9) * 100) / 100);
    const sl = r.byCity.find(g => g.key === 'Słupsk');
    assert.equal(sl.revenue, 1600);
    assert.equal(sl.margin, Math.round(((1600 - 750) / 1600) * 1000) / 10);
    assert.equal(r.byService.find(g => g.key === 'Opróżnianie').profitPerHour, null, 'bez godzin — brak zysku/h');
    assert.ok(r.matrix.some(g => g.key === 'Przeprowadzka · Ustka'));
    assert.equal(L.profitability([]).total.count, 0);
});

test('lejek sprzedaży: etapy, konwersje, powody i czas odpowiedzi', () => {
    const c = new Date('2026-10-01T08:00:00Z');
    const h = n => new Date(c.getTime() + n * 3_600_000);
    const tasks = [
        { status: 'new', source: 'Wycena RevBot', type: 'Przeprowadzka', createdAt: c },
        { status: 'quoted', source: 'Wycena RevBot', type: 'Przeprowadzka', createdAt: c, quotedAt: h(1) },
        { status: 'planned', source: 'Panel klienta', type: 'Przeprowadzka', createdAt: c, quotedAt: h(3), plannedAt: h(5) },
        { status: 'completed', source: 'Panel klienta', type: 'Opróżnianie', createdAt: c, quotedAt: h(2), plannedAt: h(4), finalPrice: 900 },
        { status: 'cancelled', source: 'Wycena RevBot', type: 'Opróżnianie', createdAt: c, price: 500, clientCancelReason: 'Za drogo' },
        { status: 'cancelled', source: 'Formularz WWW', type: 'Inne', createdAt: c }
    ];
    const f = L.funnel(tasks);
    assert.deepEqual(f.stages.map(s => s.count), [6, 4, 2, 1]);
    assert.equal(f.stages[1].pct, 66.7);
    assert.deepEqual(f.steps, [66.7, 50, 50]);
    assert.equal(f.responseMedianHours, 2);
    assert.equal(f.responseUnder2h, 66.7);
    assert.equal(f.open, 1);
    assert.deepEqual(f.lost.map(l => l.reason).sort(), ['Brak odpowiedzi / bez wyceny', 'Za drogo']);
    const panel = f.bySource.find(s => s.key === 'Panel klienta');
    assert.equal(panel.conversion, 100);
    assert.equal(panel.value, 900);
});

test('dodatki: walidacja katalogu i wybór klienta z ceną z katalogu', () => {
    const a = L.validateAddon({ name: 'Kartony', price: '8', unit: 'szt.', allowQty: true, maxQty: 50, divisions: ['revhome', 'zly'], icon: 'fa-box' });
    assert.deepEqual(a.divisions, ['revhome']);
    assert.equal(a.price, 8);
    assert.equal(L.validateAddon({ name: 'Wywóz', icon: 'javascript:x' }).icon, 'fa-plus');
    const catalog = [
        { _id: 'a1', name: 'Kartony', price: 8, unit: 'szt.', allowQty: true, maxQty: 50, divisions: [] },
        { _id: 'a2', name: 'Pakowanie', price: null, unit: 'usł.', divisions: ['revhome'] },
        { _id: 'a3', name: 'Odśnieżanie dachu', price: 200, divisions: ['revwinter'] },
        { _id: 'a4', name: 'Stare', price: 1, active: false, divisions: [] }
    ];
    const pick = L.pickAddons([{ id: 'a1', qty: 999 }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' }, { id: 'a1' }, { id: 'xx' }], catalog, 'revhome');
    assert.equal(pick.items.length, 2, 'bez dodatku z innego działu, nieaktywnego i duplikatu');
    assert.equal(pick.items[0].qty, 50, 'ilość ograniczona do maks.');
    assert.equal(pick.items[0].total, 400);
    assert.equal(pick.total, 400);
    assert.equal(pick.hasQuoteOnly, true);
    assert.equal(L.pickAddons('zle', catalog).items.length, 0);
});

test('czat: tekst lub zdjęcie', () => {
    assert.equal(L.validateChat({ text: ' Dzień dobry ' }).text, 'Dzień dobry');
    assert.throws(() => L.validateChat({ text: '  ' }), /wiadomość/);
    assert.throws(() => L.validateChat({ text: 'x', photo: 'data:text/html;base64,AAA' }), /zdjęcie/);
    assert.equal(L.validateChat({ photo: 'data:image/jpeg;base64,AAAA' }).text, '');
});

test('newsletter: zapis i kampania', () => {
    const s = L.validateNewsletter({ email: 'Ola@X.PL', consent: true, topics: ['outlet', 'zly'], source: 'outlet' });
    assert.equal(s.email, 'ola@x.pl');
    assert.deepEqual(s.topics, ['outlet']);
    assert.deepEqual(L.validateNewsletter({ email: 'a@b.pl', consent: true }).topics, ['promocje', 'outlet', 'sezon']);
    assert.throws(() => L.validateNewsletter({ email: 'a@b.pl' }), /zgodę/);
    assert.throws(() => L.validateNewsletter({ email: 'a@b.pl', consent: true, website: 'x' }));

    const c = L.validateCampaign({ subject: 'Zima idzie', segment: 'topic', segmentValue: 'sezon', blocks: [{ type: 'heading', text: 'Cześć {{imie}}!' }, { type: 'text', text: 'Linia 1\nLinia 2 <b>' }, { type: 'button', text: 'Zamów', url: 'https://www.revserwis.pl/abonamenty.html' }, { type: 'zly' }] });
    assert.equal(c.blocks.length, 3);
    assert.throws(() => L.validateCampaign({ subject: 'Abc', blocks: [{ type: 'button', text: 'X', url: 'javascript:alert(1)' }] }), /http/);
    assert.throws(() => L.validateCampaign({ subject: 'Abc', blocks: [] }), /treść/);
    const out = L.renderCampaign(c, { name: 'Ola', unsubscribeUrl: 'https://www.revserwis.pl/newsletter.html?wypisz=abc' });
    assert.ok(out.html.includes('Cześć Ola!'));
    assert.ok(out.html.includes('Linia 1<br>Linia 2 &lt;b&gt;'), 'treść escapowana');
    assert.ok(out.html.includes('wypisz=abc') && out.text.includes('wypisz=abc'), 'link wypisu w HTML i tekście');
    assert.ok(L.renderCampaign(c, {}).html.includes('Cześć!'), 'bez imienia — bez pustej spacji');
});

test('deweloperzy: inwestycja i lead nabywcy', () => {
    const inv = L.validateInvestment({ name: 'Osiedle Zielone', address: 'Słupsk, Leśna', city: 'Słupsk', units: '120' });
    assert.equal(inv.units, 120);
    const base = { requestId: RID, name: 'Anna Nowak', phone: '600 100 200', services: ['Przeprowadzka', 'zle'] };
    const lead = L.validateDevLead({ ...base, investment: 'a'.repeat(24), buyerConsent: true });
    assert.deepEqual(lead.services, ['Przeprowadzka']);
    assert.throws(() => L.validateDevLead({ ...base, investment: 'a'.repeat(24) }), /zgodził/);
    const pub = L.validateDevLead({ ...base, consent: true, newsletter: true }, { publicForm: true });
    assert.equal(pub.investment, null);
    assert.equal(pub.newsletter, true);
    assert.throws(() => L.validateDevLead({ ...base, consent: true, services: [] }, { publicForm: true }), /usługę/);
    assert.throws(() => L.validateDevLead({ ...base, requestId: 'x', consent: true }, { publicForm: true }), /Odśwież/);
});
