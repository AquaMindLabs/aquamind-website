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
  stateKeys?: string[];
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

type WaterActionCalendarLabels = {
  waterChangeTitle: string;
  waterChangeDetails: string;
  gravelVacuumTitle: string;
  gravelVacuumDetails: string;
  filterServiceTitle: string;
  filterServiceDetails: string;
  waterTestTitle: string;
  waterTestOverdueDetails: string;
  waterTestScheduledDetails: string;
};

const DEFAULT_WATER_ACTION_CALENDAR_LABELS: WaterActionCalendarLabels = {
  waterChangeTitle: 'Podmiana wody (20-30%)',
  waterChangeDetails: 'Regularna podmiana wspiera stabilność biologiczną i kontroluje NO3.',
  gravelVacuumTitle: 'Odmulanie dna',
  gravelVacuumDetails: 'Najlepiej sekcjami i razem z podmianą, bez naruszania całego dna naraz.',
  filterServiceTitle: 'Serwis filtra',
  filterServiceDetails:
    'Kontrola przepływu, prefiltra i wirnika. Media biologiczne płucz delikatnie, nie wszystkie naraz.',
  waterTestTitle: 'Test parametru: {labels}',
  waterTestOverdueDetails: 'Test jest przeterminowany - wykonaj pomiar jak najszybciej.',
  waterTestScheduledDetails: 'Termin testu wyliczony na podstawie historii pomiarów.',
};

function formatCalendarLabel(template: string, vars: Record<string, string | number>): string {
  return String(template ?? '').replace(/\{(\w+)\}/g, (_, token) => {
    const value = vars[token];
    return value === undefined || value === null ? '' : String(value);
  });
}

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
  labels?: Partial<WaterActionCalendarLabels>;
  windowDays?: number;
  today?: Date;
}): WaterActionCalendar {
  const {
    maintenanceActionState,
    waterTestingSchedule,
    latestMeasurement,
    formatDateOnly = defaultFormatDateOnly,
    labels,
    windowDays = 14,
    today = new Date(),
  } = params;
  const calendarLabels = {
    ...DEFAULT_WATER_ACTION_CALENDAR_LABELS,
    ...(labels ?? {}),
  };

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
    title: calendarLabels.waterChangeTitle,
    details: calendarLabels.waterChangeDetails,
    intervalDays: waterChangeIntervalDays,
  });
  scheduleRecurringAction({
    stateKey: 'gravel_vacuum',
    title: calendarLabels.gravelVacuumTitle,
    details: calendarLabels.gravelVacuumDetails,
    intervalDays: gravelVacuumIntervalDays,
  });
  scheduleRecurringAction({
    stateKey: 'filter_service',
    title: calendarLabels.filterServiceTitle,
    details: calendarLabels.filterServiceDetails,
    intervalDays: filterServiceIntervalDays,
  });

  const testsByDay = new Map<number, Array<WaterTestingParameterPlan & {
    cadenceDays: number;
    isOverdue: boolean;
    displayDayBucketMs: number;
    sourceDueDayBucketMs: number;
  }>>();
  parameterPlans.forEach((plan) => {
    const cadenceDays = Math.max(1, Math.round(Number(plan?.cadenceDays) || 1));
    const parameterKey = String(plan?.key ?? '').trim().toLowerCase();
    const parameterStateKey = parameterKey ? `water_tests_${parameterKey}` : '';
    const parameterStateEntry = (parameterStateKey
      ? state[parameterStateKey] ?? {}
      : {}) as Record<string, unknown>;
    const parameterCompletedAtMs = Number(parameterStateEntry?.lastCompletedAtMs) || 0;
    const parameterSkippedAtMs = Number(parameterStateEntry?.lastSkippedAtMs) || 0;
    const parameterPostponedUntilMs = Number(parameterStateEntry?.postponedUntilMs) || 0;
    const parameterReferenceDayBucketMs = Math.max(parameterCompletedAtMs, parameterSkippedAtMs);
    let nextDayBucketMs =
      Number.isFinite(Number(plan?.dayBucketMs)) && Number(plan?.dayBucketMs) > 0
        ? Number(plan?.dayBucketMs)
        : latestMeasurementDayBucketMs || todayDayBucketMs;
    if (parameterReferenceDayBucketMs > 0) {
      nextDayBucketMs = Math.max(
        nextDayBucketMs,
        parameterReferenceDayBucketMs + cadenceDays * dayMs
      );
    }
    if (parameterPostponedUntilMs > nextDayBucketMs) {
      nextDayBucketMs = parameterPostponedUntilMs;
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

  [...testsByDay.keys()]
    .sort((a, b) => a - b)
    .forEach((dayBucketMs) => {
      const dayPlans = testsByDay.get(dayBucketMs) ?? [];
      if (dayPlans.length === 0) {
        return;
      }

      const hasOverduePlan = dayPlans.some((plan) => Boolean(plan?.isOverdue));
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
      const stateKeys = [
        ...new Set(
          dayPlans
            .map((plan, index) => {
              const key = String(plan?.key ?? '').trim().toLowerCase();
              return key ? `water_tests_${key}` : `water_tests_${dayBucketMs}_${index}`;
            })
            .filter(Boolean)
        ),
      ];
      const primaryStateKey =
        stateKeys[0] ?? `water_tests_${dayBucketMs}`;

      addNearestAction({
        id: `water-tests-${dayBucketMs}`,
        stateKey: primaryStateKey,
        stateKeys,
        kind: 'water_tests',
        level: hasOverduePlan ? 'problem' : highestLevel,
        isOverdue: hasOverduePlan,
        dayBucketMs,
        sourceDueDayBucketMs: Math.min(
          ...dayPlans.map((plan) => Number(plan?.sourceDueDayBucketMs) || dayBucketMs)
        ),
        intervalDays: Math.max(
          1,
          ...dayPlans.map((plan) => Number(plan?.cadenceDays) || 1)
        ),
        title: formatCalendarLabel(calendarLabels.waterTestTitle, {
          labels: labels.join(', '),
        }),
        details:
          reasons.length > 0
            ? reasons.slice(0, 2).join(' ')
            : hasOverduePlan
              ? calendarLabels.waterTestOverdueDetails
              : calendarLabels.waterTestScheduledDetails,
      });
    });

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
