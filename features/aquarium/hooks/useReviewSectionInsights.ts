import { useMemo } from 'react';

import { buildHistoryIssueTimeline } from '@/features/aquarium/sections/HistorySectionHelpers';
import {
  buildAttentionItemsForTank,
  buildTrendSuggestedEnvironmentForTank,
} from '@/features/aquarium/sections/ReviewSectionHelpers';

type UseReviewSectionInsightsParams = {
  tankDiseaseCases: any[];
  tankDiseaseHistoryCases: any[];
  t: (key: string, params?: Record<string, any>) => string;
  getCreatedAtMs: (value: any) => number;
  formatDateOnly: (value: any) => string;
  fishInTank: any[];
  plantsInTank: any[];
  currentMeasurement: any;
  selectedTankEnvironmentProfile: any;
  selectedTank: any;
  stockItems: any[];
  equipmentCatalogForAnalysis: any[];
  hasGeneralRecommendationAccess: boolean;
  hasEquipmentAssessmentAccess: boolean;
  tankEquipmentAssessment: any;
  fishCompatibilityResults: any[];
  plantCompatibilityResults: any[];
  fishAggressionConflicts: any[];
  fishSchoolingWarnings: any[];
  fishStockingSummary: any;
  hasFishCompatibilityIssues: boolean;
  stockingCompatibility: any;
  incompatiblePlantCount: number;
  incompatiblePlantMajorCount: number;
  currentMeasurementDisplay: any;
  currentAnalysis: any;
  currentMeasurementValueSourceMsByKey: Map<string, number>;
  selectedTankTargetRanges: any;
  measurements: any[];
  isWaterParameterIssueText: (text: string) => boolean;
  getMeasurementNumericValue: (measurement: any, key: string) => number;
  buildAquariumHealthAssessment: (options: any) => any;
  currentMeasurementDetailRows: any[];
  currentMeasurementIssueSeverityByKey: Map<string, string>;
  historyLoading: boolean;
  buildRecommendedRange: (mins: any[], maxs: any[]) => any;
  getPlantLightRequirements: (item: any) => any;
  roundToOneDecimal: (value: number) => number;
  summarizeCompatibilityResults: (results: any[]) => any;
  buildCompatibilityMismatchDetails: (results: any[], options?: any) => any;
  formatCompactNameList: (items: any[], limit?: number) => string;
  buildAggressionConflictDetails: (conflicts?: any[], maxPairs?: number) => string[];
  buildSchoolingWarningDetails: (items?: any[], maxItems?: number) => string[];
  getIssueCaseDisplayName: (item: any) => string;
  diseaseSeverityPriority: Record<string, number>;
};

