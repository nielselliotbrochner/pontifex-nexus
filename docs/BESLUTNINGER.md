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
- Branche: todelt træ (fx Entreprenør > Totalentreprenør), flere pr. virksomhed, én primær. Bygherre deles yderligere. Arkitekt, Ingeniør, Advokat som egne grene.
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
