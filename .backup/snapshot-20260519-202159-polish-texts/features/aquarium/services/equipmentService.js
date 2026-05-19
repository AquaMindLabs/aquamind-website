export function getTankEquipmentListFieldService(type) {
  return type === 'heater' ? 'heaterEquipments' : 'filterEquipments';
}

export function getTankEquipmentLegacyFieldService(type) {
  return type === 'heater' ? 'heaterEquipment' : 'filterEquipment';
}

export function getTankEquipmentListService(tank, type, deps = {}) {
  const { normalizeEquipmentType } = deps;

  if (!tank) {
    return [];
  }

  const listField = getTankEquipmentListFieldService(type);
  const legacyField = getTankEquipmentLegacyFieldService(type);
  const fromList = Array.isArray(tank[listField])
    ? tank[listField]
        .filter(Boolean)
        .map((item) => ({
          ...item,
          type: normalizeEquipmentType?.(item?.type) || type,
        }))
    : [];

  if (fromList.length > 0) {
    return fromList;
  }

  if (!tank[legacyField]) {
    return [];
  }

  return [
    {
      ...tank[legacyField],
      type: normalizeEquipmentType?.(tank[legacyField]?.type) || type,
    },
  ];
}

export function buildTankEquipmentFromCatalogItemService(
  equipmentItem,
  equipmentType,
  deps = {}
) {
  const { toFiniteNumber, normalizeFilterType, getFilterRealFlowFactor } = deps;

  if (equipmentType === 'heater') {
    return {
      id: equipmentItem.id,
      assignmentId: `${equipmentItem.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'heater',
      brand: equipmentItem.brand ?? '',
      model: equipmentItem.model ?? '',
      powerW: toFiniteNumber?.(equipmentItem.powerW),
      tankMinLiters: toFiniteNumber?.(equipmentItem.tankMinLiters),
      tankMaxLiters: toFiniteNumber?.(equipmentItem.tankMaxLiters),
      source: 'catalog',
    };
  }

  const normalizedFilterType = normalizeFilterType?.(equipmentItem.filterType);
  return {
    id: equipmentItem.id,
    assignmentId: `${equipmentItem.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'filter',
    brand: equipmentItem.brand ?? '',
    model: equipmentItem.model ?? '',
    flowLh: toFiniteNumber?.(equipmentItem.flowLh),
    ...(normalizedFilterType ? { filterType: normalizedFilterType } : {}),
    filterEfficiencyFactor: getFilterRealFlowFactor?.(
      equipmentItem.filterType,
      equipmentItem.filterEfficiencyFactor
    ),
    tankMinLiters: toFiniteNumber?.(equipmentItem.tankMinLiters),
    tankMaxLiters: toFiniteNumber?.(equipmentItem.tankMaxLiters),
    source: 'catalog',
  };
}
