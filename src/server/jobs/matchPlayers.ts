import '../config.js'
import { prisma } from '../db.js'
import { backupTrackerDatabase } from '../services/backup.js'
import { matchProviderCatalogs } from '../services/playerCatalogs.js'

try {
  await backupTrackerDatabase('pre-match').catch(() =>
    console.error('Database backup failed; continuing, because matching only links catalog rows.'),
  )
  const labels = { 'dynasty-nerds': 'Dynasty GM', 'dynasty-calculator': 'DTC' } as const
  for (const [source, counts] of Object.entries(await matchProviderCatalogs(prisma)))
    console.log(
      `${labels[source as keyof typeof labels]}: ${counts.linked} linked, ${counts.ambiguous} need review, ${counts.unmatched} unmatched, ${counts.skipped} other positions`,
    )
} catch {
  console.error('Player matching failed. No links were changed.')
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
