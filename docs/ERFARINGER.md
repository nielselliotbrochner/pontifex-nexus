# Erfaringer fra PONTIFEX 1.x

- **Fremmednøgler omgår RLS.** Policies der kun tjekker forældersiden, lader en bruger pege på en anden brugers række. Tjek begge sider.
- **SECURITY DEFINER-funktioner i `public` kan kaldes via REST.** Læg hjælpefunktioner i et ikke-eksponeret schema.
- **Ingen automatisk `app_user`.** Opret den med trigger på `auth.users`, og luk selvtilmelding.
- **Slet kaster historik.** Virksomheder og personer skal arkiveres (`active`), ikke slettes. Cascade sletter tilknytninger og noter.
- **Migrationer skal i versionsstyring fra dag ét.** I 1.x blev senere trin kørt direkte, og historikken er ufuldstændig.
- **Titler som fritekst giver ikke sortering.** Brug opslagslister.
- **Én kategori og én adresse pr. virksomhed er for snævert.** Brug træ med flere brancher og en lokalitetstabel.
- **Grupper uden kendt navn forekommer.** Navn skal være valgfrit.
- **Moden stage kan overstyres.** Gem beregnet stage og en override.
- **Navneparsing:** partikler (von, van, de, af) skal håndteres, ellers splittes efternavne forkert.
- **PDF-tekst med pdf.js:** læs tekstobjekter i rækkefølge og saml linjer efter y-position.
- **Sikkerhedskopi-schema med persondata** (`backup_20261007` i 1.x) bør droppes, når det ikke bruges. Husk at gøre det.
- **Beskyttelse mod læste adgangskoder:** slå "leaked password protection" til i dashboardet. Det kan ikke ændres via SQL.
- **cvrapi.dk blokerer robotter.** Hent CVR-data manuelt eller via officielt API.
