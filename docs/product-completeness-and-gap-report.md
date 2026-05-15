# Product Completeness And Gap Report (Aquarium Mobile)

Data: 2026-05-15
Owner dokumentu: Product/Tech snapshot

## 1) Executive Summary

To jest pelny obraz stanu aplikacji na dzis:

- Fundament produktu (tanki, pomiary, obsada, sprzet, onboarding, kalendarz) jest zaimplementowany.
- Warstwy subskrypcji i AI sa zaimplementowane technicznie (mobile + backend + testy), ale ich pelny scenariusz release nie jest jeszcze potwierdzony end-to-end na aktualnym buildzie.
- Aktualna decyzja release: **NO-GO** (blokuje P0 w logowaniu Google na buildzie release candidate).

Ocena robocza:
- Gotowosc techniczna: wysoka (lint i testy automatyczne przechodza).
- Gotowosc publikacyjna: niska do sredniej (blokada funkcjonalna post-login).

## 2) Co aplikacja juz potrafi (zakres funkcjonalny)

## A. Konto i sesja
- Email/password login i rejestracja (Firebase Auth).
- Google Sign-In (zaimplementowane, ale obecnie zgloszony blocker na czesci urzadzen/release flow).
- Wylogowanie i podstawowa obsluga sesji usera.

Status: **czesciowo gotowe** (P0 blocker na scenariuszu Google Sign-In).

## B. Multi-tank i profil akwarium
- Dodawanie akwarium wizardem krokowym.
- Obsluga wielu akwariow per user.
- Parametry profilu zbiornika (typ startu, temperatury, podloze, zakresy docelowe).
- Persist i odtwarzanie wybranego aktywnego zbiornika.

Status: **gotowe funkcjonalnie**, wymaga ponownej walidacji smoke na release buildzie.

## C. Pomiary i historia
- Dodawanie, edycja i usuwanie pomiarow.
- Parametry podstawowe i rozszerzone (m.in. pH, GH, KH, NO2, NO3, NH3/NH4, PO4, Fe, Ca, Mg, K, TDS, CO2, temperatura).
- Obliczanie CO2 (tam gdzie mozliwe) i analizy/trendy.
- Runtime walidacje i normalizacja payloadow.

Status: **gotowe funkcjonalnie i modelowo**, wymaga potwierdzenia smoke po odblokowaniu logowania.

## D. Obsada i zgodnosc
- Katalog ryb i roslin.
- Dodawanie do obsady, zmiana ilosci, edycja.
- Ocena zgodnosci (bioload/przestrzen/zachowanie) i ostrzezenia.
- Runtime normalizacja zapisu `stockItems`.

Status: **gotowe**, do potwierdzenia E2E na buildzie release.

## E. Sprzet (katalog + custom)
- Dodawanie z katalogu i wpisow custom.
- Obsluga grzalek/filtrow/swiatla.
- Analiza/rekomendacje zwiazane ze sprzetem.
- Kompatybilnosc legacy modelu i nowego modelu listowego.

Status: **gotowe**, do potwierdzenia smoke.

## F. Onboarding startu
- Tryby: `fresh_start`, `restart`, `mature_media_start`.
- Dynamiczne opoznianie krokow wg parametrow (w tym NO2).
- Checklisty i prowadzenie usera przez start zbiornika.

Status: **gotowe**, do potwierdzenia smoke.

## G. Kalendarz akcji
- Planowanie i prezentacja akcji.
- Obsluga `done`, `skip`, `postpone`.
- Persist stanu i ponowne przeliczenia.

Status: **gotowe**, do potwierdzenia smoke.

## H. Subskrypcje i billing
- Model subskrypcji w appce (tier/status/feature gates/limity).
- Integracja mobile billing (Google Play + App Store przez RevenueCat SDK).
- Restore i mapowanie productId -> tier.
- Backend webhook sync do `userSubscriptions/{uid}` z idempotencja i ochrona przed duplikatami/starymi eventami.
- Obsloga statusow: `active`, `grace_period`, `cancelled`, `expired`, `paused`.

Status: **technicznie zaimplementowane**, **brak finalnego potwierdzenia release E2E**.

## I. AI Assistant (chat + vision)
- UI panel "Asystent AI" z historia interakcji.
- Endpointy backend:
  - `POST /ai/chat`
  - `POST /ai/vision/analyze`
- Context builder danych usera (tank summary, latest measurements + trendy, stock/equipment summary, active issues, onboarding/action highlights).
- AI gating po subskrypcji (`ai_assistant`).
- Upload obrazu per user do storage + brak publicznego dostepu do cudzych plikow.
- Consent controls (data processing i image analysis).
- Redakcja danych i diagnostyka `AIW_*` bez PII.

