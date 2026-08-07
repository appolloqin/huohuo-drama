/**
 * 补全 drama 27 大纲：修空降 + 补全第70（截断）+ 生成 71～100 戏剧标签章块
 * npx tsx scripts/fill-drama27-outline-to-100.ts
 */
import '../src/load-env.js'
import '../src/db/bootstrap.js'
import mysql from 'mysql2/promise'
import { chatCompletionText } from '../src/services/ai/ai.js'
import { buildNovelAgentSystem, novelAgentCompletionOptions } from '../src/services/novel/novel-agent-prompt.js'
import { NO_THINKING_OUTPUT_RULE } from '../src/common/novel/novel-creative-output.js'
import { getMaxParsedChapterNumber, validateOutlineChapterCoverage } from '../src/common/novel/novel-outline.js'
import { assertOutlineChapterFields } from '../src/services/novel/novel-outline-drama-fields.js'
import { syncChapterTitlesFromOutline } from '../src/common/novel/novel-chapter-titles.js'

const DRAMA_ID = 27
const TOTAL = 100

function chapterStartIndex(outline: string, n: number): number {
  const re = new RegExp(`(?:^|\\n)第\\s*${n}\\s*章`)
  const m = re.exec(outline)
  return m ? m.index + (m[0].startsWith('\n') ? 1 : 0) : -1
}

function stripFromChapter(outline: string, n: number): string {
  const idx = chapterStartIndex(outline, n)
  if (idx < 0) return outline.trimEnd()
  return outline.slice(0, idx).trimEnd()
}

function applyContinuityPatches(outline: string): string {
  let o = outline

  // Ch7：为次日亮证铺垫
  o = o.replace(
    /第7章：夜间试探[\s\S]*?(?=第8章：)/,
    (block) => block
      .replace(
        /【信息增量】[^\n]*/,
        '【信息增量】秦卫国的心理战术、赵大彪的色厉内荏；秦卫国盘算次日用合法狩猎手续堵住悠悠之口',
      )
      .replace(
        /【章末问题】[^\n]*/,
        '【章末问题】赵大彪会不会善罢甘休？会不会去革委会找人？',
      ),
  )

  // Ch8：许可非空降；章末点出刘干事
  o = o.replace(
    /第8章：清晨风波[\s\S]*?(?=第9章：)/,
    (block) => block
      .replace(
        /【本章起因】[^\n]*/,
        '【本章起因】赵大彪堵在门口当众散布偷猎谣言；秦卫国已备妥合法狩猎许可应对',
      )
      .replace(
        /【信息增量】[^\n]*/,
        '【信息增量】狩猎许可的政策空隙、秦卫国的先知优势；许可来源交代清楚，非凭空变出',
      )
      .replace(
        /【章末问题】[^\n]*/,
        '【章末问题】赵大彪会不会去找刘干事换招再来？',
      ),
  )

  // Ch9：劳动队日常先交代
  o = o.replace(
    /第9章：苏婉的心结[\s\S]*?(?=第10章：)/,
    (block) => block
      .replace(
        /【本章地点】[^\n]*/,
        '【本章地点】林场劳动队（苏婉日常出工处）',
      )
      .replace(
        /【本章起因】[^\n]*/,
        '【本章起因】苏婉照常去劳动队出工，因出身问题被刁难受罚',
      ),
  )

  // Ch16：工地=日常上工
  o = o.replace(
    /第16章：赵大彪的报复[\s\S]*?(?=第17章：)/,
    (block) => block
      .replace(
        /【本章地点】[^\n]*/,
        '【本章地点】林场工地（秦卫国日常上工处）',
      )
      .replace(
        /【本章起因】[^\n]*/,
        '【本章起因】秦卫国在林场工地上工时，发现赵大彪故意制造木材堆放隐患',
      ),
  )

  // Ch50：拖拉机来源
  o = o.replace(
    /第50章：卷末高潮[\s\S]*?(?=第51章：)/,
    (block) => block
      .replace(
        /【本章起因】[^\n]*/,
        '【本章起因】秦卫国用积蓄换得林场淘汰拖拉机的临时使用权，载年货送苏婉回娘家',
      )
      .replace(
        /【信息增量】[^\n]*/,
        '【信息增量】拖拉机来源与稀缺性、年货价值；须交代如何借到/换到车，禁止无来由开出场',
      ),
  )

  // Ch57：警报装置先有布置
  o = o.replace(
    /第57章：赵大彪的狗急跳墙[\s\S]*?(?=第58章：)/,
    (block) => block
      .replace(
        /【本章起因】[^\n]*/,
        '【本章起因】赵大彪深夜试图纵火；秦卫国早前在柴垛暗处布置的简易警报绳被触发',
      )
      .replace(
        /【信息增量】[^\n]*/,
        '【信息增量】六十年代纵火罪量刑；警报绳须在本章或前章有布置交代',
      ),
  )

  return o
}

