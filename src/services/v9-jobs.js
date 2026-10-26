'use strict';

/**
 * 9.0: zadania w tle
 *  - stałe trasy hoteli i pensjonatów → zlecenia w RevMi na 14 dni do przodu (tylko trasy zaakceptowane przez administratora)
 *  - kursy RevPowrót po terminie → „zakończone”
 * Bezpieczne przy wielu instancjach: każdy termin trasy ma unikalny znacznik (RouteRun).
 */
const { Task } = require('../models');
const V = require('../models-v9');
const { routeOccurrences, WEEKDAYS } = require('../../lib/portal-input');

const HORIZON_DAYS = 14;
const pad = n => String(n).padStart(2, '0');
const runKey = (route, date) => `${route._id}:${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

async function generateRouteTasks(now = new Date()) {
    const routes = await V.HotelRoute.find({ active: true, approved: true }).lean();
    if (!routes.length) return 0;
    const accounts = await V.Account.find({ _id: { $in: routes.map(r => r.account) }, status: 'active', access: 'hotel' }).lean();
    const accById = new Map(accounts.map(a => [String(a._id), a]));
    const properties = await V.HotelProperty.find({ _id: { $in: routes.map(r => r.property) }, active: true }).lean();
    const propById = new Map(properties.map(p => [String(p._id), p]));

    let created = 0;
    for (const route of routes) {
        const account = accById.get(String(route.account));
        const property = propById.get(String(route.property));
        if (!account || !property) continue;
        for (const date of routeOccurrences(route, now, HORIZON_DAYS)) {
            const key = runKey(route, date);
            try {
                await V.RouteRun.create({ key, route: route._id });
            } catch (error) {
                if (error.code === 11000) continue; // ten termin ma już zlecenie
                throw error;
            }
            const company = account.hotel?.companyName || account.company || account.name;
            const task = await Task.create({
                name: `RevHotel: ${route.service} — ${property.name}`.slice(0, 160),
                type: route.service.slice(0, 80),
                division: 'revhotel',
                status: 'planned',
                source: 'Stała trasa (panel hoteli)',
                portalKind: 'hotel',
                portalRef: property._id,
                account: account._id,
                client: account.client || null,
                branch: route.branch || null,
                price: route.pricePerRun || 0,
                dateStart: date,
                clientName: `${company} (${property.name})`.slice(0, 140),
                clientPhone: property.contactPhone || account.phone || '',
                clientEmail: account.email,
                address: property.address,
                desc: [`Stała trasa: ${route.weekdays.map(d => WEEKDAYS[d - 1]).join(', ')} o ${route.time}.`, route.description,
                    property.contactName ? `Osoba kontaktowa: ${property.contactName} ${property.contactPhone || ''}` : '',
                    property.accessNotes ? `Dojazd / klucze: ${property.accessNotes}` : ''].filter(Boolean).join('\n').slice(0, 4000),
                createdBy: 'Harmonogram'
            });
            await V.RouteRun.updateOne({ key }, { $set: { task: task._id } });
            created++;
        }
        await V.HotelRoute.updateOne({ _id: route._id }, { $set: { lastGeneratedAt: now } });
    }
    if (created) console.log(`[RevSerwis] Stałe trasy hoteli: utworzono ${created} zleceń`);
    return created;
}

async function closePastTrips(now = new Date()) {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const r = await V.ReturnTrip.updateMany({ status: { $in: ['open', 'full'] }, date: { $lt: yesterday } }, { $set: { status: 'done' } });
    return r.modifiedCount || 0;
}

let timer = null;
function startV9Jobs({ intervalMs = 30 * 60 * 1000 } = {}) {
    if (timer) return;
    const run = async () => {
        try {
            await generateRouteTasks();
            await closePastTrips();
        } catch (error) {
            console.error('[RevSerwis] Zadania 9.0:', error.message);
        }
    };
    setTimeout(run, 20_000).unref?.();
    timer = setInterval(run, intervalMs);
    timer.unref?.();
    // 9.2: opinie Google — co 6 godzin (pierwsze odświeżenie minutę po starcie)
    const reviews = () => require('./reviews-live').refresh().catch(() => null);
    setTimeout(reviews, 60_000).unref?.();
    setInterval(reviews, 6 * 3_600_000).unref?.();
    // 9.1: kolejka newslettera — paczka co minutę
    const nl = setInterval(() => require('./newsletter').processQueue().catch(() => null), 60_000);
    nl.unref?.();
    // 9.2: automatyzacje, poranne podsumowanie, należności, flota
    require('./v11-jobs').startV11Jobs();
}

module.exports = { generateRouteTasks, closePastTrips, startV9Jobs, runKey };
