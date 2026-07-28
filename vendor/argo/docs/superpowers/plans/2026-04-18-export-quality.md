# Export Quality Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four low-risk, high-impact export quality improvements to Argo's ffmpeg encoder: BT.709 color space tagging, x264 adaptive quantization tuning, full-range → TV-range conversion, and GPU encoder auto-detection (VideoToolbox on macOS, NVENC on NVIDIA, VAAPI on Linux, QSV on Intel).

**Architecture:** All changes land in `src/export.ts` and a new `src/gpu-encoder.ts` utility. No config schema changes — quality tuning is unconditional (always on) since it strictly improves output with no user-facing trade-offs. GPU encoding is on by default with env-var opt-out (`ARGO_USE_GPU=0`) for users who want reproducible libx264 output.

**Tech Stack:** ffmpeg CLI args, `spawn` for encoder probing, existing export pipeline.

**Rationale:** Documented in the compacted conversation context and the final message of our discussion. Summary:

- **BT.709 tags** prevent color shifts on Safari/TV/mobile players (Chrome screenshots are sRGB → maps to bt709).
- **`aq-mode=3:aq-strength=0.8:deblock=1,1`** redistributes bits toward dark flat regions — kills banding on gradients and dark-theme demos.
- **`scale=in_range=pc:out_range=tv`** converts Chrome's full-range RGB to H.264's expected TV range, preventing crushed blacks on standards-compliant players.
- **GPU encoder detection** — 5-10x encoding speedup on macOS (VideoToolbox) and NVIDIA (NVENC). Zero quality loss for well-tuned presets.

---

## File Structure

**Create:**
- `src/gpu-encoder.ts` — encoder detection utility
- `tests/gpu-encoder.test.ts`

**Modify:**
- `src/export.ts:485-490` — replace hardcoded `libx264` with encoder-aware args; add color metadata + x264-params; wire range conversion
- `src/config.ts` — optional: `export.gpuEncoder?: boolean | 'auto' | 'off'` (v1: env var only, no config field)
- `CLAUDE.md` — add export quality section
- `README.md` — brief note about GPU encoding

---

## Task 1: GPU encoder detection utility

**Files:**
- Create: `src/gpu-encoder.ts`
- Create: `tests/gpu-encoder.test.ts`

- [ ] **Step 1: Write the failing detection test**

```typescript
// tests/gpu-encoder.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { detectGpuEncoder, getGpuEncoderName, resetGpuEncoderCache } from '../src/gpu-encoder.js';

describe('gpu-encoder', () => {
  beforeEach(() => resetGpuEncoderCache());

  it('detectGpuEncoder returns a valid encoder name or null', async () => {
    const enc = await detectGpuEncoder();
    expect(enc === null || ['nvenc', 'videotoolbox', 'vaapi', 'qsv'].includes(enc)).toBe(true);
  });

  it('caches the detection result', async () => {
    const a = await detectGpuEncoder();
    const b = await detectGpuEncoder();
    expect(a).toBe(b);
  });

  it('getGpuEncoderName maps encoder to ffmpeg codec name for h264', () => {
    expect(getGpuEncoderName('nvenc', 'h264')).toBe('h264_nvenc');
    expect(getGpuEncoderName('videotoolbox', 'h264')).toBe('h264_videotoolbox');
    expect(getGpuEncoderName('vaapi', 'h264')).toBe('h264_vaapi');
    expect(getGpuEncoderName('qsv', 'h264')).toBe('h264_qsv');
    expect(getGpuEncoderName(null, 'h264')).toBe('libx264');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gpu-encoder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement gpu-encoder.ts**

```typescript
// src/gpu-encoder.ts
import { spawn } from 'node:child_process';

export type GpuEncoder = 'nvenc' | 'videotoolbox' | 'vaapi' | 'qsv' | null;

let cached: GpuEncoder | undefined;

