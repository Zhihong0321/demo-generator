import type { BlockDefinition } from '../types.js';
import type { TemplateResult } from '../../overlays/templates.js';
import type { BackgroundTheme } from '../../overlays/zones.js';
import { escapeHtml } from '../../html-escape.js';

export interface DataChartProps {
  type: 'bar' | 'line';
  title: string;
  values: number[];
  labels?: string[];
  accentColor?: string;
  [key: string]: unknown;
}

const CHART_W = 320;
const CHART_H = 140;
const PAD = 18;

function renderBars(values: number[], labels: string[] | undefined, accent: string, fg: string, muted: string): string {
  if (values.length === 0) return '<text x="50%" y="50%" text-anchor="middle" fill="' + muted + '" font-size="12">no data</text>';
  const max = Math.max(...values, 1);
  const innerW = CHART_W - PAD * 2;
  const innerH = CHART_H - PAD * 2 - 14;
  const barW = innerW / values.length - 6;

  const rects = values.map((v, i) => {
    const h = (v / max) * innerH;
    const x = PAD + i * (innerW / values.length) + 3;
    const y = PAD + (innerH - h);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${accent}" rx="2" />`;
  }).join('');

  const labelEls = (labels ?? []).map((label, i) => {
    const x = PAD + i * (innerW / values.length) + barW / 2 + 3;
    const y = CHART_H - 4;
    return `<text x="${x.toFixed(1)}" y="${y}" fill="${muted}" font-size="10" text-anchor="middle">${escapeHtml(label)}</text>`;
  }).join('');

  return rects + labelEls;
}

function renderLine(values: number[], accent: string, muted: string): string {
  if (values.length < 2) return '<text x="50%" y="50%" text-anchor="middle" fill="' + muted + '" font-size="12">need 2+ points</text>';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const innerW = CHART_W - PAD * 2;
  const innerH = CHART_H - PAD * 2;

  const points = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * innerW;
    const y = PAD + (1 - (v - min) / range) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `<polyline points="${points}" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;
}

function render(props: DataChartProps, theme: BackgroundTheme): TemplateResult {
  const isDark = theme === 'dark';
  const bg = isDark ? 'rgba(20,20,22,0.85)' : 'rgba(255,255,255,0.9)';
  const fg = isDark ? '#f5f5f7' : '#1a1a1a';
  const muted = isDark ? 'rgba(245,245,247,0.55)' : 'rgba(26,26,26,0.55)';
  const accent = escapeHtml(props.accentColor ?? '#22c55e');

  const inner = props.type === 'line'
    ? renderLine(props.values, accent, muted)
    : renderBars(props.values, props.labels, accent, fg, muted);

  const latest = props.values.length > 0 ? props.values[props.values.length - 1] : undefined;

  return {
    contentHtml: `
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:8px">
        <div style="font-size:13px;font-weight:600;color:${fg};text-transform:uppercase;letter-spacing:0.06em">${escapeHtml(props.title)}</div>
        ${latest !== undefined ? `<div style="font-size:20px;font-weight:700;color:${accent};line-height:1">${latest.toLocaleString()}</div>` : ''}
      </div>
      <svg viewBox="0 0 ${CHART_W} ${CHART_H}" width="100%" height="${CHART_H}" style="display:block">${inner}</svg>
    `.trim(),
    styles: {
      background: bg,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      padding: '16px 18px 10px',
      borderRadius: '12px',
      maxWidth: '380px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
      boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.08)',
    },
  };
}

export const dataChartBlock: BlockDefinition<DataChartProps> = {
  id: 'data-chart',
  version: '1.0.0',
  defaultProps: { type: 'bar', title: '', values: [], accentColor: '#22c55e' },
  render,
};
