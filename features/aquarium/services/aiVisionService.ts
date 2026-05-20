import { Platform } from 'react-native';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/shared/services/firebase';
import { AiChatRequestError } from '@/features/aquarium/services/aiChatService';
import { logAiDiagnosticEvent } from '@/shared/services/observability';

const DEFAULT_AI_TIMEOUT_MS = 20000;
const AI_VISION_ANALYZE_PATH = '/ai/vision/analyze';

const AI_DIAGNOSTIC_CODES = Object.freeze({
  OK: 'AIW_OK',
  UNAUTHORIZED: 'AIW_UNAUTHORIZED',
  TIMEOUT: 'AIW_TIMEOUT',
  PROVIDER_ERROR: 'AIW_PROVIDER_ERROR',
  VALIDATION: 'AIW_VALIDATION',
  INTERNAL: 'AIW_INTERNAL',
  UNAVAILABLE: 'AIW_UNAVAILABLE',
});

function toSafeString(value: unknown, maxLength = 4000): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return normalized.slice(0, maxLength);
}

function sanitizeTextForAi(value: unknown, maxLength = 4000): string {
  const base = toSafeString(value, maxLength);
  if (!base) {
    return '';
  }

  return base
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\+?\d[\d\s\-()]{7,}\d/g, '[phone]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b\d{6,}\b/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveAiBackendBaseUrl(): string {
  const configured = toSafeString(process.env.EXPO_PUBLIC_AI_BACKEND_URL, 512);
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  if (!__DEV__) {
    return '';
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8790';
  }
  return 'http://127.0.0.1:8790';
}

function mapDiagnosticCodeToUserMessage(code: string): string {
  if (code === AI_DIAGNOSTIC_CODES.UNAUTHORIZED) {
    return 'Sesja wygasla. Zaloguj się ponownie i spróbuj jeszcze raz.';
  }
  if (code === AI_DIAGNOSTIC_CODES.TIMEOUT) {
    return 'Analiza obrazu trwa zbyt dlugo. Spróbuj ponownie za chwile.';
  }
  if (code === AI_DIAGNOSTIC_CODES.VALIDATION) {
    return 'Nie udało się odczytac zdjęcia. Wybierz wyrazniejsze ujecie.';
  }
  if (code === AI_DIAGNOSTIC_CODES.PROVIDER_ERROR) {
    return 'Analiza obrazu jest chwilowo niedostepna. Spróbuj ponownie za moment.';
  }
  if (code === AI_DIAGNOSTIC_CODES.UNAVAILABLE) {
    return 'Asystent AI nie jest jeszcze skonfigurowany dla tego builda.';
  }
  return 'Wystapil błąd analizy obrazu. Spróbuj ponownie.';
}

function isAbortError(error: unknown): boolean {
  const name = String((error as { name?: unknown })?.name ?? '').toLowerCase();
  return name === 'aborterror';
}

function createRetryableVisionError(
  message: string,
  code: string = AI_DIAGNOSTIC_CODES.INTERNAL,
  status?: number
) {
  return new AiChatRequestError(message, code, true, status);
}

type VisionHypothesis = {
  key: string;
  label: string;
  confidence: number;
};

export type AiVisionResponse = {
  summary: string;
  hypotheses: VisionHypothesis[];
  verificationSteps: string[];
  recommendations: string[];
  actionPlan: string[];
  warnings: string[];
  contextSummary: Record<string, unknown> | null;
  diagnosticCode: string;
  unreadableImageFallback: boolean;
};

type AiVisionAnalyzePayload = {
  idToken: string;
  imageUrl: string;
  question?: string;
  additionalInfo?: string;
  tankId?: string | null;
  mode?: string;
  locale?: string;
  userLanguage?: string;
  appLanguage?: string;
  timeoutMs?: number;
};

type PickedImage = {
  uri: string;
  width: number;
  height: number;
  mimeType: string;
};

type ImageSourceKind = 'camera' | 'gallery';

