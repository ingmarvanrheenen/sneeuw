# Architectuur

## Stack

- **Vite + React 19 + TypeScript**, Tailwind v4 voor styling (met eigen tokens).
- **PWA** via `vite-plugin-pwa` (Workbox): alles precached, weer en crew-media runtime-gecachet. `HashRouter` zodat het overal werkt, ook op een subpad.
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

Stemronde in `crew_trip_votes`: "Val van de trip" en "Held van de trip". Eén stem per persoon per categorie, alleen op een crewgenoot en niet op jezelf. Omzetten (alleen `candidate` is aan te passen) en intrekken mogen. De stand zie je pas als je zelf gestemd hebt. Onder elke crewgenoot staan hun met de crew gedeelde foto's en clips van de trip (`tripMedia`: gekoppeld aan een gedeelde dag van de trip, of tijdens de trip gemaakt); tikken opent de clip, stemmen doe je op de naam. Lukt het laden van de clips niet, dan werkt de stemronde gewoon. RLS-scenario's: `supabase/tests/crew_trip_votes.sh`.

## Seizoensladder (`src/lib/ladder.ts`)

Het crew-leaderboard per seizoen (dit seizoen, vorig seizoen, altijd). Geen eigen tabel: iedereen synct `seasonXP` (XP per seizoen, laatste vier) mee in `profiles.stats`, afgeleid in `seasonXPs()` uit wat een datum heeft: dagen, de eerste keer dat je een trick landde en gehaalde doelen. Quiz, badges en dagopdrachten tellen alleen in je totaal. Gelijke XP deelt de plek. Het podium van vorig seizoen staat als medaille op de skipas, uitgerekend uit de crews die de kijker en de rider delen (laatst bekende lokaal). Zolang nog niemand in een crew met de nieuwe versie gesynct heeft, opent het leaderboard op "Altijd". Seizoen = juli t/m juni, één definitie in `format.seasonOf`.

## Wie rijdt met wie (`src/lib/carpool.ts`)

Op een crew-trip (en je eigen gedeelde trip): auto's met plekken. Wie rijdt biedt een auto aan met een naam, het aantal plekken voor meerijders (1-8), vertrek en een bagage-notitie; crewgenoten tikken een vrije plek aan. Tabellen `crew_trip_cars` (één auto per bestuurder per trip) en `crew_trip_riders` (één plek per persoon per trip, primary key trip + user). De database bewaakt de regels met triggers: een auto wordt nooit voller dan zijn plekken (met een lock op de auto, ook als twee mensen tegelijk tikken), je kunt de plekken niet onder het aantal meerijders zetten, en wie rijdt zit niet ook bij een ander in de auto. Instappen doe je alleen voor jezelf; uitstappen zelf, of de bestuurder haalt je eruit. Aanpassen doet de bestuurder, weghalen de bestuurder of de trip-eigenaar. RLS-scenario's: `supabase/tests/crew_trip_cars.sh`.

## Huisje-briefje (`src/lib/house.ts`)

Op een crew-trip (en je eigen gedeelde trip): één gedeeld briefje met adres (link naar Kaarten), wifi-naam en -code (met kopieerknop), in- en uitchecken, eerste lift en vrije notities, plus een kookrooster per avond van de trip. Tabel `crew_trip_house` (één rij per trip): iedereen in de crew vult aan; de app stuurt alleen gewijzigde velden (`changedFields`), zodat twee mensen die tegelijk iets anders aanpassen elkaar niet overschrijven. `updated_by` en `updated_at` vult de database (trigger). Tabel `crew_trip_cooking` (één kok per avond): claimen alleen voor jezelf, het menu past de kok aan, vrijmaken doet de kok of de trip-eigenaar. Laatst bekende stand lokaal, zodat je de wifi-code ook zonder bereik ziet. RLS-scenario's: `supabase/tests/crew_trip_house.sh`.

## Stickers cadeau doen (`src/lib/gifts.ts`)

Op de skipas van een crewgenoot: "Geef een sticker", een van de tien stickers (de vijf stemmingen en de vijf crew-reacties) met een berichtje van max 60 tekens. Op je eigen skipas staan de gekregen stickers onder "Stickers van je crew": plakken (max 3) of weggooien. De geplakte stickers staan schuin op de pas, en die ziet je crew ook. Tabel `sticker_gifts`; een trigger bewaakt max 3 weggeven per 7 dagen (met een advisory lock tegen dubbel tikken) en max 3 geplakt. De ontvanger mag alleen `pinned` aanpassen. Badges kun je niet weggeven: die blijven iets wat je zelf verdient, en XP en badges tellen cadeaus niet mee. RLS-scenario's: `supabase/tests/sticker_gifts.sh`.

