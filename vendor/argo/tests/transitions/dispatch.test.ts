import { describe, it, expect } from 'vitest';
import { buildTransitionFilters } from '../../src/transitions.js';

describe('buildTransitionFilters — shader dispatch', () => {
  it('returns shaderDeferred marker when transition type is shader', () => {
    const result = buildTransitionFilters(
      [
        { scene: 's1', startMs: 0, endMs: 2000 },
        { scene: 's2', startMs: 2000, endMs: 4000 },
      ],
      { type: 'shader', shader: 'crosswarp', durationMs: 800 },
      true,
      30,
    );
    expect(result).toEqual({ shaderDeferred: true });
  });

  it('still handles fade-through-black normally', () => {
    const result = buildTransitionFilters(
      [
        { scene: 's1', startMs: 0, endMs: 2000 },
        { scene: 's2', startMs: 2000, endMs: 4000 },
      ],
      { type: 'fade-through-black', durationMs: 500 },
      true,
      30,
    );
    expect(typeof result === 'object' && 'filterComplex' in result).toBe(true);
  });
});
