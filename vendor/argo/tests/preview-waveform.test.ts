import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeWaveform, clearWaveformCache } from '../src/preview-waveform.js';
import { createWavBuffer } from '../src/tts/engine.js';

const SR = 24_000;

function sineWav(freqHz: number, seconds: number, amplitude = 0.8): Buffer {
  const n = Math.floor(SR * seconds);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * freqHz * i) / SR);
  }
  return createWavBuffer(samples, SR);
}

function silentWav(seconds: number): Buffer {
  const n = Math.floor(SR * seconds);
  return createWavBuffer(new Float32Array(n), SR);
}

describe('computeWaveform', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'argo-waveform-'));
    clearWaveformCache();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    clearWaveformCache();
  });

  it('returns null when the WAV file does not exist', () => {
    const result = computeWaveform(join(tmp, 'missing.wav'), 100);
    expect(result).toBeNull();
  });

  it('produces the requested number of buckets for a sine wave', () => {
    const path = join(tmp, 'sine.wav');
    writeFileSync(path, sineWav(440, 1.0));
    const result = computeWaveform(path, 250);
    expect(result).not.toBeNull();
    expect(result!.samples.length).toBe(250);
    expect(result!.bucketCount).toBe(250);
    expect(result!.sampleRate).toBe(SR);
    expect(Math.round(result!.durationMs)).toBe(1000);
  });

  it('normalizes peaks into the [0,1] range with at least one bucket near 1', () => {
    const path = join(tmp, 'sine.wav');
    writeFileSync(path, sineWav(440, 0.5, 0.5));
    const result = computeWaveform(path, 100);
    expect(result).not.toBeNull();
    const max = Math.max(...result!.samples);
    const min = Math.min(...result!.samples);
    expect(max).toBeLessThanOrEqual(1.0001);
    expect(min).toBeGreaterThanOrEqual(0);
    // After normalization the loudest bucket should be ~1
    expect(max).toBeGreaterThan(0.95);
  });

  it('returns all-zero samples for a silent track without crashing', () => {
    const path = join(tmp, 'silent.wav');
    writeFileSync(path, silentWav(0.5));
    const result = computeWaveform(path, 64);
    expect(result).not.toBeNull();
    expect(result!.samples.length).toBe(64);
    expect(result!.samples.every((s) => s === 0)).toBe(true);
  });

  it('clamps the bucket count to the supported range', () => {
    const path = join(tmp, 'sine.wav');
    writeFileSync(path, sineWav(440, 0.5));
    const tooFew = computeWaveform(path, 1)!;
    const tooMany = computeWaveform(path, 50_000)!;
    expect(tooFew.samples.length).toBeGreaterThanOrEqual(16);
    expect(tooMany.samples.length).toBeLessThanOrEqual(8000);
  });

  it('caches by mtime + bucket count and re-reads on file change', () => {
    const path = join(tmp, 'sine.wav');
    writeFileSync(path, sineWav(440, 0.5));
    const a = computeWaveform(path, 200);
    const b = computeWaveform(path, 200);
    expect(b).toBe(a); // same object reference (cache hit)

    // Bumping bucketCount busts the cache for that path
    const c = computeWaveform(path, 300);
    expect(c).not.toBe(a);
    expect(c!.samples.length).toBe(300);
  });

  it('returns null for a non-WAV file', () => {
    const path = join(tmp, 'not-a-wav.txt');
    writeFileSync(path, 'plain text');
    expect(computeWaveform(path, 100)).toBeNull();
  });

  it('returns null for an unparseable WAV (no data chunk discoverable)', () => {
    // createWavBuffer with zero samples produces a 44-byte header where the
    // data chunk header sits at the very end, so parseWavHeader's lookup loop
    // can't read it. The helper should return null rather than throw.
    const path = join(tmp, 'empty.wav');
    writeFileSync(path, createWavBuffer(new Float32Array(0), SR));
    expect(computeWaveform(path, 32)).toBeNull();
  });

  it('handles a single-sample WAV with one zero-amplitude bucket', () => {
    const path = join(tmp, 'one.wav');
    writeFileSync(path, createWavBuffer(new Float32Array([0]), SR));
    const result = computeWaveform(path, 32);
    expect(result).not.toBeNull();
    expect(result!.samples.length).toBe(32);
    expect(result!.samples.every((s) => s === 0)).toBe(true);
  });
});
