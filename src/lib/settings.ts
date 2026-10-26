import { createStore } from './store'

export interface Settings {
  theme: 'system' | 'dark' | 'light'
  sounds: boolean
  /** animaties spiegelen voor goofy */
  goofy: boolean
}

const KEY = 'sd-settings'

function load(): Settings {
  const fallback: Settings = { theme: 'system', sounds: true, goofy: false }
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
