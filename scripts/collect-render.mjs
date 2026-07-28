#!/usr/bin/env node
/**
 * collect-render — harvest one argo run into the versioned render archive.
 *
 * Argo writes flat, overwrite-on-every-run output (videos/<demo>.mp4) plus
 * content-hashed intermediates under .argo/<demo>/. That is fine as a working
 * directory and useless as an archive: a second run destroys the first, and
 * nothing in a filename says which app, which flow, which viewport, which
 * language, or which commit of the app it documents.
 *
 * This copies one run into:
 *
 *   renders/<app>/<flow>/<YYYYMMDD-HHMM>__<viewport>__<lang>__app-<sha>/
 *
 * and, with --publish, drops a stable share-safe copy at:
 *
 *   renders/<app>/published/<app>__<flow>__<viewport>__<lang>.mp4
 *
 * Naming rules (apply everywhere in the archive):
 *   - ASCII, lowercase, kebab-case
 *   - `__` separates fields, `-` joins words inside a field
 *   - timestamps are YYYYMMDD-HHMM local, so lexical sort == chronological
 *   - no spaces, no parentheses, no vendor-specific characters
 *
 * Usage:
 *   node scripts/collect-render.mjs --demo solar-proposal --app solar-calculator-v2 \
 *     --flow mobile-solar-proposal [--lang en] [--app-repo "E:/Solar Calculator v2"] [--publish]
 */

import { execFileSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.join(import.meta.dirname, '..'));
const ARGO = path.join(ROOT, 'vendor', 'argo');

// ---- args ----------------------------------------------------------------