async function loadImagePickerModule() {
  try {
    return await import('expo-image-picker');
  } catch {
    throw new AiChatRequestError(
      'Modul wyboru zdjęć nie jest dostępny w tym buildzie.',
      AI_DIAGNOSTIC_CODES.UNAVAILABLE,
      false
    );
  }
}

function resolveAssetMimeType(uri: string, fallback = 'image/jpeg'): string {
  const normalizedUri = toSafeString(uri, 2048).toLowerCase();
  if (normalizedUri.endsWith('.png')) {
    return 'image/png';
  }
  if (normalizedUri.endsWith('.webp')) {
    return 'image/webp';
  }
  if (normalizedUri.endsWith('.heic') || normalizedUri.endsWith('.heif')) {
    return 'image/heic';
  }
  return fallback;
}

export async function pickVisionImage(
  source: ImageSourceKind
): Promise<PickedImage | null> {
  const ImagePicker = await loadImagePickerModule();
  const isCamera = source === 'camera';
  const permissionResult = isCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permissionResult?.granted) {
    throw new AiChatRequestError(
      isCamera
        ? 'Brak zgody na aparat. Zezwol na dostep w ustawieńiach.'
        : 'Brak zgody na galerie. Zezwol na dostep do zdjęć w ustawieńiach.',
      AI_DIAGNOSTIC_CODES.VALIDATION,
      false
    );
  }

  const pickerResult = isCamera
    ? await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.75,
        mediaTypes: ['images'],
      })
    : await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        quality: 0.75,
        mediaTypes: ['images'],
      });

  if (pickerResult?.canceled) {
    return null;
  }
  const asset = Array.isArray(pickerResult?.assets) ? pickerResult.assets[0] : null;
  if (!asset?.uri) {
    return null;
  }

  return {
    uri: asset.uri,
    width: Number(asset.width) || 0,
    height: Number(asset.height) || 0,
    mimeType: toSafeString(asset.mimeType, 80) || resolveAssetMimeType(asset.uri),
  };
}

