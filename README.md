# Aquarium Mobile

Etap: logowanie email + haslo, multi-tank, zapis pomiarow, historia i analiza parametrow.

## Funkcje (aktualny zakres)

- rejestracja i logowanie email + haslo (Firebase Auth)
- wylogowanie
- dodanie pojedynczego pomiaru:
  - pH
  - GH
  - NO2
  - NO3
  - temperatura
- zapis pomiaru do Firestore z automatycznym `userId` i `createdAt`
- multi-tank:
  - dodawanie akwarium (`nazwa`, `litraz`)
  - edycja aktywnego akwarium (`nazwa`, `litraz`)
  - wybor aktywnego akwarium z lewego menu (drawer: gest lub przycisk)
  - podzial aplikacji na sekcje:
    - `Przeglad`
    - `Dodaj pomiary`
    - `Edycja ryb`
    - `Edycja roslin`
  - zapamietanie aktywnego akwarium per user
  - pomiary przypisane do aktywnego akwarium (`tankId`)
- podstawowa walidacja:
  - pola wymagane
  - zamiana na liczby
  - odrzucenie tekstu zamiast liczby
- komunikat po zapisie: `Zapisano` albo `Blad`
- historia pomiarow:
  - lista pomiarow zalogowanego uzytkownika dla aktywnego akwarium
  - sortowanie po dacie (najnowsze na gorze)
  - podglad szczegolow po kliknieciu wpisu
- karta aktualnych parametrow na gorze (ostatni pomiar + status + notatka)
- historia jako sekcja rozwijana/zwijana po kliknieciu
- obsada (ryby i rosliny):
  - katalog ryb (`fishCatalog`) z nazwa potoczna i lacinska
  - katalog roslin (`plantCatalog`) z nazwa potoczna i lacinska
  - informacje o gatunku: `zakres pH`, `zakres GH`, `zakres temperatury`, `minimalny litraz`, `notatki`
  - mozliwosc dodania nowego gatunku do katalogu ryb
  - mozliwosc dodania nowego gatunku rosliny do katalogu
  - dodawanie ryb do obsady z katalogu ryb
  - dodawanie roslin do obsady z katalogu roslin
  - lista obsady dla aktywnego akwarium
  - automatyczne sprawdzanie zgodnosci ryb i roslin z aktualnymi parametrami i litrazem
  - raport kompatybilnosci obsady: `OK` / `NIE OK`
  - konkretna informacja o problemach:
    - niezgodnosc parametrow z aktualna woda
    - niezgodnosc zakresow miedzy gatunkami
    - za maly litraz dla gatunku
- trendy i sugestie:
  - analiza trendow z historii (np. czy `NO3` rosnie/spada)
  - kierunek zmian dla `NO3`, `NO2`, `pH`, `GH`, temperatury
  - sugestie dzialan na podstawie historii pomiarow
- analiza parametrow (if -> then):
  - status: `OK`, `UWAGA`, `KRYTYCZNE`
  - konkretne akcje dla NO2, NO3, pH, GH, temperatury
  - analiza widoczna po zapisie i w szczegolach historii

## Czego nie ma w tym etapie

- brak wykresow
- brak powiazania pomiaru z akwarium

## Uruchomienie

```bash
npm install
npm start
```

## Zdjecia chorob

Aplikacja pobiera zdjecia chorob z Wikimedia Commons i wysyla naglowki wymagane przez mobilne pobieranie obrazow. Nie wymaga to Firebase Storage ani podnoszenia planu Firebase.

Jesli zewnetrzne zrodlo chwilowo odmowi odpowiedzi, widoczny jest lokalny placeholder zamiast pustego miejsca.
