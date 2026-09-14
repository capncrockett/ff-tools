import { backupDir } from '../config.js'
import { backupTrackerDatabase, listBackups } from '../services/backup.js'

try {
  const result = await backupTrackerDatabase('manual', true)
  console.log(
    result.status === 'created'
      ? `Saved ${result.file} (${Math.max(1, Math.round(result.bytes / 1024))} KB).`
      : result.reason,
  )
  if (backupDir) {
    const count = (await listBackups(backupDir)).length
    console.log(
      `${count} backup${count === 1 ? '' : 's'} in ${backupDir}. None are deleted automatically.`,
    )
  }
} catch {
  console.error(
    'Backup failed. Check that the database and backup folder are readable and writable.',
  )
  process.exitCode = 1
}
