const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildUserAquariumContext,
  DEFAULT_AI_CONTEXT_LIMITS,
} = require('../scripts/ai-context-builder.cjs');

test('buildUserAquariumContext maps Firestore-like data to stable DTO', () => {
  const data = {
    tanks: [
      {
        id: 'tank_a',
        userId: 'user_a',
        name: 'Akwarium glowny zbiornik',
        liters: 112,
        aquariumType: 'community',
        onboardingEnabled: true,
        onboardingMode: 'new_cycle',
        onboardingStartAt: '2026-05-10T08:00:00.000Z',
        onboardingTaskChecks: { task_a: true, task_b: false },
        maintenanceActionState: {
          water_change: { lastCompletedAtMs: Date.parse('2026-05-01T10:00:00.000Z') },
          water_tests: { postponedUntilMs: Date.parse('2026-05-20T00:00:00.000Z') },
        },
        heaterEquipments: [{ model: 'H-100' }],
        filterEquipment: { model: 'F-220' },
        lightModelName: 'LED 40cm',
      },
      {
        id: 'tank_b',
        userId: 'user_a',
        name: 'Akwarium zapasowe',
        liters: 60,
      },
    ],
    measurements: [
      {
        id: 'm_new',
        tankId: 'tank_a',
        ph: 7.2,
        no2: 0,
        no3: 20,
        temperature: 25.4,
        measuredAt: '2026-05-15T08:00:00.000Z',
      },
      {
        id: 'm_old',
        tankId: 'tank_a',
        ph: 7.0,
        no2: 0.02,
        no3: 15,
        temperature: 24.8,
        measuredAt: '2026-05-11T08:00:00.000Z',
      },
    ],
    stockItems: [
      { id: 's_1', tankId: 'tank_a', type: 'fish' },
      { id: 's_2', tankId: 'tank_a', type: 'plant' },
      { id: 's_3', tankId: 'tank_a', type: 'shrimp' },
    ],
    issueCases: [
      { id: 'i_active', tankId: 'tank_a', status: 'active', diseaseType: 'ich' },
      { id: 'i_closed', tankId: 'tank_a', status: 'resolved', diseaseType: 'fungus' },
    ],
  };

  const context = buildUserAquariumContext('user_a', 'tank_a', data);

  assert.equal(context.selectedTank.id, 'tank_a');
  assert.equal(context.tankCount, 2);
  assert.equal(context.measurementCount, 2);
  assert.equal(context.stockCount, 3);
  assert.equal(context.activeIssueCount, 1);
  assert.equal(context.stockSummary.fishCount, 1);
  assert.equal(context.stockSummary.plantCount, 1);
  assert.equal(context.stockSummary.otherCount, 1);
  assert.equal(context.equipmentSummary.heaterCount, 1);
  assert.equal(context.equipmentSummary.filterCount, 1);
  assert.equal(context.equipmentSummary.hasLightConfigured, true);
  assert.equal(context.onboardingHighlights.enabled, true);
  assert.equal(context.onboardingHighlights.completedTaskCount, 1);
  assert.ok(Array.isArray(context.measurements.latest));
  assert.equal(context.measurements.latest.length, 2);
  assert.ok(Array.isArray(context.measurements.trends));
  assert.equal(
    context.measurements.trends.some(
      (trend) => trend.key === 'no3' && trend.direction === 'up'
    ),
    true
  );
  assert.equal(Array.isArray(context.actionCalendarHighlights.highlights), true);
  assert.equal(context.tanks, undefined);
  assert.equal(context.measurementsRaw, undefined);
});

test('buildUserAquariumContext uses fallback-safe shape when data is missing', () => {
  const context = buildUserAquariumContext('user_empty', null, {});

  assert.equal(context.selectedTank, null);
  assert.equal(context.tankCount, 0);
  assert.equal(context.measurementCount, 0);
  assert.equal(context.stockCount, 0);
  assert.equal(context.activeIssueCount, 0);
  assert.equal(context.tankSummary.hasData, false);
  assert.equal(context.meta.hasMinimalData, true);
  assert.equal(Array.isArray(context.measurements.latest), true);
  assert.equal(Array.isArray(context.actionCalendarHighlights.highlights), true);
});

test('buildUserAquariumContext applies deterministic size limit', () => {
  const veryLong = 'x'.repeat(3000);
  const data = {
    tanks: [
      {
        id: 'tank_a',
        name: veryLong,
        liters: 200,
        aquariumType: veryLong,
        onboardingTaskChecks: {
          a: true,
          b: true,
          c: true,
        },
      },
    ],
    measurements: new Array(12).fill(null).map((_, index) => ({
      id: `m_${index}`,
      tankId: 'tank_a',
      ph: 7 + index * 0.01,
      no2: index * 0.01,
      no3: 10 + index,
      temperature: 24 + index * 0.1,
      measuredAt: `2026-05-${String(10 + index).padStart(2, '0')}T10:00:00.000Z`,
    })),
    stockItems: new Array(20).fill(null).map((_, index) => ({
      id: `s_${index}`,
      tankId: 'tank_a',
      type: index % 2 === 0 ? 'fish' : 'plant',
    })),
    issueCases: new Array(10).fill(null).map((_, index) => ({
      id: `i_${index}`,
      tankId: 'tank_a',
      status: index % 2 === 0 ? 'active' : 'resolved',
      diseaseType: veryLong,
      createdAt: `2026-04-${String(10 + index).padStart(2, '0')}T10:00:00.000Z`,
    })),
  };

  const context = buildUserAquariumContext('user_a', 'tank_a', data, {
    limits: {
      ...DEFAULT_AI_CONTEXT_LIMITS,
      maxContextChars: 500,
      maxStringLength: 500,
      maxMeasurements: 10,
      maxIssueHighlights: 8,
      maxActionHighlights: 4,
    },
  });

  assert.equal(context.meta.trimmedBySizeLimit, true);
  assert.equal(
    JSON.stringify(context).length <= 500,
    true,
    'context should respect maxContextChars'
  );
});

