// Outer glow filter, the Pixi port of Flash GlowFilter as used for creature hover (legacy CreatureView.mouseOverHandler:
// GamePredef.FILTER_CHAR_SELECTED = GlowFilter(0xFFFFFF, alpha 5, blurX 10, blurY 10, strength 3)).
// The glow is the sprite alpha averaged over a disc of `distance` px, times `strength`, drawn behind the sprite.

import { Filter, GlProgram, GpuProgram, UniformGroup, defaultFilterVert } from 'pixi.js';

const ANGLES = 16;
const RINGS = 3;

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec3 uColor;
uniform float uDistance;
uniform float uStrength;

void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);
  float sum = 0.0;
  float weight = 0.0;
  for (int r = 1; r <= ${RINGS}; r++) {
    float radius = uDistance * float(r) / ${RINGS}.0;
    float w = 1.0 - float(r - 1) / ${RINGS}.0;
    for (int a = 0; a < ${ANGLES}; a++) {
      float ang = 6.2831853 * float(a) / ${ANGLES}.0;
      vec2 uv = vTextureCoord + vec2(cos(ang), sin(ang)) * radius * uInputSize.zw;
      sum += texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw)).a * w;
      weight += w;
    }
  }
  float g = clamp(sum / weight * uStrength, 0.0, 1.0);
  finalColor = vec4(src.rgb + uColor * g * (1.0 - src.a), src.a + g * (1.0 - src.a));
}
`;

const wgsl = `
struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

struct GlowUniforms {
  uColor:vec3<f32>,
  uDistance:f32,
  uStrength:f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> glowUniforms: GlowUniforms;

struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>
};

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return VSOutput(vec4(position, 0.0, 1.0), aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw));
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let src = textureSampleLevel(uTexture, uSampler, uv, 0.0);
  var sum = 0.0;
  var weight = 0.0;
  for (var r = 1; r <= ${RINGS}; r++) {
    let radius = glowUniforms.uDistance * f32(r) / ${RINGS}.0;
    let w = 1.0 - f32(r - 1) / ${RINGS}.0;
    for (var a = 0; a < ${ANGLES}; a++) {
      let ang = 6.2831853 * f32(a) / ${ANGLES}.0;
      let p = uv + vec2(cos(ang), sin(ang)) * radius * gfu.uInputSize.zw;
      sum += textureSampleLevel(uTexture, uSampler, clamp(p, gfu.uInputClamp.xy, gfu.uInputClamp.zw), 0.0).a * w;
      weight += w;
    }
  }
  let g = clamp(sum / weight * glowUniforms.uStrength, 0.0, 1.0);
  return vec4(src.rgb + glowUniforms.uColor * g * (1.0 - src.a), src.a + g * (1.0 - src.a));
}
`;

export interface GlowOptions {
  color?: number;
  distance?: number;
  strength?: number;
}

export class GlowFilter extends Filter {
  constructor({ color = 0xffffff, distance = 10, strength = 3 }: GlowOptions = {}) {
    const glowUniforms = new UniformGroup({
      uColor: { value: new Float32Array([((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255]), type: 'vec3<f32>' },
      uDistance: { value: distance, type: 'f32' },
      uStrength: { value: strength, type: 'f32' },
    });
    super({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment, name: 'glow-filter' }),
      gpuProgram: GpuProgram.from({
        vertex: { source: wgsl, entryPoint: 'mainVertex' },
        fragment: { source: wgsl, entryPoint: 'mainFragment' },
      }),
      resources: { glowUniforms },
      padding: distance + 2,
    });
  }
}

/** Legacy GamePredef.FILTER_CHAR_SELECTED, shared by every hovered creature. */
export const CHAR_SELECTED_GLOW = new GlowFilter({ color: 0xffffff, distance: 10, strength: 3 });