## Trip-toernooi (`src/lib/tournament.ts`)

Op de trippagina zodra de trip begonnen is: de clips en foto's die de crew van de trip deelde (`tripMedia`) in een bracket van max 8 (video's eerst, vaste gehusselde volgorde per trip). Iemand uit de crew start hem; de bracket ligt daarna vast in `crew_trip_brackets` (later gedeelde clips schuiven niks op). Per duel stemt iedereen op een clip (`crew_trip_bracket_votes`, een stem is een clip-id uit de bracket, omzetten mag). Wie doorgaat rekent `layout()` uit: meeste stemmen, gelijk = de eerste; een duel is beslist als minstens de helft van de crew stemde, pas dan staat de winnaar in het volgende duel. Lege plekken zijn een bye. De winnaar van de finale krijgt een poster met een "Winnaar"-sticker. Opnieuw beginnen kan de starter of de trip-eigenaar (stemmen gaan mee). De database checkt dat alleen met de crew gedeelde clips in de bracket kunnen en dat je alleen op een clip uit de bracket stemt. RLS-scenario's: `supabase/tests/crew_trip_bracket.sh`.

## Crew-doel van de week (`src/lib/crewGoal.ts`)

Bovenaan de crew-feed: één gezamenlijk doel per crew per week (maandag t/m zondag), als poster. Geen eigen tabel: het doel wordt gekozen met een seed van crew + week (iedereen ziet hetzelfde), uit vijf soorten (samen uren, samen dagen, samen tricks geland, samen dagen rood of zwart, iedereen minstens één dag), en schaalt mee met de crew (rekent met minstens twee, behalve "iedereen"). De stand komt uit de gedeelde dagen in de feed; dezelfde rider op dezelfde datum telt één keer, een trick die je twee keer landt ook. Gehaald: stempel erop.

## Waar is de crew (`src/lib/crewStatus.ts`)

Boven in de crew-feed zet je met één tik je status: in de lift, op de piste, pauze, in het park, bij het huisje of klaar voor vandaag. Geen locatie, alleen de status en wanneer. Tabel `crew_status`: één rij per persoon, jij en je crewgenoten zien hem. Zetten gaat alleen via `set_crew_status()` (security definer), die ook de tijd invult, zodat niemand een tijd kan verzinnen; weghalen mag je eigen rij. Ouder dan 12 uur telt niet meer. Nog een keer op je status tikken haalt hem weg. RLS-scenario's: `supabase/tests/crew_status.sh`.

## Dagopdracht (`src/lib/challenges.ts`)

Op Home: elke dag één challenge uit `src/content/challenges.ts` die bij je niveau past (hoogste gelande trick, ±1, en alleen met tricks die je al kunt). De opdracht van vandaag ligt vast zodra je hem ziet; één keer per dag kun je een andere vragen. Je lijst staat lokaal in kv (`dagopdracht`), dus het werkt offline. Gedaan gaat ook naar `daily_challenges` (één rij per persoon per dag, alleen het id), zodat je crewgenoten zien wie vandaag een opdracht deed. Offline afgevinkt gaat later alsnog mee (`flushChallenges`, tot een week terug). Telt mee voor XP (+15) en de badge "Opdrachtjesjager" (10). RLS-scenario's: `supabase/tests/daily_challenges.sh`.

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
- **Mascotte** (`src/lib/mascot.ts`, tekening in `src/design/Mascot.tsx`): de Episch-sticker van het app-icoon met jouw gezichts-, ster- en gogglekleur, muts/pet/helm en lach. Opgeslagen als ids in `profiles.data.mascot` (geen migratie; synct met het profiel), `checkMascot()` maakt van alles wat niet klopt de standaard. Staat op de skipas als je geen foto hebt (ook bij je crew) en onderaan je deelkaarten en Season Wrapped (`cardMascotSvg`). Aanpassen: Bewerk → Je mascotte.

## Spraakmemo's (`src/lib/memo.ts`, `src/components/VoiceMemos.tsx`)

