# Subscription Billing Sandbox Checklist

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

## Store setup
- Google Play: subscription products active, internal testing track build uploaded, tester account added to License Testing.
- App Store: subscription products created and available for sandbox testing, sandbox tester account configured.

## Build & run
- Install dependency: `react-native-purchases`.
- Build dev client (Expo Go is not enough for native billing SDKs).
- Install build from internal/sandbox channel and sign in with sandbox test accounts.

## E2E scenarios
- Buy Premium from Free and verify plan updates automatically.
- Buy Pro from Free/Premium and verify plan updates automatically.
- Restore purchases and verify previously bought plan is restored.
- Relaunch app and verify plan still resolves from billing data.

## Expected status mapping in app
- `active`: active and renewing.
- `grace_period`: active with billing issue detected.
- `cancelled`: still active but renewal is turned off.
- `paused`: inactive with renewal expected later.
- `expired`: inactive and no renewal.
