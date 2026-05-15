import { useEffect, useMemo } from 'react';

import {
  buildHistoryChartData,
  type HistoryChartParameter,
} from '@/features/aquarium/sections/HistorySectionHelpers';

type UseHistorySectionChartParams = {
  availableMeasurementTests: Record<string, boolean>;
  measurements: any[];
  selectedHistoryChartParameter: string;
  setSelectedHistoryChartParameter: (value: string) => void;
  historyChartWidth: number;
  isHistorySection: boolean;
  selectedTankTargetRanges: Record<string, { min?: number; max?: number }> | null;
  historyChartParameters: HistoryChartParameter[];
  getMeasurementNumericValue: (measurement: any, key: string) => number;
  getMeasurementRecordedAtMs: (measurement: any) => number;
};

export function useHistorySectionChart({
  availableMeasurementTests,
  measurements,
  selectedHistoryChartParameter,
  setSelectedHistoryChartParameter,
  historyChartWidth,
  isHistorySection,
  selectedTankTargetRanges,
  historyChartParameters,
  getMeasurementNumericValue,
  getMeasurementRecordedAtMs,
}: UseHistorySectionChartParams) {
  const enabledHistoryChartParameters = useMemo(() => {
    const enabledTestsMap = availableMeasurementTests;
    return historyChartParameters.filter((item) => {
      const hasAccess =
        item.key === 'co2'
          ? Boolean(enabledTestsMap.ph && enabledTestsMap.kh)
          : Boolean(enabledTestsMap[item.key]);

      if (!hasAccess) {
        return false;
      }

      const hasData = measurements.some((measurementItem) => {
        const value = getMeasurementNumericValue(measurementItem, item.key);
        return Number.isFinite(value);
      });

      if (!hasData) {
        return false;
      }

      if (item.key === 'co2') {
        return true;
      }
      return true;
    });
  }, [
    availableMeasurementTests,
    getMeasurementNumericValue,
    historyChartParameters,
    measurements,
  ]);

  useEffect(() => {
    if (enabledHistoryChartParameters.length === 0) {
      return;
    }

    const hasSelected = enabledHistoryChartParameters.some(
      (item) => item.key === selectedHistoryChartParameter
    );

    if (!hasSelected) {
      setSelectedHistoryChartParameter(enabledHistoryChartParameters[0].key);
    }
  }, [
    enabledHistoryChartParameters,
    selectedHistoryChartParameter,
    setSelectedHistoryChartParameter,
  ]);

  const selectedHistoryChartMeta = useMemo(
    () =>
      enabledHistoryChartParameters.find(
        (item) => item.key === selectedHistoryChartParameter
      ) ??
      enabledHistoryChartParameters[0] ??
      historyChartParameters[0],
    [
      enabledHistoryChartParameters,
      historyChartParameters,
      selectedHistoryChartParameter,
    ]
  );

  const historyChartData = useMemo(
    () =>
      buildHistoryChartData({
        historyChartWidth,
        isHistorySection,
        measurements,
        selectedHistoryChartMeta,
        selectedTankTargetRanges,
        getMeasurementRecordedAtMs,
        getMeasurementNumericValue,
      }),
    [
      getMeasurementNumericValue,
      getMeasurementRecordedAtMs,
      historyChartWidth,
      isHistorySection,
      measurements,
      selectedHistoryChartMeta,
      selectedTankTargetRanges,
    ]
  );

  const historyChartSeries = historyChartData.series;
  const historyChartAverageValue = useMemo(() => {
    if (historyChartSeries.length === 0) {
      return null;
    }

    const sum = historyChartSeries.reduce(
      (acc: number, item: any) => acc + item.value,
      0
    );
    return sum / historyChartSeries.length;
  }, [historyChartSeries]);
  const historyChartDeltaValue = useMemo(() => {
    if (historyChartSeries.length < 2) {
      return null;
    }

    return (
      historyChartSeries[historyChartSeries.length - 1].value -
      historyChartSeries[0].value
    );
  }, [historyChartSeries]);

  return {
    enabledHistoryChartParameters,
    selectedHistoryChartMeta,
    historyChartData,
    historyChartAverageValue,
    historyChartDeltaValue,
  };
}
