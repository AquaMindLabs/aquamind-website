# Subscription Webhook Sync (RevenueCat -> Firestore)

Cel: `userSubscriptions/{uid}` jest single source of truth dla uprawnien subskrypcji.

## Co zostalo dodane

- Worker HTTP webhook:
  - `scripts/subscription-webhook-server.cjs`
- Core sync i mapowanie eventow:
  - `scripts/subscription-webhook-sync.cjs`
- Testy integracyjne mapowania i idempotencji:
  - `tests/subscriptionWebhookSync.test.cjs`

## Kolekcje Firestore

- `userSubscriptions/{uid}`:
  - `userId`
  - `tier`
  - `status`
  - `source`
  - `startedAt`
  - `expiresAt`
  - `renewsAt`
  - `lastValidatedAt`
  - `planVersion`
  - `lastEventId`
  - `lastEventType`
  - `lastEventAtMs`
  - (opcjonalnie) `featureOverrides`, `limitOverrides` (zachowanie kompatybilnosci)
- `billingWebhookEvents/{eventId}`:
  - `eventId`, `userId`, `type`, `eventTimestampMs`, `processedAt`
  - `outcome`: `applied` / `duplicate` / `ignored` / `stale_ignored`
  - przy `applied`: `status`, `tier`

## Obslugiwane stany lifecycle

- `INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`, `UNCANCELLATION`, `TRANSFER`, `SUBSCRIPTION_EXTENDED`, `NON_RENEWING_PURCHASE`, `TEMPORARY_ENTITLEMENT_GRANT` -> `active`
- `BILLING_ISSUE` -> `grace_period`
- `CANCELLATION`:
  - `cancel_reason=BILLING_ERROR` -> `grace_period`
  - pozostale -> `cancelled`
- `SUBSCRIPTION_PAUSED` -> `paused`
- `EXPIRATION` -> `expired`

## Mapowanie productId -> tier

Mapowanie korzysta z tych samych ID produktow co model aplikacji:

- `EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_IOS_PRODUCT_ID` -> `premium`
- `EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_ANDROID_PRODUCT_ID` -> `premium`
- `EXPO_PUBLIC_SUBSCRIPTION_PRO_IOS_PRODUCT_ID` -> `pro`
- `EXPO_PUBLIC_SUBSCRIPTION_PRO_ANDROID_PRODUCT_ID` -> `pro`

## Idempotencja i deterministycznosc

- Kazdy event ma `eventId` (z payloadu albo deterministyczny hash fallback).
- Transaction flow:
  1. sprawdzenie `billingWebhookEvents/{eventId}` (duplikat -> skip),
  2. pobranie `userSubscriptions/{uid}`,
  3. ochrona przed out-of-order: event starszy niz `lastEventAtMs` -> `stale_ignored`,
  4. zapis nowego stanu + zapis przetworzonego eventu.
- Retry webhooka nie psuje stanu, bo drugi raz ten sam `eventId` zwraca `duplicate`.
- Dla out-of-order emitowany jest event diagnostyczny `BILLING_WEBHOOK_IGNORED_STALE_EVENT` (bez surowego `userId`).

## Uruchomienie lokalne

1. Ustaw zmienne:
   - `FIREBASE_PROJECT_ID`
   - `SUBSCRIPTION_WEBHOOK_SECRET`
   - opcjonalnie: `SUBSCRIPTION_WEBHOOK_PORT`, `SUBSCRIPTION_WEBHOOK_PATH`, `SUBSCRIPTION_PLAN_VERSION`
2. Uruchom:
   - `npm run billing:webhook:start`
3. Endpoint:
   - `POST /webhooks/revenuecat`
4. Auth:
   - naglowek `Authorization: Bearer <SUBSCRIPTION_WEBHOOK_SECRET>`
   - lub `x-webhook-secret: <SUBSCRIPTION_WEBHOOK_SECRET>`

## Testy

- `npm run test:subscription:webhook`
- Pokryte scenariusze:
  - `renewal -> cancellation -> expiration`
  - `billing_issue -> grace_period`
  - `duplicate eventId` (idempotencja)
  - `stale event` (ochrona przed nadpisaniem nowszego stanu)
