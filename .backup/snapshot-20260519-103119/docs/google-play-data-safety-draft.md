# Google Play - Data Safety (draft do uzupelnienia)

To jest roboczy draft odpowiedzi pod formularz `App content -> Data safety`.
Przed finalnym zatwierdzeniem porownaj go 1:1 z aktualna implementacja i SDK.

## 1) Czy aplikacja zbiera dane?

`Tak`

## 2) Czy dane sa udostepniane stronom trzecim?

`Nie` (poza przetwarzaniem przez dostawce infrastruktury, np. Firebase/Google Cloud, w celu dzialania aplikacji)

## 3) Kategorie danych (draft)

### A) Personal info

- `Email address` -> `Collected: Yes`
- `User IDs` -> `Collected: Yes`

Cel:
- `App functionality`
- `Account management`
- `Security / fraud prevention`

Przetwarzanie:
- `Data is encrypted in transit: Yes`
- `User can request deletion: Yes`

### B) App activity / App info and performance

- `Crash logs` -> `Collected: Yes`
- `Diagnostics` -> `Collected: Yes`

Cel:
- `Analytics`
- `App functionality`
- `Security / stability`

Przetwarzanie:
- `Encrypted in transit: Yes`
- `User deletion request: Not required for anonymous technical logs` (zalezy od finalnej konfiguracji logowania)

### C) Files and docs / Photos and videos / Contacts / Location / Financial info

- `Collected: No` (jesli nie dodasz takich funkcji)

## 4) Account deletion (wymog Google Play)

W formularzu zaznacz:
- aplikacja pozwala zalozyc konto: `Tak`
- aplikacja pozwala usunac konto w aplikacji: `Tak`
- podaj URL zewnetrzny do usuniecia konta:
  - `https://aquamindlabs.github.io/aquamind-website/delete-account.html`

## 5) Privacy policy URL

- `https://aquamindlabs.github.io/aquamind-website/privacy.html`

## 6) Szybka checklista przed kliknieciem Submit

1. Czy kategorie danych zgadzaja sie z realnym kodem i SDK?
2. Czy link `privacy.html` dziala bez logowania?
3. Czy link `delete-account.html` dziala bez logowania?
4. Czy w aplikacji realnie dziala `Ustawienia -> Usun konto`?
5. Czy odpowiedzi w Data Safety sa spojne z polityka prywatnosci?

## 7) Uwaga praktyczna

Jesli dodasz nowe SDK (np. reklamy, nowe analityki, platnosci, deep-link trackery),
zawsze zaktualizuj Data Safety przed kolejnym releasem.
