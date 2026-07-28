# WebGL Shader Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-render WebGL shader transitions between scenes using Playwright Chromium, producing a content-addressed PNG sequence that ffmpeg splices in at scene boundaries. Ship 5 gl-transitions shaders (`crosswarp`, `swirl`, `ripple`, `luma-mask`, `light-leak`) as a new `transition.type === 'shader'` variant.

**Architecture:** When the pipeline detects `transition.type === 'shader'` at export time, a pre-pass runs: for each scene boundary, ffmpeg extracts two boundary frames (last-frame of outgoing, first-frame of incoming), Playwright Chromium renders the GLSL shader blending them across N frames, results are cached by content hash. During ffmpeg export, a three-segment concat (`scene_a + transition_pngs + scene_b`) replaces the current fade/dissolve path, reusing the existing `buildFadeFilterComplex` structure.

**Tech Stack:** Playwright (existing dep) for headless WebGL, ffmpeg `image2` demuxer for PNG sequence input, `filter_complex` for splicing. GLSL shaders imported as string constants. Cache directory: `.argo/<demo>/shaders/<hash>/`.

**Spec:** `docs/superpowers/specs/2026-04-18-block-registry-and-shader-transitions-design.md`

---

## File Structure

**Create:**
- `src/transitions/shaders/README.md` — attribution + licenses
- `src/transitions/shaders/crosswarp.glsl`
- `src/transitions/shaders/swirl.glsl`
- `src/transitions/shaders/ripple.glsl`
- `src/transitions/shaders/luma-mask.glsl`
- `src/transitions/shaders/light-leak.glsl`
- `src/transitions/shaders/index.ts` — registry: `SHADERS: Record<ShaderName, string>`
- `src/transitions/shader-render.ts` — `renderShaderTransitions()` pre-pass
- `src/transitions/shader-splice.ts` — filter_complex splice builder
- `tests/transitions/shader-render.test.ts`
- `tests/transitions/shader-splice.test.ts`
- `demos/shaders-showcase.demo.ts`
- `demos/shaders-showcase.scenes.json`

**Modify:**
- `src/config.ts` — extend `TransitionConfig` to a discriminated union with `shader` variant
- `src/transitions.ts` — dispatch to `shader-splice.ts` when `type === 'shader'`
- `src/export.ts` — add shader PNG sequence as ffmpeg input when present
- `src/pipeline.ts` — call `renderShaderTransitions()` before export
- `src/preview.ts` — same (preview Export button uses same config shape)
- `skills/argo-guide/SKILL.md` — document shader transitions
- `README.md` — document shader transitions + sample output
- `CLAUDE.md` — add shader transition section under `### Transitions`

---

## Task 1: Shader source files + registry

**Files:**
- Create: `src/transitions/shaders/crosswarp.glsl`
- Create: `src/transitions/shaders/swirl.glsl`
- Create: `src/transitions/shaders/ripple.glsl`
- Create: `src/transitions/shaders/luma-mask.glsl`
- Create: `src/transitions/shaders/light-leak.glsl`
- Create: `src/transitions/shaders/README.md`
- Create: `src/transitions/shaders/index.ts`
- Create: `tests/transitions/shader-render.test.ts` (registry tests only for now)

- [ ] **Step 1: Write the failing registry test**

```typescript
// tests/transitions/shader-render.test.ts
import { describe, it, expect } from 'vitest';
import { SHADERS, isValidShaderName, SHADER_NAMES } from '../../src/transitions/shaders/index.js';

describe('shader registry', () => {
  it('ships exactly the v1 five shaders', () => {
    expect(SHADER_NAMES).toEqual(['crosswarp', 'swirl', 'ripple', 'luma-mask', 'light-leak']);
  });

  it('each shader has non-empty GLSL source', () => {
    for (const name of SHADER_NAMES) {
      expect(SHADERS[name].length).toBeGreaterThan(50);
      expect(SHADERS[name]).toContain('uniform');
      expect(SHADERS[name]).toContain('progress');
    }
  });

  it('isValidShaderName checks membership', () => {
    expect(isValidShaderName('crosswarp')).toBe(true);
    expect(isValidShaderName('bogus')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/transitions/shader-render.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create shader files**

All 5 shaders use the gl-transitions interface: `vec4 transition(vec2 uv)` returning the blended color, with `sampler2D from`, `sampler2D to`, `float progress`, and optional per-shader uniforms.

`src/transitions/shaders/crosswarp.glsl`:

```glsl
// Adapted from https://gl-transitions.com/editor/crosswarp
// Author: Eke Péter (MIT)
precision mediump float;
uniform sampler2D from;
uniform sampler2D to;
uniform float progress;
varying vec2 vUv;

void main() {
  float x = progress;
  x = smoothstep(0.0, 1.0, (x * 2.0 + vUv.x - 1.0));
  gl_FragColor = mix(texture2D(from, (vUv - 0.5) * (1.0 - x) + 0.5), texture2D(to, (vUv - 0.5) * x + 0.5), x);
}
```

`src/transitions/shaders/swirl.glsl`:

```glsl
// Adapted from https://gl-transitions.com/editor/Swirl
// Author: Sergey Kosarevsky (MIT)
precision mediump float;
uniform sampler2D from;
uniform sampler2D to;
uniform float progress;
varying vec2 vUv;

void main() {
  float duration = 0.4;
  float maxAlpha = 0.4;
  float maxBrightness = 0.95;
  float prog = progress;
  float circRadius = 0.5;

  vec2 p = vUv - vec2(0.5, 0.5);
  float dist = length(p);

  if (dist < circRadius) {
    float percent = (circRadius - dist) / circRadius;
    float a = (prog <= 0.5) ? mix(0.0, 1.0, prog / 0.5) : mix(1.0, 0.0, (prog - 0.5) / 0.5);
    float rot = radians(360.0 * a * percent);
    float s = sin(rot);
    float c = cos(rot);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }
  p += vec2(0.5, 0.5);

  vec4 fromC = texture2D(from, p);
  vec4 toC = texture2D(to, p);
  float brightness = (prog < 0.5) ? maxBrightness * prog * 2.0 : maxBrightness * (1.0 - prog) * 2.0;
  gl_FragColor = mix(fromC, toC, prog) + vec4(brightness);
}
```

`src/transitions/shaders/ripple.glsl`:

```glsl
// Adapted from https://gl-transitions.com/editor/ripple
// Author: gre (MIT)
precision mediump float;
uniform sampler2D from;
uniform sampler2D to;
uniform float progress;
varying vec2 vUv;

const float amplitude = 100.0;
const float speed = 50.0;

void main() {
  vec2 dir = vUv - vec2(0.5);
  float dist = length(dir);
  vec2 offset = dir * (sin(progress * dist * amplitude - progress * speed) + 0.5) / 30.0;
  gl_FragColor = mix(
    texture2D(from, vUv + offset),
    texture2D(to, vUv),
    smoothstep(0.2, 1.0, progress)
  );
}
```

`src/transitions/shaders/luma-mask.glsl`:

```glsl
// Directional luma wipe with soft edge.
// Original: based on gl-transitions LinearBlur (MIT, gre)
precision mediump float;
uniform sampler2D from;
uniform sampler2D to;
uniform float progress;
varying vec2 vUv;

