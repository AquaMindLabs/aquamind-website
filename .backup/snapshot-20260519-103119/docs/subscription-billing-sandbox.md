# Subscription Billing Sandbox Checklist

## Current known blocker (to verify)
- RevenueCat Play credentials currently show: `Credentials need attention`.
- Affected checks:
  - `Permissions to call subscriptions API`
  - `Permissions to call inappproducts API`
  - `Permissions to call monetization API`
- Assigned service account:
  - `revenuecat-play@my-aquarium-assistant.iam.gserviceaccount.com`
- Next verification step:
  - run `Recheck credentials` in RevenueCat after Google Play permission propagation.

## Required env vars
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` (recommended)
- `EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_IOS_PRODUCT_ID`
- `EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_ANDROID_PRODUCT_ID`
- `EXPO_PUBLIC_SUBSCRIPTION_PRO_IOS_PRODUCT_ID`
- `EXPO_PUBLIC_SUBSCRIPTION_PRO_ANDROID_PRODUCT_ID`

## RevenueCat setup
- Create products in RevenueCat with product IDs matching app env vars.
- Add at least one Offering with packages connected to Premium/Pro products.
- Configure one entitlement (for example `premium_access`) and attach Premium/Pro products.
- Put entitlement key into `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`.
- Keep one canonical entitlement key across app + backend + RevenueCat project.

## Store setup
- Google Play: subscription products active, internal testing track build uploaded, tester account added to License Testing.
- App Store: subscription products created and available for sandbox testing, sandbox tester account configured.

## Build & run
- Install dependency: `react-native-purchases`.
- Build dev client (Expo Go is not enough for native billing SDKs).
- Install build from internal/sandbox channel and sign in with sandbox test accounts.

## Quick commands
- `npm run billing:sandbox:audit` (sprawdzenie lokalnej konfiguracji env i mapowania productId -> tier)
- `npm run test:subscription:webhook` (mapowanie eventow webhook)
- `npm run test:subscription:gating` (gating funkcji)

## E2E scenarios
- Buy Premium from Free and verify plan updates automatically.
- Buy Pro from Free/Premium and verify plan updates automatically.
- Restore purchases and verify previously bought plan is restored.
- Relaunch app and verify plan still resolves from billing data.
- After purchase/restore, verify UI gates unlock immediately without app restart.
- Simulate loss of entitlement (sandbox cancellation/expiration flow) and verify gates lock again.

## Expected status mapping in app
- `active`: active and renewing.
- `grace_period`: active with billing issue detected.
- `cancelled`: still active but renewal is turned off.
- `paused`: inactive with renewal expected later.
- `expired`: inactive and no renewal.

## Runtime diagnostics (no PII)
- `BILLING_PURCHASE_STARTED`
- `BILLING_PURCHASE_SUCCESS`
- `BILLING_PURCHASE_FAILED`
- `BILLING_RESTORE_SUCCESS`
- `BILLING_RESTORE_FAILED`
- `BILLING_ENTITLEMENT_REFRESHED`
- `BILLING_WEBHOOK_IGNORED_STALE_EVENT`

## Manual sandbox test flow (QA/PM)
1. Free -> Premium purchase.
2. Premium -> Pro purchase.
3. Kill app and open again (plan should persist).
4. Restore purchases on same account.
5. Login on second device and run restore.
6. Trigger cancellation in store sandbox and verify `cancelled`.
7. Trigger billing issue/grace state and verify `grace_period`.
8. Trigger expiration and verify `expired`.
9. Trigger pause/resume (where store supports) and verify `paused` -> `active`.
