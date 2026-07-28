import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadShader(name: string): string {
  const path = join(__dirname, `${name}.glsl`);
  return readFileSync(path, 'utf-8');
}

export const SHADER_NAMES = ['crosswarp', 'swirl', 'ripple', 'luma-mask', 'light-leak'] as const;
export type ShaderName = (typeof SHADER_NAMES)[number];

export const SHADERS: Record<ShaderName, string> = {
  'crosswarp': loadShader('crosswarp'),
  'swirl': loadShader('swirl'),
  'ripple': loadShader('ripple'),
  'luma-mask': loadShader('luma-mask'),
  'light-leak': loadShader('light-leak'),
};

export function isValidShaderName(name: string): name is ShaderName {
  return (SHADER_NAMES as readonly string[]).includes(name);
}