function parseArgs(argv) {
  const out = { lang: 'en', publish: false, frameEverySec: 2 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--publish') { out.publish = true; continue; }
    if (!a.startsWith('--')) continue;
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
for (const required of ['demo', 'app', 'flow']) {
  if (!args[required]) {
    console.error(`Missing --${required}. See the usage block in this file.`);
    process.exit(1);
  }
}

/** Lowercase ASCII kebab. `__` is reserved as the field separator. */
function slug(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unnamed';
}

/** Local YYYYMMDD-HHMM — lexical sort equals chronological sort. */
function stamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}`;
}

function ffmpeg(fnArgs) {
  execFileSync('ffmpeg', ['-v', 'error', ...fnArgs], { stdio: ['ignore', 'pipe', 'pipe'] });
}

// ---- read what argo produced --------------------------------------------

const demo = args.demo;
const metaPath = path.join(ARGO, 'videos', `${demo}.meta.json`);
const videoPath = path.join(ARGO, 'videos', `${demo}.mp4`);
const workDir = path.join(ARGO, '.argo', demo);

if (!existsSync(metaPath) || !existsSync(videoPath)) {
  console.error(`No completed run for demo "${demo}". Expected ${metaPath} and ${videoPath}.`);
  process.exit(1);
}

const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
const reportPath = path.join(workDir, 'scene-report.json');
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;

// ---- build the run id ----------------------------------------------------

const width = meta.video?.width ?? 0;
const height = meta.video?.height ?? 0;
const formFactor = width === 0 ? 'unknown' : width < 500 ? 'mobile' : width < 900 ? 'tablet' : 'desktop';
const viewport = `${formFactor}-${width}x${height}`;

let appSha = 'nosha';
if (args.appRepo) {
  try {
    appSha = execFileSync('git', ['-C', args.appRepo, 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim() || 'nosha';
  } catch {
    // Not a git repo, or git unavailable — the run is still archivable.
  }
}

const appSlug = slug(args.app);
const flowSlug = slug(args.flow);
const langSlug = slug(args.lang);
const runId = [stamp(new Date()), viewport, langSlug, `app-${slug(appSha)}`].join('__');

const flowDir = path.join(ROOT, 'renders', appSlug, flowSlug);
const runDir = path.join(flowDir, runId);
mkdirSync(path.join(runDir, 'audio'), { recursive: true });
mkdirSync(path.join(runDir, 'thumbs'), { recursive: true });
mkdirSync(path.join(runDir, 'frames'), { recursive: true });

// ---- copy the deliverables ----------------------------------------------

const copied = [];
function take(from, toName) {
  if (!existsSync(from)) return false;
  cpSync(from, path.join(runDir, toName), { recursive: true });
  copied.push(toName);
  return true;
}

take(videoPath, 'video.mp4');
take(path.join(ARGO, 'videos', `${demo}.srt`), 'captions.srt');
take(path.join(ARGO, 'videos', `${demo}.vtt`), 'captions.vtt');
take(path.join(workDir, 'narration-aligned.wav'), 'narration.wav');
take(path.join(workDir, 'chapters.txt'), 'chapters.txt');
take(reportPath, 'scene-report.json');

// Scene thumbnails, renumbered into scene order so they sort correctly.
const scenes = meta.scenes ?? [];
scenes.forEach((scene, i) => {
  const src = path.join(workDir, 'thumbs', `${scene.scene}.jpg`);
  if (!existsSync(src)) return;
  const name = `${String(i + 1).padStart(2, '0')}-${slug(scene.scene)}.jpg`;
  cpSync(src, path.join(runDir, 'thumbs', name));
});

// ---- derive per-scene audio from the aligned track -----------------------
// The cached clips are content-hashed with no on-disk scene mapping, so slice
// the aligned narration on the reported scene boundaries instead. Deterministic,
// and it reflects the audio that actually shipped in the video.
const narrationPath = path.join(runDir, 'narration.wav');
if (existsSync(narrationPath) && report?.scenes?.length) {
  report.scenes.forEach((scene, i) => {
    const startSec = (scene.startMs ?? 0) / 1000;
    const durSec = ((scene.endMs ?? 0) - (scene.startMs ?? 0)) / 1000;
    if (!(durSec > 0)) return;
    const name = `${String(i + 1).padStart(2, '0')}-${slug(scene.scene)}.wav`;
    ffmpeg([
      '-ss', String(startSec), '-t', String(durSec),
      '-i', narrationPath, '-y', path.join(runDir, 'audio', name),
    ]);
  });
}

// ---- contact sheet + sampled frames -------------------------------------

const outVideo = path.join(runDir, 'video.mp4');
const every = Number(args.frameEverySec) || 2;

ffmpeg([
  '-i', outVideo,
  '-vf', `fps=1/${every},scale=180:-1,tile=6x4:padding=4:color=0x111111`,
  '-frames:v', '1', '-y', path.join(runDir, 'contact-sheet.png'),
]);

ffmpeg([
  '-i', outVideo,
  '-vf', `fps=1/${every}`,
  '-y', path.join(runDir, 'frames', `frame-%04d.png`),
]);

// Rename sampled frames to their timestamp, which is what you actually search by.
const frameDir = path.join(runDir, 'frames');
for (const file of readdirSync(frameDir)) {
  const m = /^frame-(\d+)\.png$/.exec(file);
  if (!m) continue;
  const seconds = (Number(m[1]) - 1) * every;
  const target = `frame-${String(seconds).padStart(4, '0')}s.png`;
  if (file !== target) {
    cpSync(path.join(frameDir, file), path.join(frameDir, target));
    execFileSync(process.execPath, ['-e', `require('fs').unlinkSync(${JSON.stringify(path.join(frameDir, file))})`]);
  }
}

// ---- provenance ----------------------------------------------------------

const render = {
  app: appSlug,
  flow: flowSlug,
  runId,
  demo,
  lang: langSlug,
  viewport: { formFactor, width, height, fps: meta.video?.fps ?? null },
  appCommit: appSha,
  createdAt: meta.createdAt ?? null,
  collectedAt: new Date().toISOString(),
  tts: meta.tts ?? null,
  browser: meta.video?.browser ?? null,
  deviceScaleFactor: meta.video?.deviceScaleFactor ?? null,
  export: meta.export ?? null,
  totalDurationMs: report?.totalDurationMs ?? null,
  overflowMs: report?.overflowMs ?? null,
  scenes: scenes.map((s) => ({ scene: s.scene, durationMs: s.durationMs, voice: s.voice })),
  files: copied,
};
writeFileSync(path.join(runDir, 'render.json'), JSON.stringify(render, null, 2));
writeFileSync(
  path.join(flowDir, 'latest.json'),
  JSON.stringify({ runId, path: path.relative(ROOT, runDir).replace(/\\/g, '/'), collectedAt: render.collectedAt }, null, 2),
);

// ---- optional stable published copy -------------------------------------

let publishedAt = null;
if (args.publish) {
  const publishedDir = path.join(ROOT, 'renders', appSlug, 'published');
  mkdirSync(publishedDir, { recursive: true });
  const name = [appSlug, flowSlug, viewport, langSlug].join('__') + '.mp4';
  cpSync(outVideo, path.join(publishedDir, name));
  publishedAt = path.join(publishedDir, name);
}

// ---- report --------------------------------------------------------------

console.log(`archived  ${path.relative(ROOT, runDir).replace(/\\/g, '/')}`);
console.log(`duration  ${((render.totalDurationMs ?? 0) / 1000).toFixed(1)}s`);
console.log(`scenes    ${render.scenes.length}`);
console.log(`tts       ${render.tts?.engine ?? 'unknown'} / ${render.tts?.model ?? '?'}`);
if (render.overflowMs) console.log(`WARNING   audio overflow ${(render.overflowMs / 1000).toFixed(1)}s — final frame padded`);
if (publishedAt) console.log(`published ${path.relative(ROOT, publishedAt).replace(/\\/g, '/')}`);