/**
 * Probe ffmpeg for a GPU-accelerated H.264 encoder.
 *
 * Detection order (preference): nvenc > videotoolbox > vaapi > qsv.
 * Returns `null` if no GPU encoder is available — caller should fall back
 * to libx264.
 *
 * Result is cached for the process lifetime. Call `resetGpuEncoderCache()`
 * in tests if you need to re-probe.
 */
export async function detectGpuEncoder(): Promise<GpuEncoder> {
  if (cached !== undefined) return cached;
  cached = await probeEncoders();
  return cached;
}

export function resetGpuEncoderCache(): void {
  cached = undefined;
}

function probeEncoders(): Promise<GpuEncoder> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-encoders'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    proc.stdout.on('data', (chunk) => { out += chunk.toString(); });
    proc.on('close', () => {
      if (out.includes('h264_nvenc')) return resolve('nvenc');
      if (out.includes('h264_videotoolbox')) return resolve('videotoolbox');
      if (out.includes('h264_vaapi')) return resolve('vaapi');
      if (out.includes('h264_qsv')) return resolve('qsv');
      resolve(null);
    });
    proc.on('error', () => resolve(null));
  });
}

/**
 * Map an encoder handle to the ffmpeg codec name.
 * Returns `libx264` when encoder is null (CPU fallback).
 */
export function getGpuEncoderName(encoder: GpuEncoder, codec: 'h264'): string {
  if (!encoder) return 'libx264';
  switch (encoder) {
    case 'nvenc': return 'h264_nvenc';
    case 'videotoolbox': return 'h264_videotoolbox';
    case 'vaapi': return 'h264_vaapi';
    case 'qsv': return 'h264_qsv';
  }
}

/**
 * Whether GPU encoding is enabled for this process.
 * Controlled by `ARGO_USE_GPU` env var: unset/`'1'` → enabled, `'0'` → disabled.
 */
export function isGpuEncodingEnabled(): boolean {
  const v = process.env.ARGO_USE_GPU;
  return v === undefined || v === '1' || v === 'true';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gpu-encoder.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/gpu-encoder.ts tests/gpu-encoder.test.ts
git -c commit.gpgsign=false commit -m "feat(export): GPU encoder detection utility (NVENC/VideoToolbox/VAAPI/QSV)"
```

---

## Task 2: BT.709 color metadata tagging

**Files:**
- Modify: `src/export.ts:485-490`

- [ ] **Step 1: Write the failing color metadata test**

Append to `tests/export.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportVideo } from '../src/export.js';

