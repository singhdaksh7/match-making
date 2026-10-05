const PREFIX = 'vastraa:'

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveJSON<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // ignore quota errors in prototype
  }
}

export function clearAll() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k))
}

export const STORAGE_KEYS = {
  auth: 'auth',
  products: 'products',
  variants: 'variants',
  categories: 'categories',
  attributes: 'attributes',
  customers: 'customers',
  catalogues: 'catalogues',
  enquiries: 'enquiries',
  notifications: 'notifications',
  settings: 'settings',
  seededAt: 'seeded_at',
  demoDataVersion: 'demo_data_version',
} as const
