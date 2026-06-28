export {
  causalChainTemplate,
  CAUSAL_CHANGE_RECORD_HEADER,
  CAUSAL_CHAPTER_END_FORMAT,
} from './causal-chain-template.js'
export {
  splitProseAndChangeRecord,
  parseChangeRecord,
  extractChangeRecordFromChapter,
  detachChangeRecordForStorage,
  resolveFullChapterForAudit,
  isNoChangeDeclared,
  type CausalChangeEntry,
} from './causal-chain-parser.js'
export {
  ensureCausalChangeRecordAppended,
  needsCausalChangeRecordFix,
  isOnlyCausalChangeRecordIssue,
  hasValidChangeRecord,
  buildFallbackChangeRecord,
} from './ensure-causal-change-record.js'
export {
  buildCausalCreationRulesBlock,
  buildCausalOriginBlock,
} from './causal-chain-prompt.js'
export {
  readCausalChain,
  writeCausalChain,
  ensureCausalChain,
  updateCausalChainFromChapter,
} from './causal-chain-manager.js'
export {
  runCausalChainAudit,
  formatCausalHardBlock,
  formatCausalRuleBlock,
  type CausalAuditResult,
  type CausalAuditItem,
} from './causal-chain-audit.js'

export function isCausalChainEnabled(meta: { causal_chain_enabled?: boolean }): boolean {
  return meta.causal_chain_enabled !== false
}
