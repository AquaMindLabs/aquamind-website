export type EquipmentType = 'heater' | 'filter';
export type FilterType =
  | 'internal'
  | 'cascade'
  | 'canister'
  | 'sponge'
  | 'sump_panel';

export const FILTER_REAL_FLOW_FACTOR_BY_TYPE: Record<FilterType, number> = {
  internal: 0.7,
  cascade: 0.65,
  canister: 0.55,
  sponge: 0.5,
  sump_panel: 0.7,
};

export type EquipmentCatalogItem = {
  id: string;
  type: EquipmentType | string;
  brand?: string;
  model?: string;
  powerW?: number | string | null;
  flowLh?: number | string | null;
  filterType?: FilterType | string;
  effectiveFlowFactor?: number | string | null;
  filterEfficiencyFactor?: number | string | null;
  tankMinLiters?: number | string | null;
  tankMaxLiters?: number | string | null;
};

export type TankEquipment = {
  id?: string;
  type?: EquipmentType | string;
  brand?: string;
  model?: string;
  powerW?: number | string | null;
  flowLh?: number | string | null;
  filterType?: FilterType | string;
  effectiveFlowFactor?: number | string | null;
  filterEfficiencyFactor?: number | string | null;
  tankMinLiters?: number | string | null;
  tankMaxLiters?: number | string | null;
  source?: string;
  assignmentId?: string;
};

export type TankInput = {
  liters?: number | string | null;
  targetTemperatureC?: number | string | null;
  ambientTemperatureC?: number | string | null;
  defaultAmbientTemperatureC?: number | string | null;
  roomTemperatureMode?: string | null;
  heaterEquipments?: TankEquipment[] | null;
  filterEquipments?: TankEquipment[] | null;
  heaterEquipment?: TankEquipment | null;
  filterEquipment?: TankEquipment | null;
};

export type RoomTemperatureMode =
  | 'cold'
  | 'normal'
  | 'warm'
  | 'very_warm'
  | 'custom';

export type HeaterStatus =
  | 'no_heater_needed'
  | 'underpowered'
  | 'slightly_underpowered'
  | 'adequate'
  | 'strong'
  | 'oversized';

export type HeaterRequirementResult = {
  targetTemperatureC: number;
  ambientTemperatureC: number;
  temperatureDeltaC: number;
  totalHeaterPowerW: number;
  requiredHeaterPowerW: number;
  heaterStatus: HeaterStatus;
  warnings: string[];
  recommendations: string[];
  usedDefaultAmbientTemperature: boolean;
};

export function normalizeEquipmentType(value: unknown): EquipmentType | '' {
  return String(value ?? '').trim().toLowerCase() === 'heater'
    ? 'heater'
    : String(value ?? '').trim().toLowerCase() === 'filter'
      ? 'filter'
      : '';
}

export function toFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeFilterType(value: unknown): FilterType | '' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'internal') {
    return 'internal';
  }
  if (normalized === 'cascade') {
    return 'cascade';
  }
  if (normalized === 'canister') {
    return 'canister';
  }
  if (normalized === 'sponge') {
    return 'sponge';
  }
  if (normalized === 'sump_panel') {
    return 'sump_panel';
  }
  return '';
}

export function getFilterRealFlowFactor(
  filterType: unknown,
  explicitFactor?: unknown
): number {
  const explicit = toFiniteNumber(explicitFactor);
  if (explicit !== null && explicit > 0 && explicit <= 1) {
    return explicit;
  }

  const normalizedType = normalizeFilterType(filterType);
  if (!normalizedType) {
    return 1;
  }

  return FILTER_REAL_FLOW_FACTOR_BY_TYPE[normalizedType];
}

