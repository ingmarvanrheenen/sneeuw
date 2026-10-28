# Architectuur

## Stack

- **Vite + React 19 + TypeScript**, Tailwind v4 voor styling (met eigen tokens).
- **PWA** via `vite-plugin-pwa` (Workbox): alles precached, weer en crew-media runtime-gecachet. `HashRouter` zodat het overal werkt (GitHub Pages, subpaden).
- **Dexie** (IndexedDB) als lokale database. De UI leest altijd lokaal (`useLiveQuery`), dus de app is direct en werkt offline.
- **Supabase** (optioneel) voor account, sync, storage, crews en de coach (Edge Function).
- **Open-Meteo** voor het weer (geen key nodig).
- **Claude** via de Anthropic SDK in de `coach` Edge Function.

## Data

Alles wat sync nodig heeft is een _record_ in één Dexie-tabel `records` (`src/lib/types.ts`):

| kind      | wat                                                                      |
| --------- | ------------------------------------------------------------------------ |
| `session` | een gelogde dag                                                          |
| `trick`   | jouw status per trick (wil/bezig/geland/beheerst), eerste landing, clips |
| `goal`    | doel, optioneel gekoppeld aan trick en/of trip                           |
| `trip`    | reis met paklijst                                                        |
| `gear`    | spullen (eigen/huur/wishlist)                                            |
| `media`   | metadata van foto/video; de blob zelf staat in tabel `blobs`             |

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

## Crew-awards (`src/lib/awards.ts`)

In de trip-recap: awards uit de met de crew gedeelde dagen van die trip (langst op de plank, trickmachine, eerste nieuwe trick, valkampioen, zat erop geplakt, zonnetje van de crew, zwartrijder, poedersnuiver, ibuprofen-award, elke dag erop). Afgeleid en niet opgeslagen, zoals XP. Minstens twee riders, gelijkspel wint samen, en als iedereen gelijk staat is er geen award.

Stemronde in `crew_trip_votes`: "Val van de trip" en "Held van de trip". Eén stem per persoon per categorie, alleen op een crewgenoot en niet op jezelf. Omzetten (alleen `candidate` is aan te passen) en intrekken mogen. De stand zie je pas als je zelf gestemd hebt. RLS-scenario's: `supabase/tests/crew_trip_votes.sh`.

## Trip-bingo (`src/lib/bingo.ts`)

Op de trippagina van een crew-trip. Iedereen heeft een eigen kaart van 4×4 vakjes uit `src/content/bingo.ts`. De kaart volgt uit trip + speler (seeded shuffle), dus elke telefoon ziet dezelfde kaart zonder dat hij opgeslagen wordt. Alleen de afgevinkte vakjes staan in `crew_trip_bingo`, met tijdstip. Wie bingo heeft (rij, kolom of diagonaal vol) en wie als eerste een lijn vol had, rekent `bingoStand()` uit. Iedereen vinkt alleen zijn eigen kaart af; tijdstippen zijn niet aan te passen. RLS-scenario's: `supabase/tests/crew_trip_bingo.sh`.

## S.N.O.W. (`src/lib/snow.ts`)

S.K.A.T.E., maar op de piste, binnen een crew. Wie aan de beurt is zet een trick uit de bijbel neer; landt hij hem, dan doet de rest hem na en wie mist krijgt een letter. Mist de zetter, dan gaat de beurt door. Bij S-N-O-W lig je eruit, en een gelande trick mag niet nog een keer.

- `snow_games` (crew, spelers in speelvolgorde) en `snow_moves` (volgnummer, zet of nadoen, speler, trick, geland). Alleen de zetten staan in de database; `snowState()` rekent de letters, de beurt en de winnaar uit. Zetten die niet passen tellen niet mee.
- Elke telefoon in de crew mag een poging invullen, maar alleen als volgende zet (`seq = snow_next_seq()`). Vullen twee telefoons dezelfde beurt in, dan botst de tweede op de primary key en laadt opnieuw (`SnowConflict`). Alleen de laatste zet kan ongedaan worden gemaakt.
- Online-first zoals crew-doelen: laatst bekende stand in kv, en het open potje ververst elke 5 seconden.
- RLS-scenario's: `supabase/tests/snow_games.sh`.

## Rider-profiel (skipas)

