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

const DEFAULT_TIMEOUT_MS = 45000;
const MAX_TEXT_LENGTH = 4000;
const MAX_IMAGE_BASE64_LENGTH = 8_000_000;
const MAX_ITEMS_PER_COLLECTION = 80;
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
const MAX_AI_CONTEXT_CHARS = 7000;
const DEFAULT_RESPONSE_LANGUAGE = 'pl';

class AiBackendError extends Error {
  constructor(code, message, httpStatus = 500, details = {}) {
    super(message);
    this.name = 'AiBackendError';
    this.code = code;
    this.httpStatus = httpStatus;
    if (isObjectRecord(details)) {
      Object.assign(this, details);
    }
  }
}

function createAiBackendError(code, message, httpStatus = 500, details = {}) {
  return new AiBackendError(code, message, httpStatus, details);
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

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toIso(value) {
  const parsed = new Date(String(value ?? '')).getTime();
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return new Date(parsed).toISOString();
}

function normalizeLanguageCode(value) {
  const raw = toSafeString(value, 24).toLowerCase();
  if (!raw) {
    return '';
  }
  if (raw.startsWith('pl')) {
    return 'pl';
  }
  if (raw.startsWith('en')) {
    return 'en';
  }
  if (raw.startsWith('de')) {
    return 'de';
  }
  return '';
}

function validateLocale(value) {
  return normalizeLanguageCode(value) || DEFAULT_RESPONSE_LANGUAGE;
}

function resolveResponseLanguage(request, context = null) {
  const candidates = [
    request?.userLanguage,
    request?.locale,
    request?.appLanguage,
    context?.userSettings?.language,
    context?.locale,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeLanguageCode(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return DEFAULT_RESPONSE_LANGUAGE;
}

function getLocalizedTexts(language) {
  const lang = normalizeLanguageCode(language) || DEFAULT_RESPONSE_LANGUAGE;
  if (lang === 'en') {
    return {
      vetWarning: 'This is not veterinary advice.',
      chatFallbackAnswer:
        'Could not process the AI response correctly. Please try again or clarify your question.',
      chatFallbackRecommendation:
        'Check whether the aquarium has basic data filled in: volume, stock, equipment, and water parameters.',
      visionFallbackSummary:
        'Could not analyze the image correctly. Try a clearer photo or describe what you want to verify.',
      visionFallbackSteps: [
        'Take a photo in good lighting.',
        'Make sure the problematic area is sharp and clearly visible.',
        'Add current water parameters if available.',
      ],
      noUsefulVisionSummary:
        'Could not analyze the image correctly. Try a clearer photo or describe what you want to verify.',
      unclearVisionSummary:
        'No clear diagnosis can be made from this image alone.',
      unknownHypothesisLabel: 'Unknown hypothesis',
    };
  }
  if (lang === 'de') {
    return {
      vetWarning: 'Dies ist keine tieraerztliche Beratung.',
      chatFallbackAnswer:
        'Die KI-Antwort konnte nicht korrekt verarbeitet werden. Bitte versuche es erneut oder praezisiere die Frage.',
      chatFallbackRecommendation:
        'Pruefe, ob im Aquarium die Basisdaten ergaenzt sind: Volumen, Besatz, Technik und Wasserwerte.',
      visionFallbackSummary:
        'Das Bild konnte nicht korrekt analysiert werden. Fuege ein schaerferes Bild hinzu oder beschreibe genauer, was geprueft werden soll.',
      visionFallbackSteps: [
        'Mache ein Foto bei gutem Licht.',
        'Stelle sicher, dass der problematische Bereich scharf und gut sichtbar ist.',
        'Ergaenze aktuelle Wasserwerte, falls verfuegbar.',
      ],
      noUsefulVisionSummary:
        'Das Bild konnte nicht korrekt analysiert werden. Fuege ein schaerferes Bild hinzu oder beschreibe genauer, was geprueft werden soll.',
      unclearVisionSummary:
        'Auf Basis dieses Bildes ist keine eindeutige Einschaetzung moeglich.',
      unknownHypothesisLabel: 'Unklare Hypothese',
    };
  }
  return {
    vetWarning: 'To nie jest porada weterynaryjna.',
    chatFallbackAnswer:
      'Nie udalo sie poprawnie przetworzyc odpowiedzi AI. Sprobuj ponownie albo doprecyzuj pytanie.',
    chatFallbackRecommendation:
      'Sprawdz, czy w akwarium sa uzupelnione podstawowe dane: litraz, obsada, sprzet i parametry wody.',
    visionFallbackSummary:
      'Nie udalo sie poprawnie przeanalizowac zdjecia. Sprobuj dodac wyrazniejsze zdjecie albo dopisz, co dokladnie chcesz sprawdzic.',
    visionFallbackSteps: [
      'Zrob zdjecie w dobrym swietle.',
      'Upewnij sie, ze problematyczny obszar jest ostry i dobrze widoczny.',
      'Uzupelnij aktualne parametry wody, jesli sa dostepne.',
    ],
    noUsefulVisionSummary:
      'Nie udalo sie poprawnie przeanalizowac zdjecia. Sprobuj dodac wyrazniejsze zdjecie albo dopisz, co dokladnie chcesz sprawdzic.',
    unclearVisionSummary:
      'Brak jednoznacznej diagnozy na podstawie obrazu.',
    unknownHypothesisLabel: 'Nieokreslona hipoteza',
  };
}

function pickByLanguage(language, variants) {
  const lang = normalizeLanguageCode(language) || DEFAULT_RESPONSE_LANGUAGE;
  if (lang === 'en') {
    return variants.en;
  }
  if (lang === 'de') {
    return variants.de;
  }
  return variants.pl;
}

function normalizeStringArray(value, maxItems, maxItemLength = 250) {
  const seen = new Set();
  const output = [];
  const list = Array.isArray(value) ? value : [];
  for (const item of list) {
    const normalized = toSafeString(item, maxItemLength);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
    if (output.length >= maxItems) {
      break;
    }
  }
  return output;
}

function pickStockLabel(item) {
  return (
    toSafeString(item?.commonName, 120) ||
    toSafeString(item?.speciesName, 120) ||
    toSafeString(item?.scientificName, 120) ||
    toSafeString(item?.name, 120) ||
    'pozycja'
  );
}

function pickStockType(item) {
  const normalized = toSafeString(item?.type, 32).toLowerCase();
  return normalized || 'other';
}

function normalizeEquipmentItems(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => isObjectRecord(item));
  }
  if (isObjectRecord(value)) {
    return [value];
  }
  return [];
}

const MEASUREMENT_VALUE_KEYS = [
  'ph',
  'gh',
  'kh',
  'no2',
  'no3',
  'nh3nh4',
  'nh3',
  'nh4',
  'po4',
  'fe',
  'temperature',
  'ca',
  'mg',
  'k',
  'tds',
  'co2',
];

function hasUsefulMeasurementData(item) {
  return MEASUREMENT_VALUE_KEYS.some((key) => toFiniteNumber(item?.[key]) !== null);
}

function mapMeasurement(item) {
  const mapped = {
    measuredAt: toIso(item?.measuredAt ?? item?.createdAt),
  };
  MEASUREMENT_VALUE_KEYS.forEach((key) => {
    mapped[key] = toFiniteNumber(item?.[key]);
  });
  return mapped;
}

function buildLatestMeasurementSnapshot(measurements) {
  const snapshot = { measuredAt: null };
  const valueSources = {};

  MEASUREMENT_VALUE_KEYS.forEach((key) => {
    const source = measurements.find((measurement) => toFiniteNumber(measurement?.[key]) !== null);
    snapshot[key] = source ? toFiniteNumber(source?.[key]) : null;
    if (source) {
      const measuredAt = toIso(source?.measuredAt ?? source?.createdAt);
      valueSources[key] = measuredAt;
      if (!snapshot.measuredAt) {
        snapshot.measuredAt = measuredAt;
      }
    }
  });

  return Object.keys(valueSources).length > 0
    ? {
        ...snapshot,
        valueSources,
      }
    : null;
}

function mapEquipmentEntry(item) {
  return {
    name:
      toSafeString(item?.modelName, 120) ||
      toSafeString(item?.name, 120) ||
      toSafeString(item?.typeLabel, 120) ||
      'sprzet',
    powerW: toFiniteNumber(item?.powerW ?? item?.power ?? item?.wattage),
    flowLph: toFiniteNumber(item?.flowLph ?? item?.realFlowLph ?? item?.ratedFlowLph),
  };
}

function hasVeterinaryRiskKeywords(value) {
  const text = toSafeString(value, 4000).toLowerCase();
  if (!text) {
    return false;
  }
  return [
    'disease',
    'treat',
    'treatment',
    'medicine',
    'medication',
    'parasite',
    'wound',
    'dead fish',
    'gasping',
    'rubbing',
    'krank',
    'behandlung',
    'medik',
    'wunde',
    'tot',
    'parasit',
    'chor',
    'lecze',
    'leczy',
    'martw',
    'padl',
    'padla',
    'padn',
    'lek',
    'antybiot',
    'dziwn',
    'osowial',
    'ociera',
    'oddech',
    'duszn',
    'kropk',
    'pasozyt',
    'plywa bokiem',
  ].some((token) => text.includes(token));
}

function buildAquariumAiContext({ request, userData, contextSummary }) {
  const tanks = toArray(userData?.tanks);
  const measurements = toArray(userData?.measurements);
  const stockItems = toArray(userData?.stockItems);
  const issueCases = toArray(userData?.issueCases);

  const selectedTankId =
    toSafeString(request?.tankId, 128) ||
    toSafeString(contextSummary?.selectedTank?.id, 128) ||
    toSafeString(tanks[0]?.id, 128) ||
    null;
  const selectedTank =
    tanks.find((tank) => toSafeString(tank?.id, 128) === selectedTankId) ?? tanks[0] ?? null;

  const scopedRawMeasurements = selectedTankId
    ? measurements.filter((item) => toSafeString(item?.tankId, 128) === selectedTankId)
    : measurements;
  const scopedMeasurements = scopedRawMeasurements.filter(hasUsefulMeasurementData);
  const scopedStockItems = selectedTankId
    ? stockItems.filter((item) => toSafeString(item?.tankId, 128) === selectedTankId)
    : stockItems;
  const scopedIssues = selectedTankId
    ? issueCases.filter((item) => toSafeString(item?.tankId, 128) === selectedTankId)
    : issueCases;

  const latestMeasurements = scopedMeasurements.slice(0, 8).map(mapMeasurement);
  const currentWater = buildLatestMeasurementSnapshot(scopedMeasurements) ?? {
    measuredAt: null,
    ph: null,
    gh: null,
    kh: null,
    no2: null,
    no3: null,
    nh3nh4: null,
    nh3: null,
    nh4: null,
    po4: null,
    fe: null,
    temperature: null,
    ca: null,
    mg: null,
    k: null,
    tds: null,
    co2: null,
  };

  const stockNormalized = scopedStockItems.slice(0, 30).map((item) => ({
    type: pickStockType(item),
    label: pickStockLabel(item),
    quantity: Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 1,
  }));
  const fish = stockNormalized.filter((item) => item.type === 'fish').slice(0, 12);
  const plants = stockNormalized.filter((item) => item.type === 'plant').slice(0, 12);
  const inverts = stockNormalized
    .filter((item) => item.type.includes('shrimp') || item.type.includes('snail'))
    .slice(0, 8);
  const otherStock = stockNormalized
    .filter((item) => !['fish', 'plant'].includes(item.type) && !item.type.includes('shrimp'))
    .slice(0, 8);

  const heaters = normalizeEquipmentItems(
    selectedTank?.heaterEquipments ?? selectedTank?.heaterEquipment
  )
    .map(mapEquipmentEntry)
    .slice(0, 8);
  const filters = normalizeEquipmentItems(
    selectedTank?.filterEquipments ?? selectedTank?.filterEquipment
  )
    .map(mapEquipmentEntry)
    .slice(0, 8);
  const lights = [
    {
      name:
        toSafeString(selectedTank?.lightModelName, 120) ||
        toSafeString(selectedTank?.lightModelId, 120) ||
        '',
      powerW: toFiniteNumber(selectedTank?.lightPowerW ?? selectedTank?.lightWattage),
    },
  ].filter((item) => item.name || item.powerW !== null);

  const mainProblems = [
    ...toArray(contextSummary?.activeIssues?.highlights).map((item) => ({
      source: 'active_issue',
      label:
        toSafeString(item?.type, 120) || toSafeString(item?.status, 80) || 'aktywny problem',
      openedAt: toSafeString(item?.openedAt, 64) || null,
    })),
    ...toArray(contextSummary?.actionCalendarHighlights?.highlights)
      .filter((item) => toSafeString(item?.status, 32) === 'overdue')
      .map((item) => ({
        source: 'action_calendar',
        label: `Zalegle: ${toSafeString(item?.label, 120) || 'akcja'}`,
        openedAt: toSafeString(item?.dueAt, 64) || null,
      })),
  ].slice(0, 8);

  const recentEvents = [
    ...scopedIssues.slice(0, 6).map((item) => ({
      type: 'issue_case',
      label:
        toSafeString(item?.diseaseType, 120) ||
        toSafeString(item?.issueType, 120) ||
        toSafeString(item?.name, 120) ||
        'zdarzenie',
      at: toIso(item?.updatedAt ?? item?.createdAt),
    })),
    ...toArray(contextSummary?.actionCalendarHighlights?.highlights).slice(0, 6).map((item) => ({
      type: 'calendar_action',
      label:
        toSafeString(item?.label, 120) || toSafeString(item?.key, 120) || 'akcja kalendarza',
      at: toSafeString(item?.dueAt, 64) || null,
      status: toSafeString(item?.status, 32) || null,
    })),
  ].slice(0, 10);

  const detailedRecommendations = toArray(contextSummary?.actionCalendarHighlights?.highlights)
    .map((item) => {
      const label = toSafeString(item?.label, 120);
      const status = toSafeString(item?.status, 32);
      if (!label) {
        return '';
      }
      return status ? `${label}: ${status}` : label;
    })
    .filter(Boolean)
    .slice(0, 8);

  return {
    version: 2,
    locale:
      normalizeLanguageCode(request?.locale) ||
      normalizeLanguageCode(contextSummary?.locale) ||
      '',
    userSettings: {
      language:
        normalizeLanguageCode(request?.userLanguage) ||
        normalizeLanguageCode(request?.appLanguage) ||
        normalizeLanguageCode(contextSummary?.userSettings?.language) ||
        normalizeLanguageCode(contextSummary?.locale) ||
        '',
    },
    aquarium: {
      tankId: selectedTankId,
      name: toSafeString(selectedTank?.name, 120) || '',
      liters: toFiniteNumber(selectedTank?.liters),
      aquariumType: toSafeString(selectedTank?.aquariumType, 64) || '',
      startType: toSafeString(selectedTank?.startType, 64) || '',
      targetTemperatureC: toFiniteNumber(
        selectedTank?.targetTemperature ??
          selectedTank?.targetTemperatureC ??
          selectedTank?.waterTemperatureTarget
      ),
      ambientTemperatureC: toFiniteNumber(
        selectedTank?.ambientTemperature ??
          selectedTank?.ambientTemperatureC ??
          selectedTank?.roomTemperature
      ),
      hasPlants: Boolean(selectedTank?.hasPlants),
      hasHidingPlaces: Boolean(selectedTank?.hasHidingPlaces),
    },
    currentWater,
    recentMeasurements: latestMeasurements,
    stock: {
      fish,
      plants,
      invertebrates: inverts,
      other: otherStock,
      totals: {
        fishCount: fish.reduce((sum, item) => sum + (item.quantity || 0), 0),
        plantCount: plants.reduce((sum, item) => sum + (item.quantity || 0), 0),
        itemCount: stockNormalized.length,
      },
    },
    equipment: {
      heaters,
      filters,
      lights,
    },
    appAnalysis: {
      activeIssueCount: Number(contextSummary?.activeIssueCount) || 0,
      stockCount: Number(contextSummary?.stockCount) || 0,
      measurementCount: scopedMeasurements.length || Number(contextSummary?.measurementCount) || 0,
      rawMeasurementCount: scopedRawMeasurements.length,
      overdueActions:
        Number(contextSummary?.actionCalendarHighlights?.overdueCount) || 0,
    },
    mainProblems,
    recentEvents,
    detailedRecommendations,
    missingData: {
      noTank: !selectedTankId,
      noMeasurements: latestMeasurements.length === 0,
      noStock: stockNormalized.length === 0,
      noEquipment: heaters.length + filters.length + lights.length === 0,
    },
  };
}

function limitAiContext(context, maxChars = MAX_AI_CONTEXT_CHARS) {
  const safeMax = Number.isFinite(Number(maxChars)) && Number(maxChars) > 500
    ? Number(maxChars)
    : MAX_AI_CONTEXT_CHARS;
  const next = isObjectRecord(context) ? JSON.parse(JSON.stringify(context)) : {};
  const estimate = () => JSON.stringify(next).length;
  const apply = (updater) => {
    if (estimate() <= safeMax) {
      return;
    }
    updater();
  };

  // 1) stale events
  apply(() => {
    const events = toArray(next.recentEvents);
    if (events.length > 5) {
      next.recentEvents = events.slice(0, 5);
    } else if (events.length > 3) {
      next.recentEvents = events.slice(0, 3);
    } else {
      next.recentEvents = [];
    }
  });

  // 2) old measurements
  apply(() => {
    const measurements = toArray(next.recentMeasurements);
    if (measurements.length > 5) {
      next.recentMeasurements = measurements.slice(0, 5);
    } else if (measurements.length > 3) {
      next.recentMeasurements = measurements.slice(0, 3);
    } else if (measurements.length > 1) {
      next.recentMeasurements = measurements.slice(0, 1);
    }
  });

  // 3) plants
  apply(() => {
    if (isObjectRecord(next.stock)) {
      next.stock.plants = [];
      if (isObjectRecord(next.stock.totals)) {
        next.stock.totals.plantCount = 0;
      }
    }
  });

  // 4) detailed recommendations
  apply(() => {
    next.detailedRecommendations = [];
  });

  // 5) additional descriptions
  apply(() => {
    if (isObjectRecord(next.aquarium)) {
      delete next.aquarium.description;
      delete next.aquarium.notes;
    }
    next.mainProblems = toArray(next.mainProblems).map((item) => ({
      source: toSafeString(item?.source, 40),
      label: toSafeString(item?.label, 100),
      openedAt: toSafeString(item?.openedAt, 40) || null,
    }));
  });

  next.meta = {
    ...(isObjectRecord(next.meta) ? next.meta : {}),
    contextCharLength: estimate(),
    trimmed: estimate() > safeMax || Boolean(next.meta?.trimmed),
  };

  return next;
}

function stringifyAiContext(aiContext, maxChars = MAX_AI_CONTEXT_CHARS) {
  const limited = limitAiContext(aiContext, maxChars);
  return JSON.stringify(limited);
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

function validateOptionalTankId(value) {
  const tankId = toSafeString(value, 128);
  if (!tankId) {
    return null;
  }
  return tankId;
}

function validateOptionalMode(value, fallbackMode) {
  const mode = toSafeString(value, 64).toLowerCase();
  return mode || fallbackMode;
}

function validateOptionalLanguage(value) {
  return normalizeLanguageCode(value) || '';
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
    userLanguage: validateOptionalLanguage(payload.userLanguage),
    appLanguage: validateOptionalLanguage(payload.appLanguage),
    mode: validateOptionalMode(payload.mode, 'general'),
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
    userLanguage: validateOptionalLanguage(payload.userLanguage),
    appLanguage: validateOptionalLanguage(payload.appLanguage),
    mode: validateOptionalMode(payload.mode, 'photo_analysis'),
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

function decodeFirestoreRestValue(value) {
  if (!isObjectRecord(value)) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) {
    return Boolean(value.booleanValue);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) {
    return Number(value.integerValue);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) {
    return Number(value.doubleValue);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) {
    return toSafeString(value.timestampValue, 80);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) {
    return toSafeString(value.stringValue, 4000);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'referenceValue')) {
    return toSafeString(value.referenceValue, 512);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'arrayValue')) {
    const values = Array.isArray(value.arrayValue?.values) ? value.arrayValue.values : [];
    return values.map(decodeFirestoreRestValue);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'mapValue')) {
    const fields = isObjectRecord(value.mapValue?.fields) ? value.mapValue.fields : {};
    return decodeFirestoreRestFields(fields);
  }
  return null;
}

