# ComfyUI Mode Providers Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split ComfyUI into `comfyui-t2i` / `comfyui-i2i` / `comfyui-t2v` / `comfyui-i2v` service providers with mode-aware workflows, soft sibling reconcile before credits, style-vs-content ref handling, and a `/system_stats` connectivity probe — without changing OpenAI / MiniMax / Hailuo adapters.

**Architecture:** Shared Comfy adapters stay; registry gains four mode slugs (+ legacy). Pure helpers in `comfyui-mode-resolve.ts`; async sibling switch in `comfyui-mode-reconcile.ts` (services/ai, not adapters). Style apply helpers stamp `styleReferenceUrl`; persist on generation row (`style` JSON) into `prepareGenerate`. Settings presets and provision seeds advertise the four providers.

**Tech Stack:** TypeScript (Node `tsx --test`), Hono workbench-server, Nuxt settings UI, Drizzle provision seeds.

**Spec:** `docs/superpowers/specs/2026-09-13-comfyui-mode-providers-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `workbench-server/src/routes/ai/ai-config-probe.ts` | Comfy-family `GET /system_stats` probe branch |
| `workbench-server/src/routes/ai/ai-config-probe.test.ts` | **Create** — probe unit tests |
| `workbench-server/src/services/ai/adapters/comfyui-workflow.ts` | Mode-keyed defaults, required titles, helpers |
| `workbench-server/src/services/ai/adapters/comfyui-mode-resolve.ts` | **Create** — pure helpers only (no db imports) |
| `workbench-server/src/services/ai/adapters/comfyui-mode-resolve.test.ts` | **Create** |
| `workbench-server/src/services/ai/comfyui-mode-reconcile.ts` | **Create** — async sibling switch using `ai-service-configs` repo |
| `workbench-server/src/services/drama/drama-style-reference.test.ts` | **Create** — style stamp tests |
| `workbench-server/src/services/ai/adapters/comfyui-image.ts` | Provider ctor arg; content-ref upload; mode workflow |
| `workbench-server/src/services/ai/adapters/comfyui-video.ts` | Same for video |
| `workbench-server/src/services/ai/adapters/registry.ts` | Register 4 mode slugs + legacy |
| `workbench-server/src/services/ai/adapters/comfyui-workflow.test.ts` | Extend / update tests |
| `workbench-server/src/services/drama/drama-style-reference.ts` | Stamp `styleReferenceUrl` |
| `workbench-server/src/services/media/image-generation.ts` | Reconcile before credits; job meta |
| `workbench-server/src/services/media/video-generation.ts` | Same |
| `workbench-server/src/services/ai/adapters/image-contracts.ts` / `video-contracts.ts` | Optional `styleReferenceUrl` on records if needed |
| `workbench-server/src/db/provision-sqlite.ts` / `provision-mysql.ts` | Four provider seeds |
| `workbench/app/pages/settings.vue` | Presets, picker, workflow gate |
| `workbench/app/i18n/messages/{zh-CN,en,settings-vi,settings-fil}.ts` | Labels / hints |
| `workbench-server/package.json` | Add new test files to `verify:media-adapters` |

---

## Chunk 1: Probe, registry, mode-keyed workflows

### Task 1: Failing probe tests + Comfy probe branch

**Files:**
- Create: `workbench-server/src/routes/ai/ai-config-probe.test.ts`
- Modify: `workbench-server/src/routes/ai/ai-config-probe.ts`
- Modify: `workbench-server/package.json` (`verify:media-adapters` script — add probe test path in Task 5 if preferred; include now)

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildProviderProbeSpec } from './ai-config-probe.js'

describe('buildProviderProbeSpec comfyui', () => {
  for (const provider of ['comfyui', 'comfyui-t2i', 'comfyui-i2i', 'comfyui-t2v', 'comfyui-i2v']) {
    it(`probes ${provider} via GET /system_stats`, () => {
      const spec = buildProviderProbeSpec('image', provider, 'http://127.0.0.1:8188', 'x', 'k')
      assert.equal(spec.method, 'GET')
      assert.equal(spec.url, 'http://127.0.0.1:8188/system_stats')
      assert.equal(spec.body, undefined)
      assert.equal(spec.headers.Authorization, 'Bearer k')
    })
  }

  it('does not change openai chat probe', () => {
    const spec = buildProviderProbeSpec('text', 'openai', 'https://api.openai.com', 'gpt', 'k')
    assert.match(spec.url, /\/v1\/models$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd workbench-server && npx tsx --test src/routes/ai/ai-config-probe.test.ts`

