export function evaluateCycleDrift({
  latestAnalysisStatus = '',
  no2Value = null,
  nh3Value = null,
  no2Series = [],
  no3Value = null,
  dayNumber = 1,
}) {
  const stableNo2 =
    Array.isArray(no2Series) &&
    no2Series.length >= 2 &&
    no2Series[0] <= 0.01 &&
    no2Series[1] <= 0.01;
  const visibleNo3 = no3Value !== null && no3Value >= 5;

  const hasCriticalDrift =
    (no2Value !== null && no2Value > 0.2) ||
    (nh3Value !== null && nh3Value > 0.2) ||
    latestAnalysisStatus === 'critical';
  const hasWarningDrift =
    (no2Value !== null && no2Value > 0) ||
    (nh3Value !== null && nh3Value > 0.05) ||
    latestAnalysisStatus === 'warning';

  const extensionDays = hasCriticalDrift ? 7 : hasWarningDrift ? 3 : 0;
  const targetEndDay = 21 + extensionDays;
  const isStabilized =
    dayNumber >= 21 && stableNo2 && visibleNo3 && !hasCriticalDrift;

  return {
    stableNo2,
    visibleNo3,
    hasCriticalDrift,
    hasWarningDrift,
    extensionDays,
    targetEndDay,
    isStabilized,
  };
}

function toNumeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSymptoms(input) {
  if (!input) {
    return new Set();
  }

  if (Array.isArray(input)) {
    return new Set(
      input
        .map((item) => String(item ?? '').trim().toLowerCase())
        .filter(Boolean)
    );
  }

  if (typeof input === 'object') {
    return new Set(
      Object.entries(input)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => String(key ?? '').trim().toLowerCase())
        .filter(Boolean)
    );
  }

  const single = String(input).trim().toLowerCase();
  return single ? new Set([single]) : new Set();
}

function buildNo2EmergencyCase(no2Value) {
  const severity = no2Value >= 0.2 ? 'critical' : 'warning';
  const levelLabel = severity === 'critical' ? 'krytycznie' : 'podwyzszone';

  return {
    key: 'high_no2',
    severity,
    title: `NO2 ${levelLabel} (${no2Value} mg/l)`,
    summary:
      'Azotyny ograniczaja transport tlenu i moga szybko pogorszyc stan ryb.',
    steps: [
      'Natychmiast wykonaj podmiane 40-60% wody o tej samej temperaturze.',
      'Wlacz mocne napowietrzanie i maksymalny ruch tafli.',
      'Na 24h ogranicz karmienie do minimum lub wstrzymaj calkowicie.',
      'Sprawdz droznosc filtra i przeplyw, ale nie plucz calego medium naraz.',
      'Powtorz test NO2 po 3-6h i ponownie nastepnego dnia.',
    ],
    avoid: [
      'Nie dodawaj od razu nowych ryb.',
      'Nie myj calego filtra w kranowce ani nie wymieniaj wszystkich mediow naraz.',
      'Nie koryguj parametrow wieloma preparatami jednoczesnie.',
    ],
  };
}

function buildNh3Nh4EmergencyCase(nh3nh4Value) {
  const severity = nh3nh4Value >= 0.2 ? 'critical' : 'warning';
  const levelLabel = severity === 'critical' ? 'krytycznie' : 'podwyzszone';

  return {
    key: 'high_nh3_nh4',
    severity,
    title: `NH3/NH4 ${levelLabel} (${nh3nh4Value} mg/l)`,
    summary:
      'Amoniak i jon amonowy moga byc silnie toksyczne, szczegolnie przy wyzszym pH i temperaturze.',
    steps: [
      'Wykonaj podmiane 40-60% wody i uzdatnij nowa wode.',
      'Zwiksz napowietrzanie oraz ruch tafli.',
      'Wstrzymaj karmienie na 24h, potem dawkuj bardzo oszczednie.',
      'Sprawdz, czy filtr pracuje stabilnie i czy nie doszlo do przerwy biologii.',
      'Powtorz test NH3/NH4 po kilku godzinach oraz kolejnego dnia.',
    ],
    avoid: [
      'Nie dodawaj kolejnych srodkow na slepo bez ponownego pomiaru.',
      'Nie podnoz gwaltownie pH podczas epizodu amoniaku.',
      'Nie przenos calej obsady bez przygotowanego, stabilnego zbiornika.',
    ],
  };
}

function buildGaspingEmergencyCase() {
  return {
    key: 'fish_gasping',
    severity: 'critical',
    title: 'Ryby lapia powietrze przy tafli',
    summary:
      'To objaw niedoboru tlenu lub ostrego zatrucia, wymagajacy szybkiej reakcji.',
    steps: [
      'Natychmiast zwieksz napowietrzanie i ruch tafli.',
      'Wykonaj szybka podmiane 30-50% wody.',
      'Sprawdz temperature i dzialanie filtra.',
      'Wykonaj test NO2 oraz NH3/NH4 jak najszybciej.',
      'Obserwuj ryby przez kolejne 1-2h po interwencji.',
    ],
    avoid: [
      'Nie zaczynaj od leczenia calego zbiornika bez pomiarow.',
      'Nie podawaj dodatkowej karmy w trakcie kryzysu.',
      'Nie wylaczaj filtra na dluzszy czas.',
    ],
  };
}

