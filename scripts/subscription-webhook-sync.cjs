const crypto = require('node:crypto');

const DEFAULT_PLAN_VERSION = 4;
const DEFAULT_SUBSCRIPTIONS_COLLECTION = 'userSubscriptions';
const DEFAULT_EVENTS_COLLECTION = 'billingWebhookEvents';

const ACTIVE_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'TRANSFER',
  'SUBSCRIPTION_EXTENDED',
  'NON_RENEWING_PURCHASE',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);

const MAPPED_EVENT_TYPES = new Set([
  ...ACTIVE_EVENT_TYPES,
  'BILLING_ISSUE',
  'CANCELLATION',
  'SUBSCRIPTION_PAUSED',
  'EXPIRATION',
]);

function normalizePlanId(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'premium' || normalized === 'pro') {
    return normalized;
  }
  return 'free';
}

function toFiniteMs(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric);
  }
  const parsed = new Date(String(value ?? '')).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toIsoOrNull(value) {
  const ms = toFiniteMs(value);
  if (!ms) {
    return null;
  }
  return new Date(ms).toISOString();
}

function normalizeStoreToSource(store) {
  const normalized = String(store ?? '').trim().toUpperCase();
  if (normalized === 'PLAY_STORE') {
    return 'play_store';
  }
  if (normalized === 'APP_STORE' || normalized === 'MAC_APP_STORE') {
    return 'app_store';
  }
  if (normalized === 'STRIPE' || normalized === 'RC_BILLING') {
    return 'stripe';
  }
  if (normalized === 'PROMOTIONAL' || normalized === 'TEST_STORE') {
    return 'promo';
  }
  return 'system';
}

function buildProductTierMapFromEnv(env = process.env) {
  const map = {};

  const entries = [
    {
      productId: env.EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_IOS_PRODUCT_ID,
      tier: 'premium',
    },
    {
      productId: env.EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_ANDROID_PRODUCT_ID,
      tier: 'premium',
    },
    {
      productId: env.EXPO_PUBLIC_SUBSCRIPTION_PRO_IOS_PRODUCT_ID,
      tier: 'pro',
    },
    {
      productId: env.EXPO_PUBLIC_SUBSCRIPTION_PRO_ANDROID_PRODUCT_ID,
      tier: 'pro',
    },
  ];

  for (const entry of entries) {
    const normalized = String(entry.productId ?? '').trim().toLowerCase();
    if (normalized) {
      map[normalized] = entry.tier;
    }
  }

  return map;
}

