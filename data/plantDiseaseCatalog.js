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
      'Usun mocno uszkodzone liscie, aby roslina skupila sie na nowych przyrostach.',
      'Utrzymuj regularne podmiany 20-30% raz w tygodniu.',
      'Kontroluj rownowage NO3/PO4, aby rosliny mogly wykorzystac nawozenie.',
    ],
    caution:
      'Nie podnos dawek skokowo. Lepsza jest stabilna, umiarkowana korekta.',
  },
  {
    id: 'iron_deficiency',
    name: 'Niedobor zelaza (Fe)',
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
      'Wlacz regularne mikroelementy z Fe w malych dawkach dziennych.',
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
      'Skoryguj GH do stabilnego poziomu odpowiedniego dla obsady i roslin.',
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
      'Wahania CO2 i pH moga prowadzic do czernienia lisci, zahamowania wzrostu i glonow.',
    symptoms: ['black_leaf_edges', 'stunted_growth', 'leaf_drop'],
    suggestedRemedy: 'Easy-Life EasyCarbo (wsparcie)',
    treatment: [
      'Ustabilizuj dozowanie CO2 i czas wlaczania przed swiatlem.',
      'Pomocniczo mozesz rozwazyc plynny wegiel (np. Easy-Life EasyCarbo lub Seachem Flourish Excel) jako wsparcie, nie zamiennik stabilnego CO2.',
      'Utrzymuj KH na poziomie stabilizujacym pH (zwykle > 4).',
      'Ogranicz zmiany oswietlenia do maksymalnie jednego parametru na tydzien.',
      'Wykonaj test pH i KH po podmianie oraz kolejnego dnia.',
    ],
    caution:
      'Przy niestabilnym CO2 nie zwiekszaj mocy swiatla. To zwykle pogarsza sytuacje.',
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
      'Po zmianie warunkow rosliny moga tracic stare liscie zanim wypuszcza przyrost podwodny.',
    symptoms: ['melt_after_planting', 'transparent_leaves', 'leaf_drop'],
    suggestedRemedy: 'Tropica Specialized',
    treatment: [
      'Usun tylko obumierajace liscie i pozostaw zdrowe korzenie.',
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
      'Zwieksz mase roslinna i regularnosc podmian.',
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
      'Najczesciej zaczyna sie od zolkniecia starszych lisci, spowolnienia wzrostu i oslabienia roslin.',
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

export const PLANT_DISEASE_CATALOG = RAW_PLANT_DISEASE_CATALOG.map((item) => {
  const imageFileName = String(item.imageFileName ?? '').trim();
  const imageFallbackFileName = String(item.imageFallbackFileName ?? '').trim();

  return {
    ...item,
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
