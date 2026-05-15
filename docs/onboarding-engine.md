# Onboarding Engine

## Cel

Onboarding nie jest sztywnym harmonogramem. Dni sa planem bazowym, a przejscie dalej zalezy od aktualnych parametrow i swiezosci pomiarow.

## Warstwy

- domena:
  - `features/aquarium/services/tasksService.js`
  - kluczowe funkcje:
    - `buildTankOnboardingPlanService`
    - `evaluateOnboardingStep`
    - `getAquariumAgeInDays`
    - `getLatestMeasurement`
    - `isMeasurementFresh`
- adapter:
  - `features/aquarium/services/onboardingAdapter.ts`
  - mapuje plan do modelu panelu UI
- UI:
  - `features/aquarium/components/OnboardingPanel.tsx`

## Tryby startu

W `tank.onboardingMode`:

- `fresh_start`
- `restart`
- `mature_media_start`

Legacy:

- `existing_running` (normalizowany runtime do `mature_media_start`)

W silniku kroki sa liczone po `startType`, mapowanym z `onboardingMode`.

## Jak liczony jest status kroku

`evaluateOnboardingStep(...)` bierze pod uwage:

1. wiek akwarium (dni od startu)
2. najnowsze pomiary
3. swiezosc wymaganych pomiarow
4. warunki blokujace i opozniajace

Mozliwe statusy:

- `planned`
- `active`
- `waiting_for_parameters`
- `delayed`
- `blocked`
- `completed` (oznaczenia checklisty)
- `skipped` (w logice roadmap, jesli uzywane)

## Najwazniejsze reguly bezpieczenstwa

- NO2 ma priorytet krytyczny.
- Krok zwiazany z dodawaniem obsady nie przechodzi dalej, gdy:
  - NO2 jest wykrywalne
  - albo brakuje swiezego NO2
- Swiezosc NO2 zalezy od trybu startu:
  - `fresh_start`: 72h
  - `restart`: 24-48h (wg kroku)
  - `mature_media_start`: 48h
- Dodatkowe ostrzezenia:
  - niestabilna temperatura
  - szybki skok pH
  - wysokie NO3 (ostrzezenie/sugestia, nie zawsze twarda blokada)

## Dynamiczne opoznianie

Plan jest przesuwany, gdy krok ma status:

- `waiting_for_parameters`
- `delayed`
- `blocked`

Silnik dodaje `delayDays` i przesuwa kolejne kroki.

## Co panel pokazuje userowi

- dzien od startu
- aktywny krok
- nastepny krok
- powod opoznienia
- wymagane testy teraz
- akcje na dzis
- checklista krokow z checkboxami

## Znane legacy constraints i fallbacki

1. `existing_running`:
   - moze wystepowac w starszych dokumentach
   - mapowany do aktualnego trybu
2. onboarding toggle:
   - `onboardingEnabled=false` jest traktowane jako finalne wylaczenie panelu dla zbiornika
3. rules/model:
   - onboarding fields (`onboardingMode`, `onboardingEnabled`, `onboardingStartAt`, `onboardingTaskChecks`) musza byc zgodne z `firestore.rules`

## Checklist: co zrobic po zmianie logiki onboardingu

1. Zmien logike w `tasksService.js`.
2. Zaktualizuj `onboardingAdapter.ts`, jesli zmienil sie shape planu.
3. Zweryfikuj `OnboardingPanel.tsx` (czy wszystkie nowe pola sa renderowane).
4. Zaktualizuj test:
   - `tests/onboardingPlan.test.cjs`
5. Uruchom:
   - `npm run lint`
   - `node --test tests/onboardingPlan.test.cjs`
   - (opcjonalnie) `npm run test:firestore`

## Checklist: co testowac recznie

1. `fresh_start`:
   - brak swiezego NO2 -> `waiting_for_parameters`
   - NO2 > 0 -> blokada kroku obsady
2. `restart` i `mature_media_start`:
   - poprawne wymagania swiezosci NO2
3. Temperatura poza zakresem:
   - krok ma ostrzezenie/opoznienie
4. Wylaczenie onboardingu:
   - potwierdzenie i ukrycie sekcji
5. Checkboxy krokow:
   - zapis/odczyt po odswiezeniu
