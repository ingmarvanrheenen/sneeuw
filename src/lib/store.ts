import { useSyncExternalStore } from 'react'

/** Piepklein global-state patroon: één waarde + subscribers. */
export function createStore<T>(initial: T) {
  let value = initial
  const subs = new Set<() => void>()
  return {
    get: () => value,
    set(next: T | ((prev: T) => T)) {
      value = typeof next === 'function' ? (next as (p: T) => T)(value) : next
      subs.forEach((fn) => fn())
    },
    subscribe(fn: () => void) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    use(): T {
      return useSyncExternalStore(this.subscribe, this.get, this.get)
    },
  }
}
