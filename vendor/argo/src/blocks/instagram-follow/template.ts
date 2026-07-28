import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';
import type { GsapMotion } from '../../overlays/gsap-motion.js';
import { escapeHtml } from '../../html-escape.js';

export interface InstagramFollowProps {
  handle: string;
  name: string;
  avatar?: string;
  isFollowing?: boolean;
  verified?: boolean;
  [key: string]: unknown;
}

const INSTAGRAM_GRADIENT = 'linear-gradient(45deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)';

function render(props: InstagramFollowProps, theme: BackgroundTheme): TemplateResult {
  const isDark = theme === 'dark';
  const bg = isDark ? 'rgba(0,0,0,0.82)' : 'rgba(255,255,255,0.92)';
  const fg = isDark ? '#fafafa' : '#262626';
  const muted = isDark ? 'rgba(250,250,250,0.65)' : 'rgba(38,38,38,0.6)';

  const avatarHtml = props.avatar
    ? `<div style="width:48px;height:48px;border-radius:50%;flex:none;padding:2px;background:${INSTAGRAM_GRADIENT}"><img src="${escapeHtml(props.avatar)}" alt="" style="width:100%;height:100%;border-radius:50%;display:block;border:2px solid ${isDark ? '#000' : '#fff'}" /></div>`
    : `<div style="width:48px;height:48px;border-radius:50%;flex:none;padding:2px;background:${INSTAGRAM_GRADIENT}"><div style="width:100%;height:100%;border-radius:50%;background:${isDark ? '#000' : '#fff'};display:flex;align-items:center;justify-content:center;color:${fg};font-weight:700;font-size:18px">${escapeHtml(props.name.charAt(0).toUpperCase())}</div></div>`;

  const verifiedHtml = props.verified
    ? `<svg viewBox="0 0 24 24" width="14" height="14" style="fill:#0095f6;flex:none;margin-left:4px"><path d="M12 2c-.7 0-1.4.3-1.9.8L8.5 4.4l-2.2-.2c-.7-.1-1.4.2-1.9.7s-.8 1.2-.7 1.9l.2 2.2-1.6 1.5c-.5.5-.8 1.2-.8 1.9s.3 1.4.8 1.9l1.6 1.5-.2 2.2c-.1.7.2 1.4.7 1.9s1.2.8 1.9.7l2.2-.2 1.5 1.6c.5.5 1.2.8 1.9.8s1.4-.3 1.9-.8l1.5-1.6 2.2.2c.7.1 1.4-.2 1.9-.7s.8-1.2.7-1.9l-.2-2.2 1.6-1.5c.5-.5.8-1.2.8-1.9s-.3-1.4-.8-1.9l-1.6-1.5.2-2.2c.1-.7-.2-1.4-.7-1.9s-1.2-.8-1.9-.7l-2.2.2-1.5-1.6C13.4 2.3 12.7 2 12 2zm4.7 7.3-5.4 5.4c-.2.2-.5.3-.7.3s-.5-.1-.7-.3l-2.7-2.7c-.4-.4-.4-1 0-1.4s1-.4 1.4 0l2 2 4.7-4.7c.4-.4 1-.4 1.4 0s.4 1 0 1.4z"/></svg>`
    : '';

  const buttonHtml = props.isFollowing
    ? `<div class="argo-ig-follow-btn" style="padding:6px 14px;border-radius:8px;background:${isDark ? '#262626' : '#efefef'};color:${fg};font-size:13px;font-weight:600;border:none;flex:none">Following</div>`
    : `<div class="argo-ig-follow-btn" style="padding:6px 16px;border-radius:8px;background:#0095f6;color:#fff;font-size:13px;font-weight:600;border:none;flex:none">Follow</div>`;

  return {
    contentHtml: `
      <div style="display:flex;gap:12px;align-items:center">
        ${avatarHtml}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;line-height:1.2">
            <span style="font-weight:600;color:${fg};font-size:14px">${escapeHtml(props.name)}</span>
            ${verifiedHtml}
          </div>
          <div style="color:${muted};font-size:13px;margin-top:2px">${escapeHtml(props.handle)} · started following</div>
        </div>
        ${buttonHtml}
      </div>
    `.trim(),
    styles: {
      background: bg,
      backdropFilter: 'blur(20px) saturate(1.6)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
      padding: '12px 14px',
      borderRadius: '14px',
      maxWidth: '380px',
      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    },
  };
}

const defaultMotion: GsapMotion = {
  type: 'gsap',
  in: {
    from: { y: 40, opacity: 0, scale: 0.95 },
    duration: 0.45,
    ease: 'back.out',
  },
  loop: {
    to: { scale: 1.06 },
    duration: 0.9,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
    target: '.argo-ig-follow-btn',
  },
  out: {
    to: { opacity: 0, y: -20 },
    duration: 0.3,
    ease: 'power2.in',
  },
};

export const instagramFollowBlock: BlockDefinition<InstagramFollowProps> = {
  id: 'instagram-follow',
  version: '1.0.0',
  defaultProps: {
    handle: '@user',
    name: 'User',
    isFollowing: false,
    verified: false,
  },
  render,
  defaultMotion,
};
