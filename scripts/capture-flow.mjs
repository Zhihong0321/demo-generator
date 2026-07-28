#!/usr/bin/env node
/**
 * capture-flow — screenshot a list of routes, headless, in seconds.
 *
 * This exists so nobody ever explores an app by driving it with computer use.
 * You own the source: read the routes and templates to learn the flow, then run
 * this ONCE to confirm what actually renders. Scripted, cheap, repeatable.
 *
 *   node scripts/capture-flow.mjs --base-url http://localhost:3000 \
 *     --routes /,/customers,/invoice/new [--out .flow-check] [--desktop]
 *     [--storage-state auth.json] [--full-page]
 *
 * Alongside each PNG it writes a .txt of the page's visible text, so you can
 * read what a screen says without opening a single image.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.join(import.meta.dirname, '..'));
const ARGO = path.join(ROOT, 'vendor', 'argo');

function parseArgs(argv) {
  const out = { out: '.flow-check', routes: '/', fullPage: false, desktop: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--full-page') { out.fullPage = true; continue; }
    if (a === '--desktop') { out.desktop = true; continue; }
    if (!a.startsWith('--')) continue;
    out[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.baseUrl) {
  console.error(
    'Missing --base-url.\n\n' +
    '  node scripts/capture-flow.mjs --base-url http://localhost:3000 --routes /,/customers\n',
  );
  process.exit(1);
}

const playwrightEntry = path.join(ARGO, 'node_modules', 'playwright', 'index.js');
if (!existsSync(playwrightEntry)) {
  console.error('Playwright is not installed. Run: node scripts/setup.mjs');
  process.exit(1);
}
// playwright is CommonJS, so under ESM its exports may arrive on `.default`.
const playwright = await import(pathToFileURL(playwrightEntry).href);
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) {
  console.error('Could not load Playwright\'s chromium export. Run: node scripts/setup.mjs');
  process.exit(1);
}

const routes = String(args.routes).split(',').map((r) => r.trim()).filter(Boolean);

// Git Bash / MSYS rewrites a bare "/" argument into the Git install path, so
// `--routes /,/customers` silently becomes `--routes D:/PortableGit/,/customers`
// and you capture the wrong page. Catch it rather than producing junk.
const mangled = routes.filter((r) => /^[A-Za-z]:[\\/]/.test(r));
if (mangled.length) {
  console.error(
    `These routes were rewritten by the shell into filesystem paths: ${mangled.join(', ')}\n\n` +
    '  Git Bash / MSYS converts a leading "/" into the Git install directory.\n' +
    '  Fix it with either:\n' +
    '    MSYS_NO_PATHCONV=1 node scripts/capture-flow.mjs --routes /,/customers ...\n' +
    '    node scripts/capture-flow.mjs --routes //,//customers ...   (doubled slashes)\n',
  );
  process.exit(1);
}
const outDir = path.resolve(args.out);
mkdirSync(outDir, { recursive: true });

/** Route -> filesystem-safe name. `/` becomes `root`. */
function routeSlug(route) {
  const s = route.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  return s || 'root';
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: args.desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 },
  isMobile: !args.desktop,
  hasTouch: !args.desktop,
  deviceScaleFactor: 2,
  ...(args.storageState ? { storageState: args.storageState } : {}),
});

const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

const results = [];

for (const [i, route] of routes.entries()) {
  const url = new URL(route, args.baseUrl).href;
  const index = String(i + 1).padStart(2, '0');
  const name = `${index}-${routeSlug(route)}`;
  const before = consoleErrors.length;

  const row = { route, url, name, status: null, finalUrl: null, error: null };

  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout: 20_000 });
    row.status = response?.status() ?? null;

    // Prefer the app's own readiness signal (App Contract #2). Fall back to
    // networkidle so this still works before the contract is implemented.
    const hasSignal = await page.evaluate(() => '__demoReady' in window).catch(() => false);
    if (hasSignal) {
      await page.waitForFunction(() => window.__demoReady === true, undefined, { timeout: 15_000 })
        .catch(() => { row.error = 'readiness signal never became true'; });
    } else {
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    }

    row.finalUrl = page.url();
    await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: args.fullPage });

    // The text dump is the point: you can read what a screen says without
    // opening an image, which keeps this reviewable at a glance.
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    writeFileSync(path.join(outDir, `${name}.txt`), text.replace(/\n{3,}/g, '\n\n').trim());
  } catch (err) {
    row.error = err.message.split('\n')[0];
  }

  row.consoleErrors = consoleErrors.slice(before);
  results.push(row);

  const redirected = row.finalUrl && row.finalUrl !== row.url ? `  -> ${row.finalUrl}` : '';
  const flag = row.error ? `  ERROR: ${row.error}` : '';
  console.log(`${String(row.status ?? '---').padEnd(4)} ${route.padEnd(28)} ${name}${redirected}${flag}`);
}

await browser.close();
writeFileSync(path.join(outDir, 'flow.json'), JSON.stringify({ baseUrl: args.baseUrl, results }, null, 2));

const failed = results.filter((r) => r.error || (r.status && r.status >= 400));
console.log(`\n${results.length - failed.length}/${results.length} captured -> ${path.relative(process.cwd(), outDir)}`);
if (failed.length) {
  console.log(`\n${failed.length} route(s) need attention:`);
  for (const f of failed) console.log(`  ${f.route} — ${f.error ?? `HTTP ${f.status}`}`);
}
console.log('\nRead the .txt files to check your screen list against what actually renders.');