async function generateChapterRange(args: {
  title: string
  premise: string
  genre?: string
  skeletonHead: string
  prevTail: string
  from: number
  to: number
  titleHints: Map<number, string>
}): Promise<string> {
  const { title, premise, genre, skeletonHead, prevTail, from, to, titleHints } = args
  const count = to - from + 1
  const hintLines = []
  for (let n = from; n <= to; n++) {
    const t = titleHints.get(n)
    if (t) hintLines.push(`第${n}章：${t}`)
  }

  const system = [
    await buildNovelAgentSystem('novel_outline'),
    '',
    `本轮**仅输出**第 ${from}～${to} 章（共 ${count} 章）的分章概要。`,
    '格式：每章先「第N章：标题」，其下必须带齐：',
    '【本章时间】【本章地点】【本章人物】【本章起因】【欲望】【阻碍】【局面变化】【人物选择】【冲突层】【情绪手法】【章末问题】【信息增量】【主题回响】。',
    '【冲突层】取值：外部/人际/自我（可多选）。',
    '地点/道具/人物若前文未出现，须在【本章起因】或【信息增量】写清首次出现的来由，禁止食堂式空降。',
    '不要输出世界观、总纲、人物、分卷设计；不要前言套话。',
    NO_THINKING_OUTPUT_RULE,
  ].join('\n')

  const options = await novelAgentCompletionOptions('novel_outline', {
    maxTokens: Math.min(16384, Math.max(8192, count * 350)),
    temperature: 0.65,
  })

  const user = [
    `【书名】${title}`,
    genre ? `【题材】${genre}` : '',
    `【全书章数】${TOTAL}`,
    `【创意/梗概】\n${premise.slice(0, 1500)}`,
    `【全书骨架摘录】\n${skeletonHead.slice(0, 5000)}`,
    prevTail ? `【紧前章概要 — 须自然衔接】\n${prevTail}` : '',
    hintLines.length ? `【章题须尽量沿用】\n${hintLines.join('\n')}` : '',
    `【任务】完整输出第 ${from} 章～第 ${to} 章戏剧标签块；卷内情节递进；末章收束有力。`,
  ].filter(Boolean).join('\n\n')

  const raw = (await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { ...options },
  )).trim()

  if (!/第\s*\d+\s*章/.test(raw)) {
    throw new Error(`生成第${from}-${to}章失败：无章节行`)
  }
  return raw
}

function listPresentChapters(outline: string): number[] {
  const nums = new Set<number>()
  const re = /第\s*(\d+)\s*章\s*[：:]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(outline))) nums.add(Number(m[1]))
  return [...nums].sort((a, b) => a - b)
}

function missingInRange(outline: string, from: number, to: number): number[] {
  const present = new Set(listPresentChapters(outline))
  const miss: number[] = []
  for (let n = from; n <= to; n++) if (!present.has(n)) miss.push(n)
  return miss
}

function lastChapterBlocks(outline: string, n = 2): string {
  const present = listPresentChapters(outline)
  if (!present.length) return ''
  const take = present.slice(-n)
  const parts: string[] = []
  for (const ch of take) {
    const a = chapterStartIndex(outline, ch)
    const next = present.find(x => x > ch)
    const b = next ? chapterStartIndex(outline, next) : outline.length
    if (a >= 0) parts.push(outline.slice(a, b).trim())
  }
  return parts.join('\n\n')
}

