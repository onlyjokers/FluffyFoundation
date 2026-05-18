/**
 * Purpose: Migrated raw WebGL renderer for the FCT track visual stage.
 */

export type ThemeName =
  | 'red'
  | 'dark'
  | 'light'
  | 'red-white-invert'
  | 'red-black'
  | 'red-black-invert';

export type StageItem =
  | 'intro'
  | 'shattered-reality'
  | 'acab'
  | 'il-crollo-del-cielo'
  | 'fantasmi-interrotti'
  | 'strategia-della-tensione'
  | 'alice-e-le-onde-eterne-della-fine';

export type StageMode = 'intro' | 'intro-invert' | 'track' | 'hidden';

export type MirroredStageRenderer = {
  resize: () => void;
  setActive: (active: boolean) => void;
  setAudioElement: (audioElement: HTMLAudioElement | null) => void;
  setAudioFeatures: (features: StageAudioFeatures | null) => void;
  resumeAudioContext: () => void;
  setItem: (item: StageItem) => void;
  setMode: (mode: StageMode) => void;
  setTheme: (theme: ThemeName) => void;
  destroy: () => void;
};

export type StageAudioFeatures = {
  low?: number;
  mid?: number;
  high?: number;
  fft?: readonly number[];
  sensitivity?: number;
};

type IntroUniforms = {
  uTime: WebGLUniformLocation;
  uResolution: WebGLUniformLocation;
  uTexture: WebGLUniformLocation;
  uFrequencyData: WebGLUniformLocation;
  uColorBg: WebGLUniformLocation;
  uColorText: WebGLUniformLocation;
  uFlagVisibility: WebGLUniformLocation;
};

type BlurUniforms = {
  iChannel0: WebGLUniformLocation;
};

type TrackUniforms = {
  uTime: WebGLUniformLocation;
  uResolution: WebGLUniformLocation;
  uFrequencyData: WebGLUniformLocation;
  uColorBg: WebGLUniformLocation;
  uColorText: WebGLUniformLocation;
};

type IlCrolloDelCieloUniforms = Omit<TrackUniforms, 'uResolution'> & {
  uResolution: WebGLUniformLocation | null;
  flag01: WebGLUniformLocation;
};

type AcabBufferCUniforms = {
  uTime: WebGLUniformLocation;
  uFrequencyData: WebGLUniformLocation;
};

type AcabBufferBUniforms = Omit<TrackUniforms, 'uFrequencyData'> & {
  uFrequencyData: WebGLUniformLocation | null;
  iChannel0: WebGLUniformLocation;
};

type FantasmiBlurUniforms = {
  uTime: WebGLUniformLocation | null;
  iChannel1: WebGLUniformLocation;
};

type StrategiaBufferBUniforms = {
  uTime: WebGLUniformLocation;
  uResolution: WebGLUniformLocation | null;
  uColorBg: WebGLUniformLocation;
  uColorText: WebGLUniformLocation;
  uFft: WebGLUniformLocation;
};

type StrategiaBlurUniforms = {
  uTime: WebGLUniformLocation | null;
  iChannel0: WebGLUniformLocation;
};

type AliceBufferDUniforms = {
  uTime: WebGLUniformLocation | null;
  uFrequencyData: WebGLUniformLocation | null;
  iChannel1: WebGLUniformLocation;
  uFft: WebGLUniformLocation;
};

type AliceBufferBUniforms = {
  iChannel0: WebGLUniformLocation;
  iChannel1: WebGLUniformLocation | null;
  uColorBg: WebGLUniformLocation;
  uColorText: WebGLUniformLocation;
};

type StageWebGlContext = WebGLRenderingContext | WebGL2RenderingContext;

type FrequencyBands = {
  low: number;
  mid: number;
  high: number;
};

type StageColors = {
  bg: [number, number, number];
  text: [number, number, number];
};

type ManagedAudioElement = {
  audioContext: AudioContext;
  analyser: AnalyserNode;
  frequencyBytes: Uint8Array<ArrayBuffer>;
};

type AudioContextConstructor = new () => AudioContext;

const BUFFER_SIZE = 512;
const FFT_TEXTURE_WIDTH = 64;
const INTRO_TEXTURE_PATH = '/webgl/texture/intro_radio-alice.jpg';
const RED: [number, number, number] = [222 / 255, 0, 13 / 255];
const PURE_RED: [number, number, number] = [1, 0, 0];
const WHITE: [number, number, number] = [1, 1, 1];
const BLACK: [number, number, number] = [0, 0, 0];
const managedAudioElements = new WeakMap<HTMLAudioElement, ManagedAudioElement>();

export const INTRO_VERTEX_SHADER = `
precision highp float;
attribute vec2 aPosition;
attribute vec2 aUv;
varying vec2 vUv;

void main() {
  vUv = aUv;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const INTRO_BLUR_FRAGMENT_SHADER = `
precision highp float;
#define GLSLIFY 1
uniform sampler2D iChannel0;
varying vec2 vUv;

#ifndef TWO_PI
#define TWO_PI 6.2831853071795864769252867665590
#endif

#ifndef TAU
#define TAU 6.2831853071795864769252867665590
#endif

#ifndef SAMPLER_FNC
#define SAMPLER_FNC(TEX, UV) texture2D(TEX, UV)
#endif

#ifndef SAMPLER_TYPE
#define SAMPLER_TYPE sampler2D
#endif

#ifndef RANDOM_SCALE
#define RANDOM_SCALE vec4(443.897, 441.423, .0973, .1099)
#endif

float random(in vec3 pos) {
  return fract(sin(dot(pos.xyz, vec3(70.9898, 78.233, 32.4355))) * 43758.5453123);
}

vec2 random2(vec3 p3) {
  p3 = fract(p3 * RANDOM_SCALE.xyz);
  p3 += dot(p3, p3.yzx + 19.19);
  return fract((p3.xx + p3.yz) * p3.zy);
}

#ifndef NOISEBLUR_SAMPLES
#define NOISEBLUR_SAMPLES 4.0
#endif

#ifndef NOISEBLUR_TYPE
#define NOISEBLUR_TYPE vec4
#endif

#ifndef NOISEBLUR_SAMPLER_FNC
#define NOISEBLUR_SAMPLER_FNC(TEX, UV) SAMPLER_FNC(TEX, UV)
#endif

#ifndef NOISEBLUR_RANDOM23_FNC
#define NOISEBLUR_RANDOM23_FNC(UV) random2(UV)
#endif

NOISEBLUR_TYPE noiseBlur(in SAMPLER_TYPE tex, in vec2 st, in vec2 pixel, float radius) {
  float blurRadius = radius;
  vec2 noiseOffset = st;
  NOISEBLUR_TYPE result = NOISEBLUR_TYPE(0.0);
  for (float i = 0.0; i < NOISEBLUR_SAMPLES; ++i) {
    vec2 noiseRand = NOISEBLUR_RANDOM23_FNC(vec3(noiseOffset.xy, i));
    noiseOffset = noiseRand;
    vec2 r = noiseRand;
    r.x *= TAU;
    vec2 cr = vec2(sin(r.x), cos(r.x)) * sqrt(r.y);
    NOISEBLUR_TYPE color = NOISEBLUR_SAMPLER_FNC(tex, st + cr * blurRadius * pixel);
    result = mix(result, color, 1.0 / (i + 1.0));
  }
  return result;
}

NOISEBLUR_TYPE noiseBlur(SAMPLER_TYPE tex, vec2 st, vec2 pixel) {
  NOISEBLUR_TYPE rta = NOISEBLUR_TYPE(0.0);
  float total = 0.0;
  float offset = random(vec3(12.9898 + st.x, 78.233 + st.y, 151.7182));
  for (float t = -NOISEBLUR_SAMPLES; t <= NOISEBLUR_SAMPLES; t++) {
    float percent = (t / NOISEBLUR_SAMPLES) + offset - 0.5;
    float weight = 1.0 - abs(percent);
    NOISEBLUR_TYPE color = NOISEBLUR_SAMPLER_FNC(tex, st + pixel * percent);
    rta += color * weight;
    total += weight;
  }
  return rta / total;
}

void main() {
  vec2 Ouv = vUv;
  vec2 uv = vUv;
  vec3 color = noiseBlur(iChannel0, uv, vec2(0.02), 0.2).rgb;
  gl_FragColor = vec4(color, 1.0);
}
`;

export const INTRO_FRAGMENT_SHADER = `
precision highp float;
#define GLSLIFY 1
uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uTexture;
uniform vec3 uFrequencyData;
uniform vec3 uColorBg;
uniform vec3 uColorText;
uniform float uFlagVisibility;
varying vec2 vUv;
#define PI 3.1415926

vec2 ratio(vec2 u_resolution) {
  vec2 ratio = vec2(clamp(u_resolution.x / u_resolution.y, 1.0, u_resolution.x), clamp(u_resolution.y / u_resolution.x, 1.0, u_resolution.y));
  return ratio;
}

vec2 uvOnCenter(in vec2 uv) {
  return vec2((uv.x * ratio(uResolution).x) - (ratio(uResolution).x / 1.0) / 2.0 + 0.5, (uv.y * ratio(uResolution).y) - (ratio(uResolution).y / 1.0) / 2.0 + 0.5);
}

vec2 uvCustomOnCenter(in vec2 uv, vec2 customratio) {
  uv = uvOnCenter(uv);
  return uv = vec2(uv.x * customratio.y + (-0.5 * customratio.y + 0.5), uv.y * customratio.x + (-0.5 * customratio.x + 0.5));
}

