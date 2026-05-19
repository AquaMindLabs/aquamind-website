# Android release - master checklist (od teraz do publikacji)

Data startu: 7 maja 2026

## Etap A - wykonane

- [x] Produkcyjny build `.aab` z EAS
- [x] Keystore wygenerowany i zapisany w EAS (remote credentials)
- [x] Backup `credentials.json` i `keystore.jks` poza repo
- [x] Publiczne strony:
  - [x] `index.html`
  - [x] `privacy.html`
  - [x] `delete-account.html`
- [x] Gotowe drafty:
  - [x] listing Google Play
  - [x] Data Safety

## Etap B - do zrobienia teraz (bez Google Play weryfikacji)

- [ ] Firebase: dodaj SHA-1 i SHA-256 (patrz `docs/firebase-android-sha-setup.md`)
- [ ] Podstaw finalne assety sklepu (ikona, feature graphic, screenshoty)
- [ ] Przejdz `docs/android-smoke-test-checklist.md` na aktualnym buildzie
- [ ] Zrob nowy build produkcyjny po finalnych poprawkach (jesli beda zmiany)

## Etap C - po weryfikacji Google Play

- [ ] Utworz appke w Play Console
- [ ] Podlacz `privacy.html` i `delete-account.html` w `App content`
- [ ] Uzupelnij Data Safety i Content rating
- [ ] Wrzuc `.aab` na `Internal testing`
- [ ] (jesli wymagane) uruchom `Closed testing` 12 testerow / 14 dni
- [ ] Przygotuj staged rollout produkcyjny

## Etap D - subskrypcje

- [ ] Utworz produkty subskrypcyjne Premium/Pro w Google Play
- [ ] Wpisz product IDs do `.env`
- [ ] Zweryfikuj mapowanie plan -> product ID w ustawieniach aplikacji
- [ ] Dopic faktyczny flow zakupu/restore (kolejny etap implementacyjny)
