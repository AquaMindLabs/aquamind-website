import { Platform } from 'react-native';
import { logAiDiagnosticEvent } from '@/shared/services/observability';

const DEFAULT_AI_TIMEOUT_MS = 15000;
const AI_CHAT_PATH = '/ai/chat';

const AI_DIAGNOSTIC_CODES = Object.freeze({
  OK: 'AIW_OK',
  UNAUTHORIZED: 'AIW_UNAUTHORIZED',
  TIMEOUT: 'AIW_TIMEOUT',
  PROVIDER_ERROR: 'AIW_PROVIDER_ERROR',
  VALIDATION: 'AIW_VALIDATION',
  INTERNAL: 'AIW_INTERNAL',
  UNAVAILABLE: 'AIW_UNAVAILABLE',
});

export class AiChatRequestError extends Error {
  code: string;
  retryable: boolean;
  status?: number;
  constructor(message: string, code: string = AI_DIAGNOSTIC_CODES.INTERNAL, retryable = false, status?: number) {
    super(message);
    this.name = 'AiChatRequestError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

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
    return 'Asystent odpowiada zbyt dlugo. Spróbuj ponownie za chwile.';
  }
  if (code === AI_DIAGNOSTIC_CODES.VALIDATION) {
    return 'Sprawdź pytanie i uzupelnij je bardziej szczegółowo.';
  }
  if (code === AI_DIAGNOSTIC_CODES.PROVIDER_ERROR) {
    return 'Asystent jest chwilowo niedostępny. Spróbuj ponownie za moment.';
  }
  if (code === AI_DIAGNOSTIC_CODES.UNAVAILABLE) {
    return 'Asystent AI nie jest jeszcze skonfigurowany dla tego builda.';
  }
  return 'Wystapil błąd Asystenta AI. Spróbuj ponownie.';
}

function isAbortError(error: unknown): boolean {
  const name = String((error as { name?: unknown })?.name ?? '').toLowerCase();
  return name === 'aborterror';
}

export type AiChatRequestPayload = {
  idToken: string;
  question: string;
  tankId?: string | null;
  additionalInfo?: string;
  mode?: string;
  locale?: string;
  userLanguage?: string;
  appLanguage?: string;
  timeoutMs?: number;
};

export type AiChatResponse = {
  answer: string;
  recommendations: string[];
  warnings: string[];
  contextSummary: Record<string, unknown> | null;
  diagnosticCode: string;
};

export async function requestAiChat({
  idToken,
  question,
  tankId = null,
  additionalInfo = '',
  mode = '',
  locale = '',
  userLanguage = '',
  appLanguage = '',
  timeoutMs = DEFAULT_AI_TIMEOUT_MS,
}: AiChatRequestPayload): Promise<AiChatResponse> {
  const token = toSafeString(idToken, 4096);
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
  if (!safeQuestion || safeQuestion.length < 2) {
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

  const endpoint = `${baseUrl}${AI_CHAT_PATH}`;
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
        question: safeQuestion,
        additionalInfo: safeAdditionalInfo,
        tankId: safeTankId || undefined,
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

    const diagnosticCode = toSafeString(payload?.diagnosticCode, 80) || AI_DIAGNOSTIC_CODES.INTERNAL;
    if (!response.ok || payload?.ok === false) {
      logAiDiagnosticEvent({
        operation: 'chat',
        diagnosticCode,
        payloadKeys: ['question', 'additionalInfo', 'tankId'],
        hasTankId: Boolean(safeTankId),
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
    const recommendations = Array.isArray(data?.recommendations)
      ? data.recommendations
          .map((item) => toSafeString(item, 400))
          .filter(Boolean)
      : [];
    const warnings = Array.isArray(data?.warnings)
      ? data.warnings
          .map((item) => toSafeString(item, 400))
          .filter(Boolean)
      : [];

    logAiDiagnosticEvent({
      operation: 'chat',
      diagnosticCode,
      payloadKeys: ['question', 'additionalInfo', 'tankId'],
      hasTankId: Boolean(safeTankId),
      questionLength: safeQuestion.length,
      additionalInfoLength: safeAdditionalInfo.length,
      httpStatus: response.status,
    });

    return {
      answer: toSafeString(data?.answer, 8000),
      recommendations,
      warnings,
      contextSummary:
        data?.contextSummary && typeof data.contextSummary === 'object'
          ? (data.contextSummary as Record<string, unknown>)
          : null,
      diagnosticCode,
    };
  } catch (error) {
    if (error instanceof AiChatRequestError) {
      logAiDiagnosticEvent({
        operation: 'chat',
        diagnosticCode: error.code,
        payloadKeys: ['question', 'additionalInfo', 'tankId'],
        hasTankId: Boolean(safeTankId),
        questionLength: safeQuestion.length,
        additionalInfoLength: safeAdditionalInfo.length,
        httpStatus: error.status ?? 0,
      });
      throw error;
    }
    if (isAbortError(error)) {
      logAiDiagnosticEvent({
        operation: 'chat',
        diagnosticCode: AI_DIAGNOSTIC_CODES.TIMEOUT,
        payloadKeys: ['question', 'additionalInfo', 'tankId'],
        hasTankId: Boolean(safeTankId),
        questionLength: safeQuestion.length,
        additionalInfoLength: safeAdditionalInfo.length,
        httpStatus: 504,
      });
      throw new AiChatRequestError(
        mapDiagnosticCodeToUserMessage(AI_DIAGNOSTIC_CODES.TIMEOUT),
        AI_DIAGNOSTIC_CODES.TIMEOUT,
        true,
        504
      );
    }
    logAiDiagnosticEvent({
      operation: 'chat',
      diagnosticCode: AI_DIAGNOSTIC_CODES.INTERNAL,
      payloadKeys: ['question', 'additionalInfo', 'tankId'],
      hasTankId: Boolean(safeTankId),
      questionLength: safeQuestion.length,
      additionalInfoLength: safeAdditionalInfo.length,
      httpStatus: 0,
    });
    throw new AiChatRequestError(
      mapDiagnosticCodeToUserMessage(AI_DIAGNOSTIC_CODES.INTERNAL),
      AI_DIAGNOSTIC_CODES.INTERNAL,
      true
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
