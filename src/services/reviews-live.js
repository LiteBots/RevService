'use strict';

/**
 * 9.2: ocena i liczba opinii z wizytówki Google — aktualizowane na bieżąco na całej stronie.
 *
 * Źródła (od najważniejszego):
 *  1) ręczne ustawienie w RevMi (Integracje → Opinie Google) — gdy chcesz nadpisać,
 *  2) Google Places API (zmienna GOOGLE_PLACES_API_KEY) — odświeżane co 6 h i na żądanie,
 *  3) wartości z Public/assets/content.json (stan z ostatniej przebudowy strony).
 *
 * Identyfikator miejsca (Place ID) jest znajdowany automatycznie: wyszukujemy „RevSerwis Słupsk”
 * i wybieramy wynik, którego link Google Maps ma ten sam numer CID co wizytówka firmy.
 */
const fs = require('fs');
const path = require('path');
const { Settings } = require('../models');
const { getSettings, resetSettingsCache } = require('./settings');

const API = 'https://places.googleapis.com/v1';
const key = () => process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
const configured = () => Boolean(key());

function staticFallback() {
    try {
        const c = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'Public', 'assets', 'content.json'), 'utf8'));
        return { rating: Number(c.rating) || 5, count: Number(c.ratingCount) || (c.reviews || []).length || 0, url: c.googleProfile || '' };
    } catch {
        return { rating: 5, count: 0, url: '' };
    }
}

const cidOf = url => (String(url || '').match(/[?&]cid=(\d{5,25})/) || [])[1] || '';

async function google(pathname, { method = 'GET', body, fields }) {
    const res = await fetch(API + pathname, {
        method,
        headers: { 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': fields, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(8000)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error('Google Places: ' + (data?.error?.message || 'HTTP ' + res.status));
    return data;
}

/** Szuka Place ID wizytówki po nazwie, dopasowując numer CID z linku do profilu. */
async function discoverPlaceId(settings) {
    const cid = cidOf(settings.googleReviewUrl) || cidOf(staticFallback().url);
    const queries = [...new Set([`${settings.companyName || 'RevSerwis'} ${settings.companyAddress || 'Słupsk'}`, 'RevSerwis Słupsk', 'Rev Serwis Kacper Taczała'])];
    for (const textQuery of queries) {
        const data = await google('/places:searchText', { method: 'POST', body: { textQuery, languageCode: 'pl' }, fields: 'places.id,places.googleMapsUri,places.displayName' });
        const places = data.places || [];
        const hit = cid ? places.find(p => cidOf(p.googleMapsUri) === cid) : places[0];
        if (hit) return hit.id;
    }
    return '';
}

/** Pobiera aktualną ocenę i liczbę opinii; zapisuje w ustawieniach. Nigdy nie rzuca. */
async function refresh() {
    if (!configured()) return { ok: false, error: 'Brak GOOGLE_PLACES_API_KEY' };
    try {
        const settings = await getSettings({ fresh: true });
        let placeId = settings.googlePlaceId;
        if (!placeId) {
            placeId = await discoverPlaceId(settings);
            if (!placeId) throw new Error('Nie znaleziono wizytówki w Google — wpisz Place ID ręcznie.');
            await Settings.updateOne({ key: 'main' }, { $set: { googlePlaceId: placeId } });
        }
        const p = await google('/places/' + encodeURIComponent(placeId) + '?languageCode=pl', { fields: 'rating,userRatingCount,googleMapsUri' });
        const live = { rating: Number(p.rating) || null, count: Number(p.userRatingCount) || 0, url: p.googleMapsUri || '', updatedAt: new Date(), error: '' };
        await Settings.updateOne({ key: 'main' }, { $set: { reviewsLive: live } });
        resetSettingsCache();
        return { ok: true, ...live };
    } catch (error) {
        await Settings.updateOne({ key: 'main' }, { $set: { 'reviewsLive.error': String(error.message).slice(0, 300), 'reviewsLive.failedAt': new Date() } }).catch(() => null);
        resetSettingsCache();
        return { ok: false, error: error.message };
    }
}

/** Aktualne dane dla strony (bez wywoływania Google — z pamięci). */
async function current() {
    const fb = staticFallback();
    let s = {};
    try { s = await getSettings(); } catch { /* bez bazy — tylko fallback */ }
    const live = s.reviewsLive && s.reviewsLive.count ? s.reviewsLive : null;
    const manual = s.reviewsManualCount != null || s.reviewsManualRating != null;
    return {
        rating: Math.round(((manual && s.reviewsManualRating != null ? s.reviewsManualRating : live?.rating) ?? fb.rating) * 10) / 10,
        count: (manual && s.reviewsManualCount != null ? s.reviewsManualCount : live?.count) ?? fb.count,
        url: s.googleReviewUrl || live?.url || fb.url,
        source: manual ? 'manual' : live ? 'google' : 'static',
        updatedAt: live?.updatedAt || null
    };
}

/** Polska odmiana: 1 opinia, 2–4 opinie (oprócz 12–14), 5+ opinii. */
function plural(n) {
    if (n === 1) return 'opinia';
    const d = n % 10;
    const t = n % 100;
    return d >= 2 && d <= 4 && (t < 12 || t > 14) ? 'opinie' : 'opinii';
}

module.exports = { refresh, current, configured, plural, cidOf, staticFallback };
