'use strict';

// Testy czystej logiki RevMi 4.0 — bez połączenia z bazą.
process.env.SESSION_SECRET = 'test-only-secret';
process.env.NODE_ENV = 'test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateContact } = require('../lib/contact-input');
const { DIVISIONS, isDivision, divisionName, REDIRECTS } = require('../lib/divisions');
const { offerTotals } = require('../src/models');
const business = require('../src/routes/business')._internal;
const notes = require('../src/routes/notes')._internal;
const mail = require('../src/services/mail');

const contact = extra => ({ kind: 'person', name: 'Jan Kowalski', email: 'Jan@Example.PL', message: 'Dzień dobry, mam pytanie o usługę.', consent: true, requestId: 'abcdefghijklmnop1234', ...extra });

test('17 działów, unikalne slugi, przekierowania na istniejące działy', () => {
    assert.equal(DIVISIONS.length, 17);
    assert.equal(new Set(DIVISIONS.map(d => d.slug)).size, 17);
    assert.ok(isDivision('revgarden') && !isDivision('xyz'));
    assert.equal(divisionName('revwinter'), 'RevWinter');
    for (const target of Object.values(REDIRECTS)) assert.ok(isDivision(target.replace('.html', '')), target);
});

test('formularz kontaktowy: poprawne dane osoby i firmy', () => {
    const person = validateContact(contact({ phone: '735 396 534' }));
    assert.equal(person.email, 'jan@example.pl');
    assert.equal(person.phone, '735396534');
    assert.equal(person.company, '');
    const company = validateContact(contact({ kind: 'company', company: 'Firma ABC', nip: '839 000 00 00', topic: 'Współpraca B2B', division: 'revb2b' }));
    assert.equal(company.kind, 'company');
    assert.equal(company.nip, '8390000000');
    assert.equal(company.division, 'revb2b');
    assert.equal(validateContact(contact({ topic: 'coś innego', division: 'nieznany' })).topic, 'Pytanie ogólne');
});

test('formularz kontaktowy: odrzuca błędne dane', () => {
    for (const change of [{ consent: false }, { email: 'brak' }, { message: 'krótko' }, { website: 'spam' }, { phone: 'abc' }, { kind: 'company', company: '' }, { requestId: 'x' }, { name: 'J' }, { message: 'x'.repeat(5001) }]) {
        assert.throws(() => validateContact(contact(change)), /./, JSON.stringify(change));
    }
});

test('oferta: suma netto, VAT i brutto z rabatem', () => {
    assert.deepEqual(offerTotals([{ qty: 2, price: 100, vatRate: 23 }, { qty: 1, price: 50, vatRate: 8 }], 10), { net: 225, vat: 45, gross: 270 });
    assert.deepEqual(offerTotals([], 0), { net: 0, vat: 0, gross: 0 });
    const payload = business.offerPayload({ title: 'X', items: [{ name: 'Koszenie', qty: '3', price: '120', vatRate: '8' }, { name: '' }, { name: 'Y', vatRate: 7 }], discount: 150, division: 'zly' });
    assert.equal(payload.items.length, 2);
    assert.equal(payload.items[0].qty, 3);
    assert.equal(payload.items[1].vatRate, 23);
    assert.equal(payload.discount, 100);
    assert.equal(payload.division, '');
});

test('abonament: terminy rozliczeń', () => {
    const a = business.nextBillingDate(new Date(2026, 9, 6), 10);
    assert.equal(a.getMonth(), 9);
    assert.equal(a.getDate(), 10);
    assert.equal(business.nextBillingDate(new Date(2026, 9, 12), 10).getMonth(), 10);
    assert.equal(business.nextBillingDate(new Date(2026, 9, 10, 15), 10).getMonth(), 9);
    const next = business.followingBillingDate(new Date(2026, 11, 10), 31);
    assert.equal(next.getFullYear(), 2027);
    assert.equal(next.getDate(), 28);
    assert.deepEqual(business.contractPayload({ services: 'Koszenie, Odśnieżanie\nMycie kostki' }).services, ['Koszenie', 'Odśnieżanie', 'Mycie kostki']);
});

test('notatnik: czyszczenie danych i uprawnienia', () => {
    const data = notes.payload({ tags: '#pilne, klient, pilne', color: 'neon', checklist: ['a', { text: 'b', done: true }, ''], visibility: 'team', reminderAt: '2026-10-10T08:00:00Z' });
    assert.deepEqual(data.tags, ['pilne', 'klient']);
    assert.equal(data.color, 'default');
    assert.equal(data.checklist.length, 2);
    assert.equal(data.checklist[1].done, true);
    assert.equal(data.visibility, 'team');
    assert.equal(data.reminderSentAt, null);
    assert.throws(() => notes.payload({ reminderAt: 'nie-data' }));
    const worker = { role: 'worker', employeeId: 'emp2' };
    assert.equal(notes.canEdit({ ownerKey: 'emp1', visibility: 'team' }, worker), true);
    assert.equal(notes.canEdit({ ownerKey: 'emp1', visibility: 'private' }, worker), false);
    assert.equal(notes.canDelete({ ownerKey: 'emp1', visibility: 'team' }, worker), false);
    assert.equal(notes.canDelete({ ownerKey: 'emp1', visibility: 'team' }, { role: 'admin' }), true);
});

test('e-mail z formularza: adresat, odpowiedź do klienta, bez wstrzykiwania HTML', () => {
    const email = mail.contactEmail({ _id: 'abc', kind: 'company', name: 'Jan <b>', company: 'Firma', email: 'jan@firma.pl', topic: 'Współpraca B2B', division: 'revb2b', message: 'Treść <script>alert(1)</script>' });
    assert.equal(email.to, 'kontakt@revserwis.pl');
    assert.equal(email.replyTo, 'jan@firma.pl');
    assert.ok(email.html.includes('RevB2B'));
    assert.ok(!email.html.includes('<script>'));
    assert.ok(email.subject.startsWith('[Kontakt] Współpraca B2B'));
});
