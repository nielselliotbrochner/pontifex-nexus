# Beslutninger

Alle beslutninger er truffet af Niels i dialogen om Nexus (oktober 2026). Ændres en beslutning, tilføjes en dateret linje nederst.

## Navn og versionering
- Systemet hedder PONTIFEX. Nuværende system er 1.x, det nye er **PONTIFEX Nexus 2.0**.
- Nexus bygges fra bunden i nyt Supabase-projekt og nyt GitHub-repo. 1.x kører videre og arkiveres, når Nexus har overtaget.

## Brugere og adgang
- Flere brugere på sigt. Næste bruger er en kollega, som ikke må se Niels' private data.
- Adgang gives ved en række i `app_user`. Tilmelding er lukket, kun invitation.
- Delt lag (alle brugere læser og redigerer): personer, virksomheder, tilknytninger, grupper, kolleger, opslagslister.
- Privat lag (kun ejer): relation til person, relation til virksomhed, typologi-scores, intel, opfølgning, labels, aktiviteter, vedhæftninger, projekter, rammeaftaler.
- E-mail og telefon er delte felter. Ingen har direkte numre.
- Sletning af delte rækker kræver den, der oprettede dem. Andre arkiverer (`active = false`).
- Ingen dubletter: unikke indekser på normaliseret LinkedIn-URL og CVR, advarsel ved navn og e-mail.

- Hovedlogin til private data er `nebr@niras.dk`. Et andet login (`nielsbrochner@gmail.com`) er også ejer, men har sit eget private lag. Tabt adgang ved fratrædelse fra NIRAS er en kendt risiko. Flytning af private data mellem logins kræver en funktion (fase 7).
- Login: e-mail og adgangskode (mindst 12 tegn) eller login-link. Selvtilmelding er slået fra i Supabase. Lækkede-adgangskoder-beskyttelse kræver Pro-plan og er ikke slået til.

## Personer og tilknytninger
- Én primær aktuel tilknytning pr. person (partielt unikt indeks), flere sekundære (bestyrelse, advisory board m.m.).
- Tilknytningstype hentes fra en udvidelig tabel (fx Ansættelse, Bestyrelse, Advisory board).
- Titel er aldrig fritekst. Tre udvidelige opslagslister:
  - **Niveau** (på tilknytningen): 1 Ejer/topledelse, 2 Direktion, 3 Chef, 4 Leder, 5 Senior specialist, 6 Medarbejder.
  - **Funktion** (på tilknytningen): Ledelse, Projekt og udførelse, Udvikling, Tilbud og bid, Teknik og rådgivning, Indkøb og bygherre, Andet.
  - **Kendskab** (privat, i `contact_relation`): 1 Kender af, 2 Mødt, 3 Kender, 4 Kender godt, 5 Tæt relation.
- Kolleger bruger samme lister.
- Gamle titler fra 1.x (fx "Formand", "PD") udgår, hvis de ikke findes i de nye lister. Der gemmes ingen titeltekst.
- Data fra 1.x flyttes ikke med. Nexus starter med nye TEST-data (10 virksomheder, 10 personer, alle med TEST foran navnet). Rigtige data indlæses senere efter særskilt beslutning.

## Virksomheder
- Branche: todelt træ (fx Bygherre > Kommune), flere pr. virksomhed, én primær. Bygherre deles yderligere. Arkitekt, Ingeniør, Advokat som egne grene.
- Sektor er en separat akse: Offentlig, Privat, Almennyttig.
- Alle lister kan udvides i "Opslagslister".
- Lokaliteter: tabellen `company_location` (navn, type hovedkontor/kontor/andet, adresse, postnummer, by, land, lat/lng, aktiv). Ét hovedkontor pr. virksomhed.
- Region og kommune afledes af postnummer via opslagstabel. Filter på region (Hovedstaden m.fl.) på både virksomheder og personer.
- En person har ingen adresse. Personens sted afledes af primær tilknytnings kontor, ellers virksomhedens hovedkontor, markeret "antaget".
- Virksomheder deles ikke op i regioner. AART er én virksomhed.

## Grupper
- Delte grupper med valgfrit navn (ukendt navn tilladt, vises "Ikke navngivet: A + B").
- Rolle pr. medlem: Medlem, Moderselskab, Datterselskab, Søsterselskab, Joint venture, Ukendt.
- Højst ét moderselskab pr. gruppe. `parent_company_id` droppes.

