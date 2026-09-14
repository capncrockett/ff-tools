import { PrismaClient } from '@prisma/client'
import {
  matchProviderCatalogs,
  saveDtcCatalog,
  saveDynastyGmCatalog,
} from '../../src/server/services/playerCatalogs'
import { syncSource } from '../../src/server/services/sync'
import type { ValueProvider } from '../../src/server/providers/types'
import { ageOn } from '../../src/shared/playerMatching'

const db = new PrismaClient()
const seenAt = new Date('2026-09-13T12:00:00Z')
const gm = (id: number, firstName: string, lastName: string, pos: string, dob: unknown = null) => ({
  id,
  firstName,
  lastName,
  pos,
  team: 'SEA',
  dob,
  draftYear: 2022,
  status: 'Active',
})

async function clear() {
  await db.dynastyGmPlayer.deleteMany()
  await db.dtcPlayer.deleteMany()
  await db.movementResolution.deleteMany()
  await db.rosterMovement.deleteMany()
  await db.rosterSyncState.deleteMany()
  await db.holding.deleteMany()
  await db.valuation.deleteMany()
  await db.snapshot.deleteMany()
  await db.mapping.deleteMany()
  await db.source.deleteMany()
  await db.player.deleteMany()
  await db.syncRun.deleteMany()
}
beforeEach(async () => {
  await clear()
  await db.player.createMany({
    data: [
      { sleeperId: '11', name: 'Fixture Receiver', position: 'WR', birthDate: '2000-05-10' },
      { sleeperId: '12', name: 'Common Name', position: 'WR', birthDate: '1998-01-01' },
      { sleeperId: '13', name: 'Common Name', position: 'WR', birthDate: '2002-09-30' },
      { sleeperId: '14', name: 'Undated Back', position: 'RB', birthDate: null },
    ],
  })
})
afterAll(async () => {
  await clear()
  await db.$disconnect()
})
const sleeperId = async (playerId: number | null) =>
  playerId ? (await db.player.findUniqueOrThrow({ where: { id: playerId } })).sleeperId : null

test('Dynasty GM catalog rows link by birth date and wait for review otherwise', async () => {
  const saved = await saveDynastyGmCatalog(
    db,
    [
      gm(501, 'Fixture', 'Receiver', 'WR', '2000-05-10'),
      gm(502, 'Common', 'Name', 'WR', '2002-09-30'),
      gm(503, 'Common', 'Name', 'WR', 'NaN-NaN-NaN'),
      gm(504, 'Undated', 'Back', 'RB', '1999-01-01'),
      gm(505, '2027', 'Round 1', 'pick'),
      // The league has no kickers or defenses, so these are never stored.
      gm(506, 'Place', 'Kicker', 'K', '1995-02-02'),
      gm(507, 'Home', 'Defense', 'DEF'),
    ],
    seenAt,
  )
  expect(saved).toMatchObject({ seen: 5, created: 5, updated: 0 })
  expect(await matchProviderCatalogs(db, seenAt)).toMatchObject({
    'dynasty-nerds': { linked: 2, ambiguous: 2, unmatched: 0, skipped: 1 },
  })
  const rows = await db.dynastyGmPlayer.findMany({ orderBy: { id: 'asc' } })
  expect(
    await Promise.all(rows.map(async (r) => [r.id, r.matchStatus, await sleeperId(r.playerId)])),
  ).toEqual([
    [501, 'linked', '11'],
    [502, 'linked', '13'],
    [503, 'ambiguous', null],
    [504, 'ambiguous', null],
    [505, 'skipped', null],
  ])
  expect(rows[4].matchNote).toBe('Picks are tracked separately from players.')
  expect(rows[2]).toMatchObject({ birthDate: null, draftYear: 2022, matchMethod: 'automatic' })
  expect(rows[3].matchNote).toContain('Sleeper has no birth date')
})

