# Firestore Admin Claims Checklist

Cel: tylko konta z claimem `admin: true` mogą zapisywać `fishCatalog` i `plantCatalog`.

1. Ustaw claim admin dla wybranego UID (Backend/Admin SDK):
```js
await admin.auth().setCustomUserClaims("<UID_ADMINA>", { admin: true });
```

2. Usuń claim dla zwykłych kont:
```js
await admin.auth().setCustomUserClaims("<UID_UZYTKOWNIKA>", { admin: false });
```

3. Wymuś odświeżenie tokenu po zmianie claimów (w aplikacji):
```js
await auth.currentUser?.getIdToken(true);
```

4. Zweryfikuj claim po stronie klienta:
```js
const token = await auth.currentUser?.getIdTokenResult();
const isAdmin = token?.claims?.admin === true;
```

5. Test manualny dostępu:
- konto bez claimu `admin`: odczyt `fishCatalog` i `plantCatalog` dozwolony.
- konto bez claimu `admin`: zapis do `fishCatalog` i `plantCatalog` zablokowany.
- konto z claimem `admin: true`: odczyt dozwolony.
- konto z claimem `admin: true`: zapis dozwolony.

6. Testy emulatora reguł:
- uruchom:
```bash
npm run test:firestore
```
- wymagania środowiska: Java dostępna w PATH.

7. Wdrożenie reguł:
```bash
firebase deploy --only firestore:rules
```
