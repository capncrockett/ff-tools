import fs from 'node:fs/promises'
import path from 'node:path'

// Simple CSV parser for the ADP CSV used previously
export async function getAdpData() {
  const csvPath = path.resolve(process.cwd(), 'data', 'adp.csv')
  try {
    const content = await fs.readFile(csvPath, 'utf8')
    const lines = content.split(/\r?\n/).filter(Boolean)
    if (lines.length <= 1) return []
    const headers = lines[0].split(',').map((h) => h.trim())
    const rows = lines.slice(1)
    return rows.map((line) => {
      const cols = line.split(',')
      const row: Record<string, any> = {}
      headers.forEach((h, i) => (row[h] = (cols[i] ?? '').trim()))
      // Coerce numeric fields when present
      for (const key of ['average_pick', 'std_dev', 'earliest_pick', 'latest_pick']) {
        const v = row[key]
        row[key] = v && v !== 'N/A' ? Number(v) : 0
      }
      row['times_drafted'] = row['times_drafted'] ? Number(row['times_drafted']) : 0
      if (typeof row['draft_percentage'] === 'string') {
        row['draft_percentage'] = Number(String(row['draft_percentage']).replace('%', '')) || 0
      }
      return row
    })
  } catch (e) {
    return []
  }
}

