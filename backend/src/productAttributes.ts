import type { Prisma } from '@prisma/client'
import { prisma } from './db.js'
import { HttpError } from './http.js'

export const productInclude = {
  category: { include: { categoryAttributes: true } },
  media: true,
  attributes: { include: { attribute: true } },
  allowedValues: { include: { attributeValue: { include: { attribute: true } } } },
  variants: { include: { attributeValues: { include: { attributeValue: { include: { attribute: true } } } } } },
} satisfies Prisma.ProductInclude

export async function loadCategoryForBusiness(businessId: string, categoryId: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, businessId },
    include: { categoryAttributes: true },
  })
  if (!category) throw new HttpError(400, 'Invalid category', 'VALIDATION_ERROR')
  return category
}

export async function resolveProductAttributeSelection(
  businessId: string,
  categoryId: string,
  attributeIds: string[],
  allowedAttributeValueIds: string[],
) {
  const category = await loadCategoryForBusiness(businessId, categoryId)
  const categoryAttrIds = new Set(category.categoryAttributes.map((row) => row.attributeId))

  if (attributeIds.length) {
    const attributes = await prisma.attribute.findMany({ where: { id: { in: attributeIds }, businessId } })
    if (attributes.length !== attributeIds.length) throw new HttpError(400, 'One or more attributes are invalid', 'VALIDATION_ERROR')
    for (const attribute of attributes) {
      if (!categoryAttrIds.has(attribute.id)) {
        throw new HttpError(400, `Attribute "${attribute.name}" is not assigned to this category`, 'VALIDATION_ERROR')
      }
    }
  }

  const values = allowedAttributeValueIds.length
    ? await prisma.attributeValue.findMany({
        where: { id: { in: allowedAttributeValueIds }, attribute: { businessId } },
        include: { attribute: true },
      })
    : []
  if (values.length !== allowedAttributeValueIds.length) {
    throw new HttpError(400, 'One or more attribute values are invalid', 'VALIDATION_ERROR')
  }

  for (const value of values) {
    if (!categoryAttrIds.has(value.attributeId)) {
      throw new HttpError(400, `Attribute "${value.attribute.name}" is not assigned to this category`, 'VALIDATION_ERROR')
    }
  }

  const resolvedAttributeIds = [...new Set([...attributeIds, ...values.map((value) => value.attributeId)])]
  return { category, values, attributeIds: resolvedAttributeIds }
}

export async function assertVariantAttributeValues(params: {
  businessId: string
  categoryId: string
  allowedAttributeValueIds: Iterable<string>
  attributeValueIds: string[]
  assignments?: { attributeId: string; attributeValueId: string }[]
}) {
  const allowed = new Set(params.allowedAttributeValueIds)
  const category = await loadCategoryForBusiness(params.businessId, params.categoryId)
  const categoryAttrIds = new Set(category.categoryAttributes.map((row) => row.attributeId))
  const values = params.attributeValueIds.length
    ? await prisma.attributeValue.findMany({
        where: { id: { in: params.attributeValueIds } },
        include: { attribute: true },
      })
    : []
  if (values.length !== params.attributeValueIds.length) {
    throw new HttpError(400, 'One or more attribute values are invalid', 'VALIDATION_ERROR')
  }

  const byId = new Map(values.map((value) => [value.id, value]))
  for (const assignment of params.assignments ?? []) {
    const value = byId.get(assignment.attributeValueId)
    if (!value || value.attributeId !== assignment.attributeId) {
      throw new HttpError(400, 'Attribute value does not belong to the specified attribute', 'VALIDATION_ERROR')
    }
  }

  const seenAttributes = new Set<string>()
  for (const value of values) {
    if (value.attribute.businessId !== params.businessId) {
      throw new HttpError(400, 'One or more attribute values are invalid', 'VALIDATION_ERROR')
    }
    if (!categoryAttrIds.has(value.attributeId)) {
      throw new HttpError(400, `Attribute "${value.attribute.name}" is not assigned to this product's category`, 'VALIDATION_ERROR')
    }
    if (!allowed.has(value.id)) {
      throw new HttpError(400, `"${value.value}" is not enabled for this product`, 'VALIDATION_ERROR')
    }
    if (seenAttributes.has(value.attributeId)) {
      throw new HttpError(400, `A variant can only use one value for ${value.attribute.name}`, 'VALIDATION_ERROR')
    }
    seenAttributes.add(value.attributeId)
  }

  return values
}

export async function assertUniqueVariantCombination(productId: string, attributeValueIds: string[], excludeVariantId?: string) {
  const variants = await prisma.productVariant.findMany({
    where: { productId, ...(excludeVariantId ? { id: { not: excludeVariantId } } : {}) },
    include: { attributeValues: true },
  })
  const key = [...attributeValueIds].sort().join('|')
  for (const variant of variants) {
    const existing = variant.attributeValues.map((row) => row.attributeValueId).sort().join('|')
    if (existing === key) throw new HttpError(409, 'A variant with this combination already exists', 'CONFLICT')
  }
}

export async function assertAllowedValuesNotInUse(productId: string, nextAllowedIds: string[]) {
  const current = await prisma.productAttributeValue.findMany({
    where: { productId },
    include: { attributeValue: true },
  })
  const next = new Set(nextAllowedIds)
  for (const row of current) {
    if (next.has(row.attributeValueId)) continue
    const count = await prisma.variantAttributeValue.count({
      where: { attributeValueId: row.attributeValueId, variant: { productId } },
    })
    if (count > 0) {
      throw new HttpError(
        409,
        `${row.attributeValue.value} cannot be removed because it is currently used by ${count} variant${count === 1 ? '' : 's'}.`,
        'CONFLICT',
      )
    }
  }
}

export async function assertAttributeValueUnused(businessId: string, valueId: string) {
  const value = await prisma.attributeValue.findFirst({
    where: { id: valueId, attribute: { businessId } },
    include: { _count: { select: { variantValues: true, productValues: true } } },
  })
  if (!value) throw new HttpError(404, 'Attribute value not found', 'NOT_FOUND')
  if (value._count.variantValues > 0 || value._count.productValues > 0) {
    throw new HttpError(409, 'This attribute value cannot be deleted because it is used by products or variants.', 'CONFLICT')
  }
  return value
}

export function isUniqueConstraint(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002'
}
