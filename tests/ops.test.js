'use strict';

// 7.0 — magazyn (zajętość miejsc) i sortownia (stany pojemników) — czysta logika, bez bazy.
process.env.SESSION_SECRET = 'test-only-secret';
process.env.NODE_ENV = 'test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { occupancy, binState, binPayload, unitPayload } = require('../src/routes/ops')._internal;

test('magazyn: zajętość miejsc, wolne m³ i rzeczy bez miejsca', () => {
    const units = [{ _id: 'u1', name: 'Boks A1', capacity: 10 }, { _id: 'u2', name: 'Strefa', capacity: 0 }, { _id: 'u3', name: 'Stary', capacity: 50, active: false }];
    const items = [
        { unit: 'u1', volume: 4, status: 'stored' },
        { unit: 'u1', volume: 2.5, status: 'reserved' },
        { unit: null, volume: 3, status: 'stored' },
        { unit: 'u1', volume: 9, status: 'released' }
    ];
    const o = occupancy(units, items);
    const a1 = o.units.find(u => u._id === 'u1');
    assert.equal(a1.used, 4);
    assert.equal(a1.reserved, 2.5);
    assert.equal(a1.free, 3.5);
    assert.equal(a1.pct, 65);
    assert.equal(a1.items, 2);
    assert.equal(o.units.find(u => u._id === 'u2').pct, null);
    assert.equal(o.totals.capacity, 10, 'nieaktywne miejsca nie liczą się do pojemności');
    assert.equal(o.totals.used, 7);
    assert.equal(o.totals.unassigned, 3);
    assert.equal(o.totals.free, 0.5);
});

test('sortownia: status pojemnika wg progu ostrzeżenia', () => {
    assert.equal(binState({ current: 50, capacity: 100, warnAt: 80 }).status, 'ok');
    assert.equal(binState({ current: 85, capacity: 100, warnAt: 80 }).status, 'warn');
    assert.equal(binState({ current: 60, capacity: 100, warnAt: 60 }).status, 'warn');
    assert.equal(binState({ current: 100, capacity: 100, warnAt: 80 }).status, 'full');
    assert.equal(binState({ current: 5, capacity: 0 }).status, 'none');
    const s = binState({ current: 40, capacity: 100, pricePerUnit: 0.8 });
    assert.equal(s.free, 60);
    assert.equal(s.value, 32);
});

test('sortownia i magazyn: czyszczenie danych z formularzy', () => {
    const b = binPayload({ name: '  Złom  ', unit: 'kg', capacity: '-5', warnAt: '150', pricePerUnit: '0,8'.replace(',', '.') });
    assert.equal(b.name, 'Złom');
    assert.equal(b.capacity, 0);
    assert.equal(b.warnAt, 100);
    assert.equal(b.pricePerUnit, 0.8);
    assert.throws(() => binPayload({ unit: 'tony' }));
    assert.throws(() => binPayload({ capacity: 'abc' }));
    const u = unitPayload({ name: 'Boks', kind: 'garaż', capacity: '12.5' });
    assert.equal(u.kind, 'inne');
    assert.equal(u.capacity, 12.5);
});
