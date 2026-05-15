type DeleteFieldFn = () => unknown;

type TankModelDeps = {
  deleteFieldFn: DeleteFieldFn;
  normalizeRoomTemperatureMode: (value: unknown) => string;
  normalizeDensityLevel: (value: unknown) => string;
  normalizeSubstrateTypes: (value: unknown) => string[];
  waterProfileOptionsValues: string[];
};

type BuildTankUpdatePayloadParams = {
  currentTank: unknown;
  updates: Record<string, unknown>;
  deps: TankModelDeps;
  includeUpdatedAt?: boolean;
  now?: Date;
};

function isTimestampLike(value: unknown) {
  if (value === null || value === undefined) {
    return true;
  }
  if (value instanceof Date) {
    return true;
  }
  return typeof value === 'object' && typeof (value as { toMillis?: unknown })?.toMillis === 'function';
}

function isPlainMap(value: unknown) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwnField(entity: unknown, field: string) {
  return Boolean(entity && Object.prototype.hasOwnProperty.call(entity, field));
}

export function normalizeTankRuntime(tank: unknown): Record<string, unknown> {
  if (!tank || typeof tank !== 'object') {
    return {};
  }
  const normalized = { ...(tank as Record<string, unknown>) };
  const onboardingMode = String(normalized.onboardingMode ?? '').trim().toLowerCase();
  if (onboardingMode === 'existing_running') {
    normalized.onboardingMode = 'mature_media_start';
  }
  return normalized;
}

export function validateTankRuntime(
  tank: unknown,
  deps: TankModelDeps
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const normalized = normalizeTankRuntime(tank);
  const liters = Number(normalized.liters);
  if (!Number.isFinite(liters) || liters <= 0) {
    issues.push('invalid_liters');
  }
  if (
    hasOwnField(normalized, 'roomTemperatureMode') &&
    normalized.roomTemperatureMode !== null &&
    normalized.roomTemperatureMode !== undefined &&
    !deps.normalizeRoomTemperatureMode(normalized.roomTemperatureMode)
  ) {
    issues.push('invalid_room_temperature_mode');
  }
  if (
    hasOwnField(normalized, 'substrateTypes') &&
    normalized.substrateTypes !== null &&
    normalized.substrateTypes !== undefined &&
    !Array.isArray(normalized.substrateTypes)
  ) {
    issues.push('invalid_substrate_types');
  }
  return { ok: issues.length === 0, issues };
}

