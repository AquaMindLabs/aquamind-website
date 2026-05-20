const BIOLOAD_RISK_THRESHOLDS = {
  medium: 0.9,
  high: 1.15,
  critical: 1.45,
};

export function buildStockingCompatibilitySections(stockingCompatibility: any) {
  const assessment = stockingCompatibility?.stockingAssessment ?? null;
  const biologicalLoad = assessment?.biologicalLoad ?? null;
  const metrics = stockingCompatibility?.metrics ?? {};
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
    finNipping: "Podgryzanie płetw",
    socialNeeds: 'Potrzeby spoleczne',
    zoneCompetition: 'Konkurencja stref',
  };
  const buildFishLabel = (fish: any, fallback = 'Ryba') =>
    String(fish?.commonName ?? fish?.name ?? fish?.latinName ?? fallback).trim();
  const aggressionDependencies = Array.isArray(stockingCompatibility?.aggressionDependencies)
    ? stockingCompatibility.aggressionDependencies
    : [];
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
      const aggressionDirectionLabel =
        firstFishLabel && secondFishLabel
          ? `${firstFishLabel} -> ${secondFishLabel}`
          : pairLabel;
      const message = String(item?.message ?? '').trim();
      if (message) {
        return `${categoryLabel}: ${aggressionDirectionLabel} - ${message}`;
      }
      return `${categoryLabel}: ${aggressionDirectionLabel}`;
    });
  const aggressionConflictProblems = aggressionDependencies
    .map((item: any) => {
      const categoryKey = String(item?.type ?? '');
      const source = String(item?.source ?? '').trim();
      const target = String(item?.target ?? '').trim();
      const severityRank =
        String(item?.severity ?? '').toLowerCase() === 'critical'
          ? 2
          : String(item?.severity ?? '').toLowerCase() === 'warning'
            ? 1
            : 0;
      if (!source || !target) {
        return null;
      }
      const text =
        categoryKey === 'predation'
          ? `${source} może polowac na ${target}.`
          : categoryKey === 'finNipping'
            ? `${source} może podgryzac płetwy ${target}.`
            : categoryKey === 'territoriality'
              ? `${source} może konfliktowac terytorialnie z ${target}.`
              : `${source} może byc agresywny wobec ${target}.`;
      return { severityRank, text };
    })
    .filter(Boolean)
    .filter((item: any) => Boolean(String(item?.text ?? '').trim()))
    .sort((a: any, b: any) => b.severityRank - a.severityRank)
    .map((item: any) => item.text);
  const aggressionPairDetails = (stockingCompatibility?.conflicts ?? [])
    .filter((item: any) =>
      ['aggression', 'territoriality', 'predation', 'finNipping'].includes(
        String(item?.category ?? '')
      )
    )
    .map((item: any) => {
      const categoryKey = String(item?.category ?? '');
      const firstFishLabel = buildFishLabel(item?.firstFish, '');
      const secondFishLabel = buildFishLabel(item?.secondFish, '');
      const severityRank =
        String(item?.severity ?? '').toLowerCase() === 'critical'
          ? 2
          : String(item?.severity ?? '').toLowerCase() === 'warning'
            ? 1
            : 0;
      if (firstFishLabel && secondFishLabel) {
        if (categoryKey === 'predation') {
          return { severityRank, text: `${firstFishLabel} może polowac na ${secondFishLabel}.` };
        }
        if (categoryKey === 'finNipping') {
          return {
            severityRank,
            text: `${firstFishLabel} może podgryzac płetwy ${secondFishLabel}.`,
          };
        }
        if (categoryKey === 'territoriality') {
          return {
            severityRank,
            text: `${firstFishLabel} może konfliktowac terytorialnie z ${secondFishLabel}.`,
          };
        }
        return {
          severityRank,
          text: `${firstFishLabel} może byc agresywny wobec ${secondFishLabel}.`,
        };
      }
      const fallbackMessage = String(item?.message ?? '').trim();
      return { severityRank, text: fallbackMessage };
    })
    .filter((item: any) => Boolean(String(item?.text ?? '').trim()))
    .sort((a: any, b: any) => b.severityRank - a.severityRank)
    .map((item: any) => item.text);
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
  const aggressiveRatio = Number(metrics?.aggressiveRatio);
  const maxAggressionLevel = Number(metrics?.maxAggressionLevel);
  const averageAggressionLevel = Number(metrics?.averageAggressionLevel);
  const aggressionRisk = (() => {
    if (
      (Number.isFinite(maxAggressionLevel) && maxAggressionLevel >= 4 && Number.isFinite(aggressiveRatio) && aggressiveRatio >= 0.55) ||
      (Number.isFinite(aggressiveRatio) && aggressiveRatio >= 0.7)
    ) {
      return 'critical';
    }
    if (
      (Number.isFinite(aggressiveRatio) && aggressiveRatio >= 0.45) ||
      (Number.isFinite(maxAggressionLevel) && maxAggressionLevel >= 4)
    ) {
      return 'high';
    }
    if (
      (Number.isFinite(aggressiveRatio) && aggressiveRatio >= 0.25) ||
      (Number.isFinite(maxAggressionLevel) && maxAggressionLevel >= 3)
    ) {
      return 'medium';
    }
    return 'low';
  })();
  const aggressionDetails = [
    ...[...new Set(aggressionPairDetails)].slice(0, 4),
    Number.isFinite(aggressiveRatio)
      ? `Udzial agresywnej obsady: ${Math.round(aggressiveRatio * 100)}%`
      : null,
    Number.isFinite(averageAggressionLevel)
      ? `Sredni poziom agresji: ${Math.round(averageAggressionLevel * 10) / 10}/5`
      : null,
    Number.isFinite(maxAggressionLevel)
      ? `Maksymalny poziom agresji: ${Math.round(maxAggressionLevel * 10) / 10}/5`
      : null,
  ].filter(Boolean);
  const aggressionCategoryProblems = [
    ...(categories?.aggression?.problems ?? []),
    ...(categories?.territoriality?.problems ?? []),
    ...(categories?.predation?.problems ?? []),
    ...(categories?.finNipping?.problems ?? []),
  ].filter(Boolean);
  const topAggressionProblems = [
    ...new Set([...aggressionConflictProblems, ...aggressionCategoryProblems]),
  ].slice(0, 6);
  const aggressionProblems =
    aggressionRisk === 'critical'
      ? ['Bardzo wysoki poziom agresji w obsadzie.', ...topAggressionProblems]
      : aggressionRisk === 'high'
        ? ['Wysoki poziom agresji - obserwuj konflikty miedzy gatunkami.', ...topAggressionProblems]
        : aggressionRisk === 'medium'
          ? ['Umiarkowana agresja - zachowaj ostroznosc przy nowych gatunkach.', ...topAggressionProblems]
          : topAggressionProblems.length > 0
            ? ['Niski poziom agresji.', ...topAggressionProblems]
            : ['Niski poziom agresji. Brak wyraznych relacji agresji miedzy gatunkami.'];

  return [
    {
      key: 'biologicalLoad',
      label: 'Obciazenie biologiczne',
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
          `Kompensacja roślin: ${formatPercentValue(
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
          `Masa roślin/100 l: ${formatBioloadValue(
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
    {
      key: 'aggressionProfile',
      label: 'Agresywnosc',
      data: {
        uiStatus: riskToUi(aggressionRisk),
        problems: aggressionProblems,
        details: aggressionDetails,
      },
    },
  ].map((item) => ({
    ...item,
    data: item.data ?? { uiStatus: 'OK', problems: [], details: [] },
  }));
}

