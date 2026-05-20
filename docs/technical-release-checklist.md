# Technical Release Checklist

Status: Open
Updated: 2026-05-20

## 1) Konfiguracja subskrypcji (RevenueCat / sklepy)

- [ ] Uzupełnij brakujące zmienne środowiskowe:
  - `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`
  - `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
  - `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
  - `EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_IOS_PRODUCT_ID`
  - `EXPO_PUBLIC_SUBSCRIPTION_PREMIUM_ANDROID_PRODUCT_ID`
  - `EXPO_PUBLIC_SUBSCRIPTION_PRO_IOS_PRODUCT_ID`
  - `EXPO_PUBLIC_SUBSCRIPTION_PRO_ANDROID_PRODUCT_ID`
- [ ] Potwierdź zgodność `productId` między: Google Play, App Store i RevenueCat.
- [ ] Potwierdź, że entitlement ID odpowiada aktywnemu entitlementowi w RevenueCat.
- [ ] Po konfiguracji uruchom ponownie: `npm run billing:sandbox:audit` (wynik musi być PASS).

## 2) Ręczny smoke test (wymagany przed release)

- [ ] Odhacz checklistę w `docs/release-smoke-checklist.md` dla sekcji:
  - ONB (`SMK-ONB-*`)
  - CAL (`SMK-CAL-*`)
  - MEA (`SMK-MEA-*`)
  - STK (`SMK-STK-*`)
  - EQP (`SMK-EQP-*`)
  - AI (`SMK-AI-*`)
  - AI pre-release probes (`SMK-AI-RLS-*`)
- [ ] Wygeneruj wynik: `npm run release:smoke:gate` (wynik musi być PASS).

## 3) Higiena paczki release

- [ ] Do release commit nie wrzucaj artefaktów/logów:
  - `firestore-debug.log`
  - `release-smoke-artifacts/*`
- [ ] Rozważ wyłączenie z release commit katalogów backup, jeśli nie są wymagane runtime:
  - `.backup/*`
- [ ] Potwierdź, że finalny commit zawiera tylko zmiany runtime + niezbędne docs release.

## 4) Końcowa bramka techniczna

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run test:firestore`
- [ ] `npm run test:subscription:webhook`
- [ ] `npm run test:subscription:gating`
- [ ] `npm run test:ai:backend`
- [ ] `npm run release:preflight`
- [ ] `npm run release:smoke:gate`

## Notatka

Część kodowa została naprawiona (TypeScript blocker = usunięty). Pozostałe punkty dotyczą konfiguracji środowiska i testów manualnych, których nie da się wiarygodnie zamknąć automatycznie.