test('links are stable, manual decisions stand, and a changed identity is re-evaluated', async () => {
  await saveDynastyGmCatalog(db, [gm(501, 'Fixture', 'Receiver', 'WR', '2000-05-10')], seenAt)
  await matchProviderCatalogs(db, seenAt)
  // A person decides a row that automatic matching could not.
  const manual = await db.player.findUniqueOrThrow({ where: { sleeperId: '14' } })
  await saveDynastyGmCatalog(db, [gm(504, 'Undated', 'Back', 'RB', '1999-01-01')], seenAt)
  await db.dynastyGmPlayer.update({
    where: { id: 504 },
    data: {
      playerId: manual.id,
      matchStatus: 'linked',
      matchMethod: 'manual',
      matchNote: 'Checked by hand.',
    },
  })
  const later = new Date('2026-09-14T12:00:00Z')
  // A second row claiming an already-linked Sleeper player is flagged, never double-linked.
  const refreshed = await saveDynastyGmCatalog(
    db,
    [
      gm(501, 'Fixture', 'Receiver', 'WR', '2000-05-10'),
      gm(504, 'Undated', 'Back', 'RB', '1999-01-01'),
      gm(506, 'Fixture', 'Receiver', 'WR', '2000-05-10'),
    ],
    later,
  )
  expect(refreshed).toMatchObject({ seen: 3, created: 1, updated: 0 })
  await matchProviderCatalogs(db, later)
  const byId = new Map((await db.dynastyGmPlayer.findMany()).map((r) => [r.id, r]))
  expect(byId.get(501)).toMatchObject({
    matchStatus: 'linked',
    lastSeenAt: later,
    firstSeenAt: seenAt,
  })
  expect(byId.get(504)).toMatchObject({ matchMethod: 'manual', playerId: manual.id })
  expect(byId.get(506)).toMatchObject({
    matchStatus: 'ambiguous',
    playerId: null,
    matchNote: 'Another Dynasty GM player already links to this Sleeper player.',
  })

  // Dynasty GM corrects a birth date: the automatic link is dropped and matched again.
  await saveDynastyGmCatalog(db, [gm(501, 'Fixture', 'Receiver', 'WR', '2000-05-11')], later)
  expect(await db.dynastyGmPlayer.findUniqueOrThrow({ where: { id: 501 } })).toMatchObject({
    matchStatus: 'unmatched',
    playerId: null,
  })
  await matchProviderCatalogs(db, later)
  expect(await db.dynastyGmPlayer.findUniqueOrThrow({ where: { id: 501 } })).toMatchObject({
    matchStatus: 'ambiguous',
    matchNote: expect.stringContaining('birth date differs'),
  })
})

test('DTC rows link by displayed age and keep their latest rank', async () => {
  // DTC exports ages as completed years, such as "28Y", and leaves some blank.
  const age = (birthDate: string) => `${Math.floor(ageOn(birthDate, seenAt))}Y`
  const row = (rank: number, playerName: string, position: string, shown: string) => ({
    rank,
    playerName,
    team: 'SEA',
    position,
    age: shown,
  })
  await saveDtcCatalog(
    db,
    [
      row(1, 'Fixture Receiver', 'WR', age('2000-05-10')),
      row(2, 'Common Name', 'WR', age('1998-01-01')),
      row(3, 'Unknown Rookie', 'RB', '21Y'),
      row(4, 'Undated Back', 'RB', ''),
    ],
    seenAt,
  )
  expect(await matchProviderCatalogs(db, seenAt)).toMatchObject({
    'dynasty-calculator': { linked: 2, ambiguous: 1, unmatched: 1 },
  })
  const common = await db.dtcPlayer.findFirstOrThrow({ where: { name: 'Common Name' } })
  expect(common).toMatchObject({ age: 28 })
  expect(await sleeperId(common.playerId)).toBe('12')
  expect(await db.dtcPlayer.findFirstOrThrow({ where: { name: 'Undated Back' } })).toMatchObject({
    age: null,
    matchStatus: 'ambiguous',
  })
  await saveDtcCatalog(db, [row(9, 'Common Name', 'WR', age('1998-01-01'))], seenAt)
  expect(await db.dtcPlayer.findUniqueOrThrow({ where: { key: common.key } })).toMatchObject({
    rank: 9,
    matchStatus: 'linked',
  })
})

