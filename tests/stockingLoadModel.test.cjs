const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateUniversalStockingLoad,
} = require('../features/aquarium/services/stockingLoadModelService.js');

function buildTank(overrides = {}) {
  return {
    volumeLiters: overrides.volumeLiters ?? 100,
    lengthCm: overrides.lengthCm ?? 80,
    widthCm: overrides.widthCm ?? 35,
    heightCm: overrides.heightCm ?? 40,
    filtrationLevel: overrides.filtrationLevel ?? 'standard',
    plantDensity: overrides.plantDensity ?? 'low',
    waterChangeFrequency: overrides.waterChangeFrequency ?? 'standard',
    openSwimmingSpace: overrides.openSwimmingSpace ?? 'medium',
  };
}

function buildSpecies(overrides = {}) {
  return {
    commonName: overrides.commonName ?? 'Gatunek testowy',
    quantity: overrides.quantity ?? 10,
    profile: {
      adultSizeCm: overrides.adultSizeCm ?? 5,
      bodyMassType: overrides.bodyMassType ?? 'normal',
      wasteProduction: overrides.wasteProduction ?? 3,
      activityLevel: overrides.activityLevel ?? 3,
      aggressionLevel: overrides.aggressionLevel ?? 1,
      territoriality: overrides.territoriality ?? 1,
      minGroupSize: overrides.minGroupSize ?? 1,
      recommendedGroupSize: overrides.recommendedGroupSize ?? 1,
      isSchoolingFish: overrides.isSchoolingFish ?? false,
      swimmingZone: overrides.swimmingZone ?? 'middle',
      requiredTankLengthCm: overrides.requiredTankLengthCm ?? 60,
      sensitiveToWaterQuality: overrides.sensitiveToWaterQuality ?? false,
      bioloadModifier: overrides.bioloadModifier ?? 1,
      spaceModifier: overrides.spaceModifier ?? 1,
      behaviourModifier: overrides.behaviourModifier ?? 1,
    },
  };
}

test('empty stocking returns safe result and zero scores', () => {
  const result = evaluateUniversalStockingLoad(buildTank(), []);

  assert.equal(result.finalStatus.status, 'safe');
  assert.equal(result.finalStockingScore, 0);
  assert.equal(result.scores.bioloadScore, 0);
  assert.equal(result.scores.spaceScore, 0);
  assert.equal(result.scores.behaviourScore, 0);
});

test('single small schooling group stays in safe/good range', () => {
  const result = evaluateUniversalStockingLoad(
    buildTank({ volumeLiters: 120, lengthCm: 100, widthCm: 40 }),
    [
      buildSpecies({
        commonName: 'Neon Innesa',
        quantity: 12,
        adultSizeCm: 4,
        bodyMassType: 'slender',
        wasteProduction: 1,
        activityLevel: 3,
        isSchoolingFish: true,
        minGroupSize: 8,
        recommendedGroupSize: 12,
        swimmingZone: 'middle',
        requiredTankLengthCm: 80,
      }),
    ]
  );

  assert.ok(result.finalStockingScore <= 80);
  assert.ok(['safe', 'good'].includes(result.finalStatus.status));
});

test('danio striped control scenario 40/50/60/70 in 300L', () => {
  const tank = buildTank({
    volumeLiters: 300,
    lengthCm: 120,
    widthCm: 50,
    filtrationLevel: 'standard',
    plantDensity: 'medium',
    waterChangeFrequency: 'standard',
  });
  const danioProfile = {
    commonName: 'Danio pręgowane',
    adultSizeCm: 5,
    bodyMassType: 'slender',
    wasteProduction: 1,
    activityLevel: 5,
    aggressionLevel: 1,
    territoriality: 1,
    minGroupSize: 8,
    recommendedGroupSize: 12,
    isSchoolingFish: true,
    swimmingZone: 'top',
    requiredTankLengthCm: 80,
    sensitiveToWaterQuality: false,
  };

  const result40 = evaluateUniversalStockingLoad(tank, [
    buildSpecies({ ...danioProfile, quantity: 40 }),
  ]);
  const result50 = evaluateUniversalStockingLoad(tank, [
    buildSpecies({ ...danioProfile, quantity: 50 }),
  ]);
  const result60 = evaluateUniversalStockingLoad(tank, [
    buildSpecies({ ...danioProfile, quantity: 60 }),
  ]);
  const result70 = evaluateUniversalStockingLoad(tank, [
    buildSpecies({ ...danioProfile, quantity: 70 }),
  ]);

  assert.equal(result40.finalStatus.status, 'good');
  assert.equal(result50.finalStatus.status, 'high');
  assert.equal(result60.finalStatus.status, 'borderline');
  assert.ok(
    ['overstocked', 'heavily_overstocked', 'borderline'].includes(
      result70.finalStatus.status
    )
  );
  assert.ok(result70.finalStockingScore > result60.finalStockingScore);
});

test('heavy waste fish (goldfish-like) drives bioload quickly', () => {
  const result = evaluateUniversalStockingLoad(
    buildTank({ volumeLiters: 120, lengthCm: 80, widthCm: 35 }),
    [
      buildSpecies({
        commonName: 'Welon',
        quantity: 6,
        adultSizeCm: 12,
        bodyMassType: 'heavy_body',
        wasteProduction: 5,
        activityLevel: 2,
        aggressionLevel: 1,
        territoriality: 1,
        requiredTankLengthCm: 100,
      }),
    ]
  );

  assert.ok(result.scores.bioloadScore > 110);
  assert.ok(['overstocked', 'heavily_overstocked'].includes(result.finalStatus.status));
});

test('bottom zone crowding increases behaviour score', () => {
  const result = evaluateUniversalStockingLoad(
    buildTank({ volumeLiters: 90, lengthCm: 60, widthCm: 30 }),
    [
      buildSpecies({
        commonName: 'Kirys',
        quantity: 18,
        adultSizeCm: 6,
        bodyMassType: 'normal',
        wasteProduction: 2,
        activityLevel: 3,
        aggressionLevel: 1,
        territoriality: 1,
        swimmingZone: 'bottom',
        isSchoolingFish: true,
        minGroupSize: 6,
        recommendedGroupSize: 8,
      }),
    ]
  );

  assert.ok(result.scores.zoneCrowdingScore > 100);
  assert.ok(result.scores.behaviourScore >= result.scores.zoneCrowdingScore);
});

test('territorial species triggers territorial behaviour penalty', () => {
  const result = evaluateUniversalStockingLoad(
    buildTank({ volumeLiters: 150, lengthCm: 90, widthCm: 40 }),
    [
      buildSpecies({
        commonName: 'Pielęgnica terytorialna',
        quantity: 6,
        adultSizeCm: 10,
        bodyMassType: 'deep_body',
        wasteProduction: 3,
        activityLevel: 3,
        aggressionLevel: 4,
        territoriality: 5,
        requiredTankLengthCm: 120,
        swimmingZone: 'middle',
      }),
    ]
  );

  assert.ok(result.breakdown.rawBehaviourPenalty > 40);
  assert.ok(
    result.warnings.some((item) =>
      String(item).toLowerCase().includes('agresja') ||
      String(item).toLowerCase().includes('terytorial')
    )
  );
});
