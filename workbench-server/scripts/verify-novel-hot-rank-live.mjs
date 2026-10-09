/**
 * 真实榜源连通性冒烟（需网络）
 * node scripts/verify-novel-hot-rank-live.mjs
 */
import { fetchQidianRank } from '../src/services/novel/novel-hot-rank/providers/qidian.ts'
import { fetchFanqieRank } from '../src/services/novel/novel-hot-rank/providers/fanqie.ts'
import { fetchJinjiangRank } from '../src/services/novel/novel-hot-rank/providers/jinjiang.ts'
import { fetchQimaoRank } from '../src/services/novel/novel-hot-rank/providers/qimao.ts'

async function run(name, fn) {
  const t0 = Date.now()
  try {
    const items = await fn(name)
    console.log(
      `OK ${name}: ${items.length} items, first="${items[0]?.title}", ${Date.now() - t0}ms`,
    )
    return true
  } catch (e) {
    console.error(`FAIL ${name}:`, e?.message || e)
    return false
  }
}

const results = await Promise.all([
  run('qidian', fetchQidianRank),
  run('jinjiang', fetchJinjiangRank),
  run('qimao', fetchQimaoRank),
  // fanqie 较慢，串行放最后也可；这里并行
  run('fanqie', fetchFanqieRank),
])

if (!results.every(Boolean)) {
  process.exit(1)
}
console.log('verify-novel-hot-rank-live: OK')
