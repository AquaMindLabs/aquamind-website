type UseSectionVisibilityParams = {
  activeSection: string;
  sectionEntrySource?: string;
};

export function useSectionVisibility({
  activeSection,
  sectionEntrySource,
}: UseSectionVisibilityParams) {
  const isHomeSection = activeSection === 'home';
  const isReviewSection = activeSection === 'review';
  const isHistorySection = activeSection === 'history';
  const isTankSection = activeSection === 'tank';
  const isTankInfoSection = activeSection === 'tankInfo';
  const isEquipmentSection = activeSection === 'equipment';
  const isFishSection = activeSection === 'fish';
  const isPlantSection = activeSection === 'plant';
  const isIssuesSection = activeSection === 'issues';
  const isDiseaseSection = activeSection === 'disease';
  const isPlantDiseaseSection = activeSection === 'plantDisease';
  const isAlgaeSection = activeSection === 'algae';
  const isSettingsSection = activeSection === 'settings';

  const isAquariumSection =
    isReviewSection ||
    isTankInfoSection ||
    isEquipmentSection ||
    isFishSection ||
    isPlantSection;
  const isHealthSection =
    isIssuesSection || isDiseaseSection || isPlantDiseaseSection || isAlgaeSection;
  const isFishCatalogMenuMode = isFishSection && sectionEntrySource === 'menu';
  const isPlantCatalogMenuMode = isPlantSection && sectionEntrySource === 'menu';
  const isHealthCatalogMode = isHealthSection && sectionEntrySource === 'menu';
  const isHealthTankMode = isHealthSection && !isHealthCatalogMode;

  return {
    isHomeSection,
    isReviewSection,
    isHistorySection,
    isTankSection,
    isTankInfoSection,
    isEquipmentSection,
    isFishSection,
    isPlantSection,
    isIssuesSection,
    isDiseaseSection,
    isPlantDiseaseSection,
    isAlgaeSection,
    isSettingsSection,
    isAquariumSection,
    isHealthSection,
    isFishCatalogMenuMode,
    isPlantCatalogMenuMode,
    isHealthCatalogMode,
    isHealthTankMode,
  };
}
