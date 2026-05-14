const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

function loadEmergencyExports() {
  const filePath = path.resolve(
    process.cwd(),
    'features',
    'aquarium',
    'services',
    'emergencyService.js'
  );

  let source = fs.readFileSync(filePath, 'utf8');
  source = source.replace(/export function /g, 'function ');
  source += '\nmodule.exports = { evaluateCycleDrift, evaluateEmergencyState };\n';

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

  vm.runInNewContext(source, sandbox, { filename: 'emergencyService.js' });
  return sandbox.module.exports;
}

const { evaluateEmergencyState } = loadEmergencyExports();

const baseTank = {
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  targetTemperatureC: 25,
};

test('evaluateEmergencyState: wysokie NO2', () => {
  const result = evaluateEmergencyState(
    baseTank,
    { no2: 0.3, nh3nh4: 0.01, temperature: 25 },
    { filter: { status: 'ok' } },
    {}
  );

  assert.equal(result.isEmergency, true);
  assert.ok(result.triggers.includes('high_no2'));
  assert.equal(result.severity, 'critical');
  assert.ok(result.steps.length > 0);
  assert.ok(result.avoid.length > 0);
});

test('evaluateEmergencyState: wysokie NH3/NH4', () => {
  const result = evaluateEmergencyState(
    baseTank,
    { no2: 0.0, nh3nh4: 0.25, temperature: 25 },
    { filter: { status: 'ok' } },
    {}
  );

  assert.equal(result.isEmergency, true);
  assert.ok(result.triggers.includes('high_nh3_nh4'));
  assert.equal(result.severity, 'critical');
});

test('evaluateEmergencyState: ryby lapia powietrze', () => {
  const result = evaluateEmergencyState(
    baseTank,
    { no2: 0.0, nh3nh4: 0.0, temperature: 25 },
    { filter: { status: 'ok' } },
    { rapid_breathing: true }
  );

  assert.equal(result.isEmergency, true);
  assert.ok(result.triggers.includes('fish_gasping'));
  assert.equal(result.severity, 'critical');
  assert.match(result.summary, /Ryby lapia powietrze|lapia powietrze/i);
});

test('evaluateEmergencyState: filtr przestal dzialac', () => {
  const result = evaluateEmergencyState(
    baseTank,
    { no2: 0.0, nh3nh4: 0.0, temperature: 25 },
    { filter: { status: 'critical', isRunning: false } },
    {}
  );

  assert.equal(result.isEmergency, true);
  assert.ok(result.triggers.includes('filter_stopped'));
  assert.equal(result.severity, 'critical');
});

test('evaluateEmergencyState: temperatura za wysoka', () => {
  const result = evaluateEmergencyState(
    baseTank,
    { no2: 0.0, nh3nh4: 0.0, temperature: 31 },
    { filter: { status: 'ok' } },
    {}
  );

  assert.equal(result.isEmergency, true);
  assert.ok(result.triggers.includes('high_temperature'));
  assert.equal(result.severity, 'critical');
  assert.ok(result.steps.some((step) => /Chlodz zbiornik stopniowo|natlenienie/i.test(step)));
});
