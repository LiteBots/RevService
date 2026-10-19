'use strict';

/**
 * Lekki generator klas narzędziowych (podzbiór Tailwind CSS) dla strony RevSerwis.
 * Skanuje Public/*.html i Public/assets/*.js, a potem zapisuje Public/assets/tailwind.css.
 * Dzięki temu wygląd strony nie zależy od instalacji Tailwinda podczas wdrożenia.
 *
 *   node scripts/build-utilities.js
 */

const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'Public');
const OUT = path.join(PUBLIC, 'assets', 'tailwind.css');

/* ---------------------------------------------------------------- */
const COLORS = {
    white: '#ffffff', black: '#000000', transparent: 'transparent',
    'brand-400': '#3ef5c8', 'brand-500': '#03f0ba', 'brand-600': '#00c99a', 'brand-700': '#00a37e', 'brand-900': '#013d2f',
    'dark-900': '#030303', 'dark-800': '#0a0a0a', 'dark-700': '#121212', 'dark-600': '#1a1a1a',
    'gray-300': '#d1d5db', 'gray-400': '#9ca3af', 'gray-500': '#6b7280', 'gray-600': '#4b5563',
    'blue-900': '#1e3a8a', 'emerald-700': '#047857'
};
const SCREENS = { sm: 640, md: 768, lg: 1024, xl: 1280 };
const FONT_SIZE = {
    xs: ['.75rem', '1rem'], sm: ['.875rem', '1.25rem'], base: ['1rem', '1.5rem'], lg: ['1.125rem', '1.75rem'], xl: ['1.25rem', '1.75rem'],
    '2xl': ['1.5rem', '2rem'], '3xl': ['1.875rem', '2.25rem'], '4xl': ['2.25rem', '2.5rem'], '5xl': ['3rem', '1'], '6xl': ['3.75rem', '1'],
    '7xl': ['4.5rem', '1'], '8xl': ['6rem', '1'], '9xl': ['8rem', '1']
};
const WEIGHT = { thin: 100, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
const MAXW = { xs: '20rem', sm: '24rem', md: '28rem', lg: '32rem', xl: '36rem', '2xl': '42rem', '3xl': '48rem', '4xl': '56rem', '5xl': '64rem', '6xl': '72rem', '7xl': '80rem', full: '100%', none: 'none' };
const RADIUS = { none: '0', sm: '.125rem', '': '.25rem', md: '.375rem', lg: '.5rem', xl: '.75rem', '2xl': '1rem', '3xl': '1.5rem', full: '9999px' };
const BLUR = { sm: '4px', '': '8px', md: '12px', lg: '16px', xl: '24px', '2xl': '40px', '3xl': '64px' };
const TRACKING = { tighter: '-.05em', tight: '-.025em', normal: '0', wide: '.025em', wider: '.05em', widest: '.1em' };
const LEADING = { none: '1', tight: '1.25', snug: '1.375', normal: '1.5', relaxed: '1.625', loose: '2' };

const arb = v => v.replace(/_/g, ' ');
function spacing(v) {
    if (v === 'px') return '1px';
    if (v === 'auto') return 'auto';
    if (v === 'full') return '100%';
    if (v === 'screen') return '100vh';
    if (/^\[.+\]$/.test(v)) return arb(v.slice(1, -1));
    if (/^\d+\/\d+$/.test(v)) { const [a, b] = v.split('/').map(Number); return +(a / b * 100).toFixed(6) + '%'; }
    if (/^\d+(\.\d+)?$/.test(v)) return v === '0' ? '0px' : +(Number(v) * 0.25).toFixed(4) + 'rem';
    return null;
}
function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function color(v) {
    let [name, alpha] = v.split('/');
    if (!(name in COLORS)) return null;
    const c = COLORS[name];
    if (c === 'transparent') return 'transparent';
    let a = 1;
    if (alpha) a = /^\[.+\]$/.test(alpha) ? Number(alpha.slice(1, -1)) : Number(alpha) / 100;
    if (Number.isNaN(a)) return null;
    const [r, g, b] = hexToRgb(c);
    return a === 1 ? c : `rgb(${r} ${g} ${b} / ${+a.toFixed(3)})`;
}
const transparentOf = c => {
    if (c === 'transparent') return 'rgb(0 0 0 / 0)';
    if (c.startsWith('#')) { const [r, g, b] = hexToRgb(c); return `rgb(${r} ${g} ${b} / 0)`; }
    return c.replace(/\/ [\d.]+\)$/, '/ 0)');
};

const TRANSFORM = 'transform:translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) scale(var(--tw-scale-x),var(--tw-scale-y))';

