'use strict';

/**
 * 8.0: ikony strony dla Google i przeglądarek (zamiast szarego globusa w wynikach wyszukiwania).
 * Google wymaga favicony w rozmiarze będącym wielokrotnością 48 px, dostępnej pod stałym adresem
 * i niezablokowanej w robots.txt — dlatego ikony leżą w katalogu głównym strony (nie w /revmi).
 * Generuje: favicon.svg, favicon.ico (16/32/48), favicon-48x48.png, favicon-96x96.png, favicon-192x192.png,
 * favicon-512x512.png, apple-touch-icon.png (180), site.webmanifest i obrazek do udostępnień assets/brand/og-revserwis.png.
 */
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'Public');
const MINT = '#03F0BE';
const BG = '#121317';

// Znak „R” RevSerwis (wektorowo, odwzorowany z logo).
const MARK = `<path d="M562 312H851L1052 525L838 740H673L453 964H261L596 618H760L848 525L698 374L432 643H240Z" fill="${MINT}"/><path d="M724 814L851 966H589Z" fill="${MINT}"/>`;
const svg = (rounded = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="196 189 900 900"><rect x="196" y="189" width="900" height="900" ${rounded ? 'rx="200"' : ''} fill="${BG}"/>${MARK}</svg>`;

function ico(pngs) {
    // Plik ICO z wpisami PNG (obsługiwany przez wszystkie współczesne przeglądarki i Google).
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(pngs.length, 4);
    const entries = [];
    let offset = 6 + 16 * pngs.length;
    for (const { size, data } of pngs) {
        const e = Buffer.alloc(16);
        e.writeUInt8(size >= 256 ? 0 : size, 0);
        e.writeUInt8(size >= 256 ? 0 : size, 1);
        e.writeUInt8(0, 2);
        e.writeUInt8(0, 3);
        e.writeUInt16LE(1, 4);
        e.writeUInt16LE(32, 6);
        e.writeUInt32LE(data.length, 8);
        e.writeUInt32LE(offset, 12);
        offset += data.length;
        entries.push(e);
    }
    return Buffer.concat([header, ...entries, ...pngs.map(p => p.data)]);
}

async function main() {
    let sharp;
    try { sharp = require('sharp'); } catch { console.warn('[favicons] brak sharp — pomijam'); return; }
    fs.writeFileSync(path.join(PUB, 'favicon.svg'), svg(true));
    const render = (size, rounded = true) => sharp(Buffer.from(svg(rounded)), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
    const sizes = { 16: null, 32: null, 48: null, 96: null, 180: null, 192: null, 512: null };
    for (const s of Object.keys(sizes)) sizes[s] = await render(Number(s), Number(s) !== 180);
    fs.writeFileSync(path.join(PUB, 'favicon.ico'), ico([16, 32, 48].map(size => ({ size, data: sizes[size] }))));
    for (const s of [48, 96, 192, 512]) fs.writeFileSync(path.join(PUB, `favicon-${s}x${s}.png`), sizes[s]);
    fs.writeFileSync(path.join(PUB, 'apple-touch-icon.png'), sizes[180]);
    fs.writeFileSync(path.join(PUB, 'site.webmanifest'), JSON.stringify({
        name: 'RevSerwis', short_name: 'RevSerwis', start_url: '/', display: 'browser', background_color: '#030303', theme_color: '#030303',
        icons: [{ src: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' }, { src: '/favicon-512x512.png', sizes: '512x512', type: 'image/png' }]
    }, null, 2));

    // Obrazek do udostępnień (Facebook, WhatsApp, Google Discover) 1200×630.
    const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><radialGradient id="g" cx="50%" cy="0%" r="80%"><stop offset="0" stop-color="#03F0BE" stop-opacity=".22"/><stop offset="1" stop-color="#030303" stop-opacity="0"/></radialGradient></defs>
<rect width="1200" height="630" fill="#030303"/><rect width="1200" height="630" fill="url(#g)"/>
<g transform="translate(90 165) scale(0.33)"><g transform="translate(-196 -189)">${MARK}</g></g>
<text x="420" y="285" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="800" fill="#ffffff">Rev<tspan fill="#03F0BE">Serwis</tspan></text>
<text x="424" y="350" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#c9d1cf">Przeprowadzki · Opróżnianie i wywóz · Transport</text>
<text x="424" y="398" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#c9d1cf">Odśnieżanie · Ogród i działka</text>
<text x="424" y="478" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#03F0BE">Słupsk · cała Polska · tel. 735 396 534</text></svg>`;
    fs.mkdirSync(path.join(PUB, 'assets', 'brand'), { recursive: true });
    fs.writeFileSync(path.join(PUB, 'assets', 'brand', 'og-revserwis.png'), await sharp(Buffer.from(og)).png().toBuffer());
    console.log('[favicons] OK');
}

main().catch(e => console.warn('[favicons] pominięto:', e.message));
