import { useEffect, useMemo } from 'react';

import { buildStockingCompatibilitySections } from '@/features/aquarium/sections/FishSectionHelpers';

type UseFishPlantSectionInsightsParams = {
  isEditingFish: boolean;
  selectedCatalogFishId: string | null;
  filteredFishCatalog: any[];
  setSelectedCatalogFishId: (value: string | null) => void;
  isEditingPlant: boolean;
  selectedCatalogPlantIds: string[];
  plantCatalog: any[];
  setSelectedCatalogPlantIds: (value: string[]) => void;
  fishCatalogById: Map<string, any>;
  fishCatalogByLatinName: Map<string, any>;
  stockItems: any[];
  selectedTank: any;
  currentMeasurement: any;
  currentMeasurementDisplay: any;
  selectedTankLiters: number;
  selectedTankEnvironmentProfile: any;
  t: (key: string, params?: Record<string, any>) => string;
  normalizeLatinCatalogKey: (value: unknown) => string;
  checkFishCompatibility: (
    item: any,
    measurement: any,
    tankLiters: number,
    tankProfile: any
  ) => any[];
  resolveFishSchoolingProfile: (item: any) => any;
  getFishQuantity: (item: any) => number;
  evaluateStockingCompatibility: (tank: any, stockItems: any[], measurement: any) => any;
  getFishAggressionConflict: (firstFish: any, secondFish: any, tankLiters: number) => any;
  checkPlantCompatibility: (
    item: any,
    measurement: any,
    tankLiters: number,
    tankProfile: any,
    options: any
  ) => any[];
  summarizeCompatibilityResults: (results: any[]) => any;
  isWaterParameterIssueText: (text: string) => boolean;
  evaluatePlantLightingForTank: (item: any, tankProfile: any) => any;
  buildFishStockingSummary: (items: any[], tankLiters: number) => any;
};

