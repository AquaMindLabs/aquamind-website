import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/shared/services/firebase';

const TELEMETRY_EVENTS_COLLECTION = 'telemetryEvents';
const TELEMETRY_ERRORS_COLLECTION = 'telemetryErrors';
const FATAL_CRASH_MARKER_STORAGE_KEY = 'telemetry_last_fatal_crash_v1';
const MAX_QUEUE_LENGTH = 80;
const MAX_TEXT_LENGTH = 1600;
const CONSOLE_ERROR_SAMPLE_RATE = 0.35;
const SHOULD_CAPTURE_CONSOLE_ERRORS = !__DEV__;

const launchStartedAtMs = Date.now();

let initialized = false;
let appMetadata = {
  appVersion: null,
  runtimeVersion: null,
};
let startupLogged = false;
let flushTimer = null;
let flushInProgress = false;
let globalErrorHandlerInstalled = false;
let previousGlobalErrorHandler = null;
let consoleErrorWrapped = false;
let originalConsoleError = null;

const queue = [];

function truncateText(value, maxLength = MAX_TEXT_LENGTH) {
  const normalized = String(value ?? '');
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function normalizeValue(value, depth = 0) {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value ?? null;
  }

  if (typeof value === 'string') {
    return truncateText(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateText(value.message),
      stack: truncateText(value.stack ?? ''),
    };
  }

  if (typeof value === 'function') {
    return '[function]';
  }

  if (depth >= 3) {
    return '[max_depth_reached]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => normalizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).slice(0, 30);
    const result = {};

    for (const [key, item] of entries) {
      result[key] = normalizeValue(item, depth + 1);
    }

    return result;
  }

  return truncateText(String(value));
}

function queueRecord(record) {
  queue.push(record);

  if (queue.length > MAX_QUEUE_LENGTH) {
    queue.splice(0, queue.length - MAX_QUEUE_LENGTH);
  }

  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) {
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushQueue().catch(() => null);
  }, 400);
}

async function writeRecord(record) {
  const targetCollection =
    record.type === 'error'
      ? TELEMETRY_ERRORS_COLLECTION
      : TELEMETRY_EVENTS_COLLECTION;

  const payload = {
    ...record,
    uid: auth.currentUser?.uid ?? null,
    platform: Platform.OS,
    appVersion: appMetadata.appVersion,
    runtimeVersion: appMetadata.runtimeVersion,
    createdAt: serverTimestamp(),
  };

  await addDoc(collection(db, targetCollection), payload);
}

async function flushQueue() {
  if (flushInProgress || queue.length === 0) {
    return;
  }

  flushInProgress = true;

  try {
    while (queue.length > 0) {
      const nextRecord = queue.shift();
      if (!nextRecord) {
        continue;
      }

      try {
        await writeRecord(nextRecord);
      } catch {
        queue.unshift(nextRecord);
        break;
      }
    }
  } finally {
    flushInProgress = false;

    if (queue.length > 0) {
      scheduleFlush();
    }
  }
}

function buildBaseRecord() {
  return {
    localTimestamp: new Date().toISOString(),
  };
}

function setFatalCrashMarker(errorPayload) {
  AsyncStorage.setItem(
    FATAL_CRASH_MARKER_STORAGE_KEY,
    JSON.stringify({
      recordedAt: new Date().toISOString(),
      error: normalizeValue(errorPayload),
    })
  ).catch(() => null);
}

async function emitFatalCrashRecoveryIfNeeded() {
  try {
    const raw = await AsyncStorage.getItem(FATAL_CRASH_MARKER_STORAGE_KEY);
    if (!raw) {
      return;
    }

    await AsyncStorage.removeItem(FATAL_CRASH_MARKER_STORAGE_KEY);

    logTelemetryEvent(
      'app_recovered_after_fatal_error',
      {
        previousFatal: normalizeValue(raw),
      },
      { level: 'error' }
    );
  } catch {
    // Ignore telemetry marker errors.
  }
}

function installGlobalErrorHandler() {
  if (globalErrorHandlerInstalled) {
    return;
  }

  const errorUtils = global?.ErrorUtils;
  const hasHandlerApi =
    errorUtils &&
    typeof errorUtils.getGlobalHandler === 'function' &&
    typeof errorUtils.setGlobalHandler === 'function';

  if (!hasHandlerApi) {
    return;
  }

  previousGlobalErrorHandler = errorUtils.getGlobalHandler();

  errorUtils.setGlobalHandler((error, isFatal) => {
    logTelemetryError(error, {
      source: 'global_error_handler',
      isFatal: Boolean(isFatal),
    });

    if (isFatal) {
      setFatalCrashMarker(error);
    }

    if (typeof previousGlobalErrorHandler === 'function') {
      previousGlobalErrorHandler(error, isFatal);
    }
  });

  globalErrorHandlerInstalled = true;
}

