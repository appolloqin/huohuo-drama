/**
 * 同字辈互称叔/伯硬伤：如「秦德民」对「秦德东」称「二叔」。
 * 合法：晚辈（不同字辈，如秦默）称叔伯；非法：同姓同字辈当面称叔/伯。
 */

export type PeerKinshipHit = {
  layer: 'hard'
  rule: 'peer_kinship_address'
  message: string
}

const UNCLE_ADDRESS = /(?:大|二|三|四|五)?(?:叔|伯)|大叔|叔叔/
const SPEAKER_CUE =
  /(?:站起来|说道|开口|道|问|笑|冷笑|怒道|喊道|回道|答道|清了清嗓子|点了点头)[^“"\n]{0,36}$/

/** 收集正文中「姓+字辈+名」三字专名，按姓+字辈分组 */
export function groupNamesByGenerationChar(content: string): Map<string, string[]> {
  const text = content || ''
  const counts = new Map<string, number>()
  const re = /[\u4e00-\u9fff]{3}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const n = m[0]!
    if (isNoiseTrigram(n)) continue
    counts.set(n, (counts.get(n) || 0) + 1)
  }
  const byGen = new Map<string, string[]>()
  for (const [n, c] of counts) {
    if (c < 1) continue
    const key = n.slice(0, 2)
    const list = byGen.get(key) || []
    if (!list.includes(n)) list.push(n)
    byGen.set(key, list)
  }
  return byGen
}

function isNoiseTrigram(n: string): boolean {
  return /^(但是|已经|什么|不是|可以|没有|这个|那个|因为|所以|如果|虽然|然后|于是|自己|他们|我们|你们|时候|地方|东西|现在|今天|明天|昨日|上午|下午|晚上)/.test(n)
}

function rightmostNameIn(lookback: string, candidates: string[]): string | null {
  let best: string | null = null
  let bestIdx = -1
  for (const name of candidates) {
    const idx = lookback.lastIndexOf(name)
    if (idx > bestIdx) {
      bestIdx = idx
      best = name
    }
  }
  return best
}

/**
 * 硬审：同字辈专名担当说话人时，对白以叔/伯称呼在场同辈。
 */
export function detectPeerKinshipAddressConflicts(content: string): PeerKinshipHit[] {
  const text = content || ''
  if (!text.trim()) return []
  const byGen = groupNamesByGenerationChar(text)
  const multiGens = [...byGen.entries()].filter(([, members]) => members.length >= 2)
  if (!multiGens.length) return []

  const allMultiMembers = multiGens.flatMap(([, members]) => members)
  const hits: PeerKinshipHit[] = []
  const quoteRe = /([“"])([^”"]+)([”"])/g
  let qm: RegExpExecArray | null
  while ((qm = quoteRe.exec(text))) {
    const inner = qm[2] || ''
    if (!UNCLE_ADDRESS.test(inner)) continue
    const lookback = text.slice(Math.max(0, qm.index - 100), qm.index)
    if (!SPEAKER_CUE.test(lookback) && !allMultiMembers.some((n) => lookback.endsWith(n) || lookback.includes(`${n}，`) || lookback.includes(`${n}。`))) {
      // 仍尝试：lookback 末段含同辈专名即可
      if (!allMultiMembers.some((n) => lookback.includes(n))) continue
    }
    const speaker = rightmostNameIn(lookback, allMultiMembers)
    if (!speaker) continue
    const genKey = speaker.slice(0, 2)
    const peers = (byGen.get(genKey) || []).filter((n) => n !== speaker)
    if (peers.length < 1) continue
    const window = text.slice(Math.max(0, qm.index - 240), Math.min(text.length, qm.index + qm[0].length + 40))
    const peerInScene = peers.find((p) => window.includes(p))
    if (!peerInScene) continue
    const excerpt = inner.replace(/\s+/g, ' ').slice(0, 48)
    hits.push({
      layer: 'hard',
      rule: 'peer_kinship_address',
      message: `同字辈互称叔伯：说话人「${speaker}」与在场「${peerInScene}」同为「${genKey}」字辈，对白却称叔/伯——摘录「${excerpt}」`,
    })
  }

  // 去重：同说话人+同摘录前 20 字
  const seen = new Set<string>()
  return hits.filter((h) => {
    const k = h.message.slice(0, 80)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