export async function uploadVisionImageForUser(
  uid: string,
  image: PickedImage
): Promise<{ storagePath: string; downloadUrl: string }> {
  const safeUid = toSafeString(uid, 128);
  if (!safeUid) {
    throw new AiChatRequestError(
      mapDiagnosticCodeToUserMessage(AI_DIAGNOSTIC_CODES.UNAUTHORIZED),
      AI_DIAGNOSTIC_CODES.UNAUTHORIZED,
      false,
      401
    );
  }
  const uri = toSafeString(image?.uri, 2048);
  if (!uri) {
    throw new AiChatRequestError(
      mapDiagnosticCodeToUserMessage(AI_DIAGNOSTIC_CODES.VALIDATION),
      AI_DIAGNOSTIC_CODES.VALIDATION,
      false,
      400
    );
  }

  const fetched = await fetch(uri);
  const blob = await fetched.blob();
  const fileExt = image.mimeType.includes('png')
    ? 'png'
    : image.mimeType.includes('webp')
      ? 'webp'
      : 'jpg';
  const storagePath = `aiVisionInputs/${safeUid}/${Date.now()}-${Math.round(
    Math.random() * 1_000_000
  )}.${fileExt}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, blob, {
    contentType: image.mimeType || 'image/jpeg',
    customMetadata: {
      userId: safeUid,
      source: 'ai_vision',
    },
  });
  const downloadUrl = await getDownloadURL(storageRef);
  return { storagePath, downloadUrl };
}

export async function requestAiVisionAnalyze({
  idToken,
  imageUrl,
  question = '',
  additionalInfo = '',
  tankId = null,
  mode = '',
  locale = '',
  userLanguage = '',
  appLanguage = '',
  timeoutMs = DEFAULT_AI_TIMEOUT_MS,
}: AiVisionAnalyzePayload): Promise<AiVisionResponse> {
  const token = toSafeString(idToken, 4096);
  const safeImageUrl = toSafeString(imageUrl, 4000);
  const safeQuestion = sanitizeTextForAi(question, 4000);
  const safeTankId = toSafeString(tankId, 128);
  const safeAdditionalInfo = sanitizeTextForAi(additionalInfo, 4000);
  const safeMode = toSafeString(mode, 64);
  const safeLocale = toSafeString(locale, 24);
  const safeUserLanguage = toSafeString(userLanguage, 24);
  const safeAppLanguage = toSafeString(appLanguage, 24);

  if (!token) {
    throw new AiChatRequestError(
      mapDiagnosticCodeToUserMessage(AI_DIAGNOSTIC_CODES.UNAUTHORIZED),
      AI_DIAGNOSTIC_CODES.UNAUTHORIZED,
      false,
      401
    );
  }
  if (!safeImageUrl) {
    throw new AiChatRequestError(
      mapDiagnosticCodeToUserMessage(AI_DIAGNOSTIC_CODES.VALIDATION),
      AI_DIAGNOSTIC_CODES.VALIDATION,
      false,
      400
    );
  }

  const baseUrl = resolveAiBackendBaseUrl();
  if (!baseUrl) {
    throw new AiChatRequestError(
      mapDiagnosticCodeToUserMessage(AI_DIAGNOSTIC_CODES.UNAVAILABLE),
      AI_DIAGNOSTIC_CODES.UNAVAILABLE,
      false
    );
  }

  const endpoint = `${baseUrl}${AI_VISION_ANALYZE_PATH}`;
  const controller = new AbortController();
  const normalizedTimeout = Number(timeoutMs);
  const timeout = Number.isFinite(normalizedTimeout) && normalizedTimeout > 0
    ? normalizedTimeout
    : DEFAULT_AI_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        question: safeQuestion || 'Co widzisz na tym zdjęćiu akwarium?',
        additionalInfo: safeAdditionalInfo,
        tankId: safeTankId || undefined,
        imageUrl: safeImageUrl,
        mode: safeMode || undefined,
        locale: safeLocale || undefined,
        userLanguage: safeUserLanguage || undefined,
        appLanguage: safeAppLanguage || undefined,
      }),
      signal: controller.signal,
    });

    let payload: Record<string, unknown> = {};
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = {};
    }

    const diagnosticCode =
      toSafeString(payload?.diagnosticCode, 80) || AI_DIAGNOSTIC_CODES.INTERNAL;
    if (!response.ok || payload?.ok === false) {
      logAiDiagnosticEvent({
        operation: 'vision',
        diagnosticCode,
        payloadKeys: ['question', 'additionalInfo', 'tankId', 'imageUrl'],
        hasTankId: Boolean(safeTankId),
        hasImageUrl: Boolean(safeImageUrl),
        questionLength: safeQuestion.length,
        additionalInfoLength: safeAdditionalInfo.length,
        httpStatus: response.status,
      });
      throw new AiChatRequestError(
        mapDiagnosticCodeToUserMessage(diagnosticCode),
        diagnosticCode,
        diagnosticCode === AI_DIAGNOSTIC_CODES.TIMEOUT ||
          diagnosticCode === AI_DIAGNOSTIC_CODES.PROVIDER_ERROR ||
          diagnosticCode === AI_DIAGNOSTIC_CODES.INTERNAL,
        response.status
      );
    }

    const data = (payload?.data ?? {}) as Record<string, unknown>;
    const hypotheses = Array.isArray(data?.hypotheses)
      ? data.hypotheses
          .map((item) => ({
            key: toSafeString((item as { key?: unknown })?.key, 120),
            label: toSafeString((item as { label?: unknown })?.label, 240),
            confidence: Number((item as { confidence?: unknown })?.confidence),
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
    const verificationSteps = Array.isArray(data?.verificationSteps)
      ? data.verificationSteps
          .map((item) => toSafeString(item, 400))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const recommendations = Array.isArray(data?.recommendations)
      ? data.recommendations
          .map((item) => toSafeString(item, 400))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const actionPlan = Array.isArray(data?.actionPlan)
      ? data.actionPlan
          .map((item) => toSafeString(item, 400))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const warnings = Array.isArray(data?.warnings)
      ? data.warnings
          .map((item) => toSafeString(item, 400))
          .filter(Boolean)
          .slice(0, 8)
      : [];

    const summary = toSafeString(data?.summary, 2400);
    const unreadableImageFallback =
      hypotheses.length === 0 &&
      (!summary || summary.toLowerCase().includes('brak jednoznacznej diagnozy'));

    logAiDiagnosticEvent({
      operation: 'vision',
      diagnosticCode,
      payloadKeys: ['question', 'additionalInfo', 'tankId', 'imageUrl'],
      hasTankId: Boolean(safeTankId),
      hasImageUrl: Boolean(safeImageUrl),
      questionLength: safeQuestion.length,
      additionalInfoLength: safeAdditionalInfo.length,
      httpStatus: response.status,
    });

    return {
      summary: summary || 'Brak jednoznacznej diagnozy na podstawie obrazu.',
      hypotheses,
      verificationSteps,
      recommendations,
      actionPlan,
      warnings,
      contextSummary:
        data?.contextSummary && typeof data.contextSummary === 'object'
          ? (data.contextSummary as Record<string, unknown>)
          : null,
      diagnosticCode,
      unreadableImageFallback,
    };
  } catch (error) {
    if (error instanceof AiChatRequestError) {
      logAiDiagnosticEvent({
        operation: 'vision',
        diagnosticCode: error.code,
        payloadKeys: ['question', 'additionalInfo', 'tankId', 'imageUrl'],
        hasTankId: Boolean(safeTankId),
        hasImageUrl: Boolean(safeImageUrl),
        questionLength: safeQuestion.length,
        additionalInfoLength: safeAdditionalInfo.length,
        httpStatus: error.status ?? 0,
      });
      throw error;
    }
    if (isAbortError(error)) {
      logAiDiagnosticEvent({
        operation: 'vision',
        diagnosticCode: AI_DIAGNOSTIC_CODES.TIMEOUT,
        payloadKeys: ['question', 'additionalInfo', 'tankId', 'imageUrl'],
        hasTankId: Boolean(safeTankId),
        hasImageUrl: Boolean(safeImageUrl),
        questionLength: safeQuestion.length,
        additionalInfoLength: safeAdditionalInfo.length,
        httpStatus: 504,
      });
      throw createRetryableVisionError(
        mapDiagnosticCodeToUserMessage(AI_DIAGNOSTIC_CODES.TIMEOUT),
        AI_DIAGNOSTIC_CODES.TIMEOUT,
        504
      );
    }
    logAiDiagnosticEvent({
      operation: 'vision',
      diagnosticCode: AI_DIAGNOSTIC_CODES.INTERNAL,
      payloadKeys: ['question', 'additionalInfo', 'tankId', 'imageUrl'],
      hasTankId: Boolean(safeTankId),
      hasImageUrl: Boolean(safeImageUrl),
      questionLength: safeQuestion.length,
      additionalInfoLength: safeAdditionalInfo.length,
      httpStatus: 0,
    });
    throw createRetryableVisionError(
      mapDiagnosticCodeToUserMessage(AI_DIAGNOSTIC_CODES.INTERNAL),
      AI_DIAGNOSTIC_CODES.INTERNAL
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function requestAiVisionAnalyzeWithRetry(
  payload: AiVisionAnalyzePayload,
  options: { maxAttempts?: number; retryDelayMs?: number } = {}
): Promise<AiVisionResponse> {
  const maxAttempts = Math.max(1, Number(options.maxAttempts) || 2);
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 350);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestAiVisionAnalyze(payload);
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof AiChatRequestError
          ? Boolean(error.retryable)
          : true;
      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }
      if (retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AiChatRequestError(
        mapDiagnosticCodeToUserMessage(AI_DIAGNOSTIC_CODES.INTERNAL),
        AI_DIAGNOSTIC_CODES.INTERNAL,
        true
      );
}
