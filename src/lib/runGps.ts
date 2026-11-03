// GPS bij de run-teller: topsnelheid, hoogtemeters (hoeveel je zakte) en afstand per run. Alleen zolang de app
// open is (iOS geeft geen locatie op de achtergrond) en alleen als je het aanzet. De track zelf bewaren we niet:
// per run alleen deze kleine teller, op je toestel. Pure functies, zodat het met nep-fixes te testen is.

export interface Fix {
  lat: number
  lon: number
  /** meter boven zee, of null */
  alt: number | null
  altAcc: number | null
  /** nauwkeurigheid in meter */
  acc: number
  /** m/s van het toestel, of null */
  speed: number | null
  t: number
}

interface Point {
  lat: number
  lon: number
  t: number
}

export interface RunGps {
  /** km/u, het hoogste van drie fixes achter elkaar (de middelste), zodat een uitschieter niet telt */
  top: number
  /** meter: hoeveel je zakte van het hoogste punt tot het laagste erna */
  drop: number
  /** meter over de grond */
  dist: number
  /** bruikbare fixes */
  fixes: number
  // werkgeheugen
  last?: Point
  anchor?: Point
  speeds: number[]
  alts: number[]
  maxAlt?: number
}

/** slechter dan dit: fix overslaan */
export const MAX_ACC = 35
/** sneller dan dit is een GPS-sprong, geen snowboarder */
export const MAX_KMH = 130
export const MAX_ALT_ACC = 20

export const emptyGps = (): RunGps => ({ top: 0, drop: 0, dist: 0, fixes: 0, speeds: [], alts: [] })

/** Afstand in meter tussen twee punten (haversine). */
export function meters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371e3
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const round1 = (x: number) => Math.round(x * 10) / 10

export function addFix(g: RunGps, f: Fix): RunGps {
  if (!(f.acc <= MAX_ACC) || !Number.isFinite(f.lat) || !Number.isFinite(f.lon)) return g
  if (g.last && f.t <= g.last.t) return g
  const p = { lat: f.lat, lon: f.lon, t: f.t }
  // GPS-sprong: sneller dan kan vanaf de vorige fix? Dan deze overslaan (ook voor de afstand)
  if (g.last && (meters(g.last, p) / ((f.t - g.last.t) / 1000)) * 3.6 > MAX_KMH) return g

  // snelheid: die van het toestel, anders uit de afstand tot de vorige fix
  let speeds = g.speeds
  if (g.last) {
    const dt = (f.t - g.last.t) / 1000
    const d = meters(g.last, p)
    // zelf rekenen alleen als je verder ging dan de ruis; anders sta je zo goed als stil
    const kmh = f.speed !== null && f.speed >= 0 ? f.speed * 3.6 : dt >= 1 ? (d < f.acc ? 0 : (d / dt) * 3.6) : null
    if (kmh !== null && kmh <= MAX_KMH) speeds = [...speeds, kmh].slice(-3)
  } else if (f.speed !== null && f.speed >= 0 && f.speed * 3.6 <= MAX_KMH) speeds = [f.speed * 3.6]
  const top = speeds.length === 3 ? Math.max(g.top, median(speeds)) : g.top

  // afstand: pas tellen als je echt van je ankerpunt weg bent, anders telt stilstaan (ruis) mee
  let dist = g.dist
  let anchor = g.anchor ?? p
  const moved = meters(anchor, p)
  if (moved >= Math.max(5, f.acc / 2)) {
    dist += moved
    anchor = p
  }

  // hoogte: gemiddelde van de laatste drie, en het grootste stuk omlaag vanaf het hoogste punt
  let { alts, maxAlt, drop } = g
  if (f.alt !== null && Number.isFinite(f.alt) && (f.altAcc === null || f.altAcc <= MAX_ALT_ACC)) {
    alts = [...alts, f.alt].slice(-3)
    const sm = alts.reduce((a, b) => a + b, 0) / alts.length
    maxAlt = Math.max(maxAlt ?? sm, sm)
    drop = Math.max(drop, maxAlt - sm)
  }

  return { top: round1(top), drop: Math.round(drop), dist: Math.round(dist), fixes: g.fixes + 1, last: p, anchor, speeds, alts, maxAlt }
}

export interface DayGps {
  top: number
  drop: number
  dist: number
  /** runs met GPS */
  runs: number
}

/** De dag bij elkaar: hoogste topsnelheid, en hoogtemeters en afstand opgeteld. */
export function dayGps(runs: { gps?: RunGps }[]): DayGps | null {
  const withGps = runs.filter((r) => r.gps && r.gps.fixes > 0).map((r) => r.gps!)
  if (!withGps.length) return null
  return {
    top: Math.max(...withGps.map((g) => g.top)),
    drop: withGps.reduce((a, g) => a + g.drop, 0),
    dist: withGps.reduce((a, g) => a + g.dist, 0),
    runs: withGps.length,
  }
}

export const fmtKmh = (kmh: number) => `${Math.round(kmh)} km/u`
export const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`)

export function toFix(p: GeolocationPosition): Fix {
  const c = p.coords
  return { lat: c.latitude, lon: c.longitude, alt: c.altitude, altAcc: c.altitudeAccuracy, acc: c.accuracy, speed: c.speed, t: p.timestamp }
}

export function gpsError(e: GeolocationPositionError): string {
  if (e.code === 1) return 'Geen toestemming voor je locatie. Zet hem aan in Instellingen > Privacy > Locatie.'
  if (e.code === 3) return 'Nog geen GPS. Sta even stil onder de open lucht.'
  return 'Je telefoon geeft nu geen locatie.'
}

/** Volgt je locatie; geeft een stop-functie terug. */
export function watchFixes(onFix: (f: Fix) => void, onError: (msg: string, fatal: boolean) => void): () => void {
  if (!navigator.geolocation) {
    onError('Je telefoon geeft geen locatie.', true)
    return () => {}
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onFix(toFix(p)),
    (e) => onError(gpsError(e), e.code === 1),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
  )
  return () => navigator.geolocation.clearWatch(id)
}
