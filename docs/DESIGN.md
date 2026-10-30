# Sneeuw Daddy design system

Dit is een iPhone-app voor onderweg: op de piste in fel sneeuwlicht, in de lift met handschoenen, en 's avonds in het huisje. De stijl is **park**: een poster van een snowboardmerk, met stickers, tape en stempels. Grote smalle hoofdletters, zwart en neon-lime, oranje als tweede kleur. Speels in de details, rustig waar je iets moet doen.

De levende referentie staat in de app op **Meer → Design system** (`/#/design`), met een knop om de animaties opnieuw af te spelen.

## Harde regels

1. **Nooit emoji.** Iconen komen uit `src/design/icons.tsx`, stickers uit `src/design/Stickers.tsx`. De test `src/test/design.test.ts` faalt op emoji in `src/`.
2. **Geen kickers of eyebrows** boven titels, en geen sectienummers zoals "01 / Logboek". De titel draagt zichzelf. Echte informatie (datum, voortgang) staat als `subtitle` ónder de titel.
3. **Geen monospace als kostuum.** Getallen krijgen `.num` (tabular figures), geen mono-font.
4. **Lijsten zijn lijsten.** Gegroepeerde lijsten (`List` + `Row`), geen grids van gelijke kaarten. Het posterblok (`LevelPoster`) is het enige grote statement per scherm.
5. **Accent voor acties, selectie en voortgang.** Oranje (`hot`) voor de harde schaduw, stempels, slams en links in licht. Stickers en tape zijn de enige decoratie, en die staan altijd op iets (een blok, een kaart), nooit los.
6. **Kleuren via tokens.** Uitzonderingen: de pistekleuren (echte signaalkleuren) en de stickers (artwork, in licht en donker hetzelfde).

## Kleur

Licht is gebroken wit met zwart en lime, donker is echt zwart met neon-lime. Beide zijn eersteklas.

| Token                     | Licht        | Donker     | Gebruik                                            |
| ------------------------- | ------------ | ---------- | -------------------------------------------------- |
| `--bg`                    | `#f1f0ea`    | `#0d0d0f`  | achtergrond                                        |
| `--surface`               | `#ffffff`    | `#18181b`  | kaarten en lijsten (met rand `--line`)             |
| `--surface-2`             | `#e5e4dd`    | `#232327`  | tracks, controls                                   |
| `--line`                  | `#d3d2ca`    | `#2e2e33`  | randen en scheidingslijnen                         |
| `--text` / `--muted`      | zwart/grijs  | wit/grijs  | tekst (muted ≥ 4.5:1)                              |
| `--accent`                | `#0d0d0f`    | `#d7ff3c`  | primaire knop, selectie, voortgang                 |
| `--accent-ink`            | `#d7ff3c`    | `#0d0d0f`  | tekst op accent                                    |
| `--accent-text`           | `#c23d0a`    | `#d7ff3c`  | links en iconen in rijen                           |
| `--accent-soft`           | lime 30%     | lime 13%   | gekozen rij, huidige plek                          |
| `--hot`                   | `#ff5b22`    | `#ff5b22`  | harde schaduw, stempels, slams                     |
| `--block` / `--block-ink` | zwart/lime   | lime/zwart | het posterblok                                     |
| `--sticker`               | lime         | oranje     | ster-sticker op het posterblok (contrast met blok) |
| `--tab` / `--tab-pill`    | zwart/lime   | grijs/lime | zwevende tabbalk en de pil die meeschuift          |
| `--tape`                  | lime         | wit 55%    | tape over de rand van een blok                     |
| `--heel` / `--toe`        | blauw/oranje |            | edges in animaties                                 |
| `--jacket` / `--pants`    |              |            | kleding van de rider                               |

`src/test/theme.test.tsx` checkt dat licht en donker dezelfde tokens hebben.

## Typografie

- **UI**: het systeemfont (SF Pro op iPhone). Body 17, secundair 15, footnote 13.
- **Display**: Archivo, smal (72%) en extra vet, **in hoofdletters**. Paginatitels 44 (met `outline` als tweede woord in holle letters, zoals je naam op Home), sectiekoppen 26, grote getallen 32.
- **Labels**: 11, extra vet, kapitalen met wat letterafstand (onder getallen, in stempels).

## Componenten

In `src/components/ui.tsx`:

- **`PageHeader`**: grote titel in hoofdletters die omhoog komt (`rise`), bij scrollen een compacte balk. Optioneel `outline`.
- **`Heading`** / **`Section`**: sectiekop met een doorlopende lijn en rechts een actie. Losse koppen gebruiken altijd `Heading`.
- **`List`** + **`Row`**: gegroepeerde lijst met icoon, titel, detail, waarde en chevron. Rijen komen na elkaar binnen.
- **`Button`**: primair is zwart/lime met een harde oranje schaduw, grote maten in poster-letters. Ghost, outline, danger, plain. Hoeken 6px.
- **`Segmented`**, **`Chip`** (actief = accent), **`Stepper`**, **`Field`** + `inputCls`, **`Progress`**, **`Empty`**, **`Sheet`**, **`Stat`** + **`StatGroup`**, **`LevelDots`**, **`CountryTag`**.

In `src/components/Poster.tsx`:

