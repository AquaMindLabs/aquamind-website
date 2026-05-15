# AI Backend API (Chat + Vision)

## Endpointy

- `POST /ai/chat`
- `POST /ai/vision/analyze`

Endpointy wymagaja `Authorization: Bearer <firebase_id_token>`.

## Bezpieczenstwo obrazow (Storage)

- Zdjecia do analizy zapisujemy pod sciezka `aiVisionInputs/{uid}/...`.
- Reguly `storage.rules` dopuszczaja odczyt i zapis tylko dla `request.auth.uid == uid`.
- Brak publicznego dostepu do zdjec innych uzytkownikow.

## Autoryzacja

- Token jest weryfikowany po stronie backendu przez Firebase Admin.
- UID jest pobierane wylacznie z tokenu.
- Backend zawsze czyta dane przez `userId == uid`.

## Kontrakty request

## `POST /ai/chat`

Przyklad:

```json
{
  "question": "Jak poprawic stabilnosc NO3?",
  "tankId": "tank_abc",
  "additionalInfo": "Podmieniam 20% raz w tygodniu.",
  "locale": "pl"
}
```

Walidacja:
- `question` wymagane, min 2 znaki
- `tankId` opcjonalne
- `additionalInfo` opcjonalne
- `locale` opcjonalne (`pl|en|de`)

## `POST /ai/vision/analyze`

Przyklad:

```json
{
  "question": "Czy to glony nitkowate?",
  "imageUrl": "https://.../photo.jpg",
  "tankId": "tank_abc",
  "additionalInfo": "Problem nasila sie po swieceniu."
}
```

Walidacja:
- wymagane jedno z: `imageUrl` lub `imageBase64`
- `question` opcjonalne
- `tankId` opcjonalne
- `additionalInfo` opcjonalne

Response `data` dla vision zawiera:
- `summary`
- `hypotheses[]` (`key`, `label`, `confidence`)
- `verificationSteps[]`
- `recommendations[]`
- `actionPlan[]`
- `warnings[]`
- `contextSummary`

## Kontrakty response

Success:

```json
{
  "ok": true,
  "diagnosticCode": "AIW_OK",
  "data": {
    "contextSummary": {
      "tankSummary": {},
      "measurements": {},
      "stockSummary": {},
      "equipmentSummary": {},
      "activeIssues": {},
      "onboardingHighlights": {},
      "actionCalendarHighlights": {},
      "meta": {}
    }
  }
}
```

`contextSummary` zawiera tylko odchudzony DTO potrzebny modelowi AI (bez surowych dokumentow Firestore).
Warstwa context builder ma limity rozmiaru i fallbacki przy brakach danych.
Gdy obraz jest nieczytelny, backend zwraca jasny fallback `summary` zamiast technicznego bledu.

Error:

```json
{
  "ok": false,
  "diagnosticCode": "AIW_*",
  "message": "..."
}
```

## Kody diagnostyczne AIW

| Code | Znaczenie | HTTP |
| --- | --- | --- |
| `AIW_OK` | Request obsluzony poprawnie | 200 |
| `AIW_UNAUTHORIZED` | Brak lub niepoprawny token | 401 |
| `AIW_VALIDATION` | Niepoprawny payload | 400 |
| `AIW_TIMEOUT` | Timeout odpowiedzi AI | 504 |
| `AIW_PROVIDER_ERROR` | Blad providera AI | 502 |
| `AIW_INTERNAL` | Blad wewnetrzny backendu | 500 |

## Standaryzowane logowanie kontekstu

Logujemy tylko metadane techniczne:

- `endpoint`
- `operation`
- `diagnosticCode`
- `uid`
- `tankId`
- `payloadKeys`
- `questionLength`
- `additionalInfoLength`
- `hasImageUrl` / `hasImageBase64`
- `durationMs`
- `provider`
- `httpStatus`

Nie logujemy tresci pytan, pelnych payloadow ani zawartosci obrazu.
