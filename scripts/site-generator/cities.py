# -*- coding: utf-8 -*-
"""RevSerwis 12 — miasta obsługiwane przez strony lokalne (usługa × miasto).

Każde miasto ma WŁASNE dane (odmiana nazwy, odległość i czas dojazdu z bazy w Słupsku, powiat, osiedla/dzielnice,
okoliczne miejscowości, profil zabudowy, cechy miasta). Na tych danych opiera się treść stron — dzięki temu
strony różnią się faktami, a nie tylko podmienioną nazwą miasta.

tier:
  baza    — Słupsk (największy nacisk SEO, najbogatsze strony)
  blisko  — do ok. 70 km: dojazd codzienny, pełna oferta
  pomorze — Trójmiasto i dalsze Pomorze: zlecenia planowane w pełne wyjazdy
  daleko  — zachodniopomorskie / wielkopolskie: głównie przeprowadzki, transport, opróżnianie

tags: morze, turystyka, port, studenci, przemysl, jeziora, kaszuby, aglomeracja, uzdrowisko, wies, wojsko
Odległości i czasy są przybliżone (trasa samochodem z bazy w Słupsku).
"""

CITIES = {
    'slupsk': {
        'name': 'Słupsk', 'in': 'w Słupsku', 'gen': 'Słupska', 'loc': 'Słupsku', 'ins': 'Słupskiem',
        'km': 0, 'min': 0, 'tier': 'baza', 'county': 'miasto na prawach powiatu', 'region': 'pomorskie',
        'areas': ['Zatorze', 'Nadrzecze', 'Westerplatte', 'Ryczewo', 'Stare Miasto', 'Osiedle Niepodległości', 'Osiedle Słoneczne',
                  'Osiedle Kaszubskie', 'Osiedle Akademickie', 'Osiedle Piastów', 'Osiedle Leśne'],
        'near': ['Kobylnica', 'Redzikowo', 'Siemianice', 'Bierkowo', 'Głobino', 'Włynkówko', 'Strzelinko', 'Krępa Słupska', 'Wiklino', 'Swochowo', 'Bruskowo Wielkie', 'Dębnica Kaszubska'],
        'tags': ['studenci', 'wojsko'],
        'housing': 'bloki z wielkiej płyty bez windy (4 piętra), przedwojenne kamienice w centrum z wysokimi, krętymi klatkami oraz szybko rosnące osiedla domów pod miastem — w Kobylnicy, Redzikowie i Siemianicach',
        'route': 'Tu stacjonują nasze busy — dojazd w obrębie miasta zajmuje zwykle 10–20 minut.',
        'about': 'Słupsk to baza RevSerwis — stąd każdego dnia wyjeżdżają nasze ekipy i busy. Znamy miasto ulica po ulicy: wiemy, gdzie na Zatorzu trudno zaparkować, które kamienice w centrum mają wąskie klatki i gdzie na Westerplatte trzeba nosić meble przez podwórko.',
    },
    'ustka': {
        'name': 'Ustka', 'in': 'w Ustce', 'gen': 'Ustki', 'loc': 'Ustce', 'ins': 'Ustką',
        'km': 19, 'min': 25, 'tier': 'blisko', 'county': 'powiat słupski', 'region': 'pomorskie',
        'areas': ['centrum i promenada', 'okolice portu', 'zachodnia część miasta', 'wschodnia część miasta', 'osiedla przy drodze do Słupska'],
        'near': ['Przewłoka', 'Orzechowo', 'Wodnica', 'Zimowiska', 'Rowy', 'Dębina', 'Objazda', 'Poddąbie'],
        'tags': ['morze', 'turystyka', 'port'],
        'housing': 'apartamenty na wynajem, pensjonaty i domy letniskowe, a obok nich zwykłe bloki i domy mieszkańców',
        'route': 'Do Ustki jedziemy ok. 25 minut drogą krajową nr 21 — to dla nas lokalna trasa, bez wysokich kosztów dojazdu.',
        'about': 'Ustka leży tuż obok naszej bazy, więc przyjeżdżamy tu niemal codziennie. Pracujemy dla mieszkańców, ale też dla właścicieli apartamentów i pensjonatów, którzy potrzebują szybkiej pomocy przed sezonem i po nim.',
    },
    'lebork': {
        'name': 'Lębork', 'in': 'w Lęborku', 'gen': 'Lęborka', 'loc': 'Lęborku', 'ins': 'Lęborkiem',
        'km': 55, 'min': 50, 'tier': 'blisko', 'county': 'powiat lęborski', 'region': 'pomorskie',
        'areas': ['Stare Miasto', 'osiedla bloków w centrum', 'osiedla domów jednorodzinnych na obrzeżach', 'okolice dworca'],
        'near': ['Nowa Wieś Lęborska', 'Cewice', 'Wicko', 'Łeba', 'Potęgowo', 'Garczegorze', 'Mosty', 'Maszewo Lęborskie'],
        'tags': ['przemysl'],
        'housing': 'bloki z lat 70. i 80., kamienice w ścisłym centrum i coraz więcej domów jednorodzinnych w gminie Nowa Wieś Lęborska',
        'route': 'Lębork to ok. 50 minut drogą S6/DK6 w stronę Trójmiasta — po drodze obsługujemy też Potęgowo.',
        'about': 'Lębork jest w połowie drogi między Słupskiem a Trójmiastem. Przyjeżdżamy tu regularnie — zarówno do mieszkań w centrum, jak i do domów i działek w gminach Nowa Wieś Lęborska, Cewice i Wicko.',
    },
    'bytow': {
        'name': 'Bytów', 'in': 'w Bytowie', 'gen': 'Bytowa', 'loc': 'Bytowie', 'ins': 'Bytowem',
        'km': 70, 'min': 70, 'tier': 'blisko', 'county': 'powiat bytowski', 'region': 'pomorskie',
        'areas': ['centrum przy zamku', 'osiedla bloków', 'osiedla domów jednorodzinnych', 'okolice strefy przemysłowej'],
        'near': ['Tuchomie', 'Borzytuchom', 'Parchowo', 'Studzienice', 'Czarna Dąbrówka', 'Kołczygłowy', 'Ugoszcz', 'Niezabyszewo'],
        'tags': ['kaszuby', 'jeziora', 'przemysl'],
        'housing': 'bloki i kamienice w centrum, domy jednorodzinne oraz siedliska i domki nad jeziorami w okolicznych gminach',
        'route': 'Do Bytowa jedziemy ok. 70 minut przez Kołczygłowy — większe zlecenia planujemy na cały dzień.',
        'about': 'Bytów i powiat bytowski obsługujemy z bazy w Słupsku. Pracujemy w mieście i na Kaszubach — w domach, siedliskach i domkach letniskowych nad jeziorami.',
    },
    'miastko': {
        'name': 'Miastko', 'in': 'w Miastku', 'gen': 'Miastka', 'loc': 'Miastku', 'ins': 'Miastkiem',
        'km': 75, 'min': 70, 'tier': 'blisko', 'county': 'powiat bytowski', 'region': 'pomorskie',
        'areas': ['centrum', 'osiedla bloków', 'zabudowa jednorodzinna', 'okoliczne wsie'],
        'near': ['Kępice', 'Trzebielino', 'Kołczygłowy', 'Biały Bór', 'Dretyń', 'Wołcza Wielka', 'Słosinko'],
        'tags': ['jeziora', 'wies'],
        'housing': 'niewysokie bloki, domy jednorodzinne i gospodarstwa w okolicznych wsiach',
        'route': 'Do Miastka jedziemy ok. 70 minut drogą krajową nr 21 przez Kępice — zlecenia z regionu łączymy w jeden wyjazd.',
        'about': 'Miastko leży przy DK21, prosto na południe od Słupska. Po drodze obsługujemy Kępice i Trzebielino, a zlecenia z całego regionu planujemy tak, żeby jeden wyjazd obejmował kilka adresów.',
    },
    'slawno': {
        'name': 'Sławno', 'in': 'w Sławnie', 'gen': 'Sławna', 'loc': 'Sławnie', 'ins': 'Sławnem',
        'km': 30, 'min': 35, 'tier': 'blisko', 'county': 'powiat sławieński', 'region': 'zachodniopomorskie',
        'areas': ['centrum', 'osiedla bloków', 'osiedla domów jednorodzinnych', 'okoliczne wsie'],
        'near': ['Darłowo', 'Postomino', 'Malechowo', 'Warszkowo', 'Żukowo Morskie', 'Jarosławiec', 'Sławsko', 'Kwasowo'],
        'tags': ['wies'],
        'housing': 'kamienice i bloki w centrum oraz domy i budynki gospodarcze na terenach wiejskich gminy',
        'route': 'Sławno to ok. 35 minut drogą S6/DK6 w stronę Koszalina — jesteśmy tu kilka razy w tygodniu.',
        'about': 'Sławno jest dla nas lokalną trasą. Obsługujemy całe miasto i gminy powiatu sławieńskiego — od Malechowa po Postomino.',
    },
    'darlowo': {
        'name': 'Darłowo', 'in': 'w Darłowie', 'gen': 'Darłowa', 'loc': 'Darłowie', 'ins': 'Darłowem',
        'km': 42, 'min': 45, 'tier': 'blisko', 'county': 'powiat sławieński', 'region': 'zachodniopomorskie',
        'areas': ['Stare Miasto', 'Darłówko Wschodnie', 'Darłówko Zachodnie', 'osiedla mieszkaniowe'],
        'near': ['Sławno', 'Jarosławiec', 'Dąbki', 'Postomino', 'Krupy', 'Bobolice Darłowskie', 'Wiekowo'],
        'tags': ['morze', 'turystyka', 'port'],
        'housing': 'kamienice na Starym Mieście, apartamenty i pensjonaty w Darłówku oraz domy jednorodzinne',
        'route': 'Do Darłowa jedziemy ok. 45 minut przez Sławno.',
        'about': 'Darłowo i Darłówko to dwa różne światy: zabytkowe centrum z kamienicami i nadmorska część pełna apartamentów i pensjonatów. Obsługujemy oba, także poza sezonem.',
    },
    'leba': {
        'name': 'Łeba', 'in': 'w Łebie', 'gen': 'Łeby', 'loc': 'Łebie', 'ins': 'Łebą',
        'km': 60, 'min': 65, 'tier': 'blisko', 'county': 'powiat lęborski', 'region': 'pomorskie',
        'areas': ['centrum', 'okolice portu', 'zabudowa pensjonatowa przy plaży', 'osiedla mieszkańców'],
        'near': ['Nowęcin', 'Wicko', 'Żarnowska', 'Rąbka', 'Sarbsk', 'Steknica', 'Charbrowo'],
        'tags': ['morze', 'turystyka', 'port'],
        'housing': 'pensjonaty, domy gościnne i apartamenty — wiele obiektów stoi pustych poza sezonem',
        'route': 'Do Łeby jedziemy ok. 65 minut przez Główczyce lub Lębork.',
        'about': 'Łeba żyje sezonem — dlatego najwięcej pracy mamy tu wiosną (przygotowanie obiektów) i jesienią (porządki, wywóz, zabezpieczenie na zimę). Pracujemy też dla stałych mieszkańców.',
    },
    'koszalin': {
        'name': 'Koszalin', 'in': 'w Koszalinie', 'gen': 'Koszalina', 'loc': 'Koszalinie', 'ins': 'Koszalinem',
        'km': 68, 'min': 60, 'tier': 'blisko', 'county': 'miasto na prawach powiatu', 'region': 'zachodniopomorskie',
        'areas': ['Śródmieście', 'Rokosowo', 'Jedliny', 'Lubiatowo', 'Wilkowo', 'tereny przemysłowe'],
        'near': ['Mielno', 'Sianów', 'Świeszyno', 'Biesiekierz', 'Manowo', 'Będzino', 'Mścice', 'Kretomino'],
        'tags': ['aglomeracja', 'studenci', 'przemysl'],
        'housing': 'duże osiedla bloków, nowe inwestycje deweloperskie i rosnące osiedla domów w gminach Świeszyno i Biesiekierz',
        'route': 'Do Koszalina jedziemy ok. 60 minut drogą S6 — przy większych zleceniach planujemy cały dzień pracy ekipy.',
        'about': 'Koszalin to największe miasto w naszym bliskim zasięgu. Obsługujemy mieszkańców, firmy i deweloperów — także na trasach Koszalin – Słupsk i Koszalin – Trójmiasto.',
    },
    'mielno': {
        'name': 'Mielno', 'in': 'w Mielnie', 'gen': 'Mielna', 'loc': 'Mielnie', 'ins': 'Mielnem',
        'km': 80, 'min': 75, 'tier': 'pomorze', 'county': 'powiat koszaliński', 'region': 'zachodniopomorskie',
        'areas': ['Mielno', 'Unieście', 'Mielenko', 'zabudowa wakacyjna przy plaży'],
        'near': ['Sarbinowo', 'Gąski', 'Chłopy', 'Łazy', 'Koszalin', 'Będzino', 'Mścice'],
        'tags': ['morze', 'turystyka'],
        'housing': 'apartamentowce, domki letniskowe i pensjonaty między morzem a jeziorem Jamno',
        'route': 'Do Mielna jedziemy ok. 75 minut przez Koszalin — zlecenia łączymy z kursami do Koszalina.',
        'about': 'Mielno i Unieście to głównie obiekty wakacyjne. Pomagamy właścicielom apartamentów i domków: przewozimy wyposażenie, wywozimy stare meble i przygotowujemy obiekty do sezonu.',
    },
    'bialogard': {
        'name': 'Białogard', 'in': 'w Białogardzie', 'gen': 'Białogardu', 'loc': 'Białogardzie', 'ins': 'Białogardem',
        'km': 90, 'min': 85, 'tier': 'pomorze', 'county': 'powiat białogardzki', 'region': 'zachodniopomorskie',
        'areas': ['centrum', 'osiedla bloków', 'zabudowa jednorodzinna'],
        'near': ['Karlino', 'Tychowo', 'Rąbino', 'Połczyn-Zdrój', 'Pomianowo', 'Stanomino'],
        'tags': ['wojsko', 'wies'],
        'housing': 'kamienice i bloki w centrum oraz domy jednorodzinne i gospodarstwa w gminie',
        'route': 'Do Białogardu jedziemy ok. 85 minut przez Koszalin.',
        'about': 'Białogard obsługujemy w ramach wyjazdów na trasie Koszalin – Kołobrzeg. Większe prace planujemy z wyprzedzeniem, żeby dojazd nie podnosił ceny.',
    },
    'kolobrzeg': {
        'name': 'Kołobrzeg', 'in': 'w Kołobrzegu', 'gen': 'Kołobrzegu', 'loc': 'Kołobrzegu', 'ins': 'Kołobrzegiem',
        'km': 110, 'min': 100, 'tier': 'pomorze', 'county': 'powiat kołobrzeski', 'region': 'zachodniopomorskie',
        'areas': ['dzielnica uzdrowiskowa', 'Stare Miasto', 'Podczele', 'Radzikowo', 'osiedla mieszkaniowe'],
        'near': ['Dźwirzyno', 'Ustronie Morskie', 'Grzybowo', 'Gościno', 'Siemyśl', 'Bogucino', 'Budzistowo'],
        'tags': ['morze', 'turystyka', 'uzdrowisko', 'port'],
        'housing': 'sanatoria i hotele, apartamentowce w dzielnicy nadmorskiej oraz bloki i domy mieszkańców',
        'route': 'Do Kołobrzegu jedziemy ok. 1 h 40 min drogą S6 — zlecenia planujemy w pełne dni pracy.',
        'about': 'Kołobrzeg to uzdrowisko i jedno z największych miast nad morzem w regionie. Realizujemy tu przeprowadzki, transport wyposażenia dla apartamentów i obiektów oraz opróżnianie mieszkań.',
    },
    'szczecinek': {
        'name': 'Szczecinek', 'in': 'w Szczecinku', 'gen': 'Szczecinka', 'loc': 'Szczecinku', 'ins': 'Szczecinkiem',
        'km': 115, 'min': 100, 'tier': 'pomorze', 'county': 'powiat szczecinecki', 'region': 'zachodniopomorskie',
        'areas': ['centrum nad jeziorem Trzesiecko', 'osiedla bloków', 'zabudowa jednorodzinna', 'tereny przemysłowe'],
        'near': ['Borne Sulinowo', 'Barwice', 'Biały Bór', 'Turowo', 'Grzmiąca', 'Parsęcko'],
        'tags': ['jeziora', 'przemysl'],
        'housing': 'bloki i kamienice w centrum, domy jednorodzinne oraz domki nad okolicznymi jeziorami',
        'route': 'Do Szczecinka jedziemy ok. 1 h 40 min przez Miastko i Biały Bór (DK21/DK20).',
        'about': 'Szczecinek obsługujemy na trasie przez Miastko. Przeprowadzki i transport realizujemy własnymi busami, a większe prace na miejscu planujemy w pełne dni pracy ekipy.',
    },
    'drawsko-pomorskie': {
        'name': 'Drawsko Pomorskie', 'in': 'w Drawsku Pomorskim', 'gen': 'Drawska Pomorskiego', 'loc': 'Drawsku Pomorskim', 'ins': 'Drawskiem Pomorskim',
        'km': 150, 'min': 140, 'tier': 'daleko', 'county': 'powiat drawski', 'region': 'zachodniopomorskie',
        'areas': ['centrum', 'osiedla bloków', 'zabudowa jednorodzinna'],
        'near': ['Złocieniec', 'Kalisz Pomorski', 'Wierzchowo', 'Ostrowice', 'Czaplinek', 'Oleszno'],
        'tags': ['wojsko', 'jeziora', 'wies'],
        'housing': 'niewysokie bloki, domy jednorodzinne i siedliska na Pojezierzu Drawskim',
        'route': 'Do Drawska Pomorskiego jedziemy ok. 2 h 20 min — zlecenia planujemy z wyprzedzeniem.',
        'about': 'Drawsko Pomorskie to wyjazd na pełny dzień. Najczęściej realizujemy tu przeprowadzki (także rodzin wojskowych), transport mebli i opróżnianie mieszkań.',
    },
    'gryfice': {
        'name': 'Gryfice', 'in': 'w Gryficach', 'gen': 'Gryfic', 'loc': 'Gryficach', 'ins': 'Gryficami',
        'km': 150, 'min': 140, 'tier': 'daleko', 'county': 'powiat gryficki', 'region': 'zachodniopomorskie',
        'areas': ['centrum', 'osiedla bloków', 'zabudowa jednorodzinna'],
        'near': ['Płoty', 'Trzebiatów', 'Brojce', 'Karnice', 'Rewal', 'Trzygłów'],
        'tags': ['wies'],
        'housing': 'kamienice i bloki w centrum oraz domy na wsiach powiatu gryfickiego',
        'route': 'Do Gryfic jedziemy ok. 2 h 20 min przez Koszalin i Kołobrzeg.',
        'about': 'Gryfice obsługujemy w ramach wyjazdów na zachodnie wybrzeże. Przeprowadzki, transport i opróżnianie planujemy tak, żeby zmieścić się w jednym dniu.',
    },
    'kamien-pomorski': {
        'name': 'Kamień Pomorski', 'in': 'w Kamieniu Pomorskim', 'gen': 'Kamienia Pomorskiego', 'loc': 'Kamieniu Pomorskim', 'ins': 'Kamieniem Pomorskim',
        'km': 185, 'min': 170, 'tier': 'daleko', 'county': 'powiat kamieński', 'region': 'zachodniopomorskie',
        'areas': ['Stare Miasto', 'okolice Zalewu Kamieńskiego', 'osiedla mieszkaniowe'],
        'near': ['Dziwnów', 'Międzywodzie', 'Wolin', 'Golczewo', 'Świerzno', 'Dziwnówek'],
        'tags': ['morze', 'turystyka', 'uzdrowisko'],
        'housing': 'kamienice na Starym Mieście, domy jednorodzinne i obiekty wakacyjne w gminach nadmorskich',
        'route': 'Do Kamienia Pomorskiego jedziemy ok. 2 h 50 min — to zlecenia planowane z wyprzedzeniem.',
        'about': 'Kamień Pomorski i okolice (Dziwnów, Międzywodzie) obsługujemy przy przeprowadzkach, transporcie wyposażenia dla obiektów wakacyjnych i opróżnianiu domów.',
    },
    'stargard': {
        'name': 'Stargard', 'in': 'w Stargardzie', 'gen': 'Stargardu', 'loc': 'Stargardzie', 'ins': 'Stargardem',
        'km': 200, 'min': 180, 'tier': 'daleko', 'county': 'powiat stargardzki', 'region': 'zachodniopomorskie',
        'areas': ['Stare Miasto', 'osiedla bloków', 'nowe osiedla domów', 'strefa przemysłowa'],
        'near': ['Kobylanka', 'Suchań', 'Marianowo', 'Chociwel', 'Pyrzyce', 'Klępino'],
        'tags': ['przemysl', 'aglomeracja'],
        'housing': 'bloki z wielkiej płyty, kamienice w centrum i szybko rosnące osiedla domów w okolicznych gminach',
        'route': 'Do Stargardu jedziemy ok. 3 h — przeprowadzki i transport łączymy z kursami do Szczecina.',
        'about': 'Stargard obsługujemy razem ze Szczecinem. Najczęściej przewozimy tu mieszkania i domy na trasach do Pomorza i do Trójmiasta.',
    },
    'szczecin': {
        'name': 'Szczecin', 'in': 'w Szczecinie', 'gen': 'Szczecina', 'loc': 'Szczecinie', 'ins': 'Szczecinem',
        'km': 230, 'min': 190, 'tier': 'daleko', 'county': 'miasto na prawach powiatu', 'region': 'zachodniopomorskie',
        'areas': ['Śródmieście', 'Pogodno', 'Niebuszewo', 'Pomorzany', 'Gumieńce', 'Warszewo', 'Prawobrzeże (Dąbie, Słoneczne, Bukowe)'],
        'near': ['Police', 'Gryfino', 'Dobra (Szczecińska)', 'Kołbaskowo', 'Goleniów', 'Mierzyn', 'Przecław'],
        'tags': ['aglomeracja', 'studenci', 'port'],
        'housing': 'wysokie przedwojenne kamienice w Śródmieściu (często bez windy), bloki na Prawobrzeżu i nowe osiedla na obrzeżach — Mierzyn, Przecław, Warszewo',
        'route': 'Do Szczecina jedziemy ok. 3 h 10 min drogą S6 — przeprowadzki i transport realizujemy w pełne dni lub z noclegiem.',
        'about': 'Szczecin to dla nas trasa dalekobieżna: najczęściej przewozimy mieszkania i domy między Szczecinem a Pomorzem Środkowym, Trójmiastem i resztą Polski. Kamienice w Śródmieściu wymagają większej ekipy — planujemy to z góry.',
    },
    'police': {
        'name': 'Police', 'in': 'w Policach', 'gen': 'Polic', 'loc': 'Policach', 'ins': 'Policami',
        'km': 245, 'min': 205, 'tier': 'daleko', 'county': 'powiat policki', 'region': 'zachodniopomorskie',
        'areas': ['Stare Miasto', 'Nowe Miasto', 'osiedla bloków', 'Jasienica'],
        'near': ['Szczecin', 'Tanowo', 'Trzebież', 'Pilchowo', 'Przęsocin', 'Dobieszczyn'],
        'tags': ['przemysl', 'aglomeracja'],
        'housing': 'osiedla bloków z lat 70. i 80. oraz domy jednorodzinne w okolicznych wsiach',
        'route': 'Do Polic jedziemy ok. 3 h 25 min przez Szczecin — zlecenia łączymy z kursami do Szczecina.',
        'about': 'Police obsługujemy razem ze Szczecinem. Przeprowadzamy mieszkania z bloków, przewozimy meble i opróżniamy lokale przed sprzedażą.',
    },
    'wejherowo': {
        'name': 'Wejherowo', 'in': 'w Wejherowie', 'gen': 'Wejherowa', 'loc': 'Wejherowie', 'ins': 'Wejherowem',
        'km': 105, 'min': 85, 'tier': 'pomorze', 'county': 'powiat wejherowski', 'region': 'pomorskie',
        'areas': ['Śródmieście', 'Śmiechowo', 'Nanice', 'Osiedle Kaszubskie'],
        'near': ['Bolszewo', 'Gościcino', 'Luzino', 'Reda', 'Szemud', 'Orle', 'Góra', 'Kąpino'],
        'tags': ['kaszuby', 'aglomeracja'],
        'housing': 'bloki w Śródmieściu i na Osiedlu Kaszubskim oraz bardzo dużo nowych domów w Bolszewie, Gościcinie i Luzinie',
        'route': 'Do Wejherowa jedziemy ok. 1 h 25 min drogą S6 — to pierwsze miasto aglomeracji trójmiejskiej na naszej trasie.',
        'about': 'Wejherowo to brama Trójmiasta od strony Słupska. Bywamy tu przy przeprowadzkach z i do Trójmiasta oraz przy opróżnianiu mieszkań i domów w powiecie wejherowskim.',
    },
    'reda': {
        'name': 'Reda', 'in': 'w Redzie', 'gen': 'Redy', 'loc': 'Redzie', 'ins': 'Redą',
        'km': 108, 'min': 90, 'tier': 'pomorze', 'county': 'powiat wejherowski', 'region': 'pomorskie',
        'areas': ['centrum', 'Pieleszewo', 'Ciechocino', 'Rekowo', 'nowe osiedla przy obwodnicy'],
        'near': ['Wejherowo', 'Rumia', 'Puck', 'Gościcino', 'Mrzezino', 'Rekowo Górne'],
        'tags': ['aglomeracja'],
        'housing': 'w większości nowe osiedla deweloperskie i szeregowce — wiele mieszkań odbieranych w stanie deweloperskim',
        'route': 'Do Redy jedziemy ok. 1 h 30 min drogą S6.',
        'about': 'Reda szybko rośnie — powstaje tu dużo nowych osiedli. Najczęściej pomagamy przy przeprowadzkach do nowych mieszkań, transporcie mebli i wywozie odpadów po wykończeniu.',
    },
    'rumia': {
        'name': 'Rumia', 'in': 'w Rumi', 'gen': 'Rumi', 'loc': 'Rumi', 'ins': 'Rumią',
        'km': 112, 'min': 95, 'tier': 'pomorze', 'county': 'powiat wejherowski', 'region': 'pomorskie',
        'areas': ['Janowo', 'Zagórze', 'Biała Rzeka', 'Szmelta', 'centrum'],
        'near': ['Reda', 'Gdynia', 'Kosakowo', 'Dębogórze', 'Pierwoszyno', 'Kazimierz'],
        'tags': ['aglomeracja'],
        'housing': 'bloki na Janowie, nowe osiedla na Zagórzu i Białej Rzece oraz domy na zboczach przy lesie',
        'route': 'Do Rumi jedziemy ok. 1 h 35 min drogą S6.',
        'about': 'Rumia leży między Redą a Gdynią. Często realizujemy tu przeprowadzki w obrębie Trójmiasta oraz trasy Rumia – Słupsk i Rumia – Koszalin.',
    },
    'gdynia': {
        'name': 'Gdynia', 'in': 'w Gdyni', 'gen': 'Gdyni', 'loc': 'Gdyni', 'ins': 'Gdynią',
        'km': 115, 'min': 100, 'tier': 'pomorze', 'county': 'miasto na prawach powiatu', 'region': 'pomorskie',
        'areas': ['Śródmieście', 'Orłowo', 'Redłowo', 'Chylonia', 'Oksywie', 'Obłuże', 'Witomino', 'Mały Kack', 'Karwiny', 'Dąbrowa', 'Pogórze'],
        'near': ['Rumia', 'Kosakowo', 'Rewa', 'Chwaszczyno', 'Koleczkowo', 'Sopot', 'Pogórze'],
        'tags': ['aglomeracja', 'port', 'morze', 'studenci'],
        'housing': 'modernistyczne kamienice w Śródmieściu, wysokie bloki na Chyloni i Karwinach oraz nowe osiedla na Dąbrowie i Pogórzu',
        'route': 'Do Gdyni jedziemy ok. 1 h 40 min drogą S6 — przeprowadzki planujemy na cały dzień.',
        'about': 'Gdynia to dla nas najczęstszy kierunek przeprowadzek z Pomorza Środkowego. Przewozimy mieszkania między Gdynią a Słupskiem, Lęborkiem i Koszalinem oraz w obrębie samego Trójmiasta.',
    },
    'sopot': {
        'name': 'Sopot', 'in': 'w Sopocie', 'gen': 'Sopotu', 'loc': 'Sopocie', 'ins': 'Sopotem',
        'km': 120, 'min': 110, 'tier': 'pomorze', 'county': 'miasto na prawach powiatu', 'region': 'pomorskie',
        'areas': ['Dolny Sopot', 'Górny Sopot', 'Kamienny Potok', 'Karlikowo', 'Brodwino'],
        'near': ['Gdańsk Oliwa', 'Gdynia Orłowo', 'Gdynia Mały Kack', 'Żukowo', 'Chwaszczyno'],
        'tags': ['aglomeracja', 'morze', 'turystyka', 'uzdrowisko'],
        'housing': 'zabytkowe wille i kamienice z wąskimi klatkami, apartamenty na wynajem oraz bloki w Kamiennym Potoku',
        'route': 'Do Sopotu jedziemy ok. 1 h 50 min — zlecenia łączymy z kursami do Gdańska i Gdyni.',
        'about': 'Sopot wymaga ostrożności: zabytkowe wille, strome uliczki i strefy z ograniczonym wjazdem. Planujemy parkowanie i liczbę osób z wyprzedzeniem, żeby wszystko poszło sprawnie.',
    },
    'gdansk': {
        'name': 'Gdańsk', 'in': 'w Gdańsku', 'gen': 'Gdańska', 'loc': 'Gdańsku', 'ins': 'Gdańskiem',
        'km': 120, 'min': 115, 'tier': 'pomorze', 'county': 'miasto na prawach powiatu', 'region': 'pomorskie',
        'areas': ['Śródmieście', 'Wrzeszcz', 'Oliwa', 'Przymorze', 'Zaspa', 'Chełm', 'Orunia', 'Jasień', 'Ujeścisko', 'Piecki-Migowo', 'Osowa', 'Brzeźno'],
        'near': ['Pruszcz Gdański', 'Kolbudy', 'Żukowo', 'Pszczółki', 'Banino', 'Straszyn', 'Sopot'],
        'tags': ['aglomeracja', 'studenci', 'port'],
        'housing': 'kamienice we Wrzeszczu i Śródmieściu, wysokie „falowce” i bloki na Przymorzu i Zaspie oraz nowe osiedla na Jasieniu i Ujeścisku',
        'route': 'Do Gdańska jedziemy ok. 1 h 55 min drogą S6 — przeprowadzki planujemy w pełne dni pracy.',
        'about': 'Gdańsk obsługujemy głównie przy przeprowadzkach i transporcie na trasach do i z Pomorza Środkowego. Znamy specyfikę wysokich bloków z długimi korytarzami i kamienic we Wrzeszczu bez windy.',
    },
    'koscierzyna': {
        'name': 'Kościerzyna', 'in': 'w Kościerzynie', 'gen': 'Kościerzyny', 'loc': 'Kościerzynie', 'ins': 'Kościerzyną',
        'km': 100, 'min': 100, 'tier': 'pomorze', 'county': 'powiat kościerski', 'region': 'pomorskie',
        'areas': ['centrum', 'osiedla bloków', 'zabudowa jednorodzinna', 'okolice jezior'],
        'near': ['Skorzewo', 'Wąglikowice', 'Nowa Karczma', 'Lipusz', 'Liniewo', 'Dziemiany', 'Kościerska Huta'],
        'tags': ['kaszuby', 'jeziora'],
        'housing': 'bloki i kamienice w centrum, domy jednorodzinne i domki letniskowe nad kaszubskimi jeziorami',
        'route': 'Do Kościerzyny jedziemy ok. 1 h 40 min przez Bytów (DK20).',
        'about': 'Kościerzyna to serce Kaszub. Przyjeżdżamy tu przez Bytów — do mieszkań w mieście, domów w okolicznych gminach i domków letniskowych nad jeziorami.',
    },
    'chojnice': {
        'name': 'Chojnice', 'in': 'w Chojnicach', 'gen': 'Chojnic', 'loc': 'Chojnicach', 'ins': 'Chojnicami',
        'km': 130, 'min': 120, 'tier': 'pomorze', 'county': 'powiat chojnicki', 'region': 'pomorskie',
        'areas': ['Stare Miasto', 'osiedla bloków', 'zabudowa jednorodzinna', 'okolice Charzyków'],
        'near': ['Charzykowy', 'Brusy', 'Czersk', 'Człuchów', 'Rytel', 'Lichnowy', 'Ogorzeliny'],
        'tags': ['jeziora', 'przemysl'],
        'housing': 'kamienice na Starym Mieście, bloki i domy jednorodzinne oraz domki letniskowe nad jeziorem Charzykowskim',
        'route': 'Do Chojnic jedziemy ok. 2 h przez Bytów — większe zlecenia planujemy na cały dzień.',
        'about': 'Chojnice obsługujemy w ramach wyjazdów na południe Pomorza. Najczęściej przewozimy mieszkania i domy, transportujemy meble i opróżniamy lokale.',
    },
    'tczew': {
        'name': 'Tczew', 'in': 'w Tczewie', 'gen': 'Tczewa', 'loc': 'Tczewie', 'ins': 'Tczewem',
        'km': 150, 'min': 140, 'tier': 'pomorze', 'county': 'powiat tczewski', 'region': 'pomorskie',
        'areas': ['Stare Miasto', 'Czyżykowo', 'Suchostrzygi', 'Prątnica', 'osiedla bloków'],
        'near': ['Subkowy', 'Pelplin', 'Pszczółki', 'Gniew', 'Rokitki', 'Miłobądz'],
        'tags': ['przemysl'],
        'housing': 'kamienice na Starym Mieście nad Wisłą, osiedla bloków i rosnąca zabudowa jednorodzinna w okolicznych wsiach',
        'route': 'Do Tczewa jedziemy ok. 2 h 20 min przez Trójmiasto.',
        'about': 'Tczew obsługujemy przy przeprowadzkach na trasach Trójmiasto – Kociewie – Pomorze Środkowe oraz przy opróżnianiu mieszkań i domów.',
    },
    'starogard-gdanski': {
        'name': 'Starogard Gdański', 'in': 'w Starogardzie Gdańskim', 'gen': 'Starogardu Gdańskiego', 'loc': 'Starogardzie Gdańskim', 'ins': 'Starogardem Gdańskim',
        'km': 165, 'min': 150, 'tier': 'pomorze', 'county': 'powiat starogardzki', 'region': 'pomorskie',
        'areas': ['centrum', 'osiedla bloków', 'zabudowa jednorodzinna', 'tereny przemysłowe'],
        'near': ['Skórcz', 'Bobowo', 'Kokoszkowy', 'Pelplin', 'Skarszewy', 'Zblewo', 'Rywałd'],
        'tags': ['przemysl'],
        'housing': 'osiedla bloków, kamienice przy rynku i domy jednorodzinne w gminach Kociewia',
        'route': 'Do Starogardu Gdańskiego jedziemy ok. 2 h 30 min — zlecenia planujemy z wyprzedzeniem.',
        'about': 'Starogard Gdański to stolica Kociewia. Realizujemy tu przeprowadzki i transport na trasach do Trójmiasta i Pomorza Środkowego oraz opróżnianie mieszkań.',
    },
    'pila': {
        'name': 'Piła', 'in': 'w Pile', 'gen': 'Piły', 'loc': 'Pile', 'ins': 'Piłą',
        'km': 190, 'min': 170, 'tier': 'daleko', 'county': 'powiat pilski', 'region': 'wielkopolskie',
        'areas': ['Śródmieście', 'Górne', 'Podlasie', 'Koszyce', 'Motylewo'],
        'near': ['Ujście', 'Wysoka', 'Kaczory', 'Szydłowo', 'Trzcianka', 'Stobno'],
        'tags': ['przemysl', 'aglomeracja'],
        'housing': 'osiedla bloków na Górnym i w Śródmieściu oraz domy jednorodzinne w Koszycach i Motylewie',
        'route': 'Do Piły jedziemy ok. 2 h 50 min przez Szczecinek — przeprowadzki realizujemy w pełne dni.',
        'about': 'Piła to nasz najdalej wysunięty na południe kierunek. Najczęściej przewozimy mieszkania i domy między Piłą a Pomorzem i Trójmiastem.',
    },
}

