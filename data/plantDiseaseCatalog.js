export const PLANT_DISEASE_SYMPTOMS = [
  { id: 'holes_in_leaves', label: 'Dziury w lisciach' },
  { id: 'yellowing_old_leaves', label: 'Zolkniecie starszych lisci' },
  { id: 'yellowing_new_leaves', label: 'Zolkniecie mlodych lisci' },
  { id: 'melt_after_planting', label: 'Rozpuszczanie lisci po posadzeniu' },
  { id: 'black_leaf_edges', label: 'Czernienie krawedzi lisci' },
  { id: 'twisted_new_growth', label: 'Deformacje nowych przyrostow' },
  { id: 'transparent_leaves', label: 'Przezroczyste / cienkie liscie' },
  { id: 'stunted_growth', label: 'Zahamowany wzrost' },
  { id: 'brown_spots', label: 'Brazowe plamy na lisciach' },
  { id: 'leaf_drop', label: 'Masowe opadanie lisci' },
  { id: 'insufficient_light', label: 'Za slabe swiatlo' },
  { id: 'excessive_light', label: 'Za mocne swiatlo' },
  { id: 'long_photoperiod', label: 'Za dlugi czas swiecenia' },
  { id: 'short_photoperiod', label: 'Za krotki czas swiecenia' },
  { id: 'stem_rot', label: 'Gnicie lodyg / stozkow wzrostu' },
  { id: 'root_rot', label: 'Gnicie korzeni' },
  { id: 'rhizome_rot', label: 'Gnicie klacza' },
];

function normalizePlantDiseaseImageFileName(fileName) {
  return String(fileName ?? '')
    .trim()
    .replace(/\s+/g, '_');
}

