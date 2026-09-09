const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

function findRcedit() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign')
  if (!fs.existsSync(root)) return null
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      const st = fs.statSync(full)
      if (st.isDirectory()) stack.push(full)
      else if (name.toLowerCase() === 'rcedit-x64.exe') return full
    }
  }
  return null
}

function embedWinIcon(exePath, icoPath) {
  if (!fs.existsSync(exePath) || !fs.existsSync(icoPath)) {
    throw new Error(`embedWinIcon missing file: ${exePath} / ${icoPath}`)
  }
  const rcedit = findRcedit()
  if (!rcedit) throw new Error('rcedit-x64.exe not found')
  const tmp = path.join(os.tmpdir(), `huohuo-icon-${Date.now()}-${path.basename(exePath)}`)
  fs.copyFileSync(exePath, tmp)
  const r = spawnSync(rcedit, [tmp, '--set-icon', icoPath], { encoding: 'utf8' })
  if (r.status !== 0) {
    try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    throw new Error(`rcedit icon failed: ${r.stderr || r.stdout || r.status}`)
  }
  fs.copyFileSync(tmp, exePath)
  try { fs.unlinkSync(tmp) } catch { /* ignore */ }
}

exports.findRcedit = findRcedit
exports.embedWinIcon = embedWinIcon