function resolveAmbientTemperatureC(tank: TankInput | null | undefined) {
  const defaultAmbientTemperatureC =
    toFiniteNumber(tank?.defaultAmbientTemperatureC) ?? 20;
  const explicitAmbient = toFiniteNumber(tank?.ambientTemperatureC);
  const mode = String(tank?.roomTemperatureMode ?? '').trim().toLowerCase();
  if (explicitAmbient !== null) {
    return {
      ambientTemperatureC: explicitAmbient,
      usedDefault: false,
      mode: mode || 'custom',
    };
  }
  if (mode === 'cold') {
    return { ambientTemperatureC: 18, usedDefault: false, mode };
  }
  if (mode === 'warm') {
    return { ambientTemperatureC: 22, usedDefault: false, mode };
  }
  if (mode === 'very_warm') {
    return { ambientTemperatureC: 24, usedDefault: false, mode };
  }
  if (mode === 'normal') {
    return { ambientTemperatureC: 20, usedDefault: false, mode };
  }
  return {
    ambientTemperatureC: defaultAmbientTemperatureC,
    usedDefault: true,
    mode: mode || 'normal',
  };
}

function getWattsPerLiterByDelta(deltaC: number): number {
  if (!Number.isFinite(deltaC) || deltaC <= 0) return 0;
  if (deltaC < 1) {
    // 0-1 C -> 0-0.25 W/l
    return (deltaC / 1) * 0.25;
  }
  if (deltaC < 2) {
    // 1-2 C -> 0.25-0.5 W/l
    return 0.25 + ((deltaC - 1) / 1) * 0.25;
  }
  if (deltaC < 3) return 0.5; // 2-3 C
  if (deltaC < 5) return 0.75; // 3-5 C
  if (deltaC < 7) return 1.0; // 5-7 C
  if (deltaC < 10) {
    // 7-10 C -> 1.25-1.5 W/l
    return 1.25 + ((deltaC - 7) / 3) * 0.25;
  }
  // >10 C -> 1.5-2 W/l (capped)
  return Math.min(2.0, 1.5 + ((deltaC - 10) / 5) * 0.5);
}

export function calculateHeaterRequirement(
  aquarium: TankInput | null | undefined,
  heaters: TankEquipment[] | null | undefined
): HeaterRequirementResult {
  const volumeLiters = toFiniteNumber(aquarium?.liters) ?? 0;
  const targetTemperatureC = toFiniteNumber(aquarium?.targetTemperatureC) ?? 25;
  const ambientResolved = resolveAmbientTemperatureC(aquarium);
  const ambientTemperatureC = ambientResolved.ambientTemperatureC;
  const temperatureDeltaC = Math.round((targetTemperatureC - ambientTemperatureC) * 10) / 10;
  const powerValues = (heaters ?? [])
    .map((item) => toFiniteNumber(item?.powerW))
    .filter((value): value is number => value !== null && value > 0);
  const totalHeaterPowerW = powerValues.reduce((sum, value) => sum + value, 0);
  const requiredHeaterPowerW =
    volumeLiters > 0 && temperatureDeltaC > 0
      ? volumeLiters * getWattsPerLiterByDelta(temperatureDeltaC)
      : 0;
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (ambientResolved.usedDefault) {
    warnings.push(
      'Przyjeto domyslna temperature pomieszczenia 20 C. W cieplejszym pomieszczeniu slabsza grzalka moze wystarczyc, a w chlodniejszym moze byc za slaba.'
    );
  }

  if (temperatureDeltaC > 10) {
    warnings.push(
      'Roznica temperatur przekracza 10 C. To wymagajace warunki - warto rozwazyc podniesienie temperatury pomieszczenia.'
    );
  }

  let heaterStatus: HeaterStatus = 'adequate';

  if (temperatureDeltaC <= 0 || requiredHeaterPowerW <= 0) {
    heaterStatus = 'no_heater_needed';
    recommendations.push(
      'Przy tej temperaturze otoczenia grzalka nie jest potrzebna do osiagniecia temperatury docelowej, ale moze pomagac w stabilizacji temperatury.'
    );
    if (totalHeaterPowerW > 0) {
      recommendations.push(
        'Jesli pomieszczenie ma wahania temperatury, zostaw grzalke z termostatem dla stabilnosci.'
      );
    }
    return {
      targetTemperatureC,
      ambientTemperatureC,
      temperatureDeltaC,
      totalHeaterPowerW: Math.round(totalHeaterPowerW),
      requiredHeaterPowerW: Math.round(requiredHeaterPowerW),
      heaterStatus,
      warnings,
      recommendations,
      usedDefaultAmbientTemperature: ambientResolved.usedDefault,
    };
  }

  const ratio = totalHeaterPowerW / Math.max(1, requiredHeaterPowerW);
  if (ratio < 0.7) {
    heaterStatus = 'underpowered';
    warnings.push(
      'Grzalka jest prawdopodobnie za slaba dla tej roznicy temperatur. Rozwaz mocniejsza grzalke lub druga grzalke.'
    );
  } else if (ratio < 0.9) {
    heaterStatus = 'slightly_underpowered';
    warnings.push(
      'Grzalka moze wystarczyc w cieplym pomieszczeniu, ale w chlodniejszym moze miec problem z utrzymaniem temperatury.'
    );
  } else if (ratio <= 1.5) {
    heaterStatus = 'adequate';
    recommendations.push(
      'Moc grzalki jest wystarczajaca dla akwarium przy zalozonej temperaturze otoczenia.'
    );
  } else if (ratio <= 2.5) {
    heaterStatus = 'strong';
    recommendations.push(
      'Moc grzalki jest duza i powinna zapewnic rezerwe cieplna przy spadkach temperatury otoczenia.'
    );
  } else {
    heaterStatus = 'oversized';
    warnings.push(
      'Grzalka ma duza moc wzgledem potrzeb. Przy sprawnym termostacie zwykle nie jest to problem, ale awaria moze szybciej przegrzac wode.'
    );
  }

  if (volumeLiters >= 150 && (heaters?.length ?? 0) <= 1) {
    recommendations.push(
      'W wiekszych akwariach dwie grzalki moga lepiej rozkladac cieplo i zmniejszac ryzyko gwaltownych zmian temperatury.'
    );
  }

  return {
    targetTemperatureC,
    ambientTemperatureC,
    temperatureDeltaC,
    totalHeaterPowerW: Math.round(totalHeaterPowerW),
    requiredHeaterPowerW: Math.round(requiredHeaterPowerW),
    heaterStatus,
    warnings,
    recommendations,
    usedDefaultAmbientTemperature: ambientResolved.usedDefault,
  };
}

