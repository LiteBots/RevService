'use strict';

/**
 * RevSerwis 9.0 — walidacja danych z panelu klienta (/konto), paneli B2B, RevOutlet, RevPowrót,
 * subskrypcji i portalu rekrutacyjnego. Czysta logika (bez bazy i paczek npm) — łatwa do testowania.
 */
const { isDivision } = require('./divisions');

/* ------------------------------------------------------------------ */
/* Słowniki                                                            */
/* ------------------------------------------------------------------ */

/** Rodzaje dostępu B2B nadawane przez administratora w RevMi. */
const ACCESS_KINDS = ['hotel', 'partner', 'developer'];
const ACCESS_LABELS = { hotel: 'Panel hoteli i pensjonatów', partner: 'Portal partnerski (biura nieruchomości)', developer: 'Panel dewelopera' };

/** Działy, do których można się zgłosić w portalu rekrutacyjnym. */
const DEPARTMENTS = [
    'Przeprowadzki',
    'Opróżnianie mieszkań i wywóz',
    'Transport rzeczy',
    'Ogród i działka',
    'Odśnieżanie (RevWinter)',
    'Sprzątanie i mycie (RevClean)',
    'Rozbiórki i prace ziemne',
    'Kierowca (kat. B / C / C+E)',
    'Magazyn i sortownia',
    'Inny dział'
];
const MARKETING_ROLES = [
    'Social media (Facebook, Instagram, TikTok)',
    'Grafika i wideo',
    'Fotografia realizacji',
    'Sprzedaż i pozyskiwanie klientów B2B',
    'SEO i reklamy Google',
    'Copywriting',
    'Inne'
];
const APPLICATION_TRACKS = ['dzial', 'marketing', 'franczyza'];
const APPLICATION_TRACK_LABELS = { dzial: 'Dział usługowy', marketing: 'Dział marketingu', franczyza: 'Franczyza RevSerwis' };
const LICENSES = ['B', 'B+E', 'C', 'C+E', 'D', 'brak'];
const AVAILABILITY = ['Pełny etat', 'Część etatu', 'Weekendy', 'Sezonowo', 'Zlecenia / dorywczo'];
const FRANCHISE_BUDGETS = ['do 20 000 zł', '20 000 – 50 000 zł', '50 000 – 100 000 zł', 'powyżej 100 000 zł'];
const FRANCHISE_TIMELINES = ['Jak najszybciej', 'W ciągu 3 miesięcy', 'W ciągu 6 miesięcy', 'Na razie się rozglądam'];

const OUTLET_CATEGORIES = ['Meble', 'AGD', 'RTV i elektronika', 'Rowery i sport', 'Ogród', 'Narzędzia', 'Dom i dekoracje', 'Dla dzieci', 'Inne'];
const OUTLET_CONDITIONS = ['Jak nowe', 'Bardzo dobry', 'Dobry', 'Do odświeżenia', 'Na części'];
const OUTLET_STATUSES = ['draft', 'available', 'reserved', 'sold', 'archived'];
const OUTLET_ORDER_STATUSES = ['new', 'confirmed', 'completed', 'cancelled'];
const DELIVERY = ['pickup', 'delivery'];

const TRIP_STATUSES = ['open', 'full', 'done', 'cancelled'];
const BOOKING_STATUSES = ['new', 'confirmed', 'completed', 'cancelled'];

const SUBSCRIPTION_STATUSES = ['pending', 'active', 'paused', 'cancelled'];
const BILLING_PERIODS = ['month', 'season', 'year'];

const REFERRAL_SERVICES = [
    'Przeprowadzka',
    'Opróżnianie mieszkania',
    'Przygotowanie do sprzedaży (opróżnianie, sprzątanie, ogród)',
    'Sprzątanie po wyprowadzce',
    'Wywóz mebli i gabarytów',
    'Magazynowanie rzeczy',
    'Drobne naprawy i montaż',
    'Inne'
];
const REFERRAL_STATUSES = ['new', 'contacted', 'planned', 'completed', 'lost'];
const COMMISSION_STATUSES = ['none', 'pending', 'approved', 'paid'];

const HOTEL_SERVICES = [
    'Stała trasa — pranie i pościel',
    'Dostawa towaru',
    'Wywóz odpadów i gabarytów',
    'Transfer gości',
    'Przewóz mebli i wyposażenia',
    'Sprzątanie / mycie ciśnieniowe',
    'Odśnieżanie',
    'Ogród i teren',
    'Inne'
];
const WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];