# Kolejność: baza → najbliżej → Trójmiasto i Pomorze → najdalej. Ta kolejność steruje linkowaniem i obszarem działania.
ORDER = ['slupsk', 'ustka', 'slawno', 'darlowo', 'lebork', 'leba', 'koszalin', 'bytow', 'miastko',
         'mielno', 'bialogard', 'kolobrzeg', 'szczecinek', 'koscierzyna', 'wejherowo', 'reda', 'rumia', 'gdynia', 'sopot', 'gdansk',
         'chojnice', 'tczew', 'starogard-gdanski', 'drawsko-pomorskie', 'gryfice', 'kamien-pomorski', 'stargard', 'szczecin', 'police', 'pila']

assert sorted(ORDER) == sorted(CITIES), 'ORDER musi zawierać wszystkie miasta'

TIER_LABEL = {'baza': 'Baza RevSerwis', 'blisko': 'Do ok. 70 km od bazy', 'pomorze': 'Trójmiasto i Pomorze', 'daleko': 'Zachodniopomorskie i Wielkopolska'}


def dist_text(c):
    if not c['km']:
        return 'na miejscu — tu jest nasza baza'
    m = c['min']
    t = f'{m} min' if m < 60 else (f'{m // 60} h' + (f' {m % 60} min' if m % 60 else ''))
    return f'ok. {c["km"]} km od Słupska · ok. {t} dojazdu'


def region_cities(key, n=6):
    """Najbliższe miasta z listy (po odległości od bazy) — do linkowania „w regionie”."""
    me = CITIES[key]
    others = sorted((k for k in CITIES if k != key), key=lambda k: (abs(CITIES[k]['km'] - me['km']), k))
    return others[:n]
