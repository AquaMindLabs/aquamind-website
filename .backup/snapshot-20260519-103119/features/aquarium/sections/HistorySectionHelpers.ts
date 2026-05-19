export type HistoryChartParameter = {
  key: string;
  label: string;
  unit?: string;
};

export function getHistoryChartValueStatus(
  parameterKey: string,
  rawValue: unknown,
  targetRanges: Record<string, { min?: number; max?: number }> | null = null
) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return 'neutral';
  }

  const range = targetRanges?.[parameterKey] ?? null;
  const min = Number(range?.min);
  const max = Number(range?.max);
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);

  if (!hasMin && !hasMax) {
    return 'ok';
  }

  if (hasMin && value < min) {
    return 'warning';
  }

  if (hasMax && value > max) {
    return 'warning';
  }

  return 'ok';
}

export function getHistoryChartStatusRank(status: string) {
  if (status === 'warning') {
    return 2;
  }
  if (status === 'ok') {
    return 1;
  }
  return 0;
}

export function getHistoryChartColorByStatus(status: string) {
  if (status === 'warning') {
    return '#e6a700';
  }
  if (status === 'ok') {
    return '#2f9e44';
  }
  return '#7a8a9a';
}

export function buildHistoryIssueTimeline(
  tankDiseaseHistoryCases: any[],
  options: {
    t: (key: string) => string;
    getCreatedAtMs: (value: any) => number;
    formatDateOnly: (value: any) => string;
  }
) {
  const { t, getCreatedAtMs, formatDateOnly } = options;

  return tankDiseaseHistoryCases
    .map((item) => {
      const caseType = String(item.caseType ?? 'disease').toLowerCase();
      const issueTypeLabel =
        caseType === 'plant_disease'
          ? t('typePlantDisease')
          : caseType === 'algae'
            ? t('typeAlgae')
            : t('typeDisease');
      const status = String(item.status ?? 'active').toLowerCase();
      const issueName = String(
        item.issueName ?? item.diseaseName ?? item.name ?? t('noData')
      ).trim();
      const createdAtMs = getCreatedAtMs(item.createdAt);
      const addedAt = formatDateOnly(item.createdAt);
      const endedAtRaw = item.closedAt ?? item.updatedAt ?? null;
      const endedAt = status === 'active' ? null : formatDateOnly(endedAtRaw);

      return {
        id: item.id,
        issueName,
        issueTypeLabel,
        status,
        createdAtMs,
        addedAt,
        endedAt,
      };
    })
    .sort((a, b) => (b?.createdAtMs ?? 0) - (a?.createdAtMs ?? 0));
}

export function buildHistoryChartData({
  historyChartWidth,
  isHistorySection,
  measurements,
  selectedHistoryChartMeta,
  selectedTankTargetRanges,
  getMeasurementRecordedAtMs,
  getMeasurementNumericValue,
}: {
  historyChartWidth: number;
  isHistorySection: boolean;
  measurements: any[];
  selectedHistoryChartMeta: HistoryChartParameter;
  selectedTankTargetRanges: Record<string, { min?: number; max?: number }> | null;
  getMeasurementRecordedAtMs: (measurement: any) => number;
  getMeasurementNumericValue: (measurement: any, key: string) => number;
}) {
  const historyChartTopPadding = 8;
  const historyChartBottomPadding = 24;
  const historyChartAreaHeight = 136;

  if (!isHistorySection) {
    return {
      series: [],
      latestValue: null,
      latestColor: getHistoryChartColorByStatus('neutral'),
      rawMin: 0,
      rawMax: 0,
      displayMin: 0,
      displayMax: 1,
      points: [],
      segments: [],
      hasLine: false,
      firstDateMs: 0,
      lastDateMs: 0,
      topPadding: historyChartTopPadding,
      bottomPadding: historyChartBottomPadding,
      areaHeight: historyChartAreaHeight,
    };
  }

  const series = measurements
    .map((item) => {
      const measuredAtMs = getMeasurementRecordedAtMs(item);
      const value = getMeasurementNumericValue(item, selectedHistoryChartMeta.key);

      return {
        id: item.id,
        measuredAtMs,
        value,
      };
    })
    .filter((item) => Number.isFinite(item.value) && item.measuredAtMs > 0)
    .sort((a, b) => a.measuredAtMs - b.measuredAtMs);

  const historyChartValues = series.map((item) => item.value);
  const latestValue =
    historyChartValues.length > 0
      ? historyChartValues[historyChartValues.length - 1]
      : null;
  const latestStatus = getHistoryChartValueStatus(
    selectedHistoryChartMeta.key,
    latestValue,
    selectedTankTargetRanges
  );
  const isNonNegativeParameter =
    selectedHistoryChartMeta.key !== 'ph' &&
    selectedHistoryChartMeta.key !== 'temperature';
  const rawHistoryChartMin =
    historyChartValues.length > 0 ? Math.min(...historyChartValues) : 0;
  const rawHistoryChartMax =
    historyChartValues.length > 0 ? Math.max(...historyChartValues) : 0;
  const baseHistoryChartSpan = Math.max(rawHistoryChartMax - rawHistoryChartMin, 0);
  const historyChartPadding =
    baseHistoryChartSpan > 0
      ? baseHistoryChartSpan * 0.15
      : Math.max(Math.abs(rawHistoryChartMax) * 0.1, 1);
  const displayMin = isNonNegativeParameter
    ? Math.max(0, rawHistoryChartMin - historyChartPadding)
    : rawHistoryChartMin - historyChartPadding;
  const displayMax = rawHistoryChartMax + historyChartPadding;
  const historyChartRange = displayMax - displayMin > 0 ? displayMax - displayMin : 1;
  const chartWidthSafe = Math.max(historyChartWidth - 2, 1);
  const points = series.map((item, index) => {
    const x =
      series.length <= 1
        ? chartWidthSafe / 2
        : (index / (series.length - 1)) * chartWidthSafe;
    const normalized = (item.value - displayMin) / historyChartRange;
    const clamped = Math.min(1, Math.max(0, normalized));
    const y = historyChartTopPadding + (1 - clamped) * historyChartAreaHeight;
    const status = getHistoryChartValueStatus(
      selectedHistoryChartMeta.key,
      item.value,
      selectedTankTargetRanges
    );

    return {
      ...item,
      x,
      y,
      status,
      color: getHistoryChartColorByStatus(status),
    };
  });
  const segments = points.slice(1).map((point, index) => {
    const prev = points[index];
    const dx = point.x - prev.x;
    const dy = point.y - prev.y;
    const width = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

    const segmentStatus =
      getHistoryChartStatusRank(prev.status) >=
      getHistoryChartStatusRank(point.status)
        ? prev.status
        : point.status;

    return {
      id: `${prev.id}-${point.id}`,
      width,
      angle,
      left: (prev.x + point.x) / 2 - width / 2,
      top: (prev.y + point.y) / 2,
      color: getHistoryChartColorByStatus(segmentStatus),
    };
  });

  return {
    series,
    latestValue,
    latestColor: getHistoryChartColorByStatus(latestStatus),
    rawMin: rawHistoryChartMin,
    rawMax: rawHistoryChartMax,
    displayMin,
    displayMax,
    points,
    segments,
    hasLine: points.length >= 2 && historyChartWidth > 10,
    firstDateMs: series[0]?.measuredAtMs ?? 0,
    lastDateMs: series[series.length - 1]?.measuredAtMs ?? 0,
    topPadding: historyChartTopPadding,
    bottomPadding: historyChartBottomPadding,
    areaHeight: historyChartAreaHeight,
  };
}
