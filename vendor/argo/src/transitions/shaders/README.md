# Shader Transitions

WebGL fragment shaders used for cinematic scene transitions. Pre-rendered via Playwright Chromium at export time and composited into the output video as a PNG sequence.

## Attribution

All shaders are adapted from [gl-transitions.com](https://gl-transitions.com) unless otherwise noted. The gl-transitions project is MIT-licensed.

| Shader       | Original Author    | License |
|--------------|--------------------|---------|
| crosswarp    | Eke Péter          | MIT     |
| swirl        | Sergey Kosarevsky  | MIT     |
| ripple       | gre                | MIT     |
| luma-mask    | adapted from gre   | MIT     |
| light-leak   | Argo original      | MIT     |

All shaders use the gl-transitions fragment shader interface:

- `uniform sampler2D from` — outgoing scene last frame
- `uniform sampler2D to` — incoming scene first frame
- `uniform float progress` — 0..1 transition progress
- `varying vec2 vUv` — normalized coord
- Output: `gl_FragColor`
