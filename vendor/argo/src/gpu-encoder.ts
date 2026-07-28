import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export type GpuEncoder = 'nvenc' | 'videotoolbox' | 'vaapi' | 'qsv' | null;

let cached: GpuEncoder | undefined;
let probed = false;

/**
 * Probe ffmpeg for a GPU-accelerated H.264 encoder.
 *
 * Detection order (preference): nvenc > videotoolbox > vaapi > qsv.
 * Returns `null` if no GPU encoder is available — caller should fall back
 * to libx264.
 *
 * Result is cached for the process lifetime (including null — ffmpeg's encoder
 * list does not change during a process run). Call `resetGpuEncoderCache()`
 * in tests if you need to re-probe.
 */
export async function detectGpuEncoder(): Promise<GpuEncoder> {
  if (probed) return cached as GpuEncoder;
  cached = await probeEncoders();
  probed = true;
  return cached;
}

export function resetGpuEncoderCache(): void {
  cached = undefined;
  probed = false;
}

/** Exposed for tests only — returns true once detectGpuEncoder() has probed at least once. */
export function isGpuEncoderProbed(): boolean {
  return probed;
}

async function probeEncoders(): Promise<GpuEncoder> {
  try {
    const { stdout } = await execFileP('ffmpeg', ['-encoders'], { maxBuffer: 2 * 1024 * 1024 });
    if (stdout.includes('h264_nvenc')) return 'nvenc';
    if (stdout.includes('h264_videotoolbox')) return 'videotoolbox';
    if (stdout.includes('h264_vaapi')) return 'vaapi';
    if (stdout.includes('h264_qsv')) return 'qsv';
    return null;
  } catch {
    return null;
  }
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

export type EncoderPreference = 'cpu' | 'gpu';

/**
 * Read `ARGO_USE_GPU` as a forced preference. Returns `undefined` when the
 * var is unset (caller-supplied preference applies). Recognized values:
 *   - `'0'` / `'false'` → forced CPU
 *   - `'1'` / `'true'`  → forced GPU
 *   - anything else (incl. unset) → undefined (no override)
 */
function envEncoderOverride(): EncoderPreference | undefined {
  const v = process.env.ARGO_USE_GPU;
  if (v === '0' || v === 'false') return 'cpu';
  if (v === '1' || v === 'true') return 'gpu';
  return undefined;
}

/**
 * Whether GPU encoding is enabled for this process.
 * Controlled by `ARGO_USE_GPU` env var: unset/`'1'`/`'true'` → enabled,
 * any other value → disabled.
 *
 * Prefer `resolveEncoder()` for new code — it accepts an explicit caller
 * preference so paths like `argo pipeline` (quality-first) and `argo preview`
 * (speed-first) can pick different defaults.
 */
export function isGpuEncodingEnabled(): boolean {
  const v = process.env.ARGO_USE_GPU;
  return v === undefined || v === '1' || v === 'true';
}

/**
 * Resolve the encoder to use for a given export call.
 *
 * Precedence (highest → lowest):
 *   1. `ARGO_USE_GPU` env var ('0'/'false' → cpu, '1'/'true' → gpu) — explicit user override
 *   2. `preference` arg (from `export.encoder` config or call site)
 *   3. `defaultPreference` arg (caller default: pipeline/cli pass 'cpu' for quality,
 *      preview passes 'gpu' for fast iteration)
 *
 * Returns a `GpuEncoder` handle (or `null` for libx264).
 *
 * Why CPU is the default for pipeline/cli: videotoolbox at the default mapping
 * (`100 - crf*2` → q:v 54 at CRF 23) introduces dark-region quantization
 * (visible as watercolor banding on dark backgrounds at 4K source) that
 * libx264 with `aq-mode=3` does not. The 3–5× encode-time penalty is an
 * acceptable trade for a one-shot pipeline run.
 */
export async function resolveEncoder(
  preference: EncoderPreference | undefined,
  defaultPreference: EncoderPreference,
): Promise<GpuEncoder> {
  const chosen = envEncoderOverride() ?? preference ?? defaultPreference;
  if (chosen === 'cpu') return null;
  return await detectGpuEncoder();
}
