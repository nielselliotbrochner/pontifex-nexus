# PONTIFEX: specifikation til ny opbygning

Dato: 2. november 2026. Ejer: Niels Elliot Brøchner.
Formål: Alt, hvad der er besluttet og lært i opbygningen af PONTIFEX Nexus 2.0, samlet så en ny database og en ny frontend kan startes rent. Dokumentet er skrevet, så en ny chat kan bygge videre uden at kende den gamle samtale.

## 0. Sådan bruges dokumentet

1. Læg dokumentet i projektet "NIRAS: Værktøjer" (det er gjort), så alle nye chats i projektet kan læse det.
2. Start en ny chat i projektet og brug startprompten i afsnit 11.
3. Det gamle repo `nielselliotbrochner/pontifex-nexus` bevares som reference for kode, migrationer og import-script. Intet slettes.

## 1. Mål og faser

PONTIFEX er Niels' personlige CRM. Det er personligt og ligger uden for NIRAS' systemer. Det skal give overblik over personer og virksomheder, hvordan de hænger sammen, hvad der er talt om, og hvad der skal følges op.

| Fase | Indhold |
|---|---|
| 1 | Personer og virksomheder med tilknytninger, brancher, lokationer, ejerskab, kort og netværk |
| 2 | Aktiviteter (møder, opkald, mails, research, nyheder, noter) med deltagere, filer og opfølgninger |
| 3 | Projekter og pipeline (leads, tilbud, rammeaftaler, bid/no bid) |
| 4 | Rating af brancher, flere brugere og GDPR-værktøjer |

Systemet startes i små trin med rigtige data. Først kun personer og virksomheder, derefter aktiviteter og opfølgning.

## 2. Beslutninger der fastholdes fra Nexus 2.0

- Teknik: TypeScript, React, Vite, Vitest, ECharts til netværk, Leaflet til kort. Hosting på GitHub Pages via GitHub Actions. Database: Supabase (Postgres, Auth, Storage).
- Alt databasearbejde som versionerede migrationer fra dag ét.
- Delt lag (alle brugere): personer, virksomheder, tilknytninger, ejerskab, lokationer, opslagslister, aktiviteter. Privat lag (kun ejeren): kendskab til person, noter, relation til virksomhed, personrelationer, private aktiviteter.
- Kollegaer må se aktiviteter. Valgfrit "Privat (kun mig)" skjuler en aktivitet for andre.
- Sletning af delte rækker kræver skaberen. Andre arkiverer (`active = false`).
- Ingen dubletter: unik normaliseret LinkedIn-URL og unikt CVR. Advarsel ved samme navn eller e-mail.
- Login: e-mail og adgangskode (mindst 12 tegn) eller login-link. Selvtilmelding slået fra, adgang kun ved invitation. Begge logins `nebr@niras.dk` og `nielsbrochner@gmail.com` er ejere, hvert med eget privat lag.
- Admin-siden er kun for ejeren. Opslagslister udvides i Admin.
- "Privat visning" i headeren: slået til viser kendskab, noter og aktivitetstekst, slået fra skjuler dem (til skærmdeling).
- Navne gemmes som fornavn, mellemnavn og efternavn. Sortering på begge.
- E-mail gemmes med små bogstaver. LinkedIn-URL normaliseres.
- Bulk-import sker via Claude fra regneark med prøvekørsel først, ikke i frontend. Eksisterende data overskrives aldrig, kun tomme felter udfyldes.
- Geokodning skal altid ske automatisk i baggrunden (Nominatim fra browseren, ét opslag i sekundet). Findes adressen ikke, bruges postnummerets midte.
- Layout: 12 px grundskrift, kompakt. NIRAS-CVI: Heritage Red #BA1223, Deep Red #700B15, Sand #F2E2D5, Aptos og Aptos Serif, mørk tilstand.
- Sektor og primær branche er påkrævet på virksomheder, både ved oprettelse og redigering.
- Sprog i brugerfladen: dansk.

