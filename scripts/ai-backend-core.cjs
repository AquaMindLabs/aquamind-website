const { getFirestore } = require('firebase-admin/firestore');
const { buildUserAquariumContext } = require('./ai-context-builder.cjs');

const AI_DIAGNOSTIC_CODES = Object.freeze({
  OK: 'AIW_OK',
  UNAUTHORIZED: 'AIW_UNAUTHORIZED',
  TIMEOUT: 'AIW_TIMEOUT',
  PROVIDER_ERROR: 'AIW_PROVIDER_ERROR',
  VALIDATION: 'AIW_VALIDATION',
  INTERNAL: 'AIW_INTERNAL',
});

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TEXT_LENGTH = 4000;
const MAX_IMAGE_BASE64_LENGTH = 2_000_000;
const MAX_ITEMS_PER_COLLECTION = 80;

class AiBackendError extends Error {
  constructor(code, message, httpStatus = 500) {
    super(message);
    this.name = 'AiBackendError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function createAiBackendError(code, message, httpStatus = 500) {
  return new AiBackendError(code, message, httpStatus);
}

function toSafeString(value, maxLength = MAX_TEXT_LENGTH) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength);
}

function pickPayloadKeys(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [];
  }
  return Object.keys(payload).slice(0, 40);
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseBearerToken(headers = {}) {
  const authorization = toSafeString(headers.authorization, 4096);
  if (!authorization) {
    return '';
  }
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return authorization.slice(7).trim();
}

function validateLocale(value) {
  const locale = toSafeString(value, 16).toLowerCase();
  if (!locale) {
    return 'pl';
  }
  if (locale === 'pl' || locale === 'en' || locale === 'de') {
    return locale;
  }
  return 'pl';
}

function validateOptionalTankId(value) {
  const tankId = toSafeString(value, 128);
  if (!tankId) {
    return null;
  }
  return tankId;
}

function validateChatRequest(payload) {
  if (!isObjectRecord(payload)) {
    throw createAiBackendError(
      AI_DIAGNOSTIC_CODES.VALIDATION,
      'Nieprawidlowe dane zapytania AI.',
      400
    );
  }

  const question = toSafeString(payload.question, MAX_TEXT_LENGTH);
  if (!question || question.length < 2) {
    throw createAiBackendError(
      AI_DIAGNOSTIC_CODES.VALIDATION,
      'Pytanie jest wymagane.',
      400
    );
  }

  const additionalInfo = toSafeString(payload.additionalInfo, MAX_TEXT_LENGTH);

  return {
    question,
    additionalInfo,
    tankId: validateOptionalTankId(payload.tankId),
    locale: validateLocale(payload.locale),
  };
}

function validateVisionRequest(payload) {
  if (!isObjectRecord(payload)) {
    throw createAiBackendError(
      AI_DIAGNOSTIC_CODES.VALIDATION,
      'Nieprawidlowe dane analizy obrazu.',
      400
    );
  }

  const question = toSafeString(payload.question, MAX_TEXT_LENGTH);
  const additionalInfo = toSafeString(payload.additionalInfo, MAX_TEXT_LENGTH);
  const imageUrl = toSafeString(payload.imageUrl, MAX_TEXT_LENGTH);
  const imageBase64 = toSafeString(payload.imageBase64, MAX_IMAGE_BASE64_LENGTH);

  if (!imageUrl && !imageBase64) {
    throw createAiBackendError(
      AI_DIAGNOSTIC_CODES.VALIDATION,
      'Do analizy wymagane jest zdjecie.',
      400
    );
  }

  if (imageBase64 && imageBase64.length >= MAX_IMAGE_BASE64_LENGTH) {
    throw createAiBackendError(
      AI_DIAGNOSTIC_CODES.VALIDATION,
      'Zbyt duzy payload obrazu.',
      400
    );
  }

  return {
    question,
    additionalInfo,
    imageUrl: imageUrl || null,
    imageBase64: imageBase64 || null,
    tankId: validateOptionalTankId(payload.tankId),
    locale: validateLocale(payload.locale),
  };
}

