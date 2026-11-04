import { createStore } from './store'

export interface Settings {
  theme: 'system' | 'dark' | 'light'
  sounds: boolean
  /** animaties spiegelen voor goofy */
  goofy: boolean
  /** scherm aan houden tijdens een run met GPS (iOS geeft geen locatie met het scherm uit) */
  runAwake: boolean
  /** spraakmemo's omzetten naar tekst (gaat naar OpenAI), voor de dagreview */
  memoText: boolean
}

const KEY = 'sd-settings'

function load(): Settings {
  const fallback: Settings = { theme: 'system', sounds: true, goofy: false, runAwake: false, memoText: false }
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return fallback
  }
}

export const settingsStore = createStore<Settings>(load())

export function applyTheme(theme: Settings['theme']) {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  try {
    localStorage.setItem('sd-theme', theme)
  } catch {
    /* privémodus */
  }
}

export function updateSettings(patch: Partial<Settings>) {
  settingsStore.set((s) => {
    const next = { ...s, ...patch }
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* privémodus */
    }
    if (patch.theme) applyTheme(patch.theme)
    return next
  })
}
