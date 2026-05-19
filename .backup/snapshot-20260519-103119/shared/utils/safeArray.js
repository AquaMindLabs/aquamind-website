export function safeSome(items, predicate) {
  if (!Array.isArray(items) || typeof predicate !== 'function') {
    return false;
  }

  try {
    return items.some(predicate);
  } catch {
    return false;
  }
}

