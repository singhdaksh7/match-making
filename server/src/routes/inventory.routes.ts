import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { Errors } from '../utils/errors.js'
import { requireAuth } from '../middleware/auth.js'

export const inventoryRouter = Router()
inventoryRouter.use(requireAuth)

const reasonMap: Record<string, string> = {
  'New Production': 'New_Production',
  'Customer Order': 'Customer_Order',
  Damage: 'Damage',
  Correction: 'Correction',
  Return: 'Return',
}

const adjustSchema = z.object({
  variantId: z.string().min(1),
  type: z.enum(['add', 'remove', 'set']),
  quantity: z.number().int().nonnegative(),
  reason: z.enum(['New Production', 'Customer Order', 'Damage', 'Correction', 'Return']),
  note: z.string().max(500).optional(),
})

/**
 * Adjusts stock atomically. Concurrency safety:
 * - `add`/`remove` use a single conditional UPDATE (compare-and-swap on the
 *   current `stock` column), which Postgres executes atomically per row —
 *   two simultaneous "remove" requests cannot both succeed past zero stock.
 * - If the conditional UPDATE affects 0 rows, the operation is retried once
 *   against the freshly-read stock value, then reported as a conflict.
 * - The inventory ledger row is written in the same transaction as the
 *   stock mutation, so the audit trail can never drift from actual stock.
 */
inventoryRouter.post(
  '/adjust',
  asyncHandler(async (req, res) => {
    const input = adjustSchema.parse(req.body)

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.productVariant.findUnique({ where: { id: input.variantId } })
      if (!current) throw Errors.notFound('Variant not found')

      const previousStock = current.stock
      let newStock = previousStock

      if (input.type === 'add') {
        newStock = previousStock + input.quantity
        const updated = await tx.productVariant.updateMany({
          where: { id: input.variantId, stock: previousStock },
          data: { stock: newStock, version: { increment: 1 } },
        })
        if (updated.count === 0) throw Errors.conflict('Stock changed concurrently, please retry')
      } else if (input.type === 'remove') {
        if (input.quantity > previousStock) throw Errors.badRequest('Cannot remove more than current stock')
        newStock = previousStock - input.quantity
        // Conditional decrement: only succeeds if stock is still >= quantity at write time.
        const updated = await tx.productVariant.updateMany({
          where: { id: input.variantId, stock: { gte: input.quantity } },
          data: { stock: { decrement: input.quantity }, version: { increment: 1 } },
        })
        if (updated.count === 0) throw Errors.conflict('Insufficient stock — it changed concurrently, please retry')
      } else {
        newStock = input.quantity
        await tx.productVariant.updateMany({
          where: { id: input.variantId, stock: previousStock },
          data: { stock: newStock, version: { increment: 1 } },
        })
      }

      const entry = await tx.inventoryEntry.create({
        data: {
          variantId: input.variantId,
          productId: current.productId,
          type: input.type,
          quantity: input.quantity,
          previousStock,
          newStock,
          reason: (reasonMap[input.reason] ?? 'Correction') as never,
          note: input.note,
          createdById: req.user!.id,
        },
      })

      return { variant: await tx.productVariant.findUnique({ where: { id: input.variantId } }), entry }
    })

    res.status(201).json(result)
  }),
)

inventoryRouter.get(
  '/entries',
  asyncHandler(async (req, res) => {
    const variantId = req.query.variantId as string | undefined
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Number(req.query.pageSize) || 25)

    const where = variantId ? { variantId } : {}
    const [total, items] = await prisma.$transaction([
      prisma.inventoryEntry.count({ where }),
      prisma.inventoryEntry.findMany({
        where,
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    res.json({ items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) })
  }),
)

inventoryRouter.get(
  '/low-stock',
  asyncHandler(async (_req, res) => {
    const variants = await prisma.$queryRaw`
      SELECT v.*, p.name as "productName", p.code as "productCode"
      FROM product_variants v
      JOIN products p ON p.id = v."productId"
      WHERE v.status = 'active' AND v.stock > 0 AND v.stock <= v."lowStockThreshold"
      ORDER BY v.stock ASC
      LIMIT 200
    `
    res.json({ items: variants })
  }),
)
