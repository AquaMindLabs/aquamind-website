const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

function loadGenerateAdaptiveTaskSchedule() {
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
  source += '\nmodule.exports = { generateAdaptiveTaskSchedule };\n';

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
  return sandbox.module.exports.generateAdaptiveTaskSchedule;
}

const generateAdaptiveTaskSchedule = loadGenerateAdaptiveTaskSchedule();

function dayBucket(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function tankFactory(daysAgo = 45) {
  return {
    id: 'tank-1',
    name: 'Test Tank',
    liters: 100,
    createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
  };
}

test('generateAdaptiveTaskSchedule: tworzy komplet podstawowych zadan', () => {
  const schedule = generateAdaptiveTaskSchedule(tankFactory(60), {
    todayDayBucketMs: dayBucket(),
    latestMeasurement: { no2: 0, nh3nh4: 0, no3: 15, temperature: 25 },
    measurements: [{ no3: 15, no2: 0, temperature: 25 }],
    stockItems: [{ type: 'fish', quantity: 8 }, { type: 'plant' }],
  });

  const taskKeys = schedule.tasks.map((item) => item.key);
  [
    'water-change',
    'water-tests',
    'filter-maintenance',
    'prefilter-rinse',
    'fertilization',
    'pruning',
    'temperature-check',
    'equipment-service',
  ].forEach((requiredKey) => {
    assert.ok(taskKeys.includes(requiredKey), `missing task: ${requiredKey}`);
  });
});

test('generateAdaptiveTaskSchedule: wysokie NO2/NH3 daje priorytet krytyczny', () => {
  const schedule = generateAdaptiveTaskSchedule(tankFactory(20), {
    todayDayBucketMs: dayBucket(),
    latestMeasurement: { no2: 0.35, nh3nh4: 0.25, no3: 40, temperature: 26 },
    measurements: [
      { no2: 0.35, no3: 40, temperature: 26 },
      { no2: 0.12, no3: 28, temperature: 25 },
    ],
    stockItems: [{ type: 'fish', quantity: 15 }],
    equipmentAssessment: { filter: { status: 'warning' } },
  });

  assert.equal(schedule.risk.level, 'critical');
  assert.ok(schedule.dueToday.length > 0);
  assert.ok(
    schedule.dueToday.some((item) => item.priority === 'critical'),
    'expected at least one critical task due today'
  );
});

test('generateAdaptiveTaskSchedule: mlody zbiornik ma czestsze testy', () => {
  const young = generateAdaptiveTaskSchedule(tankFactory(8), {
    todayDayBucketMs: dayBucket(),
    latestMeasurement: { no2: 0.0, nh3nh4: 0.0, no3: 10, temperature: 25 },
    measurements: [{ no2: 0.0, no3: 10, temperature: 25 }],
    stockItems: [{ type: 'fish', quantity: 4 }],
  });
  const mature = generateAdaptiveTaskSchedule(tankFactory(120), {
    todayDayBucketMs: dayBucket(),
    latestMeasurement: { no2: 0.0, nh3nh4: 0.0, no3: 10, temperature: 25 },
    measurements: [{ no2: 0.0, no3: 10, temperature: 25 }],
    stockItems: [{ type: 'fish', quantity: 4 }],
  });

  const youngTests = young.tasks.find((item) => item.key === 'water-tests');
  const matureTests = mature.tasks.find((item) => item.key === 'water-tests');

  assert.ok(youngTests && matureTests);
  assert.ok(
    youngTests.intervalDays <= matureTests.intervalDays,
    `expected young interval <= mature interval (${youngTests.intervalDays} <= ${matureTests.intervalDays})`
  );
});
