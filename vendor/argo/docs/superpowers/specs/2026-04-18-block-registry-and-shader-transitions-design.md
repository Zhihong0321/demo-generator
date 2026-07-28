# Block Registry and WebGL Shader Transitions — Design

**Date:** 2026-04-18
**Status:** Approved, pending implementation plan

## Motivation

Two complementary gaps became clear after studying [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes):

1. **Overlay catalog is thin.** Argo ships five overlay templates (`lower-third`, `headline-card`, `callout`, `image-card`, `arrow`). HyperFrames ships 50+. Product demos benefit from *narrative inserts* — a fake tweet, a macOS notification, an animated metric — that punctuate live app footage.
2. **Transitions are basic.** Argo currently offers fade-through-black, dissolve (dip), wipe-left, wipe-right. None look modern. HyperFrames unlocks gl-transitions' ~100 GLSL shaders with cinematic effects (ripple, swirl, light-leak, domain-warp, gravitational-lens).

The overarching goal: raise the ceiling of what Argo demos can look like without compromising Argo's core differentiator (live-app Playwright capture).

## Goals

- Ship **5 bundled overlay blocks** targeted at product-demo narratives: `macos-notification`, `x-post`, `yt-lower-third`, `data-chart`, `spotify-card`.
- Ship **5 WebGL shader transitions** ported from gl-transitions.com: `crosswarp`, `swirl`, `ripple`, `luma-mask`, `light-leak`.
- Design block format to be **extraction-ready** for a future `argo add <block>` command (out of scope for v1).
- Keep the pipeline deterministic and cache-friendly (content-addressed PNG cache for shader output).

## Non-Goals

- `argo add <block>` install mechanism (designed for, not built).
- Runtime prop schema validation beyond TypeScript types (no Zod dependency).
- Shaders with live video textures (frozen-frame blend matches gl-transitions convention and HyperFrames; simpler, deterministic).
- Porting the entire HyperFrames catalog. Five blocks + five shaders is the prototype scope.

## Architecture

### Part 1 — Block Registry

#### Folder layout

```
src/blocks/
├── index.ts                         # barrel: imports each block, populates BLOCK_REGISTRY
├── types.ts                         # BlockDefinition, BlockProps type helpers
├── macos-notification/
│   ├── block.json                   # metadata: id, version, props schema, tags
│   ├── template.ts                  # render(props, theme): TemplateResult
│   └── assets/                      # inlined data URIs for portability
├── x-post/
├── yt-lower-third/
├── data-chart/
└── spotify-card/
```

#### Block definition contract

```typescript
// src/blocks/types.ts
export interface BlockDefinition<P = Record<string, unknown>> {
  id: string;                                    // 'macos-notification'
  version: string;                               // '1.0.0'
  defaultProps: P;
  render: (props: P, theme: BackgroundTheme) => TemplateResult;
  validateProps?: (props: unknown) => asserts props is P;
}

export const BLOCK_REGISTRY = {
  'macos-notification': macosNotification,
  'x-post': xPost,
  'yt-lower-third': ytLowerThird,
  'data-chart': dataChart,
  'spotify-card': spotifyCard,
} as const satisfies Record<string, BlockDefinition>;

export type BlockName = keyof typeof BLOCK_REGISTRY;
```

Each block's `render()` returns the same `TemplateResult` shape built-in templates return, so blocks plug into the existing `renderTemplate()` switch in `src/overlays/templates.ts` with one new case.

#### Cue type extension

```typescript
// src/overlays/types.ts
interface CustomBlockCue {
  type: 'block';
  block: BlockName;                   // literal union from BLOCK_REGISTRY keys
  props: Record<string, unknown>;     // validated per-block at render time
  placement?: Zone;
  motion?: MotionPreset;
  autoBackground?: boolean;
}

export type OverlayCue =
  | LowerThirdCue
  | HeadlineCardCue
  | CalloutCue
  | ImageCardCue
  | ArrowCue
  | CustomBlockCue;
```

#### Usage in `.scenes.json`

```json
{
  "scene": "social-proof",
  "text": "And users are loving it.",
  "overlay": {
    "type": "block",
    "block": "x-post",
    "props": {
      "handle": "@jane",
      "name": "Jane Doe",
      "body": "this is exactly what I needed",
      "timestamp": "2m"
    },
    "placement": "top-right",
    "motion": "slide-in"
  }
}
```

#### Rendering flow (unchanged path, one new case)

`showOverlay` / `withOverlay` → `resolveCue` → `renderTemplate` → **new** `case 'block'` looks up block in `BLOCK_REGISTRY`, calls `block.render(cue.props, theme)`, returns `TemplateResult`. No changes needed to `render-to-png.ts` because it already delegates to `renderTemplate`.

