import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';
import { escapeHtml } from '../../html-escape.js';

export interface SpotifyCardProps {
  track: string;
  artist: string;
  albumArt?: string;
  elapsed: number;
  total: number;
  [key: string]: unknown;
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
  defaultProps: { track: '', artist: '', elapsed: 0, total: 180 },
  render,
};
