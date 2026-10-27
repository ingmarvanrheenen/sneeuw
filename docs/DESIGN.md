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

| Token                  | Licht          | Donker    | Gebruik                      |
| ---------------------- | -------------- | --------- | ---------------------------- |
| `--bg`                 | `#f3f5f2`      | `#0d100e` | achtergrond                  |
| `--surface`            | `#ffffff`      | `#151916` | gegroepeerde lijsten         |
| `--surface-2`          | `#e8ece7`      | `#1e231f` | tracks, controls             |
| `--line`               | `#d7ddd6`      | `#2a312b` | scheidingslijnen             |
| `--text`               | `#0f1410`      | `#edf1eb` | tekst                        |
| `--muted`              | `#576157`      | `#98a297` | secundaire tekst (≥ 4.5:1)   |
| `--accent`             | `#1f7a3d`      | `#73cf80` | knoppen, selectie, voortgang |
| `--accent-ink`         | `#ffffff`      | `#09120b` | tekst op accent              |
| `--accent-text`        | `#1c6f37`      | `#7fd78b` | groene tekst en links        |
| `--heel` / `--toe`     | blauw / oranje |           | edges in animaties           |
| `--jacket` / `--pants` |                |           | kleding van de rider         |

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
