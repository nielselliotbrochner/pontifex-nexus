# Bulk-import fra regneark

Importen foregår her i Claude og kræver intet importmodul i frontend. Du sender regnearket, Claude kører forløbet.

## Sådan gør du
1. Udfyld `docs/import_skabelon.xlsx` (arkene Virksomheder og Personer) eller send dit eget regneark. Claude mapper kolonnerne.
2. Send filen til Claude og skriv »importér«.
3. Claude kører en prøvekørsel og viser resultatet: hvor mange rækker der oprettes, matches, afventer afklaring (review) eller fejler, med begrundelse pr. række.
4. Du retter regnearket eller svarer på review-rækkerne. Claude kører derefter importen rigtigt.

## Hvad der sker
- Virksomheder importeres før personer, så personer kan henvise til dem.
- Match af virksomhed: CVR, ellers navn. Match af person: LinkedIn, derefter e-mail.
- Findes posten allerede, udfyldes kun tomme felter. Intet overskrives.
- Samme navn uden LinkedIn eller e-mail giver `review` og oprettes ikke, medmindre kolonnen Force er ja.
- Værdier til Niveau, Funktion, Sektor, Tilknytning, Kendskab og Koncernrolle skal findes i opslagslisterne (Admin). Ukendte værdier giver en fejl på rækken. Tilføj værdien i Admin, eller bed Claude om at rette regnearket.
- Kendskab, Kendt siden, Ingen invitation og Noter gemmes i det private lag for ejeren, der kører importen.
- Hver række behandles for sig. En fejl i én række stopper ikke de andre.

## Teknisk forløb
1. `python3 scripts/import/prepare.py FIL.xlsx --batch NAVN` laver SQL-filer med rækker til `public.import_row`.
2. Claude kører filerne via Supabase og derefter `select * from private.import_batch('NAVN', '<ejer-uuid>', true)` (true = prøvekørsel, alt rulles tilbage).
3. Når rapporten er ren, køres den samme med `false`.
4. `import_row` beholdes som log over, hvad der blev importeret (status og besked pr. række).

Funktionerne ligger i migration `20261015230000_bulk_import.sql`. Kun databasens ejer-rolle (Claude via Supabase) kan køre dem. Appens brugere kan ikke.