function getTierByProductId(productId, productTierMap) {
  const normalized = String(productId ?? '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const resolved = productTierMap[normalized];
  if (resolved === 'premium' || resolved === 'pro') {
    return resolved;
  }
  return null;
}

function normalizeRevenueCatWebhookPayload(payload) {
  const root =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : {};
  const event =
    root.event && typeof root.event === 'object' && !Array.isArray(root.event)
      ? root.event
      : root;

  const type = String(event.type ?? '').trim().toUpperCase();
  const userId = String(
    event.app_user_id ?? event.appUserId ?? event.uid ?? event.userId ?? ''
  ).trim();

  if (!type) {
    return {
      ok: false,
      errorCode: 'INVALID_EVENT_TYPE',
      reason: 'Missing billing event type.',
    };
  }

  if (!userId) {
    return {
      ok: false,
      errorCode: 'INVALID_USER_ID',
      reason: 'Missing app user identifier.',
    };
  }

  const eventTimestampMs = toFiniteMs(
    event.event_timestamp_ms ?? event.eventTimestampMs ?? event.timestamp_ms
  );
  const purchasedAtMs = toFiniteMs(
    event.purchased_at_ms ?? event.purchasedAtMs ?? event.original_purchase_date_ms
  );
  const expirationAtMs = toFiniteMs(
    event.expiration_at_ms ?? event.expirationAtMs
  );
  const gracePeriodExpirationAtMs = toFiniteMs(
    event.grace_period_expiration_at_ms ?? event.gracePeriodExpirationAtMs
  );
  const autoResumeAtMs = toFiniteMs(
    event.auto_resume_at_ms ?? event.autoResumeAtMs
  );
  const cancelReason = String(
    event.cancel_reason ?? event.cancelReason ?? event.expiration_reason ?? ''
  )
    .trim()
    .toUpperCase();
  const productId = String(event.product_id ?? event.productId ?? '').trim() || null;
  const store = String(event.store ?? '').trim().toUpperCase();

  const inferredEventIdSeed = JSON.stringify({
    type,
    userId,
    productId,
    eventTimestampMs,
    purchasedAtMs,
    expirationAtMs,
    gracePeriodExpirationAtMs,
    autoResumeAtMs,
    cancelReason,
  });

  const eventId = String(
    event.id ??
      event.event_id ??
      event.webhook_id ??
      event.transaction_id ??
      crypto.createHash('sha1').update(inferredEventIdSeed).digest('hex')
  ).trim();

  return {
    ok: true,
    event: {
      eventId,
      type,
      userId,
      productId,
      store,
      source: normalizeStoreToSource(store),
      eventTimestampMs,
      purchasedAtMs,
      expirationAtMs,
      gracePeriodExpirationAtMs,
      autoResumeAtMs,
      cancelReason,
      rawEvent: event,
    },
  };
}

function normalizeExistingSubscription(value) {
  const current =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    userId: String(current.userId ?? '').trim() || null,
    tier: normalizePlanId(current.tier),
    status: String(current.status ?? '').trim().toLowerCase() || 'active',
    source: String(current.source ?? '').trim().toLowerCase() || 'system',
    startedAt: toIsoOrNull(current.startedAt),
    expiresAt: toIsoOrNull(current.expiresAt),
    renewsAt: toIsoOrNull(current.renewsAt),
    lastValidatedAt: toIsoOrNull(current.lastValidatedAt),
    planVersion:
      Number.isFinite(Number(current.planVersion)) && Number(current.planVersion) > 0
        ? Number(current.planVersion)
        : DEFAULT_PLAN_VERSION,
    featureOverrides: Array.isArray(current.featureOverrides)
      ? current.featureOverrides.filter((item) => typeof item === 'string')
      : [],
    limitOverrides:
      current.limitOverrides && typeof current.limitOverrides === 'object'
        ? current.limitOverrides
        : {},
    lastEventId: String(current.lastEventId ?? '').trim() || null,
    lastEventType: String(current.lastEventType ?? '').trim().toUpperCase() || null,
    lastEventAtMs: toFiniteMs(current.lastEventAtMs),
  };
}

function resolveStatusFromEvent(event) {
  if (ACTIVE_EVENT_TYPES.has(event.type)) {
    return 'active';
  }

  if (event.type === 'BILLING_ISSUE') {
    return 'grace_period';
  }

  if (event.type === 'CANCELLATION') {
    if (event.cancelReason === 'BILLING_ERROR') {
      return 'grace_period';
    }
    return 'cancelled';
  }

  if (event.type === 'SUBSCRIPTION_PAUSED') {
    return 'paused';
  }

  if (event.type === 'EXPIRATION') {
    return 'expired';
  }

  return null;
}

function shouldGrantRenewalDate(status) {
  return status === 'active' || status === 'grace_period' || status === 'paused';
}

