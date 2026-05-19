# Release Smoke Result

- Release: `release-candidate-2026-05-15`
- Data: `2026-05-15`
- Tester: `QA/PM (pending execution after auth fix)`
- Build: `pending-new-release-build`

## Wyniki checklisty

Notacja statusu (po kazdym kroku):
- PASS: zaznacz `[x]`.
- FAIL: zostaw `[ ]` i dopisz `FAIL (powod)`.
- BLOCKED: zostaw `[ ]` i dopisz `FAIL (BLOCKED przez <SIGNATURE-ID>)`, np. `AUTH-BLK-001`.

- [ ] [SMK-ONB-01] Fresh start: utworz nowe akwarium od zera, przejdz onboarding do konca bez crasha.
- [ ] [SMK-ONB-02] Restart: wybierz tryb restart i sprawdz, ze kroki oraz komunikaty sa adekwatne do restartu.
- [ ] [SMK-ONB-03] Mature media start: wybierz start na dojrzalej biologii i potwierdz, ze plan/kroki sa inne niz fresh start.
- [ ] [SMK-ONB-04] Po zakonczeniu onboardingu dane sa zapisane i widoczne po zamknieciu oraz ponownym otwarciu aplikacji.

- [ ] [SMK-CAL-01] Otworz kalendarz akcji i potwierdz, ze widac dzisiejsze zadania.
- [ ] [SMK-CAL-02] Oznacz akcje jako done i sprawdz, ze status zadania aktualizuje sie od razu.
- [ ] [SMK-CAL-03] Uzyj skip dla innej akcji i potwierdz poprawny status.
- [ ] [SMK-CAL-04] Uzyj postpone i sprawdz, ze termin zadania przesuwa sie zgodnie z UI.
- [ ] [SMK-CAL-05] Po odswiezeniu ekranu statusy done/skip/postpone sa zachowane.

- [ ] [SMK-MEA-01] Dodaj nowy pomiar z podstawowymi parametrami (np. pH, NO2, temp).
- [ ] [SMK-MEA-02] Sprawdz, ze pomiar pojawia sie w historii i na ekranie podsumowania.
- [ ] [SMK-MEA-03] Edytuj dodany pomiar i potwierdz zapis zmian.
- [ ] [SMK-MEA-04] Usun pomiar testowy i potwierdz, ze znika z listy historii.

- [ ] [SMK-STK-01] Dodaj rybe z katalogu do akwarium.
- [ ] [SMK-STK-02] Dodaj rosline z katalogu do akwarium.
- [ ] [SMK-STK-03] Zmien ilosc ryby/rosliny i potwierdz, ze zapis jest trwaly po odswiezeniu.
- [ ] [SMK-STK-04] Sprawdz sekcje zgodnosci (compatibility) i potwierdz, ze pokazuje wynik bez bledow UI.
- [ ] [SMK-STK-05] Dodanie pozycji, ktora powinna dawac ostrzezenie, faktycznie pokazuje alert/ostrzezenie.

- [ ] [SMK-EQP-01] Dodaj sprzet z katalogu (np. filtr lub grzalka) i zapisz.
- [ ] [SMK-EQP-02] Dodaj wpis custom (recznie) i zapisz.
- [ ] [SMK-EQP-03] Edytuj parametry sprzetu i potwierdz persist danych.
- [ ] [SMK-EQP-04] Sprawdz, ze analiza/rekomendacje sprzetu laduja sie bez crasha.

- [ ] [SMK-AI-01] Chat AI: zadaj pytanie na danych usera (z aktywnym tankId) i potwierdz odpowiedz osadzona w kontekcie akwarium.
- [ ] [SMK-AI-02] Chat AI fallback: dla konta z minimalnymi danymi potwierdz czytelny fallback bez crasha.
- [ ] [SMK-AI-03] Vision happy path: wybierz czytelne zdjecie i potwierdz wynik (hipotezy, pewnosc, kroki weryfikacyjne, plan dzialania).
- [ ] [SMK-AI-04] Vision low-confidence: wybierz rozmazane/ciemne zdjecie i potwierdz fallback "obraz nieczytelny" bez bledu technicznego.
- [ ] [SMK-AI-05] Gating Free vs Pro: w planie Free AI pokazuje upgrade prompt, w planie Pro dostep jest odblokowany bez restartu app po zmianie planu.

## T-30 min przed publikacja (AI API final check)
- [ ] [SMK-AI-RLS-01] Doladuj minimum 5 USD na koncie API (prepaid billing) i potwierdz saldo.
- [ ] [SMK-AI-RLS-02] Zweryfikuj `.env`: `AI_PROVIDER_NAME=openai`, `OPENAI_MODEL=gpt-5-mini`, `EXPO_PUBLIC_AI_BACKEND_URL=http://<LAN_IP>:8790`.
- [ ] [SMK-AI-RLS-03] Uruchom backend AI i potwierdz log startu: `provider=openai`.
- [ ] [SMK-AI-RLS-04] Wykonaj 1 probe chat i 1 probe vision na realnym koncie testowym.
- [ ] [SMK-AI-RLS-05] Brak `AIW_PROVIDER_ERROR` i brak timeoutow krytycznych w probach finalnych.

## Podsumowanie Gate
- Core PASS/FAIL: `FAIL (pending manual execution)`
- AI PASS/FAIL: `FAIL (pending manual execution)`
- Final GO/NO-GO: `NO-GO (pending manual execution)`

## Notatki i znane problemy
- Auth blocker `AUTH-BLK-001` oznaczony jako naprawiony, ale ten dokument nie zawiera jeszcze wynikow ponownego przejscia SMK-* i SMK-AI-*.
- Ten plik jest przygotowany do retestu po nowym buildzie release.

## Decyzja
- [ ] PASS
- [x] FAIL