float random(in vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

float sdf(vec2 p, vec2 uv) {
  vec2 d = abs(p) - uv;
  return length(max(d, 0.)) + min(max(d.x, d.y), 0.);
}

vec2 uvTilingCustom2(in vec2 u_resolution, in vec2 uv, in vec2 TILE, in vec2 customratio) {
  return vec2(fract(uv.x * TILE.x * ratio(u_resolution * customratio).y), fract(uv.y * TILE.y * ratio(u_resolution * customratio).x));
}

float noise(in vec2 _st) {
  vec2 i = floor(_st);
  vec2 f = fract(_st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

#define NUM_OCTAVES 3

float fbm(in vec2 _st) {
  float v = 0.0;
  float a = 0.5;
  vec2 shift = vec2(100.0);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
  for (int i = 0; i < NUM_OCTAVES; ++i) {
    v += a * noise(_st);
    _st = rot * _st * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

float pattern(in vec2 iuv, in float flag) {
  vec2 q = vec2(0.);
  q.x = fbm(iuv.yy + flag + uTime / 2.0);
  q.y = fbm(iuv.yy + flag + vec2(1.0));
  vec2 r = vec2(0.);
  r.x = fbm(iuv.x + 1.0 * q + vec2(1.7, 9.2) + .5 * uTime / 5.0);
  r.y = fbm(iuv.x + 1.0 * q + vec2(8.3, 2.8) + .6 * uTime / 5.0);
  float f = fbm(iuv.x + r);
  return f;
}

float map(float value, float min1, float max1, float min2, float max2) {
  return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

float plot(float x, float pct, float value) {
  return smoothstep(pct - value, pct, x) - smoothstep(pct, pct + value, x);
}

void main() {
  float Flow = uFrequencyData.x;
  float Fmid = uFrequencyData.y;
  float Fhigh = uFrequencyData.z;
  vec3 color = vec3(1.0);
  vec2 Ouv = vUv;
  vec2 uv = vUv;
  float p1;
  float p2;
  float lmask1;
  float lmask2;
  vec2 tuv1;
  vec2 tuv2;
  vec2 sOuv;
  if (uResolution.x <= 950.0) {
    p1 = pattern(uv, Fmid / 3.0);
    p2 = pattern(uv, Fmid / 3.0);
    lmask1 = plot(fract(uv.x + p1 * 66.0), 0.5, 0.2);
    lmask2 = plot(fract(uv.x + p2 * 30.0), 0.5, 0.);
    tuv1 = uvTilingCustom2(uResolution.xy, Ouv + p1 / 2.0, vec2(0.0, 400.), vec2(1., 1.0));
    tuv2 = uvTilingCustom2(uResolution.xy, Ouv + p1 / 2.0, vec2(0.3, 66.), vec2(1., 1.0));
    sOuv = Ouv * 0.8;
    sOuv += (1.0 - 0.8) / 2.0;
  } else {
    p1 = pattern(uv, Fmid / 3.0);
    p2 = pattern(uv, Fmid / 3.0);
    lmask1 = plot(fract(uv.x + p1 * 45.0), 0.5, 0.2);
    lmask2 = plot(fract(uv.x + p2 * 30.0), 0.5, 0.);
    tuv1 = uvTilingCustom2(uResolution.xy, Ouv + p1 / 2.0, vec2(0.3, 66.), vec2(1., 1.0));
    tuv2 = uvTilingCustom2(uResolution.xy, Ouv + p1 / 2.0, vec2(0.3, 36.), vec2(1., 1.0));
    sOuv = Ouv * 0.65;
    sOuv += (1.0 - 0.65) / 2.0;
  }
  float mask1 = mix(0.0, texture2D(uTexture, uvCustomOnCenter(sOuv, vec2(1.0))).r, uFlagVisibility);
  float mask2 = mix(0.0, 1.0 - texture2D(uTexture, uvCustomOnCenter(sOuv, vec2(1.0))).r, uFlagVisibility);
  float aaa = 1.0 - smoothstep(0.0, 1.0 * uTime / 4.0, abs(Ouv.x - 0.5));
  float line1 = plot(tuv1.y, 0.5, 0.4 * (1.0 - lmask1 - mask1) * 1.0);
  float line1eff = plot(tuv1.y, 0.5, 0.4 * (1.0 - lmask1) * 1.0);
  float line2 = plot(tuv2.y, 0.5, 0.4 * (1.0 - lmask2 - (mask2)) * uFlagVisibility);
  color = vec3(line1 * (1.0 - mask1));
  color = color + vec3(line2 * (1.0 - mask2));
  color = vec3(max(line1, line2 * (1.0 - mask2)));
  color = mix(uColorText, uColorBg, color);
  gl_FragColor = vec4(color, 1.0);
}
`;

export const SHATTERED_REALITY_FRAGMENT_SHADER = `
precision highp float;
#define GLSLIFY 1
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uFrequencyData;
uniform vec3 uColorBg;
uniform vec3 uColorText;
varying vec2 vUv;
#define PI 3.1415926

vec2 ratio(vec2 u_resolution) {
  vec2 ratio = vec2(clamp(u_resolution.x / u_resolution.y, 1.0, u_resolution.x), clamp(u_resolution.y / u_resolution.x, 1.0, u_resolution.y));
  return ratio;
}

vec2 uvTiling(in vec2 u_resolution, in vec2 uv, in float tile) {
  return vec2(fract(uv.x * tile * ratio(u_resolution).x), fract(uv.y * tile * ratio(u_resolution).y));
}

vec2 uvOnCenter(in vec2 uv) {
  return vec2((uv.x * ratio(uResolution).x) - (ratio(uResolution).x / 1.0) / 2.0 + 0.5, (uv.y * ratio(uResolution).y) - (ratio(uResolution).y / 1.0) / 2.0 + 0.5);
}

vec2 uvCustomOnCenter(in vec2 uv, vec2 customratio) {
  uv = uvOnCenter(uv);
  return uv = vec2(uv.x * customratio.y + (-0.5 * customratio.y + 0.5), uv.y * customratio.x + (-0.5 * customratio.x + 0.5));
}

struct LineLight {
  float range;
  vec2 p0;
  vec2 p1;
  vec3 col;
};

float random(in vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(in vec2 _st) {
  vec2 i = floor(_st);
  vec2 f = fract(_st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p, mat2 mtx) {
  float f = 0.0;
  f += 0.500000 * noise(p + uTime / 6.0 + 10.0 * smoothstep(0.0, 1.0, mtx[0]));
  p = mtx * p * 4.02;
  f += 0.015625 * noise(p + sin(uTime));
  return f / 0.96875;
}

float pattern(in vec2 p, mat2 mtx) {
  float f = 0.;
  vec2 q = vec2(fbm(p + uTime * .01 + vec2(0.), mtx));
  vec2 r = vec2(fbm(q + uTime * .1 + 4. * q + vec2(3., 9.), mtx));
  f = fbm(p + r * 2. + uTime * .09, mtx);
  return f;
}

float plot(vec2 st, float pct, float smoothd, float smoothu) {
  return smoothstep(pct - smoothd, pct, st.y) - smoothstep(pct, pct + smoothu, st.y);
}

vec2 rotateUV(vec2 uv, float rotation) {
  float mid = 0.5;
  return vec2(cos(rotation) * (uv.x - mid) + sin(rotation) * (uv.y - mid) + mid, cos(rotation) * (uv.y - mid) - sin(rotation) * (uv.x - mid) + mid);
}

vec2 rotate(vec2 vec, float r) {
  float s = sin(r);
  float c = cos(r);
  mat2 rMatrix = mat2(c, -s, s, c);
  rMatrix *= 0.5;
  rMatrix += 0.5;
  return vec * rMatrix;
}

vec3 SampleLight(LineLight light, vec2 pos) {
  vec2 l = light.p1 - light.p0;
  float t = dot(normalize(pos - light.p0), normalize(l));
  t = max(t, 0.0);
  float d = (length(pos - light.p0) * t) / length(l);
  d = clamp(d, 0.0, 1.0);
  vec2 closerP = mix(light.p0, light.p1, vec2(d, d));
  float il = 1.0 - clamp(length(closerP - pos) / light.range, 0.0, 1.0);
  il = pow(il, 4.0);
  vec2 ax = rotate(normalize(l), PI);
  il *= abs(max(0.0, dot(normalize(ax), normalize(pos - closerP))));
  return vec3(il, il, il);
}

float sdf(vec2 p, vec2 wh) {
  vec2 d = abs(p) - wh;
  return length(max(d, 0.)) + min(max(d.x, d.y), 0.);
}

void main() {
  float Flow = uFrequencyData.x + 0.1;
  float Fmid = uFrequencyData.y + 0.1;
  float Fhigh = uFrequencyData.z + 0.1;
  vec3 color;
  vec2 uv = vUv;
  uv = uvOnCenter(uv);
  vec2 Ouv = uv;
  LineLight light;
  LineLight light1;
  LineLight light2;
  LineLight light3;
  float tq = 0.0;
  mat2 mtx1 = mat2(Fmid / 5.0, -0.1, -0.99, 0.33);
  float extantion1 = pattern(vec2(0.1 + uTime), mtx1) * 3.0;
  light1.p0 = vec2(0.4 - extantion1, 0.5);
  light1.p1 = vec2(0.6 + extantion1, 0.5);
  light1.range = 3.9;
  light1.col = vec3(1.0);
  float r1 = fract(uTime / 3.0 + Fmid);
  vec2 uv1 = rotateUV(vec2(1.0 - uv.x, uv.y), r1 * PI * 2.0 + 0.2);
  vec3 emission1 = SampleLight(light1, uv1) * 0.2;
  emission1 *= smoothstep(0.0, 0.4, Fmid);
  float q1 = .5 / sdf(uv1 - 0.5, vec2(extantion1 + 0.1, 0.0));
  q1 *= Fmid / 40.0;
  q1 = max(emission1, vec3(q1)).x;
  tq += q1;
  mat2 mtx2 = mat2(Fhigh / 5.0, -0.1, -0.99, 0.33);
  float extantion2 = pattern(vec2(0.1 + uTime), mtx2) * 5.0;
  light2.p0 = vec2(0.4 - extantion1, 0.5);
  light2.p1 = vec2(0.6 + extantion1, 0.5);
  light2.range = 3.9;
  light2.col = vec3(1.0);
  float r2 = fract(uTime / 2.86 + Fhigh);
  vec2 uv2 = rotateUV(vec2(uv.x, uv.y), r2 * PI * 2.0 + 0.33 + Fhigh);
  vec3 emission2 = SampleLight(light2, uv2) * 0.2;
  emission2 *= smoothstep(0.0, 0.4, Fhigh);
  float q2 = .5 / sdf(uv2 - 0.5, vec2(extantion2 + 0.1, 0.0));
  q2 *= Fmid / 40.0;
  q2 = max(emission2, vec3(q2)).x * 0.5;
  tq += q2;
  mat2 mtx3 = mat2(Flow / 5.0, -0.1, -0.99, 0.33);
  float extantion3 = pattern(vec2(0.1 + uTime), mtx3) * 5.0;
  extantion3 = 0.9;
  light3.p0 = vec2(0.4 - extantion3, 0.5);
  light3.p1 = vec2(0.6 + extantion3, 0.5);
  light3.range = 3.9;
  light3.col = vec3(1.0);
  float r3 = fract(uTime / 3.33 + Flow);
  vec2 uv3 = rotateUV(vec2(1.0 - uv.x, uv.y), r3 * PI * 2.0 + 0.33);
  vec3 emission3 = SampleLight(light3, uv3) * 0.2;
  emission3 *= smoothstep(0.0, 0.4, Flow);
  float q3 = .5 / sdf(uv3 - 0.5, vec2(extantion3 + 0.1, 0.0));
  q3 *= Fmid / 10.0;
  q3 = max(emission3, vec3(q3)).x * 0.5;
  tq += q3;
  color = mix(uColorBg, uColorText, clamp(0.0, 0.99, tq));
  gl_FragColor = vec4(color, 1.0);
}
`;

export const IL_CROLLO_DEL_CIELO_FRAGMENT_SHADER = `
precision highp float;
#define GLSLIFY 1
uniform float uTime;
uniform vec3 uFrequencyData;
uniform vec3 uColorBg;
uniform vec3 uColorText;
uniform float flag01;
varying vec2 vUv;

float random(in vec2 _st) {
  return fract(sin(dot(_st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(in vec2 _st) {
  vec2 i = floor(_st);
  vec2 f = fract(_st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p, mat2 mtx) {
  float f = 0.0;
  f += 0.500000 * noise(p + uTime / 6.0 + 10.0 * smoothstep(0.0, 1.0, mtx[0]));
  p = mtx * p * 4.02;
  f += 0.015625 * noise(p + sin(uTime));
  return f / 0.96875;
}

float pattern(in vec2 p, mat2 mtx) {
  float f = 0.;
  vec2 q = vec2(fbm(p + uTime * .01 + vec2(0.), mtx));
  vec2 r = vec2(fbm(q + uTime * .1 + 4. * q + vec2(3., 9.), mtx));
  f = fbm(p + r * 2. + uTime * .09, mtx);
  return f;
}

float plot(vec2 st, float pct, float smoothd, float smoothu) {
  return smoothstep(pct - smoothd, pct, st.y) - smoothstep(pct, pct + smoothu, st.y);
}

void main() {
  vec2 uv = vUv.xy;
  vec2 Ouv = vUv.xy;
  float Flow = uFrequencyData.x;
  float Fmid = uFrequencyData.y;
  float Fhigh = uFrequencyData.z;
  mat2 mtx = mat2(Fmid / 5.0, -0.1, -0.99, 0.33);
  float d = 0.0;
  float tl = 0.0;
  for (int i = 0; i <= 8; i++) {
    float ef = 1.0 - smoothstep(0.2, 0.6, plot(uv.xx, 0.5, 0.7, 0.7));
    ef *= 0.35;
    float f = 0.0;
    float n = pattern(uv.xx + float(i), mtx);
    float l = plot(uv + 0.25 - (sin(float(i) / 2.0) + 1.0) / 2.0, n, 0.44 + d / (float(i) * 2.0) * ef, 0.44 + d / (float(i) * 2.0) * ef);
    l = pow(l, 64.8);
    tl += l * (1.0 / float(9)) * float(i);
  }
  vec3 col = vec3(tl);
  vec3 col1 = mix(uColorBg, uColorText, col);
  vec3 col2 = mix(uColorText, uColorBg, col);
  col = mix(col1, col2, flag01);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const ACAB_BUFFER_C_FRAGMENT_SHADER = `
precision highp float;
#define GLSLIFY 1
uniform float uTime;
uniform vec3 uFrequencyData;
varying vec2 vUv;

float random(in vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(in vec2 _st) {
  vec2 i = floor(_st);
  vec2 f = fract(_st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p, mat2 mtx) {
  float f = 0.0;
  f += 0.500000 * noise(p + uTime / 6.0 + 10.0 * smoothstep(0.0, 1.0, mtx[0]));
  p = mtx * p * 4.02;
  f += 0.015625 * noise(p + sin(uTime));
  return f / 0.96875;
}

float pattern(in vec2 p, mat2 mtx) {
  float f = 0.0;
  vec2 q = vec2(
    fbm(p + uTime * .01 + vec2(0.0), mtx),
    fbm(p + uTime * .01 + vec2(2.4, 4.8), mtx)
  );
  vec2 r = vec2(
    fbm(q + uTime * .1 + 4.0 * q + vec2(3.0, 9.0), mtx),
    fbm(q + uTime * .1 + 8.0 * q + vec2(2.4, 8.4), mtx)
  );
  f = fbm(p + r * 2.0 + uTime * .009, mtx);
  return f;
}

void main() {
  float Flow = uFrequencyData.x;
  float Fmid = uFrequencyData.y;
  float Fhigh = uFrequencyData.z;
  vec3 color;
  mat2 mtx1 = mat2(0.3, -0.1, -0.99, 0.33);
  mat2 mtx2 = mat2(-0.3, 0.1, -0.19, 0.883);
  float d1 = smoothstep(0.0, 0.9, pattern((vUv * 10.0) + uTime / 10.0 + Fmid / 5.0, mtx1));
  float d2 = smoothstep(0.0, 0.6, pattern((vUv * 10.0) - uTime / 2.0 - Fmid / 5.0, mtx2));
  color = vec3(mix(d1, d2, smoothstep(0.1, 0.4, Fmid + Fhigh)));
  gl_FragColor = vec4(color, 1.0);
}
`;

export const ACAB_BUFFER_B_FRAGMENT_SHADER = `
precision highp float;
#define GLSLIFY 1
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uFrequencyData;
uniform vec3 uColorBg;
uniform vec3 uColorText;
uniform sampler2D iChannel0;
varying vec2 vUv;
#define PI 3.1415926

vec2 ratio(vec2 u_resolution) {
  vec2 ratio = vec2(clamp(u_resolution.x / u_resolution.y, 1.0, u_resolution.x), clamp(u_resolution.y / u_resolution.x, 1.0, u_resolution.y));
  return ratio;
}

vec2 uvOnCenter(in vec2 uv) {
  return vec2((uv.x * ratio(uResolution).x) - (ratio(uResolution).x / 1.0) / 2.0 + 0.5, (uv.y * ratio(uResolution).y) - (ratio(uResolution).y / 1.0) / 2.0 + 0.5);
}

vec2 uvCustomOnCenter(in vec2 uv, vec2 customratio) {
  uv = uvOnCenter(uv);
  return uv = vec2(uv.x * customratio.y + (-0.5 * customratio.y + 0.5), uv.y * customratio.x + (-0.5 * customratio.x + 0.5));
}

float random(in vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(in vec2 _st) {
  vec2 i = floor(_st);
  vec2 f = fract(_st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p, mat2 mtx) {
  float f = 0.0;
  f += 0.500000 * noise(p + uTime / 6.0 + 10.0 * smoothstep(0.0, 1.0, mtx[0]));
  p = mtx * p * 4.02;
  f += 0.015625 * noise(p + sin(uTime));
  return f / 0.96875;
}

float pattern(in vec2 p, mat2 mtx) {
  float f = 0.0;
  vec2 q = vec2(fbm(p + uTime * .01 + vec2(0.0), mtx));
  vec2 r = vec2(fbm(q + uTime * .1 + 4.0 * q + vec2(3.0, 9.0), mtx));
  f = fbm(p + r * 2.0 + uTime * .09, mtx);
  return f;
}

float sdf(vec2 p, vec2 uv) {
  vec2 d = abs(p) - uv;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float uvMask(in vec2 uv) {
  return min(step(0.0, uv.x), step(0.0, 1.0 - uv.x)) * min(step(0.0, uv.y), step(0.0, 1.0 - uv.y));
}

float uvMaskCustom(in vec2 uv, vec2 d) {
  return min(step(0.0, uv.x), step(0.0, d.x - uv.x)) * min(step(0.0, uv.y), step(0.0, d.y - uv.y));
}

void main() {
  float Flow = uFrequencyData.x;
  float Fmid = uFrequencyData.y;
  float Fhigh = uFrequencyData.z;
  const int T = 59;
  vec2 fuv[T];
  vec2 iuv[T];
  float iuvMask[T];
  vec2 cL[T];
  vec2 R[T];
  float f[T];
  vec3 color = vec3(0.0);
  vec2 uv = vUv;
  uv = uvCustomOnCenter(uv, vec2(1.0, 1.0));
  float tile = 10.0;
  vec2 rapporto = vec2(1.0, 10.0);
  vec2 oiuv = vec2(
    ceil(vUv.x * tile * ratio(uResolution).x * rapporto.y) / (tile * ratio(uResolution).x * rapporto.y),
    ceil(vUv.y * tile * ratio(uResolution).y * rapporto.x) / (tile * ratio(uResolution).y * rapporto.x)
  );
  float mask = uvMask(oiuv);
  float cminR = 0.00;
  float cmaxR = 1.7;
  float minR = 0.003;
  float maxR = 0.3;
  vec2 scostamento;
  float o[T];
  float d[T];
  float nL = 5.0;

  for (int i = 4; i < T; i++) {
    float a = (sin(uTime / 1.0 + oiuv.x * nL) + 1.0) / 2.0;
    scostamento = vec2(0.0, 0.025 * float(i));
    iuv[i] = vec2(
      ceil((vUv.x - scostamento.x) * tile * ratio(uResolution).x * rapporto.y) / (tile * ratio(uResolution).x * rapporto.y),
      ceil((vUv.y - scostamento.y) * tile * ratio(uResolution).y * rapporto.x) / (tile * ratio(uResolution).y * rapporto.x)
    );
    iuvMask[i] = uvMaskCustom(iuv[i], vec2(1.0, 0.05));
    iuv[i] *= iuvMask[i];
    fuv[i] = vec2(
      fract((vUv.x - scostamento.x) * tile * ratio(uResolution).x * rapporto.y),
      fract((vUv.y - scostamento.y) * tile * ratio(uResolution).y * rapporto.x)
    );
    fuv[i] *= iuvMask[i];
    vec4 text = texture2D(iChannel0, 1.0 - vec2(1.0 - oiuv.x, 0.017 * float(i)));
    o[i] = smoothstep(0.2, 0.7, text.r) / 2.0;
    d[i] = smoothstep(0.2, 0.7, text.g) / 2.0;
    a = o[i];
    cL[i] = vec2(0.0, mix(cminR, cmaxR, a));
    R[i] = vec2(0.35, mix(minR, maxR, a));
    f[i] = smoothstep(0.01, 0.005, sdf(fuv[i] - vec2(0.5, cL[i].y), R[i]));
    color = color + f[i];
  }

  color = mix(uColorText, uColorBg, color);
  gl_FragColor = vec4(color, 1.0);
}
`;

export const ACAB_BLUR_FRAGMENT_SHADER = `
precision highp float;
#define GLSLIFY 1
uniform sampler2D iChannel0;
varying vec2 vUv;

#ifndef TAU
#define TAU 6.2831853071795864769252867665590
#endif

#ifndef RANDOM_SCALE
#define RANDOM_SCALE vec4(443.897, 441.423, .0973, .1099)
#endif

float random(in vec3 pos) {
  return fract(sin(dot(pos.xyz, vec3(70.9898, 78.233, 32.4355))) * 43758.5453123);
}

vec2 random2(vec3 p3) {
  p3 = fract(p3 * RANDOM_SCALE.xyz);
  p3 += dot(p3, p3.yzx + 19.19);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec4 noiseBlur(in sampler2D tex, in vec2 st, in vec2 pixel, float radius) {
  float blurRadius = radius;
  vec2 noiseOffset = st;
  vec4 result = vec4(0.0);
  for (float i = 0.0; i < 4.0; ++i) {
    vec2 noiseRand = random2(vec3(noiseOffset.xy, i));
    noiseOffset = noiseRand;
    vec2 r = noiseRand;
    r.x *= TAU;
    vec2 cr = vec2(sin(r.x), cos(r.x)) * sqrt(r.y);
    vec4 color = texture2D(tex, st + cr * blurRadius * pixel);
    result = mix(result, color, 1.0 / (i + 1.0));
  }
  return result;
}

void main() {
  vec2 uv = vUv;
  vec4 tt = noiseBlur(iChannel0, uv, vec2(0.01), 0.5);
  gl_FragColor = vec4(tt.rgb, 1.0);
}
`;

export const FANTASMI_BUFFER_B_FRAGMENT_SHADER = `
precision highp float;
#define GLSLIFY 1
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uFrequencyData;
uniform vec3 uColorBg;
uniform vec3 uColorText;
varying vec2 vUv;
#define PI 3.1415926
#define TWO_PI 6.2831853071795864769252867665590

float random(in vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(in vec2 _st) {
  vec2 i = floor(_st);
  vec2 f = fract(_st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

#define NUM_OCTAVES 4

float fbm(in vec2 _st) {
  float v = 0.0;
  float a = 0.5;
  vec2 shift = vec2(100.0);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
  for (int i = 0; i < NUM_OCTAVES; ++i) {
    v += a * noise(_st);
    _st = rot * _st * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

float pattern(in vec2 p) {
  float f = 0.0;
  vec2 q = vec2(
    fbm(p + uTime * .01 + vec2(0.0)),
    fbm(p + uTime * .01 + vec2(2.4, 4.8))
  );
  vec2 r = vec2(
    fbm(q + uTime * .1 + 4.0 * q + vec2(3.0, 9.0)),
    fbm(q + uTime * .1 + 8.0 * q + vec2(2.4, 8.4))
  );
  f = fbm(p + r * 2.0 + uTime * .09);
  return f;
}

vec2 toPolar(vec2 uv) {
  float angle = atan(uv.y, uv.x);
  float radius = length(uv) * 2.0;
  return vec2((angle / TWO_PI) + 0.5, radius);
}

vec2 mix2Polar(vec2 puv, float s, float r) {
  vec2 first = vec2(1.0 - puv.x, puv.y);
  vec2 second = vec2(fract(1.0 - puv.x + 0.5), puv.y);
  float delta = min(smoothstep(s, r, second.x), smoothstep(s, r, 1.0 - second.x));
  vec2 fusion = mix(first, second, delta);
  return fusion;
}

vec2 ratio(vec2 u_resolution) {
  vec2 ratio = vec2(clamp(u_resolution.x / u_resolution.y, 1.0, u_resolution.x), clamp(u_resolution.y / u_resolution.x, 1.0, u_resolution.y));
  return ratio;
}

vec2 uvOnCenter(in vec2 uv) {
  return vec2((uv.x * ratio(uResolution).x) - (ratio(uResolution).x / 1.0) / 2.0 + 0.5, (uv.y * ratio(uResolution).y) - (ratio(uResolution).y / 1.0) / 2.0 + 0.5);
}

vec2 uvCustomOnCenter(in vec2 uv, vec2 customratio) {
  uv = uvOnCenter(uv);
  return uv = vec2(uv.x * customratio.y + (-0.5 * customratio.y + 0.5), uv.y * customratio.x + (-0.5 * customratio.x + 0.5));
}

void main() {
  float Flow = uFrequencyData.x;
  float Fmid = uFrequencyData.y;
  float Fhigh = uFrequencyData.z;
  vec2 Ouv = vUv;
  vec2 uv = vUv;
  uv = uvCustomOnCenter(uv, vec2(1.0));
  uv -= vec2(0.5);
  uv *= 0.3;
  float d = pattern(uv);
  vec2 puv = toPolar(uv);
  vec2 fpuv = mix2Polar(puv, 0.25, 0.5);
  float d1 = pattern(vec2(fpuv.x, fpuv.y + uTime / 10.0 + pattern(Ouv.xy * 0.1) / 2.0));
  d1 = (d1 + 0.2) / 9.0;
  vec2 puv01 = vec2(1.0 - puv.x, puv.y);
  vec2 puv02 = vec2(fract(1.0 - puv.x + 0.5), puv.y);
  float mask = min(smoothstep(0.25, 0.5, puv02.x), smoothstep(0.25, 0.5, 1.0 - puv02.x));
  float t = pattern(mix(puv01.xx - d1, puv02.xx + d1, mask)) / 1.0;
  float r = pattern(mix(puv01.xx + t, puv02.xx + t, mask) + uTime * 0.1) / 1.0;
  float x = smoothstep(-0.5 - d1 / 1.0 + t / 2.0, 0.2 - d1 / 2.0 + t + Fmid / 10.0, puv.y);
  vec3 color = vec3(smoothstep(0.2 - r / 3.5, 0.9, x * x));
  color = mix(vec3(1.0, 1.0, 1.0), vec3(0.0, 0.0, 0.0), 1.0 - color);
  color = mix(uColorBg, uColorText, 1.0 - color);
  gl_FragColor = vec4(color, 1.0);
}
`;

export const FANTASMI_BLUR_FRAGMENT_SHADER = `
precision highp float;
#define GLSLIFY 1
uniform float uTime;
uniform sampler2D iChannel1;
varying vec2 vUv;

#ifndef TAU
#define TAU 6.2831853071795864769252867665590
#endif

#ifndef RANDOM_SCALE
#define RANDOM_SCALE vec4(443.897, 441.423, .0973, .1099)
#endif

float random(in vec3 pos) {
  return fract(sin(dot(pos.xyz, vec3(70.9898, 78.233, 32.4355))) * 43758.5453123);
}

vec2 random2(vec3 p3) {
  p3 = fract(p3 * RANDOM_SCALE.xyz);
  p3 += dot(p3, p3.yzx + 19.19);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec4 noiseBlur(in sampler2D tex, in vec2 st, in vec2 pixel, float radius) {
  float blurRadius = radius;
  vec2 noiseOffset = st;
  vec4 result = vec4(0.0);
  for (float i = 0.0; i < 4.0; ++i) {
    vec2 noiseRand = random2(vec3(noiseOffset.xy, i));
    noiseOffset = noiseRand;
    vec2 r = noiseRand;
    r.x *= TAU;
    vec2 cr = vec2(sin(r.x), cos(r.x)) * sqrt(r.y);
    vec4 color = texture2D(tex, st + cr * blurRadius * pixel);
    result = mix(result, color, 1.0 / (i + 1.0));
  }
  return result;
}

void main() {
  vec2 Ouv = vUv;
  vec2 uv = vUv;
  vec3 color = noiseBlur(iChannel1, uv, vec2(0.01), 0.5).rgb;
  gl_FragColor = vec4(color, 1.0);
}
`;

export const STRATEGIA_BUFFER_B_FRAGMENT_SHADER = `
precision highp float;
#define GLSLIFY 1
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColorBg;
uniform vec3 uColorText;
uniform sampler2D uFft;
varying vec2 vUv;

float random(in vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(in vec2 _st) {
  vec2 i = floor(_st);
  vec2 f = fract(_st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p, mat2 mtx) {
  float f = 0.0;
  f += 0.500000 * noise(p + uTime / 6.0 + 10.0 * smoothstep(0.0, 1.0, mtx[0]));
  p = mtx * p * 4.02;
  f += 0.015625 * noise(p + sin(uTime));
  return f / 0.96875;
}

float pattern(in vec2 p, mat2 mtx) {
  float f = 0.0;
  vec2 q = vec2(fbm(p + uTime * .01 + vec2(0.0), mtx));
  vec2 r = vec2(fbm(q + uTime * .1 + 4.0 * q + vec2(3.0, 9.0), mtx));
  f = fbm(p + r * 2.0 + uTime * .09, mtx);
  return f;
}

void main() {
  vec2 uv = vUv;
  float lines = 6.0;
  float fft = texture2D(uFft, vec2(ceil(uv.x * lines) / lines, 0.25)).x;
  mat2 mtx1 = mat2(0.3, -0.1, -0.99, 0.33);
  float n = pattern(vec2(ceil(uv.x * lines) / lines * lines, uv.y * lines) + fft + uTime, mtx1);
  vec3 col = vec3(fft);
  col = vec3(n * 2.0);
  col = mix(uColorBg, uColorText, col);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const STRATEGIA_BLUR_FRAGMENT_SHADER = `
precision highp float;
#define GLSLIFY 1
uniform sampler2D iChannel0;
varying vec2 vUv;

#ifndef TAU
#define TAU 6.2831853071795864769252867665590
#endif

#ifndef RANDOM_SCALE
#define RANDOM_SCALE vec4(443.897, 441.423, .0973, .1099)
#endif

float random(in vec3 pos) {
  return fract(sin(dot(pos.xyz, vec3(70.9898, 78.233, 32.4355))) * 43758.5453123);
}

vec2 random2(vec3 p3) {
  p3 = fract(p3 * RANDOM_SCALE.xyz);
  p3 += dot(p3, p3.yzx + 19.19);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec4 noiseBlur(in sampler2D tex, in vec2 st, in vec2 pixel, float radius) {
  float blurRadius = radius;
  vec2 noiseOffset = st;
  vec4 result = vec4(0.0);
  for (float i = 0.0; i < 4.0; ++i) {
    vec2 noiseRand = random2(vec3(noiseOffset.xy, i));
    noiseOffset = noiseRand;
    vec2 r = noiseRand;
    r.x *= TAU;
    vec2 cr = vec2(sin(r.x), cos(r.x)) * sqrt(r.y);
    vec4 color = texture2D(tex, st + cr * blurRadius * pixel);
    result = mix(result, color, 1.0 / (i + 1.0));
  }
  return result;
}

void main() {
  vec2 uv = vUv;
  vec3 color = noiseBlur(iChannel0, uv, vec2(0.0005), 2.5).rgb;
  gl_FragColor = vec4(color, 1.0);
}
`;

export const ALICE_BUFFER_D_FRAGMENT_SHADER = `
precision highp float;
#define GLSLIFY 1
uniform sampler2D iChannel1;
uniform float uTime;
uniform vec3 uFrequencyData;
uniform sampler2D uFft;
varying vec2 vUv;

void main() {
  vec2 uv = vUv.xy;
  float fft = texture2D(uFft, vec2(ceil(uv.x * 45.0) / 45.0, 0.25)).x;
  vec3 cc = texture2D(iChannel1, uv).rgb;
  vec3 col = fract(cc + vec3(fft / 60.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

export const ALICE_BUFFER_C_FRAGMENT_SHADER = `
precision highp float;
#define GLSLIFY 1
uniform sampler2D iChannel0;
varying vec2 vUv;

void main() {
  vec2 uv = vUv.xy;
  uv -= 0.5;
  uv /= 1.01;
  uv += 0.5;
  vec4 tt = texture2D(iChannel0, uv);
  vec3 col = tt.rgb;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const ALICE_BUFFER_B_FRAGMENT_SHADER = `
precision highp float;
#define GLSLIFY 1
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform vec3 uColorBg;
uniform vec3 uColorText;
varying vec2 vUv;

void main() {
  vec2 uv = vUv.xy;
  vec4 tt = texture2D(iChannel0, uv);
  vec2 Ouv = vec2(uv.x, uv.y + tt.r);
  float circle = smoothstep(0.21, 0.5, distance(Ouv, vec2(0.5)));
  vec4 video = texture2D(iChannel1, Ouv);
  vec3 col = vec3(1.0 - circle);
  col = mix(uColorBg, uColorText, col);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const ALICE_BLUR_FRAGMENT_SHADER = `
precision highp float;
#define GLSLIFY 1
uniform sampler2D iChannel0;
varying vec2 vUv;

#ifndef TAU
#define TAU 6.2831853071795864769252867665590
#endif

#ifndef RANDOM_SCALE
#define RANDOM_SCALE vec4(443.897, 441.423, .0973, .1099)
#endif

float random(in vec3 pos) {
  return fract(sin(dot(pos.xyz, vec3(70.9898, 78.233, 32.4355))) * 43758.5453123);
}

vec2 random2(vec3 p3) {
  p3 = fract(p3 * RANDOM_SCALE.xyz);
  p3 += dot(p3, p3.yzx + 19.19);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec4 noiseBlur(in sampler2D tex, vec2 st, vec2 pixel) {
  vec4 rta = vec4(0.0);
  float total = 0.0;
  float offset = random(vec3(12.9898 + st.x, 78.233 + st.y, 151.7182));
  for (float t = -4.0; t <= 4.0; t++) {
    float percent = (t / 4.0) + offset - 0.5;
    float weight = 1.0 - abs(percent);
    vec4 color = texture2D(tex, st + pixel * percent);
    rta += color * weight;
    total += weight;
  }
  return rta / total;
}

void main() {
  vec2 uv = vUv;
  vec4 tt = noiseBlur(iChannel0, uv, vec2(0.06));
  gl_FragColor = vec4(tt.rgb, 1.0);
}
`;

function createWebGlContext(canvas: HTMLCanvasElement): StageWebGlContext {
  const attributes: WebGLContextAttributes = {
    alpha: true,
    antialias: true,
    depth: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: false
  };

  const context =
    canvas.getContext('webgl2', attributes) ??
    canvas.getContext('webgl', attributes) ??
    (canvas.getContext('experimental-webgl', attributes) as WebGLRenderingContext | null);

  if (!context) {
    throw new Error('WebGL is unavailable for the intro stage renderer.');
  }

  return context;
}

function compileShader(
  gl: StageWebGlContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create WebGL shader.');

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader compile error.';
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createProgram(
  gl: StageWebGlContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create WebGL program.');

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown WebGL program link error.';
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

function getUniform(
  gl: StageWebGlContext,
  program: WebGLProgram,
  name: string
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new Error(`Missing WebGL uniform: ${name}`);
  return location;
}

function getOptionalUniform(
  gl: StageWebGlContext,
  program: WebGLProgram,
  name: string
): WebGLUniformLocation | null {
  return gl.getUniformLocation(program, name);
}

function bindQuadAttributes(gl: StageWebGlContext, program: WebGLProgram, quadBuffer: WebGLBuffer) {
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);

  const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
  const positionLocation = gl.getAttribLocation(program, 'aPosition');
  if (positionLocation < 0) throw new Error('Missing WebGL attribute: aPosition');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);

  const uvLocation = gl.getAttribLocation(program, 'aUv');
  if (uvLocation < 0) throw new Error('Missing WebGL attribute: aUv');
  gl.enableVertexAttribArray(uvLocation);
  gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
}

function easePower3InOut(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function averageFrequencyRange(
  frequencyBytes: Uint8Array<ArrayBufferLike>,
  audioContext: AudioContext,
  minFrequency: number,
  maxFrequency: number
): number {
  if (!frequencyBytes.length || !audioContext.sampleRate) return 0;

  const start = Math.floor(minFrequency * frequencyBytes.length / audioContext.sampleRate);
  const end = Math.floor(maxFrequency * frequencyBytes.length / audioContext.sampleRate);
  const boundedStart = Math.max(0, Math.min(start, frequencyBytes.length - 1));
  const boundedEnd = Math.min(frequencyBytes.length - 1, Math.max(boundedStart, end));
  let total = 0;
  for (let index = boundedStart; index <= boundedEnd; index += 1) {
    total += frequencyBytes[index];
  }
  return total / (boundedEnd - boundedStart + 1) / 256;
}

function computeFrequencyBands(
  frequencyBytes: Uint8Array<ArrayBufferLike>,
  audioContext: AudioContext
): FrequencyBands {
  return {
    low: averageFrequencyRange(frequencyBytes, audioContext, 10, 150),
    mid: averageFrequencyRange(frequencyBytes, audioContext, 150, 9000),
    high: averageFrequencyRange(frequencyBytes, audioContext, 9000, audioContext.sampleRate)
  };
}

function getManagedAudioElement(audioElement: HTMLAudioElement): ManagedAudioElement | null {
  const existing = managedAudioElements.get(audioElement);
  if (existing) return existing;

  const AudioContextConstructor =
    window.AudioContext ??
    ((window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext);
  if (!AudioContextConstructor) return null;

  const audioContext = new AudioContextConstructor();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 128;
  const source = audioContext.createMediaElementSource(audioElement);
  source.connect(analyser);
  analyser.connect(audioContext.destination);

  const managed = {
    audioContext,
    analyser,
    frequencyBytes: new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
  };
  managedAudioElements.set(audioElement, managed);
  return managed;
}

class WebGlMirroredStageRenderer implements MirroredStageRenderer {
  private readonly gl: StageWebGlContext;
  private readonly introProgram: WebGLProgram;
  private readonly blurProgram: WebGLProgram;
  private readonly shatteredRealityProgram: WebGLProgram;
  private readonly ilCrolloDelCieloProgram: WebGLProgram;
  private readonly acabBufferCProgram: WebGLProgram;
  private readonly acabBufferBProgram: WebGLProgram;
  private readonly acabBlurProgram: WebGLProgram;
  private readonly fantasmiBufferBProgram: WebGLProgram;
  private readonly fantasmiBlurProgram: WebGLProgram;
  private readonly strategiaBufferBProgram: WebGLProgram;
  private readonly strategiaBlurProgram: WebGLProgram;
  private readonly aliceBufferDProgram: WebGLProgram;
  private readonly aliceBufferCProgram: WebGLProgram;
  private readonly aliceBufferBProgram: WebGLProgram;
  private readonly aliceBlurProgram: WebGLProgram;
  private readonly introUniforms: IntroUniforms;
  private readonly blurUniforms: BlurUniforms;
  private readonly shatteredRealityUniforms: TrackUniforms;
  private readonly ilCrolloDelCieloUniforms: IlCrolloDelCieloUniforms;
  private readonly acabBufferCUniforms: AcabBufferCUniforms;
  private readonly acabBufferBUniforms: AcabBufferBUniforms;
  private readonly acabBlurUniforms: BlurUniforms;
  private readonly fantasmiBufferBUniforms: TrackUniforms;
  private readonly fantasmiBlurUniforms: FantasmiBlurUniforms;
  private readonly strategiaBufferBUniforms: StrategiaBufferBUniforms;
  private readonly strategiaBlurUniforms: StrategiaBlurUniforms;
  private readonly aliceBufferDUniforms: AliceBufferDUniforms;
  private readonly aliceBufferCUniforms: BlurUniforms;
  private readonly aliceBufferBUniforms: AliceBufferBUniforms;
  private readonly aliceBlurUniforms: BlurUniforms;
  private readonly quadBuffer: WebGLBuffer;
  private readonly introTexture: WebGLTexture;
  private readonly fftTexture: WebGLTexture;
  private readonly fftTextureData = new Uint8Array(FFT_TEXTURE_WIDTH * 4);
  private readonly introPassTexture: WebGLTexture;
  private readonly introPassFramebuffer: WebGLFramebuffer;
  private readonly acabBufferCTexture: WebGLTexture;
  private readonly acabBufferCFramebuffer: WebGLFramebuffer;
  private readonly acabBufferBTexture: WebGLTexture;
  private readonly acabBufferBFramebuffer: WebGLFramebuffer;
  private readonly fantasmiBufferBTexture: WebGLTexture;
  private readonly fantasmiBufferBFramebuffer: WebGLFramebuffer;
  private readonly strategiaBufferBTexture: WebGLTexture;
  private readonly strategiaBufferBFramebuffer: WebGLFramebuffer;
  private readonly aliceBufferDTexture: WebGLTexture;
  private readonly aliceBufferDFramebuffer: WebGLFramebuffer;
  private readonly aliceBufferCTexture: WebGLTexture;
  private readonly aliceBufferCFramebuffer: WebGLFramebuffer;
  private readonly aliceBufferBTexture: WebGLTexture;
  private readonly aliceBufferBFramebuffer: WebGLFramebuffer;
  private animationFrameId = 0;
  private active = false;
  private audioElement: HTMLAudioElement | null = null;
  private managedAudioElement: ManagedAudioElement | null = null;
  private externalAudioFeatures: StageAudioFeatures | null = null;
  private currentItem: StageItem = 'intro';
  private stageMode: StageMode = 'intro';
  private theme: ThemeName = 'red';
  private destroyed = false;
  private frequencyBands: FrequencyBands = { low: 0, mid: 0, high: 0 };
  private flagAnimationStart = 0;
  private flagVisibility = 0;
  private startTime = performance.now();
  private canvasWidth = 0;
  private canvasHeight = 0;
  private textureReady = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.gl = createWebGlContext(canvas);
    this.introProgram = createProgram(this.gl, INTRO_VERTEX_SHADER, INTRO_FRAGMENT_SHADER);
    this.blurProgram = createProgram(this.gl, INTRO_VERTEX_SHADER, INTRO_BLUR_FRAGMENT_SHADER);
    this.shatteredRealityProgram = createProgram(
      this.gl,
      INTRO_VERTEX_SHADER,
      SHATTERED_REALITY_FRAGMENT_SHADER
    );
    this.ilCrolloDelCieloProgram = createProgram(
      this.gl,
      INTRO_VERTEX_SHADER,
      IL_CROLLO_DEL_CIELO_FRAGMENT_SHADER
    );
    this.acabBufferCProgram = createProgram(
      this.gl,
      INTRO_VERTEX_SHADER,
      ACAB_BUFFER_C_FRAGMENT_SHADER
    );
    this.acabBufferBProgram = createProgram(
      this.gl,
      INTRO_VERTEX_SHADER,
      ACAB_BUFFER_B_FRAGMENT_SHADER
    );
    this.acabBlurProgram = createProgram(this.gl, INTRO_VERTEX_SHADER, ACAB_BLUR_FRAGMENT_SHADER);
    this.fantasmiBufferBProgram = createProgram(
      this.gl,
      INTRO_VERTEX_SHADER,
      FANTASMI_BUFFER_B_FRAGMENT_SHADER
    );
    this.fantasmiBlurProgram = createProgram(
      this.gl,
      INTRO_VERTEX_SHADER,
      FANTASMI_BLUR_FRAGMENT_SHADER
    );
    this.strategiaBufferBProgram = createProgram(
      this.gl,
      INTRO_VERTEX_SHADER,
      STRATEGIA_BUFFER_B_FRAGMENT_SHADER
    );
    this.strategiaBlurProgram = createProgram(
      this.gl,
      INTRO_VERTEX_SHADER,
      STRATEGIA_BLUR_FRAGMENT_SHADER
    );
    this.aliceBufferDProgram = createProgram(
      this.gl,
      INTRO_VERTEX_SHADER,
      ALICE_BUFFER_D_FRAGMENT_SHADER
    );
    this.aliceBufferCProgram = createProgram(
      this.gl,
      INTRO_VERTEX_SHADER,
      ALICE_BUFFER_C_FRAGMENT_SHADER
    );
    this.aliceBufferBProgram = createProgram(
      this.gl,
      INTRO_VERTEX_SHADER,
      ALICE_BUFFER_B_FRAGMENT_SHADER
    );
    this.aliceBlurProgram = createProgram(this.gl, INTRO_VERTEX_SHADER, ALICE_BLUR_FRAGMENT_SHADER);
    this.quadBuffer = this.createQuadBuffer();
    this.introTexture = this.createIntroTexture();
    this.fftTexture = this.createFftTexture();
    this.introPassTexture = this.createRenderTexture();
    this.introPassFramebuffer = this.createFramebuffer(this.introPassTexture);
    this.acabBufferCTexture = this.createRenderTexture();
    this.acabBufferCFramebuffer = this.createFramebuffer(this.acabBufferCTexture);
    this.acabBufferBTexture = this.createRenderTexture();
    this.acabBufferBFramebuffer = this.createFramebuffer(this.acabBufferBTexture);
    this.fantasmiBufferBTexture = this.createRenderTexture();
    this.fantasmiBufferBFramebuffer = this.createFramebuffer(this.fantasmiBufferBTexture);
    this.strategiaBufferBTexture = this.createRenderTexture();
    this.strategiaBufferBFramebuffer = this.createFramebuffer(this.strategiaBufferBTexture);
    this.aliceBufferDTexture = this.createRenderTexture();
    this.aliceBufferDFramebuffer = this.createFramebuffer(this.aliceBufferDTexture);
    this.aliceBufferCTexture = this.createRenderTexture();
    this.aliceBufferCFramebuffer = this.createFramebuffer(this.aliceBufferCTexture);
    this.aliceBufferBTexture = this.createRenderTexture();
    this.aliceBufferBFramebuffer = this.createFramebuffer(this.aliceBufferBTexture);
    this.introUniforms = {
      uTime: getUniform(this.gl, this.introProgram, 'uTime'),
      uResolution: getUniform(this.gl, this.introProgram, 'uResolution'),
      uTexture: getUniform(this.gl, this.introProgram, 'uTexture'),
      uFrequencyData: getUniform(this.gl, this.introProgram, 'uFrequencyData'),
      uColorBg: getUniform(this.gl, this.introProgram, 'uColorBg'),
      uColorText: getUniform(this.gl, this.introProgram, 'uColorText'),
      uFlagVisibility: getUniform(this.gl, this.introProgram, 'uFlagVisibility')
    };
    this.blurUniforms = {
      iChannel0: getUniform(this.gl, this.blurProgram, 'iChannel0')
    };
    this.shatteredRealityUniforms = {
      uTime: getUniform(this.gl, this.shatteredRealityProgram, 'uTime'),
      uResolution: getUniform(this.gl, this.shatteredRealityProgram, 'uResolution'),
      uFrequencyData: getUniform(this.gl, this.shatteredRealityProgram, 'uFrequencyData'),
      uColorBg: getUniform(this.gl, this.shatteredRealityProgram, 'uColorBg'),
      uColorText: getUniform(this.gl, this.shatteredRealityProgram, 'uColorText')
    };
    this.ilCrolloDelCieloUniforms = {
      uTime: getUniform(this.gl, this.ilCrolloDelCieloProgram, 'uTime'),
      uResolution: getOptionalUniform(this.gl, this.ilCrolloDelCieloProgram, 'uResolution'),
      uFrequencyData: getUniform(this.gl, this.ilCrolloDelCieloProgram, 'uFrequencyData'),
      uColorBg: getUniform(this.gl, this.ilCrolloDelCieloProgram, 'uColorBg'),
      uColorText: getUniform(this.gl, this.ilCrolloDelCieloProgram, 'uColorText'),
      flag01: getUniform(this.gl, this.ilCrolloDelCieloProgram, 'flag01')
    };
    this.acabBufferCUniforms = {
      uTime: getUniform(this.gl, this.acabBufferCProgram, 'uTime'),
      uFrequencyData: getUniform(this.gl, this.acabBufferCProgram, 'uFrequencyData')
    };
    this.acabBufferBUniforms = {
      uTime: getUniform(this.gl, this.acabBufferBProgram, 'uTime'),
      uResolution: getUniform(this.gl, this.acabBufferBProgram, 'uResolution'),
      uFrequencyData: getOptionalUniform(this.gl, this.acabBufferBProgram, 'uFrequencyData'),
      uColorBg: getUniform(this.gl, this.acabBufferBProgram, 'uColorBg'),
      uColorText: getUniform(this.gl, this.acabBufferBProgram, 'uColorText'),
      iChannel0: getUniform(this.gl, this.acabBufferBProgram, 'iChannel0')
    };
    this.acabBlurUniforms = {
      iChannel0: getUniform(this.gl, this.acabBlurProgram, 'iChannel0')
    };
    this.fantasmiBufferBUniforms = {
      uTime: getUniform(this.gl, this.fantasmiBufferBProgram, 'uTime'),
      uResolution: getUniform(this.gl, this.fantasmiBufferBProgram, 'uResolution'),
      uFrequencyData: getUniform(this.gl, this.fantasmiBufferBProgram, 'uFrequencyData'),
      uColorBg: getUniform(this.gl, this.fantasmiBufferBProgram, 'uColorBg'),
      uColorText: getUniform(this.gl, this.fantasmiBufferBProgram, 'uColorText')
    };
    this.fantasmiBlurUniforms = {
      uTime: getOptionalUniform(this.gl, this.fantasmiBlurProgram, 'uTime'),
      iChannel1: getUniform(this.gl, this.fantasmiBlurProgram, 'iChannel1')
    };
    this.strategiaBufferBUniforms = {
      uTime: getUniform(this.gl, this.strategiaBufferBProgram, 'uTime'),
      uResolution: getOptionalUniform(this.gl, this.strategiaBufferBProgram, 'uResolution'),
      uColorBg: getUniform(this.gl, this.strategiaBufferBProgram, 'uColorBg'),
      uColorText: getUniform(this.gl, this.strategiaBufferBProgram, 'uColorText'),
      uFft: getUniform(this.gl, this.strategiaBufferBProgram, 'uFft')
    };
    this.strategiaBlurUniforms = {
      uTime: getOptionalUniform(this.gl, this.strategiaBlurProgram, 'uTime'),
      iChannel0: getUniform(this.gl, this.strategiaBlurProgram, 'iChannel0')
    };
    this.aliceBufferDUniforms = {
      uTime: getOptionalUniform(this.gl, this.aliceBufferDProgram, 'uTime'),
      uFrequencyData: getOptionalUniform(this.gl, this.aliceBufferDProgram, 'uFrequencyData'),
      iChannel1: getUniform(this.gl, this.aliceBufferDProgram, 'iChannel1'),
      uFft: getUniform(this.gl, this.aliceBufferDProgram, 'uFft')
    };
    this.aliceBufferCUniforms = {
      iChannel0: getUniform(this.gl, this.aliceBufferCProgram, 'iChannel0')
    };
    this.aliceBufferBUniforms = {
      iChannel0: getUniform(this.gl, this.aliceBufferBProgram, 'iChannel0'),
      iChannel1: getOptionalUniform(this.gl, this.aliceBufferBProgram, 'iChannel1'),
      uColorBg: getUniform(this.gl, this.aliceBufferBProgram, 'uColorBg'),
      uColorText: getUniform(this.gl, this.aliceBufferBProgram, 'uColorText')
    };
    this.aliceBlurUniforms = {
      iChannel0: getUniform(this.gl, this.aliceBlurProgram, 'iChannel0')
    };

    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.disable(this.gl.CULL_FACE);
    this.gl.clearColor(1, 1, 1, 0);
    this.resize();
    this.loadIntroTexture();
  }

  resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect?.width || this.canvas.clientWidth || window.innerWidth));
    const height = Math.max(1, Math.round(rect?.height || this.canvas.clientHeight || window.innerHeight));
    const canvasWidth = Math.round(width * pixelRatio);
    const canvasHeight = Math.round(height * pixelRatio);

    if (this.canvasWidth !== canvasWidth || this.canvasHeight !== canvasHeight) {
      this.canvasWidth = canvasWidth;
      this.canvasHeight = canvasHeight;
      this.canvas.width = canvasWidth;
      this.canvas.height = canvasHeight;
    }

    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  setActive(active: boolean) {
    if (this.destroyed) return;
    if (this.active === active) return;

    this.active = active;
    if (active) {
      this.startTime = performance.now();
      this.flagAnimationStart = this.startTime + 1000;
      this.requestFrame();
      return;
    }

    if (this.animationFrameId) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  setAudioElement(audioElement: HTMLAudioElement | null) {
    if (this.destroyed || this.audioElement === audioElement) return;

    this.audioElement = audioElement;
    this.managedAudioElement = audioElement ? getManagedAudioElement(audioElement) : null;
    this.requestFrame();
  }

  setAudioFeatures(features: StageAudioFeatures | null) {
    if (this.destroyed) return;

    this.externalAudioFeatures = features;
    this.requestFrame();
  }

  resumeAudioContext() {
    const audioContext = this.managedAudioElement?.audioContext;
    if (this.destroyed || !audioContext || audioContext.state !== 'suspended') return;

    void audioContext.resume();
  }

  setItem(item: StageItem) {
    if (this.destroyed || this.currentItem === item) return;

    this.currentItem = item;
    this.startTime = performance.now();
    this.requestFrame();
  }

  setMode(mode: StageMode) {
    if (this.destroyed || this.stageMode === mode) return;

    this.stageMode = mode;
    if (mode === 'hidden') {
      if (this.animationFrameId) {
        window.cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = 0;
      }
      this.clearCanvas();
      return;
    }

    this.startTime = performance.now();
    this.requestFrame();
  }

  setTheme(theme: ThemeName) {
    if (this.destroyed || this.theme === theme) return;

    this.theme = theme;
    this.requestFrame();
  }

  private getStageColors(): StageColors {
    if (this.stageMode === 'intro-invert') {
      return { bg: WHITE, text: RED };
    }

    if (this.stageMode === 'intro') {
      return { bg: RED, text: WHITE };
    }

    switch (this.theme) {
      case 'red-white-invert':
        return { bg: PURE_RED, text: WHITE };
      case 'red-black':
        return { bg: BLACK, text: RED };
      case 'red-black-invert':
        return { bg: RED, text: BLACK };
      case 'light':
        return { bg: BLACK, text: WHITE };
      case 'dark':
        return { bg: WHITE, text: BLACK };
      case 'red':
      default:
        return { bg: WHITE, text: RED };
    }
  }

  private setColorUniforms(uniforms: Pick<TrackUniforms, 'uColorBg' | 'uColorText'>) {
    const { bg, text } = this.getStageColors();
    this.gl.uniform3f(uniforms.uColorBg, bg[0], bg[1], bg[2]);
    this.gl.uniform3f(uniforms.uColorText, text[0], text[1], text[2]);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.animationFrameId) window.cancelAnimationFrame(this.animationFrameId);

    this.gl.deleteFramebuffer(this.introPassFramebuffer);
    this.gl.deleteTexture(this.introPassTexture);
    this.gl.deleteTexture(this.introTexture);
    this.gl.deleteFramebuffer(this.acabBufferCFramebuffer);
    this.gl.deleteTexture(this.acabBufferCTexture);
    this.gl.deleteFramebuffer(this.acabBufferBFramebuffer);
    this.gl.deleteTexture(this.acabBufferBTexture);
    this.gl.deleteFramebuffer(this.fantasmiBufferBFramebuffer);
    this.gl.deleteTexture(this.fantasmiBufferBTexture);
    this.gl.deleteFramebuffer(this.strategiaBufferBFramebuffer);
    this.gl.deleteTexture(this.strategiaBufferBTexture);
    this.gl.deleteFramebuffer(this.aliceBufferDFramebuffer);
    this.gl.deleteTexture(this.aliceBufferDTexture);
    this.gl.deleteFramebuffer(this.aliceBufferCFramebuffer);
    this.gl.deleteTexture(this.aliceBufferCTexture);
    this.gl.deleteFramebuffer(this.aliceBufferBFramebuffer);
    this.gl.deleteTexture(this.aliceBufferBTexture);
    this.gl.deleteTexture(this.fftTexture);
    this.gl.deleteBuffer(this.quadBuffer);
    this.gl.deleteProgram(this.introProgram);
    this.gl.deleteProgram(this.blurProgram);
    this.gl.deleteProgram(this.shatteredRealityProgram);
    this.gl.deleteProgram(this.ilCrolloDelCieloProgram);
    this.gl.deleteProgram(this.acabBufferCProgram);
    this.gl.deleteProgram(this.acabBufferBProgram);
    this.gl.deleteProgram(this.acabBlurProgram);
    this.gl.deleteProgram(this.fantasmiBufferBProgram);
    this.gl.deleteProgram(this.fantasmiBlurProgram);
    this.gl.deleteProgram(this.strategiaBufferBProgram);
    this.gl.deleteProgram(this.strategiaBlurProgram);
    this.gl.deleteProgram(this.aliceBufferDProgram);
    this.gl.deleteProgram(this.aliceBufferCProgram);
    this.gl.deleteProgram(this.aliceBufferBProgram);
    this.gl.deleteProgram(this.aliceBlurProgram);
  }

  private createQuadBuffer(): WebGLBuffer {
    const quadBuffer = this.gl.createBuffer();
    if (!quadBuffer) throw new Error('Unable to create WebGL quad buffer.');

    const vertices = new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      -1, 1, 0, 1,
      1, -1, 1, 0,
      1, 1, 1, 1
    ]);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, quadBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    return quadBuffer;
  }

  private createIntroTexture(): WebGLTexture {
    const texture = this.gl.createTexture();
    if (!texture) throw new Error('Unable to create intro WebGL texture.');

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      1,
      1,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255])
    );

    return texture;
  }

  private createRenderTexture(): WebGLTexture {
    const texture = this.gl.createTexture();
    if (!texture) throw new Error('Unable to create intro pass WebGL texture.');

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      BUFFER_SIZE,
      BUFFER_SIZE,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      null
    );

    return texture;
  }

  private createFftTexture(): WebGLTexture {
    const texture = this.gl.createTexture();
    if (!texture) throw new Error('Unable to create FFT WebGL texture.');

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      FFT_TEXTURE_WIDTH,
      1,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      this.fftTextureData
    );

    return texture;
  }

  private createFramebuffer(texture: WebGLTexture): WebGLFramebuffer {
    const framebuffer = this.gl.createFramebuffer();
    if (!framebuffer) throw new Error('Unable to create intro pass WebGL framebuffer.');

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D,
      texture,
      0
    );

    if (this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) !== this.gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Intro pass WebGL framebuffer is incomplete.');
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    return framebuffer;
  }

  private loadIntroTexture() {
    const image = new Image();
    image.onload = () => {
      if (this.destroyed) return;

      this.gl.bindTexture(this.gl.TEXTURE_2D, this.introTexture);
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.RGBA,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        image
      );
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
      this.textureReady = true;
      this.requestFrame();
    };
    image.src = INTRO_TEXTURE_PATH;
  }

  private requestFrame() {
    if (!this.active || this.destroyed || this.stageMode === 'hidden' || this.animationFrameId) return;
    this.animationFrameId = window.requestAnimationFrame((time) => this.render(time));
  }

  private render(time: number) {
    this.animationFrameId = 0;
    if (!this.active || this.destroyed) return;

    this.resize();
    if (this.stageMode === 'hidden') {
      this.clearCanvas();
      return;
    }

    this.updateAudioAnalysis();

    const elapsed = (time - this.startTime) / 1000;
    if (this.stageMode === 'track' && this.currentItem === 'shattered-reality') {
      this.renderShatteredRealityPass(elapsed);
    } else if (this.stageMode === 'track' && this.currentItem === 'acab') {
      this.renderAcabPass(elapsed);
    } else if (this.stageMode === 'track' && this.currentItem === 'fantasmi-interrotti') {
      this.renderFantasmiInterrottiPass(elapsed);
    } else if (this.stageMode === 'track' && this.currentItem === 'strategia-della-tensione') {
      this.renderStrategiaDellaTensionePass(elapsed);
    } else if (this.stageMode === 'track' && this.currentItem === 'alice-e-le-onde-eterne-della-fine') {
      this.renderAliceELeOndeEterneDellaFinePass(elapsed);
    } else if (this.stageMode === 'track' && this.currentItem === 'il-crollo-del-cielo') {
      this.renderIlCrolloDelCieloPass(elapsed);
    } else {
      this.updateFlagVisibility(time);
      this.renderIntroPass(elapsed);
      this.renderBlurPass();
    }
    this.requestFrame();
  }

  private updateFlagVisibility(time: number) {
    if (!this.flagAnimationStart) return;
    const progress = Math.max(0, Math.min(1, (time - this.flagAnimationStart) / 2000));
    this.flagVisibility = easePower3InOut(progress);
  }

  private updateAudioAnalysis() {
    if (this.externalAudioFeatures) {
      const sensitivity = Number.isFinite(this.externalAudioFeatures.sensitivity)
        ? Math.max(0, this.externalAudioFeatures.sensitivity ?? 1)
        : 1;
      const clampAudio = (value: unknown): number => {
        const n = Number(value);
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(1, n * sensitivity));
      };
      this.frequencyBands = {
        low: clampAudio(this.externalAudioFeatures.low),
        mid: clampAudio(this.externalAudioFeatures.mid),
        high: clampAudio(this.externalAudioFeatures.high)
      };
      this.fftTextureData.fill(0);
      const fft = this.externalAudioFeatures.fft;
      for (let i = 0; i < FFT_TEXTURE_WIDTH; i += 1) {
        const value = Math.round(clampAudio(fft?.[i] ?? 0) * 255);
        this.fftTextureData[i * 4] = value;
        this.fftTextureData[i * 4 + 1] = value;
        this.fftTextureData[i * 4 + 2] = value;
        this.fftTextureData[i * 4 + 3] = 255;
      }
      return;
    }

    if (!this.managedAudioElement) {
      this.frequencyBands = { low: 0, mid: 0, high: 0 };
      this.fftTextureData.fill(0);
      return;
    }

    const { analyser, audioContext, frequencyBytes } = this.managedAudioElement;
    if (this.audioElement && !this.audioElement.paused && audioContext.state === 'suspended') {
      void audioContext.resume();
    }

    analyser.getByteFrequencyData(frequencyBytes);
    this.frequencyBands = computeFrequencyBands(frequencyBytes, audioContext);
    for (let i = 0; i < FFT_TEXTURE_WIDTH; i += 1) {
      const value = frequencyBytes[i] ?? 0;
      this.fftTextureData[i * 4] = value;
      this.fftTextureData[i * 4 + 1] = value;
      this.fftTextureData[i * 4 + 2] = value;
      this.fftTextureData[i * 4 + 3] = 255;
    }
  }

  private clearCanvas() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  private renderIntroPass(elapsed: number) {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.introPassFramebuffer);
    this.gl.viewport(0, 0, BUFFER_SIZE, BUFFER_SIZE);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.introProgram);
    bindQuadAttributes(this.gl, this.introProgram, this.quadBuffer);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.introTexture);
    this.gl.uniform1i(this.introUniforms.uTexture, 0);
    this.gl.uniform1f(this.introUniforms.uTime, elapsed);
    this.gl.uniform2f(this.introUniforms.uResolution, this.canvasWidth, this.canvasHeight);
    this.gl.uniform3f(
      this.introUniforms.uFrequencyData,
      this.frequencyBands.low,
      this.frequencyBands.mid,
      this.frequencyBands.high
    );
    const { bg, text } = this.getStageColors();
    this.gl.uniform3f(this.introUniforms.uColorBg, bg[0], bg[1], bg[2]);
    this.gl.uniform3f(this.introUniforms.uColorText, text[0], text[1], text[2]);
    this.gl.uniform1f(this.introUniforms.uFlagVisibility, this.textureReady ? this.flagVisibility : 0);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  private renderBlurPass() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.blurProgram);
    bindQuadAttributes(this.gl, this.blurProgram, this.quadBuffer);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.introPassTexture);
    this.gl.uniform1i(this.blurUniforms.iChannel0, 0);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  private renderShatteredRealityPass(elapsed: number) {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.shatteredRealityProgram);
    bindQuadAttributes(this.gl, this.shatteredRealityProgram, this.quadBuffer);

    this.gl.uniform1f(this.shatteredRealityUniforms.uTime, elapsed);
    this.gl.uniform2f(this.shatteredRealityUniforms.uResolution, this.canvasWidth, this.canvasHeight);
    this.gl.uniform3f(
      this.shatteredRealityUniforms.uFrequencyData,
      this.frequencyBands.low,
      this.frequencyBands.mid,
      this.frequencyBands.high
    );
    this.setColorUniforms(this.shatteredRealityUniforms);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  private renderIlCrolloDelCieloPass(elapsed: number) {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.ilCrolloDelCieloProgram);
    bindQuadAttributes(this.gl, this.ilCrolloDelCieloProgram, this.quadBuffer);

    this.gl.uniform1f(this.ilCrolloDelCieloUniforms.uTime, elapsed);
    if (this.ilCrolloDelCieloUniforms.uResolution) {
      this.gl.uniform2f(
        this.ilCrolloDelCieloUniforms.uResolution,
        this.canvasWidth,
        this.canvasHeight
      );
    }
    this.gl.uniform3f(
      this.ilCrolloDelCieloUniforms.uFrequencyData,
      this.frequencyBands.low,
      this.frequencyBands.mid,
      this.frequencyBands.high
    );
    this.setColorUniforms(this.ilCrolloDelCieloUniforms);
    this.gl.uniform1f(this.ilCrolloDelCieloUniforms.flag01, 0.1);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  private renderAcabPass(elapsed: number) {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.acabBufferCFramebuffer);
    this.gl.viewport(0, 0, BUFFER_SIZE, BUFFER_SIZE);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.acabBufferCProgram);
    bindQuadAttributes(this.gl, this.acabBufferCProgram, this.quadBuffer);

    this.gl.uniform1f(this.acabBufferCUniforms.uTime, elapsed);
    this.gl.uniform3f(
      this.acabBufferCUniforms.uFrequencyData,
      this.frequencyBands.low,
      this.frequencyBands.mid,
      this.frequencyBands.high
    );
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.acabBufferBFramebuffer);
    this.gl.viewport(0, 0, BUFFER_SIZE, BUFFER_SIZE);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.acabBufferBProgram);
    bindQuadAttributes(this.gl, this.acabBufferBProgram, this.quadBuffer);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.acabBufferCTexture);
    this.gl.uniform1i(this.acabBufferBUniforms.iChannel0, 0);
    this.gl.uniform1f(this.acabBufferBUniforms.uTime, elapsed);
    this.gl.uniform2f(this.acabBufferBUniforms.uResolution, this.canvasWidth, this.canvasHeight);
    if (this.acabBufferBUniforms.uFrequencyData) {
      this.gl.uniform3f(
        this.acabBufferBUniforms.uFrequencyData,
        this.frequencyBands.low,
        this.frequencyBands.mid,
        this.frequencyBands.high
      );
    }
    this.setColorUniforms(this.acabBufferBUniforms);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.acabBlurProgram);
    bindQuadAttributes(this.gl, this.acabBlurProgram, this.quadBuffer);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.acabBufferBTexture);
    this.gl.uniform1i(this.acabBlurUniforms.iChannel0, 0);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  private renderFantasmiInterrottiPass(elapsed: number) {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fantasmiBufferBFramebuffer);
    this.gl.viewport(0, 0, BUFFER_SIZE, BUFFER_SIZE);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.fantasmiBufferBProgram);
    bindQuadAttributes(this.gl, this.fantasmiBufferBProgram, this.quadBuffer);

    this.gl.uniform1f(this.fantasmiBufferBUniforms.uTime, elapsed);
    this.gl.uniform2f(this.fantasmiBufferBUniforms.uResolution, this.canvasWidth, this.canvasHeight);
    this.gl.uniform3f(
      this.fantasmiBufferBUniforms.uFrequencyData,
      this.frequencyBands.low,
      this.frequencyBands.mid,
      this.frequencyBands.high
    );
    this.setColorUniforms(this.fantasmiBufferBUniforms);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.fantasmiBlurProgram);
    bindQuadAttributes(this.gl, this.fantasmiBlurProgram, this.quadBuffer);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.fantasmiBufferBTexture);
    this.gl.uniform1i(this.fantasmiBlurUniforms.iChannel1, 0);
    if (this.fantasmiBlurUniforms.uTime) {
      this.gl.uniform1f(this.fantasmiBlurUniforms.uTime, elapsed);
    }
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  private updateFftTexture() {
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.fftTexture);
    this.gl.texSubImage2D(
      this.gl.TEXTURE_2D,
      0,
      0,
      0,
      FFT_TEXTURE_WIDTH,
      1,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      this.fftTextureData
    );
  }

  private renderStrategiaDellaTensionePass(elapsed: number) {
    this.updateFftTexture();

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.strategiaBufferBFramebuffer);
    this.gl.viewport(0, 0, BUFFER_SIZE, BUFFER_SIZE);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.strategiaBufferBProgram);
    bindQuadAttributes(this.gl, this.strategiaBufferBProgram, this.quadBuffer);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.fftTexture);
    this.gl.uniform1i(this.strategiaBufferBUniforms.uFft, 0);
    this.gl.uniform1f(this.strategiaBufferBUniforms.uTime, elapsed);
    if (this.strategiaBufferBUniforms.uResolution) {
      this.gl.uniform2f(
        this.strategiaBufferBUniforms.uResolution,
        this.canvasWidth,
        this.canvasHeight
      );
    }
    this.setColorUniforms(this.strategiaBufferBUniforms);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.strategiaBlurProgram);
    bindQuadAttributes(this.gl, this.strategiaBlurProgram, this.quadBuffer);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.strategiaBufferBTexture);
    this.gl.uniform1i(this.strategiaBlurUniforms.iChannel0, 0);
    if (this.strategiaBlurUniforms.uTime) {
      this.gl.uniform1f(this.strategiaBlurUniforms.uTime, elapsed);
    }
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  private renderAliceELeOndeEterneDellaFinePass(elapsed: number) {
    this.updateFftTexture();

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.aliceBufferDFramebuffer);
    this.gl.viewport(0, 0, BUFFER_SIZE, BUFFER_SIZE);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.aliceBufferDProgram);
    bindQuadAttributes(this.gl, this.aliceBufferDProgram, this.quadBuffer);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.aliceBufferCTexture);
    this.gl.uniform1i(this.aliceBufferDUniforms.iChannel1, 0);
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.fftTexture);
    this.gl.uniform1i(this.aliceBufferDUniforms.uFft, 1);
    if (this.aliceBufferDUniforms.uTime) {
      this.gl.uniform1f(this.aliceBufferDUniforms.uTime, elapsed);
    }
    if (this.aliceBufferDUniforms.uFrequencyData) {
      this.gl.uniform3f(
        this.aliceBufferDUniforms.uFrequencyData,
        this.frequencyBands.low,
        this.frequencyBands.mid,
        this.frequencyBands.high
      );
    }
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.aliceBufferCFramebuffer);
    this.gl.viewport(0, 0, BUFFER_SIZE, BUFFER_SIZE);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.aliceBufferCProgram);
    bindQuadAttributes(this.gl, this.aliceBufferCProgram, this.quadBuffer);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.aliceBufferDTexture);
    this.gl.uniform1i(this.aliceBufferCUniforms.iChannel0, 0);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.aliceBufferBFramebuffer);
    this.gl.viewport(0, 0, BUFFER_SIZE, BUFFER_SIZE);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.aliceBufferBProgram);
    bindQuadAttributes(this.gl, this.aliceBufferBProgram, this.quadBuffer);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.aliceBufferDTexture);
    this.gl.uniform1i(this.aliceBufferBUniforms.iChannel0, 0);
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.aliceBufferCTexture);
    if (this.aliceBufferBUniforms.iChannel1) {
      this.gl.uniform1i(this.aliceBufferBUniforms.iChannel1, 1);
    }
    this.setColorUniforms(this.aliceBufferBUniforms);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.aliceBlurProgram);
    bindQuadAttributes(this.gl, this.aliceBlurProgram, this.quadBuffer);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.aliceBufferBTexture);
    this.gl.uniform1i(this.aliceBlurUniforms.iChannel0, 0);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }
}

export function createMirroredStageRenderer(canvas: HTMLCanvasElement): MirroredStageRenderer {
  return new WebGlMirroredStageRenderer(canvas);
}

export function createIntroStageRenderer(canvas: HTMLCanvasElement): MirroredStageRenderer {
  return createMirroredStageRenderer(canvas);
}