## 3. Nye beslutninger og krav fra denne samtale

### 3.1 Virksomhedshierarki og ejerskab

Erstatter de gamle grupper (`company_group`).

- Ejerskab er en liste pr. virksomhed: `company_ownership` med ejer, ejet, ejerandel i procent (ukendt tilladt), hovedejer ja/nej, direkte eller indirekte, kilde og dato for seneste tjek.
- Hovedejeren er træets forælder. Dybden er ubegrænset, og den øverste moder udledes ved at gå opad. Der skal være sikring mod kredsløb.
- Samme virksomhed kan eje i flere træer (Novo Holdings ejer Novo Nordisk og 25 procent af NREP).
- Virksomhedstyper: Selskab, Fond, Forening, Kapitalfond. Fonde og foreninger kan stå øverst.
- Mellemled kan springes over og oprettes senere. Relationen markeres "indirekte".
- Ejere med små andele og børsnoterede aktionærer registreres ikke, kun hovedejer og relevante ejere.
- Tre mærker i listerne: KONCERN (øverste moder), DATTER, ellers virksomhed uden tilknytning.
- Andre relationer end ejerskab (forvalter, partner, samarbejde) lægges i en separat relationstabel og bygges først, når der er et konkret behov.
- CVR-nummer er nøglen til danske virksomheder. DUNS og LEI kan tilføjes som valgfrie felter til udenlandske koncerner.
- Kilder til ejerskab: egne opslag og Proff/Virk. Erhvervsstyrelsens CVR-adgang (system-til-system) kræver ansøgning og er ikke undersøgt endnu. CVR har ikke et felt for datterselskab, så koncernbilledet afledes af registrerede ejere.
- Visning: et koncernkort (træ med led som rækker, ejer peger ned mod ejet, stiplet linje for antaget). Netværksvisning med ejerskabskanter. Aktiviteter og personer samles op gennem hele grenen under en koncern.

Testeksempler, som modellen er prøvet mod (struktur fra samtalen, ikke alt slået op i CVR):

| Koncern | Struktur |
|---|---|
| Aarsleff | Per Aarsleff Holding A/S, Per Aarsleff A/S, Wicotec Kirkebjerg og CG Jensen (antaget) |
| COWI | COWIfonden, COWI Holding A/S (antaget), COWI A/S, Arkitema, Architecture |
| MTH | Knud Højgaards Fond, Ejnar og Meta Thorsens Fond, EMTF Holding P/S, Nordea Invest/Funds (ingen andele oplyst, kilde Lex), MT Højgaard Holding, MT Højgaard A/S, Enemærke & Petersen (Raunstrup fusioneret 2021) |
| Realdania | Realdania (forening), Realdania By & Byg (datterselskab, andel ikke oplyst) |
| NREP | Novo Holdings ejer 25 procent siden 2020, øvrige 75 procent ikke oplyst. NREP er kapitalforvalter |
| Novo | Novo Nordisk Fonden ejer 100 procent af Novo Holdings A/S, som ejer A-aktierne i Novo Nordisk A/S |
| xpartners | XPartners (svensk platform, medarbejderejet med støtte fra Axcel), XPartners Denmark Holding ApS (CVR 44943298) ejer 100 procent af PLH Arkitekter A/S (CVR 27919502) siden 2. maj 2025 |

Et demo-koncernkort (HTML med ECharts og PDF) er lavet ud fra disse eksempler.

### 3.2 Personer, tilknytninger, titel og rang

