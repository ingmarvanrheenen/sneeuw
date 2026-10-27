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

Een dag opslaan gaat altijd via `saveSession()` in `src/lib/sessions.ts`, zowel vanuit het snelle loggen op Home (`QuickLog`) als vanuit het volledige log-scherm. `smartDraft()` vult een nieuwe dag voor: plek van je lopende trip of van je vorige dag (max. 21 dagen terug), je gebruikelijke uren en de crew waarmee je de vorige keer deelde.

XP, levels, badges en stats worden **afgeleid** uit de records (`src/lib/progress.ts`), nooit opgeslagen. Ze kunnen dus niet uit sync raken.

## Sync (`src/lib/sync.ts`)

1. Elke lokale wijziging zet `dirty = 1` en plant een sync.
2. **Push**: nieuwe media eerst uploaden naar Storage (`media/<userId>/<id>.<ext>`), dan records upserten in `public.records` (data als jsonb).
3. **Pull**: alles van jezelf met `updated_at > cursor` ophalen. Een remote versie wint als het lokale record schoon is, of als de remote `client_updated_at` nieuwer is (last-write-wins).
4. Het profiel gaat naar `public.profiles`, inclusief stats voor het crew-leaderboard.

De sync draait bij het opstarten, bij online komen, bij terugkeren naar de app, na wijzigingen (gedebounced) en elke 5 minuten. Zonder login of backend doet hij niets en blijft alles lokaal.

Bij inloggen worden lokale records zonder eigenaar "geclaimd". Uitloggen wist de lokale database (de data staat in de cloud).

### Media

Foto's worden op het toestel verkleind naar max 2048 px (JPEG). Video's gaan door `src/lib/videoCompress.ts` (Mediabunny + WebCodecs): 720p H.264, max 30 fps, AAC-geluid ongewijzigd mee. Een clip van 25 MB wordt zo ~2 MB. Kan de browser niet encoderen, of levert het niks op, dan blijft het origineel. Opgeslagen en geüpload wordt max 50 MB per clip; originelen tot 600 MB worden eerst verkleind. De module laadt pas bij de eerste video en staat in de offline-cache.

## Crew

- `crews` + `crew_members`; aanmaken en joinen via de RPC's `create_crew` / `join_crew` (6-tekens invite-code).
- Een record met `crew_id` is leesbaar voor crewleden (RLS). Media volgt de zichtbaarheid van de dag waar het bij hoort.
- Storage-policy: je leest je eigen map, plus bestanden die aan een met jouw crew gedeeld media-record hangen.
- `reactions` voor reacties op posts; `crew_members_with_stats` levert het leaderboard.
- **Crew-trip**: een trip met `crewId` is leesbaar voor de crew (gewone records-RLS). De **groepslijst** staat in `crew_trip_items` (migratie `20261027000000`): iedereen in de crew mag toevoegen, afvinken en zichzelf claimen ("ik neem 'm mee"); claimen voor een ander kan niet (trigger), verwijderen kan wie het toevoegde of de trip-eigenaar, en `crew_id`/`trip_id` liggen vast (kolomrechten). Toevoegen kan pas als de trip gesynct is (`is_crew_trip()` checkt het record). Online-first met de laatst bekende lijst lokaal in `kv`.
- **Crew-doelen** (migratie `20261027010000`): `crew_trip_goals` (titel, wie het aanmaakte) plus `crew_trip_goal_done` (één rij per persoon die het haalde). Iedereen vinkt alleen voor zichzelf af (RLS: `user_id = auth.uid()`), de titel wijzigen kan alleen de maker, verwijderen de maker of de trip-eigenaar. Wie als laatste van de crew afvinkt, krijgt het feestje.
- **Trip-recap**: geen eigen tabel. `tripDays()` haalt de met de crew gedeelde dagen (`records` kind `session` met die `crewId`) binnen de tripperiode op, `computeRecap()` (puur) telt per persoon dagen, uren, valpartijen en tricks op. De laatste recap staat in `kv` voor offline.
- **Online-first lijsten** (groepslijst, doelen): een lege cache wordt online genegeerd (spinner tot de server antwoordt), en een refresh die liep terwijl jij iets wijzigde, wordt weggegooid zodat hij je net gezette vinkje niet terugdraait.
- Je crewlijst staat ook lokaal (`kv: crews`), zodat je zonder bereik een dag met je crew kunt delen. De feed ververst stil bij terugkomen, weer online en elke minuut.

