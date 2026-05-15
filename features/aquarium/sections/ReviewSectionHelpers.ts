type TrendSuggestedEnvironmentInput = {
  fishItems?: any[];
  plantItems?: any[];
  activeDiseaseCases?: any[];
  activePlantDiseaseCases?: any[];
  activeAlgaeCases?: any[];
  measurement?: any;
  tankProfile?: any;
};

type TrendSuggestedEnvironmentDeps = {
  buildRecommendedRange: (minValues: any[], maxValues: any[]) => any;
  getPlantLightRequirements: (item: any) => any;
  roundToOneDecimal: (value: number) => number;
};

export function buildTrendSuggestedEnvironmentForTank(
  {
    fishItems = [],
    plantItems = [],
    activeDiseaseCases = [],
    activePlantDiseaseCases = [],
    activeAlgaeCases = [],
    measurement = null,
    tankProfile = null,
  }: TrendSuggestedEnvironmentInput,
  deps: TrendSuggestedEnvironmentDeps
) {
  const { buildRecommendedRange, getPlantLightRequirements, roundToOneDecimal } = deps;

  const fishTempRange = buildRecommendedRange(
    fishItems.map((item) => item.tempMin),
    fishItems.map((item) => item.tempMax)
  );
  const plantTempRange = buildRecommendedRange(
    plantItems.map((item) => item.tempMin),
    plantItems.map((item) => item.tempMax)
  );

  const baseTempRanges = [fishTempRange, plantTempRange].filter(Boolean);
  const baseTempRange =
    baseTempRanges.length === 0
      ? null
      : buildRecommendedRange(
          baseTempRanges.map((range) => range.min),
          baseTempRanges.map((range) => range.max)
        );

  const plantLightRanges = plantItems
    .map((item) => getPlantLightRequirements(item))
    .filter(Boolean)
    .map((range) => ({
      min: Number(range.minHours),
      max: Number(range.maxHours),
    }))
    .filter(
      (range) =>
        Number.isFinite(range.min) &&
        Number.isFinite(range.max) &&
        range.min <= range.max
    );
  const baseLightRange =
    plantLightRanges.length === 0
      ? null
      : buildRecommendedRange(
          plantLightRanges.map((range) => range.min),
          plantLightRanges.map((range) => range.max)
        );

  let recommendedTempRange = baseTempRange;
  let recommendedLightRange = baseLightRange;
  const treatmentReasons: string[] = [];

  const activeFishDiseaseIds = new Set(
    activeDiseaseCases.map((item) =>
      String(item.issueId ?? item.diseaseId ?? '').toLowerCase()
    )
  );
  const activePlantDiseaseIds = new Set(
    activePlantDiseaseCases.map((item) =>
      String(item.issueId ?? item.diseaseId ?? '').toLowerCase()
    )
  );
  const activeAlgaeIds = new Set(
    activeAlgaeCases.map((item) =>
      String(item.issueId ?? item.diseaseId ?? '').toLowerCase()
    )
  );

  if (activeFishDiseaseIds.has('ich')) {
    recommendedTempRange = { min: 28, max: 30, conflict: false };
    recommendedLightRange = { min: 6, max: 8, conflict: false };
    treatmentReasons.push('ospa rybia');
  }

  if (activeFishDiseaseIds.has('velvet')) {
    recommendedTempRange = { min: 27, max: 28, conflict: false };
    recommendedLightRange = { min: 4, max: 6, conflict: false };
    treatmentReasons.push('oodinioza (velvet)');
  }

  if (activePlantDiseaseIds.size > 0 && treatmentReasons.length === 0) {
    recommendedLightRange = { min: 6, max: 8, conflict: false };
    treatmentReasons.push('aktywny problem roslin');
  }

  if (activeAlgaeIds.has('black-beard-algae')) {
    recommendedLightRange = { min: 6, max: 7, conflict: false };
    treatmentReasons.push('krasnorosty (BBA)');
  } else if (activeAlgaeIds.has('cyanobacteria')) {
    recommendedLightRange = { min: 5, max: 6, conflict: false };
    treatmentReasons.push('sinice');
  } else if (activeAlgaeIds.has('green-hair-algae')) {
    recommendedLightRange = { min: 6, max: 7, conflict: false };
    treatmentReasons.push('zielenice nitkowate');
  }

  const isTreatmentMode = treatmentReasons.length > 0;
  const latestTemperature = Number(measurement?.temperature);
  const currentTempValue = Number.isFinite(latestTemperature)
    ? roundToOneDecimal(latestTemperature)
    : null;
  const currentLightHours = Number(tankProfile?.lightHours);
  const currentLightValue = Number.isFinite(currentLightHours)
    ? roundToOneDecimal(currentLightHours)
    : null;

  const isTempWithinSuggested =
    recommendedTempRange && currentTempValue !== null
      ? currentTempValue >= recommendedTempRange.min &&
        currentTempValue <= recommendedTempRange.max
      : null;
  const isLightWithinSuggested =
    recommendedLightRange && currentLightValue !== null
      ? currentLightValue >= recommendedLightRange.min &&
        currentLightValue <= recommendedLightRange.max
      : null;

  return {
    isTreatmentMode,
    treatmentReasons,
    fishTempRange,
    plantTempRange,
    recommendedTempRange,
    recommendedLightRange,
    currentTempValue,
    currentLightValue,
    isTempWithinSuggested,
    isLightWithinSuggested,
  };
}