function mapRevenueCatEventToSubscriptionState({
  event,
  currentSubscription,
  productTierMap,
  planVersion,
  observedAtMs,
}) {
  const status = resolveStatusFromEvent(event);
  if (!status || !MAPPED_EVENT_TYPES.has(event.type)) {
    return {
      action: 'ignore',
      reason: 'unsupported_event_type',
    };
  }

  const previous = normalizeExistingSubscription(currentSubscription);
  const tierFromProduct = getTierByProductId(event.productId, productTierMap);
  const tier = normalizePlanId(tierFromProduct ?? previous.tier);
  const effectiveSource =
    tier === 'free'
      ? 'system'
      : event.source && event.source !== 'system'
        ? event.source
        : previous.source;

  const eventAtIso = toIsoOrNull(event.eventTimestampMs) ?? new Date(observedAtMs).toISOString();
  const purchaseIso = toIsoOrNull(event.purchasedAtMs);
  const expirationIso = toIsoOrNull(event.expirationAtMs);
  const graceExpiresIso = toIsoOrNull(event.gracePeriodExpirationAtMs);
  const autoResumeIso = toIsoOrNull(event.autoResumeAtMs);

  let startedAt = previous.startedAt;
  if (!startedAt && (status === 'active' || status === 'cancelled' || status === 'grace_period')) {
    startedAt = purchaseIso ?? eventAtIso;
  }
  if (event.type === 'INITIAL_PURCHASE') {
    startedAt = purchaseIso ?? eventAtIso;
  }

  let expiresAt = previous.expiresAt;
  if (expirationIso) {
    expiresAt = expirationIso;
  } else if (event.type === 'EXPIRATION') {
    expiresAt = eventAtIso;
  }

  let renewsAt = null;
  if (shouldGrantRenewalDate(status)) {
    if (status === 'grace_period') {
      renewsAt = graceExpiresIso ?? expirationIso ?? previous.renewsAt ?? null;
    } else if (status === 'paused') {
      renewsAt = autoResumeIso ?? expirationIso ?? previous.renewsAt ?? null;
    } else {
      renewsAt = expirationIso ?? previous.renewsAt ?? null;
    }
  }

  return {
    action: 'apply',
    nextSubscription: {
      userId: event.userId,
      tier,
      status,
      source: effectiveSource,
      startedAt,
      expiresAt,
      renewsAt,
      lastValidatedAt: new Date(observedAtMs).toISOString(),
      planVersion:
        Number.isFinite(Number(planVersion)) && Number(planVersion) > 0
          ? Number(planVersion)
          : previous.planVersion,
      featureOverrides: previous.featureOverrides,
      limitOverrides: previous.limitOverrides,
      lastEventId: event.eventId,
      lastEventType: event.type,
      lastEventAtMs: event.eventTimestampMs || observedAtMs,
    },
  };
}

function createFirestoreSubscriptionSyncStore(db, options = {}) {
  const subscriptionsCollection =
    String(options.subscriptionsCollection ?? DEFAULT_SUBSCRIPTIONS_COLLECTION).trim() ||
    DEFAULT_SUBSCRIPTIONS_COLLECTION;
  const eventsCollection =
    String(options.eventsCollection ?? DEFAULT_EVENTS_COLLECTION).trim() ||
    DEFAULT_EVENTS_COLLECTION;

  return {
    async runTransaction(handler) {
      return db.runTransaction(async (tx) => {
        const storeTx = {
          async getProcessedEvent(eventId) {
            const ref = db.collection(eventsCollection).doc(eventId);
            const snapshot = await tx.get(ref);
            return snapshot.exists ? snapshot.data() : null;
          },
          setProcessedEvent(eventId, data) {
            const ref = db.collection(eventsCollection).doc(eventId);
            tx.set(ref, data, { merge: true });
          },
          async getSubscription(uid) {
            const ref = db.collection(subscriptionsCollection).doc(uid);
            const snapshot = await tx.get(ref);
            return snapshot.exists ? snapshot.data() : null;
          },
          setSubscription(uid, data) {
            const ref = db.collection(subscriptionsCollection).doc(uid);
            tx.set(ref, data, { merge: true });
          },
        };

        return handler(storeTx);
      });
    },
  };
}

function sanitizeEventLogContext(event) {
  return {
    eventId: event.eventId,
    type: event.type,
    userId: event.userId,
    productId: event.productId,
    eventTimestampMs: event.eventTimestampMs,
    store: event.store,
  };
}

