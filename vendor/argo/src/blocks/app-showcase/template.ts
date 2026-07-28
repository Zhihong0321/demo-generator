import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';
import type { GsapMotion } from '../../overlays/gsap-motion.js';
import { escapeHtml } from '../../html-escape.js';

export interface AppShowcaseProps {
  image?: string;
  title: string;
  subtitle?: string;
  cta?: string;
  accentColor?: string;
  [key: string]: unknown;
}

function render(props: AppShowcaseProps, theme: BackgroundTheme): TemplateResult {
  const isDark = theme === 'dark';
  const bg = isDark ? 'rgba(15,15,17,0.92)' : 'rgba(255,255,255,0.96)';
  const fg = isDark ? '#f5f5f7' : '#1a1a1f';
  const muted = isDark ? 'rgba(245,245,247,0.7)' : 'rgba(26,26,31,0.65)';
  const accent = props.accentColor ?? '#0ea5e9';

  const heroHtml = props.image
    ? `<img class="argo-app-hero" src="${escapeHtml(props.image)}" alt="" style="display:block;width:96px;height:96px;border-radius:22px;margin:0 auto 16px;box-shadow:0 8px 24px rgba(0,0,0,0.25)" />`
    : `<div class="argo-app-hero" style="width:96px;height:96px;border-radius:22px;background:linear-gradient(135deg,${accent},#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:42px;margin:0 auto 16px;box-shadow:0 8px 24px rgba(0,0,0,0.25);letter-spacing:-0.02em">${escapeHtml(props.title.charAt(0).toUpperCase())}</div>`;

  const subtitleHtml = props.subtitle
    ? `<div class="argo-app-subtitle" style="font-size:14px;color:${muted};margin-top:6px;line-height:1.4">${escapeHtml(props.subtitle)}</div>`
    : '';

  const ctaHtml = props.cta
    ? `<div class="argo-app-cta" style="display:inline-block;padding:8px 18px;border-radius:999px;background:${accent};color:#fff;font-size:13px;font-weight:700;margin-top:14px;letter-spacing:0.01em">${escapeHtml(props.cta)}</div>`
    : '';

  return {
    contentHtml: `
      <div style="text-align:center">
        ${heroHtml}
        <div class="argo-app-title" style="font-size:22px;font-weight:800;color:${fg};letter-spacing:-0.02em;line-height:1.2">${escapeHtml(props.title)}</div>
        ${subtitleHtml}
        ${ctaHtml}
      </div>
    `.trim(),
    styles: {
      background: bg,
      backdropFilter: 'blur(24px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
      padding: '24px 28px',
      borderRadius: '20px',
      maxWidth: '320px',
      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.05)',
      boxShadow: isDark ? '0 16px 48px rgba(0,0,0,0.55)' : '0 16px 48px rgba(0,0,0,0.15)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    },
  };
}

const defaultMotion: GsapMotion = {
  type: 'gsap',
  in: {
    from: { opacity: 0, y: 30, scale: 0.92 },
    duration: 0.5,
    ease: 'back.out',
  },
  loop: {
    to: { y: -3 },
    duration: 1.4,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
    target: '.argo-app-hero',
  },
  out: {
    to: { opacity: 0, scale: 0.96 },
    duration: 0.3,
    ease: 'power2.in',
  },
};

export const appShowcaseBlock: BlockDefinition<AppShowcaseProps> = {
  id: 'app-showcase',
  version: '1.0.0',
  defaultProps: {
    title: 'App',
    accentColor: '#0ea5e9',
  },
  render,
  defaultMotion,
};
