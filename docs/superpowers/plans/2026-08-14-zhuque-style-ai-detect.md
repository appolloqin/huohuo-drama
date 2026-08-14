# Zhuque-style AI Detect Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Segment-level AIGC report + multi-window PPL sampling + targeted rhythm humanize (Zhuque-style UX, not Zhuque clone).

**Architecture:** Pure segment/statistical helpers in `ai-text-detection` / new `ai-detect-segments.ts`; wire multi-window + Top-K segment PPL in `ai-perplexity-detection`; extend result type; UI highlight; humanize uses high-band segments.

**Tech Stack:** TypeScript, existing `promptLogprobs`, Vue ai-detect + chapter sheet

**Spec:** `docs/superpowers/specs/2026-08-14-zhuque-style-ai-detect-design.md`

---

### Task 1: Segment + types + verify

**Files:**
- Create: `workbench-server/src/services/ai/ai-detect-segments.ts`
- Modify: `ai-text-detection.ts` (export types on result)
- Create: `scripts/verify-ai-detect-zhuque-style.ts`

- [ ] `segmentTextForAiDetect`, `scoreSegmentStatistical`, `bandFromAigc`
- [ ] Verify short-merge / band thresholds

### Task 2: Multi-window PPL + fuse into detectAiTextWithPerplexity

**Files:**
- Modify: `ai-perplexity-detection.ts`

- [ ] Windows head/mid/tail 2k; overall from max window prob
- [ ] Top-K segment local PPL fuse
- [ ] Attach `segments` + `sampling`

### Task 3: Humanize targets high-band segments

**Files:**
- Modify: `ai-dehumanizer.ts`, `ai-dehumanizer-prompt` / skill if needed
- Modify: `novel-chapter-ai-humanize-hook.ts` accept criteria

- [ ] Prefer suspected/ai excerpts
- [ ] Prompt: rhythm/structure not synonym spam
- [ ] Accept if overall↓ OR high-band count↓ OR mean aigc↓ OR PPL↑

### Task 4: UI hub + chapter sheet

**Files:**
- Modify: `workbench/app/pages/ai-detect.vue`
- Modify: chapter detect sheet in `chapter/[chapterNumber].vue` (+ i18n)

- [ ] Segment list + highlight
- [ ] Disclaimer: 本站启发式，非朱雀官方分

### Task 5: Run verifies

- [ ] `npx tsx scripts/verify-ai-detect-zhuque-style.ts`
- [ ] Existing detect-related verifies if any
