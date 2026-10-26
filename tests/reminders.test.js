'use strict';

process.env.TZ = 'Europe/Warsaw';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dueReminder } = require('../src/services/reminders');
const { relativeWhen } = require('../src/utils');

const H = 3_600_000;
const settings = { reminderFirstEnabled: true, reminderFirstHours: 72, reminderSecondEnabled: true, reminderSecondHours: 24, reminderStatuses: ['planned', 'progress'] };
const now = new Date('2026-10-01T08:00:00Z');
const task = (hours, extra = {}) => ({ status: 'planned', dateStart: new Date(now.getTime() + hours * H), reminders: {}, ...extra });

test('pierwsze przypomnienie 3 dni przed', () => {
    assert.equal(dueReminder(task(72), settings, now), 'first');
    assert.equal(dueReminder(task(73), settings, now), null);
    assert.equal(dueReminder(task(50), settings, now), 'first');
});

test('drugie przypomnienie 24 h przed i brak duplikatów', () => {
    assert.equal(dueReminder(task(24), settings, now), 'second');
    assert.equal(dueReminder(task(2), settings, now), 'second');
    assert.equal(dueReminder(task(20, { reminders: { secondSentAt: now } }), settings, now), null);
    assert.equal(dueReminder(task(60, { reminders: { firstSentAt: now } }), settings, now), null);
});

test('zlecenie dodane na ostatnią chwilę nie dostaje dwóch pushy pod rząd', () => {
    assert.equal(dueReminder(task(30), settings, now), null);
    assert.equal(dueReminder(task(23), settings, now), 'second');
});

test('pomija przeszłe, anulowane i wyłączone przypomnienia', () => {
    assert.equal(dueReminder(task(-1), settings, now), null);
    assert.equal(dueReminder(task(10, { status: 'cancelled' }), settings, now), null);
    assert.equal(dueReminder(task(10, { status: 'new' }), settings, now), null);
    assert.equal(dueReminder(task(10), { ...settings, reminderSecondEnabled: false }, now), null);
    assert.equal(dueReminder(task(60), { ...settings, reminderFirstEnabled: false }, now), null);
});

test('czytelny opis terminu w strefie Europe/Warsaw', () => {
    assert.equal(relativeWhen(new Date('2026-10-02T06:00:00Z'), now), 'jutro o 08:00');
    assert.equal(relativeWhen(new Date('2026-10-01T13:30:00Z'), now), 'dziś o 15:30');
    assert.match(relativeWhen(new Date('2026-10-04T06:00:00Z'), now), /^za 3 dni/);
});