/* ------------------------------------------------------------------ */
/* Narzędzia                                                           */
/* ------------------------------------------------------------------ */

function bad(message) {
    const error = new Error(message);
    error.status = 400;
    throw error;
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

function obj(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) bad('Nieprawidłowe dane.');
    return input;
}

/** Tekst: przycina, sprawdza typ, długość i (opcjonalnie) wymagalność. */
function text(value, max, label, { required = false, min = 0 } = {}) {
    if (value === undefined || value === null) value = '';
    if (typeof value === 'number') value = String(value);
    if (typeof value !== 'string') bad(`Nieprawidłowe pole: ${label}`);
    const v = value.trim();
    if (v.length > max) bad(`Pole „${label}” jest za długie (max ${max} znaków).`);
    if (required && !v) bad(`Uzupełnij pole „${label}”.`);
    if (v && v.length < min) bad(`Pole „${label}” jest za krótkie.`);
    return v;
}

function email(value, { required = true } = {}) {
    const v = text(value, 160, 'E-mail', { required }).toLowerCase();
    if (v && !EMAIL.test(v)) bad('Podaj prawidłowy adres e-mail.');
    return v;
}

function phone(value, { required = false } = {}) {
    const raw = text(value, 40, 'Telefon', { required });
    if (!raw) return '';
    let digits = raw.replace(/\D/g, '');
    if (raw.startsWith('00')) digits = digits.slice(2);
    if (!/^[+\d\s()-]+$/.test(raw) || digits.length < 7 || digits.length > 15) bad('Wpisz prawidłowy numer telefonu.');
    return (raw.startsWith('+') || raw.startsWith('00') ? '+' : '') + digits;
}

function oneOf(value, list, fallback) {
    return list.includes(value) ? value : fallback;
}

function num(value, label, { min = 0, max = 1e9, required = false, integer = false } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) bad(`Uzupełnij pole „${label}”.`);
        return null;
    }
    const n = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) bad(`Nieprawidłowa wartość: ${label}.`);
    return Math.round(n * 100) / 100;
}

function dateValue(value, label, { required = false, future = false, now = new Date() } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) bad(`Wybierz datę: ${label}.`);
        return null;
    }
    if (typeof value !== 'string' && !(value instanceof Date)) bad(`Nieprawidłowa data: ${label}.`);
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) bad(`Nieprawidłowa data: ${label}.`);
    if (d.getFullYear() < 2020 || d.getFullYear() > 2100) bad(`Nieprawidłowa data: ${label}.`);
    if (future) {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (d < today) bad(`Data „${label}” nie może być w przeszłości.`);
    }
    return d;
}

function idValue(value, label, { required = true } = {}) {
    if (!value && !required) return null;
    if (typeof value !== 'string' || !OBJECT_ID.test(value)) bad(`Nieprawidłowy identyfikator: ${label}.`);
    return value;
}

function requestId(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(value)) bad('Odśwież stronę i spróbuj ponownie.');
    return value;
}

function honeypot(input) {
    if (input.website) bad('Nie udało się wysłać formularza. Zadzwoń: 735 396 534.');
}

function photosValue(value, max) {
    const photos = value === undefined || value === null ? [] : value;
    if (!Array.isArray(photos)) bad('Nieprawidłowe zdjęcia.');
    if (photos.length > max) bad(`Możesz dodać maksymalnie ${max} zdjęć.`);
    for (const p of photos) {
        if (typeof p !== 'string' || p.length > 2_800_000 || !PHOTO.test(p)) bad('Nieprawidłowy plik zdjęcia (JPG, PNG lub WebP).');
    }
    return photos;
}

function list(value, allowed, label, { max = 20 } = {}) {
    const arr = value === undefined || value === null ? [] : value;
    if (!Array.isArray(arr) || arr.length > max) bad(`Nieprawidłowe pole: ${label}.`);
    return [...new Set(arr.filter(v => allowed.includes(v)))];
}

