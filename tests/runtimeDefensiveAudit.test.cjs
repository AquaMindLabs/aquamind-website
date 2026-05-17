const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildUserAquariumContext,
} = require('../scripts/ai-context-builder.cjs');
const {
  AI_DIAGNOSTIC_CODES,
  createAiRequestHandlers,
} = require('../scripts/ai-backend-core.cjs');

function createBaseHandlers(overrides = {}) {
  return createAiRequestHandlers({
    authVerifier: {
      async verifyIdToken(token) {
        if (token !== 'token-ok') {
          const error = new Error('invalid token');
          error.code = 'auth/invalid-id-token';
          throw error;
        }
        return { uid: 'user_a' };
      },
    },
    dataStore: {
      async getUserData() {
        return {
          uid: 'user_a',
          tanks: [],
          measurements: [],
          stockItems: [],
          issueCases: [],
        };
      },
    },
    aiProvider: {
      async generateChat() {
        return {
          answer: 'ok',
          recommendations: [],
          warnings: [],
        };
      },
      async analyzeVision() {
        return {
          summary: 'ok',
          hypotheses: [],
          verificationSteps: [],
          recommendations: [],
          actionPlan: [],
          warnings: [],
        };
      },
    },
    logger: {
      info: () => null,
      warn: () => null,
      error: () => null,
    },
    ...overrides,
  });
}

test('buildUserAquariumContext: malformed collections do not crash and produce fallback', () => {
  const context = buildUserAquariumContext('user_a', null, {
    tanks: null,
    measurements: undefined,
    stockItems: { invalid: true },
    issueCases: 'broken',
  });

  assert.equal(context.tankCount, 0);
  assert.equal(context.measurementCount, 0);
  assert.equal(context.stockCount, 0);
  assert.equal(context.activeIssueCount, 0);
  assert.equal(context.meta.hasMinimalData, true);
});

test('buildUserAquariumContext: malformed onboarding/action state are normalized safely', () => {
  const context = buildUserAquariumContext('user_a', 'tank_1', {
    tanks: [
      {
        id: 'tank_1',
        name: 'Tank 1',
        onboardingTaskChecks: 'not-an-object',
        maintenanceActionState: 'bad-state',
      },
    ],
    measurements: [],
    stockItems: [],
    issueCases: [],
  });

  assert.equal(context.selectedTank.id, 'tank_1');
  assert.equal(context.onboardingHighlights.completedTaskCount, 0);
  assert.equal(Array.isArray(context.actionCalendarHighlights.highlights), true);
});

test('buildUserAquariumContext: stock summary is stable for mixed invalid items', () => {
  const context = buildUserAquariumContext('user_a', 'tank_1', {
    tanks: [{ id: 'tank_1', name: 'Tank 1' }],
    measurements: [],
    stockItems: [
      { tankId: 'tank_1', type: 'fish' },
      { tankId: 'tank_1', type: 'plant' },
      { tankId: 'tank_1', type: null },
      null,
    ],
    issueCases: [],
  });

  assert.equal(context.stockSummary.fishCount, 1);
  assert.equal(context.stockSummary.plantCount, 1);
  assert.equal(context.stockSummary.otherCount, 1);
});

test('ai handlers: missing auth maps to deterministic unauthorized error', async () => {
  const handlers = createBaseHandlers();
  const response = await handlers.handleChat({
    headers: {},
    payload: { question: 'Jak poprawic NO3?' },
  });

  assert.equal(response.httpStatus, 401);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.diagnosticCode, AI_DIAGNOSTIC_CODES.UNAUTHORIZED);
});

test('ai handlers: invalid payload shape maps to validation error', async () => {
  const handlers = createBaseHandlers();
  const response = await handlers.handleChat({
    headers: { authorization: 'Bearer token-ok' },
    payload: null,
  });

  assert.equal(response.httpStatus, 400);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.diagnosticCode, AI_DIAGNOSTIC_CODES.VALIDATION);
});

test('ai handlers: malformed datastore output does not crash request flow', async () => {
  const handlers = createBaseHandlers({
    dataStore: {
      async getUserData() {
        return {
          uid: 'user_a',
          tanks: undefined,
          measurements: null,
          stockItems: 'broken',
          issueCases: 42,
        };
      },
    },
  });
  const response = await handlers.handleChat({
    headers: { authorization: 'Bearer token-ok' },
    payload: { question: 'Podsumuj sytuacje zbiornika' },
  });

  assert.equal(response.httpStatus, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.diagnosticCode, AI_DIAGNOSTIC_CODES.OK);
  assert.equal(response.body.data.contextSummary.tankCount, 0);
});
