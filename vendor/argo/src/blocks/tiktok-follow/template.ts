import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';
import type { GsapMotion } from '../../overlays/gsap-motion.js';
import { escapeHtml } from '../../html-escape.js';

export interface TikTokFollowProps {
  handle: string;
  name: string;
  avatar?: string;
  [key: string]: unknown;
}

// TikTok brand cyan + magenta pair
const TIKTOK_RING = 'conic-gradient(from 0deg,#25f4ee 0deg,#25f4ee 120deg,#fe2c55 240deg,#25f4ee 360deg)';

function render(props: TikTokFollowProps, theme: BackgroundTheme): TemplateResult {
  const isDark = theme === 'dark';
  const bg = isDark ? 'rgba(17,17,17,0.88)' : 'rgba(255,255,255,0.94)';
  const fg = isDark ? '#f1f1f2' : '#161823';
  const muted = isDark ? 'rgba(241,241,242,0.65)' : 'rgba(22,24,35,0.6)';

  const innerAvatar = props.avatar
    ? `<img src="${escapeHtml(props.avatar)}" alt="" style="width:100%;height:100%;border-radius:50%;display:block" />`
    : `<div style="width:100%;height:100%;border-radius:50%;background:${isDark ? '#222' : '#f1f1f2'};display:flex;align-items:center;justify-content:center;color:${fg};font-weight:700;font-size:18px">${escapeHtml(props.name.charAt(0).toUpperCase())}</div>`;

  return {
    contentHtml: `
      <div style="display:flex;gap:12px;align-items:center">
        <div style="width:56px;height:56px;flex:none;position:relative">
          <div class="argo-tt-ring" style="position:absolute;inset:0;border-radius:50%;background:${TIKTOK_RING};padding:3px;transform-origin:50% 50%"><div style="width:100%;height:100%;border-radius:50%;background:${bg};padding:2px"><div style="width:100%;height:100%;border-radius:50%;overflow:hidden">${innerAvatar}</div></div></div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:${fg};font-size:15px;line-height:1.2">${escapeHtml(props.name)}</div>
          <div style="color:${muted};font-size:13px;margin-top:2px">${escapeHtml(props.handle)}</div>
        </div>
        <div class="argo-tt-follow-btn" style="padding:8px 18px;border-radius:6px;background:#fe2c55;color:#fff;font-size:13px;font-weight:700;border:none;flex:none;letter-spacing:0.01em">Follow</div>
      </div>
    `.trim(),
    styles: {
      background: bg,
      backdropFilter: 'blur(20px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
      padding: '12px 14px',
      borderRadius: '16px',
      maxWidth: '380px',
      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
      fontFamily: '-apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif',
    },
  };
}

const defaultMotion: GsapMotion = {
  type: 'gsap',
  in: {
    from: { x: 60, opacity: 0 },
    duration: 0.4,
    ease: 'power3.out',
  },
  loop: {
    to: { rotation: 360 },
    duration: 6,
    repeat: -1,
    ease: 'none',
    target: '.argo-tt-ring',
  },
  out: {
    to: { x: 60, opacity: 0 },
    duration: 0.3,
    ease: 'power2.in',
  },
};

export const tiktokFollowBlock: BlockDefinition<TikTokFollowProps> = {
  id: 'tiktok-follow',
  version: '1.0.0',
  defaultProps: {
    handle: '@user',
    name: 'User',
  },
  render,
  defaultMotion,
};
