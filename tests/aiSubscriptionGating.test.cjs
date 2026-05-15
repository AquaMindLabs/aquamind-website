const assert = require('node:assert/strict');
const test = require('node:test');
const {
  resolveAiAssistantGate,
} = require('../features/aquarium/subscription/aiGating.js');

test('resolveAiAssistantGate: free plan without feature shows upgrade prompt', () => {
  const gate = resolveAiAssistantGate({
    hasAiAssistantFeature: false,
    currentPlan: 'free',
    defaultLockMessage: 'Asystent AI jest dostepny w planie Pro.',
  });

  assert.equal(gate.hasAccess, false);
  assert.equal(gate.showUpgradePrompt, true);
  assert.match(gate.upgradePromptMessage, /Ulepsz plan/i);
  assert.equal(gate.targetPlan, 'pro');
});

test('resolveAiAssistantGate: pro plan with feature has full access', () => {
  const gate = resolveAiAssistantGate({
    hasAiAssistantFeature: true,
    currentPlan: 'pro',
    defaultLockMessage: 'Asystent AI jest dostepny w planie Pro.',
  });

  assert.equal(gate.hasAccess, true);
  assert.equal(gate.showUpgradePrompt, false);
  assert.equal(gate.lockMessage, '');
  assert.equal(gate.upgradePromptMessage, '');
});

test('resolveAiAssistantGate: premium without feature is blocked without free prompt', () => {
  const gate = resolveAiAssistantGate({
    hasAiAssistantFeature: false,
    currentPlan: 'premium',
    defaultLockMessage: 'Asystent AI jest dostepny w planie Pro.',
  });

  assert.equal(gate.hasAccess, false);
  assert.equal(gate.showUpgradePrompt, false);
  assert.equal(gate.lockMessage, 'Asystent AI jest dostepny w planie Pro.');
});

