const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildUserAquariumContext,
} = require('../scripts/ai-context-builder.cjs');
const {
  AI_DIAGNOSTIC_CODES,
  buildAquariumAiContext,
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

test('buildAquariumAiContext: currentWater uses latest value per parameter', () => {
  const context = buildAquariumAiContext({
    request: { tankId: 'tank_1' },
    contextSummary: {
      selectedTank: { id: 'tank_1' },
      measurementCount: 3,
    },
    userData: {
      tanks: [{ id: 'tank_1', name: 'Tank 1' }],
      measurements: [
        { id: 'empty', tankId: 'tank_1', measuredAt: '2026-05-20T00:00:00.000Z' },
        { id: 'no3', tankId: 'tank_1', no3: 30, measuredAt: '2026-05-01T00:00:00.000Z' },
        { id: 'ph', tankId: 'tank_1', ph: 7.1, measuredAt: '2026-04-01T00:00:00.000Z' },
      ],
      stockItems: [],
      issueCases: [],
    },
  });

  assert.equal(context.currentWater.no3, 30);
  assert.equal(context.currentWater.ph, 7.1);
  assert.equal(context.currentWater.valueSources.ph, '2026-04-01T00:00:00.000Z');
  assert.equal(context.recentMeasurements.length, 2);
  assert.equal(context.appAnalysis.measurementCount, 2);
  assert.equal(context.appAnalysis.rawMeasurementCount, 3);
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
