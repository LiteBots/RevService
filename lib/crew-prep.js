'use strict';

/**
 * 12.0: przygotowanie ekipy — z odpowiedzi klienta w formularzu wyceny (wycena.html → /api/quotes/ai)
 * tworzy checklistę zlecenia w RevMi:
 *   phase "before" — sprzęt i rzeczy do zabrania PRZED wyjazdem,
 *   phase "task"   — uwagi i ryzyka do sprawdzenia na miejscu.
 * Reguły czytają wartości po identyfikatorach pól z Public/assets/ai-services.js (indeksy opcji).
 * Zwraca też sugerowaną liczbę osób w ekipie (crewHint) — tylko podpowiedź dla dyspozytora.
 */

const has = (v, k) => v[k] !== undefined && v[k] !== null;
const inList = (v, k, i) => Array.isArray(v[k]) && v[k].includes(i);

/** Reguły per usługa: (values) => [[phase, text], ...] */
const RULES = {
    move(v) {
        const out = [];
        const floors = Math.max(has(v, 'floorFrom') ? v.floorFrom : 0, has(v, 'floorTo') ? v.floorTo : 0);
        if (floors >= 3 && v.lift !== 3) out.push(['task', `Schody bez windy (do ${floors}. piętra) — zaplanuj dodatkową osobę i przerwy`]);
        if (inList(v, 'heavy', 5) || inList(v, 'heavy', 6)) out.push(['before', 'Pianino/fortepian: pasy, wózek do pianina, koce — min. 4 osoby']);
        if (inList(v, 'heavy', 7)) out.push(['before', 'Sejf: wózek schodowy i pasy, sprawdzić wagę z klientem']);
        if (inList(v, 'heavy', 3)) out.push(['task', 'Lodówka side-by-side — zmierzyć drzwi i klatkę przed wnoszeniem']);
        if (inList(v, 'heavy', 8)) out.push(['task', 'Akwarium — klient opróżnia przed przyjazdem; przewóz osobno, pionowo']);
        if (inList(v, 'heavy', 10) || v.assembly === 1 || v.assembly === 2) out.push(['before', 'Narzędzia do demontażu: wkrętarka, imbusy, klucze, worki strunowe na śruby']);
        if (Array.isArray(v.fragile) && v.fragile.length) out.push(['before', 'Rzeczy delikatne: folia bąbelkowa, narożniki, koce, kartony na obrazy/lustra']);
        if (inList(v, 'extras', 0) || inList(v, 'extras', 1) || (v.boxes || 0) > 0) out.push(['before', `Kartony i taśma${v.boxes ? ` (klient szacuje ok. ${v.boxes} kartonów)` : ''}, folia stretch`]);
        if (v.disconnect === 2) out.push(['before', 'Odłączenie AGD: klucze, wąż, korki transportowe do pralki']);
        if (v.abroad >= 2) out.push(['task', 'Trasa zagraniczna — lista rzeczy, dokumenty przewozowe, opłaty drogowe' + (v.abroad === 3 ? ', odprawa celna' : '')]);
        if (v.storageMid > 0) out.push(['task', 'Przechowanie po drodze — zarezerwować miejsce w magazynie']);
        if (v.disposal === 1) out.push(['task', 'Wywóz niepotrzebnych rzeczy przy okazji — miejsce w aucie na odpady']);
        if (v.fromType === 1 || v.toType === 1) out.push(['task', 'Kamienica — wąska klatka i wysokie piętra, sprawdzić przejście szaf']);
        return out;
    },
    clear(v) {
        const out = [['before', 'Worki 120 l, rękawice, taśma do oznaczania rzeczy']];
        if (v.condition === 2) out.push(['before', 'Lokal bardzo zaniedbany: maski FFP2/FFP3, kombinezony, środek do dezynfekcji']);
        if (inList(v, 'items', 8)) out.push(['before', 'Farby/chemia: osobne szczelne pojemniki — utylizacja w PSZOK']);
        if (inList(v, 'items', 2)) out.push(['task', 'Elektrośmieci osobno (RTV/AGD) — do punktu zbiórki']);
        if (inList(v, 'items', 6)) out.push(['before', 'Gruz: worki typu big-bag lub kontener']);
        if (inList(v, 'items', 9)) out.push(['task', 'Opony — osobny odbiór/utylizacja']);
        if (v.keep === 1 || v.keep === 2) out.push(['task', 'Część rzeczy zostaje — zdjęcia przed, nie ruszać oznaczonych rzeczy']);
        if (v.docs === 1) out.push(['before', 'Pudło na dokumenty, zdjęcia i pamiątki dla klienta']);
        if (v.dismantle === 2) out.push(['before', 'Demontaż kuchni/zabudów: wkrętarka, piła, łom, zakręcić wodę']);
        if (v.cleanAfter === 2) out.push(['before', 'Zestaw do sprzątania generalnego (odkurzacz, mopy, środki)']);
        else if (v.cleanAfter === 1) out.push(['before', 'Miotła, szufla, odkurzacz']);
        return out;
    },
    waste(v) {
        const out = [];
        if (inList(v, 'big', 0)) out.push(['task', 'Lodówka/zamrażarka — przewóz w pionie, utylizacja jako elektroodpad']);
        if (v.dismantle === 1) out.push(['before', 'Narzędzia do rozkręcenia mebli']);
        if (v.carry === 1 && (v.floor || 0) >= 3) out.push(['task', `Wynoszenie z ${v.floor}. piętra — 2 osoby`]);
        return out;
    },
    cargo(v) {
        const out = [['before', 'Pasy transportowe, koce, folia stretch']];
        if (v.length >= 2) out.push(['task', 'Długi ładunek (ponad 3 m) — sprawdzić auto i przejścia']);
        if (v.weight >= 2) out.push(['before', 'Ładunek powyżej 1 t — auto o odpowiedniej ładowności, wózek paletowy']);
        if (v.pack === 1) out.push(['before', 'Materiały do zabezpieczenia: folia bąbelkowa, narożniki']);
        if (v.assembly > 0) out.push(['before', 'Narzędzia do montażu/demontażu']);
        if (v.loading === 2) out.push(['task', 'Na miejscu jest wózek widłowy — ładunek na palecie']);
        if (v.pickupTime === 0) out.push(['task', 'Konkretna godzina odbioru — potwierdzić telefonicznie dzień wcześniej']);
        return out;
    },
    shop(v) {
        const out = [['before', 'Pasy, koce, wózek transportowy']];
        if (v.paid === 1) out.push(['task', 'Towar płatny przy odbiorze — płaci klient, potwierdzić przed wyjazdem']);
        if (v.carry === 2) out.push(['before', 'Narzędzia do montażu']);
        if (v.packaging === 1) out.push(['task', 'Zabrać opakowania po wniesieniu']);
        return out;
    },
    moto(v) {
        const out = [['before', 'Najazd/rampa, pasy z grzechotką, kliny pod koła']];
        if (v.state === 1 || v.wheels === 1) out.push(['before', 'Pojazd niesprawny — wyciągarka lub dodatkowa osoba, wózek pod koło']);
        if (v.keys === 1) out.push(['task', 'Brak kluczyków — zablokowana kierownica, zaplanować załadunek']);
        return out;
    },
    snow(v) {
        const out = [];
        if (v.spread === 1) out.push(['before', 'Piasek do posypywania']);
        if (v.spread === 2) out.push(['before', 'Sól drogowa']);
        if (v.spread === 3) out.push(['before', 'Mieszanka / środek ekologiczny (bezpieczny dla kostki i roślin)']);
        if (v.pile === 1) out.push(['before', 'Przyczepa/wywrotka do wywozu śniegu']);
        if (has(v, 'deadline') && v.deadline < 3) out.push(['task', `Teren ma być gotowy do ${['6:00', '7:00', '8:00'][v.deadline]} — ustawić kolejność objazdu`]);
        if (Array.isArray(v.obstacles) && (v.obstacles.includes(0) || v.obstacles.includes(1))) out.push(['task', 'Krawężniki/studzienki — oznaczyć tyczkami, ostrożnie pługiem']);
        if (v.icicles === 1) out.push(['before', 'Sople nad wejściem — tyczka, kask, wygrodzenie strefy']);
        return out;
    },
    plot(v) {
        const out = [['before', 'Kosy spalinowe, paliwo, okulary i osłony']];
        if (v.grass >= 2 || v.state === 2) out.push(['before', 'Wysokie zarośla/samosiejki — kosa z nożem, piła, sekator']);
        if (v.slope === 2) out.push(['task', 'Skarpa/rowy — praca ręczna, bez kosiarki samojezdnej']);
        if (v.trash === 2) out.push(['before', 'Śmieci na działce (gruz, opony, złom) — big-bagi, osobne kursy']);
        if (Array.isArray(v.hidden) && (v.hidden.includes(2) || v.hidden.includes(3))) out.push(['task', 'Studnia/szambo/rury w gruncie — klient wskazuje przed koszeniem']);
        if (v.gate === 1) out.push(['task', 'Tylko furtka — sprzęt ręczny, bez wjazdu autem']);
        if (Array.isArray(v.scope) && v.scope.some(i => i >= 3)) out.push(['before', 'Przyczepa na odpady zielone/śmieci']);
        return out;
    },
    trees(v) {
        const out = [['before', 'Piły, kaski z przyłbicą, spodnie antyprzecięciowe, apteczka']];
        if (Array.isArray(v.hazards) && v.hazards.includes(0)) out.push(['task', 'LINIA ENERGETYCZNA w pobliżu — nie zaczynać bez uzgodnienia z operatorem sieci']);
        if (v.near === 1 || (Array.isArray(v.hazards) && (v.hazards.includes(1) || v.hazards.includes(2) || v.hazards.includes(4)))) out.push(['before', 'Wycinka sekcyjna: liny, bloczki, sprzęt alpinistyczny lub podnośnik']);
        if (Array.isArray(v.hazards) && v.hazards.includes(3)) out.push(['task', 'Droga/chodnik — wygrodzić strefę, osoba asekurująca']);
        if (v.permit === 2) out.push(['task', 'Klient nie wie, czy potrzebne zgłoszenie — zweryfikować przed wycinką']);
        if (v.stumpsAfter === 1) out.push(['before', 'Frezarka do pni']);
        if (v.wood === 2) out.push(['before', 'Rębak do gałęzi']);
        if (v.wood === 1 || v.haul === 0) out.push(['before', 'Przyczepa na drewno i gałęzie']);
        return out;
    },
    stumps(v) {
        const out = [['before', v.method === 1 ? 'Wykopanie: łopaty, kilof, piła do korzeni' : 'Frezarka do pni, osłony']];
        if (v.access === 2) out.push(['task', 'Przejście poniżej 70 cm — mała frezarka lub praca ręczna']);
        if (v.utilities === 1 || v.utilities === 2) out.push(['task', 'Instalacje w gruncie — sprawdzić przebieg przed frezowaniem']);
        if (v.backfill === 0) out.push(['before', 'Ziemia do zasypania']);
        return out;
    },
    cleaning(v) {
        const out = [['before', v.supplies === 1 ? 'Środki klienta — zabrać tylko sprzęt' : 'Środki czystości i sprzęt (odkurzacz, mopy, ściereczki)']];
        if (v.place === 3) out.push(['before', 'Po remoncie: odkurzacz przemysłowy, skrobaki, środek do usuwania fug/cementu']);
        if (v.windows === 1 || (v.windowsCount || 0) > 0) out.push(['before', `Sprzęt do okien${v.windowsCount ? ` (ok. ${v.windowsCount} okien)` : ''}`]);
        if (v.utilities === 1) out.push(['task', 'Brak wody/prądu — zabrać wodę i agregat lub ustalić z klientem']);
        return out;
    },
    wash(v) {
        const out = [['before', 'Myjka ciśnieniowa, przedłużacz, węże, środek na mech i glony']];
        if (v.impreg === 1) out.push(['before', 'Impregnat i wałki/opryskiwacz']);
        if (v.water === 1) out.push(['before', 'Brak wody na miejscu — zbiornik z wodą']);
        if (v.power === 1) out.push(['before', 'Brak prądu — agregat']);
        if (v.height === 2) out.push(['task', 'Wysoko — podnośnik lub rusztowanie']);
        if (v.plants === 1) out.push(['task', 'Delikatne rośliny — osłonić folią, bez chemii przy rabatach']);
        return out;
    },
    halls(v) {
        const out = [['before', 'Szorowarka/odkurzacz przemysłowy, środki do posadzek']];
        if (v.oil === 1) out.push(['before', 'Sorbent i odtłuszczacz — zabrudzenia olejowe']);
        if (v.height >= 1) out.push(['task', 'Wysoka hala — podnośnik do sprzątania na wysokości']);
        return out;
    },
    demo(v) {
        const out = [['before', 'Łomy, młoty, piła szablasta, rękawice, okulary']];
        if (v.roof === 3) out.push(['task', 'AZBEST (eternit) — tylko firma z uprawnieniami; nie rozpoczynać bez weryfikacji']);
        if (v.power === 1) out.push(['task', 'Odłączyć prąd przed rozbiórką']);
        if (v.foundation === 2) out.push(['before', 'Młot wyburzeniowy do wylewki']);
        if (v.haul === 0) out.push(['before', 'Kontener / przyczepa na gruz i odpady']);
        return out;
    },
    strip(v) {
        const out = [['before', 'Młot udarowy, przecinarka, worki na gruz, odkurzacz przemysłowy']];
        if (v.quiet === 1) out.push(['task', 'Ograniczenia godzin hałasu we wspólnocie — prace głośne w dozwolonych godzinach']);
        if (v.container === 1) out.push(['task', 'Brak miejsca na kontener — wywóz workami']);
        if (v.protect === 1) out.push(['before', 'Folia ochronna i tektura na podłogi i meble']);
        return out;
    },
    earth(v) {
        const out = [];
        if (v.utilities !== 0) out.push(['task', 'Instalacje podziemne — mapa od klienta, odkrywka ręczna w strefie kolizji']);
        if ((v.haulM3 || 0) > 0) out.push(['before', `Wywrotka do wywozu ziemi (ok. ${v.haulM3} m³)`]);
        if (v.access === 1) out.push(['task', 'Utrudniony dojazd dla sprzętu — mniejsza koparka']);
        return out;
    }
};

