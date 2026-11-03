'use strict';

// RevMi 2.0.0 — testy czystej logiki (prognoza, budżety, czas pracy, ranking, zarobki, pakiety, logowanie).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../lib/v2');

const d = (s) => new Date(s);

test('okresy: tydzień od poniedziałku, miesiąc, przesunięcie', () => {
    const now = d('2026-11-04T12:00:00'); // środa
    const w = V.periodRange('week', now);
    assert.equal(V.dayKey(w.from), '2026-11-02');
    assert.equal(V.dayKey(w.to), '2026-11-09');
    const next = V.periodRange('week', now, 1);
    assert.equal(V.dayKey(next.from), '2026-11-09');
    const m = V.periodRange('month', now);
    assert.equal(V.dayKey(m.from), '2026-11-01');
    assert.equal(V.dayKey(m.to), '2026-12-01');
    const sunday = V.periodRange('week', d('2026-11-08T22:00:00'));
    assert.equal(V.dayKey(sunday.from), '2026-11-02');
});

test('prognoza: sumuje zaplanowane, w realizacji i zakończone, pomija wyceny i anulowane', () => {
    const range = V.periodRange('week', d('2026-11-04T12:00:00'));
    const tasks = [
        { status: 'completed', dateStart: d('2026-11-02T08:00:00'), price: 1000, finalPrice: 1200 },
        { status: 'planned', dateStart: d('2026-11-05T08:00:00'), price: 800 },
        { status: 'progress', dateStart: d('2026-11-04T09:00:00'), price: 500, finalPrice: null },
        { status: 'quoted', dateStart: d('2026-11-05T08:00:00'), price: 9999 },
        { status: 'cancelled', dateStart: d('2026-11-05T08:00:00'), price: 9999 },
        { status: 'planned', dateStart: d('2026-11-10T08:00:00'), price: 9999 },
        { status: 'planned', dateStart: d('2026-11-06T08:00:00'), price: 0 }
    ];
    const f = V.forecast(tasks, range);
    assert.equal(f.total, 2500);
    assert.equal(f.done, 1200);
    assert.equal(f.planned, 1300);
    assert.equal(f.count, 4);
    assert.equal(f.doneCount, 1);
    assert.equal(f.unpriced, 1);
    const net = V.forecast(tasks, range, { pricesAreGross: false, vatRate: 8 });
    assert.equal(net.total, 2700);
});

test('prognoza: seria tygodni i oddziały', () => {
    const now = d('2026-11-04T12:00:00');
    const tasks = [
        { status: 'completed', dateStart: d('2026-10-27T08:00:00'), price: 300, branch: 'a' },
        { status: 'planned', dateStart: d('2026-11-11T08:00:00'), price: 700 }
    ];
    const s = V.weeklySeries(tasks, now, { back: 1, ahead: 1 });
    assert.equal(s.length, 3);
    assert.equal(s[0].done, 300);
    assert.equal(s[1].current, true);
    assert.equal(s[2].planned, 700);
    const b = V.byBranch(tasks, { from: d('2026-10-01'), to: d('2026-12-01') }, [{ _id: 'a', name: 'Słupsk' }]);
    assert.deepEqual(b.map(x => [x.name, x.total]), [['Słupsk', 300], ['Bez oddziału', 700]]);
});

