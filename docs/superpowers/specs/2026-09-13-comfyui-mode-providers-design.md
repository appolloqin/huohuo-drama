# ComfyUI Mode Providers Design

**Date:** 2026-09-13  
**Status:** Approved (product); revised after spec review  
**Scope:** Split ComfyUI into mode-specific service providers; fix connectivity probe; keep existing non-Comfy adapters untouched.

## Problem

1. Settings「测试配置」for ComfyUI falls through to OpenAI-style `POST …/v1/chat/completions` and returns **405**, because `buildProviderProbeSpec` has no ComfyUI branch.
2. One shared `provider: comfyui` + one `settings.workflow` cannot cleanly separate 文生图 / 图生图 (and video equivalents). Runtime currently injects `load_image` only when refs exist, which couples incompatible workflows into one config row.

## Goals

- Separate **service configs** for ComfyUI text-to-image, image-to-image, text-to-video, image-to-video (each with its own workflow, credits, priority).
- Identify modes via **distinct provider slugs** (not a single `comfyui` + dual workflow fields).
- Add a **ComfyUI-specific probe** (`GET /system_stats`) without changing existing OpenAI / MiniMax / Hailuo probe paths.
- Prefer **adding** adapters/registry keys/presets over rewriting vendor adapters.
- Remain usable under drama’s **single** `drama_image_config_id` / `drama_video_config_id` binding.

## Non-Goals

- Dual workflow fields on one config row (rejected option A).
- A fifth provider for first+last-frame video (`comfyui-i2v` + node titles remain enough).
- Changing Hailuo `minimax-video`, MiniMax-H3, or other vendor adapters.
- Rewriting global config resolution for non-Comfy providers.
- Splitting episode UI into two Comfy bindings (v1 uses soft mode switch among sibling configs).

## Decisions

| Topic | Choice |
|-------|--------|
| Config separation | Separate service config rows (option B) |
| Mode identity | New providers: `comfyui-t2i`, `comfyui-i2i`, `comfyui-t2v`, `comfyui-i2v` (option A) |
| Drama / explicit `configId` | Soft switch among Comfy-family siblings by job mode (not hard-fail) |
| Style-only refs | Do **not** force i2i/i2v; strip drama style URL when detecting mode |
| Legacy `comfyui` | Keep adapter registration; hide from new presets; usable as either-mode fallback if no mode sibling |

## Provider Matrix

| Provider | `service_type` | Mode | Required workflow node titles (min) |
|----------|----------------|------|-------------------------------------|
| `comfyui-t2i` | `image` | 文生图 | `positive` (+ optional `negative`) |
| `comfyui-i2i` | `image` | 图生图 | `positive`, `load_image` |
| `comfyui-t2v` | `video` | 文生视频 | `positive` (+ optional `duration`) |
| `comfyui-i2v` | `video` | 图生视频 | `positive`, `first_frame` (+ optional `last_frame`, `load_image`, `duration`) |

Default `base_url`: `http://127.0.0.1:8188`.  
Model field may stay a short label (e.g. same as provider slug); billing uses each row’s `credit_cost`.

## Architecture

```
settings presets (4) ──► ai_service_providers (+ user ai_configs)
                              │
generateImage/Video ──► resolveUserServiceConfig
                              │
                    Comfy mode reconcile (new; before credits)
                              │
              getImage/VideoAdapter(provider)  // must register all 4; no silent MiniMax
                              │
                    ComfyUI *Adapter (shared impl, mode-aware defaults/validation)
                              │
                         /prompt + /history
```

### Probe

In `workbench-server/src/routes/ai/ai-config-probe.ts`, **add** a branch for:

- `comfyui`, `comfyui-t2i`, `comfyui-i2i`, `comfyui-t2v`, `comfyui-i2v`

Spec: `GET {baseUrl}/system_stats`, optional Bearer from `api_key`. Do not alter OpenAI/Gemini/Ali/MiniMax branches.

