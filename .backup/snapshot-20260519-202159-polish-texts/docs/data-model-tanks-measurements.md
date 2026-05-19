# Data Model: Tanks + Measurements

## Zakres

Opisuje praktyczny kontrakt danych dla kolekcji `tanks` i `measurements`, plus fallbacki legacy.

## Kolekcja `tanks`

### Pola wymagane

- `userId: string`
- `name: string`
- `liters: number`
- `createdAt: timestamp`

### Pola opcjonalne (najczesciej uzywane)

- profil/typ:
  - `aquariumType`
  - `waterProfile`
  - `singleSpeciesFishId`
- wymiary i temperatura:
  - `lengthCm`, `widthCm`, `heightCm`
  - `targetTemperatureC`, `ambientTemperatureC`, `roomTemperatureMode`
- oswietlenie:
  - `lightIntensity`, `lightHours`, `lightModelId`, `lightModelName`, `lightLumens`
- podloze:
  - `substrateType` (legacy)
  - `substrateTypes` (aktualny model listy)
- onboarding:
  - `onboardingMode`
  - `onboardingEnabled`
  - `onboardingStartAt`
  - `onboardingTaskChecks`
- akcje utrzymania:
  - `maintenanceActionState`
- sprzet:
  - listowy model: `heaterEquipments`, `filterEquipments`
  - legacy model: `heaterEquipment`, `filterEquipment`
- inne:
  - `targetRanges`, `plantFertilizationEntries`, `zones`, `updatedAt`

### Walidacja i normalizacja runtime

- `normalizeTankRuntime`
  - m.in. mapuje `existing_running -> mature_media_start`
- `validateTankRuntime`
  - szybka walidacja klienta
- `buildTankSanitizationPatchRuntime`
  - usuwa pola niezgodne z kontraktem (`deleteField`)
- `buildTankUpdatePayloadRuntime`
  - laczy patch sanitizujacy + update biznesowy

## Kolekcja `measurements`

### Pola wymagane

- `userId: string`
- `tankId: string`
- `tankName: string`
- `createdAt: timestamp`

### Pola opcjonalne

- `note`, `measuredAt`, `updatedAt`
- parametry:
  - `ph`, `gh`, `kh`, `no2`, `no3`, `temperature`
  - `nh3nh4`, `po4`, `fe`, `ca`, `mg`, `k`, `tds`, `co2`

### Walidacja i normalizacja runtime

- `normalizeMeasurementRuntime`
  - konwersje numeryczne, trim notatki
- `validateMeasurementRuntime`
  - sprawdza, czy jest min. jeden parametr liczbowy
- `buildMeasurementSanitizationPatchRuntime`
  - usuwa nieznane pola

## Firestore rules jako source of truth serwera

Runtime contracts po stronie klienta sa pomocnicze, ale finalnie i tak decyduja:

- `firestore.rules`
  - allowed keys
  - zakresy liczb
  - typy i rozmiary map/list
  - owner checks (`userId == auth.uid`)

## Znane legacy constraints i fallbacki

1. `onboardingMode=existing_running`:
   - nadal akceptowane przez rules
   - runtime normalizowane do `mature_media_start`
2. Zapis `tanks`:
   - pelny payload
   - fallback payload kompatybilnosci przy `permission-denied`
3. Sprzet i podloze:
   - rownolegla obsluga pol legacy i nowych
4. Stare dokumenty:
   - moga miec pola niezgodne z nowymi rules
   - do czyszczenia sluzy `sanitize:legacy`

## Checklist: co zrobic po zmianie modelu danych

1. Zmien `tankModel.ts` i/lub `measurementModel.ts`.
2. Zmien `firestore.rules` (keys, zakresy, map/list limits).
3. Zweryfikuj save paths:
   - create/update tank
   - create/update measurement
4. Sprawdz fallbacki legacy:
   - `existing_running`
   - model listowy + legacy dla sprzetu
   - `substrateType` vs `substrateTypes`
5. Uruchom:
   - `npm run lint`
   - `node --test tests/onboardingPlan.test.cjs`
   - `npm run test:firestore`
6. Deploy rules:
   - `npm run firestore:deploy:rules`
7. Dla danych historycznych:
   - `npm run sanitize:legacy:dry-run`
   - `npm run sanitize:legacy`

## Checklist: co testowac recznie

1. Dodanie nowego akwarium i zapis wszystkich krokow wizarda.
2. Edycja istniejacego akwarium z danymi legacy.
3. Dodanie i edycja pomiaru (w tym `measuredAt` i `co2` auto).
4. Akcje na kalendarzu i zapis `maintenanceActionState`.
5. Przeladowanie aplikacji i weryfikacja, czy odczyt jest spójny.
