import { describe, it, expect } from 'vitest';
import { buildFrameFilter } from '../src/frame.js';

describe('buildFrameFilter', () => {
  it('returns null when padding is 0', () => {
    const result = buildFrameFilter('0:v', 1920, 1080, { padding: 0 }, 2);
    expect(result).toBeNull();
  });

  it('returns null when inner dimensions would be <= 0', () => {
    const result = buildFrameFilter('0:v', 80, 80, { padding: 50 }, 2);
    expect(result).toBeNull();
  });

  it('builds filter with default settings (solid black background)', () => {
    const result = buildFrameFilter('0:v', 1920, 1080, {}, 2);
    expect(result).not.toBeNull();
    expect(result!.videoSource).toBe('frm_out');
    expect(result!.addedInputs).toBe(0);
    expect(result!.inputArgs).toEqual([]);

    const fc = result!.filterParts.join(';\n');
    // Source 1920×1080 (16:9) fit inside padded box (1840×1000, wider than 16:9)
    // → height-limited: fitH=1000, fitW=1000*16/9=1778 (rounded to even)
    expect(fc).toContain('scale=1778:1000:flags=lanczos,setsar=1');
    // Should apply rounded corners
    expect(fc).toContain('format=yuva444p');
    expect(fc).toContain('geq=');
    expect(fc).toContain("if(lte(min(");
    expect(fc).not.toContain('pad=1778:1000');
    // Should create solid black background
    expect(fc).toContain('color=c=#000000:s=1920x1080:d=1,loop=-1:1:0');
    // Should have shadow (default 0.5)
    expect(fc).toContain('boxblur=');
    expect(fc).toContain('split[frm_fg][frm_shadow_src]');
    // Should have final overlay
    expect(fc).toContain('overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1[frm_out]');
  });

  it('keeps straight edges fully opaque in the rounded-corner mask', () => {
    const result = buildFrameFilter('0:v', 1920, 1080, { borderRadius: 12 }, 2);
    expect(result).not.toBeNull();

    const fc = result!.filterParts.join(';\n');
    // The alpha expression should guard straight edges and only feather
    // actual corner quadrants, not the full edge strips.
    expect(fc).toContain("if(lte(min(");
    expect(fc).not.toContain('max(0,12-X)+max(0,X-(W-1-12))');
  });

  it('disables shadow when shadow is 0', () => {
    const result = buildFrameFilter('0:v', 1920, 1080, { shadow: 0 }, 2);
    expect(result).not.toBeNull();
    const fc = result!.filterParts.join(';\n');
    // Should NOT have shadow split
    expect(fc).not.toContain('frm_shadow');
    // Should directly overlay on background
    expect(fc).toContain('[frm_bg][frm_rounded]overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1[frm_out]');
  });

  it('disables rounded corners when borderRadius is 0', () => {
    const result = buildFrameFilter('0:v', 1920, 1080, { borderRadius: 0 }, 2);
    expect(result).not.toBeNull();
    const fc = result!.filterParts.join(';\n');
    // Should NOT have geq alpha mask
    expect(fc).not.toContain('geq=');
    // Should just convert to yuva format
    expect(fc).toContain('format=yuva444p[frm_rounded]');
  });

  it('uses custom padding', () => {
    const result = buildFrameFilter('0:v', 1920, 1080, { padding: 80 }, 2);
    expect(result).not.toBeNull();
    const fc = result!.filterParts.join(';\n');
    // Padded box: 1920-160=1760, 1080-160=920 (wider than 16:9). Fit 16:9
    // inside → height-limited: fitH=920, fitW=round(920*16/9)=1636 (already even).
    expect(fc).toContain('scale=1636:920:flags=lanczos,setsar=1');
    expect(fc).toContain('overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1[frm_out]');
    expect(fc).not.toContain('pad=1636:920');
  });

  it('uses solid color background', () => {
    const result = buildFrameFilter('0:v', 1920, 1080, {
      background: { type: 'solid', value: '#1a1a2e' },
    }, 2);
    expect(result).not.toBeNull();
    const fc = result!.filterParts.join(';\n');
    expect(fc).toContain('color=c=#1a1a2e:s=1920x1080:d=1,loop=-1:1:0');
  });

  it('uses gradient background', () => {
    const result = buildFrameFilter('0:v', 1920, 1080, {
      background: { type: 'gradient', value: 'linear-gradient(135deg, #667eea, #764ba2)' },
    }, 2);
    expect(result).not.toBeNull();
    const fc = result!.filterParts.join(';\n');
    expect(fc).toContain('gradients=');
    expect(fc).toContain('c0=#667eea');
    expect(fc).toContain('c1=#764ba2');
  });

  it('uses image background with added input', () => {
    const result = buildFrameFilter('0:v', 1920, 1080, {
      background: { type: 'image', value: 'assets/bg.jpg' },
    }, 3);
    expect(result).not.toBeNull();
    expect(result!.addedInputs).toBe(1);
    expect(result!.inputArgs).toEqual(['-i', 'assets/bg.jpg']);
    const fc = result!.filterParts.join(';\n');
    expect(fc).toContain('[3:v]scale=1920:1080');
  });

  it('falls back to first color when gradient parsing fails', () => {
    const result = buildFrameFilter('0:v', 1920, 1080, {
      background: { type: 'gradient', value: 'radial-gradient(circle, #ff0000, #0000ff)' },
    }, 2);
    expect(result).not.toBeNull();
    const fc = result!.filterParts.join(';\n');
    // Should fall back to first color found
    expect(fc).toContain('color=c=#ff0000:s=1920x1080:d=1,loop=-1:1:0');
  });

  it('handles upstream filter label correctly', () => {
    const result = buildFrameFilter('camfinal', 1920, 1080, {}, 2);
    expect(result).not.toBeNull();
    const fc = result!.filterParts.join(';\n');
    expect(fc).toContain('[camfinal]scale=');
  });
});
