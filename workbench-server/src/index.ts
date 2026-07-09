import './load-env.js'
import { configureFfmpegPaths } from './common/media/ffmpeg-path.js'
import './db/bootstrap.js'

configureFfmpegPaths()
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import dramas from './routes/drama/dramas.js'
import episodes from './routes/drama/episodes.js'
import storyboards from './routes/drama/storyboards.js'
import scenes from './routes/drama/scenes.js'
import characters from './routes/drama/characters.js'
import characterForms from './routes/drama/character-forms.js'
import props from './routes/drama/props.js'
import images from './routes/media/images.js'
import videos from './routes/media/videos.js'
import upload from './routes/media/upload.js'
import aiConfigs, { aiProviders } from './routes/ai/ai-configs.js'
import agentConfigs from './routes/agent/agent-configs.js'
import agent from './routes/agent/agent.js'
import compose from './routes/drama/compose.js'
import slideshow from './routes/drama/slideshow.js'
import merge from './routes/drama/merge.js'
import grid from './routes/drama/grid.js'
import skills from './routes/skill/skills.js'
import generationLessons from './routes/lesson/generation-lessons.js'
import webhooks from './routes/webhook/webhooks.js'
import aiVoices from './routes/media/ai-voices.js'
import auth from './routes/auth/auth.js'
import showcase from './routes/showcase/showcase.js'
import payments from './routes/payment/payments.js'
import novel from './routes/novel/novel.js'
import aiDetect from './routes/ai/ai-detect.js'
import templates from './routes/template/templates.js'
import batchJobs from './routes/task/batch-jobs.js'
import mobile from './routes/mobile/mobile.js'
import seo from './routes/showcase/seo.js'
import { recoverStaleBatchJobs, resumePendingBatchJobs } from './services/batch/batch-job-service.js'
import { requireAuth } from './middleware/auth.js'
import { apiRobotsNoIndex } from './middleware/seo.js'
import { requestLogger, errorHandler } from './middleware/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

const httpApp = new Hono()

// Middleware
httpApp.use('*', cors({
  origin: [
    'http://localhost:28555',
    'http://127.0.0.1:28555',
    'http://localhost:18555',
    'http://127.0.0.1:18555',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:38555',
    'http://127.0.0.1:38555',
    'http://localhost:48555',
    'http://127.0.0.1:48555',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ],
  credentials: true,
}))
httpApp.use('*', requestLogger)
httpApp.use('*', errorHandler)

// Health check
httpApp.get('/api/v1/health', (c) => c.json({
  status: 'ok',
  db_driver: process.env.DB_DRIVER || 'sqlite',
  timestamp: new Date().toISOString(),
}))

// SEO（根路径，供无 nginx 或直连后端时使用）
httpApp.route('/', seo)

// API routes — /auth 公开；/showcase 需站点凭证；业务 API 需用户 JWT
const v1Api = new Hono()
v1Api.use('*', apiRobotsNoIndex)
v1Api.route('/auth', auth)
v1Api.route('/mobile', mobile)
v1Api.route('/showcase', showcase)
v1Api.route('/payments', payments)

const protectedApi = new Hono()
protectedApi.use('*', requireAuth)
protectedApi.route('/dramas', dramas)
protectedApi.route('/templates', templates)
protectedApi.route('/novel', novel)
protectedApi.route('/ai-detect', aiDetect)
protectedApi.route('/episodes', episodes)
protectedApi.route('/storyboards', storyboards)
protectedApi.route('/scenes', scenes)
protectedApi.route('/characters', characters)
protectedApi.route('/character-forms', characterForms)
protectedApi.route('/props', props)
protectedApi.route('/images', images)
protectedApi.route('/videos', videos)
protectedApi.route('/upload', upload)
protectedApi.route('/ai-configs', aiConfigs)
protectedApi.route('/ai-providers', aiProviders)
protectedApi.route('/agent-configs', agentConfigs)
protectedApi.route('/agent', agent)
protectedApi.route('/compose', compose)
protectedApi.route('/slideshow', slideshow)
protectedApi.route('/merge', merge)
protectedApi.route('/grid', grid)
protectedApi.route('/skills', skills)
protectedApi.route('/generation-lessons', generationLessons)
protectedApi.route('/ai-voices', aiVoices)
protectedApi.route('/batch-jobs', batchJobs)

v1Api.route('/', protectedApi)

httpApp.route('/api/v1', v1Api)

// Webhook callbacks (Vidu, etc.) - outside /api/v1
httpApp.use('/webhooks/*', apiRobotsNoIndex)
httpApp.route('/webhooks', webhooks)

// Serve static files (storage)
httpApp.use('/static/*', serveStatic({ root: path.join(repoRoot, 'workbench-data') }))

// Serve workbench (production build or Nuxt .output/public)
const workbenchStaticCandidates = [
  path.join(repoRoot, 'workbench', 'dist'),
  path.join(repoRoot, 'workbench', '.output', 'public'),
]
const distPath = workbenchStaticCandidates.find((p) => fs.existsSync(p))
if (distPath) {
  httpApp.use('*', serveStatic({ root: distPath }))
  httpApp.get('*', serveStatic({ root: distPath, path: 'index.html' }))
} else {
  console.log(
    'ℹ️ 未找到工作台静态资源（workbench/dist 或 workbench/.output/public），后端仅提供 API。\n'
    + '   本地开发请另开终端：cd workbench && npm run dev  →  http://localhost:28555',
  )
}

const port = Number(process.env.PORT || 18555)
void recoverStaleBatchJobs().then(() => resumePendingBatchJobs())
console.log(`🚀 火火短剧 后端已启动 http://localhost:${port}`)
serve({ fetch: httpApp.fetch, port })