async function main() {
  const c = await mysql.createConnection(process.env.DATABASE_URL!)
  const [rows] = await c.query('SELECT id, title, metadata FROM dramas WHERE id=?', [DRAMA_ID]) as any
  if (!rows[0]) throw new Error('drama 27 not found')
  const meta = typeof rows[0].metadata === 'object' ? rows[0].metadata : JSON.parse(rows[0].metadata)
  let outline = String(meta.outline || '')
  const premise = String(meta.premise || '')
  const genre = meta.novel_genre || undefined
  const title = rows[0].title as string

  const [eps] = await c.query(
    'SELECT episode_number, title FROM episodes WHERE drama_id=? ORDER BY episode_number',
    [DRAMA_ID],
  ) as any
  const titleHints = new Map<number, string>()
  for (const e of eps) {
    const t = String(e.title || '').trim()
    if (t) titleHints.set(Number(e.episode_number), t)
  }

  console.log('before max', getMaxParsedChapterNumber(outline), 'chars', outline.length)

  outline = applyContinuityPatches(outline)
  console.log('continuity patches applied')

  // 去掉残缺的第70章起
  outline = stripFromChapter(outline, 70)
  console.log('stripped from ch70, max now', getMaxParsedChapterNumber(outline))

  const skeletonHead = outline.split(/【分章概要】/)[0] || outline.slice(0, 6000)

  const batches: [number, number][] = [
    [70, 75],
    [76, 85],
    [86, 95],
    [96, 100],
  ]

  for (const [from, to] of batches) {
    const miss = missingInRange(outline, from, to)
    if (!miss.length) {
      console.log(`skip ${from}-${to}: already present`)
      continue
    }
    const genFrom = Math.min(...miss)
    const genTo = to
    console.log(`generating ${genFrom}-${genTo}...`)
    const prevTail = lastChapterBlocks(outline, 2)
    let block = await generateChapterRange({
      title,
      premise,
      genre,
      skeletonHead,
      prevTail,
      from: genFrom,
      to: genTo,
      titleHints,
    })
    // 若缺章，再补一轮小缺口
    let merged = `${outline.trim()}\n\n${block.trim()}\n`
    let still = missingInRange(merged, genFrom, genTo)
    if (still.length) {
      console.log(`retry gaps: ${still.join(',')}`)
      const retry = await generateChapterRange({
        title,
        premise,
        genre,
        skeletonHead,
        prevTail: lastChapterBlocks(merged, 2),
        from: still[0],
        to: still[still.length - 1],
        titleHints,
      })
      merged = `${merged.trim()}\n\n${retry.trim()}\n`
    }
    outline = merged
    console.log(`after ${genFrom}-${genTo}: max=${getMaxParsedChapterNumber(outline)} missing=${missingInRange(outline, 1, TOTAL).join(',') || 'none'}`)
  }

  const coverage = validateOutlineChapterCoverage(outline, TOTAL)
  const allMissing = missingInRange(outline, 1, TOTAL)
  console.log('coverage', coverage, 'allMissing', allMissing)

  if (allMissing.length) {
    throw new Error(`仍缺章: ${allMissing.join(',')}`)
  }

  // 抽查关键章戏剧字段
  for (const n of [8, 9, 70, 75, 100]) {
    const check = assertOutlineChapterFields(outline, n)
    if (!check.ok) {
      console.warn(`ch${n} fields incomplete`, check.missing, check.invalid)
    } else {
      console.log(`ch${n} fields OK`)
    }
  }

  meta.outline = outline
  await c.query('UPDATE dramas SET metadata=? WHERE id=?', [JSON.stringify(meta), DRAMA_ID])
  await c.end()

  const titlesUpdated = await syncChapterTitlesFromOutline(DRAMA_ID, outline)
  console.log('saved outline chars', outline.length, 'titlesUpdated', titlesUpdated)
  console.log('DONE')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
