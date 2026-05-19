# Release Candidate Cutover

Data: 2026-05-15

## Cel
Przygotowac czysty release candidate mimo duzej liczby rownoleglych zmian.

## Szybka procedura
1. Uruchom preflight:
   - `npm run release:preflight`
2. Potwierdz quality gate:
   - `npm run lint`
   - `npm run test:ai:backend`
   - `npm run test:subscription:webhook`
   - `npm run test:subscription:gating`
   - `npm run test:firestore`
3. Potwierdz release smoke gate:
   - `npm run release:smoke:gate -- --manualApproval yes --release <release-tag> --owner <qa-owner>`
4. Przygotuj commit release tylko z runtime-impact paths (bez logow i tymczasowych artefaktow).

## Interpretacja preflight
- `runtime-impact paths`: zmiany w aplikacji, backend scripts, configach runtime.
- `docs-only paths`: dokumentacja, checklisty, runbooki.
- `noisy/generated paths`: artefakty i logi, ktore nie powinny blokowac ci niepotrzebnie kandydata.

## Minimalny warunek GO
- Brak P0 blockerow auth.
- Core smoke PASS.
- AI smoke PASS (jesli AI jest w scope wydania).
- Manual approval QA/PM ustawione na `yes`.
