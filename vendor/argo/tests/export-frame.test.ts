import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('../src/progress.js', () => ({
  runFfmpegWithProgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/gpu-encoder.js', () => ({
  detectGpuEncoder: vi.fn().mockResolvedValue(null),
  getGpuEncoderName: vi.fn((enc: string | null, _codec: string) => enc ? `h264_${enc}` : 'libx264'),
  isGpuEncodingEnabled: vi.fn().mockReturnValue(true),
  resolveEncoder: vi.fn().mockResolvedValue(null),
}));

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { exportVideo } from '../src/export.js';

const mockedExecFileSync = vi.mocked(execFileSync);
const mockedSpawnSync = vi.mocked(spawnSync);
const mockedExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.resetAllMocks();
});

function setupHappy() {
  mockedExecFileSync.mockImplementation((cmd, args) => {
    if (cmd === 'ffprobe') {
      return '25/1' as any;
    }
    return Buffer.from('ok') as any;
  });
  mockedExistsSync.mockImplementation((p) => {
    const path = String(p);
    if (path.includes('.imported')) return false;
    return true;
  });
  mockedSpawnSync.mockReturnValue({ status: 0 } as any);
}

describe('exportVideo with frame', () => {
  it('adds frame filter_complex when frame config is provided', async () => {
    setupHappy();
    await exportVideo({
      demoName: 'demo',
      argoDir: '.argo',
      outputDir: 'out',
      outputWidth: 1920,
      outputHeight: 1080,
      frame: { padding: 40, borderRadius: 12, shadow: 0.5 },
    });

    const [, args] = mockedSpawnSync.mock.calls[0];
    const a = args as string[];
    expect(a).toContain('-filter_complex');
    const fcIdx = a.indexOf('-filter_complex');
    const fc = a[fcIdx + 1];
    // Should contain frame filter parts
    expect(fc).toContain('frm_scaled');
    expect(fc).toContain('frm_rounded');
    expect(fc).toContain('frm_out');
    expect(fc).toContain('color=c=#000000');
  });

  it('adds background image input when frame uses image background', async () => {
    setupHappy();
    await exportVideo({
      demoName: 'demo',
      argoDir: '.argo',
      outputDir: 'out',
      outputWidth: 1920,
      outputHeight: 1080,
      frame: {
        padding: 40,
        background: { type: 'image', value: 'assets/bg.jpg' },
      },
    });

    const [, args] = mockedSpawnSync.mock.calls[0];
    const a = args as string[];
    expect(a).toContain('assets/bg.jpg');
  });
});

describe('exportVideo with motionBlur', () => {
  it('does not add motion blur without camera moves', async () => {
    setupHappy();
    await exportVideo({
      demoName: 'demo',
      argoDir: '.argo',
      outputDir: 'out',
      motionBlur: true,
    });

    const [, args] = mockedSpawnSync.mock.calls[0];
    const a = args as string[];
    // No filter_complex since no camera moves
    const fc = a.includes('-filter_complex') ? a[a.indexOf('-filter_complex') + 1] : '';
    expect(fc).not.toContain('tblend');
  });

  it('time-gates motion blur when camera moves are present', async () => {
    setupHappy();
    await exportVideo({
      demoName: 'demo',
      argoDir: '.argo',
      outputDir: 'out',
      motionBlur: { intensity: 0.4 },
      cameraMoves: [
        {
          startMs: 2000,
          durationMs: 400,
          x: 960,
          y: 540,
          w: 400,
          h: 300,
          scale: 1.5,
          holdMs: 1000,
        },
      ],
      outputWidth: 1920,
      outputHeight: 1080,
    });

    const [, args] = mockedSpawnSync.mock.calls[0];
    const a = args as string[];
    const fc = a[a.indexOf('-filter_complex') + 1];
    expect(fc).toContain('tblend=all_mode=average:all_opacity=0.40');
    expect(fc).toContain("enable='between(t,1.9600,2.4400)+between(t,3.3600,3.8400)'");
  });
});