function toMillis(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const parsed = new Date(String(value ?? '')).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sortByTimestampDesc(items, getDateCandidate) {
  return [...items].sort((left, right) => {
    const leftMs = toMillis(getDateCandidate(left));
    const rightMs = toMillis(getDateCandidate(right));
    return rightMs - leftMs;
  });
}

function createFirestoreAiDataStore(db = getFirestore()) {
  async function readCollectionByUser(collectionName, uid) {
    const snapshot = await db
      .collection(collectionName)
      .where('userId', '==', uid)
      .limit(MAX_ITEMS_PER_COLLECTION)
      .get();

    return snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
  }

  return {
    async getUserData(uid, requestedTankId = null) {
      const [tanks, measurements, stockItems, issueCases] = await Promise.all([
        readCollectionByUser('tanks', uid),
        readCollectionByUser('measurements', uid),
        readCollectionByUser('stockItems', uid),
        readCollectionByUser('tankDiseaseCases', uid),
      ]);

      const normalizedTankId = validateOptionalTankId(requestedTankId);
      if (normalizedTankId) {
        const tankExists = tanks.some((tank) => String(tank?.id ?? '') === normalizedTankId);
        if (!tankExists) {
          throw createAiBackendError(
            AI_DIAGNOSTIC_CODES.VALIDATION,
            'Nie znaleziono wskazanego akwarium.',
            400
          );
        }
      }

      const filteredMeasurements = normalizedTankId
        ? measurements.filter((item) => String(item?.tankId ?? '') === normalizedTankId)
        : measurements;
      const filteredStockItems = normalizedTankId
        ? stockItems.filter((item) => String(item?.tankId ?? '') === normalizedTankId)
        : stockItems;
      const filteredIssueCases = normalizedTankId
        ? issueCases.filter((item) => String(item?.tankId ?? '') === normalizedTankId)
        : issueCases;

      return {
        uid,
        tanks,
        measurements: sortByTimestampDesc(
          filteredMeasurements,
          (item) => item?.measuredAt ?? item?.createdAt
        ),
        stockItems: sortByTimestampDesc(
          filteredStockItems,
          (item) => item?.createdAt ?? item?.updatedAt
        ),
        issueCases: sortByTimestampDesc(
          filteredIssueCases,
          (item) => item?.createdAt ?? item?.updatedAt
        ),
      };
    },
  };
}

function buildUserDataSummary(data, requestedTankId = null) {
  return buildUserAquariumContext(data?.uid ?? '', requestedTankId, data);
}

function buildRuleBasedChatAnswer(request, summary) {
  const lines = [];
  if (summary.selectedTank) {
    lines.push(
      `Kontekst: akwarium "${summary.selectedTank.name || 'bez nazwy'}" (${Number.isFinite(summary.selectedTank.liters) ? `${summary.selectedTank.liters} l` : 'litraz nieznany'}).`
    );
  } else {
    lines.push('Kontekst: brak aktywnego akwarium w danych.');
  }

  lines.push(
    `Dane: pomiary=${summary.measurementCount}, obsada=${summary.stockCount} (ryby=${summary.fishCount}, rosliny=${summary.plantCount}), aktywne problemy=${summary.activeIssueCount}.`
  );

  if (summary.latestCoreMeasurements?.measuredAt) {
    lines.push(
      `Ostatni pomiar: pH=${Number.isFinite(summary.latestCoreMeasurements.ph) ? summary.latestCoreMeasurements.ph : 'brak'}, NO2=${Number.isFinite(summary.latestCoreMeasurements.no2) ? summary.latestCoreMeasurements.no2 : 'brak'}, NO3=${Number.isFinite(summary.latestCoreMeasurements.no3) ? summary.latestCoreMeasurements.no3 : 'brak'}, temp=${Number.isFinite(summary.latestCoreMeasurements.temperature) ? summary.latestCoreMeasurements.temperature : 'brak'}.`
    );
  } else {
    lines.push('Brak aktualnego pomiaru - najpierw wykonaj podstawowy test wody.');
  }

  lines.push(`Pytanie uzytkownika: "${request.question}"`);

  const recommendations = [];
  if (!summary.latestCoreMeasurements?.measuredAt) {
    recommendations.push('Dodaj pomiar pH, NO2, NO3 i temperatury przed kolejna decyzja.');
  }
  if (summary.activeIssueCount > 0) {
    recommendations.push('Priorytet: domknij aktywne przypadki (choroby/glony) przed duzymi zmianami obsady.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Wprowadzaj zmiany stopniowo i potwierdzaj efekty kolejnym pomiarem po 24-48h.');
  }

  return {
    answer: lines.join(' '),
    recommendations,
    warnings: [],
  };
}

function buildRuleBasedVisionAnswer(request, summary) {
  const text = `${request.question || ''} ${request.additionalInfo || ''}`.toLowerCase();
  const looksUnreadable =
    text.includes('nieczytel') ||
    text.includes('rozmaz') ||
    text.includes('blur') ||
    text.includes('dark') ||
    text.includes('ciemne');

  if (looksUnreadable) {
    return {
      summary:
        'Obraz jest nieczytelny. Zrob wyrazniejsze zdjecie (ostre, dobre swiatlo, blizszy plan) i powtorz analize.',
      hypotheses: [],
      verificationSteps: [
        'Wykonaj nowe zdjecie przy lepszym oswietleniu.',
        'Sprawdz pomiary pH, NO2, NO3 i temperature, aby potwierdzic obserwacje.',
      ],
      recommendations: [
        'Nie wprowadzaj duzych zmian na podstawie nieczytelnego obrazu.',
      ],
      actionPlan: [
        'Zrob nowe zdjecie z bliska i z boku akwarium.',
        'Powtorz analize obrazu.',
        'Zweryfikuj parametry testami wody.',
      ],
      warnings: ['To nie jest porada weterynaryjna.'],
    };
  }

  let primaryCategory = 'general';
  if (text.includes('glon') || text.includes('algae')) {
    primaryCategory = 'algae';
  } else if (text.includes('ryb') || text.includes('fish')) {
    primaryCategory = 'fish';
  } else if (text.includes('roslin') || text.includes('plant')) {
    primaryCategory = 'plant';
  }

  const hypotheses =
    primaryCategory === 'algae'
      ? [
          {
            key: 'algae_growth',
            label: 'Mozliwy problem glonowy',
            confidence: 0.62,
          },
        ]
      : primaryCategory === 'fish'
        ? [
            {
              key: 'fish_stress',
              label: 'Mozliwe objawy stresu ryb',
              confidence: 0.58,
            },
          ]
        : primaryCategory === 'plant'
          ? [
              {
                key: 'plant_deficiency',
                label: 'Mozliwe oznaki niedoboru u roslin',
                confidence: 0.56,
              },
            ]
          : [
              {
                key: 'general_observation',
                label: 'Wymagana dodatkowa weryfikacja pomiarami',
                confidence: 0.51,
              },
            ];

  const verificationSteps = [
    'Sprawdz aktualny pomiar pH, NO2, NO3 i temperatury.',
    'Porownaj wynik z historia z ostatnich 7 dni.',
    'Obserwuj zmiany po 24h i unikaj wielu modyfikacji naraz.',
  ];

  const recommendations = [];
  if (summary.activeIssueCount > 0) {
    recommendations.push('Najpierw domknij aktywne przypadki leczenia/ograniczania glonow.');
  }
  recommendations.push('Wykonaj dokumentacje zdjeciowa przed i po zmianach.');
  const actionPlan = [
    'Wykonaj pomiar pH, NO2, NO3 i temperatury.',
    'Porownaj wynik z historia z 7 dni.',
    'Wprowadz 1 mala zmiane i ocen efekt po 24h.',
  ];

  return {
    summary:
      'Analiza obrazu ma charakter wspierajacy i wymaga potwierdzenia pomiarami.',
    hypotheses,
    verificationSteps,
    recommendations,
    actionPlan,
    warnings: ['To nie jest porada weterynaryjna.'],
  };
}

function createRuleBasedAiProvider() {
  return {
    async generateChat({ request, contextSummary }) {
      return buildRuleBasedChatAnswer(request, contextSummary);
    },
    async analyzeVision({ request, contextSummary }) {
      return buildRuleBasedVisionAnswer(request, contextSummary);
    },
  };
}

function withTimeout(promise, timeoutMs) {
  const timeout = Number(timeoutMs);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return promise;
  }

  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        createAiBackendError(
          AI_DIAGNOSTIC_CODES.TIMEOUT,
          'Przekroczono limit czasu odpowiedzi AI.',
          504
        )
      );
    }, timeout);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function normalizeChatProviderResponse(value) {
  if (!isObjectRecord(value)) {
    throw createAiBackendError(
      AI_DIAGNOSTIC_CODES.PROVIDER_ERROR,
      'Provider AI zwrocil nieprawidlowy format odpowiedzi.',
      502
    );
  }

  const answer = toSafeString(value.answer, 8000);
  if (!answer) {
    throw createAiBackendError(
      AI_DIAGNOSTIC_CODES.PROVIDER_ERROR,
      'Provider AI nie zwrocil odpowiedzi.',
      502
    );
  }

  const recommendations = Array.isArray(value.recommendations)
    ? value.recommendations
        .map((item) => toSafeString(item, 512))
        .filter(Boolean)
        .slice(0, 6)
    : [];
  const warnings = Array.isArray(value.warnings)
    ? value.warnings
        .map((item) => toSafeString(item, 512))
        .filter(Boolean)
        .slice(0, 6)
    : [];

  return {
    answer,
    recommendations,
    warnings,
  };
}

