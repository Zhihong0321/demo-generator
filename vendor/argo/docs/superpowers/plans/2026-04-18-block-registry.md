# Block Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 5 bundled overlay blocks (`x-post`, `macos-notification`, `yt-lower-third`, `data-chart`, `spotify-card`) with a registry designed to be extraction-ready for a future `argo add` command.

**Architecture:** Each block lives in `src/blocks/<name>/` with a `template.ts` exporting a `BlockDefinition` and a `block.json` metadata file. A barrel at `src/blocks/index.ts` populates `BLOCK_REGISTRY` as a const-typed object so `BlockName` becomes a literal union. A new `CustomBlockCue` variant in `OverlayCue` lets authors reference blocks from `.scenes.json`. `renderTemplate()` gets one new case that looks up the block and delegates to its render function — no other overlay plumbing changes.

**Tech Stack:** TypeScript (strict, ESM, ES2022), vitest for unit tests, Playwright for the e2e demo, existing overlay/templates pipeline.

**Spec:** `docs/superpowers/specs/2026-04-18-block-registry-and-shader-transitions-design.md`

---

## File Structure

**Create:**
- `src/blocks/types.ts` — `BlockDefinition<P>`, `BlockName`
- `src/blocks/index.ts` — `BLOCK_REGISTRY` barrel, `getBlock()`, `isValidBlockName()`
- `src/blocks/x-post/block.json`
- `src/blocks/x-post/template.ts`
- `src/blocks/macos-notification/block.json`
- `src/blocks/macos-notification/template.ts`
- `src/blocks/yt-lower-third/block.json`
- `src/blocks/yt-lower-third/template.ts`
- `src/blocks/data-chart/block.json`
- `src/blocks/data-chart/template.ts`
- `src/blocks/spotify-card/block.json`
- `src/blocks/spotify-card/template.ts`
- `tests/blocks/blocks.test.ts`
- `demos/blocks-showcase.demo.ts`
- `demos/blocks-showcase.scenes.json`

**Modify:**
- `src/overlays/types.ts` — add `CustomBlockCue` to union, export block name type
- `src/overlays/templates.ts` — add `case 'block':` in `renderTemplate` switch
- `src/validate.ts:56` — accept `'block'` in `validTypes`, validate `block` field against registry
- `skills/argo-guide/SKILL.md` — document block usage
- `README.md` — document block usage + screenshot
- `CLAUDE.md` — add block registry note in "Overlays" section

---

## Task 1: Block registry scaffolding (types + empty barrel)

**Files:**
- Create: `src/blocks/types.ts`
- Create: `src/blocks/index.ts`
- Create: `tests/blocks/blocks.test.ts`

- [ ] **Step 1: Write the failing registry test**

```typescript
// tests/blocks/blocks.test.ts
import { describe, it, expect } from 'vitest';
import { BLOCK_REGISTRY, isValidBlockName, getBlock } from '../../src/blocks/index.js';

describe('block registry', () => {
  it('exposes a frozen registry object', () => {
    expect(Object.isFrozen(BLOCK_REGISTRY)).toBe(true);
  });

  it('isValidBlockName returns false for unknown names', () => {
    expect(isValidBlockName('nonexistent-block')).toBe(false);
  });

  it('getBlock throws for unknown names', () => {
    expect(() => getBlock('nonexistent-block' as never)).toThrow(/unknown block/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/blocks/blocks.test.ts`
Expected: FAIL — `Cannot find module '../../src/blocks/index.js'`

- [ ] **Step 3: Create types.ts**

```typescript
// src/blocks/types.ts
import type { TemplateResult } from '../overlays/templates.js';
import type { BackgroundTheme } from '../overlays/zones.js';

export interface BlockDefinition<P extends Record<string, unknown> = Record<string, unknown>> {
  /** Stable id (matches directory name). */
  id: string;
  /** Semver string, used for future migration decisions. */
  version: string;
  /** Default prop values applied when the cue omits them. */
  defaultProps: P;
  /** Render a block into a TemplateResult consumed by the existing overlay pipeline. */
  render: (props: P, theme: BackgroundTheme) => TemplateResult;
}
```

- [ ] **Step 4: Create the empty barrel**

```typescript
// src/blocks/index.ts
import type { BlockDefinition } from './types.js';

/**
 * Compile-time registry. Each block is a self-contained folder under
 * `src/blocks/<name>/`. To add a block, import it here and add it to
 * the registry below — `BlockName` auto-expands via `keyof typeof`.
 *
 * Using `as const satisfies` gives us a literal-union `BlockName` type
 * while still enforcing that every entry conforms to `BlockDefinition`.
 */
export const BLOCK_REGISTRY = {
  // Populated in subsequent tasks.
} as const satisfies Record<string, BlockDefinition>;

Object.freeze(BLOCK_REGISTRY);

export type BlockName = keyof typeof BLOCK_REGISTRY;

export function isValidBlockName(name: string): name is BlockName {
  return Object.prototype.hasOwnProperty.call(BLOCK_REGISTRY, name);
}

export function getBlock<N extends BlockName>(name: N): (typeof BLOCK_REGISTRY)[N] {
  if (!isValidBlockName(name)) {
    throw new Error(`Unknown block: "${name}". Known blocks: ${Object.keys(BLOCK_REGISTRY).join(', ')}`);
  }
  return BLOCK_REGISTRY[name];
}

export type { BlockDefinition } from './types.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/blocks/blocks.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run build`
Expected: tsc exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/blocks tests/blocks
git -c commit.gpgsign=false commit -m "feat(blocks): scaffold block registry types and barrel"
```

---

## Task 2: Extend OverlayCue union with CustomBlockCue

**Files:**
- Modify: `src/overlays/types.ts`

- [ ] **Step 1: Write the failing type test**

Append to `tests/blocks/blocks.test.ts`:

```typescript
import type { OverlayCue } from '../../src/overlays/types.js';

