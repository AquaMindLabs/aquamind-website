function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.min(max, Math.max(min, numeric));
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeLevel(value, allowed, fallback) {
  const normalized = normalizeText(value);
  return allowed.includes(normalized) ? normalized : fallback;
}

function estimatedLengthFromVolume(volumeLiters) {
  const volume = Math.max(20, Number(volumeLiters) || 60);
  if (volume < 50) return 45;
  if (volume < 90) return 60;
  if (volume < 150) return 80;
  if (volume < 240) return 100;
  if (volume < 360) return 120;
  if (volume < 520) return 150;
  return 180;
}

function estimatedWidthFromVolume(volumeLiters) {
  const length = estimatedLengthFromVolume(volumeLiters);
  if (length <= 45) return 28;
  if (length <= 60) return 30;
  if (length <= 80) return 35;
  if (length <= 100) return 40;
  if (length <= 120) return 45;
  if (length <= 150) return 50;
  return 60;
}

function normalizeActivityLevel(value) {
  if (typeof value === 'string') {
    const normalized = normalizeText(value);
    if (normalized === 'low') return 2;
    if (normalized === 'medium') return 3;
    if (normalized === 'high') return 4;
  }
  return clampNumber(Number(value), 1, 5);
}

function normalizeAggressionLevel(value) {
  if (typeof value === 'string') {
    const normalized = normalizeText(value);
    if (normalized === 'peaceful') return 1;
    if (normalized === 'semi_aggressive' || normalized === 'semi-aggressive') return 3;
    if (normalized === 'territorial') return 4;
    if (normalized === 'aggressive' || normalized === 'predatory') return 5;
  }
  return clampNumber(Number(value), 1, 5);
}

function normalizeTerritoriality(value, aggressionLevel = 1) {
  if (typeof value === 'string') {
    const normalized = normalizeText(value);
    if (normalized === 'none') return 1;
    if (normalized === 'low') return 2;
    if (normalized === 'medium') return 3;
    if (normalized === 'high') return 4;
    if (normalized === 'extreme') return 5;
  }
  const numeric = toFiniteNumber(value);
  if (numeric !== null) {
    return clampNumber(numeric, 1, 5);
  }
  return clampNumber(aggressionLevel <= 2 ? 1 : aggressionLevel - 1, 1, 5);
}

function normalizeBodyMassType(value) {
  return normalizeLevel(
    value,
    ['slender', 'normal', 'deep_body', 'heavy_body'],
    'normal'
  );
}

function normalizeSwimmingZone(value) {
  return normalizeLevel(value, ['top', 'middle', 'bottom', 'all'], 'middle');
}

function buildTankProfile(aquarium = {}) {
  const volumeLiters = Math.max(
    20,
    toFiniteNumber(aquarium?.volumeLiters ?? aquarium?.liters, 60)
  );
  const lengthCm = Math.max(
    30,
    toFiniteNumber(aquarium?.lengthCm, estimatedLengthFromVolume(volumeLiters))
  );
  const widthCm = Math.max(
    20,
    toFiniteNumber(aquarium?.widthCm, estimatedWidthFromVolume(volumeLiters))
  );
  const heightCm = Math.max(20, toFiniteNumber(aquarium?.heightCm, 35));
  const filtrationLevel = normalizeLevel(
    aquarium?.filtrationLevel,
    ['weak', 'standard', 'strong', 'very_strong'],
    'standard'
  );
  const plantDensity = normalizeLevel(
    aquarium?.plantDensity,
    ['none', 'low', 'medium', 'high'],
    'low'
  );
  const waterChangeFrequency = normalizeLevel(
    aquarium?.waterChangeFrequency,
    ['rare', 'standard', 'frequent'],
    'standard'
  );
  const openSwimmingSpace = normalizeLevel(
    aquarium?.openSwimmingSpace ?? aquarium?.zones?.openSwimmingSpace,
    ['low', 'medium', 'high'],
    'medium'
  );

  return {
    volumeLiters,
    lengthCm,
    widthCm,
    heightCm,
    filtrationLevel,
    plantDensity,
    waterChangeFrequency,
    openSwimmingSpace,
  };
}

