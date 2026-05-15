# Pre-Publish Completeness + AI Action Plan

Data: 2026-05-15  
Zakres: gotowosc produktu do publikacji + plan wdrozenia AI (tekst + analiza zdjec)

## 1) Szybka ocena kompletnosci

## Status techniczny (repo)

- Lint: PASS
- Testy domenowe: PASS (`onboarding`, `todayActionPlan`, `adaptiveTaskSchedule`, `emergencyState`)
- Firestore rules tests: PASS
- Billing webhook + idempotencja: PASS (`tests/subscriptionWebhookSync.test.cjs`)
- Struktura: stabilna, ale `app/index.js` nadal duzy (~30k linii)

## Status funkcjonalny (release)

- Ostatni smoke gate: FAIL (wszystkie `SMK-*` zablokowane przez auth blocker)
- Decyzja release (na dzis): NO-GO do szerokiej publikacji, dopoki nie bedzie potwierdzone naprawione logowanie Google na buildzie release i ponowny smoke PASS

## Co jest "done" przed AI

- Kontrakty runtime i walidacje write path dla kluczowych kolekcji
- Diagnostyka bledow zapisu (`FSW_*`)
- Subskrypcje: model + billing mobile + backendowy sync do `userSubscriptions/{uid}`

## Co brakuje przed AI

- Potwierdzenie release smoke po auth fixie (obecnie blocker funkcjonalny)
- Docelowy backend AI (endpointy, autoryzacja, limity, observability)
- Polityka prywatnosci i zgody usera dla analizy danych i zdjec

## 2) Docelowy zakres AI przed publikacja

1. Odpowiedzi AI na bazie:
   - danych usera (tank, pomiary, obsada, sprzet, onboardingi, active issues),
   - pytania usera,
   - dodatkowego kontekstu wpisanego przez usera.
2. Analiza zdjec (np. ryba/roslina/glony, stan akwarium) z kontekstem danych.
3. Gating funkcji AI po subskrypcji (`ai_assistant` w planie Pro).
4. Bezpieczne logowanie i limity kosztowe (token budget + throttling + retry policy).

## 3) Etapowy plan wdrozenia AI

## Etap A: Architecture & contracts

- Dodaj backend AI jako warstwe serwerowa (nie z klienta) z endpointami:
  - `POST /ai/chat`
  - `POST /ai/vision/analyze`
- Zdefiniuj kontrakty request/response i kody bledow diagnostycznych (`AIW_*`).
- Zbuduj `context builder`, ktory pobiera tylko minimalny potrzebny zakres danych usera.

## Etap B: AI text assistant

- W app dodaj ekran/panel AI (bez zmiany obecnych flow sekcji).
- Backend buduje odpowiedz z:
  - podsumowania danych usera,
  - ograniczen (braki danych, ryzyka),
  - konkretnej rekomendacji krok-po-kroku.
- Dodaj fallback, gdy brak danych lub timeout modelu.

## Etap C: AI vision

- Dodaj upload zdjecia (camera/gallery) + bezpieczna sciezka storage per user.
- Backend analizuje obraz + dane tanku i zwraca:
  - hipotezy (z poziomem pewnosci),
  - rzeczy do sprawdzenia pomiarami,
  - plan dzialania i ostrzezenia.
- Dodaj komunikat "to nie diagnoza weterynaryjna" i heurystyke ostroznosci.

## Etap D: Safety, privacy, telemetry, cost

- PII minimization: do modelu tylko niezbedne dane.
- Zgoda usera na analize danych/zdjec + mozliwosc wycofania.
- Telemetria:
  - `ai_request_started/success/failure`
  - `ai_vision_started/success/failure`
  - `token_estimate`, `latency_ms`, `diagnosticCode`.
- Limity:
  - dzienny limit zapytan/user,
  - rate limit,
  - timeout + retry z backoff.

## Etap E: QA + release gate update

- Dodaj smoke cases AI do checklisty release:
  - chat na danych usera,
  - pytanie bez danych (fallback),
  - analiza zdjecia z poprawnym komunikatem,
  - gating po planie Free/Pro.
- GO tylko gdy:
  - auth fixed,
  - core smoke PASS,
  - AI smoke PASS.

## 4) Gotowe prompty wdrozeniowe

## Prompt 1: Backend AI skeleton

```text
Zaimplementuj backend AI dla aquarium-mobile.

Cel:
1) Dodaj serwerowe endpointy:
   - POST /ai/chat
   - POST /ai/vision/analyze
2) Endpointy musza wymagac zalogowanego usera i czytac tylko dane tego usera.
3) Dodaj kontrakty request/response + walidacje runtime.
4) Dodaj stale kody diagnostyczne AIW_* i standaryzowane logowanie kontekstu.

Kryteria:
- brak wycieku danych wrazliwych do logow
- deterministyczne bledy (AIW_UNAUTHORIZED, AIW_TIMEOUT, AIW_PROVIDER_ERROR, AIW_VALIDATION)
- testy endpointow przechodza
```