Expected: FAIL (Comfy still falls through to chat completions or wrong URL).

- [ ] **Step 3: Implement probe branch**

Near the top of `buildProviderProbeSpec` (after gemini or before openai), add:

```ts
const COMFY_PROVIDERS = new Set([
  'comfyui', 'comfyui-t2i', 'comfyui-i2i', 'comfyui-t2v', 'comfyui-i2v',
])
if (COMFY_PROVIDERS.has(p)) {
  const base = (baseUrl || '').replace(/\/+$/, '')
  return {
    method: 'GET',
    url: `${base}/system_stats`,
    headers: bearerAuthHeaders(apiKey),
    body: undefined,
  }
}
```

Do **not** change OpenAI / MiniMax / Hailuo branches.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd workbench-server && npx tsx --test src/routes/ai/ai-config-probe.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -f workbench-server/src/routes/ai/ai-config-probe.ts workbench-server/src/routes/ai/ai-config-probe.test.ts
git commit -m "fix: probe ComfyUI via GET /system_stats"
```

---

### Task 2: Mode-keyed default workflows + required titles

**Files:**
- Modify: `workbench-server/src/services/ai/adapters/comfyui-workflow.ts`
- Modify: `workbench-server/src/services/ai/adapters/comfyui-workflow.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `comfyui-workflow.test.ts`:

```ts
import {
  assertComfyRequiredTitles,
  resolveComfyuiWorkflow,
  type ComfyMode,
} from './comfyui-workflow.js'

it('t2i default has positive but not load_image', () => {
  const titles = Object.values(resolveComfyuiWorkflow(null, 't2i')).map((n) =>
    String(n._meta?.title || ''),
  )
  assert.equal(titles.includes('positive'), true)
  assert.equal(titles.includes('load_image'), false)
})

it('i2i default includes load_image', () => {
  const titles = Object.values(resolveComfyuiWorkflow(null, 'i2i')).map((n) =>
    String(n._meta?.title || ''),
  )
  assert.equal(titles.includes('load_image'), true)
})

it('t2v default has no first_frame', () => {
  const titles = Object.values(resolveComfyuiWorkflow(null, 't2v')).map((n) =>
    String(n._meta?.title || ''),
  )
  assert.equal(titles.includes('first_frame'), false)
})

it('i2v default includes first_frame', () => {
  const titles = Object.values(resolveComfyuiWorkflow(null, 'i2v')).map((n) =>
    String(n._meta?.title || ''),
  )
  assert.equal(titles.includes('first_frame'), true)
})

it('assertComfyRequiredTitles fails i2i without load_image', () => {
  assert.throws(
    () => assertComfyRequiredTitles({ '1': { _meta: { title: 'positive' }, inputs: {} } }, 'i2i'),
    /load_image/,
  )
})

it('assertComfyRequiredTitles fails i2v without first_frame', () => {
  assert.throws(
    () => assertComfyRequiredTitles({ '1': { _meta: { title: 'positive' }, inputs: {} } }, 'i2v'),
    /first_frame/,
  )
})
```

