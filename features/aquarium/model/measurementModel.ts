type DeleteFieldFn = () => unknown;

type MeasurementModelDeps = {
  deleteFieldFn: DeleteFieldFn;
};

const ALLOWED_MEASUREMENT_FIELDS = new Set([
  'userId',
  'tankId',
  'tankName',
  'note',
  'measuredAt',
  'ph',
  'gh',
  'kh',
  'no2',
  'no3',
  'temperature',
  'nh3nh4',
  'po4',
  'fe',
  'ca',
  'mg',
  'k',
  'tds',
  'co2',
  'createdAt',
  'updatedAt',
]);

const MEASUREMENT_NUMERIC_KEYS = [
  'ph',
  'gh',
  'kh',
  'no2',
  'no3',
  'temperature',
  'nh3nh4',
  'po4',
  'fe',
  'ca',
  'mg',
  'k',
  'tds',
  'co2',
];

function toFiniteOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeMeasurementRuntime(
  measurement: unknown
): Record<string, unknown> {
  if (!measurement || typeof measurement !== 'object') {
    return {};
  }

  const normalized: Record<string, unknown> = { ...(measurement as Record<string, unknown>) };
  MEASUREMENT_NUMERIC_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(normalized, key)) {
      return;
    }
    const numeric = toFiniteOrNull(normalized[key]);
    if (numeric === null) {
      delete normalized[key];
      return;
    }
    normalized[key] = numeric;
  });
  if (typeof normalized.note === 'string') {
    normalized.note = String(normalized.note).trim();
  }
  return normalized;
}

export function validateMeasurementRuntime(
  measurement: unknown
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const normalized = normalizeMeasurementRuntime(measurement);
  const hasAnyNumeric = MEASUREMENT_NUMERIC_KEYS.some((key) =>
    Number.isFinite(Number(normalized[key]))
  );
  if (!hasAnyNumeric) {
    issues.push('missing_numeric_values');
  }
  if (
    normalized.measuredAt &&
    !(normalized.measuredAt instanceof Date) &&
    !(
      typeof normalized.measuredAt === 'object' &&
      normalized.measuredAt &&
      typeof (normalized.measuredAt as { toMillis?: unknown }).toMillis === 'function'
    )
  ) {
    issues.push('invalid_measured_at');
  }
  return { ok: issues.length === 0, issues };
}

export function buildMeasurementSanitizationPatchRuntime(
  measurement: unknown,
  deps: MeasurementModelDeps
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const normalized = normalizeMeasurementRuntime(measurement);

  Object.keys(normalized).forEach((field) => {
    if (field === 'id') {
      return;
    }
    if (!ALLOWED_MEASUREMENT_FIELDS.has(field)) {
      patch[field] = deps.deleteFieldFn();
    }
  });

  return patch;
}