async function processRevenueCatWebhookEvent({
  payload,
  store,
  productTierMap = buildProductTierMapFromEnv(),
  planVersion = DEFAULT_PLAN_VERSION,
  nowMs = Date.now,
  logger = console,
}) {
  const normalized = normalizeRevenueCatWebhookPayload(payload);
  if (!normalized.ok) {
    return {
      ok: false,
      status: 'invalid',
      errorCode: normalized.errorCode,
      message: normalized.reason,
    };
  }

  const event = normalized.event;
  const observedAtMs = toFiniteMs(nowMs()) || Date.now();
  const safeEventContext = sanitizeEventLogContext(event);

  try {
    return await store.runTransaction(async (tx) => {
      const processedEvent = await tx.getProcessedEvent(event.eventId);
      if (processedEvent) {
        return {
          ok: true,
          status: 'duplicate',
          eventId: event.eventId,
          userId: event.userId,
        };
      }

      const currentSubscription = await tx.getSubscription(event.userId);
      const previous = normalizeExistingSubscription(currentSubscription);
      const eventAtMs = event.eventTimestampMs || observedAtMs;
      const previousEventAtMs = previous.lastEventAtMs || 0;

      if (previousEventAtMs > 0 && eventAtMs < previousEventAtMs) {
        tx.setProcessedEvent(event.eventId, {
          eventId: event.eventId,
          userId: event.userId,
          type: event.type,
          eventTimestampMs: eventAtMs,
          processedAt: new Date(observedAtMs).toISOString(),
          outcome: 'stale_ignored',
        });

        return {
          ok: true,
          status: 'stale_ignored',
          eventId: event.eventId,
          userId: event.userId,
        };
      }

      const mapped = mapRevenueCatEventToSubscriptionState({
        event,
        currentSubscription: previous,
        productTierMap,
        planVersion,
        observedAtMs,
      });

      if (mapped.action !== 'apply') {
        tx.setProcessedEvent(event.eventId, {
          eventId: event.eventId,
          userId: event.userId,
          type: event.type,
          eventTimestampMs: eventAtMs,
          processedAt: new Date(observedAtMs).toISOString(),
          outcome: 'ignored',
          reason: mapped.reason ?? 'unsupported_event_type',
        });

        return {
          ok: true,
          status: 'ignored',
          eventId: event.eventId,
          userId: event.userId,
          reason: mapped.reason ?? 'unsupported_event_type',
        };
      }

      tx.setSubscription(event.userId, mapped.nextSubscription);
      tx.setProcessedEvent(event.eventId, {
        eventId: event.eventId,
        userId: event.userId,
        type: event.type,
        eventTimestampMs: eventAtMs,
        processedAt: new Date(observedAtMs).toISOString(),
        outcome: 'applied',
        status: mapped.nextSubscription.status,
        tier: mapped.nextSubscription.tier,
      });

      return {
        ok: true,
        status: 'processed',
        eventId: event.eventId,
        userId: event.userId,
        subscription: mapped.nextSubscription,
      };
    });
  } catch (error) {
    logger.error('subscription_webhook_process_failed', {
      ...safeEventContext,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function isWebhookAuthorized(headers, expectedSecret) {
  const secret = String(expectedSecret ?? '').trim();
  if (!secret) {
    return true;
  }

  const authorizationHeader = String(headers.authorization ?? '').trim();
  const xWebhookSecret = String(headers['x-webhook-secret'] ?? '').trim();
  const bearer = authorizationHeader.toLowerCase().startsWith('bearer ')
    ? authorizationHeader.slice(7).trim()
    : authorizationHeader;

  if (xWebhookSecret && xWebhookSecret === secret) {
    return true;
  }
  if (bearer && bearer === secret) {
    return true;
  }
  return false;
}

module.exports = {
  DEFAULT_PLAN_VERSION,
  DEFAULT_SUBSCRIPTIONS_COLLECTION,
  DEFAULT_EVENTS_COLLECTION,
  buildProductTierMapFromEnv,
  normalizeRevenueCatWebhookPayload,
  mapRevenueCatEventToSubscriptionState,
  processRevenueCatWebhookEvent,
  createFirestoreSubscriptionSyncStore,
  isWebhookAuthorized,
  normalizePlanId,
  getTierByProductId,
  normalizeStoreToSource,
};
