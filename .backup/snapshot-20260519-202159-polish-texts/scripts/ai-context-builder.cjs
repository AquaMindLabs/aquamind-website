const DEFAULT_AI_CONTEXT_LIMITS = Object.freeze({
  maxTanks: 3,
  maxMeasurements: 6,
  maxMeasurementTrendPoints: 6,
  maxIssueHighlights: 4,
  maxActionHighlights: 4,
  maxContextChars: 12000,
  maxStringLength: 160,
});

const DEFAULT_ACTION_INTERVAL_DAYS = Object.freeze({
  water_change: 7,
  water_tests: 3,
  gravel_vacuum: 21,
  filter_service: 21,
});

const CLOSED_ISSUE_STATUSES = new Set([
  'resolved',
  'closed',
  'done',
  'cancelled',
  'expired',
]);

function toSafeString(value, maxLength = DEFAULT_AI_CONTEXT_LIMITS.maxStringLength) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength);
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toTimestampMs(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  if (value && typeof value === 'object') {
    if (typeof value.toMillis === 'function') {
      const ms = Number(value.toMillis());
      if (Number.isFinite(ms) && ms > 0) {
        return ms;
      }
    }
    if (typeof value.toDate === 'function') {
      const date = value.toDate();
      const ms = Number(date?.getTime?.());
      if (Number.isFinite(ms) && ms > 0) {
        return ms;
      }
    }
  }

  const parsed = new Date(String(value ?? '')).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toIsoDate(value) {
  const ms = toTimestampMs(value);
  if (!ms) {
    return null;
  }
  return new Date(ms).toISOString();
}

function dayBucketMs(value) {
  const ms = toTimestampMs(value);
  if (!ms) {
    return 0;
  }
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveContextLimits(partial = {}) {
  return {
    maxTanks: Math.max(1, Number(partial.maxTanks) || DEFAULT_AI_CONTEXT_LIMITS.maxTanks),
    maxMeasurements: Math.max(
      1,
      Number(partial.maxMeasurements) || DEFAULT_AI_CONTEXT_LIMITS.maxMeasurements
    ),
    maxMeasurementTrendPoints: Math.max(
      2,
      Number(partial.maxMeasurementTrendPoints) ||
        DEFAULT_AI_CONTEXT_LIMITS.maxMeasurementTrendPoints
    ),
    maxIssueHighlights: Math.max(
      1,
      Number(partial.maxIssueHighlights) || DEFAULT_AI_CONTEXT_LIMITS.maxIssueHighlights
    ),
    maxActionHighlights: Math.max(
      1,
      Number(partial.maxActionHighlights) || DEFAULT_AI_CONTEXT_LIMITS.maxActionHighlights
    ),
    maxContextChars: Math.max(
      500,
      Number(partial.maxContextChars) || DEFAULT_AI_CONTEXT_LIMITS.maxContextChars
    ),
    maxStringLength: Math.max(
      24,
      Number(partial.maxStringLength) || DEFAULT_AI_CONTEXT_LIMITS.maxStringLength
    ),
  };
}

function normalizeStockType(type) {
  const normalized = toSafeString(type, 24).toLowerCase();
  if (normalized === 'fish' || normalized === 'plant') {
    return normalized;
  }
  return normalized || 'other';
}

function getSelectedTank(tanks, optionalTankId) {
  const requested = toSafeString(optionalTankId, 128);
  const selected =
    tanks.find((tank) => String(tank?.id ?? '') === requested) ?? tanks[0] ?? null;
  return selected;
}

function isIssueActive(issue) {
  const status = toSafeString(issue?.status, 32).toLowerCase() || 'active';
  return !CLOSED_ISSUE_STATUSES.has(status);
}

function buildMeasurementTrends(measurements, maxPoints) {
  const keys = ['ph', 'no2', 'no3', 'temperature'];
  return keys
    .map((key) => {
      const series = measurements
        .map((entry) => toFiniteNumber(entry?.[key]))
        .filter((value) => value !== null)
        .slice(0, maxPoints);
      if (series.length === 0) {
        return null;
      }

      const latest = series[0];
      const oldest = series[series.length - 1];
      const delta = Number((latest - oldest).toFixed(3));

      let direction = 'flat';
      if (series.length < 2) {
        direction = 'unknown';
      } else if (delta > 0.02) {
        direction = 'up';
      } else if (delta < -0.02) {
        direction = 'down';
      }

      return {
        key,
        latest,
        oldest,
        delta,
        direction,
        sampleCount: series.length,
      };
    })
    .filter(Boolean);
}

function extractEquipmentEntries(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item && typeof item === 'object');
  }
  if (value && typeof value === 'object') {
    return [value];
  }
  return [];
}

