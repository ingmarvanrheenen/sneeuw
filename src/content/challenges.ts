// Dagopdrachten: elke dag één kleine challenge voor op de piste (of in de hal).
// `level`: voor welk niveau (1 = eerste dagen, 5 = park-rat). `needs`: tricks die je eerst geland moet hebben.
// Ids nooit hergebruiken: afgevinkte opdrachten staan op id (ook bij je crew).

export interface Challenge {
  id: string
  text: string
  level: 1 | 2 | 3 | 4 | 5
  needs?: string[]
}

export const CHALLENGES: Challenge[] = [
  // ── 1: eerste dagen ──────────────────────────────────────────────────────
  { id: 'opstaan-zonder-handen', text: 'Sta drie keer op na een val zonder op je handen te steunen', level: 1 },
  { id: 'heelside-stop-5', text: 'Maak vijf keer een nette heelside stop, zonder om te vallen', level: 1, needs: ['heelside-stop'] },
  {
    id: 'sideslip-hele-piste',
    text: 'Sideslip een heel stuk piste op je heelside, rustig en onder controle',
    level: 1,
    needs: ['sideslip-heel'],
  },
  { id: 'toeside-slip', text: 'Sideslip een stuk op je toeside, met je blik naar boven', level: 1, needs: ['sideslip-toe'] },
  { id: 'lift-zonder-val', text: 'Neem vandaag elke lift zonder te vallen bij het uitstappen', level: 1 },
  { id: 'eerste-lift', text: 'Zit in de eerste lift van de dag', level: 1 },
  { id: 'kijk-omhoog', text: 'Rij een hele afdaling met je kin omhoog: kijk waar je heen wilt, niet naar je board', level: 1 },
  // ── 2: bochten ───────────────────────────────────────────────────────────
  {
    id: 'falling-leaf-heel-toe',
    text: 'Falling leaf over de hele breedte van de piste, heelside én toeside',
    level: 2,
    needs: ['traverse'],
  },
  { id: 'garlands-10', text: 'Tien garlands op een rij, zonder te stoppen', level: 2, needs: ['garlands'] },
  { id: 'j-turns-beide', text: 'Vijf J-turns naar links en vijf naar rechts', level: 2, needs: ['j-turn'] },
  { id: 'tien-bochten', text: 'Tien gekoppelde bochten achter elkaar zonder te vallen', level: 2, needs: ['gekoppelde-bochten'] },
  { id: 'blauw-zonder-stop', text: 'Een hele blauwe piste zonder te stoppen', level: 2, needs: ['gekoppelde-bochten'] },
  { id: 'nieuwe-piste', text: 'Rij een piste die je nog nooit gereden hebt', level: 2 },
  { id: 'achter-maat', text: 'Volg een maat een hele afdaling lang in zijn spoor', level: 2, needs: ['gekoppelde-bochten'] },
  // ── 3: rood, switch, eerste tricks ─────────────────────────────────────────
  { id: 'rood-zonder-val', text: 'Een rode piste van boven tot beneden zonder te vallen', level: 3, needs: ['gekoppelde-bochten'] },
  { id: 'switch-blauw', text: 'Een hele blauwe piste switch', level: 3, needs: ['switch'] },
  { id: 'switch-tien', text: 'Tien bochten switch op een rij', level: 3, needs: ['switch'] },
  {
    id: 'korte-bochten',
    text: 'Een stuk piste met zo kort mogelijke bochten, alsof je in een gang rijdt',
    level: 3,
    needs: ['gekoppelde-bochten'],
  },
  { id: 'ollie-bultje', text: 'Drie ollies over een bultje', level: 3, needs: ['ollie'] },
  { id: 'ollie-tien', text: 'Tien ollies in één afdaling', level: 3, needs: ['ollie'] },
  { id: 'nollie-drie', text: 'Drie nollies op een rij', level: 3, needs: ['nollie'] },
  { id: 'press-tellen', text: 'Hou een nose press of tail press vol terwijl je tot drie telt', level: 3, needs: ['nose-press'] },
  { id: 'shifty-vijf', text: 'Vijf shifty’s in één afdaling', level: 3, needs: ['shifty'] },
  // ── 4: carven en flatland ─────────────────────────────────────────────────
  { id: 'carve-spoor', text: 'Carve een bocht zo strak dat je spoor een dunne lijn is, en kijk om', level: 4, needs: ['carve-heel'] },
  { id: 'carve-toe-heel', text: 'Vijf toeside- en vijf heelside-carves op een rij', level: 4, needs: ['carve-heel', 'carve-toe'] },
  { id: 'tail-press-switch', text: 'Tail press, en rij daarna switch verder', level: 4, needs: ['tail-press', 'switch'] },
  { id: 'ollie-180-poging', text: 'Vijf pogingen voor een 180 vanaf een ollie', level: 4, needs: ['ollie'] },
  { id: 'flatland-combo', text: 'Een combo: ollie, shifty en een press achter elkaar', level: 4, needs: ['ollie', 'shifty', 'nose-press'] },
  { id: 'zwart-poging', text: 'Rij een zwarte piste, in je eigen tempo', level: 4, needs: ['gekoppelde-bochten'] },
  // ── 5: park ─────────────────────────────────────────────────────────────
  { id: 'park-ronde', text: 'Een hele ronde door het park, ook al sla je de grote kickers over', level: 5, needs: ['ollie'] },
  { id: 'grab-drie', text: 'Drie keer een grab op een kicker', level: 5, needs: ['grab-indy'] },
  { id: 'butter-360-poging', text: 'Vijf pogingen voor een butter 360', level: 5, needs: ['butter-360'] },
  // ── altijd ──────────────────────────────────────────────────────────────
  { id: 'clip-kluis', text: 'Laat iemand een clip van je filmen voor je kluis', level: 1 },
  { id: 'crew-afdaling', text: 'Rij een afdaling met je hele crew bij elkaar', level: 2 },
  { id: 'nieuwe-trick-proberen', text: 'Probeer een trick die je nog nooit gedaan hebt (trick-roulette helpt)', level: 2 },
]