describe('CustomBlockCue', () => {
  it('accepts type="block" in OverlayCue union', () => {
    // Compile-time check: this assignment is the test.
    const cue: OverlayCue = {
      type: 'block',
      block: 'x-post' as never, // real name will exist after Task 3
      props: { handle: '@test' },
    };
    expect(cue.type).toBe('block');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL — `Type '"block"' is not assignable to type ...`

- [ ] **Step 3: Add CustomBlockCue to OverlayCue**

In `src/overlays/types.ts`, add after the `ArrowCue` interface:

```typescript
export interface CustomBlockCue {
  type: 'block';
  /** Block id — must exist in BLOCK_REGISTRY. */
  block: string;
  /** Block-specific props. Shape is validated per-block at render time. */
  props: Record<string, unknown>;
  placement?: Zone;
  motion?: MotionPreset;
  autoBackground?: boolean;
}
```

Change the `OverlayCue` union to include it:

```typescript
export type OverlayCue =
  | LowerThirdCue
  | HeadlineCardCue
  | CalloutCue
  | ImageCardCue
  | ArrowCue
  | CustomBlockCue;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/blocks/blocks.test.ts`
Expected: tsc exits 0, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/overlays/types.ts tests/blocks/blocks.test.ts
git -c commit.gpgsign=false commit -m "feat(overlays): add CustomBlockCue variant to OverlayCue union"
```

---

## Task 3: First block (x-post) + wire into renderTemplate

**Files:**
- Create: `src/blocks/x-post/block.json`
- Create: `src/blocks/x-post/template.ts`
- Modify: `src/blocks/index.ts`
- Modify: `src/overlays/templates.ts`

- [ ] **Step 1: Write the failing block render test**

Append to `tests/blocks/blocks.test.ts`:

```typescript
import { renderTemplate } from '../../src/overlays/templates.js';

describe('x-post block', () => {
  it('renders handle, name, and body', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'x-post',
      props: {
        handle: '@jane',
        name: 'Jane Doe',
        body: 'this is exactly what I needed',
        timestamp: '2m',
      },
    }, 'dark');

    expect(result.contentHtml).toContain('Jane Doe');
    expect(result.contentHtml).toContain('@jane');
    expect(result.contentHtml).toContain('this is exactly what I needed');
    expect(result.contentHtml).toContain('2m');
  });

  it('escapes HTML in user-provided fields', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'x-post',
      props: {
        handle: '@x',
        name: '<script>alert(1)</script>',
        body: 'ok',
        timestamp: 'now',
      },
    }, 'dark');
    expect(result.contentHtml).not.toContain('<script>');
    expect(result.contentHtml).toContain('&lt;script&gt;');
  });

  it('applies defaults for missing optional props', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'x-post',
      props: { handle: '@x', name: 'X', body: 'hi' },
    }, 'dark');
    expect(result.contentHtml).toContain('X');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/blocks/blocks.test.ts`
Expected: FAIL — renderTemplate throws because `case 'block'` is missing.

- [ ] **Step 3: Create block.json**

```json
// src/blocks/x-post/block.json
{
  "id": "x-post",
  "version": "1.0.0",
  "description": "Social post card mimicking X/Twitter styling — for social proof narrative inserts.",
  "tags": ["social", "narrative"],
  "props": {
    "handle": { "type": "string", "required": true, "example": "@jane" },
    "name": { "type": "string", "required": true, "example": "Jane Doe" },
    "body": { "type": "string", "required": true, "example": "this is exactly what I needed" },
    "timestamp": { "type": "string", "required": false, "default": "now", "example": "2m" },
    "avatar": { "type": "string", "required": false, "description": "URL or data URI" },
    "verified": { "type": "boolean", "required": false, "default": false }
  }
}
```

- [ ] **Step 4: Create template.ts**

```typescript
// src/blocks/x-post/template.ts
import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';