export function buildAttentionItemsForTank(
  {
    hasEquipmentSaveAccess,
    equipmentAssessment,
    trendSuggestedEnvironment,
    fishCompatibilityResults = [],
    plantCompatibilityResults = [],
    fishAggressionConflictsCount = 0,
    fishAggressionConflicts = [],
    fishSchoolingWarningsCount = 0,
    fishSchoolingWarnings = [],
    fishStockingSummary,
    activeDiseaseCasesCount = 0,
    activeDiseaseCases = [],
    activePlantDiseaseCasesCount = 0,
    activePlantDiseaseCases = [],
    activeAlgaeCasesCount = 0,
    activeAlgaeCases = [],
    selectedTankHealthAssessment,
  }: any,
  deps: {
    summarizeCompatibilityResults: (results: any[]) => any;
    buildCompatibilityMismatchDetails: (results: any[], options?: any) => any;
    formatCompactNameList: (items: any[], limit?: number) => string;
    buildAggressionConflictDetails: (conflicts?: any[], maxPairs?: number) => string[];
    buildSchoolingWarningDetails: (items?: any[], maxItems?: number) => string[];
    getIssueCaseDisplayName: (item: any) => string;
  }
) {
  const {
    summarizeCompatibilityResults,
    buildCompatibilityMismatchDetails,
    formatCompactNameList,
    buildAggressionConflictDetails,
    buildSchoolingWarningDetails,
    getIssueCaseDisplayName,
  } = deps;

  const items: any[] = [];
  const seen = new Set();

  const getSuggestionPriorityScore = (severity: string, text: string) => {
    const normalized = String(text ?? '').toLowerCase();
    let score = severity === 'critical' ? 300 : 200;

    if (
      normalized.includes('konflikt') ||
      normalized.includes('agresj') ||
      normalized.includes('rozdziel') ||
      normalized.includes('aktywne problemy') ||
      normalized.includes('kryty')
    ) {
      score += 80;
    }

    if (
      normalized.includes('przerybienie') ||
      normalized.includes('zmniejsz obsade') ||
      normalized.includes('filtracj') ||
      normalized.includes('sprzet')
    ) {
      score += 50;
    }

    if (
      normalized.includes('uzupelnij') ||
      normalized.includes('dopasuj') ||
      normalized.includes('lekko')
    ) {
      score += 20;
    }

    return score;
  };

  const appendItem = (severity: string, text: string, details: string[] = []) => {
    const normalizedText = String(text ?? '').trim();
    if (!normalizedText) {
      return;
    }
    const key = normalizedText.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    items.push({
      id: key,
      severity: severity === 'critical' ? 'critical' : 'warning',
      text: normalizedText,
      details: Array.isArray(details)
        ? details
            .map((item) => String(item ?? '').trim())
            .filter(Boolean)
        : [],
      priority: getSuggestionPriorityScore(severity, normalizedText),
    });
  };

  if (hasEquipmentSaveAccess) {
    [equipmentAssessment.heater, equipmentAssessment.filter].forEach((entry: any) => {
      if (
        (entry.status === 'warning' || entry.status === 'critical') &&
        (entry.actions?.[0] || entry.details)
      ) {
        appendItem(
          entry.status,
          `Sprzet (${entry.title}) wymaga korekty.`,
          [
            entry.details,
            ...(Array.isArray(entry.actions) ? entry.actions.slice(0, 3) : []),
          ]
        );
      }
    });
  }

  if (
    trendSuggestedEnvironment.recommendedTempRange &&
    trendSuggestedEnvironment.currentTempValue === null
  ) {
    appendItem(
      'warning',
      `Dodaj aktualny pomiar temperatury i porownaj go z zakresem ${trendSuggestedEnvironment.recommendedTempRange.min}-${trendSuggestedEnvironment.recommendedTempRange.max} C.`
    );
  } else if (
    trendSuggestedEnvironment.recommendedTempRange &&
    trendSuggestedEnvironment.isTempWithinSuggested === false
  ) {
    appendItem(
      'critical',
      `Skoryguj temperature do ${trendSuggestedEnvironment.recommendedTempRange.min}-${trendSuggestedEnvironment.recommendedTempRange.max} C (aktualnie: ${trendSuggestedEnvironment.currentTempValue} C).`
    );
  }

  if (
    trendSuggestedEnvironment.recommendedLightRange &&
    trendSuggestedEnvironment.currentLightValue === null
  ) {
    appendItem(
      'warning',
      `Uzupelnij czas swiecenia lampy i porownaj go z zakresem ${trendSuggestedEnvironment.recommendedLightRange.min}-${trendSuggestedEnvironment.recommendedLightRange.max} h/dobe.`
    );
  } else if (
    trendSuggestedEnvironment.recommendedLightRange &&
    trendSuggestedEnvironment.isLightWithinSuggested === false
  ) {
    appendItem(
      'warning',
      `Skoryguj czas swiecenia do ${trendSuggestedEnvironment.recommendedLightRange.min}-${trendSuggestedEnvironment.recommendedLightRange.max} h/dobe (aktualnie: ${trendSuggestedEnvironment.currentLightValue} h).`
    );
  }

  const fishCompatibilitySummary = summarizeCompatibilityResults(fishCompatibilityResults);
  const fishMismatch = buildCompatibilityMismatchDetails(fishCompatibilityResults, {
    maxSpecies: 3,
    maxIssuesPerSpecies: 2,
  });
  const incompatibleFishCount = fishCompatibilitySummary.speciesWithIssues;
  const incompatibleFishMajorCount = fishCompatibilitySummary.speciesWithMajorIssues;
  const fishMismatchNames = formatCompactNameList(fishMismatch.names, 3);
  if (incompatibleFishCount > 0) {
    appendItem(
      incompatibleFishMajorCount >= 2 ? 'critical' : 'warning',
      fishMismatchNames
        ? `Niedopasowanie warunkow u ryb: ${fishMismatchNames}.`
        : `Wykryto niezgodnosci dla ryb (${incompatibleFishCount} gat.).`,
      [
        ...fishMismatch.details,
        `Mocniejsze odchylenia: ${incompatibleFishMajorCount}.`,
        'Dzialanie: dopasuj obsade do parametrow i litrazu akwarium.',
      ]
    );
  }

  const aggressionDetails = buildAggressionConflictDetails(fishAggressionConflicts, 4);
  if (fishAggressionConflictsCount > 0) {
    appendItem(
      'critical',
      aggressionDetails.length > 0
        ? `Konflikty agresji: ${formatCompactNameList(aggressionDetails, 2)}.`
        : `Wykryto konflikty agresji miedzy rybami (${fishAggressionConflictsCount}).`,
      [
        ...aggressionDetails.map((pair) => `Konflikt: ${pair}.`),
        `Liczba konfliktow: ${fishAggressionConflictsCount}.`,
        'Dzialanie: rozdziel konfliktowe gatunki lub zmien obsade.',
      ]
    );
  }

  const schoolingDetails = buildSchoolingWarningDetails(fishSchoolingWarnings, 4);
  if (fishSchoolingWarningsCount > 0) {
    appendItem(
      'warning',
      schoolingDetails.length > 0
        ? `Za mala liczebnosc ryb stadnych: ${formatCompactNameList(
            fishSchoolingWarnings.map((item: any) => item?.label),
            3
          )}.`
        : `Za mala liczebnosc ryb stadnych (${fishSchoolingWarningsCount} gat.).`,
      [...schoolingDetails, 'Dzialanie: zwieksz liczebnosc ryb stadnych albo zmien gatunki.']
    );
  }

  if (fishStockingSummary.hasFish && !fishStockingSummary.hasTankLiters) {
    appendItem('warning', 'Uzupelnij litraz akwarium, aby poprawnie oceniac przerybienie.');
  } else if (
    fishStockingSummary.hasFish &&
    fishStockingSummary.hasTankLiters &&
    fishStockingSummary.ratio > 1.2
  ) {
    appendItem(
      'critical',
      `Zmniejsz obsade lub zwieksz litraz: przerybienie na poziomie ${Math.round(
        fishStockingSummary.ratio * 100
      )}%.`
    );
  } else if (fishStockingSummary.isOverstocked) {
    appendItem(
      'warning',
      `Obsada jest lekko za duza (${Math.round(
        fishStockingSummary.ratio * 100
      )}%). Warto odciazyc zbiornik.`
    );
  }

  const plantCompatibilitySummary = summarizeCompatibilityResults(plantCompatibilityResults);
  const plantMismatch = buildCompatibilityMismatchDetails(plantCompatibilityResults, {
    maxSpecies: 3,
    maxIssuesPerSpecies: 2,
  });
  const incompatiblePlantCount = plantCompatibilitySummary.speciesWithIssues;
  const incompatiblePlantMajorCount = plantCompatibilitySummary.speciesWithMajorIssues;
  const plantMismatchNames = formatCompactNameList(plantMismatch.names, 3);
  if (incompatiblePlantCount > 0) {
    appendItem(
      incompatiblePlantMajorCount >= 2 ? 'critical' : 'warning',
      plantMismatchNames
        ? `Niedopasowanie warunkow u roslin: ${plantMismatchNames}.`
        : `Wykryto niezgodnosci dla roslin (${incompatiblePlantCount} gat.).`,
      [
        ...plantMismatch.details,
        `Mocniejsze odchylenia: ${incompatiblePlantMajorCount}.`,
        'Dzialanie: dopasuj gatunki do pH, GH/KH, oswietlenia i temperatury.',
      ]
    );
  }

  const activeIssueCasesCount =
    activeDiseaseCasesCount + activePlantDiseaseCasesCount + activeAlgaeCasesCount;
  const activeIssueNames = formatCompactNameList(
    [
      ...activeDiseaseCases.map((item: any) => getIssueCaseDisplayName(item)),
      ...activePlantDiseaseCases.map((item: any) => getIssueCaseDisplayName(item)),
      ...activeAlgaeCases.map((item: any) => getIssueCaseDisplayName(item)),
    ],
    4
  );
  if (activeIssueCasesCount > 0) {
    appendItem(
      activeIssueCasesCount > 1 ? 'critical' : 'warning',
      activeIssueNames
        ? `Aktywne problemy: ${activeIssueNames}.`
        : `Masz aktywne problemy zdrowotne/glony (${activeIssueCasesCount}).`,
      [
        `Choroby ryb: ${activeDiseaseCasesCount}.`,
        `Choroby roslin: ${activePlantDiseaseCasesCount}.`,
        `Glony: ${activeAlgaeCasesCount}.`,
        'Dzialanie: realizuj plan leczenia i harmonogram dla aktywnych problemow.',
      ]
    );
  }

  if (items.length === 0 && selectedTankHealthAssessment?.score < 85) {
    (selectedTankHealthAssessment.penalties ?? [])
      .slice(0, 2)
      .forEach((penalty: any) =>
        appendItem(penalty.points >= 12 ? 'critical' : 'warning', penalty.text)
      );
  }

  return items
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, 6);
}