function decodeFirestoreRestFields(fields) {
  const result = {};
  Object.entries(isObjectRecord(fields) ? fields : {}).forEach(([key, value]) => {
    result[key] = decodeFirestoreRestValue(value);
  });
  return result;
}

function decodeFirestoreRestDocument(document) {
  const name = toSafeString(document?.name, 2048);
  const id = name.split('/').filter(Boolean).pop() || '';
  return {
    id,
    ...decodeFirestoreRestFields(document?.fields),
  };
}

function getFirestoreRestProjectId(options = {}) {
  return toSafeString(
    options.projectId ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    120
  );
}

function shouldFallbackToFirestoreRest(error) {
  const message = toSafeString(error?.message, 600).toLowerCase();
  return (
    message.includes('could not load the default credentials') ||
    message.includes('application default credentials') ||
    message.includes('default credentials')
  );
}

function buildFirestoreRestError(error, collectionName) {
  const wrapped = createAiBackendError(
    AI_DIAGNOSTIC_CODES.INTERNAL,
    'Nie udalo sie odczytac danych Firestore.',
    500
  );
  wrapped.contextCollection = toSafeString(collectionName, 80) || null;
  wrapped.contextErrorType = toSafeString(error?.name, 120) || null;
  wrapped.contextErrorCode = toSafeString(error?.code, 120) || null;
  wrapped.contextErrorMessage = toSafeString(error?.message, 300) || null;
  return wrapped;
}

