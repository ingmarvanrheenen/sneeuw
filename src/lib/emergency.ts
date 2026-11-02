// Noodkaart: je eigen gegevens voor hulpverleners en het land waar je bent. Staat alleen op dit toestel
// (kv: emergency:*), gaat nooit mee met de sync: medische gegevens horen niet op een server.
import { kvGet, kvSet } from './db'
import { listKind } from './repo'
import { todayISO } from './ids'
import { RESORTS } from '../content/resorts'
import { COUNTRY_BY_ID } from '../content/emergency'

export type CardField =
  | 'name'
  | 'birth'
  | 'blood'
  | 'allergies'
  | 'meds'
  | 'conditions'
  | 'iceName'
  | 'icePhone'
  | 'insurer'
  | 'policy'
  | 'travelInsurer'
  | 'travelPhone'
  | 'pistePhone'

export type EmergencyCard = Partial<Record<CardField, string>>

/** Labels in het Nederlands en het Engels: de hulp ter plekke spreekt vaak geen Nederlands. */
export const CARD_FIELDS: {
  key: CardField
  label: string
  en: string
  max: number
  type?: 'tel'
  hint?: string
  group: 'ik' | 'nood' | 'verzekering'
}[] = [
  { key: 'name', label: 'Naam', en: 'Name', max: 60, group: 'ik' },
  { key: 'birth', label: 'Geboortedatum', en: 'Date of birth', max: 20, group: 'ik', hint: 'Bijv. 14-03-1998' },
  { key: 'blood', label: 'Bloedgroep', en: 'Blood type', max: 10, group: 'ik' },
  { key: 'allergies', label: 'Allergieën', en: 'Allergies', max: 200, group: 'ik' },
  { key: 'meds', label: 'Medicijnen', en: 'Medication', max: 200, group: 'ik' },
  { key: 'conditions', label: 'Aandoeningen', en: 'Medical conditions', max: 200, group: 'ik', hint: 'Bijv. astma, diabetes, epilepsie' },
  { key: 'iceName', label: 'Bel in nood', en: 'Emergency contact', max: 60, group: 'nood' },
  { key: 'icePhone', label: 'Telefoon', en: 'Phone', max: 30, type: 'tel', group: 'nood' },
  {
    key: 'pistePhone',
    label: 'Pistedienst hier',
    en: 'Ski patrol',
    max: 30,
    type: 'tel',
    group: 'nood',
    hint: 'Staat op je skipas of de pistekaart',
  },
  { key: 'insurer', label: 'Zorgverzekeraar', en: 'Health insurance', max: 60, group: 'verzekering' },
  { key: 'policy', label: 'Polisnummer', en: 'Policy number', max: 40, group: 'verzekering' },
  { key: 'travelInsurer', label: 'Reisverzekering', en: 'Travel insurance', max: 60, group: 'verzekering' },
  { key: 'travelPhone', label: 'Alarmnummer verzekering', en: 'Insurance emergency line', max: 30, type: 'tel', group: 'verzekering' },
]

const CARD_KEY = 'emergency:card'
const COUNTRY_KEY = 'emergency:country'

/** Getrimd en ingekort; lege velden weg. */
export function cleanCard(c: EmergencyCard): EmergencyCard {
  const out: EmergencyCard = {}
  for (const { key, max } of CARD_FIELDS) {
    const v = c[key]?.trim().slice(0, max)
    if (v) out[key] = v
  }
  return out
}

export const loadCard = () => kvGet<EmergencyCard>(CARD_KEY, {})
export const saveCard = (c: EmergencyCard) => kvSet(CARD_KEY, cleanCard(c))

/** Is er iets ingevuld wat een hulpverlener moet weten? */
export const hasMedical = (c: EmergencyCard) => !!(c.allergies || c.meds || c.conditions || c.blood)

/** "tel:"-link: alleen cijfers en een + vooraan. */
export const telHref = (nr: string) => `tel:${nr.replace(/(?!^\+)[^\d]/g, '')}`

/** Welk land: wat je zelf koos, anders het land van je trip van nu (of de eerstvolgende), anders Frankrijk. */
export async function pickCountry(date = todayISO()): Promise<string> {
  const chosen = await kvGet<string | null>(COUNTRY_KEY, null)
  if (chosen && COUNTRY_BY_ID.has(chosen)) return chosen
  const trips = (await listKind('trip')).filter((t) => t.startDate && (t.endDate ?? t.startDate) >= date)
  trips.sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
  const resort = RESORTS.find((r) => r.id === trips[0]?.resortId)
  return resort && COUNTRY_BY_ID.has(resort.country) ? resort.country : 'FR'
}
export const saveCountry = (id: string) => kvSet(COUNTRY_KEY, id)

/** Coördinaten om voor te lezen: "45.29812, 6.58034" plus de hoogte als die er is. */
export function fmtCoords(p: { latitude: number; longitude: number; altitude?: number | null }): string {
  const base = `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`
  return p.altitude ? `${base} · ${Math.round(p.altitude)} m` : base
}

/** Je plek ophalen (GPS werkt ook zonder bereik). */
export function locate(timeout = 15_000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Je telefoon geeft geen locatie.'))
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(locError(e))), {
      enableHighAccuracy: true,
      timeout,
      maximumAge: 30_000,
    })
  })
}

export function locError(e: { code?: number }): string {
  if (e.code === 1) return 'Geen toegang tot je locatie. Zet hem aan bij Instellingen > Privacy > Locatievoorzieningen.'
  if (e.code === 3) return 'Je locatie duurt te lang. Probeer het in de open lucht nog een keer.'
  return 'Je locatie lukte niet. Noem de piste, de lift of het paalnummer.'
}
