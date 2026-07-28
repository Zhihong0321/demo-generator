import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';
import { escapeHtml } from '../../html-escape.js';

export interface YtLowerThirdProps {
  name: string;
  subtitle: string;
  accentColor?: string;
  [key: string]: unknown;
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
  defaultProps: { name: '', subtitle: '', accentColor: '#ef4444' },
  render,
};
