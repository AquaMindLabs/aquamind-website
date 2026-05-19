export const DISEASE_SYMPTOMS = [
  { id: 'white_spots', label: 'Biale kropki na ciele lub pletwach' },
  { id: 'gold_dust', label: 'Zlotawy pyl na ciele' },
  { id: 'cotton_growth', label: 'Bialy nalot (jak wata)' },
  { id: 'frayed_fins', label: 'Postrzepione pletwy' },
  { id: 'clamped_fins', label: 'Sklejone pletwy' },
  { id: 'flashing', label: 'Ocieranie sie o podłoże/dekoracje' },
  { id: 'rapid_breathing', label: 'Przyspieszony oddech / lapie powietrze' },
  { id: 'red_gills', label: 'Zaczerwienione skrzela' },
  { id: 'loss_appetite', label: 'Brak apetytu' },
  { id: 'lethargy', label: 'Ospalosc / apatia' },
  { id: 'bloating', label: 'Wzdecie brzucha' },
  { id: 'skinny_body', label: 'Chudniecie mimo karmienia' },
  { id: 'stringy_feces', label: 'Biale, ciagnace odchody' },
  { id: 'ulcers', label: 'Rany / owrzodzenia' },
  { id: 'cloudy_eyes', label: 'Mleczne oczy' },
  { id: 'color_loss', label: 'Wyrazna utrata kolorow' },
  { id: 'sudden_deaths', label: 'Nagly pad kilku ryb' },
];

const WIKIMEDIA_FILE_HASH_SEGMENTS = {
  'Neon_Ichthyo.jpg': '4/40',
  'Velvet_infection.JPG': '0/0d',
  'Fin_Rot_on_Betta_Fish.jpg': 'b/b1',
  'Seatrout_UDN_saprolegnia.jpg': '4/4f',
  'Gyrodactylus_sp.jpg': '0/0e',
  'Cichlidae_-_Paratilapia_polleni.JPG': '5/52',
  'Hydrophisie.jpg': 'c/cc',
  'Posocznica_(Pseudomonas_punctata).jpg': '6/6e',
};

function normalizeDiseaseImageFileName(fileName) {
  const normalizedFileName = String(fileName ?? '')
    .trim()
    .replace(/\s+/g, '_');

  return normalizedFileName;
}

function buildDiseaseImageUrl(fileName, width = 720) {
  const normalizedFileName = normalizeDiseaseImageFileName(fileName);
  if (!normalizedFileName) {
    return '';
  }

  const encodedFileName = encodeURIComponent(normalizedFileName);
  const normalizedWidth = Number(width);
  const hasWidth = Number.isFinite(normalizedWidth) && normalizedWidth > 0;
  const widthQuery = hasWidth ? `?width=${Math.round(normalizedWidth)}` : '';

  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedFileName}${widthQuery}`;
}

function buildDiseaseImageFallbackUrl(fileName, width = 0) {
  const normalizedFileName = normalizeDiseaseImageFileName(fileName);
  if (!normalizedFileName) {
    return '';
  }

  const hashPath = WIKIMEDIA_FILE_HASH_SEGMENTS[normalizedFileName];
  const encodedFileName = encodeURIComponent(normalizedFileName);

  if (hashPath) {
    return `https://upload.wikimedia.org/wikipedia/commons/${hashPath}/${encodedFileName}`;
  }

  return buildDiseaseImageUrl(normalizedFileName, width);
}