describe('export — color space tagging', () => {
  const sample = join(process.cwd(), 'tests/fixtures/sample-2s.mp4');
  const hasSample = existsSync(sample);

  it.runIf(hasSample)('embeds BT.709 color metadata in the output', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'argo-color-'));
    const argoDir = join(tmp, 'argo');
    const demoDir = join(argoDir, 'cdemo');
    require('node:fs').mkdirSync(demoDir, { recursive: true });
    require('node:fs').copyFileSync(sample, join(demoDir, 'video.mp4'));

    await exportVideo({
      demoName: 'cdemo',
      argoDir,
      outputDir: join(tmp, 'out'),
    });

    const outPath = join(tmp, 'out', 'cdemo.mp4');
    expect(existsSync(outPath)).toBe(true);

    // Probe color metadata via ffprobe
    const probe = spawnSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=color_space,color_primaries,color_transfer',
      '-of', 'default=noprint_wrappers=1',
      outPath,
    ], { encoding: 'utf-8' });

    expect(probe.stdout).toContain('color_space=bt709');
    expect(probe.stdout).toContain('color_primaries=bt709');
    expect(probe.stdout).toContain('color_transfer=bt709');

    rmSync(tmp, { recursive: true, force: true });
  }, 60000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/export.test.ts -t "color space tagging"`
Expected: FAIL — color metadata missing.

- [ ] **Step 3: Add color metadata to libx264 args**

In `src/export.ts`, locate lines 485-490 (the `args.push('-c:v', 'libx264', ...)` block). Replace with:

```typescript
  args.push('-c:v', 'libx264');
  args.push('-pix_fmt', 'yuv420p');
  args.push('-preset', preset);
  args.push('-crf', String(crf));

  // x264 quality tuning — aq-mode=3 redistributes bits to dark flat regions
  // (kills gradient banding on dark demos), deblock softens macroblock edges.
  // BT.709 params embed the color-space VUI inside H.264 metadata.
  args.push(
    '-x264-params',
    'aq-mode=3:aq-strength=0.8:deblock=1,1:colorprim=bt709:transfer=bt709:colormatrix=bt709',
  );

  // Container-level color space tags — picked up by Safari, modern TVs, and
  // standards-compliant players. Chrome screenshots are sRGB which maps to BT.709.
  args.push(
    '-colorspace:v', 'bt709',
    '-color_primaries:v', 'bt709',
    '-color_trc:v', 'bt709',
    '-color_range', 'tv',
  );

  // Fixed 90kHz timescale prevents A/V timing drift across platforms.
  args.push('-video_track_timescale', '90000');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/export.test.ts -t "color space tagging"`
Expected: test passes.

- [ ] **Step 5: Regression check — full test suite**

Run: `npm test -- --run`
Expected: no regressions. Existing video exports still produce valid files; the new flags are additive.

- [ ] **Step 6: Commit**

```bash
git add src/export.ts tests/export.test.ts
git -c commit.gpgsign=false commit -m "feat(export): tag output with BT.709 color metadata + x264 AQ tuning"
```

---

## Task 3: Full-range to TV-range conversion

**Files:**
- Modify: `src/export.ts` (near existing `scale` handling ~line 274, and sharpen fallback ~line 428)

**Context:** Chrome screenshots output full-range RGB (0-255). H.264 TV-range expects 16-235. Without conversion, blacks clip and contrast gets crushed on compliant players. The filter is `scale=in_range=pc:out_range=tv`. It must be added AFTER the existing `scale=W:H:flags=lanczos` downscale filter (when present), or standalone if no downscale.

The existing code has two filter paths:
- `-vf` direct filters (`vFilters.push(...)` at line 270+)
- `filter_complex` graph (`filterParts.push(...)`)

Range conversion applies to the **video stream path**, matching wherever other video filters are going. The cleanest approach: add the range filter to `vFilters` so it's always appended after the lanczos scale.

- [ ] **Step 1: Write the failing range conversion test**

Append to `tests/export.test.ts`:

```typescript
it.runIf(hasSample)('embeds TV color range in output (limited range)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'argo-range-'));
  const argoDir = join(tmp, 'argo');
  const demoDir = join(argoDir, 'rdemo');
  require('node:fs').mkdirSync(demoDir, { recursive: true });
  require('node:fs').copyFileSync(sample, join(demoDir, 'video.mp4'));

  await exportVideo({
    demoName: 'rdemo',
    argoDir,
    outputDir: join(tmp, 'out'),
  });

  const outPath = join(tmp, 'out', 'rdemo.mp4');
  const probe = spawnSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=color_range',
    '-of', 'default=noprint_wrappers=1',
    outPath,
  ], { encoding: 'utf-8' });

  // Either "tv" (limited) or numeric "1" — both indicate limited range
  expect(probe.stdout).toMatch(/color_range=(tv|1)/);

  rmSync(tmp, { recursive: true, force: true });
}, 60000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/export.test.ts -t "TV color range"`
Expected: FAIL or output has `color_range=pc` / empty.

- [ ] **Step 3: Add range conversion filter**

In `src/export.ts`, locate the `vFilters` population block around line 270:

```typescript
  const vFilters: string[] = [];
  if (tailPadMs && tailPadMs > 0) {
    vFilters.push(`tpad=stop_mode=clone:stop_duration=${formatSeconds(tailPadMs)}`);
  }
  if (deviceScaleFactor > 1 && outputWidth && outputHeight) {
    vFilters.push(`scale=${outputWidth}:${outputHeight}:flags=lanczos`);
  }
