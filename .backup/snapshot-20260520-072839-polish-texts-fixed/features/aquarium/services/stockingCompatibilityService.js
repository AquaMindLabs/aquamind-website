function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clampScore(value, min = 0, max = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function inferWaterPreference(profile) {
  const explicit = normalizeText(profile?.waterPreference);
  if (
    ['soft_acidic', 'neutral', 'hard_alkaline', 'brackish', 'marine'].includes(explicit)
  ) {
    return explicit;
  }

  const phMin = toFiniteNumber(profile?.phMin);
  const phMax = toFiniteNumber(profile?.phMax);
  const ghMin = toFiniteNumber(profile?.ghMin);
  const ghMax = toFiniteNumber(profile?.ghMax);

  if (phMin !== null && phMax !== null && phMax < 7.1 && ghMax !== null && ghMax <= 10) {
    return 'soft_acidic';
  }
  if (phMin !== null && phMin >= 7.3 && ghMin !== null && ghMin >= 10) {
    return 'hard_alkaline';
  }
  if (phMin !== null && phMax !== null) {
    return 'neutral';
  }
  return 'unknown';
}

function normalizeTemperament(value) {
  const normalized = normalizeText(value);
  if (normalized === 'predatory') return 'predatory';
  if (normalized === 'aggressive') return 'aggressive';
  if (normalized === 'territorial') return 'territorial';
  if (normalized === 'semi_aggressive') return 'semi_aggressive';
  return 'peaceful';
}

function temperamentRank(value) {
  const normalized = normalizeTemperament(value);
  if (normalized === 'predatory') return 5;
  if (normalized === 'aggressive') return 4;
  if (normalized === 'territorial') return 3;
  if (normalized === 'semi_aggressive') return 2;
  return 1;
}

function normalizeZone(value) {
  const normalized = normalizeText(value);
  if (['bottom', 'middle', 'top', 'all'].includes(normalized)) {
    return normalized;
  }
  return 'middle';
}

function zoneOverlap(firstZone, secondZone) {
  const first = normalizeZone(firstZone);
  const second = normalizeZone(secondZone);
  return first === 'all' || second === 'all' || first === second;
}

function normalizeSocialType(value) {
  const normalized = normalizeText(value);
  if (['solitary', 'pair', 'harem', 'group', 'school'].includes(normalized)) {
    return normalized;
  }
  return 'solitary';
}

function isSmallShrimp(species) {
  const scientificName = normalizeText(species?.scientificName);
  const commonName = normalizeText(species?.commonName);
  return (
    scientificName.includes('neocaridina') ||
    scientificName.includes('caridina') ||
    commonName.includes('cherry shrimp') ||
    commonName.includes('red cherry')
  );
}

function isShrimp(species) {
  if (normalizeText(species?.kind) === 'shrimp') return true;
  const scientificName = normalizeText(species?.scientificName);
  const commonName = normalizeText(species?.commonName);
  return (
    scientificName.includes('caridina') ||
    scientificName.includes('neocaridina') ||
    commonName.includes('shrimp') ||
    commonName.includes('krewet')
  );
}

function isSnail(species) {
  if (normalizeText(species?.kind) === 'snail') return true;
  const scientificName = normalizeText(species?.scientificName);
  const commonName = normalizeText(species?.commonName);
  return (
    commonName.includes('snail') ||
    commonName.includes('slimak') ||
    scientificName.includes('neritina') ||
    scientificName.includes('pomacea') ||
    scientificName.includes('melanoides') ||
    scientificName.includes('anentome')
  );
}

function uniquePush(list, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return;
  if (list.some((item) => String(item).trim().toLowerCase() === normalized.toLowerCase())) {
    return;
  }
  list.push(normalized);
}

function evaluateStockingCompatibilityModel(aquarium, speciesList) {
  const safeSpeciesList = Array.isArray(speciesList) ? speciesList.filter(Boolean) : [];
  const safeAquarium = aquarium && typeof aquarium === 'object' ? aquarium : {};
  let score = 100;
  const issues = [];
  const recommendations = [];
  const issueKeys = new Set();
  let unknownDataSignals = 0;

  const addIssue = (issue) => {
    const type = String(issue?.type ?? '').trim();
    const message = String(issue?.message ?? '').trim();
    if (!type || !message) return;
    const severity = String(issue?.severity ?? 'warning').trim();
    const speciesIds = Array.isArray(issue?.speciesIds)
      ? issue.speciesIds.filter((id) => String(id ?? '').trim().length > 0)
      : [];
    const dedupeKey = `${type}|${severity}|${speciesIds.slice().sort().join(',')}|${message.toLowerCase()}`;
    if (issueKeys.has(dedupeKey)) return;
    issueKeys.add(dedupeKey);
    issues.push({
      type,
      severity,
      speciesIds,
      message,
    });
  };

  if (safeSpeciesList.length === 0) {
    return {
      overallStatus: 'compatible',
      score: 100,
      summary: 'Brak obsady do oceny.',
      issues: [],
      commonParameterRange: {
        temperatureMinC: null,
        temperatureMaxC: null,
        phMin: null,
        phMax: null,
        ghMin: null,
        ghMax: null,
        khMin: null,
        khMax: null,
      },
      recommendations: ['Dodaj gatunki, aby uruchomic pelna ocene zgodnosci obsady.'],
    };
  }

  const normalizedSpecies = safeSpeciesList.map((species) => {
    const profile = species?.profile ?? {};
    const speciesId = String(species?.speciesId ?? profile?.id ?? '').trim();
    const commonName = String(species?.commonName ?? profile?.commonName ?? '').trim() || 'Gatunek';
    const scientificName = String(
      species?.scientificName ?? profile?.scientificName ?? profile?.latinName ?? ''
    ).trim();
    const quantity = Math.max(1, Math.round(Number(species?.quantity ?? 1) || 1));

    const minTankVolumeLiters = toFiniteNumber(
      profile?.minTankVolumeLiters ?? profile?.minTankLiters
    );
    const minTankLengthCm = toFiniteNumber(profile?.minTankLengthCm);
    const temperatureMinC = toFiniteNumber(profile?.temperatureMinC ?? profile?.temperatureMin);
    const temperatureMaxC = toFiniteNumber(profile?.temperatureMaxC ?? profile?.temperatureMax);
    const phMin = toFiniteNumber(profile?.phMin);
    const phMax = toFiniteNumber(profile?.phMax);
    const ghMin = toFiniteNumber(profile?.ghMin);
    const ghMax = toFiniteNumber(profile?.ghMax);
    const khMin = toFiniteNumber(profile?.khMin);
    const khMax = toFiniteNumber(profile?.khMax);
    const adultSizeCm = toFiniteNumber(profile?.adultSizeCm);
    const temperament = normalizeTemperament(profile?.temperament);
    const socialType = normalizeSocialType(profile?.socialType);
    const minGroupSize = Math.max(1, Math.round(Number(profile?.minGroupSize ?? 1) || 1));
    const recommendedGroupSize = Math.max(
      minGroupSize,
      Math.round(Number(profile?.recommendedGroupSize ?? minGroupSize) || minGroupSize)
    );
    const swimmingZone = normalizeZone(profile?.swimmingZone ?? profile?.waterZone);
    const mayEatSmallFish = Boolean(profile?.mayEatSmallFish ?? profile?.eatsSmallFish);
    const mayEatShrimp =
      profile?.mayEatShrimp === true ||
      String(profile?.eatsShrimp ?? '').toLowerCase() === 'yes';
    const mayNibbleFins = Boolean(profile?.mayNibbleFins ?? profile?.finNipper);
    const longFinRisk = Boolean(profile?.longFinRisk ?? profile?.longFinRiskTarget);
    const waterPreference = inferWaterPreference(profile);
    const biotopeTags = Array.isArray(profile?.biotopeTags)
      ? profile.biotopeTags.filter(Boolean).map((tag) => String(tag))
      : [];

    const missingCritical = [
      ['temperatureMinC', temperatureMinC],
      ['temperatureMaxC', temperatureMaxC],
      ['phMin', phMin],
      ['phMax', phMax],
      ['ghMin', ghMin],
      ['ghMax', ghMax],
      ['adultSizeCm', adultSizeCm],
    ].filter(([, value]) => value === null);

    if (missingCritical.length > 0) {
      unknownDataSignals += missingCritical.length;
      score -= 10;
      addIssue({
        type: 'unknown_data',
        severity: 'warning',
        speciesIds: [speciesId].filter(Boolean),
        message: `${commonName}: brak czesci danych gatunku (${missingCritical
          .map((entry) => entry[0])
          .join(', ')}).`,
      });
    }

    return {
      speciesId,
      commonName,
      scientificName,
      quantity,
      profile: {
        minTankVolumeLiters,
        minTankLengthCm,
        temperatureMinC,
        temperatureMaxC,
        phMin,
        phMax,
        ghMin,
        ghMax,
        khMin,
        khMax,
        adultSizeCm,
        temperament,
        socialType,
        minGroupSize,
        recommendedGroupSize,
        swimmingZone,
        mayEatSmallFish,
        mayEatShrimp,
        mayNibbleFins,
        longFinRisk,
        waterPreference,
        biotopeTags,
      },
      kind: isShrimp(species) ? 'shrimp' : isSnail(species) ? 'snail' : 'fish',
    };
  });

  const rangeOf = (minKey, maxKey) => {
    const mins = normalizedSpecies.map((entry) => entry.profile[minKey]).filter((v) => v !== null);
    const maxs = normalizedSpecies.map((entry) => entry.profile[maxKey]).filter((v) => v !== null);
    if (mins.length === 0 || maxs.length === 0) {
      return { min: null, max: null };
    }
    return {
      min: Math.max(...mins),
      max: Math.min(...maxs),
    };
  };

  const tempRange = rangeOf('temperatureMinC', 'temperatureMaxC');
  const phRange = rangeOf('phMin', 'phMax');
  const ghRange = rangeOf('ghMin', 'ghMax');
  const khRange = rangeOf('khMin', 'khMax');

  if (tempRange.min !== null && tempRange.max !== null && tempRange.min > tempRange.max) {
    score -= 40;
    addIssue({
      type: 'water_parameters',
      severity: 'error',
      speciesIds: normalizedSpecies.map((entry) => entry.speciesId).filter(Boolean),
      message: 'Brak wspolnego zakresu temperatury dla calej obsady.',
    });
  } else if (
    tempRange.min !== null &&
    tempRange.max !== null &&
    tempRange.max - tempRange.min <= 1
  ) {
    score -= 10;
    addIssue({
      type: 'water_parameters',
      severity: 'warning',
      speciesIds: normalizedSpecies.map((entry) => entry.speciesId).filter(Boolean),
      message: 'Wspolny zakres temperatury jest bardzo waski.',
    });
  }

  if (phRange.min !== null && phRange.max !== null && phRange.min > phRange.max) {
    score -= 35;
    addIssue({
      type: 'water_parameters',
      severity: 'error',
      speciesIds: normalizedSpecies.map((entry) => entry.speciesId).filter(Boolean),
      message: 'Brak wspolnego zakresu pH dla calej obsady.',
    });
  } else if (phRange.min !== null && phRange.max !== null && phRange.max - phRange.min <= 0.3) {
    score -= 10;
    addIssue({
      type: 'water_parameters',
      severity: 'warning',
      speciesIds: normalizedSpecies.map((entry) => entry.speciesId).filter(Boolean),
      message: 'Wspolny zakres pH jest bardzo waski.',
    });
  }

  if (ghRange.min !== null && ghRange.max !== null && ghRange.min > ghRange.max) {
    score -= 25;
    addIssue({
      type: 'water_parameters',
      severity: 'error',
      speciesIds: normalizedSpecies.map((entry) => entry.speciesId).filter(Boolean),
      message: 'Brak wspolnego zakresu GH dla calej obsady.',
    });
  }

  if (
    khRange.min !== null &&
    khRange.max !== null &&
    khRange.min > khRange.max
  ) {
    score -= 15;
    addIssue({
      type: 'water_parameters',
      severity: 'warning',
      speciesIds: normalizedSpecies.map((entry) => entry.speciesId).filter(Boolean),
      message: "Brak wspolnego zakresu KH dla gatunków, które wymagaja KH.",
    });
  }

  const aquariumVolumeLiters = toFiniteNumber(safeAquarium?.volumeLiters ?? safeAquarium?.liters);
  const aquariumLengthCm = toFiniteNumber(safeAquarium?.lengthCm);
  const aquariumTemperatureC = toFiniteNumber(safeAquarium?.temperatureC);
  const aquariumPh = toFiniteNumber(safeAquarium?.ph);
  const aquariumGh = toFiniteNumber(safeAquarium?.gh);
  const aquariumKh = toFiniteNumber(safeAquarium?.kh);
  const aquariumType = normalizeText(safeAquarium?.aquariumType);
  const hasHidingPlaces = Boolean(safeAquarium?.hasHidingPlaces);

  normalizedSpecies.forEach((entry) => {
    const { profile } = entry;
    const speciesLabel = entry.commonName;
    if (aquariumVolumeLiters !== null && profile.minTankVolumeLiters !== null) {
      const ratio = aquariumVolumeLiters / Math.max(1, profile.minTankVolumeLiters);
      if (ratio < 0.8) {
        score -= 30;
        addIssue({
          type: 'tank_size',
          severity: 'error',
          speciesIds: [entry.speciesId].filter(Boolean),
          message: `${speciesLabel}: akwarium jest wyraznie za male dla tego gatunku.`,
        });
      } else if (ratio < 1) {
        score -= 14;
        addIssue({
          type: 'tank_size',
          severity: 'warning',
          speciesIds: [entry.speciesId].filter(Boolean),
          message: `${speciesLabel}: akwarium jest blisko minimum litrazu.`,
        });
      }
    }
    if (aquariumLengthCm !== null && profile.minTankLengthCm !== null) {
      const ratio = aquariumLengthCm / Math.max(1, profile.minTankLengthCm);
      if (ratio < 0.8) {
        score -= 25;
        addIssue({
          type: 'tank_size',
          severity: 'error',
          speciesIds: [entry.speciesId].filter(Boolean),
          message: `${speciesLabel}: dlugosc akwarium jest za mala dla gatunku.`,
        });
      } else if (ratio < 1) {
        score -= 12;
        addIssue({
          type: 'tank_size',
          severity: 'warning',
          speciesIds: [entry.speciesId].filter(Boolean),
          message: `${speciesLabel}: dlugosc akwarium jest ponizej zalecanego minimum.`,
        });
      }
    }
    if (
      aquariumTemperatureC !== null &&
      profile.temperatureMinC !== null &&
      profile.temperatureMaxC !== null &&
      (aquariumTemperatureC < profile.temperatureMinC ||
        aquariumTemperatureC > profile.temperatureMaxC)
    ) {
      score -= 8;
      addIssue({
        type: 'water_parameters',
        severity: 'warning',
        speciesIds: [entry.speciesId].filter(Boolean),
        message: `${speciesLabel}: temperatura akwarium jest poza zakresem gatunku.`,
      });
    }
    if (
      aquariumPh !== null &&
      profile.phMin !== null &&
      profile.phMax !== null &&
      (aquariumPh < profile.phMin || aquariumPh > profile.phMax)
    ) {
      score -= 7;
      addIssue({
        type: 'water_parameters',
        severity: 'warning',
        speciesIds: [entry.speciesId].filter(Boolean),
        message: `${speciesLabel}: pH akwarium jest poza zakresem gatunku.`,
      });
    }
    if (
      aquariumGh !== null &&
      profile.ghMin !== null &&
      profile.ghMax !== null &&
      (aquariumGh < profile.ghMin || aquariumGh > profile.ghMax)
    ) {
      score -= 6;
      addIssue({
        type: 'water_parameters',
        severity: 'warning',
        speciesIds: [entry.speciesId].filter(Boolean),
        message: `${speciesLabel}: GH akwarium jest poza zakresem gatunku.`,
      });
    }
    if (
      aquariumKh !== null &&
      profile.khMin !== null &&
      profile.khMax !== null &&
      (aquariumKh < profile.khMin || aquariumKh > profile.khMax)
    ) {
      score -= 6;
      addIssue({
        type: 'water_parameters',
        severity: 'warning',
        speciesIds: [entry.speciesId].filter(Boolean),
        message: `${speciesLabel}: KH akwarium jest poza zakresem gatunku.`,
      });
    }
  });

  for (let index = 0; index < normalizedSpecies.length; index += 1) {
    const first = normalizedSpecies[index];
    for (let compareIndex = index + 1; compareIndex < normalizedSpecies.length; compareIndex += 1) {
      const second = normalizedSpecies[compareIndex];
      const firstTemp = normalizeTemperament(first.profile.temperament);
      const secondTemp = normalizeTemperament(second.profile.temperament);
      const sameZone = zoneOverlap(first.profile.swimmingZone, second.profile.swimmingZone);
      const firstName = first.commonName;
      const secondName = second.commonName;
      const pairIds = [first.speciesId, second.speciesId].filter(Boolean);

      if (
        (firstTemp === 'peaceful' && secondTemp === 'semi_aggressive') ||
        (secondTemp === 'peaceful' && firstTemp === 'semi_aggressive')
      ) {
        score -= 10;
        addIssue({
          type: 'temperament',
          severity: 'warning',
          speciesIds: pairIds,
          message: `${firstName} i ${secondName}: pokojowy + polagresywny uklad wymaga obserwacji.`,
        });
      }

      if (
        (firstTemp === 'peaceful' && ['aggressive', 'territorial'].includes(secondTemp)) ||
        (secondTemp === 'peaceful' && ['aggressive', 'territorial'].includes(firstTemp))
      ) {
        score -= 30;
        addIssue({
          type: 'temperament',
          severity: 'error',
          speciesIds: pairIds,
          message: `${firstName} i ${secondName}: zestawienie spokojnego i agresywnego/terytorialnego gatunku.`,
        });
      }

      if (
        ['territorial', 'aggressive'].includes(firstTemp) &&
        ['territorial', 'aggressive'].includes(secondTemp) &&
        sameZone
      ) {
        const isSmallTank = aquariumVolumeLiters !== null && aquariumVolumeLiters < 140;
        score -= isSmallTank ? 30 : 15;
        addIssue({
          type: 'territory',
          severity: isSmallTank ? 'error' : 'warning',
          speciesIds: pairIds,
          message: `${firstName} i ${secondName}: możliwy konflikt terytorialny w tej samej strefie.`,
        });
      }

      const firstAdult = toFiniteNumber(first.profile.adultSizeCm);
      const secondAdult = toFiniteNumber(second.profile.adultSizeCm);

      if (
        first.profile.mayEatSmallFish &&
        firstAdult !== null &&
        secondAdult !== null &&
        secondAdult <= firstAdult * 0.4 &&
        second.kind === 'fish'
      ) {
        score -= 40;
        addIssue({
          type: 'predation',
          severity: 'error',
          speciesIds: pairIds,
          message: `${firstName} może potraktowac ${secondName} jako pokarm.`,
        });
      }
      if (
        second.profile.mayEatSmallFish &&
        firstAdult !== null &&
        secondAdult !== null &&
        firstAdult <= secondAdult * 0.4 &&
        first.kind === 'fish'
      ) {
        score -= 40;
        addIssue({
          type: 'predation',
          severity: 'error',
          speciesIds: pairIds,
          message: `${secondName} może potraktowac ${firstName} jako pokarm.`,
        });
      }

      if (first.profile.mayEatShrimp && second.kind === 'shrimp') {
        const highRisk = isSmallShrimp(second);
        score -= highRisk ? 40 : 20;
        addIssue({
          type: 'shrimp_risk',
          severity: highRisk ? 'error' : 'warning',
          speciesIds: pairIds,
          message: `${firstName} może stanowic ryzyko dla krewetek (${secondName}).`,
        });
      }
      if (second.profile.mayEatShrimp && first.kind === 'shrimp') {
        const highRisk = isSmallShrimp(first);
        score -= highRisk ? 40 : 20;
        addIssue({
          type: 'shrimp_risk',
          severity: highRisk ? 'error' : 'warning',
          speciesIds: pairIds,
          message: `${secondName} może stanowic ryzyko dla krewetek (${firstName}).`,
        });
      }

      if (
        (first.profile.mayNibbleFins && second.profile.longFinRisk) ||
        (second.profile.mayNibbleFins && first.profile.longFinRisk)
      ) {
        score -= 15;
        addIssue({
          type: 'fin_nipping',
          severity: 'warning',
          speciesIds: pairIds,
          message: `${firstName} i ${secondName}: możliwe podgryzanie płetw.`,
        });
      }
    }
  }

  normalizedSpecies.forEach((entry) => {
    const socialType = normalizeSocialType(entry.profile.socialType);
    const quantity = Number(entry.quantity) || 1;
    const minGroupSize = Number(entry.profile.minGroupSize) || 1;
    const recommendedGroupSize = Number(entry.profile.recommendedGroupSize) || minGroupSize;
    const speciesLabel = entry.commonName;
    if (socialType === 'school' || socialType === 'group') {
      if (quantity < minGroupSize) {
        score -= 20;
        addIssue({
          type: 'schooling',
          severity: quantity <= Math.max(1, Math.floor(minGroupSize / 2)) ? 'error' : 'warning',
          speciesIds: [entry.speciesId].filter(Boolean),
          message: `${speciesLabel}: grupa jest zbyt mala (min. ${minGroupSize}).`,
        });
      } else if (quantity < recommendedGroupSize) {
        score -= 8;
        addIssue({
          type: 'schooling',
          severity: 'warning',
          speciesIds: [entry.speciesId].filter(Boolean),
          message: `${speciesLabel}: liczebnosc ponizej zalecanej (${recommendedGroupSize}).`,
        });
      }
    }
  });

  const zoneLoad = { bottom: 0, middle: 0, top: 0, all: 0 };
  const territorialByZone = { bottom: 0, middle: 0, top: 0, all: 0 };
  normalizedSpecies.forEach((entry) => {
    const zone = normalizeZone(entry.profile.swimmingZone);
    zoneLoad[zone] += Number(entry.quantity) || 1;
    if (temperamentRank(entry.profile.temperament) >= 3) {
      territorialByZone[zone] += Number(entry.quantity) || 1;
    }
  });

  const bottomPressure = zoneLoad.bottom + zoneLoad.all;
  const middlePressure = zoneLoad.middle + zoneLoad.all;
  if (bottomPressure >= 12 || middlePressure >= 14) {
    score -= 10;
    addIssue({
      type: 'territory',
      severity: 'warning',
      speciesIds: normalizedSpecies.map((entry) => entry.speciesId).filter(Boolean),
      message: "Wysoka konkurencja o strefy plywania może podnosic stres i konflikty.",
    });
  }
  if (territorialByZone.bottom >= 6 && aquariumLengthCm !== null && aquariumLengthCm < 90) {
    score -= 12;
    addIssue({
      type: 'territory',
      severity: 'warning',
      speciesIds: normalizedSpecies.map((entry) => entry.speciesId).filter(Boolean),
      message: "Wiele terytorialnych gatunków dennych w ograniczonej przestrzeni dna.",
    });
  }

  const preferences = normalizedSpecies.map((entry) => entry.profile.waterPreference);
  const hasMarine = preferences.includes('marine');
  const hasBrackish = preferences.includes('brackish');
  const hasFresh = preferences.some((pref) =>
    ['soft_acidic', 'neutral', 'hard_alkaline', 'unknown'].includes(pref)
  );
  if (hasMarine && hasFresh) {
    score -= 40;
    addIssue({
      type: 'biotope',
      severity: 'error',
      speciesIds: normalizedSpecies.map((entry) => entry.speciesId).filter(Boolean),
      message: "Nie mozna laczyc gatunków morskich ze slodkowodnymi.",
    });
  }
  if (hasBrackish && hasFresh && !hasMarine) {
    score -= 35;
    addIssue({
      type: 'biotope',
      severity: 'error',
      speciesIds: normalizedSpecies.map((entry) => entry.speciesId).filter(Boolean),
      message: "Nie mozna laczyc gatunków slonawowodnych ze slodkowodnymi.",
    });
  }
  if (preferences.includes('soft_acidic') && preferences.includes('hard_alkaline')) {
    score -= 15;
    addIssue({
      type: 'biotope',
      severity: 'warning',
      speciesIds: normalizedSpecies.map((entry) => entry.speciesId).filter(Boolean),
      message:
        "Parametry tych gatunków są mocno rozne: miękka/kwasna vs twarda/zasadowa woda.",
    });
  }
  if (aquariumType.includes('shrimp')) {
    normalizedSpecies.forEach((entry) => {
      if (entry.kind === 'fish' && entry.profile.mayEatShrimp) {
        score -= 25;
        addIssue({
          type: 'shrimp_risk',
          severity: 'error',
          speciesIds: [entry.speciesId].filter(Boolean),
          message: `${entry.commonName}: gatunek ryzykowny dla krewetkarium.`,
        });
      }
    });
  }
  if (!hasHidingPlaces) {
    const aggressiveSpecies = normalizedSpecies.filter(
      (entry) => temperamentRank(entry.profile.temperament) >= 3
    );
    if (aggressiveSpecies.length > 0) {
      score -= 10;
      addIssue({
        type: 'territory',
        severity: 'warning',
        speciesIds: aggressiveSpecies.map((entry) => entry.speciesId).filter(Boolean),
        message: "Brak kryjówek przy obsadzie terytorialnej/agresywnej zwiększa ryzyko konfliktow.",
      });
    }
  }

  const commonParameterRange = {
    temperatureMinC: tempRange.min,
    temperatureMaxC: tempRange.max,
    phMin: phRange.min,
    phMax: phRange.max,
    ghMin: ghRange.min,
    ghMax: ghRange.max,
    khMin: khRange.min,
    khMax: khRange.max,
  };

  const errorIssues = issues.filter((item) => item.severity === 'error');
  const missingDataRatio =
    unknownDataSignals / Math.max(1, normalizedSpecies.length * 7);
  let overallStatus = 'compatible';
  if (missingDataRatio >= 0.4 || unknownDataSignals >= normalizedSpecies.length * 4) {
    overallStatus = 'unknown';
  } else if (errorIssues.length > 0) {
    overallStatus = 'incompatible';
  } else {
    const normalizedScore = clampScore(score, 0, 100);
    if (normalizedScore >= 80) {
      overallStatus = 'compatible';
    } else if (normalizedScore >= 55) {
      overallStatus = 'caution';
    } else {
      overallStatus = 'incompatible';
    }
  }

  issues.forEach((issue) => {
    if (issue.type === 'schooling') {
      uniquePush(recommendations, "Zwiększ grupe do minimum zalecanego dla gatunku.");
    }
    if (issue.type === 'tank_size') {
      uniquePush(recommendations, "Rozważ większe akwarium lub mniejsza obsade.");
    }
    if (issue.type === 'shrimp_risk') {
      uniquePush(recommendations, "Nie lacz ryzykownych gatunków z krewetkami.");
    }
    if (issue.type === 'water_parameters') {
      uniquePush(recommendations, 'Dobierz gatunki o bardziej zblizonych parametrach pH/GH/temperatury.');
    }
    if (issue.type === 'predation') {
      uniquePush(recommendations, 'Unikaj laczenia drapieznikow z wyraznie mniejszymi gatunkami.');
    }
    if (issue.type === 'territory') {
      uniquePush(recommendations, "Zwiększ liczbe kryjówek i ogranicz gatunki konkurujace o te same strefy.");
    }
  });

  if (recommendations.length === 0) {
    uniquePush(recommendations, 'Obserwuj zachowanie ryb po kazdej zmianie obsady.');
  }

  const finalScore = clampScore(Math.round(score), 0, 100);
  const summary =
    overallStatus === 'compatible'
      ? 'Obsada wyglada na zgodna. Monitoruj zachowania i parametry po zmianach.'
      : overallStatus === 'caution'
        ? "Obsada wymaga ostroznosci - widoczne są czynniki ryzyka."
        : overallStatus === 'unknown'
          ? 'Brakuje danych do pewnej oceny zgodnosci obsady.'
          : 'Obsada jest niezgodna lub wysokiego ryzyka i wymaga korekty.';

  return {
    overallStatus,
    score: finalScore,
    summary,
    issues,
    commonParameterRange,
    recommendations,
  };
}

module.exports = {
  evaluateStockingCompatibilityModel,
};