function buildSpeciesProfile(entry = {}) {
  const profile = entry?.profile ?? entry ?? {};
  const quantity = Math.max(1, Math.round(toFiniteNumber(entry?.quantity, 1)));
  const adultSizeCm = Math.max(
    1,
    toFiniteNumber(profile?.adultSizeCm, 5)
  );
  const activityLevel = normalizeActivityLevel(
    profile?.activityLevel ?? profile?.activity
  );
  const aggressionLevel = normalizeAggressionLevel(
    profile?.aggressionLevel ?? profile?.aggressionLevelNumeric ?? profile?.temperament
  );
  const territoriality = normalizeTerritoriality(
    profile?.territoriality ??
      profile?.territorialityLevel ??
      profile?.territorialityScore,
    aggressionLevel
  );
  const isSchoolingFish = Boolean(
    profile?.isSchoolingFish ??
      profile?.isSchooling ??
      (String(profile?.socialType ?? '').toLowerCase() === 'school')
  );
  const minGroupSize = Math.max(
    1,
    Math.round(toFiniteNumber(profile?.minGroupSize, 1))
  );
  const recommendedGroupSize = Math.max(
    minGroupSize,
    Math.round(
      toFiniteNumber(
        profile?.recommendedGroupSize ?? profile?.minGroupSize,
        minGroupSize
      )
    )
  );
  const requiredTankLengthCm = Math.max(
    40,
    toFiniteNumber(
      profile?.requiredTankLengthCm ?? profile?.minTankLengthCm,
      60
    )
  );
  const wasteProductionRaw = toFiniteNumber(
    profile?.wasteProduction ?? profile?.wasteProductionLevel,
    3
  );
  const wasteProduction = clampNumber(Math.round(wasteProductionRaw), 1, 5);

  return {
    speciesId: String(entry?.speciesId ?? entry?.id ?? '').trim(),
    label: String(
      entry?.commonName ?? entry?.name ?? profile?.commonName ?? profile?.latinName ?? 'Gatunek'
    ).trim(),
    quantity,
    adultSizeCm,
    bodyMassType: normalizeBodyMassType(profile?.bodyMassType),
    wasteProduction,
    activityLevel: clampNumber(activityLevel, 1, 5),
    aggressionLevel: clampNumber(aggressionLevel, 1, 5),
    territoriality: clampNumber(territoriality, 1, 5),
    minGroupSize,
    recommendedGroupSize,
    isSchoolingFish,
    swimmingZone: normalizeSwimmingZone(profile?.swimmingZone ?? profile?.waterZone),
    requiredTankLengthCm,
    sensitiveToWaterQuality: Boolean(profile?.sensitiveToWaterQuality),
    bioloadModifier: Math.max(0.1, toFiniteNumber(profile?.bioloadModifier, 1)),
    spaceModifier: Math.max(0.1, toFiniteNumber(profile?.spaceModifier, 1)),
    behaviourModifier: Math.max(0.1, toFiniteNumber(profile?.behaviourModifier, 1)),
  };
}

const BODY_MASS_FACTORS = Object.freeze({
  slender: 0.75,
  normal: 1.0,
  deep_body: 1.3,
  heavy_body: 1.8,
});

const WASTE_FACTORS = Object.freeze({
  1: 0.8,
  2: 1.0,
  3: 1.3,
  4: 1.7,
  5: 2.3,
});

const FILTRATION_FACTORS = Object.freeze({
  weak: 0.75,
  standard: 1.0,
  strong: 1.2,
  very_strong: 1.35,
});

const PLANT_FACTORS = Object.freeze({
  none: 0.9,
  low: 1.0,
  medium: 1.1,
  high: 1.2,
});

const WATER_CHANGE_FACTORS = Object.freeze({
  rare: 0.85,
  standard: 1.0,
  frequent: 1.15,
});

const ACTIVITY_FACTORS = Object.freeze({
  1: 0.8,
  2: 1.0,
  3: 1.2,
  4: 1.5,
  5: 1.8,
});

const ZONE_FACTORS = Object.freeze({
  top: 1.2,
  middle: 1.1,
  bottom: 1.2,
  all: 1.0,
});

const AGGRESSION_FACTORS = Object.freeze({
  1: 0,
  2: 0.05,
  3: 0.15,
  4: 0.35,
  5: 0.6,
});

const TERRITORIAL_FACTORS = Object.freeze({
  1: 0,
  2: 0.1,
  3: 0.25,
  4: 0.5,
  5: 0.8,
});

function getSchoolingBonus(species) {
  if (!species?.isSchoolingFish) return 1.0;
  if (species.adultSizeCm <= 3) return 0.55;
  if (species.adultSizeCm <= 5) return 0.65;
  if (species.adultSizeCm <= 7) return 0.8;
  return 1.0;
}

