import '../config.js'
import { sourceSchema } from '../../shared/tracker.js'
import { prisma } from '../db.js'
import { dynastyNerdsProvider } from '../providers/dynastyNerds.js'
import { dynastyCalculatorProvider } from '../providers/dynastyCalculator.js'
import { syncSource } from '../services/sync.js'
import { DataError } from '../services/valuations.js'
try {
  const source = sourceSchema.parse(process.argv[2])
  const result = await syncSource(
    prisma,
    source,
    source === 'dynasty-nerds' ? dynastyNerdsProvider : dynastyCalculatorProvider,
    { headless: !process.argv.includes('--headed') },
  )
  console.log(JSON.stringify(result))
} catch (error) {
  console.error(
    error instanceof DataError
      ? error.message
      : 'Capture could not start. Check source name, database, and browser setup.',
  )
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
