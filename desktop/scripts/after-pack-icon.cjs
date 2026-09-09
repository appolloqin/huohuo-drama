const path = require('path')
const { embedWinIcon } = require('./embed-win-icon.cjs')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const exe = path.join(context.appOutDir, 'HuohuoDrama.exe')
  const ico = path.join(__dirname, '..', 'build', 'icon-win-rcedit.ico')
  embedWinIcon(exe, ico)
  console.log('[afterPack] embedded app exe icon')
}
