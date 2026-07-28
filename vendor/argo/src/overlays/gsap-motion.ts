/**
 * GSAP-driven overlay motion. Declarative subset of GSAP tweens with an opt-in
 * `raw` escape hatch. Types live here; the browser-side runtime lives in
 * `gsap-runtime.ts`.
 */

export const GSAP_EASES = [
  'none', 'linear',
  'power1.in', 'power1.out', 'power1.inOut',
  'power2.in', 'power2.out', 'power2.inOut',
  'power3.in', 'power3.out', 'power3.inOut',
  'power4.in', 'power4.out', 'power4.inOut',
  'back.in', 'back.out', 'back.inOut',
  'elastic.in', 'elastic.out', 'elastic.inOut',
  'bounce.in', 'bounce.out', 'bounce.inOut',
  'expo.in', 'expo.out', 'expo.inOut',
  'circ.in', 'circ.out', 'circ.inOut',
  'sine.in', 'sine.out', 'sine.inOut',
] as const;

export type GsapEase = (typeof GSAP_EASES)[number];

export const GSAP_VAR_KEYS = [
  'x', 'y', 'z',
  'scale', 'scaleX', 'scaleY',
  'rotation', 'rotationX', 'rotationY',
  'skewX', 'skewY',
  'opacity',
  'filter',
  'width', 'height',
  'top', 'left', 'right', 'bottom',
  'background', 'backgroundColor', 'color',
  'borderRadius',
  'transformOrigin',
] as const;

export type GsapVarKey = (typeof GSAP_VAR_KEYS)[number];

// Loose value typing — GSAP accepts strings like "+=10" and raw numbers on the
// same prop. Validator restricts keys; values are passed through to GSAP.
export type GsapVars = Partial<Record<GsapVarKey, string | number>>;

export interface GsapTween {
  from?: GsapVars;
  to?: GsapVars;
  fromTo?: { from: GsapVars; to: GsapVars };
  /** Seconds. Default 0.4. */
  duration?: number;
  /** Seconds. */
  delay?: number;
  ease?: GsapEase;
  /** Seconds — stagger between elements when `target` matches multiple. */
  stagger?: number;
  /** CSS selector inside the overlay container. Default: the container itself. */
  target?: string;
  /** Only meaningful for `loop`. Use -1 for infinite. */
  repeat?: number;
  /** Only meaningful for `loop`. */
  yoyo?: boolean;
}

export interface GsapMotion {
  type: 'gsap';
  in?: GsapTween;
  out?: GsapTween;
  loop?: GsapTween;
  /** Raw GSAP code. Gated by config `overlays.allowRawGsap`. Executed as
   *  `new Function('gsap', 'root', raw)` against the overlay container. */
  raw?: string;
}

export function isGsapMotion(motion: unknown): motion is GsapMotion {
  return (
    typeof motion === 'object' &&
    motion !== null &&
    (motion as { type?: unknown }).type === 'gsap'
  );
}

export function isValidGsapEase(value: string): value is GsapEase {
  return (GSAP_EASES as readonly string[]).includes(value);
}

export function isValidGsapVarKey(value: string): value is GsapVarKey {
  return (GSAP_VAR_KEYS as readonly string[]).includes(value);
}

export interface GsapValidationError {
  path: string;
  message: string;
}

export interface GsapValidateOptions {
  allowRaw?: boolean;
}

/** Validate a GsapMotion. Returns an array of errors; empty array means OK. */
export function validateGsapMotion(
  motion: GsapMotion,
  opts: GsapValidateOptions = {},
): GsapValidationError[] {
  const errors: GsapValidationError[] = [];
  const allowRaw = opts.allowRaw ?? false;

  if (motion.raw !== undefined) {
    if (typeof motion.raw !== 'string') {
      errors.push({ path: 'raw', message: 'motion.raw must be a string.' });
    } else if (!allowRaw) {
      errors.push({
        path: 'raw',
        message: 'motion.raw is disabled. Set `overlays.allowRawGsap: true` in argo.config.mjs to enable.',
      });
    }
  }

  for (const phase of ['in', 'out', 'loop'] as const) {
    const tween = motion[phase];
    if (tween === undefined) continue;
    validateTween(tween, phase, errors);
  }

  if (!motion.in && !motion.out && !motion.loop && !motion.raw) {
    errors.push({
      path: '',
      message: 'motion must define at least one of `in`, `out`, `loop`, or `raw`.',
    });
  }

  return errors;
}

function validateTween(
  tween: GsapTween,
  path: string,
  errors: GsapValidationError[],
): void {
  if (tween.duration !== undefined && (typeof tween.duration !== 'number' || tween.duration < 0)) {
    errors.push({ path: `${path}.duration`, message: 'must be a non-negative number (seconds).' });
  }
  if (tween.delay !== undefined && typeof tween.delay !== 'number') {
    errors.push({ path: `${path}.delay`, message: 'must be a number (seconds).' });
  }
  if (tween.ease !== undefined && !isValidGsapEase(tween.ease)) {
    errors.push({
      path: `${path}.ease`,
      message: `unknown ease "${tween.ease}". See GSAP_EASES for allowed values.`,
    });
  }
  if (tween.stagger !== undefined && typeof tween.stagger !== 'number') {
    errors.push({ path: `${path}.stagger`, message: 'must be a number.' });
  }
  if (tween.target !== undefined && typeof tween.target !== 'string') {
    errors.push({ path: `${path}.target`, message: 'must be a CSS selector string.' });
  }
  if (tween.repeat !== undefined && typeof tween.repeat !== 'number') {
    errors.push({ path: `${path}.repeat`, message: 'must be a number (-1 for infinite).' });
  }
  if (tween.yoyo !== undefined && typeof tween.yoyo !== 'boolean') {
    errors.push({ path: `${path}.yoyo`, message: 'must be a boolean.' });
  }

  const hasFrom = !!tween.from;
  const hasTo = !!tween.to;
  const hasFromTo = !!tween.fromTo;
  if (!hasFrom && !hasTo && !hasFromTo) {
    errors.push({
      path,
      message: 'tween must specify at least one of `from`, `to`, or `fromTo`.',
    });
  }

  if (tween.from) validateVars(tween.from, `${path}.from`, errors);
  if (tween.to) validateVars(tween.to, `${path}.to`, errors);
  if (tween.fromTo) {
    if (!tween.fromTo.from || !tween.fromTo.to) {
      errors.push({ path: `${path}.fromTo`, message: 'must have both `from` and `to` keys.' });
    } else {
      validateVars(tween.fromTo.from, `${path}.fromTo.from`, errors);
      validateVars(tween.fromTo.to, `${path}.fromTo.to`, errors);
    }
  }
}

function validateVars(
  vars: GsapVars,
  path: string,
  errors: GsapValidationError[],
): void {
  for (const key of Object.keys(vars)) {
    if (!isValidGsapVarKey(key)) {
      errors.push({
        path: `${path}.${key}`,
        message: `unknown var "${key}". Allowed: ${GSAP_VAR_KEYS.join(', ')}.`,
      });
    }
  }
}

/** Compute the seconds a tween will occupy on the wall clock (duration + delay). */
export function tweenWallMs(tween: GsapTween | undefined): number {
  if (!tween) return 0;
  const duration = tween.duration ?? 0.4;
  const delay = tween.delay ?? 0;
  return Math.max(0, (duration + delay) * 1000);
}
