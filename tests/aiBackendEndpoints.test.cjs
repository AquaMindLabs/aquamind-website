const assert = require('node:assert/strict');
const test = require('node:test');
const { createAiHttpServer } = require('../scripts/ai-backend-server.cjs');

function createAuthVerifier() {
  return {
    async verifyIdToken(token) {
      if (token === 'token-user-a') {
        return { uid: 'user_a' };
      }
      if (token === 'token-user-b') {
        return { uid: 'user_b' };
      }
      const error = new Error('invalid token');
      error.code = 'auth/invalid-id-token';
      throw error;
    },
  };
}

function createDataStore() {
  const dataByUser = {
    user_a: {
      tanks: [
        { id: 'tank_a', userId: 'user_a', name: 'Akwarium A', liters: 112 },
      ],
      measurements: [
        {
          id: 'm_1',
          userId: 'user_a',
          tankId: 'tank_a',
          ph: 7.1,
          no2: 0,
          no3: 18,
          temperature: 25,
          measuredAt: '2026-05-15T08:00:00.000Z',
        },
      ],
      stockItems: [
        { id: 's_1', userId: 'user_a', tankId: 'tank_a', type: 'fish' },
        { id: 's_2', userId: 'user_a', tankId: 'tank_a', type: 'plant' },
      ],
      issueCases: [
        { id: 'i_1', userId: 'user_a', tankId: 'tank_a', status: 'active' },
      ],
    },
    user_b: {
      tanks: [{ id: 'tank_b', userId: 'user_b', name: 'Akwarium B', liters: 60 }],
      measurements: [],
      stockItems: [],
      issueCases: [],
    },
  };

  return {
    async getUserData(uid, tankId) {
      const record = dataByUser[uid];
      if (!record) {
        return { uid, tanks: [], measurements: [], stockItems: [], issueCases: [] };
      }

      if (tankId) {
        const found = record.tanks.some((tank) => tank.id === tankId);
        if (!found) {
          const error = new Error('invalid tank');
          error.code = 'AIW_VALIDATION';
          throw error;
        }
      }

      return {
        uid,
        tanks: record.tanks,
        measurements: record.measurements,
        stockItems: record.stockItems,
        issueCases: record.issueCases,
      };
    },
  };
}

function createAiProvider() {
  return {
    async generateChat({ request }) {
      if (request.question === 'force-timeout') {
        return new Promise(() => {});
      }
      if (request.question === 'force-provider-error') {
        throw new Error('provider_down');
      }
      return {
        answer: `Odpowiedz AI: ${request.question}`,
        recommendations: ['Zrob pomiar kontrolny za 24h.'],
        warnings: [],
      };
    },
    async analyzeVision({ request }) {
      if (request.question === 'force-timeout') {
        return new Promise(() => {});
      }
      if (request.question === 'force-provider-error') {
        throw new Error('provider_down');
      }
      if (request.question === 'force-unreadable-image') {
        return {
          summary: '',
          hypotheses: [],
          verificationSteps: [],
          recommendations: [],
          actionPlan: [],
          warnings: [],
        };
      }
      return {
        summary: 'Analiza obrazu zakonczona.',
        hypotheses: [
          { key: 'general_observation', label: 'Ogolna obserwacja', confidence: 0.55 },
        ],
        verificationSteps: ['Zweryfikuj parametry pH i NO2.'],
        recommendations: ['Obserwuj akwarium przez 24h.'],
        actionPlan: ['Zrob testy wody i porownaj wynik po 24h.'],
        warnings: ['To nie jest porada weterynaryjna.'],
      };
    },
  };
}