void main() {
  float mask = vUv.x;  // left-to-right wipe
  float threshold = 0.08;
  float blend = smoothstep(progress - threshold, progress + threshold, mask);
  gl_FragColor = mix(texture2D(to, vUv), texture2D(from, vUv), blend);
}
```

`src/transitions/shaders/light-leak.glsl`:

```glsl
// Film-style light leak transition.
// Blends through a bright warm flash at the midpoint.
precision mediump float;
uniform sampler2D from;
uniform sampler2D to;
uniform float progress;
varying vec2 vUv;

void main() {
  vec4 a = texture2D(from, vUv);
  vec4 b = texture2D(to, vUv);
  // Triangle wave peaks at progress=0.5
  float flash = 1.0 - abs(progress - 0.5) * 2.0;
  flash = pow(flash, 2.0);
  vec3 warm = vec3(1.0, 0.85, 0.6);
  vec3 mixed = mix(a.rgb, b.rgb, smoothstep(0.3, 0.7, progress));
  gl_FragColor = vec4(mix(mixed, warm, flash * 0.9), 1.0);
}
```

- [ ] **Step 4: Create README with attribution**

```markdown
// src/transitions/shaders/README.md
# Shader Transitions

WebGL fragment shaders used for cinematic scene transitions. Pre-rendered via Playwright Chromium at export time and composited into the output video as a PNG sequence.

## Attribution

