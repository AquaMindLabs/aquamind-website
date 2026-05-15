# Aquarium Mobile

Mobilna aplikacja do prowadzenia akwarium: parametry wody, obsada, sprzet, onboarding startu, kalendarz akcji i analiza ryzyka.

## Aktualny zakres funkcji

- logowanie/rejestracja (Firebase Auth)
- multi-tank:
  - kreator dodawania akwarium (wizard krokowy)
  - profile akwarium, onboarding mode, temperatury, podloze, parametry docelowe
  - aktywne akwarium per user
- pomiary i historia:
  - pomiary podstawowe i rozszerzone (`pH`, `GH`, `KH`, `NO2`, `NO3`, `NH3/NH4`, `PO4`, `Fe`, `Ca`, `Mg`, `K`, `TDS`, `CO2`, temperatura)
  - automatyczne wyliczenie `CO2` z `KH + pH` (gdy mozliwe)
  - analiza parametrow i trendy
- obsada:
  - katalog ryb i roslin
  - dodawanie do akwarium
  - ocena zgodnosci obsady (bioload/przestrzen/zachowanie + szczegoly)
- sprzet:
  - lampy, filtry, grzalki (katalog + custom)
  - ocena grzalki i filtracji
  - wsparcie legacy dla pojedynczego i listowego modelu sprzetu
- onboarding startu:
  - tryby: `fresh_start`, `restart`, `mature_media_start`
  - dynamiczne opoznianie krokow wg parametrow (priorytet NO2)
  - blokada krokow zwiazanych z obsada przy wykrywalnym NO2 lub braku swiezego NO2
- kalendarz akcji:
  - podmiana/testy/odmulanie/filtr
  - akcje `done` / `skip` / `postpone`
  - brak duplikatow tej samej akcji (pokazywana najblizsza)
- sekcje Review/History/Health/Issues z workflow chorob i glonow
- telemetry (`telemetryEvents`, `telemetryErrors`) + globalny error boundary

## Kluczowe moduly

- `app/index.js` - glowna orkiestracja ekranu
- `features/aquarium/components/OnboardingPanel.tsx`
- `features/aquarium/components/ActionCalendarPanel.tsx`
- `features/aquarium/services/tasksService.js`
- `features/aquarium/services/onboardingAdapter.ts`
- `features/aquarium/services/actionCalendarService.ts`
- `features/aquarium/services/actionStateService.ts`
- `features/aquarium/model/tankModel.ts`
- `features/aquarium/model/measurementModel.ts`

Szczegoly:
- [architecture-overview.md](/C:/Users/mikee/aquarium-mobile/docs/architecture-overview.md)
- [data-model-tanks-measurements.md](/C:/Users/mikee/aquarium-mobile/docs/data-model-tanks-measurements.md)
- [onboarding-engine.md](/C:/Users/mikee/aquarium-mobile/docs/onboarding-engine.md)

## Uruchomienie

```bash
npm install
npm start
```

## Przydatne komendy

```bash
npm run lint
node --test tests/onboardingPlan.test.cjs
npm run test:firestore
npm run firestore:deploy:rules
npm run sanitize:legacy:dry-run
npm run sanitize:legacy
```

## Troubleshooting: Firestore Rules Tests

Jesli lokalnie test `npm run test:firestore` wywala blad typu `EPERM` / `configstore`:

1. uruchamiaj test tylko przez `npm run test:firestore` (korzysta z bezpiecznego runnera),
2. opcjonalnie ustaw lokalny katalog roboczy:
   - Windows PowerShell:
     - `$env:FIREBASE_TEST_CONFIG_DIR=".tmp/firebase-tests"; npm run test:firestore`
   - macOS/Linux:
     - `FIREBASE_TEST_CONFIG_DIR=.tmp/firebase-tests npm run test:firestore`

Szczegoly:
- [firestore-rules-tests.md](/C:/Users/mikee/aquarium-mobile/docs/firestore-rules-tests.md)

## Znane legacy constraints i fallbacki

- `onboardingMode`:
  - legacy: `existing_running`
  - runtime normalizacja: `existing_running -> mature_media_start`
- zapis tanka:
  - najpierw pelny payload
  - przy `permission-denied` fallback do payloadu kompatybilnosci
- sprzet:
  - nowy model listowy (`heaterEquipments`, `filterEquipments`)
  - legacy model pojedynczy (`heaterEquipment`, `filterEquipment`) nadal utrzymywany
- podloze:
  - nowy model listy (`substrateTypes`)
  - legacy pole (`substrateType`) nadal utrzymywane
- reguly Firestore sa restrykcyjne (allowed keys, zakresy, typy), wiec przy zmianach modelu trzeba robic deploy rules i migracje starych dokumentow

## Checklist: po zmianie modelu danych

1. Zaktualizuj runtime contracty:
   - `features/aquarium/model/tankModel.ts`
   - `features/aquarium/model/measurementModel.ts`
2. Zaktualizuj `firestore.rules` (keys + zakresy + walidacje).
3. Upewnij sie, ze update path dla `tanks` idzie przez `buildTankUpdatePayload`.
4. Sprawdz fallbacki legacy (czy nadal sa potrzebne i dzialaja).
5. Uruchom:
   - `npm run lint`
   - `node --test tests/onboardingPlan.test.cjs`
   - `npm run test:firestore`
6. Wykonaj `npm run firestore:deploy:rules`.
7. W razie zmian niekompatybilnych uruchom `sanitize:legacy` (najpierw dry-run).

## Checklist: co testowac recznie

1. Dodanie nowego akwarium (wizard), kazdy typ startu.
2. Wylaczenie onboardingu i zapis checkboxow krokow.
3. Dodanie pomiaru i edycja pomiaru.
4. Kalendarz akcji: done/skip/postpone + ponowne przeliczenie terminow.
5. Zmiana sprzetu (katalog/custom) i odczyt po reloadzie.
6. Dodanie ryby/rosliny i ocena zgodnosci obsady.
7. Konto z legacy danymi: brak `permission-denied` przy update.

## Panel admina

Panel web jest w `admin/` (szczegoly: `admin/README.md`).
