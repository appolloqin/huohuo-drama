# Commercial Appeal L1+L2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce commercial-appeal L1 heuristics (ch1–8) and conditional L2 feel audit so flat-but-structurally-passing chapters fail craft and rewrite (max 3).

**Architecture:** Extend `novel-commercial-appeal-audit.ts` with three L1 detectors; add `novel-commercial-appeal-feel.ts` for L2 JSON + pure `applyAppealFeelVeto`; wire both in `checkNovelChapterCraft` so failures set `opening_promise=无` before `passed` is computed; inject fix directives into craft fix prompts; tighten prose/beat HINT.

**Tech Stack:** TypeScript, existing `chatCompletionTextAudit`, `tsx` verify scripts

**Spec:** `docs/superpowers/specs/2026-08-14-commercial-appeal-l1-l2-design.md`

---

### Task 1: L1 detectors + verify fixtures

**Files:**
- Modify: `workbench-server/src/services/novel/novel-commercial-appeal-audit.ts`
- Create: `workbench-server/scripts/verify-commercial-appeal-l1-l2.ts`

- [ ] Add dims + detectors per spec thresholds
- [ ] Merge into `listOpeningAppealHardFails` for ch≤8
- [ ] Verify flat sample fails ≥1; tight sample passes; ch9 skips new dims

### Task 2: L2 feel module + craft wiring

**Files:**
- Create: `workbench-server/src/services/novel/novel-commercial-appeal-feel.ts`
- Modify: `workbench-server/src/services/novel/novel-chapter-craft-check.ts`
- Modify: fix prompt in same file

- [ ] `runAppealFeelAudit` + `applyAppealFeelVeto` / `shouldRunAppealFeelAudit`
- [ ] After L1 pass, ch1–8 call L2; `flat` → `opening_promise=无`
- [ ] Fix prompt includes L1 codes + `fix_directive`
- [ ] Extend verify for mock flat → passed false projection

### Task 3: Prompt HINT sync

**Files:**
- Modify: `workbench-server/src/agents/webnovel-prose-style.ts`
- Modify: `workbench-server/src/services/novel/novel-chapter-beat-generate.ts` (`buildBeatOpeningRule`)
- Modify: `workbench-server/src/agents/novel-defaults.ts` if sell-point lines exist

- [ ] Anti soft-collapse / early capability / no repeat inventory lines
- [ ] Extend `verify-commercial-hook-contract.ts` needles

### Task 4: Run verifies

- [ ] `npx tsx scripts/verify-commercial-appeal-l1-l2.ts`
- [ ] `npx tsx scripts/verify-commercial-hook-contract.ts`
