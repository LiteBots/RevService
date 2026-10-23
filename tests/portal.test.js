'use strict';

// RevSerwis 9.0 — testy czystej logiki nowych modułów (bez bazy i paczek npm).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/portal-input');

const RID = 'abcdefghijklmnop1234';
const future = (days = 3) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test('rejestracja: poprawne konto osoby i firmy', () => {
    const person = P.validateRegister({ email: ' Jan@Example.PL ', password: 'tajne123', name: 'Jan Kowalski', phone: '735 396 534', consent: true });
    assert.equal(person.email, 'jan@example.pl');
    assert.equal(person.phone, '735396534');
    assert.equal(person.kind, 'person');
    assert.equal(person.company, '');
    const firm = P.validateRegister({ email: 'biuro@hotel.pl', password: 'Hotel2026', name: 'Anna Nowak', kind: 'company', company: 'Hotel Bałtyk', nip: '839-326-92-74', consent: true, marketing: true });
    assert.equal(firm.kind, 'company');
    assert.equal(firm.nip, '8393269274');
    assert.equal(firm.marketingConsent, true);
});

test('rejestracja: odrzuca słabe hasło, brak zgody, zły e-mail i NIP, bota', () => {
    const ok = { email: 'jan@example.pl', password: 'tajne123', name: 'Jan Kowalski', consent: true };
    for (const change of [{ password: 'krotkie' }, { password: '12345678' }, { password: 'samelitery' }, { consent: false }, { email: 'jan@' }, { name: 'J' },
        { kind: 'company', company: '' }, { kind: 'company', company: 'Firma', nip: '123' }, { website: 'http://spam' }, { password: 'x1'.repeat(70) }]) {
        assert.throws(() => P.validateRegister({ ...ok, ...change }), /./, JSON.stringify(change));
    }
});

test('rejestracja: prośba o panel B2B tylko dla firmy', () => {
    const base = { email: 'h@hotel.pl', password: 'Hotel2026', name: 'Anna Nowak', consent: true };
    assert.deepEqual(P.validateRegister({ ...base, kind: 'company', company: 'Hotel Bałtyk', b2bRequest: 'hotel' }).accessRequested, ['hotel']);
    assert.deepEqual(P.validateRegister({ ...base, kind: 'company', company: 'Biuro X', b2bRequest: 'admin' }).accessRequested, []);
    assert.throws(() => P.validateRegister({ ...base, b2bRequest: 'partner' }), /firmowego/);
});

test('logowanie i zmiana hasła', () => {
    assert.equal(P.validateLogin({ email: 'A@B.PL', password: 'x' }).email, 'a@b.pl');
    assert.throws(() => P.validateLogin({ email: 'a@b.pl', password: '' }));
    assert.throws(() => P.validatePasswordChange({ current: 'tajne123', next: 'tajne123' }), /różnić/);
    assert.equal(P.validatePasswordChange({ current: 'stare123', next: 'nowe12345' }).next, 'nowe12345');
});

test('profil: tylko przesłane pola, kod pocztowy, zgody', () => {
    const p = P.validateProfile({ city: 'Słupsk', postalCode: '76-200', notifySms: false });
    assert.deepEqual(p, { city: 'Słupsk', postalCode: '76-200', notifySms: false });
    assert.throws(() => P.validateProfile({ postalCode: '7620' }));
});

test('zamówienie z panelu klienta', () => {
    const o = P.validateClientOrder({ requestId: RID, service: 'Przeprowadzka', division: 'revhome', address: 'Słupsk, Długa 1', addressTo: 'Ustka, Morska 2', date: future(), description: 'Mieszkanie 2 pokoje, 3 piętro bez windy.' });
    assert.equal(o.division, 'revhome');
    assert.equal(o.photos.length, 0);
    assert.equal(o.quoteType, 'free');
    assert.throws(() => P.validateClientOrder({ ...o, requestId: RID, date: '2020-01-01' }), /przeszłości/);
    assert.throws(() => P.validateClientOrder({ requestId: RID, service: 'X', address: 'abc', description: 'krótko' }));
    assert.throws(() => P.validateClientOrder({ requestId: RID, service: 'Przeprowadzka', address: 'Słupsk', description: 'Opis zlecenia długi', photos: ['data:text/html;base64,AAAA'] }), /zdjęcia/);
    assert.equal(P.validateClientOrder({ requestId: RID, service: 'Inne', division: 'zly', address: 'Słupsk', description: 'Opis zlecenia długi' }).division, '');
});

test('RevStorage: zamówienie wydania z magazynu', () => {
    const id = 'a'.repeat(24);
    const r = P.validateStoragePickup({ items: [id, id], mode: 'delivery', address: 'Słupsk, Polna 3', date: future() });
    assert.deepEqual(r.items, [id]);
    assert.equal(P.validateStoragePickup({ items: [id], mode: 'pickup', date: future() }).address, '');
    assert.throws(() => P.validateStoragePickup({ items: [], date: future() }));
    assert.throws(() => P.validateStoragePickup({ items: ['zly'], date: future() }));
});

