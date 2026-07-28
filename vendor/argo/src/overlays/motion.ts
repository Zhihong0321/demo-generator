import type { MotionPreset } from './types.js';
import { isGsapMotion } from './gsap-motion.js';

/**
 * CSS keyframe rule for a named motion preset. GSAP motions return an empty
 * string — GSAP applies its own inline styles at runtime via `runGsapMotion`.
 */
export function getMotionCSS(motion: MotionPreset, elementId: string): string {
  if (isGsapMotion(motion)) return '';
  const animName = `argo-${motion}-${elementId}`;
  switch (motion) {
    case 'fade-in':
      return `@keyframes ${animName} { from { opacity: 0; } to { opacity: 1; } }`;
    case 'slide-in':
      return `@keyframes ${animName} { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }`;
    case 'none':
    default:
      return '';
  }
}

export function getMotionStyles(motion: MotionPreset, elementId: string): Record<string, string> {
  if (isGsapMotion(motion)) return {};
  const animName = `argo-${motion}-${elementId}`;
  switch (motion) {
    case 'fade-in':
      return { animation: `${animName} 300ms ease-out forwards` };
    case 'slide-in':
      return { animation: `${animName} 400ms ease-out forwards` };
    case 'none':
    default:
      return {};
  }
}
