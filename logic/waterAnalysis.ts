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
  enabledTests: EnabledTests = {}
): WaterAnalysisResult {
  const isTestEnabled = (key: string) => Boolean(enabledTests?.[key]);

  const phValue = toNumeric(measurement.ph);
  const ghValue = toNumeric(measurement.gh);
  const khValue = toNumeric(measurement.kh);
  const caValue = toNumeric(measurement.ca);
  const mgValue = toNumeric(measurement.mg);
  const no2Value = toNumeric(measurement.no2);
  const no3Value = toNumeric(measurement.no3);
  const nh3nh4Value = toNumeric(measurement.nh3nh4);
  const po4Value = toNumeric(measurement.po4);
  const feValue = toNumeric(measurement.fe);
  const temperatureValue = toNumeric(measurement.temperature);
  const co2Value =
    toNumeric(measurement.co2) ?? calculateCo2FromKhPh(khValue, phValue);

  const recommendations: WaterRecommendation[] = [];

  if (isTestEnabled('no2') && no2Value !== null && no2Value > 0.2) {
    recommendations.push(
      createRecommendation({
        severity: 'critical',
        parameter: 'NO2',
        value: `${no2Value} mg/l`,
        expectedRange: '0 mg/l',
        issue: 'Toksyczny azotyn wykryty powyzej bezpiecznego poziomu.',
        action:
          'Natychmiastowa podmiana 50% wody, mocne napowietrzanie i kontrola filtra biologicznego.',
      })
    );
  } else if (isTestEnabled('no2') && no2Value !== null && no2Value > 0) {
    recommendations.push(
      createRecommendation({
        severity: 'critical',
        parameter: 'NO2',
        value: `${no2Value} mg/l`,
        expectedRange: '0 mg/l',
        issue: 'NO2 powinno wynosic 0.',
        action:
          'Natychmiastowa podmiana 30% wody i ograniczenie karmienia na 24h.',
      })
    );
  }

  if (isTestEnabled('no3') && no3Value !== null && no3Value > 80) {
    recommendations.push(
      createRecommendation({
        severity: 'critical',
        parameter: 'NO3',
        value: `${no3Value} mg/l`,
        expectedRange: '5-25 mg/l',
        issue: 'Bardzo wysokie azotany.',
        action:
          'Podmiana 40% wody i powtorzenie testu po 24h.',
      })
    );
  } else if (isTestEnabled('no3') && no3Value !== null && no3Value > 50) {
    recommendations.push(
      createRecommendation({
        severity: 'warning',
        parameter: 'NO3',
        value: `${no3Value} mg/l`,
        expectedRange: '5-25 mg/l',
        issue: 'Wysokie azotany.',
        action: 'Zrob podmiane wody 30% i ogranicz karmienie.',
      })
    );
  } else if (isTestEnabled('no3') && no3Value !== null && no3Value > 25) {
    recommendations.push(
      createRecommendation({
        severity: 'warning',
        parameter: 'NO3',
        value: `${no3Value} mg/l`,
        expectedRange: '5-25 mg/l',
        issue: 'Azotany zaczynaja wychodzic poza norme.',
        action: 'Zrob podmiane wody 20% w najblizszych 24h.',
      })
    );
  }

  if (isTestEnabled('ph') && phValue !== null && (phValue < 5.8 || phValue > 8.5)) {
    recommendations.push(
      createRecommendation({
        severity: 'critical',
        parameter: 'pH',
        value: `${phValue}`,
        expectedRange: '6.5-7.8',
        issue: 'pH daleko poza zalecanym zakresem.',
        action: isTestEnabled('kh')
          ? 'Sprawdz KH i zrodlo wody, koryguj pH powoli (max 0.2 na dobe).'
          : 'Sprawdz zrodlo wody i koryguj pH powoli (max 0.2 na dobe).',
      })
    );
  } else if (
    isTestEnabled('ph') &&
    phValue !== null &&
    (phValue < 6.5 || phValue > 7.8)
  ) {
    recommendations.push(
      createRecommendation({
        severity: 'warning',
        parameter: 'pH',
        value: `${phValue}`,
        expectedRange: '6.5-7.8',
        issue: 'pH poza wygodnym zakresem dla wiekszosci ryb towarzyskich.',
        action: isTestEnabled('kh')
          ? 'Sprawdz obsade i parametry wody (KH), unikaj gwaltownych korekt.'
          : 'Sprawdz obsade i parametry wody, unikaj gwaltownych korekt.',
      })
    );
  }

  if (isTestEnabled('gh') && ghValue !== null && (ghValue < 3 || ghValue > 22)) {
    recommendations.push(
      createRecommendation({
        severity: 'critical',
        parameter: 'GH',
        value: `${ghValue} dGH`,
        expectedRange: '5-14 dGH',
        issue: 'Twardosc ogolna mocno odbiega od standardu.',
        action:
          'Skoryguj mineralizacje przy podmianie i porownaj potrzeby obsady.',
      })
    );
  } else if (
    isTestEnabled('gh') &&
    ghValue !== null &&
    (ghValue < 5 || ghValue > 14)
  ) {
    recommendations.push(
      createRecommendation({
        severity: 'warning',
        parameter: 'GH',
        value: `${ghValue} dGH`,
        expectedRange: '5-14 dGH',
        issue: 'GH poza zalecanym zakresem roboczym.',
        action:
          'Dostosuj proporcje wody RO/kranowki lub mineralizator przy kolejnej podmianie.',
      })
    );
  }

  if (isTestEnabled('nh3nh4') && nh3nh4Value !== null && nh3nh4Value > 0.2) {
    recommendations.push(
      createRecommendation({
        severity: 'critical',
        parameter: 'NH3/NH4',
        value: `${nh3nh4Value} mg/l`,
        expectedRange: '<= 0.05 mg/l',
        issue: 'Zbyt wysokie stezenie amoniaku/jonu amonowego.',
        action:
          'Natychmiast podmien 40-50% wody, ogranicz karmienie na 24h i sprawdz filtr biologiczny.',
      })
    );
  } else if (
    isTestEnabled('nh3nh4') &&
    nh3nh4Value !== null &&
    nh3nh4Value > 0.05
  ) {
    recommendations.push(
      createRecommendation({
        severity: 'warning',
        parameter: 'NH3/NH4',
        value: `${nh3nh4Value} mg/l`,
        expectedRange: '<= 0.05 mg/l',
        issue: 'Podwyzszone stezenie amoniaku/jonu amonowego.',
        action: 'Podmien 25-30% wody i powtorz test za 24h.',
      })
    );
  }

  if (isTestEnabled('po4') && po4Value !== null && po4Value > 2) {
    recommendations.push(
      createRecommendation({
        severity: 'critical',
        parameter: 'PO4',
        value: `${po4Value} mg/l`,
        expectedRange: '0.1-1.0 mg/l',
        issue: 'Fosforany sa bardzo wysokie.',
        action:
          'Podmien 30-40% wody, ogranicz przekarmianie i skontroluj zrodla fosforanow.',
      })
    );
  } else if (isTestEnabled('po4') && po4Value !== null && po4Value > 1) {
    recommendations.push(
      createRecommendation({
        severity: 'warning',
        parameter: 'PO4',
        value: `${po4Value} mg/l`,
        expectedRange: '0.1-1.0 mg/l',
        issue: 'Fosforany sa podwyzszone.',
        action: 'Podmien 20-25% wody i monitoruj wzrost glonow.',
      })
    );
  }

  if (isTestEnabled('fe') && feValue !== null && feValue > 0.5) {
    recommendations.push(
      createRecommendation({
        severity: 'critical',
        parameter: 'Fe',
        value: `${feValue} mg/l`,
        expectedRange: '0.02-0.2 mg/l',
        issue: 'Stezenie zelaza jest zbyt wysokie.',
        action:
          'Wstrzymaj nawozenie zelazem, podmien 25-30% wody i sprawdz Fe ponownie za 24h.',
      })
    );
  } else if (isTestEnabled('fe') && feValue !== null && feValue > 0.2) {
    recommendations.push(
      createRecommendation({
        severity: 'warning',
        parameter: 'Fe',
        value: `${feValue} mg/l`,
        expectedRange: '0.02-0.2 mg/l',
        issue: 'Stezenie zelaza ponad zakres roboczy.',
        action: 'Zmniejsz dawkowanie nawozu i powtorz test za 1-2 dni.',
      })
    );
  }

  if (isTestEnabled('kh') && khValue !== null && (khValue < 1 || khValue > 14)) {
    recommendations.push(
      createRecommendation({
        severity: 'critical',
        parameter: 'KH',
        value: `${khValue} dKH`,
        expectedRange: '3-8 dKH',
        issue: 'Twardosc weglanowa mocno odbiega od stabilnego zakresu.',
        action:
          'Skoryguj mineralizacje przy podmianie i unikaj gwaltownych zmian pH.',
      })
    );
  } else if (
    isTestEnabled('kh') &&
    khValue !== null &&
    (khValue < 3 || khValue > 8)
  ) {
    recommendations.push(
      createRecommendation({
        severity: 'warning',
        parameter: 'KH',
        value: `${khValue} dKH`,
        expectedRange: '3-8 dKH',
        issue: 'KH poza zalecanym zakresem roboczym.',
        action:
          'Dostosuj mieszanke RO/kranowki lub mineralizator i monitoruj pH.',
      })
    );
  }

  if (
    isTestEnabled('ph') &&
    isTestEnabled('kh') &&
    co2Value !== null &&
    co2Value > 40
  ) {
    recommendations.push(
      createRecommendation({
        severity: 'critical',
        parameter: 'CO2',
        value: `${co2Value} mg/l`,
        expectedRange: '10-30 mg/l',
        issue: 'Szacowane CO2 jest zbyt wysokie.',
        action:
          'Natychmiast zwieksz napowietrzanie, zmniejsz dozowanie CO2 i celuj w 20-30 mg/l.',
      })
    );
  } else if (
    isTestEnabled('ph') &&
    isTestEnabled('kh') &&
    co2Value !== null &&
    co2Value < 10
  ) {
    recommendations.push(
      createRecommendation({
        severity: 'warning',
        parameter: 'CO2',
        value: `${co2Value} mg/l`,
        expectedRange: '10-30 mg/l',
        issue: 'Szacowane CO2 jest niskie dla zbiornika roslinnego.',
        action:
          'Jesli to akwarium roslinne, rozwaz stopniowe podniesienie CO2 i obserwuj reakcje ryb.',
      })
    );
  } else if (
    isTestEnabled('ph') &&
    isTestEnabled('kh') &&
    co2Value !== null &&
    co2Value > 30
  ) {
    recommendations.push(
      createRecommendation({
        severity: 'warning',
        parameter: 'CO2',
        value: `${co2Value} mg/l`,
        expectedRange: '10-30 mg/l',
        issue: 'Szacowane CO2 jest powyzej bezpiecznego zakresu roboczego.',
        action:
          'Zmniejsz dozowanie CO2 o 10-20% i sprawdz pH + KH po 24h.',
      })
    );
  }

  if (isTestEnabled('ca') && caValue !== null && (caValue < 10 || caValue > 100)) {
    recommendations.push(
      createRecommendation({
        severity: 'critical',
        parameter: 'Ca',
        value: `${caValue} mg/l`,
        expectedRange: '20-60 mg/l',
        issue: 'Wapn jest mocno poza zakresem roboczym.',
        action:
          'Skoryguj mineralizacje (Ca) stopniowo i powtorz test w ciagu 24h.',
      })
    );
  } else if (
    isTestEnabled('ca') &&
    caValue !== null &&
    (caValue < 20 || caValue > 60)
  ) {
    recommendations.push(
      createRecommendation({
        severity: 'warning',
        parameter: 'Ca',
        value: `${caValue} mg/l`,
        expectedRange: '20-60 mg/l',
        issue: 'Wapn poza zalecanym zakresem.',
        action:
          'Dostosuj dawke mineralizatora i kontrolnie powtorz test Ca za 2-3 dni.',
      })
    );
  }

  if (isTestEnabled('mg') && mgValue !== null && (mgValue < 2 || mgValue > 35)) {
    recommendations.push(
      createRecommendation({
        severity: 'critical',
        parameter: 'Mg',
        value: `${mgValue} mg/l`,
        expectedRange: '5-20 mg/l',
        issue: 'Magnez jest mocno poza zakresem roboczym.',
        action:
          'Skoryguj mineralizacje (Mg) stopniowo i powtorz test w ciagu 24h.',
      })
    );
  } else if (
    isTestEnabled('mg') &&
    mgValue !== null &&
    (mgValue < 5 || mgValue > 20)
  ) {
    recommendations.push(
      createRecommendation({
        severity: 'warning',
        parameter: 'Mg',
        value: `${mgValue} mg/l`,
        expectedRange: '5-20 mg/l',
        issue: 'Magnez poza zalecanym zakresem.',
        action:
          'Dostosuj dawke mineralizatora i kontrolnie powtorz test Mg za 2-3 dni.',
      })
    );
  }

  if (
    isTestEnabled('temperature') &&
    temperatureValue !== null &&
    (temperatureValue < 22 || temperatureValue > 29)
  ) {
    recommendations.push(
      createRecommendation({
        severity: 'critical',
        parameter: 'Temperatura',
        value: `${temperatureValue} C`,
        expectedRange: '24-27 C',
        issue: 'Temperatura grozna dla stabilnosci akwarium.',
        action:
          'Skoryguj grzalke/chlodzenie i wracaj do zakresu stopniowo.',
      })
    );
  } else if (
    isTestEnabled('temperature') &&
    temperatureValue !== null &&
    (temperatureValue < 24 || temperatureValue > 27)
  ) {
    recommendations.push(
      createRecommendation({
        severity: 'warning',
        parameter: 'Temperatura',
        value: `${temperatureValue} C`,
        expectedRange: '24-27 C',
        issue: 'Temperatura poza zakresem docelowym.',
        action: 'Skoryguj ustawienia grzalki i obserwuj ryby.',
      })
    );
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
  now = new Date()
): WaterTestingScheduleResult {
  const todayBucketMs = getDayBucketMs(now);
  const defaultBaseMs = getCreatedAtMs(measurements[0]?.createdAt) || now.getTime();
  const baseDate = new Date(defaultBaseMs);
  const isTestEnabled = (key: string) => Boolean(enabledTests?.[key]);

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

  const parameters: WaterTestingParameterPlan[] = [];

  if (isTestEnabled('no2') && no2Value === null) {
    parameters.push(
      buildPlan('no2', 'NO2', 'problem', 0, 'Brak odczytu - wykonaj test NO2.')
    );
  } else if (isTestEnabled('no2') && no2 > 0.1) {
    parameters.push(
      buildPlan(
        'no2',
        'NO2',
        'problem',
        1,
        no2 > 0.2
          ? 'NO2 > 0.2 mg/l (alarm). Test codziennie, przy zatruciu nawet 2x dziennie.'
          : 'NO2 > 0.1 mg/l. Test codziennie do powrotu do 0.'
      )
    );
  } else if (isTestEnabled('no2') && no2 > 0) {
    parameters.push(
      buildPlan(
        'no2',
        'NO2',
        'warning',
        no2 >= 0.05 ? 1 : 2,
        `NO2 ${no2} mg/l (lekkie odchylenie). Test co 1-2 dni do wyniku 0.`
      )
    );
  } else if (isTestEnabled('no2')) {
    parameters.push(
      buildPlan('no2', 'NO2', 'ok', 7, 'NO2 = 0. Test kontrolny 1x na tydzien.')
    );
  }

  if (isTestEnabled('no3') && no3Value === null) {
    parameters.push(
      buildPlan('no3', 'NO3', 'problem', 0, 'Brak odczytu - wykonaj test NO3.')
    );
  } else if (isTestEnabled('no3') && no3 > 50) {
    parameters.push(
      buildPlan(
        'no3',
        'NO3',
        'problem',
        1,
        `NO3 ${no3} mg/l (>50). Test codziennie do zejscia ponizej 30.`
      )
    );
  } else if (
    isTestEnabled('no3') &&
    (no3 >= 30 || (no3Trend.direction === 'up' && no3 > 25))
  ) {
    parameters.push(
      buildPlan(
        'no3',
        'NO3',
        'warning',
        no3 >= 40 ? 2 : 3,
        `NO3 ${no3} mg/l lub trend wzrostowy. Test co 2-3 dni do stabilizacji.`
      )
    );
  } else if (isTestEnabled('no3')) {
    parameters.push(
      buildPlan('no3', 'NO3', 'ok', 7, 'NO3 stabilne. Test kontrolny 1x na tydzien.')
    );
  }

  if (isTestEnabled('nh3nh4') && nh3nh4Value === null) {
    parameters.push(
      buildPlan('nh3nh4', 'NH3/NH4', 'problem', 0, 'Brak odczytu - wykonaj test NH3/NH4.')
    );
  } else if (isTestEnabled('nh3nh4') && nh3nh4 > 0.2) {
    parameters.push(
      buildPlan(
        'nh3nh4',
        'NH3/NH4',
        'problem',
        1,
        `NH3/NH4 ${nh3nh4} mg/l (wysokie). Test codziennie do zejscia <= 0.05.`
      )
    );
  } else if (isTestEnabled('nh3nh4') && nh3nh4 > 0.05) {
    parameters.push(
      buildPlan(
        'nh3nh4',
        'NH3/NH4',
        'warning',
        2,
        `NH3/NH4 ${nh3nh4} mg/l (podwyzszone). Test co 1-2 dni do stabilizacji.`
      )
    );
  } else if (isTestEnabled('nh3nh4')) {
    parameters.push(
      buildPlan('nh3nh4', 'NH3/NH4', 'ok', 7, 'NH3/NH4 stabilne. Test kontrolny 1x na tydzien.')
    );
  }

  if (isTestEnabled('po4') && po4Value === null) {
    parameters.push(
      buildPlan('po4', 'PO4', 'problem', 0, 'Brak odczytu - wykonaj test PO4.')
    );
  } else if (isTestEnabled('po4') && po4 > 2) {
    parameters.push(
      buildPlan(
        'po4',
        'PO4',
        'problem',
        1,
        `PO4 ${po4} mg/l (wysokie). Test codziennie do zejscia <= 1.0.`
      )
    );
  } else if (isTestEnabled('po4') && po4 > 1) {
    parameters.push(
      buildPlan(
        'po4',
        'PO4',
        'warning',
        3,
        `PO4 ${po4} mg/l (podwyzszone). Test co 2-3 dni.`
      )
    );
  } else if (isTestEnabled('po4')) {
    parameters.push(
      buildPlan('po4', 'PO4', 'ok', 7, 'PO4 stabilne. Test kontrolny 1x na tydzien.')
    );
  }

  if (isTestEnabled('fe') && feValue === null) {
    parameters.push(
      buildPlan('fe', 'Fe', 'problem', 0, 'Brak odczytu - wykonaj test Fe.')
    );
  } else if (isTestEnabled('fe') && fe > 0.5) {
    parameters.push(
      buildPlan(
        'fe',
        'Fe',
        'problem',
        1,
        `Fe ${fe} mg/l (wysokie). Test codziennie do zejscia <= 0.2.`
      )
    );
  } else if (isTestEnabled('fe') && fe > 0.2) {
    parameters.push(
      buildPlan(
        'fe',
        'Fe',
        'warning',
        3,
        `Fe ${fe} mg/l (podwyzszone). Test co 2-3 dni.`
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

  if (isTestEnabled('gh') && ghValue === null) {
    parameters.push(
      buildPlan('gh', 'GH', 'problem', 0, 'Brak odczytu - wykonaj test GH.')
    );
  } else if (isTestEnabled('gh') && (gh < 3 || gh > 18)) {
    parameters.push(
      buildPlan(
        'gh',
        'GH',
        'problem',
        gh < 2 || gh > 20 ? 1 : 2,
        `GH ${gh} dGH mocno poza zakresem. Test co 1-3 dni do stabilizacji.`
      )
    );
  } else if (
    isTestEnabled('gh') &&
    (gh < 5 || gh > 14 || ghSpread > 2.5)
  ) {
    parameters.push(
      buildPlan(
        'gh',
        'GH',
        'warning',
        ghSpread > 2.5 ? 3 : 5,
        `GH ${gh} dGH lekko poza zakresem lub niestabilne. Test co 3-7 dni.`
      )
    );
  } else if (isTestEnabled('gh')) {
    parameters.push(
      buildPlan('gh', 'GH', 'ok', 21, 'GH stabilne. Test kontrolny co 2-4 tygodnie.')
    );
  }

  if (isTestEnabled('kh') && khValue === null) {
    parameters.push(
      buildPlan('kh', 'KH', 'problem', 0, 'Brak odczytu - wykonaj test KH.')
    );
  } else if (isTestEnabled('kh') && (kh < 2 || kh > 12)) {
    parameters.push(
      buildPlan(
        'kh',
        'KH',
        'problem',
        kh < 1.5 || kh > 14 ? 1 : 2,
        `KH ${kh} dKH mocno poza zakresem. Test co 1-3 dni do stabilizacji.`
      )
    );
  } else if (
    isTestEnabled('kh') &&
    (kh < 3 || kh > 8 || khSpread > 1.5)
  ) {
    parameters.push(
      buildPlan(
        'kh',
        'KH',
        'warning',
        khSpread > 1.5 ? 3 : 5,
        `KH ${kh} dKH lekko poza zakresem lub niestabilne. Test co 3-7 dni.`
      )
    );
  } else if (isTestEnabled('kh')) {
    parameters.push(
      buildPlan('kh', 'KH', 'ok', 21, 'KH stabilne. Test kontrolny co 2-4 tygodnie.')
    );
  }

  if (isTestEnabled('ca') && caValue === null) {
    parameters.push(
      buildPlan('ca', 'Ca', 'problem', 0, 'Brak odczytu - wykonaj test Ca.')
    );
  } else if (isTestEnabled('ca') && (ca < 10 || ca > 100)) {
    parameters.push(
      buildPlan(
        'ca',
        'Ca',
        'problem',
        1,
        `Ca ${ca} mg/l mocno poza zakresem. Test codziennie do stabilizacji.`
      )
    );
  } else if (isTestEnabled('ca') && (ca < 20 || ca > 60)) {
    parameters.push(
      buildPlan(
        'ca',
        'Ca',
        'warning',
        3,
        `Ca ${ca} mg/l lekko poza zakresem. Test co 3-7 dni.`
      )
    );
  } else if (isTestEnabled('ca')) {
    parameters.push(
      buildPlan('ca', 'Ca', 'ok', 21, 'Ca stabilne. Test kontrolny co 2-4 tygodnie.')
    );
  }

  if (isTestEnabled('mg') && mgValue === null) {
    parameters.push(
      buildPlan('mg', 'Mg', 'problem', 0, 'Brak odczytu - wykonaj test Mg.')
    );
  } else if (isTestEnabled('mg') && (mg < 2 || mg > 35)) {
    parameters.push(
      buildPlan(
        'mg',
        'Mg',
        'problem',
        1,
        `Mg ${mg} mg/l mocno poza zakresem. Test codziennie do stabilizacji.`
      )
    );
  } else if (isTestEnabled('mg') && (mg < 5 || mg > 20)) {
    parameters.push(
      buildPlan(
        'mg',
        'Mg',
        'warning',
        3,
        `Mg ${mg} mg/l lekko poza zakresem. Test co 3-7 dni.`
      )
    );
  } else if (isTestEnabled('mg')) {
    parameters.push(
      buildPlan('mg', 'Mg', 'ok', 21, 'Mg stabilne. Test kontrolny co 2-4 tygodnie.')
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