test('RevOutlet: przedmiot i rezerwacja', () => {
    const item = P.validateOutletItem({ title: 'Komoda dębowa', price: '350,50', oldPrice: 300, category: 'Meble', condition: 'Bardzo dobry', status: 'available' });
    assert.equal(item.price, 350.5);
    assert.equal(item.oldPrice, null, 'stara cena niższa od nowej jest pomijana');
    assert.equal(item.quantity, 1);
    assert.equal(P.validateOutletItem({ title: 'X2', price: 1, category: 'Zła', status: 'zly' }).category, 'Inne');
    assert.throws(() => P.validateOutletItem({ title: 'Komoda', price: -1 }));

    const input = { requestId: RID, item: 'b'.repeat(24), name: 'Ola Nowak', phone: '+48 600 100 200', delivery: 'delivery', address: 'Ustka, Polna 1', consent: true };
    assert.equal(P.validateOutletOrder(input).phone, '+48600100200');
    assert.throws(() => P.validateOutletOrder({ ...input, address: '' }), /Adres/);
    assert.equal(P.validateOutletOrder({ ...input, delivery: 'pickup', address: 'x' }).address, '');
    assert.throws(() => P.validateOutletOrder({ ...input, consent: false }), /zgodę/);
});

test('RevPowrót: kurs, cena i rezerwacja miejsca', () => {
    const trip = P.validateTrip({ from: 'Kraków', to: 'Słupsk', date: future(5), capacityM3: '12', pricePerM3: 90, minPrice: 250, discountPct: 40 });
    assert.equal(trip.capacityM3, 12);
    assert.equal(P.tripPrice(trip, 1), 250, 'cena minimalna');
    assert.equal(P.tripPrice(trip, 4), 360);
    assert.throws(() => P.validateTrip({ from: 'A', to: 'Słupsk', date: future(), capacityM3: 10 }));
    assert.throws(() => P.validateTrip({ from: 'Kraków', to: 'Słupsk', date: future(), capacityM3: 0 }));

    const base = { requestId: RID, trip: 'c'.repeat(24), name: 'Piotr Lis', phone: '600100200', volumeM3: 3, pickupAddress: 'Kraków, Rynek 1', dropAddress: 'Słupsk, Długa 2', items: 'Szafa i 10 kartonów', consent: true };
    assert.equal(P.validateTripBooking(base, { remainingM3: 5 }).volumeM3, 3);
    assert.throws(() => P.validateTripBooking(base, { remainingM3: 2 }), /zostało tylko 2/);
    assert.throws(() => P.validateTripBooking({ ...base, volumeM3: 0 }));
});

test('abonamenty: plan i zgłoszenie', () => {
    const plan = P.validatePlan({ slug: 'Winter-Care', name: 'Winter Care', price: 690, billingPeriod: 'season', features: 'Odśnieżanie\n\nPosypywanie', division: 'revwinter' });
    assert.equal(plan.slug, 'winter-care');
    assert.deepEqual(plan.features, ['Odśnieżanie', 'Posypywanie']);
    assert.equal(plan.billingPeriod, 'season');
    assert.throws(() => P.validatePlan({ slug: 'zły slug!', name: 'X', price: 1 }));
    assert.throws(() => P.validateSubscribe({ plan: 'd'.repeat(24), address: 'Słupsk' }), /warunki/);
    assert.equal(P.validateSubscribe({ plan: 'd'.repeat(24), address: 'Słupsk, Leśna 4', consent: true }).address, 'Słupsk, Leśna 4');
});

test('portal partnerski: polecenie klienta i zgłoszenie biura', () => {
    const r = P.validateReferral({ requestId: RID, clientName: 'Maria Wiśniewska', clientPhone: '600 200 300', propertyAddress: 'Słupsk, Szczecińska 10/4', services: ['Przeprowadzka', 'Coś obcego', 'Przeprowadzka'], clientConsent: true });
    assert.deepEqual(r.services, ['Przeprowadzka']);
    assert.throws(() => P.validateReferral({ ...r, requestId: RID, services: ['Przeprowadzka'], clientConsent: false }), /zgodził/);
    assert.throws(() => P.validateReferral({ requestId: RID, clientName: 'Maria', clientPhone: '600200300', propertyAddress: 'Słupsk 1', services: [], clientConsent: true }), /usługę/);
    assert.throws(() => P.validateReferral({ ...r, requestId: RID, clientConsent: true, listingUrl: 'javascript:alert(1)' }), /http/);
    assert.equal(P.validateReferral({ ...r, requestId: RID, clientConsent: true, listingUrl: 'https://otodom.pl/oferta/1' }).listingUrl, 'https://otodom.pl/oferta/1');
    const app = P.validatePartnerApplication({ requestId: RID, agencyName: 'Nieruchomości Pomorze', name: 'Adam Kot', email: 'adam@np.pl', phone: '600300400', city: 'Słupsk', agents: '6', consent: true });
    assert.equal(app.agents, 6);
});