function normalizeVisionProviderResponse(value) {
  if (!isObjectRecord(value)) {
    throw createAiBackendError(
      AI_DIAGNOSTIC_CODES.PROVIDER_ERROR,
      'Provider AI zwrocil nieprawidlowy format analizy obrazu.',
      502
    );
  }

  const summary = toSafeString(value.summary, 2000);
  const hypotheses = Array.isArray(value.hypotheses)
    ? value.hypotheses
        .map((item) => ({
          key: toSafeString(item?.key, 120),
          label: toSafeString(item?.label, 240),
          confidence: Number(item?.confidence),
        }))
        .filter(
          (item) =>
            item.key &&
            item.label &&
            Number.isFinite(item.confidence) &&
            item.confidence >= 0 &&
            item.confidence <= 1
        )
        .slice(0, 6)
    : [];

  const verificationSteps = Array.isArray(value.verificationSteps)
    ? value.verificationSteps
        .map((item) => toSafeString(item, 400))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const recommendations = Array.isArray(value.recommendations)
    ? value.recommendations
        .map((item) => toSafeString(item, 400))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const actionPlan = Array.isArray(value.actionPlan)
    ? value.actionPlan
        .map((item) => toSafeString(item, 400))
        .filter(Boolean)
        .slice(0, 8)
    : recommendations.slice(0, 5);
  const warnings = Array.isArray(value.warnings)
    ? value.warnings
        .map((item) => toSafeString(item, 400))
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const hasNoUsefulData = !summary && hypotheses.length === 0;

  return {
    summary: hasNoUsefulData
      ? 'Obraz jest nieczytelny. Zrob wyrazniejsze zdjecie i powtorz analize.'
      : summary || 'Brak jednoznacznej diagnozy na podstawie obrazu.',
    hypotheses,
    verificationSteps,
    recommendations,
    actionPlan,
    warnings,
  };
}

