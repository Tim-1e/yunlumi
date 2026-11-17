import * as THREE from 'three';

// Uniform objects shared by reference across every particle material.
export const U = {
  uTime: { value: 0 },
  uPixel: { value: 600 }, // drawingBufferHeight / (2 tan(fov/2)) — world size -> pixels
  uPR: { value: 1 },
  uPlayer: { value: new THREE.Vector3(0, 96, 0) },
  uPlayerColor: { value: new THREE.Color(1.0, 0.86, 0.55) },
  uPulse: { value: new THREE.Vector4(0, -999, 0, 99) }, // xyz centre, w age (s)
  uDawn: { value: 0 },
  uCam: { value: new THREE.Vector3() },
};

export const COMMON_VERT = /* glsl */ `
uniform float uTime;
uniform float uPixel;
uniform float uPR;
uniform vec3 uPlayer;
uniform vec3 uPlayerColor;
uniform vec4 uPulse;
uniform float uDawn;
uniform vec3 uCam;
varying vec3 vColor;
varying float vAlpha;

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }

float pointSize(vec4 mv, float s, inout float alpha) {
  float px = s * uPixel / max(0.3, -mv.z);
  if (px < 1.5) { alpha *= px / 1.5; px = 1.5; }
  return min(px, 200.0 * uPR);
}

float pulseWave(vec3 wp) {
  float age = uPulse.w;
  if (age > 3.0) return 0.0;
  float r = age * 120.0;
  float d = length(wp - uPulse.xyz);
  float x = (d - r) / 12.0;
  return exp(-x * x) * exp(-age * 1.1);
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
`;

export const GLOW_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0 || vAlpha <= 0.0) discard;
  float a = exp(-d * 4.0) * (1.0 - d);
  float core = exp(-d * 26.0);
  gl_FragColor = vec4(vColor * (a + core * 0.9), vAlpha);
}
`;

// Softer, core-less sprite for volumetric clouds.
export const SOFT_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0 || vAlpha <= 0.0) discard;
  float a = (1.0 - d);
  a *= a;
  gl_FragColor = vec4(vColor * a, vAlpha);
}
`;

// Alpha-blended dark sprite (ink).
export const INK_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0 || vAlpha <= 0.0) discard;
  float a = (1.0 - d);
  gl_FragColor = vec4(vColor, vAlpha * a * a);
}
`;

export function pointsMaterial({ vertex, fragment = GLOW_FRAG, uniforms = {}, blending = THREE.AdditiveBlending }) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, ...uniforms },
    vertexShader: COMMON_VERT + vertex,
    fragmentShader: fragment,
    blending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
}

export function makePoints(geometry, material, renderOrder = 0) {
  const p = new THREE.Points(geometry, material);
  p.frustumCulled = false;
  p.renderOrder = renderOrder;
  return p;
}

export function attr(geometry, name, array, itemSize, dynamic = false) {
  const a = new THREE.BufferAttribute(array, itemSize);
  if (dynamic) a.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute(name, a);
  return a;
}

/** '#rrggbb' -> [r,g,b] in 0..1 display space (no colour-management conversion). */
export function hexToRGB(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function colorFromHex(hex) {
  const [r, g, b] = hexToRGB(hex);
  return new THREE.Color(r, g, b);
}
