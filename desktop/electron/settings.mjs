import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export const DEFAULT_REMOTE_URL = 'https://www.seeddrama.com/console/login'

/**
 * @typedef {{ mode: 'local' | 'remote', remoteUrl: string }} DesktopSettings
 */

function settingsPath() {
  return path.join(app.getPath('userData'), 'desktop-settings.json')
}

/** @returns {DesktopSettings} */
export function loadSettings() {
  const fallback = { mode: 'local', remoteUrl: DEFAULT_REMOTE_URL }
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw)
    const mode = parsed.mode === 'remote' ? 'remote' : 'local'
    let remoteUrl = typeof parsed.remoteUrl === 'string' ? parsed.remoteUrl.trim() : DEFAULT_REMOTE_URL
    try {
      remoteUrl = new URL(remoteUrl).href
    } catch {
      remoteUrl = DEFAULT_REMOTE_URL
    }
    return { mode, remoteUrl }
  } catch {
    return fallback
  }
}

/** @param {Partial<DesktopSettings>} patch */
export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch }
  if (next.mode !== 'remote') next.mode = 'local'
  try {
    next.remoteUrl = new URL(String(next.remoteUrl || DEFAULT_REMOTE_URL)).href
  } catch {
    next.remoteUrl = DEFAULT_REMOTE_URL
  }
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2))
  return next
}

export function dataDir() {
  const dir = path.join(app.getPath('userData'), 'workbench-data')
  fs.mkdirSync(path.join(dir, 'static'), { recursive: true })
  return dir
}
