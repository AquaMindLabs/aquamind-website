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
const now = Date.now();

function dayAgo(days) {
  return new Date(now - days * 24 * 60 * 60 * 1000);
}

function hourAgo(hours) {
  return new Date(now - hours * 60 * 60 * 1000);
}

function makeTank({ mode = 'new_from_scratch', startDaysAgo = 1 } = {}) {
  return {
    id: `tank-${mode}`,
    onboardingMode: mode,
    onboardingStartAt: dayAgo(startDaysAgo),
    createdAt: dayAgo(startDaysAgo),
    targetRanges: {
      temperature: {
        min: 24,
        max: 26,
      },
    },
  };
}

function makeMeasurements(entries) {
  return entries.map((entry) => ({
    measuredAt: entry.measuredAt,
    createdAt: entry.measuredAt,
    no2: entry.no2,
    no3: entry.no3,
    temperature: entry.temperature,
    ph: entry.ph,
    kh: entry.kh,
    gh: entry.gh,
  }));
}

function findStepRow(plan, sourceStepId) {
  return plan.rows.find((row) => row.sourceStepId === sourceStepId);
}

const deps = {
  normalizeOnboardingMode: (value) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'fresh_start' || normalized === 'new_from_scratch') {
      return 'new_from_scratch';
    }
    if (normalized === 'restart') {
      return 'restart';
    }
    if (normalized === 'mature_media_start' || normalized === 'existing_running') {
      return 'mature_media_start';
    }
    return 'new_from_scratch';
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
  getRecommendationDueAtMsLogic: () => now,
};

test('onboarding: plan dynamiczny dla new_from_scratch ma aktualne etykiety i kroki', () => {
  const tank = makeTank({ mode: 'new_from_scratch', startDaysAgo: 2 });

  const measurements = makeMeasurements([
    { measuredAt: hourAgo(2), no2: 0, no3: 10, temperature: 25, ph: 7.0, kh: 5, gh: 8 },
  ]);

  const plan = buildTankOnboardingPlanService(tank, measurements, { no2: true, no3: true }, deps);

  assert.equal(plan.mode, 'new_from_scratch');
  assert.equal(plan.modeLabel, 'Nowy zbiornik od zera');
  assert.ok(plan.rows.some((row) => row.sourceStepId === 'nfs-day0-start'));
  assert.ok(plan.rows.some((row) => row.sourceStepId === 'nfs-day42-finish'));
});

test('onboarding: krok obsady jest blocked gdy NO2 jest wykrywalne (fresh)', () => {
  const tank = makeTank({ mode: 'new_from_scratch', startDaysAgo: 30 });

  const measurements = makeMeasurements([
    { measuredAt: hourAgo(2), no2: 0.2, no3: 15, temperature: 25, ph: 7.1, kh: 5, gh: 8 },
    { measuredAt: hourAgo(30), no2: 0.1, no3: 14, temperature: 25, ph: 7.0, kh: 5, gh: 8 },
  ]);

  const plan = buildTankOnboardingPlanService(tank, measurements, { no2: true, no3: true }, deps);
  const step = findStepRow(plan, 'nfs-day21-first-stocking');

  assert.ok(step);
  assert.equal(step.stepStatus, 'blocked');
  assert.ok(String(step.reason).includes('NO2 jest nadal wykrywalne'));
});

test('onboarding: krok obsady czeka na pomiar gdy NO2 nie jest fresh (72h dla new_from_scratch)', () => {
  const tank = makeTank({ mode: 'new_from_scratch', startDaysAgo: 30 });

  const measurements = makeMeasurements([
    { measuredAt: hourAgo(80), no2: 0, no3: 12, temperature: 25, ph: 7.0, kh: 5, gh: 8 },
    { measuredAt: hourAgo(20), no3: 12, temperature: 25, ph: 7.1, kh: 5, gh: 8 },
  ]);

  const plan = buildTankOnboardingPlanService(tank, measurements, { no2: true, no3: true }, deps);
  const step = findStepRow(plan, 'nfs-day21-first-stocking');

  assert.ok(step);
  assert.equal(step.stepStatus, 'waiting_for_parameters');
  assert.ok(String(step.reason).includes('Brakuje aktualnego pomiaru NO2'));
});

test('onboarding: krok readiness jest delayed przy niestabilnej temperaturze', () => {
  const tank = makeTank({ mode: 'new_from_scratch', startDaysAgo: 16 });

  const measurements = makeMeasurements([
    { measuredAt: hourAgo(2), no2: 0, no3: 10, temperature: 29, ph: 7.0, kh: 5, gh: 8 },
    { measuredAt: hourAgo(26), no2: 0, no3: 11, temperature: 25, ph: 7.0, kh: 5, gh: 8 },
  ]);

  const plan = buildTankOnboardingPlanService(tank, measurements, { no2: true, no3: true }, deps);
  const step = findStepRow(plan, 'nfs-day14-readiness');

  assert.ok(step);
  assert.equal(step.stepStatus, 'delayed');
  assert.ok(String(step.reason).includes('Temperatura nie jest jeszcze stabilna'));
});

test('onboarding: wysokie NO3 daje ostrzezenie, ale nie blokuje kroku', () => {
  const tank = makeTank({ mode: 'new_from_scratch', startDaysAgo: 8 });

  const measurements = makeMeasurements([
    { measuredAt: hourAgo(2), no2: 0, no3: 55, temperature: 25, ph: 7.0, kh: 5, gh: 8 },
    { measuredAt: hourAgo(22), no2: 0, no3: 50, temperature: 25, ph: 7.0, kh: 5, gh: 8 },
  ]);

  const plan = buildTankOnboardingPlanService(tank, measurements, { no2: true, no3: true }, deps);
  const step = findStepRow(plan, 'nfs-day7-cycle-control');

  assert.ok(step);
  assert.equal(step.stepStatus, 'active');
  assert.equal(step.level, 'info');
});