All shaders are adapted from [gl-transitions.com](https://gl-transitions.com) unless otherwise noted. The gl-transitions project is MIT-licensed.

| Shader       | Original Author    | License |
|--------------|--------------------|---------|
| crosswarp    | Eke Péter          | MIT     |
| swirl        | Sergey Kosarevsky  | MIT     |
| ripple       | gre                | MIT     |
| luma-mask    | adapted from gre   | MIT     |
| light-leak   | Argo original      | MIT     |

All shaders use the gl-transitions fragment shader interface:

- `uniform sampler2D from` — outgoing scene last frame
- `uniform sampler2D to` — incoming scene first frame
- `uniform float progress` — 0..1 transition progress
- `varying vec2 vUv` — normalized coord
- Output: `gl_FragColor`
```

- [ ] **Step 5: Create registry index**

```typescript
// src/transitions/shaders/index.ts
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadShader(name: string): string {
  // In dist/, the .glsl files are copied alongside; in src/ they live next to this file.
  // tsc does not copy non-.ts files — our build step copies shaders into dist/ at publish.
  const path = join(__dirname, `${name}.glsl`);
  return readFileSync(path, 'utf-8');
}

export const SHADER_NAMES = ['crosswarp', 'swirl', 'ripple', 'luma-mask', 'light-leak'] as const;
export type ShaderName = (typeof SHADER_NAMES)[number];

export const SHADERS: Record<ShaderName, string> = {
  'crosswarp': loadShader('crosswarp'),
  'swirl': loadShader('swirl'),
  'ripple': loadShader('ripple'),
  'luma-mask': loadShader('luma-mask'),
  'light-leak': loadShader('light-leak'),
};

export function isValidShaderName(name: string): name is ShaderName {
  return (SHADER_NAMES as readonly string[]).includes(name);
}
```

- [ ] **Step 6: Update package.json build step to copy .glsl files**

The TypeScript compiler doesn't copy non-`.ts` files to `dist/`. Inspect `package.json:scripts.build`. If it's just `tsc`, change to:

```json
"build": "tsc && npm run copy-assets",
"copy-assets": "mkdir -p dist/transitions/shaders && cp src/transitions/shaders/*.glsl dist/transitions/shaders/"
```

If `build` already has a copy step, extend it.

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/transitions/shader-render.test.ts`
Expected: tsc exits 0; 3 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/transitions/shaders tests/transitions/shader-render.test.ts package.json
git -c commit.gpgsign=false commit -m "feat(transitions): add five GLSL shader sources and registry"
```

---

## Task 2: Extend TransitionConfig with shader variant

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Write the failing typecheck test**

Append to `tests/transitions/shader-render.test.ts`:

```typescript
import type { TransitionConfig } from '../../src/config.js';

describe('TransitionConfig shader variant', () => {
  it('accepts { type: "shader", shader: ... } at compile time', () => {
    const cfg: TransitionConfig = {
      type: 'shader',
      shader: 'crosswarp',
      durationMs: 800,
    };
    expect(cfg.type).toBe('shader');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Type '"shader"' not assignable to ...`.

- [ ] **Step 3: Convert TransitionConfig to a discriminated union**

In `src/config.ts`, replace the existing `TransitionType` and `TransitionConfig`:

```typescript
import type { ShaderName } from './transitions/shaders/index.js';

export type FilterTransitionType = 'fade-through-black' | 'dissolve' | 'wipe-left' | 'wipe-right';

export interface FilterTransitionConfig {
  /** Filter-based transition (ffmpeg-native). */
  type: FilterTransitionType;
  /** Duration of the transition in milliseconds (default 500). */
  durationMs?: number;
}

export interface ShaderTransitionConfig {
  /** WebGL shader transition (pre-rendered via Playwright Chromium). */
  type: 'shader';
  /** Shader name from src/transitions/shaders/. */
  shader: ShaderName;
  /** Duration of the transition in milliseconds (default 800). */
  durationMs?: number;
}

export type TransitionConfig = FilterTransitionConfig | ShaderTransitionConfig;

/** @deprecated retained for backward compatibility — prefer FilterTransitionType. */
export type TransitionType = FilterTransitionType;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/transitions/shader-render.test.ts`
Expected: tsc exits 0; tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/transitions/shader-render.test.ts
git -c commit.gpgsign=false commit -m "feat(config): extend TransitionConfig with shader variant"
```

---

## Task 3: Content-addressed shader cache hash

**Files:**
- Create: `src/transitions/shader-render.ts` (partial — cache logic only)

- [ ] **Step 1: Write the failing hash test**

Append to `tests/transitions/shader-render.test.ts`:

```typescript
import { computeShaderHash } from '../../src/transitions/shader-render.js';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

describe('computeShaderHash', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'argo-shader-hash-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('produces stable hash for identical inputs', () => {
    const a = join(tmp, 'a.png');
    const b = join(tmp, 'b.png');
    writeFileSync(a, Buffer.from('aaa'));
    writeFileSync(b, Buffer.from('bbb'));
    const h1 = computeShaderHash('crosswarp', 800, 30, 1920, 1080, a, b);
    const h2 = computeShaderHash('crosswarp', 800, 30, 1920, 1080, a, b);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs when shader name changes', () => {
    const a = join(tmp, 'a.png');
    const b = join(tmp, 'b.png');
    writeFileSync(a, Buffer.from('aaa'));
    writeFileSync(b, Buffer.from('bbb'));
    expect(
      computeShaderHash('crosswarp', 800, 30, 1920, 1080, a, b)
    ).not.toBe(
      computeShaderHash('swirl', 800, 30, 1920, 1080, a, b)
    );
  });

  it('differs when boundary frame content changes', () => {
    const a = join(tmp, 'a.png');
    const b = join(tmp, 'b.png');
    writeFileSync(a, Buffer.from('aaa'));
    writeFileSync(b, Buffer.from('bbb'));
    const h1 = computeShaderHash('crosswarp', 800, 30, 1920, 1080, a, b);
    writeFileSync(a, Buffer.from('different'));
    const h2 = computeShaderHash('crosswarp', 800, 30, 1920, 1080, a, b);
    expect(h1).not.toBe(h2);
  });
});
```

Also add the imports at the top:

```typescript
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, afterEach } from 'vitest';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/transitions/shader-render.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create shader-render.ts with cache hash**

```typescript
// src/transitions/shader-render.ts
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * Content hash keying the shader render cache. Includes every input that can
 * affect output: shader source, timing parameters, resolution, and the content
 * of the two boundary frames.
 */
export function computeShaderHash(
  shader: string,
  durationMs: number,
  fps: number,
  width: number,
  height: number,
  aPngPath: string,
  bPngPath: string,
): string {
  const aHash = createHash('sha256').update(readFileSync(aPngPath)).digest('hex');
  const bHash = createHash('sha256').update(readFileSync(bPngPath)).digest('hex');
  const parts = [shader, durationMs, fps, width, height, aHash, bHash].join('|');
  return createHash('sha256').update(parts).digest('hex').slice(0, 16);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/transitions/shader-render.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/transitions/shader-render.ts tests/transitions/shader-render.test.ts
git -c commit.gpgsign=false commit -m "feat(shader-render): add content-addressed cache hash"
```

---

## Task 4: Boundary frame extraction

**Files:**
- Modify: `src/transitions/shader-render.ts`

- [ ] **Step 1: Write the failing extraction test**

Append to `tests/transitions/shader-render.test.ts`:

```typescript
import { extractBoundaryFrame } from '../../src/transitions/shader-render.js';
import { statSync } from 'node:fs';

describe('extractBoundaryFrame', () => {
  // These tests require ffmpeg + a sample video. Skip if CI lacks them.
  const sampleVideo = join(process.cwd(), 'tests/fixtures/sample-2s.mp4');
  const hasSample = existsSync(sampleVideo);

  it.runIf(hasSample)('extracts a PNG at the given timestamp', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'argo-frame-'));
    const out = join(tmp, 'frame.png');
    await extractBoundaryFrame(sampleVideo, 1.0, out);
    expect(statSync(out).size).toBeGreaterThan(100);
    rmSync(tmp, { recursive: true, force: true });
  });
});
```

Add import:

```typescript
import { existsSync } from 'node:fs';
```

If `tests/fixtures/sample-2s.mp4` does not exist, create it in Step 2 via a one-off ffmpeg command included in the test setup (see Step 3).

- [ ] **Step 2: Create a test fixture video**

Run (once, manually, then commit the fixture):

```bash
mkdir -p tests/fixtures
ffmpeg -y -f lavfi -i "color=red:s=320x180:d=2:r=30" -pix_fmt yuv420p tests/fixtures/sample-2s.mp4
```

Verify it plays. Commit the fixture after Task 5 is complete.

- [ ] **Step 3: Implement extractBoundaryFrame**

Append to `src/transitions/shader-render.ts`:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/**
 * Extract a single frame from a video at the given timestamp (seconds) using
 * ffmpeg. The output is a PNG at the source video's native resolution.
 *
 * Uses `-ss BEFORE -i` for seek accuracy acceptable for boundary-frame grabs
 * (one-frame precision not required — gl-transitions uses frozen frames).
 */
export async function extractBoundaryFrame(
  videoPath: string,
  timestampSec: number,
  outputPngPath: string,
): Promise<void> {
  const args = [
    '-ss', timestampSec.toFixed(3),
    '-i', videoPath,
    '-frames:v', '1',
    '-q:v', '1',
    '-y',
    outputPngPath,
  ];
  try {
    await execFileP('ffmpeg', args);
  } catch (err) {
    throw new Error(
      `Failed to extract boundary frame at ${timestampSec}s from ${videoPath}: ${(err as Error).message}`,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/transitions/shader-render.test.ts`
Expected: extraction test passes (or is skipped if fixture missing — create it per Step 2).

- [ ] **Step 5: Commit**

```bash
git add src/transitions/shader-render.ts tests/transitions/shader-render.test.ts
git add -f tests/fixtures/sample-2s.mp4
git -c commit.gpgsign=false commit -m "feat(shader-render): add boundary frame extraction via ffmpeg"
```

---

## Task 5: WebGL shader rendering in Playwright

**Files:**
- Modify: `src/transitions/shader-render.ts`
- Create: `src/transitions/shader-page.html.ts` (inline page content as a JS string — no filesystem dep)

- [ ] **Step 1: Write the failing shader rendering test**

Append to `tests/transitions/shader-render.test.ts`:

```typescript
import { renderShaderFrames } from '../../src/transitions/shader-render.js';
import { readdirSync } from 'node:fs';

describe('renderShaderFrames', () => {
  const hasSample = existsSync(join(process.cwd(), 'tests/fixtures/sample-2s.mp4'));

  it.runIf(hasSample)('renders N = duration_ms * fps / 1000 frames', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'argo-render-'));
    const aPng = join(tmp, 'a.png');
    const bPng = join(tmp, 'b.png');
    // Make two solid-color "frames" for the render
    await execFileP('ffmpeg', ['-f', 'lavfi', '-i', 'color=red:s=320x180', '-frames:v', '1', '-y', aPng]);
    await execFileP('ffmpeg', ['-f', 'lavfi', '-i', 'color=blue:s=320x180', '-frames:v', '1', '-y', bPng]);

    const outDir = join(tmp, 'frames');
    await renderShaderFrames({
      shader: 'crosswarp',
      aPng,
      bPng,
      width: 320,
      height: 180,
      fps: 30,
      durationMs: 500,  // 15 frames
      outputDir: outDir,
    });

    const files = readdirSync(outDir).filter(f => f.endsWith('.png')).sort();
    expect(files).toHaveLength(15);
    expect(files[0]).toMatch(/^frame_0000\.png$/);
    expect(files[14]).toMatch(/^frame_0014\.png$/);
    rmSync(tmp, { recursive: true, force: true });
  }, 60000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/transitions/shader-render.test.ts`
Expected: FAIL — `renderShaderFrames` not exported.

- [ ] **Step 3: Create the inline Playwright page HTML**

```typescript
// src/transitions/shader-page.html.ts
/**
 * Inline HTML template for the Playwright page used to render shader frames.
 * Returns an HTML string parameterized by dimensions + shader GLSL.
 *
 * The page exposes two globals:
 *   window.__loadFrames(aDataUri, bDataUri) — uploads A/B textures
 *   window.__renderAt(progress) → Promise<string>  — returns PNG as data URI
 */
export function buildShaderPageHtml(width: number, height: number, fragmentShaderGlsl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; }
  html, body { background: transparent; }
  canvas { display: block; }
</style></head>
<body>
<canvas id="c" width="${width}" height="${height}"></canvas>
<script>
(() => {
  const canvas = document.getElementById('c');
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) { window.__glError = 'webgl not available'; return; }

  const vsSrc = \`
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = vec2((aPos.x + 1.0) * 0.5, 1.0 - (aPos.y + 1.0) * 0.5);
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  \`;
  const fsSrc = ${JSON.stringify(fragmentShaderGlsl)};

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      window.__glError = 'shader compile: ' + gl.getShaderInfoLog(s);
      return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    window.__glError = 'program link: ' + gl.getProgramInfoLog(prog);
    return;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const aPosLoc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPosLoc);
  gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

  const uFromLoc = gl.getUniformLocation(prog, 'from');
  const uToLoc = gl.getUniformLocation(prog, 'to');
  const uProgLoc = gl.getUniformLocation(prog, 'progress');

  function loadTex(unit, img) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    return tex;
  }

  window.__loadFrames = (aUri, bUri) => new Promise((resolve, reject) => {
    const imgA = new Image();
    const imgB = new Image();
    let loaded = 0;
    const done = () => { if (++loaded === 2) {
      loadTex(0, imgA);
      loadTex(1, imgB);
      gl.uniform1i(uFromLoc, 0);
      gl.uniform1i(uToLoc, 1);
      resolve();
    }};
    imgA.onload = done; imgB.onload = done;
    imgA.onerror = () => reject(new Error('failed to load A'));
    imgB.onerror = () => reject(new Error('failed to load B'));
    imgA.src = aUri;
    imgB.src = bUri;
  });

  window.__renderAt = (progress) => new Promise((resolve) => {
    gl.uniform1f(uProgLoc, progress);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    canvas.toBlob((blob) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
})();
</script>
</body>
</html>`;
}
```

- [ ] **Step 4: Implement renderShaderFrames**

Append to `src/transitions/shader-render.ts`:

```typescript
import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync as readFileSyncFs } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { buildShaderPageHtml } from './shader-page.html.js';
import { SHADERS, type ShaderName } from './shaders/index.js';

export interface RenderShaderFramesOptions {
  shader: ShaderName;
  aPng: string;
  bPng: string;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  outputDir: string;
  /** Reusable browser — pass one across multiple boundaries for performance. */
  browser?: Browser;
}

/**
 * Render a GLSL shader transition as a PNG sequence.
 * Produces `outputDir/frame_0000.png` ... `frame_{N-1}.png` where
 * N = Math.round(durationMs * fps / 1000).
 *
 * Launches a Playwright Chromium browser if one is not passed in. For pipelines
 * with multiple boundaries, reuse a single browser across calls.
 */
export async function renderShaderFrames(opts: RenderShaderFramesOptions): Promise<number> {
  mkdirSync(opts.outputDir, { recursive: true });
  const N = Math.max(1, Math.round((opts.durationMs * opts.fps) / 1000));

  const ownsBrowser = !opts.browser;
  const browser = opts.browser ?? await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: opts.width, height: opts.height } });
    try {
      const html = buildShaderPageHtml(opts.width, opts.height, SHADERS[opts.shader]);
      await page.setContent(html, { waitUntil: 'load' });

      // Check GL init errors
      const glError = await page.evaluate(() => (window as any).__glError as string | undefined);
      if (glError) throw new Error(`WebGL init error (${opts.shader}): ${glError}`);

      // Upload textures as data URIs
      const aDataUri = 'data:image/png;base64,' + readFileSyncFs(opts.aPng).toString('base64');
      const bDataUri = 'data:image/png;base64,' + readFileSyncFs(opts.bPng).toString('base64');
      await page.evaluate(
        ([a, b]) => (window as any).__loadFrames(a, b),
        [aDataUri, bDataUri] as const,
      );

      // Render each frame
      for (let i = 0; i < N; i++) {
        const progress = N === 1 ? 0 : i / (N - 1);
        const dataUri = await page.evaluate(
          (p) => (window as any).__renderAt(p) as Promise<string>,
          progress,
        );
        const base64 = dataUri.split(',', 2)[1];
        const outPath = pathJoin(opts.outputDir, `frame_${String(i).padStart(4, '0')}.png`);
        writeFileSync(outPath, Buffer.from(base64, 'base64'));
      }
    } finally {
      await page.close();
    }
  } finally {
    if (ownsBrowser) await browser.close();
  }

  return N;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/transitions/shader-render.test.ts -t renderShaderFrames`
Expected: test passes, 15 PNG files written.

- [ ] **Step 6: Commit**

```bash
git add src/transitions/shader-render.ts src/transitions/shader-page.html.ts tests/transitions/shader-render.test.ts
git -c commit.gpgsign=false commit -m "feat(shader-render): WebGL shader rendering via Playwright Chromium"
```

---

## Task 6: Per-boundary render orchestration with cache

**Files:**
- Modify: `src/transitions/shader-render.ts`

- [ ] **Step 1: Write the failing orchestration test**

Append to `tests/transitions/shader-render.test.ts`:

```typescript
import { renderShaderTransitions, type BoundarySpec } from '../../src/transitions/shader-render.js';

