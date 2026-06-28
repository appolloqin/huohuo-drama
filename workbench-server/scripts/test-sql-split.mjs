/**
 * One-off sanity check for splitSqlStatements (the new MySQL DDL splitter).
 * Not part of the regular test suite — keep it around so the next person
 * editing the parser can re-run it during the change.
 *
 * Run: `node scripts/test-sql-split.mjs` from workbench-server root.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// We re-implement the splitter here so the script has no TS-build step.
function splitSqlStatements(sql) {
  const stmts = []
  let buf = ''
  let i = 0
  const n = sql.length
  while (i < n) {
    const ch = sql[i]
    const next = i + 1 < n ? sql[i + 1] : ''
    if (ch === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++
      continue
    }
    if (ch === '/' && next === '*') {
      const isConditional = i + 2 < n && sql[i + 2] === '!'
      if (isConditional) buf += '/*'
      i += 2
      while (i < n) {
        const c = sql[i]
        if (isConditional) buf += c
        if (c === '*' && i + 1 < n && sql[i + 1] === '/') {
          if (isConditional) buf += '/'
          i += 2
          break
        }
        i++
      }
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      buf += ch
      i++
      while (i < n) {
        const c = sql[i]
        buf += c
        if (c === '\\' && i + 1 < n) {
          buf += sql[i + 1]
          i += 2
          continue
        }
        if (c === quote) {
          i++
          break
        }
        i++
      }
      continue
    }
    if (ch === ';') {
      const trimmed = buf.trim()
      if (trimmed) stmts.push(trimmed)
      buf = ''
      i++
      continue
    }
    buf += ch
    i++
  }
  const tail = buf.trim()
  if (tail) stmts.push(tail)
  return stmts
}

const cases = [
  {
    name: 'comments-only chunk is dropped (the original bug)',
    sql: `-- Composite index matches listOwnedDramas's WHERE+ORDER BY
CREATE INDEX idx_x ON t (a);`,
    expect: ['CREATE INDEX idx_x ON t (a)'],
  },
  {
    name: 'multi-line -- comments',
    sql: `-- line one; with semicolon
-- line two;
CREATE TABLE t (id INT);`,
    expect: ['CREATE TABLE t (id INT)'],
  },
  {
    name: 'plain block comment is dropped',
    sql: `/* not kept */ CREATE TABLE t (id INT);`,
    expect: ['CREATE TABLE t (id INT)'],
  },
  {
    name: 'conditional block comment is kept',
    sql: `/*!40101 SET @x = 1 */; CREATE TABLE t (id INT);`,
    expect: ['/*!40101 SET @x = 1 */', 'CREATE TABLE t (id INT)'],
  },
  {
    name: "string literal containing ';' is not a terminator",
    sql: `INSERT INTO t VALUES ('a;b'); INSERT INTO t VALUES ('c');`,
    expect: [
      `INSERT INTO t VALUES ('a;b')`,
      `INSERT INTO t VALUES ('c')`,
    ],
  },
  {
    name: 'trailing statement without semicolon',
    sql: `CREATE TABLE t (id INT)`,
    expect: ['CREATE TABLE t (id INT)'],
  },
]

let failed = 0
for (const c of cases) {
  const got = splitSqlStatements(c.sql)
  const ok = JSON.stringify(got) === JSON.stringify(c.expect)
  console.log(`${ok ? 'OK' : 'FAIL'}  ${c.name}`)
  if (!ok) {
    console.log('  expect:', JSON.stringify(c.expect))
    console.log('  got:   ', JSON.stringify(got))
    failed++
  }
}

// Sanity check on the real DDL files — no statement should be comment-only.
const ddlFiles = [
  path.join(__dirname, '..', 'src', 'db', 'sql', 'mysql', 'schema.mysql.ddl.sql'),
]
for (const file of ddlFiles) {
  if (!fs.existsSync(file)) continue
  const sql = fs.readFileSync(file, 'utf8')
  const stmts = splitSqlStatements(sql)
  const commentOnly = stmts.filter((s) => /^\s*(--|\/\*)/.test(s))
  console.log(`${commentOnly.length === 0 ? 'OK' : 'FAIL'}  ${path.basename(file)} → ${stmts.length} statements, ${commentOnly.length} comment-only`)
  if (commentOnly.length) {
    failed++
    for (const bad of commentOnly.slice(0, 3)) console.log('    BAD:', JSON.stringify(bad.slice(0, 80)))
  }
}

console.log(failed === 0 ? '\nALL PASSED' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)