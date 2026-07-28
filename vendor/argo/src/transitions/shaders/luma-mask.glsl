// Directional luma wipe with soft edge.
// Based on gl-transitions LinearBlur (MIT, gre)
precision mediump float;
uniform sampler2D from;
uniform sampler2D to;
uniform float progress;
varying vec2 vUv;

void main() {
  float mask = vUv.x;  // left-to-right wipe
  float threshold = 0.08;
  float blend = smoothstep(progress - threshold, progress + threshold, mask);
  gl_FragColor = mix(texture2D(to, vUv), texture2D(from, vUv), blend);
}
