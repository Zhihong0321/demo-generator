import { describe, it, expect } from 'vitest';
import { BLOCK_REGISTRY, isValidBlockName, getBlock } from '../../src/blocks/index.js';
import type { OverlayCue } from '../../src/overlays/types.js';
import { renderTemplate } from '../../src/overlays/templates.js';

describe('block registry', () => {
  it('exposes a frozen registry object', () => {
    expect(Object.isFrozen(BLOCK_REGISTRY)).toBe(true);
  });

  it('isValidBlockName returns false for unknown names', () => {
    expect(isValidBlockName('nonexistent-block')).toBe(false);
  });

  it('getBlock throws for unknown names', () => {
    expect(() => getBlock('nonexistent-block' as never)).toThrow(/unknown block/i);
  });
});

describe('CustomBlockCue', () => {
  it('accepts type="block" in OverlayCue union', () => {
    // Compile-time check: this assignment is the test.
    const cue: OverlayCue = {
      type: 'block',
      block: 'x-post' as never, // real name will exist after Task 3
      props: { handle: '@test' },
    };
    expect(cue.type).toBe('block');
  });
});

describe('x-post block', () => {
  it('renders handle, name, and body', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'x-post',
      props: {
        handle: '@jane',
        name: 'Jane Doe',
        body: 'this is exactly what I needed',
        timestamp: '2m',
      },
    }, 'dark');

    expect(result.contentHtml).toContain('Jane Doe');
    expect(result.contentHtml).toContain('@jane');
    expect(result.contentHtml).toContain('this is exactly what I needed');
    expect(result.contentHtml).toContain('2m');
  });

  it('escapes HTML in user-provided fields', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'x-post',
      props: {
        handle: '@x',
        name: '<script>alert(1)</script>',
        body: 'ok',
        timestamp: 'now',
      },
    }, 'dark');
    expect(result.contentHtml).not.toContain('<script>');
    expect(result.contentHtml).toContain('&lt;script&gt;');
  });

  it('applies defaults for missing optional props', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'x-post',
      props: { handle: '@x', name: 'X', body: 'hi' },
    }, 'dark');
    expect(result.contentHtml).toContain('X');
  });

  it('escapes avatar URL to prevent attribute injection', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'x-post',
      props: {
        handle: '@x',
        name: 'X',
        body: 'hi',
        avatar: 'javascript:alert(1)" onerror="alert(2)',
      },
    }, 'dark');
    // The raw unescaped attacker payload must NOT appear
    expect(result.contentHtml).not.toContain('" onerror="');
    // The escaped version IS allowed (browser treats it as literal text in src attribute)
    expect(result.contentHtml).toContain('&quot; onerror=&quot;');
  });
});

describe('macos-notification block', () => {
  it('renders app name, title, body, timestamp', () => {
    const result = renderTemplate({
      type: 'block', block: 'macos-notification',
      props: { appName: 'Argo', title: 'New signup', body: 'jane@example.com just joined', timestamp: 'now' },
    }, 'dark');
    expect(result.contentHtml).toContain('Argo');
    expect(result.contentHtml).toContain('New signup');
    expect(result.contentHtml).toContain('jane@example.com');
  });

  it('escapes HTML in all fields', () => {
    const result = renderTemplate({
      type: 'block', block: 'macos-notification',
      props: { appName: '<img onerror=1>', title: 'T', body: 'B', timestamp: 'now' },
    }, 'dark');
    expect(result.contentHtml).not.toContain('<img onerror');
  });
});

describe('yt-lower-third block', () => {
  it('renders name + subtitle with accent bar', () => {
    const result = renderTemplate({
      type: 'block', block: 'yt-lower-third',
      props: { name: 'Jane Doe', subtitle: 'Engineering Lead', accentColor: '#ef4444' },
    }, 'dark');
    expect(result.contentHtml).toContain('Jane Doe');
    expect(result.contentHtml).toContain('Engineering Lead');
    expect(result.contentHtml).toContain('#ef4444');
  });

  it('uses default accent when accentColor missing', () => {
    const result = renderTemplate({
      type: 'block', block: 'yt-lower-third',
      props: { name: 'J', subtitle: 'S' },
    }, 'dark');
    expect(result.contentHtml).toContain('J');
  });
});

