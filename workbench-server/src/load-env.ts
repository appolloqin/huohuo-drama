/**
 * 启动时加载 workbench-server/.env（须在读取 process.env 之前执行）。
 */
import { config } from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../.env')

if (fs.existsSync(envPath)) {
  // .env must win over stale shell vars (e.g. smoke tests setting CONFIG_ENCRYPTION_KEY).
  config({ path: envPath, override: true })
}
