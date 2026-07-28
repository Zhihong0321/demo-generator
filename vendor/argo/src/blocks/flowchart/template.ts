import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';
import type { GsapMotion } from '../../overlays/gsap-motion.js';
import { escapeHtml } from '../../html-escape.js';

export type FlowchartNodeKind = 'default' | 'success' | 'warn' | 'accent';

export interface FlowchartNode {
  label: string;
  kind?: FlowchartNodeKind;
}

export interface FlowchartProps {
  title?: string;
  nodes: FlowchartNode[];
  accentColor?: string;
  [key: string]: unknown;
}

function nodeColors(kind: FlowchartNodeKind | undefined, isDark: boolean, accent: string): { bg: string; border: string; fg: string } {
  switch (kind) {
    case 'success':
      return { bg: isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)', border: '#22c55e', fg: isDark ? '#86efac' : '#15803d' };
    case 'warn':
      return { bg: isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.1)', border: '#f59e0b', fg: isDark ? '#fcd34d' : '#b45309' };
    case 'accent':
      return { bg: isDark ? `${accent}26` : `${accent}1a`, border: accent, fg: isDark ? '#fff' : accent };
    case 'default':
    default:
      return {
        bg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        border: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)',
        fg: isDark ? '#f5f5f7' : '#1a1a1f',
      };
  }
}

function render(props: FlowchartProps, theme: BackgroundTheme): TemplateResult {
  const isDark = theme === 'dark';
  const bg = isDark ? 'rgba(15,15,17,0.85)' : 'rgba(255,255,255,0.94)';
  const fg = isDark ? '#f5f5f7' : '#1a1a1f';
  const accent = props.accentColor ?? '#0ea5e9';
  const nodes = Array.isArray(props.nodes) ? props.nodes : [];

  const titleHtml = props.title
    ? `<div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${accent};margin-bottom:14px;text-align:center">${escapeHtml(props.title)}</div>`
    : '';

  const arrowSvg = `<svg viewBox="0 0 12 16" width="12" height="16" style="display:block;margin:6px auto;flex:none;opacity:0.7"><path d="M6 0 L6 12 M2 8 L6 12 L10 8" stroke="${isDark ? '#f5f5f7' : '#1a1a1f'}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

  const nodeHtmls: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const colors = nodeColors(node.kind, isDark, accent);
    nodeHtmls.push(
      `<div class="argo-flow-node" style="background:${colors.bg};border:1.5px solid ${colors.border};color:${colors.fg};padding:10px 16px;border-radius:10px;font-size:14px;font-weight:600;text-align:center;min-width:140px">${escapeHtml(node.label)}</div>`,
    );
    if (i < nodes.length - 1) {
      nodeHtmls.push(`<div class="argo-flow-arrow">${arrowSvg}</div>`);
    }
  }

  return {
    contentHtml: `
      <div style="display:flex;flex-direction:column;align-items:center">
        ${titleHtml}
        ${nodeHtmls.join('')}
      </div>
    `.trim(),
    styles: {
      background: bg,
      backdropFilter: 'blur(20px) saturate(1.6)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
      padding: '20px 24px',
      borderRadius: '16px',
      maxWidth: '300px',
      color: fg,
      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
      boxShadow: isDark ? '0 12px 40px rgba(0,0,0,0.5)' : '0 12px 40px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    },
  };
}

const defaultMotion: GsapMotion = {
  type: 'gsap',
  in: {
    from: { opacity: 0, y: 12 },
    duration: 0.35,
    ease: 'power2.out',
    stagger: 0.08,
    target: '.argo-flow-node, .argo-flow-arrow',
  },
  out: {
    to: { opacity: 0 },
    duration: 0.3,
    ease: 'power1.in',
  },
};

export const flowchartBlock: BlockDefinition<FlowchartProps> = {
  id: 'flowchart',
  version: '1.0.0',
  defaultProps: {
    nodes: [],
    accentColor: '#0ea5e9',
  },
  render,
  defaultMotion,
};