function installConsoleErrorHook() {
  if (!SHOULD_CAPTURE_CONSOLE_ERRORS || consoleErrorWrapped) {
    return;
  }

  originalConsoleError = console.error?.bind(console);
  if (typeof originalConsoleError !== 'function') {
    return;
  }

  console.error = (...args) => {
    try {
      if (Math.random() <= CONSOLE_ERROR_SAMPLE_RATE) {
        logTelemetryEvent(
          'console_error',
          {
            args: normalizeValue(args),
          },
          { level: 'error' }
        );
      }
    } catch {
      // Avoid throwing inside console wrappers.
    }

    originalConsoleError(...args);
  };

  consoleErrorWrapped = true;
}

export function initializeObservability(metadata = {}) {
  appMetadata = {
    appVersion: metadata?.appVersion ? String(metadata.appVersion) : null,
    runtimeVersion: metadata?.runtimeVersion ? String(metadata.runtimeVersion) : null,
  };

  if (initialized) {
    return;
  }

  initialized = true;
  installGlobalErrorHandler();
  installConsoleErrorHook();
  emitFatalCrashRecoveryIfNeeded().catch(() => null);

  logTelemetryEvent('observability_initialized', {
    startupMsFromBundleLoad: Date.now() - launchStartedAtMs,
  });
}

export function logTelemetryEvent(name, payload = {}, options = {}) {
  if (!name) {
    return;
  }

  queueRecord({
    ...buildBaseRecord(),
    type: 'event',
    name: truncateText(name, 140),
    level: options?.level ? String(options.level) : 'info',
    payload: normalizeValue(payload),
  });
}

export function logTelemetryError(error, context = {}) {
  const normalizedError =
    error instanceof Error
      ? {
          name: error.name || 'Error',
          message: truncateText(error.message || 'Unknown error'),
          stack: truncateText(error.stack ?? ''),
        }
      : {
          name: 'NonErrorThrow',
          message: truncateText(String(error)),
          stack: '',
        };

  queueRecord({
    ...buildBaseRecord(),
    type: 'error',
    name: normalizedError.name,
    level: 'error',
    message: normalizedError.message,
    stack: normalizedError.stack,
    context: normalizeValue(context),
  });
}

export function markStartupReady(extra = {}) {
  if (startupLogged) {
    return;
  }

  startupLogged = true;

  logTelemetryEvent('app_startup_ready', {
    startupDurationMs: Date.now() - launchStartedAtMs,
    ...normalizeValue(extra),
  });
}

export function trackPurchaseAttempt(payload = {}) {
  logTelemetryEvent('purchase_attempt', payload, { level: 'info' });
}

export function trackPurchaseSuccess(payload = {}) {
  logTelemetryEvent('purchase_success', payload, { level: 'info' });
}

export function trackPurchaseFailure(error, payload = {}) {
  logTelemetryError(error, {
    source: 'purchase_flow',
    ...normalizeValue(payload),
  });
  logTelemetryEvent('purchase_failure', payload, { level: 'error' });
}

export function trackBillingPurchaseStarted(payload = {}) {
  logTelemetryEvent('BILLING_PURCHASE_STARTED', payload, { level: 'info' });
}

export function trackBillingPurchaseSuccess(payload = {}) {
  logTelemetryEvent('BILLING_PURCHASE_SUCCESS', payload, { level: 'info' });
}

export function trackBillingPurchaseFailure(error, payload = {}) {
  logTelemetryError(error, {
    source: 'purchase_billing_flow',
    ...normalizeValue(payload),
  });
  logTelemetryEvent('BILLING_PURCHASE_FAILED', payload, { level: 'error' });
}

export function trackBillingRestore(payload = {}) {
  const phase = String(payload?.phase ?? '').trim().toLowerCase();
  if (phase === 'success') {
    logTelemetryEvent('BILLING_RESTORE_SUCCESS', payload, { level: 'info' });
    return;
  }
  if (phase === 'failure') {
    logTelemetryEvent('BILLING_RESTORE_FAILED', payload, { level: 'error' });
    return;
  }
  logTelemetryEvent('BILLING_RESTORE_STARTED', payload, { level: 'info' });
}

export function trackBillingEntitlementRefreshed(payload = {}) {
  logTelemetryEvent('BILLING_ENTITLEMENT_REFRESHED', payload, { level: 'info' });
}

export function trackBillingWebhookIgnoredStaleEvent(payload = {}) {
  logTelemetryEvent(
    'BILLING_WEBHOOK_IGNORED_STALE_EVENT',
    payload,
    { level: 'warn' }
  );
}

export function trackAiRequestStarted(payload = {}) {
  logTelemetryEvent('ai_request_started', payload, { level: 'info' });
}

export function trackAiRequestSuccess(payload = {}) {
  logTelemetryEvent('ai_request_success', payload, { level: 'info' });
}

export function trackAiRequestFailure(error, payload = {}) {
  logTelemetryError(error, {
    source: 'ai_request',
    ...normalizeValue(payload),
  });
  logTelemetryEvent('ai_request_failure', payload, { level: 'error' });
}

export function logAiDiagnosticEvent(payload = {}) {
  logTelemetryEvent(
    'ai_diagnostic',
    {
      ...normalizeValue(payload),
    },
    { level: 'info' }
  );
}

export function flushTelemetry() {
  return flushQueue();
}
