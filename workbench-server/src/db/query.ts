import { isMysqlDriver } from './driver.js'

export type DbRunResult = {
  lastInsertRowid: number
  changes?: number
}

type MysqlHeader = {
  insertId?: number
  affectedRows?: number
}

function normalizeMysqlResult(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
}

/** Insert / update / delete — SQLite `.run()` or MySQL `await builder`. */
export async function dbExecute(statement: {
  run?: () => { lastInsertRowid?: number | bigint; changes?: number }
}): Promise<DbRunResult> {
  if (isMysqlDriver()) {
    return normalizeMysqlResult(await (statement as unknown as Promise<unknown>))
  }
  const row = statement.run!()
  return {
    lastInsertRowid: Number(row.lastInsertRowid ?? 0),
    changes: row.changes,
  }
}

/** Select rows — SQLite `.all()` or MySQL `await builder`. */
export async function dbAll<T>(
  query: { all?: () => T[] } & PromiseLike<T[]>,
): Promise<T[]> {
  if (isMysqlDriver()) return await query
  return query.all!()
}