const ACCESS_RULES = v => {
    const out = [];
    if (v.a_parking >= 2) out.push(['before', 'Auto daleko od wejścia — wózek transportowy / taczka']);
    if (v.a_vehicle === 1) out.push(['task', 'Wąska brama lub niski przejazd — sprawdzić auto przed wyjazdem']);
    if (v.a_vehicle === 2) out.push(['task', 'Strefa płatna / ograniczony wjazd — zaplanować postój']);
    if (v.a_stairs === 2) out.push(['task', 'Wąska / kręta klatka — demontaż dużych mebli, dodatkowa osoba']);
    if (v.a_presence === 1) out.push(['task', 'Na miejscu inna osoba — numer kontaktowy od klienta']);
    if (v.a_presence === 2) out.push(['task', 'Klucze — ustalić odbiór i zwrot kluczy']);
    if (v.a_presence === 3) out.push(['task', 'Dostęp przez ochronę/recepcję — dane ekipy i auta zgłosić wcześniej']);
    if (v.a_permit === 1) out.push(['task', 'Powiadomić zarządcę / wspólnotę przed terminem']);
    if (v.a_permit === 2) out.push(['task', 'Wymagane zezwolenie / zajęcie pasa — potwierdzić przed wyjazdem']);
    if (v.a_pets === 1) out.push(['task', 'Zwierzęta na miejscu — poprosić o zamknięcie na czas pracy']);
    if (v.a_notes) out.push(['task', 'Uwagi klienta: ' + v.a_notes]);
    return out;
};

