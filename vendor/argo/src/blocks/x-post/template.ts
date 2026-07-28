import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';
import { escapeHtml } from '../../html-escape.js';

export interface XPostProps {
  handle: string;
  name: string;
  body: string;
  timestamp?: string;
  avatar?: string;
  verified?: boolean;
  [key: string]: unknown;
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