#### v1 block lineup

| Block | Props | Use case |
|-------|-------|----------|
| `macos-notification` | `appName, appIcon?, title, body, timestamp` | Show new signup / incoming message in product demo |
| `x-post` | `handle, name, avatar?, body, timestamp, verified?` | Social proof insert |
| `yt-lower-third` | `name, subtitle, accentColor?` | Pro video styling for speaker intros |
| `data-chart` | `type: 'bar'\|'line', values: number[], labels?, title` | Metrics/growth narrative |
| `spotify-card` | `albumArt, track, artist, elapsed, total` | Decorative insert |

### Part 2 — WebGL Shader Transitions

#### Pipeline stages

```
┌─────────────────┐      ┌──────────────────┐      ┌──────────────────┐      ┌────────────────┐
│ 1. Extract      │      │ 2. Render via    │      │ 3. Cache PNGs    │      │ 4. Splice into │
│    boundary     │ ───> │    Playwright    │ ───> │    (content-     │ ───> │    ffmpeg      │
│    frames       │      │    Chromium GL   │      │    addressed)    │      │    export      │
└─────────────────┘      └──────────────────┘      └──────────────────┘      └────────────────┘
```

#### Stage 1 — Boundary frame extraction

For each scene boundary `T` with duration `D`:
- Extract one PNG at `T - ε` → `a.png` (last frame of outgoing scene).
- Extract one PNG at `T + ε` → `b.png` (first frame of incoming scene).

Uses the gl-transitions convention: static `from`/`to` textures with a `progress` uniform over `[0, 1]`. Simpler than frame-by-frame video texture blending, no timing drift.

`ε = 1 / fps / 2` (half a frame duration) to guarantee we grab the correct frame.

#### Stage 2 — WebGL rendering

Launch Playwright Chromium (already a dependency) once per export run. Load an inline HTML page containing:
- `<canvas>` sized to output video resolution.
- Two `<img>` tags bound to `a.png` / `b.png`, uploaded as textures.
- The selected GLSL fragment shader compiled once.

For each boundary, loop `i ∈ [0, N-1]` where `N = D × fps`:
- Set `uniform float uProgress = i / (N-1)`.
- Render one frame.
- `canvas.toBlob('image/png')` → save as `frame_{i:04d}.png`.

Browser reused across boundaries. Estimated overhead: ~200ms launch + ~5ms/frame. A 5-boundary demo with 800ms transitions at 30fps adds ~600ms to export — imperceptible vs recording time.

#### Stage 3 — Cache

Per-boundary cache key:
```
sha256(shader_name, duration_ms, fps, width, height, sha256(a.png), sha256(b.png))
```

Cached at `.argo/<demo>/shaders/<hash>/frame_*.png`. Re-renders only when boundary content actually changes. Matches Argo's existing cache convention (`src/tts/` clips, `render-to-png.ts` overlays).

#### Stage 4 — ffmpeg splicing

Extends `buildFadeFilterComplex` in `src/transitions.ts`. Instead of `trim + fade` on both sides of the boundary, do a three-segment concat:

```
[0:v]trim=0:T-D/2,setpts=PTS-STARTPTS[scene_a]
[png_seq:v]setpts=PTS-STARTPTS[transition]            # PNG sequence input
[0:v]trim=T+D/2:end,setpts=PTS-STARTPTS[scene_b]
[scene_a][transition][scene_b]concat=n=3:v=1:a=0[outv]
```

PNG sequence added as extra ffmpeg input: `-framerate {fps} -i .argo/<demo>/shaders/<hash>/frame_%04d.png`.

Audio passes through at boundaries as today (no change to `atrim + asetpts + concat`).

#### Shader source