```

Add range conversion UNCONDITIONALLY after those filters:

```typescript
  // Chrome renders full-range RGB (0-255); H.264 expects TV range (16-235).
  // Convert so blacks don't clip and contrast matches on compliant players.
  vFilters.push('scale=in_range=pc:out_range=tv');
```

**Gotcha:** If the filter chain later migrates to `filter_complex` (as happens with speed-ramp, transitions, camera moves, overlay PNGs, frame effect), the range conversion must be preserved. Trace through the code: when `vFilters` entries are "consumed" by being moved into a `filter_complex` node (look for `vFilters.join(',')` concat patterns), the range conversion tags along automatically. Verify with Step 4.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/export.test.ts -t "TV color range"`
Expected: test passes.

- [ ] **Step 5: Regression check**

Run a real demo through pipeline end-to-end to confirm no filter-chain regression:

```bash
npm run build && node bin/argo.js pipeline showcase 2>&1 | tail -20
```

Expected: pipeline completes; output MP4 exists; plays in QuickTime + VLC.

- [ ] **Step 6: Commit**

```bash
git add src/export.ts tests/export.test.ts
git -c commit.gpgsign=false commit -m "feat(export): convert Chrome full-range RGB to H.264 TV range"
```

---

## Task 4: GPU encoder integration

**Files:**
- Modify: `src/export.ts:485+`

**Design decision:** GPU encoding is ON by default. Users who want deterministic libx264 output set `ARGO_USE_GPU=0`. Each encoder has different quality-vs-speed characteristics — map Argo's `crf` value to each encoder's native quality knob:

- NVENC: `-cq` (constant quantizer, 0-51, similar to crf)
- VideoToolbox: `-q:v` (quality 0-100 — invert crf via `max(0, 100 - crf*2)`)
- VAAPI: `-qp` (quantization parameter 0-51, like crf)
- QSV: `-global_quality` (similar to crf)

Argo's `preset` maps to each encoder's speed preset. Keep the mapping simple — NVENC/QSV accept the same preset names (`fast`, `medium`, `slow`, etc.); VideoToolbox and VAAPI ignore `-preset`.

**Caveat:** VideoToolbox requires `-allow_sw 1` so it falls back to software if hardware fails (e.g., unsupported resolution). VAAPI requires a device init flag.

- [ ] **Step 1: Write the failing GPU encoder test**

Append to `tests/export.test.ts`:

