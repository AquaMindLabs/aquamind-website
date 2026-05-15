const BIOLOAD_RISK_THRESHOLDS = {
  medium: 0.9,
  high: 1.15,
  critical: 1.45,
};

export function buildStockingCompatibilitySections(stockingCompatibility: any) {
  const assessment = stockingCompatibility?.stockingAssessment ?? null;
  const biologicalLoad = assessment?.biologicalLoad ?? null;
  const categories = stockingCompatibility?.categories ?? {};
  const riskToUi = (risk: string) => {
    if (risk === 'critical') return 'Niezgodne';
    if (risk === 'high') return 'Ryzykowne';
    if (risk === 'medium') return 'Uwaga';
    return 'OK';
  };
  const formatBioloadValue = (value: unknown) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';
  };
  const formatPercentValue = (value: unknown) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${Math.round(numeric)}%` : '0%';
  };
  const behaviorCategoryKeys = [
    'aggression',
    'territoriality',
    'predation',
    'finNipping',
    'socialNeeds',
    'zoneCompetition',
  ];
  const behaviorCategoryLabels: Record<string, string> = {
    aggression: 'Agresja',
    territoriality: 'Terytorialnosc',
    predation: 'Drapieznictwo',
    finNipping: 'Podgryzanie pletw',
    socialNeeds: 'Potrzeby spoleczne',
    zoneCompetition: 'Konkurencja stref',
  };
  const buildFishLabel = (fish: any, fallback = 'Ryba') =>
    String(fish?.commonName ?? fish?.name ?? fish?.latinName ?? fallback).trim();
  const behaviorConflictDetails = (stockingCompatibility?.conflicts ?? [])
    .filter((item: any) =>
      behaviorCategoryKeys.includes(String(item?.category ?? ''))
    )
    .map((item: any) => {
      const categoryKey = String(item?.category ?? '');
      const categoryLabel = behaviorCategoryLabels[categoryKey] ?? 'Konflikt';
      const firstFishLabel = buildFishLabel(item?.firstFish, '');
      const secondFishLabel = buildFishLabel(item?.secondFish, '');
      const pairLabel =
        firstFishLabel && secondFishLabel
          ? `${firstFishLabel} + ${secondFishLabel}`
          : firstFishLabel || secondFishLabel || 'Obsada';
      const message = String(item?.message ?? '').trim();
      return message
        ? `${categoryLabel}: ${pairLabel} - ${message}`
        : `${categoryLabel}: ${pairLabel}`;
    });
  const behaviorCategoryDetails = behaviorCategoryKeys.flatMap((key) =>
    (categories?.[key]?.problems ?? []).map((text: string) => {
      const label = behaviorCategoryLabels[key] ?? 'Zachowanie';
      return `${label}: ${text}`;
    })
  );
  const uniqueBehaviorDetails = [
    ...new Set(
      [...behaviorConflictDetails, ...behaviorCategoryDetails].filter(Boolean)
    ),
  ].slice(0, 8);
  const spaceDetails = [
    ...new Set([...(categories?.tankSize?.problems ?? [])].filter(Boolean)),
  ].slice(0, 5);

  return [
    {
      key: 'biologicalLoad',
      label: 'Bioload',
      data: {
        uiStatus: riskToUi(
          biologicalLoad?.adjustedRisk ?? biologicalLoad?.rawRisk ?? 'low'
        ),
        problems: [
          biologicalLoad?.message,
          `Bioload index (obsada): ${formatBioloadValue(
            biologicalLoad?.bioloadIndexFromStocking
          )}`,
          `Bioload index (realny): ${formatBioloadValue(
            biologicalLoad?.bioloadIndexReal
          )}`,
          `Kompensacja filtracji: ${formatPercentValue(
            biologicalLoad?.filtrationCompensation
          )} (-${formatBioloadValue(
            biologicalLoad?.filtrationIndexReduction
          )})`,
          `Kompensacja roslin: ${formatPercentValue(
            biologicalLoad?.plantCompensation
          )} (-${formatBioloadValue(
            biologicalLoad?.plantIndexReduction
          )})`,
          `Kompensacja laczna: ${formatPercentValue(
            biologicalLoad?.totalCompensation
          )} (-${formatBioloadValue(
            biologicalLoad?.totalIndexReduction
          )})`,
        ].filter(Boolean),
        details: [
          `Progi: OK < ${BIOLOAD_RISK_THRESHOLDS.medium.toFixed(2)}, Uwaga ${BIOLOAD_RISK_THRESHOLDS.medium.toFixed(2)}-${(BIOLOAD_RISK_THRESHOLDS.high - 0.01).toFixed(2)}, Ryzykowne ${BIOLOAD_RISK_THRESHOLDS.high.toFixed(2)}-${(BIOLOAD_RISK_THRESHOLDS.critical - 0.01).toFixed(2)}, Niezgodne >= ${BIOLOAD_RISK_THRESHOLDS.critical.toFixed(2)}.`,
          `Masa roslin/100 l: ${formatBioloadValue(
            biologicalLoad?.plantMassPer100L
          )}`,
        ],
      },
    },
    {
      key: 'spaceLoad',
      label: 'Przestrzen',
      data: {
        uiStatus: riskToUi(assessment?.spaceLoad?.risk),
        problems: [assessment?.spaceLoad?.message].filter(Boolean),
        details: spaceDetails,
      },
    },
    {
      key: 'behaviorLoad',
      label: 'Zachowanie',
      data: {
        uiStatus: riskToUi(assessment?.behaviorLoad?.risk),
        problems: [assessment?.behaviorLoad?.message].filter(Boolean),
        details: uniqueBehaviorDetails,
      },
    },
  ].map((item) => ({
    ...item,
    data: item.data ?? { uiStatus: 'OK', problems: [], details: [] },
  }));
}