export function useReviewSectionInsights({
  tankDiseaseCases,
  tankDiseaseHistoryCases,
  t,
  getCreatedAtMs,
  formatDateOnly,
  fishInTank,
  plantsInTank,
  currentMeasurement,
  selectedTankEnvironmentProfile,
  selectedTank,
  stockItems,
  equipmentCatalogForAnalysis,
  hasGeneralRecommendationAccess,
  hasEquipmentAssessmentAccess,
  tankEquipmentAssessment,
  fishCompatibilityResults,
  plantCompatibilityResults,
  fishAggressionConflicts,
  fishSchoolingWarnings,
  fishStockingSummary,
  hasFishCompatibilityIssues,
  stockingCompatibility,
  incompatiblePlantCount,
  incompatiblePlantMajorCount,
  currentMeasurementDisplay,
  currentAnalysis,
  currentMeasurementValueSourceMsByKey,
  selectedTankTargetRanges,
  measurements,
  isWaterParameterIssueText,
  getMeasurementNumericValue,
  buildAquariumHealthAssessment,
  currentMeasurementDetailRows,
  currentMeasurementIssueSeverityByKey,
  historyLoading,
  buildRecommendedRange,
  getPlantLightRequirements,
  roundToOneDecimal,
  summarizeCompatibilityResults,
  buildCompatibilityMismatchDetails,
  formatCompactNameList,
  buildAggressionConflictDetails,
  buildSchoolingWarningDetails,
  getIssueCaseDisplayName,
  diseaseSeverityPriority,
}: UseReviewSectionInsightsParams) {
  const activeDiseaseCases = useMemo(
    () =>
      tankDiseaseCases.filter((item) => {
        const caseType = String(item.caseType ?? 'disease').toLowerCase();
        return caseType === 'disease' || !item.caseType;
      }),
    [tankDiseaseCases]
  );
  const activePlantDiseaseCases = useMemo(
    () =>
      tankDiseaseCases.filter(
        (item) => String(item.caseType ?? '').toLowerCase() === 'plant_disease'
      ),
    [tankDiseaseCases]
  );
  const activeAlgaeCases = useMemo(
    () =>
      tankDiseaseCases.filter(
        (item) => String(item.caseType ?? '').toLowerCase() === 'algae'
      ),
    [tankDiseaseCases]
  );

  const historyIssueTimeline = useMemo(
    () =>
      buildHistoryIssueTimeline(tankDiseaseHistoryCases, {
        t,
        getCreatedAtMs,
        formatDateOnly,
      }),
    [formatDateOnly, getCreatedAtMs, t, tankDiseaseHistoryCases]
  );

  const trendSuggestedEnvironment = useMemo(
    () =>
      buildTrendSuggestedEnvironmentForTank(
        {
          fishItems: fishInTank,
          plantItems: plantsInTank,
          activeDiseaseCases,
          activePlantDiseaseCases,
          activeAlgaeCases,
          measurement: currentMeasurement,
          tankProfile: selectedTankEnvironmentProfile,
        },
        {
          buildRecommendedRange,
          getPlantLightRequirements,
          roundToOneDecimal,
        }
      ),
    [
      activeAlgaeCases,
      activeDiseaseCases,
      activePlantDiseaseCases,
      buildRecommendedRange,
      currentMeasurement,
      fishInTank,
      getPlantLightRequirements,
      plantsInTank,
      roundToOneDecimal,
      selectedTankEnvironmentProfile,
    ]
  );

  const selectedTankHealthAssessment = useMemo(() => {
    if (!selectedTank) {
      return null;
    }

    const activeIssueCases = [
      ...activeDiseaseCases,
      ...activePlantDiseaseCases,
      ...activeAlgaeCases,
    ];

    return buildAquariumHealthAssessment({
      tank: selectedTank,
      measurement: currentMeasurement,
      stockItems,
      activeIssueCases,
      equipmentCatalog: equipmentCatalogForAnalysis,
    });
  }, [
    activeAlgaeCases,
    activeDiseaseCases,
    activePlantDiseaseCases,
    buildAquariumHealthAssessment,
    currentMeasurement,
    equipmentCatalogForAnalysis,
    selectedTank,
    stockItems,
  ]);

  const suggestionChangeItems = useMemo(() => {
    if (!selectedTank) {
      return [];
    }

    return buildAttentionItemsForTank(
      {
        hasGeneralRecommendationAccess,
        hasEquipmentAssessmentAccess,
        equipmentAssessment: tankEquipmentAssessment,
        trendSuggestedEnvironment,
        fishCompatibilityResults,
        plantCompatibilityResults,
        fishAggressionConflictsCount: fishAggressionConflicts.length,
        fishAggressionConflicts,
        fishSchoolingWarningsCount: fishSchoolingWarnings.length,
        fishSchoolingWarnings,
        fishStockingSummary,
        activeDiseaseCasesCount: activeDiseaseCases.length,
        activeDiseaseCases,
        activePlantDiseaseCasesCount: activePlantDiseaseCases.length,
        activePlantDiseaseCases,
        activeAlgaeCasesCount: activeAlgaeCases.length,
        activeAlgaeCases,
        selectedTankHealthAssessment,
        measurementAnalysis: currentAnalysis,
      },
      {
        summarizeCompatibilityResults,
        buildCompatibilityMismatchDetails,
        formatCompactNameList,
        buildAggressionConflictDetails,
        buildSchoolingWarningDetails,
        getIssueCaseDisplayName,
      }
    );
  }, [
    activeAlgaeCases,
    activeDiseaseCases,
    activePlantDiseaseCases,
    buildAggressionConflictDetails,
    buildCompatibilityMismatchDetails,
    buildSchoolingWarningDetails,
    fishAggressionConflicts,
    fishCompatibilityResults,
    fishSchoolingWarnings,
    fishStockingSummary,
    formatCompactNameList,
    getIssueCaseDisplayName,
    hasEquipmentAssessmentAccess,
    hasGeneralRecommendationAccess,
    plantCompatibilityResults,
    selectedTank,
    selectedTankHealthAssessment,
    summarizeCompatibilityResults,
    tankEquipmentAssessment,
    trendSuggestedEnvironment,
  ]);

  const parameterSuggestionItems = useMemo(
    () =>
      suggestionChangeItems.filter(
        (item) => String(item?.area ?? '').toLowerCase() === 'parametry'
      ),
    [suggestionChangeItems]
  );
  const fishSuggestionItems = useMemo(
    () =>
      suggestionChangeItems.filter(
        (item) => String(item?.area ?? '').toLowerCase() === 'ryby'
      ),
    [suggestionChangeItems]
  );
  const plantSuggestionItems = useMemo(
    () =>
      suggestionChangeItems.filter(
        (item) =>
          String(item?.area ?? '').toLowerCase() === 'rosliny' &&
          !isWaterParameterIssueText(item?.text)
      ),
    [isWaterParameterIssueText, suggestionChangeItems]
  );
  const equipmentSuggestionItems = useMemo(
    () =>
      suggestionChangeItems.filter(
        (item) => String(item?.area ?? '').toLowerCase() === 'sprzet'
      ),
    [suggestionChangeItems]
  );

  const hasPlantMeasurements = useMemo(
    () => Array.isArray(measurements) && measurements.length > 0,
    [measurements]
  );
  const plantCareTips = useMemo(() => {
    if (!selectedTank || plantsInTank.length === 0 || !hasPlantMeasurements) {
      return [];
    }

    const tips = [];
    const measurementForPlants = currentMeasurementDisplay ?? currentMeasurement ?? null;
    const getMeasuredValue = (key: string) => {
      if (!currentMeasurementValueSourceMsByKey.has(key)) {
        return null;
      }
      const value = Number(getMeasurementNumericValue(measurementForPlants, key));
      return Number.isFinite(value) ? value : null;
    };
    const getMinTarget = (key: string, fallbackValue: number) => {
      const fromTank = Number(selectedTankTargetRanges?.[key]?.min);
      return Number.isFinite(fromTank) ? fromTank : fallbackValue;
    };

    const lowNutrients = [];
    [
      { key: 'no3', label: 'NO3', min: getMinTarget('no3', 5), unit: 'mg/l' },
      { key: 'po4', label: 'PO4', min: getMinTarget('po4', 0.1), unit: 'mg/l' },
      { key: 'fe', label: 'Fe', min: getMinTarget('fe', 0.02), unit: 'mg/l' },
      { key: 'k', label: 'K', min: getMinTarget('k', 5), unit: 'mg/l' },
      { key: 'mg', label: 'Mg', min: getMinTarget('mg', 5), unit: 'mg/l' },
    ].forEach((item) => {
      const value = getMeasuredValue(item.key);
      if (value !== null && value < Number(item.min)) {
        lowNutrients.push(
          `${item.label}: ${Math.round(value * 100) / 100} ${item.unit} (cel min ${item.min} ${item.unit})`
        );
      }
    });

    if (lowNutrients.length > 0) {
      tips.push(
        'Mozliwy niedobor skladnikow odzywczych. Jak to zrobic: startuj od ok. 1/3 dawki producenta 2-3 razy w tygodniu, po 7 dniach ocen rosliny i glony, potem zwiekszaj dawke o 10-20% tygodniowo az do stabilnego wzrostu.'
      );
    }

    const co2 = getMeasuredValue('co2');
    const co2Min = getMinTarget('co2', 10);
    if (co2 !== null && co2 < co2Min) {
      tips.push(
        'CO2 jest za niskie dla stabilnego wzrostu roslin. Jak to zrobic: podnos podawanie bardzo stopniowo (ok. 10-15% co 2-3 dni), uruchamiaj CO2 1-2 h przed swiatlem i obserwuj ryby; przy oznakach dusznosci natychmiast zmniejsz dawke i zwieksz ruch tafli.'
      );
    }

    return tips;
  }, [
    currentMeasurement,
    currentMeasurementDisplay,
    currentAnalysis,
    currentMeasurementValueSourceMsByKey,
    getMeasurementNumericValue,
    hasPlantMeasurements,
    plantsInTank,
    selectedTank,
    selectedTankTargetRanges,
  ]);

  const currentParametersSectionSeverity = useMemo(() => {
    if (!selectedTank || historyLoading) {
      return 'none';
    }

    if (!currentMeasurement || currentMeasurementDetailRows.length === 0) {
      return 'none';
    }

    const severities = currentMeasurementDetailRows
      .map((item) => currentMeasurementIssueSeverityByKey.get(String(item.key ?? '')))
      .filter(Boolean);

    if (severities.includes('critical')) {
      return 'critical';
    }

    if (severities.includes('warning')) {
      return 'warning';
    }

    return 'none';
  }, [
    currentMeasurement,
    currentMeasurementDetailRows,
    currentMeasurementIssueSeverityByKey,
    historyLoading,
    selectedTank,
  ]);

  const fishTabSeverity = useMemo(() => {
    const fishItems = (Array.isArray(stockItems) ? stockItems : []).filter(
      (item) => item?.type === 'fish'
    );

    if (fishItems.length === 0) {
      return 'none';
    }

    if (
      fishAggressionConflicts.length > 0 ||
      ['high_risk', 'incompatible'].includes(
        String(stockingCompatibility?.overallStatus ?? '')
      ) ||
      (fishStockingSummary.hasFish &&
        fishStockingSummary.hasTankLiters &&
        fishStockingSummary.ratio > 1.2)
    ) {
      return 'critical';
    }

    if (
      hasFishCompatibilityIssues ||
      String(stockingCompatibility?.overallStatus ?? '') === 'caution' ||
      fishSchoolingWarnings.length > 0 ||
      fishStockingSummary.isOverstocked
    ) {
      return 'warning';
    }

    return 'none';
  }, [
    fishAggressionConflicts.length,
    fishCompatibilityResults,
    fishSchoolingWarnings.length,
    fishStockingSummary.hasFish,
    fishStockingSummary.hasTankLiters,
    fishStockingSummary.isOverstocked,
    fishStockingSummary.ratio,
    hasFishCompatibilityIssues,
    stockItems,
    stockingCompatibility?.overallStatus,
  ]);

  const plantTabSeverity = useMemo(() => {
    const plantItems = (Array.isArray(stockItems) ? stockItems : []).filter(
      (item) => item?.type === 'plant'
    );

    if (plantItems.length === 0) {
      return 'none';
    }

    if (incompatiblePlantMajorCount >= 2) {
      return 'critical';
    }

    if (incompatiblePlantCount > 0) {
      return 'warning';
    }

    return 'none';
  }, [incompatiblePlantCount, incompatiblePlantMajorCount, stockItems]);

  const issuesTabSeverity = useMemo(() => {
    const allIssueCases = [
      ...activeDiseaseCases,
      ...activePlantDiseaseCases,
      ...activeAlgaeCases,
    ];

    if (allIssueCases.length === 0) {
      return 'none';
    }

    const highestPriority = allIssueCases.reduce(
      (maxSeverity, caseItem) =>
        Math.max(
          maxSeverity,
          diseaseSeverityPriority[String(caseItem.severity ?? 'low').toLowerCase()] ?? 0
        ),
      0
    );

    return highestPriority >= diseaseSeverityPriority.high ? 'critical' : 'warning';
  }, [
    activeAlgaeCases,
    activeDiseaseCases,
    activePlantDiseaseCases,
    diseaseSeverityPriority,
  ]);

  return {
    activeDiseaseCases,
    activePlantDiseaseCases,
    activeAlgaeCases,
    historyIssueTimeline,
    trendSuggestedEnvironment,
    selectedTankHealthAssessment,
    suggestionChangeItems,
    parameterSuggestionItems,
    fishSuggestionItems,
    plantSuggestionItems,
    equipmentSuggestionItems,
    hasPlantMeasurements,
    plantCareTips,
    currentParametersSectionSeverity,
    fishTabSeverity,
    plantTabSeverity,
    issuesTabSeverity,
  };
}
