const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateStockingCompatibilityModel } = require('../features/aquarium/services/stockingCompatibilityService.js');

function buildSpecies(overrides = {}) {
  return {
    speciesId: overrides.speciesId ?? 'species-1',
    commonName: overrides.commonName ?? 'Gatunek',
    scientificName: overrides.scientificName ?? 'Specius example',
    quantity: overrides.quantity ?? 6,
    kind: overrides.kind ?? 'fish',
    profile: {
      minTankVolumeLiters: overrides.minTankVolumeLiters ?? 60,
      minTankLengthCm: overrides.minTankLengthCm ?? 60,
      temperatureMinC: overrides.temperatureMinC ?? 24,
      temperatureMaxC: overrides.temperatureMaxC ?? 27,
      phMin: overrides.phMin ?? 6.5,
      phMax: overrides.phMax ?? 7.4,
      ghMin: overrides.ghMin ?? 5,
      ghMax: overrides.ghMax ?? 12,
      khMin: overrides.khMin ?? null,
      khMax: overrides.khMax ?? null,
      adultSizeCm: overrides.adultSizeCm ?? 5,
      temperament: overrides.temperament ?? 'peaceful',
      socialType: overrides.socialType ?? 'school',
      minGroupSize: overrides.minGroupSize ?? 6,
      recommendedGroupSize: overrides.recommendedGroupSize ?? 10,
      swimmingZone: overrides.swimmingZone ?? 'middle',
      mayEatSmallFish: overrides.mayEatSmallFish ?? false,
      mayEatShrimp: overrides.mayEatShrimp ?? false,
      mayNibbleFins: overrides.mayNibbleFins ?? false,
      longFinRisk: overrides.longFinRisk ?? false,
      waterPreference: overrides.waterPreference ?? 'neutral',
      biotopeTags: overrides.biotopeTags ?? [],
    },
  };
}

function buildAquarium(overrides = {}) {
  return {
    volumeLiters: overrides.volumeLiters ?? 100,
    lengthCm: overrides.lengthCm ?? 80,
    temperatureC: overrides.temperatureC ?? 25,
    ph: overrides.ph ?? 7,
    gh: overrides.gh ?? 8,
    kh: overrides.kh ?? 6,
    aquariumType: overrides.aquariumType ?? 'general',
    hasPlants: overrides.hasPlants ?? true,
    hasHidingPlaces: overrides.hasHidingPlaces ?? true,
  };
}

test('returns incompatible when pH ranges do not overlap', () => {
  const speciesA = buildSpecies({ speciesId: 'a', phMin: 6.0, phMax: 7.0 });
  const speciesB = buildSpecies({ speciesId: 'b', phMin: 7.6, phMax: 8.4 });
  const result = evaluateStockingCompatibilityModel(buildAquarium(), [speciesA, speciesB]);

  assert.equal(result.overallStatus, 'incompatible');
  assert.ok(result.issues.some((issue) => issue.type === 'water_parameters' && issue.severity === 'error'));
});

test('flags predation risk for predator and much smaller fish', () => {
  const predator = buildSpecies({
    speciesId: 'predator',
    commonName: 'Drapieznik',
    adultSizeCm: 20,
    mayEatSmallFish: true,
    temperament: 'predatory',
    socialType: 'solitary',
    quantity: 1,
    minGroupSize: 1,
    recommendedGroupSize: 1,
  });
  const smallFish = buildSpecies({
    speciesId: 'small',
    commonName: 'Mala ryba',
    adultSizeCm: 4,
    quantity: 8,
  });
  const result = evaluateStockingCompatibilityModel(buildAquarium({ volumeLiters: 200 }), [predator, smallFish]);

  assert.equal(result.overallStatus, 'incompatible');
  assert.ok(result.issues.some((issue) => issue.type === 'predation' && issue.severity === 'error'));
});

test('adds schooling issue when group is too small', () => {
  const schoolingFish = buildSpecies({
    speciesId: 'school',
    quantity: 3,
    minGroupSize: 6,
    recommendedGroupSize: 10,
    socialType: 'school',
  });
  const result = evaluateStockingCompatibilityModel(buildAquarium(), [schoolingFish]);

  assert.ok(result.issues.some((issue) => issue.type === 'schooling'));
});

test('returns compatible for aligned species and tank', () => {
  const speciesA = buildSpecies({ speciesId: 'a', commonName: 'Neon', phMin: 6.2, phMax: 7.2 });
  const speciesB = buildSpecies({
    speciesId: 'b',
    commonName: 'Kirysek',
    phMin: 6.4,
    phMax: 7.4,
    swimmingZone: 'bottom',
    minGroupSize: 6,
    recommendedGroupSize: 8,
    quantity: 8,
  });
  const result = evaluateStockingCompatibilityModel(buildAquarium({ volumeLiters: 120, lengthCm: 90 }), [speciesA, speciesB]);

  assert.equal(result.overallStatus, 'compatible');
  assert.ok(result.score >= 80);
});
