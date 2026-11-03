// Eerste keer openen: vier stappen om op gang te komen. Afgeleid uit je data (niks opgeslagen behalve "verborgen"):
// een stap is af zodra je hem echt deed, ook als je hem buiten deze lijst om deed.
import { kvGet, kvSet } from './db'
import { createStore } from './store'
import type { IconName } from '../design/icons'

export interface StartState {
  /** naam of mascotte op je skipas */
  hasPass: boolean
  days: number
  tricks: number
  crews: number
  /** zonder server bestaat er geen crew */
  backend: boolean
}

export interface StartStep {
  id: 'pas' | 'dag' | 'trick' | 'crew'
  title: string
  detail: string
  icon: IconName
  to: string
  done: boolean
}

export function startSteps(s: StartState): StartStep[] {
  const steps: StartStep[] = [
    { id: 'pas', title: 'Maak je skipas', detail: 'Je naam en je eigen mascotte', icon: 'user', to: '/rider/ik', done: s.hasPass },
    {
      id: 'dag',
      title: 'Log je eerste dag',
      detail: 'Waar, hoe lang, en hoe vaak je viel',
      icon: 'log',
      to: '/log/nieuw',
      done: s.days > 0,
    },
    { id: 'trick', title: 'Kies een trick', detail: 'Zet hem op bezig in de trickbijbel', icon: 'book', to: '/tricks', done: s.tricks > 0 },
    {
      id: 'crew',
      title: 'Join je crew',
      detail: 'Met een code van een vriend, of start er een',
      icon: 'crew',
      to: '/crew',
      done: s.crews > 0,
    },
  ]
  return s.backend ? steps : steps.filter((x) => x.id !== 'crew')
}

const KEY = 'startHidden'
export const startHidden = createStore<boolean>(false)
export async function loadStartHidden() {
  const v = await kvGet<boolean>(KEY, false)
  startHidden.set(v)
  return v
}
export async function hideStart() {
  await kvSet(KEY, true)
  startHidden.set(true)
}
