'use strict';

/**
 * Odległości do wyceny: geokodowanie adresu (OpenStreetMap Nominatim) i trasa po drogach (OSRM).
 * Oba serwisy są darmowe, ale mają limity — dlatego wyniki trzymamy w pamięci, a przy błędzie
 * liczymy odległość w linii prostej × 1,3 (typowy współczynnik krętości dróg w Polsce).
 * Adresy URL można zmienić zmiennymi GEOCODER_URL i ROUTER_URL (np. na własny serwer OSRM).
 */

const BASE = { lat: Number(process.env.BASE_LAT) || 54.4641, lon: Number(process.env.BASE_LON) || 17.0287, name: process.env.BASE_CITY || 'Słupsk' };
const GEOCODER = (process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
const ROUTER = (process.env.ROUTER_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const DISABLED = String(process.env.GEO_DISABLED || '').toLowerCase() === 'true';
const UA = 'RevSerwis/8.0 (+https://www.revserwis.pl; kontakt@revserwis.pl)';

const cache = new Map();
const remember = (key, value) => {
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
    cache.set(key, value);
    return value;
};

let lastGeocode = 0;
async function politeDelay() {
    // Nominatim: maks. 1 zapytanie na sekundę.
    const wait = lastGeocode + 1100 - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastGeocode = Date.now();
}

function haversineKm(a, b) {
    const R = 6371;
    const rad = x => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

async function geocode(address) {
    const q = String(address || '').trim();
    if (!q || DISABLED) return null;
    const key = 'g:' + q.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    try {
        await politeDelay();
        const url = `${GEOCODER}/search?format=json&limit=1&accept-language=pl&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
        if (!res.ok) return null;
        const list = await res.json();
        const hit = Array.isArray(list) && list[0];
        return remember(key, hit ? { lat: Number(hit.lat), lon: Number(hit.lon), label: String(hit.display_name || '').slice(0, 200) } : null);
    } catch {
        return null;
    }
}

async function roadKm(a, b) {
    if (!a || !b) return null;
    const straight = haversineKm(a, b);
    if (straight < 0.3) return { km: 0, approx: false };
    const key = `r:${a.lat.toFixed(4)},${a.lon.toFixed(4)};${b.lat.toFixed(4)},${b.lon.toFixed(4)}`;
    if (cache.has(key)) return cache.get(key);
    if (!DISABLED) {
        try {
            const url = `${ROUTER}/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
            const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
            if (res.ok) {
                const data = await res.json();
                const m = data?.routes?.[0]?.distance;
                if (Number.isFinite(m)) return remember(key, { km: Math.round(m / 100) / 10, approx: false });
            }
        } catch { /* fallback niżej */ }
    }
    return { km: Math.round(straight * 1.3 * 10) / 10, approx: true };
}

/**
 * Odległości do wyceny zlecenia: trasa A → B (gdy jest cel) i dojazd z bazy (Słupsk) do A.
 * Zwraca { routeKm, approachKm, from, to, approx, source } — nigdy nie rzuca wyjątku.
 */
async function distances(address, destination, hintKm = 0) {
    const out = { routeKm: 0, approachKm: 0, approx: true, source: 'brak', from: null, to: null };
    try {
        const from = await geocode(address);
        const to = destination ? await geocode(destination) : null;
        out.from = from;
        out.to = to;
        if (from) {
            const ap = await roadKm(BASE, from);
            out.approachKm = ap ? ap.km : 0;
        }
        if (destination) {
            if (from && to) {
                const r = await roadKm(from, to);
                out.routeKm = r ? r.km : 0;
                out.approx = Boolean(r?.approx);
                out.source = r?.approx ? 'linia prosta × 1,3' : 'trasa OSRM';
            } else if (hintKm > 0) {
                out.routeKm = hintKm;
                out.source = 'podane przez klienta';
            }
        } else {
            out.approx = !from;
            out.source = from ? 'dojazd z bazy' : 'brak geokodowania';
        }
    } catch { /* zwracamy to, co mamy */ }
    return out;
}

module.exports = { distances, geocode, roadKm, haversineKm, BASE };