Also update the existing `resolveComfyuiWorkflow(null, 'image')` call sites to `'t2i'` or keep a backward-compat overload (see Step 3).

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd workbench-server && npx tsx --test src/services/ai/adapters/comfyui-workflow.test.ts`

- [ ] **Step 3: Implement**

In `comfyui-workflow.ts`:

1. Export `export type ComfyMode = 't2i' | 'i2i' | 't2v' | 'i2v'`
2. Split defaults:
   - `DEFAULT_T2I_WORKFLOW` = current image graph **without** node `'10'` (`load_image`)
   - `DEFAULT_I2I_WORKFLOW` = current image graph **with** `load_image`
   - `DEFAULT_T2V_WORKFLOW` = positive/negative/duration/save only (no frame/load nodes)
   - `DEFAULT_I2V_WORKFLOW` = current video graph (keep first/last/load/duration)
3. Change signature:

```ts
export function resolveComfyuiWorkflow(
  settings: string | Record<string, unknown> | null | undefined,
  mode: ComfyMode | 'image' | 'video',
): ComfyGraph {
  // Spec: legacy service_type aliases map to t2i / t2v (not i2v).
  const normalized: ComfyMode =
    mode === 'image' ? 't2i' : mode === 'video' ? 't2v' : mode
  const defaults: Record<ComfyMode, ComfyGraph> = {
    t2i: DEFAULT_T2I_WORKFLOW,
    i2i: DEFAULT_I2I_WORKFLOW,
    t2v: DEFAULT_T2V_WORKFLOW,
    i2v: DEFAULT_I2V_WORKFLOW,
  }
  // ... parse settings.workflow same as today ...
  return cloneGraph(custom || defaults[normalized])
}
```

4. Add:

```ts
const REQUIRED: Record<ComfyMode, string[]> = {
  t2i: ['positive'],
  i2i: ['positive', 'load_image'],
  t2v: ['positive'],
  i2v: ['positive', 'first_frame'],
}

export function assertComfyRequiredTitles(graph: ComfyGraph, mode: ComfyMode): void {
  const titles = new Set(
    Object.values(graph).map((n) => String(n._meta?.title || n.title || '').trim().toLowerCase()),
  )
  for (const need of REQUIRED[mode]) {
    if (!titles.has(need)) {
      throw new Error(`ComfyUI workflow 缺少标题为 ${need} 的节点（模式 ${mode}）`)
    }
  }
}