function normalizeAuthError(error) {
  const code = toSafeString(error?.code, 120);
  if (code.startsWith('auth/')) {
    return createAiBackendError(
      AI_DIAGNOSTIC_CODES.UNAUTHORIZED,
      'Brak autoryzacji.',
      401
    );
  }
  return null;
}

function mapUnknownErrorToAiError(error) {
  if (error instanceof AiBackendError) {
    return error;
  }

  const authMapped = normalizeAuthError(error);
  if (authMapped) {
    return authMapped;
  }

  return createAiBackendError(
    AI_DIAGNOSTIC_CODES.INTERNAL,
    'Wystapil nieoczekiwany blad backendu AI.',
    500
  );
}

function createSafeLogContext(base) {
  return {
    endpoint: toSafeString(base.endpoint, 80),
    operation: toSafeString(base.operation, 80),
    diagnosticCode: toSafeString(base.diagnosticCode, 80),
    uid: toSafeString(base.uid, 128) || null,
    tankId: toSafeString(base.tankId, 128) || null,
    payloadKeys: Array.isArray(base.payloadKeys) ? base.payloadKeys : [],
    questionLength: Number(base.questionLength) || 0,
    additionalInfoLength: Number(base.additionalInfoLength) || 0,
    hasImageUrl: Boolean(base.hasImageUrl),
    hasImageBase64: Boolean(base.hasImageBase64),
    durationMs: Number(base.durationMs) || 0,
    provider: toSafeString(base.provider, 64) || 'unknown',
    httpStatus: Number(base.httpStatus) || 0,
  };
}

