# Release Smoke Checklist (QA/PM)

## Cel
Szybko potwierdzic, ze kluczowe flow produktu dzialaja po releasie i nie ma blockerow dla uzytkownika koncowego.

## Dla kogo
- QA
- PM
- osoby biznesowe bez znajomosci kodu

## Czas wykonania
- ok. 35-60 minut

## Srodowisko
- build release kandydujacy do publikacji
- konto testowe z co najmniej 1 aktywnym akwarium
- lacznosc z internetem

## Jak raportowac wynik
1. Skopiuj [release-smoke-result-template.md](/C:/Users/mikee/aquarium-mobile/docs/release-smoke-result-template.md) do nowego pliku, np. `docs/release-smoke-result.md`.
2. Odhaczaj kazdy krok jako `[x]` (pass) albo zostaw `[ ]` (fail/not done).
3. Przy fail dopisz 1-2 zdania obserwacji i screen/video.

---

## 1) Onboarding (3 start types)
- [ ] [SMK-ONB-01] Fresh start: utworz nowe akwarium od zera, przejdz onboarding do konca bez crasha.
- [ ] [SMK-ONB-02] Restart: wybierz tryb restart i sprawdz, ze kroki oraz komunikaty sa adekwatne do restartu.
- [ ] [SMK-ONB-03] Mature media start: wybierz start na dojrzalej biologii i potwierdz, ze plan/kroki sa inne niz fresh start.
- [ ] [SMK-ONB-04] Po zakonczeniu onboardingu dane sa zapisane i widoczne po zamknieciu oraz ponownym otwarciu aplikacji.

## 2) Kalendarz akcji (done / skip / postpone)
- [ ] [SMK-CAL-01] Otworz kalendarz akcji i potwierdz, ze widac dzisiejsze zadania.
- [ ] [SMK-CAL-02] Oznacz akcje jako done i sprawdz, ze status zadania aktualizuje sie od razu.
- [ ] [SMK-CAL-03] Uzyj skip dla innej akcji i potwierdz poprawny status.
- [ ] [SMK-CAL-04] Uzyj postpone i sprawdz, ze termin zadania przesuwa sie zgodnie z UI.
- [ ] [SMK-CAL-05] Po odswiezeniu ekranu statusy done/skip/postpone sa zachowane.

## 3) Dodanie / edycja pomiaru
- [ ] [SMK-MEA-01] Dodaj nowy pomiar z podstawowymi parametrami (np. pH, NO2, temp).
- [ ] [SMK-MEA-02] Sprawdz, ze pomiar pojawia sie w historii i na ekranie podsumowania.
- [ ] [SMK-MEA-03] Edytuj dodany pomiar i potwierdz zapis zmian.
- [ ] [SMK-MEA-04] Usun pomiar testowy i potwierdz, ze znika z listy historii.

## 4) Obsada i zgodnosc
- [ ] [SMK-STK-01] Dodaj rybe z katalogu do akwarium.
- [ ] [SMK-STK-02] Dodaj rosline z katalogu do akwarium.
- [ ] [SMK-STK-03] Zmien ilosc ryby/rosliny i potwierdz, ze zapis jest trwaly po odswiezeniu.
- [ ] [SMK-STK-04] Sprawdz sekcje zgodnosci (compatibility) i potwierdz, ze pokazuje wynik bez bledow UI.
- [ ] [SMK-STK-05] Dodanie pozycji, ktora powinna dawac ostrzezenie, faktycznie pokazuje alert/ostrzezenie.

## 5) Sprzet (katalog / custom)
- [ ] [SMK-EQP-01] Dodaj sprzet z katalogu (np. filtr lub grzalka) i zapisz.
- [ ] [SMK-EQP-02] Dodaj wpis custom (recznie) i zapisz.
- [ ] [SMK-EQP-03] Edytuj parametry sprzetu i potwierdz persist danych.
- [ ] [SMK-EQP-04] Sprawdz, ze analiza/rekomendacje sprzetu laduja sie bez crasha.

---

## Known Failure Signatures

### A) Firestore/Auth permissions
- Sygnatura: `missing or insufficient permissions`
- Gdzie widoczne: alert po zapisie, logi debug, brak zapisu po odswiezeniu.
- Typowy kontekst: `addDoc`/`updateDoc` dla `stockItems`, `tankDiseaseCases`, `measurements`, `tanks`.
- Co zrobic:
1. Zweryfikuj, czy konto testowe ma poprawny `userId`.
2. Sprawdz, czy zapisujesz obiekty do wlasnego `tankId`.
3. Dodaj screen i payload wejciowy z formularza (bez danych wrazliwych).

### B) Rule validation mismatch
- Sygnatura: `PERMISSION_DENIED` bez crasha aplikacji, operacja odrzucona.
- Gdzie widoczne: logi emulatora/rules test albo alert w aplikacji.
- Co zrobic:
1. Zanotuj flow i krok checklisty.
2. Zanotuj, czy blad dotyczy create czy update.
3. Dodaj screen i czas zdarzenia.

### C) Stale UI after write
- Sygnatura: zapis sie udal, ale UI nie pokazuje zmian od razu.
- Gdzie widoczne: status nie zmienia sie do recznego odswiezenia/nawigacji.
- Co zrobic:
1. Wymus odswiezenie widoku.
2. Potwierdz, czy dane wracaja po reopen aplikacji.
3. Oznacz jako pass z uwaga lub fail zaleznie od oczekiwan release.

---

## Kryterium PASS release smoke
- Wszystkie pozycje z ID `SMK-*` odhaczone `[x]`.
- Brak blockerow typu crash / brak zapisu krytycznych danych.
- Brak otwartych issue `P0/P1` po wykonaniu checklisty.
