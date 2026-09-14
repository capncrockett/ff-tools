import '../config.js'
import { prisma } from '../db.js'
import { backupTrackerDatabase } from '../services/backup.js'
import { seedPlayersFromSleeper } from '../services/players.js'

try {
  await backupTrackerDatabase('pre-seed').catch(() =>
    console.error(
      'Database backup failed; continuing, because seeding only adds or updates players.',
    ),
  )
  console.log(JSON.stringify(await seedPlayersFromSleeper({ prisma })))
} catch {
  console.error('Player catalog refresh failed. Existing identities were retained.')
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