Copy 5 shader files from [gl-transitions.com](https://gl-transitions.com) (MIT-licensed) into `src/transitions/shaders/`. Each shader is ~20-60 lines of GLSL and imported as a string at module init:

| Shader | Visual | Source |
|--------|--------|--------|
| `crosswarp` | Liquid morph | `gl-transitions/crosswarp.glsl` |
| `swirl` | Rotational blend | `gl-transitions/Swirl.glsl` |
| `ripple` | Wave distortion | `gl-transitions/ripple.glsl` |
| `luma-mask` | Directional wipe with soft edge | `gl-transitions/LinearBlur.glsl` |
| `light-leak` | Film-style leak | `gl-transitions/LightLeak.glsl` (or custom if not in catalog) |

Attribution and license noted in `src/transitions/shaders/README.md`.

#### Config shape

```typescript
// src/config.ts
export type TransitionConfig =
  | { type: 'fade-through-black' | 'dissolve' | 'wipe-left' | 'wipe-right'; durationMs?: number }
  | { type: 'shader'; shader: 'crosswarp' | 'swirl' | 'ripple' | 'luma-mask' | 'light-leak'; durationMs?: number };
```

Discriminated union keeps shader config distinct from filter-based transitions. No breaking change to existing demos.

## Wiring Checklist

All export paths must flow block + shader config through (per CLAUDE.md "wire through ALL export paths" rule):

- [ ] `src/pipeline.ts` — main pipeline
- [ ] `src/cli.ts` — `argo export` standalone command
- [ ] `src/preview.ts` — preview Export button
- [ ] `src/export.ts` — viewport variants path

Missing any of these causes silent divergence.

## File-Level Changes

| File | Change |
|------|--------|
| `src/blocks/` | New directory — 5 block subdirs + `index.ts` + `types.ts` |
| `src/overlays/types.ts` | Add `CustomBlockCue`, extend `OverlayCue` union |
| `src/overlays/templates.ts` | Add `case 'block':` in `renderTemplate` |
| `src/cli.ts` | `validate` command checks block name + props |
| `src/transitions/shaders/` | New directory — 5 `.glsl` files + `README.md` |
| `src/transitions/shader-render.ts` | New module — `renderShaderTransitions()` |
| `src/transitions.ts` | Add `type === 'shader'` branch in `buildTransitionFilters` |
| `src/config.ts` | Extend `TransitionConfig` union with shader variant |
| `src/pipeline.ts` | Invoke shader render before ffmpeg export |
| `src/export.ts` | Thread shader PNG dirs + count into filter inputs |
| `src/preview.ts` | Same plumbing as pipeline |

## Testing Strategy

### Unit
- `tests/blocks/*.test.ts` — per block, render at dark + light theme with sample props; snapshot HTML via vitest inline snapshots.
- `tests/transitions/shader-render.test.ts` — mock Playwright, verify: frame count math (`N = D × fps`), cache hash stability across runs, splice filter_complex output matches golden string.

### Integration
- `tests/e2e/shader-transition.test.ts` — run a 2-scene demo with `{ type: 'shader', shader: 'crosswarp' }`:
  - PNG cache dir populated with `N` frames.
  - Output MP4 duration matches input (transition replaces the fade window, no length change).
  - Second run hits cache (no browser launch — assert via spy/counter).
- `tests/e2e/block-render.test.ts` — 1-scene demo per block in a showcase flow; assert generated PNG matches expected dimensions and non-empty alpha content.

### Visual regression
- `demos/blocks-showcase.demo.ts` — 5-scene demo, one scene per block. Output committed as `videos/blocks-showcase.mp4` for eye review.
- `demos/shaders-showcase.demo.ts` — 6-scene demo (one shader per scene boundary — 5 shaders require 6 scenes). Output committed as `videos/shaders-showcase.mp4`.

## Rollout Order

1. Block registry scaffolding + `x-post` end-to-end (simplest block: pure HTML + text).
2. Remaining 4 blocks (`macos-notification`, `yt-lower-third`, `spotify-card`, `data-chart`).
3. Shader render pipeline + `crosswarp` end-to-end.
4. Remaining 4 shaders.
5. `argo validate` coverage + docs + skill update + two showcase demos.

Each step is independently mergeable; step 1 + 2 could ship before 3 + 4.

## Security Invariants (reaffirmed)

- Block `props` are author-controlled (from `.scenes.json`), same trust model as existing overlays. Block templates MUST use the existing `escapeHtml()` helper for any text going into `innerHTML`. New lint rule could enforce this (out of scope for v1).
- Shader PNG cache path uses `demoName` validated at CLI entry (`[a-zA-Z0-9][a-zA-Z0-9_-]*`) — no new path traversal surface.
- GLSL shaders are compile-time constants shipped with Argo — no user-provided shader source executed in v1.

## Open Questions (none blocking)

- Whether to expose a `theme` override in `CustomBlockCue` (today blocks inherit scene theme). Punted — add if a real block needs it.
- Whether shader transitions should support a fade-in envelope on the transition segment itself (double-blend). Skipped — YAGNI, shader duration is the envelope.

## Success Criteria

- Demo author can pick a block via `overlay: { type: 'block', block: '...', props: {...} }` with no code changes.
- Demo author can pick a shader via `transition: { type: 'shader', shader: '...' }` with no code changes.
- Second run of `argo pipeline` with unchanged scenes uses the shader cache (zero browser launches).
- All existing demos still work unchanged.
- `argo validate <demo>` catches unknown block names and malformed shader configs.