function buildActionHighlights(maintenanceActionState, todayBucketMs, maxHighlights) {
  const state =
    maintenanceActionState && typeof maintenanceActionState === 'object'
      ? maintenanceActionState
      : {};
  const definitions = [
    { key: 'water_change', label: 'Podmiana wody' },
    { key: 'water_tests', label: 'Testy wody' },
    { key: 'gravel_vacuum', label: 'Odmulanie dna' },
    { key: 'filter_service', label: 'Serwis filtra' },
  ];

  const highlights = definitions.map((def) => {
    const entry = state[def.key] ?? {};
    const lastCompletedAtMs = toTimestampMs(entry.lastCompletedAtMs);
    const lastSkippedAtMs = toTimestampMs(entry.lastSkippedAtMs);
    const postponedUntilMs = dayBucketMs(entry.postponedUntilMs);
    const intervalDays = DEFAULT_ACTION_INTERVAL_DAYS[def.key] ?? 7;
    const dayMs = 24 * 60 * 60 * 1000;
    const referenceMs = Math.max(lastCompletedAtMs, lastSkippedAtMs);
    let dueAtMs = referenceMs > 0 ? dayBucketMs(referenceMs + intervalDays * dayMs) : todayBucketMs;
    if (postponedUntilMs > dueAtMs) {
      dueAtMs = postponedUntilMs;
    }
    const status = dueAtMs < todayBucketMs ? 'overdue' : dueAtMs === todayBucketMs ? 'due_today' : 'planned';

    return {
      key: def.key,
      label: def.label,
      status,
      dueAt: dueAtMs ? new Date(dueAtMs).toISOString() : null,
      postponedUntil: postponedUntilMs ? new Date(postponedUntilMs).toISOString() : null,
      intervalDays,
    };
  });

  const rank = (status) => (status === 'overdue' ? 3 : status === 'due_today' ? 2 : 1);
  return highlights
    .sort((a, b) => rank(b.status) - rank(a.status))
    .slice(0, maxHighlights);
}