function buildPlantDiseaseImageUrl(fileName, width = 720) {
  const rawValue = String(fileName ?? '').trim();
  if (!rawValue) {
    return '';
  }

  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue;
  }

  const normalizedFileName = normalizePlantDiseaseImageFileName(fileName);
  if (!normalizedFileName) {
    return '';
  }

  const encodedFileName = encodeURIComponent(normalizedFileName);
  const normalizedWidth = Number(width);
  const hasWidth = Number.isFinite(normalizedWidth) && normalizedWidth > 0;
  const widthQuery = hasWidth ? `?width=${Math.round(normalizedWidth)}` : '';

  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedFileName}${widthQuery}`;
}

function buildPlantDiseaseImageFallbackUrl(fileName) {
  return buildPlantDiseaseImageUrl(fileName);
}

const RAW_PLANT_DISEASE_CATALOG = [
  {
    id: 'potassium_deficiency',
    name: 'Niedobor potasu (K)',
    imageFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/Leaf_3_-_potassium_deficiency_-_ivory_480x480.jpg?v=1715985092',
    imageFallbackFileName:
      'https://cdn.shopify.com/s/files/1/0230/7266/9773/files/MagDef_36c55b2e-4559-4501-9625-3c1435a59fee_1024x1024.jpg?v=1612898767',
    imageSourceLabel: 'Aquarium Co-Op / 2Hr Aquarist',
    severity: 'medium',
    summary:
      'Typowo objawia sie dziurami i martwica starszych lisci przy spowolnionym wzroscie.',
    symptoms: ['holes_in_leaves', 'yellowing_old_leaves', 'stunted_growth'],
    suggestedRemedy: 'Easy-Life Kalium Potassium',
    treatment: [
      'Zwieksz podaz potasu stopniowo przez 2-3 tygodnie.',
      'Przyklad nawozow K: Aqua Art Potassium, Easy-Life Kalium Potassium lub Tropica Premium (dawkowanie wg etykiety).',
      'Usuń mocno uszkodzone liscie, aby roślina skupila sie na nowych przyrostach.',
      'Utrzymuj regularne podmiany 20-30% raz w tygodniu.',
      'Kontroluj rownowage NO3/PO4, aby rośliny mogly wykorzystac nawozenie.',
    ],
    caution:
      'Nie podnos dawek skokowo. Lepsza jest stabilna, umiarkowana korekta.',
  },
  {
    id: 'iron_deficiency',
    name: 'Niedobór żelaza (Fe)',
    imageFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/Leaf_2_-_iron_deficiency_-_ivory_480x480.jpg?v=1715985092',
    imageFallbackFileName:
      'https://cdn.shopify.com/s/files/1/0230/7266/9773/files/MagDef_36c55b2e-4559-4501-9625-3c1435a59fee_1024x1024.jpg?v=1612898767',
    imageSourceLabel: 'Aquarium Co-Op / 2Hr Aquarist',
    severity: 'medium',
    summary:
      'Najczesciej widoczne jest bledniecie mlodych lisci przy zachowaniu ciemniejszych nerwow.',
    symptoms: ['yellowing_new_leaves', 'transparent_leaves', 'stunted_growth'],
    suggestedRemedy: 'Seachem Flourish Iron',
    treatment: [
      'Włącz regularne mikroelementy z Fe w malych dawkach dziennych.',
      'Przyklad nawozow mikro/Fe: Seachem Flourish Iron, Aqua Art Ferro+ lub Tropica Specialized (wg etykiety).',
      'Skroc czas swiecenia lampy do 6-8h na czas stabilizacji wzrostu.',
      'Sprawdz cyrkulacje, aby nawozy docieraly do calego zbiornika.',
      'Monitoruj Fe i reakcje nowych lisci przez 10-14 dni.',
    ],
    caution:
      'Nadmiar mikroelementow moze nasilic glony, dlatego dawkuj ostroznie.',
  },
  {
    id: 'calcium_magnesium_deficiency',
    name: 'Niedobor wapnia/magnezu (Ca/Mg)',
    imageFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/Leaf_6_-_calcium_deficiency_-_ivory_480x480.jpg?v=1715985092',
    imageFallbackFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/Leaf_5_-_magnesium_deficiency_-_ivory_480x480.jpg?v=1715985092',
    imageSourceLabel: 'Aquarium Co-Op',
    severity: 'medium',
    summary:
      'Czesto powoduje deformacje nowych lisci, kruche tkanki i slaby wzrost.',
    symptoms: ['twisted_new_growth', 'yellowing_new_leaves', 'stunted_growth'],
    suggestedRemedy: 'Seachem Equilibrium',
    treatment: [
      'Skoryguj GH do stabilnego poziomu odpowiedniego dla obsady i roślin.',
      'Przyklad preparatow Ca/Mg: Equilibrium (Seachem), SaltyShrimp GH+ lub Aqua Art GH Mineral (wg etykiety).',
      'Wprowadz suplementacje Ca/Mg stopniowo przez kilka podmian.',
      'Unikaj naglych zmian mineralizacji przy kolejnych podmianach.',
    ],
    caution:
      'Nagla zmiana GH moze stresowac ryby i krewetki. Podnos parametry stopniowo.',
  },
  {
    id: 'co2_instability',
    name: 'Niestabilne CO2 / wahania pH',
    imageFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/hair_algae_2.jpg?v=1579126462',
    imageFallbackFileName:
      'https://cdn.shopify.com/s/files/1/0230/7266/9773/files/2hrAquaristDSCF9712V2_1024x1024.jpg?v=1610996901',
    imageSourceLabel: 'Aquarium Co-Op / 2Hr Aquarist',
    severity: 'high',
    summary:
      'Wahania CO2 i pH moga prowadzic do czernienia lisci, zahamowania wzrostu i glonów.',
    symptoms: ['black_leaf_edges', 'stunted_growth', 'leaf_drop'],
    suggestedRemedy: 'Easy-Life EasyCarbo (wsparcie)',
    treatment: [
      'Ustabilizuj dozowanie CO2 i czas włączania przed światłem.',
      'Pomocniczo mozesz rozwazyc plynny wegiel (np. Easy-Life EasyCarbo lub Seachem Flourish Excel) jako wsparcie, nie zamiennik stabilnego CO2.',
      'Utrzymuj KH na poziomie stabilizujacym pH (zwykle > 4).',
      'Ogranicz zmiany oswietlenia do maksymalnie jednego parametru na tydzien.',
      'Wykonaj test pH i KH po podmianie oraz kolejnego dnia.',
    ],
    caution:
      'Przy niestabilnym CO2 nie zwiekszaj mocy światła. To zwykle pogarsza sytuacje.',
  },
  {
    id: 'transplant_melt',
    name: 'Szok po posadzeniu (melt)',
    imageFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/Melting_crypt.jpg?v=1603476642',
    imageFallbackFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/Java_fern_growing_a_new_baby_plant_the_mother_leaf_will_eventually_die_off.jpg?v=1710280960',
    imageSourceLabel: 'Aquarium Co-Op',
    severity: 'low',
    summary:
      'Po zmianie warunkow rośliny moga tracic stare liscie zanim wypuszcza przyrost podwodny.',
    symptoms: ['melt_after_planting', 'transparent_leaves', 'leaf_drop'],
    suggestedRemedy: 'Tropica Specialized',
    treatment: [
      'Usuń tylko obumierajace liscie i pozostaw zdrowe korzenie.',
      'Po restarcie wzrostu podawaj lagodne mikro/makro: np. Tropica Premium/Specialized albo Aqua Art Planta Gainer (wg etykiety).',
      'Nie przesadzaj ponownie przez minimum 2 tygodnie.',
      'Utrzymuj staly czas swiecenia lampy i spokojny serwis akwarium.',
      'Dodaj lagodne nawozenie i obserwuj nowe przyrosty.',
    ],
    caution:
      'To czesto stan przejsciowy. Kluczowa jest cierpliwosc i stabilnosc zbiornika.',
  },
  {
    id: 'phosphate_deficiency',
    name: 'Niedobor fosforu (PO4)',
    imageFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/Leaf_4_-_phosphate_deficiency_-_ivory_480x480.jpg?v=1715985092',
    imageFallbackFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/Leaf_3_-_potassium_deficiency_-_ivory_480x480.jpg?v=1715985092',
    imageSourceLabel: 'Aquarium Co-Op',
    severity: 'medium',
    summary:
      'Moze powodowac ciemnienie i punktowe uszkodzenia lisci oraz wolniejszy wzrost.',
    symptoms: ['brown_spots', 'black_leaf_edges', 'stunted_growth'],
    suggestedRemedy: 'Seachem Phosphorus',
    treatment: [
      'Stopniowo podnies PO4 do stabilnego poziomu roboczego.',
      'Przyklad nawozow PO4: Seachem Phosphorus, Aqua Art Fosfo lub Easy-Life Fosfo (wg etykiety).',
      'Zwieksz mase roślinna i regularnosc podmian.',
      'Pilnuj stalego karmienia bez przekarmiania i skokow obciazenia biologicznego.',
    ],
    caution:
      'Nie koryguj PO4 jednorazowo duza dawka. Dzialaj etapami i monitoruj trend.',
  },
  {
    id: 'nitrogen_deficiency',
    name: 'Niedobor azotu (N / NO3)',
    imageFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/Leaf_1_-_nitrogen_deficiency_-_ivory_480x480.jpg?v=1715985092',
    imageFallbackFileName:
      'https://cdn.shopify.com/s/files/1/0311/3149/files/Leaf_2_-_iron_deficiency_-_ivory_480x480.jpg?v=1715985092',
    imageSourceLabel: 'Aquarium Co-Op',
    severity: 'medium',
    summary:
      'Najczesciej zaczyna sie od zolkniecia starszych lisci, spowolnienia wzrostu i oslabienia roślin.',
    symptoms: ['yellowing_old_leaves', 'stunted_growth', 'leaf_drop'],
    suggestedRemedy: 'Aqua Art Nito',
    treatment: [
      'Podnies NO3 stopniowo do stabilnego poziomu roboczego.',
      'Przyklad nawozow N: Aqua Art Nito, Seachem Nitrogen lub Tropica Specialized (wg etykiety).',
      'Rozbij dawke tygodniowa na mniejsze porcje, aby uniknac skokow.',
      'Obserwuj nowe przyrosty przez 7-14 dni i koryguj dawke lagodnie.',
      'Utrzymuj regularne podmiany i stabilne karmienie bez duzych wahan.',
    ],
    caution:
      'Zbyt szybkie podbicie NO3 moze nasilic glony. Korekty wprowadzaj etapami.',
  },
];

function normalizePlantProblemKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function buildPlantProblemId(name) {
  const slug = normalizePlantProblemKey(name)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `plant_issue_${slug || 'unknown'}`;
}

function inferPlantProblemSeverity(name) {
  const key = normalizePlantProblemKey(name);

  if (
    key.includes('gnicie') ||
    key.includes('toksyczn') ||
    key.includes('nadmiar nawozenia') ||
    key.includes('co2') ||
    key.includes('martwe strefy')
  ) {
    return 'high';
  }

  if (
    key.includes('niedobor') ||
    key.includes('blokada') ||
    key.includes('za slabe') ||
    key.includes('za mocne') ||
    key.includes('zbyt niskie') ||
    key.includes('zbyt wysokie')
  ) {
    return 'medium';
  }

  return 'low';
}

function inferPlantProblemSymptoms(name) {
  const key = normalizePlantProblemKey(name);
  const symptoms = new Set();

  const pushSymptoms = (...ids) => {
    ids.forEach((id) => symptoms.add(id));
  };

  if (key.includes('niedobor azotu') || key.includes('brak makroelementow')) {
    pushSymptoms('yellowing_old_leaves', 'stunted_growth', 'leaf_drop');
  }
  if (key.includes('niedobor fosforu')) {
    pushSymptoms('brown_spots', 'black_leaf_edges', 'stunted_growth');
  }
  if (key.includes('niedobor potasu')) {
    pushSymptoms('holes_in_leaves', 'yellowing_old_leaves', 'black_leaf_edges');
  }
  if (key.includes('niedobor zelaza') || key.includes('niedobor mikroelementow')) {
    pushSymptoms('yellowing_new_leaves', 'transparent_leaves', 'stunted_growth');
  }
  if (key.includes('niedobor magnezu')) {
    pushSymptoms('yellowing_old_leaves', 'brown_spots', 'stunted_growth');
  }
  if (key.includes('niedobor wapnia')) {
    pushSymptoms('twisted_new_growth', 'yellowing_new_leaves', 'transparent_leaves');
  }
  if (
    key.includes('niedobor co2') ||
    key.includes('niestabilne co2') ||
    key.includes('blokada wapnia i magnezu')
  ) {
    pushSymptoms('stunted_growth', 'black_leaf_edges', 'leaf_drop');
  }

  if (key.includes('za slabe swiatlo')) {
    pushSymptoms('insufficient_light', 'stunted_growth', 'yellowing_old_leaves');
  }
  if (key.includes('za mocne swiatlo')) {
    pushSymptoms('excessive_light', 'brown_spots', 'black_leaf_edges');
  }
  if (key.includes('za dlugi czas swiecenia')) {
    pushSymptoms('long_photoperiod', 'brown_spots', 'black_leaf_edges');
  }
  if (key.includes('za krotki czas swiecenia')) {
    pushSymptoms('short_photoperiod', 'stunted_growth', 'yellowing_old_leaves');
  }
  if (key.includes('rosliny zacienione')) {
    pushSymptoms('insufficient_light', 'yellowing_old_leaves', 'leaf_drop');
  }

  if (
    key.includes('melting') ||
    key.includes('rozpad') ||
    key.includes('adaptacj') ||
    key.includes('kryptokoryn')
  ) {
    pushSymptoms('melt_after_planting', 'transparent_leaves', 'leaf_drop');
  }
  if (key.includes('dziury')) {
    pushSymptoms('holes_in_leaves', 'yellowing_old_leaves', 'stunted_growth');
  }
  if (key.includes('starszych')) {
    pushSymptoms('yellowing_old_leaves', 'stunted_growth', 'leaf_drop');
  }
  if (key.includes('mlodych')) {
    pushSymptoms('yellowing_new_leaves', 'twisted_new_growth', 'stunted_growth');
  }
  if (key.includes('brazowienie')) {
    pushSymptoms('brown_spots', 'black_leaf_edges', 'leaf_drop');
  }
  if (key.includes('czarne koncowki')) {
    pushSymptoms('black_leaf_edges', 'brown_spots', 'stunted_growth');
  }
  if (key.includes('deformacje')) {
    pushSymptoms('twisted_new_growth', 'yellowing_new_leaves', 'stunted_growth');
  }
  if (key.includes('przezroczyste')) {
    pushSymptoms('transparent_leaves', 'stunted_growth', 'leaf_drop');
  }
  if (key.includes('zahamowanie')) {
    pushSymptoms('stunted_growth', 'yellowing_old_leaves', 'leaf_drop');
  }
  if (key.includes('dolne liscie')) {
    pushSymptoms('leaf_drop', 'yellowing_old_leaves', 'stunted_growth');
  }

  if (key.includes('gnicie lodyg') || key.includes('gnicie stozkow')) {
    pushSymptoms('stem_rot', 'leaf_drop', 'stunted_growth');
  }
  if (key.includes('gnicie korzeni') || key.includes('wyplywa z podloza')) {
    pushSymptoms('root_rot', 'leaf_drop', 'stunted_growth');
  }
  if (key.includes('gnicie klacza') || key.includes('zasypywanie klacza')) {
    pushSymptoms('rhizome_rot', 'melt_after_planting', 'leaf_drop');
  }
  if (key.includes('zbyt glebokie sadzenie')) {
    pushSymptoms('stem_rot', 'melt_after_planting', 'leaf_drop');
  }

  if (key.includes('zbyt jalowe podloze') || key.includes('wyczerpane podloze aktywne')) {
    pushSymptoms('stunted_growth', 'yellowing_old_leaves', 'leaf_drop');
  }
  if (key.includes('niedobor przeplywu') || key.includes('martwe strefy')) {
    pushSymptoms('stem_rot', 'brown_spots', 'stunted_growth');
  }
  if (key.includes('zbyt silny przeplyw')) {
    pushSymptoms('transparent_leaves', 'leaf_drop', 'stunted_growth');
  }
  if (key.includes('uszkodzenia przez ryby') || key.includes('uszkodzenia przez slimaki')) {
    pushSymptoms('holes_in_leaves', 'brown_spots', 'leaf_drop');
  }
  if (key.includes('uszkodzenia po preparatach typu carbo')) {
    pushSymptoms('transparent_leaves', 'black_leaf_edges', 'leaf_drop');
  }
  if (key.includes('toksycznosc mikroelementow') || key.includes('nadmiar nawozenia')) {
    pushSymptoms('twisted_new_growth', 'black_leaf_edges', 'leaf_drop');
  }
  if (key.includes('nadmiar zelaza') || key.includes('nadmiar potasu')) {
    pushSymptoms('brown_spots', 'twisted_new_growth', 'stunted_growth');
  }
  if (key.includes('brak mikroelementow')) {
    pushSymptoms('yellowing_new_leaves', 'twisted_new_growth', 'stunted_growth');
  }
  if (key.includes('zbyt niskie gh') || key.includes('zbyt wysokie gh') || key.includes('zbyt niskie kh')) {
    pushSymptoms('twisted_new_growth', 'transparent_leaves', 'stunted_growth');
  }
  if (key.includes('nieprawidlowe przycinanie')) {
    pushSymptoms('stem_rot', 'twisted_new_growth', 'stunted_growth');
  }

  if (symptoms.size === 0) {
    pushSymptoms('stunted_growth', 'yellowing_old_leaves', 'leaf_drop');
  }

  if (symptoms.size < 3) {
    pushSymptoms('stunted_growth', 'yellowing_old_leaves', 'leaf_drop');
  }

  return [...symptoms];
}

function inferPlantProblemSuggestedRemedy(name) {
  const key = normalizePlantProblemKey(name);

  if (key.includes('niedobor')) {
    return 'Korekta nawozenia i regularne podmiany';
  }
  if (key.includes('nadmiar') || key.includes('toksyczn')) {
    return 'Podmiana, redukcja dawek i obserwacja';
  }
  if (key.includes('co2')) {
    return 'Stabilizacja CO2 i napowietrzania';
  }
  if (key.includes('swiatlo') || key.includes('swiecenia')) {
    return 'Korekta oswietlenia i fotoperiodu';
  }
  if (key.includes('gnicie')) {
    return 'Usuniecie porazonych czesci i stabilizacja warunkow';
  }

  return 'Stabilizacja parametrow i obserwacja 7-14 dni';
}

function buildGenericPlantProblemEntry(name) {
  const normalizedName = String(name ?? '').trim();
  const severity = inferPlantProblemSeverity(normalizedName);
  const symptoms = inferPlantProblemSymptoms(normalizedName);
  const suggestedRemedy = inferPlantProblemSuggestedRemedy(normalizedName);

  return {
    id: buildPlantProblemId(normalizedName),
    name: normalizedName,
    imageFileName: '',
    imageFallbackFileName: '',
    imageSourceLabel: '',
    severity,
    summary:
      'Problem roslinny wymagajacy stabilizacji parametrow, higieny zbiornika oraz dopasowania nawozenia i oswietlenia.',
    symptoms,
    suggestedRemedy,
    treatment: [
      'Zweryfikuj podstawowe parametry wody (pH, GH, KH, NO3, PO4) i stabilnosc temperatury.',
      'Wykonaj bezpieczna podmiane oraz usuĹ„ najmocniej uszkodzone tkanki roslin.',
      'Koryguj tylko jeden glowny czynnik na raz i obserwuj reakcje roslin przez 7-14 dni.',
      'Dopasuj oswietlenie, nawozenie i przeplyw do aktualnej masy roslinnej.',
    ],
    caution:
      'Unikaj gwałtownych zmian kilku parametrow jednoczesnie. Stabilnosc jest kluczowa.',
  };
}

const ADDITIONAL_PLANT_PROBLEM_NAMES = [
  'Niedobor azotu',
  'Niedobor fosforu',
  'Niedobor potasu',
  'Niedobor zelaza',
  'Niedobor CO2',
  'Za slabe swiatlo',
  'Za mocne swiatlo',
  'Za dlugi czas swiecenia',
  'Rozpad po posadzeniu / melting',
  'Rozpad kryptokoryn',
  'Zolkniecie starszych lisci',
  'Zolkniecie mlodych lisci',
  'Dziury w lisciach',
  'Niedobor magnezu',
  'Niedobor wapnia',
  'Niedobor mikroelementow',
  'Niestabilne CO2',
  'Za krotki czas swiecenia',
  'Brazowienie lisci',
  'Czarne koncowki lisci',
  'Deformacje nowych lisci',
  'Gnicie lodyg',
  'Gnicie stozkow wzrostu',
  'Roslina wyplywa z podloza',
  'Roslina traci dolne liscie',
  'Uszkodzenia po preparatach typu carbo',
  'Zbyt jalowe podloze',
  'Wyczerpane podloze aktywne',
  'Zasypywanie klacza',
  'Przezroczyste liscie',
  'Zahamowanie wzrostu',
  'Gnicie korzeni',
  'Uszkodzenia przez ryby',
  'Uszkodzenia przez slimaki',
  'Toksycznosc mikroelementow',
  'Nadmiar zelaza',
  'Nadmiar potasu',
  'Nadmiar nawozenia',
  'Brak makroelementow',
  'Brak mikroelementow',
  'Blokada wapnia i magnezu',
  'Zbyt niskie GH',
  'Zbyt wysokie GH',
  'Zbyt niskie KH',
  'Problem z adaptacja roslin in-vitro',
  'Problem z adaptacja roslin emersyjnych',
  'Niedobor przeplywu',
  'Zbyt silny przeplyw',
  'Martwe strefy w akwarium',
  'Gnicie klacza anubiasa',
  'Gnicie klacza microsorum',
  'Zbyt glebokie sadzenie roslin lodygowych',
  'Nieprawidlowe przycinanie',
  'Rosliny zacienione przez inne rosliny',
];

const NORMALIZED_RAW_PLANT_PROBLEM_NAMES = new Set(
  RAW_PLANT_DISEASE_CATALOG.map((item) => normalizePlantProblemKey(item?.name))
);

const AUTO_GENERATED_PLANT_PROBLEM_ENTRIES = ADDITIONAL_PLANT_PROBLEM_NAMES
  .map((name) => String(name ?? '').trim())
  .filter(Boolean)
  .filter((name) => !NORMALIZED_RAW_PLANT_PROBLEM_NAMES.has(normalizePlantProblemKey(name)))
  .map((name) => buildGenericPlantProblemEntry(name));

const MERGED_PLANT_DISEASE_CATALOG = [
  ...RAW_PLANT_DISEASE_CATALOG,
  ...AUTO_GENERATED_PLANT_PROBLEM_ENTRIES,
];

export const PLANT_DISEASE_CATALOG = MERGED_PLANT_DISEASE_CATALOG.map((item) => {
  const allowedSymptoms = new Set(PLANT_DISEASE_SYMPTOMS.map((entry) => entry.id));
  const defaultSymptoms = ['stunted_growth', 'yellowing_old_leaves', 'leaf_drop'];
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
    imageUrl: buildPlantDiseaseImageUrl(imageFileName, 900),
    imagePreviewUrl: buildPlantDiseaseImageUrl(imageFileName, 420),
    imageFallbackUrl: buildPlantDiseaseImageFallbackUrl(
      imageFallbackFileName || imageFileName
    ),
    imageFallbackPreviewUrl: buildPlantDiseaseImageFallbackUrl(
      imageFallbackFileName || imageFileName
    ),
  };
});