export function buildHomeSectionCounts(
  {
    tank,
    measurement,
    stockItems = [],
    issueCases = [],
    enabledTests = {},
    equipmentCatalog = [],
  }: any,
  deps: {
    buildTankEnvironmentProfile: (tank: any) => any;
    buildTankEquipmentAssessment: (tank: any, catalog: any[]) => any;
    checkFishCompatibility: (item: any, measurement: any, tankLiters: number, tankProfile: any) => any[];
    summarizeCompatibilityResults: (results: any[]) => any;
    resolveFishSchoolingProfile: (item: any) => any;
    getFishQuantity: (item: any) => number;
    evaluateStockingCompatibility: (tank: any, stockItems: any[], measurement: any) => any;
    checkPlantCompatibility: (
      item: any,
      measurement: any,
      tankLiters: number,
      tankProfile: any,
      options: any
    ) => any[];
    buildFishStockingSummary: (items: any[], tankLiters: number) => any;
    buildContextualEcosystemInsights: (options: any) => any;
    getWaterAnalysisOptionsForTank: (tank: any) => any;
    analyzeMeasurementLogic: (measurement: any, enabledTests: any, options: any) => any;
    mergeWaterAnalysisWithContext: (baseAnalysis: any, contextInsights: any) => any;
    buildRecommendedRange: (minValues: any[], maxValues: any[]) => any;
    getPlantLightRequirements: (item: any) => any;
    roundToOneDecimal: (value: number) => number;
  }
) {
  const {
    buildTankEnvironmentProfile,
    buildTankEquipmentAssessment,
    checkFishCompatibility,
    summarizeCompatibilityResults,
    resolveFishSchoolingProfile,
    getFishQuantity,
    evaluateStockingCompatibility,
    checkPlantCompatibility,
    buildFishStockingSummary,
    buildContextualEcosystemInsights,
    getWaterAnalysisOptionsForTank,
    analyzeMeasurementLogic,
    mergeWaterAnalysisWithContext,
    buildRecommendedRange,
    getPlantLightRequirements,
    roundToOneDecimal,
  } = deps;

  if (!tank) {
    return {
      planCount: 0,
      attentionCount: 0,
    };
  }

  const tankLiters = Number(tank?.liters);
  const tankProfile = buildTankEnvironmentProfile(tank);
  const equipmentAssessment = buildTankEquipmentAssessment(tank, equipmentCatalog);
  const fishItems = stockItems.filter((item: any) => item.type === 'fish');
  const plantItems = stockItems.filter((item: any) => item.type === 'plant');
  const activeDiseaseCases = issueCases.filter(
    (item: any) => String(item.caseType ?? 'disease').toLowerCase() === 'disease'
  );
  const activePlantDiseaseCases = issueCases.filter(
    (item: any) => String(item.caseType ?? '').toLowerCase() === 'plant_disease'
  );
  const activeAlgaeCases = issueCases.filter(
    (item: any) => String(item.caseType ?? '').toLowerCase() === 'algae'
  );

  const fishCompatibilityResults = fishItems.map((item: any) => ({
    id: item.id,
    label: `${item.commonName ?? item.name ?? item.latinName ?? 'Ryba'} (${item.latinName ?? 'brak nazwy lacinskiej'})`,
    issues: checkFishCompatibility(item, measurement, tankLiters, tankProfile),
  }));
  const fishCompatibilitySummary = summarizeCompatibilityResults(fishCompatibilityResults);
  const incompatibleFishCount = fishCompatibilitySummary.speciesWithIssues;

  const fishSchoolingWarnings = fishItems
    .map((item: any) => {
      const schoolingProfile = resolveFishSchoolingProfile(item);
      const quantity = getFishQuantity(item);

      if (!schoolingProfile.isSchooling || quantity >= schoolingProfile.minGroupSize) {
        return null;
      }

      return {
        id: item.id,
        label: `${item.commonName ?? item.name ?? item.latinName ?? 'Ryba'} (${item.latinName ?? 'brak nazwy lacinskiej'})`,
        quantity,
        minGroupSize: schoolingProfile.minGroupSize,
      };
    })
    .filter(Boolean);
  const fishSchoolingWarningsCount = fishSchoolingWarnings.length;

  const stockingCompatibility = evaluateStockingCompatibility(tank, stockItems, measurement);
  const fishAggressionConflicts = (stockingCompatibility?.conflicts ?? [])
    .filter((item: any) =>
      ['aggression', 'territoriality', 'predation', 'finNipping'].includes(
        String(item?.category ?? '')
      )
    )
    .map((item: any, index: number) => ({
      id: String(item?.id ?? `home-conflict-${index}`),
      firstFish: item?.firstFish,
      secondFish: item?.secondFish,
      label: item?.severity === 'critical' ? 'niezgodne' : 'ryzykowne',
      reasons: [String(item?.message ?? '').trim()].filter(Boolean),
    }))
    .filter((item: any) => item?.firstFish && item?.secondFish);
  const fishAggressionConflictsCount = fishAggressionConflicts.length;

  const plantCompatibilityResults = plantItems.map((item: any) => ({
    id: item.id,
    label: `${item.commonName ?? item.name ?? item.latinName ?? 'Roslina'} (${item.latinName ?? 'brak nazwy lacinskiej'})`,
    issues: checkPlantCompatibility(item, measurement, tankLiters, tankProfile, {
      fishItems,
    }),
  }));
  const plantCompatibilitySummary = summarizeCompatibilityResults(plantCompatibilityResults);
  const incompatiblePlantCount = plantCompatibilitySummary.speciesWithIssues;

  const fishStockingSummary = buildFishStockingSummary(stockItems, tankLiters);
  const activeIssueCasesCount = issueCases.length;

  const contextInsights = buildContextualEcosystemInsights({
    measurement,
    enabledTests,
    stockItems,
    tank,
    equipmentAssessment,
    targetRanges: getWaterAnalysisOptionsForTank(tank)?.targetRanges,
  });
  const baseAnalysis = measurement
    ? analyzeMeasurementLogic(measurement, enabledTests, getWaterAnalysisOptionsForTank(tank))
    : null;
  const analysis = mergeWaterAnalysisWithContext(baseAnalysis, contextInsights);
  const trendSuggestedEnvironment = buildTrendSuggestedEnvironmentForTank(
    {
      fishItems,
      plantItems,
      activeDiseaseCases,
      activePlantDiseaseCases,
      activeAlgaeCases,
      measurement,
      tankProfile,
    },
    {
      buildRecommendedRange,
      getPlantLightRequirements,
      roundToOneDecimal,
    }
  );

  const attentionKeys = new Set();
  const addAttention = (key: string, condition: boolean) => {
    if (condition) {
      attentionKeys.add(key);
    }
  };

  addAttention(
    'equipment-heater',
    (equipmentAssessment.heater.status === 'warning' ||
      equipmentAssessment.heater.status === 'critical') &&
      (equipmentAssessment.heater.actions?.[0] || equipmentAssessment.heater.details)
  );
  addAttention(
    'equipment-filter',
    (equipmentAssessment.filter.status === 'warning' ||
      equipmentAssessment.filter.status === 'critical') &&
      (equipmentAssessment.filter.actions?.[0] || equipmentAssessment.filter.details)
  );
  addAttention(
    'temp',
    Boolean(
      trendSuggestedEnvironment.recommendedTempRange &&
        (trendSuggestedEnvironment.currentTempValue === null ||
          trendSuggestedEnvironment.isTempWithinSuggested === false)
    )
  );
  addAttention(
    'light',
    Boolean(
      trendSuggestedEnvironment.recommendedLightRange &&
        (trendSuggestedEnvironment.currentLightValue === null ||
          trendSuggestedEnvironment.isLightWithinSuggested === false)
    )
  );
  addAttention('fish-compat', incompatibleFishCount > 0);
  addAttention(
    'fish-aggression',
    fishAggressionConflictsCount > 0 ||
      ['high_risk', 'incompatible'].includes(String(stockingCompatibility?.overallStatus ?? ''))
  );
  addAttention('fish-schooling', fishSchoolingWarningsCount > 0);
  addAttention(
    'stocking',
    fishStockingSummary.hasFish &&
      ((!fishStockingSummary.hasTankLiters && fishStockingSummary.hasFish) ||
        fishStockingSummary.ratio > 1.2 ||
        fishStockingSummary.isOverstocked)
  );
  addAttention('plant-compat', incompatiblePlantCount > 0);
  addAttention('issues', activeIssueCasesCount > 0);

  const planKeys = new Set();
  const addPlan = (key: string, condition = true) => {
    if (condition) {
      planKeys.add(key);
    }
  };

  (analysis?.recommendations ?? [])
    .slice(0, 3)
    .forEach((item: any, index: number) => {
      addPlan(`param-${item.parameter ?? index}`);
    });
  addPlan(
    'temp-fix',
    Boolean(
      trendSuggestedEnvironment.recommendedTempRange &&
        trendSuggestedEnvironment.isTempWithinSuggested === false
    )
  );
  addPlan(
    'light-fix',
    Boolean(
      trendSuggestedEnvironment.recommendedLightRange &&
        trendSuggestedEnvironment.isLightWithinSuggested === false
    )
  );
  addPlan(
    'equipment-heater',
    equipmentAssessment.heater.status === 'warning' ||
      equipmentAssessment.heater.status === 'critical'
  );
  addPlan(
    'equipment-filter',
    equipmentAssessment.filter.status === 'warning' ||
      equipmentAssessment.filter.status === 'critical'
  );
  addPlan('fish-aggression', fishAggressionConflictsCount > 0);
  addPlan('fish-compat', incompatibleFishCount > 0);
  addPlan('fish-schooling', fishSchoolingWarningsCount > 0);
  addPlan(
    'stocking',
    fishStockingSummary.hasFish &&
      fishStockingSummary.hasTankLiters &&
      (fishStockingSummary.ratio > 1.2 || fishStockingSummary.isOverstocked)
  );
  addPlan(
    'fish-dynamic-compatibility',
    ['caution', 'high_risk', 'incompatible'].includes(
      String(stockingCompatibility?.overallStatus ?? '')
    )
  );
  addPlan('plant-compat', incompatiblePlantCount > 0);
  addPlan('issues', activeIssueCasesCount > 0);
  [...activeDiseaseCases, ...activeAlgaeCases]
    .slice(0, 3)
    .forEach((item: any, index: number) => {
      addPlan(`therapy-${item.issueId ?? item.id ?? index}`);
    });

  return {
    planCount: Math.min(planKeys.size, 6),
    attentionCount: Math.min(attentionKeys.size, 6),
  };
}
