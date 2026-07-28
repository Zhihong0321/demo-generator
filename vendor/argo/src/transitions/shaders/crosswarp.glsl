// Adapted from https://gl-transitions.com/editor/crosswarp
// Author: Eke Péter (MIT)
precision mediump float;
uniform sampler2D from;
uniform sampler2D to;
uniform float progress;
varying vec2 vUv;

void main() {
  float x = progress;
  x = smoothstep(0.0, 1.0, (x * 2.0 + vUv.x - 1.0));
  gl_FragColor = mix(texture2D(from, (vUv - 0.5) * (1.0 - x) + 0.5), texture2D(to, (vUv - 0.5) * x + 0.5), x);
}