function nip(value) {
    const v = text(value, 20, 'NIP').replace(/[\s-]/g, '');
    if (v && !/^([A-Z]{2})?\d{10}$/i.test(v)) bad('Nieprawidłowy NIP (10 cyfr).');
    return v.toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Konto klienta                                                       */
/* ------------------------------------------------------------------ */

function password(value, label = 'Hasło') {
    if (typeof value !== 'string') bad(`Uzupełnij pole „${label}”.`);
    if (value.length < 8) bad('Hasło musi mieć co najmniej 8 znaków.');
    if (value.length > 128) bad('Hasło jest za długie (max 128 znaków).');
    if (!/[A-Za-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(value) || !/\d/.test(value)) bad('Hasło musi zawierać co najmniej jedną literę i jedną cyfrę.');
    return value;
}

function validateRegister(input) {
    obj(input);
    honeypot(input);
    if (input.consent !== true) bad('Zaakceptuj regulamin i politykę prywatności.');
    const kind = input.kind === 'company' ? 'company' : 'person';
    const out = {
        email: email(input.email),
        password: password(input.password),
        name: text(input.name, 140, 'Imię i nazwisko', { required: true, min: 2 }),
        phone: phone(input.phone),
        kind,
        company: kind === 'company' ? text(input.company, 180, 'Nazwa firmy', { required: true, min: 2 }) : '',
        nip: kind === 'company' ? nip(input.nip) : '',
        marketingConsent: input.marketing === true,
        // Prośba o panel B2B (hotel / biuro nieruchomości) — dostęp i tak nadaje administrator w RevMi
        accessRequested: ACCESS_KINDS.includes(input.b2bRequest) ? [input.b2bRequest] : []
    };
    if (out.accessRequested.length && kind !== 'company') bad('Panel dla hoteli i biur nieruchomości wymaga konta firmowego.');
    return out;
}

function validateLogin(input) {
    obj(input);
    const e = email(input.email);
    if (typeof input.password !== 'string' || !input.password || input.password.length > 128) bad('Podaj hasło.');
    return { email: e, password: input.password, remember: input.remember !== false };
}

function validateProfile(input) {
    obj(input);
    const out = {};
    if (input.name !== undefined) out.name = text(input.name, 140, 'Imię i nazwisko', { required: true, min: 2 });
    if (input.phone !== undefined) out.phone = phone(input.phone);
    if (input.company !== undefined) out.company = text(input.company, 180, 'Nazwa firmy');
    if (input.nip !== undefined) out.nip = nip(input.nip);
    if (input.address !== undefined) out.address = text(input.address, 300, 'Adres');
    if (input.city !== undefined) out.city = text(input.city, 80, 'Miasto');
    if (input.postalCode !== undefined) {
        out.postalCode = text(input.postalCode, 10, 'Kod pocztowy');
        if (out.postalCode && !/^\d{2}-?\d{3}$/.test(out.postalCode)) bad('Kod pocztowy w formacie 00-000.');
    }
    if (input.notifyEmail !== undefined) out.notifyEmail = input.notifyEmail === true;
    if (input.notifySms !== undefined) out.notifySms = input.notifySms === true;
    if (input.marketingConsent !== undefined) out.marketingConsent = input.marketingConsent === true;
    if (input.invoiceEmail !== undefined) out.invoiceEmail = email(input.invoiceEmail, { required: false });
    return out;
}

function validatePasswordChange(input) {
    obj(input);
    if (typeof input.current !== 'string' || !input.current) bad('Podaj obecne hasło.');
    const next = password(input.next, 'Nowe hasło');
    if (next === input.current) bad('Nowe hasło musi różnić się od obecnego.');
    return { current: input.current, next };
}

/* ------------------------------------------------------------------ */
/* Zamówienie usługi z panelu klienta                                  */
/* ------------------------------------------------------------------ */

function validateClientOrder(input, { now = new Date() } = {}) {
    obj(input);
    honeypot(input);
    const division = isDivision(input.division) ? input.division : '';
    const service = text(input.service, 80, 'Usługa', { required: true, min: 2 });
    const out = {
        requestId: requestId(input.requestId),
        division,
        service,
        address: text(input.address, 300, 'Adres', { required: true, min: 3 }),
        addressTo: text(input.addressTo, 300, 'Adres docelowy'),
        date: dateValue(input.date, 'Preferowany termin', { future: true, now }),
        dateFlexible: input.dateFlexible === true,
        description: text(input.description, 3500, 'Opis', { required: true, min: 10 }),
        phone: phone(input.phone),
        photos: photosValue(input.photos, 6),
        quoteType: input.quoteType === 'onsite' ? 'onsite' : 'free'
    };
    return out;
}

function validateStoragePickup(input, { now = new Date() } = {}) {
    obj(input);
    const items = Array.isArray(input.items) ? input.items : [];
    if (!items.length || items.length > 50) bad('Wybierz rzeczy z magazynu.');
    for (const id of items) idValue(id, 'pozycja magazynu');
    return {
        items: [...new Set(items)],
        mode: input.mode === 'pickup' ? 'pickup' : 'delivery',
        address: input.mode === 'pickup' ? '' : text(input.address, 300, 'Adres dostawy', { required: true, min: 3 }),
        date: dateValue(input.date, 'Termin', { required: true, future: true, now }),
        note: text(input.note, 1000, 'Uwagi')
    };
}

/* ------------------------------------------------------------------ */
/* RevOutlet                                                           */
/* ------------------------------------------------------------------ */

function validateOutletItem(input) {
    obj(input);
    const out = {
        title: text(input.title, 140, 'Nazwa', { required: true, min: 2 }),
        category: oneOf(input.category, OUTLET_CATEGORIES, 'Inne'),
        condition: oneOf(input.condition, OUTLET_CONDITIONS, 'Dobry'),
        description: text(input.description, 4000, 'Opis'),
        price: num(input.price, 'Cena', { min: 0, max: 1_000_000, required: true }),
        oldPrice: num(input.oldPrice, 'Cena przed obniżką', { min: 0, max: 1_000_000 }),
        dimensions: text(input.dimensions, 120, 'Wymiary'),
        location: text(input.location, 120, 'Lokalizacja odbioru'),
        deliveryAvailable: input.deliveryAvailable !== false,
        deliveryPrice: num(input.deliveryPrice, 'Cena dowozu', { min: 0, max: 100_000 }),
        quantity: num(input.quantity, 'Ilość', { min: 1, max: 999, integer: true }) || 1,
        status: oneOf(input.status, OUTLET_STATUSES, 'draft'),
        featured: input.featured === true,
        sortingEntry: idValue(input.sortingEntry, 'pozycja sortowni', { required: false }),
        task: idValue(input.task, 'zlecenie', { required: false })
    };
    if (out.oldPrice !== null && out.oldPrice <= out.price) out.oldPrice = null;
    return out;
}

function validateOutletOrder(input) {
    obj(input);
    honeypot(input);
    if (input.consent !== true) bad('Zaznacz zgodę na kontakt w sprawie zamówienia.');
    const delivery = oneOf(input.delivery, DELIVERY, 'pickup');
    return {
        requestId: requestId(input.requestId),
        item: idValue(input.item, 'przedmiot'),
        name: text(input.name, 140, 'Imię i nazwisko', { required: true, min: 2 }),
        phone: phone(input.phone, { required: true }),
        email: email(input.email, { required: false }),
        delivery,
        address: delivery === 'delivery' ? text(input.address, 300, 'Adres dostawy', { required: true, min: 3 }) : '',
        note: text(input.note, 1000, 'Uwagi')
    };
}

/* ------------------------------------------------------------------ */
/* RevPowrót — giełda pustych kursów                                   */
/* ------------------------------------------------------------------ */

function validateTrip(input) {
    obj(input);
    const capacity = num(input.capacityM3, 'Wolne miejsce (m³)', { min: 0.5, max: 120, required: true });
    const out = {
        from: text(input.from, 120, 'Skąd', { required: true, min: 2 }),
        to: text(input.to, 120, 'Dokąd', { required: true, min: 2 }),
        via: text(input.via, 300, 'Przez'),
        date: dateValue(input.date, 'Data kursu', { required: true }),
        dateFlexDays: num(input.dateFlexDays, 'Elastyczność terminu', { min: 0, max: 14, integer: true }) || 0,
        capacityM3: capacity,
        maxWeightKg: num(input.maxWeightKg, 'Maks. waga', { min: 0, max: 40000 }),
        pricePerM3: num(input.pricePerM3, 'Cena za m³', { min: 0, max: 100_000 }),
        minPrice: num(input.minPrice, 'Cena minimalna', { min: 0, max: 100_000 }),
        discountPct: num(input.discountPct, 'Rabat', { min: 0, max: 90, integer: true }) || 0,
        vehicle: text(input.vehicle, 120, 'Pojazd'),
        notes: text(input.notes, 1500, 'Uwagi'),
        status: oneOf(input.status, TRIP_STATUSES, 'open'),
        published: input.published !== false,
        branch: idValue(input.branch, 'oddział', { required: false })
    };
    return out;
}

/** Cena rezerwacji miejsca w kursie: m³ × stawka, nie mniej niż minimum. */
function tripPrice(trip, volume) {
    const v = Math.max(0, Number(volume) || 0);
    const base = v * (Number(trip.pricePerM3) || 0);
    const min = Number(trip.minPrice) || 0;
    return Math.round(Math.max(base, min) * 100) / 100;
}

function validateTripBooking(input, trip = null) {
    obj(input);
    honeypot(input);
    if (input.consent !== true) bad('Zaznacz zgodę na kontakt w sprawie rezerwacji.');
    const volume = num(input.volumeM3, 'Objętość (m³)', { min: 0.25, max: 120, required: true });
    if (trip && volume > (Number(trip.remainingM3) || 0)) bad(`W tym kursie zostało tylko ${trip.remainingM3} m³ wolnego miejsca.`);
    return {
        requestId: requestId(input.requestId),
        trip: idValue(input.trip, 'kurs'),
        name: text(input.name, 140, 'Imię i nazwisko', { required: true, min: 2 }),
        phone: phone(input.phone, { required: true }),
        email: email(input.email, { required: false }),
        volumeM3: volume,
        pickupAddress: text(input.pickupAddress, 300, 'Adres odbioru', { required: true, min: 3 }),
        dropAddress: text(input.dropAddress, 300, 'Adres dostawy', { required: true, min: 3 }),
        items: text(input.items, 2000, 'Co przewozimy', { required: true, min: 3 }),
        floorInfo: text(input.floorInfo, 200, 'Piętra / winda'),
        note: text(input.note, 1000, 'Uwagi')
    };
}

/* ------------------------------------------------------------------ */
/* Subskrypcje (RevWinter, RevFacility, RevGarden…)                    */
/* ------------------------------------------------------------------ */

function validatePlan(input) {
    obj(input);
    const slug = text(input.slug, 60, 'Identyfikator', { required: true }).toLowerCase();
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) bad('Identyfikator planu: małe litery, cyfry i myślniki.');
    const features = Array.isArray(input.features) ? input.features : String(input.features || '').split('\n');
    return {
        slug,
        name: text(input.name, 100, 'Nazwa', { required: true, min: 2 }),
        division: isDivision(input.division) ? input.division : '',
        tagline: text(input.tagline, 200, 'Krótki opis'),
        description: text(input.description, 3000, 'Opis'),
        features: features.map(f => text(f, 160, 'Cecha')).filter(Boolean).slice(0, 20),
        price: num(input.price, 'Cena', { min: 0, max: 1_000_000, required: true }),
        billingPeriod: oneOf(input.billingPeriod, BILLING_PERIODS, 'month'),
        visitsPerPeriod: num(input.visitsPerPeriod, 'Wizyty w okresie', { min: 0, max: 100, integer: true }) || 0,
        season: text(input.season, 80, 'Sezon'),
        audience: oneOf(input.audience, ['all', 'person', 'company'], 'all'),
        highlight: input.highlight === true,
        active: input.active !== false,
        order: num(input.order, 'Kolejność', { min: 0, max: 999, integer: true }) || 0
    };
}

function validateSubscribe(input) {
    obj(input);
    if (input.consent !== true) bad('Zaakceptuj warunki abonamentu.');
    return {
        plan: idValue(input.plan, 'plan'),
        address: text(input.address, 300, 'Adres obiektu', { required: true, min: 3 }),
        area: text(input.area, 120, 'Powierzchnia / zakres'),
        startDate: dateValue(input.startDate, 'Start'),
        note: text(input.note, 1500, 'Uwagi')
    };
}

/* ------------------------------------------------------------------ */
/* Portal partnerski — biura nieruchomości                             */
/* ------------------------------------------------------------------ */

function validateReferral(input, { now = new Date() } = {}) {
    obj(input);
    if (input.clientConsent !== true) bad('Potwierdź, że klient zgodził się na kontakt z RevSerwis.');
    const services = list(input.services, REFERRAL_SERVICES, 'Usługi', { max: REFERRAL_SERVICES.length });
    if (!services.length) bad('Wybierz przynajmniej jedną usługę.');
    const clientPhone = phone(input.clientPhone, { required: true });
    const listingUrl = text(input.listingUrl, 400, 'Link do ogłoszenia');
    if (listingUrl && !/^https?:\/\/\S+$/i.test(listingUrl)) bad('Link do ogłoszenia musi zaczynać się od http:// lub https://');
    return {
        requestId: requestId(input.requestId),
        clientName: text(input.clientName, 140, 'Imię i nazwisko klienta', { required: true, min: 2 }),
        clientPhone,
        clientEmail: email(input.clientEmail, { required: false }),
        propertyAddress: text(input.propertyAddress, 300, 'Adres nieruchomości', { required: true, min: 3 }),
        targetAddress: text(input.targetAddress, 300, 'Adres docelowy'),
        services,
        preferredDate: dateValue(input.preferredDate, 'Preferowany termin', { future: true, now }),
        listingUrl,
        notes: text(input.notes, 2000, 'Uwagi')
    };
}

function validatePartnerApplication(input) {
    obj(input);
    honeypot(input);
    if (input.consent !== true) bad('Zaznacz zgodę na kontakt.');
    return {
        requestId: requestId(input.requestId),
        agencyName: text(input.agencyName, 180, 'Nazwa biura', { required: true, min: 2 }),
        name: text(input.name, 140, 'Imię i nazwisko', { required: true, min: 2 }),
        email: email(input.email),
        phone: phone(input.phone, { required: true }),
        city: text(input.city, 80, 'Miasto', { required: true, min: 2 }),
        nip: nip(input.nip),
        agents: num(input.agents, 'Liczba agentów', { min: 1, max: 5000, integer: true }),
        message: text(input.message, 2000, 'Wiadomość')
    };
}

/* ------------------------------------------------------------------ */
/* Panel hoteli i pensjonatów                                          */
/* ------------------------------------------------------------------ */

function validateHotelProperty(input) {
    obj(input);
    return {
        name: text(input.name, 140, 'Nazwa obiektu', { required: true, min: 2 }),
        address: text(input.address, 300, 'Adres', { required: true, min: 3 }),
        rooms: num(input.rooms, 'Liczba pokoi', { min: 0, max: 5000, integer: true }),
        contactName: text(input.contactName, 140, 'Osoba kontaktowa'),
        contactPhone: phone(input.contactPhone),
        accessNotes: text(input.accessNotes, 1000, 'Dojazd / klucze / rampa'),
        notes: text(input.notes, 1500, 'Uwagi')
    };
}

function validateTime(value) {
    const t = text(value, 5, 'Godzina', { required: true });
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) bad('Godzina w formacie GG:MM.');
    return t;
}