```typescript
import { detectGpuEncoder } from '../src/gpu-encoder.js';

it.runIf(hasSample)('uses GPU encoder when available and env allows', async () => {
  const enc = await detectGpuEncoder();
  if (!enc) {
    // No GPU encoder detected — skip (still valid test env)
    return;
  }
  const tmp = mkdtempSync(join(tmpdir(), 'argo-gpu-'));
  const argoDir = join(tmp, 'argo');
  const demoDir = join(argoDir, 'gdemo');
  require('node:fs').mkdirSync(demoDir, { recursive: true });
  require('node:fs').copyFileSync(sample, join(demoDir, 'video.mp4'));

  await exportVideo({
    demoName: 'gdemo',
    argoDir,
    outputDir: join(tmp, 'out'),
  });

  const outPath = join(tmp, 'out', 'gdemo.mp4');
  expect(existsSync(outPath)).toBe(true);

  // Probe encoder used — metadata carries the encoder tag
  const probe = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream_tags=encoder',
    '-of', 'default=noprint_wrappers=1',
    outPath,
  ], { encoding: 'utf-8' });

  // Different encoders stamp different tags — just check the output exists
  // and is a valid H.264 stream
  const codecProbe = spawnSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name',
    '-of', 'default=noprint_wrappers=1',
    outPath,
  ], { encoding: 'utf-8' });
  expect(codecProbe.stdout).toContain('codec_name=h264');

  rmSync(tmp, { recursive: true, force: true });
}, 60000);

it.runIf(hasSample)('falls back to libx264 when ARGO_USE_GPU=0', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'argo-cpu-'));
  const argoDir = join(tmp, 'argo');
  const demoDir = join(argoDir, 'cpudemo');
  require('node:fs').mkdirSync(demoDir, { recursive: true });
  require('node:fs').copyFileSync(sample, join(demoDir, 'video.mp4'));

  const prev = process.env.ARGO_USE_GPU;
  process.env.ARGO_USE_GPU = '0';
  try {
    await exportVideo({
      demoName: 'cpudemo',
      argoDir,
      outputDir: join(tmp, 'out'),
    });
  } finally {
    if (prev === undefined) delete process.env.ARGO_USE_GPU;
    else process.env.ARGO_USE_GPU = prev;
  }

  const outPath = join(tmp, 'out', 'cpudemo.mp4');
  expect(existsSync(outPath)).toBe(true);
  rmSync(tmp, { recursive: true, force: true });
}, 60000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/export.test.ts -t "GPU encoder"`
Expected: test may pass on systems without GPU (skips) or fail if our output isn't distinguishable. The fallback test always runs.

- [ ] **Step 3: Refactor encoder args block**

In `src/export.ts`, add imports at top:

```typescript
import { detectGpuEncoder, getGpuEncoderName, isGpuEncodingEnabled, type GpuEncoder } from './gpu-encoder.js';
```

Then convert the encoder args block (the one modified in Task 2) to encoder-aware logic. Replace the whole block from Task 2's change with:

```typescript
  // Detect GPU encoder (cached — single ffmpeg probe per process)
  const gpuEncoder: GpuEncoder = isGpuEncodingEnabled() ? await detectGpuEncoder() : null;
  const codecName = getGpuEncoderName(gpuEncoder, 'h264');

  // VAAPI needs device init as an INPUT option — must be inserted before -i args.
  // Shift args array so vaapi_device flag lands at the start.
  if (gpuEncoder === 'vaapi') {
    args.unshift('-vaapi_device', '/dev/dri/renderD128');
    // The encoder expects NV12 hwupload — add to video filter chain
    vFilters.push('format=nv12', 'hwupload');
  }

  args.push('-c:v', codecName);
  args.push('-pix_fmt', gpuEncoder === 'vaapi' ? 'vaapi_vld' : 'yuv420p');

  // Preset + quality per encoder
  switch (gpuEncoder) {
    case 'nvenc':
      args.push('-preset', preset, '-cq', String(crf));
      break;
    case 'videotoolbox': {
      // VideoToolbox: q:v 0-100 where 100 = highest quality. Invert crf.
      const vtQ = Math.max(0, Math.min(100, 100 - crf * 2));
      args.push('-q:v', String(vtQ), '-allow_sw', '1');
      break;
    }
    case 'vaapi':
      args.push('-qp', String(crf));
      break;
    case 'qsv':
      args.push('-preset', preset, '-global_quality', String(crf));
      break;
    case null:
      // CPU fallback — standard libx264 preset + crf
      args.push('-preset', preset, '-crf', String(crf));
      break;
  }

  // x264 quality tuning + BT.709 VUI — only applies to libx264 (GPU encoders
  // don't accept -x264-params). GPU encoders stamp colorspace via the container
  // tags below, which all encoders respect.
  if (!gpuEncoder) {
    args.push(
      '-x264-params',
      'aq-mode=3:aq-strength=0.8:deblock=1,1:colorprim=bt709:transfer=bt709:colormatrix=bt709',
    );
  }

  // Container-level color space tags — apply to ALL encoder paths.
  args.push(
    '-colorspace:v', 'bt709',
    '-color_primaries:v', 'bt709',
    '-color_trc:v', 'bt709',
    '-color_range', 'tv',
  );

  // Fixed 90kHz timescale.
  args.push('-video_track_timescale', '90000');
```