/** Zwraca deklaracje dla klasy bez prefiksów albo null. Może zwrócić { sel: fn, decl } dla selektorów specjalnych. */
function rule(cls) {
    const neg = cls.startsWith('-');
    const c = neg ? cls.slice(1) : cls;
    const n = x => (neg && x ? (x === '0px' ? x : '-' + x) : x);
    let m;

    const STATIC = {
        flex: 'display:flex', 'inline-flex': 'display:inline-flex', grid: 'display:grid', block: 'display:block', 'inline-block': 'display:inline-block', hidden: 'display:none',
        'flex-col': 'flex-direction:column', 'flex-row': 'flex-direction:row', 'flex-wrap': 'flex-wrap:wrap', 'flex-1': 'flex:1 1 0%', 'flex-grow': 'flex-grow:1', 'flex-shrink-0': 'flex-shrink:0', 'shrink-0': 'flex-shrink:0',
        'items-center': 'align-items:center', 'items-start': 'align-items:flex-start', 'items-end': 'align-items:flex-end',
        'justify-between': 'justify-content:space-between', 'justify-center': 'justify-content:center', 'justify-end': 'justify-content:flex-end',
        'auto-rows-fr': 'grid-auto-rows:minmax(0,1fr)',
        relative: 'position:relative', absolute: 'position:absolute', fixed: 'position:fixed', sticky: 'position:sticky',
        'overflow-hidden': 'overflow:hidden', 'overflow-x-hidden': 'overflow-x:hidden',
        'pointer-events-none': 'pointer-events:none', 'cursor-pointer': 'cursor:pointer',
        uppercase: 'text-transform:uppercase', 'text-center': 'text-align:center', 'text-left': 'text-align:left',
        'font-mono': 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace', 'break-all': 'word-break:break-all', 'align-top': 'vertical-align:top',
        'bg-clip-text': '-webkit-background-clip:text;background-clip:text', 'text-transparent': 'color:transparent',
        'min-h-screen': 'min-height:100vh', 'scroll-smooth': 'scroll-behavior:smooth',
        border: 'border-width:1px', 'border-t': 'border-top-width:1px', 'border-b': 'border-bottom-width:1px', 'border-2': 'border-width:2px', 'border-4': 'border-width:4px',
        'shadow-2xl': 'box-shadow:0 25px 50px -12px rgb(0 0 0 / .25)',
        'backdrop-blur-md': '-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)', 'backdrop-blur-xl': '-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px)',
        transform: TRANSFORM,
        'transition-all': 'transition-property:all;transition-timing-function:cubic-bezier(.4,0,.2,1);transition-duration:150ms',
        'transition-colors': 'transition-property:color,background-color,border-color,fill,stroke;transition-timing-function:cubic-bezier(.4,0,.2,1);transition-duration:150ms',
        'transition-transform': 'transition-property:transform;transition-timing-function:cubic-bezier(.4,0,.2,1);transition-duration:150ms',
        'animate-ping': 'animation:rv-ping 1s cubic-bezier(0,0,.2,1) infinite', 'animate-pulse': 'animation:rv-pulse 2s cubic-bezier(.4,0,.6,1) infinite',
        'animate-pulse-slow': 'animation:rv-pulse 4s cubic-bezier(.4,0,.6,1) infinite', 'animate-scanline': 'animation:rv-scanline 8s linear infinite',
        'animate-float': 'animation:rv-float 6s ease-in-out infinite',
        'bg-gradient-radial': 'background-image:radial-gradient(var(--tw-gradient-stops))',
        'mx-auto': 'margin-left:auto;margin-right:auto', 'mt-auto': 'margin-top:auto', 'inset-0': 'inset:0px',
        'w-full': 'width:100%', 'h-full': 'height:100%', 'col-span-full': 'grid-column:1 / -1'
    };
    if (!neg && STATIC[c]) return STATIC[c];

    // Odstępy
    const SP = { p: ['padding'], px: ['padding-left', 'padding-right'], py: ['padding-top', 'padding-bottom'], pt: ['padding-top'], pb: ['padding-bottom'], pl: ['padding-left'], pr: ['padding-right'],
        m: ['margin'], mx: ['margin-left', 'margin-right'], my: ['margin-top', 'margin-bottom'], mt: ['margin-top'], mb: ['margin-bottom'], ml: ['margin-left'], mr: ['margin-right'],
        gap: ['gap'], 'gap-x': ['column-gap'], 'gap-y': ['row-gap'], w: ['width'], h: ['height'], top: ['top'], left: ['left'], right: ['right'], bottom: ['bottom'], inset: ['inset'] };
    if ((m = c.match(/^(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap-x|gap-y|gap|w|h|top|left|right|bottom|inset)-(.+)$/))) {
        const v = spacing(m[2]);
        if (v) return SP[m[1]].map(p => `${p}:${n(v)}`).join(';');
    }
    if ((m = c.match(/^space-(x|y)-(.+)$/))) {
        const v = spacing(m[2]);
        if (v) return { sel: s => `${s}>:not([hidden])~:not([hidden])`, decl: m[1] === 'x' ? `margin-left:${n(v)}` : `margin-top:${n(v)}` };
    }
    if ((m = c.match(/^min-h-\[(.+)\]$/))) return `min-height:${arb(m[1])}`;
    if ((m = c.match(/^max-w-(.+)$/)) && MAXW[m[1]]) return `max-width:${MAXW[m[1]]}`;
    if ((m = c.match(/^grid-cols-(\d+)$/))) return `grid-template-columns:repeat(${m[1]},minmax(0,1fr))`;
    if ((m = c.match(/^col-span-(\d+)$/))) return `grid-column:span ${m[1]} / span ${m[1]}`;
    if ((m = c.match(/^z-(\d+)$/))) return `z-index:${m[1]}`;
    if ((m = c.match(/^opacity-(\d+)$/))) return `opacity:${Number(m[1]) / 100}`;
    if ((m = c.match(/^duration-(\d+)$/))) return `transition-duration:${m[1]}ms`;

    // Typografia
    if ((m = c.match(/^text-(xs|sm|base|lg|xl|\dxl)$/)) && FONT_SIZE[m[1]]) return `font-size:${FONT_SIZE[m[1]][0]};line-height:${FONT_SIZE[m[1]][1]}`;
    if ((m = c.match(/^text-\[(\d.*)\]$/))) return `font-size:${arb(m[1])}`;
    if ((m = c.match(/^font-(.+)$/)) && WEIGHT[m[1]]) return `font-weight:${WEIGHT[m[1]]}`;
    if ((m = c.match(/^tracking-(.+)$/)) && TRACKING[m[1]]) return `letter-spacing:${TRACKING[m[1]]}`;
    if ((m = c.match(/^leading-(.+)$/))) { const v = LEADING[m[1]] || (/^\[.+\]$/.test(m[1]) ? arb(m[1].slice(1, -1)) : null); if (v) return `line-height:${v}`; }

    // Kolory
    if ((m = c.match(/^(text|bg|border-t|border-b|border)-(.+)$/))) {
        const col = color(m[2]);
        if (col) return { text: 'color', bg: 'background-color', border: 'border-color', 'border-t': 'border-top-color', 'border-b': 'border-bottom-color' }[m[1]] + ':' + col;
    }
    if ((m = c.match(/^bg-\[(url\(.+\))\]$/))) return `background-image:${m[1]}`;
    if ((m = c.match(/^from-(.+)$/)) && color(m[1])) { const col = color(m[1]); return `--tw-gradient-from:${col};--tw-gradient-to:${transparentOf(col)};--tw-gradient-stops:var(--tw-gradient-from),var(--tw-gradient-to)`; }
    if ((m = c.match(/^via-(.+)$/)) && color(m[1])) { const col = color(m[1]); return `--tw-gradient-to:${transparentOf(col)};--tw-gradient-stops:var(--tw-gradient-from),${col},var(--tw-gradient-to)`; }
    if ((m = c.match(/^to-(.+)$/)) && color(m[1])) return `--tw-gradient-to:${color(m[1])}`;
    if ((m = c.match(/^bg-gradient-to-(t|tr|r|br|b|bl|l|tl)$/))) {
        const dir = { t: 'top', tr: 'top right', r: 'right', br: 'bottom right', b: 'bottom', bl: 'bottom left', l: 'left', tl: 'top left' }[m[1]];
        return `background-image:linear-gradient(to ${dir},var(--tw-gradient-stops))`;
    }

    // Obramowania, cienie, filtry
    if ((m = c.match(/^rounded(?:-(.+))?$/))) {
        const k = m[1] || '';
        if (RADIUS[k] !== undefined) return `border-radius:${RADIUS[k]}`;
        if (/^\[.+\]$/.test(k)) return `border-radius:${arb(k.slice(1, -1))}`;
    }
    if ((m = c.match(/^shadow-\[(.+)\]$/))) return `box-shadow:${arb(m[1])}`;
    if ((m = c.match(/^blur(?:-(.+))?$/))) {
        const k = m[1] || '';
        const v = BLUR[k] !== undefined ? BLUR[k] : (/^\[.+\]$/.test(k) ? arb(k.slice(1, -1)) : null);
        if (v) return `filter:blur(${v})`;
    }

    // Transformacje
    if ((m = c.match(/^translate-(x|y)-(.+)$/))) { const v = spacing(m[2]); if (v) return `--tw-translate-${m[1]}:${n(v)};${TRANSFORM}`; }
    if ((m = c.match(/^scale-(\d+)$/))) return `--tw-scale-x:${Number(m[1]) / 100};--tw-scale-y:${Number(m[1]) / 100};${TRANSFORM}`;
    return null;
}

