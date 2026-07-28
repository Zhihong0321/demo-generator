import { describe, it, expect } from 'vitest';
import { buildMotionBlurFilter, type CameraMove } from '../src/camera-move.js';

describe('buildMotionBlurFilter', () => {
  const baseMove: CameraMove = {
    startMs: 2000,
    durationMs: 400,
    x: 960,
    y: 540,
    w: 400,
    h: 300,
    scale: 1.5,
    holdMs: 1000,
  };

  it('returns null when intensity is 0', () => {
    expect(buildMotionBlurFilter('[camfinal]', 0)).toBeNull();
  });

  it('returns null when intensity is negative', () => {
    expect(buildMotionBlurFilter('[camfinal]', -0.5)).toBeNull();
  });

  it('builds tblend filter with default intensity', () => {
    const result = buildMotionBlurFilter('[camfinal]');
    expect(result).not.toBeNull();
    expect(result!.outputLabel).toBe('mblur');
    expect(result!.filter).toContain('tblend=all_mode=average:all_opacity=0.50');
    expect(result!.filter).toContain('[camfinal]');
    expect(result!.filter).toContain('[mblur]');
  });

  it('uses custom intensity', () => {
    const result = buildMotionBlurFilter('[camfinal]', 0.8);
    expect(result).not.toBeNull();
    expect(result!.filter).toContain('all_opacity=0.80');
  });

  it('clamps intensity to 1.0 max', () => {
    const result = buildMotionBlurFilter('[camfinal]', 2.0);
    expect(result).not.toBeNull();
    expect(result!.filter).toContain('all_opacity=1.00');
  });

  it('time-gates blur to zoom-in and zoom-out windows when camera moves are provided', () => {
    const result = buildMotionBlurFilter('[camfinal]', 0.5, [baseMove], 30);
    expect(result).not.toBeNull();
    expect(result!.filter).toContain(
      "enable='between(t,1.9667,2.4333)+between(t,3.3667,3.8333)'",
    );
  });

  it('skips static hold intervals when building blur windows', () => {
    const result = buildMotionBlurFilter('[camfinal]', 0.5, [baseMove], 30);
    expect(result).not.toBeNull();
    expect(result!.filter).not.toContain('between(t,2.4000,3.4000)');
  });

  it('returns null when move metadata is present but no blur windows are valid', () => {
    const noZoom: CameraMove = { ...baseMove, scale: 1.0 };
    const result = buildMotionBlurFilter('[camfinal]', 0.5, [noZoom], 30);
    expect(result).toBeNull();
  });
});
