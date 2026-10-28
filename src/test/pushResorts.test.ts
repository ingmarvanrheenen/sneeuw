import { describe, expect, it } from 'vitest'
import { RESORT_COORDS } from '../../supabase/functions/push/resorts'
import { RESORTS } from '../content/resorts'

describe('resorts op de server', () => {
  it('zelfde coördinaten als in de app, voor elk buitenresort (pas aan als je een resort toevoegt)', () => {
    const fromApp = Object.fromEntries(
      RESORTS.filter((r) => !r.indoor).map((r) => [r.id, { lat: r.lat, lon: r.lon, elevation: Math.round((r.base + r.top) / 2) }]),
    )
    expect(RESORT_COORDS).toEqual(fromApp)
  })
})
