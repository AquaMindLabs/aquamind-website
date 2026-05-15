# Analiza gotowosci aplikacji + prompty do poprawek

Data analizy: 2026-05-15  
Repo: `aquarium-mobile`

## 1) Szybki wynik gotowosci

- Gotowosc funkcjonalna (MVP+): **wysoka**
- Gotowosc techniczna do szerszej publikacji: **srednio-wysoka**
- Ocena laczna: **7.8/10**

## 2) Co sprawdzone teraz

### Quality checks

- `npm run lint -- --quiet` -> **PASS**
- `node --test tests/onboardingPlan.test.cjs` -> **PASS (5/5)**
- `node --test tests/adaptiveTaskSchedule.test.cjs` -> **PASS (3/3)**
- `node --test tests/emergencyState.test.cjs` -> **PASS (5/5)**
- `node --test tests/todayActionPlan.test.cjs` -> **PASS (5/5)**

### Ograniczenie srodowiska

- `npm run test:firestore` -> **FAIL w tym srodowisku** (`EPERM` na `C:\Users\mikee\.config\configstore\firebase-tools.json`)
- To jest blocker lokalny/srodowiskowy, niekoniecznie blad logiki aplikacji.

## 3) Najwazniejsze plusy

1. Dynamiczny onboarding dziala i jest testowany.
2. Kalendarz akcji jest wydzielony i ma logike `done/skip/postpone`.
3. Sa runtime kontrakty modelu `tank` i `measurement`.
4. Lint jest zielony po ostatnim refaktorze.
5. `app/index.js` zmniejszony o ok. **1088 linii** vs HEAD.

## 4) Najwieksze ryzyka przed szeroka publikacja

### P0 (krytyczne)

1. **Brak stabilnego uruchamiania testow Firestore rules w pipeline lokalnym**
   - bez regularnego odpalania rules-testow latwo o regresje `permission-denied`.

### P1 (wysokie)

2. **Monolit `app/index.js` nadal bardzo duzy (ok. 32.9k linii, `useState=122`)**
   - wysokie ryzyko regresji i wolniejszych zmian.
3. **Nieskonczona unifikacja write paths**
   - dla `tanks` jest wspolny builder payloadu, ale dla innych kolekcji nadal sa rozproszone zapisy.
4. **Duza liczba fallbackow legacy**
   - potrzebne, ale trudniejsze utrzymanie i trudniejsza diagnostyka edge-case'ow.

### P2 (srednie)

5. **Brak twardego smoke-testu e2e po krytycznych flow**
   - onboarding, kalendarz, obsada, zmiana sprzetu, edycja pomiaru.

## 5) Rekomendowany plan (kolejnosc)

1. Ustabilizowac i wymusic testy Firestore rules.
2. Dalsza dekompozycja `app/index.js` (sekcje -> helpery -> hooks).
3. Ujednolicic write paths i obudowac telemetry dla permission errors.
4. Dodac checklisty release smoke-test + regresja manualna.

## 6) Gotowe prompty do poprawek

### Prompt A - Firestore tests i permission hardening (P0)

```text
Ustabilizuj testy Firestore rules i hardening zapisu danych.

Kontekst:
- Repo: aquarium-mobile
- test: npm run test:firestore
- problem lokalny: EPERM/configstore potrafi blokowac uruchomienie emulatora

Cel:
1) Dodaj bezpieczny runner testow Firestore, ktory pozwala ustawic lokalny katalog configu (fallback env) i nie korzysta z niedostepnej sciezki user profile.
2) Upewnij sie, ze tests/firestore.rules.test.cjs uruchamia sie deterministycznie w CI i lokalnie.
3) Dodaj dokumentacje uruchamiania rules-testow (Windows/macOS).
4) Dodaj 2-3 przypadki regresyjne:
   - onboardingEnabled/onboardingMode update tank
   - maintenanceActionState update tank
   - measurement create/update z rozszerzonymi parametrami

Kryteria:
- npm run test:firestore przechodzi
- brak zmian biznesowych UI
- README/docs zaktualizowane o troubleshooting
```

### Prompt B - Dekompozycja monolitu index (P1)

```text
Kontynuuj etapowy refaktor app/index.js bez zmiany UX.

Cel:
1) Wydziel helpery per-sekcja do features/aquarium/sections/*Helpers.ts
2) Przenies czesc useMemo/useEffect zwiazanych z:
   - Review
   - Fish/Plants
   - History
   do dedykowanych hookow.
3) Zostaw w app/index.js glownie orchestration, routing lokalny i wiring callbackow.

Kryteria:
- lint przechodzi
- brak regresji UX
- app/index.js istotnie maleje (kolejne 700+ linii)
```

### Prompt C - Unifikacja write paths (P1)

```text
Ujednolic zapisy Firestore przez warstwe payload builderow.

Zakres:
1) Dla stockItems i tankDiseaseCases dodaj runtime normalizacje/walidacje podobna do tank/measurement.
2) Utworz wspolne funkcje buildStockItemPayload i buildTankDiseaseCasePayload.
3) Podmien bezposrednie updateDoc/addDoc w app/index.js na buildery.
4) Zachowaj kompatybilnosc legacy i obecny model Firestore.

Kryteria:
- mniej duplikacji w write path
- brak regresji zapisu
- lint + testy domenowe przechodza
```

### Prompt D - Release smoke pack (P2)

```text
Przygotuj i wdroz release smoke-test pack dla kluczowych flow.

Zakres:
1) Dodaj docs/release-smoke-checklist.md:
   - onboarding (3 start types)
   - kalendarz akcji (done/skip/postpone)
   - dodanie/edycja pomiaru
   - obsada i zgodnosc
   - sprzet (katalog/custom)
2) Dodaj prosty skrypt/checklist gate do CI (manual approval step + artefakt wynikow).
3) Dodaj sekcje "Known failure signatures" (np. missing or insufficient permissions).

Kryteria:
- checklista gotowa i praktyczna
- da sie wykonac end-to-end przez QA/PM bez znajomosci kodu
```

### Prompt E - Observability pod permission errors (P2)

```text
Wzmocnij obserwowalnosc bledow zapisu bez zmiany UX.

Cel:
1) Dodaj standaryzowane logowanie kontekstu przy catch dla updateDoc/addDoc:
   - collection
   - operation
   - payload keys
   - userId/tankId
2) Rozroznij bledy permission-denied od pozostalych i mapuj na stale kody diagnostyczne.
3) Dodaj dokument z tabela kodow diagnostycznych i zalecanymi krokami.

Kryteria:
- latwiejsza diagnoza per-user
- brak wycieku danych wrazliwych w logach
```

## 7) Decyzja publikacyjna

Na teraz:

- **mozna publikowac ograniczenie (soft launch / staged rollout)**  
- **nie rekomenduje pelnego szerokiego rolloutu** dopoki nie bedzie domkniete P0 (stabilne rules-tests) i przynajmniej czesc P1 (dalsza dekompozycja + unifikacja write path).
