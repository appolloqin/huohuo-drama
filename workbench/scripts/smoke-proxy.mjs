#!/usr/bin/env node
/**
 * 经 Nuxt dev 代理（与浏览器相同路径）对接 MySQL 后端联调。
 *
 * 前置：workbench-server npm run dev (18555, DB_DRIVER=mysql) + workbench npm run dev (28555)
 *
 * 用法：cd workbench && npm run smoke:proxy
 * 环境：WORKBENCH_BASE 默认 http://localhost:28555（Windows 上请用 localhost，勿用 127.0.0.1）
 */
const WORKBENCH_BASE = (process.env.WORKBENCH_BASE || 'http://localhost:28555').replace(/\/$/, '')
const API_BASE = `${WORKBENCH_BASE}/api/v1`

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text.slice(0, 200) }
  }
  return { status: res.status, json }
}

function unwrap(json) {
  if (json && typeof json === 'object' && 'data' in json) return json.data
  return json
}

function assertEnvelope(label, res, minStatus = 200, maxStatus = 299) {
  if (res.status < minStatus || res.status > maxStatus) {
    console.error(`FAIL ${label}: HTTP ${res.status}`, res.json)
    process.exit(1)
  }
  const body = res.json
  if (body?.code && body.code >= 400) {
    console.error(`FAIL ${label}: code ${body.code}`, body.message)
    process.exit(1)
  }
  console.log(`OK   ${label}`)
  return unwrap(body)
}

const suffix = Date.now().toString(36)
const username = `wb_${suffix}`
const password = 'smoke-test-pass'

console.log(`[workbench-smoke] proxy ${API_BASE}`)

// 1. 代理可达 + 后端 MySQL
const healthRes = await fetch(`${API_BASE}/health`)
const health = await healthRes.json()
if (!healthRes.ok || health?.status !== 'ok') {
  console.error('FAIL proxy health', healthRes.status, health)
  process.exit(1)
}
console.log(`OK   GET /health (via proxy) db_driver=${health.db_driver || '?'}`)
if (health.db_driver !== 'mysql') {
  console.warn('WARN expected db_driver=mysql; check workbench-server/.env')
}

// 2. 认证（登录页）
const reg = await request('POST', '/auth/register', { username, password })
assertEnvelope('POST /auth/register', reg, 200, 201)
const login = await request('POST', '/auth/login', { username, password })
const loginData = assertEnvelope('POST /auth/login', login)
const token = loginData?.token
if (!token) {
  console.error('FAIL no token', loginData)
  process.exit(1)
}

const me = await request('GET', '/auth/me', null, token)
const meData = assertEnvelope('GET /auth/me', me)
console.log(`     user=${meData?.username} credits=${meData?.credits} nav=${(meData?.nav_modules || []).length}`)

// 3. 项目列表页 / 工作台
const dramas = await request('GET', '/dramas', null, token)
const dramaList = assertEnvelope('GET /dramas', dramas)
console.log(`     dramas items=${dramaList?.items?.length ?? '?'}`)

const stats = await request('GET', '/dramas/stats', null, token)
assertEnvelope('GET /dramas/stats', stats)

const styles = await request('GET', '/dramas/styles', null, token)
assertEnvelope('GET /dramas/styles', styles)

// 4. 设置页常用接口
const aiConfigs = await request('GET', '/ai-configs', null, token)
assertEnvelope('GET /ai-configs', aiConfigs)

const agentConfigs = await request('GET', '/agent-configs', null, token)
assertEnvelope('GET /agent-configs', agentConfigs)

const voices = await request('GET', '/ai-voices?provider=minimax', null, token)
const voiceList = assertEnvelope('GET /ai-voices', voices)
console.log(`     voices=${Array.isArray(voiceList) ? voiceList.length : '?'}`)

const lessons = await request('GET', '/generation-lessons', null, token)
assertEnvelope('GET /generation-lessons', lessons)

const templates = await request('GET', '/templates', null, token)
assertEnvelope('GET /templates', templates)

const batchActive = await request('GET', '/batch-jobs/active', null, token)
assertEnvelope('GET /batch-jobs/active', batchActive)

// 5. 短剧工作台链路
const created = await request('POST', '/dramas', {
  title: `WB Smoke ${suffix}`,
  description: 'workbench proxy integration',
  total_episodes: 1,
  project_type: 'drama',
}, token)
const drama = assertEnvelope('POST /dramas', created, 200, 201)
const dramaId = drama?.id
if (!dramaId) {
  console.error('FAIL create drama', drama)
  process.exit(1)
}

const detail = await request('GET', `/dramas/${dramaId}`, null, token)
const project = assertEnvelope('GET /dramas/:id', detail)
const episodeId = project?.episodes?.[0]?.id
if (!episodeId) {
  console.error('FAIL no episode stub', project)
  process.exit(1)
}

const epList = await request('GET', `/dramas/${dramaId}/episodes`, null, token)
assertEnvelope('GET /dramas/:id/episodes', epList)

await request('PUT', `/episodes/${episodeId}`, {
  content: '联调测试正文',
  title: '第1集',
}, token).then(r => assertEnvelope('PUT /episodes/:id', r))

const sb = await request('POST', '/storyboards', {
  episode_id: episodeId,
  storyboard_number: 1,
  title: '镜头1',
  description: '联调镜头',
  duration: 5,
}, token)
assertEnvelope('POST /storyboards', sb, 200, 201)

const sbList = await request('GET', `/episodes/${episodeId}/storyboards`, null, token)
const shots = assertEnvelope('GET /episodes/:id/storyboards', sbList)
console.log(`     storyboards=${Array.isArray(shots) ? shots.length : shots?.length ?? '?'}`)

const pipeline = await request('GET', `/episodes/${episodeId}/pipeline-status`, null, token)
assertEnvelope('GET /episodes/:id/pipeline-status', pipeline)

await request('DELETE', `/dramas/${dramaId}`, null, token).then(r => assertEnvelope('DELETE /dramas/:id', r))

// 6. 工作台 HTML 可访问
const pageRes = await fetch(`${WORKBENCH_BASE}/`)
if (!pageRes.ok) {
  console.error('FAIL workbench page', pageRes.status)
  process.exit(1)
}
console.log(`OK   GET ${WORKBENCH_BASE}/ (Nuxt dev)`)

console.log('[workbench-smoke] all checks passed (MySQL via proxy)')