describe('renderShaderTransitions', () => {
  const hasSample = existsSync(join(process.cwd(), 'tests/fixtures/sample-2s.mp4'));

  it.runIf(hasSample)('renders each boundary and caches by content hash', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'argo-orch-'));
    const cacheDir = join(tmp, 'shaders');
    const sample = join(process.cwd(), 'tests/fixtures/sample-2s.mp4');

    const boundaries: BoundarySpec[] = [
      { boundarySec: 0.5, durationMs: 400 },
      { boundarySec: 1.5, durationMs: 400 },
    ];

    const result = await renderShaderTransitions({
      videoPath: sample,
      boundaries,
      shader: 'crosswarp',
      width: 320, height: 180, fps: 30,
      cacheDir,
    });

    expect(result).toHaveLength(2);
    expect(result[0].frameCount).toBe(12);  // 400ms * 30fps / 1000
    expect(result[0].pngDir).toBeTruthy();
    expect(result[0].hash).toMatch(/^[0-9a-f]{16}$/);

    // Second run hits cache — assert by tracking mtime
    const mtimeBefore = statSync(join(result[0].pngDir, 'frame_0000.png')).mtimeMs;
    await new Promise(r => setTimeout(r, 20));
    const result2 = await renderShaderTransitions({
      videoPath: sample, boundaries, shader: 'crosswarp',
      width: 320, height: 180, fps: 30, cacheDir,
    });
    const mtimeAfter = statSync(join(result2[0].pngDir, 'frame_0000.png')).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);  // file unchanged → cache hit

    rmSync(tmp, { recursive: true, force: true });
  }, 120000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/transitions/shader-render.test.ts -t renderShaderTransitions`
Expected: FAIL — `renderShaderTransitions` not exported.

- [ ] **Step 3: Implement renderShaderTransitions**

Append to `src/transitions/shader-render.ts`:

```typescript
import { existsSync, readdirSync } from 'node:fs';

export interface BoundarySpec {
  /** Absolute time of the boundary in seconds. */
  boundarySec: number;
  /** Transition duration in ms. */
  durationMs: number;
}

