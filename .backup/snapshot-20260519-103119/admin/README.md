# AquaMind Admin (web)

Panel admina jako osobny web, niezalezny od aplikacji mobilnej.

## Co robi

- logowanie email + haslo przez Firebase Auth
- weryfikacja custom claim `admin: true`
- przeglad i edycja `fishCatalog`
- przeglad i edycja `plantCatalog`
- przeglad i edycja `algaeCatalog`
- sekcja sugestii brakow z `fishCatalogRequests` i `plantCatalogRequests`
- sekcja `Uzytkownicy i plany` oparta o `userSubscriptions`
- lista wszystkich pol katalogowych wykorzystywanych przez aplikacje (ryby/rosliny)
- wyszukiwanie, dodawanie, edycja, usuwanie wpisow
- stronicowanie list (20 wpisow na strone)

## Jak uruchomic lokalnie

1. Otworz `admin/index.html` przez lokalny serwer HTTP (nie `file://`).
2. Panel automatycznie laduje config z `admin/firebase-config.local.js`.
3. Jesli pliku nie ma, skopiuj `admin/firebase-config.local.example.js` do `admin/firebase-config.local.js`.
4. Zaloguj sie kontem, ktore ma custom claim `admin: true`.

Przyklad lokalnego serwera z katalogu repo:

```bash
npx serve .
```

Nastepnie wejdz na `http://localhost:3000/admin/`.

## Uwagi

- Konfiguracja Firebase zapisywana jest lokalnie w przegladarce (`localStorage`).
- Priorytet configu: `admin/firebase-config.local.js` -> `localStorage` -> reczne wpisanie w formularzu.
- Uprawnienia zapisu do katalogow wynikaja z `firestore.rules` (`isAdmin()`).
- Dane Firebase do panelu sa pobrane z `.env` (`EXPO_PUBLIC_FIREBASE_*`).
- Sekcja subskrypcji czyta i zapisuje kolekcje `userSubscriptions` (admin-only).
