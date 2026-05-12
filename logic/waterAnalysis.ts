export type WaterSeverity = 'ok' | 'warning' | 'critical';
export type WaterTestingLevel = 'ok' | 'warning' | 'problem';

type RecommendationInput = {
  severity: WaterSeverity;
  parameter: string;
  value: string;
  expectedRange: string;
  issue: string;
  action: string;
  dueInDays?: number;
};

export type WaterRecommendation = RecommendationInput & {
  dueInDays: number;
};

export type EnabledTests = Record<string, boolean | undefined>;
export type GenericRecord = Record<string, unknown>;
export type WaterTargetRange = {
  min: number;
  max: number;
};
export type WaterAnalysisOptions = {
  targetRanges?: Partial<Record<string, Partial<WaterTargetRange> | null | undefined>>;
};

export type WaterAnalysisResult = {
  status: WaterSeverity;
  summary: string;
  recommendations: WaterRecommendation[];
};

export type WaterRiskNote = {
  severity: 'warning' | 'critical';
  text: string;
};

export type WaterTestingParameterPlan = {
  key: string;
  label: string;
  level: WaterTestingLevel;
  cadenceDays: number;
  cadenceLabel: string;
  reason: string;
  nextTestAtMs: number;
  dayBucketMs: number;
  isOverdue: boolean;
};

export type WaterTestingTask = {
  key: string;
  label: string;
  level: WaterTestingLevel;
  reason: string;
  nextTestAtMs: number;
};

export type WaterTestingDay = {
  dayBucketMs: number;
  date: string;
  tasks: WaterTestingTask[];
};

export type WaterTestingScheduleResult = {
  parameters: WaterTestingParameterPlan[];
  daysWithTasks: WaterTestingDay[];
  nextTestAtMs: number;
  isOverdue: boolean;
  reason: string;
  requiresPostWaterChangeTest: boolean;
};

const SEVERITY_PRIORITY: Record<WaterSeverity, number> = {
  ok: 0,
  warning: 1,
  critical: 2,
};

const DEFAULT_TARGET_RANGES: Record<string, WaterTargetRange> = {
  ph: { min: 6.5, max: 7.8 },
  gh: { min: 5, max: 14 },
  kh: { min: 3, max: 8 },
  no2: { min: 0, max: 0.05 },
  no3: { min: 5, max: 25 },
  nh3nh4: { min: 0, max: 0.05 },
  po4: { min: 0.1, max: 1.0 },
  fe: { min: 0.02, max: 0.2 },
  ca: { min: 20, max: 60 },
  mg: { min: 5, max: 20 },
  k: { min: 5, max: 30 },
  tds: { min: 80, max: 450 },
  temperature: { min: 24, max: 27 },
  co2: { min: 10, max: 30 },
};