- **`LevelPoster`**: je level als poster (Home en badges).
- **`Sticker`**: ster-sticker, gekanteld, klapt erop.
- **`Stamp`**: oranje stempel ("+15 XP", "Gedaan").
- **`Tape`**, **`Segments`** (balk in blokjes), **`Peaks`** (bergvorm).

Kaarten hebben een rand en hoek 8px, knoppen en velden 6px. Over het hele scherm ligt een lichte korrel. Tikdoelen zijn minimaal 44pt. Safe areas via `pt-safe` en `pb-safe`; de tabbalk zweeft boven de home-indicator.

## Deelkaarten

De story-kaarten (1080×1920) in `src/lib/shareCard.ts` volgen dezelfde stijl, met vaste kleuren omdat het een plaatje is: zwart met korrel, je foto als sticker met witte rand en tape (of een lime poster met bergen), het resort groot in smalle hoofdletters, cijfers in blokken met slams in oranje, je stemming als sticker op de hoek van het beeld, tricks als lime labels en de mascotte onderin. Season Wrapped: posters, om en om zwart en lime, met het icoon op een ster-sticker. Wat erop staat (`dayCardContent`, `wrappedColors`) is getest; het tekenen check je met een screenshot.

## Iconen en stickers

- **Iconen** (`<Icon name="..." />`): 24-grid, stroke 1.8, square caps, miter joins. Voor bediening en rijen.
- **Stickers** (`src/design/Stickers.tsx`): die-cut met witte rand, dikke inktlijnen, lime/oranje/ijsblauw. Stemmingen 1-5 (`MoodSticker`, `Mood`), crew-reacties (`ReactionSticker`, op de sleutel in de database), en `MoodPick` voor kiezers. Nieuwe sticker: in dat bestand, op het 64-grid. `stickerSvg` geeft een sticker als losse SVG, voor op canvas.
- Landen als tekst-tag (`FR`, `AT`).

## Beweging

Speels maar kort. Alles in `src/styles.css`:

- **`rise`**: titels komen scheef omhoog en vallen recht (420 ms).
- **`slap`**: een sticker of stempel wordt erop geklapt: groot en gedraaid, dan vast met een klein naveren (460 ms). `--tilt` en `--delay` per sticker. Ook voor feestmeldingen, gekozen stemmingen, je eigen crew-reactie en gehaalde badges.
- **`stagger`**: rijen in een lijst komen kort na elkaar binnen.
- **`grow`**: een balk of blokje loopt vol vanaf links.
- **`shadow-hard`**: bij indrukken zak je de knop in zijn schaduw.
- De tabbalk-pil schuift mee naar de actieve tab (300 ms).
- Routine-overgangen 150–300 ms, `cubic-bezier(0.16, 1, 0.3, 1)`. Naveren alleen bij `slap`.
- Het grootste moment is nog steeds het landen van een trick (confetti in lime en oranje, geluid, sticker-melding).
- `prefers-reduced-motion` zet alles uit behalve state-feedback.

## Trick-animaties

De speler is een leermiddel, geen versiering. Op de trick-pagina draait de 3D-speler (`src/anim3d/Player3D.tsx`, lazy geladen); de 2D-speler (`src/anim/TrickAnimation.tsx`) blijft voor de quiz, compacte previews en als fallback zonder WebGL.

- **Clean mannequin**: een neutrale rider uit capsules in jas- en broekkleur, zonder gezicht of franje. Heel- en toe-edge lichten op in hun eigen kleur zodra ze in de sneeuw staan.
- **Camera**: Zij, Achter, Voor, Boven of Mee. Horizontaal vegen draait om de rider, verticaal vegen scrolt gewoon de pagina.
- **Lesmodus**: de animatie staat bij het begin van elke stap even stil.
- **Stap-navigatie**: vorige en volgende stap, plus stapmarkeringen op de tijdlijn.
- **Cue**: per stap licht het lichaamsdeel op waar het om draait (knieën, schouders, heel edge…), met een label in beeld.
- **Meters**: gewicht (tail ↔ neus), knieën, edge (heel ↔ toe) en schouders, of rotatie bij spins.
- **Spoor** in de sneeuw: breed als je slipt, een dun lijntje als je carvet.
- Snelheid ¼, ½ of 1×, goofy spiegelt de hele wereld.
- **Sneeuwspray** van de edge als je remt of slipt, een fijne pluim bij hard carven. Vers zichtbaar, daarna vervagend in de sneeuw.
- **Groot scherm** voor op de berg: speler over het hele scherm met stap en bediening onderin. Tik op de scène = pauze/afspelen, de richtknop zet de camera terug.
- **Omgeving** blijft rustig: bergsilhouetten in de verte en blauwe pistepalen voor gevoel van snelheid. Geen lucht met wolken, geen bomen tenzij de trick erom vraagt.
- **Mannequin-details**: helm met goggle en strap, handschoenen, capuchon en jaszoom, wijde broekspijpen over de boots, straps op de bindingen. Alles in jas-, broek-, gear- en accentkleur.

## Toon

Nederlands, chill en direct, met Engelse snowboardtermen waar dat op de piste normaal is. Knoppen zeggen wat ze doen. Fouten zeggen wat er mis is en hoe je het oplost.
