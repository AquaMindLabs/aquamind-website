function resolveAiAssistantGate({
  hasAiAssistantFeature = false,
  currentPlan = 'free',
  defaultLockMessage = '',
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
    ? 'Asystent AI Pro odblokowuje interpretację parametrów, analizę problemów, analizę zdjęć i plan działań krok po kroku.'
    : '';

  return {
    hasAccess: false,
    showUpgradePrompt: shouldShowUpgradePrompt,
    upgradePromptMessage: promptMessage,
    lockMessage: defaultLockMessage || 'Asystent AI jest dostępny w planie Pro.',
    targetPlan: 'pro',
  };
}

module.exports = {
  resolveAiAssistantGate,
};
