import '../config.js'
import { prisma } from '../db.js'
import { backupTrackerDatabase } from '../services/backup.js'
import { matchProviderCatalogs } from '../services/playerCatalogs.js'
import { seedPlayersFromSleeper } from '../services/players.js'

try {
  await backupTrackerDatabase('pre-seed').catch(() =>
    console.error(
      'Database backup failed; continuing, because seeding only adds or updates players.',
    ),
  )
  const seeded = await seedPlayersFromSleeper({ prisma })
  // New or corrected Sleeper birth dates can settle catalog rows that were waiting for review.
  console.log(JSON.stringify({ ...seeded, matching: await matchProviderCatalogs(prisma) }))
} catch {
  console.error('Player catalog refresh failed. Existing identities were retained.')
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