### Adapters / registry

- Keep shared workflow helpers in `comfyui-workflow.ts` / upload helpers.
- Reuse `ComfyUIImageAdapter` / `ComfyUIVideoAdapter` implementations (provider property may be a constructor arg or registry key only).
- Registry maps **all four** new slugs **and** legacy `comfyui` explicitly. Design note: unknown providers currently fall back to MiniMax — missing registration is a silent bug; tests must assert all five keys resolve to Comfy adapters.
- Extend `resolveComfyuiWorkflow(settings, mode)` where `mode` is `'t2i'|'i2i'|'t2v'|'i2v'` (legacy `comfyui` + `service_type` maps to t2i/t2v defaults). Built-in default graphs:
  - t2i: no `load_image` node
  - i2i: includes `load_image`
  - t2v: no frame / load image nodes required
  - i2v: includes `first_frame` (optional `last_frame` / `load_image` in default or user graph)
- Per-config `settings.workflow` JSON override still keyed by node **title**.
- **New validation** in `prepareGenerate` / build path: for the active mode provider, throw if required titled nodes are missing (today only `positive` throws; `load_image` / `first_frame` must become hard errors for i2i/i2v).

### Mode detection + style vs content refs

Callers often prepend drama style via `applyStyleReferenceTo*`. Style must not flip mode **and** must not be uploaded as the primary i2i/i2v conditioning image.

**Central plumbing (preferred):** extend `applyStyleReferenceToImageGeneration` / `applyStyleReferenceToVideoGeneration` to stamp `styleReferenceUrl` on the params object whenever a style image is prepended. Downstream `generateImage` / `generateVideo` / Comfy adapters read that field — avoid relying on every route to remember an extra argument. Raw API callers that omit it: treat all listed refs as content.

**Content refs** = listed URLs with `styleReferenceUrl` removed (when set).

**Image → `i2i` iff** content refs length ≥ 1. Otherwise `t2i`.

**Video → `i2v` iff** any of:

- `firstFrameUrl` or `lastFrameUrl` set
- `imageUrl` set
- content `referenceImageUrls` non-empty  

Otherwise `t2v`.

**Image input mapping (adapter `prepareGenerate`):**

- **t2i:** do not upload style or content refs to `load_image` (graph has no required image input). Style remains prompt-prefix only unless a future optional titled node is added (out of scope).
- **i2i:** upload the **first content ref** to `load_image` — never `referenceImages[0]` when that slot is the style URL. If multiple content refs exist, v1 uses the first only (same as today’s single-upload behavior).

**Video input mapping (i2v):**

- Prefer `firstFrameUrl` → upload/`first_frame`
- Else `imageUrl` or first **content** `referenceImageUrls[]` → upload as `first_frame` (and also `load_image` if that title exists in the graph)
- `lastFrameUrl` → `last_frame` when present
- **t2v:** do not upload style-only refs as frames; prompt-prefix only

### Runtime config selection (Comfy reconcile)

Trigger: **only** when the config returned by `resolveUserServiceConfig` has a Comfy-family provider (`comfyui` or `comfyui-*`). Non-Comfy results are never rewritten.

Order inside `generateImage` / `generateVideo`:

1. `resolveUserServiceConfig` (existing; may use episode `configId`)
2. **Comfy reconcile** (new) → final config  
3. `consumeCredits` using **final** config  
4. enqueue / adapter dispatch  

Reconcile algorithm:

1. Detect job mode (`t2i`/`i2i` or `t2v`/`i2v`) from signals above.
2. If current provider already matches that mode → keep.
3. Else search active configs of the same `service_type` (same user catalog / admin scope as resolve) for preferred provider slug (`comfyui-i2i`, etc.). Prefer same `base_url` as the resolved config when multiple exist.
4. If found → switch to that config (log provider change).
5. If not found and current provider is legacy `comfyui` → keep legacy (both modes; validation limited to `positive` + whatever the user graph defines).
6. If not found and current is a mismatched mode slug (e.g. episode bound to `comfyui-t2i` but job is i2i) → **error** asking to add/enable the matching mode preset (Chinese, i18n-ready). Do not run the wrong workflow.

