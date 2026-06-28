export type DbDriver = 'sqlite' | 'mysql'

export function resolveDbDriver(): DbDriver {
  const raw = (process.env.DB_DRIVER || 'sqlite').toLowerCase()
  if (raw === 'mysql' || raw === 'mariadb') return 'mysql'
  return 'sqlite'
}

export function isMysqlDriver(): boolean {
  return resolveDbDriver() === 'mysql'
}

export function resolveMysqlUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const host = process.env.MYSQL_HOST || '127.0.0.1'
  const port = process.env.MYSQL_PORT || '3306'
  const user = process.env.MYSQL_USER || 'huohuo'
  const password = process.env.MYSQL_PASSWORD || ''
  const database = process.env.MYSQL_DATABASE || 'huohuo_drama'
  const encUser = encodeURIComponent(user)
  const encPass = encodeURIComponent(password)
  return `mysql://${encUser}:${encPass}@${host}:${port}/${database}`
}