export interface XPostProps {
  handle: string;
  name: string;
  body: string;
  timestamp?: string;
  avatar?: string;
  verified?: boolean;
  [key: string]: unknown;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render(props: XPostProps, theme: BackgroundTheme): TemplateResult {
  const isDark = theme === 'dark';
  const bg = isDark ? '#15202b' : '#ffffff';
  const fg = isDark ? '#e7e9ea' : '#0f1419';
  const muted = isDark ? '#71767b' : '#536471';

  const avatarHtml = props.avatar
    ? `<img src="${escapeHtml(props.avatar)}" alt="" style="width:40px;height:40px;border-radius:50%;flex:none" />`
    : `<div style="width:40px;height:40px;border-radius:50%;flex:none;background:${muted};display:flex;align-items:center;justify-content:center;color:${bg};font-weight:700;font-size:16px">${escapeHtml(props.name.charAt(0).toUpperCase())}</div>`;

  const verifiedHtml = props.verified
    ? `<svg viewBox="0 0 24 24" width="16" height="16" style="fill:#1d9bf0;margin-left:2px;flex:none"><path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"/></svg>`
    : '';

  const timestamp = props.timestamp ?? 'now';

  return {
    contentHtml: `
      <div style="display:flex;gap:12px;align-items:flex-start">
        ${avatarHtml}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:2px;line-height:1.2">
            <span style="font-weight:700;color:${fg}">${escapeHtml(props.name)}</span>
            ${verifiedHtml}
            <span style="color:${muted};margin-left:6px">${escapeHtml(props.handle)}</span>
            <span style="color:${muted};margin:0 4px">·</span>
            <span style="color:${muted}">${escapeHtml(timestamp)}</span>
          </div>
          <div style="color:${fg};font-size:15px;line-height:1.4;margin-top:4px;word-wrap:break-word">${escapeHtml(props.body)}</div>
        </div>
      </div>
    `.trim(),
    styles: {
      background: bg,
      color: fg,
      padding: '14px 16px',
      borderRadius: '14px',
      border: isDark ? '1px solid #2f3336' : '1px solid #eff3f4',
      maxWidth: '380px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(0,0,0,0.08)',
    },
  };
}

export const xPostBlock: BlockDefinition<XPostProps> = {
  id: 'x-post',
  version: '1.0.0',
  defaultProps: {
    handle: '@user',
    name: 'User',
    body: '',
    timestamp: 'now',
    verified: false,
  },
  render,
};
```

- [ ] **Step 5: Register in barrel**

Modify `src/blocks/index.ts` — replace the empty `BLOCK_REGISTRY` with:

```typescript
import { xPostBlock } from './x-post/template.js';

export const BLOCK_REGISTRY = {
  'x-post': xPostBlock,
} as const satisfies Record<string, BlockDefinition>;

Object.freeze(BLOCK_REGISTRY);
```

(`BlockName`, `isValidBlockName`, `getBlock` declarations stay as-is.)

- [ ] **Step 6: Wire renderTemplate dispatch**

In `src/overlays/templates.ts`, add imports at top:

```typescript
import { getBlock, isValidBlockName } from '../blocks/index.js';
```

Add a new case to the `switch` in `renderTemplate`:

```typescript
    case 'block': {
      if (!isValidBlockName(cue.block)) {
        throw new Error(
          `Overlay references unknown block "${cue.block}". ` +
          `Check the block name against src/blocks/ or run \`argo validate <demo>\`.`,
        );
      }
      const block = getBlock(cue.block);
      // Merge defaults under user-provided props so missing fields fill in.
      const merged = { ...block.defaultProps, ...cue.props };
      return block.render(merged as never, theme);
    }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/blocks/blocks.test.ts`
Expected: all tests pass (registry + union + 3 x-post tests).

- [ ] **Step 8: Full build + test suite regression check**

Run: `npm run build && npm test -- --run`
Expected: tsc exits 0; no previously passing tests have regressed.

- [ ] **Step 9: Commit**

```bash
git add src/blocks src/overlays/templates.ts tests/blocks
git -c commit.gpgsign=false commit -m "feat(blocks): add x-post block and wire into renderTemplate"
```

---

## Task 4: Update validate.ts to accept blocks

**Files:**
- Modify: `src/validate.ts:56-82`
- Modify: `tests/validate.test.ts`

**Note:** `src/validate.ts:56` currently hardcodes `['lower-third', 'headline-card', 'callout', 'image-card']` — missing `'arrow'` (pre-existing bug) and `'block'`. This task fixes both by sourcing valid types from the TypeScript enum.

- [ ] **Step 1: Write the failing validation test**

Append to `tests/validate.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateDemo } from '../src/validate.js';