test('a current DTC spelling replaces a stale automatic link', async () => {
  const row = (playerName: string) => ({
    rank: 1,
    playerName,
    team: 'SEA',
    position: 'WR',
    age: '26Y',
  })
  await saveDtcCatalog(db, [row('Fixture Receiver Jr.')], seenAt)
  await matchProviderCatalogs(db, seenAt)
  const old = await db.dtcPlayer.findFirstOrThrow()
  expect(old).toMatchObject({ matchStatus: 'linked' })

  const later = new Date('2026-09-14T12:00:00Z')
  await saveDtcCatalog(db, [row('Fixture Receiver')], later)
  expect(await matchProviderCatalogs(db, later)).toMatchObject({
    'dynasty-calculator': { linked: 1, ambiguous: 0, unmatched: 0 },
  })
  expect(await db.dtcPlayer.findUniqueOrThrow({ where: { key: old.key } })).toMatchObject({
    playerId: null,
    matchStatus: 'unmatched',
    matchNote: 'Not listed in the latest DTC catalog.',
  })
  expect(await db.dtcPlayer.findFirstOrThrow({ where: { lastSeenAt: later } })).toMatchObject({
    matchStatus: 'linked',
  })
})

test('a stale manual DTC link remains reserved when the current spelling changes', async () => {
  const row = (playerName: string) => ({
    rank: 1,
    playerName,
    team: 'SEA',
    position: 'WR',
    age: '26Y',
  })
  await saveDtcCatalog(db, [row('Fixture Receiver Jr.')], seenAt)
  await matchProviderCatalogs(db, seenAt)
  const old = await db.dtcPlayer.findFirstOrThrow()
  await db.dtcPlayer.update({
    where: { key: old.key },
    data: {
      matchMethod: 'manual',
      matchNote: 'Checked by hand.',
    },
  })
  const later = new Date('2026-09-14T12:00:00Z')
  await saveDtcCatalog(db, [row('Fixture Receiver')], later)
  expect(await matchProviderCatalogs(db, later)).toMatchObject({
    'dynasty-calculator': { linked: 0, ambiguous: 1, unmatched: 0 },
  })
  expect(await db.dtcPlayer.findUniqueOrThrow({ where: { key: old.key } })).toMatchObject({
    matchStatus: 'linked',
    matchMethod: 'manual',
  })
  expect(await db.dtcPlayer.findFirstOrThrow({ where: { lastSeenAt: later } })).toMatchObject({
    playerId: null,
    matchStatus: 'ambiguous',
    matchNote: 'Another DTC player already links to this Sleeper player.',
  })
})

test('a capture saves its catalog, and a catalog failure never costs the saved values', async () => {
  const provider = (catalog: unknown, capturedAt = seenAt): ValueProvider => ({
    name: 'dynasty-nerds',
    run: async () =>
      ({
        source: 'dynasty-nerds',
        capturedAt: capturedAt.toISOString(),
        context: { label: 'Fixture', settings: { scoring: 'PPR' } },
        records: [{ sourceKey: '501', playerName: 'Fixture Receiver', value: 50 }],
        catalog,
      }) as never,
  })
  await syncSource(
    db,
    'dynasty-nerds',
    provider({
      source: 'dynasty-nerds',
      players: [gm(501, 'Fixture', 'Receiver', 'WR', '2000-05-10')],
    }),
  )
  expect(await db.dynastyGmPlayer.findUniqueOrThrow({ where: { id: 501 } })).toMatchObject({
    matchStatus: 'linked',
  })
  await db.syncRun.updateMany({ data: { startedAt: new Date(Date.now() - 3_600_001) } })
  // A league position gets past the scope filter, so the missing name fails the catalog save.
  const broken = { source: 'dynasty-nerds', players: [{ id: 'not-a-number', pos: 'WR' }] }
  const result = await syncSource(
    db,
    'dynasty-nerds',
    provider(broken, new Date('2026-09-13T13:00:00Z')),
  )
  expect(result).toMatchObject({ saved: 1 })
  const run = await db.syncRun.findFirstOrThrow({ orderBy: { startedAt: 'desc' } })
  expect(run).toMatchObject({
    status: 'success',
    message: expect.stringContaining('The player catalog could not be updated.'),
  })
})
