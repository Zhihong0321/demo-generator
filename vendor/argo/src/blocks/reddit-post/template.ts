import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';
import type { GsapMotion } from '../../overlays/gsap-motion.js';
import { escapeHtml } from '../../html-escape.js';

export interface RedditPostProps {
  subreddit: string;
  author: string;
  timestamp?: string;
  title: string;
  body?: string;
  upvotes?: number;
  comments?: number;
  [key: string]: unknown;
}

function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
}

function render(props: RedditPostProps, theme: BackgroundTheme): TemplateResult {
  const isDark = theme === 'dark';
  const bg = isDark ? '#1a1a1b' : '#ffffff';
  const fg = isDark ? '#d7dadc' : '#1a1a1b';
  const muted = isDark ? '#818384' : '#787c7e';
  const border = isDark ? '#343536' : '#edeff1';
  const subBg = isDark ? '#272729' : '#f6f7f8';

  const ts = props.timestamp ?? '1h ago';
  const upvotes = props.upvotes ?? 0;
  const comments = props.comments ?? 0;

  const bodyHtml = props.body
    ? `<div style="color:${fg};opacity:0.9;font-size:13px;line-height:1.45;margin-top:8px;word-wrap:break-word">${escapeHtml(props.body)}</div>`
    : '';

  return {
    contentHtml: `
      <div style="display:flex;gap:10px;align-items:flex-start">
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:none;padding-top:2px;color:${muted}">
          <svg viewBox="0 0 20 20" width="16" height="16" style="fill:currentColor"><path d="M10 3 3 12h4v5h6v-5h4z"/></svg>
          <span class="argo-reddit-upvotes" style="font-size:12px;font-weight:700;color:${isDark ? '#ff4500' : '#ff4500'}">${escapeHtml(formatCount(upvotes))}</span>
          <svg viewBox="0 0 20 20" width="16" height="16" style="fill:currentColor;transform:rotate(180deg)"><path d="M10 3 3 12h4v5h6v-5h4z"/></svg>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:${muted}">
            <span style="font-weight:700;color:${fg}">${escapeHtml(props.subreddit)}</span>
            <span>·</span>
            <span>Posted by ${escapeHtml(props.author)}</span>
            <span>·</span>
            <span>${escapeHtml(ts)}</span>
          </div>
          <div style="font-size:16px;font-weight:600;color:${fg};margin-top:6px;line-height:1.3;word-wrap:break-word">${escapeHtml(props.title)}</div>
          ${bodyHtml}
          <div style="display:flex;gap:12px;margin-top:10px;color:${muted};font-size:12px;font-weight:700">
            <span style="background:${subBg};padding:4px 8px;border-radius:4px">💬 ${escapeHtml(formatCount(comments))} comments</span>
            <span style="background:${subBg};padding:4px 8px;border-radius:4px">↗ Share</span>
          </div>
        </div>
      </div>
    `.trim(),
    styles: {
      background: bg,
      color: fg,
      padding: '14px',
      borderRadius: '6px',
      border: `1px solid ${border}`,
      maxWidth: '460px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.12)',
    },
  };
}

const defaultMotion: GsapMotion = {
  type: 'gsap',
  in: {
    from: { opacity: 0, y: 24 },
    duration: 0.4,
    ease: 'power2.out',
  },
  out: {
    to: { opacity: 0 },
    duration: 0.25,
    ease: 'power1.in',
  },
};

export const redditPostBlock: BlockDefinition<RedditPostProps> = {
  id: 'reddit-post',
  version: '1.0.0',
  defaultProps: {
    subreddit: 'r/technology',
    author: 'u/user',
    timestamp: '1h ago',
    title: '',
    upvotes: 0,
    comments: 0,
  },
  render,
  defaultMotion,
};
