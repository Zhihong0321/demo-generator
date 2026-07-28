import { describe, it, expect } from 'vitest';
import {
  isGsapMotion,
  isValidGsapEase,
  isValidGsapVarKey,
  validateGsapMotion,
  tweenWallMs,
  GSAP_EASES,
  GSAP_VAR_KEYS,
} from '../../src/overlays/gsap-motion.js';
import { getMotionCSS, getMotionStyles } from '../../src/overlays/motion.js';
import type { GsapMotion } from '../../src/overlays/gsap-motion.js';

describe('isGsapMotion', () => {
  it('returns true for well-formed GsapMotion objects', () => {
    expect(isGsapMotion({ type: 'gsap', in: { to: { opacity: 1 } } })).toBe(true);
  });
  it('returns false for string presets and other values', () => {
    expect(isGsapMotion('fade-in')).toBe(false);
    expect(isGsapMotion('none')).toBe(false);
    expect(isGsapMotion(null)).toBe(false);
    expect(isGsapMotion(undefined)).toBe(false);
    expect(isGsapMotion({ type: 'other' })).toBe(false);
  });
});

describe('isValidGsapEase', () => {
  it('accepts every whitelisted ease', () => {
    for (const ease of GSAP_EASES) {
      expect(isValidGsapEase(ease)).toBe(true);
    }
  });
  it('rejects unknown eases', () => {
    expect(isValidGsapEase('wobble.out')).toBe(false);
    expect(isValidGsapEase('')).toBe(false);
  });
});

describe('isValidGsapVarKey', () => {
  it('accepts known var keys', () => {
    for (const key of GSAP_VAR_KEYS) {
      expect(isValidGsapVarKey(key)).toBe(true);
    }
  });
  it('rejects unknown keys (including GSAP props not in the whitelist)', () => {
    expect(isValidGsapVarKey('onComplete')).toBe(false);
    expect(isValidGsapVarKey('ease')).toBe(false);
    expect(isValidGsapVarKey('__proto__')).toBe(false);
  });
});

describe('validateGsapMotion', () => {
  it('accepts a minimal entrance motion', () => {
    const motion: GsapMotion = {
      type: 'gsap',
      in: { from: { opacity: 0, y: 20 }, duration: 0.4, ease: 'power2.out' },
    };
    expect(validateGsapMotion(motion)).toEqual([]);
  });

  it('requires at least one phase', () => {
    const errors = validateGsapMotion({ type: 'gsap' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('at least one');
  });

  it('requires each tween to have from/to/fromTo', () => {
    const errors = validateGsapMotion({ type: 'gsap', in: { duration: 0.4 } });
    expect(errors.some((e) => e.path === 'in')).toBe(true);
  });

  it('rejects unknown eases', () => {
    const errors = validateGsapMotion({
      type: 'gsap',
      in: { to: { opacity: 1 }, ease: 'wobble.out' as never },
    });
    expect(errors.some((e) => e.path === 'in.ease')).toBe(true);
  });

  it('rejects unknown var keys', () => {
    const errors = validateGsapMotion({
      type: 'gsap',
      in: { to: { opacity: 1, onComplete: 1 as never } as never },
    });
    expect(errors.some((e) => e.path === 'in.to.onComplete')).toBe(true);
  });

  it('rejects negative duration', () => {
    const errors = validateGsapMotion({
      type: 'gsap',
      in: { to: { opacity: 1 }, duration: -1 },
    });
    expect(errors.some((e) => e.path === 'in.duration')).toBe(true);
  });

  it('rejects raw motion by default', () => {
    const errors = validateGsapMotion({ type: 'gsap', raw: "gsap.to(root, { opacity: 1 })" });
    expect(errors.some((e) => e.path === 'raw')).toBe(true);
  });

  it('accepts raw motion when allowRaw=true', () => {
    const errors = validateGsapMotion(
      { type: 'gsap', raw: "gsap.to(root, { opacity: 1 })" },
      { allowRaw: true },
    );
    expect(errors).toEqual([]);
  });

  it('validates fromTo shape', () => {
    const errors = validateGsapMotion({
      type: 'gsap',
      in: { fromTo: { from: { opacity: 0 } } as never, duration: 0.3 },
    });
    expect(errors.some((e) => e.path === 'in.fromTo')).toBe(true);
  });
});

describe('tweenWallMs', () => {
  it('returns 0 for undefined', () => {
    expect(tweenWallMs(undefined)).toBe(0);
  });
  it('defaults duration to 0.4s', () => {
    expect(tweenWallMs({ to: { opacity: 1 } })).toBe(400);
  });
  it('adds delay to duration', () => {
    expect(tweenWallMs({ to: { opacity: 1 }, duration: 0.5, delay: 0.2 })).toBe(700);
  });
});

describe('motion.ts GSAP passthrough', () => {
  it('getMotionCSS returns empty string for GsapMotion', () => {
    const motion: GsapMotion = { type: 'gsap', in: { to: { opacity: 1 } } };
    expect(getMotionCSS(motion, 'argo-overlay-bottom-center')).toBe('');
  });
  it('getMotionStyles returns empty object for GsapMotion', () => {
    const motion: GsapMotion = { type: 'gsap', in: { to: { opacity: 1 } } };
    expect(getMotionStyles(motion, 'argo-overlay-bottom-center')).toEqual({});
  });
});