## Relationer og visualisering
- Personrelationer (kun professionelle): kollega, tidligere kollega, rapporterer til, samarbejdspartner, mentor.
- Person-projekt via roller. Graf med ECharts, kort med Leaflet.

## Admin og privatliv
- Admin-menu: Opslagslister, Find koordinater, **Privat visning**.
- Privat visning viser initialer, skjuler telefon, e-mail, LinkedIn, noter, intel og aktivitetsnoter, og slår eksport og prompt-knapper fra. Gemmes pr. enhed, genvej på tastatur, slår sig til efter ca. 5 minutters inaktivitet, hurtigknap i headeren.
- Privat visning garanterer ikke GDPR-overholdelse. Afklar med NIRAS' DPO.
- Senere: slet person, eksportér person, audit-log-visning.

## Teknik
- TypeScript, React, Vite. Typer genereres fra skemaet.
- Migrationer i `supabase/migrations` fra dag ét. Hjælpefunktioner i ikke-eksponeret schema `private`.
- Kolleger er personer, hvis primære tilknytning er en virksomhed markeret `is_own`. Der er ingen separat medarbejdertabel.
- Personrelationer (`person_link`) er private, da mentor og samarbejde er personlige vurderinger.
- Lokalitetstype er et flag `is_hq` (ét hovedkontor pr. virksomhed) og ikke en liste.

## Hosting
- Supabase-organisation: DSGN (eneste organisation). Tjek om DSGN tilhører NIRAS, før kollegaer inviteres, da medlemmer af organisationen kan se databasen.
- Repoet er offentligt (gratis Pages). Kun kode og publishable key ligger i repoet, aldrig data.

- Postnumre: PostNords værdier bruges uændret (15. okt). Fejl i kommune rettes senere mod officiel kilde.
- Admin-siden er kun for ejeren (menuen skjules, og databasen afviser alligevel). Her tilføjes værdier til opslagslister, skemaet vises med alle tabeller og relationer, og brugere aktiveres.
- Bulk-import sker via Claude fra regneark, ikke i frontend (se docs/IMPORT.md). Prøvekørsel først, eksisterende data overskrives aldrig.
- Privat visning kan slås fra i menuen, fx ved skærmdeling. Den skjuler kendskab, noter og modenhed i brugerfladen.
- Navne gemmes som fornavn, mellemnavn og efternavn. Visning er fuldt navn. Personlisten kan sorteres på fornavn eller efternavn.
- Formularer: LinkedIn og CVR må ikke dubleres (blokeres). Samme e-mail eller samme navn giver en advarsel, og man kan oprette alligevel.
- Kort: Leaflet med OpenStreetMap-fliser. Koordinater hentes i browseren fra OpenStreetMap (Nominatim, ét opslag i sekundet), da DAWA er lukket (410). Findes adressen ikke, bruges postnummerets midte.

## Aktiviteter (2026-10-15)
- Research, nyheder og noter er aktiviteter af en bestemt type, så én kronologi dækker alt om en person eller virksomhed. Typerne ligger i opslagslisten Aktivitetstype, som ejeren udvider i Admin.
- Aktiviteter er i det delte lag: alle medlemmer kan se og redigere dem. Valgfrit »Privat (kun mig)« gør en aktivitet usynlig for andre.
- Et møde har mange deltagere (`activity_participant`). Hver deltager gemmer den virksomhed, vedkommende repræsenterede på dagen, så historikken er rigtig, selv om personen skifter job.
- Aktiviteten kan også handle om personer (`activity_subject`) og virksomheder (`activity_company`) uden at de deltog, fx research eller en nyhed.
- Filer (PDF m.m., op til 25 MB) ligger i privat lagerbøtte `activity-files` med sti `<aktivitet>/<fil>`. Adgang følger aktivitetens synlighed. Filer åbnes via kortlivede signerede links.
- Aktivitetsteksten skjules, når Privat visning er slået fra.
- Kronologi pr. person og virksomhed vises på deres sider. Virksomhedens kronologi indeholder aktiviteter om virksomheden og møder, hvor en deltager repræsenterede den.
- Netværk: personer, der har været med i samme aktivitet, forbindes med en rød linje. Linjen bliver tykkere ved flere fælles aktiviteter og viser titler og datoer, når man holder musen over. Aktiviteter med mere end 12 deltagere springes over for at undgå et filttæppe. Kan slås fra med »Fælles aktiviteter«.
- Branche: Entreprenør er én branche uden underbrancher (Totalentreprenør, Hovedentreprenør og Fagentreprenør er flettet ind, 15. okt 2026). Importfiler bruger Entreprenør.