## Prompt 2: Context builder (dane usera -> kontekst AI)

```text
Dodaj warstwe context builder dla AI odpowiedzi.

Zakres:
1) Zbuduj funkcje buildUserAquariumContext(uid, optionalTankId), ktora zwraca:
   - tank summary
   - latest measurements + trendy
   - stock/equipment summary
   - active issues + onboarding/action calendar highlights
2) Dodaj limit rozmiaru kontekstu i fallback przy brakach danych.
3) Dodaj testy mapowania danych Firestore -> context DTO.

Kryteria:
- kontekst jest stabilny i przewidywalny
- brak niepotrzebnych pol w payloadzie do modelu
- testy przechodza
```

## Prompt 3: AI chat (app + backend integration)

```text
Wdroż AI chat oparty o dane usera bez zmiany obecnych flow aplikacji.

Zakres:
1) Dodaj UI panel "Asystent AI" (sekcja settings/home) z historią pytan i odpowiedzi.
2) Podłącz POST /ai/chat i wysylaj:
   - user question
   - optional tankId
   - extra context from user form
3) Dodaj stany UX: loading, retry, timeout, empty-data fallback.
4) Dodaj telemetry: ai_request_started/success/failure.

Kryteria:
- brak regresji istniejących ekranow
- odpowiedzi sa osadzone w realnych danych usera
- bledy maja czytelne komunikaty bez wycieku szczegolow technicznych
```

## Prompt 4: AI vision (zdjecia)

```text
Dodaj AI analize zdjec dla aquarium-mobile.

Zakres:
1) Dodaj wybór zdjecia (camera/gallery) i upload do storage per-user.
2) Dodaj endpoint POST /ai/vision/analyze, ktory:
   - bierze obraz + context builder output
   - zwraca hipotezy, poziom pewnosci, kroki weryfikacyjne pomiarami, plan dzialania.
3) Dodaj UX z podgladem:
   - wynik analizy
   - ostrzezenie "to nie porada weterynaryjna"
4) Dodaj telemetry i retry policy.

Kryteria:
- analiza dziala end-to-end na sandbox/dev
- brak publicznego dostepu do cudzych zdjec
- jasny fallback gdy obraz nieczytelny
```

## Prompt 5: Subskrypcja i gating AI

```text
Podlacz gating AI do modelu subskrypcji.

Zakres:
1) Uzyj hasSubscriptionFeature('ai_assistant') do blokady/odblokowania AI.
2) Dla Free pokaz "upgrade prompt", dla Pro pelny dostep.
3) Po zmianie planu odswiez uprawnienia AI bez restartu app.
4) Dodaj testy jednostkowe logiki gatingu.

Kryteria:
- brak regresji obecnych gate'ow
- gating AI jest spojny z userSubscriptions source-of-truth
```

## Prompt 6: Safety + privacy + observability

```text
Wzmocnij safety i prywatnosc dla AI.

Zakres:
1) Dodaj consent checkbox/ustawienie dla AI data processing i image analysis.
2) Dodaj redakcje danych przed wyslaniem do modelu (min payload).
3) Dodaj logi diagnostyczne AIW_* bez tresci PII i bez pelnych payloadow.
4) Dodaj dokument "AI diagnostics and safety runbook".

Kryteria:
- brak wycieku danych wrazliwych
- czytelny proces triage incydentow AI
- zgodnosc UX z obecna nawigacja i stylem app
```

## Prompt 7: QA pack i release gate AI

```text
Rozszerz release smoke o AI i zaktualizuj gate.

Zakres:
1) Dodaj SMK-AI-* do checklisty:
   - chat na danych usera
   - fallback przy braku danych
   - analiza zdjecia (happy path + low confidence)
   - gating Free vs Pro
2) Rozszerz artefakt gate o sekcje AI PASS/FAIL.
3) Dodaj known failure signatures dla AI (timeout/provider/rate-limit).

Kryteria:
- QA/PM podejmuje decyzje GO/NO-GO bez znajomosci kodu
- gate PASS tylko przy kompletnym PASS core+AI
```

## 5) Definicja "AI-ready do publikacji"

Warunki minimalne:

1. Auth blocker usuniety i potwierdzony na release buildzie.
2. Core smoke PASS (`SMK-*`).
3. AI smoke PASS (`SMK-AI-*`).
4. Telemetria AI i runbook diagnostyczny gotowe.
5. Limity kosztowe i retry ustawione.
6. Gating subskrypcji AI zweryfikowany E2E.