const escapeClass = s => s.replace(/[^a-zA-Z0-9_-]/g, ch => '\\' + ch);

function build() {
    const files = [
        ...fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html')).map(f => path.join(PUBLIC, f)),
        ...fs.readdirSync(path.join(PUBLIC, 'assets')).filter(f => f.endsWith('.js')).map(f => path.join(PUBLIC, 'assets', f))
    ];
    const classes = new Set();
    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        for (const m of text.matchAll(/class(?:Name)?=(?:"([^"]+)"|'([^']+)')/g)) (m[1] || m[2]).split(/\s+/).forEach(c => c && classes.add(c));
    }

    const buckets = { base: [], sm: [], md: [], lg: [], xl: [] };
    const unknown = [];
    for (const full of [...classes].sort()) {
        // Dzielimy po „:” tylko poza nawiasami [..] (np. bg-[url('data:…')]).
        const parts = [];
        let buf = '', depth = 0;
        for (const ch of full) {
            if (ch === '[') depth++;
            if (ch === ']') depth--;
            if (ch === ':' && depth === 0) { parts.push(buf); buf = ''; } else buf += ch;
        }
        const base = buf;
        let screen = 'base';
        let state = '';
        let group = false;
        let ok = true;
        for (const p of parts) {
            if (SCREENS[p]) screen = p;
            else if (p === 'hover') state = ':hover';
            else if (p === 'focus') state = ':focus';
            else if (p === 'group-hover') group = true;
            else ok = false;
        }
        const r = ok ? rule(base) : null;
        if (!r) { if (/^[a-z-]+[-:]/.test(full) && !/^(rv|sh|sf|qf|fa)-/.test(full)) unknown.push(full); continue; }
        let sel = '.' + escapeClass(full) + state;
        if (group) sel = '.group:hover .' + escapeClass(full);
        const decl = typeof r === 'string' ? r : r.decl;
        if (typeof r === 'object') sel = r.sel(sel);
        buckets[screen].push(`${sel}{${decl}}`);
    }

    const preflight = `/* RevSerwis — klasy narzędziowe (generowane: npm run build:css) */
*,::before,::after{box-sizing:border-box;border:0 solid #e5e7eb;--tw-translate-x:0;--tw-translate-y:0;--tw-rotate:0;--tw-scale-x:1;--tw-scale-y:1}
html{line-height:1.5;-webkit-text-size-adjust:100%;tab-size:4;font-family:"Plus Jakarta Sans",ui-sans-serif,system-ui,sans-serif}
body{margin:0;line-height:inherit}
h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit;margin:0}
a{color:inherit;text-decoration:inherit}
b,strong{font-weight:bolder}
button,input,optgroup,select,textarea{font-family:inherit;font-size:100%;font-weight:inherit;line-height:inherit;color:inherit;margin:0;padding:0}
button,select{text-transform:none}
button,[type=button],[type=reset],[type=submit]{-webkit-appearance:button;background-color:transparent;background-image:none}
blockquote,dl,dd,figure,hr,p,pre{margin:0}
ol,ul,menu{list-style:none;margin:0;padding:0}
textarea{resize:vertical}
input::placeholder,textarea::placeholder{opacity:1;color:#9ca3af}
button,[role=button]{cursor:pointer}
img,svg,video,canvas,audio,iframe,embed,object{display:block;vertical-align:middle}
img,video{max-width:100%;height:auto}
[hidden]{display:none}
@keyframes rv-ping{75%,100%{transform:scale(2);opacity:0}}
@keyframes rv-pulse{50%{opacity:.5}}
@keyframes rv-scanline{0%{transform:translateY(-100%)}100%{transform:translateY(100%)}}
@keyframes rv-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-15px)}}
`;
    let css = preflight + buckets.base.join('\n') + '\n';
    for (const s of ['sm', 'md', 'lg', 'xl']) if (buckets[s].length) css += `@media (min-width:${SCREENS[s]}px){\n${buckets[s].join('\n')}\n}\n`;
    fs.writeFileSync(OUT, css);
    return { count: classes.size, rules: Object.values(buckets).reduce((a, b) => a + b.length, 0), unknown };
}

if (require.main === module) {
    const r = build();
    console.log(`[css] ${r.rules} reguł → Public/assets/tailwind.css`);
    if (r.unknown.length) console.log('[css] pominięte klasy:', r.unknown.join(' '));
}
module.exports = { build, rule };
