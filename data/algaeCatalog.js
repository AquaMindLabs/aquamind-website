export const ALGAE_SYMPTOMS = [
  { id: 'green_dust_glass', label: 'Zielony pyl na szybach' },
  { id: 'green_spot_hard', label: 'Twarde zielone kropki na szybie/lisciach' },
  { id: 'green_hair_long', label: 'Dlugie zielone nitki' },
  { id: 'short_brush_dark', label: 'Ciemne kepki/wloski na krawedziach lisci' },
  { id: 'slime_blue_green', label: 'Sliski nalot niebiesko-zielony' },
  { id: 'brown_diatom_dust', label: 'Brazowy pyl na dekoracjach i lisciach' },
  { id: 'plants_stunted', label: 'Rosliny slabo rosna / zatrzymany wzrost' },
  { id: 'foul_smell', label: 'Nieprzyjemny zapach po poruszeniu nalotu' },
  { id: 'after_light_change', label: 'Wysyp po zmianie oswietlenia' },
  { id: 'after_overfeeding', label: 'Wysyp po przekarmianiu / wzroscie NO3/PO4' },
  { id: 'biofilm_surface', label: 'Biofilm na powierzchni wody' },
  { id: 'algae_on_leaves', label: 'Glony na lisciach roslin' },
  { id: 'algae_on_hardscape', label: 'Glony na dekoracjach' },
  { id: 'algae_on_substrate', label: 'Glony na podlozu' },
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
      'Cienki zielony pyl na szybach i lisciach, czesto przy niestabilnym swietle.',
    symptoms: ['green_dust_glass', 'after_light_change', 'plants_stunted'],
    suggestedRemedy: 'Easy-Life AlgExit',
    causes: [
      'Niestabilny fotoperiod lub skoki mocy lampy.',
      'Dojrzewanie zbiornika i nierownowaga biologiczna.',
      'Nadmiar osadu organicznego.',
    ],
    removeActions: [
      'Mechanicznie usuwaj nalot podczas podmian.',
      'Utrzymuj stabilny czas swiecenia.',
      'Ogranicz osad i odmulaj problematyczne strefy.',
      'W razie potrzeby rozwaz lagodne wsparcie preparatem zgodnie z etykieta.',
    ],
    preventionActions: [
      'Nie zwiekszaj swiatla skokowo.',
      'Utrzymuj regularne podmiany.',
      'Wspieraj stabilny wzrost roslin.',
    ],
    caution:
      'Sama chemia bez usuniecia przyczyny zwykle konczy sie nawrotem.',
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
      'Twarde zielone kropki na szybach i wolno rosnacych lisciach.',
    symptoms: ['green_spot_hard', 'plants_stunted', 'after_light_change'],
    suggestedRemedy: 'Easy-Life AlgExit',
    causes: [
      'Nierownowaga swiatla i nawozenia.',
      'Wolny wzrost roslin i przewlekly osad.',
    ],
    removeActions: [
      'Usuwaj nalot mechanicznie z szyb.',
      'Przytnij najmocniej porazone liscie.',
      'Skroc fotoperiod na czas stabilizacji.',
      'Dopasuj nawozenie do tempa wzrostu roslin.',
    ],
    preventionActions: [
      'Stabilny fotoperiod i podmiany.',
      'Unikanie skokowych zmian nawozenia.',
      'Lepsza kondycja masy roslinnej.',
    ],
    caution:
      'Bez poprawy warunkow glony punktowe maja tendencje do nawrotow.',
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
      'Dlugie zielone nitki szybko oplatajace rosliny i dekoracje.',
    symptoms: ['green_hair_long', 'after_light_change', 'after_overfeeding'],
    suggestedRemedy: 'Easy-Life AlgExit',
    causes: [
      'Za duzo swiatla wzgledem kondycji roslin.',
      'Nadmiar materii organicznej i przekarmianie.',
      'Niestabilne CO2 i przeplyw.',
    ],
    removeActions: [
      'Wyciagaj nitki recznie przy kazdej podmianie.',
      'Skroc fotoperiod i ogranicz przekarmianie.',
      'Odmulaj dno i popraw cyrkulacje.',
      'Preparaty traktuj jako wsparcie, nie glowna metode.',
    ],
    preventionActions: [
      'Stabilny balans swiatla i nawozenia.',
      'Regularny serwis filtra i dna.',
      'Kontrola karmienia i trendu NO3/PO4.',
    ],
    caution:
      'Najpierw usun przyczyne, dopiero potem wzmacniaj dzialanie preparatami.',
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
      'Ciemne kepki na lisciach i hardscape, czesto przy niestabilnym CO2.',
    symptoms: ['short_brush_dark', 'plants_stunted', 'after_light_change'],
    suggestedRemedy: 'Easy-Life EasyCarbo (punktowo)',
    causes: [
      'Wahania CO2 i slaby przeplyw.',
      'Skoki oswietlenia oraz osad organiczny.',
      'Niedostateczna higiena filtra i podloza.',
    ],
    removeActions: [
      'Usuwaj porazone fragmenty i nalot mechanicznie.',
      'Stabilizuj CO2 i popraw przeplyw przy lisciach.',
      'Skroc czas swiecenia na czas opanowania wysypu.',
      'Plynny wegiel stosuj ostroznie i zgodnie z etykieta.',
    ],
    preventionActions: [
      'Stabilny CO2 i cyrkulacja.',
      'Regularny serwis filtra i podmiany.',
      'Unikanie skokow fotoperiodu.',
    ],
    caution:
      'Przedawkowanie preparatow moze zaszkodzic zwierzetom i roslinom.',
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
      'Sliski nalot o mocnym zapachu, szybko pokrywajacy podloze i rosliny.',
    symptoms: ['slime_blue_green', 'foul_smell', 'plants_stunted'],
    suggestedRemedy: 'Easy-Life Blue Exit',
    causes: [
      'Martwe strefy przeplywu i osad organiczny.',
      'Niestabilna biologia zbiornika.',
      'Za dlugi fotoperiod przy slabej konkurencji roslin.',
    ],
    removeActions: [
      'Odsysaj nalot podczas podmian.',
      'Skroc fotoperiod i zwieksz napowietrzanie.',
      'Popraw cyrkulacje oraz higiene dna.',
      'W trudnych przypadkach rozwaz zaciemnienie i preparat zgodnie z etykieta.',
    ],
    preventionActions: [
      'Regularne podmiany i odmulanie.',
      'Stabilny przeplyw i rozsadne karmienie.',
      'Wzmacnianie zdrowego wzrostu roslin.',
    ],
    caution:
      'Przy duzym wysypie reaguj szybko, bo rozklad nalotu pogarsza warunki tlenowe.',
  },
  {
    id: 'diatoms',
    name: 'Okrzemki (brazowy nalot)',
    imageFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/brown_algae.jpg?v=1579126404',
    imageFallbackFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/green_spot_algae.jpg?v=1579126489',
    imageSourceLabel: 'Aquarium Co-Op',
    severity: 'low',
    summary:
      'Brazowy pyl typowy dla mlodych i niestabilnych zbiornikow.',
    symptoms: ['brown_diatom_dust', 'green_dust_glass'],
    suggestedRemedy: 'Easy-Life AlgExit',
    causes: ['Dojrzewanie zbiornika.', 'Niski przeplyw i osad.', 'Slaba kondycja roslin.'],
    removeActions: [
      'Scieraj nalot z szyb i lisci.',
      'Utrzymuj regularne podmiany i odmulanie.',
      'Dbaj o droznosc filtra i umiarkowany fotoperiod.',
    ],
    preventionActions: [
      'Cierpliwa stabilizacja dojrzewajacego zbiornika.',
      'Regularny serwis i unikanie przekarmiania.',
      'Stopniowe wzmacnianie roslin.',
    ],
    caution:
      'W mlodym akwarium to czesto etap przejsciowy, jesli serwis jest regularny.',
  },
];

function normalizeAlgaeProblemKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function buildAlgaeProblemId(name) {
  const slug = normalizeAlgaeProblemKey(name)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `algae_issue_${slug || 'unknown'}`;
}

function inferAlgaeProblemSeverity(name) {
  const key = normalizeAlgaeProblemKey(name);

  if (
    key.includes('sinice') ||
    key.includes('cyjanobakterie') ||
    key.includes('krasnorosty') ||
    key.includes('black beard') ||
    key.includes('zakwit')
  ) {
    return 'high';
  }

  if (
    key.includes('nitkowate') ||
    key.includes('wlosowate') ||
    key.includes('hair') ||
    key.includes('staghorn') ||
    key.includes('cladophora') ||
    key.includes('rhizoclonium')
  ) {
    return 'medium';
  }

  return 'low';
}

function inferAlgaeProblemSymptoms(name) {
  const key = normalizeAlgaeProblemKey(name);
  const symptoms = new Set();
  const pushSymptoms = (...ids) => {
    ids.forEach((id) => symptoms.add(id));
  };

  if (key.includes('okrzemki') || key.includes('brazowy nalot')) {
    pushSymptoms('brown_diatom_dust', 'algae_on_hardscape', 'algae_on_leaves');
  }
  if (key.includes('punktowe') || key.includes('green spot')) {
    pushSymptoms('green_spot_hard', 'algae_on_leaves', 'after_light_change');
  }
  if (
    key.includes('pylace') ||
    key.includes('zielony nalot na szybach') ||
    key.includes('green dust')
  ) {
    pushSymptoms('green_dust_glass', 'after_light_change', 'algae_on_hardscape');
  }
  if (
    key.includes('nitkowate') ||
    key.includes('wlosowate') ||
    key.includes('fuzz') ||
    key.includes('hair') ||
    key.includes('rhizoclonium') ||
    key.includes('cladophora')
  ) {
    pushSymptoms(
      'green_hair_long',
      'algae_on_leaves',
      'algae_on_hardscape',
      'after_overfeeding'
    );
  }
  if (
    key.includes('krasnorosty') ||
    key.includes('black beard') ||
    key.includes('pedzelkowate') ||
    key.includes('staghorn')
  ) {
    pushSymptoms(
      'short_brush_dark',
      'algae_on_hardscape',
      'algae_on_leaves',
      'plants_stunted'
    );
  }
  if (key.includes('sinice') || key.includes('cyjanobakterie')) {
    pushSymptoms(
      'slime_blue_green',
      'foul_smell',
      'algae_on_substrate',
      'plants_stunted'
    );
  }
  if (key.includes('zakwit zielonej wody')) {
    pushSymptoms('green_dust_glass', 'after_light_change', 'plants_stunted');
  }
  if (key.includes('biofilm')) {
    pushSymptoms('biofilm_surface', 'after_overfeeding', 'plants_stunted');
  }
  if (key.includes('na lisciach')) {
    pushSymptoms('algae_on_leaves', 'plants_stunted', 'after_light_change');
  }
  if (key.includes('na dekoracjach')) {
    pushSymptoms('algae_on_hardscape', 'after_light_change', 'after_overfeeding');
  }
  if (key.includes('na podlozu')) {
    pushSymptoms('algae_on_substrate', 'after_overfeeding', 'plants_stunted');
  }

  if (symptoms.size === 0) {
    pushSymptoms('plants_stunted', 'after_light_change', 'after_overfeeding');
  }

  return [...symptoms];
}

