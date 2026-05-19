import { evaluateCycleDrift, evaluateEmergencyState } from './emergencyService';

function toMillisTaskService(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumericTaskService(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDayBucketTaskService(value) {
  const ms = toMillisTaskService(value);
  if (!ms) return 0;
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function buildSimpleTrendTaskService(series, threshold = 0) {
  if (!Array.isArray(series) || series.length < 2) {
    return { direction: 'unknown', delta: 0 };
  }
  const newest = toNumericTaskService(series[0]);
  const oldest = toNumericTaskService(series[series.length - 1]);
  if (newest === null || oldest === null) {
    return { direction: 'unknown', delta: 0 };
  }
  const delta = newest - oldest;
  if (delta > threshold) {
    return { direction: 'up', delta: Math.round(delta * 100) / 100 };
  }
  if (delta < -threshold) {
    return { direction: 'down', delta: Math.round(delta * 100) / 100 };
  }
  return { direction: 'stable', delta: Math.round(delta * 100) / 100 };
}

function getTaskPriorityLabelTaskService(score) {
  if (score >= 85) return 'critical';
  if (score >= 60) return 'important';
  return 'routine';
}

function clampTaskService(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

function getTankAgeDaysTaskService(tank, context = {}) {
  const todayDayBucketMs =
    Number.isFinite(Number(context.todayDayBucketMs)) &&
    Number(context.todayDayBucketMs) > 0
      ? Number(context.todayDayBucketMs)
      : getDayBucketTaskService(new Date());
  const startMs = toMillisTaskService(tank?.onboardingStartAt ?? tank?.createdAt);
  if (!startMs) {
    return 0;
  }
  const startBucket = getDayBucketTaskService(startMs);
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.floor((todayDayBucketMs - startBucket) / dayMs) + 1);
}

function getRecentSeriesTaskService(measurements, key, limit = 5) {
  return (measurements ?? [])
    .slice(0, limit)
    .map((item) => toNumericTaskService(item?.[key]))
    .filter((value) => value !== null);
}

export function generateAdaptiveTaskSchedule(tank, context = {}) {
  if (!tank) {
    return {
      generatedAt: new Date(),
      tankAgeDays: 0,
      risk: { level: 'routine', score: 0 },
      tasks: [],
      dueToday: [],
      summary: 'Brak akwarium do analizy harmonogramu.',
    };
  }

  const latestMeasurement = context.latestMeasurement ?? null;
  const latestAnalysis = context.latestAnalysis ?? null;
  const measurements = Array.isArray(context.measurements) ? context.measurements : [];
  const stockItems = Array.isArray(context.stockItems) ? context.stockItems : [];
  const equipmentAssessment = context.equipmentAssessment ?? null;
  const stockingCompatibility = context.stockingCompatibility ?? null;
  const issueCases = Array.isArray(context.issueCases) ? context.issueCases : [];
  const onboardingPlan = context.onboardingPlan ?? null;

  const todayDayBucketMs =
    Number.isFinite(Number(context.todayDayBucketMs)) &&
    Number(context.todayDayBucketMs) > 0
      ? Number(context.todayDayBucketMs)
      : getDayBucketTaskService(new Date());
  const dayMs = 24 * 60 * 60 * 1000;
  const tankAgeDays = getTankAgeDaysTaskService(tank, { todayDayBucketMs });

  const fishItems = stockItems.filter((item) => String(item?.type ?? '').toLowerCase() === 'fish');
  const fishCount = fishItems.reduce((sum, item) => {
    const quantity = Number(item?.quantity);
    return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
  }, 0);
  const plantCount = stockItems.filter((item) => String(item?.type ?? '').toLowerCase() === 'plant').length;

  const no2 = toNumericTaskService(latestMeasurement?.no2);
  const nh3nh4 = toNumericTaskService(latestMeasurement?.nh3nh4);
  const no3 = toNumericTaskService(latestMeasurement?.no3);
  const temperature = toNumericTaskService(latestMeasurement?.temperature);

  const no3Series = getRecentSeriesTaskService(measurements, 'no3', 6);
  const no2Series = getRecentSeriesTaskService(measurements, 'no2', 6);
  const temperatureSeries = getRecentSeriesTaskService(measurements, 'temperature', 6);
  const no3Trend = buildSimpleTrendTaskService(no3Series, 4);
  const no2Trend = buildSimpleTrendTaskService(no2Series, 0.03);
  const temperatureTrend = buildSimpleTrendTaskService(temperatureSeries, 1);

  let riskScore = 20;
  if ((no2 !== null && no2 > 0.2) || (nh3nh4 !== null && nh3nh4 > 0.2)) riskScore += 38;
  else if ((no2 !== null && no2 > 0.05) || (nh3nh4 !== null && nh3nh4 > 0.05)) riskScore += 18;
  if (no3 !== null && no3 >= 35) riskScore += 12;
  if (no3Trend.direction === 'up') riskScore += 8;
  if (no2Trend.direction === 'up') riskScore += 10;
  if (temperatureTrend.direction !== 'stable' && temperatureTrend.direction !== 'unknown') riskScore += 6;
  if (String(latestAnalysis?.status ?? '').toLowerCase() === 'critical') riskScore += 20;
  else if (String(latestAnalysis?.status ?? '').toLowerCase() === 'warning') riskScore += 10;
  if (String(equipmentAssessment?.filter?.status ?? '').toLowerCase() === 'critical') riskScore += 20;
  else if (String(equipmentAssessment?.filter?.status ?? '').toLowerCase() === 'warning') riskScore += 10;
  if (String(stockingCompatibility?.overallStatus ?? '').toLowerCase() === 'incompatible') riskScore += 16;
  else if (String(stockingCompatibility?.overallStatus ?? '').toLowerCase() === 'high_risk') riskScore += 10;
  if (issueCases.filter((item) => String(item?.status ?? 'active').toLowerCase() === 'active').length > 0) {
    riskScore += 10;
  }
  if (tankAgeDays > 0 && tankAgeDays <= 21) riskScore += 12;
  else if (tankAgeDays > 21 && tankAgeDays <= 45) riskScore += 6;
  riskScore = clampTaskService(riskScore, 0, 100);
  const riskLevel = getTaskPriorityLabelTaskService(riskScore);

  const tasks = [];
  const addTask = ({
    key,
    title,
    details,
    baseIntervalDays,
    intervalModifierDays = 0,
    riskBoost = 0,
    source = 'engine',
  }) => {
    const intervalDays = clampTaskService(
      Math.round(baseIntervalDays + intervalModifierDays),
      1,
      45
    );
    const score = clampTaskService(Math.round(riskScore + riskBoost), 0, 100);
    const priority = getTaskPriorityLabelTaskService(score);
    const dueInDays = priority === 'critical' ? 0 : priority === 'important' ? Math.min(2, intervalDays - 1) : intervalDays;
    const nextDueAtMs = todayDayBucketMs + dueInDays * dayMs;
    tasks.push({
      id: `adaptive-${key}`,
      key,
      title,
      details,
      source,
      priority,
      riskScore: score,
      intervalDays,
      dueInDays,
      nextDueAtMs,
      dayBucketMs: getDayBucketTaskService(nextDueAtMs),
      isDueToday: dueInDays === 0,
    });
  };

  const no2nh3Risk =
    (no2 !== null && no2 > 0.05) || (nh3nh4 !== null && nh3nh4 > 0.05);
  const highToxins =
    (no2 !== null && no2 > 0.2) || (nh3nh4 !== null && nh3nh4 > 0.2);

  addTask({
    key: 'water-change',
    title: 'Podmiana wody',
    details: highToxins
      ? 'Parametry toksyn sa niebezpieczne - wykonaj podmianę natychmiast.'
      : no2nh3Risk || no3Trend.direction === 'up'
        ? 'Podmiany czestsze do stabilizacji trendow NO2/NO3.'
        : 'Rutynowa podmiana dla utrzymania stabilności biologicznej.',
    baseIntervalDays: tankAgeDays <= 21 ? 2 : tankAgeDays <= 45 ? 4 : 7,
    intervalModifierDays: no2nh3Risk ? -2 : no3Trend.direction === 'up' ? -1 : 0,
    riskBoost: 10,
    source: 'water',
  });

  addTask({
    key: 'water-tests',
    title: 'Testy wody',
    details:
      'Sprawdz zestaw podstawowy: NO2, NO3, NH3/NH4, pH i temperature. Czestotliwosc adaptowana do ryzyka i trendow.',
    baseIntervalDays: tankAgeDays <= 21 ? 1 : tankAgeDays <= 45 ? 3 : 7,
    intervalModifierDays: no2nh3Risk || no2Trend.direction === 'up' ? -1 : 0,
    riskBoost: 8,
    source: 'water',
  });

  addTask({
    key: 'filter-maintenance',
    title: 'Kontrola i czyszczenie filtra',
    details:
      'Sprawdz przepływ, droznosc i stan mediow. Nie płucz wszystkich mediow biologicznych naraz.',
    baseIntervalDays: 14,
    intervalModifierDays:
      String(equipmentAssessment?.filter?.status ?? '').toLowerCase() === 'warning'
        ? -5
        : String(equipmentAssessment?.filter?.status ?? '').toLowerCase() === 'critical'
          ? -10
          : 0,
    riskBoost: 6,
    source: 'equipment',
  });

  addTask({
    key: 'prefilter-rinse',
    title: 'Plukanie prefiltra',
    details:
      'Przepływ i natlenienie zależą od drożności prefiltra. Płucz częściej przy dużej obsadzie.',
    baseIntervalDays: fishCount >= 20 ? 4 : fishCount >= 10 ? 7 : 10,
    intervalModifierDays: riskLevel === 'critical' ? -2 : 0,
    riskBoost: 4,
    source: 'equipment',
  });

  addTask({
    key: 'fertilization',
    title: 'Nawozenie roslin',
    details:
      'Dostosuj dawki nawozenia do kondycji roslin, światła i trendow parametrów. Zmieniaj stopniowo.',
    baseIntervalDays: plantCount > 0 ? 2 : 14,
    intervalModifierDays: plantCount > 0 && no3Trend.direction === 'up' ? -1 : 0,
    riskBoost: plantCount > 0 ? 3 : -8,
    source: 'plants',
  });

  addTask({
    key: 'pruning',
    title: 'Przycinka roslin',
    details:
      'Usuwaj nadmierny przyrost i słabe liście, zeby poprawic cyrkulacje i ograniczy? ryzyko glonow.',
    baseIntervalDays: plantCount >= 12 ? 7 : plantCount >= 5 ? 10 : 21,
    intervalModifierDays: plantCount > 0 && no3Trend.direction === 'up' ? -2 : 0,
    riskBoost: plantCount > 0 ? 2 : -10,
    source: 'plants',
  });

  const targetTempMin = toNumericTaskService(tank?.targetRanges?.temperature?.min);
  const targetTempMax = toNumericTaskService(tank?.targetRanges?.temperature?.max);
  const tempOutOfRange =
    temperature !== null &&
    ((targetTempMin !== null && temperature < targetTempMin) ||
      (targetTempMax !== null && temperature > targetTempMax));
  addTask({
    key: 'temperature-check',
    title: 'Kontrola temperatury',
    details: tempOutOfRange
      ? 'Temperatura poza zakresem docelowym - kontroluj codzieńnie do stabilizacji.'
      : 'Sprawdzaj stabilność temperatury i działanie grzalki.',
    baseIntervalDays: tempOutOfRange || tankAgeDays <= 30 ? 1 : 3,
    intervalModifierDays:
      temperatureTrend.direction !== 'stable' && temperatureTrend.direction !== 'unknown'
        ? -1
        : 0,
    riskBoost: tempOutOfRange ? 12 : 2,
    source: 'temperature',
  });

  addTask({
    key: 'equipment-service',
    title: 'Serwis sprzetu',
    details:
      'Sprawdz stan wirnika, przewodow, uszczelek i oświetlenia. Zapobiegaj awariom przez regularny serwis.',
    baseIntervalDays: 30,
    intervalModifierDays:
      String(equipmentAssessment?.filter?.status ?? '').toLowerCase() === 'critical' ? -20 : 0,
    riskBoost: 1,
    source: 'equipment',
  });

  if (Boolean(onboardingPlan?.isActive) && Array.isArray(onboardingPlan?.todayItems) && onboardingPlan.todayItems.length > 0) {
    addTask({
      key: 'onboarding-check',
      title: 'Zadania startowe (onboarding)',
      details: onboardingPlan.todayItems.slice(0, 2).join(' | '),
      baseIntervalDays: 1,
      intervalModifierDays: -1,
      riskBoost: 14,
      source: 'onboarding',
    });
  }

  const tasksSorted = [...tasks].sort((a, b) => {
    if (a.dayBucketMs !== b.dayBucketMs) {
      return a.dayBucketMs - b.dayBucketMs;
    }
    return b.riskScore - a.riskScore;
  });
  const dueToday = tasksSorted.filter((item) => item.dayBucketMs <= todayDayBucketMs);

  return {
    generatedAt: new Date(),
    tankAgeDays,
    risk: {
      level: riskLevel,
      score: riskScore,
      factors: {
        no2,
        nh3nh4,
        no3,
        no3Trend: no3Trend.direction,
        no2Trend: no2Trend.direction,
        temperatureTrend: temperatureTrend.direction,
      },
    },
    tasks: tasksSorted,
    dueToday,
    summary:
      dueToday.length > 0
        ? `Dzis zaplanowano ${dueToday.length} zadan adaptacyjnych.`
        : 'Brak zadan na dzis, kolejne zadania sa zaplanowane automatycznie.',
  };
}

export function buildTodayActionPlanService(tank, context = {}) {
  const toMillis = (value) => {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (value instanceof Date) return value.getTime();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const toNumeric = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const toDayBucket = (value) => {
    const ms = toMillis(value);
    if (!ms) return 0;
    const date = new Date(ms);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };

  const nowDayBucketMs =
    Number.isFinite(Number(context.todayDayBucketMs)) &&
    Number(context.todayDayBucketMs) > 0
      ? Number(context.todayDayBucketMs)
      : toDayBucket(new Date());

  const candidatesByCategory = {
    critical: [],
    important: [],
    routine: [],
  };
  const addCandidate = (
    categoryKey,
    id,
    title,
    details = '',
    source = '',
    score = 0
  ) => {
    if (!candidatesByCategory[categoryKey]) {
      return;
    }
    const normalizedId = String(id ?? '').trim().toLowerCase();
    const normalizedTitle = String(title ?? '').trim();
    if (!normalizedId || !normalizedTitle) {
      return;
    }

    const alreadyExists = candidatesByCategory[categoryKey].some(
      (item) => item.id === normalizedId
    );
    if (alreadyExists) {
      return;
    }

    candidatesByCategory[categoryKey].push({
      id: normalizedId,
      categoryKey,
      categoryLabel:
        categoryKey === 'critical'
          ? 'Krytyczne'
          : categoryKey === 'important'
            ? 'Wazne'
            : 'Rutynowe',
      title: normalizedTitle,
      details: String(details ?? '').trim(),
      source: String(source ?? '').trim(),
      score: Number.isFinite(Number(score)) ? Number(score) : 0,
    });
  };

  if (!tank) {
    return {
      criticalAction: null,
      importantAction: null,
      routineAction: null,
      items: [],
      count: 0,
    };
  }

  const latestMeasurement = context.latestMeasurement ?? null;
  const latestAnalysis = context.latestAnalysis ?? null;
  const measurements = Array.isArray(context.measurements) ? context.measurements : [];
  const schedule = context.schedule ?? null;
  const issueCases = Array.isArray(context.issueCases) ? context.issueCases : [];
  const healthAssessment = context.healthAssessment ?? null;
  const equipmentAssessment = context.equipmentAssessment ?? null;
  const stockingCompatibility = context.stockingCompatibility ?? null;
  const onboardingPlan = context.onboardingPlan ?? null;
  const adaptiveSchedule = context.adaptiveSchedule ?? null;
  const emergencyState =
    context.emergencyState ??
    evaluateEmergencyState(
      tank,
      latestMeasurement,
      equipmentAssessment,
      context.symptoms
    );

  if (emergencyState?.isEmergency) {
    addCandidate(
      emergencyState.severity === 'critical' ? 'critical' : 'important',
      'emergency-state',
      emergencyState.title || 'Tryb awaryjny akwarium',
      emergencyState.steps?.slice(0, 2).join(' | ') || emergencyState.summary,
      'emergency',
      emergencyState.severity === 'critical' ? 110 : 88
    );
  }

  const no2 = toNumeric(latestMeasurement?.no2);
  const nh3nh4 = toNumeric(latestMeasurement?.nh3nh4);
  if ((no2 !== null && no2 > 0.2) || (nh3nh4 !== null && nh3nh4 > 0.2)) {
    addCandidate(
      'critical',
      'critical-toxins',
      'Natychmiastowy alert wody',
      'NO2 lub NH3/NH4 jest na poziomie niebezpiecznym. Zrób szybka podmianę wody i ogranicz karmienie.',
      'water',
      100
    );
  } else if ((no2 !== null && no2 > 0.05) || (nh3nh4 !== null && nh3nh4 > 0.05)) {
    addCandidate(
      'important',
      'important-toxins',
      'Podwyzszone toksyny',
      'NO2 lub NH3/NH4 jest podwyzszone. Sprawdz filtracje i powtorz test po korekcie.',
      'water',
      84
    );
  }

  if (latestAnalysis?.status === 'critical') {
    const topCriticalRecommendation = (latestAnalysis.recommendations ?? []).find(
      (item) => String(item?.severity ?? '').toLowerCase() === 'critical'
    );
    addCandidate(
      'critical',
      'critical-analysis',
      topCriticalRecommendation?.action || 'Krytyczne odchylenie parametrów',
      topCriticalRecommendation?.parameter
        ? `Parametr: ${topCriticalRecommendation.parameter}`
        : 'Wymagana szybka korekta i kontrolny pomiar.',
      'water',
      98
    );
  } else if (latestAnalysis?.status === 'warning') {
    const topWarningRecommendation =
      (latestAnalysis.recommendations ?? []).find(
        (item) => String(item?.severity ?? '').toLowerCase() !== 'ok'
      ) ?? latestAnalysis?.recommendations?.[0];
    addCandidate(
      'important',
      'important-analysis',
      topWarningRecommendation?.action || 'Skoryguj warunki w akwarium',
      topWarningRecommendation?.parameter
        ? `Parametr: ${topWarningRecommendation.parameter}`
        : 'Widoczne odchylenia od zakresu docelowego.',
      'water',
      76
    );
  }

  const todayRecommendations = (latestAnalysis?.recommendations ?? []).filter((item) => {
    const dueAtMs = Number(item?.dueAtMs);
    const dayBucket =
      Number.isFinite(dueAtMs) && dueAtMs > 0
        ? toDayBucket(dueAtMs)
        : nowDayBucketMs;
    return dayBucket === nowDayBucketMs;
  });
  if (todayRecommendations.length > 0) {
    const criticalCount = todayRecommendations.filter(
      (item) => String(item?.severity ?? '').toLowerCase() === 'critical'
    ).length;
    addCandidate(
      criticalCount > 0 ? 'critical' : 'important',
      'today-recommendations',
      `Wykonaj ${todayRecommendations.length} korekty parametrów`,
      todayRecommendations
        .slice(0, 2)
        .map((item) => `${item.parameter}: ${item.action}`)
        .join(' | '),
      'water',
      criticalCount > 0 ? 95 : 72
    );
  }

  const todayScheduleItems = (schedule?.parameters ?? []).filter((item) => {
    const dayBucket = Number(item?.dayBucketMs);
    return Number.isFinite(dayBucket) && dayBucket === nowDayBucketMs;
  });
  if (todayScheduleItems.length > 0) {
    addCandidate(
      'routine',
      'routine-tests-schedule',
      `Zaplanuj testy wody (${todayScheduleItems.length})`,
      todayScheduleItems
        .slice(0, 3)
        .map((item) => String(item?.label ?? item?.key ?? '').trim())
        .filter(Boolean)
        .join(', '),
      'trend',
      48
    );
  }

  const adaptiveDueToday = Array.isArray(adaptiveSchedule?.dueToday)
    ? adaptiveSchedule.dueToday
    : [];
  if (adaptiveDueToday.length > 0) {
    const highestRiskTask = [...adaptiveDueToday].sort(
      (a, b) => Number(b?.riskScore ?? 0) - Number(a?.riskScore ?? 0)
    )[0];
    const highestPriority = String(highestRiskTask?.priority ?? '').toLowerCase();
    addCandidate(
      highestPriority === 'critical' ? 'critical' : highestPriority === 'important' ? 'important' : 'routine',
      'adaptive-schedule-due',
      `Harmonogram adaptacyjny: ${adaptiveDueToday.length} zadan na dzis`,
      adaptiveDueToday
        .slice(0, 2)
        .map((item) => `${item.title}: ${item.details}`)
        .join(' | '),
      'adaptive-schedule',
      highestPriority === 'critical' ? 91 : highestPriority === 'important' ? 73 : 52
    );
  }

  const no2Series = measurements
    .map((item) => toNumeric(item?.no2))
    .filter((value) => value !== null)
    .slice(0, 3);
  if (no2Series.length >= 2 && no2Series[0] > no2Series[1] && no2Series[0] > 0.02) {
    addCandidate(
      'important',
      'important-no2-trend-up',
      'Trend NO2 idzie w gore',
      `Ostatnio: ${no2Series[0]} (wczesniej: ${no2Series[1]}).`,
      'trend',
      82
    );
  }

  const no3Series = measurements
    .map((item) => toNumeric(item?.no3))
    .filter((value) => value !== null)
    .slice(0, 3);
  if (no3Series.length >= 2 && no3Series[0] > no3Series[1] && no3Series[0] >= 35) {
    addCandidate(
      'important',
      'important-no3-trend-up',
      'Trend NO3 narasta',
      `Ostatnio: ${no3Series[0]} (wczesniej: ${no3Series[1]}).`,
      'trend',
      68
    );
  }

  const filterStatus = String(equipmentAssessment?.filter?.status ?? '').toLowerCase();
  const heaterStatus = String(equipmentAssessment?.heater?.status ?? '').toLowerCase();
  if (filterStatus === 'critical' || filterStatus === 'none') {
    addCandidate(
      'critical',
      'critical-filter',
      'Filtracja wymaga natychmiastowej reakcji',
      String(
        equipmentAssessment?.filter?.actions?.[0] ??
          equipmentAssessment?.filter?.details ??
          'Sprawdz działanie i wydajnosc filtra.'
      ),
      'equipment',
      92
    );
  } else if (filterStatus === 'warning') {
    addCandidate(
      'important',
      'important-filter',
      'Filtracja do poprawy',
      String(
        equipmentAssessment?.filter?.actions?.[0] ??
          equipmentAssessment?.filter?.details ??
          'Dostosuj filtracje do obsady.'
      ),
      'equipment',
      70
    );
  }
  if (heaterStatus === 'critical' || heaterStatus === 'none') {
    addCandidate(
      'important',
      'important-heater',
      'Kontrola grzalki',
      String(
        equipmentAssessment?.heater?.actions?.[0] ??
          equipmentAssessment?.heater?.details ??
          'Sprawdz stabilność temperatury.'
      ),
      'equipment',
      66
    );
  }

  const overallStockingStatus = String(stockingCompatibility?.overallStatus ?? '').toLowerCase();
  if (overallStockingStatus === 'incompatible') {
    addCandidate(
      'critical',
      'critical-stocking',
      'Obsada jest niekompatybilna',
      'Wysokie ryzyko konfliktów lub niezgodnosci warunkow.',
      'stocking',
      90
    );
  } else if (overallStockingStatus === 'high_risk' || overallStockingStatus === 'caution') {
    addCandidate(
      'important',
      'important-stocking',
      'Obsada wymaga korekty',
      'Zredukowac ryzyko przez dopasowanie liczebnosci i gatunkow.',
      'stocking',
      64
    );
  }

  const activeIssueCount = issueCases.filter(
    (item) => String(item?.status ?? 'active').toLowerCase() === 'active'
  ).length;
  if (activeIssueCount > 0) {
    addCandidate(
      'important',
      'important-active-issues',
      `Aktywne problemy: ${activeIssueCount}`,
      'Sprawdz harmonogram leczenia lub plan ograniczania glonow.',
      'issues',
      62
    );
  }

  const onboardingTodayItems = Array.isArray(onboardingPlan?.todayItems)
    ? onboardingPlan.todayItems
    : [];
  if (Boolean(onboardingPlan?.isActive) && onboardingTodayItems.length > 0) {
    addCandidate(
      'routine',
      'routine-onboarding-today',
      `Onboarding: ${onboardingTodayItems.length} krok(i) na dzis`,
      onboardingTodayItems.slice(0, 2).join(' | '),
      'onboarding',
      58
    );
  }
  if (Boolean(onboardingPlan?.isActive) && Array.isArray(onboardingPlan?.rows)) {
    const hasOnboardingWarnings = onboardingPlan.rows.some(
      (row) =>
        String(row?.level ?? '').toLowerCase() === 'warning' &&
        (row.status === 'current' || row.status === 'overdue')
    );
    if (hasOnboardingWarnings) {
      addCandidate(
        'important',
        'important-onboarding-warning',
        'Onboarding wymaga uwagi',
        'W planie startowym sa ostrzezenia do wykonania dzis.',
        'onboarding',
        74
      );
    }
  }

  const tankAgeMs = toMillis(tank?.onboardingStartAt ?? tank?.createdAt);
  const tankAgeDays =
    tankAgeMs > 0 ? Math.max(1, Math.floor((Date.now() - tankAgeMs) / (24 * 60 * 60 * 1000))) : null;
  if (tankAgeDays !== null && tankAgeDays <= 30) {
    addCandidate(
      'routine',
      'routine-young-tank-observation',
      `Mlody zbiornik (${tankAgeDays} dni)`,
      'Obserwuj stabilność i unikaj gwałtownych zmian.',
      'age',
      44
    );
  }

  const latestMeasurementMs = measurements.length > 0 ? toMillis(measurements[0]?.measuredAt ?? measurements[0]?.createdAt) : 0;
  if (!latestMeasurementMs) {
    addCandidate(
      'important',
      'important-no-measurements',
      'Brak aktualnych pomiarów',
      'Dodaj podstawowy pomiar wody, aby odświeżyc analizę.',
      'water',
      78
    );
  } else {
    const daysSinceMeasurement = Math.floor((Date.now() - latestMeasurementMs) / (24 * 60 * 60 * 1000));
    if (daysSinceMeasurement >= 7) {
      addCandidate(
        'important',
        'important-measurement-stale',
        `Pomiary sa nieaktualne (${daysSinceMeasurement} dni)`,
        'Wykonaj kontrolny zestaw testow.',
        'water',
        67
      );
    }
  }

  if (Number(healthAssessment?.score) > 0 && Number(healthAssessment?.score) < 50) {
    addCandidate(
      'critical',
      'critical-health-score',
      `Niski wynik stanu: ${Math.round(Number(healthAssessment.score))}/100`,
      'Skup sie na trzech największych karach i wykonaj korekty dzis.',
      'health',
      88
    );
  }

  const pickTop = (categoryKey) =>
    (candidatesByCategory[categoryKey] ?? [])
      .sort((a, b) => b.score - a.score)[0] ?? null;

  const criticalAction = pickTop('critical');
  const importantAction = pickTop('important');
  const routineAction = pickTop('routine');

  const items = [criticalAction, importantAction, routineAction].filter(Boolean).slice(0, 3);

  if (items.length === 0) {
    return {
      criticalAction: null,
      importantAction: null,
      routineAction: {
        id: 'routine-observe',
        categoryKey: 'routine',
        categoryLabel: 'Rutynowe',
        title: 'Brak pilnych zmian',
        details: 'Kontynuuj obserwacje i karmienie zgodnie z planem.',
        source: 'general',
        score: 1,
      },
      items: [
        {
          id: 'routine-observe',
          categoryKey: 'routine',
          categoryLabel: 'Rutynowe',
          title: 'Brak pilnych zmian',
          details: 'Kontynuuj obserwacje i karmienie zgodnie z planem.',
          source: 'general',
          score: 1,
        },
      ],
      count: 1,
    };
  }

  return {
    criticalAction,
    importantAction,
    routineAction,
    items,
    count: items.length,
  };
}

const ONBOARDING_DELAY_MESSAGES = {
  no2Detected:
    'Ten krok został przesunięty, poniewaz NO2 jest nadal wykrywalne. Nie zwiększaj obsady i wykonaj kolejny pomiar za 24-48 godzin.',
  missingFreshNo2:
    'Brakuje aktualnego pomiaru NO2. Przed przejsciem do kolejnego kroku wykonaj test. Bez tego aplikacja nie może bezpiecznie ocenic gotowosci zbiornika.',
  unstableTemperature:
    'Temperatura nie jest jeszcze stabilna. Przed dodaniem obsady upewnij sie, ze akwarium utrzymuje docelowa temperature przez minimum 24-48 godzin.',
  phSwing:
    'pH zmienilo sie zauważalnie wzgledem poprzedniego pomiaru. Przed kolejnym krokiem warto potwierdzic stabilność parametrów.',
  highNo3:
    'NO3 jest podwyzszone. Rozwaz podmianę wody i ponowny pomiar. Samo NO3 nie zawsze blokuje kolejny krok, ale przy wysokich wartosciach zwiększa ryzyko problemów.',
};

const NO2_FRESH_HOURS_BY_START_TYPE = {
  new_from_scratch: 72,
  restart: 36,
  mature_media_start: 48,
};

const ONBOARDING_STEP_LIBRARY = {
  new_from_scratch: [
    {
      id: 'nfs-day0-start',
      title: 'Uruchomienie akwarium',
      description:
        'Akwarium zostało zalozone. Najważniejsze jest uruchomienie filtracji i stabilnych warunkow.',
      startType: 'new_from_scratch',
      earliestDay: 1,
      recommendedDay: 1,
      delayDays: 1,
      actions: [
        'Uruchom filtr 24/7.',
        'Ustaw temperature docelowa.',
        'Dodaj uzdatniacz i bakterie startowe (jesli uzywasz).',
        'Nie wpuszczaj jeszcze ryb.',
      ],
      tests: ['temperatura', 'pH', 'KH', 'GH', 'opcjonalnie NO2/NO3'],
      requiredMeasurements: ['temperature', 'ph', 'kh', 'gh'],
    },
    {
      id: 'nfs-day1-equipment-stability',
      title: 'Stabilizacja sprzetu',
      description:
        'Zbiornik stabilizuje temperature i prace sprzetu. Delikatne metnienie może byc normalne.',
      startType: 'new_from_scratch',
      earliestDay: 2,
      recommendedDay: 2,
      delayDays: 1,
      actions: [
        'Sprawdz, czy filtr dziala poprawnie.',
        'Kontroluj temperature.',
        'Nie czysc filtra i unikaj duzych zmian.',
      ],
      tests: ['temperatura'],
      requiredMeasurements: ['temperature'],
    },
    {
      id: 'nfs-day3-first-no2',
      title: 'Pierwsza kontrola NO2',
      description:
        'W akwarium może zaczynac pojawiac sie NO2. To normalny etap dojrzewania biologicznego.',
      startType: 'new_from_scratch',
      earliestDay: 3,
      recommendedDay: 3,
      delayDays: 2,
      actions: [
        'Wykonaj pierwszy test NO2.',
        'Nie wpuszczaj ryb, jesli NO2 jest wykrywalne.',
      ],
      tests: ['NO2', 'opcjonalnie NO3'],
      requiredMeasurements: ['no2'],
    },
    {
      id: 'nfs-day7-cycle-control',
      title: 'Kontrola dojrzewania',
      description:
        'Zbiornik jest w trakcie dojrzewania. Najwazniejsza jest regularna obserwacja NO2.',
      startType: 'new_from_scratch',
      earliestDay: 7,
      recommendedDay: 7,
      delayDays: 2,
      actions: [
        'Kontynuuj pomiary NO2.',
        'Nie dodawaj obsady.',
        'Nie płucz mediow filtracyjnych pod kranem.',
      ],
      tests: ['NO2', 'NO3', 'pH/KH'],
      requiredMeasurements: ['no2', 'no3'],
    },
    {
      id: 'nfs-day14-readiness',
      title: 'Ocena gotowosci',
      description:
        '14 dni to punkt kontrolny. O przejsciu dalej decyduja parametry, a nie sam uplyw czasu.',
      startType: 'new_from_scratch',
      earliestDay: 14,
      recommendedDay: 14,
      delayDays: 3,
      actions: [
        'Ocen, czy zbiornik może przejsc dalej.',
        'Jesli NO2 jest wykrywalne, przeloz kolejny krok o minimum 3 dni.',
      ],
      tests: ['NO2', 'NO3'],
      requiredMeasurements: ['no2', 'no3', 'temperature'],
      requiresNo2Zero: true,
      requiresFreshNo2ForStocking: true,
      blocksOnNo2: true,
      blocksOnTemperature: true,
    },
    {
      id: 'nfs-day21-first-stocking',
      title: 'Pierwsza mala obsada',
      description:
        'Jesli NO2 utrzymuje sie na 0 i temperatura jest stabilna, mozna rozwazyc mala czesc obsady.',
      startType: 'new_from_scratch',
      earliestDay: 21,
      recommendedDay: 21,
      delayDays: 3,
      actions: [
        'Dodaj maksymalnie 20-30% planowanej obsady.',
        'Karm oszczednie i obserwuj ryby.',
      ],
      tests: ['NO2 po dodaniu ryb', 'temperatura'],
      requiredMeasurements: ['no2', 'temperature'],
      requiresNo2Zero: true,
      requiresNo2ZeroDays: 3,
      requiresFreshNo2ForStocking: true,
      requiresNoCriticalAlerts: true,
      isStockingStep: true,
      blocksOnNo2: true,
      blocksOnTemperature: true,
    },
    {
      id: 'nfs-day28-post-stocking',
      title: 'Kontrola po pierwszej obsadzie',
      description:
        'Po dodaniu ryb filtr biologiczny dopasowuje sie do większego obciążenia.',
      startType: 'new_from_scratch',
      earliestDay: 28,
      recommendedDay: 28,
      delayDays: 3,
      actions: [
        'Nie zwiększaj obsady, jesli NO2 wzroslo.',
        'Kontynuuj ostrozne karmienie.',
      ],
      tests: ['NO2', 'NO3'],
      requiredMeasurements: ['no2', 'no3'],
      requiresNo2Zero: true,
      requiresFreshNo2ForStocking: true,
      isStockingStep: true,
      blocksOnNo2: true,
    },
    {
      id: 'nfs-day35-gradual-stocking',
      title: 'Stopniowe zwiększenie obsady',
      description:
        'Jesli parametry pozostały stabilne, mozna ostroznie dodac kolejna czesc obsady.',
      startType: 'new_from_scratch',
      earliestDay: 35,
      recommendedDay: 35,
      delayDays: 3,
      actions: [
        'Dodaj kolejna mala czesc obsady.',
        'Unikaj duzego zwiększenia obsady naraz.',
      ],
      tests: ['NO2', 'NO3'],
      requiredMeasurements: ['no2', 'no3'],
      requiresNo2Zero: true,
      requiresFreshNo2ForStocking: true,
      isStockingStep: true,
      blocksOnNo2: true,
    },
    {
      id: 'nfs-day42-finish',
      title: 'Zakonczenie startu',
      description:
        'Akwarium wyglada na ustabilizowane i może przejsc do standardowej rutyny.',
      startType: 'new_from_scratch',
      earliestDay: 42,
      recommendedDay: 42,
      delayDays: 3,
      actions: [
        'Zakoncz onboarding.',
        'Przejd? do standardowego harmonogramu podmian i testow.',
      ],
      tests: ['NO2', 'NO3', 'temperatura'],
      requiredMeasurements: ['no2', 'no3', 'temperature'],
      requiresNo2Zero: true,
      requiresFreshNo2ForStocking: true,
      requiresNoCriticalAlerts: true,
      isStockingStep: true,
      blocksOnNo2: true,
      blocksOnTemperature: true,
    },
  ],
  restart: [
    {
      id: 'restart-day0',
      title: 'Restart akwarium',
      description:
        'Po restarcie zbiornik może reagowac niestabilnie, nawet gdy czesc biologii została zachowana.',
      startType: 'restart',
      earliestDay: 1,
      recommendedDay: 1,
      delayDays: 1,
      actions: [
        'Uruchom filtr jak najszybciej.',
        'Nie płucz mediow biologicznych pod kranem.',
        'Ustaw temperature i ogranicz karmienie przez 1-3 dni.',
      ],
      tests: ['NO2', 'NO3', 'temperatura', 'pH/KH'],
      requiredMeasurements: ['no2', 'temperature'],
    },
    {
      id: 'restart-day1',
      title: 'Kontrola po restarcie',
      description:
        'Po restarcie NO2 może wzrosnac z opoznieniem. Zachowaj ostroznosc przy obecnej obsadzie.',
      startType: 'restart',
      earliestDay: 2,
      recommendedDay: 2,
      delayDays: 1,
      actions: [
        'Karm oszczednie.',
        'Nie dodawaj nowych ryb.',
        'Obserwuj zachowanie ryb.',
      ],
      tests: ['NO2', 'temperatura'],
      requiredMeasurements: ['no2', 'temperature'],
    },
    {
      id: 'restart-day3',
      title: 'Okres największego ryzyka',
      description:
        'To moment, gdy po restarcie najczęściej ujawniaja sie problemy z biologia.',
      startType: 'restart',
      earliestDay: 3,
      recommendedDay: 3,
      delayDays: 2,
      actions: [
        'Sprawdz NO2 i NO3.',
        'Wstrzymaj dodawanie obsady przy wykrywalnym NO2.',
      ],
      tests: ['NO2', 'NO3'],
      requiredMeasurements: ['no2'],
      blocksOnNo2: true,
    },
    {
      id: 'restart-day7',
      title: 'Ocena stabilności po restarcie',
      description:
        'Jesli NO2 utrzymuje sie na 0 i temperatura jest stabilna, restart przebiega poprawnie.',
      startType: 'restart',
      earliestDay: 7,
      recommendedDay: 7,
      delayDays: 3,
      actions: [
        'Stopniowo wracaj do normalnego karmienia.',
        'Nie dodawaj wielu ryb naraz.',
      ],
      tests: ['NO2', 'NO3', 'pH/KH'],
      requiredMeasurements: ['no2', 'temperature', 'no3'],
      requiresNo2Zero: true,
      requiresFreshNo2ForStocking: true,
      blocksOnNo2: true,
      blocksOnTemperature: true,
    },
    {
      id: 'restart-day14',
      title: 'Powrót do normalnej rutyny',
      description:
        'Przy stabilnych parametrach mozna wracac do standardowej opieki.',
      startType: 'restart',
      earliestDay: 14,
      recommendedDay: 14,
      delayDays: 3,
      actions: [
        'Wróć do standardowego harmonogramu podmian.',
        'Kontynuuj regularne testy.',
      ],
      tests: ['NO2', 'NO3'],
      requiredMeasurements: ['no2', 'no3'],
      requiresNo2Zero: true,
      requiresNo2ZeroDays: 5,
      requiresFreshNo2ForStocking: true,
      requiresNoCriticalAlerts: true,
      isStockingStep: true,
      blocksOnNo2: true,
    },
    {
      id: 'restart-day21',
      title: 'Zakonczenie kontroli po restarcie',
      description:
        'Akwarium wyglada na stabilne po restarcie i onboarding może zostac zakonczony.',
      startType: 'restart',
      earliestDay: 21,
      recommendedDay: 21,
      delayDays: 3,
      actions: ['Zakoncz onboarding i przejd? na normalny tryb opieki.'],
      tests: ['NO2', 'NO3', 'temperatura'],
      requiredMeasurements: ['no2', 'no3', 'temperature'],
      requiresNo2Zero: true,
      requiresFreshNo2ForStocking: true,
      requiresNoCriticalAlerts: true,
      isStockingStep: true,
      blocksOnNo2: true,
      blocksOnTemperature: true,
    },
  ],
  mature_media_start: [
    {
      id: 'mature-day0',
      title: 'Start z dojrzalym medium',
      description:
        'Dojrzale medium może przyspieszyc start, ale nie gwarantuje od razu pełnej stabilności.',
      startType: 'mature_media_start',
      earliestDay: 1,
      recommendedDay: 1,
      delayDays: 1,
      actions: [
        'Uruchom filtr jak najszybciej i nie dopusc do wyschniecia mediow.',
        'Ustaw temperature.',
        'Nie dodawaj od razu pełnej obsady.',
      ],
      tests: ['NO2', 'NO3', 'temperatura', 'pH/KH'],
      requiredMeasurements: ['no2', 'temperature'],
    },
    {
      id: 'mature-day1',
      title: 'Pierwsza kontrola stabilności',
      description:
        'Aplikacja musi potwierdzic, czy zbiornik utrzymuje bezpieczne parametry.',
      startType: 'mature_media_start',
      earliestDay: 2,
      recommendedDay: 2,
      delayDays: 1,
      actions: ['Wykonaj test NO2.', 'Przy obecnosci ryb karm oszczednie.'],
      tests: ['NO2', 'temperatura'],
      requiredMeasurements: ['no2', 'temperature'],
    },
    {
      id: 'mature-day3',
      title: 'Szybka ocena biologii',
      description:
        'Jesli NO2 pozostaje 0, medium dziala poprawnie. Przy wykrywalnym NO2 potrzeba więcej czasu.',
      startType: 'mature_media_start',
      earliestDay: 3,
      recommendedDay: 3,
      delayDays: 2,
      actions: [
        'Kontynuuj obserwacje.',
        'Nie zwiększaj obsady przy wykrywalnym NO2.',
      ],
      tests: ['NO2', 'NO3'],
      requiredMeasurements: ['no2'],
      requiresNo2Zero: true,
      requiresFreshNo2ForStocking: true,
      blocksOnNo2: true,
    },
    {
      id: 'mature-day7',
      title: 'Ostrozne zwiększenie obciążenia',
      description:
        'Przy stabilnych parametrach mozna delikatnie zwiększyc obsade lub karmienie.',
      startType: 'mature_media_start',
      earliestDay: 7,
      recommendedDay: 7,
      delayDays: 3,
      actions: [
        'Dodaj maksymalnie 20-30% planowanej obsady.',
        'Nie dodawaj pełnej obsady naraz.',
        'Sprawdz NO2 po zwiększeniu obciążenia.',
      ],
      tests: ['NO2', 'NO3'],
      requiredMeasurements: ['no2', 'temperature'],
      requiresNo2Zero: true,
      requiresNo2ZeroDays: 3,
      requiresFreshNo2ForStocking: true,
      requiresNoCriticalAlerts: true,
      isStockingStep: true,
      blocksOnNo2: true,
      blocksOnTemperature: true,
    },
    {
      id: 'mature-day14',
      title: 'Potwierdzenie stabilizacji',
      description:
        'Zbiornik prawdopodobnie przyjal biologie. Nadal zwiększaj obsade stopniowo.',
      startType: 'mature_media_start',
      earliestDay: 14,
      recommendedDay: 14,
      delayDays: 3,
      actions: [
        'Kontynuuj normalizacje rutyny.',
        'Nie wykonuj gwałtownych zmian w filtrze.',
      ],
      tests: ['NO2', 'NO3', 'pH/KH'],
      requiredMeasurements: ['no2', 'no3'],
      requiresNo2Zero: true,
      requiresFreshNo2ForStocking: true,
      isStockingStep: true,
      blocksOnNo2: true,
    },
    {
      id: 'mature-day21',
      title: 'Zakonczenie startu',
      description:
        'Akwarium wyglada na ustabilizowane i onboarding może zostac zakonczony.',
      startType: 'mature_media_start',
      earliestDay: 21,
      recommendedDay: 21,
      delayDays: 3,
      actions: ['Zakoncz onboarding i przejd? na standardowy harmonogram.'],
      tests: ['NO2', 'NO3', 'temperatura'],
      requiredMeasurements: ['no2', 'no3', 'temperature'],
      requiresNo2Zero: true,
      requiresFreshNo2ForStocking: true,
      requiresNoCriticalAlerts: true,
      isStockingStep: true,
      blocksOnNo2: true,
      blocksOnTemperature: true,
    },
  ],
};

const ONBOARDING_GUIDE_BY_START_TYPE = {
  new_from_scratch: {
    modeLabel: 'Nowy zbiornik od zera',
    checklistStart: [
      'Uruchom filtr i grzalke od razu po zalaniu.',
      'Nie wpuszczaj ryb przed stabilnym NO2=0.',
      'Zapisuj regularnie pomiary i porownuj trendy.',
      'Wprowadźaj obsade malymi krokami, nigdy skokowo.',
    ],
    firstMeasurements: [
      'Dzień 1: temperatura, pH, KH, GH.',
      'Dzień 3: NO2 (opcjonalnie NO3).',
      'Dzień 7: NO2, NO3, pH/KH.',
    ],
  },
  restart: {
    modeLabel: 'Restart akwarium',
    checklistStart: [
      'Utrzymaj media biologiczne stale mokre.',
      'W pierwszych dniach karm oszczednie.',
      'Nie dodawaj nowych ryb do czasu stabilnego NO2.',
      'Kontroluj NO2 częściej niż w stabilnym zbiorniku.',
    ],
    firstMeasurements: [
      'Dzień 1: NO2, NO3, temperatura, pH/KH.',
      'Dzień 3: NO2 i NO3.',
      'Dzień 7: NO2, NO3, pH/KH.',
    ],
  },
  mature_media_start: {
    modeLabel: 'Start na dojrzalym medium',
    checklistStart: [
      'Nie dopusc do wyschniecia dojrzalych mediow.',
      'Nie wpuszczaj od razu pełnej obsady.',
      'Kontroluj NO2 codzieńnie na poczatku.',
      'Potwierdz stabilność po kazdym zwiększeniu obciążenia.',
    ],
    firstMeasurements: [
      'Dzień 1: NO2, NO3, temperatura, pH/KH.',
      'Dzień 3: NO2 + NO3.',
      'Dzień 7: NO2, NO3, temperatura.',
    ],
  },
};

function resolveOnboardingStartType(modeValue) {
  const normalized = String(modeValue ?? '').trim().toLowerCase();
  if (normalized === 'fresh_start' || normalized === 'new_from_scratch') {
    return 'new_from_scratch';
  }
  if (normalized === 'restart') {
    return 'restart';
  }
  return 'mature_media_start';
}

function getMeasurementRecordedAtMs(measurement) {
  return toMillisTaskService(measurement?.measuredAt ?? measurement?.createdAt);
}

export function getAquariumAgeInDays(startDate, nowValue = new Date()) {
  const dayMs = 24 * 60 * 60 * 1000;
  const startMs = toMillisTaskService(startDate);
  if (!startMs) {
    return 0;
  }
  const startBucket = getDayBucketTaskService(startMs);
  const nowBucket = getDayBucketTaskService(nowValue);
  return Math.max(1, Math.floor((nowBucket - startBucket) / dayMs) + 1);
}

export function getLatestMeasurement(measurements, parameter) {
  if (!Array.isArray(measurements) || measurements.length === 0 || !parameter) {
    return null;
  }
  const key = String(parameter);
  let latest = null;
  let latestMs = 0;
  measurements.forEach((measurement) => {
    const value = toNumericTaskService(measurement?.[key]);
    if (value === null) {
      return;
    }
    const recordedAtMs = getMeasurementRecordedAtMs(measurement);
    if (recordedAtMs > latestMs) {
      latestMs = recordedAtMs;
      latest = measurement;
    }
  });
  return latest;
}

export function isMeasurementFresh(measurement, maxAgeHours, nowMs = Date.now()) {
  if (!measurement) {
    return false;
  }
  const ageLimitHours = Number(maxAgeHours);
  if (!Number.isFinite(ageLimitHours) || ageLimitHours <= 0) {
    return false;
  }
  const measurementMs = getMeasurementRecordedAtMs(measurement);
  if (!measurementMs || measurementMs > nowMs) {
    return false;
  }
  return nowMs - measurementMs <= ageLimitHours * 60 * 60 * 1000;
}

function getLastTwoNumericValues(measurements, key) {
  const points = (Array.isArray(measurements) ? measurements : [])
    .map((item) => ({
      value: toNumericTaskService(item?.[key]),
      recordedAtMs: getMeasurementRecordedAtMs(item),
    }))
    .filter((item) => item.value !== null && item.recordedAtMs > 0)
    .sort((a, b) => b.recordedAtMs - a.recordedAtMs)
    .slice(0, 2);
  return points;
}

function isTemperatureWithinTarget(tank, temperatureValue) {
  const value = toNumericTaskService(temperatureValue);
  if (value === null) {
    return true;
  }
  const targetMin = toNumericTaskService(tank?.targetRanges?.temperature?.min);
  const targetMax = toNumericTaskService(tank?.targetRanges?.temperature?.max);
  if (targetMin !== null && value < targetMin) {
    return false;
  }
  if (targetMax !== null && value > targetMax) {
    return false;
  }
  const targetSingle = toNumericTaskService(tank?.targetTemperatureC);
  if (targetSingle !== null) {
    if (value < targetSingle - 1 || value > targetSingle + 1) {
      return false;
    }
  }
  return true;
}

function evaluateNo2ZeroWindow(measurements, requiredDays, nowMs, freshnessHours) {
  const dayMs = 24 * 60 * 60 * 1000;
  const points = (Array.isArray(measurements) ? measurements : [])
    .map((item) => ({
      value: toNumericTaskService(item?.no2),
      recordedAtMs: getMeasurementRecordedAtMs(item),
    }))
    .filter((item) => item.value !== null && item.recordedAtMs > 0)
    .sort((a, b) => b.recordedAtMs - a.recordedAtMs);
  if (points.length === 0) {
    return { ok: false, missing: true, detected: false };
  }
  const latest = points[0];
  if (!isMeasurementFresh({ measuredAt: latest.recordedAtMs }, freshnessHours, nowMs)) {
    return { ok: false, missing: true, detected: false };
  }
  if (latest.value > 0) {
    return { ok: false, missing: false, detected: true };
  }
  if (!requiredDays || requiredDays <= 0) {
    return { ok: true, missing: false, detected: false };
  }
  const windowStartMs = nowMs - requiredDays * dayMs;
  const windowPoints = points.filter((item) => item.recordedAtMs >= windowStartMs);
  if (windowPoints.length < 2) {
    return { ok: false, missing: true, detected: false };
  }
  const hasDetectedNo2 = windowPoints.some((item) => item.value > 0);
  if (hasDetectedNo2) {
    return { ok: false, missing: false, detected: true };
  }
  return { ok: true, missing: false, detected: false };
}

export function evaluateOnboardingStep(step, aquarium, measurements, context = {}) {
  const nowMs = Number(context.nowMs) > 0 ? Number(context.nowMs) : Date.now();
  const startType = context.startType ?? resolveOnboardingStartType(aquarium?.onboardingMode);
  const ageDays =
    Number(context.ageDays) > 0
      ? Number(context.ageDays)
      : getAquariumAgeInDays(aquarium?.onboardingStartAt ?? aquarium?.createdAt, nowMs);
  const no2FreshHours =
    NO2_FRESH_HOURS_BY_START_TYPE[startType] ??
    NO2_FRESH_HOURS_BY_START_TYPE.new_from_scratch;

  const latestNo2Measurement = getLatestMeasurement(measurements, 'no2');
  const latestNo2 = toNumericTaskService(latestNo2Measurement?.no2);
  const latestNo3Measurement = getLatestMeasurement(measurements, 'no3');
  const latestNo3 = toNumericTaskService(latestNo3Measurement?.no3);
  const latestTemperatureMeasurement = getLatestMeasurement(measurements, 'temperature');
  const latestTemperature = toNumericTaskService(latestTemperatureMeasurement?.temperature);

  const hasFreshNo2 =
    latestNo2Measurement !== null &&
    isMeasurementFresh(latestNo2Measurement, no2FreshHours, nowMs);
  const hasNo2Detected = latestNo2 !== null && latestNo2 > 0;
  const hasTemperatureOutOfRange = !isTemperatureWithinTarget(
    aquarium,
    latestTemperature
  );
  const phPoints = getLastTwoNumericValues(measurements, 'ph');
  const hasPhSwing =
    phPoints.length >= 2 && Math.abs(phPoints[0].value - phPoints[1].value) >= 0.4;
  const hasHighNo3 = latestNo3 !== null && latestNo3 >= 40;

  const warnings = [];
  if (hasTemperatureOutOfRange) {
    warnings.push(ONBOARDING_DELAY_MESSAGES.unstableTemperature);
  }
  if (hasPhSwing) {
    warnings.push(ONBOARDING_DELAY_MESSAGES.phSwing);
  }
  if (hasHighNo3) {
    warnings.push(ONBOARDING_DELAY_MESSAGES.highNo3);
  }

  const missingRequiredTests = [];
  (step.requiredMeasurements ?? []).forEach((parameter) => {
    const latestForParameter = getLatestMeasurement(measurements, parameter);
    const freshnessHours =
      parameter === 'no2'
        ? no2FreshHours
        : parameter === 'temperature'
          ? 48
          : 96;
    if (!latestForParameter || !isMeasurementFresh(latestForParameter, freshnessHours, nowMs)) {
      missingRequiredTests.push(String(parameter).toUpperCase());
    }
  });

  const reasons = [];
  let status = 'active';

  if (ageDays < step.earliestDay) {
    status = 'planned';
  } else {
    if (step.requiresFreshNo2ForStocking && !hasFreshNo2) {
      status = 'waiting_for_parameters';
      reasons.push(ONBOARDING_DELAY_MESSAGES.missingFreshNo2);
    }
    if (step.blocksOnNo2 && hasNo2Detected) {
      status = step.isStockingStep ? 'blocked' : 'delayed';
      reasons.push(ONBOARDING_DELAY_MESSAGES.no2Detected);
    }
    if (step.blocksOnTemperature && hasTemperatureOutOfRange) {
      if (status !== 'waiting_for_parameters') {
        status = 'delayed';
      }
      reasons.push(ONBOARDING_DELAY_MESSAGES.unstableTemperature);
    }
    if (step.requiresNo2Zero && (latestNo2 === null || latestNo2 > 0)) {
      if (latestNo2 === null) {
        status = 'waiting_for_parameters';
        reasons.push(ONBOARDING_DELAY_MESSAGES.missingFreshNo2);
      } else {
        if (status !== 'waiting_for_parameters') {
          status = step.isStockingStep ? 'blocked' : 'delayed';
        }
        reasons.push(ONBOARDING_DELAY_MESSAGES.no2Detected);
      }
    }
    if (Number(step.requiresNo2ZeroDays) > 0) {
      const windowCheck = evaluateNo2ZeroWindow(
        measurements,
        Number(step.requiresNo2ZeroDays),
        nowMs,
        no2FreshHours
      );
      if (!windowCheck.ok) {
        if (windowCheck.missing) {
          status = 'waiting_for_parameters';
          reasons.push(ONBOARDING_DELAY_MESSAGES.missingFreshNo2);
        } else if (windowCheck.detected) {
          if (status !== 'waiting_for_parameters') {
            status = step.isStockingStep ? 'blocked' : 'delayed';
          }
          reasons.push(ONBOARDING_DELAY_MESSAGES.no2Detected);
        }
      }
    }
    const analysisStatus = String(context.latestAnalysisStatus ?? '').toLowerCase();
    if (step.requiresNoCriticalAlerts && analysisStatus === 'critical') {
      if (status === 'active') {
        status = 'delayed';
      }
      reasons.push('Wykryto krytyczne alerty parametrów. Najpierw ustabilizuj warunki.');
    }
    if (status === 'active' && missingRequiredTests.length > 0) {
      status = 'waiting_for_parameters';
      reasons.push(
        `Brakuje aktualnych pomiarów: ${missingRequiredTests.join(', ')}.`
      );
    }
  }

  const delayDays = Number(step.delayDays) > 0 ? Number(step.delayDays) : 2;
  const recommendedNextDay =
    status === 'planned'
      ? step.recommendedDay
      : status === 'active'
        ? Math.max(ageDays, step.recommendedDay)
        : Math.max(ageDays + delayDays, step.recommendedDay + delayDays);
  const shouldPauseStocking =
    Boolean(step.isStockingStep) &&
    (status === 'waiting_for_parameters' ||
      status === 'blocked' ||
      status === 'delayed') &&
    (reasons.includes(ONBOARDING_DELAY_MESSAGES.no2Detected) ||
      reasons.includes(ONBOARDING_DELAY_MESSAGES.missingFreshNo2));
  const actionsForToday = shouldPauseStocking
    ? [
        'Nie dodawaj teraz ryb ani nowej obsady.',
        'Wykonaj kolejny pomiar NO2 za 24-48 godzin.',
        'Utrzymuj oszczedne karmienie do stabilizacji NO2.',
      ]
    : [...(step.actions ?? [])];

  return {
    ...step,
    status,
    reason: reasons[0] ?? '',
    reasons: [...new Set(reasons)],
    warnings: [...new Set(warnings)],
    missingRequiredTests: [...new Set(missingRequiredTests)],
    recommendedNextDay,
    nextReviewAtMs: nowMs + delayDays * 24 * 60 * 60 * 1000,
    actionsForToday,
  };
}

function mapStepStatusToRowStatus(stepStatus, dayNumber, recommendedDay) {
  if (stepStatus === 'planned') {
    return 'upcoming';
  }
  if (dayNumber > recommendedDay && stepStatus !== 'completed') {
    return 'overdue';
  }
  return 'current';
}

function mapStepStatusToRowLevel(stepStatus, warningsCount) {
  if (
    stepStatus === 'waiting_for_parameters' ||
    stepStatus === 'blocked' ||
    stepStatus === 'delayed'
  ) {
    return 'warning';
  }
  if (warningsCount > 0) {
    return 'info';
  }
  return 'task';
}

export function buildTankOnboardingPlanService(
  tank,
  measurements,
  enabledTests = {},
  deps = {}
) {
  const {
    normalizeOnboardingMode,
    getCreatedAtMs,
    getDayBucketMs,
    analyzeMeasurementLogic,
    getWaterAnalysisOptionsForTank,
    getRecentNumericSeries,
    getRecommendationDueAtMsLogic,
  } = deps;

  const safeGetDayBucketMs = typeof getDayBucketMs === 'function'
    ? getDayBucketMs
    : getDayBucketTaskService;
  const safeGetCreatedAtMs = typeof getCreatedAtMs === 'function'
    ? getCreatedAtMs
    : toMillisTaskService;

  if (!tank) {
    return {
      isActive: false,
      mode: 'fresh_start',
      modeLabel: 'Nowy zbiornik od zera',
      startType: 'new_from_scratch',
      rows: [],
      dueItems: [],
      todayItems: [],
      checklistStart: [],
      firstMeasurements: [],
      statusText: '',
      dayNumber: 0,
      targetEndDay: 42,
      isStabilized: false,
      activeStep: null,
      nextStep: null,
      delayReason: '',
      requiredTestsNow: [],
      actionsToday: [],
    };
  }

  const normalizedMode = normalizeOnboardingMode(tank?.onboardingMode);
  const startType = resolveOnboardingStartType(normalizedMode);
  const guide = ONBOARDING_GUIDE_BY_START_TYPE[startType];

  if (tank?.onboardingEnabled === false) {
    return {
      isActive: false,
      mode: normalizedMode,
      modeLabel: 'Wyłączony recznie',
      startType,
      rows: [],
      dueItems: [],
      todayItems: [],
      checklistStart: [],
      firstMeasurements: [],
      statusText: 'Onboarding jest recznie wyłączony dla tego akwarium.',
      dayNumber: 0,
      targetEndDay: ONBOARDING_STEP_LIBRARY[startType].slice(-1)[0]?.recommendedDay ?? 21,
      isStabilized: false,
      activeStep: null,
      nextStep: null,
      delayReason: '',
      requiredTestsNow: [],
      actionsToday: [],
    };
  }

  const startMs = safeGetCreatedAtMs(tank?.onboardingStartAt ?? tank?.createdAt);
  if (!startMs) {
    return {
      isActive: true,
      mode: normalizedMode,
      modeLabel: guide?.modeLabel ?? 'Onboarding',
      startType,
      rows: [],
      dueItems: [],
      todayItems: [],
      checklistStart: guide?.checklistStart ?? [],
      firstMeasurements: guide?.firstMeasurements ?? [],
      statusText:
        'Brak daty startu onboardingu. Ustaw tryb, cele parametrów i dodaj pierwszy pomiar.',
      dayNumber: 1,
      targetEndDay: ONBOARDING_STEP_LIBRARY[startType].slice(-1)[0]?.recommendedDay ?? 21,
      isStabilized: false,
      activeStep: null,
      nextStep: null,
      delayReason: '',
      requiredTestsNow: [],
      actionsToday: [],
    };
  }

  const dayNumber = getAquariumAgeInDays(startMs, Date.now());
  const latestMeasurement = Array.isArray(measurements) ? measurements[0] ?? null : null;
  const latestAnalysis =
    latestMeasurement && typeof analyzeMeasurementLogic === 'function'
      ? analyzeMeasurementLogic(
          latestMeasurement,
          enabledTests,
          getWaterAnalysisOptionsForTank?.(tank)
        )
      : null;

  const no2Series = typeof getRecentNumericSeries === 'function'
    ? getRecentNumericSeries(measurements, 'no2', 3)
    : [];
  const cycleState = evaluateCycleDrift({
    latestAnalysisStatus: latestAnalysis?.status,
    no2Value: toNumericTaskService(latestMeasurement?.no2),
    nh3Value: toNumericTaskService(latestMeasurement?.nh3nh4),
    no2Series,
    no3Value: toNumericTaskService(latestMeasurement?.no3),
    dayNumber,
  });

  const baseSteps = ONBOARDING_STEP_LIBRARY[startType] ?? ONBOARDING_STEP_LIBRARY.new_from_scratch;
  const evaluatedSteps = [];
  let accumulatedDelay = 0;
  let delayAlreadyAppliedForToday = false;

  baseSteps.forEach((baseStep) => {
    const shiftedStep = {
      ...baseStep,
      earliestDay: baseStep.earliestDay + accumulatedDelay,
      recommendedDay: baseStep.recommendedDay + accumulatedDelay,
    };
    const evaluated = evaluateOnboardingStep(shiftedStep, tank, measurements, {
      startType,
      ageDays: dayNumber,
      nowMs: Date.now(),
      latestAnalysisStatus: latestAnalysis?.status,
    });
    const shouldDelayFutureSteps =
      !delayAlreadyAppliedForToday &&
      ['waiting_for_parameters', 'delayed', 'blocked'].includes(evaluated.status) &&
      dayNumber >= shiftedStep.recommendedDay;
    if (shouldDelayFutureSteps) {
      const delayDays = Number(baseStep.delayDays) > 0 ? Number(baseStep.delayDays) : 2;
      accumulatedDelay += delayDays;
      delayAlreadyAppliedForToday = true;
    }
    evaluatedSteps.push(evaluated);
  });

  const actionableStatuses = new Set([
    'active',
    'waiting_for_parameters',
    'delayed',
    'blocked',
  ]);
  const activeStep =
    evaluatedSteps.find(
      (step) => actionableStatuses.has(step.status) && dayNumber >= step.earliestDay
    ) ??
    evaluatedSteps.find((step) => step.status === 'planned') ??
    null;
  const activeStepIndex = activeStep
    ? evaluatedSteps.findIndex((item) => item.id === activeStep.id)
    : -1;
  const nextStep =
    activeStepIndex >= 0
      ? evaluatedSteps
          .slice(activeStepIndex + 1)
          .find((step) => step.status === 'planned') ?? null
      : evaluatedSteps.find((step) => step.status === 'planned') ?? null;

  const dayMs = 24 * 60 * 60 * 1000;
  const startDayBucketMs = safeGetDayBucketMs(startMs);
  const rows = evaluatedSteps.map((step) => {
    const dueAtMs =
      startDayBucketMs + (Math.max(1, Number(step.recommendedDay)) - 1) * dayMs;
    const rowStatus = mapStepStatusToRowStatus(
      step.status,
      dayNumber,
      step.recommendedDay
    );
    const rowLevel = mapStepStatusToRowLevel(step.status, step.warnings.length);
    const detailParts = [
      step.title,
      step.description,
      step.reason ? `Powod opoznienia: ${step.reason}` : null,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      id: `onboarding-step-${step.id}`,
      sourceStepId: step.id,
      dayStart: step.recommendedDay,
      dayEnd: step.recommendedDay,
      level: rowLevel,
      text: detailParts,
      status: rowStatus,
      dueAtMs,
      stepStatus: step.status,
      requiredTests: step.tests,
      actions: step.actions,
      actionsForToday: step.actionsForToday,
      reason: step.reason,
    };
  });

  const dueItems = rows
    .filter((row) => row.status === 'current' || row.status === 'overdue')
    .map((row) => ({
      id: row.id,
      source: 'Onboarding',
      text: row.text,
      dueAtMs: row.dueAtMs,
      dayBucketMs: safeGetDayBucketMs(row.dueAtMs),
    }));

  const recommendationRows = (latestAnalysis?.recommendations ?? [])
    .slice(0, 2)
    .map((item, index) => {
      const dueAtMs = typeof getRecommendationDueAtMsLogic === 'function'
        ? getRecommendationDueAtMsLogic(item)
        : Date.now();
      const text = `Korekta parametru: ${item.parameter} - ${item.action}`;
      return {
        id: `onboarding-dynamic-${index}`,
        dayStart: dayNumber,
        dayEnd: dayNumber,
        level: item.severity === 'critical' ? 'warning' : 'info',
        text,
        status: 'current',
        dueAtMs,
      };
    });

  const todayItems = [
    ...(activeStep?.actionsForToday ?? activeStep?.actions ?? []),
    ...(activeStep?.tests?.map((test) => `Wymagany test: ${test}`) ?? []),
    ...(activeStep?.reason ? [activeStep.reason] : []),
    ...(activeStep?.warnings ?? []),
  ];

  const onboardingRows = [...rows, ...recommendationRows];
  const finalStep = evaluatedSteps[evaluatedSteps.length - 1] ?? null;
  const targetEndDay = finalStep?.recommendedDay ?? 21;
  const isStabilized = Boolean(
    finalStep &&
      dayNumber >= finalStep.recommendedDay &&
      finalStep.status === 'active' &&
      !cycleState.hasCriticalDrift
  );
  const isActive =
    dayNumber <= targetEndDay + 21 ||
    !isStabilized ||
    recommendationRows.length > 0;

  const delayReason = activeStep?.reason ?? '';
  const statusText = activeStep
    ? `Dzień ${dayNumber}. Aktywny krok: ${activeStep.title}. Status: ${activeStep.status}.`
    : `Dzień ${dayNumber}. Oczekiwanie na pierwszy krok onboardingu.`;

  return {
    isActive,
    mode: normalizedMode,
    modeLabel: guide?.modeLabel ?? 'Onboarding',
    startType,
    rows: onboardingRows,
    dueItems,
    todayItems: [...new Set(todayItems)],
    checklistStart: [...(guide?.checklistStart ?? [])],
    firstMeasurements: [...(guide?.firstMeasurements ?? [])],
    statusText,
    dayNumber,
    targetEndDay,
    isStabilized,
    activeStep,
    nextStep,
    delayReason,
    requiredTestsNow: [...new Set(activeStep?.tests ?? [])],
    actionsToday: [...new Set(activeStep?.actionsForToday ?? activeStep?.actions ?? [])],
  };
}
