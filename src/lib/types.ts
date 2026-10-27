// Alle records die lokaal (IndexedDB) én in de cloud (Supabase) leven delen deze basis.
// `dirty` = 1 betekent: nog niet naar de server gesynct.
export interface BaseRecord {
  id: string
  userId: string | null
  createdAt: number
  updatedAt: number
  deleted?: boolean
  dirty?: 0 | 1
  /** Als gezet: zichtbaar voor deze crew. */
  crewId?: string | null
}

export type SnowKind = 'poeder' | 'vers' | 'groomed' | 'hard' | 'ijs' | 'slush' | 'crud' | 'indoor'
export type WeatherKind = 'zon' | 'half' | 'bewolkt' | 'sneeuw' | 'mist' | 'wind' | 'regen'
export type PisteColor = 'groen' | 'blauw' | 'rood' | 'zwart' | 'park' | 'offpiste'

export interface Session extends BaseRecord {
  kind: 'session'
  date: string // YYYY-MM-DD
  resortId?: string
  resortName: string
  tripId?: string
  snow?: SnowKind
  weather?: WeatherKind
  tempC?: number
  pistes: PisteColor[]
  hours: number
  falls: number
  mood: number // 1-5
  energy?: number // 1-5
  practiced: string[] // trick ids
  landed: string[] // trick ids die je vandaag (eerste keer of weer) landde
  pains: string[]
  painNote?: string
  buddies: string[]
  highlight?: string
  notes?: string
  mediaIds: string[]
  /** review van Coach Daddy, op verzoek gemaakt en bij de dag bewaard */
  review?: DayReview
}

export interface DayReview {
  goed: string
  focus: string
  oefening: string
  /** voorgestelde volgende trick uit de bijbel */
  trickId: string | null
  veiligheid: string | null
  createdAt: number
}

export type TrickStatus = 'wil' | 'bezig' | 'geland' | 'beheerst'

export interface TrickProgress extends BaseRecord {
  kind: 'trick'
  trickId: string
  status: TrickStatus
  firstLandedAt?: string
  sessionId?: string
  mediaIds: string[]
  note?: string
}

export interface Goal extends BaseRecord {
  kind: 'goal'
  title: string
  trickId?: string
  tripId?: string
  done: boolean
  doneAt?: number
}

export interface PackItem {
  id: string
  label: string
  category: string
  checked: boolean
}

export interface Trip extends BaseRecord {
  kind: 'trip'
  name: string
  resortId?: string
  resortName?: string
  startDate?: string
  endDate?: string
  packing: PackItem[]
}

export type GearKind = 'board' | 'binding' | 'boots' | 'helm' | 'goggle' | 'kleding' | 'protectie' | 'overig'

export interface Gear extends BaseRecord {
  kind: 'gear'
  gearKind: GearKind
  name: string
  brand?: string
  size?: string
  owned: 'eigen' | 'huur' | 'wishlist'
  notes?: string
}

export interface MediaMeta extends BaseRecord {
  kind: 'media'
  type: 'image' | 'video'
  mime: string
  /** Pad in Supabase Storage, gezet na upload. */
  path?: string
  uploaded?: boolean
  sessionId?: string
  trickId?: string
  thumb?: string // kleine dataURL voor snelle lijsten
  width?: number
  height?: number
  /** bytes van wat er opgeslagen/geüpload wordt (na verkleinen) */
  size?: number
  caption?: string
}

/** Profiel staat lokaal in kv en wordt naar de `profiles` tabel gesynct (met stats voor de crew). */
export interface Profile {
  displayName: string
  stance?: 'regular' | 'goofy' | 'onbekend'
  angleFront?: number
  angleBack?: number
  stanceWidth?: number
  favoriteResorts: string[]
}

export type AnyRecord = Session | TrickProgress | Goal | Trip | Gear | MediaMeta
export type RecordKind = AnyRecord['kind']
