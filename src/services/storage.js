'use strict';

/**
 * 9.2: zdjęcia poza bazą — Cloudflare R2 (lub dowolne S3: Amazon S3, Backblaze B2, MinIO).
 *
 * Konfiguracja (zmienne środowiskowe):
 *   S3_ENDPOINT          np. https://<ID-konta>.r2.cloudflarestorage.com
 *   S3_BUCKET            np. revserwis-zdjecia
 *   S3_ACCESS_KEY_ID     klucz API R2 (uprawnienia „Object Read & Write” do tego bucketu)
 *   S3_SECRET_ACCESS_KEY
 *   S3_REGION            „auto” dla R2 (domyślnie)
 *
 * Bez konfiguracji wszystko działa jak dotąd — zdjęcia zostają w MongoDB.
 * Zdjęcia nadal są wydawane przez serwer (z kontrolą dostępu), bucket może być prywatny.
 */
const { signV4, sha256 } = require('../../lib/v11-input');

const cfg = () => ({
    endpoint: String(process.env.S3_ENDPOINT || '').replace(/\/+$/, ''),
    bucket: process.env.S3_BUCKET || '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || '',
    region: process.env.S3_REGION || 'auto'
});

function configured() {
    const c = cfg();
    return Boolean(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
}

const objectUrl = key => {
    const c = cfg();
    return `${c.endpoint}/${encodeURIComponent(c.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
};

async function request(method, key, { body, contentType } = {}) {
    const c = cfg();
    const url = objectUrl(key);
    const payload = body || Buffer.alloc(0);
    const headers = contentType ? { 'content-type': contentType } : {};
    const signed = signV4({ method, url, headers, accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, region: c.region, payloadHash: sha256(payload) });
    const res = await fetch(url, {
        method,
        headers: { ...headers, ...signed.headers },
        body: method === 'PUT' ? payload : undefined,
        signal: AbortSignal.timeout(20_000)
    });
    if (!res.ok && !(method === 'DELETE' && res.status === 404)) {
        const text = await res.text().catch(() => '');
        const code = (text.match(/<Code>([^<]+)<\/Code>/) || [])[1] || 'HTTP ' + res.status;
        const err = new Error(`Magazyn zdjęć (R2/S3): ${code}`);
        err.status = res.status === 404 ? 404 : 502;
        throw err;
    }
    return res;
}

async function put(key, buffer, contentType = 'image/jpeg') {
    await request('PUT', key, { body: buffer, contentType });
    return key;
}

async function get(key) {
    const res = await request('GET', key);
    return Buffer.from(await res.arrayBuffer());
}

async function del(key) {
    await request('DELETE', key);
}

/** Sprawdza połączenie (zapis, odczyt, usunięcie pliku testowego). */
async function selfTest() {
    if (!configured()) return { ok: false, error: 'Brak konfiguracji S3_* / R2' };
    const key = `healthcheck/${Date.now()}.txt`;
    try {
        await put(key, Buffer.from('ok'), 'text/plain');
        const back = (await get(key)).toString();
        await del(key);
        return { ok: back === 'ok' };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

const mediaKey = (taskId, mediaId, contentType) => `tasks/${taskId}/${mediaId}.${/png/.test(contentType) ? 'png' : /webp/.test(contentType) ? 'webp' : 'jpg'}`;

const toBuffer = d => (d?.buffer && !Buffer.isBuffer(d) ? Buffer.from(d.buffer) : d);

/** Zawartość zdjęcia (z R2/S3 albo z bazy dla starszych zdjęć). */
async function readMedia(media) {
    if (media.storageKey) return get(media.storageKey);
    return toBuffer(media.data);
}

/**
 * Po zapisaniu dokumentów TaskMedia (z danymi w bazie) przenosi je do R2/S3, jeśli jest skonfigurowane.
 * Błąd wysyłki nie przerywa pracy — zdjęcie zostaje w bazie i przeniesie je migracja.
 */
async function offload(Model, docs) {
    if (!configured()) return 0;
    let moved = 0;
    for (const d of docs) {
        try {
            const key = mediaKey(String(d.task), String(d._id), d.contentType);
            await put(key, toBuffer(d.data), d.contentType);
            await Model.updateOne({ _id: d._id }, { $set: { storageKey: key }, $unset: { data: 1 } });
            moved++;
        } catch (error) {
            console.warn('[storage] nie przeniesiono zdjęcia', String(d._id), error.message);
        }
    }
    return moved;
}

async function removeMedia(media) {
    if (media.storageKey && configured()) await del(media.storageKey).catch(error => console.warn('[storage] usuwanie', error.message));
}

/** Migracja: przenosi istniejące zdjęcia z MongoDB do R2/S3 partiami. */
async function migrate(Model, { batch = 50, limit = Infinity, log = () => {} } = {}) {
    if (!configured()) throw new Error('Najpierw ustaw zmienne S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY');
    let total = 0;
    for (;;) {
        const docs = await Model.find({ $or: [{ storageKey: '' }, { storageKey: { $exists: false } }], data: { $exists: true } }).select('+data task contentType').limit(batch).lean();
        if (!docs.length) break;
        const moved = await offload(Model, docs);
        total += moved;
        log(total);
        if (!moved || total >= limit) break;
    }
    return total;
}

module.exports = { configured, put, get, del, selfTest, readMedia, offload, removeMedia, migrate, mediaKey };
