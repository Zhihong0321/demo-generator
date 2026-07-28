#!/usr/bin/env node
/**
 * setup — make this package runnable on a fresh machine.
 *
 * Installs argo's dependencies, builds it, downloads the Playwright browser,
 * and verifies every external tool the pipeline depends on. Prints a single
 * clear verdict; exits non-zero if anything the pipeline needs is missing.
 *
 *   node scripts/setup.mjs [--skip-browser]
 */

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.join(import.meta.dirname, '..'));
const ARGO = path.join(ROOT, 'vendor', 'argo');
const skipBrowser = process.argv.includes('--skip-browser');

const problems = [];
const notes = [];

function step(label) {
  process.stdout.write(`\n── ${label}\n`);
}

function run(cmd, args, cwd, opts = {}) {
  execFileSync(cmd, args, { cwd, stdio: 'inherit', ...opts });
}

/**
 * Locate npm's or npx's JS entrypoint, which ships alongside Node.
 *
 * `npm` and `npx` are `.cmd` shims on Windows. execFile reports ENOENT for
 * them, and Node's CVE-2024-27980 fix reports EINVAL even with the extension.
 * Running the underlying `*-cli.js` under `process.execPath` avoids the shell
 * entirely and behaves identically on every platform.
 */
function nodeToolCli(name) {
  const dir = path.dirname(process.execPath);
  const candidates = [
    path.join(dir, 'node_modules', 'npm', 'bin', `${name}-cli.js`),
    path.join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', `${name}-cli.js`),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

function npm(args, cwd) {
  const cli = nodeToolCli('npm');
  if (cli) return run(process.execPath, [cli, ...args], cwd);
  // Last resort: let the shell resolve the shim.
  return run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, cwd, {
    shell: process.platform === 'win32',
  });
}

/** Run Playwright's CLI from the argo install, once dependencies exist. */
function playwright(args, cwd) {
  const local = path.join(ARGO, 'node_modules', '@playwright', 'test', 'cli.js');
  if (existsSync(local)) return run(process.execPath, [local, ...args], cwd);
  const cli = nodeToolCli('npx');
  if (cli) return run(process.execPath, [cli, 'playwright', ...args], cwd);
  return run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', ...args], cwd, {
    shell: process.platform === 'win32',
  });
}

function capture(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// ---- preflight -----------------------------------------------------------

step('Checking prerequisites');

const nodeMajor = Number(process.versions.node.split('.')[0]);
console.log(`node      ${process.version}`);
if (nodeMajor < 18) problems.push(`Node ${process.version} is too old — argo needs >= 18.`);

const ffmpeg = capture('ffmpeg -version');
console.log(`ffmpeg    ${ffmpeg ? ffmpeg.split('\n')[0].replace('ffmpeg version ', '') : 'MISSING'}`);
if (!ffmpeg) {
  problems.push(
    'ffmpeg is not on PATH. It is required for every render.\n' +
    '    Windows: winget install Gyan.FFmpeg\n' +
    '    macOS:   brew install ffmpeg\n' +
    '    Linux:   apt install ffmpeg',
  );
}

const ffprobe = capture('ffprobe -version');
console.log(`ffprobe   ${ffprobe ? 'ok' : 'MISSING'}`);
if (!ffprobe) problems.push('ffprobe is not on PATH — it ships with ffmpeg.');

console.log(`argo      ${existsSync(path.join(ARGO, 'package.json')) ? 'vendored' : 'MISSING'}`);
if (!existsSync(path.join(ARGO, 'package.json'))) {
  problems.push(`vendor/argo is missing or incomplete at ${ARGO}.`);
}

if (problems.length) {
  console.error('\nCannot continue:\n');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

// ---- install -------------------------------------------------------------

// Every TTS provider is an optionalDependency, and MiniMax needs none of them —
// it uses fetch. Omitting optionals skips onnxruntime-node (pulled in by
// @huggingface/transformers for the local engines), which alone is larger than
// everything else combined. Install them explicitly if you want a local engine.
step('Installing argo dependencies (a few minutes on first run)');
npm(['install', '--no-audit', '--no-fund', '--omit=optional'], ARGO);

step('Building argo');
npm(['run', 'build'], ARGO);

if (!skipBrowser) {
  step('Downloading Playwright Chromium (~700 MB, cached globally after this)');
  playwright(['install', 'chromium'], ARGO);
} else {
  notes.push('Skipped the browser download (--skip-browser). Renders will fail until you run: npx playwright install chromium');
}

// ---- verify --------------------------------------------------------------

step('Verifying the install');

const checks = [
  ['argo built', existsSync(path.join(ARGO, 'dist', 'record.js'))],
  ['shaders copied', existsSync(path.join(ARGO, 'dist', 'transitions', 'shaders'))],
  ['minimax engine built', existsSync(path.join(ARGO, 'dist', 'tts', 'engines', 'minimax.js'))],
];

for (const [label, ok] of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) problems.push(`${label} — the build did not produce the expected output.`);
}

// The engine registry is the one thing worth asserting at runtime, since a
// silent registration failure only shows up much later as a config error.
try {
  const { engines } = await import(path.join(ARGO, 'dist', 'tts', 'engines', 'index.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
  const names = Object.keys(engines);
  const hasMiniMax = names.includes('minimax');
  console.log(`${hasMiniMax ? 'ok  ' : 'FAIL'}  minimax registered (engines: ${names.join(', ')})`);
  if (!hasMiniMax) problems.push('The minimax engine is not registered in the engine registry.');
} catch (err) {
  console.log(`FAIL  could not load the engine registry: ${err.message}`);
  problems.push('Could not load the built engine registry.');
}

mkdirSync(path.join(ROOT, 'renders'), { recursive: true });

// ---- verdict -------------------------------------------------------------

if (!process.env.MINIMAX_API_KEY) {
  notes.push('MINIMAX_API_KEY is not set. Narration will fail until you export it.');
}

console.log('\n' + '─'.repeat(64));
if (problems.length) {
  console.error('SETUP FAILED\n');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log('SETUP OK\n');
for (const n of notes) console.log(`  ! ${n}`);
console.log(`
Next:
  1. Read docs/SOP.md — start at Phase 0, and do not skip Phase 1.
  2. Copy templates/flow.* into vendor/argo/demos/ and rename for your flow.
  3. Render:
       cd vendor/argo
       npx argo pipeline <flow> --config demos/<flow>.config.mjs
  4. Archive:
       node scripts/collect-render.mjs --demo <flow> --app <app> --flow <flow> --app-repo <path>
`);
