# Project Release Master Action Plan

Data: 2026-05-16  
Cel: domkniecie calego projektu i przygotowanie do publikacji (Android + iOS) bez dodawania nowych funkcji.

## 1) Status i gotowosc na teraz

- Gotowosc globalna projektu: **~78%**
- Gotowosc techniczna (kod + testy automatyczne): **~88%**
- Gotowosc publikacyjna (manual QA + gate + sklepy): **~62%**
- Gotowosc subskrypcji:
  - techniczna: **~90%**
  - publikacyjna (sandbox E2E): **~70-75%**
- Gotowosc AI:
  - techniczna: **~85-90%**
  - publikacyjna (finalny retest z aktywnym billingiem API): **~60-65%**

## 2) Zasady realizacji (scope lock)

1. Nie dodajemy nowych feature'ow.
2. Robimy tylko:
   - stabilnosc,
   - UX polish istniejacych flow,
   - release readiness,
   - testy i dowody GO/NO-GO.
3. Kazda zmiana musi przejsc lint + testy.
4. Decyzja GO tylko po kompletnym PASS core + AI + billing E2E.
5. Ten plik jest single source of truth:
   - po zamknieciu zadania usuwamy je z listy otwartych akcji,
   - status gotowosci aktualizujemy po kazdym etapie.

## 2.1) Wplyw znalezisk UX na gotowosc (regula decyzyjna)

- P0 UX (flow zablokowany, crash, brak mozliwosci wykonania kluczowej akcji): **blokuje publikacje**.
- P1 UX (wysokie ryzyko blednej akcji usera, bardzo mylace komunikaty, brak mozliwosci dokonczenia waznego flow dla czesci userow): **blokuje publikacje**.
- P2 UX (niedogodnosc, ale flow da sie poprawnie wykonac): **nie blokuje publikacji**, idzie do post-release backlog.
- P3 UX (kosmetyka): **nie blokuje publikacji**.

Warunek praktyczny:
- Jesli znajdziesz UX issue, klasyfikujemy go od razu jako P0/P1/P2/P3 i dopisujemy decyzje GO/NO-GO w tym samym dniu.

## 3) Workstreamy i akcje do domkniecia

## WS-A: Stabilizacja core i UX (bez nowych funkcji)

- [ ] A1. Zamknac wszystkie znane P0/P1, w tym retest auth post-login na buildzie release.
- [ ] A2. Domknac UX AI panelu:
  - szybkie akcje tylko wypelniaja formularz,
  - wysylka tylko po recznym kliknieciu,
  - blok dodawania zdjecia nad polem pytania.
- [ ] A3. Sprawdzic fallbacki i komunikaty dla flow:
  - onboarding,
  - kalendarz,
  - pomiary,
  - obsada,
  - sprzet,
  - AI chat/vision.
- [ ] A4. Potwierdzic brak regresji zapisu danych po odswiezeniu/reopen.

Exit criteria WS-A:
- brak crashy na krytycznych flow,
- brak blockerow UX uniemozliwiajacych wykonanie podstawowych akcji.

## WS-B: Jakosc techniczna i zabezpieczenia runtime

- [ ] B1. `npm run lint` -> PASS.
- [ ] B2. `npm run test:firestore` -> PASS.
- [ ] B3. `npm run test:subscription:webhook` -> PASS.
- [ ] B4. `npm run test:subscription:gating` -> PASS.
- [ ] B5. `npm run test:ai:backend` -> PASS.
- [ ] B6. `node --test tests/runtimeDefensiveAudit.test.cjs tests/alertPrioritization.test.cjs` -> PASS.

Exit criteria WS-B:
- komplet testow green,
- zero bledow krytycznych w logach testow.

## WS-C: Subskrypcje (billing) - release E2E readiness

- [ ] C0. Domknac RevenueCat Google Play credentials (obecnie blocker konfiguracji):
  - status teraz: `Credentials need attention` (subscriptions API / inappproducts API / monetization API),
  - potwierdzic uprawnienia konta uslugi `revenuecat-play@my-aquarium-assistant.iam.gserviceaccount.com` w Play Console,
  - wykonac `Recheck credentials` po propagacji uprawnien.
- [ ] C1. Potwierdzic konfiguracje RevenueCat:
  - produkt iOS/Android,
  - offering,
  - entitlement (jeden canonical key).
- [ ] C2. Potwierdzic zgodnosc `productId -> tier` z env i konfiguracja sklepow.
- [ ] C3. Zweryfikowac webhook sync do `userSubscriptions/{uid}`:
  - odnowienia,
  - cancel,
  - grace period,
  - expired,
  - paused,
  - stale event ignored.
- [ ] C4. Manual E2E sandbox:
  - Free -> Premium,
  - Premium -> Pro,
  - restore na tym samym urzadzeniu,
  - restore na drugim urzadzeniu,
  - status refresh bez restartu app.
- [ ] C5. Potwierdzic gate feature'ow z jednego source-of-truth (`userSubscriptions`).

