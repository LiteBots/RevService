'use strict';

/**
 * RevSerwis 9.0 — strony nowych modułów + linki do nich na całej stronie.
 *
 * 1) Buduje: konto.html (panel klienta), outlet.html, powrot.html, abonamenty.html, partnerzy.html, kariera.html.
 *    Nagłówek, stopka, style i skrypty są kopiowane z index.html — wyglądają jak reszta strony.
 * 2) Dopina do wszystkich stron z nagłówkiem: ikonę „Moje konto”, sekcję w menu mobilnym i linki w stopce.
 * 3) Dopisuje nowe adresy do sitemap.xml.
 *
 * Skrypt jest idempotentny — można go uruchamiać wielokrotnie (np. po `npm run site`). Uruchamia się w `npm run build`.
 */
const fs = require('fs');
const path = require('path');
const P = require('../lib/portal-input');

const pub = path.join(__dirname, '..', 'Public');
const SITE = 'https://www.revserwis.pl';
const V = '9.0.0';
const read = f => fs.readFileSync(path.join(pub, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(pub, f), s);
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);

/* ------------------------------------------------------------------ */
/* Fragmenty z index.html                                              */
/* ------------------------------------------------------------------ */

const index = read('index.html');
const grab = (re, label) => {
    const m = index.match(re);
    if (!m) throw new Error('Nie znaleziono w index.html: ' + label);
    return m[0];
};
const headLinks = [
    ...index.match(/<link rel="icon"[^>]*>|<link rel="apple-touch-icon"[^>]*>|<link rel="manifest"[^>]*>|<link rel="preconnect"[^>]*>|<link href="https:\/\/fonts\.googleapis[^>]*>|<link rel="stylesheet"[^>]*>/g)
].join('\n');
const siteScript = grab(/<script defer src="assets\/site[^"]*\.js"><\/script>/, 'site.js');
let header = grab(/<header class="site-header"[\s\S]*?<\/header>/, 'header');
let footer = grab(/<footer class="site-footer"[\s\S]*?<\/footer>/, 'footer');
const mobileBar = grab(/<div class="rv-mobile-bar"[\s\S]*?<\/div>/, 'mobile bar');
const waFloat = grab(/<a class="rv-wa-float"[\s\S]*?<\/a>/, 'WhatsApp');

/* ------------------------------------------------------------------ */
/* Linki 9.0 — wstrzykiwane w każdą stronę (aktualizowane przy każdym  */
/* uruchomieniu: najpierw usuwamy starą wersję, potem wstawiamy nową)  */
/* ------------------------------------------------------------------ */

const MODULES = [
    ['/konto', 'fa-user', 'Moje konto', 'Śledzenie zleceń, historia, magazyn'],
    ['outlet.html', 'fa-couch', 'RevOutlet', 'Meble i AGD z odzysku — z dowozem'],
    ['powrot.html', 'fa-route', 'RevPowrót', 'Wolne miejsce w busie — taniej'],
    ['abonamenty.html', 'fa-rotate', 'Abonamenty', 'Odśnieżanie, ogród, obsługa obiektu'],
    ['partnerzy.html', 'fa-handshake', 'Dla biur nieruchomości', 'Polecaj klientów, zarabiaj prowizję'],
    ['kariera.html', 'fa-briefcase', 'Kariera i franczyza', 'Praca, marketing, RevSerwis w Twoim mieście']
];

const ACCOUNT_BTN = '<a class="sh-account" href="/konto" aria-label="Moje konto — zlecenia, magazyn, abonamenty" title="Moje konto — zlecenia, magazyn, abonamenty"><i class="fa-solid fa-user" aria-hidden="true"></i><span>Moje konto</span></a>';

const NAV = '<!--v9:nav--><div class="sh-drop v9-drop"><button type="button" aria-haspopup="true" aria-expanded="false">Nowości<span class="v9-dot" aria-hidden="true"></span> <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button><div class="sh-menu">' +
    MODULES.map(([h, i, l, d]) => `<a href="${h}"><i class="fa-solid ${i}" aria-hidden="true"></i><span><strong>${l}</strong><small>${d}</small></span></a>`).join('') +
    '</div></div><!--/v9:nav-->';

const MOBILE = '<!--v9:mobile--><div class="label">Konto i nowości</div><div class="v9-mgrid">' +
    MODULES.map(([h, i, l]) => `<a href="${h}"><i class="fa-solid ${i}" aria-hidden="true"></i>${l}</a>`).join('') + '</div><!--/v9:mobile-->';

const HERO = '<!--v9:hero--><nav class="v9-quick" aria-label="Strefa klienta i nowości">' +
    MODULES.map(([h, i, l, d]) => `<a class="v9-q${h === '/konto' ? ' main' : ''}" href="${h}"><i class="fa-solid ${i}" aria-hidden="true"></i><span><strong>${l}</strong><small>${d}</small></span></a>`).join('') +
    '</nav><!--/v9:hero-->';

const CHIPS = '<!--v9:chips--><nav class="v9-chips" aria-label="Konto i nowości">' +
    MODULES.map(([h, i, l]) => `<a href="${h}"${h === '/konto' ? ' class="main"' : ''}><i class="fa-solid ${i}" aria-hidden="true"></i>${l}</a>`).join('') + '</nav><!--/v9:chips-->';

const NEWS = `<!--v9:news--><section class="v9-news" aria-labelledby="v9NewsH"><div class="v9-news-in"><div class="v9-news-txt"><span class="v9-news-ic"><i class="fa-solid fa-envelope-open-text" aria-hidden="true"></i></span><div><h3 id="v9NewsH">Okazje z RevOutlet i wolne kursy prosto na maila</h3><p>Promocje, przypomnienia sezonowe (odśnieżanie, ogród) i rzeczy z drugiej ręki. Maks. 2 wiadomości w miesiącu.</p></div></div>
<form class="v9-news-form" novalidate><input type="email" name="email" placeholder="Twój e-mail" autocomplete="email" required aria-label="E-mail"><input class="v9-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button type="submit">Zapisz się</button>
<label class="v9-news-ok"><input type="checkbox" name="consent" required><span>Chcę dostawać informacje handlowe od Rev Serwis Kacper Taczała na podany e-mail. Mogę się wypisać w każdej chwili (<a href="polityka-prywatnosci.html">polityka prywatności</a>).</span></label><p class="v9-news-msg" role="status"></p></form></div>
<script>(function(){var s=document.currentScript.parentNode,f=s.querySelector('form'),m=s.querySelector('.v9-news-msg');f.addEventListener('submit',function(e){e.preventDefault();m.className='v9-news-msg';if(!f.email.value||!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(f.email.value)){m.textContent='Podaj prawidłowy e-mail.';m.className+=' err';return}if(!f.consent.checked){m.textContent='Zaznacz zgodę, żebyśmy mogli wysyłać oferty.';m.className+=' err';return}var b=f.querySelector('button');b.disabled=true;fetch('/api/newsletter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.email.value.trim(),consent:true,source:'stopka',website:f.website.value})}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.message||'Błąd');return d})}).then(function(d){m.textContent=d.message;m.className+=' ok';f.reset()}).catch(function(err){m.textContent=err.message;m.className+=' err'}).then(function(){b.disabled=false})})})();</script></section><!--/v9:news-->`;

/* 9.2: ocena i liczba opinii Google aktualizowane na bieżąco (z /api/opinie, cache 10 min w przeglądarce) */
const REVIEWS = `<!--v9:reviews--><script>(function(){function pl(n){if(n===1)return'opinia';var d=n%10,t=n%100;return d>=2&&d<=4&&(t<12||t>14)?'opinie':'opinii'}
function apply(r){if(!r||!(r.count>0))return;var rate=String((Math.round(r.rating*10)/10).toFixed(1)).replace('.',',');var re=/^\\s*\\d+\\s+opini(i|e|a)\\s+w\\s+Google\\s*$/;
var all=document.querySelectorAll('span,small,b,strong,p,a');for(var i=0;i<all.length;i++){var el=all[i];if(el.children.length||!re.test(el.textContent))continue;el.textContent=r.count+' '+pl(r.count)+' w Google';
var box=el.closest('a,.rv-rating-big,.sf-rating,.v8-hero-rating,div');if(box){var bs=box.querySelectorAll('b,strong');for(var j=0;j<bs.length;j++){if(/^\\s*\\d[,.]\\d\\s*$/.test(bs[j].textContent))bs[j].textContent=rate}}}}
var k='rv.opinie',c=null;try{c=JSON.parse(sessionStorage.getItem(k)||'null')}catch(e){}
function run(){if(c&&Date.now()-c.t<6e5){apply(c.d);return}fetch('/api/opinie').then(function(x){return x.ok?x.json():null}).then(function(d){if(!d)return;try{sessionStorage.setItem(k,JSON.stringify({t:Date.now(),d:d}))}catch(e){}apply(d)}).catch(function(){})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run()})();</script><!--/v9:reviews-->`;

const FOOT = '<!--v9:foot-->' + MODULES.map(([h, , l]) => `<li><a href="${h}">${l}</a></li>`).join('') + '<!--/v9:foot-->';

const INLINE_STYLE = `<style data-v9>
.sh-account{display:inline-flex;align-items:center;gap:8px;height:46px;padding:0 16px;border-radius:14px;border:1px solid rgba(3,240,186,.45);background:rgba(3,240,186,.1);color:#03f0ba;font-size:14px;font-weight:800;text-decoration:none;white-space:nowrap;transition:background .15s,border-color .15s}
.sh-account:hover{background:rgba(3,240,186,.18);border-color:#03f0ba}
.sh-account i{font-size:15px}
@media(max-width:1440px) and (min-width:1081px){.sh-phone{display:none!important}}
@media(max-width:1200px) and (min-width:1081px){.sh-account span{display:none}.sh-account{width:46px;padding:0;justify-content:center}}
@media(max-width:560px){.sh-account span{display:none}.sh-account{width:44px;height:44px;padding:0;justify-content:center}}
.v9-drop>button{position:relative}
.v9-dot{display:inline-block;width:7px;height:7px;margin-left:6px;border-radius:50%;background:#03f0ba;box-shadow:0 0 0 4px rgba(3,240,186,.18);vertical-align:2px}
.v9-drop .sh-menu{width:600px}
.v9-mgrid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px}
.v9-mgrid a{display:flex;align-items:center;gap:8px;padding:12px;border-radius:14px;border:1px solid rgba(3,240,186,.22);background:rgba(3,240,186,.06);color:#fff;font-weight:700;font-size:14px}
.v9-mgrid a i{color:#03f0ba}
.v9-quick{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin:20px 0 6px;max-width:1100px}
.v9-q{display:flex;gap:10px;align-items:flex-start;padding:13px 14px;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:rgba(10,10,11,.62);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;text-decoration:none;transition:transform .15s,border-color .15s,background .15s}
.v9-q:hover{transform:translateY(-2px);border-color:rgba(3,240,186,.55);background:rgba(10,10,11,.8)}
.v9-q i{width:34px;height:34px;flex:none;display:grid;place-items:center;border-radius:10px;background:rgba(3,240,186,.14);color:#03f0ba;font-size:15px}
.v9-q strong{display:block;font-size:14px;line-height:1.25}
.v9-q small{display:block;margin-top:3px;color:#aab0b8;font-size:12px;line-height:1.35}
.v9-q.main{border-color:rgba(3,240,186,.55);background:rgba(3,240,186,.12)}
@media(max-width:1180px){.v9-quick{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:640px){.v9-quick{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;margin-left:-16px;margin-right:-16px;padding:0 16px 6px;scrollbar-width:none}.v9-quick::-webkit-scrollbar{display:none}.v9-q{flex:0 0 72%;scroll-snap-align:start}}
.v9-chips{display:none}
@media(max-width:640px){.v9-chips{display:flex;gap:8px;overflow-x:auto;margin:0 -16px 16px;padding:0 16px 4px;scrollbar-width:none}.v9-chips::-webkit-scrollbar{display:none}.v9-chips a{flex:none;display:inline-flex;align-items:center;gap:7px;padding:9px 13px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(10,10,11,.7);color:#fff;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap}.v9-chips a i{color:#03f0ba}.v9-chips a.main{border-color:#03f0ba;background:rgba(3,240,186,.14);color:#03f0ba}}
@media(max-width:1280px) and (min-width:1081px){.sh-nav>a[href="obszar-dzialania.html"]{display:none}}
.v9-news{margin:0 0 30px;padding:22px;border-radius:22px;border:1px solid rgba(3,240,186,.28);background:linear-gradient(135deg,rgba(3,240,186,.1),rgba(255,255,255,.02) 60%)}
.v9-news-in{display:grid;grid-template-columns:1.1fr 1fr;gap:20px;align-items:center}
@media(max-width:860px){.v9-news-in{grid-template-columns:1fr}}
.v9-news-txt{display:flex;gap:14px;align-items:flex-start}
.v9-news-ic{width:44px;height:44px;flex:none;display:grid;place-items:center;border-radius:13px;background:rgba(3,240,186,.16);color:#03f0ba;font-size:18px}
.v9-news h3{margin:0 0 4px;font-size:18px;color:#fff;line-height:1.3}
.v9-news p{margin:0;color:#aab0b8;font-size:14px;line-height:1.5}
.v9-news-form{display:grid;grid-template-columns:1fr auto;gap:8px}
.v9-news-form input[type=email]{height:48px;padding:0 14px;border-radius:13px;border:1px solid rgba(255,255,255,.14);background:#0b0c0e;color:#fff;font:inherit;font-size:15px;outline:none;min-width:0}
.v9-news-form input[type=email]:focus{border-color:#03f0ba}
.v9-news-form button{height:48px;padding:0 20px;border-radius:13px;border:0;background:#03f0ba;color:#03241b;font:inherit;font-weight:800;cursor:pointer;white-space:nowrap}
.v9-news-form button[disabled]{opacity:.6}
.v9-news-ok{grid-column:1/-1;display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#8a9099;line-height:1.45;cursor:pointer}
.v9-news-ok input{margin-top:2px;accent-color:#03f0ba;flex:none}
.v9-news-ok a{color:#03f0ba}
.v9-news-msg{grid-column:1/-1;margin:0;font-size:13px;min-height:0}
.v9-news-msg.ok{color:#03f0ba}.v9-news-msg.err{color:#fca5a5}
.v9-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px}
</style>`;

/** Usuwa wszystkie wcześniejsze wstawki 9.0 (także w starym formacie). */
function strip(html) {
    return html
        .replace(/<style data-v9>[\s\S]*?<\/style>\n?/g, '')
        .replace(/<a class="sh-account"[\s\S]*?<\/a>/g, '')
        .replace(/<!--v9:(\w+)-->[\s\S]*?<!--\/v9:\1-->/g, '')
        .replace(/<div class="label" data-v9-mobile>[\s\S]*?(?=\n\s*<div class="sh-mobile-cta">)\n?\s*/g, '')
        .replace(/<li data-v9-foot>[\s\S]*?<\/li>/g, '');
}

function inject(html, { hero = false } = {}) {
    if (!html.includes('class="site-header"')) return html;
    let out = strip(html);
    out = out.replace('</head>', INLINE_STYLE + '\n</head>');
    out = out.replace(/<a class="sh-wa"/, ACCOUNT_BTN + '<a class="sh-wa"');
    out = out.replace(/(<nav class="sh-nav"[\s\S]*?)(<a href="obszar-dzialania\.html")/, `$1${NAV}$2`);
    out = out.replace(/(<div class="sh-mobile" id="mobileMenu" hidden>)/, `$1${MOBILE}`);
    out = out.replace(/(<div class="sf-col"><h3>Firma<\/h3><ul>[\s\S]*?)(<\/ul><\/div>)/, `$1${FOOT}$2`);
    out = out.replace(/(<footer class="site-footer">\s*<div class="sf-inner">)/, `$1${NEWS}`);
    // Kafelki zaraz pod głównymi przyciskami hero — widoczne bez przewijania.
    out = out.replace(/<\/body>/, `${REVIEWS}</body>`);
    if (hero) out = out.replace(/(<div class="v4-actions">[\s\S]*?<\/div>)/, `$1${HERO}`);
    if (hero) out = out.replace(/(<div class="v4-eyebrow">)/, `${CHIPS}$1`);
    return out;
}

// Nagłówek i stopka nowych stron — z index.html bez starych wstawek; nowe wstawki dojdą w inject() przy zapisie.
header = strip(header);
footer = strip(footer);
header = header.replace(/ class="active"/g, ' class=""');

/* ------------------------------------------------------------------ */
/* Szablon strony                                                      */
/* ------------------------------------------------------------------ */

function page({ file, title, description, pageKey, body, noindex = false, scripts = [], inline = '' }) {
    const url = file === 'konto.html' ? `${SITE}/konto` : `${SITE}/${file}`;
    return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : `<link rel="canonical" href="${url}">`}
<meta name="theme-color" content="#030303">
<meta property="og:type" content="website">
<meta property="og:locale" content="pl_PL">
<meta property="og:site_name" content="RevSerwis">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/brand/og-revserwis.png">
${headLinks}
<link rel="stylesheet" href="assets/portal.css?v=${V}">
${siteScript}
<script defer src="assets/portal.js?v=${V}"></script>
${scripts.map(s => `<script defer src="${s}?v=${V}"></script>`).join('\n')}
${inline ? `<script>${inline}</script>` : ''}
<noscript><style>.fade-up{opacity:1;transform:none}</style></noscript>
</head>
<body class="flex flex-col min-h-screen relative overflow-x-hidden" data-page="${pageKey}">
<a class="rv-skip" href="#main-content">Przejdź do treści</a>
${header}
<main class="flex-grow" id="main-content">
${body}
</main>
${footer}
${mobileBar}
${waFloat}
</body>
</html>
`;
}

const hero = ({ eyebrow, icon, h1, lead, actions = '', facts = [] }) => `<section class="pt-hero"><div class="v4-wrap">
  <span class="pt-eyebrow"><i class="fa-solid ${icon}" aria-hidden="true"></i>${eyebrow}</span>
  <h1 class="pt-h1">${h1}</h1>
  <p class="pt-lead">${lead}</p>
  ${actions ? `<div class="pt-actions">${actions}</div>` : ''}
  ${facts.length ? `<ul class="pt-facts">${facts.map(f => `<li><i class="fa-solid fa-check" aria-hidden="true"></i>${f}</li>`).join('')}</ul>` : ''}
</div></section>`;

const steps = (title, items, sub = '') => `<section class="pt-section"><div class="v4-wrap"><h2>${title}</h2>${sub ? `<p class="pt-sub">${sub}</p>` : ''}<div class="pt-steps">${items.map(([h, p]) => `<div class="pt-card"><h3>${h}</h3><p>${p}</p></div>`).join('')}</div></div></section>`;

const cards = (title, items, sub = '') => `<section class="pt-section"><div class="v4-wrap"><h2>${title}</h2>${sub ? `<p class="pt-sub">${sub}</p>` : ''}<div class="pt-grid">${items.map(([i, h, p]) => `<div class="pt-card"><div class="pt-icon"><i class="fa-solid ${i}" aria-hidden="true"></i></div><h3>${h}</h3><p>${p}</p></div>`).join('')}</div></div></section>`;

const faq = items => `<section class="pt-section"><div class="v4-wrap"><h2>Najczęstsze pytania</h2><div style="display:grid;gap:10px;max-width:860px">${items.map(([q, a]) => `<details class="pt-card"><summary style="cursor:pointer;font-weight:700;color:#fff">${q}</summary><p style="margin-top:10px">${a}</p></details>`).join('')}</div></div></section>`;

const faqSchema = items => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) })}</script>`;

/* ------------------------------------------------------------------ */
/* Strony                                                              */
/* ------------------------------------------------------------------ */

const PAGES = [];

PAGES.push({
    file: 'konto.html',
    pageKey: 'konto',
    noindex: true,
    title: 'Moje konto — panel klienta RevSerwis',
    description: 'Panel klienta RevSerwis: śledzenie zleceń, historia usług, RevStorage, abonamenty, RevOutlet i RevPowrót.',
    scripts: ['assets/divisions.js', 'assets/konto.js'],
    inline: `window.RV_PORTAL=${JSON.stringify({ hotelServices: P.HOTEL_SERVICES, weekdays: P.WEEKDAYS })};`,
    body: '<div id="kontoApp" class="kt-auth"><div class="pt-skel" style="width:min(480px,100%);height:420px"></div></div>'
});

const outletFaq = [
    ['Skąd pochodzą rzeczy w RevOutlet?', 'Z mieszkań, piwnic i domów, które opróżniamy na zlecenie klientów. Zamiast wyrzucać rzeczy w dobrym stanie, dajemy im drugie życie.'],
    ['Czy muszę płacić z góry?', 'Nie. Rezerwacja jest bezpłatna — płacisz przy odbiorze albo przy dostawie. Zarezerwowana rzecz czeka na Ciebie 3 dni.'],
    ['Czy dowozicie?', 'Tak, przy większości rzeczy możesz wybrać dowóz z wniesieniem. Cenę dowozu widzisz przy przedmiocie albo podajemy ją przy potwierdzeniu.'],
    ['Czy mogę obejrzeć rzecz przed zakupem?', 'Tak — umów odbiór osobisty, obejrzysz ją na miejscu.']
];
PAGES.push({
    file: 'outlet.html',
    pageKey: 'outlet',
    title: 'RevOutlet — meble i AGD z drugiej ręki | Słupsk · RevSerwis',
    description: 'Meble, AGD, rowery i wyposażenie z opróżnianych mieszkań — sprawdzone, w dobrych cenach. Rezerwacja online bez przedpłaty, odbiór w Słupsku lub dowóz z wniesieniem.',
    inline: '',
    body: hero({
        eyebrow: 'Drugie życie rzeczy · Słupsk', icon: 'fa-recycle',
        h1: 'RevOutlet — <span>meble i AGD z odzysku</span>',
        lead: 'Rzeczy z mieszkań, które opróżniamy — sprawdzone i w uczciwych cenach. Zarezerwuj online, odbierz w Słupsku albo zamów dowóz z wniesieniem.',
        facts: ['Rezerwacja bez przedpłaty', 'Dowóz z wniesieniem', 'Mniej rzeczy na wysypisku']
    }) + `<section class="pt-section" style="padding-top:8px"><div class="v4-wrap"><div id="outletApp"></div></div></section>` +
        steps('Jak to działa', [['Wybierz rzecz', 'Przeglądaj zdjęcia, stan i wymiary. Każdy przedmiot ma swój numer.'], ['Zarezerwuj', 'Podaj telefon — rezerwacja jest bezpłatna. Oddzwonimy, żeby ustalić odbiór lub dowóz.'], ['Odbierz', 'Płacisz przy odbiorze. Dowieziemy i wniesiemy, jeśli wybierzesz dowóz.']]) +
        `<section class="pt-section"><div class="v4-wrap"><div class="pt-card" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;justify-content:space-between"><div style="max-width:640px"><h3 style="font-size:20px">Opróżniasz mieszkanie?</h3><p>Rzeczy w dobrym stanie mogą trafić do RevOutlet zamiast na wysypisko — to mniej utylizacji i często niższy koszt opróżnienia.</p></div><a class="rv-button" href="oproznianie-utylizacja.html">Opróżnianie i wywóz <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div></div></section>` +
        faq(outletFaq) + faqSchema(outletFaq)
});

const powrotFaq = [
    ['Dlaczego RevPowrót jest tańszy?', 'Po przeprowadzce lub transporcie nasz bus wraca z trasy. Zamiast wracać pusty, zabiera Twoje rzeczy — płacisz tylko za miejsce, które zajmiesz.'],
    ['Ile to jest 1 m³?', 'Mniej więcej komoda albo 10 średnich kartonów. Szafa dwudrzwiowa to około 1,5–2 m³, kanapa 2–3 m³.'],
    ['Czy cena jest ostateczna?', 'Cena w formularzu jest orientacyjna — potwierdzamy ją telefonicznie, gdy znamy piętra, windę i dokładny adres.'],
    ['Nie ma kursu na mojej trasie — co zrobić?', 'Napisz na WhatsApp, skąd i dokąd chcesz coś przewieźć. Damy znać, gdy będziemy jechać w tę stronę.']
];
PAGES.push({
    file: 'powrot.html',
    pageKey: 'powrot',
    title: 'RevPowrót — tańszy transport w kursach powrotnych | RevSerwis',
    description: 'Wolne miejsce w busie wracającym z trasy. Przewieź meble i kartony taniej — płacisz tylko za m³, które zajmiesz. Polska i trasy UE.',
    body: hero({
        eyebrow: 'Kursy powrotne · cała Polska', icon: 'fa-route',
        h1: 'RevPowrót — <span>jedziemy i tak, zabierz się z nami</span>',
        lead: 'Bus wraca z przeprowadzki? Zarezerwuj w nim miejsce na swoje rzeczy i zapłać tylko za metry sześcienne, które zajmiesz — taniej niż osobny transport.',
        facts: ['Płacisz za m³', 'Odbiór i dostawa pod adres', 'Potwierdzenie telefoniczne']
    }) + `<section class="pt-section" style="padding-top:8px"><div class="v4-wrap"><h2>Najbliższe kursy</h2><p class="pt-sub">Wybierz kurs i zarezerwuj miejsce — oddzwonimy, żeby ustalić godzinę.</p><div id="powrotApp"></div></div></section>` +
        steps('Jak to działa', [['Wybierz kurs', 'Sprawdź trasę, datę i wolne miejsce w busie.'], ['Podaj, co przewozimy', 'Ile m³, adresy odbioru i dostawy. Cenę orientacyjną zobaczysz od razu.'], ['Potwierdzamy', 'Zadzwonimy, ustalimy godzinę i zabierzemy rzeczy po drodze.']]) +
        faq(powrotFaq) + faqSchema(powrotFaq)
});

PAGES.push({
    file: 'abonamenty.html',
    pageKey: 'abonamenty',
    title: 'Abonamenty RevSerwis — odśnieżanie, ogród, obsługa obiektu',
    description: 'Stała opieka nad domem, posesją i obiektem: Winter Care (odśnieżanie), ogród w sezonie, obsługa obiektów dla firm. Zamów w panelu klienta — wizyty planujemy za Ciebie.',
    body: hero({
        eyebrow: 'Stała opieka · bez dzwonienia', icon: 'fa-rotate',
        h1: 'Abonamenty — <span>raz ustalasz, my pamiętamy</span>',
        lead: 'Odśnieżanie przez całą zimę, ogród w sezonie, regularna obsługa budynku. Wizyty planujemy za Ciebie, a terminy i raporty widzisz w panelu klienta.',
        facts: ['Pierwszeństwo terminów', 'Stała cena', 'Rezygnacja w panelu']
    }) + `<section class="pt-section" style="padding-top:8px"><div class="v4-wrap"><div id="plansApp"></div></div></section>` +
        steps('Jak zacząć', [['Wybierz plan', 'Kliknij „Wybieram” — zalogujesz się albo założysz konto w minutę.'], ['Potwierdzamy zakres', 'Zadzwonimy, żeby sprawdzić adres, metraż i dojazd.'], ['Działamy', 'Wizyty pojawiają się w panelu klienta. Wstrzymasz lub zrezygnujesz jednym kliknięciem.']]) +
        `<section class="pt-section"><div class="v4-wrap"><div class="pt-card" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;justify-content:space-between"><div><h3 style="font-size:20px">Prowadzisz firmę, hotel albo wspólnotę?</h3><p>Ustalimy abonament szyty na miarę — z fakturą zbiorczą i raportami.</p></div><a class="rv-button ghost" href="revb2b.html">Oferta dla firm</a></div></div></section>`
});

const partnerFaq = [
    ['Ile zarabia biuro na poleceniu?', 'Prowizję od każdego zrealizowanego zlecenia ustalamy indywidualnie przy dołączeniu do programu. Stawkę i naliczone kwoty widzisz w portalu partnera.'],
    ['Jak szybko kontaktujecie się z klientem?', 'Zwykle w ciągu jednego dnia roboczego od polecenia. Status kontaktu widzisz w portalu.'],
    ['Co, jeśli klient zrezygnuje?', 'Nic nie tracisz — prowizja należy się tylko za zrealizowane zlecenia.'],
    ['Czy klient musi wyrazić zgodę?', 'Tak. Polecasz tylko klientów, którzy zgodzili się na kontakt z RevSerwis.']
];
PAGES.push({
    file: 'partnerzy.html',
    pageKey: 'partnerzy',
    title: 'Program partnerski dla biur nieruchomości | RevSerwis',
    description: 'Polecaj klientom przeprowadzkę, opróżnianie i przygotowanie mieszkania do sprzedaży — a my płacimy prowizję. Portal partnera ze statusami i rozliczeniem.',
    body: hero({
        eyebrow: 'Dla biur nieruchomości i agentów', icon: 'fa-handshake',
        h1: 'Twój klient się przeprowadza — <span>my to załatwiamy, Ty zarabiasz</span>',
        lead: 'Polecaj RevSerwis klientom, którzy kupują lub sprzedają mieszkanie: przeprowadzka, opróżnienie, sprzątanie, przygotowanie do sprzedaży. Od każdego zrealizowanego zlecenia dostajesz prowizję.',
        actions: '<a class="rv-button" href="#dolacz">Dołącz do programu <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a><a class="rv-button ghost" href="/konto#/partner">Mam już dostęp — zaloguj</a>',
        facts: ['Prowizja od każdego zlecenia', 'Kontakt z klientem w 1 dzień roboczy', 'Statusy i rozliczenia online']
    }) +
        cards('Co zyskuje biuro', [
            ['fa-coins', 'Dodatkowy przychód', 'Prowizja od zrealizowanego zlecenia — naliczana automatycznie, widoczna w portalu.'],
            ['fa-key', 'Szybsze wydanie kluczy', 'Opróżniamy, sprzątamy i przygotowujemy mieszkanie do sprzedaży lub odbioru.'],
            ['fa-face-smile', 'Zadowolony klient', 'Jedna firma od przeprowadzki, wywozu, magazynu i drobnych prac — klient pamięta, kto polecił.'],
            ['fa-chart-line', 'Pełna przejrzystość', 'Każde polecenie ma status: kontakt, termin, realizacja, prowizja.']
        ]) +
        steps('Jak to działa', [['Dołącz', 'Wyślij zgłoszenie i załóż konto w panelu klienta — włączymy w nim portal partnera.'], ['Polecaj', 'Dodajesz klienta w portalu (za jego zgodą). Dzwonimy do niego w ciągu dnia roboczego.'], ['Rozliczamy', 'Po realizacji naliczamy prowizję — widzisz ją w portalu do wypłaty.']]) +
        `<section class="pt-section" id="dolacz"><div class="v4-wrap"><h2>Dołącz do programu</h2><p class="pt-sub">Zostaw dane biura — oddzwonimy i ustalimy szczegóły współpracy.</p>
        <form id="partnerForm" class="pt-form pt-card" novalidate style="padding:24px;max-width:860px">
          <div class="pt-field"><label for="pa1">Nazwa biura</label><input id="pa1" name="agencyName" required minlength="2" autocomplete="organization"></div>
          <div class="pt-field"><label for="pa2">Miasto</label><input id="pa2" name="city" required minlength="2"></div>
          <div class="pt-field"><label for="pa3">Imię i nazwisko</label><input id="pa3" name="name" required minlength="2" autocomplete="name"></div>
          <div class="pt-field"><label for="pa4">Telefon</label><input id="pa4" name="phone" type="tel" required autocomplete="tel"></div>
          <div class="pt-field"><label for="pa5">E-mail</label><input id="pa5" name="email" type="email" required autocomplete="email"></div>
          <div class="pt-field"><label for="pa6">NIP (opcjonalnie)</label><input id="pa6" name="nip" inputmode="numeric"></div>
          <div class="pt-field"><label for="pa7">Liczba agentów (opcjonalnie)</label><input id="pa7" name="agents" type="number" min="1"></div>
          <div class="pt-field full"><label for="pa8">Wiadomość (opcjonalnie)</label><textarea id="pa8" name="message"></textarea></div>
          <input class="pt-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <label class="pt-check full"><input type="checkbox" name="consent" required><span>Zgadzam się na kontakt RevSerwis w sprawie współpracy (<a href="polityka-prywatnosci.html" target="_blank">polityka prywatności</a>).</span></label>
          <div class="pt-error full" role="alert"></div>
          <button class="rv-button full" type="submit">Wyślij zgłoszenie <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
        </form></div></section>` + faq(partnerFaq) + faqSchema(partnerFaq)
});

PAGES.push({
    file: 'kariera.html',
    pageKey: 'kariera',
    title: 'Kariera i franczyza — praca w RevSerwis | Słupsk',
    description: 'Dołącz do RevSerwis: przeprowadzki, opróżnianie mieszkań, transport, ogród, odśnieżanie, kierowcy, marketing. Albo otwórz RevSerwis w swoim mieście w modelu franczyzy.',
    inline: `window.RV_CAREER=${JSON.stringify({ departments: P.DEPARTMENTS, marketing: P.MARKETING_ROLES, availability: P.AVAILABILITY, licenses: P.LICENSES, budgets: P.FRANCHISE_BUDGETS, timelines: P.FRANCHISE_TIMELINES })};`,
    body: hero({
        eyebrow: 'Praca · Marketing · Franczyza', icon: 'fa-briefcase',
        h1: 'Rośniemy — <span>dołącz do RevSerwis</span>',
        lead: 'Szukamy ludzi do ekip usługowych i do marketingu. A jeśli chcesz prowadzić własną firmę — otwórz RevSerwis w swoim mieście.',
        facts: ['Praca na etat, część etatu lub weekendy', 'Nowoczesne narzędzia (panel RevMi, wyceny RevBot)', 'Franczyza w całej Polsce']
    }) + `<section class="pt-section" style="padding-top:8px"><div class="v4-wrap"><h2>Gdzie chcesz się zgłosić?</h2><p class="pt-sub">Wybierz ścieżkę — formularz dopasuje się do niej.</p><div id="karieraApp"></div></div></section>` +
        cards('Franczyza RevSerwis — co możesz dostać', [
            ['fa-globe', 'Marka i strona', 'Lokalne podstrony RevSerwis dla Twojego miasta, widoczne w Google.'],
            ['fa-mobile-screen', 'Panel RevMi', 'Zlecenia, ekipa, kalendarz, raporty ze zdjęciami i rozliczenia — w telefonie.'],
            ['fa-robot', 'Wyceny RevBot', 'Klienci dostają wstępną wycenę ze zdjęć w 30 sekund, Ty — gotowe zgłoszenia.'],
            ['fa-people-group', 'Wsparcie', 'Know-how z działających oddziałów: cenniki, procedury, sprzęt.']
        ], 'Szczegóły i warunki omawiamy indywidualnie — zależą od miasta i skali.')
});

PAGES.push({
    file: 'newsletter.html',
    pageKey: 'newsletter',
    noindex: true,
    title: 'Newsletter RevSerwis — zapis, potwierdzenie, wypis',
    description: 'Okazje z RevOutlet, wolne kursy RevPowrót i przypomnienia sezonowe od RevSerwis.',
    inline: `window.RV_NEWS=${JSON.stringify({ topics: require('../lib/v10-input').NEWSLETTER_TOPIC_LABELS })};`,
    body: hero({ eyebrow: 'Newsletter', icon: 'fa-envelope-open-text', h1: 'Okazje i przypomnienia <span>prosto na maila</span>', lead: 'Rzeczy z RevOutlet, wolne miejsca w kursach powrotnych i przypomnienia o sezonowych usługach. Maks. 2 wiadomości w miesiącu, wypis jednym kliknięciem.' }) +
        '<section class="pt-section" style="padding-top:8px"><div class="v4-wrap"><div id="newsApp" style="max-width:720px"></div></div></section>'
});

PAGES.push({
    file: 'odbior.html',
    pageKey: 'odbior',
    noindex: true,
    title: 'Odbiór mieszkania — przeprowadzka z RevSerwis',
    description: 'Odebrałeś klucze do nowego mieszkania? Zamów przeprowadzkę, montaż mebli i sprzątanie — z rabatem od dewelopera.',
    body: hero({ eyebrow: 'Dla nabywców mieszkań', icon: 'fa-key', h1: 'Gratulacje nowego mieszkania! <span>Przeprowadzkę zostaw nam</span>', lead: 'Przeprowadzka, montaż mebli, sprzątanie po odbiorze i wywóz kartonów — jedna ekipa, jeden termin. Wpisz kod od dewelopera, żeby skorzystać z oferty dla Twojej inwestycji.' }) +
        '<section class="pt-section" style="padding-top:8px"><div class="v4-wrap"><div id="odbiorApp" style="max-width:860px"></div></div></section>'
});

/* ------------------------------------------------------------------ */
/* Zapis                                                               */
/* ------------------------------------------------------------------ */

for (const p of PAGES) write(p.file, inject(page(p)));

let touched = 0;
for (const file of fs.readdirSync(pub).filter(f => f.endsWith('.html'))) {
    const html = read(file);
    const next = inject(html, { hero: file === 'index.html' });
    if (next !== html) { write(file, next); touched++; }
}

// sitemap.xml
try {
    let sitemap = read('sitemap.xml');
    const today = new Date().toISOString().slice(0, 10);
    for (const f of ['outlet.html', 'powrot.html', 'abonamenty.html', 'partnerzy.html', 'kariera.html']) {
        if (!sitemap.includes(`${SITE}/${f}<`)) sitemap = sitemap.replace('</urlset>', `<url><loc>${SITE}/${f}</loc><lastmod>${today}</lastmod><priority>0.7</priority></url>\n</urlset>`);
    }
    write('sitemap.xml', sitemap);
} catch (error) {
    console.warn('[pages] sitemap.xml:', error.message);
}

console.log(`[pages] Zbudowano ${PAGES.length} stron 9.0, zaktualizowano linki w ${touched} plikach.`);
