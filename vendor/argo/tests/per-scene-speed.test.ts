import { describe, expect, it } from 'vitest';
import {
  applySpeedRampToTimeline,
  computeSegments,
  type SceneSpeedMap,
} from '../src/speed-ramp.js';

describe('per-scene playback speed', () => {
  it('applies per-scene speed overrides without gap speed', () => {
    const sceneSpeeds: SceneSpeedMap = { intro: 0.5 };
    const segments = computeSegments(
      [
        { scene: 'intro', startMs: 0, endMs: 2000 },
        { scene: 'main', startMs: 2000, endMs: 4000 },
      ],
      4000,
      { gapSpeed: 1.0 },
      sceneSpeeds,
    );

    // intro at 0.5x, main at 1.0x
    expect(segments).toEqual([
      { startMs: 0, endMs: 2000, speed: 0.5 },
      { startMs: 2000, endMs: 4000, speed: 1.0 },
    ]);
  });

  it('combines gap speed with per-scene speed', () => {
    const sceneSpeeds: SceneSpeedMap = { outro: 2.0 };
    const segments = computeSegments(
      [
        { scene: 'intro', startMs: 1000, endMs: 2000 },
        { scene: 'outro', startMs: 4000, endMs: 5000 },
      ],
      6000,
      { gapSpeed: 3.0, minGapMs: 500 },
      sceneSpeeds,
    );

    expect(segments).toEqual([
      { startMs: 0, endMs: 1000, speed: 3.0 },     // gap sped up
      { startMs: 1000, endMs: 2000, speed: 1.0 },   // intro at normal
      { startMs: 2000, endMs: 4000, speed: 3.0 },   // gap sped up
      { startMs: 4000, endMs: 5000, speed: 2.0 },   // outro at 2x
      { startMs: 5000, endMs: 6000, speed: 3.0 },   // trailing gap
    ]);
  });

  it('returns empty segments when no speed changes needed', () => {
    const sceneSpeeds: SceneSpeedMap = { intro: 1.0 };
    const segments = computeSegments(
      [{ scene: 'intro', startMs: 0, endMs: 2000 }],
      2000,
      { gapSpeed: 1.0 },
      sceneSpeeds,
    );

    // All speeds are 1.0 — all segments are normal
    expect(segments.every((s) => s.speed === 1.0)).toBe(true);
  });

  it('applySpeedRampToTimeline works with scene speeds only (no gap ramp config)', () => {
    const sceneSpeeds: SceneSpeedMap = { intro: 2.0 };
    const plan = applySpeedRampToTimeline(
      [
        { scene: 'intro', startMs: 0, endMs: 2000 },
        { scene: 'main', startMs: 2000, endMs: 4000 },
      ],
      4000,
      undefined, // no speedRamp config
      sceneSpeeds,
    );

    // With intro at 2x, its duration halves: 1000ms instead of 2000ms
    expect(plan.segments.length).toBeGreaterThan(0);
    expect(plan.totalDurationMs).toBe(3000); // 1000 (intro at 2x) + 2000 (main at 1x)
    // Remapped placements
    expect(plan.placements[0].scene).toBe('intro');
    expect(plan.placements[0].startMs).toBe(0);
    expect(plan.placements[0].endMs).toBe(1000);
    expect(plan.placements[1].scene).toBe('main');
    expect(plan.placements[1].startMs).toBe(1000);
    expect(plan.placements[1].endMs).toBe(3000);
  });

  it('applySpeedRampToTimeline returns unchanged when sceneSpeeds are all 1.0', () => {
    const plan = applySpeedRampToTimeline(
      [{ scene: 'intro', startMs: 0, endMs: 2000 }],
      2000,
      undefined,
      { intro: 1.0 },
    );

    expect(plan.segments).toEqual([]);
    expect(plan.totalDurationMs).toBe(2000);
  });
});
