const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

function loadBuildTankOnboardingPlanService() {
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
    "const evaluateCycleDrift = () => ({ hasCriticalDrift: false, hasWarningDrift: false, targetEndDay: 14, isStabilized: false }); const evaluateEmergencyState = () => ({ isEmergency: false, severity: 'ok', title: '', summary: '', steps: [], avoid: [] });"
  );
  source = source.replace(/export function /g, 'function ');
  source += '\nmodule.exports = { buildTankOnboardingPlanService };\n';

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
  return sandbox.module.exports.buildTankOnboardingPlanService;
}

const buildTankOnboardingPlanService = loadBuildTankOnboardingPlanService();

function dayAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

const deps = {
  normalizeOnboardingMode: (value) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    const allowed = new Set([
      'fresh_start',
      'existing_running',
      'restart',
      'mature_media_start',
    ]);
    return allowed.has(normalized) ? normalized : 'existing_running';
  },
  getCreatedAtMs: (value) => {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (value instanceof Date) return value.getTime();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  },
  getDayBucketMs: (value) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  },
  analyzeMeasurementLogic: () => ({ status: 'ok', recommendations: [] }),
  getWaterAnalysisOptionsForTank: () => ({}),
  getRecentNumericSeries: (measurements, key, limit = 3) =>
    (measurements ?? [])
      .slice(0, limit)
      .map((item) => Number(item?.[key]))
      .filter((value) => Number.isFinite(value)),
  getRecommendationDueAtMsLogic: () => Date.now(),
};

test('onboarding fresh_start: ma osobny plan i liste pierwszych pomiarow', () => {
  const tank = {
    id: 'tank-fresh',
    onboardingMode: 'fresh_start',
    onboardingStartAt: dayAgo(2),
    createdAt: dayAgo(2),
  };

  const plan = buildTankOnboardingPlanService(tank, [], { no2: true, no3: true }, deps);
  assert.equal(plan.mode, 'fresh_start');
  assert.equal(plan.modeLabel, 'Fresh start');
  assert.ok(plan.rows.some((row) => row.id === 'fresh-day1-setup'));
  assert.ok(plan.rows.some((row) => row.id === 'fresh-day14-water-change'));
  assert.ok(Array.isArray(plan.firstMeasurements) && plan.firstMeasurements.length >= 2);
});

test('onboarding existing_running: ma osobny audyt 14 dni', () => {
  const tank = {
    id: 'tank-existing',
    onboardingMode: 'existing_running',
    onboardingStartAt: dayAgo(1),
    createdAt: dayAgo(200),
  };

  const plan = buildTankOnboardingPlanService(tank, [], { no2: true, no3: true }, deps);
  assert.equal(plan.mode, 'existing_running');
  assert.ok(plan.rows.some((row) => row.id === 'existing-day1-audit'));
  assert.ok(plan.checklistStart.some((item) => item.includes('typ akwarium')));
});

test('onboarding restart: ma osobne kroki bezpiecznego restartu', () => {
  const tank = {
    id: 'tank-restart',
    onboardingMode: 'restart',
    onboardingStartAt: dayAgo(1),
    createdAt: dayAgo(1),
  };

  const plan = buildTankOnboardingPlanService(tank, [], { no2: true, no3: true }, deps);
  assert.equal(plan.mode, 'restart');
  assert.ok(plan.rows.some((row) => row.id === 'restart-day1-media'));
});

test('onboarding mature_media_start: ma osobny plan monitoringu po starcie', () => {
  const tank = {
    id: 'tank-mature',
    onboardingMode: 'mature_media_start',
    onboardingStartAt: dayAgo(1),
    createdAt: dayAgo(1),
  };

  const plan = buildTankOnboardingPlanService(tank, [], { no2: true, no3: true }, deps);
  assert.equal(plan.mode, 'mature_media_start');
  assert.ok(plan.rows.some((row) => row.id === 'mature-day1-media'));
});

test('onboarding wygasa po 14 dniach dla trybu existing_running', () => {
  const tank = {
    id: 'tank-old',
    onboardingMode: 'existing_running',
    onboardingStartAt: dayAgo(20),
    createdAt: dayAgo(20),
  };

  const plan = buildTankOnboardingPlanService(tank, [], { no2: true, no3: true }, deps);
  assert.equal(plan.isActive, false);
  assert.ok(String(plan.statusText).includes('zakonczony'));
});
