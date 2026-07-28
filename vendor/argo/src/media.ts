import { execFileSync, spawnSync } from 'node:child_process';
import type { BackgroundTheme } from './overlays/zones.js';

export function getVideoDurationMs(videoPath: string): number {
  let raw: string;
  try {
    raw = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath],
      { encoding: 'utf-8' },
    ).trim();
  } catch (err) {
    throw new Error(
      `Failed to get video duration from ${videoPath}. ` +
      `Ensure ffprobe is installed (it usually comes with ffmpeg). ` +
      `Original error: ${(err as Error).message}`,
    );
  }

  const durationMs = Math.round(parseFloat(raw) * 1000);
  if (isNaN(durationMs) || durationMs <= 0) {
    throw new Error(
      `ffprobe returned invalid duration "${raw}" for ${videoPath}. The video file may be corrupt.`,
    );
  }

  return durationMs;
}

export function getVideoFrameRate(videoPath: string): number {
  let raw: string;
  try {
    raw = execFileSync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate', '-of', 'csv=p=0', videoPath],
      { encoding: 'utf-8' },
    ).trim();
  } catch (err) {
    throw new Error(
      `Failed to get video frame rate from ${videoPath}. ` +
      `Ensure ffprobe is installed (it usually comes with ffmpeg). ` +
      `Original error: ${(err as Error).message}`,
    );
  }

  // ffprobe 8.x CSV output sometimes appends a trailing comma after the only
  // requested field — strip it before parsing so we don't reject "30/1,".
  const cleaned = raw.replace(/,+$/, '');
  if (!cleaned || cleaned === '0/0') {
    throw new Error(`ffprobe returned invalid frame rate "${raw}" for ${videoPath}.`);
  }

  const match = cleaned.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  const fps = match ? Number(match[1]) / Number(match[2]) : Number(cleaned);
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`ffprobe returned invalid frame rate "${raw}" for ${videoPath}.`);
  }

  return fps;
}

/**
 * Compute average luminance of a single video frame at the given timestamp.
 * Returns a value 0–255 or null on failure.
 */
