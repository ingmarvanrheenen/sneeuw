# Sneeuw Daddy design system

Rustig, clean en net wat anders dan normaal. Zwart met één groene accentkleur, mono-labels zoals op apparatuur, dunne lijnen en een subtiel puntraster. Underground, maar niet geforceerd: geen graffiti, geen neon-overload.

De levende referentie staat in de app op **Meer → Design system** (`/#/design`).

## Regels

1. **Nooit emoji.** Niet in de UI, niet in content, niet in toasts. Een icoon nodig? Voeg het toe aan `src/design/icons.tsx`. De test `src/test/design.test.ts` faalt als er toch een emoji in `src/` staat.
2. **Eén accentkleur.** Groen betekent: actief, gelukt, jouw voortgang. Gebruik het niet als decoratie.
3. **Tokens, geen losse kleuren.** Alles via CSS-variabelen in `src/styles.css`, beschikbaar als Tailwind-kleuren (`bg-surface`, `text-muted`, `text-accent-text`, ...). Enige uitzondering: de pistekleuren (groen/blauw/rood/zwart), want dat zijn echte signaalkleuren van de berg.
4. **Licht en donker zijn allebei eersteklas.** Donker is de default, licht is een eigen palet (papier-wit), geen inversie.
5. **Mobiel eerst, iPhone in het bijzonder.** Safe areas (`pt-safe`, `pb-safe`), inputs minimaal 16px (anders zoomt iOS in), tikdoelen minimaal 36–44px.

## Kleur

| Token | Donker | Licht | Gebruik |
| --- | --- | --- | --- |
| `--bg` | `#0b0d0a` | `#efede4` | achtergrond |
| `--surface` | `#131611` | `#f8f7f1` | kaarten |
| `--surface-2` | `#1b1f18` | `#e7e4d8` | ghost-knoppen, tracks |
| `--line` | `#262b22` | `#d3cfbf` | randen, scheidingen |
| `--text` | `#ecefe6` | `#141611` | tekst |
| `--muted` | `#8b9483` | `#676b5d` | secundaire tekst, labels |
| `--accent` | `#9be564` | `#9be564` | vlakken (knoppen, voortgang) |
| `--accent-ink` | `#0b0d0a` | `#0b0d0a` | tekst óp accent |
| `--accent-text` | `#9be564` | `#2f7a14` | groene tekst/lijnen op de achtergrond |
| `--accent-soft` | groen 12% | groen 12% | geselecteerde rijen |
| `--warn` / `--danger` | oranje / rood | | waarschuwingen, verwijderen |
| `--heel` / `--toe` | blauw / oranje | | edges in animaties |

## Typografie

- **Space Grotesk** (variable): alles wat je leest. Titels 26/600, secties 18/600, body 15, secundair 14.
- **JetBrains Mono** (variable): labels (`.label`: 10.5px, caps, letterspacing 0.12em) en getallen (`.num`: tabular).
- Labels nummeren schermen zoals op apparatuur: `01 / Logboek`, `02 / Trick-bijbel`.

Beide fonts zijn gebundeld (geen Google Fonts-request), dus ze werken offline.

## Iconen

`src/design/icons.tsx`: `<Icon name="..." />`

- 24×24 grid, stroke **1.8**, **square caps**, **miter joins**, geen vulling. Daardoor technisch en strak, en duidelijk geen standaard icon-pack.
- Solid alleen voor play/pause/dot.
- Moods zijn eigen gezichtjes (`mood1`–`mood5`: Kapot, Meh, Prima, Chill, Episch).
- Crew-reacties: `flame` (vuur), `stomp`, `lol`, `skull` (RIP), `crown` (GOAT).
- Landen staan als tekst-tag (`FR`, `AT`, `NL`), geen vlaggen.

## Componenten

In `src/components/ui.tsx`: `Page`, `PageHeader` (sticky, safe-area, optioneel terug + kicker), `Button` (primary/ghost/outline/danger, sm/md/lg), `IconButton`, `Card`, `Section`, `Chip`, `Segmented`, `Stepper`, `Field` + `inputCls`, `Progress`, `Empty`, `Sheet` (bottom sheet), `Stat`, `LevelDots`, `CountryTag`.

Overig: `Medal` (badge-zeshoek), `StatusDot` (wil/bezig/geland/beheerst), `Charts` (BarChart, LineChart, HBar), `TrickAnimation`.

Vorm: radius 18px voor kaarten, volledig rond voor knoppen en chips, 28px voor sheets.

## Beweging en geluid

- `pop-in` (280ms, licht overshoot) voor dingen die verschijnen. Respecteert `prefers-reduced-motion`.
- Confetti alleen bij echte mijlpalen (landen, badge, level), kort (1,6s) en in de merk-kleuren.
- Geluid via WebAudio, geen bestanden: `tap`, `toggle`, `success`, `wrong`, `badge`, `levelUp`. Zacht en kort, uit te zetten in Instellingen.
- Vieringen worden samengevoegd: één toast tegelijk, maximaal twee in beeld.

## Toon

Nederlands, chill en direct, zoals een maat die toevallig snowboardleraar is. Engelse snowboardtermen waar dat op de piste normaal is (heelside, ollie, carve). Een droge grap mag ("Yard sale. Nog een rondje?"), geforceerde straattaal niet.

## Charts

Eén serie per chart in `--accent-text`, dunne marks, 4px afgeronde data-eindes op de baseline, 2px gaten tussen balken, recessieve stippellijnen. Tik of veeg voor de waarde. Geen dubbele assen.