Status: **zaimplementowane w kodzie + testy backendowe**, **do domkniecia sandbox/release E2E**.

## J. Observability i diagnostyka
- Telemetry events i telemetry errors.
- Globalny error boundary.
- Standaryzowane logowanie diagnostyczne dla zapisow i AI.
- Kody diagnostyczne (m.in. AIW_* i sygnatury release blockers).

Status: **gotowe**, wymaga dalszego monitoringu po realnym rollout.

## 3) Co jest aktualnie w trakcie / niepotwierdzone

1. Potwierdzenie naprawy P0 Google Sign-In na realnym buildzie release (Android/iOS).
2. Pelny smoke test core + AI po poprawce auth.
3. Potwierdzenie billing purchase/restore end-to-end na kontach sandbox (Play + App Store) na nowym buildzie.
4. Finalne potwierdzenie UX dla AI na danych realnych usera (timeout/retry/fallback).

## 4) Braki do dorobienia przed publikacja

## Krytyczne (must-have)
1. Zamknac P0 auth blocker (`Cannot read property 'some' of undefined` w flow Google Sign-In) i potwierdzic na urzadzeniu.
2. Uzyskac pelny PASS release smoke (core + AI).
3. Potwierdzic billing sandbox E2E:
   - purchase premium/pro,
   - restore,
   - automatyczny refresh uprawnien bez restartu app.

## Wysoki priorytet (should-have)
1. Finalny release candidate clean-up:
   - oddzielic runtime-impact od noisy/generated artefaktow,
   - przygotowac czysty commit release.
2. Potwierdzic konfiguracje store:
   - product IDs,
   - RevenueCat entitlement/offering,
   - test accounts i licencjonowanie.
3. Powtorzyc manualny UX pass dla flow post-login.

## Nizszy priorytet (post-release hardening)
1. Dalsze zmniejszanie `app/index.js` (refactor orchestration i hooki sekcyjne).
2. Rozszerzenie monitoringu produkcyjnego i alertingu pod AI/billing.
3. Dodatkowe testy e2e (automat) dla najwazniejszych flow.

## 5) Stan jakosci i dowody

## Aktualnie przechodzi
- `npm run lint`
- `npm run test:firestore`
- `npm run test:subscription:webhook`
- `npm run test:subscription:gating`
- `npm run test:ai:backend`

## Aktualnie nie przechodzi (gate release)
- Release smoke gate: `FAIL`
- Powod: wszystkie scenariusze sa oznaczone jako `BLOCKED` przez `AUTH-BLK-001`.

## 6) Ryzyka publikacyjne

## P0
- `AUTH-BLK-001`: crash po Google Sign-In blokuje wejscie do flow post-login.

## P1
- Brak finalnego potwierdzenia billing E2E na sandbox po ostatnich zmianach.
- Brak finalnego smoke PASS na aktualnym release buildzie.

## P2
- Duzy zakres rownoleglych zmian podnosi ryzyko regresji przy nieczystym cutover release.

## 7) Decyzja gotowosci na dzis

- Technicznie: **blisko gotowosci** (wiekszosc warstw wdrozona i testowana).
- Produktowo/release: **jeszcze niegotowe do publikacji** do czasu:
  1. potwierdzenia fixu auth,
  2. pelnego PASS smoke core+AI,
  3. potwierdzenia sandbox billing purchase/restore.

Aktualna decyzja: **NO-GO**.

## 8) Minimalny plan domkniecia do GO

1. Build release z najnowszym auth fix.
2. Test Google Sign-In na urzadzeniu (min. 2-3 proby, cold start i warm start).
3. Pelny smoke checklist (SMK-* + SMK-AI-*).
4. Billing sandbox test (purchase + restore + status refresh).
5. Aktualizacja `docs/release-smoke-result.md` i odpalenie gate z `manual_approval=yes`.
6. Jezeli wszystko PASS -> GO do rollout.

## 9) Dokumenty zrodlowe (dla prezentacji i audytu)

- `README.md`
- `docs/release-smoke-checklist.md`
- `docs/release-smoke-result.md`
- `release-smoke-artifacts/smoke-gate-summary.json`
- `docs/subscription-webhook-sync.md`
- `docs/subscription-billing-sandbox.md`
- `docs/ai-backend-api.md`
- `docs/ai-diagnostics-and-safety-runbook.md`
- `docs/release-candidate-cutover.md`
