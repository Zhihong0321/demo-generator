import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateDemo } from '../src/validate.js';

describe('validateDemo', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'argo-validate-'));
    await mkdir(join(dir, 'demos'), { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('errors when demo script is missing', async () => {
    const result = await validateDemo({ demoName: 'missing', demosDir: join(dir, 'demos') });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Demo script not found');
  });

  it('errors when script does not import from @argo-video/cli', async () => {
    await writeFile(join(dir, 'demos', 'bad.demo.ts'), `
      import { test } from '@playwright/test';
      test('bad', async ({ page }) => {
        page.goto('/');
      });
    `);
    const result = await validateDemo({ demoName: 'bad', demosDir: join(dir, 'demos') });
    expect(result.errors.some(e => e.includes("@argo-video/cli"))).toBe(true);
  });

  it('warns when no narration.mark() calls found', async () => {
    await writeFile(join(dir, 'demos', 'empty.demo.ts'), `
      import { test } from '@argo-video/cli';
      test('empty', async ({ page }) => {
        await page.goto('/');
      });
    `);
    const result = await validateDemo({ demoName: 'empty', demosDir: join(dir, 'demos') });
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('No narration.mark()'))).toBe(true);
  });

  it('warns when scenes manifest is missing', async () => {
    await writeFile(join(dir, 'demos', 'novoice.demo.ts'), `
      import { test } from '@argo-video/cli';
      test('novoice', async ({ page, narration }) => {
        narration.mark('intro');
      });
    `);
    const result = await validateDemo({ demoName: 'novoice', demosDir: join(dir, 'demos') });
    expect(result.warnings.some(w => w.includes('No scenes manifest found'))).toBe(true);
  });

  it('warns on scene name mismatch between script and scenes manifest', async () => {
    await writeFile(join(dir, 'demos', 'mismatch.demo.ts'), `
      import { test } from '@argo-video/cli';
      test('mismatch', async ({ page, narration }) => {
        narration.mark('intro');
        narration.mark('ending');
      });
    `);
    await writeFile(join(dir, 'demos', 'mismatch.scenes.json'), JSON.stringify([
      { scene: 'intro', text: 'Hello' },
      { scene: 'typo-scene', text: 'Oops' },
    ]));
    const result = await validateDemo({ demoName: 'mismatch', demosDir: join(dir, 'demos') });
    expect(result.warnings.some(w => w.includes('"typo-scene" has no matching narration.mark()'))).toBe(true);
    expect(result.warnings.some(w => w.includes('"ending" has no entry in scenes manifest'))).toBe(true);
  });

  it('errors on invalid scenes manifest JSON', async () => {
    await writeFile(join(dir, 'demos', 'badjson.demo.ts'), `
      import { test } from '@argo-video/cli';
      test('badjson', async ({ page, narration }) => { narration.mark('a'); });
    `);
    await writeFile(join(dir, 'demos', 'badjson.scenes.json'), '{ not valid json');
    const result = await validateDemo({ demoName: 'badjson', demosDir: join(dir, 'demos') });
    expect(result.errors.some(e => e.includes('not valid JSON'))).toBe(true);
  });

  it('errors on invalid overlay type/placement/motion in scenes manifest', async () => {
    await writeFile(join(dir, 'demos', 'badoverlay.demo.ts'), `
      import { test } from '@argo-video/cli';
      test('badoverlay', async ({ page, narration }) => { narration.mark('a'); });
    `);
    await writeFile(join(dir, 'demos', 'badoverlay.scenes.json'), JSON.stringify([
      {
        scene: 'a',
        text: 'Hello',
        overlay: { type: 'invalid-type', placement: 'invalid-zone', motion: 'invalid-motion' },
      },
    ]));
    const result = await validateDemo({ demoName: 'badoverlay', demosDir: join(dir, 'demos') });
    expect(result.errors.some(e => e.includes('unknown type'))).toBe(true);
    expect(result.errors.some(e => e.includes('unknown placement'))).toBe(true);
    expect(result.errors.some(e => e.includes('unknown motion'))).toBe(true);
  });

  it('passes cleanly with valid demo + scenes manifest', async () => {
    await writeFile(join(dir, 'demos', 'good.demo.ts'), `
      import { test } from '@argo-video/cli';
      import { showOverlay } from '@argo-video/cli';
      test('good', async ({ page, narration }) => {
        narration.mark('intro');
        narration.mark('done');
      });
    `);
    await writeFile(join(dir, 'demos', 'good.scenes.json'), JSON.stringify([
      { scene: 'intro', text: 'Welcome' },
      { scene: 'done', text: 'Goodbye' },
    ]));
    const result = await validateDemo({ demoName: 'good', demosDir: join(dir, 'demos') });
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('passes cleanly with valid demo + scenes manifest including overlays', async () => {
    await writeFile(join(dir, 'demos', 'withoverlay.demo.ts'), `
      import { test } from '@argo-video/cli';
      test('withoverlay', async ({ page, narration }) => {
        narration.mark('intro');
      });
    `);
    await writeFile(join(dir, 'demos', 'withoverlay.scenes.json'), JSON.stringify([
      {
        scene: 'intro',
        text: 'Welcome to the demo',
        overlay: { type: 'lower-third', placement: 'bottom-center', motion: 'fade-in' },
      },
    ]));
    const result = await validateDemo({ demoName: 'withoverlay', demosDir: join(dir, 'demos') });
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

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

  it('accepts type="block" when the block exists', async () => {
    writeFileSync(join(demosDir, 'd.demo.ts'), `import { test } from '@argo-video/cli'; narration.mark('s1');`);
    writeFileSync(join(demosDir, 'd.scenes.json'), JSON.stringify([
      { scene: 's1', overlay: { type: 'block', block: 'x-post', props: {} } },
    ]));
    const res = await validateDemo({ demoName: 'd', demosDir });
    expect(res.errors).toEqual([]);
  });

  it('rejects unknown block names', async () => {
    writeFileSync(join(demosDir, 'd.demo.ts'), `import { test } from '@argo-video/cli'; narration.mark('s1');`);
    writeFileSync(join(demosDir, 'd.scenes.json'), JSON.stringify([
      { scene: 's1', overlay: { type: 'block', block: 'nonexistent', props: {} } },
    ]));
    const res = await validateDemo({ demoName: 'd', demosDir });
    expect(res.errors.some(e => /unknown block "nonexistent"/.test(e))).toBe(true);
  });

  it('accepts type="arrow" (regression — was missing from validTypes)', async () => {
    writeFileSync(join(demosDir, 'd.demo.ts'), `import { test } from '@argo-video/cli'; narration.mark('s1');`);
    writeFileSync(join(demosDir, 'd.scenes.json'), JSON.stringify([
      { scene: 's1', overlay: { type: 'arrow', direction: 'down' } },
    ]));
    const res = await validateDemo({ demoName: 'd', demosDir });
    expect(res.errors).toEqual([]);
  });
});

describe('validate — GSAP motions', () => {
  let tmp: string;
  let demosDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'argo-validate-gsap-'));
    demosDir = join(tmp, 'demos');
    mkdirSync(demosDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('accepts a well-formed GSAP motion object', async () => {
    writeFileSync(join(demosDir, 'd.demo.ts'), `import { test } from '@argo-video/cli'; narration.mark('s1');`);
    writeFileSync(join(demosDir, 'd.scenes.json'), JSON.stringify([
      {
        scene: 's1',
        overlay: {
          type: 'lower-third',
          text: 'hi',
          motion: {
            type: 'gsap',
            in: { from: { opacity: 0, y: 20 }, duration: 0.4, ease: 'power2.out' },
          },
        },
      },
    ]));
    const res = await validateDemo({ demoName: 'd', demosDir });
    expect(res.errors).toEqual([]);
  });

  it('rejects unknown GSAP eases', async () => {
    writeFileSync(join(demosDir, 'd.demo.ts'), `import { test } from '@argo-video/cli'; narration.mark('s1');`);
    writeFileSync(join(demosDir, 'd.scenes.json'), JSON.stringify([
      {
        scene: 's1',
        overlay: {
          type: 'lower-third',
          text: 'hi',
          motion: { type: 'gsap', in: { to: { opacity: 1 }, ease: 'wobble.out' } },
        },
      },
    ]));
    const res = await validateDemo({ demoName: 'd', demosDir });
    expect(res.errors.some((e) => /overlay\.motion.*wobble/.test(e))).toBe(true);
  });

  it('rejects motion.raw without allowRawGsap', async () => {
    writeFileSync(join(demosDir, 'd.demo.ts'), `import { test } from '@argo-video/cli'; narration.mark('s1');`);
    writeFileSync(join(demosDir, 'd.scenes.json'), JSON.stringify([
      {
        scene: 's1',
        overlay: {
          type: 'lower-third',
          text: 'hi',
          motion: { type: 'gsap', raw: 'gsap.to(root, { opacity: 1 })' },
        },
      },
    ]));
    const res = await validateDemo({ demoName: 'd', demosDir });
    expect(res.errors.some((e) => /allowRawGsap/.test(e))).toBe(true);
  });

  it('accepts motion.raw when allowRawGsap=true', async () => {
    writeFileSync(join(demosDir, 'd.demo.ts'), `import { test } from '@argo-video/cli'; narration.mark('s1');`);
    writeFileSync(join(demosDir, 'd.scenes.json'), JSON.stringify([
      {
        scene: 's1',
        overlay: {
          type: 'lower-third',
          text: 'hi',
          motion: { type: 'gsap', raw: 'gsap.to(root, { opacity: 1 })' },
        },
      },
    ]));
    const res = await validateDemo({ demoName: 'd', demosDir, allowRawGsap: true });
    expect(res.errors).toEqual([]);
  });
});
