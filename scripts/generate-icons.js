'use strict';

/**
 * Generuje ikony aplikacji RevMi (PWA, iOS, powiadomienia) z logo RevSerwis.
 * Kolejność źródeł:
 *   1. assets-src/logo.png (jeśli wrzucisz plik logo do repozytorium),
 *   2. logo z adresu LOGO_URL (domyślnie https://i.imgur.com/dHWDH8j.png),
 *   3. wbudowany znak zastępczy (gdy brak internetu podczas builda).
 * Skrypt nigdy nie przerywa wdrożenia — w razie błędu zostawia istniejące ikony.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'Public', 'revmi', 'icons');
const LOCAL = path.join(__dirname, '..', 'assets-src', 'logo.png');
const LOGO_URL = process.env.LOGO_URL || 'https://i.imgur.com/dHWDH8j.png';
const BG = process.env.ICON_BG || '#16171b';

const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#059669"/></linearGradient></defs>
<rect width="512" height="512" fill="${BG}"/>
<path d="M150 380V132h118c58 0 94 30 94 78 0 36-20 61-54 72l62 98h-62l-55-90h-49v90zm54-136h60c28 0 44-13 44-35s-16-34-44-34h-60z" fill="url(#g)"/>
<circle cx="380" cy="372" r="18" fill="#34d399"/></svg>`;

function download(url, redirects = 3) {
    return new Promise((resolve, reject) => {
        https.get(url, { timeout: 10_000 }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
                res.resume();
                return resolve(download(res.headers.location, redirects - 1));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error('HTTP ' + res.statusCode));
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
    });
}

async function loadLogo() {
    if (fs.existsSync(LOCAL)) return { buffer: fs.readFileSync(LOCAL), source: 'assets-src/logo.png' };
    if (process.env.SKIP_LOGO_DOWNLOAD !== 'true') {
        try {
            return { buffer: await download(LOGO_URL), source: LOGO_URL };
        } catch (error) {
            console.warn('[icons] Nie udało się pobrać logo:', error.message);
        }
    }
    return null;
}

async function main() {
    let sharp;
    try {
        sharp = require('sharp');
    } catch {
        console.warn('[icons] Brak modułu sharp — pomijam generowanie ikon.');
        return;
    }
    fs.mkdirSync(OUT, { recursive: true });

    const logo = await loadLogo();
    if (!logo) {
        if (fs.existsSync(path.join(OUT, 'icon-512.png')) && process.env.FORCE_FALLBACK_ICONS !== 'true') {
            console.log('[icons] Zostawiam istniejące ikony.');
            return;
        }
        const base = await sharp(Buffer.from(FALLBACK_SVG)).png().toBuffer();
        await writeSet(sharp, base, { padded: false });
        console.log('[icons] Wygenerowano ikony zastępcze.');
        return;
    }

    // Logo bez przezroczystości: tło (kolor z rogu) zamieniamy na przezroczyste,
    // przycinamy marginesy i centrujemy znak na ciemnym tle ikony.
    const transparent = await keyOutBackground(sharp, logo.buffer);
    const trimmed = await sharp(transparent).trim().png().toBuffer();
    await writeSet(sharp, trimmed, { padded: true });
    console.log('[icons] Ikony wygenerowane z logo:', logo.source);
}

async function keyOutBackground(sharp, input) {
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    // Jeśli obraz ma już przezroczyste tło — zostawiamy go bez zmian.
    if (data[3] < 250) return sharp(input).png().toBuffer();
    const bg = [data[0], data[1], data[2]];
    const out = Buffer.from(data);
    for (let i = 0; i < out.length; i += ch) {
        const dist = Math.max(Math.abs(out[i] - bg[0]), Math.abs(out[i + 1] - bg[1]), Math.abs(out[i + 2] - bg[2]));
        out[i + 3] = dist < 24 ? 0 : dist > 96 ? 255 : Math.round(((dist - 24) / 72) * 255);
    }
    return sharp(out, { raw: { width: info.width, height: info.height, channels: ch } }).png().toBuffer();
}

async function composeSquare(sharp, logoPng, size, scale, background = BG) {
    const inner = Math.round(size * scale);
    const resized = await sharp(logoPng).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background } })
        .composite([{ input: resized, gravity: 'center' }])
        .png()
        .toBuffer();
}

async function writeSet(sharp, logoPng, { padded }) {
    const scale = padded ? 0.78 : 1;
    const out = name => path.join(OUT, name);
    await fs.promises.writeFile(out('icon-192.png'), await composeSquare(sharp, logoPng, 192, scale));
    await fs.promises.writeFile(out('icon-512.png'), await composeSquare(sharp, logoPng, 512, scale));
    // Maskable: bezpieczna strefa 80% — logo mniejsze.
    await fs.promises.writeFile(out('maskable-512.png'), await composeSquare(sharp, logoPng, 512, padded ? 0.6 : 0.8));
    await fs.promises.writeFile(out('apple-touch-icon.png'), await composeSquare(sharp, logoPng, 180, padded ? 0.72 : 1));
    // Sam znak (przezroczyste tło) do interfejsu panelu.
    await fs.promises.writeFile(out('mark-256.png'), await sharp(logoPng).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer());
    await fs.promises.writeFile(out('favicon-32.png'), await composeSquare(sharp, logoPng, 32, padded ? 0.9 : 1));

    // Android: ikona na pasku stanu musi być jednokolorowa (biała sylwetka na przezroczystym tle).
    const silhouetteSource = padded ? logoPng : await sharp(Buffer.from(FALLBACK_SVG.replace(`<rect width="512" height="512" fill="${BG}"/>`, ''))).png().toBuffer();
    const alpha = await sharp(silhouetteSource).resize(80, 80, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().extractChannel('alpha').toBuffer();
    const badge = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#ffffff' } })
        .joinChannel(alpha)
        .png()
        .toBuffer();
    await fs.promises.writeFile(out('badge-96.png'), await sharp({ create: { width: 96, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: badge, gravity: 'center' }]).png().toBuffer());
}

main().catch(error => {
    console.warn('[icons] Pominięto generowanie ikon:', error.message);
});
