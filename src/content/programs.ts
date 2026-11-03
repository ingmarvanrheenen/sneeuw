// Programma's: kant-en-klare reeksen van een paar dagen op de berg. Per dag een doel, de piste, een paar
// concrete oefeningen en de tricks die erbij horen (met hun animatie). Volgt de standaard lesvolgorde.
import type { PisteColor } from '../lib/types'

export interface ProgramDay {
  title: string
  goal: string
  piste?: PisteColor
  tricks: string[]
  tasks: string[]
}

export interface Program {
  id: string
  name: string
  blurb: string
  /** voor wie: wat je al moet kunnen */
  start: string
  days: ProgramDay[]
  /** door Coach Daddy gemaakt, op jouw niveau (alleen op dit toestel) */
  coach?: { wish: string; createdAt: number }
}

export const PROGRAMS: Program[] = [
  {
    id: 'eerste-week',
    name: 'Eerste week op de plank',
    blurb: 'Van nooit gestaan naar je eerste gekoppelde bochten.',
    start: 'Voor je eerste keer. Een groene piste of oefenweide is genoeg.',
    days: [
      {
        title: 'Staan en glijden',
        goal: 'Je board kennen: aandoen, skaten en rechtuit glijden tot stilstand.',
        piste: 'groen',
        tricks: ['strap-in', 'skaten', 'rechtuit', 'vallen', 'opstaan-heel'],
        tasks: [
          'Oefen je bindingen vast en los tot het zonder kijken gaat',
          'Skaat tien keer een stukje vlak met één voet vast',
          'Glij rechtuit een flauw stukje af en kijk waar je heen wilt',
          'Val expres een paar keer op je billen en sta weer op',
        ],
      },
      {
        title: 'Remmen op je hielen',
        goal: 'Stoppen wanneer jij wilt, op je heel edge.',
        piste: 'groen',
        tricks: ['heelside-stop', 'sideslip-heel', 'lift-band'],
        tasks: [
          'Sideslip heelside van boven naar beneden, rustig',
          'Rij rechtuit en rem tot stilstand op je hielen, vijf keer',
          'Neem de lopende band of sleeplift omhoog',
        ],
      },
      {
        title: 'Falling leaf',
        goal: 'Heen en weer over de piste glijden, op allebei je edges.',
        piste: 'groen',
        tricks: ['falling-leaf-heel', 'sideslip-toe', 'falling-leaf-toe', 'opstaan-toe'],
        tasks: [
          'Falling leaf heelside: links, rechts, links, zonder te draaien',
          'Sideslip toeside met je gezicht naar de berg',
          'Falling leaf toeside, kijk over je schouder waar je heen gaat',
        ],
      },
      {
        title: 'De eerste bocht',
        goal: 'Van je ene edge naar je andere: de J-turn en garlands.',
        piste: 'groen',
        tricks: ['traverse', 'garlands', 'j-turn', 'lift-stoel'],
        tasks: [
          'Traverse schuin over de piste en stop netjes aan de rand',
          'Garlands: bochtjes de berg op en terug, op één edge',
          'J-turn: laat de neus het dal in zakken en stuur terug op je andere edge',
          'Probeer een stoeltjeslift, met iemand naast je',
        ],
      },
      {
        title: 'Gekoppelde bochten',
        goal: 'Bocht na bocht de piste af, zonder te stoppen.',
        piste: 'blauw',
        tricks: ['gekoppelde-bochten', 'snelheid'],
        tasks: [
          'Eerst drie bochten achter elkaar op groen, dan een hele afdaling',
          'Houd je snelheid in de hand met grotere bochten, niet met remmen',
          'Als het lukt: je eerste blauwe piste',
        ],
      },
    ],
  },
  {
    id: 'groen-naar-rood',
    name: 'Van groen naar rood',
    blurb: 'Je kunt bochten maken; nu snelheid, strakkere lijnen en steilere pistes.',
    start: 'Je maakt gekoppelde bochten op groen of blauw.',
    days: [
      {
        title: 'Bochten op blauw',
        goal: 'Rustige, ronde bochten op een hele blauwe piste.',
        piste: 'blauw',
        tricks: ['gekoppelde-bochten', 'snelheid'],
        tasks: [
          'Drie afdalingen blauw zonder te stoppen',
          'Maak je bochten af: board helemaal dwars voor de volgende',
          'Varieer: grote bochten, dan kleine, dan weer grote',
        ],
      },
      {
        title: 'Dynamisch',
        goal: 'Op en neer bewegen in je bochten: laag in de bocht, hoog bij de wissel.',
        piste: 'blauw',
        tricks: ['dynamische-bochten', 'traverse'],
        tasks: [
          'Zak door je knieën in de bocht en kom omhoog bij de edge-wissel',
          'Rij een stuk achter iemand aan en volg exact hun lijn',
          'Kijk steeds naar waar je volgende bocht begint, niet naar je board',
        ],
      },
      {
        title: 'Op je edge',
        goal: 'Je eerste carves: een smal spoor in plaats van een glijbocht.',
        piste: 'blauw',
        tricks: ['carve-heel', 'carve-toe'],
        tasks: [
          'Lange heelside-traverse op je edge: kijk achterom, zie je een dunne lijn?',
          'Hetzelfde toeside, knieën naar de sneeuw',
          'Twee carve-bochten achter elkaar op een breed stuk',
        ],
      },
      {
        title: 'Steiler',
        goal: 'Rustig blijven op steiler terrein en je snelheid houden.',
        piste: 'rood',
        tricks: ['snelheid', 'sideslip-heel', 'gekoppelde-bochten'],
        tasks: [
          'Kies een korte rode piste en rij hem eerst in kleine bochten',
          'Te snel? Sideslip een stukje en begin opnieuw, geen schande',
          'Gewicht naar voren in de bocht, niet achterover hangen',
        ],
      },
      {
        title: 'De hele rode',
        goal: 'Een hele rode piste in één keer, met bochten die je zelf kiest.',
        piste: 'rood',
        tricks: ['gekoppelde-bochten', 'dynamische-bochten'],
        tasks: [
          'De hele rode in één keer, stoppen mag aan de kant',
          'Daarna nog een keer: minder stops dan de eerste',
          'Log je dag: rood staat op je pas',
        ],
      },
    ],
  },
  {
    id: 'eerste-park',
    name: 'Park in vier dagen',
    blurb: 'Van flatland naar je eerste kicker en box.',
    start: 'Je rijdt zeker op blauw en kunt stoppen waar je wilt.',
    days: [
      {
        title: 'Pop',
        goal: 'Van de grond komen: ollies en presses op een vlak stuk.',
        piste: 'blauw',
        tricks: ['ollie', 'nose-press', 'tail-press'],
        tasks: [
          'Tien ollies op de plek, dan tijdens het rijden',
          'Nose press en tail press, telkens drie tellen vasthouden',
          'Ollie over een denkbeeldige lijn in de sneeuw',
        ],
      },
      {
        title: 'Draaien',
        goal: 'Rotatie op de grond: shifty, revert en je eerste 180.',
        piste: 'blauw',
        tricks: ['shifty', 'revert', 'fs-180', 'switch'],
        tasks: [
          'Shifty: draai je board in de lucht en terug, schouders blijven staan',
          'Revert: draai plat over de sneeuw naar switch en rij door',
          'Frontside 180 vanuit een kleine ollie, land op je andere voet voor',
        ],
      },
      {
        title: 'Het park in',
        goal: 'Park-etiquette en je eerste straight air op een kleine kicker.',
        tricks: ['park-etiquette', 'kicker-straight'],
        tasks: [
          'Rij het park eerst langs de kant en kijk hoe het loopt',
          'Rol over de kleinste kicker zonder sprong',
          'Straight air: rechtuit, ollie van de lip, land met twee voeten',
        ],
      },
      {
        title: 'Box en grab',
        goal: 'Een 50-50 over de box en je eerste grab.',
        tricks: ['box-5050', 'grab-indy'],
        tasks: [
          'Box 50-50: recht erop, board plat, knieën los, recht eraf',
          'Indy op een kleine kicker: knieën op, achterhand pakt je tenen',
          'Film je beste en zet hem in je kluis',
        ],
      },
    ],
  },
  {
    id: 'carven',
    name: 'Leren carven',
    blurb: 'Van glijbochten naar een strakke lijn op je edge.',
    start: 'Je rijdt dynamische bochten op blauw.',
    days: [
      {
        title: 'Op de edge staan',
        goal: 'Leren dat je board stuurt, niet jij: heelside en toeside traverses.',
        piste: 'blauw',
        tricks: ['carve-heel', 'carve-toe'],
        tasks: ['Traverse op je heel edge tot je een dun spoor ziet', 'Hetzelfde op je toe edge', 'Kantel je knieën, niet je bovenlijf'],
      },
      {
        title: 'Rail-to-rail',
        goal: 'Van carve naar carve zonder te glijden ertussen.',
        piste: 'blauw',
        tricks: ['rail-to-rail', 'dynamische-bochten'],
        tasks: [
          'Twee carves achter elkaar op een breed stuk',
          'Wissel snel van edge: kort plat, meteen weer op de andere kant',
          'Kijk achterom naar je spoor: twee dunne lijnen?',
        ],
      },
      {
        title: 'Diep',
        goal: 'Dieper kantelen en harder durven: richting eurocarve.',
        piste: 'rood',
        tricks: ['rail-to-rail', 'eurocarve'],
        tasks: [
          'Carve op een rustige rode, laag door je knieën',
          'Raak de sneeuw met je achterhand in een toeside carve',
          'Log je dag en noteer hoe ver je kwam',
        ],
      },
    ],
  },
]

export const PROGRAM_BY_ID = new Map(PROGRAMS.map((p) => [p.id, p]))
