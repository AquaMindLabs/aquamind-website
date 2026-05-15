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

  const shouldShowUpgradePrompt = normalizedPlan === 'free';
  const promptMessage = shouldShowUpgradePrompt
    ? 'Asystent AI jest dostepny w planie Pro. Ulepsz plan, aby odblokowac AI chat i analize zdjec.'
    : '';

  return {
    hasAccess: false,
    showUpgradePrompt: shouldShowUpgradePrompt,
    upgradePromptMessage: promptMessage,
    lockMessage:
      defaultLockMessage ||
      'Asystent AI jest dostepny w planie Pro.',
    targetPlan: 'pro',
  };
}

module.exports = {
  resolveAiAssistantGate,
};