This preserves drama’s single binding: bind any Comfy image config as the episode entry; ensure both t2i and i2i presets exist for mixed workloads.

### Seeds / provision

Update `provision-sqlite.ts` / `provision-mysql.ts`:

- **Insert-if-missing** four `ai_service_providers` rows keyed by `(service_type, provider)` for the new slugs (same pattern as today — not a destructive upsert of user `ai_service_configs`).
- Stop advertising bare `comfyui` in the **settings preset catalog** / provider picker for new rows.
- Do not delete or rewrite existing user configs that still use `provider: comfyui`.

### Settings UI + i18n

- Image presets: ComfyUI 文生图 / 图生图; video: 文生视频 / 图生视频.
- Treat **all Comfy-family providers** as workflow-capable: textarea, save payload `settings.workflow`, and hints (not only `provider === 'comfyui'`).
- Hints per provider for required node titles.
- `providerLabelKeys` / `providersByServiceType` include the four slugs; legacy rows still editable when loaded.

## Error Handling

| Case | Behavior |
|------|----------|
| Probe unreachable / non-2xx | Existing probe error surface |
| Comfy job needs mode X, no sibling config, not legacy | Service error: configure/enable that mode preset |
| Workflow missing required titled node for mode | Fail in prepare/build with explicit missing-title message (**new** validation) |
| Comfy upload /history failure | Existing adapter error paths |
| Unknown provider key | Must not silently MiniMax for intended Comfy slugs — registration + tests |

## Testing

- Unit: `buildProviderProbeSpec` returns `GET …/system_stats` for all Comfy providers; OpenAI path unchanged.
- Unit: registry resolves all four + legacy to Comfy adapters (not MiniMax).
- Unit: mode detection — style-only → t2i/t2v; extra content ref → i2i/i2v; video frame fields → i2v.
- Unit: reconcile — matching provider kept; sibling switch before credits; mismatch without sibling errors; non-Comfy untouched.
- Unit: required-node validation for i2i/i2v.
- Adapter/workflow: mode-keyed default graphs.
- Manual: settings test-config against local ComfyUI; generate with separate configs; drama episode bound to one Comfy image config with both presets enabled.

## Files Likely Touched

- `workbench-server/src/routes/ai/ai-config-probe.ts` (+ tests if present)
- `workbench-server/src/services/ai/adapters/registry.ts`
- `workbench-server/src/services/ai/adapters/comfyui-*.ts` / `comfyui-workflow.ts`
- New small helper e.g. `comfyui-mode-resolve.ts` used by media generation
- `workbench-server/src/services/media/image-generation.ts` / `video-generation.ts` (reconcile **before** credits)
- `workbench-server/src/services/drama/drama-style-reference.ts` (stamp `styleReferenceUrl` on apply; prefer this over per-route plumbing)
- Persist `styleReferenceUrl` on the in-flight generation record if adapters need it after enqueue
- `workbench-server/src/db/provision-sqlite.ts` / `provision-mysql.ts`
- `workbench/app/pages/settings.vue` + i18n message files
- `workbench-server` verify/media-adapters tests

## Success Criteria

- ComfyUI「测试配置」no longer hits chat completions; probes `/system_stats`.
- Four selectable presets with independent workflows and credit costs.
- Mixed t2i/i2i (and video) works with a single episode Comfy binding when both mode presets exist.
- Style-only reference does not force image/video “to-image” modes; i2i/i2v uploads use content refs, not the prepended style URL.
- Credits follow the final post-reconcile config.
- Existing OpenAI / MiniMax / Hailuo behavior unchanged.
