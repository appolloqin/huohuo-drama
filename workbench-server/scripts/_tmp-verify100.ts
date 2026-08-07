import '../src/load-env.js'
import '../src/db/bootstrap.js'
import mysql from 'mysql2/promise'
import { getMaxParsedChapterNumber } from '../src/common/novel/novel-outline.js'
import { assertOutlineChapterFields } from '../src/services/novel/novel-outline-drama-fields.js'

const c = await mysql.createConnection(process.env.DATABASE_URL!)
const [r] = await c.query('SELECT metadata FROM dramas WHERE id=27') as any
const meta = typeof r[0].metadata === 'object' ? r[0].metadata : JSON.parse(r[0].metadata)
const o = String(meta.outline || '')
const nums = new Set<number>()
for (const m of o.matchAll(/第\s*(\d+)\s*章\s*[：:]/g)) nums.add(Number(m[1]))
const miss = [...Array(100)].map((_, i) => i + 1).filter(n => !nums.has(n))
let badFields = 0
for (let n = 1; n <= 100; n++) {
  if (!assertOutlineChapterFields(o, n).ok) badFields++
}
console.log({ markers: nums.size, max: getMaxParsedChapterNumber(o), miss, badFields, chars: o.length })
console.log('ch8 cafeteria?', /第8章[\s\S]{0,300}食堂/.test(o))
console.log('ch8 permit ready?', o.includes('已备妥合法狩猎许可'))
console.log('ch9 labor setup?', o.includes('照常去劳动队'))
await c.end()
