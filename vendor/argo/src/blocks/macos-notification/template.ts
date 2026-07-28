import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';
import { escapeHtml } from '../../html-escape.js';

export interface MacOSNotificationProps {
  appName: string;
  title: string;
  body: string;
  timestamp?: string;
  appIcon?: string;
  [key: string]: unknown;
}

function render(props: MacOSNotificationProps, theme: BackgroundTheme): TemplateResult {
  const isDark = theme === 'dark';
  const bg = isDark ? 'rgba(40, 40, 43, 0.88)' : 'rgba(245, 245, 247, 0.88)';
  const fg = isDark ? '#f5f5f7' : '#1d1d1f';
  const muted = isDark ? 'rgba(245,245,247,0.6)' : 'rgba(29,29,31,0.55)';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  const iconHtml = props.appIcon
    ? `<img src="${escapeHtml(props.appIcon)}" alt="" style="width:38px;height:38px;border-radius:8px;flex:none" />`
    : `<div style="width:38px;height:38px;border-radius:8px;flex:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px">${escapeHtml(props.appName.charAt(0).toUpperCase())}</div>`;

  const timestamp = props.timestamp ?? 'now';

  return {
    contentHtml: `
      <div style="display:flex;gap:10px;align-items:flex-start">
        ${iconHtml}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px">
            <span style="font-size:13px;font-weight:600;color:${fg};text-transform:none">${escapeHtml(props.appName)}</span>
            <span style="font-size:11px;color:${muted};flex:none">${escapeHtml(timestamp)}</span>
          </div>
          <div style="font-size:13px;font-weight:600;color:${fg};margin-top:2px;line-height:1.3">${escapeHtml(props.title)}</div>
          <div style="font-size:13px;color:${fg};opacity:0.85;margin-top:1px;line-height:1.35;word-wrap:break-word">${escapeHtml(props.body)}</div>
        </div>
      </div>
    `.trim(),
    styles: {
      background: bg,
      backdropFilter: 'blur(20px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
      border: `1px solid ${border}`,
      borderRadius: '14px',
      padding: '12px 14px',
      maxWidth: '360px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
    },
  };
}

export const macosNotificationBlock: BlockDefinition<MacOSNotificationProps> = {
  id: 'macos-notification',
  version: '1.0.0',
  defaultProps: { appName: 'App', title: '', body: '', timestamp: 'now' },
  render,
};
