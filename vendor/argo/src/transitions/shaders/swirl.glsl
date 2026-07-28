// Adapted from https://gl-transitions.com/editor/Swirl
// Author: Sergey Kosarevsky (MIT)
precision mediump float;
uniform sampler2D from;
uniform sampler2D to;
uniform float progress;
varying vec2 vUv;

void main() {
  float duration = 0.4;
  float maxAlpha = 0.4;
  float maxBrightness = 0.95;
  float prog = progress;
  float circRadius = 0.5;

  vec2 p = vUv - vec2(0.5, 0.5);
  float dist = length(p);

  if (dist < circRadius) {
    float percent = (circRadius - dist) / circRadius;
    float a = (prog <= 0.5) ? mix(0.0, 1.0, prog / 0.5) : mix(1.0, 0.0, (prog - 0.5) / 0.5);
    float rot = radians(360.0 * a * percent);
    float s = sin(rot);
    float c = cos(rot);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }
  p += vec2(0.5, 0.5);

  vec4 fromC = texture2D(from, p);
  vec4 toC = texture2D(to, p);
  float brightness = (prog < 0.5) ? maxBrightness * prog * 2.0 : maxBrightness * (1.0 - prog) * 2.0;
  gl_FragColor = mix(fromC, toC, prog) + vec4(brightness);
}
