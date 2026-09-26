import type { Product, ProductVariant, VariantAttributes } from '@/types'
import { ATTRIBUTES } from './attributes'
import { imagesForCategory } from './images'

interface SeedProductConfig {
  code: string
  name: string
  categoryId: string
  categorySlug: string
  description: string
  fabrics?: string[]
  colors: string[]
  sizes?: string[]
  waists?: string[]
  fits?: string[]
  washes?: string[]
  pattern?: string
  print?: string
  work?: string
  basePrice: number
  moq: number
  daysAgo: number
  views: number
  explicitCombos?: { fabric?: string; color: string; size: string }[]
}

let productSeq = 100
let variantSeqGlobal = 0

const SKU_ABBR: Record<string, string> = {
  Rayon: 'RAY', Cotton: 'COT', Georgette: 'GEO', Linen: 'LIN',
  Viscose: 'VIS', Denim: 'DNM', Polyester: 'POL', Chiffon: 'CHF',
}
const colorAbbr = (c: string) =>
  c.split(' ').map((w) => w.slice(0, 1)).join('').toUpperCase() + c.replace(/[^A-Z]/gi, '').slice(1, 3).toUpperCase()

function daysAgoIso(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function buildVariants(
  productId: string,
  code: string,
  dims: { fabric?: string; color: string; size: string }[],
  basePrice: number,
): ProductVariant[] {
  return dims.map((d, i) => {
    variantSeqGlobal++
    const parts = [code, d.fabric ? SKU_ABBR[d.fabric] ?? d.fabric.slice(0, 3).toUpperCase() : null, colorAbbr(d.color).slice(0, 3), d.size]
      .filter(Boolean)
    const priceJitter = (i % 5) * 5
    const stockSeed = (i * 37 + code.length * 13) % 60
    const stock = Math.max(0, stockSeed - (i % 7 === 0 ? 50 : 0))
    const attributes: VariantAttributes = { color: d.color, size: d.size }
    if (d.fabric) attributes.fabric = d.fabric
    return {
      id: `var-${productId}-${i}`,
      productId,
      sku: parts.join('-'),
      attributes,
      price: basePrice + priceJitter,
      stock,
      reserved: stock > 10 ? Math.min(4, Math.floor(stock / 10)) : 0,
      status: 'active',
      lowStockThreshold: 10,
    }
  })
}

function cartesian(fabrics: string[] | undefined, colors: string[], sizes: string[]) {
  const dims: { fabric?: string; color: string; size: string }[] = []
  const fabs = fabrics && fabrics.length ? fabrics : [undefined]
  for (const f of fabs) {
    for (const c of colors) {
      for (const s of sizes) {
        dims.push(f ? { fabric: f, color: c, size: s } : { color: c, size: s })
      }
    }
  }
  return dims
}

function valueIds(attrId: string, names: string[]) {
  const attr = ATTRIBUTES.find((item) => item.id === attrId)
  if (!attr) return []
  return names.map((name) => attr.values.find((item) => item.value === name)?.id).filter((id): id is string => Boolean(id))
}

const CONFIGS: SeedProductConfig[] = [
  // ---------- Kurtis ----------
  { code: 'K-101', name: 'Floral Rayon Straight Kurti', categoryId: 'cat-kurtis', categorySlug: 'kurtis', description: 'A breathable rayon straight-cut kurti with an all-over floral print, tailored for everyday wholesale demand.', fabrics: ['Rayon'], colors: ['Black', 'Maroon'], sizes: ['L', 'XL'], pattern: 'Floral', work: 'Plain', basePrice: 425, moq: 12, daysAgo: 3, views: 186, explicitCombos: [{ fabric: 'Rayon', color: 'Black', size: 'XL' }, { fabric: 'Rayon', color: 'Maroon', size: 'L' }] },
  { code: 'K-102', name: 'Embroidered A-Line Kurti', categoryId: 'cat-kurtis', categorySlug: 'kurtis', description: 'A-line silhouette kurti finished with fine thread embroidery on the yoke.', fabrics: ['Georgette', 'Rayon'], colors: ['Wine', 'Peach', 'Cream'], sizes: ['S', 'M', 'L', 'XL'], pattern: 'Embroidered', work: 'Thread Work', basePrice: 550, moq: 10, daysAgo: 6, views: 142 },
  { code: 'K-103', name: 'Premium Cotton Printed Kurti', categoryId: 'cat-kurtis', categorySlug: 'kurtis', description: 'Premium cotton kurti in a vivid printed pattern, popular for daily-wear wholesale orders.', fabrics: ['Cotton'], colors: ['Mustard', 'Teal', 'Maroon', 'White'], sizes: ['M', 'L', 'XL'], pattern: 'Printed', work: 'Plain', basePrice: 380, moq: 15, daysAgo: 11, views: 98 },
  { code: 'K-104', name: 'Chiffon Layered Kurti', categoryId: 'cat-kurtis', categorySlug: 'kurtis', description: 'Flowy chiffon kurti with a layered hem, finished with delicate mirror work.', fabrics: ['Chiffon'], colors: ['Rani Pink', 'Lavender', 'Sky Blue'], sizes: ['S', 'M', 'L'], pattern: 'Solid', work: 'Mirror Work', basePrice: 620, moq: 8, daysAgo: 20, views: 76 },
  { code: 'K-105', name: 'Zari Work Festive Kurti', categoryId: 'cat-kurtis', categorySlug: 'kurtis', description: 'Festive-ready kurti with intricate zari border work, crafted for the wedding season.', fabrics: ['Georgette'], colors: ['Wine', 'Bottle Green', 'Charcoal'], sizes: ['M', 'L', 'XL', 'XXL'], pattern: 'Embroidered', work: 'Zari Work', basePrice: 850, moq: 6, daysAgo: 2, views: 64 },
  { code: 'K-106', name: 'Checkered Cotton Kurti', categoryId: 'cat-kurtis', categorySlug: 'kurtis', description: 'Crisp checkered cotton kurti with a relaxed daily-wear fit.', fabrics: ['Cotton', 'Linen'], colors: ['Olive', 'Grey', 'Navy'], sizes: ['M', 'L', 'XL'], pattern: 'Checked', work: 'Plain', basePrice: 399, moq: 14, daysAgo: 34, views: 51 },
  { code: 'K-107', name: 'Striped Straight Kurti', categoryId: 'cat-kurtis', categorySlug: 'kurtis', description: 'Minimal striped kurti for retailers looking for versatile daily staples.', fabrics: ['Rayon'], colors: ['Black', 'Beige', 'White'], sizes: ['S', 'M', 'L', 'XL'], pattern: 'Striped', work: 'Plain', basePrice: 410, moq: 12, daysAgo: 45, views: 39 },

  // ---------- Leggings ----------
  { code: 'LG-201', name: 'Premium Stretch Leggings', categoryId: 'cat-leggings', categorySlug: 'leggings', description: 'Four-way stretch leggings in ankle length, a bestselling wholesale staple.', fabrics: ['Viscose', 'Cotton'], colors: ['Black', 'Navy', 'Maroon', 'Grey', 'Beige'], sizes: ['S', 'M', 'L', 'XL', 'Free Size'], basePrice: 225, moq: 20, daysAgo: 5, views: 210 },
  { code: 'LG-202', name: 'Churidar Ankle Leggings', categoryId: 'cat-leggings', categorySlug: 'leggings', description: 'Classic churidar-fit leggings tailored for a snug ankle finish.', fabrics: ['Cotton'], colors: ['White', 'Cream', 'Black', 'Charcoal'], sizes: ['M', 'L', 'XL'], basePrice: 210, moq: 20, daysAgo: 15, views: 87 },
  { code: 'LG-203', name: 'Solid Cotton Lycra Leggings', categoryId: 'cat-leggings', categorySlug: 'leggings', description: 'Everyday cotton-lycra blend leggings in bulk-friendly solid shades.', fabrics: ['Cotton', 'Polyester'], colors: ['Teal', 'Wine', 'Olive', 'Mustard'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], basePrice: 240, moq: 25, daysAgo: 28, views: 65 },

  // ---------- T-Shirts ----------
  { code: 'TS-301', name: 'Oversized Graphic T-Shirt', categoryId: 'cat-tshirts', categorySlug: 'tshirts', description: 'Heavyweight cotton oversized tee with a bold graphic print, popular with younger buyers.', fabrics: ['Cotton'], colors: ['Black', 'White', 'Grey', 'Navy'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], print: 'Graphic', fits: ['Oversized'], basePrice: 320, moq: 15, daysAgo: 4, views: 173 },
  { code: 'TS-302', name: 'Ribbed Solid T-Shirt', categoryId: 'cat-tshirts', categorySlug: 'tshirts', description: 'Ribbed cotton tee in solid colourways, made for a slim everyday fit.', fabrics: ['Cotton'], colors: ['Olive', 'Black', 'White', 'Maroon'], sizes: ['S', 'M', 'L', 'XL'], print: 'Solid', fits: ['Slim'], basePrice: 280, moq: 18, daysAgo: 9, views: 121 },
  { code: 'TS-303', name: 'Typography Print Tee', categoryId: 'cat-tshirts', categorySlug: 'tshirts', description: 'Relaxed fit tee with statement typography print, printed in small batches.', fabrics: ['Cotton', 'Polyester'], colors: ['Charcoal', 'Mustard', 'Sky Blue'], sizes: ['M', 'L', 'XL'], print: 'Typography', fits: ['Regular'], basePrice: 299, moq: 15, daysAgo: 19, views: 88 },
  { code: 'TS-304', name: 'Polo Collar Cotton Tee', categoryId: 'cat-tshirts', categorySlug: 'tshirts', description: 'Smart-casual polo collar tee for semi-formal wholesale ranges.', fabrics: ['Cotton'], colors: ['Navy', 'White', 'Bottle Green'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], print: 'Solid', fits: ['Regular'], basePrice: 350, moq: 12, daysAgo: 40, views: 47 },

  // ---------- Kurti Sets ----------
  { code: 'KS-401', name: 'Floral Kurti Pant Set', categoryId: 'cat-kurti-sets', categorySlug: 'kurti-sets', description: 'Two-piece kurti and pant set with a coordinated floral print, ready-to-ship.', fabrics: ['Rayon'], colors: ['Peach', 'Mint', 'Rani Pink'], sizes: ['S', 'M', 'L', 'XL'], pattern: 'Floral', work: 'Plain', basePrice: 699, moq: 8, daysAgo: 7, views: 156 },
  { code: 'KS-402', name: 'Embroidered Palazzo Set', categoryId: 'cat-kurti-sets', categorySlug: 'kurti-sets', description: 'Kurti and palazzo set with delicate embroidery detailing on the neckline.', fabrics: ['Georgette', 'Rayon'], colors: ['Wine', 'Navy', 'Charcoal'], sizes: ['M', 'L', 'XL'], pattern: 'Embroidered', work: 'Thread Work', basePrice: 780, moq: 6, daysAgo: 23, views: 74 },
  { code: 'KS-403', name: 'Printed Straight Set', categoryId: 'cat-kurti-sets', categorySlug: 'kurti-sets', description: 'Budget-friendly printed straight kurti set for volume orders.', fabrics: ['Cotton'], colors: ['Beige', 'Olive', 'Black'], sizes: ['M', 'L', 'XL', 'XXL'], pattern: 'Printed', work: 'Plain', basePrice: 599, moq: 10, daysAgo: 50, views: 35 },

  // ---------- Denim ----------
  { code: 'DN-501', name: 'Straight Fit Denim', categoryId: 'cat-denim', categorySlug: 'denim', description: 'Mid-rise straight fit denim in a durable stretch fabric, wholesale ready.', colors: ['Navy', 'Black'], waists: ['28', '30', '32', '34', '36'], fits: ['Straight'], washes: ['Mid Wash'], basePrice: 850, moq: 10, daysAgo: 8, views: 132 },
  { code: 'DN-502', name: 'Slim Fit Dark Wash Denim', categoryId: 'cat-denim', categorySlug: 'denim', description: 'Slim fit denim finished in a rich dark wash for a premium look.', colors: ['Charcoal', 'Navy'], waists: ['30', '32', '34', '36'], fits: ['Slim'], washes: ['Dark Wash'], basePrice: 950, moq: 8, daysAgo: 17, views: 91 },
  { code: 'DN-503', name: 'Relaxed Fit Light Wash Denim', categoryId: 'cat-denim', categorySlug: 'denim', description: 'Relaxed fit denim in a light wash, comfortable for all-day wear.', colors: ['Sky Blue', 'Grey'], waists: ['28', '30', '32', '34'], fits: ['Relaxed'], washes: ['Light Wash'], basePrice: 899, moq: 8, daysAgo: 33, views: 58 },
  { code: 'DN-504', name: 'Distressed Raw Denim', categoryId: 'cat-denim', categorySlug: 'denim', description: 'Trend-forward distressed denim in a raw, unwashed finish.', colors: ['Black', 'Navy'], waists: ['30', '32', '34'], fits: ['Slim'], washes: ['Raw Denim'], basePrice: 1150, moq: 6, daysAgo: 55, views: 29 },

  // ---------- Shirts ----------
  { code: 'SH-601', name: 'Premium Cotton Shirt', categoryId: 'cat-shirts', categorySlug: 'shirts', description: 'Crisp premium cotton shirt in solid tones, tailored for a regular fit.', fabrics: ['Cotton'], colors: ['White', 'Sky Blue', 'Charcoal'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], pattern: 'Solid', fits: ['Regular'], basePrice: 550, moq: 10, daysAgo: 10, views: 118 },
  { code: 'SH-602', name: 'Checked Casual Shirt', categoryId: 'cat-shirts', categorySlug: 'shirts', description: 'Casual checked shirt woven in breathable cotton-linen blend.', fabrics: ['Cotton', 'Linen'], colors: ['Olive', 'Navy', 'Maroon'], sizes: ['M', 'L', 'XL'], pattern: 'Checked', fits: ['Regular'], basePrice: 599, moq: 10, daysAgo: 26, views: 62 },
  { code: 'SH-603', name: 'Striped Slim Fit Shirt', categoryId: 'cat-shirts', categorySlug: 'shirts', description: 'Slim fit striped shirt suited for semi-formal wholesale ranges.', fabrics: ['Cotton'], colors: ['White', 'Sky Blue'], sizes: ['S', 'M', 'L', 'XL'], pattern: 'Striped', fits: ['Slim'], basePrice: 575, moq: 10, daysAgo: 48, views: 33 },

  // ---------- Co-ord Sets ----------
  { code: 'CS-701', name: 'Summer Co-ord Set', categoryId: 'cat-coord', categorySlug: 'co-ord-sets', description: 'Breezy summer co-ord set crafted from lightweight cotton for a relaxed silhouette.', fabrics: ['Cotton', 'Linen'], colors: ['Cream', 'Mint', 'Peach'], sizes: ['S', 'M', 'L', 'XL'], pattern: 'Solid', basePrice: 750, moq: 8, daysAgo: 12, views: 104 },
  { code: 'CS-702', name: 'Printed Shirt Co-ord Set', categoryId: 'cat-coord', categorySlug: 'co-ord-sets', description: 'Shirt-style co-ord set finished with an all-over printed pattern.', fabrics: ['Rayon'], colors: ['Rani Pink', 'Teal', 'Black'], sizes: ['M', 'L', 'XL'], pattern: 'Printed', basePrice: 820, moq: 6, daysAgo: 29, views: 57 },

  // ---------- Palazzo ----------
  { code: 'PL-801', name: 'Wide Leg Palazzo', categoryId: 'cat-palazzo', categorySlug: 'palazzo', description: 'Flowy wide-leg palazzo pants in soft rayon, a wholesale essential.', fabrics: ['Rayon', 'Viscose'], colors: ['Black', 'Navy', 'Beige', 'Olive'], sizes: ['S', 'M', 'L', 'XL', 'Free Size'], basePrice: 350, moq: 15, daysAgo: 14, views: 96 },
  { code: 'PL-802', name: 'Printed Palazzo Pants', categoryId: 'cat-palazzo', categorySlug: 'palazzo', description: 'Vibrant printed palazzo pants designed for festive collections.', fabrics: ['Georgette'], colors: ['Rani Pink', 'Mustard', 'Teal'], sizes: ['M', 'L', 'XL'], basePrice: 399, moq: 12, daysAgo: 41, views: 44 },

  // ---------- Tops ----------
  { code: 'TP-901', name: 'Ribbed Casual Top', categoryId: 'cat-tops', categorySlug: 'tops', description: 'Soft ribbed knit top designed for effortless everyday layering.', fabrics: ['Viscose', 'Cotton'], colors: ['Black', 'White', 'Lavender', 'Peach'], sizes: ['S', 'M', 'L', 'XL'], fits: ['Slim'], basePrice: 299, moq: 15, daysAgo: 16, views: 89 },
  { code: 'TP-902', name: 'Printed Flowy Top', categoryId: 'cat-tops', categorySlug: 'tops', description: 'Lightweight flowy top with a delicate printed pattern.', fabrics: ['Georgette', 'Chiffon'], colors: ['Sky Blue', 'Cream', 'Rani Pink'], sizes: ['S', 'M', 'L'], fits: ['Regular'], basePrice: 340, moq: 15, daysAgo: 31, views: 53 },
  { code: 'TP-903', name: 'Solid Wrap Top', categoryId: 'cat-tops', categorySlug: 'tops', description: 'Wrap-style solid top with a flattering tie-waist finish.', fabrics: ['Rayon'], colors: ['Wine', 'Charcoal', 'Beige'], sizes: ['M', 'L', 'XL'], fits: ['Regular'], basePrice: 320, moq: 12, daysAgo: 58, views: 22 },
  { code: 'TP-904', name: 'Oversized Cotton Top', categoryId: 'cat-tops', categorySlug: 'tops', description: 'Relaxed oversized cotton top for casual daily-wear ranges.', fabrics: ['Cotton'], colors: ['Grey', 'Olive', 'Black'], sizes: ['M', 'L', 'XL', 'XXL'], fits: ['Oversized'], basePrice: 279, moq: 15, daysAgo: 60, views: 18 },
]

export const PRODUCTS: Product[] = []
export const VARIANTS: ProductVariant[] = []

for (const cfg of CONFIGS) {
  productSeq++
  const id = `prod-${productSeq}`
  const dims = cfg.explicitCombos
    ? cfg.explicitCombos
    : cfg.waists
    ? cartesian(undefined, cfg.colors, cfg.waists)
    : cartesian(cfg.fabrics, cfg.colors, cfg.sizes ?? ['M', 'L', 'XL'])
  const variants = buildVariants(id, cfg.code, dims, cfg.basePrice)
  VARIANTS.push(...variants)

  const attributeIds = [
    cfg.fabrics ? 'attr-fabric' : null,
    'attr-color',
    cfg.waists ? 'attr-waist' : 'attr-size',
    cfg.pattern ? 'attr-pattern' : null,
    cfg.print ? 'attr-print' : null,
    cfg.fits ? 'attr-fit' : null,
    cfg.work ? 'attr-work' : null,
    cfg.washes ? 'attr-wash' : null,
  ].filter(Boolean) as string[]

  const allowedAttributeValueIds = [
    ...valueIds('attr-fabric', cfg.fabrics ?? []),
    ...valueIds('attr-color', cfg.colors),
    ...valueIds(cfg.waists ? 'attr-waist' : 'attr-size', cfg.waists ?? cfg.sizes ?? []),
    ...valueIds('attr-pattern', cfg.pattern ? [cfg.pattern] : []),
    ...valueIds('attr-print', cfg.print ? [cfg.print] : []),
    ...valueIds('attr-fit', cfg.fits ?? []),
    ...valueIds('attr-work', cfg.work ? [cfg.work] : []),
    ...valueIds('attr-wash', cfg.washes ?? []),
  ]

  PRODUCTS.push({
    id,
    code: cfg.code,
    name: cfg.name,
    categoryId: cfg.categoryId,
    description: cfg.description,
    media: imagesForCategory(cfg.categorySlug, 4).map((url, i) => ({
      id: `${id}-media-${i}`,
      url,
      isPrimary: i === 0,
    })),
    attributeIds,
    allowedAttributeValueIds,
    wholesalePrice: cfg.basePrice,
    moq: cfg.moq,
    status: 'active',
    views: cfg.views,
    createdAt: daysAgoIso(cfg.daysAgo),
    updatedAt: daysAgoIso(Math.max(0, cfg.daysAgo - 1)),
  })
}

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id)
export const variantsForProduct = (productId: string) => VARIANTS.filter((v) => v.productId === productId)
export const variantById = (id: string) => VARIANTS.find((v) => v.id === id)
