export const ALERT_SEVERITY = Object.freeze({
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info',
});

const ALERT_SEVERITY_RANK = Object.freeze({
  [ALERT_SEVERITY.CRITICAL]: 3,
  [ALERT_SEVERITY.WARNING]: 2,
  [ALERT_SEVERITY.INFO]: 1,
});

const ALERT_URGENCY_RANK = Object.freeze({
  immediate: 4,
  today: 3,
  soon: 2,
  monitor: 1,
});

const DEFAULT_AREA_LABEL_BY_AFFECTED_AREA = Object.freeze({
  water_parameters: 'Parametry',
  equipment: 'Sprzet',
  stocking: 'Ryby',
  fish: 'Ryby',
  plants: 'Rosliny',
  health: 'Problemy',
  schedule: 'Harmonogram',
  data_quality: 'Parametry',
  general: 'Ogolne',
});

export function normalizeAlertSeverity(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === ALERT_SEVERITY.CRITICAL) {
    return ALERT_SEVERITY.CRITICAL;
  }
  if (normalized === ALERT_SEVERITY.WARNING) {
    return ALERT_SEVERITY.WARNING;
  }
  return ALERT_SEVERITY.INFO;
}

export function getAlertSeverityRank(value) {
  return ALERT_SEVERITY_RANK[normalizeAlertSeverity(value)] ?? 0;
}

export function normalizeAlertUrgency(value, severity = ALERT_SEVERITY.INFO) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (ALERT_URGENCY_RANK[normalized]) {
    return normalized;
  }
  if (normalizeAlertSeverity(severity) === ALERT_SEVERITY.CRITICAL) {
    return 'immediate';
  }
  if (normalizeAlertSeverity(severity) === ALERT_SEVERITY.WARNING) {
    return 'today';
  }
  return 'monitor';
}

export function getAlertUrgencyRank(value) {
  const normalized = normalizeAlertUrgency(value);
  return ALERT_URGENCY_RANK[normalized] ?? 0;
}

export function buildUnifiedAlert(input = {}) {
  const severity = normalizeAlertSeverity(input.severity);
  const title = String(input.title ?? '').trim();
  const explanation = String(input.explanation ?? '').trim();
  const suggestedAction = String(input.suggestedAction ?? '').trim();
  const source = String(input.source ?? 'system').trim() || 'system';
  const affectedArea = String(input.affectedArea ?? 'general').trim() || 'general';
  const urgency = normalizeAlertUrgency(input.urgency, severity);
  const area =
    String(input.area ?? '').trim() ||
    DEFAULT_AREA_LABEL_BY_AFFECTED_AREA[affectedArea] ||
    DEFAULT_AREA_LABEL_BY_AFFECTED_AREA.general;
  const details = [explanation, suggestedAction].filter(Boolean);
  const priorityBoost = Number.isFinite(Number(input.priorityBoost))
    ? Number(input.priorityBoost)
    : 0;
  const priority = getAlertSeverityRank(severity) * 1000 + getAlertUrgencyRank(urgency) * 100 + priorityBoost;

  return {
    id:
      String(input.id ?? '').trim() ||
      `${severity}:${affectedArea}:${title.toLowerCase().replace(/\s+/g, '-')}`,
    severity,
    title,
    explanation,
    suggestedAction,
    urgency,
    source,
    affectedArea,
    area,
    text: title,
    details,
    priority,
  };
}

export function sortUnifiedAlerts(alerts = [], maxCount = 12) {
  const safeAlerts = Array.isArray(alerts) ? alerts.filter(Boolean) : [];
  return safeAlerts
    .slice()
    .sort((left, right) => {
      const severityDiff =
        getAlertSeverityRank(right?.severity) - getAlertSeverityRank(left?.severity);
      if (severityDiff !== 0) {
        return severityDiff;
      }
      const urgencyDiff =
        getAlertUrgencyRank(right?.urgency) - getAlertUrgencyRank(left?.urgency);
      if (urgencyDiff !== 0) {
        return urgencyDiff;
      }
      const priorityDiff = Number(right?.priority ?? 0) - Number(left?.priority ?? 0);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return String(left?.title ?? '').localeCompare(String(right?.title ?? ''), 'pl', {
        sensitivity: 'base',
      });
    })
    .slice(0, Math.max(1, Number(maxCount) || 12));
}

export function splitPrimaryAndSecondaryAlerts(alerts = [], primaryLimit = 3) {
  const sorted = sortUnifiedAlerts(alerts, 200);
  const safeLimit = Math.max(1, Number(primaryLimit) || 3);
  return {
    primary: sorted.slice(0, safeLimit),
    secondary: sorted.slice(safeLimit),
    all: sorted,
  };
}
