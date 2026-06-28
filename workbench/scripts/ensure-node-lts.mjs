const [major, minor] = process.versions.node.split('.').map(Number)

// Node 20 / 22 都是 Active LTS；Node 24 也已发布。其它大版本不支持。
const SUPPORTED = new Set([20, 22, 24])

if (!SUPPORTED.has(major)) {
  const msg =
    `[Node Version Error] Current: v${process.versions.node}. ` +
    'Supported: Node 20 LTS or Node 22 LTS. ' +
    'Older majors (18-) are EOL; newer majors may have unverified Nuxt/Vite compatibility.'
  if (process.env.STRICT_NODE_VERSION === '1') {
    console.error(msg)
    process.exit(1)
  }
  console.warn(msg)
  process.exit(0)
}

// 推荐小版本：20.19+/22.12+ 有更好的 Vite/Esbuild 兼容性
const RECOMMENDED = { 20: 19, 22: 12, 24: 0 }
const rec = RECOMMENDED[major]
if (rec != null && minor < rec) {
  console.warn(
    `[Node Version Warning] Current: v${process.versions.node}. ` +
    `Recommended: >= v${major}.${rec} for better Nuxt/Vite stability.`
  )
}