function toNumeric(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getCreatedAtMs(createdAt: unknown): number {
  if (!createdAt) {
    return 0;
  }

  if (
    typeof createdAt === 'object' &&
    createdAt !== null &&
    'toMillis' in createdAt &&
    typeof (createdAt as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (createdAt as { toMillis: () => number }).toMillis();
  }

  if (createdAt instanceof Date) {
    return createdAt.getTime();
  }

  const parsed = new Date(createdAt as string | number).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getMeasurementRecordedAtMs(measurement: GenericRecord | null | undefined): number {
  if (!measurement) {
    return 0;
  }

  return getCreatedAtMs(measurement.measuredAt ?? measurement.createdAt);
}

function getDayBucketMs(value: unknown): number {
  const ms = getCreatedAtMs(value);

  if (!ms) {
    return 0;
  }

  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function buildDaysWithTasks(
  parameters: WaterTestingParameterPlan[]
): WaterTestingDay[] {
  const grouped = new Map<
    number,
    {
      dayBucketMs: number;
      date: string;
      tasks: WaterTestingTask[];
    }
  >();

  parameters.forEach((item) => {
    const dayBucketMs = item.dayBucketMs || getDayBucketMs(item.nextTestAtMs);
    const existing = grouped.get(dayBucketMs);

    if (!existing) {
      grouped.set(dayBucketMs, {
        dayBucketMs,
        date: new Date(dayBucketMs).toISOString().slice(0, 10),
        tasks: [
          {
            key: item.key,
            label: item.label,
            level: item.level,
            reason: item.reason,
            nextTestAtMs: item.nextTestAtMs,
          },
        ],
      });
      return;
    }

    existing.tasks.push({
      key: item.key,
      label: item.label,
      level: item.level,
      reason: item.reason,
      nextTestAtMs: item.nextTestAtMs,
    });
  });

  return Array.from(grouped.values())
    .sort((a, b) => a.dayBucketMs - b.dayBucketMs)
    .map((day) => ({
      ...day,
      tasks: [...day.tasks].sort((a, b) => a.nextTestAtMs - b.nextTestAtMs),
    }));
}

function formatActionDate(value: number, locale = 'pl-PL'): string {
  return new Date(value).toLocaleDateString(locale);
}

function normalizeLightIntensity(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function getMeasurementNumericValue(measurement: GenericRecord | null | undefined, key: string) {
  if (!measurement || !key) {
    return null;
  }

  if (key === 'co2') {
    const directCo2 = Number(measurement.co2);
    if (Number.isFinite(directCo2)) {
      return directCo2;
    }
    return calculateCo2FromKhPh(measurement.kh, measurement.ph);
  }

  const value = Number(measurement[key]);
  return Number.isFinite(value) ? value : null;
}

function getRecentNumericSeries(measurements: GenericRecord[], key: string, limit = 5) {
  return measurements
    .slice(0, limit)
    .map((item) => getMeasurementNumericValue(item, key))
    .filter((value) => value !== null) as number[];
}

function getTrendDirection(series: number[], threshold: number) {
  if (series.length < 2) {
    return {
      direction: 'neutral',
      delta: 0,
    } as const;
  }

  const delta = series[0] - series[1];

  if (Math.abs(delta) <= threshold) {
    return {
      direction: 'stable',
      delta,
    } as const;
  }

  return {
    direction: delta > 0 ? 'up' : 'down',
    delta,
  } as const;
}

function createRecommendation({
  severity,
  parameter,
  value,
  expectedRange,
  issue,
  action,
  dueInDays,
}: RecommendationInput): WaterRecommendation {
  const defaultDueInDays =
    severity === 'critical' ? 0 : severity === 'warning' ? 1 : 3;

  return {
    severity,
    parameter,
    value,
    expectedRange,
    issue,
    action,
    dueInDays:
      Number.isFinite(Number(dueInDays))
        ? Number(dueInDays)
        : defaultDueInDays,
  };
}

function resolveTargetRange(
  key: string,
  options: WaterAnalysisOptions = {}
): WaterTargetRange {
  const fallback = DEFAULT_TARGET_RANGES[key] ?? { min: 0, max: 0 };
  const raw = options?.targetRanges?.[key];
  const min = Number(raw?.min);
  const max = Number(raw?.max);

  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    return fallback;
  }

  return { min, max };
}

function buildRangeLabel(range: WaterTargetRange, unit = ''): string {
  const unitSuffix = unit ? ` ${unit}` : '';
  return `${range.min}-${range.max}${unitSuffix}`;
}

function getRangeSeverity(value: number, range: WaterTargetRange): WaterSeverity {
  const span = Math.max(
    range.max - range.min,
    Math.max(Math.abs(range.max), Math.abs(range.min), 1) * 0.2
  );
  const criticalMin = range.min - span;
  const criticalMax = range.max + span;

  if (value < criticalMin || value > criticalMax) {
    return 'critical';
  }

  if (value < range.min || value > range.max) {
    return 'warning';
  }

  return 'ok';
}

function getUpperBoundSeverity(value: number, max: number, minPadding = 0.05): WaterSeverity {
  const padding = Math.max(minPadding, Math.abs(max) * 0.8);
  const criticalMax = max + padding;

  if (value > criticalMax) {
    return 'critical';
  }

  if (value > max) {
    return 'warning';
  }

  return 'ok';
}

export function calculateCo2FromKhPh(khValue: unknown, phValue: unknown): number | null {
  const kh = Number(khValue);
  const ph = Number(phValue);

  if (!Number.isFinite(kh) || !Number.isFinite(ph) || kh <= 0) {
    return null;
  }

  const estimated = 3 * kh * Math.pow(10, 7 - ph);

  if (!Number.isFinite(estimated) || estimated < 0) {
    return null;
  }

  return Math.round(estimated * 10) / 10;
}

export function getRecommendationDueAtMs(
  item: Partial<WaterRecommendation> | null | undefined,
  now = new Date()
): number {
  const days = Number.isFinite(Number(item?.dueInDays))
    ? Number(item?.dueInDays)
    : item?.severity === 'critical'
      ? 0
      : item?.severity === 'warning'
        ? 1
        : 3;

  return addDays(now, days).getTime();
}

export function formatRecommendationDueDate(
  item: Partial<WaterRecommendation> | null | undefined,
  locale = 'pl-PL',
  now = new Date()
): string {
  const dueAtMs = getRecommendationDueAtMs(item, now);
  return formatActionDate(dueAtMs, locale);
}

export function formatRecommendationAction(
  item: Partial<WaterRecommendation> & { parameter?: string; action?: string },
  locale = 'pl-PL',
  now = new Date()
): string {
  return `${item.parameter} [${formatRecommendationDueDate(item, locale, now)}]: ${item.action}`;
}

export function analyzeMeasurement(
  measurement: GenericRecord,
  enabledTests: EnabledTests = {},
  options: WaterAnalysisOptions = {}
): WaterAnalysisResult {
  const isTestEnabled = (key: string) => Boolean(enabledTests?.[key]);

  const phValue = toNumeric(measurement.ph);
  const ghValue = toNumeric(measurement.gh);
  const khValue = toNumeric(measurement.kh);
  const caValue = toNumeric(measurement.ca);
  const mgValue = toNumeric(measurement.mg);
  const kValue = toNumeric(measurement.k);
  const tdsValue = toNumeric(measurement.tds);
  const no2Value = toNumeric(measurement.no2);
  const no3Value = toNumeric(measurement.no3);
  const nh3nh4Value = toNumeric(measurement.nh3nh4);
  const po4Value = toNumeric(measurement.po4);
  const feValue = toNumeric(measurement.fe);
  const temperatureValue = toNumeric(measurement.temperature);
  const co2Value =
    toNumeric(measurement.co2) ?? calculateCo2FromKhPh(khValue, phValue);
  const phRange = resolveTargetRange('ph', options);
  const ghRange = resolveTargetRange('gh', options);
  const khRange = resolveTargetRange('kh', options);
  const no2Range = resolveTargetRange('no2', options);
  const no3Range = resolveTargetRange('no3', options);
  const nh3nh4Range = resolveTargetRange('nh3nh4', options);
  const po4Range = resolveTargetRange('po4', options);
  const feRange = resolveTargetRange('fe', options);
  const caRange = resolveTargetRange('ca', options);
  const mgRange = resolveTargetRange('mg', options);
  const kRange = resolveTargetRange('k', options);
  const tdsRange = resolveTargetRange('tds', options);
  const temperatureRange = resolveTargetRange('temperature', options);
  const co2Range = resolveTargetRange('co2', options);

  const recommendations: WaterRecommendation[] = [];

  if (isTestEnabled('no2') && no2Value !== null) {
    const no2Severity = getUpperBoundSeverity(no2Value, no2Range.max, 0.05);
    if (no2Severity !== 'ok') {
      recommendations.push(
        createRecommendation({
          severity: no2Severity,
          parameter: 'NO2',
          value: `${no2Value} mg/l`,
          expectedRange: `<= ${no2Range.max} mg/l`,
          issue:
            no2Severity === 'critical'
              ? 'Toksyczny azotyn wykryty powyzej bezpiecznego poziomu.'
              : 'NO2 poza docelowym zakresem ustawionym dla akwarium.',
          action:
            no2Severity === 'critical'
              ? 'Natychmiastowa podmiana 50% wody, mocne napowietrzanie i kontrola filtra biologicznego.'
              : 'Podmien 25-30% wody i powtorz test za 24h.',
        })
      );
    }
  }

  if (isTestEnabled('no3') && no3Value !== null) {
    const no3Severity = getRangeSeverity(no3Value, no3Range);
    if (no3Severity !== 'ok') {
      recommendations.push(
        createRecommendation({
          severity: no3Severity,
          parameter: 'NO3',
          value: `${no3Value} mg/l`,
          expectedRange: buildRangeLabel(no3Range, 'mg/l'),
          issue:
            no3Severity === 'critical'
              ? 'NO3 mocno poza docelowym zakresem dla tego zbiornika.'
              : 'NO3 poza docelowym zakresem ustawionym dla akwarium.',
          action:
            no3Severity === 'critical'
              ? 'Podmiana 35-45% wody i powtorzenie testu po 24h.'
              : 'Podmien 20-30% wody i monitoruj trend przez najblizsze dni.',
        })
      );
    }
  }

  if (isTestEnabled('ph') && phValue !== null) {
    const phSeverity = getRangeSeverity(phValue, phRange);
    if (phSeverity !== 'ok') {
      recommendations.push(
        createRecommendation({
          severity: phSeverity,
          parameter: 'pH',
          value: `${phValue}`,
          expectedRange: buildRangeLabel(phRange),
          issue:
            phSeverity === 'critical'
              ? 'pH daleko poza docelowym zakresem ustawionym dla akwarium.'
              : 'pH poza docelowym zakresem ustawionym dla akwarium.',
          action: isTestEnabled('kh')
            ? 'Sprawdz KH i zrodlo wody, koryguj pH stopniowo (max 0.2 na dobe).'
            : 'Sprawdz zrodlo wody i koryguj pH stopniowo.',
        })
      );
    }
  }

  if (isTestEnabled('gh') && ghValue !== null) {
    const ghSeverity = getRangeSeverity(ghValue, ghRange);
    if (ghSeverity !== 'ok') {
      recommendations.push(
        createRecommendation({
          severity: ghSeverity,
          parameter: 'GH',
          value: `${ghValue} dGH`,
          expectedRange: buildRangeLabel(ghRange, 'dGH'),
          issue:
            ghSeverity === 'critical'
              ? 'GH mocno poza docelowym zakresem ustawionym dla akwarium.'
              : 'GH poza docelowym zakresem ustawionym dla akwarium.',
          action:
            'Dostosuj mineralizacje przy podmianie i porownaj potrzeby obsady.',
        })
      );
    }
  }

  if (isTestEnabled('nh3nh4') && nh3nh4Value !== null) {
    const nh3Severity = getUpperBoundSeverity(nh3nh4Value, nh3nh4Range.max, 0.05);
    if (nh3Severity !== 'ok') {
      recommendations.push(
        createRecommendation({
          severity: nh3Severity,
          parameter: 'NH3/NH4',
          value: `${nh3nh4Value} mg/l`,
          expectedRange: `<= ${nh3nh4Range.max} mg/l`,
          issue:
            nh3Severity === 'critical'
              ? 'Zbyt wysokie stezenie NH3/NH4.'
              : 'NH3/NH4 poza docelowym zakresem ustawionym dla akwarium.',
          action:
            nh3Severity === 'critical'
              ? 'Natychmiast podmien 40-50% wody, ogranicz karmienie i sprawdz filtr biologiczny.'
              : 'Podmien 25-30% wody i powtorz test za 24h.',
        })
      );
    }
  }

  if (isTestEnabled('po4') && po4Value !== null) {
    const po4Severity = getRangeSeverity(po4Value, po4Range);
    if (po4Severity !== 'ok') {
      recommendations.push(
        createRecommendation({
          severity: po4Severity,
          parameter: 'PO4',
          value: `${po4Value} mg/l`,
          expectedRange: buildRangeLabel(po4Range, 'mg/l'),
          issue:
            po4Severity === 'critical'
              ? 'PO4 mocno poza docelowym zakresem ustawionym dla akwarium.'
              : 'PO4 poza docelowym zakresem ustawionym dla akwarium.',
          action:
            'Podmien 20-35% wody, ogranicz przekarmianie i monitoruj trend.',
        })
      );
    }
  }

  if (isTestEnabled('fe') && feValue !== null) {
    const feSeverity = getRangeSeverity(feValue, feRange);
    if (feSeverity !== 'ok') {
      recommendations.push(
        createRecommendation({
          severity: feSeverity,
          parameter: 'Fe',
          value: `${feValue} mg/l`,
          expectedRange: buildRangeLabel(feRange, 'mg/l'),
          issue:
            feSeverity === 'critical'
              ? 'Fe mocno poza docelowym zakresem ustawionym dla akwarium.'
              : 'Fe poza docelowym zakresem ustawionym dla akwarium.',
          action:
            'Skoryguj dawkowanie nawozenia i powtorz test za 1-2 dni.',
        })
      );
    }
  }

  if (isTestEnabled('kh') && khValue !== null) {
    const khSeverity = getRangeSeverity(khValue, khRange);
    if (khSeverity !== 'ok') {
      recommendations.push(
        createRecommendation({
          severity: khSeverity,
          parameter: 'KH',
          value: `${khValue} dKH`,
          expectedRange: buildRangeLabel(khRange, 'dKH'),
          issue:
            khSeverity === 'critical'
              ? 'KH mocno poza docelowym zakresem ustawionym dla akwarium.'
              : 'KH poza docelowym zakresem ustawionym dla akwarium.',
          action:
            'Dostosuj mineralizacje przy podmianie i monitoruj stabilnosc pH.',
        })
      );
    }
  }

  if (isTestEnabled('ph') && isTestEnabled('kh') && co2Value !== null) {
    const co2Severity = getRangeSeverity(co2Value, co2Range);
    if (co2Severity !== 'ok') {
      recommendations.push(
        createRecommendation({
          severity: co2Severity,
          parameter: 'CO2',
          value: `${co2Value} mg/l`,
          expectedRange: buildRangeLabel(co2Range, 'mg/l'),
          issue:
            co2Severity === 'critical'
              ? 'Szacowane CO2 mocno poza docelowym zakresem ustawionym dla akwarium.'
              : 'Szacowane CO2 poza docelowym zakresem ustawionym dla akwarium.',
          action:
            co2Severity === 'critical'
              ? 'Natychmiast skoryguj napowietrzanie i dozowanie CO2, potem powtorz pH + KH.'
              : 'Skoryguj dozowanie CO2 o 10-20% i sprawdz pH + KH po 24h.',
        })
      );
    }
  }

  if (isTestEnabled('ca') && caValue !== null) {
    const caSeverity = getRangeSeverity(caValue, caRange);
    if (caSeverity !== 'ok') {
      recommendations.push(
        createRecommendation({
          severity: caSeverity,
          parameter: 'Ca',
          value: `${caValue} mg/l`,
          expectedRange: buildRangeLabel(caRange, 'mg/l'),
          issue:
            caSeverity === 'critical'
              ? 'Ca mocno poza docelowym zakresem ustawionym dla akwarium.'
              : 'Ca poza docelowym zakresem ustawionym dla akwarium.',
          action:
            'Skoryguj mineralizacje (Ca) i powtorz test za 1-3 dni.',
        })
      );
    }
  }

  if (isTestEnabled('mg') && mgValue !== null) {
    const mgSeverity = getRangeSeverity(mgValue, mgRange);
    if (mgSeverity !== 'ok') {
      recommendations.push(
        createRecommendation({
          severity: mgSeverity,
          parameter: 'Mg',
          value: `${mgValue} mg/l`,
          expectedRange: buildRangeLabel(mgRange, 'mg/l'),
          issue:
            mgSeverity === 'critical'
              ? 'Mg mocno poza docelowym zakresem ustawionym dla akwarium.'
              : 'Mg poza docelowym zakresem ustawionym dla akwarium.',
          action:
            'Skoryguj mineralizacje (Mg) i powtorz test za 1-3 dni.',
        })
      );
    }
  }

  if (isTestEnabled('k') && kValue !== null) {
    const kSeverity = getRangeSeverity(kValue, kRange);
    if (kSeverity !== 'ok') {
      recommendations.push(
        createRecommendation({
          severity: kSeverity,
          parameter: 'K',
          value: `${kValue} mg/l`,
          expectedRange: buildRangeLabel(kRange, 'mg/l'),
          issue:
            kSeverity === 'critical'
              ? 'Potas (K) mocno poza docelowym zakresem ustawionym dla akwarium.'
              : 'Potas (K) poza docelowym zakresem ustawionym dla akwarium.',
          action:
            'Skoryguj nawozenie potasem i sprawdz proporcje K:Ca:Mg przy kolejnym pomiarze.',
        })
      );
    }
  }

  if (isTestEnabled('tds') && tdsValue !== null) {
    const tdsSeverity = getRangeSeverity(tdsValue, tdsRange);
    if (tdsSeverity !== 'ok') {
      recommendations.push(
        createRecommendation({
          severity: tdsSeverity,
          parameter: 'TDS',
          value: `${tdsValue} ppm`,
          expectedRange: buildRangeLabel(tdsRange, 'ppm'),
          issue:
            tdsSeverity === 'critical'
              ? 'TDS mocno poza docelowym zakresem ustawionym dla akwarium.'
              : 'TDS poza docelowym zakresem ustawionym dla akwarium.',
          action:
            'Dostosuj mineralizacje i podmiany, aby stopniowo wrocic do stabilnego TDS.',
        })
      );
    }
  }

  if (isTestEnabled('temperature') && temperatureValue !== null) {
    const tempSeverity = getRangeSeverity(temperatureValue, temperatureRange);
    if (tempSeverity !== 'ok') {
      recommendations.push(
        createRecommendation({
          severity: tempSeverity,
          parameter: 'Temperatura',
          value: `${temperatureValue} C`,
          expectedRange: buildRangeLabel(temperatureRange, 'C'),
          issue:
            tempSeverity === 'critical'
              ? 'Temperatura mocno poza docelowym zakresem ustawionym dla akwarium.'
              : 'Temperatura poza docelowym zakresem ustawionym dla akwarium.',
          action: 'Skoryguj grzalke/chlodzenie i wracaj do zakresu stopniowo.',
        })
      );
    }
  }

  recommendations.sort(
    (a, b) =>
      SEVERITY_PRIORITY[b.severity] - SEVERITY_PRIORITY[a.severity]
  );

  const status =
    recommendations.length === 0
      ? 'ok'
      : recommendations[0].severity;

  const summary =
    status === 'critical'
      ? 'Wykryto krytyczne odchylenia. Reaguj od razu.'
      : status === 'warning'
        ? 'Wykryto odchylenia od zalecanych zakresow.'
        : 'Parametry wygladaja stabilnie.';

  return {
    status,
    summary,
    recommendations,
  };
}

export function buildCurrentRiskNotes(
  measurement: GenericRecord,
  tankProfile: GenericRecord | null = null
): WaterRiskNote[] {
  const risks: WaterRiskNote[] = [];
  const pushRisk = (severity: 'warning' | 'critical', text: string) => {
    if (!text) {
      return;
    }
    risks.push({ severity, text });
  };

  const no2Value = toNumeric(measurement?.no2);
  const no3Value = toNumeric(measurement?.no3);
  const nh3nh4Value = toNumeric(measurement?.nh3nh4);
  const phValue = toNumeric(measurement?.ph);
  const ghValue = toNumeric(measurement?.gh);
  const khValue = toNumeric(measurement?.kh);
  const caValue = toNumeric(measurement?.ca);
  const mgValue = toNumeric(measurement?.mg);
  const kValue = toNumeric(measurement?.k);
  const tdsValue = toNumeric(measurement?.tds);
  const co2Value =
    toNumeric(measurement?.co2) ?? calculateCo2FromKhPh(khValue, phValue);
  const po4Value = toNumeric(measurement?.po4);
  const feValue = toNumeric(measurement?.fe);
  const tempValue = toNumeric(measurement?.temperature);
  const lightHours = toNumeric(tankProfile?.lightHours);
  const lightIntensity = normalizeLightIntensity(tankProfile?.lightIntensity);

  if (no2Value !== null && no2Value > 0.2) {
    pushRisk(
      'critical',
      'NO2 moze doprowadzic do ostrego niedotlenienia i szybkich padniec ryb.'
    );
  } else if (no2Value !== null && no2Value > 0) {
    pushRisk(
      'critical',
      'NO2 powyzej 0 obciaza skrzela i odpornosc, a problem zwykle narasta bez szybkiej reakcji.'
    );
  }

  if (nh3nh4Value !== null && nh3nh4Value > 0.2) {
    pushRisk(
      'critical',
      'Wysoki NH3/NH4 moze dzialac toksycznie na skrzela i uklad nerwowy ryb.'
    );
  } else if (nh3nh4Value !== null && nh3nh4Value > 0.05) {
    pushRisk(
      'warning',
      'Podwyzszony NH3/NH4 zwieksza stres i podatnosc na choroby.'
    );
  }

  if (no3Value !== null && no3Value > 50) {
    pushRisk(
      'warning',
      'Wysokie NO3 moze oslabic ryby i przyspieszyc rozrost glonow.'
    );
  } else if (no3Value !== null && no3Value > 25) {
    pushRisk(
      'warning',
      'Rosnace NO3 czesto prowadzi do pogorszenia kondycji obsady i niestabilnosci zbiornika.'
    );
  }

  if (phValue !== null && (phValue < 5.8 || phValue > 8.5)) {
    pushRisk(
      'critical',
      'Skrajne pH moze wywolac szok osmotyczny, uszkodzenia skrzeli i nagle zgony.'
    );
  } else if (phValue !== null && (phValue < 6.5 || phValue > 7.8)) {
    pushRisk(
      'warning',
      'pH poza zakresem komfortu podnosi stres i ryzyko infekcji.'
    );
  }

  if (khValue !== null && khValue < 3) {
    pushRisk(
      'warning',
      'Niskie KH zwieksza ryzyko naglych skokow pH (tzw. crash), groznych dla obsady.'
    );
  } else if (khValue !== null && khValue > 10) {
    pushRisk(
      'warning',
      'Wysokie KH utrudnia stabilna korekte pH i moze pogarszac komfort ryb wrazliwych.'
    );
  }

  if (co2Value !== null && co2Value > 40) {
    pushRisk(
      'critical',
      'Zbyt wysokie CO2 moze doprowadzic do dusznosci ryb, zwlaszcza noca.'
    );
  } else if (co2Value !== null && co2Value > 30) {
    pushRisk(
      'warning',
      'Podwyzszone CO2 wymaga ostroznosci i dobrej cyrkulacji oraz napowietrzania.'
    );
  }

  if (caValue !== null && (caValue < 15 || caValue > 80)) {
    pushRisk(
      'warning',
      'Ca poza zakresem moze oslabic wzrost roslin i zaburzac rownowage mineralna.'
    );
  }

  if (mgValue !== null && (mgValue < 5 || mgValue > 20)) {
    pushRisk(
      'warning',
      'Mg poza zakresem moze pogarszac kondycje roslin i przyswajanie skladnikow.'
    );
  }

  if (kValue !== null && (kValue < 5 || kValue > 30)) {
    pushRisk(
      'warning',
      'Potas (K) poza zakresem moze ograniczac wzrost roslin i zaburzac rownowage nawozenia.'
    );
  }

  if (tdsValue !== null && (tdsValue < 80 || tdsValue > 450)) {
    pushRisk(
      tdsValue < 50 || tdsValue > 600 ? 'critical' : 'warning',
      'TDS poza zakresem moze powodowac stres osmotyczny i niestabilnosc warunkow.'
    );
  }

  if (ghValue !== null && (ghValue < 3 || ghValue > 18)) {
    pushRisk(
      'warning',
      'GH mocno poza zakresem moze zaburzac osmoregulacje ryb i kondycje roslin.'
    );
  }

  if (po4Value !== null && po4Value > 1.5) {
    pushRisk(
      'warning',
      'Wysokie PO4 zwieksza ryzyko glonow i zaburzen rownowagi biologicznej.'
    );
  }

  if (feValue !== null && feValue > 0.3) {
    pushRisk(
      'warning',
      'Zbyt wysokie Fe moze byc ryzykowne dla krewetek i nasilac problemy z glonami.'
    );
  }

  if (tempValue !== null && (tempValue < 22 || tempValue > 29)) {
    pushRisk(
      'critical',
      'Skrajna temperatura moze powodowac szok termiczny i niedotlenienie ryb.'
    );
  } else if (tempValue !== null && (tempValue < 24 || tempValue > 27)) {
    pushRisk(
      'warning',
      'Temperatura poza zakresem docelowym oslabia odpornosc i stabilnosc zbiornika.'
    );
  }

  if (lightHours !== null && lightHours > 10) {
    pushRisk(
      'warning',
      'Zbyt dlugi czas swiecenia lampy zwieksza ryzyko wysypu glonow.'
    );
  } else if (lightHours !== null && lightHours < 5) {
    pushRisk(
      'warning',
      'Bardzo krotkie swiecenie moze oslabic rosliny i pogorszyc ich konkurencje z glonami.'
    );
  }

  if (lightIntensity === 'high' && lightHours !== null && lightHours >= 9) {
    pushRisk(
      'warning',
      'Mocne i dlugie swiecenie jednoczesnie wyraznie zwieksza ryzyko problemow glonowych.'
    );
  }

  if (
    no3Value !== null &&
    no3Value > 25 &&
    lightHours !== null &&
    lightHours >= 8
  ) {
    pushRisk(
      'warning',
      'Polaczenie podwyzszonego NO3 z dlugim swieceniem sprzyja glonom i wahaniom tlenu.'
    );
  }

  if (
    tempValue !== null &&
    tempValue >= 28 &&
    ((no2Value !== null && no2Value > 0) ||
      (nh3nh4Value !== null && nh3nh4Value > 0.05))
  ) {
    pushRisk(
      'critical',
      'Wysoka temperatura przy toksynach azotowych dodatkowo zwieksza ryzyko dusznosci i padniec.'
    );
  }

  const unique: WaterRiskNote[] = [];
  const seen = new Set();
  risks.forEach((item) => {
    const key = item.text.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  });

  const priority = { critical: 2, warning: 1 };
  return unique
    .sort((a, b) => (priority[b.severity] ?? 0) - (priority[a.severity] ?? 0))
    .slice(0, 5);
}

export function buildWaterTestingSchedule(
  measurements: GenericRecord[],
  enabledTests: EnabledTests = {},
  options: WaterAnalysisOptions = {},
  now = new Date()
): WaterTestingScheduleResult {
  const todayBucketMs = getDayBucketMs(now);
  const defaultBaseMs = getMeasurementRecordedAtMs(measurements[0]) || now.getTime();
  const baseDate = new Date(defaultBaseMs);
  const isTestEnabled = (key: string) => Boolean(enabledTests?.[key]);
  const no2Range = resolveTargetRange('no2', options);
  const no3Range = resolveTargetRange('no3', options);
  const nh3nh4Range = resolveTargetRange('nh3nh4', options);
  const po4Range = resolveTargetRange('po4', options);
  const feRange = resolveTargetRange('fe', options);
  const ghRange = resolveTargetRange('gh', options);
  const khRange = resolveTargetRange('kh', options);
  const caRange = resolveTargetRange('ca', options);
  const mgRange = resolveTargetRange('mg', options);
  const kRange = resolveTargetRange('k', options);
  const tdsRange = resolveTargetRange('tds', options);

  const buildCriticalRange = (
    range: WaterTargetRange,
    spanFactor = 0.4,
    minPadding = 0.1
  ) => {
    const span = Math.max((range.max - range.min) * spanFactor, minPadding);
    return {
      min: range.min - span,
      max: range.max + span,
    };
  };

  const formatCadence = (days: number) => {
    if (days <= 0) {
      return 'dzis';
    }

    if (days === 1) {
      return 'codziennie';
    }

    return `co ${days} dni`;
  };

  const buildPlan = (
    key: string,
    label: string,
    level: WaterTestingLevel,
    cadenceDays: number,
    reason: string
  ): WaterTestingParameterPlan => {
    const suggestedNextMs = getDayBucketMs(addDays(baseDate, cadenceDays));
    const nextTestAtMs = suggestedNextMs <= todayBucketMs ? todayBucketMs : suggestedNextMs;
    return {
      key,
      label,
      level,
      cadenceDays,
      cadenceLabel: formatCadence(cadenceDays),
      reason,
      nextTestAtMs,
      dayBucketMs: getDayBucketMs(nextTestAtMs),
      isOverdue: suggestedNextMs <= todayBucketMs,
    };
  };

  if (measurements.length === 0) {
    const parameters: WaterTestingParameterPlan[] = [];

    if (isTestEnabled('no2')) {
      parameters.push(buildPlan('no2', 'NO2', 'problem', 0, 'Brak danych - wykonaj pierwszy test.'));
    }
    if (isTestEnabled('no3')) {
      parameters.push(buildPlan('no3', 'NO3', 'problem', 0, 'Brak danych - wykonaj pierwszy test.'));
    }
    if (isTestEnabled('nh3nh4')) {
      parameters.push(
        buildPlan('nh3nh4', 'NH3/NH4', 'problem', 0, 'Brak danych - wykonaj pierwszy test.')
      );
    }
    if (isTestEnabled('po4')) {
      parameters.push(buildPlan('po4', 'PO4', 'problem', 0, 'Brak danych - wykonaj pierwszy test.'));
    }
    if (isTestEnabled('fe')) {
      parameters.push(buildPlan('fe', 'Fe', 'problem', 0, 'Brak danych - wykonaj pierwszy test.'));
    }
    if (isTestEnabled('ph')) {
      parameters.push(buildPlan('ph', 'pH', 'problem', 0, 'Brak danych - wykonaj pierwszy test.'));
    }
    if (isTestEnabled('gh')) {
      parameters.push(buildPlan('gh', 'GH', 'problem', 0, 'Brak danych - wykonaj pierwszy test.'));
    }
    if (isTestEnabled('kh')) {
      parameters.push(buildPlan('kh', 'KH', 'problem', 0, 'Brak danych - wykonaj pierwszy test.'));
    }
    if (isTestEnabled('ca')) {
      parameters.push(buildPlan('ca', 'Ca', 'problem', 0, 'Brak danych - wykonaj pierwszy test.'));
    }
    if (isTestEnabled('mg')) {
      parameters.push(buildPlan('mg', 'Mg', 'problem', 0, 'Brak danych - wykonaj pierwszy test.'));
    }
    if (isTestEnabled('k')) {
      parameters.push(buildPlan('k', 'K', 'problem', 0, 'Brak danych - wykonaj pierwszy test.'));
    }
    if (isTestEnabled('tds')) {
      parameters.push(buildPlan('tds', 'TDS', 'problem', 0, 'Brak danych - wykonaj pierwszy test.'));
    }

    return {
      parameters,
      daysWithTasks: buildDaysWithTasks(parameters),
      nextTestAtMs: todayBucketMs,
      isOverdue: true,
      reason: 'Brak pomiarow - wykonaj pierwszy pelny test.',
      requiresPostWaterChangeTest: false,
    };
  }

  const latestMeasurement = measurements[0] ?? {};
  const previousMeasurement = measurements[1] ?? {};
  const no3Series = getRecentNumericSeries(measurements, 'no3');
  const phSeries = getRecentNumericSeries(measurements, 'ph');
  const ghSeries = getRecentNumericSeries(measurements, 'gh');
  const khSeries = getRecentNumericSeries(measurements, 'kh');

  const no3Trend = getTrendDirection(no3Series, 2);
  const phSpread =
    phSeries.length >= 2
      ? Math.max(...phSeries.slice(0, 3)) - Math.min(...phSeries.slice(0, 3))
      : 0;
  const ghSpread =
    ghSeries.length >= 2
      ? Math.max(...ghSeries.slice(0, 3)) - Math.min(...ghSeries.slice(0, 3))
      : 0;
  const khSpread =
    khSeries.length >= 2
      ? Math.max(...khSeries.slice(0, 3)) - Math.min(...khSeries.slice(0, 3))
      : 0;

  const no2Value = toNumeric(latestMeasurement.no2);
  const no3Value = toNumeric(latestMeasurement.no3);
  const nh3nh4Value = toNumeric(latestMeasurement.nh3nh4);
  const po4Value = toNumeric(latestMeasurement.po4);
  const feValue = toNumeric(latestMeasurement.fe);
  const phValue = toNumeric(latestMeasurement.ph);
  const ghValue = toNumeric(latestMeasurement.gh);
  const khValue = toNumeric(latestMeasurement.kh);
  const caValue = toNumeric(latestMeasurement.ca);
  const mgValue = toNumeric(latestMeasurement.mg);
  const kValue = toNumeric(latestMeasurement.k);
  const tdsValue = toNumeric(latestMeasurement.tds);
  const previousPhValue = toNumeric(previousMeasurement.ph);
  const phDelta =
    phValue !== null && previousPhValue !== null
      ? Math.abs(phValue - previousPhValue)
      : 0;
  const no2 = no2Value ?? 0;
  const no3 = no3Value ?? 0;
  const nh3nh4 = nh3nh4Value ?? 0;
  const po4 = po4Value ?? 0;
  const fe = feValue ?? 0;
  const gh = ghValue ?? 0;
  const kh = khValue ?? 0;
  const ca = caValue ?? 0;
  const mg = mgValue ?? 0;
  const k = kValue ?? 0;
  const tds = tdsValue ?? 0;

  const parameters: WaterTestingParameterPlan[] = [];

  const no2WarningMax = Math.max(no2Range.max, 0);
  const no2CriticalMax = Math.max(no2WarningMax * 4, no2WarningMax + 0.1);
  if (isTestEnabled('no2') && no2Value === null) {
    parameters.push(
      buildPlan('no2', 'NO2', 'problem', 0, 'Brak odczytu - wykonaj test NO2.')
    );
  } else if (isTestEnabled('no2') && no2 > no2CriticalMax) {
    parameters.push(
      buildPlan(
        'no2',
        'NO2',
        'problem',
        1,
        `NO2 ${no2} mg/l mocno powyzej zakresu docelowego (<= ${no2WarningMax} mg/l). Test codziennie do powrotu do normy.`
      )
    );
  } else if (isTestEnabled('no2') && no2 > no2WarningMax) {
    parameters.push(
      buildPlan(
        'no2',
        'NO2',
        'warning',
        1,
        `NO2 ${no2} mg/l powyzej zakresu docelowego (<= ${no2WarningMax} mg/l). Test co 1-2 dni.`
      )
    );
  } else if (isTestEnabled('no2') && no2 > 0) {
    parameters.push(
      buildPlan(
        'no2',
        'NO2',
        'warning',
        2,
        `NO2 ${no2} mg/l (sladowe). Test co 2 dni do wyniku 0.`
      )
    );
  } else if (isTestEnabled('no2')) {
    parameters.push(
      buildPlan('no2', 'NO2', 'ok', 7, 'NO2 = 0. Test kontrolny 1x na tydzien.')
    );
  }

  const no3WarningMax = no3Range.max;
  const no3CriticalMax = Math.max(no3WarningMax * 2, no3WarningMax + 20);
  const no3TrendWarningMax = Math.max(no3WarningMax * 1.2, no3WarningMax + 5);
  if (isTestEnabled('no3') && no3Value === null) {
    parameters.push(
      buildPlan('no3', 'NO3', 'problem', 0, 'Brak odczytu - wykonaj test NO3.')
    );
  } else if (isTestEnabled('no3') && no3 > no3CriticalMax) {
    parameters.push(
      buildPlan(
        'no3',
        'NO3',
        'problem',
        1,
        `NO3 ${no3} mg/l mocno powyzej zakresu docelowego (${no3Range.min}-${no3WarningMax} mg/l). Test codziennie.`
      )
    );
  } else if (
    isTestEnabled('no3') &&
    (no3 > no3WarningMax || (no3Trend.direction === 'up' && no3 > no3TrendWarningMax))
  ) {
    parameters.push(
      buildPlan(
        'no3',
        'NO3',
        'warning',
        no3 > no3CriticalMax * 0.7 ? 2 : 3,
        `NO3 ${no3} mg/l lub trend wzrostowy ponad zakres docelowy. Test co 2-3 dni.`
      )
    );
  } else if (isTestEnabled('no3')) {
    parameters.push(
      buildPlan('no3', 'NO3', 'ok', 7, 'NO3 stabilne. Test kontrolny 1x na tydzien.')
    );
  }

  const nh3WarningMax = Math.max(nh3nh4Range.max, 0);
  const nh3CriticalMax = Math.max(nh3WarningMax * 4, nh3WarningMax + 0.15);
  if (isTestEnabled('nh3nh4') && nh3nh4Value === null) {
    parameters.push(
      buildPlan('nh3nh4', 'NH3/NH4', 'problem', 0, 'Brak odczytu - wykonaj test NH3/NH4.')
    );
  } else if (isTestEnabled('nh3nh4') && nh3nh4 > nh3CriticalMax) {
    parameters.push(
      buildPlan(
        'nh3nh4',
        'NH3/NH4',
        'problem',
        1,
        `NH3/NH4 ${nh3nh4} mg/l mocno powyzej zakresu docelowego (<= ${nh3WarningMax} mg/l). Test codziennie.`
      )
    );
  } else if (isTestEnabled('nh3nh4') && nh3nh4 > nh3WarningMax) {
    parameters.push(
      buildPlan(
        'nh3nh4',
        'NH3/NH4',
        'warning',
        2,
        `NH3/NH4 ${nh3nh4} mg/l powyzej zakresu docelowego. Test co 1-2 dni.`
      )
    );
  } else if (isTestEnabled('nh3nh4')) {
    parameters.push(
      buildPlan('nh3nh4', 'NH3/NH4', 'ok', 7, 'NH3/NH4 stabilne. Test kontrolny 1x na tydzien.')
    );
  }

  const po4WarningMax = po4Range.max;
  const po4CriticalMax = Math.max(po4WarningMax * 2, po4WarningMax + 1);
  if (isTestEnabled('po4') && po4Value === null) {
    parameters.push(
      buildPlan('po4', 'PO4', 'problem', 0, 'Brak odczytu - wykonaj test PO4.')
    );
  } else if (isTestEnabled('po4') && po4 > po4CriticalMax) {
    parameters.push(
      buildPlan(
        'po4',
        'PO4',
        'problem',
        1,
        `PO4 ${po4} mg/l mocno powyzej zakresu docelowego (${po4Range.min}-${po4WarningMax} mg/l). Test codziennie.`
      )
    );
  } else if (isTestEnabled('po4') && po4 > po4WarningMax) {
    parameters.push(
      buildPlan(
        'po4',
        'PO4',
        'warning',
        3,
        `PO4 ${po4} mg/l powyzej zakresu docelowego. Test co 2-3 dni.`
      )
    );
  } else if (isTestEnabled('po4')) {
    parameters.push(
      buildPlan('po4', 'PO4', 'ok', 7, 'PO4 stabilne. Test kontrolny 1x na tydzien.')
    );
  }

  const feWarningMax = feRange.max;
  const feCriticalMax = Math.max(feWarningMax * 2.5, feWarningMax + 0.2);
  if (isTestEnabled('fe') && feValue === null) {
    parameters.push(
      buildPlan('fe', 'Fe', 'problem', 0, 'Brak odczytu - wykonaj test Fe.')
    );
  } else if (isTestEnabled('fe') && fe > feCriticalMax) {
    parameters.push(
      buildPlan(
        'fe',
        'Fe',
        'problem',
        1,
        `Fe ${fe} mg/l mocno powyzej zakresu docelowego (${feRange.min}-${feWarningMax} mg/l). Test codziennie.`
      )
    );
  } else if (isTestEnabled('fe') && fe > feWarningMax) {
    parameters.push(
      buildPlan(
        'fe',
        'Fe',
        'warning',
        3,
        `Fe ${fe} mg/l powyzej zakresu docelowego. Test co 2-3 dni.`
      )
    );
  } else if (isTestEnabled('fe')) {
    parameters.push(
      buildPlan('fe', 'Fe', 'ok', 14, 'Fe stabilne. Test kontrolny co 1-2 tygodnie.')
    );
  }

  if (isTestEnabled('ph') && phValue === null) {
    parameters.push(
      buildPlan('ph', 'pH', 'problem', 0, 'Brak odczytu - wykonaj test pH.')
    );
  } else if (isTestEnabled('ph') && (phDelta >= 0.5 || phSpread > 0.6)) {
    parameters.push(
      buildPlan(
        'ph',
        'pH',
        'problem',
        1,
        `Nagly skok pH (delta ${Math.round(phDelta * 100) / 100}). Test codziennie do wyciszenia skokow.`
      )
    );
  } else if (isTestEnabled('ph') && (phDelta >= 0.25 || phSpread > 0.35)) {
    parameters.push(
      buildPlan(
        'ph',
        'pH',
        'warning',
        2,
        `pH zaczyna sie zmieniac (delta ${Math.round(phDelta * 100) / 100}). Test co 2-3 dni.`
      )
    );
  } else if (isTestEnabled('ph')) {
    parameters.push(
      buildPlan('ph', 'pH', 'ok', 7, 'pH stabilne. Test kontrolny 1x na tydzien.')
    );
  }

  const ghCriticalRange = buildCriticalRange(ghRange, 0.5, 1);
  if (isTestEnabled('gh') && ghValue === null) {
    parameters.push(
      buildPlan('gh', 'GH', 'problem', 0, 'Brak odczytu - wykonaj test GH.')
    );
  } else if (isTestEnabled('gh') && (gh < ghCriticalRange.min || gh > ghCriticalRange.max)) {
    parameters.push(
      buildPlan(
        'gh',
        'GH',
        'problem',
        gh < ghRange.min || gh > ghRange.max ? 1 : 2,
        `GH ${gh} dGH mocno poza zakresem docelowym (${ghRange.min}-${ghRange.max}). Test co 1-3 dni.`
      )
    );
  } else if (
    isTestEnabled('gh') &&
    (gh < ghRange.min || gh > ghRange.max || ghSpread > Math.max((ghRange.max - ghRange.min) * 0.3, 1.5))
  ) {
    parameters.push(
      buildPlan(
        'gh',
        'GH',
        'warning',
        ghSpread > Math.max((ghRange.max - ghRange.min) * 0.3, 1.5) ? 3 : 5,
        `GH ${gh} dGH lekko poza zakresem docelowym lub niestabilne. Test co 3-7 dni.`
      )
    );
  } else if (isTestEnabled('gh')) {
    parameters.push(
      buildPlan('gh', 'GH', 'ok', 21, 'GH stabilne. Test kontrolny co 2-4 tygodnie.')
    );
  }

  const khCriticalRange = buildCriticalRange(khRange, 0.5, 0.7);
  if (isTestEnabled('kh') && khValue === null) {
    parameters.push(
      buildPlan('kh', 'KH', 'problem', 0, 'Brak odczytu - wykonaj test KH.')
    );
  } else if (isTestEnabled('kh') && (kh < khCriticalRange.min || kh > khCriticalRange.max)) {
    parameters.push(
      buildPlan(
        'kh',
        'KH',
        'problem',
        kh < khRange.min || kh > khRange.max ? 1 : 2,
        `KH ${kh} dKH mocno poza zakresem docelowym (${khRange.min}-${khRange.max}). Test co 1-3 dni.`
      )
    );
  } else if (
    isTestEnabled('kh') &&
    (kh < khRange.min || kh > khRange.max || khSpread > Math.max((khRange.max - khRange.min) * 0.3, 1))
  ) {
    parameters.push(
      buildPlan(
        'kh',
        'KH',
        'warning',
        khSpread > Math.max((khRange.max - khRange.min) * 0.3, 1) ? 3 : 5,
        `KH ${kh} dKH lekko poza zakresem docelowym lub niestabilne. Test co 3-7 dni.`
      )
    );
  } else if (isTestEnabled('kh')) {
    parameters.push(
      buildPlan('kh', 'KH', 'ok', 21, 'KH stabilne. Test kontrolny co 2-4 tygodnie.')
    );
  }

  const caCriticalRange = buildCriticalRange(caRange, 0.45, 8);
  if (isTestEnabled('ca') && caValue === null) {
    parameters.push(
      buildPlan('ca', 'Ca', 'problem', 0, 'Brak odczytu - wykonaj test Ca.')
    );
  } else if (isTestEnabled('ca') && (ca < caCriticalRange.min || ca > caCriticalRange.max)) {
    parameters.push(
      buildPlan(
        'ca',
        'Ca',
        'problem',
        1,
        `Ca ${ca} mg/l mocno poza zakresem docelowym (${caRange.min}-${caRange.max}). Test codziennie.`
      )
    );
  } else if (isTestEnabled('ca') && (ca < caRange.min || ca > caRange.max)) {
    parameters.push(
      buildPlan(
        'ca',
        'Ca',
        'warning',
        3,
        `Ca ${ca} mg/l lekko poza zakresem docelowym. Test co 3-7 dni.`
      )
    );
  } else if (isTestEnabled('ca')) {
    parameters.push(
      buildPlan('ca', 'Ca', 'ok', 21, 'Ca stabilne. Test kontrolny co 2-4 tygodnie.')
    );
  }

  const mgCriticalRange = buildCriticalRange(mgRange, 0.45, 3);
  if (isTestEnabled('mg') && mgValue === null) {
    parameters.push(
      buildPlan('mg', 'Mg', 'problem', 0, 'Brak odczytu - wykonaj test Mg.')
    );
  } else if (isTestEnabled('mg') && (mg < mgCriticalRange.min || mg > mgCriticalRange.max)) {
    parameters.push(
      buildPlan(
        'mg',
        'Mg',
        'problem',
        1,
        `Mg ${mg} mg/l mocno poza zakresem docelowym (${mgRange.min}-${mgRange.max}). Test codziennie.`
      )
    );
  } else if (isTestEnabled('mg') && (mg < mgRange.min || mg > mgRange.max)) {
    parameters.push(
      buildPlan(
        'mg',
        'Mg',
        'warning',
        3,
        `Mg ${mg} mg/l lekko poza zakresem docelowym. Test co 3-7 dni.`
      )
    );
  } else if (isTestEnabled('mg')) {
    parameters.push(
      buildPlan('mg', 'Mg', 'ok', 21, 'Mg stabilne. Test kontrolny co 2-4 tygodnie.')
    );
  }

  const kCriticalRange = buildCriticalRange(kRange, 0.45, 4);
  if (isTestEnabled('k') && kValue === null) {
    parameters.push(
      buildPlan('k', 'K', 'problem', 0, 'Brak odczytu - wykonaj test K.')
    );
  } else if (isTestEnabled('k') && (k < kCriticalRange.min || k > kCriticalRange.max)) {
    parameters.push(
      buildPlan(
        'k',
        'K',
        'problem',
        1,
        `K ${k} mg/l mocno poza zakresem docelowym (${kRange.min}-${kRange.max}). Test codziennie.`
      )
    );
  } else if (isTestEnabled('k') && (k < kRange.min || k > kRange.max)) {
    parameters.push(
      buildPlan(
        'k',
        'K',
        'warning',
        3,
        `K ${k} mg/l lekko poza zakresem docelowym. Test co 3-7 dni.`
      )
    );
  } else if (isTestEnabled('k')) {
    parameters.push(
      buildPlan('k', 'K', 'ok', 21, 'K stabilne. Test kontrolny co 2-4 tygodnie.')
    );
  }

  const tdsCriticalRange = buildCriticalRange(tdsRange, 0.45, 30);
  if (isTestEnabled('tds') && tdsValue === null) {
    parameters.push(
      buildPlan('tds', 'TDS', 'problem', 0, 'Brak odczytu - wykonaj test TDS.')
    );
  } else if (isTestEnabled('tds') && (tds < tdsCriticalRange.min || tds > tdsCriticalRange.max)) {
    parameters.push(
      buildPlan(
        'tds',
        'TDS',
        'problem',
        1,
        `TDS ${tds} ppm mocno poza zakresem docelowym (${tdsRange.min}-${tdsRange.max}). Test codziennie.`
      )
    );
  } else if (isTestEnabled('tds') && (tds < tdsRange.min || tds > tdsRange.max)) {
    parameters.push(
      buildPlan(
        'tds',
        'TDS',
        'warning',
        3,
        `TDS ${tds} ppm lekko poza zakresem docelowym. Test co 3-7 dni.`
      )
    );
  } else if (isTestEnabled('tds')) {
    parameters.push(
      buildPlan('tds', 'TDS', 'ok', 14, 'TDS stabilne. Test kontrolny co 1-2 tygodnie.')
    );
  }

  const nextTestAtMs = parameters.reduce(
    (minValue, item) => Math.min(minValue, item.nextTestAtMs),
    Number.MAX_SAFE_INTEGER
  );
  const hasProblem = parameters.some((item) => item.level === 'problem');

  return {
    parameters,
    daysWithTasks: buildDaysWithTasks(parameters),
    nextTestAtMs: Number.isFinite(nextTestAtMs) ? nextTestAtMs : todayBucketMs,
    isOverdue: parameters.some((item) => item.isOverdue),
    reason: hasProblem
      ? 'Wykryto duze odchylenia. Testuj czesciej i wykonuj test po kazdej podmianie.'
      : 'Harmonogram automatycznie dopasowany do stabilnosci kazdego parametru.',
    requiresPostWaterChangeTest: hasProblem,
  };
}
