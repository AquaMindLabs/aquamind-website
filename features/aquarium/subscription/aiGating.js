function resolveAiAssistantGate({
  hasAiAssistantFeature = false,
  currentPlan = 'free',
  defaultLockMessage = '',
  lockMessageOverride = '',
  upgradePromptMessageOverride = '',
}) {
  const normalizedPlan = String(currentPlan ?? 'free').trim().toLowerCase();
  const hasAccess = Boolean(hasAiAssistantFeature);

  if (hasAccess) {
    return {
      hasAccess: true,
      showUpgradePrompt: false,
      upgradePromptMessage: '',
      lockMessage: '',
      targetPlan: null,
    };
  }

  const shouldShowUpgradePrompt = normalizedPlan === 'free' || normalizedPlan === 'premium';
  const promptMessage = shouldShowUpgradePrompt
    ? upgradePromptMessageOverride ||
      'Asystent AI Pro odblokowuje interpretacje parametrow, analize problemow, analize zdjec i plan dzialan krok po kroku.'
    : '';

  return {
    hasAccess: false,
    showUpgradePrompt: shouldShowUpgradePrompt,
    upgradePromptMessage: promptMessage,
    lockMessage: lockMessageOverride || defaultLockMessage || 'Asystent AI jest dostepny w planie AI Pro.',
    targetPlan: 'pro',
  };
}

module.exports = {
  resolveAiAssistantGate,
};