- Route `/rider/:id` (`ik` = jezelf, werkt ook zonder account). Je eigen pas rekent alles live uit je logboek (`useProgress` → `riderStats()` in `src/lib/rider.ts`); die van een crewgenoot komt uit `profiles` (laatst bekende in `kv: rider:<id>` voor offline).
- **Wat je crew ziet**: `profiles.data` (naam, stance, foto, motto, thuisresort, signature trick, bijnaam) en `profiles.stats` = `riderStats()`: XP, level, eerlijke stats, gelande trick-ids, badge-ids. Dat gaat mee met de bestaande profiel-sync; afgeleid, dus nooit uit de pas met je logboek.
- **Foto**: vierkant uitgesneden, 192 px jpeg als data-URL in je profiel (max ±60 KB; database-check op de profielgrootte). Geen Storage nodig, werkt offline en je crew ziet hem meteen.
- **Stickerboek**: je board met de moeilijkste gelande tricks als stickers (`boardStickers()`, vaste plekken per trick via `stickerSlot()`, de rest als "+N"), kleur = moeilijkheid als pistekleur. Daaronder per track één regel met de volgende sticker; tik voor alle stickers van die track, ook de lege plekken.
- **Bijnamen** (`nicknames`, migratie `20261029000000`): een crewgenoot stelt voor (max 3 open per persoon, niet dezelfde twee keer), alleen jij zet de status op ja/nee; bij ja komt hij in je profiel. 20 scenario's in `test:db`.
- Feed, leaderboard en trip-recap linken naar de skipas; de feed toont profielfoto's.

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

