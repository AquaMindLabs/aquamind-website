# Release Checklist (Manual + Config)

## 1) RevenueCat / sklepy
- [ ] Uzupełnij env:
  - EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID
  - EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
  - EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
  - EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_IOS_PRODUCT_ID
  - EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_ANDROID_PRODUCT_ID
  - EXPO_PUBLIC_SUBSCRIPTION_PRO_IOS_PRODUCT_ID
  - EXPO_PUBLIC_SUBSCRIPTION_PRO_ANDROID_PRODUCT_ID
- [ ] Potwierdź zgodność productId w Google Play / App Store / RevenueCat.
- [ ] Uruchom: npm run billing:sandbox:audit (ma być PASS).

## 2) Smoke manualny
- [ ] Odhacz SMK-ONB-*, SMK-CAL-*, SMK-MEA-*, SMK-STK-*, SMK-EQP-*, SMK-AI-*, SMK-AI-RLS-* w docs/release-smoke-checklist.md
- [ ] Uruchom: npm run release:smoke:gate (ma być PASS).

## 3) Finalna bramka techniczna
- [ ] npm run lint
- [ ] npx tsc --noEmit
- [ ] npm run test:firestore
- [ ] npm run test:subscription:webhook
- [ ] npm run test:subscription:gating
- [ ] npm run test:ai:backend
- [ ] npm run release:preflight
- [ ] npm run release:smoke:gate
