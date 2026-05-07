export type EquipmentType = 'heater' | 'filter';

export type EquipmentCatalogItem = {
  id: string;
  type: EquipmentType | string;
  brand?: string;
  model?: string;
  powerW?: number | string | null;
  flowLh?: number | string | null;
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
  tankMinLiters?: number | string | null;
  tankMaxLiters?: number | string | null;
  source?: string;
  assignmentId?: string;
};

export type TankInput = {
  liters?: number | string | null;
  heaterEquipments?: TankEquipment[] | null;
  filterEquipments?: TankEquipment[] | null;
  heaterEquipment?: TankEquipment | null;
  filterEquipment?: TankEquipment | null;
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
};

export type EquipmentAssessmentResult = {
  heater: EquipmentAssessmentEntry;
  filter: EquipmentAssessmentEntry;
};

export function buildTankEquipmentAssessment(
  tank: TankInput | null | undefined,
  equipmentCatalog: EquipmentCatalogItem[]
): EquipmentAssessmentResult {
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
        const metric = type === 'heater'
          ? toFiniteNumber(item.powerW) ?? 0
          : toFiniteNumber(item.flowLh) ?? 0;
        return {
          ...item,
          score: Math.abs(metric - targetValue),
        };
      })
      .sort((a, b) => a.score - b.score);

    return scored.slice(0, 3).map((item) => ({
      id: item.id,
      label:
        type === 'heater'
          ? `${item.brand} ${item.model} (${item.powerW} W)`
          : `${item.brand} ${item.model} (${item.flowLh} l/h)`,
    }));
  };

  if (!nowHasLiters || liters === null) {
    baseResult.heater.details = 'Ustaw litraz akwarium, aby ocenic grzalke.';
    baseResult.filter.details = 'Ustaw litraz akwarium, aby ocenic filtr.';
    return baseResult;
  }

  if (heaterEquipments.length > 0) {
    const powerValues = heaterEquipments
      .map((item) => toFiniteNumber(item.powerW))
      .filter((value): value is number => value !== null);
    const declaredMaxLitersValues = heaterEquipments
      .map((item) => toFiniteNumber(item.tankMaxLiters))
      .filter((value): value is number => value !== null && value > 0);
    const totalPowerW =
      powerValues.length > 0 ? powerValues.reduce((sum, value) => sum + value, 0) : null;
    const totalDeclaredMaxLiters =
      declaredMaxLitersValues.length > 0
        ? declaredMaxLitersValues.reduce((sum, value) => sum + value, 0)
        : null;
    const ratio = totalPowerW !== null ? totalPowerW / liters : null;
    const declaredCoverage =
      totalDeclaredMaxLiters !== null ? totalDeclaredMaxLiters / liters : null;
    const missingPowerCount = heaterEquipments.length - powerValues.length;
    const equipmentLabel = summarizeEquipmentLabel(heaterEquipments, 'Zestaw grzalek');
    const result: EquipmentAssessmentEntry = {
      status: 'warning',
      title: 'Grzalka',
      details:
        totalPowerW === null
          ? 'Brak mocy grzalek w danych.'
          : `${equipmentLabel || 'Grzalka'} - razem ${Math.round(totalPowerW)} W (${(ratio ?? 0).toFixed(2)} W/l).`,
      actions: [],
      suggestions: [],
      equipments: heaterEquipments,
      equipment: heaterEquipments[0] ?? null,
    };

    if (totalPowerW === null || ratio === null) {
      result.status = 'warning';
      result.actions.push('Uzupelnij moce grzalek albo wybierz modele z katalogu.');
    } else if (ratio < 0.6) {
      result.status = ratio < 0.45 ? 'critical' : 'warning';
      result.actions.push('Laczna moc grzalek jest zbyt niska - dogrzewanie moze byc niestabilne.');
      if (ratio >= 0.5) {
        result.actions.push('Mozesz ograniczyc straty ciepla (pokrywa, mniejszy ruch tafli), ale warto rozwazyc mocniejszy zestaw.');
      } else {
        result.actions.push('Zalecane dolozenie lub wymiana na mocniejszy zestaw.');
      }
    } else if (ratio > 1.5) {
      result.status = ratio > 2.2 ? 'critical' : 'warning';
      result.actions.push('Laczna moc grzalek jest wysoka wzgledem litrazu.');
      if (ratio <= 2.2) {
        result.actions.push('Jesli termostat trzyma stabilnie temperature, moze dzialac poprawnie.');
      } else {
        result.actions.push('Zalecane odjecie jednej grzalki lub slabszy zestaw dla bezpieczniejszej pracy.');
      }
    } else {
      result.status = 'ok';
      result.actions.push('Laczna moc grzalek jest dobrze dopasowana do litrazu.');
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

    result.suggestions = pickSuggestions('heater', liters);
    baseResult.heater = result;
  } else {
    baseResult.heater.suggestions = pickSuggestions('heater', liters);
  }

  if (filterEquipments.length > 0) {
    const flowValues = filterEquipments
      .map((item) => toFiniteNumber(item.flowLh))
      .filter((value): value is number => value !== null);
    const declaredMaxLitersValues = filterEquipments
      .map((item) => toFiniteNumber(item.tankMaxLiters))
      .filter((value): value is number => value !== null && value > 0);
    const totalFlowLh =
      flowValues.length > 0 ? flowValues.reduce((sum, value) => sum + value, 0) : null;
    const totalDeclaredMaxLiters =
      declaredMaxLitersValues.length > 0
        ? declaredMaxLitersValues.reduce((sum, value) => sum + value, 0)
        : null;
    const turnover = totalFlowLh !== null ? totalFlowLh / liters : null;
    const declaredCoverage =
      totalDeclaredMaxLiters !== null ? totalDeclaredMaxLiters / liters : null;
    const missingFlowCount = filterEquipments.length - flowValues.length;
    const equipmentLabel = summarizeEquipmentLabel(filterEquipments, 'Zestaw filtrow');
    const result: EquipmentAssessmentEntry = {
      status: 'warning',
      title: 'Filtr',
      details:
        totalFlowLh === null
          ? 'Brak wydajnosci filtra w danych.'
          : `${equipmentLabel || 'Filtr'} - razem ${Math.round(totalFlowLh)} l/h (${(turnover ?? 0).toFixed(1)}x/h).`,
      actions: [],
      suggestions: [],
      equipments: filterEquipments,
      equipment: filterEquipments[0] ?? null,
    };

    if (totalFlowLh === null || turnover === null) {
      result.status = 'warning';
      result.actions.push('Uzupelnij wydajnosci filtrow albo wybierz modele z katalogu.');
    } else if (turnover < 5) {
      result.status = turnover < 3 ? 'critical' : 'warning';
      result.actions.push('Laczna wydajnosc filtrow jest niska wzgledem litrazu.');
      if (turnover >= 4) {
        result.actions.push('Mozesz poprawic przeplyw czyszczeniem mediow i prefiltra, ale docelowo warto mocniejszy zestaw.');
      } else {
        result.actions.push('Zalecane dolozenie drugiego filtra lub wymiana na wydajniejszy zestaw.');
      }
    } else if (turnover > 10) {
      result.status = turnover > 14 ? 'critical' : 'warning';
      result.actions.push('Laczny przeplyw filtrow jest wysoki wzgledem litrazu.');
      if (turnover <= 14) {
        result.actions.push('Sprobuj zmniejszyc przeplyw lub rozproszyc strumien (deszczownia, kierunek wylotu).');
      } else {
        result.actions.push('Rozwaz spokojniejszy zestaw lub mocne zdlawienie przeplywu.');
      }
    } else {
      result.status = 'ok';
      result.actions.push('Laczna wydajnosc filtrow jest dobrze dopasowana do litrazu.');
    }

    if (missingFlowCount > 0) {
      result.actions.push('Czesc filtrow nie ma podanej wydajnosci - ocena jest orientacyjna.');
    }

    if (declaredCoverage !== null) {
      if (declaredCoverage < 0.85) {
        result.status = pickWorseStatus(result.status, 'critical');
        result.actions.push(
          'Deklarowany litraz filtrow jest wyraznie za niski dla tego zbiornika.'
        );
      } else if (declaredCoverage < 1) {
        result.status = pickWorseStatus(result.status, 'warning');
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