- **Wie krijgt wat** (`supabase/functions/push/handlers.ts`): een gedeelde dag (max 2 dagen oud) naar de rest van de crew; een afgevinkt crew-doel naar wie hem nog moet halen, of als iedereen hem heeft "Crew-doel gehaald" naar de hele crew; om 17:00 lokale tijd tijdens een trip "Log je dag" als je vandaag nog niks logde; om 18:00 het **pow-alarm** als er voor je eerstvolgende trip (bezig of binnen een week, met een resort uit de app) 15 cm of meer verse sneeuw voorspeld wordt, tijdens de trip of de twee dagen ervoor. De server checkt zelf of het jouw dag of jouw vinkje is.
- **Pow-alarm**: zelfde uurlijkse cron als de herinnering. De sneeuwverwachting komt van Open-Meteo (`daily=snowfall_sum`, op de middelste lifthoogte), één keer per resort per run. Coördinaten staan in `supabase/functions/push/resorts.ts`, een kopie van `src/content/resorts.ts` (de function kan niet bij `src/`); `src/test/pushResorts.test.ts` faalt als ze uit elkaar lopen. Dezelfde bui (trip + dag met de meeste sneeuw) meldt hij maar één keer.
- **Versleuteling** zonder library, alleen WebCrypto; getest tegen de testvector uit RFC 8291 (`src/test/webpush.test.ts`).
- **Abonnementen** alleen via `save_push_subscription()`: endpoint moet van een echte push-dienst zijn, dezelfde telefoon met een ander account gaat over naar dat account, max 10 per account. Uitloggen haalt het abonnement van die telefoon weg. Verlopen abonnementen (404/410) ruimt de function op.
- **VAPID-keys** staan alleen als Supabase secret (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`); de app haalt de publieke key op bij de function.
- iOS: alleen vanaf het beginscherm (iOS 16.4+), toestemming vragen kan alleen direct na een tik, en elke push moet een melding tonen.

## Coach Daddy

```
app ── buildContext() ──► samenvatting van je data (stance, level, tricks, laatste dagen, doelen, trip, gear, geheugen)
    ── POST /functions/v1/coach (JWT) ──► Edge Function
       { messages (evt. met foto), context,     ├─ checkt login + daglimiet (coach_usage)
         tricks: [{id, name}] }                 ├─ checkt input (protocol.ts): foto's, knoppen, limieten
                                                ├─ Claude Opus 5.5, effort low (medium bij een foto), streaming
                                                ├─ tools/systeemprompt gecachet, context vast in eerste bericht
                                                ├─ tool-loop: knoppen gaan als event naar de app (max 4 rondes)
                                                └─ server-side fallback bij een weigering
    ◄── NDJSON: {t:'text'} {t:'action'} {t:'error'} {t:'done'} ──
```

Gesprekken worden lokaal bewaard (laatste 30). De context wordt bij de start van een gesprek vastgezet, zodat de prompt-cache over het hele gesprek werkt.

**Knoppen** (`supabase/functions/coach/protocol.ts`, gedeeld door functie, app en tests). De coach heeft vier tools, allemaal `strict` (geforceerd tool-gebruik kan niet samen met thinking, dus `tool_choice: auto`): `zet_doel` (titel + trick uit de bijbel als `enum`), `toon_trick`, `oefenplan` (dagen met focus en oefeningen) en `onthoud`. Op de server doen ze niets: de functie checkt de input, stuurt een `action`-event naar de app en geeft Claude als resultaat dat de knop er staat. De rider beslist; alleen `onthoud` gaat direct het geheugen in. In een volgend bericht stuurt de app eerdere knoppen mee, en de functie maakt daar weer echte `tool_use` + `tool_result` van.

**Techniek-check**: kies een foto, of een video waarin je met een schuif het moment zoekt. De app tekent dat beeld verkleind (max 1024 px, JPEG) en stuurt het als base64 mee. Alleen de laatste twee foto's van een gesprek gaan mee naar de API; oudere worden een regel tekst. Te openen vanaf de coach, vanuit een clip (`/coach?media=<id>`) en vanuit een trick (`/coach?check=<trickId>`).

**Geheugen** (kv `coach:memory`, max 30, alleen op je toestel): feiten die de coach met `onthoud` opslaat. Zichtbaar en wisbaar onder "Wat de coach van je weet", en mee in de context vanaf het volgende gesprek.

De app leest ook nog gewone tekst als de functie (nog) de oude versie is.

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
- `freestyle.ts`: handgemaakte flat-tricks (ollie, nollie, shifty, frontside/backside 180, flat 360, nose/tail press, butters, revert). Bij een butter draait het board rond de tip die op de sneeuw drukt (de tip rijdt rechtdoor, het midden draait eromheen). Pose-to-pose per kanaal (`perform()`), zodat elk lichaamsdeel zijn eigen timing heeft; de sprong is een ballistische boog (piekhoogte g·T²/8 uit de luchttijd). Bij laden, pop en press kantelt het board onder je en blijft het bovenlijf rechtop (`upright`); de tip kan niet onder de sneeuw (`solve.ts` houdt het midden minstens op tiphoogte).
- `kicker.ts`: één kicker-profiel in meters voor het 3D-model én de beweging (plateau-aanloop, transition naar een lip van 26°, deck met afgeronde knuckle, landing van 30°, afgeronde runout, blauwe verflijnen). De rit is gesimuleerd: snelheid gaat eraf op de transition, de vlucht is een ballistische boog vanaf de lip tot de landing (±0,9 s, midden op de landing). Alle kicker-tricks (straight air, grabs met tweaks, 180/360/540, backflip) gebruiken dit; grab, spin en flip komen uit hun 2D-animatie, de uitleg ook (tijden omgezet). Bij een grab trek je je knieën tot je borst (`crouch` > 1) en zakt de schouder van je grijphand naar het board, zodat de hand het board echt pakt. Op de grond ligt het board als rechte lat op het oppervlak (`restOnSurface()`: in een holle bocht op neus en tail), in de lucht interpoleren we de kanteling langs de helling en volgt de pitch uit waar de neus wijst (switch landen klopt dus ook). Een flip krijgt extra pop en draait pas als je voorbij de knuckle bent. Tests controleren per frame dat geen lichaamsdeel of board-uiteinde door de kicker of de sneeuw gaat; knieën, ellebogen en handen rusten óp de sneeuw.
- `jib.ts`: box (met oprijramp) en rail in meters voor model én beweging. Box: je rijdt hem op zonder ollie; rail: een ollie met een boog die net over het begin komt en dalend op de rail landt. Glijden, kleine pop eraf, vallen, landen. Boardslide = board dwars, borst in de rijrichting. Op een rail kleine balanscorrecties op je edges. De vier jib-tricks lezen box/rail en dwars uit hun 2D-animatie.
- `freeride.ts`: bulten, bomen en poeder, met één vorm voor terrein én beweging. Bulten: een hoogteveld in versprongen rijen; je wisselt van edge op de top (knieën absorberen) en maakt je bocht af in het dal, het board ligt als stijve lat op het oppervlak (`Motion.surface`). Bomen: in elke bocht een stam aan de binnenkant waar je omheen rijdt, bos aan de randen, tree wells; standaard van boven bekeken. Poeder: 30 cm verse sneeuw boven de harde ondergrond (`Motion.powder`); gewicht achter, in de bocht zakt het board weg, ertussen steekt de neus erboven uit, met stuifsneeuw bij elke bocht. Tests checken dat je nergens door een bult, stam of de takken gaat.
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