async function readCollectionByUserViaFirestoreRest({
  collectionName,
  uid,
  idToken,
  projectId,
}) {
  const safeProjectId = toSafeString(projectId, 120);
  const safeToken = toSafeString(idToken, 4096);
  if (!safeProjectId || !safeToken || typeof fetch !== 'function') {
    throw createAiBackendError(
      AI_DIAGNOSTIC_CODES.INTERNAL,
      'Brak konfiguracji do odczytu Firestore REST.',
      500
    );
  }

  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    safeProjectId
  )}/databases/(default)/documents:runQuery`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${safeToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collectionName }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'userId' },
            op: 'EQUAL',
            value: { stringValue: uid },
          },
        },
        limit: MAX_ITEMS_PER_COLLECTION,
      },
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorPayload = isObjectRecord(payload?.error) ? payload.error : {};
    const error = createAiBackendError(
      AI_DIAGNOSTIC_CODES.INTERNAL,
      'Nie udalo sie odczytac danych Firestore REST.',
      500
    );
    error.contextCollection = toSafeString(collectionName, 80) || null;
    error.contextErrorType = 'FirestoreRestError';
    error.contextErrorCode =
      toSafeString(errorPayload.status, 120) ||
      toSafeString(errorPayload.code, 120) ||
      String(response.status);
    error.contextErrorMessage =
      toSafeString(errorPayload.message, 300) ||
      `Firestore REST HTTP ${response.status}`;
    throw error;
  }

  const rows = Array.isArray(payload) ? payload : [];
  return rows
    .map((row) => (isObjectRecord(row?.document) ? decodeFirestoreRestDocument(row.document) : null))
    .filter(Boolean);
}

function createFirestoreAiDataStore(db = getFirestore(), options = {}) {
  async function readCollectionByUser(collectionName, uid, authContext = {}) {
    try {
      const snapshot = await db
        .collection(collectionName)
        .where('userId', '==', uid)
        .limit(MAX_ITEMS_PER_COLLECTION)
        .get();

      return snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));
    } catch (error) {
      if (!shouldFallbackToFirestoreRest(error)) {
        throw buildFirestoreRestError(error, collectionName);
      }

      return readCollectionByUserViaFirestoreRest({
        collectionName,
        uid,
        idToken: authContext.idToken,
        projectId: getFirestoreRestProjectId(options),
      });
    }
  }

  return {
    async getUserData(uid, requestedTankId = null, authContext = {}) {
      const [tanks, measurements, stockItems, issueCases] = await Promise.all([
        readCollectionByUser('tanks', uid, authContext),
        readCollectionByUser('measurements', uid, authContext),
        readCollectionByUser('stockItems', uid, authContext),
        readCollectionByUser('tankDiseaseCases', uid, authContext),
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
  const language = resolveResponseLanguage(request, summary);
  const tankName =
    toSafeString(summary?.selectedTank?.name, 120) ||
    toSafeString(summary?.aquarium?.name, 120) ||
    'bez nazwy';
  const tankLiters =
    toFiniteNumber(summary?.selectedTank?.liters) ??
    toFiniteNumber(summary?.aquarium?.liters);
  const latestCore =
    isObjectRecord(summary?.latestCoreMeasurements) ? summary.latestCoreMeasurements : summary?.currentWater;
  const measurementCount =
    Number(summary?.measurementCount) ||
    Number(summary?.appAnalysis?.measurementCount) ||
    toArray(summary?.recentMeasurements).length;
  const fishCount =
    Number(summary?.fishCount) ||
    Number(summary?.stock?.totals?.fishCount) ||
    0;
  const plantCount =
    Number(summary?.plantCount) ||
    Number(summary?.stock?.totals?.plantCount) ||
    0;
  const stockCount =
    Number(summary?.stockCount) ||
    Number(summary?.stock?.totals?.itemCount) ||
    fishCount + plantCount;
  const activeIssueCount =
    Number(summary?.activeIssueCount) ||
    Number(summary?.appAnalysis?.activeIssueCount) ||
    0;

  const lines = [];
  if (tankName || tankLiters !== null) {
    lines.push(
      pickByLanguage(language, {
        pl: `Kontekst: akwarium "${tankName}" (${Number.isFinite(tankLiters) ? `${tankLiters} l` : 'litraz nieznany'}).`,
        en: `Context: aquarium "${tankName}" (${Number.isFinite(tankLiters) ? `${tankLiters} l` : 'unknown volume'}).`,
        de: `Kontext: Aquarium "${tankName}" (${Number.isFinite(tankLiters) ? `${tankLiters} l` : 'Volumen unbekannt'}).`,
      })
    );
  } else {
    lines.push(
      pickByLanguage(language, {
        pl: 'Kontekst: brak aktywnego akwarium w danych.',
        en: 'Context: no active aquarium in data.',
        de: 'Kontext: kein aktives Aquarium in den Daten.',
      })
    );
  }

  lines.push(
    pickByLanguage(language, {
      pl: `Dane: pomiary=${measurementCount}, obsada=${stockCount} (ryby=${fishCount}, rosliny=${plantCount}), aktywne problemy=${activeIssueCount}.`,
      en: `Data: measurements=${measurementCount}, stock=${stockCount} (fish=${fishCount}, plants=${plantCount}), active issues=${activeIssueCount}.`,
      de: `Daten: Messungen=${measurementCount}, Besatz=${stockCount} (Fische=${fishCount}, Pflanzen=${plantCount}), aktive Probleme=${activeIssueCount}.`,
    })
  );

  if (latestCore?.measuredAt) {
    lines.push(
      pickByLanguage(language, {
        pl: `Ostatni pomiar: pH=${Number.isFinite(latestCore.ph) ? latestCore.ph : 'brak'}, NO2=${Number.isFinite(latestCore.no2) ? latestCore.no2 : 'brak'}, NO3=${Number.isFinite(latestCore.no3) ? latestCore.no3 : 'brak'}, temp=${Number.isFinite(latestCore.temperature) ? latestCore.temperature : 'brak'}.`,
        en: `Latest measurement: pH=${Number.isFinite(latestCore.ph) ? latestCore.ph : 'missing'}, NO2=${Number.isFinite(latestCore.no2) ? latestCore.no2 : 'missing'}, NO3=${Number.isFinite(latestCore.no3) ? latestCore.no3 : 'missing'}, temp=${Number.isFinite(latestCore.temperature) ? latestCore.temperature : 'missing'}.`,
        de: `Letzte Messung: pH=${Number.isFinite(latestCore.ph) ? latestCore.ph : 'fehlt'}, NO2=${Number.isFinite(latestCore.no2) ? latestCore.no2 : 'fehlt'}, NO3=${Number.isFinite(latestCore.no3) ? latestCore.no3 : 'fehlt'}, Temp=${Number.isFinite(latestCore.temperature) ? latestCore.temperature : 'fehlt'}.`,
      })
    );
  } else {
    lines.push(
      pickByLanguage(language, {
        pl: 'Brak aktualnego pomiaru - najpierw wykonaj podstawowy test wody.',
        en: 'No recent measurement - run a basic water test first.',
        de: 'Keine aktuelle Messung - zuerst einen grundlegenden Wassertest machen.',
      })
    );
  }

  lines.push(
    pickByLanguage(language, {
      pl: `Pytanie uzytkownika: "${request.question}"`,
      en: `User question: "${request.question}"`,
      de: `Frage des Nutzers: "${request.question}"`,
    })
  );

  const recommendations = [];
  if (!latestCore?.measuredAt) {
    recommendations.push(
      pickByLanguage(language, {
        pl: 'Dodaj pomiar pH, NO2, NO3 i temperatury przed kolejna decyzja.',
        en: 'Add pH, NO2, NO3, and temperature measurements before the next decision.',
        de: 'Ergaenze pH-, NO2-, NO3- und Temperaturmessungen vor der naechsten Entscheidung.',
      })
    );
  }
  if (activeIssueCount > 0) {
    recommendations.push(
      pickByLanguage(language, {
        pl: 'Priorytet: domknij aktywne przypadki (choroby/glony) przed duzymi zmianami obsady.',
        en: 'Priority: close active issue cases (disease/algae) before major stocking changes.',
        de: 'Prioritaet: aktive Problemfaelle (Krankheit/Algen) vor groesseren Besatz-Aenderungen abschliessen.',
      })
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      pickByLanguage(language, {
        pl: 'Wprowadzaj zmiany stopniowo i potwierdzaj efekty kolejnym pomiarem po 24-48h.',
        en: 'Apply changes gradually and verify the effect with another measurement after 24-48h.',
        de: 'Fuehre Aenderungen schrittweise durch und pruefe den Effekt mit einer weiteren Messung nach 24-48h.',
      })
    );
  }

  return {
    answer: lines.join(' '),
    recommendations,
    warnings: [],
  };
}

function buildRuleBasedVisionAnswer(request, summary) {
  const language = resolveResponseLanguage(request, summary);
  const texts = getLocalizedTexts(language);
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
      warnings: [texts.vetWarning],
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
  if ((Number(summary?.activeIssueCount) || Number(summary?.appAnalysis?.activeIssueCount) || 0) > 0) {
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
    warnings: [texts.vetWarning],
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

function extractProviderOutputText(responsePayload) {
  const directText = toSafeString(responsePayload?.output_text, 16000);
  if (directText) {
    return directText;
  }

  const outputItems = Array.isArray(responsePayload?.output) ? responsePayload.output : [];
  const chunks = [];
  outputItems.forEach((item) => {
    if (!isObjectRecord(item) || item.type !== 'message') {
      return;
    }
    const contentItems = Array.isArray(item.content) ? item.content : [];
    contentItems.forEach((contentItem) => {
      if (!isObjectRecord(contentItem) || contentItem.type !== 'output_text') {
        return;
      }
      const textChunk = toSafeString(contentItem.text, 8000);
      if (textChunk) {
        chunks.push(textChunk);
      }
    });
  });

  return chunks.join('\n').trim();
}

function extractFirstJsonObjectSlice(text) {
  const source = String(text ?? '');
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== '{') {
      continue;
    }
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return source.slice(start, index + 1);
        }
      }
    }
  }
  return null;
}

function parseJsonObjectFromText(textValue) {
  const rawText = toSafeString(textValue, 16000);
  if (!rawText) {
    return null;
  }

  const withoutFence = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    // fall through
  }

  const extracted = extractFirstJsonObjectSlice(withoutFence);
  if (!extracted) {
    return null;
  }
  try {
    return JSON.parse(extracted);
  } catch {
    return null;
  }
}

function buildProviderErrorDetails(response, responsePayload) {
  const errorPayload = isObjectRecord(responsePayload?.error) ? responsePayload.error : {};
  const incompleteDetails = isObjectRecord(responsePayload?.incomplete_details)
    ? responsePayload.incomplete_details
    : {};

  return {
    providerHttpStatus: Number(response?.status) || 0,
    providerErrorType: toSafeString(errorPayload.type, 120) || null,
    providerErrorCode: toSafeString(errorPayload.code, 120) || null,
    providerErrorParam: toSafeString(errorPayload.param, 120) || null,
    providerErrorMessage: toSafeString(errorPayload.message, 300) || null,
    providerResponseStatus: toSafeString(responsePayload?.status, 80) || null,
    providerIncompleteReason: toSafeString(incompleteDetails.reason, 120) || null,
  };
}

function buildProviderFetchErrorDetails(error) {
  const cause = isObjectRecord(error?.cause) ? error.cause : {};
  return {
    providerHttpStatus: 0,
    providerErrorType: toSafeString(error?.name, 120) || 'FetchError',
    providerErrorCode:
      toSafeString(error?.code, 120) || toSafeString(cause.code, 120) || null,
    providerErrorParam: null,
    providerErrorMessage: toSafeString(error?.message, 300) || null,
    providerResponseStatus: null,
    providerIncompleteReason: null,
  };
}

function createOpenAiResponsesProvider({
  apiKey,
  model = DEFAULT_OPENAI_MODEL,
  baseUrl = DEFAULT_OPENAI_BASE_URL,
  maxOutputTokens = 2400,
} = {}) {
  const safeApiKey = toSafeString(apiKey, 4096);
  if (!safeApiKey) {
    throw new Error('OPENAI_API_KEY is required when AI_PROVIDER_NAME=openai');
  }

  const safeModel = toSafeString(model, 120) || DEFAULT_OPENAI_MODEL;
  const normalizedBaseUrl =
    toSafeString(baseUrl, 512).replace(/\/+$/, '') || DEFAULT_OPENAI_BASE_URL;
  const safeMaxOutputTokens =
    Number.isFinite(Number(maxOutputTokens)) && Number(maxOutputTokens) > 100
      ? Math.round(Number(maxOutputTokens))
      : 2400;
  const shouldUseLowReasoning = /^gpt-5(?:-|$)/i.test(safeModel);

  async function requestJsonOutput(inputItems) {
    if (typeof fetch !== 'function') {
      throw createAiBackendError(
        AI_DIAGNOSTIC_CODES.PROVIDER_ERROR,
        'Provider AI jest chwilowo niedostepny.',
        502
      );
    }

    let response = null;
    try {
      response = await fetch(`${normalizedBaseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${safeApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: safeModel,
          input: inputItems,
          max_output_tokens: safeMaxOutputTokens,
          ...(shouldUseLowReasoning ? { reasoning: { effort: 'minimal' } } : {}),
          text: {
            format: {
              type: 'json_object',
            },
          },
        }),
      });
    } catch (error) {
      throw createAiBackendError(
        AI_DIAGNOSTIC_CODES.PROVIDER_ERROR,
        'Provider AI jest chwilowo niedostepny.',
        502,
        buildProviderFetchErrorDetails(error)
      );
    }

    let responsePayload = null;
    try {
      responsePayload = await response.json();
    } catch {
      responsePayload = null;
    }

    if (!response.ok) {
      throw createAiBackendError(
        AI_DIAGNOSTIC_CODES.PROVIDER_ERROR,
        'Provider AI jest chwilowo niedostepny.',
        502,
        buildProviderErrorDetails(response, responsePayload)
      );
    }

    const outputText = extractProviderOutputText(responsePayload);
    const parsed = parseJsonObjectFromText(outputText);
    if (!isObjectRecord(parsed)) {
      return {};
    }

    return parsed;
  }

  return {
    async generateChat({ request, contextSummary }) {
      const resolvedLanguage = resolveResponseLanguage(request, contextSummary);
      const contextJson = stringifyAiContext(contextSummary, MAX_AI_CONTEXT_CHARS);
      const chatMode = toSafeString(request?.mode, 64) || 'general';
      const userPrompt = [
        `Jezyk odpowiedzi: ${resolvedLanguage}`,
        'Zwroc TYLKO poprawny JSON bez markdownu i bez dodatkowego tekstu.',
        '',
        'Dozwolone pola odpowiedzi:',
        '{',
        '  "answer": string,',
        '  "recommendations": string[],',
        '  "warnings": string[]',
        '}',
        '',
        'Limity:',
        '- answer: string, max 600 znakow, tylko krotkie podsumowanie w 1-3 zdaniach,',
        '- recommendations: string[], 2-6 krotkich punktow dzialania, bez dublowania,',
        '- warnings: string[], 0-4 krotkie ostrzezenia.',
        '',
        'Zasady ogolne:',
        '- Odpowiadaj w jezyku wskazanym w "Jezyk odpowiedzi".',
        '- Klucze JSON zostaw bez zmian.',
        '- Tresc pol answer, recommendations i warnings przetlumacz na jezyk odpowiedzi.',
        '- Odpowiedz oprzyj wylacznie o dane z kontekstu i pytanie uzytkownika.',
        '- Nie wymyslaj brakujacych parametrow, pomiarow, faktow, obsady, sprzetu ani dat.',
        '- Jesli brakuje waznych danych, w answer napisz tylko co ogranicza ocene, a praktyczne kroki daj w recommendations.',
        '- Jesli problemow jest kilka, w answer wskaz maksymalnie 3 najwazniejsze obserwacje, bez planu dzialania ciagiem.',
        '- W recommendations umieszczaj najpierw dzialania najpilniejsze, potem kroki kontrolne, chyba ze tryb dotyczy samej interpretacji parametrow.',
        '- Nie opisuj planu dzialania w answer jako ciaglego akapitu; kazdy krok planu musi byc osobnym elementem recommendations.',
        '- Nie strasz uzytkownika bez podstaw.',
        '- Nie obiecuj pewnego efektu.',
        '- Nie zalecaj pelnego restartu akwarium jako pierwszej opcji.',
        '- Nie zalecaj gwaltownych zmian parametrow wody bez wyraznej potrzeby.',
        '- Nie zalecaj mycia calego filtra pod kranem.',
        '- Jesli zalecasz podmiane wody, domyslnie sugeruj czesciowa podmiane, chyba ze kontekst wskazuje na sytuacje krytyczna.',
        '',
        'Zasady dla problemow z woda:',
        '- Dla problemow awaryjnych priorytetyzuj bezpieczne kroki: testy, czesciowa podmiana wody, napowietrzanie, ograniczenie karmienia, sprawdzenie filtra.',
        '- Jesli brakuje NO2, NO3, pH, GH, KH lub temperatury, wskaz, ktore dane warto uzupelnic.',
        '- Nie zgaduj wartosci parametrow.',
        '',
        'Zasady dla chorob, leczenia i objawow ryb:',
        '- Nie stawiaj pewnej diagnozy.',
        '- Nie zalecaj lekow jako pierwszego kroku bez wystarczajacych danych.',
        '- Najpierw ocen jakosc wody, tlen, temperature, ostatnie zmiany, filtracje i zachowanie innych ryb.',
        '- Jesli pytanie dotyczy choroby, leczenia, martwych ryb, lekow, ran, pasozytow, ospowatych kropek, dziwnego zachowania, dyszenia, ocierania, plywania bokiem albo naglych zgonow, dodaj w warnings ostrzezenie weterynaryjne w jezyku odpowiedzi.',
        '',
        'Zasady dla obsady:',
        '- Jesli pytanie dotyczy obsady, ocen: litraz, liczebnosc stad, temperament, ryzyko zjedzenia/podjadania, krewetki, strefy plywania, zgodnosc parametrow i potencjalne konflikty.',
        '- Nie zakladaj zgodnosci tylko dlatego, ze gatunki sa popularne.',
        '- Nie zakladaj niezgodnosci tylko dlatego, ze pochodza z innych biotopow, jesli parametry i zachowanie sa zgodne.',
        '- Jesli obsada jest mozliwa, ale niedoskonala, napisz to jasno.',
        '',
        'Zasady dla sprzetu:',
        '- Jesli pytanie dotyczy filtra, ocen przeplyw, realny obieg, mozliwy za slaby przeplyw i mozliwy zbyt silny nurt.',
        '- Jesli pytanie dotyczy grzalki, ocen moc wzgledem litrazu, temperatury docelowej i temperatury otoczenia, jesli sa w kontekscie.',
        '- Nie wymyslaj danych technicznych sprzetu, jesli nie ma ich w kontekscie.',
        '',
        `Tryb rozmowy: ${chatMode}`,
        '',
        'Jesli tryb rozmowy istnieje, zastosuj dodatkowo:',
        '- what_now / improvement_plan: najpierw co zrobic teraz, potem co sprawdzic pozniej.',
        '- stock_check: skup sie na obsadzie.',
        '- interpret_parameters / water_parameters: przeanalizuj aktualne parametry wody i zwroc sugestie; nie ukladaj priorytetow ani planu dzialania wedlug pilnosci.',
        '- water_history_analysis: skup sie na historii pomiarow, trendach i kontekscie zdarzen w akwarium.',
        '- sick_fish: bez pewnej diagnozy, najpierw jakosc wody, tlen, temperatura, filtracja i zachowanie ryb; dodaj ostrzezenie weterynaryjne.',
        '- algae_problem / algae_analysis: skup sie na swietle, czasie swiecenia, NO3/PO4, nawozeniu, CO2, karmieniu, filtracji i stabilnosci.',
        '- general: odpowiedz normalnie, praktycznie i krotko.',
        '',
        'Jesli tryb to water_history_analysis:',
        '- Ocen trend na podstawie serii pomiarow, nie tylko ostatniego wpisu.',
        '- Jesli sa mniej niz 2 pomiary, napisz wprost, ze trendu nie da sie wiarygodnie ocenic i zinterpretuj tylko aktualny pomiar.',
        '- Jesli pomiary sa stare, ostrzez, ze analiza moze byc nieaktualna.',
        '- W answer podaj krotko: ocena trendu + maksymalnie 3 najwazniejsze obserwacje + brakujace dane.',
        '- W recommendations podaj osobnymi punktami: co zrobic teraz i co zmierzyc przy kolejnym pomiarze.',
        '- W warnings dodaj pilne ostrzezenia i ostroznosc przy gwaltownych zmianach pH/KH/GH.',
        '- Przy wysokim NO2 lub NH3/NH4 traktuj sytuacje jako pilna: test, czesciowa podmiana, napowietrzanie, ograniczenie karmienia, sprawdzenie filtra.',
        '- Przy rosnacym NO3 zasugeruj sprawdzenie karmienia, obsady, podmian i filtracji.',
        '- Nie zalecaj lekow i nie zalecaj restartu akwarium jako pierwszej opcji.',
        '',
        'Jesli tryb to algae_analysis lub algae_problem:',
        '- W answer podaj krotkie podsumowanie, co najbardziej pasuje i dlaczego.',
        '- Wskaz maksymalnie 3 mozliwe typy glonow lub przyczyny, nigdy jako pewna diagnoza.',
        '- Priorytetowo podaj bezpieczne kroki: testy NO3/PO4, kontrola swiatla, cyrkulacji, karmienia i podmian.',
        '- Nie zalecaj chemii ani restartu akwarium jako pierwszego kroku.',
        '- Jesli brakuje danych lub zdjecie jest slabej jakosci, napisz to jasno i zaproponuj plan weryfikacji.',
        '',
        'Pytanie uzytkownika:',
        request.question,
        '',
        'Dodatkowe informacje uzytkownika:',
        request.additionalInfo || '(brak)',
        '',
        'Kontekst akwarium JSON:',
        contextJson,
      ]
        .filter(Boolean)
        .join('\n');

      return requestJsonOutput([
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text: [
                'Jestes asystentem akwarystycznym w aplikacji mobilnej.',
                'Odpowiadaj w jezyku wskazanym w polu "Jezyk odpowiedzi".',
                'Jesli jezyk odpowiedzi nie jest dostepny, odpowiedz po polsku.',
                'Zwracaj wylacznie poprawny JSON zgodny z wymaganym schematem.',
                'Nie uzywaj markdownu.',
                'Nie dodawaj pol spoza schematu.',
                'Nie wymyslaj parametrow, pomiarow, obsady, sprzetu, dat, objawow ani faktow, ktorych nie ma w kontekscie.',
                'Nie stawiaj pewnych diagnoz.',
                'Mozesz wskazywac mozliwe przyczyny, jesli jasno oznaczysz je jako hipotezy lub mozliwosci.',
                'Odpowiadaj praktycznie, zwiezle i bez lania wody.',
                'Priorytetyzuj bezpieczne dzialania.',
                'Nie strasz uzytkownika bez podstaw.',
              ].join(' '),
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: userPrompt,
            },
          ],
        },
      ]);
    },

    async analyzeVision({ request, contextSummary }) {
      const resolvedLanguage = resolveResponseLanguage(request, contextSummary);
      const contextJson = stringifyAiContext(contextSummary, MAX_AI_CONTEXT_CHARS);
      const imageInput = request.imageBase64
        ? `data:image/jpeg;base64,${request.imageBase64}`
        : request.imageUrl || '';
      const visionMode = toSafeString(request?.mode, 64) || 'photo_analysis';

      const textPrompt = [
        `Jezyk odpowiedzi: ${resolvedLanguage}`,
        'Zwroc TYLKO poprawny JSON bez markdownu i bez dodatkowego tekstu.',
        '',
        'Dozwolone pola odpowiedzi:',
        '{',
        '  "summary": string,',
        '  "hypotheses": [',
        '    { "key": string, "label": string, "confidence": number }',
        '  ],',
        '  "verificationSteps": string[],',
        '  "recommendations": string[],',
        '  "actionPlan": string[],',
        '  "warnings": string[]',
        '}',
        '',
        'Limity:',
        '- summary: string, max 800 znakow,',
        '- hypotheses: max 5,',
        '- hypotheses[].key: krotki identyfikator bez spacji, np. "algae", "cloudy_water", "plant_damage", "fish_symptoms", "poor_image_quality",',
        '- hypotheses[].label: krotki opis w jezyku odpowiedzi,',
        '- hypotheses[].confidence: liczba 0..1,',
        '- verificationSteps: string[], max 6,',
        '- recommendations: string[], max 6,',
        '- actionPlan: string[], max 6,',
        '- warnings: string[], max 4.',
        '',
        'Zasady ogolne:',
        '- Odpowiadaj w jezyku wskazanym w "Jezyk odpowiedzi".',
        '- Klucze JSON zostaw bez zmian.',
        '- Tresci pol summary, hypotheses.label, verificationSteps, recommendations, actionPlan i warnings przetlumacz na jezyk odpowiedzi.',
        '- Opisuj tylko to, co realnie widac na zdjeciu i co wynika z kontekstu.',
        '- Nie stawiaj pewnej diagnozy.',
        '- Nie zgaduj parametrow wody na podstawie zdjecia.',
        '- Nie oceniaj dokladnych wartosci NO2, NO3, NH3/NH4, pH, GH, KH, PO4, K, Ca, Mg, TDS ani temperatury na podstawie zdjecia.',
        '- Uzywaj ostroznych sformulowan: "moze przypominac", "warto wykluczyc", "mozliwa przyczyna".',
        '- confidence oznacza pewnosc hipotezy na podstawie zdjecia i kontekstu, nie pewnosc diagnozy.',
        '- summary ma najpierw opisac widoczne elementy, a dopiero potem ostrozna ocene.',
        '- Jesli obraz jest nieczytelny, ciemny, rozmazany, zle skadrowany albo nie pokazuje problemu, napisz to jasno i dodaj bezpieczny plan weryfikacji.',
        '- Nie zalecaj lekow jako pierwszego kroku bez wystarczajacych danych.',
        '- Nie zalecaj restartu akwarium jako pierwszej opcji.',
        '- Nie strasz uzytkownika bez podstaw.',
        '',
        'Zasady dla ryb z objawami:',
        '- Jesli zdjecie pokazuje rybe z objawami, ranami, kropkami, osadem, nietypowym zachowaniem, martwa rybe albo pytanie dotyczy leczenia, dodaj ostrzezenie weterynaryjne w jezyku odpowiedzi.',
        '- W verificationSteps uwzglednij sprawdzenie NO2, temperatury, zachowania innych ryb, ostatnich zmian w akwarium i filtracji.',
        '- Nie podawaj pewnej diagnozy choroby.',
        '',
        'Zasady dla glonow i roslin:',
        '- Jesli zdjecie pokazuje glony lub problemy z roslinami, w verificationSteps uwzglednij swiatlo, czas swiecenia, NO3/PO4, nawozenie i CO2, jesli dostepne.',
        '- Jesli brakuje danych o swietle, nawozeniu albo parametrach, wskaz to.',
        '',
        'Zasady dla wody i wygladu zbiornika:',
        '- Jesli zdjecie pokazuje metna wode, osad, kozuch, brudne szyby albo problem z klarownoscia, zaproponuj testy wody, ocene filtracji, ostatnia podmiane, karmienie i obsade.',
        '- Nie wnioskuj o dokladnych parametrach z samego wygladu wody.',
        '',
        `Tryb analizy: ${visionMode}`,
        '',
        'Jesli tryb analizy to algae_analysis:',
        '- Wskaz maksymalnie 3 mozliwe typy glonow lub przyczyny, nigdy jako pewna diagnoza.',
        '- Priorytetowo zaproponuj bezpieczna weryfikacje: NO3/PO4, czas i intensywnosc swiatla, CO2, cyrkulacja i podmiany.',
        '- Nie zalecaj chemii ani restartu akwarium jako pierwszego kroku.',
        '',
        'Pytanie uzytkownika:',
        request.question || '(brak)',
        '',
        'Dodatkowe informacje uzytkownika:',
        request.additionalInfo || '(brak)',
        '',
        'Kontekst akwarium JSON:',
        contextJson,
      ]
        .filter(Boolean)
        .join('\n');

      return requestJsonOutput([
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text: [
                'Jestes asystentem akwarystycznym do analizy zdjec w aplikacji mobilnej.',
                'Odpowiadaj w jezyku wskazanym w polu "Jezyk odpowiedzi".',
                'Jesli jezyk odpowiedzi nie jest dostepny, odpowiedz po polsku.',
                'Zwracaj wylacznie poprawny JSON zgodny z wymaganym schematem.',
                'Nie uzywaj markdownu.',
                'Nie dodawaj pol spoza schematu.',
                'Opisuj tylko to, co widac na zdjeciu oraz wynika z kontekstu.',
                'Nie stawiaj pewnej diagnozy na podstawie samego zdjecia.',
                'Mozesz wskazywac hipotezy, ale musza byc ostrozne i mozliwe do zweryfikowania.',
                'Nie oceniaj dokladnych parametrow wody na podstawie zdjecia.',
                'Priorytetyzuj bezpieczne dzialania i weryfikacje pomiarami.',
              ].join(' '),
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: textPrompt,
            },
            ...(imageInput
              ? [
                  {
                    type: 'input_image',
                    image_url: imageInput,
                    detail: 'auto',
                  },
                ]
              : []),
          ],
        },
      ]);
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

