import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import {
  calculateReturn,
  sourceSchema,
  type HoldingView,
  type MarketRow,
} from '../../shared/tracker.js'
import { DataError } from './valuations.js'

export const holdingSchema = z
  .object({
    playerId: z.number().int().positive(),
    sourceName: sourceSchema,
    contextKey: z.string().min(1).max(100),
    portfolio: z.string().trim().min(1).max(120),
    acquiredAt: z.string().datetime({ offset: true }),
    costBasis: z.number().finite().min(0).max(1_000_000_000),
    targetRoi: z.number().finite().min(0).max(10_000),
    notes: z.string().trim().max(2000).default(''),
  })
  .strict()

export async function addHolding(db: PrismaClient, input: unknown) {
  const data = holdingSchema.parse(input)
  if (Date.parse(data.acquiredAt) > Date.now())
    throw new DataError('Acquisition date cannot be in the future.')
  const observation = await db.valuation.findFirst({
    where: {
      playerId: data.playerId,
      contextKey: data.contextKey,
      source: { name: data.sourceName },
    },
  })
  if (!observation)
    throw new DataError('Choose a player and valuation context with an observed value.')
  return db.holding.create({ data: { ...data, acquiredAt: new Date(data.acquiredAt) } })
}

export async function closeHolding(db: PrismaClient, id: string, input: unknown) {
  const data = z
    .object({
      proceeds: z.number().finite().min(0).max(1_000_000_000),
      closedAt: z.string().datetime({ offset: true }),
    })
    .strict()
    .parse(input)
  return db.$transaction(async (tx) => {
    const holding = await tx.holding.findUnique({ where: { id } })
    if (!holding) throw new DataError('Acquisition not found.', 404)
    if (holding.closedAt) throw new DataError('This acquisition already has a recorded exit.', 409)
    const closedAt = new Date(data.closedAt)
    if (+closedAt < +holding.acquiredAt || +closedAt > Date.now())
      throw new DataError('Exit date must be between acquisition and now.')
    return tx.holding.update({ where: { id }, data: { proceeds: data.proceeds, closedAt } })
  })
}

export async function getHoldings(db: PrismaClient, market: MarketRow[]): Promise<HoldingView[]> {
  const lots = await db.holding.findMany({
    include: { player: true },
    orderBy: { acquiredAt: 'desc' },
  })
  // A row whose source is no longer recognized is skipped, not thrown on. One unreadable
  // holding must not take down the whole dashboard response.
  return lots.flatMap((h) => {
    const sourceName = sourceSchema.safeParse(h.sourceName)
    if (!sourceName.success) return []
    const quote = market.find(
      (r) =>
        r.playerId === h.playerId && r.source === h.sourceName && r.contextKey === h.contextKey,
    )
    // An observation before purchase cannot establish a current return on that purchase.
    const current = quote && Date.parse(quote.capturedAt) >= +h.acquiredAt ? quote : undefined
    const basisValue = h.closedAt ? h.proceeds : (current?.value ?? null)
    return [
      {
        id: h.id,
        acquisitionKey: h.originMovementId ?? `manual:${h.id}`,
        playerId: h.playerId,
        playerName: h.player.name,
        sourceName: sourceName.data,
        contextKey: h.contextKey,
        contextLabel: quote?.contextLabel ?? 'Unknown format',
        portfolio: h.portfolio,
        acquiredAt: h.acquiredAt.toISOString(),
        costBasis: h.costBasis,
        targetRoi: h.targetRoi,
        notes: h.notes,
        closedAt: h.closedAt?.toISOString() ?? null,
        proceeds: h.proceeds,
        automated: h.originMovementId !== null,
        reviewReason: h.reviewReason,
        currentValue: current?.value ?? null,
        capturedAt: current?.capturedAt ?? null,
        ...calculateReturn(h.costBasis, basisValue, h.targetRoi),
      },
    ]
  })
}
