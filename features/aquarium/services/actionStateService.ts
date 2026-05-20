export type MaintenanceActionStateEntry = {
  lastCompletedAtMs: number | null;
  lastSkippedAtMs: number | null;
  postponedUntilMs: number | null;
  updatedAtMs: number | null;
};

export type MaintenanceActionState = Record<string, MaintenanceActionStateEntry>;

export type MaintenanceActionMode = 'done' | 'skip' | 'postpone';

export type CalendarActionLike = {
  stateKey?: string;
  stateKeys?: string[];
  sourceDueDayBucketMs?: number;
};

function toDayBucketMs(value: unknown): number {
  const asNumber = Number(value);
  let ms = Number.isFinite(asNumber) && asNumber > 0 ? asNumber : 0;
  if (!ms && value instanceof Date) {
    ms = value.getTime();
  }
  if (!ms && typeof value === 'string') {
    ms = new Date(value).getTime();
  }
  if (!Number.isFinite(ms) || ms <= 0) {
    return 0;
  }
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function toPositiveMs(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

export function normalizeMaintenanceActionState(value: unknown): MaintenanceActionState {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce(
    (acc, [rawKey, rawEntry]) => {
      const key = String(rawKey ?? '').trim().toLowerCase();
      if (!key || !rawEntry || typeof rawEntry !== 'object') {
        return acc;
      }

      const entry = rawEntry as Record<string, unknown>;
      const normalizedEntry: MaintenanceActionStateEntry = {
        lastCompletedAtMs: toPositiveMs(entry.lastCompletedAtMs),
        lastSkippedAtMs: toPositiveMs(entry.lastSkippedAtMs),
        postponedUntilMs: toPositiveMs(entry.postponedUntilMs),
        updatedAtMs: toPositiveMs(entry.updatedAtMs),
      };

      if (
        !normalizedEntry.lastCompletedAtMs &&
        !normalizedEntry.lastSkippedAtMs &&
        !normalizedEntry.postponedUntilMs &&
        !normalizedEntry.updatedAtMs
      ) {
        return acc;
      }

      acc[key] = normalizedEntry;
      return acc;
    },
    {} as MaintenanceActionState
  );
}

export function buildNextMaintenanceActionState(params?: {
  currentState: unknown;
  action: CalendarActionLike | null | undefined;
  mode: MaintenanceActionMode;
  latestMeasurementDayBucketMs?: number;
  now?: Date;
}): { nextState: MaintenanceActionState; actionStateKey: string } | null {
  const safeParams = params && typeof params === 'object' ? params : null;
  const action = safeParams?.action ?? null;
  const mode: MaintenanceActionMode = safeParams?.mode ?? 'done';
  const latestMeasurementDayBucketMs = Number(safeParams?.latestMeasurementDayBucketMs ?? 0);
  const now = safeParams?.now ?? new Date();
  const actionStateKey = String(action?.stateKey ?? '').trim().toLowerCase();
  const actionStateKeys = Array.isArray(action?.stateKeys)
    ? action.stateKeys
        .map((item) => String(item ?? '').trim().toLowerCase())
        .filter(Boolean)
    : [];
  const uniqueStateKeys = [...new Set([actionStateKey, ...actionStateKeys].filter(Boolean))];
  if (uniqueStateKeys.length === 0) {
    return null;
  }

  const nowDayBucketMs = toDayBucketMs(now);
  const dayMs = 24 * 60 * 60 * 1000;
  const sourceDueDayBucketMs =
    Number.isFinite(Number(action?.sourceDueDayBucketMs)) &&
    Number(action?.sourceDueDayBucketMs) > 0
      ? Number(action?.sourceDueDayBucketMs)
      : nowDayBucketMs;

  const normalized = normalizeMaintenanceActionState(safeParams?.currentState);
  const nextState: MaintenanceActionState = {
    ...normalized,
  };
  const updateStateEntry = (stateKey: string) => {
    const currentEntry = normalized[stateKey] ?? {
      lastCompletedAtMs: null,
      lastSkippedAtMs: null,
      postponedUntilMs: null,
      updatedAtMs: null,
    };
    const nextEntry: MaintenanceActionStateEntry = {
      ...currentEntry,
      updatedAtMs: Date.now(),
    };
    const isWaterTestsState = stateKey === 'water_tests' || stateKey.startsWith('water_tests_');

    if (mode === 'done') {
      nextEntry.lastCompletedAtMs = isWaterTestsState
        ? Math.max(nowDayBucketMs, Number(latestMeasurementDayBucketMs) || 0)
        : nowDayBucketMs;
      nextEntry.postponedUntilMs = null;
    } else if (mode === 'skip') {
      nextEntry.lastSkippedAtMs = Math.max(nowDayBucketMs, sourceDueDayBucketMs);
      nextEntry.postponedUntilMs = null;
    } else if (mode === 'postpone') {
      const baseDayBucketMs = Math.max(nowDayBucketMs, sourceDueDayBucketMs);
      nextEntry.postponedUntilMs = baseDayBucketMs + dayMs;
    } else {
      return false;
    }

    nextState[stateKey] = nextEntry;
    return true;
  };

  for (const stateKey of uniqueStateKeys) {
    const ok = updateStateEntry(stateKey);
    if (!ok) {
      return null;
    }
  }

  return { nextState, actionStateKey: uniqueStateKeys[0] ?? '' };
}
