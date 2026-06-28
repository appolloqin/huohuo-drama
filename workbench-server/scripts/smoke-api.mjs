#!/usr/bin/env node
/**
 * 后端 API 冒烟测试
 *
 * 基础：health / 注册 / 登录 / 项目列表 / 音色列表
 * 完整链路（SMOKE_FLOW=full）：创建项目 → 写集 → 建分镜 → 查询 → 清理
 *
 * 用法：
 *   cd workbench-server && npm run smoke:api
 *   SMOKE_FLOW=full npm run smoke:api
 *
 * 环境：API_BASE 默认 http://127.0.0.1:18555/api/v1
 */
const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:18555/api/v1').replace(/\/$/, '')
const FULL_FLOW = process.argv.includes('--full')
  || process.env.SMOKE_FLOW === 'full'
  || process.env.SMOKE_FLOW === '1'

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
    json = { raw: text }
  }
  return { status: res.status, json }
}

function unwrap(json) {
  return json?.data ?? json
}

function assertOk(label, res, minStatus = 200, maxStatus = 299) {
  if (res.status < minStatus || res.status > maxStatus) {
    console.error(`FAIL ${label}: HTTP ${res.status}`, res.json)
    process.exit(1)
  }
  console.log(`OK   ${label}`)
  return res.json
}

const suffix = Date.now().toString(36)
const username = `smoke_${suffix}`
const password = 'smoke-test-pass'

console.log(`[smoke] API_BASE=${API_BASE} flow=${FULL_FLOW ? 'full' : 'basic'}`)

const health = await request('GET', '/health')
const healthBody = assertOk('GET /health', health)
if (!healthBody?.status) {
  console.error('FAIL health payload', healthBody)
  process.exit(1)
}
console.log(`     db_driver=${healthBody.db_driver || 'sqlite'}`)

const reg = await request('POST', '/auth/register', { username, password })
assertOk('POST /auth/register', reg)

const login = await request('POST', '/auth/login', { username, password })
const loginBody = assertOk('POST /auth/login', login)
const token = unwrap(loginBody)?.token
if (!token) {
  console.error('FAIL login: no token', loginBody)
  process.exit(1)
}

const dramas = await request('GET', '/dramas', null, token)
const dramasBody = assertOk('GET /dramas', dramas)
const dramaPayload = unwrap(dramasBody)
const dramaList = Array.isArray(dramaPayload)
  ? dramaPayload
  : (dramaPayload?.items ?? [])
console.log(`     dramas count=${dramaList.length}`)

const voices = await request('GET', '/ai-voices?provider=minimax', null, token)
const voicesBody = assertOk('GET /ai-voices', voices)
const voiceList = unwrap(voicesBody)
console.log(`     voices count=${Array.isArray(voiceList) ? voiceList.length : '?'}`)

if (FULL_FLOW) {
  const title = `Smoke ${suffix}`
  const create = await request('POST', '/dramas', {
    title,
    description: 'API smoke test project',
    total_episodes: 1,
  }, token)
  const createBody = assertOk('POST /dramas', create, 200, 201)
  const drama = unwrap(createBody)
  const dramaId = drama?.id
  if (!dramaId) {
    console.error('FAIL create drama: no id', createBody)
    process.exit(1)
  }
  console.log(`     drama id=${dramaId}`)

  const detail = await request('GET', `/dramas/${dramaId}`, null, token)
  const detailBody = assertOk('GET /dramas/:id', detail)
  const project = unwrap(detailBody)
  const episodes = project?.episodes ?? []
  if (!episodes.length) {
    console.error('FAIL drama detail: no seeded episodes', project)
    process.exit(1)
  }
  const episodeId = episodes[0].id
  console.log(`     episode id=${episodeId}`)

  const updateEp = await request('PUT', `/episodes/${episodeId}`, {
    content: '冒烟测试：主角走进房间，发现桌上有一封信。',
    title: '第1集',
  }, token)
  assertOk('PUT /episodes/:id', updateEp)

  const createSb = await request('POST', '/storyboards', {
    episode_id: episodeId,
    storyboard_number: 1,
    title: '开场',
    description: '主角推门而入',
    duration: 8,
  }, token)
  const sbBody = assertOk('POST /storyboards', createSb, 200, 201)
  const storyboard = unwrap(sbBody)
  console.log(`     storyboard id=${storyboard?.id ?? '?'}`)

  const listSb = await request('GET', `/episodes/${episodeId}/storyboards`, null, token)
  const listSbBody = assertOk('GET /episodes/:id/storyboards', listSb)
  const sbPayload = unwrap(listSbBody)
  const sbItems = sbPayload?.storyboards ?? sbPayload?.items ?? (Array.isArray(sbPayload) ? sbPayload : [])
  if (!sbItems.length) {
    console.error('FAIL storyboard list empty', listSbBody)
    process.exit(1)
  }
  console.log(`     storyboards count=${sbItems.length}`)

  const del = await request('DELETE', `/dramas/${dramaId}`, null, token)
  assertOk('DELETE /dramas/:id', del)
}

console.log('[smoke] all checks passed')
