export const DISEASE_SYMPTOMS = [
  { id: 'white_spots', label: 'Biale kropki na ciele lub pletwach' },
  { id: 'gold_dust', label: 'Zlotawy pyl na ciele' },
  { id: 'cotton_growth', label: 'Bialy nalot (jak wata)' },
  { id: 'frayed_fins', label: 'Postrzepione pletwy' },
  { id: 'clamped_fins', label: 'Sklejone pletwy' },
  { id: 'flashing', label: 'Ocieranie sie o podloze/dekoracje' },
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
    name: 'Ospa rybia (Ichthyophthirius multifiliis)',
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
    name: 'Oodinioza (velvet)',
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
    name: 'Martwica pletw (fin rot)',
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
      'Usun potencjalne przyczyny urazow (ostre dekoracje, agresje).',
      'W ciezszych przypadkach rozwaz leczenie antybakteryjne: Sera Baktopur, Sera Baktopur Direct lub eSHa 2000 (zgodnie z etykieta).',
    ],
    caution:
      'Bez poprawy warunkow w akwarium objawy czesto wracaja mimo leczenia preparatami.',
  },
  {
    id: 'fungal',
    name: 'Infekcja grzybicza',
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
      'Usun martwe tkanki i zrodla urazow z akwarium.',
      'Rozwaz preparat przeciwgrzybiczy: Sera Mycopur, JBL Fungol lub eSHa 2000 (zgodnie z etykieta).',
    ],
    caution:
      'Grzybica bywa wtornym skutkiem innego problemu. Rownolegle sprawdz przyczyne pierwotna.',
  },
  {
    id: 'gill_flukes',
    name: 'Przywry skrzelowe/skorne',
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
      'Po kuracji odmul podloze i wykonaj bezpieczna podmiane wody.',
    ],
    caution:
      'Przy ciezkich dusznosciach dzialaj szybko. Niedotlenienie moze byc grozniejsze niz sama choroba.',
  },
  {
    id: 'hexamita',
    name: 'Hexamitoza (wiciowce)',
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
    name: 'Puchlina wodna (objaw ogolny)',
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
    name: 'Infekcja bakteryjna uogolniona',
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
];

export const DISEASE_CATALOG = RAW_DISEASE_CATALOG.map((item) => {
  const imageFileName = String(item.imageFileName ?? '').trim();

  return {
    ...item,
    imageUrl: buildDiseaseImageUrl(imageFileName, 900),
    imagePreviewUrl: buildDiseaseImageUrl(imageFileName, 420),
    imageFallbackUrl: buildDiseaseImageFallbackUrl(imageFileName),
    imageFallbackPreviewUrl: buildDiseaseImageFallbackUrl(imageFileName, 420),
  };
});
