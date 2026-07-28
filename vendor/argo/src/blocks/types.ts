import type { TemplateResult } from '../overlays/templates.js';
import type { BackgroundTheme } from '../overlays/zones.js';
import type { MotionPreset } from '../overlays/types.js';

export interface BlockDefinition<P extends Record<string, unknown> = Record<string, unknown>> {
  /** Stable id (matches directory name). */
  id: string;
  /** Semver string, used for future migration decisions. */
  version: string;
  /** Default prop values applied when the cue omits them. */
  defaultProps: P;
  /** Render a block into a TemplateResult consumed by the existing overlay pipeline. */
  render: (props: P, theme: BackgroundTheme) => TemplateResult;
  /** Optional default motion applied when the cue omits `motion`. Override per-cue. */
  defaultMotion?: MotionPreset;
}