/** Szacunek liczby osób — prosty, zachowawczy (dyspozytor decyduje). */
function crewHint(id, v) {
    if (id === 'move') {
        let n = [1, 2, 2, 3, 3, 4, 3][has(v, 'scope') ? v.scope : 2];
        const floors = Math.max(v.floorFrom || 0, v.floorTo || 0);
        if (floors >= 3 && v.lift !== 3) n += 1;
        if (inList(v, 'heavy', 5) || inList(v, 'heavy', 6)) n = Math.max(n, 4);
        return Math.min(n, 6);
    }
    if (id === 'clear') return v.fill >= 2 || (v.area || 0) >= 80 ? 3 : 2;
    if (id === 'trees') return v.near === 1 || (Array.isArray(v.hazards) && v.hazards.length) ? 3 : 2;
    if (id === 'cargo' || id === 'shop') return v.help === 0 ? 1 : 2;
    return 0;
}

/**
 * @param {{services: {id: string, name: string, values: object}[]}} q — wynik validateAiQuote
 * @returns {{checklist: {text: string, phase: 'before'|'task'}[], crew: number}}
 */
function crewPrep(q) {
    const seen = new Set();
    const list = [];
    let crew = 0;
    const multi = q.services.length > 1;
    for (const s of q.services) {
        const v = s.values || {};
        const rows = [...(RULES[s.id] ? RULES[s.id](v) : []), ...ACCESS_RULES(v)];
        for (const [phase, text] of rows) {
            const t = ((multi ? s.name + ': ' : '') + text).slice(0, 200);
            if (seen.has(t)) continue;
            seen.add(t);
            list.push({ text: t, phase });
        }
        crew = Math.max(crew, crewHint(s.id, v));
    }
    list.push({ text: 'Zdjęcia przed i po realizacji', phase: 'task' });
    return { checklist: list.slice(0, 40), crew };
}

module.exports = { crewPrep, crewHint };
