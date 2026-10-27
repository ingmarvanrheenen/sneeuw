# Sneeuw Daddy design system

Dit is een iPhone-app voor onderweg: op de piste in fel sneeuwlicht, in de lift met handschoenen, en 's avonds in het huisje. Het design moet verdwijnen in de taak. Het merk zit in de details: één groen, een workwear-titel en eigen iconen.

De levende referentie staat in de app op **Meer → Design system** (`/#/design`). De regels volgen de [Impeccable](https://github.com/pbakaus/impeccable)-craft-floor voor app-UI (Operate-modus) en iOS.

## Harde regels

1. **Nooit emoji.** Iconen komen uit `src/design/icons.tsx`. De test `src/test/design.test.ts` faalt op emoji in `src/`.
2. **Geen kickers of eyebrows** boven titels, en geen sectienummers zoals "01 / Logboek". De titel draagt zichzelf. Echte informatie (datum, voortgang) staat als `subtitle` ónder de titel.
3. **Geen monospace als kostuum.** Getallen krijgen `.num` (tabular figures), geen mono-font.
4. **Geen kaarten als standaardcontainer.** Lijsten zijn gegroepeerde iOS-lijsten (`List` + `Row`). Geen kaart-in-kaart, geen grids van gelijke tegels.
5. **Accent alleen voor acties, selectie en voortgang.** Nooit als decoratie.
6. **Kleuren via tokens.** Uitzondering: de pistekleuren, want dat zijn echte signaalkleuren.

## Kleur

Licht is de basis (fel buitenlicht), donker is eersteklas voor 's avonds. Neutralen hebben een lichte groene tint, nooit puur zwart.

| Token | Licht | Donker | Gebruik |
| --- | --- | --- | --- |
| `--bg` | `#f3f5f2` | `#0d100e` | achtergrond |
| `--surface` | `#ffffff` | `#151916` | gegroepeerde lijsten |
| `--surface-2` | `#e8ece7` | `#1e231f` | tracks, controls |
| `--line` | `#d7ddd6` | `#2a312b` | scheidingslijnen |
| `--text` | `#0f1410` | `#edf1eb` | tekst |
| `--muted` | `#576157` | `#98a297` | secundaire tekst (≥ 4.5:1) |
| `--accent` | `#1f7a3d` | `#73cf80` | knoppen, selectie, voortgang |
| `--accent-ink` | `#ffffff` | `#09120b` | tekst op accent |
| `--accent-text` | `#1c6f37` | `#7fd78b` | groene tekst en links |
| `--heel` / `--toe` | blauw / oranje | | edges in animaties |
| `--jacket` / `--pants` | | | kleding van de rider |

## Typografie

- **UI**: het systeemfont (SF Pro op iPhone). Body 17, secundair 15, footnote 13.
- **Display**: Archivo, smal (72%) en extra vet. Alleen voor paginatitels (38) en grote getallen. Dat is de workwear-labelstijl van het merk.
- Sectiekoppen: 20 semibold, gewone hoofdletters.

## Componenten

In `src/components/ui.tsx`:

- **`PageHeader`**: grote titel, bij scrollen een compacte balk met de titel klein (zoals iOS). Terug-knop als "‹ Terug" in accent.
- **`List`** + **`Row`**: gegroepeerde lijst met icoon, titel, detail, waarde en chevron.
- **`Section`** + **`SectionLink`**.
- **`Button`**: primary, ghost, outline, danger, plain. Hoogtes 36, 44 en 52, rounded-rect.
- **`Segmented`**: iOS segmented control.
- **`Chip`**, **`Stepper`**, **`Field`** + `inputCls`, **`Progress`**, **`Empty`**, **`Sheet`** (met "Klaar"), **`Stat`** + **`StatGroup`**, **`LevelDots`**, **`CountryTag`**.

Tikdoelen zijn minimaal 44pt. Safe areas via `pt-safe` en `pb-safe`.

## Iconen

`<Icon name="..." />`: 24-grid, stroke 1.8, square caps, miter joins. Moods `mood1` t/m `mood5`, crew-reacties `flame`, `stomp`, `lol`, `skull`, `crown`. Landen als tekst-tag (`FR`, `AT`).

## Beweging

- Routine-overgangen 150–250 ms, `cubic-bezier(0.16, 1, 0.3, 1)`. Geen bounce.
- Het enige geregisseerde moment is het landen van een trick (confetti en geluid). Al het andere is feedback.
- `prefers-reduced-motion` dempt alles behalve state-feedback.

## Trick-animaties

De speler (`src/anim/TrickAnimation.tsx`) is een leermiddel, geen versiering:

- **Lesmodus**: de animatie staat bij het begin van elke stap even stil.
- **Stap-navigatie**: vorige en volgende stap, plus stapmarkeringen op de tijdlijn.
- **Cue**: per stap wordt het lichaamsdeel gemarkeerd waar het om draait (knieën, schouders, tail…). Dat gebeurt automatisch uit de staptekst, of expliciet met `cue` op een stap.
- **Meters**: gewicht (tail ↔ neus), kniebuiging, rotatie of hoogte in het zijaanzicht; edge en board-hoek t.o.v. de valrichting in het bovenaanzicht.
- **Camera** volgt en zoomt in op de rider. Snelheid ¼, ½ of 1×, bewegingssporen, goofy-spiegeling.
- De rider wordt in pseudo-3D opgebouwd (`pose.ts`), dus spins, presses, grabs en flips kloppen vanuit elke hoek.

## Toon

Nederlands, chill en direct, met Engelse snowboardtermen waar dat op de piste normaal is. Knoppen zeggen wat ze doen. Fouten zeggen wat er mis is en hoe je het oplost.