const RAW_DISEASE_CATALOG = [
  {
    id: 'ich',
    name: 'Ospa rybia / ichtioftirioza (Ichthyophthirius multifiliis)',
    imageFileName: 'Neon Ichthyo.jpg',
    imageUrl: buildDiseaseImageUrl('Neon Ichthyo.jpg', 900),
    imagePreviewUrl: buildDiseaseImageUrl('Neon Ichthyo.jpg', 420),
    imageFallbackUrl: buildDiseaseImageFallbackUrl('Neon Ichthyo.jpg'),
    imageFallbackPreviewUrl: buildDiseaseImageFallbackUrl('Neon Ichthyo.jpg', 420),
    imageSourceLabel: 'Wikimedia Commons',
    suggestedRemedy: 'CMF',
    severity: 'high',
    summary:
      'Pasozyt powodujacy biale kropki i silny swiad skory. Rozwija sie szybko, szczegolnie przy stresie.',
    symptoms: [
      'white_spots',
      'flashing',
      'clamped_fins',
      'loss_appetite',
      'rapid_breathing',
    ],
    treatment: [
      'Odizoluj najslabsze osobniki, jesli to mozliwe.',
      'Przy ospie podnies temperature stopniowo o 1 C/dobe (zwykle do 28-30 C), tylko jesli obsada to toleruje.',
      'Zweryfikuj napowietrzanie i stabilnosc temperatury.',
      'Rozwaz leczenie preparatem przeciw ospie: Tropical CMF, Sera Costapur lub eSHa Exit (zawsze zgodnie z etykieta).',
      'Ogranicz oswietlenie na czas leczenia i unikaj naglych skokow temperatury.',
      'Kontynuuj kuracje pelny zalecany czas, nawet po poprawie objawow.',
    ],
    caution:
      'Nie lacz kilku lekow naraz bez potwierdzenia kompatybilnosci. U ryb bezluskich stosuj dawki ostroznie.',
  },
  {
    id: 'velvet',
    name: 'Choroba aksamitna / velvet (oodinioza)',
    imageFileName: 'Velvet infection.JPG',
    imageUrl: buildDiseaseImageUrl('Velvet infection.JPG', 900),
    imagePreviewUrl: buildDiseaseImageUrl('Velvet infection.JPG', 420),
    imageFallbackUrl: buildDiseaseImageFallbackUrl('Velvet infection.JPG'),
    imageFallbackPreviewUrl: buildDiseaseImageFallbackUrl(
      'Velvet infection.JPG',
      420
    ),
    imageSourceLabel: 'Wikimedia Commons',
    suggestedRemedy: 'Sera Oodinopur',
    severity: 'high',
    summary:
      'Pasozyt dajacy efekt pylu na ciele, szybki oddech i osowialosc. Cesto postepuje bardzo szybko.',
    symptoms: [
      'gold_dust',
      'rapid_breathing',
      'clamped_fins',
      'color_loss',
      'loss_appetite',
    ],
    treatment: [
      'Ogranicz oswietlenie na czas leczenia.',
      'Utrzymuj stabilna temperature (najczesciej 27-28 C, jesli gatunki toleruja) i mocne napowietrzanie.',
      'Zweryfikuj silne napowietrzanie.',
      'Rozwaz preparat na oodinioze: Sera Oodinopur, eSHa Exit lub JBL Punktol Plus (zgodnie z etykieta).',
    ],
    caution:
      'To choroba o szybkim przebiegu. Przy nasilonych objawach dzialaj niezwlocznie i konsultuj specjaliste.',
  },
  {
    id: 'fin_rot',
    name: 'Gnicie pletw (fin rot)',
    imageFileName: 'Fin Rot on Betta Fish.jpg',
    imageUrl: buildDiseaseImageUrl('Fin Rot on Betta Fish.jpg', 900),
    imagePreviewUrl: buildDiseaseImageUrl('Fin Rot on Betta Fish.jpg', 420),
    imageFallbackUrl: buildDiseaseImageFallbackUrl('Fin Rot on Betta Fish.jpg'),
    imageFallbackPreviewUrl: buildDiseaseImageFallbackUrl(
      'Fin Rot on Betta Fish.jpg',
      420
    ),
    imageSourceLabel: 'Wikimedia Commons',
    suggestedRemedy: 'Sera Baktopur',
    severity: 'medium',
    summary:
      'Najczesciej infekcja bakteryjna wtornie do stresu lub slabiej higieny. Objawia sie niszczeniem brzegow pletw.',
    symptoms: [
      'frayed_fins',
      'clamped_fins',
      'loss_appetite',
      'lethargy',
      'color_loss',
    ],
    treatment: [
      'Popraw jakosc wody i ogranicz stres obsady.',
      'Utrzymuj stabilna temperature (zwykle 24-26 C) i regularny czas swiecenia lampy bez naglych zmian.',
      'Usuń potencjalne przyczyny urazow (ostre dekoracje, agresje).',
      'W ciezszych przypadkach rozwaz leczenie antybakteryjne: Sera Baktopur, Sera Baktopur Direct lub eSHa 2000 (zgodnie z etykieta).',
    ],
    caution:
      'Bez poprawy warunkow w akwarium objawy czesto wracaja mimo leczenia preparatami.',
  },
  {
    id: 'fungal',
    name: 'Plesniawka / infekcja grzybicza',
    imageFileName: 'Seatrout UDN saprolegnia.jpg',
    imageUrl: buildDiseaseImageUrl('Seatrout UDN saprolegnia.jpg', 900),
    imagePreviewUrl: buildDiseaseImageUrl('Seatrout UDN saprolegnia.jpg', 420),
    imageFallbackUrl: buildDiseaseImageFallbackUrl('Seatrout UDN saprolegnia.jpg'),
    imageFallbackPreviewUrl: buildDiseaseImageFallbackUrl(
      'Seatrout UDN saprolegnia.jpg',
      420
    ),
    imageSourceLabel: 'Wikimedia Commons',
    suggestedRemedy: 'Sera Mycopur',
    severity: 'medium',
    summary:
      'Bialy, watowaty nalot zwykle pojawia sie na uszkodzonej tkance i oslabionych rybach.',
    symptoms: [
      'cotton_growth',
      'lethargy',
      'loss_appetite',
      'clamped_fins',
    ],
    treatment: [
      'Oddziel chore ryby, jesli to mozliwe.',
      'Utrzymuj stabilna temperature i umiarkowane oswietlenie, bez gwaltownych zmian.',
      'Usuń martwe tkanki i zrodla urazow z akwarium.',
      'Rozwaz preparat przeciwgrzybiczy: Sera Mycopur, JBL Fungol lub eSHa 2000 (zgodnie z etykieta).',
    ],
    caution:
      'Grzybica bywa wtornym skutkiem innego problemu. Rownolegle sprawdz przyczyne pierwotna.',
  },
  {
    id: 'gill_flukes',
    name: 'Przywry skrzelowe',
    imageFileName: 'Gyrodactylus sp.jpg',
    imageUrl: buildDiseaseImageUrl('Gyrodactylus sp.jpg', 900),
    imagePreviewUrl: buildDiseaseImageUrl('Gyrodactylus sp.jpg', 420),
    imageFallbackUrl: buildDiseaseImageFallbackUrl('Gyrodactylus sp.jpg'),
    imageFallbackPreviewUrl: buildDiseaseImageFallbackUrl(
      'Gyrodactylus sp.jpg',
      420
    ),
    imageSourceLabel: 'Wikimedia Commons',
    suggestedRemedy: 'Sera Tremazol',
    severity: 'high',
    summary:
      'Pasozyty powodujace podraznienie, ocieranie i problemy oddechowe.',
    symptoms: [
      'flashing',
      'rapid_breathing',
      'red_gills',
      'clamped_fins',
      'lethargy',
    ],
    treatment: [
      'Utrzymuj stala temperature i nie przegrzewaj akwarium; przy dusznosci priorytetem jest tlen.',
      'Zwieksz napowietrzanie i monitoruj zachowanie ryb.',
      'Rozwaz preparat na przywry: Sera Tremazol, JBL Gyrodol Plus 250 lub eSHa gdex (zgodnie z etykieta).',
      'Po kuracji odmul podłoże i wykonaj bezpieczna podmiane wody.',
    ],
    caution:
      'Przy ciezkich dusznosciach dzialaj szybko. Niedotlenienie moze byc grozniejsze niz sama choroba.',
  },
  {
    id: 'hexamita',
    name: 'Hexamitoza',
    imageFileName: 'Cichlidae - Paratilapia polleni.JPG',
    imageUrl: buildDiseaseImageUrl('Cichlidae - Paratilapia polleni.JPG', 900),
    imagePreviewUrl: buildDiseaseImageUrl(
      'Cichlidae - Paratilapia polleni.JPG',
      420
    ),
    imageFallbackUrl: buildDiseaseImageFallbackUrl(
      'Cichlidae - Paratilapia polleni.JPG'
    ),
    imageFallbackPreviewUrl: buildDiseaseImageFallbackUrl(
      'Cichlidae - Paratilapia polleni.JPG',
      420
    ),
    imageSourceLabel: 'Wikimedia Commons',
    suggestedRemedy: 'Sera Flagellol',
    severity: 'medium',
    summary:
      'Czesto zwiazana z oslabieniem odpornosci, objawia sie chudnieciem i bialymi odchodami.',
    symptoms: [
      'stringy_feces',
      'loss_appetite',
      'lethargy',
      'skinny_body',
      'color_loss',
    ],
    treatment: [
      'Zapewnij najwyzsza jakosc wody i spokojne warunki.',
      'Utrzymuj stabilna temperature i staly cykl dnia/nocy (bez wydluzania oswietlenia).',
      'Rozwaz preparat celowany na wiciowce: Sera Flagellol lub kuracje z metronidazolem po konsultacji specjalisty.',
      'Ogranicz stres i rywalizacje przy karmieniu.',
    ],
    caution:
      'Objawy sa nieswoiste. Potwierdzenie przyczyny bywa trudne bez konsultacji specjalisty.',
  },
  {
    id: 'dropsy',
    name: 'Puchlina wodna / dropsy',
    imageFileName: 'Hydrophisie.jpg',
    imageUrl: buildDiseaseImageUrl('Hydrophisie.jpg', 900),
    imagePreviewUrl: buildDiseaseImageUrl('Hydrophisie.jpg', 420),
    imageFallbackUrl: buildDiseaseImageFallbackUrl('Hydrophisie.jpg'),
    imageFallbackPreviewUrl: buildDiseaseImageFallbackUrl('Hydrophisie.jpg', 420),
    imageSourceLabel: 'Wikimedia Commons',
    suggestedRemedy: 'eSHa 2000',
    severity: 'high',
    summary:
      'Silne wzdecie i pogorszenie kondycji. To czesto objaw ciezkiego problemu, a nie jedna konkretna choroba.',
    symptoms: [
      'bloating',
      'loss_appetite',
      'lethargy',
      'ulcers',
      'color_loss',
    ],
    treatment: [
      'Pilnie odizoluj chore osobniki do osobnego zbiornika.',
      'Zapewnij stabilna temperature i slabiej intensywne oswietlenie, by ograniczyc stres.',
      'Stabilizuj parametry i zapewnij mocne napowietrzanie.',
      'Leczenie wspierajace: eSHa 2000 lub Sera Baktopur; przy ciezkich przypadkach konsultacja weterynaryjna przed silniejszymi lekami.',
    ],
    caution:
      'Rokowanie bywa ostrozne. Nie stosuj eksperymentalnych mieszanek lekow.',
  },
  {
    id: 'bacterial_septicemia',
    name: 'Posocznica / infekcja bakteryjna uogolniona',
    imageFileName: 'Posocznica (Pseudomonas punctata).jpg',
    imageUrl: buildDiseaseImageUrl('Posocznica (Pseudomonas punctata).jpg', 900),
    imagePreviewUrl: buildDiseaseImageUrl(
      'Posocznica (Pseudomonas punctata).jpg',
      420
    ),
    imageFallbackUrl: buildDiseaseImageFallbackUrl(
      'Posocznica (Pseudomonas punctata).jpg'
    ),
    imageFallbackPreviewUrl: buildDiseaseImageFallbackUrl(
      'Posocznica (Pseudomonas punctata).jpg',
      420
    ),
    imageSourceLabel: 'Wikimedia Commons',
    suggestedRemedy: 'Sera Baktopur Direct',
    severity: 'high',
    summary:
      'Mozliwe zaczerwienienia, owrzodzenia, apatia i szybkie pogorszenie stanu.',
    symptoms: [
      'ulcers',
      'red_gills',
      'lethargy',
      'loss_appetite',
      'sudden_deaths',
    ],
    treatment: [
      'Odizoluj chore osobniki i ogranicz stres.',
      'Utrzymuj stabilna temperature (bez skokow) i ogranicz oswietlenie na czas leczenia.',
      'Sprawdz natychmiast parametry i wykonaj bezpieczna podmiane wody.',
      'Rozwaz leczenie antybakteryjne: Sera Baktopur Direct, JBL Furanol lub eSHa 2000 (zgodnie z etykieta i po konsultacji specjalisty).',
    ],
    caution:
      'Przy naglych padach dzialaj awaryjnie i szukaj przyczyny systemowej (woda, tlen, toksyny).',
  },
  {
    id: 'columnaris',
    name: 'Columnaris',
    imageSourceLabel: '',
    suggestedRemedy: 'Sera Baktopur Direct',
    severity: 'high',
    summary:
      'Bakteryjna choroba przebiegajaca szybko, czesto z nalotem wokol pyska i uszkodzeniami skory.',
    symptoms: ['cotton_growth', 'ulcers', 'rapid_breathing', 'loss_appetite', 'lethargy'],
    treatment: [
      'Szybko odizoluj podejrzane osobniki i popraw natlenienie.',
      'Utrzymuj stabilne parametry i wykonaj bezpieczna podmiane.',
      'Rozwaz leczenie antybakteryjne zgodnie z etykieta preparatu.',
      'Ogranicz stres i obserwuj postep codziennie.',
    ],
    caution:
      'Choroba moze postepowac bardzo szybko. Reaguj od razu i nie lacz lekow bez konsultacji.',
  },
  {
    id: 'popeye',
    name: 'Wytrzeszcz oczu / pop-eye',
    imageSourceLabel: '',
    suggestedRemedy: 'eSHa 2000',
    severity: 'medium',
    summary:
      'Objaw zapalny lub urazowy oka, czesto zwiazany z jakoscia wody albo infekcja wtorną.',
    symptoms: ['cloudy_eyes', 'lethargy', 'loss_appetite', 'color_loss'],
    treatment: [
      'Sprawdz parametry i natychmiast popraw jakosc wody.',
      'Usun czynniki urazowe i agresywne wspolgatunki.',
      'W razie podejrzenia infekcji rozważ leczenie antybakteryjne.',
      'Obserwuj, czy obrzęk sie cofa po stabilizacji warunkow.',
    ],
    caution:
      'To objaw, nie jedna jednostka chorobowa. Najpierw szukaj przyczyny pierwotnej.',
  },
  {
    id: 'internal_parasites',
    name: 'Pasozyty wewnetrzne',
    imageSourceLabel: '',
    suggestedRemedy: 'Sera Nematol / metronidazol po konsultacji',
    severity: 'high',
    summary:
      'Pasozyty przewodu pokarmowego powodujace wyniszczenie i problemy z pobieraniem pokarmu.',
    symptoms: ['skinny_body', 'stringy_feces', 'loss_appetite', 'lethargy', 'color_loss'],
    treatment: [
      'Odizoluj chore ryby i popraw warunki bytowe.',
      'Podawaj pokarm wysokiej jakosci w mniejszych porcjach.',
      'Zastosuj preparat przeciwpasozytniczy dopasowany do podejrzenia.',
      'Kontynuuj obserwacje po zakonczeniu pelnej kuracji.',
    ],
    caution:
      'Potwierdzenie typu pasozyta jest trudne bez diagnostyki. Leczenie prowadź ostroznie.',
  },
  {
    id: 'constipation',
    name: 'Zaparcie',
    imageSourceLabel: '',
    suggestedRemedy: 'Dieta lekkostrawna / glodowka 24h',
    severity: 'low',
    summary:
      'Czesty problem wynikajacy z przekarmienia, monotonnej diety albo zbyt suchego pokarmu.',
    symptoms: ['bloating', 'loss_appetite', 'lethargy', 'stringy_feces'],
    treatment: [
      'Wstrzymaj karmienie na 24 godziny.',
      'Wroc z lekkostrawna dieta i mniejszymi porcjami.',
      'Utrzymuj stabilna temperature odpowiednia dla gatunku.',
      'Popraw higienę karmienia i usuwaj resztki pokarmu.',
    ],
    caution:
      'Przewlekle objawy moga maskowac infekcje pasozytnicze lub problemy pecherza plawnego.',
  },
  {
    id: 'swim_bladder_disorder',
    name: 'Problemy z pecherzem plawnym',
    imageSourceLabel: '',
    suggestedRemedy: 'Korekta diety i warunkow',
    severity: 'medium',
    summary:
      'Ryba ma trudnosc z utrzymaniem pozycji i plywalnosci; przyczyna bywa metaboliczna, urazowa lub infekcyjna.',
    symptoms: ['lethargy', 'bloating', 'loss_appetite', 'color_loss'],
    treatment: [
      'Ogranicz stres i zmniejsz prad wody.',
      'Wprowadz lekka dietę i kontroluj ilosc karmy.',
      'Sprawdz parametry, szczegolnie azotowe i temperature.',
      'Przy braku poprawy rozwaz konsultacje specjalistyczna.',
    ],
    caution:
      'To objaw wieloprzyczynowy. Brak poprawy wymaga szerszej diagnostyki.',
  },
  {
    id: 'ammonia_poisoning',
    name: 'Zatrucie amoniakiem',
    imageSourceLabel: '',
    suggestedRemedy: 'Podmiana + uzdatniacz neutralizujacy NH3/NH4',
    severity: 'high',
    summary:
      'Toksyczny amoniak uszkadza skrzela i skore, powodujac szybkie dusznosci i apatie.',
    symptoms: ['rapid_breathing', 'red_gills', 'lethargy', 'sudden_deaths', 'loss_appetite'],
    treatment: [
      'Wykonaj pilna podmiane wody i mocno napowietrz akwarium.',
      'Ogranicz karmienie do czasu stabilizacji biologii.',
      'Sprawdz wydajnosc filtra biologicznego.',
      'Rozwaz czasowe wsparcie preparatem neutralizujacym amoniak.',
    ],
    caution:
      'To stan nagly. Priorytetem jest tlen i szybkie zbicie toksyn.',
  },
  {
    id: 'nitrite_poisoning',
    name: 'Zatrucie azotynami NO2',
    imageSourceLabel: '',
    suggestedRemedy: 'Podmiana + stabilizacja filtra',
    severity: 'high',
    summary:
      'Azotyny utrudniaja transport tlenu we krwi, co szybko prowadzi do niedotlenienia tkanek.',
    symptoms: ['rapid_breathing', 'red_gills', 'lethargy', 'color_loss', 'sudden_deaths'],
    treatment: [
      'Wykonaj natychmiastowa podmiane i zwieksz napowietrzanie.',
      'Sprawdz cykl azotowy i obciazenie biologiczne.',
      'Ogranicz karmienie do czasu spadku NO2.',
      'Monitoruj NO2 codziennie do pelnej stabilizacji.',
    ],
    caution:
      'Nawet umiarkowane NO2 moze byc grozne. Reaguj natychmiast.',
  },
  {
    id: 'hypoxia',
    name: 'Przyducha / niedotlenienie',
    imageSourceLabel: '',
    suggestedRemedy: 'Silne napowietrzanie',
    severity: 'high',
    summary:
      'Niedobor tlenu objawia sie lapaniem powietrza i ospaloscia calej obsady.',
    symptoms: ['rapid_breathing', 'lethargy', 'color_loss', 'sudden_deaths'],
    treatment: [
      'Natychmiast zwieksz ruch tafli i napowietrzanie.',
      'Skontroluj temperature, bo ciepla woda trzyma mniej tlenu.',
      'Usuń nadmiar osadu i materii organicznej.',
      'Sprawdz droznosc filtra i cyrkulacje.',
    ],
    caution:
      'Dlugotrwale niedotlenienie prowadzi do szybkich padniec nawet bez infekcji.',
  },
  {
    id: 'temperature_shock',
    name: 'Szok temperaturowy',
    imageSourceLabel: '',
    suggestedRemedy: 'Powolna stabilizacja temperatury',
    severity: 'medium',
    summary:
      'Nagla zmiana temperatury powoduje silny stres fizjologiczny i oslabienie odpornosci.',
    symptoms: ['lethargy', 'rapid_breathing', 'clamped_fins', 'loss_appetite', 'color_loss'],
    treatment: [
      'Przywroc temperature stopniowo, bez skokow.',
      'Zapewnij spokoj i mocne napowietrzanie.',
      'Wstrzymaj dodatkowe zabiegi do czasu stabilizacji.',
      'Monitoruj zachowanie przez kolejne 24-48h.',
    ],
    caution:
      'Nie kompensuj gwaltownie. Zbyt szybkie korekty pogarszaja stan ryb.',
  },
  {
    id: 'ph_shock',
    name: 'Szok pH',
    imageSourceLabel: '',
    suggestedRemedy: 'Powolna korekta pH/KH',
    severity: 'high',
    summary:
      'Nagla zmiana pH uszkadza nabłonek skrzeli i skory oraz nasila stres osmotyczny.',
    symptoms: ['rapid_breathing', 'flashing', 'lethargy', 'color_loss', 'sudden_deaths'],
    treatment: [
      'Przerwij szybkie korekty chemiczne i ustabilizuj parametry.',
      'Wykonaj ostrozna podmiane o zblizonych parametrach.',
      'Kontroluj pH i KH czesciej przez kilka dni.',
      'Zapewnij spokoj oraz dobre natlenienie.',
    ],
    caution:
      'Najgrozniejsze sa gwaltowne wahania. Stabilnosc wazniejsza niz idealna wartosc.',
  },
  {
    id: 'mechanical_injury',
    name: 'Urazy mechaniczne',
    imageSourceLabel: '',
    suggestedRemedy: 'Poprawa aranżacji i higieny',
    severity: 'medium',
    summary:
      'Skaleczenia i otarcia po kontakcie z ostrymi dekoracjami lub podczas panicznych ucieczek.',
    symptoms: ['ulcers', 'frayed_fins', 'clamped_fins', 'lethargy'],
    treatment: [
      'Usun ostre elementy i popraw bezpieczenstwo aranżacji.',
      'Popraw jakosc wody, by wspierac gojenie.',
      'Ogranicz stres i agresje w obsadzie.',
      'W razie nadkazenia rozwaz leczenie wspierajace.',
    ],
    caution:
      'Nieleczone urazy latwo przechodza w infekcje wtórne.',
  },
  {
    id: 'transport_stress',
    name: 'Stres transportowy',
    imageSourceLabel: '',
    suggestedRemedy: 'Spokojna aklimatyzacja i obserwacja',
    severity: 'low',
    summary:
      'Po transporcie ryby bywaja oslabione, blade i mniej aktywne.',
    symptoms: ['clamped_fins', 'lethargy', 'loss_appetite', 'color_loss'],
    treatment: [
      'Ogranicz swiatlo i ruch wokol akwarium.',
      'Zapewnij powolna aklimatyzacje temperatury i parametrow.',
      'Nie przekarmiaj w pierwszej dobie po wpuszczeniu.',
      'Obserwuj, czy objawy nie przechodza w infekcje.',
    ],
    caution:
      'Nadmierny stres po transporcie zwieksza podatnosc na pasozyty i infekcje.',
  },
  {
    id: 'aggression_fin_nipping',
    name: 'Agresja i obgryzanie pletw',
    imageSourceLabel: '',
    suggestedRemedy: 'Korekta obsady i kryjowek',
    severity: 'medium',
    summary:
      'Uszkodzenia pletw i stres behawioralny wynikajacy z niedopasowanej obsady.',
    symptoms: ['frayed_fins', 'clamped_fins', 'lethargy', 'loss_appetite', 'color_loss'],
    treatment: [
      'Rozdziel konfliktowe gatunki lub osobniki.',
      'Zwieksz liczbe kryjowek i bariery wzrokowe.',
      'Sprawdz proporcje plci i liczebnosc stadna.',
      'Usun urazogenne elementy w akwarium.',
    ],
    caution:
      'Przewlekla agresja moze prowadzic do wtornych infekcji i padniec.',
  },
  {
    id: 'skin_flukes',
    name: 'Przywry skorne',
    imageSourceLabel: '',
    suggestedRemedy: 'Sera Tremazol',
    severity: 'high',
    summary:
      'Pasozyty skory wywolujace podraznienie, ocieranie i osowialosc.',
    symptoms: ['flashing', 'clamped_fins', 'lethargy', 'loss_appetite', 'color_loss'],
    treatment: [
      'Zwieksz napowietrzanie i ogranicz stres.',
      'Zastosuj preparat przeciw przywrom zgodnie z etykieta.',
      'Po kuracji wykonaj podmiane i odmulanie.',
      'Monitoruj, czy objawy ocierania zanikaja.',
    ],
    caution:
      'Niedoleczone przywry latwo wracaja. Trzymaj pelny schemat kuracji.',
  },
  {
    id: 'wasting_syndrome',
    name: 'Wychudzenie ryb',
    imageSourceLabel: '',
    suggestedRemedy: 'Diagnostyka pasozytow i diety',
    severity: 'high',
    summary:
      'Postepujaca utrata masy ciala mimo karmienia, czesto zwiazana z pasozytami lub przewleklym stresem.',
    symptoms: ['skinny_body', 'loss_appetite', 'stringy_feces', 'lethargy', 'color_loss'],
    treatment: [
      'Odizoluj oslabione osobniki i popraw jakość wody.',
      'Zweryfikuj pasozyty wewnetrzne i jakosc pokarmu.',
      'Podawaj czestsze, male porcje wysokiej jakosci karmy.',
      'W razie potrzeby wdroz leczenie celowane po konsultacji.',
    ],
    caution:
      'Objaw przewlekly wymaga cierpliwej diagnostyki przyczyny, nie tylko leczenia objawowego.',
  },
  {
    id: 'hole_in_the_head',
    name: 'Dziurawica',
    imageSourceLabel: '',
    suggestedRemedy: 'Sera Flagellol / metronidazol po konsultacji',
    severity: 'high',
    summary:
      'Ubytki tkanek w okolicy glowy, czesto wspolistniejace z oslabieniem i problemami jelitowymi.',
    symptoms: ['ulcers', 'skinny_body', 'stringy_feces', 'loss_appetite', 'lethargy'],
    treatment: [
      'Popraw warunki i ogranicz stres w akwarium.',
      'Rozwaz leczenie na wiciowce zgodnie z zaleceniami.',
      'Utrzymuj wysoka higienę i regularne podmiany.',
      'Monitoruj, czy zmiany skorne nie pogłębiaja sie.',
    ],
    caution:
      'Czesto towarzyszy innym problemom. Leczenie musi obejmowac przyczyne pierwotna.',
  },
  {
    id: 'nitrate_poisoning',
    name: 'Zatrucie azotanami NO3',
    imageSourceLabel: '',
    suggestedRemedy: 'Regularne podmiany i redukcja obciazenia',
    severity: 'medium',
    summary:
      'Wysokie NO3 przewlekle oslabia ryby, obniza odpornosc i nasila stres.',
    symptoms: ['lethargy', 'loss_appetite', 'color_loss', 'rapid_breathing'],
    treatment: [
      'Wprowadz regularne, bezpieczne podmiany wody.',
      'Ogranicz przekarmianie i nadmierna obsade.',
      'Popraw filtracje biologiczna i higienę dna.',
      'Monitoruj trend NO3 tydzien po tygodniu.',
    ],
    caution:
      'Wysokie NO3 rzadko daje nagly kryzys, ale długofalowo silnie szkodzi obsadzie.',
  },
  {
    id: 'osmotic_shock',
    name: 'Szok osmotyczny',
    imageSourceLabel: '',
    suggestedRemedy: 'Powolna aklimatyzacja GH/KH/TDS',
    severity: 'high',
    summary:
      'Nagla zmiana mineralizacji lub zasolenia powoduje silny stres i zaburzenia gospodarki wodnej.',
    symptoms: ['rapid_breathing', 'clamped_fins', 'lethargy', 'color_loss', 'sudden_deaths'],
    treatment: [
      'Ustabilizuj GH/KH/TDS i unikaj dalszych skokow.',
      'Wykonuj tylko ostrozne korekty parametrow.',
      'Zapewnij mocne natlenienie i spokoj.',
      'Przy kolejnych podmianach trzymaj stale parametry.',
    ],
    caution:
      'Najwazniejsza jest stabilnosc. Nie koryguj agresywnie kilku parametrow naraz.',
  },
  {
    id: 'ammonia_burn',
    name: 'Poparzenie amoniakiem',
    imageSourceLabel: '',
    suggestedRemedy: 'Awaryjna podmiana + neutralizacja NH3',
    severity: 'high',
    summary:
      'Uszkodzenia skrzeli i nablonka po ekspozycji na toksyczny amoniak.',
    symptoms: ['rapid_breathing', 'red_gills', 'ulcers', 'lethargy', 'loss_appetite'],
    treatment: [
      'Natychmiast wykonaj podmiane i zwieksz napowietrzanie.',
      'Ogranicz karmienie i obciazenie biologiczne.',
      'Sprawdz filtracje biologiczna i dojrzalosc zbiornika.',
      'Kontroluj NH3/NH4 codziennie do stabilizacji.',
    ],
    caution:
      'To stan awaryjny. Nie zwlekaj z działaniem nawet przy umiarkowanych objawach.',
  },
  {
    id: 'chemical_burn',
    name: 'Poparzenie chemiczne',
    imageSourceLabel: '',
    suggestedRemedy: 'Usuniecie toksyny + duza podmiana',
    severity: 'high',
    summary:
      'Uszkodzenia po kontakcie z nieodpowiednimi chemikaliami, przedawkowaniem lub pozostalosciami detergentow.',
    symptoms: ['ulcers', 'rapid_breathing', 'clamped_fins', 'lethargy', 'sudden_deaths'],
    treatment: [
      'Natychmiast usun potencjalne zrodlo toksyny.',
      'Wykonaj duza, bezpieczna podmiane i zastosuj silna aeracje.',
      'Dodaj swiezy filtr chemiczny (np. wegiel aktywny), jesli wskazane.',
      'Obserwuj ryby przez 48h pod katem nawrotu dusznosci.',
    ],
    caution:
      'Przy ostrym zatruciu liczy sie czas. Dzialaj awaryjnie i ostroznie.',
  },
  {
    id: 'fight_wounds',
    name: 'Rany po walkach',
    imageSourceLabel: '',
    suggestedRemedy: 'Separacja agresorow',
    severity: 'medium',
    summary:
      'Rany i uszkodzenia tkanek po konfliktach wewnatrz obsady.',
    symptoms: ['ulcers', 'frayed_fins', 'clamped_fins', 'lethargy'],
    treatment: [
      'Rozdziel walczace osobniki i popraw strukturę kryjowek.',
      'Utrzymuj wysoka jakosc wody dla szybszego gojenia.',
      'Ogranicz dodatkowy stres (swiatlo, manipulacje).',
      'Przy nadkazeniu wdroz leczenie wspierajace.',
    ],
    caution:
      'Brak korekty obsady powoduje nawroty ran i wzrost ryzyka infekcji.',
  },
  {
    id: 'introduction_stress',
    name: 'Stres po wpuszczeniu do akwarium',
    imageSourceLabel: '',
    suggestedRemedy: 'Lagodna aklimatyzacja i obserwacja',
    severity: 'low',
    summary:
      'Przejsciowa reakcja stresowa po zmianie srodowiska i hierarchii w zbiorniku.',
    symptoms: ['clamped_fins', 'lethargy', 'loss_appetite', 'color_loss'],
    treatment: [
      'Utrzymaj spokoj i ogranicz swiatlo na starcie.',
      'Zadbaj o kryjowki i bezpieczne strefy.',
      'Podawaj male porcje pokarmu po ustabilizowaniu zachowania.',
      'Obserwuj, czy nie pojawia sie objawy wtornych chorob.',
    ],
    caution:
      'Przedluzajacy sie stres po wpuszczeniu moze byc sygnalem niezgodnej obsady.',
  },
  {
    id: 'cichlid_bloat',
    name: 'Bloat u pielegnic',
    imageSourceLabel: '',
    suggestedRemedy: 'Korekta diety i szybka izolacja',
    severity: 'high',
    summary:
      'Ciezkie zaburzenie trawienne i zapalne spotykane u pielegnic, czesto nasilane stresem i dieta.',
    symptoms: ['bloating', 'loss_appetite', 'stringy_feces', 'lethargy', 'color_loss'],
    treatment: [
      'Natychmiast odizoluj chore osobniki.',
      'Wstrzymaj karmienie na krotko, potem wprowadz lekkostrawna diete.',
      'Sprawdz jakosc wody i ogranicz agresje w zbiorniku.',
      'Rozwaz leczenie celowane po konsultacji specjalisty.',
    ],
    caution:
      'Przebieg moze byc gwaltowny. Wczesna reakcja mocno zwieksza szanse poprawy.',
  },
  {
    id: 'chlorine_poisoning',
    name: 'Zatrucie chlorem',
    imageSourceLabel: '',
    suggestedRemedy: 'Uzdatniacz + podmiana',
    severity: 'high',
    summary:
      'Kontakt z nieuzdatniona woda wodociagowa moze uszkadzac skrzela i blony sluzowe.',
    symptoms: ['rapid_breathing', 'red_gills', 'lethargy', 'sudden_deaths', 'clamped_fins'],
    treatment: [
      'Natychmiast dodaj uzdatniacz neutralizujacy chlor/chloraminy.',
      'Wykonaj bezpieczna podmiane poprawnie przygotowana woda.',
      'Silnie napowietrz akwarium.',
      'Monitoruj ryby pod katem dalszych objawow uszkodzenia skrzeli.',
    ],
    caution:
      'Nieprzygotowana podmiana potrafi wywolac masowe straty w bardzo krotkim czasie.',
  },
  {
    id: 'co2_poisoning',
    name: 'Zatrucie CO2',
    imageSourceLabel: '',
    suggestedRemedy: 'Zmniejszenie CO2 + napowietrzanie',
    severity: 'high',
    summary:
      'Nadmiar CO2 obniza dostepny tlen i prowadzi do dusznosci, zwlaszcza nad ranem.',
    symptoms: ['rapid_breathing', 'lethargy', 'color_loss', 'sudden_deaths'],
    treatment: [
      'Natychmiast zwieksz ruch tafli i napowietrzanie.',
      'Zmniejsz dozowanie CO2 i skoryguj harmonogram start/stop.',
      'Sprawdz drop checker, pH i KH w cyklu dobowym.',
      'Obserwuj ryby przez kolejne 24h po korekcie.',
    ],
    caution:
      'Nagly wzrost CO2 bywa smiertelny. Utrzymuj stabilne, przewidywalne dozowanie.',
  },
];

