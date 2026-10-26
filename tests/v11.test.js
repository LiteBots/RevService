'use strict';
const test = require('node:test');
const assert = require('node:assert');
const v = require('../lib/v11-input');

test('TOTP: wektor RFC 6238 (SHA1, 59 s → 94287082, 6 cyfr = 287082)', () => {
    const secret = v.base32Encode(Buffer.from('12345678901234567890'));
    assert.strictEqual(v.totp(secret, 59_000), '287082');
    assert.strictEqual(v.totp(secret, 1111111109_000), '081804');
    assert.ok(v.verifyTotp(secret, '287082', 59_000));
    assert.ok(v.verifyTotp(secret, '287082', 59_000 + 30_000), 'tolerancja +1 krok');
    assert.ok(!v.verifyTotp(secret, '287082', 59_000 + 120_000));
    assert.ok(!v.verifyTotp(secret, 'abc', 59_000));
    assert.strictEqual(v.base32Decode(secret).toString(), '12345678901234567890');
});

test('SigV4: wektor AWS „get-vanilla”', () => {
    const r = v.signV4({
        method: 'GET', url: 'https://example.amazonaws.com/', service: 'service', region: 'us-east-1',
        accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        date: new Date('2015-08-30T12:36:00Z')
    });
    assert.strictEqual(r.signature, '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
});

test('Uprawnienia ról', () => {
    assert.ok(v.permits('admin', 'DELETE', '/settings'));
    assert.ok(v.permits('dispatcher', 'POST', '/tasks'));
    assert.ok(!v.permits('dispatcher', 'GET', '/finances'));
    assert.ok(!v.permits('dispatcher', 'PATCH', '/settings'));
    assert.ok(v.permits('accountant', 'GET', '/finances/summary'));
    assert.ok(v.permits('accountant', 'GET', '/tasks/abc'));
    assert.ok(!v.permits('accountant', 'PATCH', '/tasks/abc'));
    assert.ok(v.permits('manager', 'GET', '/v92/dispatch'));
    assert.ok(!v.permits('manager', 'GET', '/v92/receivables'));
    assert.ok(!v.permits('worker', 'GET', '/tasks'));
    assert.ok(!v.permits('dispatcher', 'GET', '/unknown'));
    assert.ok(v.isOffice('manager') && !v.isOffice('accountant'));
});

test('Trasa: optymalizacja nie jest gorsza od kolejności wejściowej', () => {
    const base = { lat: 54.4641, lon: 17.0287 };
    const pts = [{ lat: 54.58, lon: 16.86 }, { lat: 54.19, lon: 16.17 }, { lat: 54.47, lon: 17.05 }, { lat: 54.42, lon: 16.4 }];
    const r = v.optimizeRoute(base, pts);
    assert.strictEqual(r.order.length, 4);
    assert.ok(r.km <= v.routeLength(base, pts, [0, 1, 2, 3]) + 0.1);
    assert.strictEqual(r.order[0], 2, 'najpierw najbliższy punkt');
});

test('Czas pracy i konflikty', () => {
    const now = new Date('2026-05-01T12:00:00Z');
    assert.strictEqual(v.workedHours([{ start: '2026-05-01T08:00:00Z', end: '2026-05-01T10:00:00Z' }, { start: '2026-05-01T11:00:00Z' }], now), 3);
    assert.ok(v.timerRunning([{ start: 'x' }]));
    const tasks = [
        { _id: 'a', status: 'planned', dateStart: '2026-05-01T08:00:00Z', dateEnd: '2026-05-01T12:00:00Z', workers: [{ employee: 'e1', name: 'Jan' }], vehicle: 'v1' },
        { _id: 'b', status: 'planned', dateStart: '2026-05-01T10:00:00Z', workers: [{ employee: 'e1', name: 'Jan' }], vehicle: 'v1' },
        { _id: 'c', status: 'planned', dateStart: '2026-05-02T10:00:00Z', workers: [{ employee: 'e2', name: 'Ola' }] }
    ];
    const c = v.scheduleConflicts(tasks, [{ _id: 'l', employee: 'e2', from: '2026-05-02', to: '2026-05-03' }]);
    assert.deepStrictEqual(c.map(x => x.kind).sort(), ['leave', 'person', 'vehicle']);
    assert.ok(v.onLeave([{ employee: 'e2', from: '2026-05-02', to: '2026-05-03' }], 'e2', '2026-05-03'));
    assert.ok(!v.onLeave([{ employee: 'e2', from: '2026-05-02', to: '2026-05-03' }], 'e2', '2026-05-04'));
});

test('Należności i przypomnienia', () => {
    const now = new Date('2026-05-20T10:00:00Z');
    const t = { finalPrice: 500, paymentStatus: 'unpaid', completedAt: '2026-05-10T10:00:00Z' };
    assert.strictEqual(v.amountDue(t), 500);
    assert.strictEqual(v.amountDue({ ...t, paymentStatus: 'paid' }), 0);
    assert.ok(v.reminderDue(t, {}, now));
    assert.ok(!v.reminderDue({ ...t, paymentReminders: [{ at: '2026-05-18T10:00:00Z' }] }, {}, now));
    assert.ok(!v.reminderDue({ ...t, paymentReminders: [1, 2, 3].map(() => ({ at: '2026-05-01' })) }, {}, now));
    assert.strictEqual(v.agingBucket(45), '31–60 dni');
});

test('Odmiana i CID', () => {
    assert.deepStrictEqual([1, 2, 5, 12, 22, 23, 25].map(v.reviewsPlural), ['opinia', 'opinie', 'opinii', 'opinii', 'opinie', 'opinie', 'opinii']);
    assert.strictEqual(v.cidOf('https://maps.google.com/?cid=2360414228630652549'), '2360414228630652549');
});