- En person kan have flere tilknytninger til forskellige virksomheder. Hver tilknytning er en række med type (ansættelse, bestyrelse, advisory board, ejerskab, forening, selvstændig rådgiver), funktion, lokation, start- og slutdato, primær og note. Kun én aktiv tilknytning pr. person er primær.
- Titel er et fritekstfelt på tilknytningen. (Ændrer beslutningen i Nexus 2.0 om, at titel aldrig er fritekst.)
- Labels: Hver tilknytning kan have flere labels fra en fast rangliste. Personens rang er den højeste rang på en aktiv tilknytning, og den bruges til sortering og filtrering.
- Syv ranger: 1 Topleder, 2 Direktion, 3 Direktør/VP, 4 Chef, 5 Leder, 6 Specialist, 7 Øvrig. Bestyrelse er en selvstændig label uden for rangen, så en person kan være både Direktør og Bestyrelse.
- Rang 1 til 3 er beslutningstagere. De markeres med et mærke og kan filtreres på personlisten og virksomhedssiden.
- Historik gemmes som afsluttede tilknytninger.

### 3.3 Aktiviteter og opfølgninger

- Typer (udvidelig liste): møde, opkald, mail, research, nyhed, note. Research og nyheder er aktiviteter, så én kronologi dækker alt om en person eller virksomhed.
- Et møde har mange deltagere. Hver deltager gemmer den virksomhed, vedkommende repræsenterede på dagen. Aktiviteten kan også handle om personer og virksomheder, der ikke deltog.
- Filer (PDF m.m., op til 25 MB) i privat lagerbøtte, adgang følger aktivitetens synlighed, signerede links på 120 sekunder.
- Kronologi pr. person og virksomhed. Virksomhedens kronologi indeholder aktiviteter om virksomheden og møder, hvor en deltager repræsenterede den.
- Netværk: personer fra samme aktivitet forbindes. Aktiviteter med over 12 deltagere springes over.
- Opfølgninger: tekst, frist, ansvarlig, afsluttet-tidspunkt. Kan tildeles en aktiv kollega og skiftes bagefter. Private aktiviteter tildeles kun ejeren. Fane "Opfølgninger" med filter Mine og Alle, forfaldne markeret.
- Senere: eksport af kronologi.

### 3.4 LinkedIn

- Alle personer skal have et LinkedIn-link. Nye via importens LinkedIn-kolonne. Eksisterende uden link: Claude søger på nettet og foreslår links, som Niels godkender.
- Jobhistorik med start- og slutdato læses ikke af frontend, som ikke kan scrape LinkedIn. Claude kan læse en profil ad gangen i Niels' egen Chrome (Claude in Chrome), når Niels beder om det, og oprette tilknytninger med datoer. LinkedIn forbyder automatisk læsning, så det bruges kun til nøglepersoner i små portioner. Alternativ er at indsætte teksten fra afsnittet Erfaring i et felt, som Claude omsætter.
- LinkedIn-URL normaliseres uden at dekode procenttegn. Det kan give dubletter og bør rettes i ny version.

### 3.5 Mobil og app-ikon

- Fungerer på telefon: manifest og ikoner (hvidt P med seriffer på Heritage Red, 192, 512 og 180 px samt SVG), temafarve, responsiv layout med menu der kan rulles, større trykflader, 16 px i felter så iPhone ikke zoomer, tabeller der ruller i siden, formularer i én kolonne.
- Installeres på hjemmeskærmen som app med navnet Nexus.

### 3.6 Projekter og pipeline (forslag, ikke besluttet)

- `opportunity` (lead): virksomhed, titel, værdi, fase, sandsynlighed, forventet dato, ansvarlig, kilde, kobling til aktiviteter.
- `pipeline_stage` (udvidelig liste): Lead, Kvalificeret, PQ, Tilbud, Forhandling, Vundet, Tabt. Bid/no bid som beslutningspunkt før PQ eller tilbud.
- `project`: navn, bygherre, status, perioder, personer med roller.
- `framework` (rammeaftale): bygherre, periode, parter.
- Netværket får en ny nodetype for projekter og leads. Pipeline vises som tavle efter fase.

## 4. Datamodel til ny database

Mål: ét rent skema fra første migration, som samler alt ovenfor. Foreslået indhold:

