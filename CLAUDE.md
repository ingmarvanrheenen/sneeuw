# Sneeuw Daddy

Snowboard-PWA (React 19 + Vite + TS + Tailwind v4 + Dexie, optioneel Supabase). Zie README.md, docs/ARCHITECTURE.md en docs/DESIGN.md.

## Commando's

- `npm run dev`: dev-server
- `npm test`: vitest
- `npm run test:db`: RLS/migratietests tegen lokale Postgres 16
- `npm run lint`: prettier-check + typecheck
- `npm run format`: prettier write
- `npm run build`: productie-build

Draai vóór elke commit `npm run lint && npm test && npm run build`.

## Tests (afspraak)

- **Alles wat je bouwt of wijzigt krijgt unit tests in dezelfde commit**: logica in `src/lib`, componenten en pagina's, en bugfixes (eerst een test die de bug laat zien, dan de fix).
- Tests staan in `src/test/*.test.ts(x)` (vitest + jsdom + fake-indexeddb). Componenten test je met Testing Library (`@testing-library/react`, `user-event`): wat de gebruiker ziet en doet, niet de implementatie.
- Supabase en andere netwerkcalls worden in unit tests gemockt (`vi.mock`); nooit echte API's of API-keys in tests.
- Database-regels (migraties, RLS) test je tegen een lokale Postgres 16 met `npm run test:db` (stub + scripts in `supabase/tests/`) voordat de migratie naar Supabase gaat. Nieuwe tabel of policy = nieuw scenario-script daar.

## Afspraken

- **Nooit emoji** in UI, content of toasts. Iconen komen uit `src/design/icons.tsx` (24-grid, stroke 1.8, square caps, miter joins). Nieuw icoon nodig? Daar toevoegen. `src/test/design.test.ts` bewaakt dit.
- Kleuren alleen via tokens (`bg-surface`, `text-muted`, `text-accent-text`, ...), nooit hardcoded, behalve de pistekleuren.
- Volg docs/DESIGN.md (Impeccable craft-floor): geen kickers/eyebrows boven titels (gebruik `subtitle`), geen sectienummers, geen mono-font, lijsten als `List`/`Row` in plaats van losse kaarten. UI in systeemfont, Archivo (`.display`) alleen voor titels en grote getallen.
- Alle UI-tekst in het Nederlands, chill en direct, met Engelse snowboardtermen waar dat normaal is.
- Data altijd via `src/lib/repo.ts` (`create`/`update`/`remove`/`setTrickStatus`), zodat de dirty-vlag en sync kloppen. Nooit hard deleten.
- XP/levels/badges worden afgeleid in `src/lib/progress.ts`, niet opgeslagen.
- iOS eerst: safe areas (`pt-safe`/`pb-safe`), inputs ≥ 16px, geen afhankelijkheid van install-prompts of vibratie.
- Nieuwe trick: voeg toe aan `src/content/tricks.ts` met een animatie uit `src/content/anims.ts`; de content-tests checken de rest.
- De Anthropic API-key leeft alleen als Supabase secret, nooit in de client.
