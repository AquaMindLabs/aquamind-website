# Firestore Write Diagnostic Codes

Ten dokument opisuje stale kody diagnostyczne dla bledow zapisu (`addDoc` / `updateDoc`) oraz rekomendowane kroki.

## Co jest logowane

Dla kazdego nieudanego zapisu logujemy tylko metadane techniczne:

- `collection`
- `operation` (`addDoc` albo `updateDoc`)
- `payloadKeys` (wylacznie nazwy pol)
- `userId`
- `tankId`
- `docId` (jesli dotyczy)
- `firestoreCode`
- `diagnosticCode`

Nie logujemy wartosci payloadu, tresci notatek ani innych danych wrazliwych.

## Tabela kodow

| Diagnostic code | Kiedy ustawiany | Typowe sygnatury | Zalecane kroki |
| --- | --- | --- | --- |
| `FSW_PERMISSION_DENIED` | Firestore zwraca `permission-denied` albo komunikat o brakujacych uprawnieniach | `firestoreCode=permission-denied`, `missing or insufficient permissions` | 1) Sprawdz, czy uzytkownik jest zalogowany na poprawne konto. 2) Zweryfikuj `userId` i `tankId` w logu. 3) Sprawdz reguly Firestore dla kolekcji i operacji. |
| `FSW_UNAUTHENTICATED` | Firestore zwraca `unauthenticated` | `firestoreCode=unauthenticated` | 1) Odswiez sesje logowania. 2) Wymus ponowne zalogowanie i powtorz akcje. |
| `FSW_UNAVAILABLE` | Firestore zwraca `unavailable` | `firestoreCode=unavailable` | 1) Sprawdz lacze/siec. 2) Sprobuj ponownie po chwili. 3) Jesli stale, sprawdz status uslugi Firebase. |
| `FSW_TIMEOUT` | Firestore zwraca `deadline-exceeded` | `firestoreCode=deadline-exceeded` | 1) Powtorz zapis. 2) Sprawdz czy payload nie jest nadmiernie duzy. 3) Zweryfikuj stabilnosc polaczenia. |
| `FSW_VALIDATION` | Firestore zwraca `invalid-argument` lub `failed-precondition` | `firestoreCode=invalid-argument` lub `failed-precondition` | 1) Sprawdz `payloadKeys` oraz walidacje runtime modelu. 2) Zweryfikuj zgodnosc typu danych z modelem i regula Firestore. |
| `FSW_NOT_FOUND` | Firestore zwraca `not-found` | `firestoreCode=not-found` | 1) Sprawdz `docId` oraz czy dokument nie zostal usuniety. 2) Zweryfikuj, czy zapis nie trafia do nieistniejacej referencji. |
| `FSW_UNKNOWN` | Kazdy inny blad zapisu | dowolny inny `firestoreCode` lub pusty kod | 1) Sprawdz pelny stack bledu. 2) Odtworz problem z tym samym `userId/tankId`. 3) Dodaj sygnature do listy znanych przypadkow. |

## Known failure signatures

- `missing or insufficient permissions`
- `firestore/permission-denied`
- `firestore/unauthenticated`
- `firestore/unavailable`
- `firestore/deadline-exceeded`
- `firestore/failed-precondition`
- `firestore/invalid-argument`
- `firestore/not-found`

## Szybka procedura triage

1. Odszukaj wpis po `userId` i `tankId`.
2. Sprawdz `diagnosticCode` i odpowiadajaca sekcje w tabeli.
3. Zweryfikuj `collection`, `operation` i `payloadKeys`.
4. Potwierdz, czy problem jest jednostkowy (jedno konto/akwarium) czy globalny.
5. Po naprawie wykonaj ponowny zapis tym samym flow.
