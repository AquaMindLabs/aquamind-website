const assert = require('node:assert/strict');
const test = require('node:test');
const {
  mapRevenueCatEventToSubscriptionState,
  normalizeRevenueCatWebhookPayload,
  processRevenueCatWebhookEvent,
} = require('../scripts/subscription-webhook-sync.cjs');

function createInMemoryStore() {
  const subscriptions = new Map();
  const processedEvents = new Map();

  return {
    subscriptions,
    processedEvents,
    async runTransaction(handler) {
      const tx = {
        async getProcessedEvent(eventId) {
          return processedEvents.get(eventId) ?? null;
        },
        setProcessedEvent(eventId, data) {
          processedEvents.set(eventId, { ...(processedEvents.get(eventId) ?? {}), ...data });
        },
        async getSubscription(uid) {
          return subscriptions.get(uid) ?? null;
        },
        setSubscription(uid, data) {
          subscriptions.set(uid, { ...(subscriptions.get(uid) ?? {}), ...data });
        },
      };

      return handler(tx);
    },
  };
}

const PRODUCT_TIER_MAP = {
  'rc_premium_monthly': 'premium',
  'rc_pro_monthly': 'pro',
};

test('normalizeRevenueCatWebhookPayload validates required fields', () => {
  const invalid = normalizeRevenueCatWebhookPayload({ event: { type: 'RENEWAL' } });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errorCode, 'INVALID_USER_ID');

  const valid = normalizeRevenueCatWebhookPayload({
    event: {
      id: 'evt_1',
      type: 'RENEWAL',
      app_user_id: 'user_1',
      product_id: 'rc_premium_monthly',
      event_timestamp_ms: 1760000000000,
    },
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.event.eventId, 'evt_1');
  assert.equal(valid.event.userId, 'user_1');
});

test('mapRevenueCatEventToSubscriptionState maps active renewal flow', () => {
  const mapped = mapRevenueCatEventToSubscriptionState({
    event: {
      eventId: 'evt_renewal',
      type: 'RENEWAL',
      userId: 'user_renew',
      productId: 'rc_premium_monthly',
      source: 'play_store',
      eventTimestampMs: 1760000000000,
      purchasedAtMs: 1757000000000,
      expirationAtMs: 1762600000000,
      gracePeriodExpirationAtMs: 0,
      autoResumeAtMs: 0,
      cancelReason: '',
    },
    currentSubscription: null,
    productTierMap: PRODUCT_TIER_MAP,
    planVersion: 5,
    observedAtMs: 1760000000000,
  });

  assert.equal(mapped.action, 'apply');
  assert.equal(mapped.nextSubscription.tier, 'premium');
  assert.equal(mapped.nextSubscription.status, 'active');
  assert.equal(mapped.nextSubscription.source, 'play_store');
  assert.equal(mapped.nextSubscription.planVersion, 5);
  assert.equal(mapped.nextSubscription.renewsAt, '2025-11-08T11:06:40.000Z');
});

