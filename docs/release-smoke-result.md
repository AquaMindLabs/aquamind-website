# Release Smoke Result

- Release: `release-candidate-2026-05-15`
- Data: `2026-05-15`
- Tester: `QA/PM Gate Run (Codex assisted)`
- Build: `master@7ef6c5a`

## Wyniki checklisty

- [ ] [SMK-ONB-01] Fresh start: utworz nowe akwarium od zera, przejdz onboarding do konca bez crasha. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-ONB-02] Restart: wybierz tryb restart i sprawdz, ze kroki oraz komunikaty sa adekwatne do restartu. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-ONB-03] Mature media start: wybierz start na dojrzalej biologii i potwierdz, ze plan/kroki sa inne niz fresh start. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-ONB-04] Po zakonczeniu onboardingu dane sa zapisane i widoczne po zamknieciu oraz ponownym otwarciu aplikacji. FAIL (BLOCKED przez AUTH-BLK-001)

- [ ] [SMK-CAL-01] Otworz kalendarz akcji i potwierdz, ze widac dzisiejsze zadania. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-CAL-02] Oznacz akcje jako done i sprawdz, ze status zadania aktualizuje sie od razu. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-CAL-03] Uzyj skip dla innej akcji i potwierdz poprawny status. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-CAL-04] Uzyj postpone i sprawdz, ze termin zadania przesuwa sie zgodnie z UI. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-CAL-05] Po odswiezeniu ekranu statusy done/skip/postpone sa zachowane. FAIL (BLOCKED przez AUTH-BLK-001)

- [ ] [SMK-MEA-01] Dodaj nowy pomiar z podstawowymi parametrami (np. pH, NO2, temp). FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-MEA-02] Sprawdz, ze pomiar pojawia sie w historii i na ekranie podsumowania. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-MEA-03] Edytuj dodany pomiar i potwierdz zapis zmian. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-MEA-04] Usun pomiar testowy i potwierdz, ze znika z listy historii. FAIL (BLOCKED przez AUTH-BLK-001)

- [ ] [SMK-STK-01] Dodaj rybe z katalogu do akwarium. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-STK-02] Dodaj rosline z katalogu do akwarium. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-STK-03] Zmien ilosc ryby/rosliny i potwierdz, ze zapis jest trwaly po odswiezeniu. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-STK-04] Sprawdz sekcje zgodnosci (compatibility) i potwierdz, ze pokazuje wynik bez bledow UI. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-STK-05] Dodanie pozycji, ktora powinna dawac ostrzezenie, faktycznie pokazuje alert/ostrzezenie. FAIL (BLOCKED przez AUTH-BLK-001)

- [ ] [SMK-EQP-01] Dodaj sprzet z katalogu (np. filtr lub grzalka) i zapisz. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-EQP-02] Dodaj wpis custom (recznie) i zapisz. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-EQP-03] Edytuj parametry sprzetu i potwierdz persist danych. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-EQP-04] Sprawdz, ze analiza/rekomendacje sprzetu laduja sie bez crasha. FAIL (BLOCKED przez AUTH-BLK-001)

- [ ] [SMK-AI-01] Chat AI: zadaj pytanie na danych usera (z aktywnym tankId) i potwierdz odpowiedz osadzona w kontekcie akwarium. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-AI-02] Chat AI fallback: dla konta z minimalnymi danymi potwierdz czytelny fallback bez crasha. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-AI-03] Vision happy path: wybierz czytelne zdjecie i potwierdz wynik (hipotezy, pewnosc, kroki weryfikacyjne, plan dzialania). FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-AI-04] Vision low-confidence: wybierz rozmazane/ciemne zdjecie i potwierdz fallback "obraz nieczytelny" bez bledu technicznego. FAIL (BLOCKED przez AUTH-BLK-001)
- [ ] [SMK-AI-05] Gating Free vs Pro: w planie Free AI pokazuje upgrade prompt, w planie Pro dostep jest odblokowany bez restartu app po zmianie planu. FAIL (BLOCKED przez AUTH-BLK-001)

## Podsumowanie Gate
- Core PASS/FAIL: `FAIL`
- AI PASS/FAIL: `FAIL`
- Final GO/NO-GO: `NO-GO`

## Notatki i znane problemy
- Execution blocker: nie da sie przejsc przez logowanie Google na buildzie release candidate.
- Objaw: ekran bledu globalnego z komunikatem `Cannot read property 'some' of undefined` po probie logowania Google.
- Impact: brak mozliwosci wejscia do flow wymagajacych sesji (onboarding, kalendarz, pomiary, obsada, sprzet).

### Failure Signatures (owner + target fix date)

| Signature ID | Sygnatura | Impact | Owner | Target fix date |
|---|---|---|---|---|
| AUTH-BLK-001 | `Cannot read property 'some' of undefined` podczas Google Sign-In | Blokada wszystkich flow `SMK-*` po logowaniu | Mobile/Auth Team | 2026-05-17 |
| AUTH-BLK-002 | Ekran: `Wystapil nieoczekiwany blad` po autoryzacji | Crash UX i utrata scenariusza testowego | Mobile/Auth Team | 2026-05-17 |

## Ryzyka blokujace publikacje (GO/NO-GO)
- P0: krytyczny blocker wejscia do aplikacji dla czesci userow (auth path).
- Brak mozliwosci potwierdzenia flow post-login na aktualnym kandydacie release.
- Ryzyko supportowe i ratingowe po publikacji: wysokie (uzytkownik nie przechodzi przez start aplikacji).

## Decyzja
- [ ] PASS
- [x] FAIL
