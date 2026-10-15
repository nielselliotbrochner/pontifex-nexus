# Testplan

Databasetests kører mod to testbrugere (A og B), automatisk i CI.

1. A's private rækker er usynlige for B.
2. Delte rækker (personer, virksomheder) ses af begge.
3. B kan ikke oprette private rækker, der peger på A's private rækker.
4. Redigering af delte rækker skriver til `audit_log`.
5. Sletning af delt række: kun skaberen og ejeren kan. Andre kan arkivere.
6. Dubletter afvises: samme LinkedIn-URL, samme CVR.
7. Ny bruger får `app_user` ved invitation. Selvtilmelding afvises.
8. Kun én primær aktuel tilknytning pr. person.
9. Kontor på tilknytning tilhører samme virksomhed.
10. Privat visning maskerer data og slår eksport fra (UI-test).
11. Typer genereret fra skemaet bygger uden fejl (`tsc`).

## Resultat 15. oktober 2026
18 af 18 automatiske kontroller bestået mod de to rigtige logins (`supabase/tests/rls_test.sql`). Testen fandt en fejl: almindelige brugere kunne ikke oprette eller redigere personer, fordi `private.normalize_linkedin` manglede EXECUTE-rettighed. Rettet i migration `20261015200000`.
Ikke testet endnu: sletteregler (skaber eller ejer), at ny bruger får inaktiv adgang ved invitation (set på de to rigtige brugere, men ikke som isoleret test), og UI-test af Privat visning.