function getLargeTankSchoolingBuffer(volumeLiters) {
  if (volumeLiters >= 300) return 0.85;
  if (volumeLiters >= 200) return 0.9;
  return 1.0;
}

function getLengthFactor(lengthCm) {
  if (lengthCm < 60) return 0.65;
  if (lengthCm < 80) return 0.8;
  if (lengthCm < 100) return 1.0;
  if (lengthCm < 120) return 1.15;
  if (lengthCm < 150) return 1.3;
  return 1.45;
}

function getLayoutFactor(openSwimmingSpace) {
  if (openSwimmingSpace === 'low') return 0.85;
  if (openSwimmingSpace === 'high') return 1.15;
  return 1.0;
}

function mapLoadToRisk(loadScore) {
  if (loadScore > 130) return 'critical';
  if (loadScore > 110) return 'high';
  if (loadScore > 80) return 'medium';
  return 'low';
}

function getStockingLoadStatus(finalStockingScore) {
  const score = Number(finalStockingScore);
  if (!Number.isFinite(score)) {
    return {
      status: 'safe',
      label: 'Bezpiecznie',
      message: 'Brak danych do pełnej oceny obciążenia obsady.',
    };
  }
  if (score <= 60) {
    return {
      status: 'safe',
      label: 'Bezpiecznie',
      message: 'Obsada lekka, duży zapas.',
    };
  }
  if (score <= 80) {
    return {
      status: 'good',
      label: 'Dobrze',
      message: 'Obsada sensowna.',
    };
  }
  if (score <= 95) {
    return {
      status: 'high',
      label: 'Wysoko',
      message: 'Blisko górnej granicy.',
    };
  }
  if (score <= 110) {
    return {
      status: 'borderline',
      label: 'Granicznie',
      message: 'Wymaga dobrej filtracji i regularnych podmian.',
    };
  }
  if (score <= 130) {
    return {
      status: 'overstocked',
      label: 'Przekroczone',
      message: 'Obsada niezalecana.',
    };
  }
  return {
    status: 'heavily_overstocked',
    label: 'Mocno przekroczone',
    message: 'Wysokie ryzyko problemów.',
  };
}

