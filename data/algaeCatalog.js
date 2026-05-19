export const ALGAE_SYMPTOMS = [
  { id: 'green_dust_glass', label: 'Zielony pyl na szybach' },
  { id: 'green_spot_hard', label: 'Twarde zielone kropki na szybie/lisciach' },
  { id: 'green_hair_long', label: 'Dlugie zielone nitki' },
  { id: 'short_brush_dark', label: 'Ciemne kepki/wloski na krawedziach lisci' },
  { id: 'slime_blue_green', label: 'Sliski nalot niebiesko-zielony' },
  { id: 'brown_diatom_dust', label: 'Brazowy pyl na dekoracjach i lisciach' },
  { id: 'plants_stunted', label: 'Rośliny slabo rosna / zatrzymany wzrost' },
  { id: 'foul_smell', label: 'Nieprzyjemny zapach po poruszeniu nalotu' },
  { id: 'after_light_change', label: 'Wysyp po zmianie oswietlenia' },
  { id: 'after_overfeeding', label: 'Wysyp po przekarmianiu / wzroscie NO3/PO4' },
];

function normalizeAlgaeImageFileName(fileName) {
  return String(fileName ?? '')
    .trim()
    .replace(/\s+/g, '_');
}

function buildAlgaeImageUrl(fileName, width = 720) {
  const rawValue = String(fileName ?? '').trim();
  if (!rawValue) {
    return '';
  }

  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue;
  }

  const normalizedFileName = normalizeAlgaeImageFileName(fileName);
  if (!normalizedFileName) {
    return '';
  }

  const encodedFileName = encodeURIComponent(normalizedFileName);
  const normalizedWidth = Number(width);
  const hasWidth = Number.isFinite(normalizedWidth) && normalizedWidth > 0;
  const widthQuery = hasWidth ? `?width=${Math.round(normalizedWidth)}` : '';

  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedFileName}${widthQuery}`;
}

function buildAlgaeImageFallbackUrl(fileName) {
  return buildAlgaeImageUrl(fileName);
}

const RAW_ALGAE_CATALOG = [
  {
    id: 'green-dust-algae',
    name: 'Zielenice pylowe (GDA)',
    imageFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/green_water.jpg?v=1579126545',
    imageFallbackFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/green_spot_algae.jpg?v=1579126489',
    imageSourceLabel: 'Aquarium Co-Op',
    severity: 'medium',
    summary:
      'Cienki zielony pyl na szybach i lisciach. Czesto zwiazany z niestabilnym światłem i mlodym zbiornikiem.',
    symptoms: ['green_dust_glass', 'after_light_change', 'plants_stunted'],
    suggestedRemedy: 'Easy-Life AlgExit',
    causes: [
      'Niestabilny czas swiecenia lampy lub nagle zwiekszenie mocy światła.',
      'Niewyrownany wzrost roślin i okres dojrzewania zbiornika.',
      'Zbyt rzadkie podmiany przy rosnacej materii organicznej.',
    ],
    removeActions: [
      'Mechanicznie usuń nalot z szyb podczas podmiany.',
      'Utrzymuj staly czas swiecenia lampy przez 7-10 dni.',
      'Pilnuj stabilnej temperatury (najczesciej 24-26 C) i unikaj przegrzewania > 27-28 C.',
      'Przy trudnych nawrotach rozwaz lagodne wsparcie: Easy-Life AlgExit (wg etykiety).',
      'Wykonuj regularne podmiany i odmulanie stref z osadem.',
    ],
    preventionActions: [
      'Nie zwiekszaj mocy światła skokowo.',
      'Wspieraj szybki wzrost roślin (makro/mikro, CO2 jesli stosowane).',
      'Utrzymuj stabilna rutyne podmian (np. 25-35% tygodniowo).',
    ],
    caution:
      'Nie stosuj od razu silnej chemii. Najpierw stabilizacja i higiena zbiornika.',
  },
  {
    id: 'green-spot-algae',
    name: 'Zielenice punktowe (GSA)',
    imageFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/green_spot_algae.jpg?v=1579126489',
    imageFallbackFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/brown_algae.jpg?v=1579126404',
    imageSourceLabel: 'Aquarium Co-Op',
    severity: 'medium',
    summary:
      'Twarde zielone kropki, szczegolnie na wolno rosnacych lisciach i szybach.',
    symptoms: ['green_spot_hard', 'plants_stunted', 'after_light_change'],
    suggestedRemedy: 'Easy-Life AlgExit',
    causes: [
      'Dlugie swiecenie przy niedoborach roślin (np. fosfor).',
      'Nierownowaga nawozenia i wolny wzrost roślin.',
    ],
    removeActions: [
      'Usuń mechanicznie z szyb skrobakiem/zyletka akwarystyczna.',
      'Przytnij mocno porazone starsze liscie.',
      'Skroc czas swiecenia lampy do 6-8h na czas stabilizacji.',
      'Utrzymuj stabilna temperature i nie dopuszczaj do dlugotrwalego przegrzewania zbiornika.',
      'Jesli nie ustepuje, rozwaz wsparcie: Easy-Life AlgExit lub punktowo plynny wegiel (EasyCarbo/Flourish Excel) zgodnie z etykieta.',
    ],
    preventionActions: [
      'Utrzymuj rownowage nawozenia i regularne podmiany.',
      'Pilnuj stalego czasu swiecenia, bez skokow.',
      'Wzmacniaj mase roślinna, by konkurencja byla silniejsza.',
    ],
    caution:
      'Nagly blackout bez poprawy przyczyn czesto daje szybki nawrot.',
  },
  {
    id: 'green-hair-algae',
    name: 'Zielenice nitkowate',
    imageFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/hair_algae_2.jpg?v=1579126462',
    imageFallbackFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/green_spot_algae.jpg?v=1579126489',
    imageSourceLabel: 'Aquarium Co-Op',
    severity: 'high',
    summary:
      'Dlugie zielone nitki oplatajace roślinki i dekoracje. Szybko sie rozrastaja.',
    symptoms: ['green_hair_long', 'after_light_change', 'after_overfeeding'],
    suggestedRemedy: 'Easy-Life AlgExit',
    causes: [
      'Nadmiar światła wzgledem kondycji roślin.',
      'Nadmiar materii organicznej i przekarmianie.',
      'Niestabilny CO2 (w zbiornikach z CO2).',
    ],
    removeActions: [
      'Recznie wyciagaj nitki przy kazdej podmianie.',
      'Usuń najbardziej porazone fragmenty roślin.',
      'Skroc oswietlenie do 6-7h na 2-3 tygodnie i utrzymuj stala temperature.',
      'Ogranicz karmienie na kilka dni i odmul dno.',
      'Jako wsparcie chemiczne mozesz rozwazyc Easy-Life AlgExit lub ostrozne punktowe dawkowanie plynnego wegla (wg etykiety).',
    ],
    preventionActions: [
      'Ustabilizuj światło i parametry odzywcze dla roślin.',
      'Dbaj o regularna filtracje i czyszczenie prefiltra.',
      'Wroc do umiarkowanego karmienia i obserwuj trend NO3.',
    ],
    caution:
      'Chemiczne preparaty tylko jako wsparcie, nie zamiennik usuniecia przyczyny.',
  },
  {
    id: 'black-beard-algae',
    name: 'Krasnorosty (BBA)',
    imageFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/BBA_2.jpg?v=1579126434',
    imageFallbackFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/hair_algae_2.jpg?v=1579126462',
    imageSourceLabel: 'Aquarium Co-Op',
    severity: 'high',
    summary:
      'Ciemne kepki na lisciach, korzeniach i sprzecie. Trudne do opanowania bez stabilizacji.',
    symptoms: ['short_brush_dark', 'plants_stunted', 'after_light_change'],
    suggestedRemedy: 'Easy-Life EasyCarbo (punktowo)',
    causes: [
      'Niestabilny poziom CO2 lub slaby przeplyw.',
      'Wahania światła i osadu organicznego.',
      'Przeciaganie serwisu i zabrudzona filtracja.',
    ],
    removeActions: [
      'Mechanicznie usuwaj porazone liscie i nalot z dekoracji.',
      'Przy krasnorostach ogranicz swiecenie do 6-7h na 2-3 tygodnie.',
      'Stabilizuj temperature (bez skokow) i popraw cyrkulacje przy lisciach.',
      'Popraw cyrkulacje i czystosc filtra.',
      'Rozwaz punktowe wsparcie: plynny wegiel (EasyCarbo/Flourish Excel) lub Easy-Life AlgExit, zawsze zgodnie z etykieta.',
    ],
    preventionActions: [
      'Utrzymuj staly rytm podmian i serwisu filtra.',
      'Stabilizuj CO2 i przeplyw w calym zbiorniku.',
      'Unikaj skokow oswietlenia.',
    ],
    caution:
      'Zbyt agresywne dawkowanie preparatow moze uszkodzic ryby/rośliny.',
  },
  {
    id: 'cyanobacteria',
    name: 'Sinice (cyjanobakterie)',
    imageFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/blue-green_algae_2.jpg?v=1579126521',
    imageFallbackFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/green_water.jpg?v=1579126545',
    imageSourceLabel: 'Aquarium Co-Op',
    severity: 'high',
    summary:
      'Sliski nalot o intensywnym zapachu, szybko pokrywa podłoże i rośliny.',
    symptoms: ['slime_blue_green', 'foul_smell', 'plants_stunted'],
    suggestedRemedy: 'Easy-Life Blue Exit',
    causes: [
      'Martwe strefy przeplywu i nagromadzona materia organiczna.',
      'Niestabilnosc biologii zbiornika.',
      'Zbyt dlugi czas swiecenia lampy przy slabej konkurencji roślin.',
    ],
    removeActions: [
      'Natychmiast odsysaj nalot podczas podmian.',
      'Skroc czas swiecenia lampy do 5-6h na czas opanowania sinic.',
      'Utrzymuj stabilna temperature i mocne napowietrzanie calej toni wody.',
      'Popraw przeplyw i natlenienie problematycznych stref.',
      'W trudnych przypadkach rozwaz 3-dniowe zaciemnienie i preparat na sinice, np. Blue Exit lub Blue Green Slime Stain Remover (wg etykiety).',
    ],
    preventionActions: [
      'Utrzymuj czyste dno i regularny harmonogram podmian.',
      'Pilnuj umiarkowanego karmienia i dobrej cyrkulacji.',
      'Wzmacniaj wzrost roślin, by ograniczyc puste nisze.',
    ],
    caution:
      'Przy duzym wysypie reaguj szybko. Rozklad nalotu moze pogarszac tlen w wodzie.',
  },
  {
    id: 'diatoms',
    name: 'Okemki (brazowy nalot)',
    imageFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/brown_algae.jpg?v=1579126404',
    imageFallbackFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/green_spot_algae.jpg?v=1579126489',
    imageSourceLabel: 'Aquarium Co-Op',
    severity: 'low',
    summary:
      'Brazowy pyl typowy w mlodych akwariach, zwykle latwiejszy do opanowania.',
    symptoms: ['brown_diatom_dust', 'green_dust_glass'],
    suggestedRemedy: 'Easy-Life AlgExit',
    causes: [
      'Dojrzewanie biologiczne zbiornika.',
      'Slabsze oswietlenie i osad organiczny.',
    ],
    removeActions: [
      'Regularnie scieraj nalot z szyb i lisci.',
      'Utrzymuj umiarkowane oswietlenie (ok. 6-8h) i stabilna temperature.',
      'Wykonuj podmiany i delikatne odmulanie.',
      'Dbaj o droznosc filtra i przeplyw.',
      'Chemia zwykle nie jest potrzebna; przy uporczywych okrzemkach mozna rozwazyc lagodne wsparcie AlgExit (wg etykiety).',
    ],
    preventionActions: [
      'Utrzymuj cierpliwie stabilny serwis akwarium.',
      'Stopniowo wzmacniaj kondycje roślin.',
      'Nie przekarmiaj i nie przeciagaj podmian.',
    ],
    caution:
      'W mlodym zbiorniku to czesto etap przejsciowy, nie panikuj.',
  },
];

export const ALGAE_CATALOG = RAW_ALGAE_CATALOG.map((item) => {
  const imageFileName = String(item.imageFileName ?? '').trim();
  const imageFallbackFileName = String(item.imageFallbackFileName ?? '').trim();

  return {
    ...item,
    imageUrl: buildAlgaeImageUrl(imageFileName, 900),
    imagePreviewUrl: buildAlgaeImageUrl(imageFileName, 420),
    imageFallbackUrl: buildAlgaeImageFallbackUrl(
      imageFallbackFileName || imageFileName
    ),
    imageFallbackPreviewUrl: buildAlgaeImageFallbackUrl(
      imageFallbackFileName || imageFileName
    ),
  };
});
