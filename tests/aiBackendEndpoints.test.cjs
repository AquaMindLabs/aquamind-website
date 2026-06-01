const assert = require('node:assert/strict');
const test = require('node:test');
const { createAiHttpServer } = require('../scripts/ai-backend-server.cjs');
const {
  AI_DIAGNOSTIC_CODES,
  createAiBackendError,
} = require('../scripts/ai-backend-core.cjs');

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

function createQuotaDataStore(initialUsage = { chatUsed: 0, visionUsed: 0 }) {
  const baseStore = createDataStore();
  const usage = {
    period: '2026-05',
    chatUsed: Number(initialUsage.chatUsed) || 0,
    visionUsed: Number(initialUsage.visionUsed) || 0,
  };
  const toUsageStatus = (limits) => ({
    period: usage.period,
    text: {
      used: usage.chatUsed,
      limit: limits.chat,
      remaining: Math.max(0, limits.chat - usage.chatUsed),
    },
    vision: {
      used: usage.visionUsed,
      limit: limits.vision,
      remaining: Math.max(0, limits.vision - usage.visionUsed),
    },
  });

  return {
    ...baseStore,
    async getAiUsage(uid, limits) {
      assert.equal(uid, 'user_a');
      return toUsageStatus(limits);
    },
    async consumeAiUsage(uid, operation, limits) {
      assert.equal(uid, 'user_a');
      if (operation === 'vision') {
        if (usage.visionUsed >= limits.vision) {
          throw createAiBackendError(
            AI_DIAGNOSTIC_CODES.QUOTA_EXCEEDED,
            'Wykorzystano miesieczny limit analiz zdjec AI.',
            429,
            { usage: toUsageStatus(limits) }
          );
        }
        usage.visionUsed += 1;
      } else {
        if (usage.chatUsed >= limits.chat) {
          throw createAiBackendError(
            AI_DIAGNOSTIC_CODES.QUOTA_EXCEEDED,
            'Wykorzystano miesieczny limit pytan tekstowych AI.',
            429,
            { usage: toUsageStatus(limits) }
          );
        }
        usage.chatUsed += 1;
      }
      return toUsageStatus(limits);
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
      if (request.question === 'force-invalid-json') {
        return null;
      }
      if (request.mode === 'water_history_analysis') {
        const additionalInfo = String(request.additionalInfo ?? '');
        const hasLimitedTrendData =
          additionalInfo.includes('"measurementCount":1') ||
          additionalInfo.includes('"measurementCount":0');
        const hasStaleDataHint =
          additionalInfo.includes('"latestMeasurementAgeDays":') &&
          additionalInfo.match(/"latestMeasurementAgeDays":\s*([3-9]\d|[1-9]\d{2,})/);
        return {
          answer: hasLimitedTrendData
            ? 'Na podstawie dostepnego pomiaru stan wyglada orientacyjnie stabilnie, ale warto potwierdzic to kolejnym pomiarem.'
            : `Trend pomiarow: ${request.question}`,
          recommendations: [
            'Zrob kontrolny pomiar NO2, NO3 i temperatury.',
            'Porownaj wynik po 24-48h bez gwaltownych zmian.',
          ],
          warnings: hasStaleDataHint
            ? ['Analiza moze byc mniej aktualna z powodu starych pomiarow.']
            : [],
        };
      }
      if (request.mode === 'algae_analysis') {
        return {
          answer:
            'AI wskazuje trend glonowy: mozliwy problem z nadmiarem swiatla lub niestabilnym CO2. To nie jest pewna diagnoza.',
          recommendations: [
            'Zweryfikuj NO3 i PO4 oraz czas swiecenia.',
            'Sprawdz cyrkulacje i ogranicz karmienie na 2-3 dni.',
          ],
          warnings: ['Wynik jest orientacyjny i wymaga potwierdzenia pomiarami.'],
        };
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
      if (request.question === 'force-invalid-json') {
        return null;
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

async function startServerForTest(options = {}) {
  const server = createAiHttpServer({
    authVerifier: createAuthVerifier(),
    dataStore: options.dataStore ?? createDataStore(),
    aiProvider: createAiProvider(),
    providerTimeoutMs: 40,
    providerName: 'test_provider',
    quotaLimits: options.quotaLimits,
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

test('GET /healthz returns backend health without authorization', async () => {
  const { server, baseUrl } = await startServerForTest();
  try {
    const response = await fetch(`${baseUrl}/healthz`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.provider, 'test_provider');
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
    assert.match(payload.data.summary, /wynik mozna oprzec|widocznych elementach/i);
    assert.ok(Array.isArray(payload.data.hypotheses));
    assert.ok(payload.data.hypotheses.length > 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /ai/chat returns localized veterinary warning for english language', async () => {
  const { server, baseUrl } = await startServerForTest();
  try {
    const response = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: buildHeaders('token-user-a'),
      body: JSON.stringify({
        question: 'My fish is gasping and maybe sick. What should I do?',
        tankId: 'tank_a',
        userLanguage: 'en',
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.diagnosticCode, 'AIW_OK');
    assert.ok(Array.isArray(payload.data.warnings));
    assert.equal(
      payload.data.warnings.includes('This is not veterinary advice.'),
      true
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /ai/chat returns fallback payload when provider response is invalid', async () => {
  const { server, baseUrl } = await startServerForTest();
  try {
    const response = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: buildHeaders('token-user-a'),
      body: JSON.stringify({
        question: 'force-invalid-json',
        tankId: 'tank_a',
        userLanguage: 'en',
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.diagnosticCode, 'AIW_OK');
    assert.match(payload.data.answer, /could not process the ai response/i);
    assert.ok(Array.isArray(payload.data.recommendations));
    assert.ok(payload.data.recommendations.length > 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /ai/chat handles algae_analysis mode', async () => {
  const { server, baseUrl } = await startServerForTest();
  try {
    const response = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: buildHeaders('token-user-a'),
      body: JSON.stringify({
        question: 'Mam czarne kepki na lisciach i korzeniu. Co to moze byc?',
        mode: 'algae_analysis',
        tankId: 'tank_a',
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.diagnosticCode, 'AIW_OK');
    assert.match(String(payload?.data?.answer ?? ''), /glon|swiatl|CO2/i);
    assert.ok(Array.isArray(payload?.data?.recommendations));
    assert.ok(payload.data.recommendations.length > 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /ai/vision/analyze returns localized veterinary warning for english language', async () => {
  const { server, baseUrl } = await startServerForTest();
  try {
    const response = await fetch(`${baseUrl}/ai/vision/analyze`, {
      method: 'POST',
      headers: buildHeaders('token-user-a'),
      body: JSON.stringify({
        question: 'fish gasping at surface',
        imageUrl: 'https://example.com/test-image.jpg',
        tankId: 'tank_a',
        userLanguage: 'en',
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.diagnosticCode, 'AIW_OK');
    assert.equal(
      payload.data.warnings.includes('This is not veterinary advice.'),
      true
    );
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

test('POST /ai/chat returns local fallback when OpenAI provider fails', async () => {
  const server = createAiHttpServer({
    authVerifier: createAuthVerifier(),
    dataStore: createDataStore(),
    aiProvider: {
      async generateChat() {
        throw new Error('provider_down');
      },
      async analyzeVision() {
        throw new Error('provider_down');
      },
    },
    providerTimeoutMs: 40,
    providerName: 'openai',
    logger: {
      info: () => null,
      warn: () => null,
      error: () => null,
    },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/ai/chat`, {
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
    assert.match(String(payload?.data?.answer ?? ''), /akwarium|parametr/i);
    assert.equal(
      payload.data.warnings.some((warning) =>
        String(warning).includes('awaryjna odpowiedz lokalna')
      ),
      true
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /ai/chat returns local fallback when OpenAI fetch fails', async () => {
  const providerError = new Error('fetch failed');
  providerError.code = 'AIW_PROVIDER_ERROR';
  providerError.httpStatus = 502;
  providerError.providerHttpStatus = 0;
  providerError.providerErrorType = 'TypeError';
  providerError.providerErrorCode = 'UND_ERR_CONNECT_TIMEOUT';
  providerError.providerErrorMessage = 'fetch failed';

  const server = createAiHttpServer({
    authVerifier: createAuthVerifier(),
    dataStore: createDataStore(),
    aiProvider: {
      async generateChat() {
        throw providerError;
      },
      async analyzeVision() {
        throw providerError;
      },
    },
    providerTimeoutMs: 40,
    providerName: 'openai',
    logger: {
      info: () => null,
      warn: () => null,
      error: () => null,
    },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/ai/chat`, {
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
    assert.equal(
      payload.data.warnings.some((warning) =>
        String(warning).includes('awaryjna odpowiedz lokalna')
      ),
      true
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /ai/chat continues with minimal context when context loading fails', async () => {
  const server = createAiHttpServer({
    authVerifier: createAuthVerifier(),
    dataStore: {
      async getUserData() {
        throw new Error('firestore_unavailable');
      },
    },
    aiProvider: createAiProvider(),
    providerTimeoutMs: 40,
    providerName: 'openai',
    logger: {
      info: () => null,
      warn: () => null,
      error: () => null,
    },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/ai/chat`, {
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
    assert.equal(payload.data.contextSummary.tankCount, 0);
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

test('GET /ai/usage returns visible monthly AI limits', async () => {
  const { server, baseUrl } = await startServerForTest({
    dataStore: createQuotaDataStore({ chatUsed: 7, visionUsed: 2 }),
    quotaLimits: { chat: 100, vision: 20 },
  });
  try {
    const response = await fetch(`${baseUrl}/ai/usage`, {
      method: 'GET',
      headers: buildHeaders('token-user-a'),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.usage.text.used, 7);
    assert.equal(payload.data.usage.text.limit, 100);
    assert.equal(payload.data.usage.text.remaining, 93);
    assert.equal(payload.data.usage.vision.used, 2);
    assert.equal(payload.data.usage.vision.limit, 20);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /ai/chat enforces monthly text quota', async () => {
  const { server, baseUrl } = await startServerForTest({
    dataStore: createQuotaDataStore({ chatUsed: 1, visionUsed: 0 }),
    quotaLimits: { chat: 1, vision: 20 },
  });
  try {
    const response = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: buildHeaders('token-user-a'),
      body: JSON.stringify({
        question: 'Czy parametry sa ok?',
        tankId: 'tank_a',
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 429);
    assert.equal(payload.ok, false);
    assert.equal(payload.diagnosticCode, 'AIW_QUOTA_EXCEEDED');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /ai/chat supports water_history_analysis mode', async () => {
  const { server, baseUrl } = await startServerForTest();
  try {
    const response = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: buildHeaders('token-user-a'),
      body: JSON.stringify({
        question: 'Wyjasnij trend pomiarow.',
        tankId: 'tank_a',
        mode: 'water_history_analysis',
        additionalInfo: JSON.stringify({
          analysisMeta: {
            measurementCount: 1,
            latestMeasurementAgeDays: 45,
          },
        }),
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.diagnosticCode, 'AIW_OK');
    assert.match(payload.data.answer, /na podstawie dostepnego pomiaru/i);
    assert.ok(Array.isArray(payload.data.recommendations));
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

test('POST /ai/vision/analyze accepts image base64 payload', async () => {
  const { server, baseUrl } = await startServerForTest();
  try {
    const response = await fetch(`${baseUrl}/ai/vision/analyze`, {
      method: 'POST',
      headers: buildHeaders('token-user-a'),
      body: JSON.stringify({
        question: 'Czy widac problem na zdjeciu?',
        imageBase64: 'aW1hZ2UtYnl0ZXM=',
        tankId: 'tank_a',
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.diagnosticCode, 'AIW_OK');
    assert.equal(payload.data.contextSummary.selectedTank.id, 'tank_a');
    assert.ok(Array.isArray(payload.data.hypotheses));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