describe('data-chart block', () => {
  it('renders title and SVG bars for type=bar', () => {
    const result = renderTemplate({
      type: 'block', block: 'data-chart',
      props: { type: 'bar', title: 'Signups', values: [10, 25, 40, 32, 55], labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
    }, 'dark');
    expect(result.contentHtml).toContain('Signups');
    expect(result.contentHtml).toContain('<svg');
    expect(result.contentHtml).toContain('<rect');
  });

  it('renders SVG polyline for type=line', () => {
    const result = renderTemplate({
      type: 'block', block: 'data-chart',
      props: { type: 'line', title: 'MRR', values: [100, 150, 220, 300] },
    }, 'dark');
    expect(result.contentHtml).toContain('<polyline');
  });

  it('handles empty values array without crashing', () => {
    const result = renderTemplate({
      type: 'block', block: 'data-chart',
      props: { type: 'bar', title: 'Empty', values: [] },
    }, 'dark');
    expect(result.contentHtml).toContain('Empty');
  });

  it('escapes malicious accentColor to prevent SVG attribute injection', () => {
    const result = renderTemplate({
      type: 'block',
      block: 'data-chart',
      props: {
        type: 'bar',
        title: 'T',
        values: [1, 2, 3],
        accentColor: '#f00" /><script>alert(1)</script>',
      },
    }, 'dark');
    expect(result.contentHtml).not.toContain('<script>alert(1)</script>');
    expect(result.contentHtml).not.toContain('" /><script>');
  });
});

describe('spotify-card block', () => {
  it('renders track, artist, and progress bar', () => {
    const result = renderTemplate({
      type: 'block', block: 'spotify-card',
      props: { track: 'Bohemian Rhapsody', artist: 'Queen', elapsed: 120, total: 354 },
    }, 'dark');
    expect(result.contentHtml).toContain('Bohemian Rhapsody');
    expect(result.contentHtml).toContain('Queen');
    expect(result.contentHtml).toContain('2:00');
    expect(result.contentHtml).toContain('5:54');
  });

  it('clamps progress to [0,1]', () => {
    const result = renderTemplate({
      type: 'block', block: 'spotify-card',
      props: { track: 'T', artist: 'A', elapsed: 999, total: 100 },
    }, 'dark');
    expect(result.contentHtml).not.toContain('width:999%');
  });
});

describe('instagram-follow block', () => {
  it('renders handle, name, and a Follow button by default', () => {
    const result = renderTemplate({
      type: 'block', block: 'instagram-follow',
      props: { handle: '@jane', name: 'Jane Doe' },
    }, 'dark');
    expect(result.contentHtml).toContain('Jane Doe');
    expect(result.contentHtml).toContain('@jane');
    expect(result.contentHtml).toContain('Follow</div>');
    expect(result.contentHtml).toContain('argo-ig-follow-btn');
  });

  it('renders Following state when isFollowing=true', () => {
    const result = renderTemplate({
      type: 'block', block: 'instagram-follow',
      props: { handle: '@jane', name: 'Jane Doe', isFollowing: true },
    }, 'dark');
    expect(result.contentHtml).toContain('Following');
  });

  it('renders verified badge when verified=true', () => {
    const result = renderTemplate({
      type: 'block', block: 'instagram-follow',
      props: { handle: '@j', name: 'J', verified: true },
    }, 'dark');
    expect(result.contentHtml).toContain('<svg');
  });

  it('escapes HTML in all fields', () => {
    const result = renderTemplate({
      type: 'block', block: 'instagram-follow',
      props: { handle: '@x', name: '<script>a</script>' },
    }, 'dark');
    expect(result.contentHtml).not.toContain('<script>a</script>');
    expect(result.contentHtml).toContain('&lt;script&gt;');
  });

  it('ships a GSAP defaultMotion with in/out/loop phases', () => {
    const block = getBlock('instagram-follow');
    expect(block.defaultMotion).toBeTruthy();
    const motion = block.defaultMotion as { type: string; in?: unknown; out?: unknown; loop?: unknown };
    expect(motion.type).toBe('gsap');
    expect(motion.in).toBeTruthy();
    expect(motion.out).toBeTruthy();
    expect(motion.loop).toBeTruthy();
  });
});

describe('tiktok-follow block', () => {
  it('renders handle, name, and a Follow button', () => {
    const result = renderTemplate({
      type: 'block', block: 'tiktok-follow',
      props: { handle: '@jane', name: 'Jane Doe' },
    }, 'dark');
    expect(result.contentHtml).toContain('Jane Doe');
    expect(result.contentHtml).toContain('@jane');
    expect(result.contentHtml).toContain('Follow');
    expect(result.contentHtml).toContain('argo-tt-ring');
  });

  it('escapes HTML in fields', () => {
    const result = renderTemplate({
      type: 'block', block: 'tiktok-follow',
      props: { handle: '@x', name: '<img src=x>' },
    }, 'dark');
    expect(result.contentHtml).not.toContain('<img src=x>');
  });

  it('ships a rotation loop targeting the ring', () => {
    const block = getBlock('tiktok-follow');
    const motion = block.defaultMotion as { loop?: { target?: string; to?: { rotation?: number } } };
    expect(motion.loop?.target).toBe('.argo-tt-ring');
    expect(motion.loop?.to?.rotation).toBe(360);
  });
});

describe('reddit-post block', () => {
  it('renders subreddit, author, title, and counts', () => {
    const result = renderTemplate({
      type: 'block', block: 'reddit-post',
      props: {
        subreddit: 'r/tech', author: 'u/alice', title: 'A great post',
        timestamp: '3h ago', upvotes: 1200, comments: 84,
      },
    }, 'light');
    expect(result.contentHtml).toContain('r/tech');
    expect(result.contentHtml).toContain('u/alice');
    expect(result.contentHtml).toContain('A great post');
    expect(result.contentHtml).toContain('3h ago');
    expect(result.contentHtml).toContain('1.2k');
    expect(result.contentHtml).toContain('84');
  });

  it('formats six-digit counts in thousands, seven-digit in millions', () => {
    const r1 = renderTemplate({
      type: 'block', block: 'reddit-post',
      props: { subreddit: 'r/x', author: 'u/a', title: 't', upvotes: 123456, comments: 10 },
    }, 'dark');
    expect(r1.contentHtml).toContain('123.5k');

    const r2 = renderTemplate({
      type: 'block', block: 'reddit-post',
      props: { subreddit: 'r/x', author: 'u/a', title: 't', upvotes: 1_500_000, comments: 10 },
    }, 'dark');
    expect(r2.contentHtml).toContain('1.5M');
  });

  it('renders optional body when provided', () => {
    const result = renderTemplate({
      type: 'block', block: 'reddit-post',
      props: {
        subreddit: 'r/x', author: 'u/a', title: 't',
        body: 'Post body text here', upvotes: 1, comments: 0,
      },
    }, 'dark');
    expect(result.contentHtml).toContain('Post body text here');
  });

  it('escapes HTML in all fields', () => {
    const result = renderTemplate({
      type: 'block', block: 'reddit-post',
      props: {
        subreddit: '<script>1</script>', author: 'u/a', title: '<b>t</b>', upvotes: 0, comments: 0,
      },
    }, 'dark');
    expect(result.contentHtml).not.toContain('<script>1</script>');
    expect(result.contentHtml).not.toContain('<b>t</b>');
  });
});

describe('logo-outro block', () => {
  it('renders title and tagline when provided', () => {
    const result = renderTemplate({
      type: 'block', block: 'logo-outro',
      props: { title: 'Argo', tagline: 'Demo videos, locally', accentColor: '#0ea5e9' },
    }, 'dark');
    expect(result.contentHtml).toContain('Argo');
    expect(result.contentHtml).toContain('Demo videos, locally');
    expect(result.contentHtml).toContain('#0ea5e9');
  });

  it('renders logo mark image when logo URL provided', () => {
    const result = renderTemplate({
      type: 'block', block: 'logo-outro',
      props: { title: 'X', logo: 'https://example.com/logo.png' },
    }, 'dark');
    expect(result.contentHtml).toContain('<img');
    expect(result.contentHtml).toContain('https://example.com/logo.png');
  });

  it('falls back to initial-letter mark when no logo provided', () => {
    const result = renderTemplate({
      type: 'block', block: 'logo-outro',
      props: { title: 'Argo' },
    }, 'dark');
    expect(result.contentHtml).toContain('>A</div>');
  });

  it('ships a scale-in entrance motion', () => {
    const block = getBlock('logo-outro');
    const motion = block.defaultMotion as { type: string; in?: { from?: { scale?: number } } };
    expect(motion.type).toBe('gsap');
    expect(motion.in?.from?.scale).toBeLessThan(1);
  });

  it('escapes HTML in title and tagline', () => {
    const result = renderTemplate({
      type: 'block', block: 'logo-outro',
      props: { title: '<b>T</b>', tagline: '<i>tag</i>' },
    }, 'dark');
    expect(result.contentHtml).not.toContain('<b>T</b>');
    expect(result.contentHtml).not.toContain('<i>tag</i>');
  });
});

describe('flowchart block', () => {
  it('renders title and one node per entry, with arrows between', () => {
    const result = renderTemplate({
      type: 'block', block: 'flowchart',
      props: {
        title: 'Pipeline',
        nodes: [{ label: 'Start' }, { label: 'Build', kind: 'accent' }, { label: 'Done', kind: 'success' }],
      },
    }, 'dark');
    expect(result.contentHtml).toContain('Pipeline');
    expect(result.contentHtml).toContain('Start');
    expect(result.contentHtml).toContain('Build');
    expect(result.contentHtml).toContain('Done');
    // 3 nodes → 2 arrows
    const arrowCount = (result.contentHtml.match(/argo-flow-arrow/g) ?? []).length;
    expect(arrowCount).toBe(2);
  });

  it('handles empty nodes array without crashing', () => {
    const result = renderTemplate({
      type: 'block', block: 'flowchart',
      props: { nodes: [] },
    }, 'dark');
    expect(result.contentHtml).not.toContain('argo-flow-node');
  });

  it('escapes HTML in node labels', () => {
    const result = renderTemplate({
      type: 'block', block: 'flowchart',
      props: { nodes: [{ label: '<script>1</script>' }] },
    }, 'dark');
    expect(result.contentHtml).not.toContain('<script>1</script>');
    expect(result.contentHtml).toContain('&lt;script&gt;');
  });

  it('uses success color for kind=success', () => {
    const result = renderTemplate({
      type: 'block', block: 'flowchart',
      props: { nodes: [{ label: 'OK', kind: 'success' }] },
    }, 'dark');
    expect(result.contentHtml).toContain('#22c55e');
  });

  it('staggers reveal across nodes and arrows', () => {
    const block = getBlock('flowchart');
    const motion = block.defaultMotion as { in?: { stagger?: number; target?: string } };
    expect(motion.in?.stagger).toBeGreaterThan(0);
    expect(motion.in?.target).toContain('argo-flow-node');
  });
});

describe('app-showcase block', () => {
  it('renders title, subtitle, and CTA', () => {
    const result = renderTemplate({
      type: 'block', block: 'app-showcase',
      props: { title: 'Argo', subtitle: 'Demo videos, locally', cta: 'Get started' },
    }, 'dark');
    expect(result.contentHtml).toContain('Argo');
    expect(result.contentHtml).toContain('Demo videos, locally');
    expect(result.contentHtml).toContain('Get started');
  });

  it('renders provided hero image when image prop set', () => {
    const result = renderTemplate({
      type: 'block', block: 'app-showcase',
      props: { title: 'X', image: 'https://example.com/icon.png' },
    }, 'dark');
    expect(result.contentHtml).toContain('https://example.com/icon.png');
    expect(result.contentHtml).toContain('argo-app-hero');
  });

  it('falls back to gradient initial when no image', () => {
    const result = renderTemplate({
      type: 'block', block: 'app-showcase',
      props: { title: 'Argo' },
    }, 'dark');
    expect(result.contentHtml).toContain('>A</div>');
    expect(result.contentHtml).not.toContain('<img');
  });

  it('omits CTA pill when prop missing', () => {
    const result = renderTemplate({
      type: 'block', block: 'app-showcase',
      props: { title: 'Argo' },
    }, 'dark');
    expect(result.contentHtml).not.toContain('argo-app-cta');
  });

  it('ships a hero float loop', () => {
    const block = getBlock('app-showcase');
    const motion = block.defaultMotion as { loop?: { target?: string } };
    expect(motion.loop?.target).toBe('.argo-app-hero');
  });

  it('escapes HTML in all fields', () => {
    const result = renderTemplate({
      type: 'block', block: 'app-showcase',
      props: { title: '<b>T</b>', subtitle: '<i>s</i>', cta: '<u>c</u>' },
    }, 'dark');
    expect(result.contentHtml).not.toContain('<b>T</b>');
    expect(result.contentHtml).not.toContain('<i>s</i>');
    expect(result.contentHtml).not.toContain('<u>c</u>');
  });
});

describe('ui-3d-reveal block', () => {
  it('renders the image with the 3d hook class', () => {
    const result = renderTemplate({
      type: 'block', block: 'ui-3d-reveal',
      props: { image: 'https://example.com/screen.png', caption: 'Dashboard' },
    }, 'dark');
    expect(result.contentHtml).toContain('https://example.com/screen.png');
    expect(result.contentHtml).toContain('argo-3d-image');
    expect(result.contentHtml).toContain('Dashboard');
  });

  it('omits caption when not provided', () => {
    const result = renderTemplate({
      type: 'block', block: 'ui-3d-reveal',
      props: { image: 'https://example.com/screen.png' },
    }, 'dark');
    expect(result.contentHtml).not.toContain('argo-3d-caption');
  });

  it('uses provided perspective px value', () => {
    const result = renderTemplate({
      type: 'block', block: 'ui-3d-reveal',
      props: { image: 'x.png', perspective: 800 },
    }, 'dark');
    expect(result.contentHtml).toContain('perspective:800px');
  });

  it('falls back to default perspective when invalid', () => {
    const result = renderTemplate({
      type: 'block', block: 'ui-3d-reveal',
      props: { image: 'x.png', perspective: -1 },
    }, 'dark');
    expect(result.contentHtml).toContain('perspective:1200px');
  });

  it('ships a 3d entrance targeting the image', () => {
    const block = getBlock('ui-3d-reveal');
    const motion = block.defaultMotion as { in?: { target?: string; from?: { rotationX?: number } } };
    expect(motion.in?.target).toBe('.argo-3d-image');
    expect(motion.in?.from?.rotationX).toBeGreaterThan(0);
  });

  it('escapes HTML in image URL and caption', () => {
    const result = renderTemplate({
      type: 'block', block: 'ui-3d-reveal',
      props: { image: '"><script>alert(1)</script>', caption: '<b>c</b>' },
    }, 'dark');
    expect(result.contentHtml).not.toContain('"><script>');
    expect(result.contentHtml).not.toContain('<b>c</b>');
  });
});
