/**
 * 指称串名硬审（题材无关）：
 * 同一短指称以同位方式绑到 ≥2 个不同专名 → 硬伤。
 * 不维护亲属称谓词表；直接扫「2字指称+3字专名 / 3字专名+2字指称」结构。
 */

export type ReferentNameBindingHit = {
  layer: 'hard'
  rule: 'referent_name_binding_conflict'
  message: string
}

const NAME_RIGHT =
  '是|在|的|了|着|过|跟|把|被|给|对|向|与|和|说|道|问|看|听|走|来|去|又|也|都|就|还|才|只|从|往|到|用|有|没|不|很|最|已|将|会|能|可|要|想|让|叫|为|同|比|站|坐|点|望|冲|朝|顺|沿|经|由|因|但|而|且|或|若|如|便|却|并'

const NOISE_NAME =
  /^(但是|已经|什么|不是|可以|没有|这个|那个|因为|所以|如果|虽然|然后|于是|自己|他们|我们|你们|时候|地方|东西|现在|今天|明天|昨日|上午|下午|晚上|账本|账册|银子|金子|黑风|北狄|私铁|暗账|中间|跑腿|钱袋|袋子|勾连|账目|一页|页页|记在|满仓|老虎|寨子)/

const NOISE_REFERENT =
  /^(把被|给让|从往|向对|与和|的了|着过|是有|没不|也都|就还|又才|只跟|在到|说道|问看|听想|来去|进出|上下|这那|什么|怎么|已经|但是|因为|所以|可以|没有|自己|他们|我们|你们|时候|地方|东西|现在|今天|明日|昨日|看着|望着|对着|朝着|顺着|沿着|通过|关于|为了|除了|点了|点头|后来|又写|勾连|记在|一页|这头|头老|连的|在孙|都记)/

function looksLikePersonName(name: string): boolean {
  if (!/^[\u4e00-\u9fff]{3}$/.test(name)) return false
  if (NOISE_NAME.test(name)) return false
  if (/[的了着过是]$/.test(name)) return false
  return true
}

function looksLikeReferent(label: string): boolean {
  if (!/^[\u4e00-\u9fff]{2}$/.test(label)) return false
  if (NOISE_REFERENT.test(label)) return false
  return true
}

const RIGHT_RE = `(?:${NAME_RIGHT}|[，,。！!？?：:；;、\\s”"』）\\)]|$)`

/** 指称 → 专名集合 */
export function extractReferentNameBindings(content: string): Map<string, Set<string>> {
  const text = content || ''
  const map = new Map<string, Set<string>>()
  const add = (label: string, name: string) => {
    if (!looksLikeReferent(label) || !looksLikePersonName(name)) return
    let set = map.get(label)
    if (!set) {
      set = new Set()
      map.set(label, set)
    }
    set.add(name)
  }

  // 二叔秦德贵跟 / 二叔秦德东，
  const labelThenName = new RegExp(
    `([\\u4e00-\\u9fff]{2})([\\u4e00-\\u9fff]{3})(?=${RIGHT_RE})`,
    'g',
  )
  let m: RegExpExecArray | null
  while ((m = labelThenName.exec(text))) {
    add(m[1]!, m[2]!)
  }

  // 秦德贵二叔点 / 秦德东二叔，
  const nameThenLabel = new RegExp(
    `([\\u4e00-\\u9fff]{3})([\\u4e00-\\u9fff]{2})(?=${RIGHT_RE})`,
    'g',
  )
  while ((m = nameThenLabel.exec(text))) {
    add(m[2]!, m[1]!)
  }

  return map
}

/**
 * 硬审：同一指称绑 ≥2 专名。
 * @param corpora 本章 + 可选上章/前序
 */
export function detectReferentNameBindingConflicts(
  ...corpora: Array<string | undefined | null>
): ReferentNameBindingHit[] {
  const text = corpora.filter((c) => (c || '').trim()).join('\n\n')
  if (!text.trim()) return []
  const bindings = extractReferentNameBindings(text)
  const hits: ReferentNameBindingHit[] = []
  for (const [label, names] of bindings) {
    if (names.size < 2) continue
    const list = [...names].sort()
    hits.push({
      layer: 'hard',
      rule: 'referent_name_binding_conflict',
      message: `指称串名：「${label}」同时绑到 ${list.map((n) => `「${n}」`).join('、')}——同一指称只能对应一人`,
    })
  }
  return hits
}