function buildUserAquariumContext(uid, optionalTankId = null, data = {}, options = {}) {
  const safeUid = toSafeString(uid, 128);
  const limits = resolveContextLimits(options?.limits);
  const tanks = toArray(data?.tanks);
  const measurements = toArray(data?.measurements);
  const stockItems = toArray(data?.stockItems);
  const issueCases = toArray(data?.issueCases);

  const selectedTank = getSelectedTank(tanks, optionalTankId);
  const selectedTankId = selectedTank?.id ? String(selectedTank.id) : null;
  const tankScopedMeasurements = selectedTankId
    ? measurements.filter((item) => String(item?.tankId ?? '') === selectedTankId)
    : measurements;
  const tankScopedStockItems = selectedTankId
    ? stockItems.filter((item) => String(item?.tankId ?? '') === selectedTankId)
    : stockItems;
  const tankScopedIssues = selectedTankId
    ? issueCases.filter((item) => String(item?.tankId ?? '') === selectedTankId)
    : issueCases;

  const latestMeasurement = tankScopedMeasurements[0] ?? null;
  const latestCoreMeasurements = latestMeasurement
    ? {
        ph: toFiniteNumber(latestMeasurement?.ph),
        no2: toFiniteNumber(latestMeasurement?.no2),
        no3: toFiniteNumber(latestMeasurement?.no3),
        temperature: toFiniteNumber(latestMeasurement?.temperature),
        measuredAt: toIsoDate(latestMeasurement?.measuredAt ?? latestMeasurement?.createdAt),
      }
    : null;

  const fishCount = tankScopedStockItems.filter(
    (item) => normalizeStockType(item?.type) === 'fish'
  ).length;
  const plantCount = tankScopedStockItems.filter(
    (item) => normalizeStockType(item?.type) === 'plant'
  ).length;
  const otherStockCount = Math.max(0, tankScopedStockItems.length - fishCount - plantCount);
  const activeIssues = tankScopedIssues.filter((issue) => isIssueActive(issue));
  const todayBucket = dayBucketMs(Date.now());
  const heaterItems = extractEquipmentEntries(
    selectedTank?.heaterEquipments ?? selectedTank?.heaterEquipment
  );
  const filterItems = extractEquipmentEntries(
    selectedTank?.filterEquipments ?? selectedTank?.filterEquipment
  );
  const onboardingTaskChecks =
    selectedTank?.onboardingTaskChecks &&
    typeof selectedTank.onboardingTaskChecks === 'object' &&
    !Array.isArray(selectedTank.onboardingTaskChecks)
      ? selectedTank.onboardingTaskChecks
      : {};

  const context = {
    selectedTank: selectedTank
      ? {
          id: String(selectedTank.id ?? ''),
          name: toSafeString(selectedTank.name, limits.maxStringLength),
          liters: toFiniteNumber(selectedTank.liters),
          aquariumType: toSafeString(selectedTank.aquariumType, 64),
        }
      : null,
    tankCount: tanks.length,
    measurementCount: tankScopedMeasurements.length,
    stockCount: tankScopedStockItems.length,
    fishCount,
    plantCount,
    activeIssueCount: activeIssues.length,
    latestCoreMeasurements,
    tankSummary: {
      selectedTankId,
      tanks: tanks.slice(0, limits.maxTanks).map((tank) => ({
        id: toSafeString(tank?.id, 128),
        name: toSafeString(tank?.name, limits.maxStringLength),
        liters: toFiniteNumber(tank?.liters),
        aquariumType: toSafeString(tank?.aquariumType, 48),
      })),
      hasData: tanks.length > 0,
    },
    measurements: {
      latest: tankScopedMeasurements.slice(0, limits.maxMeasurements).map((item) => ({
        measuredAt: toIsoDate(item?.measuredAt ?? item?.createdAt),
        ph: toFiniteNumber(item?.ph),
        no2: toFiniteNumber(item?.no2),
        no3: toFiniteNumber(item?.no3),
        temperature: toFiniteNumber(item?.temperature),
      })),
      trends: buildMeasurementTrends(
        tankScopedMeasurements,
        limits.maxMeasurementTrendPoints
      ),
    },
    stockSummary: {
      total: tankScopedStockItems.length,
      fishCount,
      plantCount,
      otherCount: otherStockCount,
    },
    equipmentSummary: {
      heaterCount: heaterItems.length,
      filterCount: filterItems.length,
      hasLightConfigured:
        Boolean(toSafeString(selectedTank?.lightModelId, 128)) ||
        Boolean(toSafeString(selectedTank?.lightModelName, 128)),
      total: heaterItems.length + filterItems.length,
    },
    activeIssues: {
      count: activeIssues.length,
      highlights: activeIssues.slice(0, limits.maxIssueHighlights).map((item) => ({
        id: toSafeString(item?.id, 128),
        status: toSafeString(item?.status, 48) || 'active',
        type:
          toSafeString(item?.diseaseType, 80) ||
          toSafeString(item?.issueType, 80) ||
          toSafeString(item?.name, 80) ||
          'issue',
        openedAt: toIsoDate(item?.createdAt ?? item?.updatedAt),
      })),
    },
    onboardingHighlights: {
      enabled: Boolean(selectedTank?.onboardingEnabled),
      mode: toSafeString(selectedTank?.onboardingMode, 64) || null,
      startAt: toIsoDate(selectedTank?.onboardingStartAt ?? selectedTank?.createdAt),
      completedTaskCount: Object.values(onboardingTaskChecks).filter(Boolean).length,
    },
    actionCalendarHighlights: {
      highlights: buildActionHighlights(
        selectedTank?.maintenanceActionState,
        todayBucket,
        limits.maxActionHighlights
      ),
    },
    meta: {
      contextVersion: 1,
      fallbackUsed: false,
      trimmedBySizeLimit: false,
      sourceScope: selectedTankId ? 'single_tank' : 'user_all_tanks',
      hasMinimalData: !safeUid || tanks.length === 0,
    },
  };

  context.actionCalendarHighlights.overdueCount =
    context.actionCalendarHighlights.highlights.filter(
      (item) => String(item?.status ?? '') === 'overdue'
    ).length;

  const estimateChars = () => JSON.stringify(context).length;
  if (estimateChars() > limits.maxContextChars) {
    context.tankSummary.tanks = context.tankSummary.tanks.slice(0, 1);
    context.measurements.latest = context.measurements.latest.slice(0, 2);
    context.measurements.trends = context.measurements.trends.slice(0, 2);
    context.activeIssues.highlights = context.activeIssues.highlights.slice(0, 1);
    context.actionCalendarHighlights.highlights =
      context.actionCalendarHighlights.highlights.slice(0, 1);
    context.meta.trimmedBySizeLimit = true;
  }

  if (estimateChars() > limits.maxContextChars) {
    const fallbackContext = {
      selectedTank: context.selectedTank,
      tankCount: context.tankCount,
      measurementCount: context.measurementCount,
      stockCount: context.stockCount,
      fishCount: context.fishCount,
      plantCount: context.plantCount,
      activeIssueCount: context.activeIssueCount,
      latestCoreMeasurements: context.latestCoreMeasurements,
      tankSummary: {
        selectedTankId,
        hasData: context.tankSummary.hasData,
        tanks: context.tankSummary.tanks.slice(0, 1),
      },
      measurements: {
        latest: context.measurements.latest.slice(0, 1),
        trends: context.measurements.trends.slice(0, 1),
      },
      stockSummary: context.stockSummary,
      equipmentSummary: context.equipmentSummary,
      activeIssues: {
        count: context.activeIssues.count,
        highlights: [],
      },
      onboardingHighlights: context.onboardingHighlights,
      actionCalendarHighlights: {
        highlights: [],
        overdueCount: context.actionCalendarHighlights.overdueCount,
      },
      meta: {
        contextVersion: 1,
        fallbackUsed: true,
        trimmedBySizeLimit: true,
        sourceScope: selectedTankId ? 'single_tank' : 'user_all_tanks',
        hasMinimalData: context.meta.hasMinimalData,
      },
    };

    if (JSON.stringify(fallbackContext).length <= limits.maxContextChars) {
      return fallbackContext;
    }

    return {
      selectedTank: fallbackContext.selectedTank
        ? {
            id: toSafeString(fallbackContext.selectedTank.id, 64),
            name: toSafeString(fallbackContext.selectedTank.name, 64),
          }
        : null,
      tankCount: fallbackContext.tankCount,
      measurementCount: fallbackContext.measurementCount,
      stockCount: fallbackContext.stockCount,
      activeIssueCount: fallbackContext.activeIssueCount,
      meta: {
        contextVersion: 1,
        fallbackUsed: true,
        trimmedBySizeLimit: true,
        sourceScope: selectedTankId ? 'single_tank' : 'user_all_tanks',
        hasMinimalData: fallbackContext.meta.hasMinimalData,
      },
    };
  }

  return context;
}

module.exports = {
  DEFAULT_AI_CONTEXT_LIMITS,
  buildUserAquariumContext,
};
