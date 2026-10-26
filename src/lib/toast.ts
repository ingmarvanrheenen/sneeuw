import { createStore } from './store'
import { confetti } from './confetti'
import { sfx } from './sounds'
import type { IconName } from '../design/icons'

export interface Toast {
  id: number
  title: string
  body?: string
  icon?: IconName
  tone?: 'default' | 'success' | 'error' | 'badge' | 'level'
}

export const toastStore = createStore<Toast[]>([])
let n = 0

export function toast(t: Omit<Toast, 'id'>, ms = 3200) {
  const id = ++n
  toastStore.set((list) => [...list, { ...t, id }].slice(-2))
  setTimeout(() => toastStore.set((list) => list.filter((x) => x.id !== id)), ms)
}

export function celebrate(kind: 'badge' | 'level' | 'landed' | 'goal', title: string, body?: string, icon?: IconName) {
  if (kind === 'level') {
    sfx.levelUp()
    confetti(1.4)
  } else if (kind === 'badge') {
    sfx.badge()
    confetti(1)
  } else {
    sfx.success()
    confetti(0.6)
  }
  toast({ title, body, icon, tone: kind === 'level' ? 'level' : kind === 'badge' ? 'badge' : 'success' }, 4200)
}
