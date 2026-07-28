#!/usr/bin/env node
/**
 * Cross-platform replacement for argo's original
 *   "copy-assets": "mkdir -p dist/... && cp src/...*.glsl dist/..."
 * which silently fails on Windows ("The syntax of the command is incorrect"),
 * leaving dist/ without the shaders that transitions need at runtime.
 */
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const from = path.join('src', 'transitions', 'shaders');
const to = path.join('dist', 'transitions', 'shaders');

mkdirSync(to, { recursive: true });

const shaders = readdirSync(from).filter((f) => f.endsWith('.glsl'));
for (const file of shaders) {
  cpSync(path.join(from, file), path.join(to, file));
}

console.log(`copy-assets: ${shaders.length} shader(s) -> ${to}`);
