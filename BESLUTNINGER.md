
## Koordinatopslag i baggrunden (2026-10-15)
Koordinater slås altid op automatisk. `src/lib/geoWorker.ts` finder aktive lokationer uden koordinater og slår dem op ét ad gangen (OSM-grænse: 1 pr. sekund). Det kører når appen åbnes og når en lokation gemmes. Ændres adresse, postnummer eller by, nulstilles koordinaterne og slås op igen. Importerede lokationer får koordinater første gang appen åbnes bagefter. Knappen "Find koordinater" på kortet bruges kun til manuel genkørsel.
