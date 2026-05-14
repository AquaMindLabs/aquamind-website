export function normalizeTankTargetRangesService(
  value,
  profile,
  deps = {}
) {
  const { getWaterTargetDefaults, WATER_TARGET_FIELDS } = deps;
  const defaults = getWaterTargetDefaults(profile);
  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const next = { ...defaults };
  WATER_TARGET_FIELDS.forEach((field) => {
    const rawRange = value[field.key];
    if (!rawRange || typeof rawRange !== 'object') {
      return;
    }

    const min = Number(rawRange.min);
    const max = Number(rawRange.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      return;
    }

    next[field.key] = { min, max };
  });

  return next;
}

export function buildTargetRangeInputDraftFromRangesService(
  ranges,
  profile,
  deps = {}
) {
  const { WATER_TARGET_FIELDS } = deps;
  const normalized = normalizeTankTargetRangesService(ranges, profile, deps);
  const draft = {};

  WATER_TARGET_FIELDS.forEach((field) => {
    const range = normalized[field.key];
    draft[`${field.key}Min`] = String(range?.min ?? '');
    draft[`${field.key}Max`] = String(range?.max ?? '');
  });

  return draft;
}

export function parseTankTargetRangeDraftOrThrowService(
  draft,
  profile,
  deps = {}
) {
  const {
    WATER_TARGET_FIELDS,
    getWaterTargetDefaults,
    parseNumberOrThrow,
  } = deps;

  const fallback = getWaterTargetDefaults(profile);
  const result = {};

  WATER_TARGET_FIELDS.forEach((field) => {
    const minKey = `${field.key}Min`;
    const maxKey = `${field.key}Max`;
    const rawMin = String(draft?.[minKey] ?? '').trim();
    const rawMax = String(draft?.[maxKey] ?? '').trim();
    const minValue =
      rawMin.length === 0
        ? Number(fallback[field.key]?.min)
        : parseNumberOrThrow(`${field.label} min`, rawMin);
    const maxValue =
      rawMax.length === 0
        ? Number(fallback[field.key]?.max)
        : parseNumberOrThrow(`${field.label} max`, rawMax);

    if (minValue > maxValue) {
      throw new Error(`Zakres ${field.label}: min nie moze byc wieksze od max.`);
    }

    result[field.key] = {
      min: minValue,
      max: maxValue,
    };
  });

  return result;
}

export function getWaterAnalysisOptionsForTankService(tank, deps = {}) {
  const {
    getDefaultWaterProfileForAquariumType,
    normalizeWaterProfile,
  } = deps;

  const defaultProfile = getDefaultWaterProfileForAquariumType(tank?.aquariumType);
  const profile = normalizeWaterProfile(tank?.waterProfile ?? defaultProfile);
  const targetRanges = normalizeTankTargetRangesService(tank?.targetRanges, profile, deps);

  return {
    targetRanges,
  };
}
