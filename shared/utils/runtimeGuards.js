export function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeObject(value, fallback = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...fallback };
  }
  return value;
}

export function normalizeString(value, fallback = '', maxLength = null) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return fallback;
  }
  if (Number.isFinite(Number(maxLength)) && Number(maxLength) > 0) {
    return normalized.slice(0, Number(maxLength));
  }
  return normalized;
}

export function normalizeNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
