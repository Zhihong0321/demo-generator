import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';
import type { GsapMotion } from '../../overlays/gsap-motion.js';
import { escapeHtml } from '../../html-escape.js';

export interface LogoOutroProps {
  logo?: string;
  title: string;
  tagline?: string;
  accentColor?: string;
  [key: string]: unknown;
}

function render(props: LogoOutroProps, theme: BackgroundTheme): TemplateResult {
  const isDark = theme === 'dark';
  const bg = isDark ? 'rgba(10,10,12,0.92)' : 'rgba(255,255,255,0.96)';
  const fg = isDark ? '#f5f5f7' : '#1a1a1f';
  const muted = isDark ? 'rgba(245,245,247,0.65)' : 'rgba(26,26,31,0.6)';
  const accent = props.accentColor ?? '#0ea5e9';

  const logoHtml = props.logo
    ? `<img class="argo-logo-mark" src="${escapeHtml(props.logo)}" alt="" style="width:72px;height:72px;display:block;margin:0 auto 14px" />`
    : `<div class="argo-logo-mark" style="width:72px;height:72px;border-radius:18px;background:${accent};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:30px;margin:0 auto 14px;letter-spacing:-0.02em">${escapeHtml(props.title.charAt(0).toUpperCase())}</div>`;

  const taglineHtml = props.tagline
    ? `<div class="argo-logo-tagline" style="font-size:15px;color:${muted};margin-top:6px;letter-spacing:0.01em">${escapeHtml(props.tagline)}</div>`
    : '';

  return {
    contentHtml: `
      <div style="text-align:center">
        ${logoHtml}
        <div class="argo-logo-title" style="font-size:28px;font-weight:800;color:${fg};letter-spacing:-0.02em;line-height:1.15">${escapeHtml(props.title)}</div>
        ${taglineHtml}
      </div>
    `.trim(),
    styles: {
      background: bg,
      backdropFilter: 'blur(24px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
      padding: '28px 40px',
      borderRadius: '20px',
      maxWidth: '360px',
      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.05)',
      boxShadow: isDark ? '0 20px 60px rgba(0,0,0,0.6)' : '0 20px 60px rgba(0,0,0,0.15)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    },
  };
}

const defaultMotion: GsapMotion = {
  type: 'gsap',
  in: {
    from: { opacity: 0, scale: 0.85 },
    duration: 0.55,
    ease: 'back.out',
  },
  out: {
    to: { opacity: 0, scale: 0.95 },
    duration: 0.35,
    ease: 'power2.in',
  },
};

export const logoOutroBlock: BlockDefinition<LogoOutroProps> = {
  id: 'logo-outro',
  version: '1.0.0',
  defaultProps: {
    title: 'Brand',
    accentColor: '#0ea5e9',
  },
  render,
  defaultMotion,
};
