/**
 * 冷启动：用当前默认困惑度模型给少量样本打 proxy PPL，并写入 ppl_tracks 校准档案。
 * 不跑满 minPerClass=40 护栏（那是正式重训）；本脚本只为让 S2/困惑度可显示。
 *
 * Usage (cwd=workbench-server):
 *   npx tsx scripts/bootstrap-ai-detect-calib.ts
 */
import '../src/db/bootstrap.js'
import * as fs from 'fs'
import * as path from 'path'
import { countNovelChars } from '../src/common/novel/novel-char-limit.js'
import { AI_DETECT_ENGINE_VERSION } from '../src/common/novel/novel-detect-calib.js'
import { buildPplTracks } from '../src/common/novel/novel-detect-train.js'
import {
  DEFAULT_PERCENTILE_TABLES,
  saveProfileWithRotate,
  resetCalibMemoForTest,
  type CalibProfile,
} from '../src/services/ai/ai-detect-calibration.js'
import { seedFusionWeights } from '../src/services/ai/ai-evidence-rules.js'
import { scoreWithReference, resetReferenceStateForTest } from '../src/services/ai/ai-detect-reference.js'
import { getPerplexityConfigWithModels } from '../src/services/ai/ai.js'
import { runAiDetect } from '../src/services/ai/ai-detect-engine.js'
import { hashNovelContent } from '../src/services/ai/ai-text-detection.js'
import {
  resolveWorkspace,
  AI_DETECT_SAMPLES_REL,
  AI_DETECT_FIXTURES_REL,
} from '../src/services/ai/ai-detect-store.js'

const EXTRA_HUMAN = [
  {
    name: 'bootstrap-人间烟火.txt',
    text: `巷口的油烟味混着湿抹布味道，老周把炒锅一颠，葱花落进热油里噼啪响。
邻桌两个学生还在争昨晚球赛，筷子敲得碗沿叮叮的。他不插嘴，只把酱牛肉又切薄些，码进盘子。
外面下起小雨，雨丝斜着打在塑料棚顶。骑车路过的人把车把一拧，溅起一串脏水。
老周擦了下手，给灶上那盅酒添了半两，自己也不喝，只闻了闻。
“再来两碗米饭。”有人喊。他应了一声，嗓子有点哑，像昨晚没睡好。
后厨水龙头滴得慢，他伸手拧紧，又松了半圈——管子老了，拧死反而漏。
这样的日子没有大事，只有热锅、冷雨和一桌子说不完的闲话。`.repeat(3),
  },
  {
    name: 'bootstrap-夜路.txt',
    text: `路灯坏了一截，人影被拉得很长。狗在远处叫了两声，又停了。
他摸口袋，钥匙还在，却一时想不起该开哪扇门。风从桥洞钻出来，带着河水的腥气。
手机亮了一下，是同事发来的截图，他没点开，只把屏幕按灭。
走到旧楼门口，他站了会儿，听见楼上电视吵吵嚷嚷。
“回来了？”门缝里探出半张脸。他点头，换鞋，把外套搭在椅背上。
厨房还留着中午的菜味。他打开冰箱，看了看，又关上，最后只倒了杯凉白开。
夜里总有一些说不清的空，像口袋里那串钥匙，沉，却对不上锁。`.repeat(3),
  },
]

const EXTRA_AI = [
  {
    name: 'bootstrap-模板论述.txt',
    text: `首先，我们需要认识到问题的复杂性。其次，应当从多个维度进行分析。与此同时，相关数据的积累也是不可或缺的一环。此外，值得注意的是，任何结论都需要充分证据的支持。综上所述，只有系统性地推进，才能取得实质性的进展。
进一步而言，我们需要保持谨慎。与此同时应统筹兼顾。由此可见，方法论本身比结论更重要。毫无疑问，持续迭代将带来更稳健的结果。
一方面要夯实基础能力，另一方面要拓展应用场景。总之，把流程标准化、把反馈闭环化，才能形成可持续的改进机制。`.repeat(4),
  },
  {
    name: 'bootstrap-网文腔.txt',
    text: `就在这时，他心中猛地一震。紧接着，一股强大的力量自丹田升起。与此同时，四周的气息仿佛都凝固了。
他深吸一口气，强行压下心中的波动。值得注意的是，对方似乎早已算到这一步。进一步来说，这场对峙从一开始就不对等。
综上所述，他必须做出选择。要么拼死一搏，要么忍辱负重。毫无疑问，两者都充满风险。然而，命运往往青睐敢于迈出第一步的人。
与此同时，远处传来脚步声。他目光一凝，首先确认退路，其次评估对手，最后才缓缓开口。`.repeat(4),
  },
]

function ensureFixtures() {
  for (const [label, items] of [['human', EXTRA_HUMAN], ['ai', EXTRA_AI]] as const) {
    const dir = path.join(resolveWorkspace(AI_DETECT_FIXTURES_REL), label)
    fs.mkdirSync(dir, { recursive: true })
    for (const item of items) {
      const p = path.join(dir, item.name)
      if (!fs.existsSync(p)) fs.writeFileSync(p, `${item.text.trim()}\n`, 'utf8')
    }
  }
}

function loadFixtureSamples(): Array<{ label: 'human' | 'ai'; text: string; id: string; source: 'fixtures' }> {
  const out: Array<{ label: 'human' | 'ai'; text: string; id: string; source: 'fixtures' }> = []
  for (const label of ['human', 'ai'] as const) {
    const dir = path.join(resolveWorkspace(AI_DETECT_FIXTURES_REL), label)
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).slice(0, 6)
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8').trim()
      if (countNovelChars(text) < 80) continue
      out.push({ label, text, id: `fix-${label}-${f}`, source: 'fixtures' })
    }
  }
  return out
}

