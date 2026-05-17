import { normalizeArray } from '@/shared/utils/runtimeGuards';

export function getFishQuantityService(item) {
  const parsed = Number(item.quantity);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return Math.max(1, Math.round(parsed));
}

export function estimateBioloadLitersPerFishService(minLiters) {
  const min = Number(minLiters);

  if (!Number.isFinite(min) || min <= 0) {
    return 3;
  }

  if (min <= 30) {
    return 2.6;
  }

  if (min <= 60) {
    return 3.8;
  }

  if (min <= 100) {
    return 5.6;
  }

  if (min <= 160) {
    return 7.3;
  }

  if (min <= 240) {
    return 9.6;
  }

  return 12;
}

export function buildFishStockingSummaryService(stockItems, tankLiters) {
  const fishItems = normalizeArray(stockItems).filter(
    (item) => item?.type === 'fish'
  );
  const tank = Number(tankLiters);

  if (!Number.isFinite(tank) || tank <= 0 || fishItems.length === 0) {
    return {
      hasFish: fishItems.length > 0,
      hasTankLiters: Number.isFinite(tank) && tank > 0,
      estimatedLiters: 0,
      tankLiters: tank,
      ratio: 0,
      isOverstocked: false,
    };
  }

  const largestSpeciesMinLiters = fishItems.reduce((maxValue, item) => {
    const minLiters = Number(item.minLiters);

    if (!Number.isFinite(minLiters) || minLiters <= 0) {
      return maxValue;
    }

    return Math.max(maxValue, minLiters);
  }, 0);

  const bioloadLiters = fishItems.reduce((sum, item) => {
    const quantity = getFishQuantityService(item);
    return sum + estimateBioloadLitersPerFishService(item.minLiters) * quantity;
  }, 0);

  const estimatedLiters = Math.max(largestSpeciesMinLiters, bioloadLiters);
  const ratio = estimatedLiters / tank;

  return {
    hasFish: true,
    hasTankLiters: true,
    estimatedLiters,
    tankLiters: tank,
    ratio,
    isOverstocked: ratio > 1.05,
  };
}
