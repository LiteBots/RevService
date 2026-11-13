'use strict';

/* RevSerwis 13 — szczegółowy formularz wyceny (lib/quote-v13.js), strony i przekierowania. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Q = require('../lib/quote-v13');

const base = {
    requestId: 'abcdefghijklmnop1234', consent: true,
    contact: { name: 'Anna Kowalska', phone: '600 123 456', email: 'a@b.pl' },
    schedule: { date: '2026-11-22', time: 'Rano (7–11)', flexible: true }, description: 'Wąska klatka', photos: []
};
const move = {
    ...base, service: 'przeprowadzka', answers: { scope: 'Mieszkanie', area: '62' },
    from: { address: 'ul. Wojska Polskiego 12/8, Słupsk', floor: 4, lift: 'Brak windy', parking: '10–30 m' },
    to: { address: 'ul. Grunwaldzka 140/3, Gdańsk', floor: 2, lift: 'Winda osobowa', parking: 'do 10 m' },
    items: [{ room: 'Salon', name: 'Kanapa', qty: 1, flags: ['ciężkie'] }, { room: 'Sypialnia', name: 'Szafa 3-drzwiowa', qty: 1, flags: ['do rozkręcenia', 'xxx'] }, { room: 'Inne', name: 'Pianino', qty: 1, flags: ['ciężkie'] }, { room: 'Inne', name: 'Kartony', qty: 25 }],
    extras: ['Demontaż i montaż mebli', 'Nie ma takiej opcji']
};

test('13.0: przeprowadzka — pełna lista rzeczy, piętra, windy, podsumowanie dla RevMi', () => {
    const q = Q.validateQuoteV13(move);
    assert.equal(q.form.items.length, 4);
    assert.deepEqual(q.form.items[1].flags, ['do rozkręcenia'], 'nieznane oznaczenia odrzucone');
    assert.deepEqual(q.form.extras, ['Demontaż i montaż mebli']);
    assert.equal(q.form.from.floor, 4);
    assert.equal(q.form.answers.area, 62);
    assert.equal(Q.suggestedCrew(q.form), 3);
    const d = Q.detailsMap(q);
    assert.match(d['Skąd'], /4\. piętro, Brak windy, parking 10–30 m/);
    assert.match(d['Rzeczy (razem)'], /28 szt\./);
    const desc = Q.descriptionText(q);
    assert.match(desc, /\[Sypialnia\]\n• 1 × Szafa 3-drzwiowa \(do rozkręcenia\)/);
    assert.match(desc, /25 × Kartony/);
});

test('13.0: odpady, rozbiórki i przewóz osób', () => {
    const w = Q.validateQuoteV13({ ...base, service: 'odpady', answers: { where: 'W piwnicy / garażu', volume: '1–3 m³' }, from: { address: 'ul. Długa 5, Ustka', floor: -1, lift: 'Brak windy' }, waste: [{ id: 'gabaryty', qty: '3', note: 'wersalka' }, { id: 'agd', qty: 1 }, { id: 'nieznane', qty: 1 }] });
    assert.deepEqual(w.form.waste.map(x => x.id), ['gabaryty', 'agd']);
    const r = Q.validateQuoteV13({ ...base, service: 'rozbiorki', answers: { place: ['Łazienka'], debris: 'Tak, po Waszej stronie' }, from: { address: 'ul. Kościuszki 1, Słupsk', floor: 2, lift: 'Brak windy' }, works: [{ id: 'plytki', qty: '24,5' }, { id: 'sanitariaty', qty: 3 }] });
    assert.equal(r.form.works[0].qty, 24.5);
    assert.equal(r.form.works[0].unit, 'm²');
    const p = Q.validateQuoteV13({ ...base, service: 'przewoz', answers: { purpose: 'Lotnisko', passengers: '5', time: '04:30' }, from: { address: 'Słupsk, Plac Zwycięstwa 3' }, to: { address: 'Lotnisko Gdańsk Rębiechowo' } });
    assert.equal(p.form.answers.passengers, 5);
    assert.equal(Q.suggestedCrew(p.form), 1);
});

test('13.0: walidacja odrzuca niepełne zgłoszenia', () => {
    const cases = [
        [{ ...move, items: [] }, /przynajmniej jedną rzecz/],
        [{ ...move, from: { ...move.from, floor: '' } }, /piętro/],
        [{ ...move, to: { ...move.to, lift: '' } }, /winda/],
        [{ ...move, contact: { ...move.contact, phone: '12' } }, /numer telefonu/],
        [{ ...move, consent: false }, /zgodę/],
        [{ ...move, answers: {} }, /Rodzaj przeprowadzki/],
        [{ ...move, service: 'odsniezanie' }, /Wybierz usługę/],
        [{ ...move, website: 'bot' }, /Nie udało się/],
        [{ ...move, photos: ['data:text/html;base64,AAAA'] }, /zdjęcia/],
        [JSON.parse('{"__proto__":{"x":1}}'), /Nieprawidłowe/]
    ];
    for (const [input, re] of cases) assert.throws(() => Q.validateQuoteV13(input), re);
});

test('13.0: strony — 6 usług × 30 miast, huby miast, sitemap, brak usuniętych usług', () => {
    const pub = path.join(__dirname, '..', 'Public');
    const cities = require('../scripts/site-v13/cities.json').order;
    const sitemap = fs.readFileSync(path.join(pub, 'sitemap.xml'), 'utf8');
    for (const prefix of ['przeprowadzki', 'oproznianie-i-wywoz', 'transport-rzeczy', 'odbior-odpadow', 'rozbiorki', 'przewozy-osob', 'uslugi']) {
        for (const c of cities) {
            const f = `${prefix}-${c}.html`;
            assert.ok(fs.existsSync(path.join(pub, f)), f);
            assert.ok(sitemap.includes('https://www.revserwis.pl/' + f), 'sitemap ' + f);
        }
    }
    for (const gone of ['outlet.html', 'abonamenty.html', 'kariera.html', 'partnerzy.html', 'odsniezanie-slupsk.html', 'revhome.html']) assert.ok(!fs.existsSync(path.join(pub, gone)), gone);
    const index = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
    for (const s of ['przeprowadzki.html', 'oproznianie.html', 'transport.html', 'odbior-odpadow.html', 'rozbiorki.html', 'przewozy-osob.html', 'po-drodze.html', 'obszar-dzialania.html', 'dla-firm.html']) assert.ok(index.includes('/' + s), 'index → ' + s);
    assert.ok(!/RevBot|abonament|RevOutlet/i.test(index), 'bez usuniętych modułów na stronie głównej');
});
