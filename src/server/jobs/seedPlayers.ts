import '../config.js'
import { prisma } from '../db.js'
import { seedPlayersFromSleeper } from '../services/players.js'

try {
  console.log(JSON.stringify(await seedPlayersFromSleeper({ prisma })))
} catch {
  console.error('Player catalog refresh failed. Existing identities were retained.')
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