function frameLuminance(videoPath: string, timestampMs: number): number | null {
  try {
    const ss = (timestampMs / 1000).toFixed(3);
    const result = spawnSync('ffmpeg', [
      '-ss', ss,
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', 'scale=64:36',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 36 * 3 + 1024 });

    // ffmpeg may return non-zero even when stdout has valid frame data (e.g., codec warnings)
    if (!result.stdout || result.stdout.length < 3) {
      return null;
    }

    const pixels = result.stdout as Buffer;
    let totalLuminance = 0;
    const pixelCount = Math.floor(pixels.length / 3);
    for (let i = 0; i < pixelCount; i++) {
      const r = pixels[i * 3];
      const g = pixels[i * 3 + 1];
      const b = pixels[i * 3 + 2];
      totalLuminance += 0.299 * r + 0.587 * g + 0.114 * b;
    }
    return totalLuminance / pixelCount;
  } catch {
    return null;
  }
}

/**
 * Detect whether a video region is predominantly dark or light.
 * Samples multiple frames across the given time range for robustness
 * (a single frame might be a transition or black screen).
 *
 * Returns the *overlay* theme for contrast: dark video → 'light' overlay,
 * light video → 'dark' overlay. Falls back to 'dark' on error.
 */
export function detectVideoTheme(
  videoPath: string,
  startMs = 0,
  endMs?: number,
): BackgroundTheme {
  // Sample up to 5 frames spread across the range; if no endMs, sample around startMs
  const sampleCount = 5;
  const timestamps: number[] = [];
  if (endMs !== undefined && endMs > startMs) {
    const step = (endMs - startMs) / (sampleCount + 1);
    for (let i = 1; i <= sampleCount; i++) {
      timestamps.push(Math.round(startMs + step * i));
    }
  } else {
    // Single point — sample at start plus small offsets
    timestamps.push(startMs);
    if (startMs > 500) timestamps.push(startMs - 500);
    timestamps.push(startMs + 500);
  }

  const luminances: number[] = [];
  for (const ts of timestamps) {
    const lum = frameLuminance(videoPath, Math.max(0, ts));
    if (lum !== null) luminances.push(lum);
  }

  if (luminances.length === 0) return 'dark';

  const avgLuminance = luminances.reduce((a, b) => a + b, 0) / luminances.length;
  return avgLuminance < 128 ? 'light' : 'dark';
}

/**
 * Extract the two most dominant colors from the edges of a video frame.
 *
 * Samples a frame near the middle of the video, crops thin strips from all
 * four edges, downscales to a tiny resolution, and clusters the pixel colors
 * into two buckets. Returns the two hex colors sorted dark-to-light, suitable
 * for a gradient background that blends with the video content.
 *
 * Returns null on failure (best-effort — caller should fall back to a default).
 */
export function probeEdgeColors(
  videoPath: string,
  timestampMs?: number,
): { color0: string; color1: string } | null {
  try {
    // Probe duration to pick a mid-point frame if no timestamp given
    let ts = timestampMs;
    if (ts === undefined) {
      const durationMs = getVideoDurationMs(videoPath);
      ts = Math.round(durationMs * 0.15); // 15% in — past intro transitions
    }

    const ss = (ts / 1000).toFixed(3);
    // Extract a single frame, aggressively downscale to 16x16 to get dominant colors.
    // The tiny resolution naturally averages out details, leaving only the broad
    // color regions — effectively sampling the whole frame including edges.
    const result = spawnSync('ffmpeg', [
      '-ss', ss,
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', 'scale=16:16:flags=area',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 * 16 * 3 + 4096 });

    if (!result.stdout || result.stdout.length < 16 * 16 * 3) {
      return null;
    }

    const pixels = result.stdout as Buffer;
    const pixelCount = Math.floor(pixels.length / 3);

    // Simple 2-means clustering: start with darkest and lightest pixel
    const colors: Array<[number, number, number]> = [];
    for (let i = 0; i < pixelCount; i++) {
      colors.push([pixels[i * 3], pixels[i * 3 + 1], pixels[i * 3 + 2]]);
    }

    // Sort by luminance, pick darkest and lightest as seeds
    colors.sort((a, b) => {
      const lumA = 0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2];
      const lumB = 0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2];
      return lumA - lumB;
    });

    let c0 = colors[0];
    let c1 = colors[colors.length - 1];

    // Refine with 3 iterations of k-means
    for (let iter = 0; iter < 3; iter++) {
      const sum0 = [0, 0, 0], sum1 = [0, 0, 0];
      let count0 = 0, count1 = 0;
      for (const c of colors) {
        const d0 = (c[0] - c0[0]) ** 2 + (c[1] - c0[1]) ** 2 + (c[2] - c0[2]) ** 2;
        const d1 = (c[0] - c1[0]) ** 2 + (c[1] - c1[1]) ** 2 + (c[2] - c1[2]) ** 2;
        if (d0 <= d1) {
          sum0[0] += c[0]; sum0[1] += c[1]; sum0[2] += c[2]; count0++;
        } else {
          sum1[0] += c[0]; sum1[1] += c[1]; sum1[2] += c[2]; count1++;
        }
      }
      if (count0 > 0) c0 = [Math.round(sum0[0] / count0), Math.round(sum0[1] / count0), Math.round(sum0[2] / count0)];
      if (count1 > 0) c1 = [Math.round(sum1[0] / count1), Math.round(sum1[1] / count1), Math.round(sum1[2] / count1)];
    }

    const toHex = (c: [number, number, number]) =>
      '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');

    // Sort dark-to-light for consistent gradient direction
    const lum0 = 0.299 * c0[0] + 0.587 * c0[1] + 0.114 * c0[2];
    const lum1 = 0.299 * c1[0] + 0.587 * c1[1] + 0.114 * c1[2];
    return lum0 <= lum1
      ? { color0: toHex(c0), color1: toHex(c1) }
      : { color0: toHex(c1), color1: toHex(c0) };
  } catch {
    return null;
  }
}

/**
 * Probe video dimensions (width × height) using ffprobe.
 * Returns { width, height } or null on failure.
 */
export function getVideoDimensions(videoPath: string): { width: number; height: number } | null {
  try {
    const raw = execFileSync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0',
       '-show_entries', 'stream=width,height',
       '-of', 'csv=p=0:s=x', videoPath],
      { encoding: 'utf-8' },
    ).trim();
    const match = raw.match(/^(\d+)x(\d+)$/);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
  } catch {
    return null;
  }
}