- Een memo is een media-record met `type: 'audio'` (plus `duration`), dus upload, sync, zacht verwijderen en de leesregel voor je crew (storage-policy op `records.kind = 'media'`) werken zoals bij foto's en video's. Geen migratie.
- Opnemen met `getUserMedia` + `MediaRecorder` (iPhone: `audio/mp4`, elders webm/opus), max 1 minuut, korter dan 0,8 s wordt niet bewaard. Microfoon-fouten in gewone taal (`micError`).
- Waar: op je dag (LogDetail en de editor), en de knop "Spraakmemo" op Home. Nog geen dag gelogd? Dan is de memo los en komt hij bij de dag van die datum zodra je die logt (`adoptMemos` in `saveSession`, alleen bij een nieuwe dag).
- Je crew hoort de memo's bij een gedeelde dag in de feed (`FeedPost.memos`).
- **Nooit tussen foto's en video's**: `isVisual()` filtert ze uit de kluis, je skipas, de coach, het toernooi, de trip-media en `riderMedia` (server-side `data->>type <> 'audio'`). Nieuwe plek met een media-grid? Filter met `isVisual`.

## Trip-film (proef) (`src/lib/tripFilm.ts`, `src/components/TripFilm.tsx`)

- Op de trippagina (na het toernooi, zodra de trip begonnen is): de gedeelde clips en foto's van de crew (`tripMedia`) als korte film om te delen. Max 8, op tijd; zijn er meer, dan gaan video's voor (vaste keuze per trip via `planFilm`).
- Alles op het toestel: een canvas van 720x1280 tekent intro (tripnaam, resort, datums), per clip ~2,6 s (foto 1,8 s, met een langzame zoom) met de naam van de rider als sticker, en een outro met de crew en je mascotte. `MediaRecorder` neemt `canvas.captureStream(30)` op (iPhone: mp4/H.264, anders webm). Dat gaat in echte tijd: hou het scherm aan.
- De tekenhulpjes (fonts, `display`, `caps`, `peaks`, kleuren) komen uit `shareCard.ts`. Delen via `shareFile` (deelmenu of download). De film wordt niet opgeslagen.
- **Geluid**: muziek uit `src/lib/filmMusic.ts`, in de app gemaakt met WebAudio (geen bestanden, geen licenties): Boom bap (92 bpm), Park (108), Pow day (124) of geen. Tik een stijl om 4 maten te horen (`previewMusic`). Met muziek vallen de cuts op de beat (`planFilm(..., { bpm })`: intro en clips 4 tellen, foto's 3, outro 6).
- Het geluid van de clips komt uit het bestand zelf (`decodeAudioData`, één download voor beeld en geluid) en wordt op de klok van de AudioContext ingepland; de muziek gaat dan zachter. Beeld volgt dezelfde klok, dus beeld en geluid blijven gelijk. Alles via een limiter naar een `MediaStreamAudioDestinationNode`, samen met het canvas opgenomen.
- iOS start geluid alleen na een tik: de AudioContext wordt in de tik op "Maak de film" (of op een muziekstijl) gemaakt. Lukt dat niet, dan wordt het een stille film.
- **Zelf kiezen** (rij "Clips" → `ClipPicker`): tik clips aan of uit, max 8, met een nummer op volgorde van de trip. Je keuze wordt per trip op je toestel onthouden (`kv: filmPick:<tripId>`); "Automatisch" zet hem terug. `pickClips()`: eigen keuze gaat voor, verdwenen clips tellen niet, niks gekozen = automatisch.
- Getest in Chromium met testclips met testtonen (ffmpeg): elke toon zit precies in zijn eigen clip (FFT-check); op een iPhone nog proberen.

## Potje van de trip (`src/lib/pot.ts`, `src/components/TripPot.tsx`)

- Tabel `crew_trip_expenses` (migratie `20261110000000`): per uitgave wie betaalde (`paid_by`), voor wie (`split_between`, gelijk verdeeld), bedrag in centen, wat en wanneer. Een terugbetaling is `kind = 'transfer'` met precies één ontvanger. De database bewaakt dat iedereen in de crew zit, niemand dubbel, en max 300 per trip; aanpassen doet wie hem toevoegde of wie betaalde, weghalen ook de trip-eigenaar. 24 scenario's in `test:db`.
- De app rekent: `shares()` verdeelt in centen (de rest cent voor cent op id, overal hetzelfde), `balances()` geeft de stand (telt op tot 0), `settle()` maakt "wie betaalt wie" (grootste schuld naar grootste tegoed). "Betaald" legt een terugbetaling vast.
- Op beide trippagina's. Laatst bekende stand met namen in `kv: pot:<tripId>`, zodat je hem op de berg ook zonder bereik ziet. Alleen euro.

## Run-teller (`src/lib/runs.ts`, `src/pages/Runs.tsx`)

- Route `/runs`. Eén grote knop: Start boven aan de piste, Beneden onder. De tijd tussen twee runs is lift en wachten; een gat van meer dan 45 minuten is pauze. "Oeps, terug" draait de laatste tik terug; een run die langer dan 40 minuten loopt vraagt of je vergat te stoppen.
- Alleen lokaal, op tijdstempels (`kv: runs:<datum>`), dus het klopt ook als de app dicht was of je scherm uit stond. `runStore` houdt Home en de pagina live gelijk.
- Op Home: een live blok (run of lift, met de klok) terwijl je telt, anders een rij. Je dag: `smartDraft` neemt het aantal runs en de uren op de berg (op een half uur) over; "Zet in je dag" zet de runs in een al gelogde dag. `Session.runs` staat op de dagpagina en in de editor. XP verandert niet.

## Noodkaart (`src/pages/Emergency.tsx`, `src/lib/emergency.ts`, `src/content/emergency.ts`)

- Route `/nood` (Meer, en onderaan elke trip). Groot het alarmnummer van het land (bellen met één tik), en de andere landelijke nummers. Het land: wat je koos, anders dat van je trip, anders Frankrijk.
- Alleen nummers die landelijk gelden (112 in Europa, plus bijv. Bergrettung 140, Rega 1414). Pistediensten verschillen per gebied; dat nummer vul je zelf in.
- "Waar ben ik": je coördinaten (GPS, ook zonder bereik) om voor te lezen. "Bij een ongeluk": wat te doen, in volgorde.
- Je gegevens (allergieën, medicijnen, wie ze moeten bellen, verzekering) staan alleen op dit toestel (`kv: emergency:card`), niet in je profiel en nooit op de server. "Laat zien aan hulp" toont ze groot, in het Nederlands en Engels.

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

- **Wie krijgt wat** (`supabase/functions/push/handlers.ts`): een gedeelde dag (max 2 dagen oud) naar de rest van de crew; een afgevinkt crew-doel naar wie hem nog moet halen, of als iedereen hem heeft "Crew-doel gehaald" naar de hele crew; om 9:00 lokale tijd tijdens een trip een duwtje voor de **dagopdracht** als je hem nog niet afvinkte (de opdracht zelf kiest de app, die kent je tricks; de server kijkt alleen in `daily_challenges` of je hem al deed); om 17:00 lokale tijd tijdens een trip "Log je dag" als je vandaag nog niks logde; om 18:00 het **pow-alarm** als er voor je eerstvolgende trip (bezig of binnen een week, met een resort uit de app) 15 cm of meer verse sneeuw voorspeld wordt, tijdens de trip of de twee dagen ervoor. De server checkt zelf of het jouw dag of jouw vinkje is.
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

**Drill van de dag** (`mode: 'drill'`): op Home, op verzoek ("Geef me een drill"). De app stuurt de rider-context, de trick-ids die je nog niet beheerst en de titels van je laatste vijf drills (voor afwisseling). Structured output: `titel`, `waarom`, `stappen` (max 4), `minuten` (5-45) en `trickId` (alleen uit de lijst). `checkDrill` in `protocol.ts` begrenst het antwoord. De drill wordt per datum bewaard in kv `coach:drills` (laatste twee weken): één call per dag, daarna komt hij uit de cache. Telt als één coach-bericht.

**Voor en na** (`mode: 'compare'`): in het vergelijkscherm van toen en nu ("Laat de coach vergelijken"). De app pakt van beide clips het beeld waar je staat (het huidige videoframe of de foto, via `toCoachImage`; de media hebben `crossOrigin` zodat dat mag) en stuurt ze met de tricknaam en het aantal dagen ertussen. Structured output: `beter`, `nogWerk`, `drill`. De uitslag wordt bewaard per paar clips (kv `coach:compare:<toen>:<nu>`), zodat hij bij opnieuw openen blijft staan zonder nieuwe call.

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