Exit criteria WS-C:
- subskrypcje i restore dzialaja end-to-end,
- status planu i uprawnienia odswiezaja sie automatycznie.

## WS-D: AI readiness (aktywnie, bez wylaczania)

- [ ] D1. Potwierdzic backend start z `provider=openai`.
- [ ] D2. Tuż przed publikacja doladowac min. 5 USD (prepaid API).
- [ ] D3. Potwierdzic `.env`:
  - `AI_PROVIDER_NAME=openai`
  - `OPENAI_MODEL=gpt-5-mini` (fallback: `gpt-4.1-mini`)
  - `EXPO_PUBLIC_AI_BACKEND_URL=https://<PUBLIC_AI_BACKEND_URL>`
- [ ] D4. Przejsc retest AI:
  - chat na danych usera,
  - fallback przy brakach danych,
  - vision happy path,
  - vision low-confidence fallback,
  - gating Free vs Pro.
- [ ] D5. Potwierdzic brak krytycznych `AIW_PROVIDER_ERROR` po doladowaniu.

Exit criteria WS-D:
- AI chat/vision dzialaja w realnym flow release,
- user dostaje czytelny fallback bez wycieku technicznych szczegolow.

## WS-E: Release smoke, artefakty i gate

- [ ] E1. Wypelnic `docs/release-smoke-result.md` dla wszystkich:
  - `SMK-ONB-*`
  - `SMK-CAL-*`
  - `SMK-MEA-*`
  - `SMK-STK-*`
  - `SMK-EQP-*`
  - `SMK-AI-*`
  - `SMK-AI-RLS-*`
- [ ] E2. Dla faili dopisac:
  - sygnature,
  - ownera,
  - target date fixa.
- [ ] E3. Odpalic gate:
  - `npm run release:smoke:gate -- --manualApproval yes --release <release-id> --owner QA-PM`
- [ ] E4. Wygenerowac i zachowac artefakty decyzji GO/NO-GO.

Exit criteria WS-E:
- gate = PASS,
- QA/PM moze podjac decyzje bez znajomosci kodu.

## WS-F: Store readiness (Android + iOS)

- [ ] F1. Android:
  - finalny AAB,
  - track internal/production wg planu,
  - data safety + listing kompletne.
- [ ] F2. iOS:
  - build + submit do TestFlight/App Store Connect,
  - metadane i wymagane formularze kompletne.
- [ ] F3. Potwierdzic klucze/OAuth/credentials dla release.

Exit criteria WS-F:
- oba buildy gotowe do wysylki,
- brak blockerow formalnych w konsolach sklepow.

## WS-G: Cutover i rollout

- [ ] G1. Ostateczny clean release commit (bez noisy/generated smieci).
- [ ] G2. Tag/oznaczenie release candidate.
- [ ] G3. Publikacja wg strategii rollout.
- [ ] G4. Monitoring 24-48h:
  - auth/sign-in errors,
  - write failures (`permission-denied`),
  - billing events,
  - AIW_*.

Exit criteria WS-G:
- brak nowych P0/P1 po rollout,
- stabilny telemetry trend.

## 4) Kolejnosc wykonania (strict order)

1. WS-A (stabilizacja + UX)  
2. WS-B (jakosc techniczna)  
3. WS-C (subskrypcje E2E)  
4. WS-E (smoke + gate core)  
5. WS-D (AI final check T-30)  
6. WS-E (finalny gate z AI)  
7. WS-F (store readiness i build/submit)  
8. WS-G (rollout + monitoring)

## 5) Gotowosc po etapach

- Po WS-A + WS-B: **~85%**
- Po WS-C: **~91-93%**
- Po pierwszym WS-E (core): **~94%**
- Po WS-D + finalnym WS-E (core+AI): **~97%**
- Po WS-F: **~99%**
- Po WS-G i stabilnym monitoringu: **100% operacyjnie domkniete**

## 6) Definition of Done (projekt domkniety)

Projekt uznajemy za domkniety do publikacji, gdy:

1. Wszystkie testy automatyczne sa zielone.
2. Wszystkie pozycje `SMK-*` maja status i gate = PASS.
3. Subskrypcje dzialaja E2E (purchase/restore/status transitions).
4. AI dziala E2E po finalnym doladowaniu API i nie generuje krytycznych bledow.
5. Buildy Android/iOS sa gotowe i przechodza submit.
6. Po rollout brak nowych P0/P1 w pierwszych 24-48h.

## 7) Dokumenty wykonawcze (single source pack)

- `docs/release-smoke-checklist.md`
- `docs/release-smoke-result.md`
- `docs/subscription-billing-sandbox.md`
- `docs/subscription-webhook-sync.md`
- `docs/ai-backend-api.md`
- `docs/ai-diagnostics-and-safety-runbook.md`
- `docs/release-candidate-cutover.md`
- `docs/android-release-master-checklist.md`
- `docs/android-publish-step-by-step.md`