export function comfyModeFromProvider(provider: string, fallback: ComfyMode): ComfyMode {
  const p = provider.toLowerCase()
  if (p === 'comfyui-t2i') return 't2i'
  if (p === 'comfyui-i2i') return 'i2i'
  if (p === 'comfyui-t2v') return 't2v'
  if (p === 'comfyui-i2v') return 'i2v'
  return fallback // legacy comfyui
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add workbench-server/src/services/ai/adapters/comfyui-workflow.ts workbench-server/src/services/ai/adapters/comfyui-workflow.test.ts
git commit -m "feat: mode-keyed ComfyUI default workflows and title checks"
```

---

### Task 3: Registry mode slugs

**Files:**
- Modify: `workbench-server/src/services/ai/adapters/comfyui-image.ts`
- Modify: `workbench-server/src/services/ai/adapters/comfyui-video.ts`
- Modify: `workbench-server/src/services/ai/adapters/registry.ts`
- Modify: `workbench-server/src/services/ai/adapters/comfyui-workflow.test.ts`

- [ ] **Step 1: Failing registry assertions**

```ts
it('registers all ComfyUI mode image adapters', () => {
  for (const p of ['comfyui', 'comfyui-t2i', 'comfyui-i2i']) {
    assert.equal(getImageAdapter(p).provider, p)
  }
  assert.notEqual(getImageAdapter('comfyui-t2i').provider, 'minimax')
})

it('registers all ComfyUI mode video adapters', () => {
  for (const p of ['comfyui', 'comfyui-t2v', 'comfyui-i2v']) {
    assert.equal(getVideoAdapter(p).provider, p)
  }
})
```

- [ ] **Step 2: Run — expect FAIL** (`comfyui-t2i` falls back to MiniMax)

- [ ] **Step 3: Implement**

```ts
// comfyui-image.ts
export class ComfyUIImageAdapter implements ImageProviderAdapter {
  readonly provider: string
  constructor(provider = 'comfyui') {
    this.provider = provider
  }
  // ...
}

// registry image pool:
comfyui: new ComfyUIImageAdapter('comfyui'),
'comfyui-t2i': new ComfyUIImageAdapter('comfyui-t2i'),
'comfyui-i2i': new ComfyUIImageAdapter('comfyui-i2i'),

// video pool:
comfyui: new ComfyUIVideoAdapter('comfyui'),
'comfyui-t2v': new ComfyUIVideoAdapter('comfyui-t2v'),
'comfyui-i2v': new ComfyUIVideoAdapter('comfyui-i2v'),
```

Leave adapter upload/workflow wiring for Chunk 2/3 if still using `'image'|'video'` temporarily — but prefer calling `comfyModeFromProvider(cfg.provider, 't2i'|'t2v')` immediately once Task 2 lands.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add workbench-server/src/services/ai/adapters/registry.ts workbench-server/src/services/ai/adapters/comfyui-image.ts workbench-server/src/services/ai/adapters/comfyui-video.ts workbench-server/src/services/ai/adapters/comfyui-workflow.test.ts
git commit -m "feat: register ComfyUI t2i/i2i/t2v/i2v adapters"
```

---

## Chunk 2: Mode detect, style stamp, reconcile, generate wiring

### Task 4: `comfyui-mode-resolve` pure helpers + tests

**Files:**
- Create: `workbench-server/src/services/ai/adapters/comfyui-mode-resolve.ts`
- Create: `workbench-server/src/services/ai/adapters/comfyui-mode-resolve.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  contentRefUrls,
  detectComfyImageMode,
  detectComfyVideoMode,
  isComfyFamilyProvider,
  preferredComfyProvider,
  pickComfySiblingConfig,
} from './comfyui-mode-resolve.js'
import type { AIConfig } from './adapter-shared.js'

describe('comfyui-mode-resolve', () => {
  it('strips style URL from content refs', () => {
    assert.deepEqual(
      contentRefUrls(['style.png', 'face.png'], 'style.png'),
      ['face.png'],
    )
  })

  it('style-only => t2i', () => {
    assert.equal(detectComfyImageMode(['style.png'], 'style.png'), 't2i')
  })

  it('content ref => i2i', () => {
    assert.equal(detectComfyImageMode(['style.png', 'face.png'], 'style.png'), 'i2i')
  })

  it('video frames => i2v', () => {
    assert.equal(
      detectComfyVideoMode({ firstFrameUrl: 'a.png', referenceImageUrls: [], styleReferenceUrl: 's.png' }),
      'i2v',
    )
  })

  it('style-only video refs => t2v', () => {
    assert.equal(
      detectComfyVideoMode({ referenceImageUrls: ['s.png'], styleReferenceUrl: 's.png' }),
      't2v',
    )
  })

  it('pickComfySiblingConfig prefers same base_url', () => {
    const current = { id: 1, provider: 'comfyui-t2i', baseUrl: 'http://a', serviceType: 'image' } as AIConfig
    const rows = [
      { id: 2, provider: 'comfyui-i2i', baseUrl: 'http://b', serviceType: 'image', isActive: true },
      { id: 3, provider: 'comfyui-i2i', baseUrl: 'http://a', serviceType: 'image', isActive: true },
    ]
    const picked = pickComfySiblingConfig(current, 'i2i', rows as any)
    assert.equal(picked?.id, 3)
  })

  it('non-comfy preferred provider is null path', () => {
    assert.equal(isComfyFamilyProvider('minimax'), false)
    assert.equal(preferredComfyProvider('image', 'i2i'), 'comfyui-i2i')
  })

  it('reconcileComfyDecision keeps matching provider', () => {
    const d = reconcileComfyDecision(
      { provider: 'comfyui-i2i', serviceType: 'image', baseUrl: 'http://a' } as AIConfig,
      'i2i',
      null,
    )
    assert.equal(d.action, 'keep')
  })

  it('reconcileComfyDecision switches to sibling', () => {
    const d = reconcileComfyDecision(
      { provider: 'comfyui-t2i', serviceType: 'image', baseUrl: 'http://a' } as AIConfig,
      'i2i',
      { id: 9 },
    )
    assert.deepEqual(d, { action: 'switch', id: 9 })
  })

  it('reconcileComfyDecision keeps legacy comfyui when no sibling', () => {
    const d = reconcileComfyDecision(
      { provider: 'comfyui', serviceType: 'image', baseUrl: 'http://a' } as AIConfig,
      'i2i',
      null,
    )
    assert.equal(d.action, 'keep')
  })

  it('reconcileComfyDecision errors on mode mismatch without sibling', () => {
    const d = reconcileComfyDecision(
      { provider: 'comfyui-t2i', serviceType: 'image', baseUrl: 'http://a' } as AIConfig,
      'i2i',
      null,
    )
    assert.equal(d.action, 'error')
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (module missing)

- [ ] **Step 3: Implement pure `comfyui-mode-resolve.ts` (NO db/repos imports)**

Implement `isComfyFamilyProvider`, `contentRefUrls`, `detectComfyImageMode`, `detectComfyVideoMode`, `preferredComfyProvider`, `pickComfySiblingConfig`, `reconcileComfyDecision`, `throwIfReconcileError` as sketched in the tests above (copy bodies from the previous draft in git history / spec — keep them pure).

Also export:

```ts
/** Mode for workflow/upload: mode slugs from provider; legacy from job detection. */
export function resolveRuntimeComfyMode(
  provider: string,
  detected: ComfyMode,
): ComfyMode {
  const p = provider.toLowerCase()
  if (p === 'comfyui-t2i') return 't2i'
  if (p === 'comfyui-i2i') return 'i2i'
  if (p === 'comfyui-t2v') return 't2v'
  if (p === 'comfyui-i2v') return 'i2v'
  if (p === 'comfyui') return detected // legacy dual-mode
  return detected
}
```

- [ ] **Step 4: Implement async wrapper OUTSIDE adapters**

Create `workbench-server/src/services/ai/comfyui-mode-reconcile.ts`:

```ts
import * as aiConfigsRepo from '../../db/repos/ai-service-configs/index.js'
import type { AIConfig } from './ai.js'
import type { ComfyMode } from './adapters/comfyui-workflow.js'
import {
  isComfyFamilyProvider,
  pickComfySiblingConfig,
  preferredComfyProvider,
  reconcileComfyDecision,
  throwIfReconcileError,
} from './adapters/comfyui-mode-resolve.js'
import { rowToAiConfig, UserAiConfigError } from './user-ai-config-resolve.js'

export async function reconcileComfyServiceConfig(
  current: AIConfig,
  mode: ComfyMode,
): Promise<AIConfig> {
  if (!isComfyFamilyProvider(current.provider)) return current
  const rows = await aiConfigsRepo.listServiceConfigsByType(current.serviceType)
  const sibling = pickComfySiblingConfig(current, mode, rows)
  const decision = reconcileComfyDecision(current, mode, sibling)
  throwIfReconcileError(decision)
  if (decision.action === 'keep') return current
  const row = await aiConfigsRepo.findServiceConfigById(decision.id)
  if (!row || !row.isActive) {
    throw new UserAiConfigError(
      `ComfyUI 模式配置不可用：${preferredComfyProvider(
        current.serviceType === 'video' ? 'video' : 'image',
        mode,
      )}`,
    )
  }
  return rowToAiConfig(row, current.serviceType)
}
```

- [ ] **Step 5: Run tests — PASS**

- [ ] **Step 6: Commit**

```bash
git add workbench-server/src/services/ai/adapters/comfyui-mode-resolve.ts \
  workbench-server/src/services/ai/adapters/comfyui-mode-resolve.test.ts \
  workbench-server/src/services/ai/comfyui-mode-reconcile.ts
git commit -m "feat: ComfyUI mode detection and sibling reconcile helpers"
```

---

### Task 5: Stamp `styleReferenceUrl` + persist on job record + reconcile-before-credits

**Files:**
- Modify: `workbench-server/src/services/drama/drama-style-reference.ts`
- Create: `workbench-server/src/services/drama/drama-style-reference.test.ts`
- Modify: `workbench-server/src/services/media/image-generation.ts`
- Modify: `workbench-server/src/services/media/video-generation.ts`
- Modify: `workbench-server/src/services/ai/adapters/image-contracts.ts` / `video-contracts.ts`
- Prefer: store `styleReferenceUrl` on the generation row’s existing `style` JSON (video already uses `style` JSON) **or** prepend a stable marker — **preferred approach below uses `style` JSON for video and image `style` column if present, else encode in a side channel only as last resort.**

**Preferred persist (no new DB migration):**

- Image: `image_generations.style` exists in schema — write `JSON.stringify({ style_reference_url })` when stamping (if column currently unused/null for these jobs). Confirm insert path accepts `style`.
- Video: merge into existing `style` JSON: `{ generate_audio, generate_subtitles, style_reference_url }`.
- Worker reads it back onto `frameJob.styleReferenceUrl` / clip record.

If image `style` is already used for something else, fall back to in-memory map and document residual restart risk — check `insertImageGeneration` callers first.

- [ ] **Step 1: Failing style-stamp test**

```ts
// drama-style-reference.test.ts
it('stamps styleReferenceUrl when style image applied', () => {
  const out = applyStyleReferenceToImageGeneration(
    { prompt: 'a', referenceImages: ['face.png'] },
    { referenceImage: 'style.png', promptPrefix: 'STYLE' },
  )
  assert.equal(out.styleReferenceUrl, 'style.png')
  assert.deepEqual(out.referenceImages, ['style.png', 'face.png'])
})
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement stamp on apply helpers** (image + video)

- [ ] **Step 4: Failing reconcile-order helper test** (pure)

Extract a tiny helper in `comfyui-mode-resolve.ts` or media file:

```ts
export function creditProviderAfterReconcile(
  beforeProvider: string,
  after: AIConfig,
): string {
  return after.provider
}
```

Or better: unit-test documentation via `reconcileComfyDecision` already covering switch; in Task 5 code review ensure `consumeCredits` is **after** `reconcileComfyServiceConfig` in both generate functions (checklist step, verified by reading the final code).

- [ ] **Step 5: Wire generateImage / generateVideo**

```ts
let { config, source } = await resolveUserServiceConfig(...)
const before = config.provider
if (isComfyFamilyProvider(config.provider)) {
  const mode = detectComfyImageMode(params.referenceImages, params.styleReferenceUrl)
  config = await reconcileComfyServiceConfig(config, mode)
  if (config.provider !== before) {
    logTaskProgress('ImageTask', 'comfy-mode-switch', { from: before, to: config.provider })
  }
}
const creditCost = resolveCreditCostFromConfig(config, 0)
// consumeCredits ... then insert with style_reference_url persisted
```

Add `styleReferenceUrl?: string` to generate params. Persist on insert; worker hydrates record.

- [ ] **Step 6: typecheck + style tests PASS**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: reconcile ComfyUI mode before credits; stamp style refs"
```

---

## Chunk 3: Adapter content-ref uploads + validation

### Task 6: Image/video adapters honor mode + content refs

**Files:**
- Modify: `workbench-server/src/services/ai/adapters/comfyui-image.ts`
- Modify: `workbench-server/src/services/ai/adapters/comfyui-video.ts`
- Modify: `workbench-server/src/services/ai/adapters/comfyui-mode-resolve.test.ts` (firstContentImageRef tests)

- [ ] **Step 1: Test `firstContentImageRef` / content selection**

- [ ] **Step 2: Run — FAIL until helper exists**

- [ ] **Step 3: Update adapters — critical legacy rule**

```ts
async prepareGenerate(cfg, record) {
  const detected = detectComfyImageMode(
    parseRefList(record.referenceImages),
    record.styleReferenceUrl,
  )
  const mode = resolveRuntimeComfyMode(cfg.provider, detected)
  // legacy comfyui with content refs => mode i2i => upload
  if (mode === 't2i') return
  const src = contentRefUrls(parseRefList(record.referenceImages), record.styleReferenceUrl)[0]
  if (!src) throw new Error('图生图需要内容参考图')
  ...
}

buildGenerateRequest(cfg, record) {
  const detected = detectComfyImageMode(...)
  const mode = resolveRuntimeComfyMode(cfg.provider, detected)
  const graph = resolveComfyuiWorkflow(cfg.settings, mode)
  if (cfg.provider.toLowerCase() !== 'comfyui') {
    assertComfyRequiredTitles(graph, mode)
  }
  ...
}
```

Same pattern for video with `detectComfyVideoMode` + `resolveRuntimeComfyMode`.

**Do not** use `comfyModeFromProvider(cfg.provider, 't2i')` alone for uploads — that freezes legacy on t2i.

- [ ] **Step 4: Run verify suite**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: ComfyUI adapters upload content refs by mode"
```

---

## Chunk 4: Seeds + settings UI

### Task 7: Provision seeds

**Files:**
- Modify: `workbench-server/src/db/provision-sqlite.ts`
- Modify: `workbench-server/src/db/provision-mysql.ts`

- [ ] **Step 1: Insert-if-missing four mode provider rows**

Add four `ai_service_providers` rows (t2i/i2i/t2v/i2v) with insert-if-missing on `(service_type, provider)`.

- Stop inserting **new** legacy `comfyui` / `comfyui-image` / `comfyui-video` catalog provider rows on fresh DBs (remove those seed entries from the array).
- Do **not** delete or rewrite existing user `ai_service_configs` that still use `provider: comfyui`.
- Settings picker (Task 8) hides bare `comfyui` for new rows; legacy rows remain editable.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: seed ComfyUI mode-specific service providers"
```

---

### Task 8: Settings UI + i18n

**Files:**
- Modify: `workbench/app/pages/settings.vue`
- Modify: `workbench/app/i18n/messages/zh-CN.ts`, `en.ts`, `settings-vi.ts`, `settings-fil.ts`

- [ ] **Step 1: Helpers in settings.vue**

```ts
function isComfyFamilyProvider(p: string) {
  const x = (p || '').toLowerCase()
  return x === 'comfyui' || x.startsWith('comfyui-')
}
```

Replace `provider === 'comfyui'` gates for workflow textarea + save payload with `isComfyFamilyProvider(...)`.

Update `providersByServiceType`:

```ts
image: [..., 'comfyui-t2i', 'comfyui-i2i'], // remove bare comfyui from new picker
video: [..., 'comfyui-t2v', 'comfyui-i2v'],
```

When editing a legacy `comfyui` row, ensure the provider still appears in the select (union current value into options).

Update `providerLabelKeys` and `providerPresetCatalog` image/video entries to four presets with labels from i18n:

- `comfyuiT2i` / `comfyuiI2i` / `comfyuiT2v` / `comfyuiI2v`
- Hints: `comfyuiWorkflowHintT2i` etc., or one hint that switches by provider

- [ ] **Step 2: i18n strings (zh-CN example)**

```ts
comfyuiT2i: 'ComfyUI 文生图',
comfyuiI2i: 'ComfyUI 图生图',
comfyuiT2v: 'ComfyUI 文生视频',
comfyuiI2v: 'ComfyUI 图生视频',
comfyuiWorkflowHintT2i: '节点标题需含 positive（可选 negative）。',
comfyuiWorkflowHintI2i: '节点标题需含 positive、load_image。',
comfyuiWorkflowHintT2v: '节点标题需含 positive（可选 duration）。',
comfyuiWorkflowHintI2v: '节点标题需含 positive、first_frame（可选 last_frame / duration）。',
```

Mirror EN / VI / FIL with equivalent meaning.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: settings presets for ComfyUI mode providers"
```

---

## Chunk 5: Verify harness + final check

### Task 9: Wire `verify:media-adapters` + full pass

**Files:**
- Modify: `workbench-server/package.json`

- [ ] **Step 1: Extend script**

```json
"verify:media-adapters": "tsx --test src/services/ai/adapters/minimax-h3-video.test.ts src/services/ai/adapters/comfyui-workflow.test.ts src/services/ai/adapters/comfyui-mode-resolve.test.ts src/routes/ai/ai-config-probe.test.ts"
```

- [ ] **Step 2: Run**

```bash
cd workbench-server && npm run verify:media-adapters && npm run typecheck
```

Expected: all PASS / noEmit OK.

- [ ] **Step 3: Manual checklist (human or local)**

1. Settings → add ComfyUI 文生图 → 测试配置 → hits `/system_stats`, not chat completions.
2. Enable both t2i + i2i; bind episode to either; generate with style-only vs style+character ref.
3. Confirm credits log shows final provider after sibling switch.

- [ ] **Step 4: Commit**

```bash
git commit -m "test: include ComfyUI mode/probe suites in verify:media-adapters"
```

---

## Execution notes

- Follow @superpowers/skills/test-driven-development and @superpowers/skills/subagent-driven-development.
- Do not modify Hailuo `minimax-video.ts` or MiniMax-H3 adapter behavior.
- `docs/` is gitignored — use `git add -f` for plan/spec only; **do not** force-add unrelated ignored paths.
- Prefer small commits per task as listed.
