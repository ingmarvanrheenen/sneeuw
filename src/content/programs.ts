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
  {
    id: 'switch',
    name: 'Switch leren',
    blurb: 'Rijden met je andere voet voor, tot een hele blauwe switch.',
    start: 'Je rijdt gekoppelde bochten op blauw, regular.',
    days: [
      {
        title: 'Weer beginner',
        goal: 'Glijden en remmen met je andere voet voor, op een flauw stuk.',
        piste: 'groen',
        tricks: ['switch', 'sideslip-heel', 'falling-leaf-heel'],
        tasks: [
          'Skaat een stukje met je achterste voet vast, die is nu je voorste',
          'Sideslip switch op je hielen, rustig van boven naar beneden',
          'Falling leaf switch, links en rechts, kijk over je nieuwe voorste schouder',
        ],
      },
      {
        title: 'Eerste switch-bochten',
        goal: 'Bochtjes switch op één edge, dan een hele bocht.',
        piste: 'groen',
        tricks: ['switch', 'garlands', 'j-turn'],
        tasks: [
          'Garlands switch op je heelside, dan op je toeside',
          'J-turn switch tot stilstand, naar allebei de kanten',
          'Tel hardop bij elke edgewissel, dat houdt je rustig',
        ],
      },
      {
        title: 'Koppelen',
        goal: 'Bocht na bocht switch op groen, zonder te stoppen.',
        piste: 'groen',
        tricks: ['switch', 'gekoppelde-bochten'],
        tasks: [
          'Drie bochten switch achter elkaar, dan stoppen en ademen',
          'Wissel per run: een run regular, een run switch',
          'Laag in je knieën, gewicht op je nieuwe voorvoet',
        ],
      },
      {
        title: 'Switch op blauw',
        goal: 'Een hele blauwe afdaling switch, op jouw tempo.',
        piste: 'blauw',
        tricks: ['switch', 'gekoppelde-bochten', 'revert'],
        tasks: [
          'Begin op het flauwste stuk en maak brede, ronde bochten',
          'Hele blauwe afdaling switch, stoppen mag',
          'Bonus: draai halverwege een revert en rij regular verder',
        ],
      },
    ],
  },
  {
    id: 'butters',
    name: 'Butters',
    blurb: 'Spelen op de vlakte: van een nose press tot een butter 360.',
    start: 'Je rijdt rustig op blauw en kunt een ollie.',
    days: [
      {
        title: 'Press',
        goal: 'Je neus en je tail van de sneeuw tillen en vasthouden.',
        piste: 'groen',
        tricks: ['nose-press', 'tail-press'],
        tasks: [
          'Op de plek: druk je neus omhoog, houd hem drie tellen vast',
          'Rijdend een tail press op een vlak stuk, armen uit voor je balans',
          'Hetzelfde met je neus, gewicht boven je voorste been',
        ],
      },
      {
        title: 'Draaien op je neus',
        goal: 'Een nose butter: draaien op je neus terwijl je tail van de sneeuw komt.',
        piste: 'groen',
        tricks: ['nose-butter', 'nose-press'],
        tasks: [
          'Nose press en zwaai je tail een kwartslag rond',
          'Kijk waar je heen draait, je schouders gaan voor',
          'Vijf keer, eerst stilstaand, dan langzaam rijdend',
        ],
      },
      {
        title: 'Draaien op je tail',
        goal: 'Een tail butter, en terug naar rijden.',
        piste: 'groen',
        tricks: ['tail-butter', 'revert'],
        tasks: [
          'Tail press en draai je neus rond',
          'Eindig switch of draai een revert terug',
          'Wissel af: nose butter, tail butter, nose butter',
        ],
      },
      {
        title: 'Rond',
        goal: 'Een butter 360 op een vlak stuk blauw.',
        piste: 'blauw',
        tricks: ['butter-360', 'nose-butter', 'tail-butter'],
        tasks: [
          'Wind je bovenlijf op voor je de butter inzet',
          'Eerst een halve, dan steeds verder rond',
          'Laat iemand filmen en zet je beste in de kluis',
        ],
      },
    ],
  },
  {
    id: 'eerste-poeder',
    name: 'Eerste keer poeder',
    blurb: 'Drijven in de verse sneeuw, naast de piste en veilig.',
    start: 'Je rijdt dynamische bochten op rood. Er ligt verse sneeuw.',
    days: [
      {
        title: 'Naast de piste',
        goal: 'Voelen hoe je board drijft in de verse sneeuw langs de rand van de piste.',
        piste: 'blauw',
        tricks: ['poeder', 'offpiste-veilig'],
        tasks: [
          'Lees eerst het lawinebericht en blijf vandaag binnen de paaltjes',
          'Rij de verse rand van de piste, gewicht iets naar achteren',
          'Grote, ronde bochten, niet remmen: snelheid houdt je boven',
        ],
      },
      {
        title: 'Drijven',
        goal: 'Een paar bochten achter elkaar in de verse sneeuw.',
        piste: 'rood',
        tricks: ['poeder', 'dynamische-bochten'],
        tasks: [
          'Kies een breed stuk verse sneeuw tussen de pistes',
          'Op en neer bewegen: omhoog bij de edgewissel, door je knieën in de bocht',
          'Gevallen? Leg je board dwars, dan kom je makkelijker overeind',
        ],
      },
      {
        title: 'Tussen de bomen',
        goal: 'Rustig door een open bos, met iemand bij je.',
        piste: 'rood',
        tricks: ['bomen', 'poeder', 'offpiste-veilig'],
        tasks: [
          'Nooit alleen: houd elkaar in zicht en spreek af waar je uitkomt',
          'Kijk naar de gaten tussen de bomen, niet naar de bomen',
          'Blijf uit de holtes rond boomstammen',
        ],
      },
    ],
  },
  {
    id: 'bulten',
    name: 'Bulten',
    blurb: 'Rustig door de bulten zonder er tegenaan te knallen.',
    start: 'Je rijdt dynamische bochten op rood.',
    days: [
      {
        title: 'Lezen',
        goal: 'De bulten leren lezen: draaien op de top, glijden in het dal.',
        piste: 'rood',
        tricks: ['bulten', 'sideslip-heel'],
        tasks: [
          'Sideslip langs een bultenveld en kijk waar de lijnen lopen',
          'Draai je board op de top van een bult, daar is hij het lichtst',
          'Rem in het dal achter de bult, niet ervoor',
        ],
      },
      {
        title: 'Absorberen',
        goal: 'Je benen als schokbrekers: knieën omhoog op de bult, uitstrekken in het dal.',
        piste: 'rood',
        tricks: ['bulten', 'dynamische-bochten'],
        tasks: [
          'Rechtuit over een paar kleine bulten, laat je knieën meeveren',
          'Bovenlijf stil, alleen je benen bewegen',
          'Drie bochten in de bulten, dan eruit en uitrusten',
        ],
      },
      {
        title: 'Een hele lijn',
        goal: 'Een stuk bultenpiste in één keer, op jouw tempo.',
        piste: 'zwart',
        tricks: ['bulten'],
        tasks: [
          'Kies een lijn en kijk twee bulten vooruit',
          'Korte bochten, snelheid onder controle, stoppen mag',
          'Log je dag en noteer hoe ver je kwam zonder stop',
        ],
      },
    ],
  },
]

export const PROGRAM_BY_ID = new Map(PROGRAMS.map((p) => [p.id, p]))