function inferAlgaeProblemSuggestedRemedy(name) {
  const key = normalizeAlgaeProblemKey(name);

  if (key.includes('sinice') || key.includes('cyjanobakterie')) {
    return 'Usuwanie mechaniczne + korekta przeplywu i swiatla';
  }
  if (key.includes('krasnorosty') || key.includes('black beard')) {
    return 'Stabilizacja CO2 i cyrkulacji + usuwanie porazonych miejsc';
  }
  if (key.includes('zakwit')) {
    return 'Kontrola swiatla i podmiany + poprawa biologii';
  }
  if (key.includes('punktowe') || key.includes('green spot')) {
    return 'Korekta fotoperiodu i nawozenia fosforowego';
  }
  if (key.includes('okrzemki') || key.includes('brazowy nalot')) {
    return 'Regularne czyszczenie i stabilizacja dojrzewania zbiornika';
  }

  return 'Stabilizacja swiatla, karmienia i regularnych podmian';
}

function buildGenericAlgaeEntry(name) {
  const normalizedName = String(name ?? '').trim();
  const severity = inferAlgaeProblemSeverity(normalizedName);
  const symptoms = inferAlgaeProblemSymptoms(normalizedName);
  const suggestedRemedy = inferAlgaeProblemSuggestedRemedy(normalizedName);

  return {
    id: buildAlgaeProblemId(normalizedName),
    name: normalizedName,
    imageFileName: '',
    imageFallbackFileName: '',
    imageSourceLabel: '',
    severity,
    summary:
      'Problem glonowy wymagajacy stabilizacji oswietlenia, odzywiania roslin i higieny zbiornika.',
    symptoms,
    suggestedRemedy,
    causes: [
      'Nierownowaga miedzy swiatlem, nawozeniem i masa roslinna.',
      'Nadmiar materii organicznej lub niestabilna filtracja.',
      'Wahania CO2, przeplywu lub fotoperiodu.',
    ],
    removeActions: [
      'Usun naloty mechanicznie podczas podmian.',
      'Utrzymuj staly fotoperiod i unikaj skokow mocy lampy.',
      'Ogranicz przekarmianie i odmul strefy osadu.',
      'Koryguj jeden glowny czynnik naraz i obserwuj trend przez 1-2 tygodnie.',
    ],
    preventionActions: [
      'Regularne podmiany i czyszczenie filtra.',
      'Stabilne nawozenie adekwatne do tempa wzrostu roslin.',
      'Kontrola przeplywu i cyrkulacji w calym zbiorniku.',
    ],
    caution:
      'Silna chemia bez usuniecia przyczyny zwykle daje nawroty glonow.',
  };
}

