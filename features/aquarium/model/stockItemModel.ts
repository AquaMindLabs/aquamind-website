type DeleteFieldFn = () => unknown;

type StockItemModelDeps = {
  deleteFieldFn: DeleteFieldFn;
};

type BuildStockItemPayloadParams = {
  currentItem?: unknown;
  updates?: Record<string, unknown>;
  mode?: 'create' | 'update';
  includeUpdatedAt?: boolean;
  includeCreatedAtIfMissing?: boolean;
  now?: Date;
  deps: StockItemModelDeps;
};

const ALLOWED_STOCK_ITEM_FIELDS = new Set([
  'userId',
  'tankId',
  'tankName',
  'type',
  'source',
  'name',
  'commonName',
  'latinName',
  'catalogFishId',
  'catalogPlantId',
  'phMin',
  'phMax',
  'ghMin',
  'ghMax',
  'tempMin',
  'tempMax',
  'quantity',
  'minLiters',
  'isSchooling',
  'minGroupSize',
  'aggressionLevel',
  'fishProfile',
  'lightLumenMinPerLiter',
  'lightLumenMaxPerLiter',
  'lightHoursMin',
  'lightHoursMax',
  'lightDemand',
  'co2Demand',
  'growthRate',
  'difficulty',
  'fertilizationDemand',
  'plantType',
  'placementZone',
  'carboSensitivity',
  'parameterStabilitySensitivity',
  'minTankHeightCm',
  'minTankVolumeL',
  'compatibleWithDiggers',
  'notes',
  'createdAt',
  'updatedAt',
]);

const STOCK_ITEM_NUMERIC_KEYS = [
  'phMin',
  'phMax',
  'ghMin',
  'ghMax',
  'tempMin',
  'tempMax',
  'quantity',
  'minLiters',
  'minGroupSize',
  'lightLumenMinPerLiter',
  'lightLumenMaxPerLiter',
  'lightHoursMin',
  'lightHoursMax',
  'minTankHeightCm',
  'minTankVolumeL',
];

function isTimestampLike(value: unknown) {
  if (value === null || value === undefined) {
    return true;
  }
  if (value instanceof Date) {
    return true;
  }
  return (
    typeof value === 'object' &&
    typeof (value as { toMillis?: unknown })?.toMillis === 'function'
  );
}

function hasOwnField(entity: unknown, field: string) {
  return Boolean(entity && Object.prototype.hasOwnProperty.call(entity, field));
}

function toFiniteOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeString(value: unknown, maxLen: number) {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, maxLen);
}

export function normalizeStockItemRuntime(stockItem: unknown): Record<string, unknown> {
  if (!stockItem || typeof stockItem !== 'object') {
    return {};
  }

  const normalized: Record<string, unknown> = {
    ...(stockItem as Record<string, unknown>),
  };

  if (hasOwnField(normalized, 'type')) {
    normalized.type = String(normalized.type ?? '').trim().toLowerCase();
  }

  STOCK_ITEM_NUMERIC_KEYS.forEach((key) => {
    if (!hasOwnField(normalized, key)) {
      return;
    }
    const numeric = toFiniteOrNull(normalized[key]);
    if (numeric === null) {
      delete normalized[key];
      return;
    }
    normalized[key] = numeric;
  });

  [
    ['userId', 128],
    ['tankId', 128],
    ['tankName', 180],
    ['type', 24],
    ['source', 40],
    ['name', 180],
    ['commonName', 180],
    ['latinName', 220],
    ['catalogFishId', 160],
    ['catalogPlantId', 160],
    ['aggressionLevel', 32],
    ['lightDemand', 24],
    ['co2Demand', 24],
    ['growthRate', 24],
    ['difficulty', 24],
    ['fertilizationDemand', 24],
    ['plantType', 40],
    ['placementZone', 40],
    ['carboSensitivity', 24],
    ['parameterStabilitySensitivity', 24],
    ['notes', 3000],
  ].forEach(([field, maxLen]) => {
    if (!hasOwnField(normalized, String(field))) {
      return;
    }
    const value = normalizeString(normalized[String(field)], Number(maxLen));
    if (value === null) {
      delete normalized[String(field)];
      return;
    }
    normalized[String(field)] = value;
  });

  if (hasOwnField(normalized, 'isSchooling')) {
    normalized.isSchooling = Boolean(normalized.isSchooling);
  }
  if (hasOwnField(normalized, 'compatibleWithDiggers')) {
    normalized.compatibleWithDiggers = Boolean(normalized.compatibleWithDiggers);
  }
  if (hasOwnField(normalized, 'fishProfile')) {
    const fishProfile = normalized.fishProfile;
    if (!fishProfile || typeof fishProfile !== 'object' || Array.isArray(fishProfile)) {
      delete normalized.fishProfile;
    }
  }

  return normalized;
}