test('hotele: obiekt, stała trasa i jej terminy', () => {
    assert.throws(() => P.validateHotelProperty({ name: 'H', address: 'x' }));
    const route = P.validateHotelRoute({ property: 'e'.repeat(24), service: 'Dostawa towaru', weekdays: [5, 1, 1, 9], time: '07:30', description: 'Pościel z pralni' });
    assert.deepEqual(route.weekdays, [1, 5]);
    assert.throws(() => P.validateHotelRoute({ ...route, time: '25:00' }), /GG:MM/);
    assert.throws(() => P.validateHotelRoute({ ...route, weekdays: [] }), /dzień/);

    // Poniedziałek 2 listopada 2026, 06:00 → okno 14 dni: pon/pt × 2 tygodnie = 4 terminy
    const from = new Date(2026, 10, 2, 6, 0);
    const dates = P.routeOccurrences({ weekdays: [1, 5], time: '07:30' }, from, 14);
    assert.equal(dates.length, 4);
    assert.equal(dates[0].getDay(), 1);
    assert.equal(dates[0].getHours(), 7);
    assert.equal(dates[0].getMinutes(), 30);
    assert.equal(dates[1].getDay(), 5);
    // Termin dzisiejszy, który już minął, jest pomijany
    assert.equal(P.routeOccurrences({ weekdays: [1], time: '05:00' }, from, 7).length, 0);
    // Zakres dat trasy
    assert.equal(P.routeOccurrences({ weekdays: [1, 5], time: '07:30', endDate: new Date(2026, 10, 6) }, from, 14).length, 2);
});

test('rekrutacja: dział, marketing, franczyza', () => {
    const base = { requestId: RID, name: 'Kamil Zieliński', email: 'kamil@x.pl', phone: '600400500', city: 'Słupsk', consent: true };
    const dept = P.validateApplication({ ...base, track: 'dzial', department: 'Przeprowadzki', licenses: ['B', 'C', 'X'], availability: 'Weekendy' });
    assert.deepEqual(dept.licenses, ['B', 'C']);
    assert.equal(dept.franchise, null);
    assert.throws(() => P.validateApplication({ ...base, track: 'dzial', department: 'Nieistniejący' }), /dział/);
    assert.equal(P.validateApplication({ ...base, track: 'marketing', role: 'Grafika i wideo' }).role, 'Grafika i wideo');
    const fr = P.validateApplication({ ...base, track: 'franczyza', franchise: { city: 'Gdańsk', budget: '50 000 – 100 000 zł', hasVehicle: true } });
    assert.equal(fr.franchise.city, 'Gdańsk');
    assert.equal(fr.franchise.hasVehicle, true);
    assert.equal(fr.franchise.hasCompany, false);
    assert.throws(() => P.validateApplication({ ...base, track: 'franczyza', franchise: {} }), /Miasto/);
    assert.throws(() => P.validateApplication({ ...base, track: 'zly' }));
    assert.throws(() => P.validateApplication({ ...base, track: 'marketing', role: 'Grafika i wideo', link: 'javascript:alert(1)' }), /http/);
});

test('9.0: strony nowych modułów istnieją, są w sitemap i podlinkowane na całej stronie', () => {
    const fs = require('fs');
    const path = require('path');
    const vm = require('vm');
    const pub = path.join(__dirname, '..', 'Public');
    const sitemap = fs.readFileSync(path.join(pub, 'sitemap.xml'), 'utf8');
    for (const f of ['konto.html', 'outlet.html', 'powrot.html', 'abonamenty.html', 'partnerzy.html', 'kariera.html']) {
        const html = fs.readFileSync(path.join(pub, f), 'utf8');
        assert.ok(html.includes('data-page="' + f.replace('.html', '') + '"'), f);
        assert.ok(html.includes('assets/portal.js'), f);
        if (f !== 'konto.html') assert.ok(sitemap.includes('https://www.revserwis.pl/' + f), 'sitemap ' + f);
    }
    assert.ok(fs.readFileSync(path.join(pub, 'konto.html'), 'utf8').includes('noindex'), 'panel klienta poza Google');
    const home = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
    for (const href of ['/konto', 'outlet.html', 'powrot.html', 'abonamenty.html', 'partnerzy.html', 'kariera.html']) {
        assert.ok(home.slice(home.indexOf('<!--v9:hero-->'), home.indexOf('<!--/v9:hero-->')).includes(`href="${href}"`), 'hero: ' + href);
    }
    for (const f of fs.readdirSync(pub).filter(n => n.endsWith('.html'))) {
        const html = fs.readFileSync(path.join(pub, f), 'utf8');
        if (!html.includes('class="site-header"')) continue;
        assert.ok(html.includes('class="sh-account" href="/konto"'), 'ikona konta: ' + f);
        assert.ok(html.includes('<!--v9:foot-->'), 'linki w stopce: ' + f);
        assert.ok(html.includes('<!--v9:nav-->'), 'menu „Nowości”: ' + f);
        assert.ok(html.includes('<!--v9:mobile-->'), 'menu mobilne: ' + f);
        assert.equal((html.match(/class="sh-account"/g) || []).length, 1, 'jeden przycisk konta: ' + f);
    }
    for (const f of ['assets/portal.js', 'assets/konto.js', 'revmi/app-v9.js']) new vm.Script(fs.readFileSync(path.join(pub, f), 'utf8'));
});
