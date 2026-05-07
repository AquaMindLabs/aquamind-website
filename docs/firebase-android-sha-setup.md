# Firebase Android - konfiguracja SHA (krok po kroku)

Ten krok warto zrobic teraz. Nie wymaga Google Play Console.

## 1) Dane, ktore juz masz (z EAS credentials)

- `Android package`: `com.myaquarium.assistant`
- `SHA1`: `10:3F:54:63:6F:CE:30:97:AF:4C:8B:9A:BA:8C:C3:A9:CA:69:5E:27`
- `SHA256`: `34:C4:50:00:71:5F:C8:8E:5F:79:7B:AA:E9:54:F7:A9:7B:D6:0D:4A:58:2C:2D:AC:7B:95:BC:DE:0F:0E:3E:31`

## 2) Gdzie to wpisac

1. Wejdz do `Firebase Console`.
2. Otworz projekt, ktory jest podpiety pod te aplikacje.
3. `Project settings` (ikona kola zebatego).
4. Zakladka `General`.
5. W sekcji `Your apps` wybierz aplikacje Android:
   - `com.myaquarium.assistant`
6. Kliknij `Add fingerprint`.
7. Dodaj `SHA-1` -> zapisz.
8. Dodaj drugi raz `SHA-256` -> zapisz.

## 3) Co dalej po zapisaniu

1. Odczekaj 2-5 minut.
2. Przetestuj logowanie Google na Androidzie (build dev/preview).

## 4) Najczestszy problem

Jesli logowanie Google na Androidzie nie dziala:
- zwykle brakuje SHA-1 lub jest wpisany fingerprint z innego keystore.
- u Ciebie produkcyjny fingerprint powinien byc ten z EAS credentials (wyzej).

## 5) Notatka operacyjna

Po zmianie keystore w przyszlosci trzeba ponownie dopisac nowe SHA w Firebase.