export function validateStockItemRuntime(
  stockItem: unknown
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const normalized = normalizeStockItemRuntime(stockItem);

  const type = String(normalized.type ?? '').trim().toLowerCase();
  if (!type || !['fish', 'plant'].includes(type)) {
    issues.push('invalid_type');
  }

  const userId = String(normalized.userId ?? '').trim();
  if (!userId) {
    issues.push('missing_user_id');
  }

  const tankId = String(normalized.tankId ?? '').trim();
  if (!tankId) {
    issues.push('missing_tank_id');
  }

  const quantity = Number(normalized.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
    issues.push('invalid_quantity');
  }

  if (
    hasOwnField(normalized, 'createdAt') &&
    !isTimestampLike(normalized.createdAt)
  ) {
    issues.push('invalid_created_at');
  }
  if (
    hasOwnField(normalized, 'updatedAt') &&
    !isTimestampLike(normalized.updatedAt)
  ) {
    issues.push('invalid_updated_at');
  }

  return { ok: issues.length === 0, issues };
}

export function buildStockItemSanitizationPatchRuntime(
  stockItem: unknown,
  deps: StockItemModelDeps
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const normalized = normalizeStockItemRuntime(stockItem);

  Object.keys(normalized).forEach((field) => {
    if (field === 'id') {
      return;
    }
    if (!ALLOWED_STOCK_ITEM_FIELDS.has(field)) {
      patch[field] = deps.deleteFieldFn();
    }
  });

  if (hasOwnField(normalized, 'createdAt') && !isTimestampLike(normalized.createdAt)) {
    patch.createdAt = deps.deleteFieldFn();
  }
  if (hasOwnField(normalized, 'updatedAt') && !isTimestampLike(normalized.updatedAt)) {
    patch.updatedAt = deps.deleteFieldFn();
  }

  return patch;
}

function sanitizeStockItemForWrite(
  input: Record<string, unknown>,
  mode: 'create' | 'update'
) {
  const normalized = normalizeStockItemRuntime(input);
  const sanitized: Record<string, unknown> = {};

  ALLOWED_STOCK_ITEM_FIELDS.forEach((field) => {
    if (!hasOwnField(normalized, field)) {
      return;
    }
    const value = normalized[field];
    if (value === undefined) {
      return;
    }
    if (value === null && mode === 'create') {
      return;
    }
    sanitized[field] = value;
  });

  if (mode === 'update') {
    delete sanitized.createdAt;
  }

  return sanitized;
}

export function buildStockItemPayload({
  currentItem = {},
  updates = {},
  mode = 'update',
  includeUpdatedAt = mode === 'update',
  includeCreatedAtIfMissing = mode === 'create',
  now = new Date(),
  deps,
}: BuildStockItemPayloadParams): Record<string, unknown> {
  const normalizedCurrent = normalizeStockItemRuntime(currentItem);
  const normalizedUpdates = normalizeStockItemRuntime(updates);
  const merged = {
    ...normalizedCurrent,
    ...normalizedUpdates,
  };

  const sanitizedPatch =
    mode === 'update'
      ? buildStockItemSanitizationPatchRuntime(normalizedCurrent, deps)
      : {};
  const sanitizedPayload = sanitizeStockItemForWrite(merged, mode);

  if (includeCreatedAtIfMissing && !hasOwnField(sanitizedPayload, 'createdAt')) {
    sanitizedPayload.createdAt = now;
  }
  if (includeUpdatedAt) {
    sanitizedPayload.updatedAt = now;
  }

  return {
    ...sanitizedPatch,
    ...sanitizedPayload,
  };
}
