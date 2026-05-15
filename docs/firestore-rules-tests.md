# Firestore Rules Tests

## Cel

Zapewnic powtarzalne uruchamianie testow `firestore.rules` lokalnie i w CI, bez zaleznosci od katalogu profilu usera.

## Jak uruchomic

```bash
npm run test:firestore
```

Skrypt uruchamia:

- `scripts/run-firestore-rules-tests.cjs`
- `firebase emulators:exec --only firestore ...`
- testy: `tests/firestore.rules.test.cjs`

## Co robi bezpieczny runner

Runner tworzy lokalne katalogi robocze w repo:

- `.firebase-test-local/xdg-config`

I ustawia zmienne srodowiskowe dla procesu testowego:

- `XDG_CONFIG_HOME`

Dzieki temu `firebase-tools/configstore` nie probuje zapisywac do niedostepnej sciezki profilu usera.

## Windows (PowerShell)

Standardowo wystarczy:

```powershell
npm run test:firestore
```

Opcjonalnie mozna wskazac inny katalog roboczy:

```powershell
$env:FIREBASE_TEST_CONFIG_DIR=".tmp/firebase-tests"
npm run test:firestore
```

## macOS / Linux

```bash
npm run test:firestore
```

Opcjonalnie:

```bash
FIREBASE_TEST_CONFIG_DIR=.tmp/firebase-tests npm run test:firestore
```

## Troubleshooting

### EPERM / operation not permitted (configstore)

Objaw:

- blad podobny do:
  - `EPERM ... firebase-tools.json`

Co zrobic:

1. Upewnij sie, ze uruchamiasz test przez `npm run test:firestore` (a nie bezposrednio `firebase emulators:exec`).
2. Ustaw jawnie lokalny katalog:
   - `FIREBASE_TEST_CONFIG_DIR=.tmp/firebase-tests`
3. Sprobuj uruchomic ponownie.

### Emulator nie startuje (brak komponentu)

1. Sprawdz Java i dostep do pobran emulatora.
2. Uruchom ponownie test (cache emulatora jest trzymany lokalnie).

### Ruznice lokalnie vs CI

1. Korzystaj z tego samego polecenia (`npm run test:firestore`).
2. Nie podmieniaj recznie `projectId` w testach.
3. Trzymaj `firestore.rules` i testy regresyjne w jednym PR.
