import { useState } from 'react';

type UseAquariumSectionStateParams = {
  rootTabsDefaultDurationDays: number;
};

export function useAquariumSectionState({
  rootTabsDefaultDurationDays,
}: UseAquariumSectionStateParams) {
  const [stockType, setStockType] = useState('fish');
  const [stockFishSearch, setStockFishSearch] = useState('');
  const [stockPlantSearch, setStockPlantSearch] = useState('');
  const [fishCatalogMenuSearch, setFishCatalogMenuSearch] = useState('');
  const [plantCatalogMenuSearch, setPlantCatalogMenuSearch] = useState('');
  const [expandedFishCatalogId, setExpandedFishCatalogId] = useState<string | null>(null);
  const [expandedPlantCatalogId, setExpandedPlantCatalogId] = useState<string | null>(null);
  const [fishQuantity, setFishQuantity] = useState('1');
  const [fishQuantityDrafts, setFishQuantityDrafts] = useState<Record<string, string>>({});
  const [plantQuantityDrafts, setPlantQuantityDrafts] = useState<Record<string, string>>({});
  const [selectedCatalogFishId, setSelectedCatalogFishId] = useState<string | null>(null);
  const [selectedCatalogPlantIds, setSelectedCatalogPlantIds] = useState<string[]>([]);
  const [stockBusy, setStockBusy] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [isEditingFish, setIsEditingFish] = useState(false);
  const [isEditingPlant, setIsEditingPlant] = useState(false);
  const [isPlantFertilizationExpanded, setIsPlantFertilizationExpanded] = useState(false);
  const [isPlantStockExpanded, setIsPlantStockExpanded] = useState(true);
  const [isPlantFertilizationAddFormVisible, setIsPlantFertilizationAddFormVisible] =
    useState(false);
  const [editingFishItemId, setEditingFishItemId] = useState<string | null>(null);
  const [editingPlantItemId, setEditingPlantItemId] = useState<string | null>(null);
  const [plantFertilizerName, setPlantFertilizerName] = useState('');
  const [plantFertilizerQuantityInput, setPlantFertilizerQuantityInput] = useState('1');
  const [plantFertilizerNote, setPlantFertilizerNote] = useState('');
  const [rootTabsDurationDaysInput, setRootTabsDurationDaysInput] = useState(
    String(rootTabsDefaultDurationDays)
  );
  const [editingPlantFertilizationEntryId, setEditingPlantFertilizationEntryId] =
    useState<string | null>(null);
  const [editingPlantFertilizerName, setEditingPlantFertilizerName] = useState('');
  const [editingPlantFertilizerQuantityInput, setEditingPlantFertilizerQuantityInput] =
    useState('1');
  const [editingRootTabsDurationDaysInput, setEditingRootTabsDurationDaysInput] = useState(
    String(rootTabsDefaultDurationDays)
  );
  const [editingPlantFertilizerNote, setEditingPlantFertilizerNote] = useState('');
  const [plantFertilizationBusy, setPlantFertilizationBusy] = useState(false);
  const [isEquipmentCatalogModalVisible, setIsEquipmentCatalogModalVisible] =
    useState(false);
  const [equipmentCatalogType, setEquipmentCatalogType] = useState('');
  const [equipmentCatalogSearch, setEquipmentCatalogSearch] = useState('');
  const [isCustomEquipmentFormVisible, setIsCustomEquipmentFormVisible] = useState(false);
  const [customEquipmentBrand, setCustomEquipmentBrand] = useState('');
  const [customEquipmentModel, setCustomEquipmentModel] = useState('');
  const [customFilterType, setCustomFilterType] = useState('internal');
  const [customEquipmentPrimaryValue, setCustomEquipmentPrimaryValue] = useState('');
  const [customEquipmentTankMinLiters, setCustomEquipmentTankMinLiters] = useState('');
  const [customEquipmentTankMaxLiters, setCustomEquipmentTankMaxLiters] = useState('');
  const [equipmentLightHoursDraft, setEquipmentLightHoursDraft] = useState('');
  const [equipmentSavingBusy, setEquipmentSavingBusy] = useState(false);
  const [selectedHistoryChartParameter, setSelectedHistoryChartParameter] =
    useState('no3');
  const [historySectionTab, setHistorySectionTab] = useState('parameters');
  const [historyChartWidth, setHistoryChartWidth] = useState(0);
  const [selectedMeasurementTileDetails, setSelectedMeasurementTileDetails] =
    useState<any>(null);
  const [isCurrentParametersExpanded, setIsCurrentParametersExpanded] = useState(true);
  const [isTankDiseasesExpanded, setIsTankDiseasesExpanded] = useState(true);
  const [isTankPlantDiseasesExpanded, setIsTankPlantDiseasesExpanded] =
    useState(true);
  const [isTankAlgaeExpanded, setIsTankAlgaeExpanded] = useState(true);
  const [expandedDiseaseCaseId, setExpandedDiseaseCaseId] = useState<string | null>(null);
  const [expandedPlantDiseaseCaseId, setExpandedPlantDiseaseCaseId] =
    useState<string | null>(null);
  const [expandedAlgaeCaseId, setExpandedAlgaeCaseId] = useState<string | null>(null);
  const [isWaterTestingExpanded, setIsWaterTestingExpanded] = useState(false);
  const [expandedStockingSectionKey, setExpandedStockingSectionKey] = useState('');
  const [maintenanceActionBusyId, setMaintenanceActionBusyId] = useState('');
  const [onboardingTaskBusy, setOnboardingTaskBusy] = useState(false);
  const [onboardingToggleBusy, setOnboardingToggleBusy] = useState(false);
  const [expandedHistoryIssueId, setExpandedHistoryIssueId] = useState<string | null>(null);
  const [historyIssueDeleteBusyId, setHistoryIssueDeleteBusyId] = useState<string | null>(
    null
  );

  return {
    stockType,
    setStockType,
    stockFishSearch,
    setStockFishSearch,
    stockPlantSearch,
    setStockPlantSearch,
    fishCatalogMenuSearch,
    setFishCatalogMenuSearch,
    plantCatalogMenuSearch,
    setPlantCatalogMenuSearch,
    expandedFishCatalogId,
    setExpandedFishCatalogId,
    expandedPlantCatalogId,
    setExpandedPlantCatalogId,
    fishQuantity,
    setFishQuantity,
    fishQuantityDrafts,
    setFishQuantityDrafts,
    plantQuantityDrafts,
    setPlantQuantityDrafts,
    selectedCatalogFishId,
    setSelectedCatalogFishId,
    selectedCatalogPlantIds,
    setSelectedCatalogPlantIds,
    stockBusy,
    setStockBusy,
    stockLoading,
    setStockLoading,
    stockItems,
    setStockItems,
    isEditingFish,
    setIsEditingFish,
    isEditingPlant,
    setIsEditingPlant,
    isPlantFertilizationExpanded,
    setIsPlantFertilizationExpanded,
    isPlantStockExpanded,
    setIsPlantStockExpanded,
    isPlantFertilizationAddFormVisible,
    setIsPlantFertilizationAddFormVisible,
    editingFishItemId,
    setEditingFishItemId,
    editingPlantItemId,
    setEditingPlantItemId,
    plantFertilizerName,
    setPlantFertilizerName,
    plantFertilizerQuantityInput,
    setPlantFertilizerQuantityInput,
    plantFertilizerNote,
    setPlantFertilizerNote,
    rootTabsDurationDaysInput,
    setRootTabsDurationDaysInput,
    editingPlantFertilizationEntryId,
    setEditingPlantFertilizationEntryId,
    editingPlantFertilizerName,
    setEditingPlantFertilizerName,
    editingPlantFertilizerQuantityInput,
    setEditingPlantFertilizerQuantityInput,
    editingRootTabsDurationDaysInput,
    setEditingRootTabsDurationDaysInput,
    editingPlantFertilizerNote,
    setEditingPlantFertilizerNote,
    plantFertilizationBusy,
    setPlantFertilizationBusy,
    isEquipmentCatalogModalVisible,
    setIsEquipmentCatalogModalVisible,
    equipmentCatalogType,
    setEquipmentCatalogType,
    equipmentCatalogSearch,
    setEquipmentCatalogSearch,
    isCustomEquipmentFormVisible,
    setIsCustomEquipmentFormVisible,
    customEquipmentBrand,
    setCustomEquipmentBrand,
    customEquipmentModel,
    setCustomEquipmentModel,
    customFilterType,
    setCustomFilterType,
    customEquipmentPrimaryValue,
    setCustomEquipmentPrimaryValue,
    customEquipmentTankMinLiters,
    setCustomEquipmentTankMinLiters,
    customEquipmentTankMaxLiters,
    setCustomEquipmentTankMaxLiters,
    equipmentLightHoursDraft,
    setEquipmentLightHoursDraft,
    equipmentSavingBusy,
    setEquipmentSavingBusy,
    selectedHistoryChartParameter,
    setSelectedHistoryChartParameter,
    historySectionTab,
    setHistorySectionTab,
    historyChartWidth,
    setHistoryChartWidth,
    selectedMeasurementTileDetails,
    setSelectedMeasurementTileDetails,
    isCurrentParametersExpanded,
    setIsCurrentParametersExpanded,
    isTankDiseasesExpanded,
    setIsTankDiseasesExpanded,
    isTankPlantDiseasesExpanded,
    setIsTankPlantDiseasesExpanded,
    isTankAlgaeExpanded,
    setIsTankAlgaeExpanded,
    expandedDiseaseCaseId,
    setExpandedDiseaseCaseId,
    expandedPlantDiseaseCaseId,
    setExpandedPlantDiseaseCaseId,
    expandedAlgaeCaseId,
    setExpandedAlgaeCaseId,
    isWaterTestingExpanded,
    setIsWaterTestingExpanded,
    expandedStockingSectionKey,
    setExpandedStockingSectionKey,
    maintenanceActionBusyId,
    setMaintenanceActionBusyId,
    onboardingTaskBusy,
    setOnboardingTaskBusy,
    onboardingToggleBusy,
    setOnboardingToggleBusy,
    expandedHistoryIssueId,
    setExpandedHistoryIssueId,
    historyIssueDeleteBusyId,
    setHistoryIssueDeleteBusyId,
  };
}