async function startServerForTest() {
  const server = createAiHttpServer({
    authVerifier: createAuthVerifier(),
    dataStore: createDataStore(),
    aiProvider: createAiProvider(),
    providerTimeoutMs: 40,
    providerName: 'test_provider',
    logger: {
      info: () => null,
      warn: () => null,
      error: () => null,
    },
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

function buildHeaders(token = null) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

test('POST /ai/chat requires authorization', async () => {
  const { server, baseUrl } = await startServerForTest();
  try {
    const response = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ question: 'Jak poprawic NO3?' }),
    });
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.ok, false);
    assert.equal(payload.diagnosticCode, 'AIW_UNAUTHORIZED');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /ai/vision/analyze returns readable fallback for unreadable image', async () => {
  const { server, baseUrl } = await startServerForTest();
  try {
    const response = await fetch(`${baseUrl}/ai/vision/analyze`, {
      method: 'POST',
      headers: buildHeaders('token-user-a'),
      body: JSON.stringify({
        question: 'force-unreadable-image',
        imageUrl: 'https://example.com/test-image.jpg',
        tankId: 'tank_a',
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.diagnosticCode, 'AIW_OK');
    assert.match(payload.data.summary, /nieczytelny/i);
    assert.ok(Array.isArray(payload.data.hypotheses));
    assert.equal(payload.data.hypotheses.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /ai/chat validates request payload', async () => {
  const { server, baseUrl } = await startServerForTest();
  try {
    const response = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: buildHeaders('token-user-a'),
      body: JSON.stringify({ question: '' }),
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.ok, false);
    assert.equal(payload.diagnosticCode, 'AIW_VALIDATION');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /ai/chat maps provider error deterministically', async () => {
  const { server, baseUrl } = await startServerForTest();
  try {
    const response = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: buildHeaders('token-user-a'),
      body: JSON.stringify({ question: 'force-provider-error' }),
    });
    const payload = await response.json();

    assert.equal(response.status, 502);
    assert.equal(payload.ok, false);
    assert.equal(payload.diagnosticCode, 'AIW_PROVIDER_ERROR');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /ai/chat maps timeout deterministically', async () => {
  const { server, baseUrl } = await startServerForTest();
  try {
    const response = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: buildHeaders('token-user-a'),
      body: JSON.stringify({ question: 'force-timeout' }),
    });
    const payload = await response.json();

    assert.equal(response.status, 504);
    assert.equal(payload.ok, false);
    assert.equal(payload.diagnosticCode, 'AIW_TIMEOUT');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /ai/chat returns scoped user response', async () => {
  const { server, baseUrl } = await startServerForTest();
  try {
    const response = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: buildHeaders('token-user-a'),
      body: JSON.stringify({
        question: 'Jak poprawic stabilnosc parametrow?',
        tankId: 'tank_a',
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.diagnosticCode, 'AIW_OK');
    assert.match(payload.data.answer, /Odpowiedz AI/);
    assert.equal(payload.data.contextSummary.selectedTank.id, 'tank_a');
    assert.equal(payload.data.contextSummary.tankCount, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /ai/vision/analyze requires image payload', async () => {
  const { server, baseUrl } = await startServerForTest();
  try {
    const response = await fetch(`${baseUrl}/ai/vision/analyze`, {
      method: 'POST',
      headers: buildHeaders('token-user-a'),
      body: JSON.stringify({ question: 'Czy to glony?' }),
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.ok, false);
    assert.equal(payload.diagnosticCode, 'AIW_VALIDATION');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /ai/vision/analyze returns analysis for authorized user', async () => {
  const { server, baseUrl } = await startServerForTest();
  try {
    const response = await fetch(`${baseUrl}/ai/vision/analyze`, {
      method: 'POST',
      headers: buildHeaders('token-user-a'),
      body: JSON.stringify({
        question: 'Czy to glony nitkowate?',
        imageUrl: 'https://example.com/test-image.jpg',
        tankId: 'tank_a',
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.diagnosticCode, 'AIW_OK');
    assert.equal(payload.data.contextSummary.selectedTank.id, 'tank_a');
    assert.ok(Array.isArray(payload.data.hypotheses));
    assert.ok(payload.data.hypotheses.length > 0);
    assert.ok(Array.isArray(payload.data.actionPlan));
    assert.ok(payload.data.actionPlan.length > 0);
    assert.ok(Array.isArray(payload.data.verificationSteps));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
