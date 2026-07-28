import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectGpuEncoder,
  getGpuEncoderName,
  resetGpuEncoderCache,
  isGpuEncoderProbed,
  isGpuEncodingEnabled,
} from '../src/gpu-encoder.js';

describe('gpu-encoder', () => {
  beforeEach(() => resetGpuEncoderCache());

  it('detectGpuEncoder returns a valid encoder name or null', async () => {
    const enc = await detectGpuEncoder();
    expect(enc === null || ['nvenc', 'videotoolbox', 'vaapi', 'qsv'].includes(enc)).toBe(true);
  });

  it('caches the detection result — second call returns same value', async () => {
    const a = await detectGpuEncoder();
    const b = await detectGpuEncoder();
    expect(a).toBe(b);
  });

  it('caches null result — probed flag is set after first call so probe does not re-run', async () => {
    // After the first detectGpuEncoder() call, isGpuEncoderProbed() must be
    // true regardless of whether a GPU was found. A second call must return
    // the same value without flipping probed back to false.
    expect(isGpuEncoderProbed()).toBe(false);
    const first = await detectGpuEncoder();
    expect(isGpuEncoderProbed()).toBe(true);

    const second = await detectGpuEncoder();
    // Both must agree — including when first is null (no-GPU machine).
    expect(second).toBe(first);
    // Still probed — not reset by the second call.
    expect(isGpuEncoderProbed()).toBe(true);
  });

  it('resetGpuEncoderCache clears the probed flag so next call re-probes', async () => {
    await detectGpuEncoder();
    expect(isGpuEncoderProbed()).toBe(true);
    resetGpuEncoderCache();
    expect(isGpuEncoderProbed()).toBe(false);
  });

  it('getGpuEncoderName maps encoder to ffmpeg codec name for h264', () => {
    expect(getGpuEncoderName('nvenc', 'h264')).toBe('h264_nvenc');
    expect(getGpuEncoderName('videotoolbox', 'h264')).toBe('h264_videotoolbox');
    expect(getGpuEncoderName('vaapi', 'h264')).toBe('h264_vaapi');
    expect(getGpuEncoderName('qsv', 'h264')).toBe('h264_qsv');
    expect(getGpuEncoderName(null, 'h264')).toBe('libx264');
  });
});

describe('isGpuEncodingEnabled', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.ARGO_USE_GPU;
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.ARGO_USE_GPU;
    } else {
      process.env.ARGO_USE_GPU = saved;
    }
  });

  it('returns true when env var is unset', () => {
    delete process.env.ARGO_USE_GPU;
    expect(isGpuEncodingEnabled()).toBe(true);
  });

  it('returns true when env var is "1"', () => {
    process.env.ARGO_USE_GPU = '1';
    expect(isGpuEncodingEnabled()).toBe(true);
  });

  it('returns true when env var is "true"', () => {
    process.env.ARGO_USE_GPU = 'true';
    expect(isGpuEncodingEnabled()).toBe(true);
  });

  it('returns false when env var is "0"', () => {
    process.env.ARGO_USE_GPU = '0';
    expect(isGpuEncodingEnabled()).toBe(false);
  });
});
