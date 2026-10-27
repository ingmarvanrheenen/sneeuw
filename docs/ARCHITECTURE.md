# Architectuur

## Stack

- **Vite + React 19 + TypeScript**, Tailwind v4 voor styling (met eigen tokens).
- **PWA** via `vite-plugin-pwa` (Workbox): alles precached, weer en crew-media runtime-gecachet. `HashRouter` zodat het overal werkt (GitHub Pages, subpaden).
- **Dexie** (IndexedDB) als lokale database. De UI leest altijd lokaal (`useLiveQuery`), dus de app is direct en werkt offline.
- **Supabase** (optioneel) voor account, sync, storage, crews en de coach (Edge Function).
- **Open-Meteo** voor het weer (geen key nodig).
- **Claude** via de Anthropic SDK in de `coach` Edge Function.

## Data

Alles wat sync nodig heeft is een *record* in één Dexie-tabel `records` (`src/lib/types.ts`):

| kind | wat |
| --- | --- |
| `session` | een gelogde dag |
| `trick` | jouw status per trick (wil/bezig/geland/beheerst), eerste landing, clips |
| `goal` | doel, optioneel gekoppeld aan trick en/of trip |
| `trip` | reis met paklijst |
| `gear` | spullen (eigen/huur/wishlist) |
| `media` | metadata van foto/video; de blob zelf staat in tabel `blobs` |

Elk record heeft `id` (uuid), `userId`, `createdAt`, `updatedAt`, `deleted` (soft delete), `dirty` (nog niet gesynct) en optioneel `crewId` (gedeeld met die crew).

Profiel, instellingen, quiz-scores en gecachet weer staan in de `kv`-tabel. Thema/geluid staan in `localStorage` zodat ze vóór de eerste render beschikbaar zijn.

XP, levels, badges en stats worden **afgeleid** uit de records (`src/lib/progress.ts`), nooit opgeslagen. Ze kunnen dus niet uit sync raken.

## Sync (`src/lib/sync.ts`)

1. Elke lokale wijziging zet `dirty = 1` en plant een sync.
2. **Push**: nieuwe media eerst uploaden naar Storage (`media/<userId>/<id>.<ext>`), dan records upserten in `public.records` (data als jsonb).
3. **Pull**: alles van jezelf met `updated_at > cursor` ophalen. Een remote versie wint als het lokale record schoon is, of als de remote `client_updated_at` nieuwer is (last-write-wins).
4. Het profiel gaat naar `public.profiles`, inclusief stats voor het crew-leaderboard.

De sync draait bij het opstarten, bij online komen, bij terugkeren naar de app, na wijzigingen (gedebounced) en elke 5 minuten. Zonder login of backend doet hij niets en blijft alles lokaal.

Bij inloggen worden lokale records zonder eigenaar "geclaimd". Uitloggen wist de lokale database (de data staat in de cloud).

## Crew

- `crews` + `crew_members`; aanmaken en joinen via de RPC's `create_crew` / `join_crew` (6-tekens invite-code).
- Een record met `crew_id` is leesbaar voor crewleden (RLS). Media volgt de zichtbaarheid van de dag waar het bij hoort.
- Storage-policy: je leest je eigen map, plus bestanden die aan een met jouw crew gedeeld media-record hangen.
- `reactions` voor reacties op posts; `crew_members_with_stats` levert het leaderboard.

## Coach Daddy

```
app ── buildContext() ──► samenvatting van je data (stance, level, tricks, laatste dagen, doelen, trip, gear)
    ── POST /functions/v1/coach (JWT) ──► Edge Function
                                            ├─ checkt login + daglimiet (coach_usage)
                                            ├─ Claude Opus 5.5, effort low, streaming
                                            ├─ systeemprompt gecachet, context vast in eerste bericht
                                            └─ server-side fallback bij een weigering
    ◄── tekst-stream ──
```

Gesprekken worden lokaal bewaard (laatste 30). De context wordt bij de start van een gesprek vastgezet, zodat de prompt-cache over het hele gesprek werkt.

## Animaties (`src/anim`)

- Een animatie is een lijst keyframes (`t` van 0 tot 1) plus stappen die synchroon meelopen.
- **Zijaanzicht**: de pose wordt in een 3D-assenstelsel van het board opgebouwd (benen, romp, armen, hoofd) en daarna gedraaid met pitch (`flip`) en yaw (`spin`) en orthografisch geprojecteerd. Daardoor kloppen spins, presses, grabs en flips vanzelf.
- **Bovenaanzicht**: voor bochten, sideslips en falling leaf, met heel- en toe-edge in kleur en een spoor (breed voor slippen, dun voor carven).
- Builders in `src/content/anims.ts` (`ollie()`, `kicker({ grab, spin, flip })`, `slide()`, `turns()`, ...) maken nieuwe tricks toevoegen een kwestie van één regel.

## 3D-animaties (`src/anim3d`)

- `types.ts`: keyframes in het hellingsassenstelsel (x dwars, z het dal in, y omhoog) met `heading`, `edge`, `crouch`, `lean`, `twist`, `look`, armen, grabs, vallen en een losse achtervoet.
- `solve.ts`: bouwt het lichaam in board-coördinaten en lost benen en armen op met two-bone IK, zodat de voeten in de bindingen blijven. Kantelen op de edge neemt het lichaam mee; angulatie houdt het bovenlijf rechter dan het board.
- `builders.ts`: `fromPath()` leidt uit een rijbaan de edge af met echte fysica (de sneeuw moet bochtkracht plus zwaartekracht langs de helling leveren, kanteling = atan(zijwaartse kracht / g·cos θ)), plus schouders die de bocht in leiden en een blik naar de rijrichting. `drive()` rijdt segmenten (richting, snelheid, board-hoek), `turns()` maakt gekoppelde bochten in vijf stijlen van slippen tot eurocarve.
- `motions.ts`: handgemaakte bewegingen voor basis, liften, bochten en carven, opgebouwd volgens de standaard lesmethode. Andere tricks worden met `fromSide()`/`fromTop()` uit hun 2D-animatie omgezet.
- `rig.ts` (rider) en `stage.ts` (helling, corduroy, spoor, obstakels, licht, camera's) met three.js. Kleuren komen uit de CSS-tokens en volgen licht/donker.

## Tests

`npm test`:

- content-integriteit: unieke ids, voorkennis bestaat, geen cirkels in de skill tree, complete uitleg, geldige animaties die naar eindige coördinaten renderen;
- XP, levels en badges;
- lokale opslag (dirty-vlag, soft delete, eerste landing);
- 3D: elke beweging lost op naar eindige posities, voeten blijven in de bindingen, en de fysica klopt (traverse op de heel edge, carven kantelt meer dan slippen);
- design-regel: geen emoji in `src/`.
