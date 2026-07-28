// Adapted from https://gl-transitions.com/editor/ripple
// Author: gre (MIT)
precision mediump float;
uniform sampler2D from;
uniform sampler2D to;
uniform float progress;
varying vec2 vUv;

const float amplitude = 100.0;
const float speed = 50.0;

void main() {
  vec2 dir = vUv - vec2(0.5);
  float dist = length(dir);
  vec2 offset = dir * (sin(progress * dist * amplitude - progress * speed) + 0.5) / 30.0;
  gl_FragColor = mix(
    texture2D(from, vUv + offset),
    texture2D(to, vUv),
    smoothstep(0.2, 1.0, progress)
  );
}
