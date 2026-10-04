import { useState } from 'octane'

export function usePreference(key: string, fallback: boolean) {
  const storageKey = `block.${key}`
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      return stored === 'true' ? true : stored === 'false' ? false : fallback
    } catch { return fallback }
  })
  const update = (next: boolean) => {
    // Persist in the user action so navigating away cannot discard a pending effect.
    try { localStorage.setItem(storageKey, String(next)) } catch { /* Preference still applies to this session. */ }
    setValue(next)
  }
  return [value, update] as const
}
