import type { Collection } from '@/types'
import { PRODUCTS } from './products'

const daysAgo = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString() }
const cover = (index: number) => PRODUCTS[index]?.media.find((m) => m.isPrimary)?.url ?? PRODUCTS[index]?.media[0]?.url ?? ''

export const COLLECTIONS: Collection[] = [
  { id: 'collection-september', name: 'September New Arrivals', description: 'Fresh kurtis, leggings, kurti sets and co-ords curated for the festive buying season.', coverImage: cover(0), productIds: PRODUCTS.slice(0, 18).map((p) => p.id), status: 'active', createdAt: daysAgo(5) },
  { id: 'collection-festive', name: 'Festive Collection 2026', description: 'Elevated embroidered silhouettes for festive wholesale counters.', coverImage: cover(4), productIds: PRODUCTS.slice(3, 15).map((p) => p.id), status: 'active', createdAt: daysAgo(18) },
  { id: 'collection-premium', name: 'Premium Kurti Collection', description: 'Premium fabrics and detailed finishing in our best-loved kurti range.', coverImage: cover(1), productIds: PRODUCTS.slice(0, 10).map((p) => p.id), status: 'active', createdAt: daysAgo(30) },
  { id: 'collection-winter', name: 'Winter Collection', description: 'Layer-friendly designs prepared for the next season.', coverImage: cover(17), productIds: PRODUCTS.slice(15, 24).map((p) => p.id), status: 'active', createdAt: daysAgo(42) },
  { id: 'collection-ready', name: 'Ready Stock', description: 'Fast-moving designs available for immediate dispatch.', coverImage: cover(8), productIds: PRODUCTS.filter((p) => p.status === 'active').slice(0, 16).map((p) => p.id), status: 'active', createdAt: daysAgo(2) },
]
