import type { Attribute, AttributeValue } from '@/types'

let valueCounter = 0
const v = (value: string, hex?: string): AttributeValue => ({
  id: `av-${++valueCounter}`,
  value,
  hex,
})

export const COLORS: AttributeValue[] = [
  v('Black', '#1a1a1a'),
  v('White', '#ffffff'),
  v('Red', '#d32f2f'),
  v('Maroon', '#7b1e2b'),
  v('Wine', '#5c1a2e'),
  v('Navy', '#1b2a4a'),
  v('Royal Blue', '#2547a8'),
  v('Sky Blue', '#7ec8e3'),
  v('Bottle Green', '#0b3d2e'),
  v('Olive', '#5c5a2e'),
  v('Mint', '#a8e6cf'),
  v('Mustard', '#d9a441'),
  v('Yellow', '#f2c744'),
  v('Orange', '#e07a2f'),
  v('Peach', '#f7c9a3'),
  v('Pink', '#f2a1c2'),
  v('Rani Pink', '#d6266e'),
  v('Lavender', '#c6b6e2'),
  v('Purple', '#6a3f8f'),
  v('Beige', '#e8dcc8'),
  v('Cream', '#f5f0e1'),
  v('Brown', '#6b4226'),
  v('Grey', '#9a9a9a'),
  v('Charcoal', '#36393b'),
  v('Teal', '#1f6f6f'),
]

export const ATTRIBUTES: Attribute[] = [
  {
    id: 'attr-fabric',
    name: 'Fabric',
    type: 'text',
    values: [
      v('Rayon'), v('Cotton'), v('Georgette'), v('Linen'),
      v('Viscose'), v('Denim'), v('Polyester'), v('Chiffon'),
    ],
  },
  {
    id: 'attr-color',
    name: 'Color',
    type: 'color',
    values: COLORS,
  },
  {
    id: 'attr-size',
    name: 'Size',
    type: 'size',
    values: [v('S'), v('M'), v('L'), v('XL'), v('XXL'), v('3XL'), v('Free Size')],
  },
  {
    id: 'attr-pattern',
    name: 'Pattern',
    type: 'text',
    values: [v('Floral'), v('Solid'), v('Printed'), v('Embroidered'), v('Striped'), v('Checked')],
  },
  {
    id: 'attr-print',
    name: 'Print',
    type: 'text',
    values: [v('Graphic'), v('Typography'), v('Abstract'), v('Solid'), v('Floral')],
  },
  {
    id: 'attr-fit',
    name: 'Fit',
    type: 'text',
    values: [v('Slim'), v('Regular'), v('Relaxed'), v('Oversized'), v('Straight')],
  },
  {
    id: 'attr-work',
    name: 'Work',
    type: 'text',
    values: [v('Plain'), v('Thread Work'), v('Mirror Work'), v('Zari Work'), v('Lace')],
  },
  {
    id: 'attr-wash',
    name: 'Wash',
    type: 'text',
    values: [v('Light Wash'), v('Dark Wash'), v('Mid Wash'), v('Raw Denim'), v('Acid Wash')],
  },
  {
    id: 'attr-length',
    name: 'Length',
    type: 'text',
    values: [v('Short'), v('Knee Length'), v('Ankle Length'), v('Floor Length')],
  },
  {
    id: 'attr-waist',
    name: 'Waist Size',
    type: 'size',
    values: [v('28'), v('30'), v('32'), v('34'), v('36'), v('38')],
  },
]

export const attrById = (id: string) => ATTRIBUTES.find((a) => a.id === id)!
