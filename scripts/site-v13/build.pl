#!/usr/bin/env perl
# RevSerwis 13 — generator strony (6 usług, 30 miast × 6 usług, mapa obszaru, opinie, sitemap).
# Uruchom z katalogu projektu:  perl scripts/site-v13/build.pl   (albo: npm run site)
# Wymaga tylko Perla (jest na macOS i Linuksie). Dane: scripts/site-v13/{cities.json,reviews.json,poland-paths.svgfrag}.
use strict;
use warnings;
use utf8;
use JSON::PP;
use File::Basename qw(dirname);
use Cwd qw(abs_path);
binmode STDOUT, ':utf8';

my $DIR  = dirname(abs_path($0));
my $ROOT = abs_path("$DIR/../..");
my $PUB  = "$ROOT/Public";
my $BASE = 'https://www.revserwis.pl';
my $TEL  = '735 396 534';
my $TELH = '+48735396534';
my $MAIL = 'kontakt@revserwis.pl';
my $WA   = 'https://wa.me/48735396534?text=' . 'Dzie%C5%84%20dobry%2C%20chc%C4%99%20zapyta%C4%87%20o%20wycen%C4%99.';
my $VER  = '13.0.0';

sub slurp { my ($f) = @_; open my $h, '<:raw', $f or die "Brak pliku $f\n"; local $/; my $d = <$h>; close $h; return $d; }
my $J = JSON::PP->new->utf8;
my $CD = $J->decode(slurp("$DIR/cities.json"));
my @ORDER = @{ $CD->{order} };
my %C = %{ $CD->{cities} };
my $R = $J->decode(slurp("$DIR/reviews.json"));
my $MAP_PATHS = do { my $s = slurp("$DIR/poland-paths.svgfrag"); utf8::decode($s); $s };

