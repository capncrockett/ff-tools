import { queryDatabaseReadOnly, tableListQuery } from '../services/databaseQuery.js'

// npm run db:query -- "SELECT ..."   one read-only query, rows printed as JSON lines
// npm run db:query -- --tables        every table with its row count
// npm run db:query -- --columns Name  the columns of one table
const [first, second] = process.argv.slice(2)
try {
  if (first === '--tables') {
    const { rows } = await queryDatabaseReadOnly(tableListQuery)
    for (const { name } of rows) {
      const { rows: count } = await queryDatabaseReadOnly(
        `SELECT count(*) AS n FROM "${String(name).replaceAll('"', '""')}"`,
      )
      console.log(`${name}: ${count[0]?.n ?? 0} rows`)
    }
  } else if (first === '--columns' && second) {
    const { rows } = await queryDatabaseReadOnly(
      `SELECT name, type, "notnull" AS required, pk FROM pragma_table_info('${second.replaceAll("'", "''")}')`,
    )
    if (!rows.length) throw new Error(`No table named ${second}.`)
    for (const row of rows) console.log(JSON.stringify(row))
  } else if (first) {
    const { rows, total } = await queryDatabaseReadOnly(first)
    for (const row of rows) console.log(JSON.stringify(row))
    console.log(
      `${total} row${total === 1 ? '' : 's'}${total > rows.length ? `, first ${rows.length} shown` : ''}.`,
    )
  } else {
    console.log('Usage: npm run db:query -- "SELECT ..." | --tables | --columns <table>')
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Query failed.')
  process.exitCode = 1
}