const ADDITIONAL_ALGAE_PROBLEM_NAMES = [
  'Okrzemki',
  'Zielenice punktowe',
  'Zielenice pylace',
  'Zielenice nitkowate',
  'Glony wlosowate',
  'Krasnorosty / black beard algae',
  'Sinice / cyjanobakterie',
  'Zakwit zielonej wody',
  'Zielony nalot na szybach',
  'Brazowy nalot',
  'Biofilm na powierzchni wody',
  'Krasnorosty pedzelkowate',
  'Staghorn algae',
  'Glony na lisciach wolnorosnacych roslin',
  'Glony na dekoracjach',
  'Glony na podlozu',
  'Rhizoclonium',
  'Cladophora',
  'Green dust algae',
  'Green spot algae',
  'Fuzz algae',
  'Hair algae',
];

const NORMALIZED_RAW_ALGAE_NAMES = new Set(
  RAW_ALGAE_CATALOG.map((item) => normalizeAlgaeProblemKey(item?.name))
);

const AUTO_GENERATED_ALGAE_ENTRIES = ADDITIONAL_ALGAE_PROBLEM_NAMES
  .map((name) => String(name ?? '').trim())
  .filter(Boolean)
  .filter((name) => !NORMALIZED_RAW_ALGAE_NAMES.has(normalizeAlgaeProblemKey(name)))
  .map((name) => buildGenericAlgaeEntry(name));

const MERGED_ALGAE_CATALOG = [
  ...RAW_ALGAE_CATALOG,
  ...AUTO_GENERATED_ALGAE_ENTRIES,
];

export const ALGAE_CATALOG = MERGED_ALGAE_CATALOG.map((item) => {
  const allowedSymptoms = new Set(ALGAE_SYMPTOMS.map((entry) => entry.id));
  const defaultSymptoms = ['plants_stunted', 'green_dust_glass', 'after_light_change'];
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
  const imageFallbackFileName = String(item.imageFallbackFileName ?? '').trim();

  return {
    ...item,
    symptoms: normalizedSymptoms,
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