function validateHotelRoute(input) {
    obj(input);
    const weekdays = Array.isArray(input.weekdays) ? input.weekdays.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 7) : [];
    if (!weekdays.length) bad('Wybierz przynajmniej jeden dzień tygodnia.');
    return {
        property: idValue(input.property, 'obiekt'),
        service: oneOf(input.service, HOTEL_SERVICES, 'Inne'),
        weekdays: [...new Set(weekdays)].sort(),
        time: validateTime(input.time),
        description: text(input.description, 1500, 'Opis', { required: true, min: 3 }),
        startDate: dateValue(input.startDate, 'Od kiedy'),
        endDate: dateValue(input.endDate, 'Do kiedy'),
        active: input.active !== false
    };
}

function validateHotelOrder(input, { now = new Date() } = {}) {
    obj(input);
    return {
        requestId: requestId(input.requestId),
        property: idValue(input.property, 'obiekt'),
        service: oneOf(input.service, HOTEL_SERVICES, 'Inne'),
        date: dateValue(input.date, 'Termin', { required: true, future: true, now }),
        time: input.time ? validateTime(input.time) : '',
        description: text(input.description, 2000, 'Opis', { required: true, min: 3 }),
        urgent: input.urgent === true
    };
}

/**
 * Najbliższe terminy stałej trasy w oknie [from, from + days).
 * weekdays: 1 = poniedziałek … 7 = niedziela; time: „GG:MM” (czas lokalny serwera).
 */