// Finalny wynik to najgorszy (najwyższy) wskaźnik obciążenia:
// max(bioloadScore, spaceScore, behaviourScore), nie średnia.
function evaluateUniversalStockingLoad(aquariumInput = {}, speciesInput = []) {
  const tank = buildTankProfile(aquariumInput);
  const speciesList = Array.isArray(speciesInput)
    ? speciesInput.filter(Boolean).map((entry) => buildSpeciesProfile(entry))
    : [];

  if (speciesList.length === 0) {
    const emptyStatus = getStockingLoadStatus(0);
    return {
      tank,
      speciesCount: 0,
      fishCount: 0,
      scores: {
        bioloadScore: 0,
        spaceScore: 0,
        behaviourScore: 0,
        zoneCrowdingScore: 0,
      },
      finalStockingScore: 0,
      finalStatus: emptyStatus,
      componentStatus: {
        bioload: getStockingLoadStatus(0),
        space: getStockingLoadStatus(0),
        behaviour: getStockingLoadStatus(0),
      },
      risks: {
        biologicalLoadRisk: 'low',
        spaceLoadRisk: 'low',
        behaviorLoadRisk: 'low',
      },
      warnings: ['Brak obsady ryb - obciążenie biologiczne, przestrzenne i behawioralne jest niskie.'],
      recommendations: ['Dodaj obsadę, aby uruchomić pełną ocenę.'],
      breakdown: {
        totalBioload: 0,
        tankBioloadCapacity: 0,
        totalSpaceLoad: 0,
        tankSpaceCapacity: 0,
        rawBehaviourPenalty: 0,
        zoneScores: { top: 0, middle: 0, bottom: 0 },
      },
    };
  }

  const warnings = [];
  const recommendations = [];
  const detailIssues = [];

  const totalBioload = speciesList.reduce((sum, species) => {
    const bodyMassFactor = BODY_MASS_FACTORS[species.bodyMassType] ?? 1.0;
    const wasteFactor = WASTE_FACTORS[species.wasteProduction] ?? 1.3;
    const fishBioload =
      species.adultSizeCm *
      bodyMassFactor *
      wasteFactor *
      species.quantity *
      species.bioloadModifier;
    return sum + fishBioload;
  }, 0);
  const tankBioloadCapacity =
    tank.volumeLiters *
    (FILTRATION_FACTORS[tank.filtrationLevel] ?? 1.0) *
    (PLANT_FACTORS[tank.plantDensity] ?? 1.0) *
    (WATER_CHANGE_FACTORS[tank.waterChangeFrequency] ?? 1.0);
  const bioloadScore =
    tankBioloadCapacity > 0 ? (totalBioload / tankBioloadCapacity) * 100 : 0;

  const largeTankSchoolingBuffer = getLargeTankSchoolingBuffer(tank.volumeLiters);
  const totalSpaceLoad = speciesList.reduce((sum, species) => {
    const activityFactor = ACTIVITY_FACTORS[species.activityLevel] ?? 1.2;
    const zoneFactor = ZONE_FACTORS[species.swimmingZone] ?? 1.1;
    const fishSpaceLoad =
      species.adultSizeCm *
      activityFactor *
      zoneFactor *
      species.quantity *
      getSchoolingBonus(species) *
      largeTankSchoolingBuffer *
      species.spaceModifier;
    return sum + fishSpaceLoad;
  }, 0);
  const tankSpaceCapacity =
    tank.volumeLiters *
    getLengthFactor(tank.lengthCm) *
    getLayoutFactor(tank.openSwimmingSpace);
  const spaceScore =
    tankSpaceCapacity > 0 ? (totalSpaceLoad / tankSpaceCapacity) * 100 : 0;

  let rawBehaviourPenalty = 0;

  speciesList.forEach((species) => {
    let groupPenalty = 0;
    if (species.isSchoolingFish) {
      if (species.quantity < species.minGroupSize) {
        groupPenalty = 40;
        warnings.push(
          `${species.label}: ryba ławicowa - obecna grupa (${species.quantity}) jest poniżej minimum (${species.minGroupSize}).`
        );
      } else if (species.quantity < species.recommendedGroupSize) {
        groupPenalty = 20;
        warnings.push(
          `${species.label}: ryba ławicowa - zalecana większa grupa (${species.recommendedGroupSize}+).`
        );
      }
    }

    const aggressionPenalty =
      species.quantity * (AGGRESSION_FACTORS[species.aggressionLevel] ?? 0);
    const territorialPenalty =
      Math.pow(species.quantity, 2) * (TERRITORIAL_FACTORS[species.territoriality] ?? 0);
    const tankLengthPenalty =
      tank.lengthCm >= species.requiredTankLengthCm
        ? 0
        : ((species.requiredTankLengthCm - tank.lengthCm) / species.requiredTankLengthCm) * 50;
    const speciesBehaviourPenalty =
      (groupPenalty + aggressionPenalty + territorialPenalty + tankLengthPenalty) *
      species.behaviourModifier;

    rawBehaviourPenalty += speciesBehaviourPenalty;

    if (tankLengthPenalty > 0) {
      warnings.push(
        `${species.label}: gatunek jest aktywny/duży względem długości akwarium (${Math.round(
          tank.lengthCm
        )} cm vs zalecane ${Math.round(species.requiredTankLengthCm)} cm).`
      );
    }
    if (species.aggressionLevel >= 4 || species.territoriality >= 4) {
      warnings.push(
        `${species.label}: wysoka agresja/terytorialność zwiększa ryzyko konfliktów przy tej liczebności.`
      );
    }
    detailIssues.push({
      speciesId: species.speciesId,
      label: species.label,
      groupPenalty,
      aggressionPenalty,
      territorialPenalty,
      tankLengthPenalty,
      totalPenalty: speciesBehaviourPenalty,
    });
  });

  const zoneLoads = {
    top: 0,
    middle: 0,
    bottom: 0,
  };
  speciesList.forEach((species) => {
    const bodyMassFactor = BODY_MASS_FACTORS[species.bodyMassType] ?? 1.0;
    const zoneNormalizationFactor = 0.9;
    const baseZoneLoad =
      species.adultSizeCm *
      species.quantity *
      bodyMassFactor *
      getSchoolingBonus(species) *
      largeTankSchoolingBuffer *
      zoneNormalizationFactor;
    if (species.swimmingZone === 'top') {
      zoneLoads.top += baseZoneLoad;
      zoneLoads.middle += baseZoneLoad * 0.3;
      return;
    }
    if (species.swimmingZone === 'middle') {
      zoneLoads.top += baseZoneLoad * 0.2;
      zoneLoads.middle += baseZoneLoad;
      zoneLoads.bottom += baseZoneLoad * 0.1;
      return;
    }
    if (species.swimmingZone === 'bottom') {
      zoneLoads.middle += baseZoneLoad * 0.2;
      zoneLoads.bottom += baseZoneLoad;
      return;
    }

    zoneLoads.top += baseZoneLoad * 0.5;
    zoneLoads.middle += baseZoneLoad * 0.8;
    zoneLoads.bottom += baseZoneLoad * 0.5;
  });

  const topCapacity = Math.max(1, tank.volumeLiters * 0.35);
  const middleCapacity = Math.max(1, tank.volumeLiters * 0.45);
  const bottomCapacity = Math.max(1, (tank.lengthCm * tank.widthCm) / 25);
  const topZoneScore = (zoneLoads.top / topCapacity) * 100;
  const middleZoneScore = (zoneLoads.middle / middleCapacity) * 100;
  const bottomZoneScore = (zoneLoads.bottom / bottomCapacity) * 100;
  const zoneCrowdingScore = Math.max(topZoneScore, middleZoneScore, bottomZoneScore);

  if (topZoneScore > 110) {
    warnings.push('Za duże zagęszczenie w górnej strefie akwarium.');
  }
  if (middleZoneScore > 110) {
    warnings.push('Za duże zagęszczenie w środkowej strefie akwarium.');
  }
  if (bottomZoneScore > 110) {
    warnings.push('Za duże zagęszczenie w dolnej strefie akwarium.');
  }

  const behaviourScore = Math.max(rawBehaviourPenalty, zoneCrowdingScore);
  const finalStockingScore = Math.max(bioloadScore, spaceScore, behaviourScore);
  const finalStatus = getStockingLoadStatus(finalStockingScore);
  const bioloadStatus = getStockingLoadStatus(bioloadScore);
  const spaceStatus = getStockingLoadStatus(spaceScore);
  const behaviourStatus = getStockingLoadStatus(behaviourScore);

  if (bioloadScore <= 100 && spaceScore > 110) {
    warnings.push(
      'Biologicznie akwarium może to udźwignąć, ale przestrzeń pływania jest przekroczona.'
    );
  }
  if (finalStatus.status === 'borderline' || finalStatus.status === 'overstocked' || finalStatus.status === 'heavily_overstocked') {
    warnings.push('Obsada graniczna lub przekroczona - wymagana mocna filtracja i regularne podmiany.');
  }

  if (bioloadScore > 100) {
    recommendations.push('Ogranicz obciążenie biologiczne albo zwiększ objętość i filtrację.');
  }
  if (spaceScore > 100) {
    recommendations.push('Zmniejsz zagęszczenie obsady lub wybierz większy zbiornik.');
  }
  if (behaviourScore > 100) {
    recommendations.push('Skoryguj skład gatunków i liczebności pod kątem stref, grup i temperamentu.');
  }
  if (finalStatus.status === 'safe' || finalStatus.status === 'good') {
    recommendations.push('Aktualna obsada jest sensowna - utrzymuj regularną obserwację i pomiary.');
  }

  return {
    tank,
    speciesCount: speciesList.length,
    fishCount: speciesList.reduce((sum, item) => sum + item.quantity, 0),
    scores: {
      bioloadScore,
      spaceScore,
      behaviourScore,
      zoneCrowdingScore,
    },
    finalStockingScore,
    finalStatus,
    componentStatus: {
      bioload: bioloadStatus,
      space: spaceStatus,
      behaviour: behaviourStatus,
    },
    risks: {
      biologicalLoadRisk: mapLoadToRisk(bioloadScore),
      spaceLoadRisk: mapLoadToRisk(spaceScore),
      behaviorLoadRisk: mapLoadToRisk(behaviourScore),
    },
    warnings: [...new Set(warnings)],
    recommendations: [...new Set(recommendations)],
    breakdown: {
      totalBioload,
      tankBioloadCapacity,
      totalSpaceLoad,
      tankSpaceCapacity,
      rawBehaviourPenalty,
      zoneScores: {
        top: topZoneScore,
        middle: middleZoneScore,
        bottom: bottomZoneScore,
      },
      zoneLoads,
      issueBreakdown: detailIssues,
    },
  };
}

module.exports = {
  evaluateUniversalStockingLoad,
  getStockingLoadStatus,
  estimatedLengthFromVolume,
  estimatedWidthFromVolume,
};
