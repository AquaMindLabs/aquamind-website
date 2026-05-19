# Google OAuth - krok po kroku (Firebase + Expo)

## 1) Dane, które sa juz przygotowane

- Android package: `com.myaquarium.assistant`
- iOS bundle identifier: `com.myaquarium.assistant`
- App scheme: `aquariummobile`
- Web Client ID (juz wpisany do `.env`):
  `986775209556-1hd38obdt2quakll536jcmmvjk5eduk8.apps.googleusercontent.com`

## 2) Co jest juz ustawione w projekcie

- `app.json`:
  - `expo.android.package = com.myaquarium.assistant`
  - `expo.ios.bundleIdentifier = com.myaquarium.assistant`
- `.env`:
  - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` wypelnione
  - czeka na:
    - `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
    - `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`

## 3) Klikanie w Firebase / Google Cloud

1. Otworz Firebase Console -> projekt `my-aquarium-assistant`.
2. Wejdz w `Authentication` -> `Sign-in method` -> `Google` -> `Enable` -> `Save`.
3. Otworz Google Cloud Console -> `APIs & Services` -> `OAuth consent screen`.
4. Ustaw:
   - Typ: `External`
   - App name: `My Aquarium Assistant`
   - Support email: Twoj email
   - Test users: dodaj swoj email
5. Przejdz do `Credentials` -> `Create credentials` -> `OAuth client ID`.

## 4) Utworz OAuth Client ID dla iOS

1. Typ aplikacji: `iOS`.
2. Bundle ID: `com.myaquarium.assistant`.
3. Zapisz i skopiuj `Client ID` (konczy sie na `.apps.googleusercontent.com`).
4. Wklej do `.env`:
   - `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...`

## 5) Utworz OAuth Client ID dla Android

1. Typ aplikacji: `Android`.
2. Package name: `com.myaquarium.assistant`.
3. SHA-1 certificate fingerprint: tu wklejasz debugowy SHA-1.
   - Najprosciej w Android Studio: `Gradle` -> `Tasks` -> `android` -> `signingReport` (odczytaj `SHA1` dla `debug`).
   - Alternatywa (jesli masz `keytool`): `keytool -list -v -keystore %USERPROFILE%\\.android\\debug.keystore -alias androiddebugkey -storepass android -keypass android`
4. Zapisz i skopiuj `Client ID`.
5. Wklej do `.env`:
   - `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...`

## 6) Start i test

1. Uruchom development build (nie Expo Go).
2. Zrestartuj bundler po zmianie `.env`.
3. Sprawdz logowanie Google.

## 7) Uwaga o Expo Go

Google login przez OAuth nie bedzie stabilnie dzialal w Expo Go.
Do testow uzywamy development build.