test('budżety: dopasowanie kategorii i poziomy alertów', () => {
    assert.equal(V.budgetCategory({ category: 'Paliwo' }), 'Paliwo');
    assert.equal(V.budgetCategory({ category: 'Tankowanie Orlen' }), 'Paliwo');
    assert.equal(V.budgetCategory({ category: 'Utylizacja' }), 'Utylizacja');
    assert.equal(V.budgetCategory({ category: 'cokolwiek', source: 'payroll' }), 'Wypłaty');
    assert.equal(V.budgetCategory({ category: 'Serwis busa' }), 'Naprawy floty');
    assert.equal(V.budgetCategory({ category: 'Kawa' }), 'Inne');
    const st = V.budgetStatus(
        [{ category: 'Paliwo', amount: 1000 }, { category: 'Utylizacja', amount: 500, branch: 'b1' }, { category: 'Materiały', amount: 1000 }],
        [{ category: 'Paliwo', price: 850 }, { category: 'Utylizacja', price: 600, branch: 'b1' }, { category: 'Utylizacja', price: 999, branch: 'b2' }, { category: 'Folia', price: 100 }]
    );
    assert.deepEqual(st.map(s => [s.category, s.spent, s.level]), [['Paliwo', 850, 'warn'], ['Utylizacja', 600, 'over'], ['Materiały', 100, 'ok']]);
    assert.equal(st[1].left, -100);
});

test('czas pracy: odcinki, przerwy, stan, dozwolone przejścia', () => {
    const ev = [
        { type: 'start', at: d('2026-11-04T07:00:00') },
        { type: 'arrive', at: d('2026-11-04T08:00:00') },
        { type: 'pause', at: d('2026-11-04T10:00:00') },
        { type: 'resume', at: d('2026-11-04T10:15:00') },
        { type: 'stop', at: d('2026-11-04T15:15:00') }
    ];
    const t = V.timeTotals(ev);
    assert.equal(t.minutes, 480);
    assert.equal(t.breakMinutes, 15);
    assert.equal(t.state, 'off');
    const open = V.timeTotals(ev.slice(0, 2), d('2026-11-04T09:30:00'));
    assert.equal(open.minutes, 150);
    assert.equal(open.state, 'working');
    assert.equal(V.canTimeEvent('off', 'start'), true);
    assert.equal(V.canTimeEvent('off', 'resume'), false);
    assert.equal(V.canTimeEvent('paused', 'resume'), true);
    assert.equal(V.canTimeEvent('working', 'start'), false);
    assert.equal(V.canTimeEvent('working', 'arrive'), true);
});

test('GPS: odległość i strefa wokół adresu', () => {
    const slupsk = { lat: 54.4641, lon: 17.0287 };
    const near = { lat: 54.4649, lon: 17.0287, accuracy: 20 };
    const ustka = { lat: 54.5805, lon: 16.8616 };
    assert.ok(V.distanceMeters(slupsk, near) < 100);
    assert.ok(V.distanceMeters(slupsk, ustka) > 15000);
    assert.equal(V.withinGeofence(near, slupsk, 150), true);
    assert.equal(V.withinGeofence(ustka, slupsk, 150), false);
    assert.equal(V.distanceMeters(slupsk, null), Infinity);
});

test('ranking: punkty, odznaki i kolejność', () => {
    const emp = [{ _id: 'k', name: 'Kacper' }, { _id: 'm', name: 'Michał' }, { _id: 'x', name: 'Bez zleceń' }];
    const base = { status: 'completed', dateStart: d('2026-11-04T08:00:00') };
    const tasks = [
        { ...base, _id: 't1', workers: [{ employee: 'k' }, { employee: 'm' }], clientRating: 5, startedAt: d('2026-11-04T08:05:00'), mediaCount: { after: 2 }, costs: { reportedAt: d('2026-11-04') } },
        { ...base, _id: 't2', workers: [{ employee: 'k' }], clientRating: 4, startedAt: d('2026-11-04T09:00:00') },
        { ...base, _id: 't3', workers: [{ employee: 'm' }], complaint: true, startedAt: d('2026-11-04T08:00:00') },
        { ...base, _id: 't4', status: 'planned', workers: [{ employee: 'k' }], clientRating: 5 }
    ];
    const r = V.ranking(tasks, emp, {}, { arrivals: new Map([['t2', d('2026-11-04T08:10:00')]]) });
    const k = r.find(x => x.name === 'Kacper');
    const m = r.find(x => x.name === 'Michał');
    assert.equal(k.points, 20 + 10 + 5 + 8 + 10); // t1: 5★ + na czas + raport; t2: 4★ + na czas (GPS)
    assert.equal(m.points, 20 + 10 + 5 + 10 - 30);
    assert.equal(k.place, 1);
    assert.equal(r.some(x => x.name === 'Bez zleceń'), false);
    assert.equal(k.avgRating, 4.5);
});

