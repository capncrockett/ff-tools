import path from 'node:path'
import { backupDir, databaseFile } from '../config.js'
import { listBackups, restoreDatabase } from '../services/backup.js'

const choice = process.argv[2]
try {
  const target = databaseFile()
  if (!backupDir || !target) throw new Error('Restore needs a SQLite database and a backup folder.')
  const backups = await listBackups(backupDir)
  if (!choice) {
    console.log(`${backups.length} backups in ${backupDir}, newest first:`)
    for (const file of backups.slice(0, 30)) console.log(`  ${path.basename(file)}`)
    console.log('Stop the app and capture worker, then run: npm run db:restore -- <file name>')
  } else {
    const file = choice === 'latest' ? backups[0] : path.resolve(backupDir, choice)
    if (!file) throw new Error('There is no backup to restore.')
    const result = await restoreDatabase({ databaseFile: target, backupDir, backupFile: file })
    console.log(`Restored ${path.basename(result.restoredFrom)}.`)
    if (result.safety.status === 'created')
      console.log(
        `The database it replaced was saved first as ${path.basename(result.safety.file)}.`,
      )
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Restore failed.')
  process.exitCode = 1
}