export function useFishPlantSectionInsights({
  isEditingFish,
  selectedCatalogFishId,
  filteredFishCatalog,
  setSelectedCatalogFishId,
  isEditingPlant,
  selectedCatalogPlantIds,
  plantCatalog,
  setSelectedCatalogPlantIds,
  fishCatalogById,
  fishCatalogByLatinName,
  stockItems,
  selectedTank,
  currentMeasurement,
  currentMeasurementDisplay,
  selectedTankLiters,
  selectedTankEnvironmentProfile,
  t,
  normalizeLatinCatalogKey,
  checkFishCompatibility,
  resolveFishSchoolingProfile,
  getFishQuantity,
  evaluateStockingCompatibility,
  getFishAggressionConflict,
  checkPlantCompatibility,
  summarizeCompatibilityResults,
  isWaterParameterIssueText,
  evaluatePlantLightingForTank,
  buildFishStockingSummary,
}: UseFishPlantSectionInsightsParams) {
  useEffect(() => {
    if (!isEditingFish || !selectedCatalogFishId) {
      return;
    }

    const selectedStillVisible = filteredFishCatalog.some(
      (item) => item.id === selectedCatalogFishId
    );

    if (!selectedStillVisible) {
      setSelectedCatalogFishId(null);
    }
  }, [
    filteredFishCatalog,
    isEditingFish,
    selectedCatalogFishId,
    setSelectedCatalogFishId,
  ]);

  useEffect(() => {
    if (!isEditingPlant || selectedCatalogPlantIds.length === 0) {
      return;
    }

    const availableIds = new Set(plantCatalog.map((item) => item.id));
    const nextSelectedIds = selectedCatalogPlantIds.filter((plantId) =>
      availableIds.has(plantId)
    );

    if (nextSelectedIds.length !== selectedCatalogPlantIds.length) {
      setSelectedCatalogPlantIds(nextSelectedIds);
    }
  }, [
    isEditingPlant,
    plantCatalog,
    selectedCatalogPlantIds,
    setSelectedCatalogPlantIds,
  ]);

  const fishCompatibilityResults = useMemo(
    () =>
      stockItems
        .filter((item) => item.type === 'fish')
        .map((item) => {
          const issues = checkFishCompatibility(
            item,
            currentMeasurement,
            selectedTankLiters,
            selectedTankEnvironmentProfile
          );

          return {
            id: item.id,
            label: `${item.commonName ?? item.name} (${item.latinName ?? t('noDataCaps')})`,
            issues,
          };
        }),
    [
      checkFishCompatibility,
      currentMeasurement,
      selectedTankEnvironmentProfile,
      selectedTankLiters,
      stockItems,
      t,
    ]
  );

  const fishSchoolingWarnings = useMemo(
    () =>
      stockItems
        .filter((item) => item.type === 'fish')
        .map((item) => {
          const catalogEntry =
            (item.catalogFishId && fishCatalogById.get(item.catalogFishId)) ||
            fishCatalogByLatinName.get(normalizeLatinCatalogKey(item.latinName));
          const schoolingProfile = resolveFishSchoolingProfile({
            ...(catalogEntry ?? {}),
            ...item,
          });
          const quantity = getFishQuantity(item);

          if (
            !schoolingProfile.isSchooling ||
            quantity >= schoolingProfile.minGroupSize
          ) {
            return null;
          }

          return {
            id: item.id,
            label: `${item.commonName ?? item.name} (${item.latinName ?? t('noDataCaps')})`,
            quantity,
            minGroupSize: schoolingProfile.minGroupSize,
          };
        })
        .filter(Boolean),
    [
      fishCatalogById,
      fishCatalogByLatinName,
      getFishQuantity,
      normalizeLatinCatalogKey,
      resolveFishSchoolingProfile,
      stockItems,
      t,
    ]
  );

  const stockingCompatibility = useMemo(
    () => evaluateStockingCompatibility(selectedTank ?? {}, stockItems, currentMeasurement),
    [currentMeasurement, evaluateStockingCompatibility, selectedTank, stockItems]
  );

  const fishAggressionConflicts = useMemo(() => {
    const dynamicConflicts = (stockingCompatibility?.conflicts ?? [])
      .filter((item: any) =>
        ['aggression', 'territoriality', 'predation', 'finNipping'].includes(
          String(item?.category ?? '')
        )
      )
      .map((item: any, index: number) => ({
        id: String(item?.id ?? `stocking-conflict-${index}`),
        firstFish: item?.firstFish ?? null,
        secondFish: item?.secondFish ?? null,
        score: item?.severity === 'critical' ? 28 : 52,
        level: item?.severity === 'critical' ? 'incompatible' : 'risky',
        label: item?.severity === 'critical' ? 'niezgodne' : 'ryzykowne',
        reasons: [String(item?.message ?? '').trim()].filter(Boolean),
        category: item?.category ?? 'aggression',
      }))
      .filter((entry: any) => entry?.firstFish && entry?.secondFish);

    if (dynamicConflicts.length > 0) {
      return dynamicConflicts;
    }

    const fishItems = stockItems.filter((item) => item.type === 'fish');
    const fallbackConflicts = [];
    for (let index = 0; index < fishItems.length; index += 1) {
      const currentFish = fishItems[index];
      for (
        let compareIndex = index + 1;
        compareIndex < fishItems.length;
        compareIndex += 1
      ) {
        const comparedFish = fishItems[compareIndex];
        const conflict = getFishAggressionConflict(
          currentFish,
          comparedFish,
          selectedTankLiters
        );
        if (conflict) {
          fallbackConflicts.push({
            id: `${currentFish.id}-${comparedFish.id}`,
            firstFish: currentFish,
            secondFish: comparedFish,
            ...conflict,
          });
        }
      }
    }
    return fallbackConflicts;
  }, [getFishAggressionConflict, selectedTankLiters, stockItems, stockingCompatibility]);

  const fishIssueDetails = useMemo(
    () => [
      ...(stockingCompatibility?.warnings ?? []).map(
        (item: string) => `Ocena obsady: ${item}`
      ),
      ...fishCompatibilityResults.flatMap((item) =>
        item.issues.map((issue: string) => `${item.label}: ${issue}`)
      ),
      ...fishSchoolingWarnings.map(
        (item: any) =>
          `${item.label}: ${t('schoolingFishSummaryWarning', {
            min: item.minGroupSize,
            current: item.quantity,
          })}`
      ),
      ...fishAggressionConflicts.map((item: any) =>
        [
          t('fishAggressionPairWarning', {
            first:
              item.firstFish.commonName ??
              item.firstFish.name ??
              item.firstFish.latinName,
            second:
              item.secondFish.commonName ??
              item.secondFish.name ??
              item.secondFish.latinName,
          }),
          item.label ? `Ocena: ${item.label}.` : null,
          Array.isArray(item.reasons) && item.reasons.length > 0
            ? `Powody: ${item.reasons.slice(0, 2).join(' ')}`
            : null,
        ]
          .filter(Boolean)
          .join(' ')
      ),
    ],
    [
      fishAggressionConflicts,
      fishCompatibilityResults,
      fishSchoolingWarnings,
      stockingCompatibility,
      t,
    ]
  );
  const hasFishCompatibilityIssues = fishIssueDetails.length > 0;

  const fishWarningsByItemId = useMemo(() => {
    const warningsMap = new Map();
    const appendWarning = (fishId: string, text: string, severity = 'warning') => {
      if (!fishId || !text) {
        return;
      }

      const current = warningsMap.get(fishId) ?? [];
      current.push({
        text,
        severity,
      });
      warningsMap.set(fishId, current);
    };

    fishCompatibilityResults.forEach((item) => {
      item.issues.forEach((issueText: string) =>
        appendWarning(item.id, issueText, 'warning')
      );
    });

    fishSchoolingWarnings.forEach((item: any) => {
      appendWarning(
        item.id,
        t('schoolingFishSummaryWarning', {
          min: item.minGroupSize,
          current: item.quantity,
        }),
        'warning'
      );
    });

    fishAggressionConflicts.forEach((item: any) => {
      const text = [
        t('fishAggressionPairWarning', {
          first:
            item.firstFish.commonName ??
            item.firstFish.name ??
            item.firstFish.latinName,
          second:
            item.secondFish.commonName ??
            item.secondFish.name ??
            item.secondFish.latinName,
        }),
        item.label ? `Ocena: ${item.label}.` : null,
        Array.isArray(item.reasons) && item.reasons.length > 0
          ? `Powody: ${item.reasons.slice(0, 2).join(' ')}`
          : null,
      ]
        .filter(Boolean)
        .join(' ');
      appendWarning(item.firstFish.id, text, 'critical');
      appendWarning(item.secondFish.id, text, 'critical');
    });

    return warningsMap;
  }, [fishAggressionConflicts, fishCompatibilityResults, fishSchoolingWarnings, t]);

  const plantCompatibilityResults = useMemo(() => {
    const selectedTankFishItems = stockItems.filter((entry) => entry.type === 'fish');
    return stockItems
      .filter((item) => item.type === 'plant')
      .map((item) => {
        const issues = checkPlantCompatibility(
          item,
          currentMeasurementDisplay,
          selectedTankLiters,
          selectedTankEnvironmentProfile,
          { fishItems: selectedTankFishItems }
        );

        return {
          id: item.id,
          label: `${item.commonName ?? item.name} (${item.latinName ?? t('noDataCaps')})`,
          issues,
        };
      });
  }, [
    checkPlantCompatibility,
    currentMeasurementDisplay,
    selectedTankEnvironmentProfile,
    selectedTankLiters,
    stockItems,
    t,
  ]);

  const plantCompatibilitySummary = useMemo(
    () => summarizeCompatibilityResults(plantCompatibilityResults),
    [plantCompatibilityResults, summarizeCompatibilityResults]
  );
  const incompatiblePlantCount = plantCompatibilitySummary.speciesWithIssues;
  const incompatiblePlantMajorCount = plantCompatibilitySummary.speciesWithMajorIssues;

  const plantWarningsByItemId = useMemo(() => {
    const warningsMap = new Map();

    plantCompatibilityResults.forEach((item) => {
      if (!item.id || !Array.isArray(item.issues) || item.issues.length === 0) {
        return;
      }

      const visibleIssues = item.issues.filter(
        (issueText: string) => !isWaterParameterIssueText(issueText)
      );
      if (visibleIssues.length === 0) {
        return;
      }

      warningsMap.set(
        item.id,
        visibleIssues.map((issueText: string) => ({
          text: issueText,
          severity: 'warning',
        }))
      );
    });

    return warningsMap;
  }, [isWaterParameterIssueText, plantCompatibilityResults]);

  const plantLightingStatusByItemId = useMemo(() => {
    const statusMap = new Map();
    (stockItems ?? [])
      .filter((item) => item?.type === 'plant')
      .forEach((item) => {
        statusMap.set(
          item.id,
          evaluatePlantLightingForTank(item, selectedTankEnvironmentProfile)
        );
      });

    return statusMap;
  }, [evaluatePlantLightingForTank, selectedTankEnvironmentProfile, stockItems]);

  const fishStockingSummary = useMemo(
    () => buildFishStockingSummary(stockItems, selectedTankLiters),
    [buildFishStockingSummary, selectedTankLiters, stockItems]
  );

  const stockingCompatibilitySections = useMemo(
    () => buildStockingCompatibilitySections(stockingCompatibility),
    [stockingCompatibility]
  );

  return {
    fishCompatibilityResults,
    fishSchoolingWarnings,
    stockingCompatibility,
    fishAggressionConflicts,
    fishIssueDetails,
    hasFishCompatibilityIssues,
    fishWarningsByItemId,
    plantCompatibilityResults,
    plantCompatibilitySummary,
    incompatiblePlantCount,
    incompatiblePlantMajorCount,
    plantWarningsByItemId,
    plantLightingStatusByItemId,
    fishStockingSummary,
    stockingCompatibilitySections,
  };
}