export function buildTankSanitizationPatchRuntime(
  tank: unknown,
  deps: TankModelDeps
): Record<string, unknown> {
  const { deleteFieldFn, normalizeRoomTemperatureMode, normalizeDensityLevel, normalizeSubstrateTypes, waterProfileOptionsValues } =
    deps;
  const normalizedTank = normalizeTankRuntime(tank);
  const patch: Record<string, unknown> = {};

  const fieldsToDeleteWhenNull = [
    'aquariumType',
    'substrateType',
    'substrateTypes',
    'lightIntensity',
    'lightModelId',
    'lightModelName',
    'lightLumens',
    'targetTemperatureC',
    'ambientTemperatureC',
    'roomTemperatureMode',
    'waterProfile',
    'singleSpeciesFishId',
    'targetRanges',
    'plantFertilizationEntries',
    'heaterEquipments',
    'filterEquipments',
    'heaterEquipment',
    'filterEquipment',
    'lengthCm',
    'widthCm',
    'heightCm',
    'plantDensity',
    'hardscapeDensity',
    'hidingPlacesCount',
    'hidingPlacesEstimated',
    'lineOfSightBreaks',
    'zones',
    'onboardingTaskChecks',
    'onboardingEnabled',
    'maintenanceActionState',
  ];
  const allowedTankFields = new Set([
    'userId',
    'name',
    'liters',
    'aquariumType',
    'substrateType',
    'substrateTypes',
    'lightIntensity',
    'lightModelId',
    'lightModelName',
    'lightLumens',
    'lightHours',
    'targetTemperatureC',
    'ambientTemperatureC',
    'roomTemperatureMode',
    'lengthCm',
    'widthCm',
    'heightCm',
    'plantDensity',
    'hardscapeDensity',
    'hidingPlacesCount',
    'hidingPlacesEstimated',
    'lineOfSightBreaks',
    'zones',
    'waterProfile',
    'singleSpeciesFishId',
    'targetRanges',
    'onboardingMode',
    'onboardingEnabled',
    'onboardingStartAt',
    'onboardingTaskChecks',
    'maintenanceActionState',
    'plantFertilizationEntries',
    'heaterEquipments',
    'filterEquipments',
    'heaterEquipment',
    'filterEquipment',
    'createdAt',
    'updatedAt',
  ]);

  Object.keys(normalizedTank ?? {}).forEach((field) => {
    if (field === 'id') {
      return;
    }
    if (!allowedTankFields.has(field)) {
      patch[field] = deleteFieldFn();
    }
  });

  fieldsToDeleteWhenNull.forEach((field) => {
    if ((normalizedTank as Record<string, unknown>)?.[field] === null) {
      patch[field] = deleteFieldFn();
    }
  });

  const optionalStringFields: Array<[string, number]> = [
    ['aquariumType', 20],
    ['substrateType', 40],
    ['lightIntensity', 20],
    ['lightModelId', 120],
    ['lightModelName', 160],
    ['roomTemperatureMode', 30],
    ['plantDensity', 20],
    ['hardscapeDensity', 20],
    ['hidingPlacesEstimated', 20],
    ['lineOfSightBreaks', 20],
    ['waterProfile', 30],
    ['singleSpeciesFishId', 128],
    ['onboardingMode', 30],
  ];
  optionalStringFields.forEach(([field, maxLen]) => {
    if (!hasOwnField(normalizedTank, field)) {
      return;
    }
    const value = (normalizedTank as Record<string, unknown>)[field];
    if (value === null || value === undefined) {
      return;
    }
    if (typeof value !== 'string' || value.length > maxLen) {
      patch[field] = deleteFieldFn();
    }
  });

  const optionalTimestampFields = ['onboardingStartAt'];
  optionalTimestampFields.forEach((field) => {
    if (!hasOwnField(normalizedTank, field)) {
      return;
    }
    const value = (normalizedTank as Record<string, unknown>)[field];
    if (!isTimestampLike(value)) {
      patch[field] = deleteFieldFn();
    }
  });

  if (hasOwnField(normalizedTank, 'lightHours')) {
    const lightHours = Number((normalizedTank as Record<string, unknown>).lightHours);
    if (!Number.isFinite(lightHours) || lightHours < 1 || lightHours > 24) {
      patch.lightHours = deleteFieldFn();
    }
  }

  if (hasOwnField(normalizedTank, 'lightLumens')) {
    const lightLumens = Number((normalizedTank as Record<string, unknown>).lightLumens);
    if (!Number.isFinite(lightLumens) || lightLumens <= 0) {
      patch.lightLumens = deleteFieldFn();
    }
  }

  ['lengthCm', 'widthCm', 'heightCm', 'hidingPlacesCount', 'targetTemperatureC', 'ambientTemperatureC'].forEach((field) => {
    if (!hasOwnField(normalizedTank, field)) {
      return;
    }
    const parsed = Number((normalizedTank as Record<string, unknown>)[field]);
    if (!Number.isFinite(parsed) || parsed < 0) {
      patch[field] = deleteFieldFn();
    }
  });
  if (hasOwnField(normalizedTank, 'targetTemperatureC')) {
    const targetTemp = Number((normalizedTank as Record<string, unknown>).targetTemperatureC);
    if (!Number.isFinite(targetTemp) || targetTemp < 5 || targetTemp > 40) {
      patch.targetTemperatureC = deleteFieldFn();
    }
  }
  if (hasOwnField(normalizedTank, 'ambientTemperatureC')) {
    const ambientTemp = Number((normalizedTank as Record<string, unknown>).ambientTemperatureC);
    if (!Number.isFinite(ambientTemp) || ambientTemp < 0 || ambientTemp > 45) {
      patch.ambientTemperatureC = deleteFieldFn();
    }
  }
  if (hasOwnField(normalizedTank, 'roomTemperatureMode')) {
    const mode = normalizeRoomTemperatureMode((normalizedTank as Record<string, unknown>).roomTemperatureMode);
    if (!mode) {
      patch.roomTemperatureMode = deleteFieldFn();
    }
  }

  if (hasOwnField(normalizedTank, 'aquariumType')) {
    const allowedAquariumTypes = new Set([
      'plant',
      'shrimp',
      'mixed',
      'general',
      'planted_low_tech',
      'planted_high_tech',
      'malawi',
      'tanganyika',
      'betta_or_calm_fish',
      '',
    ]);
    const value = String((normalizedTank as Record<string, unknown>).aquariumType ?? '')
      .trim()
      .toLowerCase();
    if (!allowedAquariumTypes.has(value)) {
      patch.aquariumType = deleteFieldFn();
    }
  }

  if (hasOwnField(normalizedTank, 'lightIntensity')) {
    const allowedLightIntensities = new Set(['low', 'medium', 'high', '']);
    const value = String((normalizedTank as Record<string, unknown>).lightIntensity ?? '')
      .trim()
      .toLowerCase();
    if (!allowedLightIntensities.has(value)) {
      patch.lightIntensity = deleteFieldFn();
    }
  }

  if (hasOwnField(normalizedTank, 'lightModelId')) {
    const value = String((normalizedTank as Record<string, unknown>).lightModelId ?? '')
      .trim()
      .toLowerCase();
    if (!value || value.length > 120) {
      patch.lightModelId = deleteFieldFn();
    }
  }

  if (hasOwnField(normalizedTank, 'onboardingMode')) {
    const allowedModes = new Set(['fresh_start', 'restart', 'mature_media_start']);
    const value = String((normalizedTank as Record<string, unknown>).onboardingMode ?? '')
      .trim()
      .toLowerCase();
    if (value === 'existing_running') {
      patch.onboardingMode = 'mature_media_start';
    } else if (!allowedModes.has(value)) {
      patch.onboardingMode = deleteFieldFn();
    }
  }

  if (hasOwnField(normalizedTank, 'onboardingEnabled')) {
    const value = (normalizedTank as Record<string, unknown>).onboardingEnabled;
    if (value !== null && value !== undefined && typeof value !== 'boolean') {
      patch.onboardingEnabled = deleteFieldFn();
    }
  }

  if (hasOwnField(normalizedTank, 'waterProfile')) {
    const allowedWaterProfiles = new Set(waterProfileOptionsValues);
    const value = String((normalizedTank as Record<string, unknown>).waterProfile ?? '')
      .trim()
      .toLowerCase();
    if (!allowedWaterProfiles.has(value)) {
      patch.waterProfile = deleteFieldFn();
    }
  }

  ['plantDensity', 'hardscapeDensity', 'hidingPlacesEstimated', 'lineOfSightBreaks'].forEach((field) => {
    if (!hasOwnField(normalizedTank, field)) {
      return;
    }
    const normalized = normalizeDensityLevel((normalizedTank as Record<string, unknown>)[field]);
    if (!normalized) {
      patch[field] = deleteFieldFn();
    }
  });

  if (hasOwnField(normalizedTank, 'substrateTypes')) {
    const value = (normalizedTank as Record<string, unknown>).substrateTypes;
    if (!Array.isArray(value)) {
      patch.substrateTypes = deleteFieldFn();
    } else {
      const normalized = normalizeSubstrateTypes(value).slice(0, 12);
      patch.substrateTypes = normalized;
      if (!hasOwnField(normalizedTank, 'substrateType')) {
        patch.substrateType = normalized[0] ?? '';
      }
    }
  }

  const optionalListFields: Array<[string, number]> = [
    ['plantFertilizationEntries', 200],
    ['heaterEquipments', 30],
    ['filterEquipments', 30],
  ];
  optionalListFields.forEach(([field, maxSize]) => {
    if (!hasOwnField(normalizedTank, field)) {
      return;
    }
    const value = (normalizedTank as Record<string, unknown>)[field];
    if (!Array.isArray(value)) {
      if (value !== null && value !== undefined) {
        patch[field] = deleteFieldFn();
      }
      return;
    }
    if (value.length > maxSize) {
      patch[field] = value.slice(0, maxSize);
    }
  });

  const optionalMapFields: Array<[string, number]> = [
    ['targetRanges', 40],
    ['heaterEquipment', 30],
    ['filterEquipment', 30],
    ['zones', 20],
    ['onboardingTaskChecks', 300],
    ['maintenanceActionState', 60],
  ];
  optionalMapFields.forEach(([field, maxSize]) => {
    if (!hasOwnField(normalizedTank, field)) {
      return;
    }
    const value = (normalizedTank as Record<string, unknown>)[field];
    if (value === null || value === undefined) {
      return;
    }
    if (!isPlainMap(value)) {
      patch[field] = deleteFieldFn();
      return;
    }
    const keys = Object.keys(value);
    if (keys.length > maxSize) {
      const trimmed: Record<string, unknown> = {};
      keys.slice(0, maxSize).forEach((key) => {
        trimmed[key] = (value as Record<string, unknown>)[key];
      });
      patch[field] = trimmed;
    }
  });

  if (hasOwnField(normalizedTank, 'zones')) {
    const value = (normalizedTank as Record<string, unknown>).zones;
    if (value === null || value === undefined) {
      patch.zones = deleteFieldFn();
    } else if (!isPlainMap(value)) {
      patch.zones = deleteFieldFn();
    } else {
      const allowedZoneKeys = ['openSwimmingSpace', 'bottomArea', 'caveArea', 'plantArea'];
      const normalizedZones: Record<string, unknown> = {};
      allowedZoneKeys.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
          return;
        }
        const normalized = normalizeDensityLevel((value as Record<string, unknown>)[key]);
        if (normalized) {
          normalizedZones[key] = normalized;
        }
      });
      patch.zones = normalizedZones;
    }
  }

  return patch;
}

export function buildTankUpdatePayloadRuntime({
  currentTank,
  updates,
  deps,
  includeUpdatedAt = true,
  now = new Date(),
}: BuildTankUpdatePayloadParams): Record<string, unknown> {
  const basePatch = buildTankSanitizationPatchRuntime(currentTank, deps);
  return {
    ...basePatch,
    ...updates,
    ...(includeUpdatedAt ? { updatedAt: now } : {}),
  };
}

