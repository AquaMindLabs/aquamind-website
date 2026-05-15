type DeleteFieldFn = () => unknown;

type TankDiseaseCaseModelDeps = {
  deleteFieldFn: DeleteFieldFn;
};

type BuildTankDiseaseCasePayloadParams = {
  currentCase?: unknown;
  updates?: Record<string, unknown>;
  mode?: 'create' | 'update';
  includeUpdatedAt?: boolean;
  includeCreatedAtIfMissing?: boolean;
  now?: Date;
  deps: TankDiseaseCaseModelDeps;
};

const ALLOWED_TANK_DISEASE_CASE_FIELDS = new Set([
  'userId',
  'tankId',
  'tankName',
  'caseType',
  'issueId',
  'issueName',
  'diseaseId',
  'diseaseName',
  'severity',
  'diseaseSummary',
  'causes',
  'caution',
  'treatmentPlan',
  'schedule',
  'status',
  'startedAt',
  'nextReviewAt',
  'closedAt',
  'closedReason',
  'createdAt',
  'updatedAt',
]);

function hasOwnField(entity: unknown, field: string) {
  return Boolean(entity && Object.prototype.hasOwnProperty.call(entity, field));
}

function isTimestampLike(value: unknown) {
  if (value === null || value === undefined) {
    return true;
  }
  if (value instanceof Date) {
    return true;
  }
  return (
    typeof value === 'object' &&
    typeof (value as { toMillis?: unknown })?.toMillis === 'function'
  );
}

function normalizeCaseType(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    return 'disease';
  }
  if (['disease', 'plant_disease', 'algae'].includes(normalized)) {
    return normalized;
  }
  return normalized;
}

function normalizeCaseStatus(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    return 'active';
  }
  return normalized;
}

function normalizeString(value: unknown, maxLen: number) {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, maxLen);
}

function normalizeStringList(value: unknown, maxItems: number, maxLen: number) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeString(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeSchedule(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === 'object')
    .slice(0, 30)
    .map((item) => {
      const casted = item as Record<string, unknown>;
      const normalizedItem: Record<string, unknown> = {};
      const day = Number(casted.day);
      if (Number.isFinite(day)) {
        normalizedItem.day = Math.max(0, Math.round(day));
      }
      const title = normalizeString(casted.title, 180);
      if (title) {
        normalizedItem.title = title;
      }
      const details = normalizeString(casted.details, 1000);
      if (details) {
        normalizedItem.details = details;
      }
      if (isTimestampLike(casted.dueAt) && casted.dueAt) {
        normalizedItem.dueAt = casted.dueAt;
      }
      const isDone = casted.isDone;
      if (typeof isDone === 'boolean') {
        normalizedItem.isDone = isDone;
      }
      return normalizedItem;
    })
    .filter((item) => Object.keys(item).length > 0);
}

export function normalizeTankDiseaseCaseRuntime(
  diseaseCase: unknown
): Record<string, unknown> {
  if (!diseaseCase || typeof diseaseCase !== 'object') {
    return {};
  }

  const normalized: Record<string, unknown> = {
    ...(diseaseCase as Record<string, unknown>),
  };

  if (hasOwnField(normalized, 'caseType')) {
    normalized.caseType = normalizeCaseType(normalized.caseType);
  }
  if (hasOwnField(normalized, 'status')) {
    normalized.status = normalizeCaseStatus(normalized.status);
  }

  [
    ['userId', 128],
    ['tankId', 128],
    ['tankName', 180],
    ['issueId', 180],
    ['issueName', 220],
    ['diseaseId', 180],
    ['diseaseName', 220],
    ['severity', 32],
    ['diseaseSummary', 3000],
    ['caution', 1500],
    ['closedReason', 80],
  ].forEach(([field, maxLen]) => {
    if (!hasOwnField(normalized, String(field))) {
      return;
    }
    const value = normalizeString(normalized[String(field)], Number(maxLen));
    if (value === null) {
      delete normalized[String(field)];
      return;
    }
    normalized[String(field)] = value;
  });

  if (hasOwnField(normalized, 'causes')) {
    normalized.causes = normalizeStringList(normalized.causes, 40, 220);
  }
  if (hasOwnField(normalized, 'treatmentPlan')) {
    normalized.treatmentPlan = normalizeStringList(
      normalized.treatmentPlan,
      20,
      1000
    );
  }
  if (hasOwnField(normalized, 'schedule')) {
    normalized.schedule = normalizeSchedule(normalized.schedule);
  }

  return normalized;
}

