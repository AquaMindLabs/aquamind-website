export const ALGAE_SYMPTOMS = [
  { id: 'green_dust_glass', label: "Zielony pył na szybach" },
  { id: 'green_spot_hard', label: "Twarde zielone kropki na szybie/liściach" },
  { id: 'green_hair_long', label: 'Dlugie zielone nitki' },
  { id: 'short_brush_dark', label: "Ciemne kępki/włoski na krawedziach liści" },
  { id: 'slime_blue_green', label: 'Sliski nalot niebiesko-zielony' },
  { id: 'brown_diatom_dust', label: "Brązowy pył na dekoracjach i liściach" },
  { id: 'plants_stunted', label: "Rośliny słabo rosna / zatrzymany wzrost" },
  { id: 'foul_smell', label: 'Nieprzyjemny zapach po poruszeniu nalotu' },
  { id: 'after_light_change', label: "Wysyp po zmianie oświetlenia" },
  { id: 'after_overfeeding', label: 'Wysyp po przekarmianiu / wzroscie NO3/PO4' },
  { id: 'biofilm_surface', label: 'Biofilm na powierzchni wody' },
  { id: 'algae_on_leaves', label: "Glony na liściach roślin" },
  { id: 'algae_on_hardscape', label: 'Glony na dekoracjach' },
  { id: 'algae_on_substrate', label: "Glony na podłożu" },
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
      "Cienki zielony pył na szybach i liściach, często przy niestabilnym świetle.",
    symptoms: ['green_dust_glass', 'after_light_change', 'plants_stunted'],
    suggestedRemedy: 'Easy-Life AlgExit',
    causes: [
      'Niestabilny fotoperiod lub skoki mocy lampy.',
      'Dojrzewanie zbiornika i nierownowaga biologiczna.',
      'Nadmiar osadu organicznego.',
    ],
    removeActions: [
      'Mechanicznie usuwaj nalot podczas podmian.',
      "Utrzymuj stabilny czas świecenia.",
      'Ogranicz osad i odmulaj problematyczne strefy.',
      "W razie potrzeby rozważ łagodne wsparcie preparatem zgodnie z etykieta.",
    ],
    preventionActions: [
      "Nie zwiększaj światła skokowo.",
      'Utrzymuj regularne podmiany.',
      "Wspieraj stabilny wzrost roślin.",
    ],
    caution:
      "Sama chemia bez usunięcia przyczyny zwykle konczy się nawrotem.",
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
      "Twarde zielone kropki na szybach i wolno rosnacych liściach.",
    symptoms: ['green_spot_hard', 'plants_stunted', 'after_light_change'],
    suggestedRemedy: 'Easy-Life AlgExit',
    causes: [
      "Nierownowaga światła i nawożenia.",
      "Wolny wzrost roślin i przewlekly osad.",
    ],
    removeActions: [
      'Usuwaj nalot mechanicznie z szyb.',
      "Przytnij najmocniej porazone liście.",
      'Skroc fotoperiod na czas stabilizacji.',
      "Dopasuj nawożenie do tempa wzrostu roślin.",
    ],
    preventionActions: [
      'Stabilny fotoperiod i podmiany.',
      "Unikanie skokowych zmian nawożenia.",
      "Lepsza kondycja masy roślinnej.",
    ],
    caution:
      "Bez poprawy warunków glony punktowe maja tendencje do nawrotow.",
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
      "Dlugie zielone nitki szybko oplatajace rośliny i dekoracje.",
    symptoms: ['green_hair_long', 'after_light_change', 'after_overfeeding'],
    suggestedRemedy: 'Easy-Life AlgExit',
    causes: [
      "Za dużo światła względem kondycji roślin.",
      'Nadmiar materii organicznej i przekarmianie.',
      "Niestabilne CO2 i przepływ.",
    ],
    removeActions: [
      'Wyciagaj nitki recznie przy kazdej podmianie.',
      'Skroc fotoperiod i ogranicz przekarmianie.',
      'Odmulaj dno i popraw cyrkulacje.',
      "Preparaty traktuj jako wsparcie, nie główna metode.",
    ],
    preventionActions: [
      "Stabilny balans światła i nawożenia.",
      'Regularny serwis filtra i dna.',
      'Kontrola karmienia i trendu NO3/PO4.',
    ],
    caution:
      "Najpierw usuń przyczyne, dopiero potem wzmacniaj dzialanie preparatami.",
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
      "Ciemne kępki na liściach i hardscape, często przy niestabilnym CO2.",
    symptoms: ['short_brush_dark', 'plants_stunted', 'after_light_change'],
    suggestedRemedy: 'Easy-Life EasyCarbo (punktowo)',
    causes: [
      "Wahania CO2 i słaby przepływ.",
      "Skoki oświetlenia oraz osad organiczny.",
      "Niedostateczna higiena filtra i podłoża.",
    ],
    removeActions: [
      'Usuwaj porazone fragmenty i nalot mechanicznie.',
      "Stabilizuj CO2 i popraw przepływ przy liściach.",
      "Skroc czas świecenia na czas opanowania wysypu.",
      'Plynny wegiel stosuj ostroznie i zgodnie z etykieta.',
    ],
    preventionActions: [
      'Stabilny CO2 i cyrkulacja.',
      'Regularny serwis filtra i podmiany.',
      "Unikanie skoków fotoperiodu.",
    ],
    caution:
      "Przedawkowanie preparatów może zaszkodzic zwierzetom i roslinom.",
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
      "Sliski nalot o mocnym zapachu, szybko pokrywajacy podłoże i rośliny.",
    symptoms: ['slime_blue_green', 'foul_smell', 'plants_stunted'],
    suggestedRemedy: 'Easy-Life Blue Exit',
    causes: [
      "Martwe strefy przepływu i osad organiczny.",
      'Niestabilna biologia zbiornika.',
      "Za długi fotoperiod przy slabej konkurencji roślin.",
    ],
    removeActions: [
      'Odsysaj nalot podczas podmian.',
      "Skroc fotoperiod i zwiększ napowietrzanie.",
      'Popraw cyrkulacje oraz higiene dna.',
      "W trudnych przypadkach rozważ zaciemnienie i preparat zgodnie z etykieta.",
    ],
    preventionActions: [
      'Regularne podmiany i odmulanie.',
      "Stabilny przepływ i rozsadne karmienie.",
      "Wzmacnianie zdrowego wzrostu roślin.",
    ],
    caution:
      'Przy duzym wysypie reaguj szybko, bo rozklad nalotu pogarsza warunki tlenowe.',
  },
  {
    id: 'diatoms',
    name: "Okrzemki (brązowy nalot)",
    imageFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/brown_algae.jpg?v=1579126404',
    imageFallbackFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/green_spot_algae.jpg?v=1579126489',
    imageSourceLabel: 'Aquarium Co-Op',
    severity: 'low',
    summary:
      "Brązowy pył typowy dla młodych i niestabilnych zbiornikow.",
    symptoms: ['brown_diatom_dust', 'green_dust_glass'],
    suggestedRemedy: 'Easy-Life AlgExit',
    causes: ['Dojrzewanie zbiornika.', "Niski przepływ i osad.", "Słaba kondycja roślin."],
    removeActions: [
      "Scieraj nalot z szyb i liści.",
      'Utrzymuj regularne podmiany i odmulanie.',
      'Dbaj o droznosc filtra i umiarkowany fotoperiod.',
    ],
    preventionActions: [
      'Cierpliwa stabilizacja dojrzewajacego zbiornika.',
      'Regularny serwis i unikanie przekarmiania.',
      "Stopniowe wzmacnianie roślin.",
    ],
    caution:
      "W mlodym akwarium to często etap przejsciowy, jesli serwis jest regularny.",
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
    return "Usuwanie mechaniczne + korekta przepływu i światła";
  }
  if (key.includes('krasnorosty') || key.includes('black beard')) {
    return 'Stabilizacja CO2 i cyrkulacji + usuwanie porazonych miejsc';
  }
  if (key.includes('zakwit')) {
    return "Kontrola światła i podmiany + poprawa biologii";
  }
  if (key.includes('punktowe') || key.includes('green spot')) {
    return "Korekta fotoperiodu i nawożenia fosforowego";
  }
  if (key.includes('okrzemki') || key.includes('brazowy nalot')) {
    return 'Regularne czyszczenie i stabilizacja dojrzewania zbiornika';
  }

  return "Stabilizacja światła, karmienia i regularnych podmian";
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
      "Problem glonowy wymagajacy stabilizacji oświetlenia, odżywiania roślin i higieny zbiornika.",
    symptoms,
    suggestedRemedy,
    causes: [
      "Nierownowaga miedzy swiatlem, nawozeniem i masa roślinna.",
      'Nadmiar materii organicznej lub niestabilna filtracja.',
      "Wahania CO2, przepływu lub fotoperiodu.",
    ],
    removeActions: [
      "Usuń naloty mechanicznie podczas podmian.",
      "Utrzymuj stały fotoperiod i unikaj skoków mocy lampy.",
      'Ogranicz przekarmianie i odmul strefy osadu.',
      "Koryguj jeden główny czynnik naraz i obserwuj trend przez 1-2 tygodnie.",
    ],
    preventionActions: [
      'Regularne podmiany i czyszczenie filtra.',
      "Stabilne nawożenie adekwatne do tempa wzrostu roślin.",
      "Kontrola przepływu i cyrkulacji w calym zbiorniku.",
    ],
    caution:
      "Silna chemia bez usunięcia przyczyny zwykle daje nawroty glonów.",
  };
}

const ADDITIONAL_ALGAE_PROBLEM_NAMES = [
  'Okrzemki',
  'Zielenice punktowe',
  'Zielenice pylace',
  'Zielenice nitkowate',
  "Glony włosowate",
  'Krasnorosty / black beard algae',
  'Sinice / cyjanobakterie',
  'Zakwit zielonej wody',
  'Zielony nalot na szybach',
  "Brązowy nalot",
  'Biofilm na powierzchni wody',
  'Krasnorosty pedzelkowate',
  'Staghorn algae',
  "Glony na liściach wolnorosnacych roślin",
  'Glony na dekoracjach',
  "Glony na podłożu",
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
