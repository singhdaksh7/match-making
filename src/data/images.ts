// Curated Unsplash photography per category. Components must use <ImageWithFallback />
// so a broken/rotated URL never breaks the catalogue-quality visual experience.

const u = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`

export const CATEGORY_IMAGES: Record<string, string[]> = {
  kurtis: [
    u('photo-1618932260643-eee4a2f652a6'),
    u('photo-1614251055880-ee96e4803393'),
    u('photo-1622470953794-aa9c70b0fb9d'),
    u('photo-1610030469983-98e550d6193c'),
    u('photo-1596755094514-f87e34085b2c'),
  ],
  leggings: [
    u('photo-1591369822096-ffd140ec948f'),
    u('photo-1600185365483-26d7a4cc7519'),
    u('photo-1521572267360-ee0c2909d518'),
  ],
  tshirts: [
    u('photo-1521572163474-6864f9cf17ab'),
    u('photo-1503341504253-dff4815485f1'),
    u('photo-1576566588028-4147f3842f27'),
    u('photo-1552374196-c4e7ffc6e126'),
  ],
  'kurti-sets': [
    u('photo-1610030469983-98e550d6193c'),
    u('photo-1571908599407-cdb918ed83bf'),
    u('photo-1596755094514-f87e34085b2c'),
  ],
  denim: [
    u('photo-1542060748-10c28b62716f'),
    u('photo-1541099649105-f69ad21f3246'),
    u('photo-1516762689617-e1cffcef479d'),
    u('photo-1594633312681-425c7b97ccd1'),
  ],
  shirts: [
    u('photo-1620799140408-edc6dcb6d633'),
    u('photo-1602810318383-e386cc2a3ccf'),
    u('photo-1594938298603-c8148c4dae35'),
  ],
  'co-ord-sets': [
    u('photo-1551048632-24e444b48a3e'),
    u('photo-1490481651871-ab68de25d43d'),
    u('photo-1445205170230-053b83016050'),
  ],
  palazzo: [
    u('photo-1610030469983-98e550d6193c'),
    u('photo-1622470953794-aa9c70b0fb9d'),
  ],
  tops: [
    u('photo-1441986300917-64674bd600d8'),
    u('photo-1489987707025-afc232f7ea0f'),
    u('photo-1441984904996-e0b6ba687e04'),
  ],
}

export function imagesForCategory(slug: string, count = 3): string[] {
  const pool = CATEGORY_IMAGES[slug] ?? CATEGORY_IMAGES.tops
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(pool[i % pool.length])
  return out
}
