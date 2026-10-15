# Roadmap

| Fase | Indhold | Status |
|---|---|---|
| 0 Fundament | Supabase-projekt, repo, docs, CI, migrationsmappe | Færdig |
| 1 Kontaktdatabase | Skema, RLS, audit, seeds, TEST-data, tests med to brugere | Færdig: skema, RLS, audit, TEST-data, postnumre (PostNord, uændret) og tests 18/18. Login for begge ejere bekræftet 15. okt |
| 2 Brugerflade | Login, lister og filtre, detaljesider, dubletadvarsel, Opslagslister, Admin og Privat visning, bulk-import | Færdig: login, lister med filtre, detaljesider, Privat visning, Admin (opslagslister, tabeller og relationer, brugere), bulk-import via Claude, oprettelses- og redigeringsformularer med dubletadvarsel og sortering på for- og efternavn |
| 3 Aktiviteter | Aktiviteter, opfølgninger, intel | |
| 4 Leads | Rammeaftaler, projekter, opportunities | |
| 5 Branche-rating | Rating af entreprenører, arkitekter m.fl. | |
| 6 Visualisering | Relationsgraf, kort, pipeline | Påbegyndt: fanen Visualisering med netværk af virksomheder, personer, koncerner og private relationer. Kort og pipeline mangler |
| 7 Flere brugere | Invitation, onboarding af kollega, GDPR-værktøjer | |

Multiuser-modellen designes i fase 1, så fase 7 ikke kræver omstrukturering.
Data fra 1.x flyttes ikke automatisk. Eventuel import af rigtige data besluttes særskilt.
