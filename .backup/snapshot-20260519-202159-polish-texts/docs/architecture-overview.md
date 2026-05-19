# Architecture Overview

## Cel

Dokument opisuje aktualna mape modulow, przeplyw danych i punkty ryzyka kompatybilnosci.

## Glowna struktura

- `app/index.js`
  - glowna orkiestracja UI i logiki sesji
  - integruje sekcje, modale, zapis/odczyt Firestore
- `features/aquarium/components/*`
  - `OnboardingPanel.tsx` - UI onboardingu
  - `ActionCalendarPanel.tsx` - UI kalendarza akcji
  - `CustomDrawer.tsx` - nawigacja drawer
- `features/aquarium/sections/*`
  - kontenery sekcji (`ReviewSection`, `TankInfoSection`, `EquipmentSection`, `FishSection`, `PlantSection`, `HistorySection`)
- `features/aquarium/hooks/*`
  - `useSectionVisibility.ts` - widocznosc sekcji
  - `useAquariumSectionState.ts` - stany sekcyjne
- `features/aquarium/services/*`
  - `tasksService.js` - analiza wody, onboarding engine, adaptive tasks
  - `onboardingAdapter.ts` - mapowanie modelu onboardingu do UI
  - `actionCalendarService.ts` - wyliczanie kalendarza akcji
  - `actionStateService.ts` - update state done/skip/postpone
  - `stockingService.js`, `equipmentService.js`, `waterService.js`, `emergencyService.js`
- `features/aquarium/model/*`
  - `tankModel.ts` - runtime normalizacja/walidacja/sanitizacja payloadow
  - `measurementModel.ts` - runtime normalizacja/walidacja/sanitizacja pomiarow
- `logic/*`
  - funkcje domenowe i kalkulatory
- `shared/*`
  - komponenty wspolne, telemetry, boundary

## Przeplyw danych (high-level)

1. UI w `app/index.js` zbiera input usera.
2. Przed zapisem dane sa normalizowane i walidowane przez modele runtime.
3. Zapis do Firestore (`tanks`, `measurements`, `stockItems`, `tankDiseaseCases`).
4. Po zapisie odswiezenie danych (`fetch*`) i ponowne przeliczenie sekcji.
5. Serwisy (`tasksService`, `actionCalendarService`) buduja widoki analityczne.

## Write path i kontrakty

- `tanks`:
  - docelowo update przez `buildTankUpdatePayload(...)`
  - contract: `tankModel.ts`
- `measurements`:
  - normalizacja: `normalizeMeasurementRuntime`
  - walidacja: `validateMeasurementRuntime`
  - patch sanitizujacy: `buildMeasurementSanitizationPatchRuntime`
- reguly serwera:
  - `firestore.rules` jako ostatnia warstwa walidacji

## Onboarding i kalendarz

- Onboarding:
  - domena: `tasksService.js` (`buildTankOnboardingPlanService`, `evaluateOnboardingStep`, NO2 freshness)
  - adapter: `onboardingAdapter.ts`
  - UI: `OnboardingPanel.tsx`
- Kalendarz:
  - domena: `actionCalendarService.ts`
  - state zmian: `actionStateService.ts`
  - UI: `ActionCalendarPanel.tsx`

## Znane legacy constraints i fallbacki

- `onboardingMode=existing_running`:
  - historycznie zapisane dane
  - runtime mapowanie do `mature_media_start`
- tank save fallback:
  - najpierw pelny payload
  - przy `permission-denied` fallback payloadu kompatybilnosci
- dual model dla wybranych pol:
  - `substrateType` + `substrateTypes`
  - `heaterEquipment/filterEquipment` + `heaterEquipments/filterEquipments`
- restrykcyjne `firestore.rules`:
  - zmiana modelu bez aktualizacji rules daje ryzyko `missing or insufficient permissions`

## Checklist: po zmianie modelu danych

1. Zmien kontrakty runtime (`tankModel.ts`, `measurementModel.ts`).
2. Zmien `firestore.rules` (keys/range/type).
3. Zweryfikuj wszystkie write paths w `app/index.js`.
4. Sprawdz fallbacki legacy (czy dzialaja i czy dalej sa potrzebne).
5. Odpal:
   - `npm run lint`
   - `node --test tests/onboardingPlan.test.cjs`
   - `npm run test:firestore`
6. Zdeployuj rules: `npm run firestore:deploy:rules`.

## Checklist: co testowac recznie

1. Dodanie/edycja akwarium (w tym wizard i onboarding toggle).
2. Zapis i edycja pomiaru.
3. Akcje kalendarza: done/skip/postpone.
4. Zmiany sprzetu i odczyt po reload.
5. Obsada i analiza zgodnosci.
6. Konto z legacy danymi (czy update nie zwraca permission errors).