function logOperation(logger, level, message, context) {
  const safeContext = createSafeLogContext(context);
  const loggerMethod =
    level === 'error'
      ? logger?.error
      : level === 'warn'
        ? logger?.warn
        : logger?.info;
  if (typeof loggerMethod === 'function') {
    loggerMethod(message, safeContext);
  }
}

function createAiRequestHandlers(deps) {
  const authVerifier = deps?.authVerifier;
  const dataStore = deps?.dataStore;
  const aiProvider = deps?.aiProvider ?? createRuleBasedAiProvider();
  const providerTimeoutMs =
    Number(deps?.providerTimeoutMs) > 0
      ? Number(deps.providerTimeoutMs)
      : DEFAULT_TIMEOUT_MS;
  const logger = deps?.logger ?? console;
  const now = typeof deps?.now === 'function' ? deps.now : Date.now;
  const providerName = toSafeString(deps?.providerName, 64) || 'rule_based';

  if (!authVerifier || typeof authVerifier.verifyIdToken !== 'function') {
    throw new Error('authVerifier.verifyIdToken is required');
  }
  if (!dataStore || typeof dataStore.getUserData !== 'function') {
    throw new Error('dataStore.getUserData is required');
  }
  if (
    !aiProvider ||
    typeof aiProvider.generateChat !== 'function' ||
    typeof aiProvider.analyzeVision !== 'function'
  ) {
    throw new Error('aiProvider.generateChat and aiProvider.analyzeVision are required');
  }

  async function resolveUidFromHeaders(headers) {
    const token = parseBearerToken(headers);
    if (!token) {
      throw createAiBackendError(
        AI_DIAGNOSTIC_CODES.UNAUTHORIZED,
        'Brak autoryzacji.',
        401
      );
    }

    const decoded = await authVerifier.verifyIdToken(token);
    const uid = toSafeString(decoded?.uid, 128);
    if (!uid) {
      throw createAiBackendError(
        AI_DIAGNOSTIC_CODES.UNAUTHORIZED,
        'Brak autoryzacji.',
        401
      );
    }
    return uid;
  }

  async function handleChat({ headers, payload }) {
    const startedAt = now();
    const payloadKeys = pickPayloadKeys(payload);

    let uid = null;
    let request = null;
    try {
      request = validateChatRequest(payload);
      uid = await resolveUidFromHeaders(headers);
      const userData = await dataStore.getUserData(uid, request.tankId);
      const contextSummary = buildUserAquariumContext(uid, request.tankId, userData);

      const providerResult = await withTimeout(
        aiProvider.generateChat({
          uid,
          request,
          contextSummary,
        }),
        providerTimeoutMs
      );

      const normalized = normalizeChatProviderResponse(providerResult);
      const durationMs = now() - startedAt;

      logOperation(logger, 'info', 'ai_chat_request_processed', {
        endpoint: '/ai/chat',
        operation: 'chat',
        diagnosticCode: AI_DIAGNOSTIC_CODES.OK,
        uid,
        tankId: request.tankId,
        payloadKeys,
        questionLength: request.question.length,
        additionalInfoLength: request.additionalInfo.length,
        provider: providerName,
        durationMs,
        httpStatus: 200,
      });

      return {
        httpStatus: 200,
        body: {
          ok: true,
          diagnosticCode: AI_DIAGNOSTIC_CODES.OK,
          data: {
            answer: normalized.answer,
            recommendations: normalized.recommendations,
            warnings: normalized.warnings,
            contextSummary,
          },
        },
      };
    } catch (rawError) {
      let mapped = mapUnknownErrorToAiError(rawError);
      if (
        !(rawError instanceof AiBackendError) &&
        mapped.code !== AI_DIAGNOSTIC_CODES.UNAUTHORIZED &&
        mapped.code !== AI_DIAGNOSTIC_CODES.VALIDATION &&
        mapped.code !== AI_DIAGNOSTIC_CODES.TIMEOUT
      ) {
        mapped = createAiBackendError(
          AI_DIAGNOSTIC_CODES.PROVIDER_ERROR,
          'Provider AI jest chwilowo niedostepny.',
          502
        );
      }

      const durationMs = now() - startedAt;
      logOperation(
        logger,
        mapped.code === AI_DIAGNOSTIC_CODES.INTERNAL ? 'error' : 'warn',
        'ai_chat_request_failed',
        {
          endpoint: '/ai/chat',
          operation: 'chat',
          diagnosticCode: mapped.code,
          uid,
          tankId: request?.tankId ?? null,
          payloadKeys,
          questionLength: request?.question?.length ?? 0,
          additionalInfoLength: request?.additionalInfo?.length ?? 0,
          provider: providerName,
          durationMs,
          httpStatus: mapped.httpStatus,
        }
      );

      return {
        httpStatus: mapped.httpStatus,
        body: {
          ok: false,
          diagnosticCode: mapped.code,
          message: mapped.message,
        },
      };
    }
  }

  async function handleVision({ headers, payload }) {
    const startedAt = now();
    const payloadKeys = pickPayloadKeys(payload);

    let uid = null;
    let request = null;
    try {
      request = validateVisionRequest(payload);
      uid = await resolveUidFromHeaders(headers);
      const userData = await dataStore.getUserData(uid, request.tankId);
      const contextSummary = buildUserAquariumContext(uid, request.tankId, userData);

      const providerResult = await withTimeout(
        aiProvider.analyzeVision({
          uid,
          request,
          contextSummary,
        }),
        providerTimeoutMs
      );
      const normalized = normalizeVisionProviderResponse(providerResult);
      const durationMs = now() - startedAt;

      logOperation(logger, 'info', 'ai_vision_request_processed', {
        endpoint: '/ai/vision/analyze',
        operation: 'vision',
        diagnosticCode: AI_DIAGNOSTIC_CODES.OK,
        uid,
        tankId: request.tankId,
        payloadKeys,
        questionLength: request.question.length,
        additionalInfoLength: request.additionalInfo.length,
        hasImageUrl: Boolean(request.imageUrl),
        hasImageBase64: Boolean(request.imageBase64),
        provider: providerName,
        durationMs,
        httpStatus: 200,
      });

      return {
        httpStatus: 200,
        body: {
          ok: true,
          diagnosticCode: AI_DIAGNOSTIC_CODES.OK,
          data: {
            ...normalized,
            contextSummary,
          },
        },
      };
    } catch (rawError) {
      let mapped = mapUnknownErrorToAiError(rawError);
      if (
        !(rawError instanceof AiBackendError) &&
        mapped.code !== AI_DIAGNOSTIC_CODES.UNAUTHORIZED &&
        mapped.code !== AI_DIAGNOSTIC_CODES.VALIDATION &&
        mapped.code !== AI_DIAGNOSTIC_CODES.TIMEOUT
      ) {
        mapped = createAiBackendError(
          AI_DIAGNOSTIC_CODES.PROVIDER_ERROR,
          'Provider AI jest chwilowo niedostepny.',
          502
        );
      }

      const durationMs = now() - startedAt;
      logOperation(
        logger,
        mapped.code === AI_DIAGNOSTIC_CODES.INTERNAL ? 'error' : 'warn',
        'ai_vision_request_failed',
        {
          endpoint: '/ai/vision/analyze',
          operation: 'vision',
          diagnosticCode: mapped.code,
          uid,
          tankId: request?.tankId ?? null,
          payloadKeys,
          questionLength: request?.question?.length ?? 0,
          additionalInfoLength: request?.additionalInfo?.length ?? 0,
          hasImageUrl: Boolean(request?.imageUrl),
          hasImageBase64: Boolean(request?.imageBase64),
          provider: providerName,
          durationMs,
          httpStatus: mapped.httpStatus,
        }
      );

      return {
        httpStatus: mapped.httpStatus,
        body: {
          ok: false,
          diagnosticCode: mapped.code,
          message: mapped.message,
        },
      };
    }
  }

  return {
    handleChat,
    handleVision,
  };
}

module.exports = {
  AI_DIAGNOSTIC_CODES,
  AiBackendError,
  createAiBackendError,
  validateChatRequest,
  validateVisionRequest,
  parseBearerToken,
  createFirestoreAiDataStore,
  buildUserAquariumContext,
  buildUserDataSummary,
  createRuleBasedAiProvider,
  createAiRequestHandlers,
};
