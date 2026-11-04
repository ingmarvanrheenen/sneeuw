// Lawinebericht: waar je het officiële bericht van een resort vindt, en wat de Europese gevarenschaal (1-5)
// betekent voor een snowboarder. We tonen zelf geen gevarengraad: alleen de officiële dienst is leidend.

export interface Bulletin {
  name: string
  url: string
}

const TIROL = ['Tirol', 'Ötztal', 'Paznaun', 'Zillertal', 'Arlberg']
const SALZBURG = ['Salzburgerland', 'Skicircus', 'Zell am See', 'Snow Space Salzburg']

/** De officiële lawinedienst voor een resort; indoor of onbekend: null. */
export function bulletinFor(r: { country: string; region: string; indoor?: boolean }): Bulletin | null {
  if (r.indoor) return null
  if (r.country === 'FR') return { name: 'Météo-France, bulletin avalanches', url: 'https://meteofrance.com/meteo-montagne' }
  if (TIROL.includes(r.region)) return { name: 'Lawinenwarndienst Tirol', url: 'https://lawinen.report' }
  if (SALZBURG.includes(r.region)) return { name: 'Lawinenwarndienst Salzburg', url: 'https://lawine.salzburg.at' }
  if (r.region === 'Steiermark') return { name: 'Lawinenwarndienst Steiermark', url: 'https://www.lawine-steiermark.at' }
  return null
}

export interface DangerLevel {
  level: 1 | 2 | 3 | 4 | 5
  name: string
  /** wat het voor jou betekent, naast de piste */
  meaning: string
}

export const DANGER_LEVELS: DangerLevel[] = [
  { level: 1, name: 'Gering', meaning: 'Meestal veilig. Alleen op zeer steile, extreme hellingen kan er iets loskomen.' },
  { level: 2, name: 'Matig', meaning: 'Let op steile hellingen in de richtingen en hoogtes uit het bericht.' },
  {
    level: 3,
    name: 'Aanzienlijk',
    meaning: 'Hier gebeuren de meeste ongelukken. Off-piste alleen met ervaring, uitrusting en iemand die het gebied kent.',
  },
  { level: 4, name: 'Groot', meaning: 'Blijf op de open pistes. Lawines kunnen ook zonder jou vanzelf komen.' },
  { level: 5, name: 'Zeer groot', meaning: 'Uitzonderlijk. Grote lawines, ook in vlak terrein; vaak gaan liften en pistes dicht.' },
]
