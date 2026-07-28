// Film-style light leak transition.
// Blends through a bright warm flash at the midpoint.
precision mediump float;
uniform sampler2D from;
uniform sampler2D to;
uniform float progress;
varying vec2 vUv;

void main() {
  vec4 a = texture2D(from, vUv);
  vec4 b = texture2D(to, vUv);
  // Triangle wave peaks at progress=0.5
  float flash = 1.0 - abs(progress - 0.5) * 2.0;
  flash = pow(flash, 2.0);
  vec3 warm = vec3(1.0, 0.85, 0.6);
  vec3 mixed = mix(a.rgb, b.rgb, smoothstep(0.3, 0.7, progress));
  gl_FragColor = vec4(mix(mixed, warm, flash * 0.9), 1.0);
}
