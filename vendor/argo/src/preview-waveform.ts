/**
 * Waveform extraction for the preview server's timeline strip.
 *
 * Reads a WAV file, downsamples it to N peak buckets, and returns a normalized
 * `[0,1]` array suitable for canvas rendering. Cached per-process by file mtime
 * + bucket count so repeated requests during a preview session are cheap.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { parseWavHeader } from './tts/engine.js';

export interface WaveformData {
  /** Normalized `[0,1]` peak amplitudes — one per bucket. */
  samples: number[];
  /** Total audio duration in ms. */
  durationMs: number;
  /** WAV sample rate in Hz. */
  sampleRate: number;
  /** Number of buckets (== samples.length). */
  bucketCount: number;
}

interface CacheEntry {
  mtimeMs: number;
  bucketCount: number;
  data: WaveformData;
}

const cache = new Map<string, CacheEntry>();

const MIN_BUCKETS = 16;
const MAX_BUCKETS = 8000;

/** Compute waveform peaks from a WAV file. Returns null if the file is missing or unsupported. */
export function computeWaveform(wavPath: string, requestedBuckets = 1000): WaveformData | null {
  if (!existsSync(wavPath)) return null;
  const bucketCount = Math.max(MIN_BUCKETS, Math.min(MAX_BUCKETS, Math.floor(requestedBuckets) || 1000));

  const st = statSync(wavPath);
  const cached = cache.get(wavPath);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.bucketCount === bucketCount) {
    return cached.data;
  }

  let buf: Buffer;
  try {
    buf = readFileSync(wavPath);
  } catch {
    return null;
  }

  let header;
  try {
    header = parseWavHeader(buf);
  } catch {
    return null;
  }

  const { sampleRate, numChannels, bitsPerSample, audioFormat, dataOffset, dataSize, durationMs } = header;
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor(dataSize / (bytesPerSample * numChannels));

  if (totalSamples === 0) {
    const empty: WaveformData = { samples: new Array(bucketCount).fill(0), durationMs: 0, sampleRate, bucketCount };
    cache.set(wavPath, { mtimeMs: st.mtimeMs, bucketCount, data: empty });
    return empty;
  }

  const reader = makeSampleReader(buf, dataOffset, audioFormat, bitsPerSample);
  if (!reader) return null;

  const samplesPerBucket = totalSamples / bucketCount;
  const out = new Array<number>(bucketCount);
  let globalPeak = 0;

  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * samplesPerBucket);
    const end = Math.min(totalSamples, Math.floor((b + 1) * samplesPerBucket));
    let bucketPeak = 0;
    for (let i = start; i < end; i++) {
      let s = 0;
      for (let c = 0; c < numChannels; c++) {
        s += Math.abs(reader(i * numChannels + c));
      }
      s /= numChannels;
      if (s > bucketPeak) bucketPeak = s;
    }
    out[b] = bucketPeak;
    if (bucketPeak > globalPeak) globalPeak = bucketPeak;
  }

  if (globalPeak > 0) {
    for (let i = 0; i < out.length; i++) out[i] = out[i] / globalPeak;
  }

  const data: WaveformData = { samples: out, durationMs, sampleRate, bucketCount };
  cache.set(wavPath, { mtimeMs: st.mtimeMs, bucketCount, data });
  return data;
}

function makeSampleReader(
  buf: Buffer,
  dataOffset: number,
  audioFormat: number,
  bitsPerSample: number,
): ((sampleIndex: number) => number) | null {
  // PCM (1) and IEEE float (3) are the formats our pipeline emits.
  if (audioFormat === 3 && bitsPerSample === 32) {
    return (i) => buf.readFloatLE(dataOffset + i * 4);
  }
  if (audioFormat === 1 && bitsPerSample === 16) {
    return (i) => buf.readInt16LE(dataOffset + i * 2) / 32768;
  }
  if (audioFormat === 1 && bitsPerSample === 8) {
    return (i) => (buf.readUInt8(dataOffset + i) - 128) / 128;
  }
  if (audioFormat === 1 && bitsPerSample === 24) {
    return (i) => {
      const o = dataOffset + i * 3;
      const lo = buf.readUInt8(o);
      const mid = buf.readUInt8(o + 1);
      const hi = buf.readInt8(o + 2);
      return ((hi << 16) | (mid << 8) | lo) / 8_388_608;
    };
  }
  return null;
}

export function clearWaveformCache(path?: string): void {
  if (path) cache.delete(path);
  else cache.clear();
}
