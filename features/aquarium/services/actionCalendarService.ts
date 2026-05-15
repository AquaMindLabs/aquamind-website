import { normalizeMaintenanceActionState } from '@/features/aquarium/services/actionStateService';

type WaterTestingParameterPlan = {
  key?: string;
  label?: string;
  reason?: string;
  level?: string;
  cadenceDays?: number;
  dayBucketMs?: number;
};

type WaterTestingScheduleLike = {
  parameters?: WaterTestingParameterPlan[];
};

type CalendarAction = {
  id: string;
  stateKey: string;
  kind: string;
  level: string;
  isOverdue: boolean;
  dayBucketMs: number;
  sourceDueDayBucketMs: number;
  intervalDays: number;
  title: string;
  details: string;
};

type CalendarDay = {
  dayBucketMs: number;
  date: string;
  actions: CalendarAction[];
};

export type WaterActionCalendar = {
  windowDays: number;
  totalActions: number;
  days: CalendarDay[];
  overdueCount: number;
  waterChangeIntervalDays: number;
  gravelVacuumIntervalDays: number;
  filterServiceIntervalDays: number;
};

function getDayBucketMs(value: unknown): number {
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

function getMeasurementRecordedAtMs(measurement: unknown): number {
  const entry = (measurement ?? {}) as Record<string, unknown>;
  const measuredAt = entry.measuredAt;
  const createdAt = entry.createdAt;
  const measuredAtMs = Number(
    typeof measuredAt === 'object' &&
      measuredAt &&
      'toMillis' in (measuredAt as Record<string, unknown>) &&
      typeof (measuredAt as { toMillis?: unknown }).toMillis === 'function'
      ? (measuredAt as { toMillis: () => number }).toMillis()
      : new Date(String(measuredAt ?? '')).getTime()
  );
  if (Number.isFinite(measuredAtMs) && measuredAtMs > 0) {
    return measuredAtMs;
  }
  const createdAtMs = Number(
    typeof createdAt === 'object' &&
      createdAt &&
      'toMillis' in (createdAt as Record<string, unknown>) &&
      typeof (createdAt as { toMillis?: unknown }).toMillis === 'function'
      ? (createdAt as { toMillis: () => number }).toMillis()
      : new Date(String(createdAt ?? '')).getTime()
  );
  return Number.isFinite(createdAtMs) && createdAtMs > 0 ? createdAtMs : 0;
}

function defaultFormatDateOnly(value: number): string {
  if (!value || !Number.isFinite(value)) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
}

function chooseMoreUrgentAction(current: CalendarAction, incoming: CalendarAction): CalendarAction {
  if (incoming.isOverdue && !current.isOverdue) {
    return incoming;
  }
  if (!incoming.isOverdue && current.isOverdue) {
    return current;
  }
  if (incoming.dayBucketMs < current.dayBucketMs) {
    return incoming;
  }
  return current;
}

export function buildWaterActionCalendar(params: {
  maintenanceActionState: unknown;
  waterTestingSchedule: WaterTestingScheduleLike | null | undefined;
  latestMeasurement: unknown;
  formatDateOnly?: (value: number) => string;
  windowDays?: number;
  today?: Date;
}): WaterActionCalendar {
  const {
    maintenanceActionState,
    waterTestingSchedule,
    latestMeasurement,
    formatDateOnly = defaultFormatDateOnly,
    windowDays = 14,
    today = new Date(),
  } = params;

  const dayMs = 24 * 60 * 60 * 1000;
  const todayDayBucketMs = getDayBucketMs(today);
  const endDayBucketMs = todayDayBucketMs + (windowDays - 1) * dayMs;
  const waterChangeIntervalDays = 7;
  const gravelVacuumIntervalDays = 21;
  const filterServiceIntervalDays = 21;
  const parameterPlans = Array.isArray(waterTestingSchedule?.parameters)
    ? waterTestingSchedule.parameters
    : [];
  const latestMeasurementMs = getMeasurementRecordedAtMs(latestMeasurement);
  const latestMeasurementDayBucketMs = getDayBucketMs(latestMeasurementMs);
  const state = normalizeMaintenanceActionState(maintenanceActionState);
  const nearestActionByStateKey = new Map<string, CalendarAction>();

  const addNearestAction = (action: CalendarAction) => {
    if (
      !Number.isFinite(action.dayBucketMs) ||
      action.dayBucketMs < todayDayBucketMs ||
      action.dayBucketMs > endDayBucketMs
    ) {
      return;
    }
    const existing = nearestActionByStateKey.get(action.stateKey);
    if (!existing) {
      nearestActionByStateKey.set(action.stateKey, action);
      return;
    }
    nearestActionByStateKey.set(
      action.stateKey,
      chooseMoreUrgentAction(existing, action)
    );
  };

  const scheduleRecurringAction = ({
    stateKey,
    title,
    details,
    intervalDays,
    fallbackDayBucketMs = todayDayBucketMs,
  }: {
    stateKey: string;
    title: string;
    details: string;
    intervalDays: number;
    fallbackDayBucketMs?: number;
  }) => {
    const stateEntry = state[stateKey] ?? {};
    const completedAtMs = Number(stateEntry?.lastCompletedAtMs) || 0;
    const skippedAtMs = Number(stateEntry?.lastSkippedAtMs) || 0;
    const postponedUntilMs = Number(stateEntry?.postponedUntilMs) || 0;
    const referenceDayBucketMs = Math.max(
      completedAtMs,
      skippedAtMs,
      fallbackDayBucketMs
    );
    let firstDueDayBucketMs =
      referenceDayBucketMs > 0
        ? referenceDayBucketMs + intervalDays * dayMs
        : todayDayBucketMs;
    if (postponedUntilMs > firstDueDayBucketMs) {
      firstDueDayBucketMs = postponedUntilMs;
    }

    const isOverdue = firstDueDayBucketMs < todayDayBucketMs;
    const displayDayBucketMs = isOverdue ? todayDayBucketMs : firstDueDayBucketMs;
    addNearestAction({
      id: `${stateKey}-${displayDayBucketMs}`,
      stateKey,
      kind: stateKey,
      level: isOverdue ? 'problem' : 'ok',
      isOverdue: Boolean(isOverdue),
      dayBucketMs: displayDayBucketMs,
      sourceDueDayBucketMs: firstDueDayBucketMs,
      intervalDays,
      title,
      details,
    });
  };

  scheduleRecurringAction({
    stateKey: 'water_change',
    title: 'Podmiana wody (20-30%)',
    details: 'Regularna podmiana wspiera stabilnosc biologiczna i kontroluje NO3.',
    intervalDays: waterChangeIntervalDays,
  });
  scheduleRecurringAction({
    stateKey: 'gravel_vacuum',
    title: 'Odmulanie dna',
    details: 'Najlepiej sekcjami i razem z podmiana, bez naruszania calego dna naraz.',
    intervalDays: gravelVacuumIntervalDays,
  });
  scheduleRecurringAction({
    stateKey: 'filter_service',
    title: 'Serwis filtra',
    details:
      'Kontrola przeplywu, prefiltra i wirnika. Media biologiczne plucz delikatnie, nie wszystkie naraz.',
    intervalDays: filterServiceIntervalDays,
  });

  const testsByDay = new Map<number, Array<WaterTestingParameterPlan & {
    cadenceDays: number;
    isOverdue: boolean;
    displayDayBucketMs: number;
    sourceDueDayBucketMs: number;
  }>>();
  const testStateEntry = state.water_tests ?? {};
  const testCompletedAtMs = Number(testStateEntry?.lastCompletedAtMs) || 0;
  const testSkippedAtMs = Number(testStateEntry?.lastSkippedAtMs) || 0;
  const testPostponedUntilMs = Number(testStateEntry?.postponedUntilMs) || 0;
  const testReferenceDayBucketMs = Math.max(
    testCompletedAtMs,
    testSkippedAtMs,
    latestMeasurementDayBucketMs
  );

  parameterPlans.forEach((plan) => {
    const cadenceDays = Math.max(1, Math.round(Number(plan?.cadenceDays) || 1));
    let nextDayBucketMs =
      Number.isFinite(Number(plan?.dayBucketMs)) && Number(plan?.dayBucketMs) > 0
        ? Number(plan?.dayBucketMs)
        : todayDayBucketMs;
    if (testReferenceDayBucketMs > 0) {
      nextDayBucketMs = Math.max(
        nextDayBucketMs,
        testReferenceDayBucketMs + cadenceDays * dayMs
      );
    }
    if (testPostponedUntilMs > nextDayBucketMs) {
      nextDayBucketMs = testPostponedUntilMs;
    }

    const isOverdue = nextDayBucketMs < todayDayBucketMs;
    const displayDayBucketMs = isOverdue ? todayDayBucketMs : nextDayBucketMs;
    if (displayDayBucketMs > endDayBucketMs) {
      return;
    }
    const current = testsByDay.get(displayDayBucketMs) ?? [];
    current.push({
      ...plan,
      cadenceDays,
      isOverdue,
      displayDayBucketMs,
      sourceDueDayBucketMs: nextDayBucketMs,
    });
    testsByDay.set(displayDayBucketMs, current);
  });

  const nearestTestsDayBucketMs = [...testsByDay.keys()].sort((a, b) => a - b)[0];
  if (Number.isFinite(nearestTestsDayBucketMs)) {
    const dayPlans = testsByDay.get(nearestTestsDayBucketMs) ?? [];
    const labels = [
      ...new Set(
        dayPlans
          .map((plan) => String(plan?.label ?? plan?.key ?? '').trim())
          .filter(Boolean)
      ),
    ];
    const reasons = [
      ...new Set(dayPlans.map((plan) => String(plan?.reason ?? '').trim()).filter(Boolean)),
    ];
    const highestLevel = dayPlans.reduce((level, plan) => {
      const normalized = String(plan?.level ?? '').toLowerCase();
      if (normalized === 'problem') {
        return 'problem';
      }
      if (normalized === 'warning' && level !== 'problem') {
        return 'warning';
      }
      return level;
    }, 'ok');
    const hasOverduePlan = dayPlans.some((plan) => Boolean(plan?.isOverdue));
    addNearestAction({
      id: `water-tests-${nearestTestsDayBucketMs}`,
      stateKey: 'water_tests',
      kind: 'water_tests',
      level: hasOverduePlan ? 'problem' : highestLevel,
      isOverdue: hasOverduePlan,
      dayBucketMs: nearestTestsDayBucketMs,
      sourceDueDayBucketMs:
        dayPlans[0]?.sourceDueDayBucketMs ?? nearestTestsDayBucketMs,
      intervalDays: Math.max(
        1,
        ...dayPlans.map((plan) => Number(plan?.cadenceDays) || 1)
      ),
      title: `Testy parametrow: ${labels.join(', ')}`,
      details:
        reasons.length > 0
          ? reasons.slice(0, 2).join(' ')
          : 'Zakres testow dobrany do historii pomiarow i wymaganej czestotliwosci badan.',
    });
  }

  const levelRank = (value: string) => (value === 'problem' ? 3 : value === 'warning' ? 2 : 1);
  const kindRank = (value: string) =>
    value === 'water_change'
      ? 1
      : value === 'water_tests'
        ? 2
        : value === 'gravel_vacuum'
          ? 3
          : 4;

  const actionDays = new Map<number, CalendarDay>();
  [...nearestActionByStateKey.values()].forEach((action) => {
    const existing = actionDays.get(action.dayBucketMs);
    const dayEntry =
      existing ??
      ({
        dayBucketMs: action.dayBucketMs,
        date: formatDateOnly(action.dayBucketMs),
        actions: [],
      } as CalendarDay);
    dayEntry.actions.push(action);
    actionDays.set(action.dayBucketMs, dayEntry);
  });

  const days = [...actionDays.values()]
    .sort((a, b) => a.dayBucketMs - b.dayBucketMs)
    .map((day) => ({
      ...day,
      actions: [...day.actions].sort((a, b) => {
        const byLevel = levelRank(b.level) - levelRank(a.level);
        if (byLevel !== 0) {
          return byLevel;
        }
        return kindRank(a.kind) - kindRank(b.kind);
      }),
    }));
  const overdueCount = days.reduce(
    (sum, day) => sum + day.actions.filter((action) => Boolean(action?.isOverdue)).length,
    0
  );

  return {
    windowDays,
    totalActions: days.reduce((sum, day) => sum + day.actions.length, 0),
    days,
    overdueCount,
    waterChangeIntervalDays,
    gravelVacuumIntervalDays,
    filterServiceIntervalDays,
  };
}