export type EquipmentSuggestion = {
  id: string;
  label: string;
};

export type EquipmentAssessmentEntry = {
  status: 'none' | 'ok' | 'warning' | 'critical';
  title: string;
  details: string;
  actions: string[];
  suggestions: EquipmentSuggestion[];
  equipments: TankEquipment[];
  equipment: TankEquipment | null;
  analysis?: Record<string, unknown> | null;
};

export type EquipmentAssessmentResult = {
  heater: EquipmentAssessmentEntry;
  filter: EquipmentAssessmentEntry;
};

export function buildTankEquipmentAssessment(
  tank: TankInput | null | undefined,
  equipmentCatalog: EquipmentCatalogItem[]
): EquipmentAssessmentResult {
  const equipmentCatalogById = new Map(
    equipmentCatalog.map((item) => [
      String(item?.id ?? '').trim().toLowerCase(),
      item,
    ])
  );
  const STATUS_PRIORITY: Record<
    EquipmentAssessmentEntry['status'],
    number
  > = {
    none: 0,
    ok: 1,
    warning: 2,
    critical: 3,
  };
  const pickWorseStatus = (
    current: EquipmentAssessmentEntry['status'],
    candidate: EquipmentAssessmentEntry['status']
  ): EquipmentAssessmentEntry['status'] =>
    STATUS_PRIORITY[candidate] > STATUS_PRIORITY[current] ? candidate : current;
  const liters = toFiniteNumber(tank?.liters);
  const resolveFilterMetadata = (item: TankEquipment | EquipmentCatalogItem) => {
    const itemId = String(item?.id ?? '').trim().toLowerCase();
    const catalogEntry = itemId ? equipmentCatalogById.get(itemId) : null;
    const filterType =
      normalizeFilterType(item?.filterType) ||
      normalizeFilterType(catalogEntry?.filterType);
    const directFactor =
      toFiniteNumber(item?.effectiveFlowFactor) ??
      toFiniteNumber(item?.filterEfficiencyFactor);
    const catalogFactor =
      toFiniteNumber(catalogEntry?.effectiveFlowFactor) ??
      toFiniteNumber(catalogEntry?.filterEfficiencyFactor);
    const factor =
      directFactor !== null && directFactor > 0 && directFactor <= 1
        ? directFactor
        : catalogFactor !== null && catalogFactor > 0 && catalogFactor <= 1
          ? catalogFactor
          : getFilterRealFlowFactor(filterType);

    return {
      filterType,
      factor,
    };
  };
  const normalizeEquipmentList = (
    list: TankEquipment[] | null | undefined,
    fallbackItem: TankEquipment | null | undefined,
    expectedType: EquipmentType
  ): TankEquipment[] => {
    const fromList = Array.isArray(list)
      ? list.filter(Boolean).map((item) => ({
          ...item,
          type: normalizeEquipmentType(item?.type) || expectedType,
        }))
      : [];

    if (fromList.length > 0) {
      return fromList;
    }

    if (!fallbackItem) {
      return [];
    }

    return [
      {
        ...fallbackItem,
        type: normalizeEquipmentType(fallbackItem?.type) || expectedType,
      },
    ];
  };
  const summarizeEquipmentLabel = (
    equipments: TankEquipment[],
    fallbackTitle: string
  ): string => {
    if (equipments.length === 0) {
      return fallbackTitle;
    }

    const labels = equipments
      .map((item) => `${item.brand ?? ''} ${item.model ?? ''}`.trim())
      .filter(Boolean);

    if (labels.length === 0) {
      return equipments.length === 1
        ? fallbackTitle
        : `${fallbackTitle} x${equipments.length}`;
    }

    if (labels.length === 1) {
      return labels[0];
    }

    return `${labels.slice(0, 2).join(' +')}${labels.length > 2 ? ` +${labels.length - 2}` : ''}`;
  };
  const heaterEquipments = normalizeEquipmentList(
    tank?.heaterEquipments,
    tank?.heaterEquipment,
    'heater'
  );
  const filterEquipments = normalizeEquipmentList(
    tank?.filterEquipments,
    tank?.filterEquipment,
    'filter'
  );
  const nowHasLiters = liters !== null && liters > 0;

  const baseResult: EquipmentAssessmentResult = {
    heater: {
      status: 'none',
      title: 'Grzalka',
      details: 'Brak przypisanej grzalki.',
      actions: ['Wybierz model z katalogu i dopasuj moc do litrazu.'],
      suggestions: [],
      equipments: [],
      equipment: null,
    },
    filter: {
      status: 'none',
      title: 'Filtr',
      details: 'Brak przypisanego filtra.',
      actions: ['Wybierz model z katalogu i dopasuj wydajnosc do litrazu.'],
      suggestions: [],
      equipments: [],
      equipment: null,
    },
  };

  const pickSuggestions = (type: EquipmentType, targetValue: number): EquipmentSuggestion[] => {
    if (!nowHasLiters || liters === null) {
      return [];
    }

    const compatible = equipmentCatalog.filter((item) => {
      if (item.type !== type) {
        return false;
      }
      const minLiters = toFiniteNumber(item.tankMinLiters) ?? 0;
      const maxLiters = toFiniteNumber(item.tankMaxLiters) ?? Number.MAX_SAFE_INTEGER;
      return liters >= minLiters && liters <= maxLiters;
    });

    const scored = (
      compatible.length > 0
        ? compatible
        : equipmentCatalog.filter((item) => item.type === type)
    )
      .map((item) => {
        const metric =
          type === 'heater'
            ? toFiniteNumber(item.powerW) ?? 0
            : (toFiniteNumber(item.flowLh) ?? 0) * resolveFilterMetadata(item).factor;
        return {
          ...item,
          score: Math.abs(metric - targetValue),
          metric,
        };
      })
      .sort((a, b) => a.score - b.score);

    return scored.slice(0, 3).map((item) => ({
      id: item.id,
      label:
        type === 'heater'
          ? `${item.brand} ${item.model} (${item.powerW} W)`
          : `${item.brand} ${item.model} (realnie ${Math.round(
              Number(item.metric ?? 0)
            )} l/h, nominalnie ${item.flowLh} l/h)`,
    }));
  };

  if (!nowHasLiters || liters === null) {
    baseResult.heater.details = 'Ustaw litraz akwarium, aby ocenic grzalke.';
    baseResult.filter.details = 'Ustaw litraz akwarium, aby ocenic filtr.';
    return baseResult;
  }

  if (heaterEquipments.length > 0) {
    const heaterRequirement = calculateHeaterRequirement(tank, heaterEquipments);
    const powerValues = heaterEquipments
      .map((item) => toFiniteNumber(item.powerW))
      .filter((value): value is number => value !== null && value > 0);
    const declaredMaxLitersValues = heaterEquipments
      .map((item) => toFiniteNumber(item.tankMaxLiters))
      .filter((value): value is number => value !== null && value > 0);
    const totalPowerW = heaterRequirement.totalHeaterPowerW;
    const totalDeclaredMaxLiters =
      declaredMaxLitersValues.length > 0
        ? declaredMaxLitersValues.reduce((sum, value) => sum + value, 0)
        : null;
    const ratio = totalPowerW > 0 ? totalPowerW / liters : null;
    const declaredCoverage =
      totalDeclaredMaxLiters !== null ? totalDeclaredMaxLiters / liters : null;
    const missingPowerCount = heaterEquipments.length - powerValues.length;
    const equipmentLabel = summarizeEquipmentLabel(heaterEquipments, 'Zestaw grzalek');
    const result: EquipmentAssessmentEntry = {
      status: 'warning',
      title: 'Grzalka',
      details: `${equipmentLabel || 'Grzalka'} - moc ${Math.round(totalPowerW)} W, cel ${heaterRequirement.targetTemperatureC} C, otoczenie ${heaterRequirement.ambientTemperatureC} C, delta ${heaterRequirement.temperatureDeltaC} C, wymagane ok. ${heaterRequirement.requiredHeaterPowerW} W.`,
      actions: [],
      suggestions: [],
      equipments: heaterEquipments,
      equipment: heaterEquipments[0] ?? null,
      analysis: {
        ...heaterRequirement,
        ratioWPerLiter: ratio,
      },
    };

    if (ratio === null) {
      result.status = 'warning';
      result.actions.push('Uzupelnij moce grzalek albo wybierz modele z katalogu.');
    } else if (heaterRequirement.heaterStatus === 'underpowered') {
      result.status = 'critical';
      result.actions.push(
        'Grzalka jest prawdopodobnie za slaba dla tej roznicy temperatur. Rozwaz mocniejsza grzalke lub druga grzalke.'
      );
    } else if (heaterRequirement.heaterStatus === 'slightly_underpowered') {
      result.status = 'warning';
      result.actions.push(
        'Grzalka moze wystarczyc w cieplym pomieszczeniu, ale w chlodniejszym moze miec problem z utrzymaniem temperatury.'
      );
    } else if (heaterRequirement.heaterStatus === 'oversized') {
      result.status = 'warning';
      result.actions.push(
        'Grzalka ma duza moc wzgledem potrzeb. Przy sprawnym termostacie zwykle nie jest to problem, ale awaria moze szybciej przegrzac wode.'
      );
    } else if (heaterRequirement.heaterStatus === 'strong') {
      result.status = 'ok';
      result.actions.push(
        'Moc grzalki jest wieksza od minimum i daje rezerwe przy spadkach temperatury pomieszczenia.'
      );
    } else if (heaterRequirement.heaterStatus === 'no_heater_needed') {
      result.status = 'ok';
      result.actions.push(
        'Przy tej temperaturze otoczenia grzalka nie jest potrzebna do osiagniecia temperatury docelowej, ale moze pomagac w stabilizacji temperatury.'
      );
    } else {
      result.status = 'ok';
      result.actions.push(
        'Moc grzalki jest wystarczajaca dla akwarium przy zalozonej temperaturze otoczenia.'
      );
    }

    if (missingPowerCount > 0) {
      result.actions.push('Czesc grzalek nie ma podanej mocy - ocena jest orientacyjna.');
    }

    if (declaredCoverage !== null) {
      if (declaredCoverage < 0.75) {
        result.status = pickWorseStatus(result.status, 'critical');
        result.actions.push(
          'Deklarowany litraz grzalek jest wyraznie za niski dla tego zbiornika.'
        );
      } else if (declaredCoverage < 1) {
        result.status = pickWorseStatus(result.status, 'warning');
        result.actions.push(
          'Deklarowany litraz grzalek jest nieco ponizej litrazu akwarium.'
        );
      }
    }

    heaterRequirement.warnings.forEach((warning) => {
      if (!result.actions.includes(warning)) {
        result.actions.push(warning);
      }
    });
    heaterRequirement.recommendations.forEach((recommendation) => {
      if (!result.actions.includes(recommendation)) {
        result.actions.push(recommendation);
      }
    });

    result.suggestions = pickSuggestions(
      'heater',
      Math.max(heaterRequirement.requiredHeaterPowerW, liters)
    );
    baseResult.heater = result;
  } else {
    const heaterRequirement = calculateHeaterRequirement(tank, []);
    baseResult.heater.details = `Brak przypisanej grzalki. Cel ${heaterRequirement.targetTemperatureC} C, otoczenie ${heaterRequirement.ambientTemperatureC} C, delta ${heaterRequirement.temperatureDeltaC} C, wymagane ok. ${heaterRequirement.requiredHeaterPowerW} W.`;
    baseResult.heater.analysis = heaterRequirement;
    baseResult.heater.actions = [
      ...heaterRequirement.warnings,
      ...heaterRequirement.recommendations,
      ...baseResult.heater.actions,
    ];
    baseResult.heater.suggestions = pickSuggestions(
      'heater',
      Math.max(heaterRequirement.requiredHeaterPowerW, liters)
    );
  }

  if (filterEquipments.length > 0) {
    const TOO_LOW_TURNOVER_PER_HOUR = 3;
    const MINIMUM_TURNOVER_PER_HOUR = 4;
    const ACCEPTABLE_TURNOVER_PER_HOUR = 5;
    const OPTIMAL_TURNOVER_PER_HOUR = 6.5;
    const MAX_OK_TURNOVER_PER_HOUR = 8;
    const flowPairs = filterEquipments
      .map((item) => {
        const nominalFlow = toFiniteNumber(item.flowLh);
        if (nominalFlow === null) {
          return null;
        }
        const { factor } = resolveFilterMetadata(item);
        return {
          nominalFlow,
          effectiveFlow: nominalFlow * factor,
          effectiveFlowFactor: factor,
        };
      })
      .filter(
        (
          value
        ): value is {
          nominalFlow: number;
          effectiveFlow: number;
          effectiveFlowFactor: number;
        } =>
          value !== null
      );
    const flowValues = flowPairs.map((item) => item.nominalFlow);
    const effectiveFlowValues = flowPairs.map((item) => item.effectiveFlow);
    const declaredMaxLitersValues = filterEquipments
      .map((item) => toFiniteNumber(item.tankMaxLiters))
      .filter((value): value is number => value !== null && value > 0);
    const totalFlowLh =
      flowValues.length > 0 ? flowValues.reduce((sum, value) => sum + value, 0) : null;
    const totalEffectiveFlowLh =
      effectiveFlowValues.length > 0
        ? effectiveFlowValues.reduce((sum, value) => sum + value, 0)
        : null;
    const totalDeclaredMaxLiters =
      declaredMaxLitersValues.length > 0
        ? declaredMaxLitersValues.reduce((sum, value) => sum + value, 0)
        : null;
    const turnover =
      totalEffectiveFlowLh !== null ? totalEffectiveFlowLh / liters : null;
    const weightedEffectiveFlowFactor =
      totalFlowLh !== null && totalFlowLh > 0 && totalEffectiveFlowLh !== null
        ? totalEffectiveFlowLh / totalFlowLh
        : null;
    const declaredCoverage =
      totalDeclaredMaxLiters !== null ? totalDeclaredMaxLiters / liters : null;
    const missingFlowCount = filterEquipments.length - flowValues.length;
    const equipmentLabel = summarizeEquipmentLabel(filterEquipments, 'Zestaw filtrow');
    const result: EquipmentAssessmentEntry = {
      status: 'warning',
      title: 'Filtr',
      details:
        totalEffectiveFlowLh === null
          ? 'Brak wydajnosci filtra w danych.'
          : `${equipmentLabel || 'Filtr'} - realnie ${Math.round(totalEffectiveFlowLh)} l/h (${(turnover ?? 0).toFixed(1)}x/h)${
              totalFlowLh !== null ? `, nominalnie ${Math.round(totalFlowLh)} l/h` : ''
            }.`,
      actions: [],
      suggestions: [],
      equipments: filterEquipments,
      equipment: filterEquipments[0] ?? null,
      analysis:
        turnover === null
          ? null
          : {
              turnoverPerHour: Math.round(turnover * 10) / 10,
              effectiveFlowFactor:
                weightedEffectiveFlowFactor === null
                  ? null
                  : Math.round(weightedEffectiveFlowFactor * 100) / 100,
              hasStrongCurrentWarning: turnover > MAX_OK_TURNOVER_PER_HOUR,
            },
    };

    if (totalEffectiveFlowLh === null || turnover === null) {
      result.status = 'warning';
      result.actions.push('Uzupelnij wydajnosci filtrow albo wybierz modele z katalogu.');
    } else if (turnover < TOO_LOW_TURNOVER_PER_HOUR) {
      result.status = 'critical';
      result.actions.push('Obieg jest za slaby (ponizej 3x/h).');
      result.actions.push('Zalecane dolozenie drugiego filtra lub wymiana na wydajniejszy zestaw.');
    } else if (turnover < MINIMUM_TURNOVER_PER_HOUR) {
      result.status = 'warning';
      result.actions.push(
        'Obieg jest na poziomie minimum (3-4x/h), odpowiedni glownie dla spokojnych akwariow.'
      );
      result.actions.push(
        'Rozwaz lekkie podniesienie przeplywu, jesli obsada lub zanieczyszczenia tego wymagaja.'
      );
    } else if (turnover < ACCEPTABLE_TURNOVER_PER_HOUR) {
      result.status = 'ok';
      result.actions.push('Obieg jest akceptowalny (4-5x/h).');
    } else if (turnover <= OPTIMAL_TURNOVER_PER_HOUR) {
      result.status = 'ok';
      result.actions.push('Obieg jest optymalny dla wiekszosci akwariow (5-6.5x/h).');
    } else if (turnover <= MAX_OK_TURNOVER_PER_HOUR) {
      result.status = 'ok';
      result.actions.push('Obieg jest mocny, ale nadal prawidlowy (6.5-8x/h).');
    } else {
      result.status = 'warning';
      result.actions.push('Obieg jest wysoki (powyzej 8x/h) i moze tworzyc zbyt silny nurt.');
      result.actions.push('Rozwaz zmniejszenie przeplywu lub rozproszenie strumienia.');
    }

    if (missingFlowCount > 0) {
      result.actions.push('Czesc filtrow nie ma podanej wydajnosci - ocena jest orientacyjna.');
    }

    if (declaredCoverage !== null) {
      if (declaredCoverage < 0.85) {
        result.actions.push(
          'Deklarowany litraz filtrow jest wyraznie za niski dla tego zbiornika.'
        );
      } else if (declaredCoverage < 1) {
        result.actions.push(
          'Deklarowany litraz filtrow jest lekko ponizej litrazu akwarium.'
        );
      }
    }

    result.suggestions = pickSuggestions('filter', liters * 7);
    baseResult.filter = result;
  } else {
    baseResult.filter.suggestions = pickSuggestions('filter', liters * 7);
  }

  return baseResult;
}
