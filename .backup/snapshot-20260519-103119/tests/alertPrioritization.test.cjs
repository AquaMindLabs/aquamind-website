const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

function loadAlertServiceExports() {
  const filePath = path.resolve(
    process.cwd(),
    'features',
    'aquarium',
    'services',
    'alertsService.js'
  );

  let source = fs.readFileSync(filePath, 'utf8');
  source = source.replace(/export const /g, 'const ');
  source = source.replace(/export function /g, 'function ');
  source +=
    '\nmodule.exports = { ALERT_SEVERITY, normalizeAlertSeverity, buildUnifiedAlert, sortUnifiedAlerts, splitPrimaryAndSecondaryAlerts };\n';

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

  vm.runInNewContext(source, sandbox, { filename: 'alertsService.js' });
  return sandbox.module.exports;
}

const {
  ALERT_SEVERITY,
  normalizeAlertSeverity,
  buildUnifiedAlert,
  sortUnifiedAlerts,
  splitPrimaryAndSecondaryAlerts,
} = loadAlertServiceExports();

test('normalizeAlertSeverity: fallback to info for unknown values', () => {
  assert.equal(normalizeAlertSeverity('critical'), ALERT_SEVERITY.CRITICAL);
  assert.equal(normalizeAlertSeverity('warning'), ALERT_SEVERITY.WARNING);
  assert.equal(normalizeAlertSeverity('minor'), ALERT_SEVERITY.INFO);
  assert.equal(normalizeAlertSeverity(null), ALERT_SEVERITY.INFO);
});

test('sortUnifiedAlerts: critical > warning > info', () => {
  const alerts = [
    buildUnifiedAlert({
      severity: 'info',
      title: 'Brak GH',
      source: 'water_analysis',
      affectedArea: 'data_quality',
    }),
    buildUnifiedAlert({
      severity: 'warning',
      title: 'NO3 lekko wysokie',
      source: 'water_analysis',
      affectedArea: 'water_parameters',
    }),
    buildUnifiedAlert({
      severity: 'critical',
      title: 'NO2 wysokie',
      source: 'water_analysis',
      affectedArea: 'water_parameters',
    }),
  ];

  const sorted = sortUnifiedAlerts(alerts, 10);
  assert.equal(sorted[0].title, 'NO2 wysokie');
  assert.equal(sorted[1].title, 'NO3 lekko wysokie');
  assert.equal(sorted[2].title, 'Brak GH');
});

test('splitPrimaryAndSecondaryAlerts: returns top 3 as primary', () => {
  const alerts = [
    buildUnifiedAlert({ severity: 'critical', title: 'A', source: 'x' }),
    buildUnifiedAlert({ severity: 'critical', title: 'B', source: 'x' }),
    buildUnifiedAlert({ severity: 'warning', title: 'C', source: 'x' }),
    buildUnifiedAlert({ severity: 'warning', title: 'D', source: 'x' }),
    buildUnifiedAlert({ severity: 'info', title: 'E', source: 'x' }),
  ];
  const split = splitPrimaryAndSecondaryAlerts(alerts, 3);

  assert.equal(split.primary.length, 3);
  assert.equal(split.secondary.length, 2);
  assert.deepEqual(
    split.primary.map((item) => item.title),
    ['A', 'B', 'C']
  );
});
