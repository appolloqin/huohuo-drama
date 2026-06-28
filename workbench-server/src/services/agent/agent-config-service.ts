import * as agentConfigsRepo from '../../db/repos/agent-configs/index.js'
import { now } from '../../common/http/response.js'
import { toSnakeCase, toSnakeCaseArray } from '../../common/http/transform.js'

export async function listAgentConfigs() {
  return agentConfigsRepo.listActiveAgentConfigs()
}

export async function getAgentConfigById(id: number) {
  return agentConfigsRepo.findAgentConfigById(id)
}

export async function findAgentConfigByType(agentType: string) {
  return agentConfigsRepo.findAgentConfigByType(agentType)
}

function mapUpsertPayload(body: Record<string, any>, existing?: Awaited<ReturnType<typeof findAgentConfigByType>>) {
  const ts = now()
  return {
    name: body.name ?? existing?.name ?? '',
    model: body.model ?? existing?.model ?? '',
    systemPrompt: body.system_prompt ?? existing?.systemPrompt ?? '',
    temperature: body.temperature ?? existing?.temperature ?? 0.7,
    maxTokens: body.max_tokens ?? existing?.maxTokens ?? 4096,
    maxIterations: body.max_iterations ?? existing?.maxIterations ?? 10,
    isActive: body.is_active ?? true,
    description: body.description ?? existing?.description ?? '',
    deletedAt: null,
    updatedAt: ts,
    createdAt: existing?.createdAt ?? ts,
  }
}

export async function upsertAgentConfig(body: Record<string, any>) {
  if (!body.agent_type) {
    return { ok: false as const, error: 'agent_type required' }
  }

  const agentType = String(body.agent_type).trim()

  const existing = await findAgentConfigByType(agentType)
  const payload = mapUpsertPayload(body, existing)

  if (existing) {
    await agentConfigsRepo.updateAgentConfig(existing.id, payload)
    return { ok: true as const, row: await getAgentConfigById(existing.id) }
  }

  const insertResult = await agentConfigsRepo.insertAgentConfig({
    agentType,
    ...payload,
  })

  const row = await getAgentConfigById(insertResult.lastInsertRowid)
  return { ok: true as const, row }
}

export async function patchAgentConfig(id: number, body: Record<string, any>) {
  const updates: Record<string, unknown> = { updatedAt: now() }
  const fieldMap: Record<string, string> = {
    model: 'model',
    temperature: 'temperature',
    max_tokens: 'maxTokens',
    max_iterations: 'maxIterations',
    is_active: 'isActive',
    system_prompt: 'systemPrompt',
    name: 'name',
    description: 'description',
  }

  for (const [inputKey, column] of Object.entries(fieldMap)) {
    if (inputKey in body) updates[column] = body[inputKey]
  }

  await agentConfigsRepo.updateAgentConfig(id, updates)
  return getAgentConfigById(id)
}

export async function softDeleteAgentConfig(id: number) {
  await agentConfigsRepo.softDeleteAgentConfig(id, now())
}

export function serializeAgentConfig(row: NonNullable<Awaited<ReturnType<typeof getAgentConfigById>>>) {
  return toSnakeCase(row)
}

export function serializeAgentConfigList(rows: Awaited<ReturnType<typeof listAgentConfigs>>) {
  return toSnakeCaseArray(rows)
}
