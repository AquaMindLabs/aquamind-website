# Android publikacja - krok po kroku (AquaMind)

Ten plik to prosta checklista od przygotowania do pierwszego `.aab`.

## 0) Co jest juz ustawione w projekcie

- `app.json` ma `android.package = com.myaquarium.assistant`
- `app.json` ma startowe `android.versionCode = 1`
- `eas.json` ma profil `production` z:
  - `android.buildType = app-bundle` (czyli `.aab`)
  - `autoIncrement = true` (automatyczny wzrost numeru builda)
  - `credentialsSource = remote` (podpisywanie przez EAS)

## 1) Pierwsza konfiguracja EAS na Twoim komputerze

1. Zaloguj sie do Expo:
   - `npx eas login`
2. Powiaz projekt z Expo:
   - `npx eas project:init`

## 2) Wersjonowanie Android (jak dziala)

- Produkcyjne buildy przez `eas build --profile production` beda mialy automatycznie zwiekszany `versionCode`.
- Nie musisz recznie edytowac `versionCode` przy kazdej publikacji.

## 3) Pierwszy produkcyjny build `.aab`

1. Uruchom build:
   - `npx eas build --platform android --profile production`
2. Przy pierwszym buildzie, gdy padnie pytanie o credentials/keystore:
   - wybierz opcje generowania i przechowywania klucza przez EAS (remote).

## 4) Podpisywanie i Play App Signing (jak wybrac)

Rekomendowany wariant:

1. W Google Play Console wlaczysz `Play App Signing` (to standard).
2. EAS tworzy i trzyma `upload key` (keystore) do podpisywania uploadu.
3. Google po stronie sklepu podpisuje finalna apke kluczem app signing.

To jest najprostsze i najbezpieczniejsze dla startu.

## 5) Co robic przy kolejnych publikacjach

1. Commit zmian.
2. `npx eas build --platform android --profile production`
3. Odebrac nowy `.aab`.
4. Wrzucic do Play Console (Internal / Closed / Production zaleznie od etapu).

## 6) Przydatne komendy kontrolne

- Sprawdzenie konfiguracji Expo:
  - `npx expo config --type public`
- Podglad aktualnej wersji zdalnej EAS:
  - `npx eas build:version:show`
- Jesli kiedys trzeba zsynchronizowac wersje:
  - `npx eas build:version:set`