export const DISEASE_CATALOG = RAW_DISEASE_CATALOG.map((item) => {
  const allowedSymptoms = new Set(DISEASE_SYMPTOMS.map((entry) => entry.id));
  const defaultSymptoms = ['loss_appetite', 'lethargy', 'color_loss'];
  const normalizedSymptoms = [
    ...new Set(
      (Array.isArray(item?.symptoms) ? item.symptoms : [])
        .map((value) => String(value ?? '').trim())
        .filter((value) => allowedSymptoms.has(value))
    ),
  ];
  for (const symptomId of defaultSymptoms) {
    if (normalizedSymptoms.length >= 3) {
      break;
    }
    if (allowedSymptoms.has(symptomId) && !normalizedSymptoms.includes(symptomId)) {
      normalizedSymptoms.push(symptomId);
    }
  }

  const imageFileName = String(item.imageFileName ?? '').trim();

  return {
    ...item,
    symptoms: normalizedSymptoms,
    imageUrl: buildDiseaseImageUrl(imageFileName, 900),
    imagePreviewUrl: buildDiseaseImageUrl(imageFileName, 420),
    imageFallbackUrl: buildDiseaseImageFallbackUrl(imageFileName),
    imageFallbackPreviewUrl: buildDiseaseImageFallbackUrl(imageFileName, 420),
  };
});
