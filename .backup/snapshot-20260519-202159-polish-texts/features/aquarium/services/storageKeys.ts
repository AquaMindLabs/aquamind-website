export function getSelectedTankStorageKey(userId: string) {
  return `selectedTankId:${userId}`;
}

export function getReminderStorageKey(userId: string) {
  return `reminderDate:${userId}`;
}

export function getAdaptiveTaskChecksStorageKey(userId: string, tankId: string) {
  return `adaptiveTaskChecks:${userId}:${tankId}`;
}