## Push-meldingen

```
app ── enablePush() ──► toestemming (na een tik) ─► pushManager.subscribe(VAPID-key van GET /push)
    ── rpc save_push_subscription ──► push_subscriptions (per telefoon, met voorkeuren en tijdzone)
sync ── na een gedeelde dag ──► POST /push {event:'day', id}  ┐
CrewGoals ── na afvinken ──► POST /push {event:'goal', id}    ├─► Edge Function `push` (service role)
pg_cron ── elk uur ──► POST /push {task:'reminder'}           ┘     ├─ handlers.ts: wie krijgt wat (getest)
                                                                    ├─ push_log: elke melding maar één keer
                                                                    └─ webpush.ts: RFC 8291/8292 met WebCrypto
service worker (public/push-sw.js) ── toont de melding, tik opent de juiste pagina
```

- **Wie krijgt wat** (`supabase/functions/push/handlers.ts`): een gedeelde dag (max 2 dagen oud) naar de rest van de crew; een afgevinkt crew-doel naar wie hem nog moet halen, of als iedereen hem heeft "Crew-doel gehaald" naar de hele crew; om 17:00 lokale tijd tijdens een trip "Log je dag" als je vandaag nog niks logde. De server checkt zelf of het jouw dag of jouw vinkje is.
- **Versleuteling** zonder library, alleen WebCrypto; getest tegen de testvector uit RFC 8291 (`src/test/webpush.test.ts`).
- **Abonnementen** alleen via `save_push_subscription()`: endpoint moet van een echte push-dienst zijn, dezelfde telefoon met een ander account gaat over naar dat account, max 10 per account. Uitloggen haalt het abonnement van die telefoon weg. Verlopen abonnementen (404/410) ruimt de function op.
- **VAPID-keys** staan alleen als Supabase secret (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`); de app haalt de publieke key op bij de function.
- iOS: alleen vanaf het beginscherm (iOS 16.4+), toestemming vragen kan alleen direct na een tik, en elke push moet een melding tonen.

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

**Dagreview** (`mode: 'review'`): op verzoek vanuit het dagdetail. De app stuurt de rider-context, de dag als tekst (`dayText()`) en de trick-ids die je nog niet geland hebt. De functie vraagt één antwoord met structured outputs (`output_config.format`, JSON-schema): `goed`, `focus`, `oefening`, `trickId` (alleen uit de meegestuurde lijst, als `enum`) en `veiligheid`. De review wordt bij de dag bewaard (`session.review`) en synct mee. De voorgestelde trick zet je met één tik als doel. Een review telt als één coach-bericht voor de daglimiet.

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
- `interp.ts`: monotone kubische spline (Fritsch-Carlson) tussen keyframes. Snelheid loopt door over dichte fysica-keys heen zonder te haperen, maar schiet nooit voorbij een stilstand. Armhoudingen gaan vloeiend in elkaar over.
- `spray.ts`: sneeuwdeeltjes op echte tijd, aangestuurd door hoe hard het board zijwaarts slipt (en door edge × snelheid bij carven).
- `rig.ts` (rider) en `stage.ts` (helling, corduroy, spoor, obstakels, licht, camera's) met three.js. Kleuren komen uit de CSS-tokens en volgen licht/donker.

## Tests

`npm test`:

- content-integriteit: unieke ids, voorkennis bestaat, geen cirkels in de skill tree, complete uitleg, geldige animaties die naar eindige coördinaten renderen;
- XP, levels en badges;
- lokale opslag (dirty-vlag, soft delete, eerste landing);
- 3D: elke beweging lost op naar eindige posities, voeten blijven in de bindingen, en de fysica klopt (traverse op de heel edge, carven kantelt meer dan slippen);
- design-regel: geen emoji in `src/`.