export function validateTankDiseaseCaseRuntime(
  diseaseCase: unknown
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const normalized = normalizeTankDiseaseCaseRuntime(diseaseCase);

  const userId = String(normalized.userId ?? '').trim();
  if (!userId) {
    issues.push('missing_user_id');
  }

  const tankId = String(normalized.tankId ?? '').trim();
  if (!tankId) {
    issues.push('missing_tank_id');
  }

  const caseType = String(normalized.caseType ?? '').trim().toLowerCase();
  if (!['disease', 'plant_disease', 'algae'].includes(caseType)) {
    issues.push('invalid_case_type');
  }

  const status = String(normalized.status ?? '').trim().toLowerCase();
  if (
    ![
      'active',
      'resolved',
      'removed',
      'closed',
      'archived',
    ].includes(status)
  ) {
    issues.push('invalid_status');
  }

  ['startedAt', 'nextReviewAt', 'closedAt', 'createdAt', 'updatedAt'].forEach((field) => {
    if (!hasOwnField(normalized, field)) {
      return;
    }
    if (!isTimestampLike(normalized[field])) {
      issues.push(`invalid_${field}`);
    }
  });

  return { ok: issues.length === 0, issues };
}

export function buildTankDiseaseCaseSanitizationPatchRuntime(
  diseaseCase: unknown,
  deps: TankDiseaseCaseModelDeps
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const normalized = normalizeTankDiseaseCaseRuntime(diseaseCase);

  Object.keys(normalized).forEach((field) => {
    if (field === 'id') {
      return;
    }
    if (!ALLOWED_TANK_DISEASE_CASE_FIELDS.has(field)) {
      patch[field] = deps.deleteFieldFn();
    }
  });

  ['startedAt', 'nextReviewAt', 'closedAt', 'createdAt', 'updatedAt'].forEach((field) => {
    if (!hasOwnField(normalized, field)) {
      return;
    }
    if (!isTimestampLike(normalized[field])) {
      patch[field] = deps.deleteFieldFn();
    }
  });

  return patch;
}

function sanitizeTankDiseaseCaseForWrite(
  input: Record<string, unknown>,
  mode: 'create' | 'update'
) {
  const normalized = normalizeTankDiseaseCaseRuntime(input);
  const sanitized: Record<string, unknown> = {};

  ALLOWED_TANK_DISEASE_CASE_FIELDS.forEach((field) => {
    if (!hasOwnField(normalized, field)) {
      return;
    }
    const value = normalized[field];
    if (value === undefined) {
      return;
    }
    if (value === null && mode === 'create') {
      return;
    }
    sanitized[field] = value;
  });

  if (mode === 'update') {
    delete sanitized.createdAt;
  }

  return sanitized;
}

export function buildTankDiseaseCasePayload({
  currentCase = {},
  updates = {},
  mode = 'update',
  includeUpdatedAt = mode === 'update',
  includeCreatedAtIfMissing = mode === 'create',
  now = new Date(),
  deps,
}: BuildTankDiseaseCasePayloadParams): Record<string, unknown> {
  const normalizedCurrent = normalizeTankDiseaseCaseRuntime(currentCase);
  const normalizedUpdates = normalizeTankDiseaseCaseRuntime(updates);
  const merged = {
    ...normalizedCurrent,
    ...normalizedUpdates,
  };

  const sanitizedPatch =
    mode === 'update'
      ? buildTankDiseaseCaseSanitizationPatchRuntime(normalizedCurrent, deps)
      : {};
  const sanitizedPayload = sanitizeTankDiseaseCaseForWrite(merged, mode);

  if (includeCreatedAtIfMissing && !hasOwnField(sanitizedPayload, 'createdAt')) {
    sanitizedPayload.createdAt = now;
  }
  if (includeUpdatedAt) {
    sanitizedPayload.updatedAt = now;
  }

  return {
    ...sanitizedPatch,
    ...sanitizedPayload,
  };
}
