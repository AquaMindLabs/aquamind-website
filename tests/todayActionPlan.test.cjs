const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

function loadBuildTodayActionPlanService() {
  const filePath = path.resolve(
    process.cwd(),
    'features',
    'aquarium',
    'services',
    'tasksService.js'
  );

  let source = fs.readFileSync(filePath, 'utf8');
  source = source.replace(
    /import\s+\{\s*evaluateCycleDrift\s*,\s*evaluateEmergencyState\s*\}\s+from\s+'\.\/emergencyService';/,
    "const evaluateCycleDrift = () => ({ hasCriticalDrift: false, hasWarningDrift: false, targetEndDay: 21, isStabilized: false }); const evaluateEmergencyState = () => ({ isEmergency: false, severity: 'ok', title: '', summary: '', steps: [], avoid: [] });"
  );
  source = source.replace(/export function /g, 'function ');
  source += '\nmodule.exports = { buildTodayActionPlanService };\n';

  const sandbox = {
    module: { exports: {} },
    exports: {},
    require,
    console,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
  };

  vm.runInNewContext(source, sandbox, { filename: 'tasksService.js' });
  return sandbox.module.exports.buildTodayActionPlanService;
}

const buildTodayActionPlanService = loadBuildTodayActionPlanService();

function dayBucket(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function tankFactory(daysAgo = 45) {
  return {
    id: 'tank-1',
    name: 'Test Tank',
    createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
  };
}

test('buildTodayActionPlan: krytyczne parametry wody daja akcje krytyczna', () => {
  const plan = buildTodayActionPlanService(tankFactory(), {
    latestMeasurement: { no2: 0.35, nh3nh4: 0.01 },
    latestAnalysis: { status: 'critical', recommendations: [] },
    measurements: [{ createdAt: new Date(), no2: 0.35 }],
    todayDayBucketMs: dayBucket(),
  });

  assert.ok(plan);
  assert.equal(plan.items.length <= 3, true);
  assert.equal(plan.criticalAction?.categoryKey, 'critical');
  assert.match(plan.criticalAction?.title ?? '', /alert|Krytyczne|Natychmiastowy/i);
});

test('buildTodayActionPlan: trendy i harmonogram dodaja wazne + rutynowe', () => {
  const today = dayBucket();
  const plan = buildTodayActionPlanService(tankFactory(), {
    todayDayBucketMs: today,
    latestMeasurement: { no2: 0.04, no3: 36 },
    latestAnalysis: { status: 'ok', recommendations: [] },
    measurements: [
      { createdAt: new Date(), no2: 0.04, no3: 36 },
      { createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), no2: 0.01, no3: 20 },
    ],
    schedule: {
      parameters: [{ key: 'no2', label: 'NO2', dayBucketMs: today }],
    },
  });

  assert.ok(plan.items.some((item) => item.categoryKey === 'important'));
  assert.ok(plan.items.some((item) => item.categoryKey === 'routine'));
});

test('buildTodayActionPlan: sprzet i obsada podnosza priorytet', () => {
  const plan = buildTodayActionPlanService(tankFactory(), {
    latestMeasurement: { no2: 0.0, nh3nh4: 0.0 },
    latestAnalysis: { status: 'ok', recommendations: [] },
    measurements: [{ createdAt: new Date(), no2: 0.0 }],
    equipmentAssessment: {
      filter: { status: 'critical', details: 'Filtr nie dziala' },
      heater: { status: 'warning', details: 'Lekko niedogrzewa' },
    },
    stockingCompatibility: {
      overallStatus: 'incompatible',
      conflicts: [{ category: 'aggression' }],
    },
    stockItems: [{ type: 'fish', quantity: 10 }],
  });

  assert.equal(plan.items.length <= 3, true);
  assert.equal(plan.criticalAction?.categoryKey, 'critical');
  assert.ok(
    /Filtracja|Obsada|Niski wynik|Krytyczne/i.test(
      `${plan.criticalAction?.title ?? ''} ${plan.criticalAction?.details ?? ''}`
    )
  );
});

test('buildTodayActionPlan: onboarding i wiek zbiornika tworza dzialania dzienne', () => {
  const plan = buildTodayActionPlanService(tankFactory(10), {
    latestMeasurement: { no2: 0.01, nh3nh4: 0.0 },
    latestAnalysis: { status: 'ok', recommendations: [] },
    measurements: [{ createdAt: new Date(), no2: 0.01 }],
    onboardingPlan: {
      isActive: true,
      todayItems: ['Dzien 5: test NO2'],
      rows: [{ level: 'warning', status: 'current' }],
    },
  });

  assert.ok(plan.items.some((item) => item.source === 'onboarding'));
  assert.ok(plan.items.some((item) => item.source === 'age' || item.source === 'onboarding'));
});

test('buildTodayActionPlan: fallback gdy brak sygnalow', () => {
  const plan = buildTodayActionPlanService(tankFactory(120), {
    latestMeasurement: { no2: 0.0, nh3nh4: 0.0 },
    latestAnalysis: { status: 'ok', recommendations: [] },
    measurements: [{ createdAt: new Date(), no2: 0.0, no3: 10 }],
    schedule: { parameters: [] },
    stockItems: [],
    issueCases: [],
    healthAssessment: { score: 88 },
    equipmentAssessment: {
      filter: { status: 'ok' },
      heater: { status: 'ok' },
    },
    stockingCompatibility: { overallStatus: 'compatible', conflicts: [] },
    onboardingPlan: { isActive: false, todayItems: [], rows: [] },
  });

  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].categoryKey, 'routine');
  assert.match(plan.items[0].title, /Brak pilnych zmian/i);
});
