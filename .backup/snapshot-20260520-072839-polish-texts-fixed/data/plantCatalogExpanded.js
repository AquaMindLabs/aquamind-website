const DEFAULT_PROFILE = Object.freeze({
  phMin: 6.0,
  phMax: 7.8,
  ghMin: 3,
  ghMax: 16,
  tempMin: 22,
  tempMax: 28,
  minLiters: 40,
  notes:
    "Profil orientacyjny. Zweryfikuj wymagania rośliny dla konkretnego zbiornika.",
});

function buildPlantEntry(name, overrides = {}) {
  const label = String(name ?? '').trim();
  return {
    commonName: label,
    latinName: label,
    ...DEFAULT_PROFILE,
    ...overrides,
  };
}

const RAW_PLANT_NAMES = [
  'Anubias barteri',
  'Anubias barteri nana',
  'Anubias nana petite',
  'Microsorum pteropus',
  'Taxiphyllum barbieri',
  'Vesicularia montagnei',
  'Cryptocoryne wendtii',
  'Cryptocoryne parva',
  'Echinodorus bleheri',
  'Echinodorus amazonicus',
  'Vallisneria spiralis',
  'Vallisneria americana',
  'Vallisneria nana',
  'Hygrophila polysperma',
  'Hygrophila corymbosa',
  'Hygrophila difformis',
  'Limnophila sessiliflora',
  'Bacopa caroliniana',
  'Bacopa monnieri',
  'Rotala rotundifolia',
  'Ludwigia repens',
  'Ceratophyllum demersum',
  'Egeria densa',
  'Elodea canadensis',
  'Cabomba caroliniana',
  'Staurogyne repens',
  'Sagittaria subulata',
  'Pistia stratiotes',
  'Salvinia natans',
  'Limnobium laevigatum',
  'Riccia fluitans',
  'Microsorum pteropus trident',
  'Microsorum pteropus narrow',
  'Bucephalandra',
  'Bolbitis heudelotii',
  'Christmas moss',
  'Flame moss',
  'Weeping moss',
  'Cryptocoryne beckettii',
  'Cryptocoryne balansae',
  'Echinodorus ozelot',
  'Rotala indica',
  'Ludwigia palustris',
  'Ludwigia super red',
  'Myriophyllum mattogrossense',
  'Pogostemon helferi',
  'Micranthemum tweediei Monte Carlo',
  'Eleocharis parvula',
  'Eleocharis acicularis',
  'Lilaeopsis brasiliensis',
  'Hydrocotyle tripartita',
  'Hydrocotyle leucocephala',
  'Najas guadalupensis',
  'Ceratopteris thalictroides',
  'Ceratopteris cornuta',
  'Nymphaea lotus',
  'Nymphaea rubra',
  'Hemianthus callitrichoides Cuba',
  'Alternanthera reineckii',
  'Alternanthera reineckii mini',
  'Rotala wallichii',
  'Rotala macrandra',
  'Rotala green',
  "Rotala H'ra",
  'Rotala bonsai',
  'Ludwigia inclinata',
  'Ludwigia arcuata',
  'Ludwigia glandulosa',
  'Heteranthera zosterifolia',
  'Proserpinaca palustris',
  'Didiplis diandra',
  'Ammania gracilis',
  'Nesaea crassicaulis',
  'Tonina fluviatilis',
  'Syngonanthus macrocaulon',
  'Eriocaulon cinereum',
  'Pogostemon erectus',
  'Pogostemon stellatus',
  'Pogostemon octopus',
  'Hygrophila pinnatifida',
  'Marsilea hirsuta',
  'Marsilea crenata',
  'Glossostigma elatinoides',
  'Utricularia graminifolia',
  'Ranunculus inundatus',
  'Crinum calamistratum',
  'Aponogeton crispus',
  'Aponogeton boivinianus',
  'Samolus valerandi',
  'Lobelia cardinalis mini',
  'Hottonia palustris',
  'Mayaca fluviatilis',
];

function dedupeNames(names) {
  const seen = new Set();
  const output = [];
  names.forEach((raw) => {
    const normalized = String(raw ?? '').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    output.push(String(raw).trim());
  });
  return output;
}

export const PLANT_CATALOG_EXPANDED = dedupeNames(RAW_PLANT_NAMES).map((name) =>
  buildPlantEntry(name)
);