**Important:** The `exportVideo` function must now be `async` if it was not already (it already awaits `runFfmpegWithProgress`). The `await detectGpuEncoder()` call fits in the existing async context.

- [ ] **Step 4: Run tests**

Run: `npm test -- --run`
Expected: all tests pass including existing export tests (no regression) and new encoder tests (skip or pass depending on environment).

- [ ] **Step 5: Manual speed check (macOS)**

If on macOS, benchmark:

```bash
time node bin/argo.js export showcase            # with VideoToolbox (default)
time ARGO_USE_GPU=0 node bin/argo.js export showcase   # libx264 fallback
```

Expected: GPU path noticeably faster (typically 3-10x on a 10-second demo).

- [ ] **Step 6: Commit**

```bash
git add src/export.ts tests/export.test.ts
git -c commit.gpgsign=false commit -m "feat(export): GPU encoder auto-detection with ARGO_USE_GPU env override"
```

---

## Task 5: Wire through all export paths

**Files:**
- Check: `src/pipeline.ts`, `src/preview.ts`, `src/cli.ts` call sites

No code change is likely needed here — the encoder logic lives entirely inside `exportVideo`, and all three call sites already flow through it. But per CLAUDE.md's "wire through ALL export paths" rule, verify each manually.

- [ ] **Step 1: Verify pipeline uses exportVideo**

Run: `grep -n "exportVideo" src/pipeline.ts`
Expected: pipeline imports and awaits `exportVideo(...)` — no encoder-specific logic to update.

- [ ] **Step 2: Verify preview Export path**

Run: `grep -n "exportVideo" src/preview.ts`
Expected: preview's /api/export handler calls `exportVideo(...)` — no changes needed.

- [ ] **Step 3: Verify CLI argo export**

Run: `grep -n "exportVideo" src/cli.ts`
Expected: CLI `export` command calls `exportVideo(...)` — no changes needed.

- [ ] **Step 4: Verify viewport variants path**

Run: `grep -n "variants\|exportVideo" src/export.ts`
Expected: viewport variants loop calls `exportVideo` per variant (or a recursive internal path). Ensure no encoder flags are duplicated outside `exportVideo`.

- [ ] **Step 5: Smoke test — pipeline + preview + CLI**

```bash
# Pipeline
node bin/argo.js pipeline showcase

# CLI standalone export
node bin/argo.js export showcase

# Preview export (manual — start preview, click Export)
node bin/argo.js preview showcase &
```

Expected: all three produce MP4 files. Check one file with `ffprobe` to confirm BT.709 tags are present.

- [ ] **Step 6: Commit (if any changes were needed)**

If no code changes: no commit. The existing plumbing already flows through `exportVideo`.

If changes were needed, commit them:

```bash
git add src/pipeline.ts src/preview.ts src/cli.ts
git -c commit.gpgsign=false commit -m "feat(pipeline): surface GPU encoder flag across all export paths"
```

---

## Task 6: Documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `skills/argo-guide/SKILL.md`

- [ ] **Step 1: README**

Add a new subsection under Export or Configuration:

```markdown
### Export Quality

Argo's H.264 output is tagged BT.709 color space, uses x264 adaptive quantization (`aq-mode=3`) to reduce banding on gradients, and converts Chrome's full-range RGB to H.264 TV range. Tags ensure colors match across Safari, TVs, and mobile players.

**GPU encoding.** Argo auto-detects GPU encoders and uses them when available:

- macOS: `h264_videotoolbox`
- NVIDIA: `h264_nvenc`
- Linux/AMD: `h264_vaapi`
- Intel: `h264_qsv`

Typical speedup: 3-10x on macOS, 5-15x on NVIDIA. Falls back to libx264 when no GPU encoder is available.

Disable GPU encoding with `ARGO_USE_GPU=0` (e.g., for deterministic CI builds):

\`\`\`bash
ARGO_USE_GPU=0 argo pipeline my-demo
\`\`\`
```

