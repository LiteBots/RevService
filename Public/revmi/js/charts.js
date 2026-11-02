/* RevMi 2.1.0 — wykresy SVG (linia z wypełnieniem, sparkline, pierścień) i mapa OSM bez bibliotek */
import { esc, money } from './core.js';

let uid = 0;

/**
 * Wykres liniowy z wypełnieniem. series = [{ label, value }], compare = [liczby] (linia przerywana, opcjonalnie),
 * mark = indeks wyróżnionego punktu (dymek z kwotą).
 */
export function areaChart(series, { compare = null, mark = series.length - 1, height = 170, width = 800, format = money } = {}) {
  const w = Math.max(240, Math.round(width)), h = height, n = series.length;
  if (!n) return '';
  const id = 'ga' + (++uid);
  const vals = series.map(s => s.value);
  const max = Math.max(1, ...vals, ...(compare || [])) * 1.18;
  const x = i => (n === 1 ? w / 2 : (i * w) / (n - 1));
  const y = v => h - (v / max) * h;
  const path = arr => arr.reduce((s, v, i) => {
    if (!i) return `M${x(i)},${y(v)}`;
    const cx = (x(i - 1) + x(i)) / 2;
    return s + ` C${cx},${y(arr[i - 1])} ${cx},${y(v)} ${x(i)},${y(v)}`;
  }, '');
  const line = path(vals);
  const mi = Math.max(0, Math.min(n - 1, mark));
  const mx = x(mi), my = y(vals[mi]);
  const tipX = Math.max(0, Math.min(w - 130, mx - 65));
  const tipY = Math.max(-6, my - 54);
  return `<svg class="chart-area" viewBox="0 -8 ${w} ${h + 34}" width="${w}" height="${h + 34}" role="img" aria-label="Wykres przychodu">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03f0ba" stop-opacity=".36"/><stop offset="1" stop-color="#03f0ba" stop-opacity="0"/></linearGradient>
    <filter id="${id}b"><feGaussianBlur stdDeviation="4"/></filter></defs>
    ${[1, 2, 3].map(k => `<line x1="0" x2="${w}" y1="${(h * k) / 4}" y2="${(h * k) / 4}" stroke="currentColor" stroke-opacity=".07" stroke-dasharray="3 5"/>`).join('')}
    ${compare ? `<path d="${path(compare)}" fill="none" stroke="#5b9bff" stroke-width="2" stroke-dasharray="5 6" opacity=".75"/>` : ''}
    <path d="${line} L${w},${h} L0,${h}Z" fill="url(#${id})"/>
    <path d="${line}" fill="none" stroke="#03f0ba" stroke-width="6" opacity=".3" filter="url(#${id}b)"/>
    <path d="${line}" fill="none" stroke="#03f0ba" stroke-width="2.6"/>
    <line x1="${mx}" x2="${mx}" y1="${my}" y2="${h}" stroke="#03f0ba" stroke-opacity=".45" stroke-dasharray="3 4"/>
    <circle cx="${mx}" cy="${my}" r="6" fill="var(--bg)" stroke="#03f0ba" stroke-width="3"/>
    <g class="chart-tip" transform="translate(${tipX},${tipY})"><rect width="130" height="40" rx="10"/><text x="12" y="16">${esc(series[mi].label)}</text><text class="v" x="12" y="32">${esc(format(vals[mi]))}</text></g>
    ${series.map((s, i) => `<text x="${x(i)}" y="${h + 24}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(s.label)}</text>`).join('')}
  </svg>`;
}

export function sparkline(vals, color = '#5b9bff', w = 84, h = 30) {
  if (!vals.length) return '';
  const max = Math.max(...vals), min = Math.min(...vals), span = max - min || 1, n = vals.length;
  const pts = vals.map((v, i) => `${((i * w) / Math.max(1, n - 1)).toFixed(1)},${(h - 4 - ((v - min) / span) * (h - 8)).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Pierścień udziałów. parts = [[udział 0..1, kolor]]. */
export function donut(parts, size = 150, sw = 18) {
  const r = (size - sw) / 2, C = 2 * Math.PI * r;
  let off = 0;
  return `<svg width="${size}" height="${size}" style="transform:rotate(-90deg)" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".07" stroke-width="${sw}"/>
    ${parts.filter(([v]) => v > 0).map(([v, c]) => { const len = Math.max(0, v * C - 4); const s = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${len} ${C}" stroke-dashoffset="${-off}"/>`; off += v * C; return s; }).join('')}</svg>`;
}

/* ------------------------------------------------------------------ */
/* Mapa: kafelki OpenStreetMap + znaczniki (bez Leafleta)              */
/* ------------------------------------------------------------------ */

const lon2x = (lon, z) => ((lon + 180) / 360) * 256 * 2 ** z;
const lat2y = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * 2 ** z; };
const SLUPSK = { lat: 54.4641, lon: 17.0287 };

/**
 * Statyczna mapa dopasowana do punktów. points = [{ lat, lon, label, color: 'mint'|'blue'|…, title }].
 * Zwraca HTML o wymiarach w×h (px); szerokość można rozciągnąć CSS-em — mapa jest wyśrodkowana.
 */
export function osmMap(points, { w = 520, h = 260, maxZoom = 13 } = {}) {
  const pts = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  let z = maxZoom;
  const center = pts.length ? { lat: (Math.min(...pts.map(p => p.lat)) + Math.max(...pts.map(p => p.lat))) / 2, lon: (Math.min(...pts.map(p => p.lon)) + Math.max(...pts.map(p => p.lon))) / 2 } : SLUPSK;
  if (pts.length > 1) {
    for (; z > 5; z -= 1) {
      const xs = pts.map(p => lon2x(p.lon, z)), ys = pts.map(p => lat2y(p.lat, z));
      if (Math.max(...xs) - Math.min(...xs) < w - 70 && Math.max(...ys) - Math.min(...ys) < h - 90) break;
    }
  } else if (!pts.length) z = 9;
  const cx = lon2x(center.lon, z), cy = lat2y(center.lat, z);
  const left = cx - w / 2, top = cy - h / 2;
  const t0x = Math.floor(left / 256), t0y = Math.floor(top / 256), t1x = Math.floor((left + w) / 256), t1y = Math.floor((top + h) / 256);
  const max = 2 ** z;
  let tiles = '';
  for (let tx = t0x; tx <= t1x; tx += 1) for (let ty = t0y; ty <= t1y; ty += 1) {
    if (ty < 0 || ty >= max) continue;
    const wx = ((tx % max) + max) % max;
    tiles += `<img src="https://${'abc'[(wx + ty) % 3]}.tile.openstreetmap.org/${z}/${wx}/${ty}.png" alt="" loading="lazy" style="left:${tx * 256 - left}px;top:${ty * 256 - top}px">`;
  }
  const marks = pts.map(p => `<span class="mk c-${p.color || 'mint'}" style="left:${lon2x(p.lon, z) - left}px;top:${lat2y(p.lat, z) - top}px" title="${esc(p.title || '')}">${esc(p.label ?? '')}</span>`).join('');
  return `<div class="osm" style="height:${h}px"><div style="position:absolute;left:50%;top:0;width:${w}px;height:${h}px;margin-left:${-w / 2}px"><div class="tiles" style="inset:0">${tiles}</div>${marks}</div><a class="osm-c" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></div>`;
}

/** Wstawia wykres dopasowany do szerokości kontenera i przerysowuje go przy zmianie rozmiaru okna. */
export function mountAreaChart(box, series, opts = {}) {
  const draw = () => { box.innerHTML = areaChart(series, { ...opts, width: box.clientWidth || 800 }); };
  draw();
  let t;
  const onResize = () => { clearTimeout(t); t = setTimeout(() => { if (box.isConnected) draw(); else window.removeEventListener('resize', onResize); }, 150); };
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}
