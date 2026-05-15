# AI Diagnostics And Safety Runbook

## Cel

Ten dokument opisuje:

- jak dziala privacy/safety dla AI,
- jak triage'owac incydenty AI,
- jak interpretowac kody diagnostyczne `AIW_*`.

## Privacy Controls (App)

W panelu **Asystent AI** sa 2 niezalezne zgody:

1. `aiConsentDataProcessing` - zgoda na przetwarzanie danych przez AI.
2. `aiConsentImageAnalysis` - zgoda na analize obrazow.

Bez zgody:

- chat AI jest blokowany (brak requestu do backendu),
- analiza obrazu jest blokowana.

## Minimal Payload I Redaction

Przed wyslaniem requestu do AI:

- wysylamy tylko minimalny zestaw pol (`question`, `additionalInfo`, `tankId`, `imageUrl`),
- nie wysylamy pelnych dokumentow usera z aplikacji,
- tekst jest sanitizowany:
  - emaile -> `[email]`
  - telefony -> `[phone]`
  - URL -> `[url]`
  - dlugie sekwencje cyfr -> `[number]`

## Storage Safety (Image Upload)

Zdjecia do analizy trafiaja do:

- `aiVisionInputs/{uid}/...`

Reguly `storage.rules`:

- read/write tylko gdy `request.auth.uid == uid`,
- brak publicznego dostepu do cudzych zdjec.

## AI Diagnostic Logging Policy

Logi AI musza byc bez PII i bez pelnych payloadow.

Dozwolone pola diagnostyczne:

- `operation` (`chat` / `vision`)
- `diagnosticCode` (`AIW_*`)
- `payloadKeys`
- `hasTankId`
- `hasImageUrl`
- `questionLength`
- `additionalInfoLength`
- `httpStatus`

Niedozwolone w logach:

- tresc pytania usera,
- `additionalInfo` w postaci raw text,
- base64 obrazu / URL zawierajace dane wrazliwe,
- pelne dokumenty usera.

## Kody Diagnostyczne AIW

| Code | Znaczenie | Typowa akcja |
| --- | --- | --- |
| `AIW_OK` | request zakonczony poprawnie | brak |
| `AIW_UNAUTHORIZED` | brak/blad tokenu | ponowne logowanie |
| `AIW_VALIDATION` | niepoprawny request / brak danych | poprawa inputu |
| `AIW_TIMEOUT` | timeout backend/providera | retry (1-2 proby) |
| `AIW_PROVIDER_ERROR` | problem po stronie providera AI | retry + monitor backendu |
| `AIW_INTERNAL` | nieoczekiwany blad | incydent techniczny |
| `AIW_UNAVAILABLE` | brak konfiguracji AI w buildzie | konfiguracja env/build |

## Triage Incydentow AI

1. Zidentyfikuj `operation` (`chat` lub `vision`) i `diagnosticCode`.
2. Sprawdz czy user ma wlaczone zgody AI.
3. Sprawdz status subskrypcji (`userSubscriptions/{uid}`):
   - `tier`,
   - `status`,
   - `lastValidatedAt`.
4. Sprawdz telemetry:
   - `ai_request_started`,
   - `ai_request_failure`,
   - `ai_diagnostic`.
5. Zweryfikuj backend health:
   - dostepnosc `/ai/chat` / `/ai/vision/analyze`,
   - timeout providera,
   - wzrost `AIW_PROVIDER_ERROR`.
6. Dla vision:
   - sprawdz, czy fallback "obraz nieczytelny" nie dominuje (jakosc zdjec).

## Incident Severity

- **P0**: wyciek danych wrazliwych / publiczny dostep do cudzych zdjec.
- **P1**: AI niedostepne dla wiekszosci userow (wysokie `AIW_TIMEOUT`/`AIW_PROVIDER_ERROR`).
- **P2**: pojedyncze degradacje UX (np. sporadyczne retry/fallback).

## Recovery Playbook

1. Tymczasowo ogranicz funkcje AI (gating feature flag/subscription).
2. Napraw backend/provider timeout.
3. Potwierdz brak wycieku w logach (sampling telemetry).
4. Uruchom smoke:
   - consent ON/OFF
   - chat success
   - vision success
   - vision unreadable fallback
   - retry path
5. Udokumentuj RCA i akcje zapobiegawcze.