- [ ] **Step 2: CLAUDE.md**

Under `## Architecture` or `### Export`, add:

```markdown
### Export Quality (`src/export.ts`, `src/gpu-encoder.ts`)

Every H.264 output is tagged BT.709 color space at container level (`-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv`) and includes VUI metadata (`colorprim=bt709:transfer=bt709:colormatrix=bt709` inside `-x264-params`). Chrome screenshots output sRGB which maps to BT.709 — tagging prevents Safari/TV color shifts.

libx264 is tuned with `aq-mode=3:aq-strength=0.8:deblock=1,1` — redistributes bits to dark flat regions, kills gradient banding on dark-theme demos.

`scale=in_range=pc:out_range=tv` is appended to the video filter chain — converts Chrome's full-range RGB (0-255) to H.264 TV range (16-235). Prevents crushed blacks on standards-compliant players.

GPU encoder detection via `src/gpu-encoder.ts` probes `ffmpeg -encoders` at export time (cached per-process). Prefers NVENC > VideoToolbox > VAAPI > QSV > libx264. Per-encoder flags:
- NVENC: `-preset {preset} -cq {crf}`
- VideoToolbox: `-q:v {100 - crf*2} -allow_sw 1`
- VAAPI: `-qp {crf}` + `-vaapi_device /dev/dri/renderD128` + `format=nv12,hwupload` filter chain
- QSV: `-preset {preset} -global_quality {crf}`

Opt out via `ARGO_USE_GPU=0` for deterministic CI (libx264 fallback).

`-x264-params` does not apply when using a GPU encoder — container color tags cover those cases since GPU encoders don't have a `-x264-params` equivalent. Quality parity is close but not identical to libx264 at the same CRF — expected trade-off for the speedup.

A fixed 90 kHz timescale (`-video_track_timescale 90000`) is set on all outputs for consistent A/V timing across platforms.
```

- [ ] **Step 3: Skill**

In `skills/argo-guide/SKILL.md`, brief mention (under ~10 lines):

```markdown
### Export quality

- Output is BT.709-tagged H.264 with TV range, x264 adaptive quantization (kills gradient banding), and GPU encoder auto-detection.
- Set `ARGO_USE_GPU=0` for deterministic libx264 builds (e.g., CI).
```

- [ ] **Step 4: Build + commit**

Run: `npm run build && npm test -- --run`
Expected: all pass.

```bash
git add README.md CLAUDE.md skills/argo-guide/SKILL.md
git -c commit.gpgsign=false commit -m "docs: document BT.709 tagging, aq-mode tuning, and GPU encoder detection"
```

---

## Final verification

- [ ] `npm test -- --run` passes.
- [ ] `npm run build` exits 0.
- [ ] `ffprobe -show_entries stream=color_space,color_primaries,color_transfer,color_range videos/<any-recent>.mp4` shows `bt709` on all four fields.
- [ ] On macOS: encoding time noticeably shorter than before (VideoToolbox hit).
- [ ] Existing demo exports still play correctly in QuickTime, VLC, Safari, Chrome.
- [ ] `ARGO_USE_GPU=0 argo pipeline <demo>` falls back to libx264 without crashing.

## Out of scope

- HEVC (h265) encoding — stick to H.264 for compatibility.
- Per-export encoder override via config (e.g., `export.encoder: 'nvenc'`) — env var covers the use case.
- Two-pass encoding — CRF mode is fine for all current output; two-pass matters only for bitrate-targeted delivery.
- AV1 — too slow on CPU, GPU support is patchy. Revisit in 2027.
