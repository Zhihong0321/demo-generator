import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../../src/overlays/templates.js';

describe('renderTemplate', () => {
  describe('lower-third', () => {
    it('renders text in a styled span', () => {
      const result = renderTemplate({ type: 'lower-third', text: 'Hello world' });
      expect(result.contentHtml).toContain('Hello world');
      expect(result.styles.background).toBeDefined();
      expect(result.styles.borderRadius).toBeDefined();
    });
    it('includes maxWidth for readability', () => {
      const result = renderTemplate({ type: 'lower-third', text: 'Test' });
      expect(result.styles.maxWidth).toBeDefined();
    });
    it('escapes HTML in text', () => {
      const result = renderTemplate({ type: 'lower-third', text: '<script>alert("xss")</script>' });
      expect(result.contentHtml).not.toContain('<script>');
      expect(result.contentHtml).toContain('&lt;script&gt;');
    });
  });

  describe('headline-card', () => {
    it('renders title', () => {
      const result = renderTemplate({ type: 'headline-card', title: 'Big Title' });
      expect(result.contentHtml).toContain('Big Title');
    });
    it('renders kicker when provided', () => {
      const result = renderTemplate({ type: 'headline-card', title: 'Title', kicker: 'LABEL' });
      expect(result.contentHtml).toContain('LABEL');
    });
    it('renders body when provided', () => {
      const result = renderTemplate({ type: 'headline-card', title: 'Title', body: 'Details here' });
      expect(result.contentHtml).toContain('Details here');
    });
    it('omits kicker element when not provided', () => {
      const result = renderTemplate({ type: 'headline-card', title: 'Title' });
      expect(result.contentHtml).not.toContain('uppercase');
    });
    it('has backdrop blur style', () => {
      const result = renderTemplate({ type: 'headline-card', title: 'T' });
      expect(result.styles.backdropFilter).toContain('blur');
    });
  });

  describe('callout', () => {
    it('renders text in a compact bubble', () => {
      const result = renderTemplate({ type: 'callout', text: 'Note this' });
      expect(result.contentHtml).toContain('Note this');
      expect(result.styles.borderRadius).toBeDefined();
    });
  });

  describe('image-card', () => {
    it('renders img tag with src', () => {
      const result = renderTemplate({ type: 'image-card', src: 'http://localhost:9999/diagram.png' });
      expect(result.contentHtml).toContain('<img');
      expect(result.contentHtml).toContain('http://localhost:9999/diagram.png');
    });
    it('renders title when provided', () => {
      const result = renderTemplate({ type: 'image-card', src: 'http://x/img.png', title: 'Architecture' });
      expect(result.contentHtml).toContain('Architecture');
    });
    it('renders body when provided', () => {
      const result = renderTemplate({ type: 'image-card', src: 'http://x/img.png', body: 'Description' });
      expect(result.contentHtml).toContain('Description');
    });
  });

  describe('arrow', () => {
    it('renders an SVG arrow', () => {
      const result = renderTemplate({ type: 'arrow' });
      expect(result.contentHtml).toContain('<svg');
      expect(result.contentHtml).toContain('<path');
      expect(result.contentHtml).toContain('stroke=');
    });

    it('uses default red color and down direction', () => {
      const result = renderTemplate({ type: 'arrow' });
      expect(result.contentHtml).toContain('#ef4444');
    });

    it('renders with custom direction', () => {
      const result = renderTemplate({ type: 'arrow', direction: 'up' });
      // Up arrow path: M24 44 L24 8
      expect(result.contentHtml).toContain('M24 44');
    });

    it('renders with custom color', () => {
      const result = renderTemplate({ type: 'arrow', color: '#00ff00' });
      expect(result.contentHtml).toContain('#00ff00');
    });

    it('renders with custom size', () => {
      const result = renderTemplate({ type: 'arrow', size: 96 });
      expect(result.contentHtml).toContain('width="96"');
      expect(result.contentHtml).toContain('height="96"');
    });

    it('renders label text when provided', () => {
      const result = renderTemplate({ type: 'arrow', label: 'Look here' });
      expect(result.contentHtml).toContain('Look here');
    });

    it('escapes HTML in label text', () => {
      const result = renderTemplate({ type: 'arrow', label: '<script>xss</script>' });
      expect(result.contentHtml).not.toContain('<script>');
      expect(result.contentHtml).toContain('&lt;script&gt;');
    });

    it('has flex column layout styles', () => {
      const result = renderTemplate({ type: 'arrow' });
      expect(result.styles.display).toBe('flex');
      expect(result.styles.flexDirection).toBe('column');
      expect(result.styles.alignItems).toBe('center');
    });

    it('adapts text color to theme (inverted — no background panel)', () => {
      const dark = renderTemplate({ type: 'arrow', label: 'Test' }, 'dark');
      const light = renderTemplate({ type: 'arrow', label: 'Test' }, 'light');
      // Arrow has no bg panel — dark overlay (light page) gets dark text, light overlay (dark page) gets white text
      expect(dark.contentHtml).toContain('#1a1a1a');
      expect(light.contentHtml).toContain('#fff');
    });

    it('supports all 8 directions', () => {
      const directions = ['up', 'down', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right'] as const;
      for (const dir of directions) {
        const result = renderTemplate({ type: 'arrow', direction: dir });
        expect(result.contentHtml).toContain('<path');
      }
    });
  });
});