describe('validate — block cues', () => {
  let tmp: string;
  let demosDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'argo-validate-blocks-'));
    demosDir = join(tmp, 'demos');
    mkdirSync(demosDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('accepts type="block" when the block exists', () => {
    writeFileSync(join(demosDir, 'd.demo.ts'), `narration.mark('s1');`);
    writeFileSync(join(demosDir, 'd.scenes.json'), JSON.stringify([
      { scene: 's1', overlay: { type: 'block', block: 'x-post', props: {} } },
    ]));
    const res = validateDemo({ demoName: 'd', demosDir });
    expect(res.errors).toEqual([]);
  });

  it('rejects unknown block names', () => {
    writeFileSync(join(demosDir, 'd.demo.ts'), `narration.mark('s1');`);
    writeFileSync(join(demosDir, 'd.scenes.json'), JSON.stringify([
      { scene: 's1', overlay: { type: 'block', block: 'nonexistent', props: {} } },
    ]));
    const res = validateDemo({ demoName: 'd', demosDir });
    expect(res.errors.some(e => /unknown block "nonexistent"/.test(e))).toBe(true);
  });

  it('accepts type="arrow" (regression: was missing from validTypes)', () => {
    writeFileSync(join(demosDir, 'd.demo.ts'), `narration.mark('s1');`);
    writeFileSync(join(demosDir, 'd.scenes.json'), JSON.stringify([
      { scene: 's1', overlay: { type: 'arrow', direction: 'down' } },
    ]));
    const res = validateDemo({ demoName: 'd', demosDir });
    expect(res.errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/validate.test.ts`
Expected: FAIL on the block and arrow cases.

- [ ] **Step 3: Update validate.ts**

In `src/validate.ts`, replace the hardcoded `validTypes` set (line ~56) with:

```typescript
        const validTypes = new Set(['lower-third', 'headline-card', 'callout', 'image-card', 'arrow', 'block']);
```

Replace the overlay validation block (lines ~69-82) with:

```typescript
          // Validate overlay sub-object if present
          if (entry.overlay) {
            const ov = entry.overlay;
            if (!ov.type) errors.push(`Scene "${entry.scene}" overlay: missing "type" field`);
            if (ov.type && !validTypes.has(ov.type)) {
              errors.push(`Scene "${entry.scene}" overlay: unknown type "${ov.type}"`);
            }
            if (ov.placement && !validPlacements.has(ov.placement)) {
              errors.push(`Scene "${entry.scene}" overlay: unknown placement "${ov.placement}"`);
            }
            if (ov.motion && !validMotions.has(ov.motion)) {
              errors.push(`Scene "${entry.scene}" overlay: unknown motion "${ov.motion}"`);
            }
            if (ov.type === 'block') {
              const { isValidBlockName } = await import('./blocks/index.js');
              if (typeof ov.block !== 'string' || !ov.block) {
                errors.push(`Scene "${entry.scene}" overlay: "block" field is required when type="block"`);
              } else if (!isValidBlockName(ov.block)) {
                errors.push(`Scene "${entry.scene}" overlay: unknown block "${ov.block}"`);
              }
              if (!ov.props || typeof ov.props !== 'object') {
                errors.push(`Scene "${entry.scene}" overlay: "props" object is required when type="block"`);
              }
            }
          }
```

Note: if `validateDemo` is currently non-async, mark it `async` and update callers (`src/cli.ts:286`) with `await`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/validate.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Verify CLI still works**

Run: `npm run build && node bin/argo.js validate showcase 2>&1 | head -5`
Expected: validation output, no crash. (Existing `showcase` demo should still validate — the new block type is additive.)

- [ ] **Step 6: Commit**

```bash
git add src/validate.ts src/cli.ts tests/validate.test.ts
git -c commit.gpgsign=false commit -m "feat(validate): accept block and arrow overlay types, check block name against registry"
```

---

## Task 5: macos-notification block

**Files:**
- Create: `src/blocks/macos-notification/block.json`
- Create: `src/blocks/macos-notification/template.ts`
- Modify: `src/blocks/index.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/blocks/blocks.test.ts`:

```typescript
describe('macos-notification block', () => {
  it('renders app name, title, body, timestamp', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'macos-notification',
      props: {
        appName: 'Argo',
        title: 'New signup',
        body: 'jane@example.com just joined',
        timestamp: 'now',
      },
    }, 'dark');
    expect(result.contentHtml).toContain('Argo');
    expect(result.contentHtml).toContain('New signup');
    expect(result.contentHtml).toContain('jane@example.com');
  });

  it('escapes HTML in all fields', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'macos-notification',
      props: {
        appName: '<img onerror=1>',
        title: 'T',
        body: 'B',
        timestamp: 'now',
      },
    }, 'dark');
    expect(result.contentHtml).not.toContain('<img onerror');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/blocks/blocks.test.ts`
Expected: FAIL — block not registered.

- [ ] **Step 3: Create block.json**

```json
// src/blocks/macos-notification/block.json
{
  "id": "macos-notification",
  "version": "1.0.0",
  "description": "macOS-style notification banner — ideal for simulating in-product events (new signups, messages).",
  "tags": ["system", "narrative"],
  "props": {
    "appName": { "type": "string", "required": true, "example": "Argo" },
    "title": { "type": "string", "required": true, "example": "New signup" },
    "body": { "type": "string", "required": true, "example": "jane@example.com just joined" },
    "timestamp": { "type": "string", "required": false, "default": "now", "example": "2m ago" },
    "appIcon": { "type": "string", "required": false, "description": "URL or data URI" }
  }
}
```

- [ ] **Step 4: Create template.ts**

```typescript
// src/blocks/macos-notification/template.ts
import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';

export interface MacOSNotificationProps {
  appName: string;
  title: string;
  body: string;
  timestamp?: string;
  appIcon?: string;
  [key: string]: unknown;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render(props: MacOSNotificationProps, theme: BackgroundTheme): TemplateResult {
  const isDark = theme === 'dark';
  const bg = isDark ? 'rgba(40, 40, 43, 0.88)' : 'rgba(245, 245, 247, 0.88)';
  const fg = isDark ? '#f5f5f7' : '#1d1d1f';
  const muted = isDark ? 'rgba(245,245,247,0.6)' : 'rgba(29,29,31,0.55)';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  const iconHtml = props.appIcon
    ? `<img src="${escapeHtml(props.appIcon)}" alt="" style="width:38px;height:38px;border-radius:8px;flex:none" />`
    : `<div style="width:38px;height:38px;border-radius:8px;flex:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px">${escapeHtml(props.appName.charAt(0).toUpperCase())}</div>`;

  const timestamp = props.timestamp ?? 'now';

  return {
    contentHtml: `
      <div style="display:flex;gap:10px;align-items:flex-start">
        ${iconHtml}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px">
            <span style="font-size:13px;font-weight:600;color:${fg};text-transform:none">${escapeHtml(props.appName)}</span>
            <span style="font-size:11px;color:${muted};flex:none">${escapeHtml(timestamp)}</span>
          </div>
          <div style="font-size:13px;font-weight:600;color:${fg};margin-top:2px;line-height:1.3">${escapeHtml(props.title)}</div>
          <div style="font-size:13px;color:${fg};opacity:0.85;margin-top:1px;line-height:1.35;word-wrap:break-word">${escapeHtml(props.body)}</div>
        </div>
      </div>
    `.trim(),
    styles: {
      background: bg,
      backdropFilter: 'blur(20px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
      border: `1px solid ${border}`,
      borderRadius: '14px',
      padding: '12px 14px',
      maxWidth: '360px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
    },
  };
}

export const macosNotificationBlock: BlockDefinition<MacOSNotificationProps> = {
  id: 'macos-notification',
  version: '1.0.0',
  defaultProps: {
    appName: 'App',
    title: '',
    body: '',
    timestamp: 'now',
  },
  render,
};
```

- [ ] **Step 5: Register in barrel**

In `src/blocks/index.ts`:

```typescript
import { xPostBlock } from './x-post/template.js';
import { macosNotificationBlock } from './macos-notification/template.js';

export const BLOCK_REGISTRY = {
  'x-post': xPostBlock,
  'macos-notification': macosNotificationBlock,
} as const satisfies Record<string, BlockDefinition>;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/blocks/blocks.test.ts`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/blocks tests/blocks/blocks.test.ts
git -c commit.gpgsign=false commit -m "feat(blocks): add macos-notification block"
```

---

## Task 6: yt-lower-third block

**Files:**
- Create: `src/blocks/yt-lower-third/block.json`
- Create: `src/blocks/yt-lower-third/template.ts`
- Modify: `src/blocks/index.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/blocks/blocks.test.ts`:

```typescript
describe('yt-lower-third block', () => {
  it('renders name + subtitle with accent bar', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'yt-lower-third',
      props: { name: 'Jane Doe', subtitle: 'Engineering Lead', accentColor: '#ef4444' },
    }, 'dark');
    expect(result.contentHtml).toContain('Jane Doe');
    expect(result.contentHtml).toContain('Engineering Lead');
    expect(result.contentHtml).toContain('#ef4444');
  });

  it('uses default accent when accentColor missing', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'yt-lower-third',
      props: { name: 'J', subtitle: 'S' },
    }, 'dark');
    expect(result.contentHtml).toContain('J');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/blocks/blocks.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create block.json**

```json
// src/blocks/yt-lower-third/block.json
{
  "id": "yt-lower-third",
  "version": "1.0.0",
  "description": "YouTube-style lower third — name + subtitle with an accent bar. Good for speaker intros.",
  "tags": ["styling", "identification"],
  "props": {
    "name": { "type": "string", "required": true, "example": "Jane Doe" },
    "subtitle": { "type": "string", "required": true, "example": "Engineering Lead" },
    "accentColor": { "type": "string", "required": false, "default": "#ef4444" }
  }
}
```

- [ ] **Step 4: Create template.ts**

```typescript
// src/blocks/yt-lower-third/template.ts
import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';

export interface YtLowerThirdProps {
  name: string;
  subtitle: string;
  accentColor?: string;
  [key: string]: unknown;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function render(props: YtLowerThirdProps, theme: BackgroundTheme): TemplateResult {
  const isDark = theme === 'dark';
  const accent = props.accentColor ?? '#ef4444';
  const bg = isDark ? 'rgba(20,20,22,0.92)' : 'rgba(255,255,255,0.94)';
  const fg = isDark ? '#ffffff' : '#1a1a1a';
  const muted = isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.7)';

  return {
    contentHtml: `
      <div style="display:flex;align-items:stretch;overflow:hidden;border-radius:6px">
        <div style="width:6px;background:${escapeHtml(accent)};flex:none"></div>
        <div style="padding:14px 22px 14px 18px;background:${bg};backdrop-filter:blur(12px)">
          <div style="font-size:22px;font-weight:700;color:${fg};letter-spacing:-0.01em;line-height:1.1">${escapeHtml(props.name)}</div>
          <div style="font-size:14px;font-weight:500;color:${muted};margin-top:4px;letter-spacing:0.02em;text-transform:uppercase">${escapeHtml(props.subtitle)}</div>
        </div>
      </div>
    `.trim(),
    styles: {
      display: 'inline-block',
      maxWidth: '500px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
      boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
    },
  };
}

export const ytLowerThirdBlock: BlockDefinition<YtLowerThirdProps> = {
  id: 'yt-lower-third',
  version: '1.0.0',
  defaultProps: {
    name: '',
    subtitle: '',
    accentColor: '#ef4444',
  },
  render,
};
```

- [ ] **Step 5: Register in barrel**

In `src/blocks/index.ts`, add import and registry entry:

```typescript
import { ytLowerThirdBlock } from './yt-lower-third/template.js';

export const BLOCK_REGISTRY = {
  'x-post': xPostBlock,
  'macos-notification': macosNotificationBlock,
  'yt-lower-third': ytLowerThirdBlock,
} as const satisfies Record<string, BlockDefinition>;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/blocks/blocks.test.ts`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/blocks tests/blocks/blocks.test.ts
git -c commit.gpgsign=false commit -m "feat(blocks): add yt-lower-third block"
```

---

## Task 7: data-chart block

**Files:**
- Create: `src/blocks/data-chart/block.json`
- Create: `src/blocks/data-chart/template.ts`
- Modify: `src/blocks/index.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/blocks/blocks.test.ts`:

```typescript
describe('data-chart block', () => {
  it('renders title and SVG bars for type=bar', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'data-chart',
      props: {
        type: 'bar',
        title: 'Signups',
        values: [10, 25, 40, 32, 55],
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      },
    }, 'dark');
    expect(result.contentHtml).toContain('Signups');
    expect(result.contentHtml).toContain('<svg');
    expect(result.contentHtml).toContain('<rect');
  });

  it('renders SVG polyline for type=line', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'data-chart',
      props: { type: 'line', title: 'MRR', values: [100, 150, 220, 300] },
    }, 'dark');
    expect(result.contentHtml).toContain('<polyline');
  });

  it('handles empty values array without crashing', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'data-chart',
      props: { type: 'bar', title: 'Empty', values: [] },
    }, 'dark');
    expect(result.contentHtml).toContain('Empty');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/blocks/blocks.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create block.json**

```json
// src/blocks/data-chart/block.json
{
  "id": "data-chart",
  "version": "1.0.0",
  "description": "Compact animated bar/line chart — for metrics, growth, and data-driven demo moments.",
  "tags": ["data", "metrics"],
  "props": {
    "type": { "type": "string", "enum": ["bar", "line"], "required": true },
    "title": { "type": "string", "required": true },
    "values": { "type": "number[]", "required": true },
    "labels": { "type": "string[]", "required": false },
    "accentColor": { "type": "string", "required": false, "default": "#22c55e" }
  }
}
```

- [ ] **Step 4: Create template.ts**

```typescript
// src/blocks/data-chart/template.ts
import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';

export interface DataChartProps {
  type: 'bar' | 'line';
  title: string;
  values: number[];
  labels?: string[];
  accentColor?: string;
  [key: string]: unknown;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CHART_W = 320;
const CHART_H = 140;
const PAD = 18;

function renderBars(values: number[], labels: string[] | undefined, accent: string, fg: string, muted: string): string {
  if (values.length === 0) return '<text x="50%" y="50%" text-anchor="middle" fill="' + muted + '" font-size="12">no data</text>';
  const max = Math.max(...values, 1);
  const innerW = CHART_W - PAD * 2;
  const innerH = CHART_H - PAD * 2 - 14; // leave room for labels
  const barW = innerW / values.length - 6;

  const rects = values.map((v, i) => {
    const h = (v / max) * innerH;
    const x = PAD + i * (innerW / values.length) + 3;
    const y = PAD + (innerH - h);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${accent}" rx="2" />`;
  }).join('');

  const labelEls = (labels ?? []).map((label, i) => {
    const x = PAD + i * (innerW / values.length) + barW / 2 + 3;
    const y = CHART_H - 4;
    return `<text x="${x.toFixed(1)}" y="${y}" fill="${muted}" font-size="10" text-anchor="middle">${escapeHtml(label)}</text>`;
  }).join('');

  return rects + labelEls;
}

function renderLine(values: number[], accent: string, muted: string): string {
  if (values.length < 2) return '<text x="50%" y="50%" text-anchor="middle" fill="' + muted + '" font-size="12">need 2+ points</text>';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const innerW = CHART_W - PAD * 2;
  const innerH = CHART_H - PAD * 2;

  const points = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * innerW;
    const y = PAD + (1 - (v - min) / range) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `<polyline points="${points}" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
}

function render(props: DataChartProps, theme: BackgroundTheme): TemplateResult {
  const isDark = theme === 'dark';
  const bg = isDark ? 'rgba(20,20,22,0.85)' : 'rgba(255,255,255,0.9)';
  const fg = isDark ? '#f5f5f7' : '#1a1a1a';
  const muted = isDark ? 'rgba(245,245,247,0.55)' : 'rgba(26,26,26,0.55)';
  const accent = props.accentColor ?? '#22c55e';

  const inner = props.type === 'line'
    ? renderLine(props.values, accent, muted)
    : renderBars(props.values, props.labels, accent, fg, muted);

  const latest = props.values.length > 0 ? props.values[props.values.length - 1] : undefined;

  return {
    contentHtml: `
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:8px">
        <div style="font-size:13px;font-weight:600;color:${fg};text-transform:uppercase;letter-spacing:0.06em">${escapeHtml(props.title)}</div>
        ${latest !== undefined ? `<div style="font-size:20px;font-weight:700;color:${accent};line-height:1">${latest.toLocaleString()}</div>` : ''}
      </div>
      <svg viewBox="0 0 ${CHART_W} ${CHART_H}" width="100%" height="${CHART_H}" style="display:block">${inner}</svg>
    `.trim(),
    styles: {
      background: bg,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      padding: '16px 18px 10px',
      borderRadius: '12px',
      maxWidth: '380px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
      boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.08)',
    },
  };
}

export const dataChartBlock: BlockDefinition<DataChartProps> = {
  id: 'data-chart',
  version: '1.0.0',
  defaultProps: {
    type: 'bar',
    title: '',
    values: [],
    accentColor: '#22c55e',
  },
  render,
};
```

- [ ] **Step 5: Register in barrel**

Add to `src/blocks/index.ts`:

```typescript
import { dataChartBlock } from './data-chart/template.js';

// ... add to BLOCK_REGISTRY:
  'data-chart': dataChartBlock,
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/blocks/blocks.test.ts`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/blocks tests/blocks/blocks.test.ts
git -c commit.gpgsign=false commit -m "feat(blocks): add data-chart block with bar and line variants"
```

---

## Task 8: spotify-card block

**Files:**
- Create: `src/blocks/spotify-card/block.json`
- Create: `src/blocks/spotify-card/template.ts`
- Modify: `src/blocks/index.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/blocks/blocks.test.ts`:

```typescript
describe('spotify-card block', () => {
  it('renders track, artist, and progress bar', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'spotify-card',
      props: {
        track: 'Bohemian Rhapsody',
        artist: 'Queen',
        elapsed: 120,
        total: 354,
      },
    }, 'dark');
    expect(result.contentHtml).toContain('Bohemian Rhapsody');
    expect(result.contentHtml).toContain('Queen');
    expect(result.contentHtml).toContain('2:00');
    expect(result.contentHtml).toContain('5:54');
  });

  it('clamps progress to [0,1]', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'spotify-card',
      props: { track: 'T', artist: 'A', elapsed: 999, total: 100 },
    }, 'dark');
    expect(result.contentHtml).not.toContain('width:999%');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/blocks/blocks.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create block.json**

```json
// src/blocks/spotify-card/block.json
{
  "id": "spotify-card",
  "version": "1.0.0",
  "description": "Compact Spotify-style now-playing card. Decorative insert.",
  "tags": ["decorative"],
  "props": {
    "track": { "type": "string", "required": true },
    "artist": { "type": "string", "required": true },
    "albumArt": { "type": "string", "required": false, "description": "URL or data URI" },
    "elapsed": { "type": "number", "required": true, "description": "Seconds elapsed" },
    "total": { "type": "number", "required": true, "description": "Total duration in seconds" }
  }
}
```

- [ ] **Step 4: Create template.ts**

```typescript
// src/blocks/spotify-card/template.ts
import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';

export interface SpotifyCardProps {
  track: string;
  artist: string;
  albumArt?: string;
  elapsed: number;
  total: number;
  [key: string]: unknown;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function render(props: SpotifyCardProps, theme: BackgroundTheme): TemplateResult {
  const isDark = theme === 'dark';
  const bg = isDark ? '#121212' : '#ffffff';
  const fg = isDark ? '#ffffff' : '#121212';
  const muted = isDark ? '#b3b3b3' : '#6a6a6a';
  const accent = '#1db954';

  const progress = props.total > 0 ? Math.max(0, Math.min(1, props.elapsed / props.total)) : 0;
  const progressPct = (progress * 100).toFixed(1);

  const artHtml = props.albumArt
    ? `<img src="${escapeHtml(props.albumArt)}" alt="" style="width:56px;height:56px;border-radius:4px;flex:none;object-fit:cover" />`
    : `<div style="width:56px;height:56px;border-radius:4px;flex:none;background:linear-gradient(135deg,#1db954,#191414);display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" width="28" height="28" fill="${bg}"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.5 14.4a.6.6 0 01-.9.2c-2.4-1.5-5.4-1.8-8.9-1a.6.6 0 01-.3-1.2c3.8-.8 7.1-.5 9.8 1.1.3.2.4.6.3.9zm1.2-2.7a.8.8 0 01-1 .2c-2.7-1.7-6.9-2.2-10.1-1.2a.8.8 0 01-.5-1.4c3.7-1.1 8.3-.6 11.4 1.4.4.2.4.7.2 1zm.1-2.8c-3.3-2-8.7-2.1-11.8-1.2a.9.9 0 01-.6-1.8c3.6-1.1 9.6-.9 13.4 1.3a.9.9 0 01-1 1.7z"/></svg></div>`;

  return {
    contentHtml: `
      <div style="display:flex;gap:12px;align-items:center">
        ${artHtml}
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:${fg};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(props.track)}</div>
          <div style="font-size:12px;color:${muted};margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(props.artist)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:10px">
        <span style="font-size:10px;color:${muted};font-variant-numeric:tabular-nums">${formatTime(props.elapsed)}</span>
        <div style="flex:1;height:3px;background:${isDark ? '#404040' : '#e6e6e6'};border-radius:999px;overflow:hidden">
          <div style="height:100%;width:${progressPct}%;background:${accent};border-radius:999px"></div>
        </div>
        <span style="font-size:10px;color:${muted};font-variant-numeric:tabular-nums">${formatTime(props.total)}</span>
      </div>
    `.trim(),
    styles: {
      background: bg,
      color: fg,
      padding: '14px 16px',
      borderRadius: '8px',
      maxWidth: '320px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Spotify Circular", "Segoe UI", sans-serif',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    },
  };
}

export const spotifyCardBlock: BlockDefinition<SpotifyCardProps> = {
  id: 'spotify-card',
  version: '1.0.0',
  defaultProps: {
    track: '',
    artist: '',
    elapsed: 0,
    total: 180,
  },
  render,
};
```

- [ ] **Step 5: Register in barrel**

Final state of `src/blocks/index.ts`:

```typescript
import type { BlockDefinition } from './types.js';
import { xPostBlock } from './x-post/template.js';
import { macosNotificationBlock } from './macos-notification/template.js';
import { ytLowerThirdBlock } from './yt-lower-third/template.js';
import { dataChartBlock } from './data-chart/template.js';
import { spotifyCardBlock } from './spotify-card/template.js';

export const BLOCK_REGISTRY = {
  'x-post': xPostBlock,
  'macos-notification': macosNotificationBlock,
  'yt-lower-third': ytLowerThirdBlock,
  'data-chart': dataChartBlock,
  'spotify-card': spotifyCardBlock,
} as const satisfies Record<string, BlockDefinition>;

Object.freeze(BLOCK_REGISTRY);

export type BlockName = keyof typeof BLOCK_REGISTRY;

export function isValidBlockName(name: string): name is BlockName {
  return Object.prototype.hasOwnProperty.call(BLOCK_REGISTRY, name);
}

export function getBlock<N extends BlockName>(name: N): (typeof BLOCK_REGISTRY)[N] {
  if (!isValidBlockName(name)) {
    throw new Error(`Unknown block: "${name}". Known blocks: ${Object.keys(BLOCK_REGISTRY).join(', ')}`);
  }
  return BLOCK_REGISTRY[name];
}

export type { BlockDefinition } from './types.js';
```

- [ ] **Step 6: Run full block test suite**

Run: `npx vitest run tests/blocks/blocks.test.ts`
Expected: all tests pass (5 blocks × ~3 tests + registry tests).

- [ ] **Step 7: Commit**

```bash
git add src/blocks tests/blocks/blocks.test.ts
git -c commit.gpgsign=false commit -m "feat(blocks): add spotify-card block (completes v1 lineup)"
```

---

## Task 9: Showcase demo

**Files:**
- Create: `demos/blocks-showcase.demo.ts`
- Create: `demos/blocks-showcase.scenes.json`

- [ ] **Step 1: Create scenes manifest**

```json
// demos/blocks-showcase.scenes.json
[
  {
    "scene": "intro",
    "text": "Argo now ships five ready-to-use overlay blocks. Social posts, notifications, speaker lower thirds, data charts, and now-playing cards — all styled for product demos.",
    "overlay": {
      "type": "headline-card",
      "kicker": "BLOCKS",
      "title": "Five ready-to-use overlays",
      "body": "Drop them into any scene via .scenes.json",
      "placement": "center",
      "motion": "fade-in",
      "autoBackground": true
    }
  },
  {
    "scene": "x-post",
    "text": "Show a social proof post for narrative moments.",
    "overlay": {
      "type": "block",
      "block": "x-post",
      "props": {
        "handle": "@argo_team",
        "name": "Argo",
        "body": "v1 block registry just dropped — five demo-ready overlays bundled in.",
        "timestamp": "2m",
        "verified": true
      },
      "placement": "top-right",
      "motion": "slide-in"
    }
  },
  {
    "scene": "macos",
    "text": "Simulate in-app events like new signups.",
    "overlay": {
      "type": "block",
      "block": "macos-notification",
      "props": {
        "appName": "Argo",
        "title": "New signup",
        "body": "jane@example.com just joined your team",
        "timestamp": "now"
      },
      "placement": "top-right",
      "motion": "slide-in"
    }
  },
  {
    "scene": "ytlt",
    "text": "Introduce speakers with pro lower-third styling.",
    "overlay": {
      "type": "block",
      "block": "yt-lower-third",
      "props": {
        "name": "Jane Doe",
        "subtitle": "Engineering Lead",
        "accentColor": "#ef4444"
      },
      "placement": "bottom-left",
      "motion": "slide-in"
    }
  },
  {
    "scene": "chart",
    "text": "Show growth metrics animated right in-frame.",
    "overlay": {
      "type": "block",
      "block": "data-chart",
      "props": {
        "type": "bar",
        "title": "Signups last 5 days",
        "values": [12, 18, 34, 52, 87],
        "labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
        "accentColor": "#22c55e"
      },
      "placement": "bottom-right",
      "motion": "fade-in"
    }
  },
  {
    "scene": "spotify",
    "text": "Decorative cards work great as scene punctuation.",
    "overlay": {
      "type": "block",
      "block": "spotify-card",
      "props": {
        "track": "Bohemian Rhapsody",
        "artist": "Queen",
        "elapsed": 120,
        "total": 354
      },
      "placement": "bottom-center",
      "motion": "fade-in"
    }
  },
  {
    "scene": "closing",
    "text": "Five blocks today, more on the way. And the format is designed for a future argo add command.",
    "overlay": {
      "type": "headline-card",
      "title": "More blocks coming →",
      "body": "Argo v0.30",
      "placement": "center",
      "motion": "fade-in",
      "autoBackground": true
    }
  }
]
```

- [ ] **Step 2: Create demo script**

```typescript
// demos/blocks-showcase.demo.ts
import { test } from '@argo-video/cli';
import { showOverlay } from '@argo-video/cli';

test('blocks-showcase', async ({ page, narration }) => {
  test.setTimeout(180_000);

  // Use a simple HTML page as the background — blocks are the star.
  await page.setContent(`
    <!DOCTYPE html><html><body style="margin:0;background:linear-gradient(135deg,#1e1b4b,#312e81,#4c1d95);height:100vh;color:#fff;font-family:system-ui">
      <div style="padding:80px 60px">
        <h1 style="font-size:48px;margin:0;font-weight:800;letter-spacing:-0.02em">Argo Blocks</h1>
        <p style="font-size:20px;opacity:0.8;margin-top:12px">Ready-to-use overlay catalog</p>
      </div>
    </body></html>
  `);
  await page.waitForTimeout(500);

  for (const scene of ['intro', 'x-post', 'macos', 'ytlt', 'chart', 'spotify', 'closing']) {
    narration.mark(scene);
    await showOverlay(page, scene, narration.durationFor(scene, { maxMs: 6000 }));
  }
});
```

- [ ] **Step 3: Validate the demo**

Run: `npm run build && node bin/argo.js validate blocks-showcase`
Expected: No errors, no warnings related to block names.

- [ ] **Step 4: Run the full pipeline to produce an MP4**

Run: `node bin/argo.js pipeline blocks-showcase`
Expected: `videos/blocks-showcase.mp4` exists, plays correctly with each block visible.

- [ ] **Step 5: Spot-check the video visually**

Open `videos/blocks-showcase.mp4` in a player. Confirm each of 5 blocks renders correctly (text visible, no layout breakage, themes look reasonable).

- [ ] **Step 6: Commit**

```bash
git add demos/blocks-showcase.demo.ts demos/blocks-showcase.scenes.json
git add -f videos/blocks-showcase.mp4
git -c commit.gpgsign=false commit -m "demo: add blocks-showcase demonstrating all five v1 blocks"
```

---

## Task 10: Update docs (README, skill, CLAUDE.md)

**Files:**
- Modify: `README.md`
- Modify: `skills/argo-guide/SKILL.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add blocks section to README**

In `README.md`, after the overlays section (search for `### Overlay templates` or similar), add:

```markdown
### Overlay Blocks

Argo ships 5 curated overlay blocks for demo narratives. Reference them from `.scenes.json`:

\`\`\`json
{
  "scene": "social-proof",
  "overlay": {
    "type": "block",
    "block": "x-post",
    "props": {
      "handle": "@jane",
      "name": "Jane Doe",
      "body": "this is exactly what I needed",
      "timestamp": "2m"
    },
    "placement": "top-right"
  }
}
\`\`\`

Available blocks:
| Block | Purpose |
|-------|---------|
| `x-post` | Social post card for social proof |
| `macos-notification` | macOS-style notification banner |
| `yt-lower-third` | YouTube-style lower third for speaker intros |
| `data-chart` | Compact bar/line chart for metrics |
| `spotify-card` | Now-playing card for decorative inserts |

Blocks live under `src/blocks/<name>/` — see [demos/blocks-showcase](demos/blocks-showcase.demo.ts) for a complete example.
```

- [ ] **Step 2: Add blocks section to skill**

In `skills/argo-guide/SKILL.md`, under the overlay section, add a block subsection that mirrors the README table + an inline example. Keep under ~20 lines.

- [ ] **Step 3: Update CLAUDE.md**

In `CLAUDE.md`, under the `### Overlays (src/overlays/)` section, append:

```markdown
### Blocks (`src/blocks/`)

Curated overlay catalog. Each block is self-contained under `src/blocks/<name>/` with a `block.json` metadata file and a `template.ts` exporting a `BlockDefinition`. `src/blocks/index.ts` is a const-typed barrel — `BlockName` is a literal union derived from `keyof typeof BLOCK_REGISTRY`.

Blocks plug into `renderTemplate()` via the `type: 'block'` cue variant. Props merge over block-level defaults at render time. HTML escaping is the block author's responsibility — all blocks use the existing `escapeHtml` helper.

v1 blocks: `x-post`, `macos-notification`, `yt-lower-third`, `data-chart`, `spotify-card`. Folder format is designed for a future `argo add <block>` command (not shipped in v1).
```

- [ ] **Step 4: Build, test, validate docs**

Run: `npm run build && npm test -- --run`
Expected: All tests pass, tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add README.md skills/argo-guide/SKILL.md CLAUDE.md
git -c commit.gpgsign=false commit -m "docs: document block registry and v1 block lineup"
```

---

## Final verification

- [ ] Full test suite: `npm test -- --run` passes.
- [ ] Build: `npm run build` exits 0.
- [ ] CLI: `node bin/argo.js validate blocks-showcase` reports no errors.
- [ ] Existing demos still pass `argo validate`.
- [ ] Showcase video plays and all 5 blocks are visible.

## Out of scope (future work)

- `argo add <block>` install mechanism — block format is extraction-ready; wire up when real demand appears.
- Block theming override at cue level (today blocks inherit scene theme).
- Runtime prop schema validation via Zod or similar (TypeScript types cover this for the prototype).
- Animated block variants (e.g., data-chart values animating in) — would need extra injection plumbing.