Delt lag: `app_user`, `contact`, `company` (med type Selskab/Fond/Forening/Kapitalfond, CVR, valgfri DUNS og LEI), `company_location`, `contact_company` (med fritekst `title`), `contact_company_label` (flere labels pr. tilknytning), `company_ownership`, `company_branch`, `audit_log`, `activity`, `activity_participant`, `activity_subject`, `activity_company`, `activity_file`, `activity_followup`.
Opslagslister (code, name, sort_order, active, is_system): `level` (de syv ranger), `job_function`, `affiliation_type`, `acquaintance`, `branch` (træ), `sector`, `activity_type`, `company_type`, `pipeline_stage`, `person_link_type`, `postcode` (med region og kommune).
Privat lag: `contact_relation` (noter, kendskab), `company_relation`, `person_link`.
Fase 3: `opportunity`, `project`, `project_role`, `framework`.

Regler der håndhæves i databasen:
- Partielt unikt indeks: én primær aktiv tilknytning pr. person. Ét hovedkontor pr. virksomhed.
- Sammensat fremmednøgle (kontor, virksomhed) på tilknytningen.
- Unik normaliseret LinkedIn-URL og unikt CVR.
- Hovedejer: højst én pr. ejet virksomhed. Ingen kredsløb i ejerskab.
- Private rækker må kun pege på delte rækker. Tjek begge sider af hver reference.
- Børnetabeller til aktiviteter følger forælderens synlighed med exists-underforespørgsel.
- Trigger opretter `app_user` ved invitation, ingen selvtilmelding.
- Views er `security_invoker`. Hjælpefunktioner ligger i schema `private`.
- Auditlog på alle delte tabeller. Giv `authenticated` EXECUTE på funktioner brugt i generated columns.

Brancher (træ, to niveauer, flere pr. virksomhed, én primær): Bygherre (med underbrancher som Kommune), Arkitekt, Ingeniør, Advokat, Entreprenør (én samlet gren, flettet fra Totalentreprenør, Hovedentreprenør og Fagentreprenør), og de brancher der kommer til. Brancher manglede for FUJIFILM, Prognosecenteret, Modus+, Deewash, EMCON og Cushman & Wakefield | RED. Medico og Analyse er forslag til nye brancher.

## 5. Hvad genbruges fra det gamle repo

- Migrationerne er facit på regler og RLS. Skriv dem sammen til én ren startmigration med ændringerne i afsnit 3 i stedet for at køre alle trin.
- `scripts/import/prepare.py` og `private.import_batch` (bulk-import med prøvekørsel). Skal tilpasses nye kolonner (titel, labels, ejerskab, LinkedIn).
- `supabase/tests/rls_test.sql` (18 kontroller med to brugere).
- Frontend: `Picker` (søgbar rullemenu), `BranchSelect`, `geoWorker`, netværk, kort, aktivitetsformular med filupload, tidslinjer, opfølgninger, nav-ruter via query string, ikon og manifest.
- Dokumenter: `docs/BESLUTNINGER.md`, `DATAMODEL.md`, `ERFARINGER.md`, `IMPORT.md`, `TESTPLAN.md`.

## 6. Erfaringer der skal med

- Fremmednøgler omgår RLS: tjek begge sider.
- SECURITY DEFINER-funktioner i `public` kan kaldes via REST: læg dem i `private`.
- Slet kaster historik: arkivér, slet ikke.
- Migrationer i versionsstyring fra dag ét.
- Grupper og ejerskab uden kendt navn forekommer, så navn er valgfrit.
- Navneparsing: partikler (von, van, de, af) skal håndteres.
- Filupload: kopiér filerne fra `e.target.files` før `e.target.value` nulstilles, ellers tabes de.
- Programmatisk input i React-felter via browserværktøj udløser ikke state. Brug rigtig indtastning i test.
- Claude kan ikke køre destruktive SQL-sætninger (DELETE, DROP) via Supabase-værktøjet, også selv om du godkender i chatten. Kør dem i Supabase SQL Editor.
- Postnumre: DAWA og GeoNames er blokeret fra Claude-arbejdspladsen. PostNords fil fra 2020 (npm-pakken `dk-postals`) bruges, kommune er vejledende.
- Slå "leaked password protection" til i dashboardet (kræver Pro).
- Droppe sikkerhedskopi-schemaet `backup_20261007` i det gamle Kontaktregister-projekt, når det ikke bruges.
- GitHub Pages cache: vent på udrulning og brug `?x=N` til test.
- Supabase gratisplan: højst to aktive projekter, og inaktive projekter pauses. Nexus-projektet står på pause. Plan for projektplads, før et nyt projekt oprettes.

