import process from 'node:process'

const source = process.argv[2]
if (!source) {
  console.log('Usage: pnpm sync:<source> (dynasty-nerds | dynasty-calculator)')
  process.exit(1)
}

// Placeholder: implement Playwright scrapers per source.
console.log(`Manual sync triggered for source: ${source}`)