export interface ShaderTransitionRenderResult {
  boundarySec: number;
  durationMs: number;
  /** Directory containing frame_0000.png ... frame_{N-1}.png */
  pngDir: string;
  /** Number of frames rendered. */
  frameCount: number;
  /** Content hash (16 hex chars). */
  hash: string;
}

/**
 * For each scene boundary, extract the two boundary frames, compute a cache
 * key, and render the shader's PNG sequence if not already cached.
 * Reuses a single Playwright browser across all boundaries.
 */
export async function renderShaderTransitions(opts: {
  videoPath: string;
  boundaries: BoundarySpec[];
  shader: ShaderName;
  width: number;
  height: number;
  fps: number;
  cacheDir: string;
}): Promise<ShaderTransitionRenderResult[]> {
  if (opts.boundaries.length === 0) return [];

  mkdirSync(opts.cacheDir, { recursive: true });

  // Extract all boundary frames up front (cheap, sequential ffmpeg calls)
  const tmpFramesDir = pathJoin(opts.cacheDir, '_boundaries');
  mkdirSync(tmpFramesDir, { recursive: true });
  const extracted: Array<{ aPath: string; bPath: string; spec: BoundarySpec }> = [];
  const epsilon = 1 / opts.fps / 2;
  for (let i = 0; i < opts.boundaries.length; i++) {
    const b = opts.boundaries[i];
    const aPath = pathJoin(tmpFramesDir, `b${i}_a.png`);
    const bPath = pathJoin(tmpFramesDir, `b${i}_b.png`);
    await extractBoundaryFrame(opts.videoPath, Math.max(0, b.boundarySec - epsilon), aPath);
    await extractBoundaryFrame(opts.videoPath, b.boundarySec + epsilon, bPath);
    extracted.push({ aPath, bPath, spec: b });
  }

  // Determine cache hits / misses
  const plan = extracted.map(({ aPath, bPath, spec }) => {
    const hash = computeShaderHash(opts.shader, spec.durationMs, opts.fps, opts.width, opts.height, aPath, bPath);
    const pngDir = pathJoin(opts.cacheDir, hash);
    const N = Math.max(1, Math.round((spec.durationMs * opts.fps) / 1000));
    const cached = existsSync(pngDir) && readdirSync(pngDir).filter(f => f.endsWith('.png')).length === N;
    return { aPath, bPath, spec, hash, pngDir, N, cached };
  });

  const anyMisses = plan.some(p => !p.cached);
  let browser: Browser | undefined;
  try {
    if (anyMisses) browser = await chromium.launch();

    const results: ShaderTransitionRenderResult[] = [];
    for (const p of plan) {
      if (!p.cached) {
        await renderShaderFrames({
          shader: opts.shader,
          aPng: p.aPath,
          bPng: p.bPath,
          width: opts.width,
          height: opts.height,
          fps: opts.fps,
          durationMs: p.spec.durationMs,
          outputDir: p.pngDir,
          browser,
        });
      }
      results.push({
        boundarySec: p.spec.boundarySec,
        durationMs: p.spec.durationMs,
        pngDir: p.pngDir,
        frameCount: p.N,
        hash: p.hash,
      });
    }
    return results;
  } finally {
    if (browser) await browser.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/transitions/shader-render.test.ts -t renderShaderTransitions`
Expected: test passes, including cache-hit assertion.

- [ ] **Step 5: Commit**

```bash
git add src/transitions/shader-render.ts tests/transitions/shader-render.test.ts
git -c commit.gpgsign=false commit -m "feat(shader-render): orchestrate per-boundary rendering with content-addressed cache"
```

---

## Task 7: ffmpeg filter_complex splice

**Files:**
- Create: `src/transitions/shader-splice.ts`
- Create: `tests/transitions/shader-splice.test.ts`

- [ ] **Step 1: Write the failing splice test**

```typescript
// tests/transitions/shader-splice.test.ts
import { describe, it, expect } from 'vitest';
import { buildShaderSpliceFilter } from '../../src/transitions/shader-splice.js';

describe('buildShaderSpliceFilter', () => {
  it('produces a three-segment concat per boundary for single-boundary case', () => {
    const result = buildShaderSpliceFilter({
      totalDurationSec: 6.0,
      boundaries: [
        { boundarySec: 3.0, durationMs: 800, extraInputIndex: 2 },
      ],
      videoInputLabel: '[0:v]',
      audioInputLabel: '[1:a]',
      fps: 30,
    });

    expect(result.filterComplex).toContain('trim=0.000:2.600');         // scene A up to T-D/2
    expect(result.filterComplex).toContain('trim=3.400:6.000');         // scene B from T+D/2
    expect(result.filterComplex).toContain('[2:v]');                     // PNG sequence input
    expect(result.filterComplex).toMatch(/concat=n=3:v=1:a=1/);
    expect(result.videoOutput).toBe('[svout]');
    expect(result.audioOutput).toBe('[saout]');
  });

  it('handles two boundaries (five-segment concat)', () => {
    const result = buildShaderSpliceFilter({
      totalDurationSec: 9.0,
      boundaries: [
        { boundarySec: 3.0, durationMs: 600, extraInputIndex: 2 },
        { boundarySec: 6.0, durationMs: 600, extraInputIndex: 3 },
      ],
      videoInputLabel: '[0:v]',
      audioInputLabel: '[1:a]',
      fps: 30,
    });

    expect(result.filterComplex).toMatch(/concat=n=5:v=1:a=1/);
    expect(result.filterComplex).toContain('[2:v]');
    expect(result.filterComplex).toContain('[3:v]');
  });

  it('works without audio', () => {
    const result = buildShaderSpliceFilter({
      totalDurationSec: 4.0,
      boundaries: [{ boundarySec: 2.0, durationMs: 500, extraInputIndex: 1 }],
      videoInputLabel: '[0:v]',
      audioInputLabel: null,
      fps: 30,
    });
    expect(result.filterComplex).toMatch(/concat=n=3:v=1:a=0/);
    expect(result.audioOutput).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/transitions/shader-splice.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement buildShaderSpliceFilter**

```typescript
// src/transitions/shader-splice.ts

export interface ShaderBoundary {
  /** Absolute boundary time in seconds. */
  boundarySec: number;
  /** Duration of the shader transition in ms. */
  durationMs: number;
  /** ffmpeg input index for the PNG sequence (image2 demuxer) — scene A is 0, audio is 1 if present. */
  extraInputIndex: number;
}

export interface ShaderSpliceOptions {
  /** Total duration of the source video in seconds (after head-trim). */
  totalDurationSec: number;
  boundaries: ShaderBoundary[];
  /** Input label for the main video (typically '[0:v]'). */
  videoInputLabel: string;
  /** Input label for audio (typically '[1:a]'), or null for silent. */
  audioInputLabel: string | null;
  fps: number;
}

export interface ShaderSpliceResult {
  filterComplex: string;
  videoOutput: string;
  audioOutput: string | null;
}

/**
 * Splice shader PNG sequences into the scene concat.
 *
 * For boundaries at [T1, T2, ...], produce (2*K + 1) segments alternating
 * video trims and PNG sequences:
 *   scene_a_0 (0 .. T1 - D1/2)  +  trans_1 (PNG, D1)  +  scene_a_1 (T1 + D1/2 .. T2 - D2/2)
 *   + trans_2 (PNG, D2)  +  scene_a_2 (T2 + D2/2 .. end)
 *
 * Audio passes through at boundaries — no transition applied to audio,
 * just trimmed to match.
 */
export function buildShaderSpliceFilter(opts: ShaderSpliceOptions): ShaderSpliceResult {
  const { totalDurationSec, boundaries, videoInputLabel, audioInputLabel } = opts;
  if (boundaries.length === 0) {
    throw new Error('buildShaderSpliceFilter called with no boundaries');
  }

  const parts: string[] = [];
  const videoLabels: string[] = [];
  const audioLabels: string[] = [];

  // Scene A video segments interleaved with transition segments.
  let cursorSec = 0;
  for (let i = 0; i < boundaries.length; i++) {
    const b = boundaries[i];
    const dHalf = b.durationMs / 2000;  // half-duration in seconds
    const sceneEnd = b.boundarySec - dHalf;
    const transitionEnd = b.boundarySec + dHalf;

    // Scene segment ending at T - D/2
    const vSceneLabel = `ssv${i}`;
    parts.push(
      `${videoInputLabel}trim=${cursorSec.toFixed(3)}:${sceneEnd.toFixed(3)},setpts=PTS-STARTPTS[${vSceneLabel}]`,
    );
    videoLabels.push(`[${vSceneLabel}]`);

    if (audioInputLabel) {
      const aSceneLabel = `ssa${i}`;
      parts.push(
        `${audioInputLabel}atrim=${cursorSec.toFixed(3)}:${sceneEnd.toFixed(3)},asetpts=PTS-STARTPTS[${aSceneLabel}]`,
      );
      audioLabels.push(`[${aSceneLabel}]`);
    }

    // Transition segment (PNG sequence input index, needs setpts to align)
    const vTransLabel = `stv${i}`;
    parts.push(
      `[${b.extraInputIndex}:v]setpts=PTS-STARTPTS[${vTransLabel}]`,
    );
    videoLabels.push(`[${vTransLabel}]`);

    if (audioInputLabel) {
      // Audio continues from scene A through the transition window — we trim
      // it to match the transition duration so there's no audio gap.
      const aTransLabel = `sta${i}`;
      parts.push(
        `${audioInputLabel}atrim=${sceneEnd.toFixed(3)}:${transitionEnd.toFixed(3)},asetpts=PTS-STARTPTS[${aTransLabel}]`,
      );
      audioLabels.push(`[${aTransLabel}]`);
    }

    cursorSec = transitionEnd;
  }

  // Final scene segment from last transitionEnd to totalDuration
  const vLastLabel = `ssv${boundaries.length}`;
  parts.push(
    `${videoInputLabel}trim=${cursorSec.toFixed(3)}:${totalDurationSec.toFixed(3)},setpts=PTS-STARTPTS[${vLastLabel}]`,
  );
  videoLabels.push(`[${vLastLabel}]`);
  if (audioInputLabel) {
    const aLastLabel = `ssa${boundaries.length}`;
    parts.push(
      `${audioInputLabel}atrim=${cursorSec.toFixed(3)}:${totalDurationSec.toFixed(3)},asetpts=PTS-STARTPTS[${aLastLabel}]`,
    );
    audioLabels.push(`[${aLastLabel}]`);
  }

  // Concat all segments (interleaved v/a required by ffmpeg)
  const n = videoLabels.length;
  if (audioInputLabel) {
    const interleaved = videoLabels.map((v, i) => `${v}${audioLabels[i]}`).join('');
    parts.push(`${interleaved}concat=n=${n}:v=1:a=1[svout][saout]`);
    return {
      filterComplex: parts.join(';\n'),
      videoOutput: '[svout]',
      audioOutput: '[saout]',
    };
  } else {
    parts.push(`${videoLabels.join('')}concat=n=${n}:v=1:a=0[svout]`);
    return {
      filterComplex: parts.join(';\n'),
      videoOutput: '[svout]',
      audioOutput: null,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/transitions/shader-splice.test.ts`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/transitions/shader-splice.ts tests/transitions/shader-splice.test.ts
git -c commit.gpgsign=false commit -m "feat(transitions): filter_complex splice builder for shader PNG sequences"
```

---

## Task 8: Route shader transitions through buildTransitionFilters

**Files:**
- Modify: `src/transitions.ts`

- [ ] **Step 1: Write the failing dispatch test**

Create `tests/transitions/dispatch.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildTransitionFilters } from '../../src/transitions.js';

describe('buildTransitionFilters — shader dispatch', () => {
  it('returns null when transition type is shader (handled in export, not here)', () => {
    const result = buildTransitionFilters(
      [{ scene: 's1', startMs: 0, endMs: 2000 }, { scene: 's2', startMs: 2000, endMs: 4000 }],
      { type: 'shader', shader: 'crosswarp', durationMs: 800 },
      true,
      30,
    );
    // Shader transitions are composed differently — return sentinel
    expect(result).toEqual({ shaderDeferred: true });
  });

  it('still handles fade normally', () => {
    const result = buildTransitionFilters(
      [{ scene: 's1', startMs: 0, endMs: 2000 }, { scene: 's2', startMs: 2000, endMs: 4000 }],
      { type: 'fade-through-black', durationMs: 500 },
      true,
      30,
    );
    expect(typeof result === 'object' && 'filterComplex' in result).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/transitions/dispatch.test.ts`
Expected: FAIL — shader branch not handled.

- [ ] **Step 3: Add shader branch**

In `src/transitions.ts`, modify the return type and add the branch at the top of `buildTransitionFilters` (before the wipe/fade branches):

```typescript
export interface ShaderDeferredMarker {
  shaderDeferred: true;
}

export function buildTransitionFilters(
  placements: Placement[],
  transition: TransitionConfig,
  hasAudio?: boolean,
  fps: number = 30,
): string[] | { filterComplex: string; videoOutput: string; audioOutput: string | null } | ShaderDeferredMarker {
  if (placements.length < 2) return [];

  // Shader transitions are composed via shader-splice.ts at export time because
  // they need the extra ffmpeg input indices for the PNG sequences. Return a
  // sentinel so export.ts knows to take the shader path.
  if (transition.type === 'shader') {
    return { shaderDeferred: true };
  }

  // ... existing fade/wipe logic unchanged
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/transitions/dispatch.test.ts`
Expected: both tests pass.

- [ ] **Step 5: Build, run full test suite**

Run: `npm run build && npm test -- --run`
Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/transitions.ts tests/transitions/dispatch.test.ts
git -c commit.gpgsign=false commit -m "feat(transitions): route shader transitions through deferred sentinel"
```

---

## Task 9: Wire shader PNG sequence as ffmpeg input in export.ts

**Files:**
- Modify: `src/export.ts`

- [ ] **Step 1: Add ShaderTransitionInput type to ExportOptions**

In `src/export.ts` `ExportOptions`, add:

```typescript
  /** Pre-rendered shader transitions — paths to PNG sequence dirs per boundary. */
  shaderTransitions?: Array<{ boundarySec: number; durationMs: number; pngDir: string; frameCount: number }>;
```

- [ ] **Step 2: Write the failing export wiring test**

Append to `tests/export.test.ts` (or create if covering shader splice):

```typescript
describe('export with shader transitions', () => {
  const hasSample = existsSync(join(process.cwd(), 'tests/fixtures/sample-2s.mp4'));

  it.runIf(hasSample)('produces MP4 with shader PNG sequence spliced in', async () => {
    // Test the full export path — this exercises the filter_complex wiring
    // but mocks renderShaderTransitions to avoid launching a browser in unit tests.
    // (See e2e test for the real end-to-end flow.)
    expect(true).toBe(true);  // placeholder — wire via e2e test in Task 11
  });
});
```

(The actual correctness is verified end-to-end in Task 11 via the showcase demo.)

- [ ] **Step 3: Implement shader splice wiring**

In `src/export.ts`, locate the transition block (around line 278-316). Add shader handling:

After the `buildTransitionFilters` call, add a new branch for the shader-deferred case. Import at top:

```typescript
import { buildShaderSpliceFilter } from './transitions/shader-splice.js';
```

In the transition handling block, replace the current `Array.isArray(transitionResult) ... else if ...` pattern with:

```typescript
  // Scene transitions
  let transitionComplex: { filterComplex: string; videoOutput: string; audioOutput: string | null } | null = null;
  if (transition && placements && placements.length > 1) {
    if (transition.type === 'shader' && options.shaderTransitions && options.shaderTransitions.length > 0) {
      // Add each shader PNG sequence as a new ffmpeg input
      const shaderInputIndices: number[] = [];
      for (const st of options.shaderTransitions) {
        const idx = nextInput++;
        shaderInputIndices.push(idx);
        args.push(
          '-framerate', String(fps ?? 30),
          '-i', join(st.pngDir, 'frame_%04d.png'),
        );
      }
      const spliceResult = buildShaderSpliceFilter({
        totalDurationSec: (totalDurationMs ?? 0) / 1000,
        boundaries: options.shaderTransitions.map((st, i) => ({
          boundarySec: st.boundarySec,
          durationMs: st.durationMs,
          extraInputIndex: shaderInputIndices[i],
        })),
        videoInputLabel: `[${videoSource}]`,
        audioInputLabel: hasAudio ? `[${audioSource}]` : null,
        fps: fps ?? 30,
      });
      transitionComplex = {
        filterComplex: spliceResult.filterComplex,
        videoOutput: spliceResult.videoOutput,
        audioOutput: spliceResult.audioOutput,
      };
    } else {
      const transitionResult = buildTransitionFilters(placements, transition, hasAudio, fps ?? 30);
      if (Array.isArray(transitionResult)) {
        // Simple -vf filters (wipe)
        vFilters.push(...transitionResult);
      } else if ('filterComplex' in transitionResult) {
        transitionComplex = transitionResult;
      }
      // else: shaderDeferred sentinel when shaderTransitions is missing → no-op
    }
  }
```

- [ ] **Step 4: Build, run existing tests**

Run: `npm run build && npm test -- --run`
Expected: no regressions in existing export/transition tests.

- [ ] **Step 5: Commit**

```bash
git add src/export.ts
git -c commit.gpgsign=false commit -m "feat(export): thread shader PNG sequences through ffmpeg filter_complex"
```

---

## Task 10: Wire pipeline.ts + preview.ts + CLI export

**Files:**
- Modify: `src/pipeline.ts`
- Modify: `src/preview.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Identify call sites**

Run: `grep -n "exportVideo\|transition:" src/pipeline.ts src/preview.ts src/cli.ts` to find all three export invocation sites.

- [ ] **Step 2: Wire pipeline.ts**

In `src/pipeline.ts`, before the `exportVideo` call:

```typescript
import { renderShaderTransitions } from './transitions/shader-render.js';

// ... inside the pipeline function, after speed-ramp timeline is set and before exportVideo:
let shaderTransitions: Array<{ boundarySec: number; durationMs: number; pngDir: string; frameCount: number }> | undefined;
if (config.export?.transition?.type === 'shader' && alignedPlacements.length > 1) {
  const transition = config.export.transition;
  const boundaries = alignedPlacements.slice(1).map(p => ({
    boundarySec: p.startMs / 1000,
    durationMs: transition.durationMs ?? 800,
  }));
  shaderTransitions = await renderShaderTransitions({
    videoPath: recordedVideoPath,  // use the post-trim path that export will consume
    boundaries,
    shader: transition.shader,
    width: config.video?.size?.width ?? 1280,
    height: config.video?.size?.height ?? 720,
    fps: videoFps,
    cacheDir: join(argoDir, demoName, 'shaders'),
  });
}

// Pass into exportVideo options:
await exportVideo({
  // ... existing options
  shaderTransitions,
});
```

**Important:** The `videoPath` and `boundaries` must account for head-trim (setup cut). If `headTrimMs` is applied, boundaries are relative to the trimmed video start. Extract against the pre-trim video only if boundaries are in the pre-trim timeline; otherwise use the original placements shifted.

Check how existing `transition` usage reads `placements` in export.ts — match that convention exactly.

- [ ] **Step 3: Wire preview.ts**

In `src/preview.ts`, find the preview-Export handler (look for `exportVideo` call in the Express route). Add the same `renderShaderTransitions` pre-pass before `exportVideo`.

- [ ] **Step 4: Wire CLI `argo export`**

In `src/cli.ts`, find the `export` command handler (`.command('export <demo>')`). Same pattern — read config, run `renderShaderTransitions` if shader config present, pass into `exportVideo`.

- [ ] **Step 5: Verify all three paths compile**

Run: `npm run build`
Expected: tsc exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/pipeline.ts src/preview.ts src/cli.ts
git -c commit.gpgsign=false commit -m "feat(pipeline): wire shader transition pre-render through all export paths"
```

---

## Task 11: End-to-end showcase demo

**Files:**
- Create: `demos/shaders-showcase.demo.ts`
- Create: `demos/shaders-showcase.scenes.json`

Five shaders need six scenes (five boundaries). Each boundary uses a different shader — demonstrated in config via an override pattern.

**Note:** Current `TransitionConfig` is per-export (one shader for the whole demo). The showcase will ship with a single shader chosen for the demo (e.g., `crosswarp`). The remaining 4 shaders are demonstrated via per-scene config comments in the manifest and a README section — no schema change for v1. Mixing shaders per boundary is future work.

- [ ] **Step 1: Create scenes manifest**

```json
// demos/shaders-showcase.scenes.json
[
  {
    "scene": "intro",
    "text": "Argo now ships five WebGL shader transitions.",
    "overlay": {
      "type": "headline-card",
      "kicker": "SHADERS",
      "title": "Cinematic scene transitions",
      "body": "Pre-rendered GPU shaders, content-addressed cache",
      "placement": "center",
      "motion": "fade-in",
      "autoBackground": true
    }
  },
  {
    "scene": "crosswarp",
    "text": "Crosswarp — a liquid horizontal morph between scenes.",
    "overlay": { "type": "callout", "text": "crosswarp", "placement": "top-left" }
  },
  {
    "scene": "swirl",
    "text": "Swirl — rotational blend with a midpoint flash.",
    "overlay": { "type": "callout", "text": "swirl", "placement": "top-left" }
  },
  {
    "scene": "ripple",
    "text": "Ripple — wave distortion originating from the centre.",
    "overlay": { "type": "callout", "text": "ripple", "placement": "top-left" }
  },
  {
    "scene": "luma-mask",
    "text": "Luma mask — directional wipe with a soft edge.",
    "overlay": { "type": "callout", "text": "luma-mask", "placement": "top-left" }
  },
  {
    "scene": "light-leak",
    "text": "Light leak — film-style warm flash between scenes.",
    "overlay": { "type": "callout", "text": "light-leak", "placement": "top-left" }
  }
]
```

- [ ] **Step 2: Create demo script**

```typescript
// demos/shaders-showcase.demo.ts
import { test } from '@argo-video/cli';

test('shaders-showcase', async ({ page, narration }) => {
  test.setTimeout(120_000);

  const backgrounds = [
    'linear-gradient(135deg,#0f172a,#1e293b,#334155)',
    'linear-gradient(135deg,#701a75,#be185d,#db2777)',
    'linear-gradient(135deg,#0c4a6e,#0369a1,#0284c7)',
    'linear-gradient(135deg,#14532d,#166534,#16a34a)',
    'linear-gradient(135deg,#78350f,#b45309,#d97706)',
    'linear-gradient(135deg,#450a0a,#991b1b,#dc2626)',
  ];

  const scenes = ['intro', 'crosswarp', 'swirl', 'ripple', 'luma-mask', 'light-leak'];

  for (let i = 0; i < scenes.length; i++) {
    await page.setContent(`
      <!DOCTYPE html><html><body style="margin:0;background:${backgrounds[i]};height:100vh;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center">
        <div style="text-align:center">
          <div style="font-size:72px;font-weight:800;letter-spacing:-0.02em">${scenes[i]}</div>
          <div style="font-size:24px;opacity:0.7;margin-top:12px">scene ${i + 1}</div>
        </div>
      </body></html>
    `);
    await page.waitForTimeout(300);
    narration.mark(scenes[i]);
    await page.waitForTimeout(narration.durationFor(scenes[i], { minMs: 2500, maxMs: 4000 }));
  }
});
```

- [ ] **Step 3: Configure shader transition**

In the project's `argo.config.mjs` (or equivalent), ensure `export.transition` supports `{ type: 'shader', shader: 'crosswarp', durationMs: 800 }`. For the demo, override at pipeline time:

Run with crosswarp:
```bash
ARGO_TRANSITION_TYPE=shader ARGO_TRANSITION_SHADER=crosswarp \
  node bin/argo.js pipeline shaders-showcase
```

(If `argo.config.mjs` doesn't have env-var support, edit it temporarily or write config into the demo's per-demo config override — match existing project conventions.)

- [ ] **Step 4: Verify shader PNG cache populated**

Run: `ls .argo/shaders-showcase/shaders/`
Expected: 5 subdirectories (one per boundary), each with N PNG files.

- [ ] **Step 5: Verify video produced**

Check that `videos/shaders-showcase.mp4` exists and each boundary shows the shader transition (visually — each boundary should have a distinct effect when the demo uses per-shader overrides; with single-shader v1, all 5 boundaries will use `crosswarp`).

- [ ] **Step 6: Commit**

```bash
git add demos/shaders-showcase.demo.ts demos/shaders-showcase.scenes.json
git add -f videos/shaders-showcase.mp4
git -c commit.gpgsign=false commit -m "demo: add shaders-showcase demonstrating WebGL shader transitions"
```

---

## Task 12: Update docs (README, skill, CLAUDE.md)

**Files:**
- Modify: `README.md`
- Modify: `skills/argo-guide/SKILL.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: README**

In `README.md`, in the Transitions section, add:

```markdown
### Shader transitions

Pre-rendered WebGL shader transitions between scenes, cached by content hash.

\`\`\`javascript
// argo.config.mjs
export default {
  export: {
    transition: {
      type: 'shader',
      shader: 'crosswarp',   // crosswarp | swirl | ripple | luma-mask | light-leak
      durationMs: 800,
    },
  },
};
\`\`\`

Shaders are adapted from [gl-transitions.com](https://gl-transitions.com) (MIT). See `src/transitions/shaders/` for sources.

First render launches Playwright Chromium to pre-render shader frames; cached at `.argo/<demo>/shaders/<hash>/` so subsequent exports skip the browser launch.
```

- [ ] **Step 2: Skill**

In `skills/argo-guide/SKILL.md`, under transitions, add shader option with the same config snippet. Keep ~15 lines.

- [ ] **Step 3: CLAUDE.md**

In `CLAUDE.md`, under `### Transitions`, append:

```markdown
### Shader transitions (`src/transitions/shader-render.ts`, `src/transitions/shader-splice.ts`)

Pre-rendered WebGL shader transitions. At export time, a pre-pass extracts two boundary frames per scene boundary (last frame of outgoing, first frame of incoming) via ffmpeg, then Playwright Chromium renders the GLSL shader at each of `N = D × fps` progress values, producing a PNG sequence. `buildShaderSpliceFilter` generates a filter_complex three-segment concat (`scene_a + PNG_seq + scene_b`) that replaces the fade window.

Cache key: `sha256(shader, durationMs, fps, width, height, sha256(aPng), sha256(bPng))`. Cached at `.argo/<demo>/shaders/<hash>/`. Second export with unchanged boundaries hits cache with no browser launch.

Shaders live in `src/transitions/shaders/*.glsl`. Build step copies `.glsl` files to `dist/` (tsc does not). v1 ships: `crosswarp`, `swirl`, `ripple`, `luma-mask`, `light-leak` — adapted from gl-transitions.com (MIT).

Per-boundary shader selection is NOT supported in v1 — `export.transition.shader` applies to all boundaries. Future work: a sidecar for per-boundary overrides.
```

- [ ] **Step 4: Build + full test**

Run: `npm run build && npm test -- --run`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add README.md skills/argo-guide/SKILL.md CLAUDE.md
git -c commit.gpgsign=false commit -m "docs: document shader transitions"
```

---

## Final verification

- [ ] `npm test -- --run` passes
- [ ] `npm run build` exits 0
- [ ] `.argo/shaders-showcase/shaders/` contains cached PNG sequences
- [ ] `videos/shaders-showcase.mp4` shows each boundary with a visible shader effect
- [ ] Re-running `argo pipeline shaders-showcase` hits the cache (no browser launch)
- [ ] Existing demos with fade/dissolve/wipe transitions still work

## Out of scope (future work)

- Per-boundary shader selection — v1 uses single shader for whole demo.
- Shaders with live video textures (frozen-frame blend is faster + deterministic).
- User-provided custom shader source (security review required first).
- Preview-UI shader picker dropdown.
- Shader parameter tuning per instance (e.g., swirl intensity).