## 7. Importerede data der skal med

Rigtige data (27 personer og tilhørende virksomheder) ligger i det gamle Nexus-projekt `nsyimhnqldwxidhajfut`, som står på pause. Før projektet opgives, skal data eksporteres, så de kan indlæses i den nye database med import-scriptet. Kendte åbne punkter fra importerne:
- Den uforklarede ekstra TRUE-kolonne (kolonne 7) i regnearket. Ikke importeret.
- Anders Liu-Lindberg (implement.dk) står uden virksomhed.
- "København Kommune" er skrevet som i regnearket. Det officielle navn er Københavns Kommune.
- Noter er knyttet til ejerlogin nebr@niras.dk. Spørgsmålet om nebr eller gmail er ikke afklaret.

## 8. Åbne spørgsmål

1. Skal der bruges Erhvervsstyrelsens CVR-adgang til ejerforslag ved oprettelse? Kræver ansøgning.
2. Skal ejerskabet kunne vise flere ejere i netværket fra start (ja i forslaget), og skal "partner" og "forvalter" bygges nu eller senere?
3. Skal DUNS og LEI med fra start?
4. Pro-plan på Supabase, så projektet ikke pauses?
5. Skal det nye repo være offentligt (gratis Pages) eller privat (kræver betalt GitHub-plan for Pages)? Kun kode og publishable key må ligge i repoet.
6. Skal opfølgninger have påmindelser (e-mail eller notifikation)?
7. Navn og versionsnummer på det nye system.

## 9. Opstartsplan for den nye opbygning

1. Afklar projektplads på Supabase og opret nyt projekt (region eu-north-1).
2. Opret nyt repo. Kopiér docs og genbrugelig kode fra det gamle repo.
3. Skriv én startmigration med skema, RLS, auditlog og opslagslister efter afsnit 4. Kør rls_test mod to brugere.
4. Sæt login op for begge ejere, luk selvtilmelding.
5. Frontend: personer, virksomheder, tilknytninger med titel og labels, ejerskab, brancher, lokationer, kort og netværk. Mobil og ikon fra start.
6. Importer rigtige data i små partier med prøvekørsel.
7. Aktiviteter og opfølgninger.
8. Koncernkort og LinkedIn-historik for nøglepersoner.
9. Projekter og pipeline.

## 10. Hvad der ikke er afklaret om data

Hvor mange personer der i dag har LinkedIn-link kunne ikke tælles, fordi databasen står på pause.

## 11. Startprompt til ny chat

Kopiér dette ind i en ny chat i projektet "NIRAS: Værktøjer":

> Læs dokumentet PONTIFEX-specifikation i projektet. Vi bygger PONTIFEX forfra med nyt Supabase-projekt og nyt GitHub-repo efter afsnit 9. Start med trin 1 til 3: afklar Supabase-pladsen, og skriv derefter den samlede startmigration med skema, RLS og tests efter afsnit 3 og 4. Svar på dansk, BLUF, kort, ét beslutningsspørgsmål til sidst, ingen tankestreger. Commit-trailers: Co-Authored-By og Claude-Session som i det gamle repo. Det gamle repo `nielselliotbrochner/pontifex-nexus` er referencen.