async function main() {
  ensureFixtures()
  const { cfg, perplexityModel } = await getPerplexityConfigWithModels({ userId: 1 })
  const model = (perplexityModel || cfg.model || 'qwen3.5-4b').toLowerCase()
  console.log('using model', { model, baseUrl: cfg.baseUrl })

  const samples = loadFixtureSamples()
  // 打分太慢：每类最多 3 条
  const human = samples.filter((s) => s.label === 'human').slice(0, 3)
  const ai = samples.filter((s) => s.label === 'ai').slice(0, 3)
  const toScore = [...human, ...ai]
  console.log('scoring', toScore.map((s) => `${s.label}:${s.id}`))

  resetReferenceStateForTest()
  const scored: Array<{
    id: string
    label: 'human' | 'ai'
    genre: 'web_fiction'
    source: 'fixtures'
    chars: number
    text: string
    hash: string
    model: string
    pplByModel: Record<string, { proxy?: number; echo?: number }>
  }> = []

  for (const s of toScore) {
    const t0 = Date.now()
    try {
      const r = await scoreWithReference(s.text, {
        maxCandidates: 1,
        model,
        config: cfg,
        billing: { userId: 1, reason: '校准样本打分', resourceType: 'ai_detect' },
      })
      const modeKey = r.mode === 'proxy' ? 'proxy' : 'echo'
      scored.push({
        id: s.id,
        label: s.label,
        genre: 'web_fiction',
        source: 'fixtures',
        chars: countNovelChars(s.text),
        text: s.text,
        hash: hashNovelContent(s.text),
        model: r.model,
        pplByModel: { [r.model.toLowerCase()]: { [modeKey]: r.ppl } },
      })
      console.log('ok', { id: s.id, label: s.label, mode: r.mode, ppl: +r.ppl.toFixed(3), ms: Date.now() - t0 })
    } catch (e: any) {
      console.warn('fail', { id: s.id, error: e?.message || String(e), ms: Date.now() - t0 })
    }
  }

  if (scored.length < 3) {
    console.error('有效打分不足 3 条，无法建 ppl_tracks')
    process.exit(1)
  }

  const samplesPath = resolveWorkspace(AI_DETECT_SAMPLES_REL)
  fs.mkdirSync(path.dirname(samplesPath), { recursive: true })
  const payload = {
    generated_at: new Date().toISOString(),
    byLabel: {
      web_fiction: {
        human_count: scored.filter((s) => s.label === 'human').length,
        ai_count: scored.filter((s) => s.label === 'ai').length,
      },
    },
    samples: scored,
  }
  fs.writeFileSync(samplesPath, JSON.stringify(payload, null, 2), 'utf8')
  console.log('samples written', samplesPath, payload.byLabel)

  const trackRows = scored.flatMap((s) => Object.entries(s.pplByModel).flatMap(([m, v]) => {
    const out: Array<{ ppl: number; refModel: string; mode: 'echo' | 'proxy' }> = []
    if (typeof v.echo === 'number') out.push({ ppl: v.echo, refModel: m, mode: 'echo' })
    if (typeof v.proxy === 'number') out.push({ ppl: v.proxy, refModel: m, mode: 'proxy' })
    return out
  }))
  let pplTracks = buildPplTracks(trackRows)
  // buildPplTracks 要求同轨 ≥3 点；不足时用均值手工补一条可用 track
  if (!Object.keys(pplTracks).length) {
    const vals = trackRows.map((r) => r.ppl)
    const mu = vals.reduce((a, b) => a + b, 0) / vals.length
    const sd = Math.max(0.3, Math.sqrt(vals.reduce((a, v) => a + (v - mu) ** 2, 0) / vals.length))
    const mode = trackRows[0]!.mode
    pplTracks = { [model]: { [mode]: { mu: +mu.toFixed(3), sd: +sd.toFixed(3) } } }
  }
  // 同时挂 default，避免别名对不上
  const first = Object.values(pplTracks)[0]
  if (first) pplTracks = { ...pplTracks, default: first }

  const fusion = {
    web_fiction: seedFusionWeights('web_fiction'),
    official: seedFusionWeights('official'),
    academic: seedFusionWeights('academic'),
    media: seedFusionWeights('media'),
  }
  const profile: CalibProfile = {
    version: 0,
    engine_version: AI_DETECT_ENGINE_VERSION,
    ppl_tracks: pplTracks,
    percentiles: DEFAULT_PERCENTILE_TABLES,
    fusion,
    metrics: { fpr: null, recall: null, train: 's1_only' },
  }
  resetCalibMemoForTest()
  const saved = await saveProfileWithRotate(profile)
  console.log('profile saved', { version: saved.to, pplTracks })

  const probeText = scored[0]!.text
  const detect = await runAiDetect(probeText.repeat(2), {
    genre: 'web_fiction',
    enableAdversarial: false,
    skipCacheStore: true,
    billing: { userId: 1, reason: '校准后冒烟', resourceType: 'ai_detect' },
  })
  console.log('smoke detect', {
    method: detect.method,
    probability: detect.probability,
    perplexity: detect.perplexity,
    calibration: detect.calibration,
    coverage: detect.coverage,
    warning: detect.ai_detect_warning,
  })
  if (detect.perplexity == null) {
    console.error('仍无 perplexity，请检查 ppl_tracks 模型名是否匹配', { model, tracks: Object.keys(pplTracks) })
    process.exit(2)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