test('processRevenueCatWebhookEvent supports renewal -> cancellation -> expiration', async () => {
  const store = createInMemoryStore();
  const nowMs = () => 1760001000000;

  const renewalResult = await processRevenueCatWebhookEvent({
    payload: {
      event: {
        id: 'evt_lifecycle_1',
        type: 'RENEWAL',
        app_user_id: 'user_lifecycle',
        product_id: 'rc_pro_monthly',
        event_timestamp_ms: 1760000000000,
        purchased_at_ms: 1758000000000,
        expiration_at_ms: 1762600000000,
        store: 'PLAY_STORE',
      },
    },
    store,
    productTierMap: PRODUCT_TIER_MAP,
    planVersion: 6,
    nowMs,
  });

  assert.equal(renewalResult.status, 'processed');
  assert.equal(store.subscriptions.get('user_lifecycle').status, 'active');
  assert.equal(store.subscriptions.get('user_lifecycle').tier, 'pro');

  const cancellationResult = await processRevenueCatWebhookEvent({
    payload: {
      event: {
        id: 'evt_lifecycle_2',
        type: 'CANCELLATION',
        app_user_id: 'user_lifecycle',
        product_id: 'rc_pro_monthly',
        event_timestamp_ms: 1760100000000,
        expiration_at_ms: 1762600000000,
        cancel_reason: 'UNSUBSCRIBE',
        store: 'PLAY_STORE',
      },
    },
    store,
    productTierMap: PRODUCT_TIER_MAP,
    planVersion: 6,
    nowMs: () => 1760101000000,
  });

  assert.equal(cancellationResult.status, 'processed');
  assert.equal(store.subscriptions.get('user_lifecycle').status, 'cancelled');
  assert.equal(store.subscriptions.get('user_lifecycle').renewsAt, null);

  const expirationResult = await processRevenueCatWebhookEvent({
    payload: {
      event: {
        id: 'evt_lifecycle_3',
        type: 'EXPIRATION',
        app_user_id: 'user_lifecycle',
        product_id: 'rc_pro_monthly',
        event_timestamp_ms: 1762601000000,
        expiration_at_ms: 1762600000000,
        expiration_reason: 'UNSUBSCRIBE',
        store: 'PLAY_STORE',
      },
    },
    store,
    productTierMap: PRODUCT_TIER_MAP,
    planVersion: 6,
    nowMs: () => 1762602000000,
  });

  assert.equal(expirationResult.status, 'processed');
  assert.equal(store.subscriptions.get('user_lifecycle').status, 'expired');
  assert.equal(store.subscriptions.get('user_lifecycle').renewsAt, null);
});

test('processRevenueCatWebhookEvent maps billing issue to grace_period', async () => {
  const store = createInMemoryStore();

  const result = await processRevenueCatWebhookEvent({
    payload: {
      event: {
        id: 'evt_grace_1',
        type: 'BILLING_ISSUE',
        app_user_id: 'user_grace',
        product_id: 'rc_premium_monthly',
        event_timestamp_ms: 1761000000000,
        expiration_at_ms: 1761100000000,
        grace_period_expiration_at_ms: 1761200000000,
        store: 'APP_STORE',
      },
    },
    store,
    productTierMap: PRODUCT_TIER_MAP,
    nowMs: () => 1761001000000,
  });

  assert.equal(result.status, 'processed');
  const saved = store.subscriptions.get('user_grace');
  assert.equal(saved.status, 'grace_period');
  assert.equal(saved.source, 'app_store');
  assert.equal(saved.renewsAt, '2025-10-23T06:13:20.000Z');
});

test('processRevenueCatWebhookEvent is idempotent for duplicate event id', async () => {
  const store = createInMemoryStore();
  const payload = {
    event: {
      id: 'evt_duplicate_1',
      type: 'INITIAL_PURCHASE',
      app_user_id: 'user_dup',
      product_id: 'rc_premium_monthly',
      event_timestamp_ms: 1762000000000,
      purchased_at_ms: 1762000000000,
      expiration_at_ms: 1764600000000,
      store: 'APP_STORE',
    },
  };

  const first = await processRevenueCatWebhookEvent({
    payload,
    store,
    productTierMap: PRODUCT_TIER_MAP,
    nowMs: () => 1762001000000,
  });
  const second = await processRevenueCatWebhookEvent({
    payload,
    store,
    productTierMap: PRODUCT_TIER_MAP,
    nowMs: () => 1762002000000,
  });

  assert.equal(first.status, 'processed');
  assert.equal(second.status, 'duplicate');
  assert.equal(store.processedEvents.size, 1);
});