function buildFilterStoppedEmergencyCase(filterStatusLabel) {
  return {
    key: 'filter_stopped',
    severity: 'critical',
    title: 'Filtr przestal dzialac',
    summary:
      'Przerwa filtracji szybko obniza tlen i destabilizuje biologie akwarium.',
    steps: [
      'Przywroc prace filtra (zasilanie, wirnik, droznosc przewodow).',
      'Do czasu naprawy uruchom mocne napowietrzanie.',
      'Jesli przestoj byl dluzszy niz ~1-2h, wykonaj podmiane 30-50% wody.',
      'Sprawdz NO2 i NH3/NH4 po przywroceniu obiegu.',
      'Przez 24-48h karm oszczednie i monitoruj ryby.',
    ],
    avoid: [
      'Nie uruchamiaj filtra na zabrudzonych mediach bez kontroli zapachu i przeplywu.',
      'Nie plucz wszystkich mediow biologicznych jednoczesnie.',
      `Nie ignoruj statusu filtra: ${filterStatusLabel}.`,
    ],
  };
}

function buildHighTemperatureEmergencyCase(temperatureValue, thresholdValue) {
  return {
    key: 'high_temperature',
    severity: temperatureValue >= thresholdValue + 1 ? 'critical' : 'warning',
    title: `Temperatura za wysoka (${temperatureValue} C)`,
    summary:
      'Przegrzanie zmniejsza ilosc tlenu w wodzie i moze nasilac stres oraz toksycznosc.',
    steps: [
      'Zwiksz natlenienie i ruch tafli.',
      'Ogranicz oswietlenie i zrodla ciepla przy akwarium.',
      'Chlodz zbiornik stopniowo (maks. ok. 1 C na kilka godzin).',
      'Sprawdz, czy grzalka nie jest zablokowana w pozycji grzania.',
      'Kontroluj temperature co 30-60 min do stabilizacji.',
    ],
    avoid: [
      'Nie schladzaj gwaltownie (szok termiczny).',
      'Nie wrzucaj lodu bezposrednio do akwarium.',
      'Nie podmieniaj od razu duzej objetosci bardzo zimna woda.',
    ],
  };
}

export function evaluateEmergencyState(
  tank,
  latestMeasurement,
  equipmentState,
  symptoms
) {
  const no2 = toNumeric(latestMeasurement?.no2);
  const nh3nh4 = toNumeric(latestMeasurement?.nh3nh4);
  const temperature = toNumeric(latestMeasurement?.temperature);
  const symptomSet = normalizeSymptoms(symptoms);

  const targetTempRaw = toNumeric(
    tank?.targetTemperatureC ??
      tank?.targetRanges?.temperature?.max
  );
  const temperatureCriticalThreshold =
    targetTempRaw !== null ? Math.max(28, targetTempRaw + 2) : 30;
  const temperatureWarningThreshold =
    targetTempRaw !== null ? Math.max(27, targetTempRaw + 1) : 29;

  const filterStatusLabel = String(
    equipmentState?.filter?.status ??
      equipmentState?.filterStatus ??
      ''
  )
    .trim()
    .toLowerCase();
  const filterRunningFlag = equipmentState?.filter?.isRunning;
  const filterStopped =
    filterRunningFlag === false ||
    ['none', 'critical', 'stopped', 'off', 'failed'].includes(filterStatusLabel);

  const gaspingSymptoms = [
    'rapid_breathing',
    'gasping_for_air',
    'fish_gasping',
    'surface_gasping',
    'sudden_deaths',
  ];
  const hasGaspingSignal = gaspingSymptoms.some((key) => symptomSet.has(key));

  const cases = [];

  if (no2 !== null && no2 > 0.05) {
    cases.push(buildNo2EmergencyCase(no2));
  }
  if (nh3nh4 !== null && nh3nh4 > 0.05) {
    cases.push(buildNh3Nh4EmergencyCase(nh3nh4));
  }
  if (hasGaspingSignal) {
    cases.push(buildGaspingEmergencyCase());
  }
  if (filterStopped) {
    cases.push(buildFilterStoppedEmergencyCase(filterStatusLabel || 'unknown'));
  }
  if (temperature !== null && temperature >= temperatureWarningThreshold) {
    cases.push(buildHighTemperatureEmergencyCase(temperature, temperatureCriticalThreshold));
  }

  const severityRank = (value) => (value === 'critical' ? 2 : value === 'warning' ? 1 : 0);
  const overallSeverity =
    cases.length === 0
      ? 'ok'
      : cases.some((entry) => entry.severity === 'critical')
        ? 'critical'
        : 'warning';

  const sortedCases = [...cases].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity)
  );
  const primaryCase = sortedCases[0] ?? null;
  const mergedSteps = [];
  const mergedAvoid = [];

  sortedCases.forEach((entry) => {
    (entry.steps ?? []).forEach((step) => {
      if (!mergedSteps.includes(step)) {
        mergedSteps.push(step);
      }
    });
    (entry.avoid ?? []).forEach((item) => {
      if (!mergedAvoid.includes(item)) {
        mergedAvoid.push(item);
      }
    });
  });

  const summary =
    sortedCases.length === 0
      ? 'Brak aktywnych sygnalow awaryjnych.'
      : sortedCases.map((entry) => entry.title).join(' | ');

  return {
    isEmergency: sortedCases.length > 0,
    severity: overallSeverity,
    title: primaryCase?.title ?? '',
    summary,
    triggers: sortedCases.map((entry) => entry.key),
    cases: sortedCases,
    steps: mergedSteps.slice(0, 8),
    avoid: mergedAvoid.slice(0, 8),
    primaryCase,
  };
}
