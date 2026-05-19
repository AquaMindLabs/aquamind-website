# Checklista manualna - polskie znaki i wyszukiwanie

## Zakres ekranow
- [ ] Ustawienia
- [ ] Plan i subskrypcja
- [ ] Katalog roślin
- [ ] Katalog chorób ryb
- [ ] Katalog glonów
- [ ] Dodawanie akwarium

## Weryfikacja polskich znaków (UI)
- [ ] Teksty mają poprawne znaki: ą ć ę ł ń ó ś ź ż
- [ ] Teksty mają poprawne wielkie litery: Ą Ć Ę Ł Ń Ó Ś Ź Ż
- [ ] Brak „krzaków” typu `Ä`, `Ĺ`, `�` na ekranach

## Weryfikacja wyszukiwania (z i bez ogonków)
- [ ] Wpis `swiatlo` znajduje `Światło`
- [ ] Wpis `zelazo` znajduje `Żelazo`
- [ ] Wpis `rosliny` znajduje `Rośliny`
- [ ] Wpis z ogonkami i bez ogonków zwraca te same wyniki

## Regresja techniczna
- [ ] Slugi / ID / enumy / nazwy kolekcji nie zostały zmienione
- [ ] Product ID subskrypcji pozostały bez zmian
- [ ] Zapis i odczyt Firebase działa bez błędów