test('processRevenueCatWebhookEvent ignores stale event ordering', async () => {
  const store = createInMemoryStore();

  await processRevenueCatWebhookEvent({
    payload: {
      event: {
        id: 'evt_stale_new',
        type: 'RENEWAL',
        app_user_id: 'user_stale',
        product_id: 'rc_pro_monthly',
        event_timestamp_ms: 1763000000000,
        expiration_at_ms: 1765600000000,
        store: 'PLAY_STORE',
      },
    },
    store,
    productTierMap: PRODUCT_TIER_MAP,
    nowMs: () => 1763001000000,
  });

  const stale = await processRevenueCatWebhookEvent({
    payload: {
      event: {
        id: 'evt_stale_old',
        type: 'CANCELLATION',
        app_user_id: 'user_stale',
        product_id: 'rc_pro_monthly',
        event_timestamp_ms: 1762000000000,
        expiration_at_ms: 1762600000000,
        cancel_reason: 'UNSUBSCRIBE',
        store: 'PLAY_STORE',
      },
    },
    store,
    productTierMap: PRODUCT_TIER_MAP,
    nowMs: () => 1763002000000,
  });

  assert.equal(stale.status, 'stale_ignored');
  assert.equal(store.subscriptions.get('user_stale').status, 'active');
  assert.equal(store.subscriptions.get('user_stale').lastEventId, 'evt_stale_new');
});

test('processRevenueCatWebhookEvent maps SUBSCRIPTION_PAUSED to paused status', async () => {
  const store = createInMemoryStore();

  const result = await processRevenueCatWebhookEvent({
    payload: {
      event: {
        id: 'evt_paused_1',
        type: 'SUBSCRIPTION_PAUSED',
        app_user_id: 'user_paused',
        product_id: 'rc_premium_monthly',
        event_timestamp_ms: 1765000000000,
        expiration_at_ms: 1765600000000,
        auto_resume_at_ms: 1765700000000,
        store: 'PLAY_STORE',
      },
    },
    store,
    productTierMap: PRODUCT_TIER_MAP,
    nowMs: () => 1765001000000,
  });

  assert.equal(result.status, 'processed');
  const saved = store.subscriptions.get('user_paused');
  assert.equal(saved.status, 'paused');
  assert.equal(saved.source, 'play_store');
  assert.equal(saved.renewsAt, '2025-12-14T08:13:20.000Z');
});

test('processRevenueCatWebhookEvent emits BILLING_WEBHOOK_IGNORED_STALE_EVENT log', async () => {
  const store = createInMemoryStore();
  const infoLogs = [];
  const logger = {
    info: (name, payload) => {
      infoLogs.push({ name, payload });
    },
    error: () => null,
    warn: () => null,
  };

  await processRevenueCatWebhookEvent({
    payload: {
      event: {
        id: 'evt_log_new',
        type: 'RENEWAL',
        app_user_id: 'user_log',
        product_id: 'rc_pro_monthly',
        event_timestamp_ms: 1767000000000,
        expiration_at_ms: 1769600000000,
        store: 'PLAY_STORE',
      },
    },
    store,
    productTierMap: PRODUCT_TIER_MAP,
    nowMs: () => 1767001000000,
    logger,
  });

  await processRevenueCatWebhookEvent({
    payload: {
      event: {
        id: 'evt_log_old',
        type: 'CANCELLATION',
        app_user_id: 'user_log',
        product_id: 'rc_pro_monthly',
        event_timestamp_ms: 1766000000000,
        expiration_at_ms: 1766600000000,
        cancel_reason: 'UNSUBSCRIBE',
        store: 'PLAY_STORE',
      },
    },
    store,
    productTierMap: PRODUCT_TIER_MAP,
    nowMs: () => 1767002000000,
    logger,
  });

  const staleLog = infoLogs.find(
    (entry) => entry.name === 'BILLING_WEBHOOK_IGNORED_STALE_EVENT'
  );
  assert.ok(staleLog, 'expected stale webhook diagnostic log');
  assert.equal(typeof staleLog.payload.userIdHash, 'string');
  assert.equal(staleLog.payload.userId, undefined);
});