function normalizeChatProviderResponse(value, request = null, resolvedLanguage = 'pl') {
  const texts = getLocalizedTexts(resolvedLanguage);
  const safeValue = isObjectRecord(value) ? value : {};
  const answer = toSafeString(safeValue.answer, 1200) || texts.chatFallbackAnswer;

  const recommendations = normalizeStringArray(safeValue.recommendations, 6, 250);
  const normalizedRecommendations =
    recommendations.length > 0 ? recommendations : [texts.chatFallbackRecommendation];
  const warnings = normalizeStringArray(safeValue.warnings, 4, 250);

  const shouldAddVetWarning =
    hasVeterinaryRiskKeywords(request?.question) ||
    hasVeterinaryRiskKeywords(request?.additionalInfo);
  const mergedWarnings = shouldAddVetWarning
    ? normalizeStringArray([texts.vetWarning, ...warnings], 4, 250)
    : warnings;

  return {
    answer,
    recommendations: normalizedRecommendations,
    warnings: mergedWarnings,
  };
}

function normalizeVisionProviderResponse(value, request = null, resolvedLanguage = 'pl') {
  const texts = getLocalizedTexts(resolvedLanguage);
  const safeValue = isObjectRecord(value) ? value : {};
  const summary = toSafeString(safeValue.summary, 800);
  const hypothesesInput = Array.isArray(safeValue.hypotheses) ? safeValue.hypotheses : [];
  const hypotheses = hypothesesInput
    .map((item) => {
      const confidence = Number(item?.confidence);
      const key = toSafeString(item?.key, 80) || 'unknown';
      const label = toSafeString(item?.label, 200) || texts.unknownHypothesisLabel;
      const normalizedConfidence = Number.isFinite(confidence)
        ? Math.min(1, Math.max(0, confidence))
        : 0.3;
      return {
        key,
        label,
        confidence: Number(normalizedConfidence.toFixed(3)),
      };
    })
    .slice(0, 5);

  const verificationSteps = normalizeStringArray(safeValue.verificationSteps, 6, 250);
  const recommendations = normalizeStringArray(safeValue.recommendations, 6, 250);
  const actionPlan = normalizeStringArray(safeValue.actionPlan, 6, 250);
  const warnings = normalizeStringArray(safeValue.warnings, 4, 250);

  const shouldUseFallback =
    !isObjectRecord(value) ||
    (!summary &&
      hypotheses.length === 0 &&
      verificationSteps.length === 0 &&
      recommendations.length === 0 &&
      actionPlan.length === 0 &&
      warnings.length === 0);

  const shouldAddVetWarning =
    hasVeterinaryRiskKeywords(request?.question) ||
    hasVeterinaryRiskKeywords(request?.additionalInfo);
  const vetWarnings = shouldAddVetWarning ? [texts.vetWarning] : [];

  if (shouldUseFallback) {
    return {
      summary: texts.noUsefulVisionSummary,
      hypotheses: [],
      verificationSteps: texts.visionFallbackSteps.slice(0, 6),
      recommendations: [],
      actionPlan: [],
      warnings: normalizeStringArray([...vetWarnings], 4, 250),
    };
  }

  return {
    summary: summary || texts.unclearVisionSummary,
    hypotheses,
    verificationSteps,
    recommendations,
    actionPlan,
    warnings: normalizeStringArray([...vetWarnings, ...warnings], 4, 250),
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

  const explicitCode = toSafeString(error?.code, 80);
  if (explicitCode === AI_DIAGNOSTIC_CODES.VALIDATION) {
    return createAiBackendError(
      AI_DIAGNOSTIC_CODES.VALIDATION,
      'Nieprawidlowe dane requestu.',
      400
    );
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
    aiStage: toSafeString(base.aiStage, 80) || null,
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
    providerHttpStatus: Number(base.providerHttpStatus) || 0,
    providerErrorType: toSafeString(base.providerErrorType, 120) || null,
    providerErrorCode: toSafeString(base.providerErrorCode, 120) || null,
    providerErrorParam: toSafeString(base.providerErrorParam, 120) || null,
    providerErrorMessage: toSafeString(base.providerErrorMessage, 300) || null,
    providerResponseStatus: toSafeString(base.providerResponseStatus, 80) || null,
    providerIncompleteReason:
      toSafeString(base.providerIncompleteReason, 120) || null,
    contextCollection: toSafeString(base.contextCollection, 80) || null,
    contextErrorType: toSafeString(base.contextErrorType, 120) || null,
    contextErrorCode: toSafeString(base.contextErrorCode, 120) || null,
    contextErrorMessage: toSafeString(base.contextErrorMessage, 300) || null,
  };
}

function pickContextErrorLogDetails(error) {
  const cause = isObjectRecord(error?.cause) ? error.cause : {};
  return {
    contextCollection: toSafeString(error?.contextCollection, 80) || null,
    contextErrorType: toSafeString(error?.name, 120) || null,
    contextErrorCode:
      toSafeString(error?.contextErrorCode, 120) ||
      toSafeString(error?.code, 120) ||
      toSafeString(cause.code, 120) ||
      null,
    contextErrorMessage:
      toSafeString(error?.contextErrorMessage, 300) ||
      toSafeString(error?.message, 300) ||
      null,
  };
}

function createMinimalUserData(uid) {
  return {
    uid: toSafeString(uid, 128),
    tanks: [],
    measurements: [],
    stockItems: [],
    issueCases: [],
    actionCalendar: [],
    equipment: [],
  };
}

function buildFallbackAiContext(uid, tankId, request) {
  const userData = createMinimalUserData(uid);
  const contextSummary = buildUserAquariumContext(uid, tankId, userData);
  const aiContext = limitAiContext(
    buildAquariumAiContext({ request, userData, contextSummary }),
    MAX_AI_CONTEXT_CHARS
  );
  return { contextSummary, aiContext };
}

function pickProviderErrorLogDetails(error) {
  return {
    providerHttpStatus: Number(error?.providerHttpStatus) || 0,
    providerErrorType: toSafeString(error?.providerErrorType, 120) || null,
    providerErrorCode: toSafeString(error?.providerErrorCode, 120) || null,
    providerErrorParam: toSafeString(error?.providerErrorParam, 120) || null,
    providerErrorMessage: toSafeString(error?.providerErrorMessage, 300) || null,
    providerResponseStatus: toSafeString(error?.providerResponseStatus, 80) || null,
    providerIncompleteReason:
      toSafeString(error?.providerIncompleteReason, 120) || null,
  };
}

function shouldReturnProviderFallback({
  providerName,
  mappedError,
  requestForProvider,
  contextSummary,
}) {
  return (
    toSafeString(providerName, 64).toLowerCase() === 'openai' &&
    mappedError?.code === AI_DIAGNOSTIC_CODES.PROVIDER_ERROR &&
    Boolean(requestForProvider) &&
    Boolean(contextSummary)
  );
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
    return { uid, idToken: token };
  }

  async function handleChat({ headers, payload }) {
    const startedAt = now();
    const payloadKeys = pickPayloadKeys(payload);

    let uid = null;
    let request = null;
    let contextSummary = null;
    let aiContext = null;
    let requestForProvider = null;
    let resolvedLanguage = DEFAULT_RESPONSE_LANGUAGE;
    let aiStage = 'validate';
    try {
      request = validateChatRequest(payload);
      aiStage = 'auth';
      const authContext = await resolveUidFromHeaders(headers);
      uid = authContext.uid;
      try {
        aiStage = 'context';
        const userData = await dataStore.getUserData(uid, request.tankId, authContext);
        contextSummary = buildUserAquariumContext(uid, request.tankId, userData);
        aiContext = limitAiContext(
          buildAquariumAiContext({ request, userData, contextSummary }),
          MAX_AI_CONTEXT_CHARS
        );
      } catch (contextError) {
        const mappedContextError = mapUnknownErrorToAiError(contextError);
        if (
          mappedContextError.code === AI_DIAGNOSTIC_CODES.UNAUTHORIZED ||
          mappedContextError.code === AI_DIAGNOSTIC_CODES.VALIDATION
        ) {
          throw contextError;
        }

        const fallbackContext = buildFallbackAiContext(uid, request.tankId, request);
        contextSummary = fallbackContext.contextSummary;
        aiContext = fallbackContext.aiContext;
        logOperation(logger, 'warn', 'ai_chat_context_fallback_used', {
          endpoint: '/ai/chat',
          operation: 'chat',
          aiStage,
          diagnosticCode: AI_DIAGNOSTIC_CODES.OK,
          uid,
          tankId: request.tankId,
          payloadKeys,
          questionLength: request.question.length,
          additionalInfoLength: request.additionalInfo.length,
          provider: providerName,
          durationMs: now() - startedAt,
          httpStatus: 200,
          ...pickContextErrorLogDetails(contextError),
        });
      }
      resolvedLanguage = resolveResponseLanguage(request, aiContext);
      requestForProvider = { ...request, resolvedLanguage };

      aiStage = 'provider';
      const providerResult = await withTimeout(
        aiProvider.generateChat({
          uid,
          request: requestForProvider,
          contextSummary: aiContext,
        }),
        providerTimeoutMs
      );

      const normalized = normalizeChatProviderResponse(
        providerResult,
        requestForProvider,
        resolvedLanguage
      );
      const durationMs = now() - startedAt;

      logOperation(logger, 'info', 'ai_chat_request_processed', {
        endpoint: '/ai/chat',
        operation: 'chat',
        aiStage: 'done',
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

      if (
        shouldReturnProviderFallback({
          providerName,
          mappedError: mapped,
          requestForProvider,
          contextSummary,
        })
      ) {
        const fallbackResult = await createRuleBasedAiProvider().generateChat({
          request: requestForProvider,
          contextSummary: aiContext || contextSummary,
        });
        const normalizedFallback = normalizeChatProviderResponse(
          fallbackResult,
          requestForProvider,
          resolvedLanguage
        );
        const durationMs = now() - startedAt;
        logOperation(logger, 'warn', 'ai_chat_provider_fallback_used', {
          endpoint: '/ai/chat',
          operation: 'chat',
          aiStage,
          diagnosticCode: AI_DIAGNOSTIC_CODES.OK,
          uid,
          tankId: request?.tankId ?? null,
          payloadKeys,
          questionLength: request?.question?.length ?? 0,
          additionalInfoLength: request?.additionalInfo?.length ?? 0,
          provider: providerName,
          durationMs,
          httpStatus: 200,
          ...pickProviderErrorLogDetails(mapped),
        });

        return {
          httpStatus: 200,
          body: {
            ok: true,
            diagnosticCode: AI_DIAGNOSTIC_CODES.OK,
            data: {
              answer: normalizedFallback.answer,
              recommendations: normalizedFallback.recommendations,
              warnings: normalizeStringArray(
                [
                  'OpenAI chwilowo nie zwrocil odpowiedzi, wiec pokazuje awaryjna odpowiedz lokalna.',
                  ...normalizedFallback.warnings,
                ],
                4,
                250
              ),
              contextSummary,
            },
          },
        };
      }

      const durationMs = now() - startedAt;
      logOperation(
        logger,
        mapped.code === AI_DIAGNOSTIC_CODES.INTERNAL ? 'error' : 'warn',
        'ai_chat_request_failed',
        {
          endpoint: '/ai/chat',
          operation: 'chat',
          aiStage,
          diagnosticCode: mapped.code,
          uid,
          tankId: request?.tankId ?? null,
          payloadKeys,
          questionLength: request?.question?.length ?? 0,
          additionalInfoLength: request?.additionalInfo?.length ?? 0,
          provider: providerName,
          durationMs,
          httpStatus: mapped.httpStatus,
          ...pickProviderErrorLogDetails(mapped),
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
    let contextSummary = null;
    let aiContext = null;
    let requestForProvider = null;
    let resolvedLanguage = DEFAULT_RESPONSE_LANGUAGE;
    let aiStage = 'validate';
    try {
      request = validateVisionRequest(payload);
      aiStage = 'auth';
      const authContext = await resolveUidFromHeaders(headers);
      uid = authContext.uid;
      try {
        aiStage = 'context';
        const userData = await dataStore.getUserData(uid, request.tankId, authContext);
        contextSummary = buildUserAquariumContext(uid, request.tankId, userData);
        aiContext = limitAiContext(
          buildAquariumAiContext({ request, userData, contextSummary }),
          MAX_AI_CONTEXT_CHARS
        );
      } catch (contextError) {
        const mappedContextError = mapUnknownErrorToAiError(contextError);
        if (
          mappedContextError.code === AI_DIAGNOSTIC_CODES.UNAUTHORIZED ||
          mappedContextError.code === AI_DIAGNOSTIC_CODES.VALIDATION
        ) {
          throw contextError;
        }

        const fallbackContext = buildFallbackAiContext(uid, request.tankId, request);
        contextSummary = fallbackContext.contextSummary;
        aiContext = fallbackContext.aiContext;
        logOperation(logger, 'warn', 'ai_vision_context_fallback_used', {
          endpoint: '/ai/vision/analyze',
          operation: 'vision',
          aiStage,
          diagnosticCode: AI_DIAGNOSTIC_CODES.OK,
          uid,
          tankId: request.tankId,
          payloadKeys,
          questionLength: request.question.length,
          additionalInfoLength: request.additionalInfo.length,
          hasImageUrl: Boolean(request.imageUrl),
          hasImageBase64: Boolean(request.imageBase64),
          provider: providerName,
          durationMs: now() - startedAt,
          httpStatus: 200,
          ...pickContextErrorLogDetails(contextError),
        });
      }
      resolvedLanguage = resolveResponseLanguage(request, aiContext);
      requestForProvider = { ...request, resolvedLanguage };

      aiStage = 'provider';
      const providerResult = await withTimeout(
        aiProvider.analyzeVision({
          uid,
          request: requestForProvider,
          contextSummary: aiContext,
        }),
        providerTimeoutMs
      );
      const normalized = normalizeVisionProviderResponse(
        providerResult,
        requestForProvider,
        resolvedLanguage
      );
      const durationMs = now() - startedAt;

      logOperation(logger, 'info', 'ai_vision_request_processed', {
        endpoint: '/ai/vision/analyze',
        operation: 'vision',
        aiStage: 'done',
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

      if (
        shouldReturnProviderFallback({
          providerName,
          mappedError: mapped,
          requestForProvider,
          contextSummary,
        })
      ) {
        const fallbackResult = await createRuleBasedAiProvider().analyzeVision({
          request: requestForProvider,
          contextSummary: aiContext || contextSummary,
        });
        const normalizedFallback = normalizeVisionProviderResponse(
          fallbackResult,
          requestForProvider,
          resolvedLanguage
        );
        const durationMs = now() - startedAt;
        logOperation(logger, 'warn', 'ai_vision_provider_fallback_used', {
          endpoint: '/ai/vision/analyze',
          operation: 'vision',
          aiStage,
          diagnosticCode: AI_DIAGNOSTIC_CODES.OK,
          uid,
          tankId: request?.tankId ?? null,
          payloadKeys,
          questionLength: request?.question?.length ?? 0,
          additionalInfoLength: request?.additionalInfo?.length ?? 0,
          hasImageUrl: Boolean(request?.imageUrl),
          hasImageBase64: Boolean(request?.imageBase64),
          provider: providerName,
          durationMs,
          httpStatus: 200,
          ...pickProviderErrorLogDetails(mapped),
        });

        return {
          httpStatus: 200,
          body: {
            ok: true,
            diagnosticCode: AI_DIAGNOSTIC_CODES.OK,
            data: {
              ...normalizedFallback,
              warnings: normalizeStringArray(
                [
                  'OpenAI chwilowo nie zwrocil odpowiedzi, wiec pokazuje awaryjna odpowiedz lokalna.',
                  ...normalizedFallback.warnings,
                ],
                4,
                250
              ),
              contextSummary,
            },
          },
        };
      }

      const durationMs = now() - startedAt;
      logOperation(
        logger,
        mapped.code === AI_DIAGNOSTIC_CODES.INTERNAL ? 'error' : 'warn',
        'ai_vision_request_failed',
        {
          endpoint: '/ai/vision/analyze',
          operation: 'vision',
          aiStage,
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
          ...pickProviderErrorLogDetails(mapped),
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
  buildAquariumAiContext,
  limitAiContext,
  stringifyAiContext,
  buildUserAquariumContext,
  buildUserDataSummary,
  createRuleBasedAiProvider,
  createOpenAiResponsesProvider,
  createAiRequestHandlers,
  shouldReturnProviderFallback,
};