test('zarobki: rozliczenia + szacunek wg stawki', () => {
    const hourly = V.earnings({ payRate: 25, payRateUnit: 'hour' }, {
        payEntries: [{ kind: 'bonus', amount: 200 }, { kind: 'advance', amount: 300 }],
        timeEntries: [{ minutes: 480 }, { minutes: 450 }]
    });
    assert.equal(hourly.hours, 15.5);
    assert.equal(hourly.estimate, 387.5);
    assert.equal(hourly.total, 287.5);
    const perTask = V.earnings({ payRate: 150, payRateUnit: 'task' }, {
        payEntries: [{ kind: 'pay', amount: 150, task: 't1' }],
        tasks: [{ _id: 't1', status: 'completed' }, { _id: 't2', status: 'completed' }, { _id: 't3', status: 'planned' }]
    });
    assert.equal(perTask.estimate, 150);
    assert.equal(perTask.total, 300);
    assert.equal(perTask.tasks, 2);
});

test('pakiety: wykorzystanie limitu i kwoty', () => {
    const sub = { _id: 's1', periodStart: d('2026-11-01'), renewDate: d('2026-12-01'), serviceLimit: 2 };
    const tasks = [
        { packageSub: 's1', status: 'completed', dateStart: d('2026-11-03') },
        { packageSub: 's1', status: 'planned', dateStart: d('2026-11-20') },
        { packageSub: 's1', status: 'planned', dateStart: d('2026-11-25') },
        { packageSub: 's1', status: 'cancelled', dateStart: d('2026-11-26') },
        { packageSub: 's1', status: 'planned', dateStart: d('2026-12-02') },
        { packageSub: 's2', status: 'planned', dateStart: d('2026-11-05') }
    ];
    assert.deepEqual(V.packageUsage(sub, tasks), { used: 3, limit: 2, left: 0, over: 1, pct: 100 });
    assert.equal(V.packageUsage({ ...sub, serviceLimit: null }, tasks).limit, null);
    assert.equal(V.grossOf(1000, 23), 1230);
    assert.equal(V.monthlyNet({ priceNet: 3000, period: 'quarter' }), 1000);
    assert.equal(V.dayKey(V.addPeriod(d('2026-01-31T12:00:00'), 'month')).slice(0, 7), '2026-02');
});

test('logowanie: hasło, login, urządzenie, szablon SMS', () => {
    assert.throws(() => V.validatePassword('krotkie1'.slice(0, 6)), /8 znaków/);
    assert.throws(() => V.validatePassword('samelitery'), /litery i cyfry/);
    assert.equal(V.validatePassword('Rev2026serwis'), 'Rev2026serwis');
    assert.deepEqual(V.normalizeLogin(' Kacper@RevSerwis.PL '), { kind: 'email', value: 'kacper@revserwis.pl' });
    assert.deepEqual(V.normalizeLogin('+48 735 396 534'), { kind: 'phone', value: '735396534' });
    assert.throws(() => V.normalizeLogin('12345'));
    assert.equal(V.deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17.0 Mobile Safari/604.1'), 'iPhone · Safari');
    assert.equal(V.deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'), 'Mac · Chrome');
    assert.equal(V.fillTemplate('Jutro {godzina}, {adres}. {link}', { godzina: '8:30', adres: 'Długa 12', link: 'x.pl/t/1' }), 'Jutro 8:30, Długa 12. x.pl/t/1');
    assert.equal(V.fillTemplate('Jutro {usluga}, {adres}. Link', { usluga: 'odśnieżanie', adres: '' }), 'Jutro odśnieżanie. Link');
});
