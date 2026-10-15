# PONTIFEX Nexus 2.0

Personligt CRM for Niels Brøchner. Efterfølger til PONTIFEX 1.x (repo `kontaktregister`).

Nexus starter som kontaktdatabase (personer, virksomheder og hjælpetabeller) og bygges ud med aktiviteter, leads, rating af brancher, visualiseringer og flere brugere.

## Teknik
- Frontend: TypeScript, React, Vite (gratis og open source). Hosting på GitHub Pages via GitHub Actions.
- Database: Supabase (Postgres, Auth, Storage), projekt "PONTIFEX Nexus", eu-north-1.
- Typer genereres fra databaseskemaet. Tests: Vitest og Playwright. Grafer: ECharts. Kort: Leaflet.

## Mapper
- `docs/` beslutninger, datamodel, erfaringer, roadmap og testplan. Start med `docs/BESLUTNINGER.md`.
- `data/seeds/` startdata til opslagslister.
- `supabase/migrations/` al databaseændring som versionerede SQL-filer. Intet ændres direkte i dashboardet.
- `src/` frontend.

## Kom i gang
```
npm install
npm run dev
```
