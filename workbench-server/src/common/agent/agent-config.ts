import * as agentConfigsRepo from '../../db/repos/agent-configs/index.js'

export async function getAgentConfig(agentType: string) {
  const rows = (await agentConfigsRepo.listActiveAgentConfigs()).filter(r => r.agentType === agentType)
  return rows.find(r => r.isActive) || rows[0] || null
}
