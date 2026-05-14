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
      ? 'Parametry toksyn sa niebezpieczne - wykonaj podmiane natychmiast.'
      : no2nh3Risk || no3Trend.direction === 'up'
        ? 'Podmiany czestsze do stabilizacji trendow NO2/NO3.'
        : 'Rutynowa podmiana dla utrzymania stabilnosci biologicznej.',
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
      'Sprawdz przeplyw, droznosc i stan mediow. Nie plucz wszystkich mediow biologicznych naraz.',
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
      'Przeplyw i natlenienie zaleza od droznosci prefiltra. Plucz czesciej przy duzej obsadzie.',
    baseIntervalDays: fishCount >= 20 ? 4 : fishCount >= 10 ? 7 : 10,
    intervalModifierDays: riskLevel === 'critical' ? -2 : 0,
    riskBoost: 4,
    source: 'equipment',
  });

  addTask({
    key: 'fertilization',
    title: 'Nawozenie roslin',
    details:
      'Dostosuj dawki nawozenia do kondycji roslin, swiatla i trendow parametrów. Zmieniaj stopniowo.',
    baseIntervalDays: plantCount > 0 ? 2 : 14,
    intervalModifierDays: plantCount > 0 && no3Trend.direction === 'up' ? -1 : 0,
    riskBoost: plantCount > 0 ? 3 : -8,
    source: 'plants',
  });

  addTask({
    key: 'pruning',
    title: 'Przycinka roslin',
    details:
      'Usuwaj nadmierny przyrost i slabe liscie, zeby poprawic cyrkulacje i ograniczyc ryzyko glonow.',
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
      ? 'Temperatura poza zakresem docelowym - kontroluj codziennie do stabilizacji.'
      : 'Sprawdzaj stabilnosc temperatury i dzialanie grzalki.',
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
      'Sprawdz stan wirnika, przewodow, uszczelek i oswietlenia. Zapobiegaj awariom przez regularny serwis.',
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
      'NO2 lub NH3/NH4 jest na poziomie niebezpiecznym. Zrob szybka podmiane wody i ogranicz karmienie.',
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
      topCriticalRecommendation?.action || 'Krytyczne odchylenie parametrow',
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
      `Wykonaj ${todayRecommendations.length} korekty parametrow`,
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
          'Sprawdz dzialanie i wydajnosc filtra.'
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
          'Sprawdz stabilnosc temperatury.'
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
      'Wysokie ryzyko konfliktow lub niezgodnosci warunkow.',
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
      'Obserwuj stabilnosc i unikaj gwaltownych zmian.',
      'age',
      44
    );
  }

  const latestMeasurementMs = measurements.length > 0 ? toMillis(measurements[0]?.measuredAt ?? measurements[0]?.createdAt) : 0;
  if (!latestMeasurementMs) {
    addCandidate(
      'important',
      'important-no-measurements',
      'Brak aktualnych pomiarow',
      'Dodaj podstawowy pomiar wody, aby odswiezyc analize.',
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
      'Skup sie na trzech najwiekszych karach i wykonaj korekty dzis.',
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

  if (!tank) {
    return {
      isActive: false,
      mode: 'existing_running',
      modeLabel: 'Istniejace akwarium',
      rows: [],
      dueItems: [],
      todayItems: [],
      checklistStart: [],
      firstMeasurements: [],
      statusText: '',
      dayNumber: 0,
      targetEndDay: 14,
      isStabilized: false,
    };
  }

  const mode = normalizeOnboardingMode(tank.onboardingMode);
  const dayMs = 24 * 60 * 60 * 1000;
  const targetEndDay = 14;
  const startMs = getCreatedAtMs(tank.onboardingStartAt ?? tank.createdAt);
  if (!startMs) {
    return {
      isActive: true,
      mode,
      modeLabel: 'Onboarding',
      rows: [],
      dueItems: [],
      todayItems: [],
      checklistStart: [],
      firstMeasurements: [],
      statusText:
        'Brak daty startu onboardingu. Ustaw tryb, cele parametrow i dodaj pierwszy pomiar.',
      dayNumber: 1,
      targetEndDay,
      isStabilized: false,
    };
  }

  const startDayMs = getDayBucketMs(startMs);
  const todayDayMs = getDayBucketMs(new Date());
  const dayNumber = Math.max(1, Math.floor((todayDayMs - startDayMs) / dayMs) + 1);

  const latestMeasurement = measurements[0] ?? null;
  const latestAnalysis = latestMeasurement
    ? analyzeMeasurementLogic(
        latestMeasurement,
        enabledTests,
        getWaterAnalysisOptionsForTank(tank)
      )
    : null;

  const toNumeric = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const no2Series = getRecentNumericSeries(measurements, 'no2', 3);
  const no3Value = toNumeric(latestMeasurement?.no3);
  const nh3Value = toNumeric(latestMeasurement?.nh3nh4);
  const no2Value = toNumeric(latestMeasurement?.no2);
  const cycleModes = new Set(['fresh_start', 'restart', 'mature_media_start']);
  const cycleState = cycleModes.has(mode)
    ? evaluateCycleDrift({
        latestAnalysisStatus: latestAnalysis?.status,
        no2Value,
        nh3Value,
        no2Series,
        no3Value,
        dayNumber,
      })
    : {
        hasCriticalDrift: false,
        hasWarningDrift: false,
        targetEndDay,
        isStabilized: false,
      };

  const buildDueAtMs = (startDay) => startDayMs + (Math.max(1, startDay) - 1) * dayMs;
  const rows = [];
  const dueItems = [];
  const todayItems = [];
  const addRow = ({
    id,
    dayStart,
    dayEnd = dayStart,
    level = 'task',
    text,
    addToDueList = true,
  }) => {
    const status =
      dayNumber < dayStart
        ? 'upcoming'
        : dayNumber > dayEnd
          ? 'overdue'
          : 'current';
    const dueAtMs = buildDueAtMs(dayStart);
    rows.push({
      id,
      dayStart,
      dayEnd,
      level,
      text,
      status,
      dueAtMs,
    });

    if (status === 'current') {
      todayItems.push(text);
    }

    if (addToDueList) {
      dueItems.push({
        id: `onboarding-${id}`,
        source: 'Onboarding',
        text,
        dueAtMs,
        dayBucketMs: getDayBucketMs(dueAtMs),
      });
    }
  };
  const addDailyRows = ({
    id,
    dayStart,
    dayEnd,
    level = 'task',
    text,
    textByDay,
    addToDueList = true,
  }) => {
    for (let day = dayStart; day <= dayEnd; day += 1) {
      const resolvedText =
        typeof textByDay === 'function' ? textByDay(day) : text;
      addRow({
        id: `${id}-day-${day}`,
        dayStart: day,
        dayEnd: day,
        level,
        text: resolvedText,
        addToDueList,
      });
    }
  };

  const modeBlueprints = {
    fresh_start: {
      modeLabel: 'Fresh start',
      checklistStart: [
        'Potwierdz typ akwarium i profil docelowy parametrow.',
        'Uruchom filtr i grzalke 24/7, ustaw swiatlo 6-8h.',
        'Dodaj uzdatniacz i bakterie startowe zgodnie z etykieta.',
        'Posadz rosliny szybko rosnace od pierwszego dnia.',
      ],
      firstMeasurements: [
        'Dzien 1: pH, KH, GH, temperatura (wartosci bazowe).',
        'Dzien 3: NO2 + NH3/NH4.',
        'Dzien 7: NO2, NH3/NH4, NO3.',
      ],
      applyPlan: () => {
        addRow({
          id: 'fresh-day1-mode-goal',
          dayStart: 1,
          text:
            'Dzien 1: wybierz typ akwarium i zatwierdz cele parametrow (target ranges).',
        });
        addRow({
          id: 'fresh-day1-setup',
          dayStart: 1,
          text:
            'Dzien 1: zalej zbiornik, uruchom filtr i grzalke, dodaj uzdatniacz oraz bakterie.',
        });
        addRow({
          id: 'fresh-day1-baseline-measure',
          dayStart: 1,
          text:
            'Dzien 1: zapisz pierwszy pomiar bazowy pH, KH, GH i temperatury.',
        });
        addDailyRows({
          id: 'fresh-day2-6-observe',
          dayStart: 2,
          dayEnd: 6,
          level: 'info',
          textByDay: (day) =>
            `Dzien ${day}: obserwuj klarownosc, prace filtra i zachowanie zbiornika bez gwaltownych zmian.`,
        });
        addDailyRows({
          id: 'fresh-day3-10-toxic-tests',
          dayStart: 3,
          dayEnd: 10,
          textByDay: (day) =>
            `Dzien ${day}: wykonaj test NO2${enabledTests?.nh3nh4 ? ' + NH3/NH4' : ''} i zapisz wynik.`,
        });
        addRow({
          id: 'fresh-day7-no3',
          dayStart: 7,
          text: 'Dzien 7: wykonaj NO3 i porownaj trend z poprzednimi dniami.',
        });
        addRow({
          id: 'fresh-day11-14-check',
          dayStart: 11,
          dayEnd: 14,
          level: 'warning',
          text:
            'Dni 11-14: potwierdz dwa kolejne pomiary NO2=0 przed rozbudowa obsady.',
        });
        addRow({
          id: 'fresh-day14-water-change',
          dayStart: 14,
          text:
            'Dzien 14: jesli NO2 stabilnie 0, wykonaj podmiane 25-35% i utrzymaj ostrozne karmienie.',
        });
      },
    },
    existing_running: {
      modeLabel: 'Istniejace akwarium',
      checklistStart: [
        'Potwierdz typ akwarium i profil docelowy parametrow.',
        'Sprawdz aktualna obsade, rosliny i sprzet.',
        'Ustaw harmonogram: podmiany, testy, serwis filtra.',
        'Ustal priorytety: co jest krytyczne, wazne i rutynowe.',
      ],
      firstMeasurements: [
        'Dzien 1: pelny zestaw pomiarow (NO2, NO3, NH3/NH4, pH, GH, KH, temperatura).',
        'Dzien 4-5: pomiar kontrolny parametrow odstajacych od celu.',
        'Dzien 10-14: pomiar porownawczy trendu.',
      ],
      applyPlan: () => {
        addRow({
          id: 'existing-day1-audit',
          dayStart: 1,
          text:
            'Dzien 1: audit zbiornika - potwierdz typ akwarium, cele parametrow i komplet danych sprzetu.',
        });
        addRow({
          id: 'existing-day1-measure',
          dayStart: 1,
          text:
            'Dzien 1: wykonaj pelny zestaw pomiarow i zapisz punkt odniesienia.',
        });
        addRow({
          id: 'existing-day2-plan',
          dayStart: 2,
          dayEnd: 3,
          text:
            'Dni 2-3: skoryguj tylko najwieksze odchylenia od celu (bez gwaltownych zmian).',
        });
        addRow({
          id: 'existing-day4-equipment',
          dayStart: 4,
          dayEnd: 7,
          text:
            'Dni 4-7: sprawdz przeplyw filtra, temperature i realny harmonogram podmian.',
        });
        addRow({
          id: 'existing-day8-10-stocking',
          dayStart: 8,
          dayEnd: 10,
          text:
            'Dni 8-10: ocen kompatybilnosc obsady (grupy, agresja, strefy plywania).',
        });
        addRow({
          id: 'existing-day11-14-trend',
          dayStart: 11,
          dayEnd: 14,
          level: 'info',
          text:
            'Dni 11-14: potwierdz trend parametrow i dopracuj plan rutynowy na kolejne tygodnie.',
        });
      },
    },
    restart: {
      modeLabel: 'Restart',
      checklistStart: [
        'Potwierdz typ akwarium i cele parametrow po restarcie.',
        'Zabezpiecz media biologiczne i nie dopusc do ich wyschniecia.',
        'Zaplanuj etapowy powrot obsady oraz oswietlenia.',
        'Ustaw codzienny monitoring NO2/NH3 w 1 tygodniu.',
      ],
      firstMeasurements: [
        'Dzien 1: pH, KH, GH, temperatura, NO2, NH3/NH4.',
        'Dzien 2-4: codziennie NO2/NH3/NH4.',
        'Dzien 7 i 14: NO3 + kontrola trendu.',
      ],
      applyPlan: () => {
        addRow({
          id: 'restart-day1-mode-goal',
          dayStart: 1,
          text:
            'Dzien 1: zatwierdz typ akwarium i nowe cele parametrow po restarcie.',
        });
        addRow({
          id: 'restart-day1-media',
          dayStart: 1,
          text:
            'Dzien 1: utrzymaj media filtracyjne stale mokre i uruchom filtr natychmiast po restarcie.',
        });
        addDailyRows({
          id: 'restart-day1-7-toxic-tests',
          dayStart: 1,
          dayEnd: 7,
          textByDay: (day) =>
            `Dzien ${day}: kontrola NO2${enabledTests?.nh3nh4 ? ' + NH3/NH4' : ''} po zmianach w zbiorniku.`,
        });
        addRow({
          id: 'restart-day3-5-light',
          dayStart: 3,
          dayEnd: 5,
          text:
            'Dni 3-5: utrzymuj krotsze swiecenie (6-7h), aby ograniczyc presje glonow.',
        });
        addRow({
          id: 'restart-day6-10-water-change',
          dayStart: 6,
          dayEnd: 10,
          text:
            'Dni 6-10: dostosuj podmiany do trendu NO2/NO3 i nie zwiekszaj obsady skokowo.',
        });
        addRow({
          id: 'restart-day11-14-stability',
          dayStart: 11,
          dayEnd: 14,
          text:
            'Dni 11-14: potwierdz stabilnosc parametrow w co najmniej 2 kolejnych pomiarach.',
        });
      },
    },
    mature_media_start: {
      modeLabel: 'Start na dojrzalym medium',
      checklistStart: [
        'Potwierdz typ akwarium i cele parametrow przed wpuszczeniem obsady.',
        'Przenies dojrzale media filtracyjne bez przestojow i bez plukania w kranowce.',
        'Startuj od ograniczonej obsady (ok. 30-40% docelowej).',
        'Prowadz intensywny monitoring NO2/NH3 przez 10 dni.',
      ],
      firstMeasurements: [
        'Dzien 1: pelny zestaw pomiarow startowych.',
        'Dzien 2-5: NO2 + NH3/NH4 codziennie.',
        'Dzien 7 i 14: NO3 + pH + temperatura.',
      ],
      applyPlan: () => {
        addRow({
          id: 'mature-day1-goal',
          dayStart: 1,
          text:
            'Dzien 1: ustaw tryb zbiornika, cele parametrow i potwierdz plan ostroznego zarybiania.',
        });
        addRow({
          id: 'mature-day1-media',
          dayStart: 1,
          text:
            'Dzien 1: uruchom filtr z dojrzalym medium bez przerw i bez agresywnego czyszczenia mediow.',
        });
        addDailyRows({
          id: 'mature-day2-10-toxic-tests',
          dayStart: 2,
          dayEnd: 10,
          textByDay: (day) =>
            `Dzien ${day}: monitoruj NO2${enabledTests?.nh3nh4 ? ' + NH3/NH4' : ''} po starcie na dojrzalym medium.`,
        });
        addRow({
          id: 'mature-day4-7-stock',
          dayStart: 4,
          dayEnd: 7,
          text:
            'Dni 4-7: nie dokladaj obsady, dopoki trendy NO2/NH3 nie sa stabilne.',
        });
        addRow({
          id: 'mature-day8-12-increase',
          dayStart: 8,
          dayEnd: 12,
          text:
            'Dni 8-12: ewentualne zwiekszanie obsady tylko etapowo i z codzienna obserwacja.',
        });
        addRow({
          id: 'mature-day14-review',
          dayStart: 14,
          text:
            'Dzien 14: podsumuj trendy i utrwal docelowy harmonogram testow/podmian.',
        });
      },
    },
  };

  const resolvedBlueprint =
    modeBlueprints[mode] ?? modeBlueprints.existing_running;
  resolvedBlueprint.applyPlan();

  if (!enabledTests?.no2) {
    addRow({
      id: 'no2-required',
      dayStart: dayNumber,
      level: 'warning',
      text: 'Wlacz test NO2 w ustawieniach - bez niego onboarding nie bedzie wiarygodny.',
      addToDueList: false,
    });
  }
  if (!enabledTests?.no3) {
    addRow({
      id: 'no3-required',
      dayStart: dayNumber,
      level: 'warning',
      text: 'Wlacz test NO3 w ustawieniach - to kluczowy wskaznik stabilizacji zbiornika.',
      addToDueList: false,
    });
  }

  if (cycleState.hasCriticalDrift) {
    addRow({
      id: 'critical-drift',
      dayStart: dayNumber,
      level: 'warning',
      text:
        'Parametry sa mocno odchylone - wstrzymaj rozbudowe obsady i mierz codziennie do stabilizacji.',
      addToDueList: false,
    });
  } else if (cycleState.hasWarningDrift) {
    addRow({
      id: 'warning-drift',
      dayStart: dayNumber,
      level: 'info',
      text:
        'Widoczne odchylenia parametrow - utrzymuj ostrozne tempo zmian i monitoruj trendy.',
      addToDueList: false,
    });
  }

  (latestAnalysis?.recommendations ?? []).slice(0, 3).forEach((item, index) => {
    const dueAtMs = getRecommendationDueAtMsLogic(item);
    const actionableText = `${item.parameter}: ${item.action}`;
    rows.push({
      id: `dynamic-${index}`,
      dayStart: dayNumber,
      dayEnd: dayNumber,
      level: item.severity === 'critical' ? 'warning' : 'info',
      text: `Korekta parametru: ${actionableText}`,
      status: 'current',
      dueAtMs,
    });
    dueItems.push({
      id: `onboarding-dynamic-${index}`,
      source: 'Onboarding',
      text: actionableText,
      dueAtMs,
      dayBucketMs: getDayBucketMs(dueAtMs),
    });
    todayItems.push(actionableText);
  });

  if (cycleModes.has(mode) && dayNumber > targetEndDay && !cycleState.isStabilized) {
    addRow({
      id: 'cycle-post-plan-warning',
      dayStart: dayNumber,
      level: 'warning',
      text:
        'Plan 14 dni zakonczony, ale zbiornik nadal niestabilny. Kontynuuj testy codzienne i ostrozne karmienie.',
      addToDueList: false,
    });
  }

  const onboardingWindowDays = targetEndDay;
  const cycleExtendedWindowEndDay = 21;
  const isActive =
    dayNumber <= onboardingWindowDays ||
    (cycleModes.has(mode) &&
      !cycleState.isStabilized &&
      dayNumber <= cycleExtendedWindowEndDay);

  const statusText = !isActive
    ? `Plan onboardingu (${resolvedBlueprint.modeLabel}) zakonczony po ${onboardingWindowDays} dniach.`
    : dayNumber <= onboardingWindowDays
      ? `Onboarding ${resolvedBlueprint.modeLabel}: dzien ${dayNumber}/${onboardingWindowDays}.`
      : `Onboarding ${resolvedBlueprint.modeLabel}: przedluzony monitoring po 14 dniach (dzien ${dayNumber}).`;

  return {
    isActive,
    mode,
    modeLabel: resolvedBlueprint.modeLabel,
    rows,
    dueItems,
    todayItems: [...new Set(todayItems)],
    checklistStart: [...resolvedBlueprint.checklistStart],
    firstMeasurements: [...resolvedBlueprint.firstMeasurements],
    statusText,
    dayNumber,
    targetEndDay: onboardingWindowDays,
    isStabilized: Boolean(cycleState.isStabilized),
  };
}