function routeOccurrences(route, from = new Date(), days = 14) {
    const out = [];
    const [h, m] = String(route.time || '08:00').split(':').map(Number);
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const begin = route.startDate ? new Date(route.startDate) : null;
    const end = route.endDate ? new Date(route.endDate) : null;
    for (let i = 0; i < days; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, h, m);
        const iso = ((d.getDay() + 6) % 7) + 1;
        if (!route.weekdays.includes(iso)) continue;
        if (d < from) continue;
        if (begin && d < new Date(begin.getFullYear(), begin.getMonth(), begin.getDate())) continue;
        if (end && d > new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59)) continue;
        out.push(d);
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Portal rekrutacyjny                                                 */
/* ------------------------------------------------------------------ */

function validateApplication(input) {
    obj(input);
    honeypot(input);
    if (input.consent !== true) bad('Zaznacz zgodę na przetwarzanie danych w procesie rekrutacji.');
    const track = oneOf(input.track, APPLICATION_TRACKS, null);
    if (!track) bad('Wybierz, gdzie chcesz się zgłosić.');
    const base = {
        requestId: requestId(input.requestId),
        track,
        name: text(input.name, 140, 'Imię i nazwisko', { required: true, min: 2 }),
        email: email(input.email),
        phone: phone(input.phone, { required: true }),
        city: text(input.city, 80, 'Miasto', { required: true, min: 2 }),
        message: text(input.message, 3000, 'O sobie'),
        link: text(input.link, 400, 'Link (CV, portfolio, LinkedIn)'),
        department: '',
        role: '',
        availability: '',
        licenses: [],
        experience: '',
        franchise: null
    };
    if (base.link && !/^https?:\/\/\S+$/i.test(base.link)) bad('Link musi zaczynać się od http:// lub https://');

    if (track === 'dzial') {
        base.department = oneOf(input.department, DEPARTMENTS, null);
        if (!base.department) bad('Wybierz dział.');
        base.availability = oneOf(input.availability, AVAILABILITY, '');
        base.licenses = list(input.licenses, LICENSES, 'Prawo jazdy', { max: LICENSES.length });
        base.experience = text(input.experience, 1500, 'Doświadczenie');
    } else if (track === 'marketing') {
        base.role = oneOf(input.role, MARKETING_ROLES, null);
        if (!base.role) bad('Wybierz obszar marketingu.');
        base.availability = oneOf(input.availability, AVAILABILITY, '');
        base.experience = text(input.experience, 1500, 'Doświadczenie');
    } else {
        const f = input.franchise && typeof input.franchise === 'object' ? input.franchise : {};
        base.franchise = {
            city: text(f.city, 120, 'Miasto franczyzy', { required: true, min: 2 }),
            budget: oneOf(f.budget, FRANCHISE_BUDGETS, ''),
            timeline: oneOf(f.timeline, FRANCHISE_TIMELINES, ''),
            hasCompany: f.hasCompany === true,
            hasVehicle: f.hasVehicle === true,
            hasTeam: f.hasTeam === true,
            businessExperience: text(f.businessExperience, 1500, 'Doświadczenie w biznesie')
        };
    }
    return base;
}

module.exports = {
    ACCESS_KINDS, ACCESS_LABELS, DEPARTMENTS, MARKETING_ROLES, APPLICATION_TRACKS, APPLICATION_TRACK_LABELS,
    LICENSES, AVAILABILITY, FRANCHISE_BUDGETS, FRANCHISE_TIMELINES,
    OUTLET_CATEGORIES, OUTLET_CONDITIONS, OUTLET_STATUSES, OUTLET_ORDER_STATUSES, DELIVERY,
    TRIP_STATUSES, BOOKING_STATUSES, SUBSCRIPTION_STATUSES, BILLING_PERIODS,
    REFERRAL_SERVICES, REFERRAL_STATUSES, COMMISSION_STATUSES, HOTEL_SERVICES, WEEKDAYS,
    bad, text, email, phone, num, dateValue, idValue, oneOf, password,
    validateRegister, validateLogin, validateProfile, validatePasswordChange,
    validateClientOrder, validateStoragePickup,
    validateOutletItem, validateOutletOrder,
    validateTrip, validateTripBooking, tripPrice,
    validatePlan, validateSubscribe,
    validateReferral, validatePartnerApplication,
    validateHotelProperty, validateHotelRoute, validateHotelOrder, routeOccurrences,
    validateApplication
};