my %written;
sub out {
    my ($name, $html) = @_;
    open my $h, '>:utf8', "$PUB/$name" or die "Nie mogę zapisać $name: $!\n";
    print $h $html; close $h; $written{$name} = 1;
}
sub esc { my $s = shift // ''; $s =~ s/&/&amp;/g; $s =~ s/</&lt;/g; $s =~ s/>/&gt;/g; $s =~ s/"/&quot;/g; return $s; }
sub urlenc { my $s = shift // ''; utf8::encode($s); $s =~ s/([^A-Za-z0-9\-_.~])/sprintf('%%%02X', ord $1)/ge; return $s; }
sub jsonld { my $d = shift; my $s = JSON::PP->new->canonical->encode($d); $s =~ s#</#<\\/#g; return qq{<script type="application/ld+json">$s</script>}; }
sub plural { my ($n, $a, $b, $c) = @_; return $a if $n == 1; my ($u, $t) = ($n % 10, $n % 100); return ($u >= 2 && $u <= 4 && ($t < 12 || $t > 14)) ? $b : $c; }
sub fmt_dist { my $c = shift; return 'tu jest nasza baza' unless $c->{km}; my $m = $c->{min}; my $t = $m < 60 ? "$m min" : int($m / 60) . ' h' . ($m % 60 ? ' ' . ($m % 60) . ' min' : ''); return "ok. $c->{km} km · ok. $t dojazdu"; }
sub home_region { my $c = shift; return $c->{region} eq 'pomorskie' || $c->{region} eq 'zachodniopomorskie'; }

# ------------------------------------------------------------------
# Usługi
# ------------------------------------------------------------------
my @SERVICES = (
  { key => 'przeprowadzki', page => 'przeprowadzki.html', city => 'przeprowadzki', form => 'przeprowadzka', icon => 'fa-truck-ramp-box',
    name => 'Przeprowadzki', h1city => 'Przeprowadzki', title => 'Przeprowadzki Słupsk, Pomorze i cała Polska',
    short => 'Mieszkania, domy i biura. Krajowe i zagraniczne.',
    scope => ['Pakowanie i kartony', 'Demontaż i montaż mebli', 'Zabezpieczenie folią i kocami', 'Pianina i sejfy', 'Przeprowadzki biur', 'Przeprowadzki zagraniczne'],
    lead => 'Przewieziemy mieszkanie, dom albo biuro: spakujemy, rozkręcimy meble, zabezpieczymy je i złożymy na miejscu. Dokładną cenę dostaniesz do 24 godzin od wysłania listy rzeczy.',
    includes => ['Bus z ekipą 2–4 osób, pasy, wózki i koce', 'Demontaż i montaż szaf, łóżek i zabudów', 'Zabezpieczenie folią stretch, kocami i kartonami', 'Wniesienie i zniesienie z każdego piętra, także bez windy', 'Pakowanie przez ekipę i kartony od nas (na życzenie)', 'Wywóz niepotrzebnych rzeczy po przeprowadzce'],
    faq => [
      ['Ile kosztuje przeprowadzka?', 'Cena zależy od ilości rzeczy, pięter, windy, odległości i tego, czy pakujemy za Ciebie. W formularzu wpisujesz listę rzeczy z ilościami, a dokładną cenę wysyłamy do 24 godzin.'],
      ['Czy rozkręcacie i skręcacie meble?', 'Tak. W formularzu zaznacz przy szafie czy łóżku „do rozkręcenia”, a ekipa zabierze odpowiednie narzędzia.'],
      ['Czy przewozicie pianina i sejfy?', 'Tak, ciężkie rzeczy przenosimy w większej ekipie, z pasami i wózkami. Wpisz je na liście z wagą, jeśli ją znasz.'],
      ['Czy robicie przeprowadzki za granicę?', 'Tak, głównie do Niemiec, Skandynawii, Holandii i Wielkiej Brytanii. Trasę planujemy indywidualnie.'] ] },
  { key => 'oproznianie', page => 'oproznianie.html', city => 'oproznianie-i-wywoz', form => 'oproznianie', icon => 'fa-box-open',
    name => 'Opróżnianie', h1city => 'Opróżnianie mieszkań i wywóz', title => 'Opróżnianie mieszkań, domów, piwnic i garaży',
    short => 'Mieszkania, domy, garaże, strychy i piwnice.',
    scope => ['Opróżnianie pod sprzedaż', 'Mieszkania po najemcach', 'Mieszkania po zmarłych', 'Garaże i komórki', 'Strychy i piwnice', 'Sprzątanie po opróżnieniu'],
    lead => 'Opróżnimy mieszkanie, dom, garaż, strych albo piwnicę w jeden dzień. Wyniesiemy wszystko, oddamy do legalnej utylizacji i zostawimy puste, czyste wnętrze, gotowe do sprzedaży lub remontu.',
    includes => ['Wyniesienie mebli, AGD, RTV i drobnych rzeczy', 'Segregacja i legalna utylizacja odpadów', 'Odłożenie rzeczy, które chcesz zachować', 'Opróżnianie pod sprzedaż i wynajem, także z kluczami bez Twojej obecności', 'Mieszkania po zmarłych, z szacunkiem i dyskrecją', 'Sprzątanie po opróżnieniu (na życzenie)'],
    faq => [
      ['Ile trwa opróżnienie mieszkania?', 'Typowe mieszkanie 2–3 pokojowe opróżniamy w jeden dzień. Mocno zagracone lokale i domy mogą zająć 2 dni.'],
      ['Czy muszę być na miejscu?', 'Nie. Wystarczy przekazać klucze i wskazać rzeczy do zachowania. Wyślemy zdjęcia przed i po.'],
      ['Co się dzieje z rzeczami?', 'Odpady oddajemy do legalnej utylizacji. Rzeczy w dobrym stanie możemy przekazać dalej, zamiast je wyrzucać.'],
      ['Czy wystawiacie fakturę?', 'Tak, wystawiamy paragon albo fakturę VAT, także dla biur nieruchomości, zarządców i firm.'] ] },
  { key => 'transport', page => 'transport.html', city => 'transport-rzeczy', form => 'transport', icon => 'fa-dolly',
    name => 'Transport z wniesieniem', h1city => 'Transport rzeczy z wniesieniem', title => 'Transport mebli i ładunków z wniesieniem',
    short => 'Meble, AGD, ładunki i zakupy ze sklepów.',
    scope => ['Wniesienie na piętro', 'Odbiór ze sklepu i z OLX', 'Meble i AGD', 'Palety i materiały', 'Ciężkie i nietypowe ładunki'],
    lead => 'Przywieziemy kanapę z OLX, lodówkę ze sklepu albo paletę materiałów. Wniesiemy na piętro, a stary mebel czy sprzęt możemy od razu zabrać do utylizacji.',
    includes => ['Odbiór ze sklepu, magazynu, od osoby prywatnej z OLX', 'Wniesienie i ustawienie na miejscu', 'Montaż i skręcenie mebli (na życzenie)', 'Wywóz starego mebla lub AGD przy okazji', 'Zabezpieczenie kocami i pasami', 'Transport palet i materiałów budowlanych'],
    faq => [
      ['Czy odbieracie rzeczy kupione na OLX?', 'Tak. Podaj adres sprzedającego i godzinę odbioru, resztę załatwimy.'],
      ['Czy wnosicie na piętro bez windy?', 'Tak. Wpisz w formularzu piętro i czy jest winda, a cena to uwzględni.'],
      ['Czy da się taniej?', 'Tak, jeśli jedziemy w Twoją stronę. Sprawdź zakładkę „Po drodze” z wolnym miejscem w naszych busach.'] ] },
  { key => 'odpady', page => 'odbior-odpadow.html', city => 'odbior-odpadow', form => 'odpady', icon => 'fa-dumpster',
    name => 'Odbiór odpadów', h1city => 'Odbiór odpadów i gabarytów', title => 'Odbiór gabarytów, AGD, RTV i odpadów zielonych',
    short => 'Gabaryty, AGD, RTV, odpady zielone i inne.',
    scope => ['Gabaryty', 'AGD', 'RTV i elektronika', 'Odpady zielone', 'Gruz w workach', 'Inne odpady'],
    lead => 'Odbierzemy stare meble, AGD, RTV, odpady zielone i inne. Sami wyniesiemy je z mieszkania, piwnicy albo posesji i oddamy do legalnej utylizacji.',
    includes => ['Wyniesienie z mieszkania, piwnicy, garażu, z posesji', 'Gabaryty: meble, materace, dywany, wersalki', 'AGD i RTV: lodówki, pralki, telewizory', 'Odpady zielone: gałęzie, trawa, liście', 'Gruz i odpady remontowe w workach', 'Potwierdzenie utylizacji dla firm'],
    faq => [
      ['Czy muszę sam znieść rzeczy?', 'Nie. Wyniesiemy je z każdego piętra, także bez windy.'],
      ['Gdzie trafiają odpady?', 'Do legalnych punktów utylizacji i recyklingu. Nie zostawiamy niczego w lesie ani przy śmietniku.'],
      ['Czy odbierzecie jedną rzecz?', 'Tak, także pojedynczy mebel czy lodówkę. Najtaniej wychodzi, gdy dorzucisz wszystko za jednym razem.'] ] },
  { key => 'rozbiorki', page => 'rozbiorki.html', city => 'rozbiorki', form => 'rozbiorki', icon => 'fa-hammer',
    name => 'Rozbiórki i skuwanie', h1city => 'Rozbiórki i skuwanie', title => 'Rozbiórki, skuwanie płytek i przygotowanie do remontu',
    short => 'Kompleksowo przygotujemy mieszkanie do remontu.',
    scope => ['Kucie płytek', 'Rozbiórka pieców', 'Zrywanie tapet', 'Kasetony i boazeria', 'Wyburzanie ścian', 'Demontaż zlewów i toalet', 'Zrywanie podłóg', 'Zrywanie sufitów', 'Skuwanie tynków', 'Wywóz gruzu'],
    lead => 'Przygotujemy mieszkanie do remontu od A do Z: skujemy płytki i tynki, rozbierzemy piec, zerwiemy tapety, kasetony, boazerię, podłogi i sufity, zdemontujemy sanitariaty i wywieziemy cały gruz.',
    includes => ['Kucie płytek ze ścian i podłóg', 'Rozbiórka pieców kaflowych', 'Zrywanie tapet, kasetonów i boazerii', 'Wyburzanie ścian działowych', 'Demontaż zlewów, toalet, wanien i zabudowy kuchennej', 'Zrywanie podłóg i sufitów', 'Skuwanie tynków i wylewek', 'Wywóz gruzu i sprzątanie po pracach'],
    faq => [
      ['Czy wywozicie gruz?', 'Tak, gruz pakujemy w worki lub big bagi i wywozimy do utylizacji. Możesz też mieć własny kontener.'],
      ['Jak szybko przygotujecie łazienkę do remontu?', 'Standardową łazienkę skuwamy i opróżniamy zwykle w jeden dzień.'],
      ['Czy wyburzacie ściany nośne?', 'Wyburzamy ściany działowe. Ścianę nośną tylko z projektem i zgodą konstruktora.'] ] },
  { key => 'przewoz', page => 'przewozy-osob.html', city => 'przewozy-osob', form => 'przewoz', icon => 'fa-van-shuttle',
    name => 'Przewóz osób', h1city => 'Przewóz osób', title => 'Przewóz osób busem: lotniska, wesela, wyjazdy firmowe',
    short => 'Busy do 8 osób z bagażem.',
    scope => ['Lotniska: Gdańsk, Szczecin, Berlin', 'Wesela i imprezy', 'Wyjazdy firmowe', 'Przewóz z bagażem'],
    lead => 'Zawieziemy Cię na lotnisko, wesele albo wyjazd firmowy. Busy do 8 osób z miejscem na bagaż, punktualnie i bez przesiadek.',
    includes => ['Transfery na lotniska: Gdańsk, Szczecin, Berlin', 'Wesela, imprezy i wyjazdy grupowe', 'Wyjazdy firmowe i delegacje', 'Miejsce na duży bagaż', 'Kurs powrotny tego samego lub innego dnia', 'Faktura VAT dla firm'],
    faq => [
      ['Ile osób zabierzecie?', 'Do 8 osób w jednym busie. Większe grupy obsługujemy kilkoma pojazdami.'],
      ['Czy czekacie przy opóźnionym locie?', 'Tak. Podaj numer lotu, a sprawdzimy godzinę przylotu.'] ] },
);
my %SVC = map { $_->{key} => $_ } @SERVICES;

# ------------------------------------------------------------------
# Wspólne elementy
# ------------------------------------------------------------------
my @NAV = (['index.html#uslugi', 'Usługi', 'uslugi'], ['obszar-dzialania.html', 'Obszar działania', 'obszar'], ['dla-firm.html', 'Dla firm', 'firmy'], ['realizacje.html', 'Opinie i realizacje', 'opinie'], ['po-drodze.html', 'Po drodze', 'podrodze'], ['kontakt.html', 'Kontakt', 'kontakt']);

my $ORG = {
  '@context' => 'https://schema.org', '@type' => 'MovingCompany', '@id' => "$BASE/#organization",
  name => 'RevSerwis', alternateName => 'Rev Serwis', legalName => 'Rev Serwis Kacper Taczała', taxID => '8393269274',
  url => "$BASE/", telephone => $TELH, email => $MAIL, logo => "$BASE/favicon-512x512.png", image => ["$BASE/assets/brand/og-revserwis.png"],
  priceRange => '$$',
  address => { '@type' => 'PostalAddress', streetAddress => 'plac Zwycięstwa 3', addressLocality => 'Słupsk', postalCode => '76-200', addressRegion => 'pomorskie', addressCountry => 'PL' },
  geo => { '@type' => 'GeoCoordinates', latitude => 54.4646, longitude => 17.0264 },
  areaServed => [ { '@type' => 'AdministrativeArea', name => 'województwo pomorskie' }, { '@type' => 'AdministrativeArea', name => 'województwo zachodniopomorskie' }, { '@type' => 'Country', name => 'Polska' } ],
  aggregateRating => { '@type' => 'AggregateRating', ratingValue => '5.0', reviewCount => $R->{google}{count} + $R->{fixly}{count}, bestRating => '5' },
  openingHoursSpecification => [ { '@type' => 'OpeningHoursSpecification', dayOfWeek => [qw(Monday Tuesday Wednesday Thursday Friday Saturday)], opens => '07:00', closes => '20:00' } ],
  hasMap => $R->{google}{url},
  sameAs => ['https://www.facebook.com/profile.php?id=61591448955070', 'https://www.instagram.com/revserwis_/', $R->{google}{url}, $R->{fixly}{url}],
};

sub head {
  my (%o) = @_;
  my $title = esc($o{title}); my $desc = esc($o{desc}); my $canon = "$BASE/" . ($o{path} eq 'index.html' ? '' : $o{path});
  my $robots = $o{noindex} ? '<meta name="robots" content="noindex, follow">' : '';
  my $ld = join "\n", map { jsonld($_) } @{ $o{ld} || [] };
  return <<"HTML";
<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>$title</title>
<meta name="description" content="$desc">
<link rel="canonical" href="$canon">
$robots
<meta name="theme-color" content="#030303">
<meta property="og:type" content="website">
<meta property="og:locale" content="pl_PL">
<meta property="og:site_name" content="RevSerwis">
<meta property="og:title" content="$title">
<meta property="og:description" content="$desc">
<meta property="og:url" content="$canon">
<meta property="og:image" content="$BASE/assets/brand/og-revserwis.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="geo.region" content="PL-22">
<meta name="geo.placename" content="Słupsk">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<link rel="stylesheet" href="/assets/rev13.css?v=$VER">
$ld
</head>
<body>
<a class="skip" href="#tresc">Przejdź do treści</a>
HTML
}

sub header {
  my ($active) = @_; $active //= '';
  my $nav = join '', map { my $cur = $_->[2] eq $active ? ' aria-current="page"' : ''; qq{<a href="/$_->[0]"$cur>$_->[1]</a>} } @NAV;
  my $mnav = join '', map { qq{<a href="/$_->{page}"><i class="fa-solid $_->{icon}"></i>$_->{name}</a>} } @SERVICES;
  $mnav .= join '', map { qq{<a href="/$_->[0]"><i class="fa-solid fa-angle-right"></i>$_->[1]</a>} } grep { $_->[2] ne 'uslugi' } @NAV;
  return <<"HTML";
<header class="hdr"><div class="wrap">
  <a class="brand" href="/" aria-label="RevSerwis — strona główna"><img src="/assets/brand/revserwis-mark.png" alt="" width="34" height="34"><span>Rev<b>Serwis</b></span></a>
  <nav class="nav" aria-label="Główne menu">$nav</nav>
  <div class="right">
    <a class="tel" href="tel:$TELH" aria-label="Zadzwoń $TEL"><i class="fa-solid fa-phone"></i><span>$TEL</span></a>
    <a class="icon-btn" href="/konto" aria-label="Panel klienta" title="Panel klienta"><i class="fa-regular fa-user"></i></a>
    <a class="btn btn-mint btn-sm hide-sm" href="/wycena.html">Wyceń zlecenie</a>
    <button class="icon-btn menu-btn" type="button" aria-expanded="false" aria-controls="mnav" aria-label="Menu"><i class="fa-solid fa-bars"></i></button>
  </div>
</div></header>
<nav class="mnav" id="mnav" aria-label="Menu">$mnav<a href="/konto"><i class="fa-regular fa-user"></i>Panel klienta</a><a class="btn btn-mint" href="/wycena.html">Wyceń zlecenie</a></nav>
HTML
}

sub footer {
  my (%o) = @_;
  my $svc = join '', map { qq{<li><a href="/$_->{page}">$_->{name}</a></li>} } @SERVICES;
  my $cities = join ' · ', map { qq{<a href="/uslugi-$_.html">$C{$_}{name}</a>} } @ORDER;
  my $year = (localtime)[5] + 1900;
  return <<"HTML";
<footer class="foot"><div class="wrap">
  <div class="cols">
    <div><a class="brand" href="/"><img src="/assets/brand/revserwis-mark.png" alt="" width="30" height="30"><span>Rev<b>Serwis</b></span></a>
      <p style="margin-top:14px">Przeprowadzki, opróżnianie, transport, odbiór odpadów, rozbiórki i przewóz osób. Baza w Słupsku, cała Polska z partnerami.</p>
      <div class="soc"><a href="https://www.facebook.com/profile.php?id=61591448955070" aria-label="Facebook" rel="noopener" target="_blank"><i class="fa-brands fa-facebook-f"></i></a><a href="https://www.instagram.com/revserwis_/" aria-label="Instagram" rel="noopener" target="_blank"><i class="fa-brands fa-instagram"></i></a><a href="$R->{google}{url}" aria-label="Wizytówka Google" rel="noopener" target="_blank"><i class="fa-brands fa-google"></i></a></div></div>
    <div><h4>Usługi</h4><ul>$svc</ul></div>
    <div><h4>RevSerwis</h4><ul><li><a href="/obszar-dzialania.html">Obszar działania</a></li><li><a href="/dla-firm.html">Dla firm</a></li><li><a href="/realizacje.html">Opinie i realizacje</a></li><li><a href="/po-drodze.html">Po drodze</a></li><li><a href="/konto">Panel klienta</a></li><li><a href="/polityka-prywatnosci.html">Polityka prywatności</a></li></ul></div>
    <div><h4>Kontakt</h4><ul><li><a href="tel:$TELH">$TEL</a></li><li><a href="mailto:$MAIL">$MAIL</a></li><li><a href="$WA" rel="noopener" target="_blank">WhatsApp</a></li><li>pl. Zwycięstwa 3, 76-200 Słupsk</li><li>Pon.–sob. 7:00–20:00</li></ul></div>
  </div>
  <div class="cityfoot">Działamy w: $cities</div>
  <div class="legal"><span>© $year Rev Serwis Kacper Taczała · NIP 8393269274 · REGON 545866163</span><span><a href="/polityka-prywatnosci.html">Polityka prywatności</a></span></div>
</div></footer>
<div class="mbar"><a href="tel:$TELH"><i class="fa-solid fa-phone"></i>Zadzwoń</a><a class="wa" href="$WA" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp"></i>WhatsApp</a><a class="q" href="/wycena.html">Wyceń</a></div>
<script src="/assets/rev13.js?v=$VER" defer></script>
@{[ $o{scripts} // '' ]}
</body>
</html>
HTML
}

sub page {
  my (%o) = @_;
  return head(%o) . header($o{active}) . qq{<main id="tresc">} . $o{body} . qq{</main>\n} . footer(scripts => $o{scripts});
}

sub crumbs {
  my @c = @_;
  my $html = join ' <span aria-hidden="true">›</span> ', map { $_->[1] ? qq{<a href="/$_->[1]">} . esc($_->[0]) . '</a>' : '<span>' . esc($_->[0]) . '</span>' } (['RevSerwis', 'index.html'], @c);
  $html =~ s#href="/index.html"#href="/"#;
  my $i = 0;
  my $ld = { '@context' => 'https://schema.org', '@type' => 'BreadcrumbList', itemListElement => [ map { $i++; { '@type' => 'ListItem', position => $i, name => $_->[0], ($_->[1] ? (item => "$BASE/" . ($_->[1] eq 'index.html' ? '' : $_->[1])) : ()) } } (['RevSerwis', 'index.html'], @c) ] };
  return (qq{<nav class="crumbs wrap" aria-label="Okruszki">$html</nav>}, $ld);
}

sub faq_html {
  my ($list) = @_;
  my $h = join '', map { '<details><summary>' . esc($_->[0]) . '</summary><p>' . esc($_->[1]) . '</p></details>' } @$list;
  my $ld = { '@context' => 'https://schema.org', '@type' => 'FAQPage', mainEntity => [ map { { '@type' => 'Question', name => $_->[0], acceptedAnswer => { '@type' => 'Answer', text => $_->[1] } } } @$list ] };
  return (qq{<div class="faq">$h</div>}, $ld);
}

sub final_cta {
  my ($t, $link) = @_; $t //= 'Opisz zlecenie, wycenę dostaniesz do 24 h.'; $link //= '/wycena.html';
  return qq{<section class="final"><div class="wrap"><div class="box"><div><h2>$t</h2><p>Bezpłatnie i bez zobowiązań. W pilnych sprawach zadzwoń: $TEL.</p></div><a class="btn btn-dark" href="$link">Wyceń zlecenie</a></div></div></section>};
}

sub rating_boxes {
  return qq{<div class="rate"><a href="$R->{google}{url}" rel="noopener" target="_blank"><div class="src"><i class="fa-brands fa-google"></i>Google</div><b>$R->{google}{rating}</b><span class="stars" aria-hidden="true">★★★★★</span><small>$R->{google}{count} opinii</small></a><a href="$R->{fixly}{url}" rel="noopener" target="_blank"><div class="src"><span class="fixly">F</span>Fixly</div><b>$R->{fixly}{rating}</b><span class="stars" aria-hidden="true">★★★★★</span><small>$R->{fixly}{count} opinii</small></a></div>};
}

my $VAN = q{<svg viewBox="0 0 320 200" fill="none" aria-hidden="true"><rect x="20" y="40" width="190" height="110" rx="14" stroke="#03f0ba" stroke-width="6"/><path d="M210 70h48l36 40v40h-84z" stroke="#03f0ba" stroke-width="6" stroke-linejoin="round"/><path d="M226 84h28l22 26h-50z" fill="rgba(3,240,186,.18)"/><circle cx="72" cy="156" r="20" fill="#030303" stroke="#03f0ba" stroke-width="6"/><circle cx="246" cy="156" r="20" fill="#030303" stroke="#03f0ba" stroke-width="6"/><path d="M48 74h70M48 96h110M48 118h86" stroke="#2a3a35" stroke-width="8" stroke-linecap="round"/><path d="M0 182h320" stroke="#1d2a27" stroke-width="4"/></svg>};

sub hero_photo {
  return -e "$PUB/assets/brand/hero.jpg"
    ? qq{<div class="photo"><img src="/assets/brand/hero.jpg" alt="Ekipa RevSerwis przy busie" width="800" height="860">} . rating_boxes() . '</div>'
    : qq{<div class="photo"><div class="ph">$VAN</div>} . rating_boxes() . '</div>';
}

sub svc_rows {
  my (%o) = @_;
  my $html = '';
  for my $s (@SERVICES) {
    my $href = $o{city} ? "/$s->{city}-$o{city}.html" : "/$s->{page}";
    my $q = "/wycena.html?usluga=$s->{form}" . ($o{city} ? '&amp;miasto=' . urlenc($C{$o{city}}{name}) : '');
    my $scope = join '', map { '<span class="chip">' . esc($_) . '</span>' } @{ $s->{scope} };
    my $name = $o{city} ? "$s->{h1city} $C{$o{city}}{name}" : $s->{name};
    $html .= qq{<div class="svc-row"><div class="svc-ic"><i class="fa-solid $s->{icon}" aria-hidden="true"></i></div><div><h3><a href="$href">$name</a></h3><p>$s->{short}</p></div><div class="scope">$scope</div><a class="btn btn-ghost btn-sm go" href="$q">Wyceń</a></div>};
  }
  return qq{<div class="svc">$html</div>};
}

# ------------------------------------------------------------------
# Mapa Polski
# ------------------------------------------------------------------
sub map_svg {
  my (%o) = @_;
  my $paths = '';
  for my $l (split /\n/, $MAP_PATHS) {
    next unless $l =~ /^<path data-woj="([^"]+)"/;
    my $n = $1; my $cls = ($n eq 'pomorskie' || $n eq 'zachodniopomorskie') ? 'home' : 'partner';
    (my $x = $l) =~ s/<path /<path class="$cls" /; $x =~ s#/>$#><title>woj. $n — @{[ $cls eq 'home' ? 'z bazy w Słupsku' : 'z partnerami' ]}</title></path>#;
    $paths .= $x;
  }
  my ($sx, $sy) = (295.3, 76.9);
  my $k = cos(52 * 3.14159265 / 180); my $sc = 1000 / ((24.25 - 14.0) * $k);
  my $pt = sub { my ($lon, $lat) = @_; return (($lon - 14) * $k * $sc, (54.95 - $lat) * $sc); };
  my $labels = '';
  if ($o{big}) {
    my @c = (['Gdańsk', 18.6466, 54.352, 1, -78], ['Szczecin', 14.5528, 53.4285, 1, 9], ['Koszalin', 16.1714, 54.1944, 1, 9], ['Lębork', 17.75, 54.54, 1, 9],
             ['Warszawa', 21.0122, 52.2297], ['Poznań', 16.9252, 52.4064], ['Wrocław', 17.0385, 51.1079], ['Kraków', 19.945, 50.0647], ['Łódź', 19.456, 51.7592], ['Bydgoszcz', 18.0084, 53.1235], ['Olsztyn', 20.4801, 53.7784], ['Białystok', 23.1688, 53.1325], ['Lublin', 22.5684, 51.2465], ['Rzeszów', 22.0047, 50.0412], ['Katowice', 19.0238, 50.2649], ['Zielona Góra', 15.5064, 51.9356], ['Kielce', 20.6286, 50.8661], ['Opole', 17.9213, 50.6751], ['Gorzów Wlkp.', 15.2288, 52.7368], ['Piła', 16.7383, 53.1514]);
    for my $c (@c) {
      my ($x, $y) = $pt->($c->[1], $c->[2]); my $home = $c->[3]; my $dx = $c->[4] // 9;
      $labels .= sprintf(q{<circle cx="%.1f" cy="%.1f" r="5" fill="%s"/><text x="%.1f" y="%.1f" font-family="Plus Jakarta Sans,sans-serif" font-weight="700" font-size="17" fill="%s">%s</text>}, $x, $y, $home ? '#03241b' : '#8fa7a1', $x + $dx, $y + 6, $home ? '#03241b' : '#cfd6d4', $c->[0]);
    }
  }
  return qq{<svg class="pl" viewBox="-20 -20 1040 991" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="mapT"><title id="mapT">Mapa obszaru działania RevSerwis: województwa pomorskie i zachodniopomorskie z bazy w Słupsku, reszta Polski z partnerami</title>$paths}
    . qq{<circle cx="$sx" cy="$sy" r="34" fill="rgba(3,240,186,.2)"/><circle cx="$sx" cy="$sy" r="13" fill="#030303" stroke="#03f0ba" stroke-width="5"/>}
    . sprintf(q{<rect x="%.1f" y="%.1f" width="124" height="36" rx="10" fill="#030303"/><text x="%.1f" y="%.1f" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-weight="800" font-size="19" fill="#fff">Baza Słupsk</text>}, $sx - 62, $sy - 78, $sx, $sy - 54)
    . $labels . '</svg>';
}

my $LEGEND = qq{<div class="legend"><div><span class="sw home"></span><div><b>Pomorskie i zachodniopomorskie</b><span>Obsługujemy sami, z bazy w Słupsku. W okolicach Słupska często tego samego dnia.</span></div></div><div><span class="sw partner"></span><div><b>Pozostałe 14 województw</b><span>Realizujemy z firmami partnerskimi. Masz jeden kontakt i jedną fakturę od RevSerwis.</span></div></div><div><span class="sw abroad"></span><div><b>Za granicą</b><span>Przeprowadzki i transport do Niemiec, Skandynawii, Holandii, Belgii i Wielkiej Brytanii.</span></div></div></div>};

# ------------------------------------------------------------------
# Opinie
# ------------------------------------------------------------------
my %MONTH = ('01' => 'styczeń', '02' => 'luty', '03' => 'marzec', '04' => 'kwiecień', '05' => 'maj', '06' => 'czerwiec', '07' => 'lipiec', '08' => 'sierpień', '09' => 'wrzesień', '10' => 'październik', '11' => 'listopad', '12' => 'grudzień');
sub review_cards {
  my (%o) = @_;
  my @list = grep { $_->{text} } @{ $R->{reviews} };
  @list = grep { !$o{service} || ($_->{service} // '') eq $o{service} } @list if $o{service};
  @list = @list[0 .. $o{limit} - 1] if $o{limit} && @list > $o{limit};
  my $h = '';
  for my $r (@list) {
    my ($y, $m) = split /-/, $r->{date};
    my $when = "$MONTH{$m} $y" . ($r->{city} ? " · $r->{city}" : '');
    my $src = $r->{src} eq 'google' ? '<i class="fa-brands fa-google"></i>Google' : '<span class="fixly">F</span>Fixly';
    my $tag = $r->{service} ? '<div class="tag"><span class="chip">' . esc($r->{service}) . '</span></div>' : '';
    my $ini = uc substr($r->{author}, 0, 1);
    $h .= qq{<article class="rev" data-src="$r->{src}"><header><span class="av" aria-hidden="true">$ini</span><div><b>} . esc($r->{author}) . qq{</b><small>$when</small></div><span class="s">$src</span></header><div class="stars" aria-label="Ocena 5 na 5">★★★★★</div><p>} . esc($r->{text}) . qq{</p>$tag</article>};
  }
  return $h;
}
sub reviews_section {
  my (%o) = @_;
  my $total = $R->{google}{count} + $R->{fixly}{count};
  my $tabs = $o{tabs} ? qq{<div class="tabs" role="group" aria-label="Źródło opinii"><button type="button" data-rev="all" aria-pressed="true">Wszystkie ($total)</button><button type="button" data-rev="google" aria-pressed="false"><i class="fa-brands fa-google"></i>Google ($R->{google}{count})</button><button type="button" data-rev="fixly" aria-pressed="false"><span class="fixly">F</span>Fixly ($R->{fixly}{count})</button></div>} : '';
  my $cards = review_cards(%o);
  return qq{<section class="sec tight" id="opinie"><div class="wrap"><div class="sec-head"><div><h2 class="h2">$o{title}</h2><p class="lead">Średnia 5,0 z $total opinii w Google i na Fixly. Pokazujemy je bez wybierania i bez edycji.</p></div>$tabs</div><div class="revs">$cards</div><div class="ctas" style="justify-content:center;margin-top:12px"><a class="btn btn-ghost" href="$R->{google}{url}" rel="noopener" target="_blank"><i class="fa-brands fa-google"></i>Opinie w Google</a><a class="btn btn-ghost" href="$R->{fixly}{url}" rel="noopener" target="_blank"><span class="fixly">F</span>Profil na Fixly</a></div></div></section>};
}

sub realizations_section {
  my (%o) = @_;
  my $more = $o{more} ? qq{<a class="btn btn-ghost" href="/realizacje.html#realizacje">Wszystkie realizacje</a>} : '';
  my $lim = $o{limit} || 60;
  return qq{<section class="sec tight" id="realizacje"><div class="wrap"><div class="sec-head"><div><h2 class="h2">Realizacje</h2><p class="lead">Zdjęcia przed i po z naszych zleceń.</p></div>$more</div><div class="real" data-realizacje data-limit="$lim" @{[ $o{service} ? 'data-service="' . esc($o{service}) . '"' : '' ]}><div class="empty-box" style="grid-column:1/-1">Ładujemy realizacje…</div></div></div></section>};
}

sub trips_section {
  return qq{<section class="sec band"><div class="wrap split"><div><h2 class="h2">Po drodze.<br>Taniej, bo i tak jedziemy.</h2><p class="lead" style="margin-top:18px">Nasze busy często wracają z tras z wolnym miejscem. Jeśli jedziemy w Twoją stronę, przewieziemy meble, paczki czy ładunek dużo taniej niż osobny kurs.</p><div class="ctas" style="margin-top:28px"><a class="btn btn-mint" href="/po-drodze.html">Zobacz wszystkie trasy</a><a class="btn btn-ghost" href="/wycena.html?usluga=transport">Zapytaj o swoją trasę</a></div></div><div class="trips" data-trips data-limit="3"><div class="trip-empty">Ładujemy najbliższe trasy…</div></div></div></section>};
}

# ------------------------------------------------------------------
# Strona główna
# ------------------------------------------------------------------
{
  my $faq = [['Ile czeka się na wycenę?', 'Do 24 godzin od wysłania formularza. Zwykle odpowiadamy szybciej, w godzinach pracy często w godzinę.'], ['Czy wycena jest bezpłatna?', 'Tak. Wycena na podstawie formularza jest bezpłatna i do niczego nie zobowiązuje.'], ['Jak przyjmujecie płatność?', 'Gotówką, przelewem albo BLIK-iem. Wystawiamy paragon lub fakturę VAT.'], ['Gdzie działacie?', 'Województwo pomorskie i zachodniopomorskie obsługujemy sami, z bazy w Słupsku. Resztę Polski i wyjazdy za granicę realizujemy z partnerami.']];
  my ($faqh, $faqld) = faq_html($faq);
  my $body = qq{
<section class="hero"><div class="wrap">
  <div>
    <h1 class="h1">Przeprowadzki, opróżnianie i wywóz.<span>Słupsk, całe Pomorze i cała Polska.</span></h1>
    <p class="lead">Opisz, co jest do zrobienia. Dokładną wycenę wyślemy do 24 godzin, bez zgadywania i bez ukrytych dopłat.</p>
    <div class="ctas"><a class="btn btn-mint" href="/wycena.html">Wyceń zlecenie</a><a class="btn btn-ghost" href="tel:$TELH"><i class="fa-solid fa-phone"></i>Zadzwoń</a><a class="btn btn-wa" href="$WA" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp"></i>WhatsApp</a></div>
    <div class="promise"><span><i class="fa-solid fa-clock"></i>Wycena do 24 h</span><span><i class="fa-solid fa-file-invoice"></i>Faktura VAT</span><span><i class="fa-solid fa-recycle"></i>Legalna utylizacja</span></div>
  </div>
  @{[ hero_photo() ]}
</div></section>
<section class="sec" id="uslugi"><div class="wrap">
  <div class="sec-head"><h2 class="h2">Sześć usług.<br>Każdą robimy dobrze.</h2><p class="lead">Wybierz usługę, żeby zobaczyć zakres i wypełnić formularz wyceny dopasowany właśnie do niej.</p></div>
  @{[ svc_rows() ]}
</div></section>
@{[ trips_section() ]}
<section class="sec"><div class="wrap split" style="grid-template-columns:1fr 1fr">
  <div><h2 class="h2">Pomorze z bazy.<br>Polska z partnerami.</h2>$LEGEND<a class="btn btn-ghost" style="margin-top:30px" href="/obszar-dzialania.html">Pełna mapa i lista miast</a></div>
  <div>@{[ map_svg() ]}</div>
</div></section>
<section class="sec tight"><div class="wrap">
  <div class="sec-head"><div><h2 class="h2">Dla firm i instytucji</h2><p class="lead">Stała współpraca na umowę ramową: zarządcy nieruchomości, deweloperzy, sklepy, hotele i biura.</p></div><a class="btn btn-mint" href="/dla-firm.html">Oferta dla firm</a></div>
  <div class="grid2">
    <div class="card"><h3 class="h3">Z kim pracujemy</h3><div class="seg">
      <div><b>Zarządcy i wspólnoty</b><span>Wywóz gabarytów, opróżnianie lokali po eksmisji.</span></div><div><b>Deweloperzy i budowy</b><span>Rozbiórki, skuwanie, wywóz gruzu.</span></div>
      <div><b>Sklepy meblowe i AGD</b><span>Dowóz z wniesieniem, rozliczenie za kurs.</span></div><div><b>Hotele i pensjonaty</b><span>Wymiana wyposażenia i wywóz przed sezonem.</span></div>
      <div><b>Biura i firmy</b><span>Przeprowadzki biur w weekend, bez przestoju.</span></div><div><b>Biura nieruchomości</b><span>Szybkie opróżnienie mieszkania przed sprzedażą.</span></div></div></div>
    <div class="card"><h3 class="h3">Co dostajesz</h3><div class="terms">
      <div><i class="fa-solid fa-file-signature"></i><div><b>Umowa ramowa i stały cennik</b><span>Znasz cenę każdej usługi przed zleceniem.</span></div></div>
      <div><i class="fa-solid fa-user-tie"></i><div><b>Jeden opiekun</b><span>Jeden numer telefonu do wszystkich zleceń.</span></div></div>
      <div><i class="fa-solid fa-receipt"></i><div><b>Zbiorcza faktura miesięczna</b><span>Z odroczonym terminem płatności.</span></div></div>
      <div><i class="fa-solid fa-camera"></i><div><b>Raport ze zdjęciami</b><span>Zdjęcia przed i po każdym zleceniu.</span></div></div></div></div>
  </div>
</div></section>
@{[ reviews_section(title => 'Opinie klientów', tabs => 1, limit => 9) ]}
@{[ realizations_section(limit => 3, more => 1) ]}
<section class="sec tight"><div class="wrap" style="max-width:900px"><h2 class="h2" style="margin-bottom:24px">Najczęstsze pytania</h2>$faqh</div></section>
@{[ final_cta() ]}
};
  my %lb = (%$ORG); # kopia
  out('index.html', page(path => 'index.html', active => '', title => 'RevSerwis — przeprowadzki, opróżnianie, transport i wywóz | Słupsk i cała Polska',
    desc => 'Przeprowadzki, opróżnianie mieszkań, transport z wniesieniem, odbiór odpadów, rozbiórki i przewóz osób. Baza w Słupsku, pomorskie i zachodniopomorskie, cała Polska z partnerami. Wycena do 24 h.',
    ld => [$ORG, $faqld], body => $body));
}

# ------------------------------------------------------------------
# Strony usług
# ------------------------------------------------------------------
for my $s (@SERVICES) {
  my ($cr, $crld) = crumbs([$s->{name}, '']);
  my ($faqh, $faqld) = faq_html($s->{faq});
  my $inc = join '', map { '<li>' . esc($_) . '</li>' } @{ $s->{includes} };
  my $cities = join '', map { qq{<a class="chip" href="/$s->{city}-$_.html">$C{$_}{name}</a>} } @ORDER;
  my $others = join '', map { qq{<a class="chip" href="/$_->{page}"><i class="fa-solid $_->{icon}" style="color:var(--mint)"></i>$_->{name}</a>} } grep { $_ ne $s } @SERVICES;
  my $svcld = { '@context' => 'https://schema.org', '@type' => 'Service', name => $s->{name}, serviceType => $s->{name}, provider => { '@id' => "$BASE/#organization" }, areaServed => [ map { { '@type' => 'City', name => $C{$_}{name} } } @ORDER ], url => "$BASE/$s->{page}" };
  my $revsvc = { przeprowadzki => 'Przeprowadzki', oproznianie => 'Opróżnianie', transport => 'Transport', odpady => 'Odbiór odpadów', rozbiorki => '', przewoz => 'Przewóz osób' }->{ $s->{key} };
  my $revs = $revsvc ? review_cards(service => $revsvc, limit => 3) : '';
  my $body = qq{
$cr
<section class="page-hero"><div class="wrap twocol">
  <div><h1 class="h1">$s->{name}</h1><p class="lead">$s->{lead}</p>
    <div class="ctas"><a class="btn btn-mint" href="/wycena.html?usluga=$s->{form}">Wyceń: $s->{name}</a><a class="btn btn-ghost" href="tel:$TELH"><i class="fa-solid fa-phone"></i>$TEL</a></div>
    <div class="scope" style="margin-top:26px">@{[ join '', map { '<span class="chip">' . esc($_) . '</span>' } @{ $s->{scope} } ]}</div></div>
  <aside><div class="card"><h2 class="h3" style="margin-bottom:12px">Jak to działa</h2><div class="terms" style="margin-top:0">
    <div><i class="fa-solid fa-list-check"></i><div><b>Opisujesz zlecenie</b><span>Formularz pyta o wszystko, co wpływa na cenę.</span></div></div>
    <div><i class="fa-solid fa-clock"></i><div><b>Wycena do 24 h</b><span>SMS z ceną i link do panelu klienta.</span></div></div>
    <div><i class="fa-solid fa-circle-check"></i><div><b>Akceptujesz jednym kliknięciem</b><span>Potwierdzamy termin i przyjeżdżamy.</span></div></div></div></div></aside>
</div></section>
<section class="sec tight" style="padding-top:56px"><div class="wrap twocol">
  <div class="prose"><h2 style="margin-top:0">Co obejmuje usługa</h2><ul>$inc</ul>
    <h2>Pytania</h2>$faqh</div>
  <aside>@{[ $revs ? qq{<div><h2 class="h3" style="margin-bottom:12px">Co mówią klienci</h2>$revs</div>} : '' ]}</aside>
</div></section>
@{[ realizations_section(service => $s->{name}, limit => 3, more => 1) ]}
<section class="sec tight"><div class="wrap"><h2 class="h3" style="margin-bottom:14px">$s->{h1city} w Twoim mieście</h2><div class="linkgrid">$cities</div>
  <h2 class="h3" style="margin:34px 0 14px">Inne usługi</h2><div class="linkgrid">$others</div></div></section>
@{[ final_cta("Wyceń: $s->{name}", "/wycena.html?usluga=$s->{form}") ]}
};
  out($s->{page}, page(path => $s->{page}, active => 'uslugi', title => "$s->{title} | RevSerwis", desc => "$s->{lead} Słupsk, Pomorze i cała Polska.", ld => [$svcld, $crld, $faqld], body => $body));
}

# Wszystkie usługi
{
  my ($cr, $crld) = crumbs(['Usługi', '']);
  out('uslugi.html', page(path => 'uslugi.html', active => 'uslugi', title => 'Usługi RevSerwis — przeprowadzki, opróżnianie, transport, odpady, rozbiórki, przewóz osób', desc => 'Sześć usług RevSerwis: przeprowadzki, opróżnianie, transport z wniesieniem, odbiór odpadów, rozbiórki i skuwanie oraz przewóz osób. Wycena do 24 h.', ld => [$crld],
    body => qq{$cr<section class="page-hero"><div class="wrap"><h1 class="h1">Usługi</h1><p class="lead">Robimy sześć rzeczy i każdą dobrze. Wybierz usługę, żeby zobaczyć zakres i wycenić zlecenie.</p></div></section><section class="sec tight" style="padding-top:40px"><div class="wrap">@{[ svc_rows() ]}</div></section>@{[ final_cta() ]}}));
}

# ------------------------------------------------------------------
# Podstrony miast: usługa × miasto + hub miasta
# ------------------------------------------------------------------
sub city_near {
  my ($key, $n) = @_;
  my $me = $C{$key};
  my @o = sort { abs($C{$a}{km} - $me->{km}) <=> abs($C{$b}{km} - $me->{km}) || $a cmp $b } grep { $_ ne $key } @ORDER;
  return @o[0 .. $n - 1];
}

sub city_service_text {
  my ($s, $c) = @_;
  my $in = $c->{in}; my $home = home_region($c);
  my $access = $c->{tier} eq 'baza' ? "W $c->{loc} jesteśmy na miejscu, więc w pilnych sprawach przyjeżdżamy często tego samego dnia."
             : $c->{tier} eq 'blisko' ? "$c->{name} leży blisko naszej bazy ($c->{km} km), dlatego terminy są krótkie, a koszt dojazdu niewielki."
             : $home ? "Do $c->{gen} jedziemy z bazy w Słupsku ($c->{km} km). Większe zlecenia planujemy na pełny dzień, żeby nie doliczać dodatkowych dojazdów."
             : "$c->{name} obsługujemy razem z zaufanymi partnerami, a Ty masz jeden kontakt i jedną fakturę od RevSerwis.";
  my %t = (
    przeprowadzki => "Zabudowa $in to $c->{housing}. Dlatego w formularzu pytamy o piętro, windę i odległość od parkingu: od tego zależy, ile osób wyślemy i ile potrwa noszenie. Przeprowadzamy mieszkania, domy i biura, $in i z $c->{gen} w każdą stronę Polski.",
    'oproznianie-i-wywoz' => "Opróżniamy mieszkania, domy, garaże, piwnice i strychy $in. Typowe zlecenia to mieszkania pod sprzedaż lub wynajem, lokale po najemcach i mieszkania po zmarłych. Zabudowa $in to $c->{housing}, więc ekipę dobieramy do pięter i dojścia.",
    'transport-rzeczy' => "Przywozimy meble, AGD i ładunki $in: ze sklepów, z OLX, od osób prywatnych i z magazynów. Wnosimy na piętro, a przy okazji możemy zabrać stary mebel do utylizacji.",
    'odbior-odpadow' => "Odbieramy gabaryty, AGD, RTV, odpady zielone i gruz w workach $in. Sami wynosimy z mieszkania, piwnicy czy posesji i oddajemy wszystko do legalnej utylizacji.",
    rozbiorki     => "Przygotowujemy mieszkania $in do remontu: kucie płytek, rozbiórki pieców, zrywanie tapet, kasetonów, boazerii, podłóg i sufitów, skuwanie tynków, demontaż sanitariatów i wywóz gruzu. W budynkach takich jak $in ($c->{housing}) dbamy o zabezpieczenie klatki i sąsiadów.",
    'przewozy-osob' => "Wozimy osoby z $c->{gen} i okolic na lotniska, wesela, imprezy i wyjazdy firmowe. Busy mieszczą do 8 osób z bagażem.",
  );
  return ($t{ $s->{city} }, $access);
}

for my $key (@ORDER) {
  my $c = $C{$key};
  my $home = home_region($c);
  my @near = city_near($key, 6);
  my $areas = join ', ', @{ $c->{areas} || [] };
  my $nearv = join ', ', @{ $c->{near} || [] };
  my $zone = $home ? 'Z bazy w Słupsku' : 'Z partnerami RevSerwis';

  for my $s (@SERVICES) {
    my $file = "$s->{city}-$key.html";
    my $h1 = "$s->{h1city} $c->{name}";
    my ($cr, $crld) = crumbs([$s->{name}, $s->{page}], [$c->{name}, '']);
    my ($txt, $access) = city_service_text($s, $c);
    my $faq = [
      ["Ile kosztuje " . lc($s->{name}) . " $c->{in}?", "Cena zależy od zakresu, pięter, windy i dojazdu. Wypełnij formularz, a dokładną wycenę dostaniesz do 24 godzin. Dojazd do $c->{gen}: " . fmt_dist($c) . '.'],
      ["Jak szybko możecie przyjechać do $c->{gen}?", $access],
      ["Czy obsługujecie okolice $c->{gen}?", "Tak, także miejscowości takie jak $nearv."],
    ];
    my ($faqh, $faqld) = faq_html($faq);
    my $inc = join '', map { '<li>' . esc($_) . '</li>' } @{ $s->{includes} };
    my $other_svc = join '', map { qq{<a class="chip" href="/$_->{city}-$key.html">$_->{h1city} $c->{name}</a>} } grep { $_ ne $s } @SERVICES;
    my $near_links = join '', map { qq{<a class="chip" href="/$s->{city}-$_.html">$s->{h1city} $C{$_}{name}</a>} } @near;
    my $q = "/wycena.html?usluga=$s->{form}&amp;miasto=" . urlenc($c->{name});
    my $svcld = { '@context' => 'https://schema.org', '@type' => 'Service', name => $h1, serviceType => $s->{name}, provider => { '@id' => "$BASE/#organization" }, areaServed => { '@type' => 'City', name => $c->{name} }, url => "$BASE/$file" };
    my $body = qq{
$cr
<section class="page-hero"><div class="wrap twocol">
  <div><h1 class="h1">$h1</h1><p class="lead">$s->{lead}</p>
    <div class="ctas"><a class="btn btn-mint" href="$q">Wyceń w $c->{loc}</a><a class="btn btn-ghost" href="tel:$TELH"><i class="fa-solid fa-phone"></i>$TEL</a></div>
    <div class="facts"><div><b>@{[ $c->{km} ? "$c->{km} km" : 'Baza' ]}</b><span>@{[ $c->{km} ? 'od bazy w Słupsku' : 'nasze busy są tutaj' ]}</span></div><div><b>do 24 h</b><span>czas na wycenę</span></div><div><b>5,0 ★</b><span>@{[ $R->{google}{count} + $R->{fixly}{count} ]} opinii</span></div></div></div>
  <aside><div class="zone"><h2 class="h3" style="display:flex;gap:10px;align-items:center"><span class="sw @{[ $home ? 'home' : 'partner' ]}" style="margin:0"></span>$zone</h2><p style="margin-top:8px">$c->{route}</p><ul><li><i class="fa-solid fa-route"></i>@{[ fmt_dist($c) ]}</li><li><i class="fa-solid fa-location-dot"></i>$c->{county}, woj. $c->{region}</li></ul></div></aside>
</div></section>
<section class="sec tight" style="padding-top:56px"><div class="wrap twocol">
  <div class="prose">
    <h2 style="margin-top:0">$s->{name} $c->{in}</h2><p>$c->{about}</p><p>$txt</p><p>$access</p>
    @{[ $areas ? "<h3>Dzielnice i osiedla</h3><p>Pracujemy w całym mieście, m.in.: $areas.</p>" : '' ]}
    @{[ $nearv ? "<h3>Okolice</h3><p>Dojeżdżamy też do: $nearv.</p>" : '' ]}
    <h2>Co obejmuje usługa</h2><ul>$inc</ul>
    <h2>Pytania</h2>$faqh
  </div>
  <aside><div class="card"><h2 class="h3" style="margin-bottom:10px">Wycena do 24 h</h2><p class="muted small" style="margin-bottom:16px">Opisz zlecenie w formularzu. Dokładną cenę wyślemy SMS-em i do panelu klienta.</p><a class="btn btn-mint" style="width:100%" href="$q">Wyceń zlecenie</a><a class="btn btn-ghost" style="width:100%;margin-top:10px" href="$WA" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp"></i>Napisz na WhatsApp</a></div>
    <div>@{[ review_cards(limit => 2) ]}</div></aside>
</div></section>
<section class="sec tight"><div class="wrap"><h2 class="h3" style="margin-bottom:14px">Inne usługi: $c->{name}</h2><div class="linkgrid">$other_svc<a class="chip" href="/uslugi-$key.html">Wszystkie usługi: $c->{name}</a></div>
  <h2 class="h3" style="margin:34px 0 14px">$s->{h1city} w okolicy</h2><div class="linkgrid">$near_links</div></div></section>
@{[ final_cta("$h1: wycena do 24 h", $q) ]}
};
    out($file, page(path => $file, active => 'uslugi', title => "$h1 — wycena do 24 h | RevSerwis",
      desc => "$h1: $s->{short} " . ($home ? 'Ekipa z bazy w Słupsku' : 'Realizacja z partnerami RevSerwis') . ", " . fmt_dist($c) . ". Wycena do 24 h, faktura VAT.", ld => [$svcld, $crld, $faqld], body => $body));
  }

  # hub miasta
  my ($cr, $crld) = crumbs(['Obszar działania', 'obszar-dzialania.html'], [$c->{name}, '']);
  my $near_links = join '', map { qq{<a class="chip" href="/uslugi-$_.html">$C{$_}{name}</a>} } @near;
  my $body = qq{
$cr
<section class="page-hero"><div class="wrap twocol">
  <div><h1 class="h1">RevSerwis $c->{name}</h1><p class="lead">Przeprowadzki, opróżnianie, transport z wniesieniem, odbiór odpadów, rozbiórki i przewóz osób $c->{in}. $c->{about}</p>
    <div class="ctas"><a class="btn btn-mint" href="/wycena.html?miasto=@{[ urlenc($c->{name}) ]}">Wyceń zlecenie</a><a class="btn btn-ghost" href="tel:$TELH"><i class="fa-solid fa-phone"></i>$TEL</a></div></div>
  <aside><div class="zone"><h2 class="h3" style="display:flex;gap:10px;align-items:center"><span class="sw @{[ $home ? 'home' : 'partner' ]}" style="margin:0"></span>$zone</h2><p style="margin-top:8px">$c->{route}</p><ul><li><i class="fa-solid fa-route"></i>@{[ fmt_dist($c) ]}</li><li><i class="fa-solid fa-location-dot"></i>$c->{county}, woj. $c->{region}</li></ul></div></aside>
</div></section>
<section class="sec tight" style="padding-top:40px"><div class="wrap">@{[ svc_rows(city => $key) ]}</div></section>
<section class="sec tight"><div class="wrap"><h2 class="h3" style="margin-bottom:14px">Miasta w okolicy</h2><div class="linkgrid">$near_links<a class="chip" href="/obszar-dzialania.html">Cała mapa</a></div></div></section>
@{[ final_cta() ]}
};
  out("uslugi-$key.html", page(path => "uslugi-$key.html", active => 'obszar', title => "RevSerwis $c->{name} — przeprowadzki, opróżnianie, transport, odpady, rozbiórki",
    desc => "Usługi RevSerwis $c->{in}: przeprowadzki, opróżnianie, transport z wniesieniem, odbiór odpadów, rozbiórki i przewóz osób. " . fmt_dist($c) . '. Wycena do 24 h.', ld => [$crld], body => $body));
}

# ------------------------------------------------------------------
# Obszar działania
# ------------------------------------------------------------------
{
  my ($cr, $crld) = crumbs(['Obszar działania', '']);
  my @homec = grep { home_region($C{$_}) } @ORDER;
  my @partc = grep { !home_region($C{$_}) } @ORDER;
  my $hc = join '', map { qq{<a class="chip" href="/uslugi-$_.html">$C{$_}{name}</a>} } @homec;
  my $pc = join '', map { qq{<a class="chip" href="/uslugi-$_.html">$C{$_}{name}</a>} } @partc;
  my $body = qq{
$cr
<section class="page-hero" style="border:0;padding-bottom:28px"><div class="wrap"><h1 class="h1">Obszar działania</h1><p class="lead">Pomorskie i zachodniopomorskie obsługujemy sami, z bazy w Słupsku. Resztę Polski i wyjazdy za granicę realizujemy z firmami partnerskimi, a Ty masz jeden kontakt i jedną fakturę.</p></div></section>
<section class="wrap mapgrid" style="padding-bottom:80px">
  <div class="mapbox">@{[ map_svg(big => 1) ]}<div class="abroad"><span><i class="fa-solid fa-earth-europe"></i>Niemcy</span><span><i class="fa-solid fa-earth-europe"></i>Skandynawia</span><span><i class="fa-solid fa-earth-europe"></i>Holandia i Belgia</span><span><i class="fa-solid fa-earth-europe"></i>Wielka Brytania</span></div></div>
  <div class="side">
    <div class="zone"><h2 class="h3" style="display:flex;gap:12px;align-items:center"><span class="sw home" style="margin:0"></span>Z bazy w Słupsku</h2><p>Województwo pomorskie i zachodniopomorskie w całości. Nasza ekipa i nasze busy.</p>
      <ul><li><i class="fa-solid fa-bolt"></i>Okolice Słupska: często tego samego dnia</li><li><i class="fa-solid fa-route"></i>Reszta regionu: zwykle w 1–3 dni</li><li><i class="fa-solid fa-hammer"></i>Wszystkie 6 usług, także rozbiórki</li></ul>
      <div class="cities">$hc</div></div>
    <div class="zone"><h2 class="h3" style="display:flex;gap:12px;align-items:center"><span class="sw partner" style="margin:0"></span>Z partnerami</h2><p>Pozostałe 14 województw: przeprowadzki, transport i opróżnianie w całej Polsce.</p>
      <ul><li><i class="fa-solid fa-user-check"></i>Jeden opiekun z RevSerwis</li><li><i class="fa-solid fa-receipt"></i>Jedna faktura, nasze warunki</li><li><i class="fa-solid fa-camera"></i>Zdjęcia i raport z realizacji</li></ul>@{[ $pc ? qq{<div class="cities">$pc</div>} : '' ]}</div>
    <div class="zone"><h2 class="h3" style="display:flex;gap:12px;align-items:center"><span class="sw abroad" style="margin:0"></span>Za granicą</h2><p>Przeprowadzki i transport do Europy, z zabezpieczeniem ładunku i planem trasy.</p></div>
    <a class="btn btn-mint" href="/wycena.html">Wyceń zlecenie</a>
  </div>
</section>
};
  out('obszar-dzialania.html', page(path => 'obszar-dzialania.html', active => 'obszar', title => 'Obszar działania — pomorskie, zachodniopomorskie i cała Polska | RevSerwis',
    desc => 'Mapa obszaru działania RevSerwis: województwo pomorskie i zachodniopomorskie z bazy w Słupsku, pozostałe 14 województw z partnerami oraz wyjazdy za granicę.', ld => [$crld], body => $body));
}

# ------------------------------------------------------------------
# Dla firm
# ------------------------------------------------------------------
{
  my ($cr, $crld) = crumbs(['Dla firm', '']);
  my $faq = [['Czy podpisujecie umowy ramowe?', 'Tak. Ustalamy stały cennik, zakres usług, czas reakcji i sposób rozliczenia, a potem zlecasz prace jednym telefonem lub mailem.'], ['Jak wygląda rozliczenie?', 'Fakturą VAT za każde zlecenie albo zbiorczą fakturą miesięczną z odroczonym terminem płatności.'], ['Czy obsługujecie firmy spoza Pomorza?', 'Tak. Pomorskie i zachodniopomorskie realizujemy sami, resztę Polski z partnerami, na tych samych warunkach i z jednym opiekunem.'], ['Czy dostanę potwierdzenie utylizacji?', 'Tak, przy odbiorze odpadów od firm wystawiamy potwierdzenie przekazania do utylizacji.']];
  my ($faqh, $faqld) = faq_html($faq);
  my $body = qq{
$cr
<section class="page-hero"><div class="wrap twocol">
  <div><h1 class="h1">Dla firm i instytucji</h1><p class="lead">Jeden partner do przeprowadzek, opróżniania, transportu, wywozu i rozbiórek. Stałe warunki, jeden opiekun i zbiorcza faktura, w całej Polsce.</p>
    <div class="ctas"><a class="btn btn-mint" href="#zapytanie">Zapytaj o ofertę</a><a class="btn btn-ghost" href="tel:$TELH"><i class="fa-solid fa-phone"></i>$TEL</a></div></div>
  <aside><div class="card"><h2 class="h3" style="margin-bottom:6px">Masz konto firmowe?</h2><p class="muted small" style="margin-bottom:14px">Hotele, biura nieruchomości i deweloperzy, którym nadaliśmy dostęp, logują się e-mailem.</p><a class="btn btn-ghost" style="width:100%" href="/konto-firma.html">Panel firmy</a></div></aside>
</div></section>
<section class="sec tight" style="padding-top:56px"><div class="wrap grid2">
  <div class="card"><h2 class="h3">Z kim pracujemy</h2><div class="seg">
    <div><b>Zarządcy nieruchomości i wspólnoty</b><span>Wywóz gabarytów z altan i piwnic, opróżnianie lokali po eksmisji i komorniku.</span></div>
    <div><b>Deweloperzy i firmy budowlane</b><span>Rozbiórki, skuwanie, wywóz gruzu, sprzątanie przed odbiorami.</span></div>
    <div><b>Sklepy meblowe i AGD</b><span>Dowóz do klienta z wniesieniem i montażem, odbiór starego sprzętu.</span></div>
    <div><b>Hotele i pensjonaty</b><span>Wymiana wyposażenia, wywóz starych mebli, transport przed sezonem.</span></div>
    <div><b>Biura i firmy</b><span>Przeprowadzki biur po godzinach i w weekend, archiwa, magazyny.</span></div>
    <div><b>Biura nieruchomości</b><span>Opróżnienie i przygotowanie mieszkania do sesji zdjęciowej i sprzedaży.</span></div></div></div>
  <div class="card"><h2 class="h3">Co dostajesz</h2><div class="terms">
    <div><i class="fa-solid fa-file-signature"></i><div><b>Umowa ramowa i stały cennik</b><span>Znasz cenę każdej usługi, zanim zlecisz pracę.</span></div></div>
    <div><i class="fa-solid fa-stopwatch"></i><div><b>Ustalony czas reakcji</b><span>Termin wyceny i realizacji wpisujemy do umowy.</span></div></div>
    <div><i class="fa-solid fa-user-tie"></i><div><b>Jeden opiekun</b><span>Jeden numer telefonu i jeden mail do wszystkich zleceń.</span></div></div>
    <div><i class="fa-solid fa-receipt"></i><div><b>Faktura VAT lub zbiorcza faktura miesięczna</b><span>Z odroczonym terminem płatności.</span></div></div>
    <div><i class="fa-solid fa-camera"></i><div><b>Raport ze zdjęciami</b><span>Zdjęcia przed i po każdym zleceniu.</span></div></div>
    <div><i class="fa-solid fa-recycle"></i><div><b>Potwierdzenie utylizacji</b><span>Dokumenty przekazania odpadów dla Twojej firmy.</span></div></div></div></div>
</div></section>
<section class="sec tight"><div class="wrap"><h2 class="h2" style="margin-bottom:28px">Jak zaczynamy współpracę</h2><div class="steps">
  <div><b>Rozmowa</b><span>Opowiadasz, czego potrzebujesz i jak często.</span></div>
  <div><b>Oferta</b><span>Przygotowujemy cennik i warunki dopasowane do Twojej firmy.</span></div>
  <div><b>Umowa ramowa</b><span>Podpisujemy umowę z czasem reakcji i zasadami rozliczeń.</span></div>
  <div><b>Zlecenia</b><span>Zlecasz telefonicznie lub mailem, my raportujemy ze zdjęciami.</span></div></div></div></section>
<section class="sec tight" id="zapytanie"><div class="wrap twocol">
  <div class="card"><h2 class="h3" style="margin-bottom:6px">Zapytanie o ofertę dla firmy</h2><p class="muted small" style="margin-bottom:20px">Odpowiemy w ciągu jednego dnia roboczego.</p>
    <form data-contact-form data-kind="company" novalidate>
      <div class="grid2" style="gap:12px"><div class="f"><label for="b-company">Nazwa firmy <span class="req">*</span></label><input class="in" id="b-company" name="company" required maxlength="180" autocomplete="organization"></div><div class="f"><label for="b-nip">NIP</label><input class="in" id="b-nip" name="nip" maxlength="20"></div>
      <div class="f"><label for="b-name">Imię i nazwisko <span class="req">*</span></label><input class="in" id="b-name" name="name" required maxlength="140" autocomplete="name"></div><div class="f"><label for="b-phone">Telefon</label><input class="in" id="b-phone" name="phone" type="tel" maxlength="40" autocomplete="tel"></div></div>
      <div class="f"><label for="b-email">E-mail <span class="req">*</span></label><input class="in" id="b-email" name="email" type="email" required maxlength="160" autocomplete="email"></div>
      <div class="f"><label for="b-msg">Czego potrzebujecie? <span class="req">*</span></label><textarea class="ta" id="b-msg" name="message" required maxlength="5000" placeholder="Np. zarządzamy 12 budynkami w Słupsku, potrzebujemy wywozu gabarytów raz w miesiącu…"></textarea></div>
      <input type="hidden" name="topic" value="Współpraca B2B"><div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>
      <label class="check" style="margin-bottom:16px"><input type="checkbox" name="consent" required><span>Zgadzam się na kontakt w sprawie oferty. <a href="/polityka-prywatnosci.html">Polityka prywatności</a></span></label>
      <div class="form-msg"></div><button class="btn btn-mint" type="submit">Wyślij zapytanie</button>
    </form></div>
  <aside><h2 class="h3" style="margin-bottom:14px">Pytania firm</h2>$faqh</aside>
</div></section>
};
  out('dla-firm.html', page(path => 'dla-firm.html', active => 'firmy', title => 'Dla firm — umowy ramowe, przeprowadzki biur, wywóz, rozbiórki | RevSerwis',
    desc => 'RevSerwis dla firm: umowa ramowa, stały cennik, jeden opiekun, zbiorcza faktura i raport ze zdjęciami. Zarządcy nieruchomości, deweloperzy, sklepy, hotele, biura.', ld => [$crld, $faqld], body => $body));
}

# ------------------------------------------------------------------
# Opinie i realizacje
# ------------------------------------------------------------------
{
  my ($cr, $crld) = crumbs(['Opinie i realizacje', '']);
  my $body = qq{$cr<section class="page-hero"><div class="wrap"><h1 class="h1">Opinie i realizacje</h1><p class="lead">Wszystkie opinie z Google i Fixly oraz zdjęcia przed i po z naszych zleceń.</p><div style="margin-top:26px;max-width:520px;position:relative;height:120px">@{[ rating_boxes() ]}</div></div></section>}
    . realizations_section() . reviews_section(title => 'Opinie klientów', tabs => 1) . final_cta();
  out('realizacje.html', page(path => 'realizacje.html', active => 'opinie', title => 'Opinie i realizacje — 5,0 w Google i na Fixly | RevSerwis',
    desc => 'Opinie klientów RevSerwis z Google i Fixly (średnia 5,0) oraz zdjęcia przed i po z realizacji: przeprowadzki, opróżnianie, wywóz, rozbiórki.', ld => [$crld, $ORG], body => $body));
}

# ------------------------------------------------------------------
# Po drodze
# ------------------------------------------------------------------
{
  my ($cr, $crld) = crumbs(['Po drodze', '']);
  my $body = qq{
$cr
<section class="page-hero"><div class="wrap twocol">
  <div><h1 class="h1">Po drodze</h1><p class="lead">Nasze busy często wracają z tras z wolnym miejscem. Jeśli jedziemy w Twoją stronę, przewieziemy meble, paczki czy ładunek dużo taniej niż osobny kurs.</p></div>
  <aside><div class="card"><h2 class="h3" style="margin-bottom:12px">Jak to działa</h2><div class="terms" style="margin-top:0">
    <div><i class="fa-solid fa-route"></i><div><b>Wybierasz trasę</b><span>Lista kursów z wolnym miejscem w m³.</span></div></div>
    <div><i class="fa-solid fa-box"></i><div><b>Rezerwujesz miejsce</b><span>Podajesz, co przewozimy i ile to zajmie.</span></div></div>
    <div><i class="fa-solid fa-phone"></i><div><b>Potwierdzamy godzinę</b><span>Dzwonimy i ustalamy odbiór.</span></div></div></div></div></aside>
</div></section>
<section class="sec tight" style="padding-top:44px"><div class="wrap"><div class="trips" data-trips data-book><div class="trip-empty">Ładujemy trasy…</div></div>
  <div class="alert info" style="margin-top:22px"><i class="fa-solid fa-circle-info"></i><span>Nie ma Twojej trasy? <a href="/wycena.html?usluga=transport">Wyślij zapytanie o transport</a>, a damy znać, gdy będziemy jechać w Twoją stronę.</span></div></div></section>
<dialog class="card" id="bookDlg" style="max-width:560px;width:calc(100% - 32px);color:var(--text);margin:auto;border:1px solid var(--line2)">
  <form data-book-form novalidate><h2 class="h3" style="margin-bottom:4px">Rezerwacja miejsca</h2><p class="muted small" data-book-route style="margin-bottom:18px"></p>
    <div class="grid2" style="gap:12px"><div class="f"><label for="k-name">Imię i nazwisko <span class="req">*</span></label><input class="in" id="k-name" name="name" required maxlength="140" autocomplete="name"></div><div class="f"><label for="k-phone">Telefon <span class="req">*</span></label><input class="in" id="k-phone" name="phone" type="tel" required maxlength="40" autocomplete="tel"></div></div>
    <div class="f"><label for="k-vol">Ile miejsca (m³) <span class="req">*</span></label><input class="in" id="k-vol" name="volumeM3" type="number" min="0.25" step="0.25" required><small class="muted small">Kanapa to ok. 1,5 m³, lodówka ok. 1 m³, 10 kartonów ok. 1 m³.</small></div>
    <div class="f"><label for="k-from">Adres odbioru <span class="req">*</span></label><input class="in" id="k-from" name="pickupAddress" required maxlength="300"></div>
    <div class="f"><label for="k-to">Adres dostawy <span class="req">*</span></label><input class="in" id="k-to" name="dropAddress" required maxlength="300"></div>
    <div class="f"><label for="k-items">Co przewozimy? <span class="req">*</span></label><textarea class="ta" id="k-items" name="items" required maxlength="2000" placeholder="Np. kanapa 3-osobowa, 2 krzesła, 6 kartonów"></textarea></div>
    <div class="f"><label for="k-floor">Piętra i winda</label><input class="in" id="k-floor" name="floorInfo" maxlength="200" placeholder="Np. odbiór 3. piętro bez windy, dostawa parter"></div>
    <div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>
    <label class="check" style="margin-bottom:16px"><input type="checkbox" name="consent" required><span>Zgadzam się na kontakt w sprawie rezerwacji. <a href="/polityka-prywatnosci.html">Polityka prywatności</a></span></label>
    <div class="form-msg"></div><div class="ctas"><button class="btn btn-mint" type="submit">Rezerwuję miejsce</button><button class="btn btn-ghost" type="button" data-close>Anuluj</button></div></form>
</dialog>
@{[ final_cta() ]}
};
  out('po-drodze.html', page(path => 'po-drodze.html', active => 'podrodze', title => 'Po drodze — tańszy transport w wolnym miejscu w busie | RevSerwis',
    desc => 'Po drodze: wolne miejsce w busach RevSerwis na trasach po Polsce i Europie. Przewieziemy meble i ładunki taniej, bo i tak jedziemy w Twoją stronę.', ld => [$crld], body => $body));
}

# ------------------------------------------------------------------
# Kontakt
# ------------------------------------------------------------------
{
  my ($cr, $crld) = crumbs(['Kontakt', '']);
  my $body = qq{
$cr
<section class="page-hero"><div class="wrap"><h1 class="h1">Kontakt</h1><p class="lead">Najszybciej przez telefon albo WhatsApp. Wycenę zlecenia najlepiej zamówić formularzem: odpowiemy do 24 godzin.</p></div></section>
<section class="sec tight" style="padding-top:48px"><div class="wrap twocol">
  <div class="card"><h2 class="h3" style="margin-bottom:6px">Napisz do nas</h2><p class="muted small" style="margin-bottom:20px">Pytania, reklamacje i współpraca. Do wyceny użyj <a href="/wycena.html">formularza wyceny</a>.</p>
    <form data-contact-form data-kind="person" novalidate>
      <div class="grid2" style="gap:12px"><div class="f"><label for="c-name">Imię i nazwisko <span class="req">*</span></label><input class="in" id="c-name" name="name" required maxlength="140" autocomplete="name"></div><div class="f"><label for="c-phone">Telefon</label><input class="in" id="c-phone" name="phone" type="tel" maxlength="40" autocomplete="tel"></div></div>
      <div class="f"><label for="c-email">E-mail <span class="req">*</span></label><input class="in" id="c-email" name="email" type="email" required maxlength="160" autocomplete="email"></div>
      <div class="f"><label for="c-topic">Temat</label><select class="sel in" id="c-topic" name="topic"><option>Pytanie ogólne</option><option>Wycena usługi</option><option>Współpraca B2B</option><option>Reklamacja lub uwagi</option><option>Inne</option></select></div>
      <div class="f"><label for="c-msg">Wiadomość <span class="req">*</span></label><textarea class="ta" id="c-msg" name="message" required maxlength="5000"></textarea></div>
      <div class="hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>
      <label class="check" style="margin-bottom:16px"><input type="checkbox" name="consent" required><span>Zgadzam się na kontakt w sprawie wiadomości. <a href="/polityka-prywatnosci.html">Polityka prywatności</a></span></label>
      <div class="form-msg"></div><button class="btn btn-mint" type="submit">Wyślij wiadomość</button>
    </form></div>
  <aside><div class="card"><div class="contact-list">
    <a href="tel:$TELH"><i class="fa-solid fa-phone"></i><span>$TEL<small>Pon.–sob. 7:00–20:00</small></span></a>
    <a href="$WA" rel="noopener" target="_blank"><i class="fa-brands fa-whatsapp"></i><span>WhatsApp<small>Także zdjęcia i filmy</small></span></a>
    <a href="mailto:$MAIL"><i class="fa-regular fa-envelope"></i><span>$MAIL<small>Odpowiadamy w dzień roboczy</small></span></a>
    <a href="$R->{google}{url}" rel="noopener" target="_blank"><i class="fa-solid fa-location-dot"></i><span>pl. Zwycięstwa 3, 76-200 Słupsk<small>Baza RevSerwis</small></span></a></div></div>
    <div class="card"><h2 class="h3" style="font-size:17px;margin-bottom:8px">Dane firmy</h2><p class="muted small">Rev Serwis Kacper Taczała<br>NIP 8393269274 · REGON 545866163</p></div></aside>
</div></section>
};
  out('kontakt.html', page(path => 'kontakt.html', active => 'kontakt', title => 'Kontakt — telefon 735 396 534, WhatsApp, e-mail | RevSerwis',
    desc => 'Kontakt z RevSerwis: telefon 735 396 534, WhatsApp, kontakt@revserwis.pl. Baza w Słupsku, pl. Zwycięstwa 3. Wycena zlecenia do 24 h.', ld => [$crld, $ORG], body => $body));
}

# ------------------------------------------------------------------
# Wycena i panel klienta (powłoki — logika w assets/wycena13.js i assets/konto13.js)
# ------------------------------------------------------------------
{
  my $body = qq{<div class="wrap" id="quoteApp" style="padding:40px 32px 90px"><noscript><div class="alert err">Formularz wymaga JavaScriptu. Zadzwoń: $TEL albo napisz na WhatsApp.</div></noscript><div class="empty-box">Ładujemy formularz…</div></div>};
  out('wycena.html', page(path => 'wycena.html', active => '', title => 'Wycena zlecenia — odpowiedź do 24 h | RevSerwis',
    desc => 'Szczegółowa wycena przeprowadzki, opróżniania, transportu, odbioru odpadów, rozbiórek i przewozu osób. Opisz zlecenie, dokładną cenę wyślemy do 24 godzin.', body => $body,
    scripts => qq{<script src="/assets/quote-form.js?v=$VER" defer></script><script src="/assets/wycena13.js?v=$VER" defer></script>}));
  my $kbody = qq{<div id="kontoApp"><noscript><div class="wrap" style="padding:40px 0"><div class="alert err">Panel klienta wymaga JavaScriptu.</div></div></noscript></div>};
  out('konto.html', page(path => 'konto.html', active => '', noindex => 1, title => 'Panel klienta | RevSerwis', desc => 'Panel klienta RevSerwis: Twoje zlecenia, wyceny, terminy, zdjęcia i wiadomości. Logowanie numerem telefonu i hasłem.', body => $kbody,
    scripts => qq{<script src="/assets/konto13.js?v=$VER" defer></script>}));
}

# 404
out('404.html', page(path => '404.html', noindex => 1, active => '', title => 'Nie ma takiej strony | RevSerwis', desc => 'Nie znaleźliśmy tej strony.',
  body => qq{<section class="sec"><div class="wrap" style="max-width:760px"><h1 class="h1">Nie ma takiej strony</h1><p class="lead" style="margin:18px 0 28px">Mogła zostać przeniesiona po zmianach na stronie. Wybierz usługę albo wróć na stronę główną.</p><div class="ctas"><a class="btn btn-mint" href="/">Strona główna</a><a class="btn btn-ghost" href="/wycena.html">Wyceń zlecenie</a></div><div style="margin-top:40px">@{[ svc_rows() ]}</div></div></section>}));

# ------------------------------------------------------------------
# Sitemap
# ------------------------------------------------------------------
{
  my @d = localtime; my $today = sprintf('%04d-%02d-%02d', $d[5] + 1900, $d[4] + 1, $d[3]);
  my @urls = grep { $_ ne '404.html' && $_ ne 'konto.html' } sort keys %written;
  my %prio = ('index.html' => '1.0', 'wycena.html' => '0.9');
  my $x = qq{<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n};
  for my $u ('index.html', grep { $_ ne 'index.html' } @urls) {
    my $loc = $u eq 'index.html' ? "$BASE/" : "$BASE/$u";
    my $p = $prio{$u} // ($u =~ /^(uslugi-|[a-z-]+-(?:@{[ join '|', @ORDER ]})\.html)/ ? '0.6' : '0.8');
    $x .= "  <url><loc>$loc</loc><lastmod>$today</lastmod><priority>$p</priority></url>\n";
  }
  $x .= "  <url><loc>$BASE/polityka-prywatnosci.html</loc><lastmod>$today</lastmod><priority>0.2</priority></url>\n</urlset>\n";
  open my $h, '>:utf8', "$PUB/sitemap.xml" or die; print $h $x; close $h;
}

printf "RevSerwis 13: zapisano %d stron + sitemap.xml (%d adresów)\n", scalar(keys %written), scalar(grep { $_ ne '404.html' && $_ ne 'konto.html' } keys %written) + 1;

# ------------------------------------------------------------------
# Polityka prywatności — treść z dotychczasowej strony (scripts/site-v13/polityka-zrodlo.html), w nowym wyglądzie
# ------------------------------------------------------------------
{
  my $src = slurp("$DIR/polityka-zrodlo.html"); utf8::decode($src);
  my ($main) = $src =~ m#<main[^>]*>(.*?)</main>#s;
  $main //= '';
  $main =~ s#<(script|style|svg)\b.*?</\1>##gs;
  $main =~ s#\s(class|style|data-[a-z-]+|aria-hidden)="[^"]*"##g;
  $main =~ s#<i\b[^>]*></i>##g;
  $main =~ s#</?(section|div|span)\b[^>]*>##g;
  $main =~ s#<h1>.*?</h1>##s;
  $main =~ s#\n\s*\n+#\n#g;
  $main =~ s#(outlet|powrot|abonamenty|partnerzy|kariera|newsletter)\.html#index.html#g;
  my ($cr, $crld) = crumbs(['Polityka prywatności', '']);
  out('polityka-prywatnosci.html', page(path => 'polityka-prywatnosci.html', active => '', title => 'Polityka prywatności | RevSerwis', desc => 'Polityka prywatności RevSerwis: administrator danych Rev Serwis Kacper Taczała, cele i podstawy przetwarzania, prawa osób, pliki cookies.', ld => [$crld],
    body => qq{$cr<section class="page-hero"><div class="wrap"><h1 class="h1">Polityka prywatności</h1></div></section><section class="sec tight" style="padding-top:40px"><div class="wrap"><div class="prose">$main</div></div></section>}));
  print "Polityka prywatności: przeniesiona do nowego wyglądu\n";
}
