// int-1A (truncated review finding): the shadow depth material mirrors the wall shader's existence tests.
import { describe, expect, it } from 'vitest';
import { ShaderChunk } from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';
import { NestMaterials } from './nestMaterials';
import { createNestUniforms } from './nestUniforms';

describe('nest shadow depth material', () => {
  it('discards like the walls: skin band with the hole exception, and the colony slice', () => {
    const u = createNestUniforms();
    const mats = new NestMaterials(null as never, u, { detail: false });
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: ShaderChunk.depth_vert,
      fragmentShader: ShaderChunk.depth_frag,
    } as unknown as WebGLProgramParametersWithUniforms;
    mats.depth.onBeforeCompile(shader, null as never);
    expect(shader.vertexShader).toContain('vNestHole = aNest.w;');
    expect(shader.vertexShader).toContain('vNestW = (modelMatrix');
    expect(shader.fragmentShader).toContain('vNestHole <= -uHoleLip ? -uSkin : 0.0');
    expect(shader.fragmentShader).toContain('if (uCutMode == 1)');
    // the uniforms are the renderer's own objects, so the slice moves the shadow casters too
    expect(shader.uniforms.uCutMode).toBe(u.uCutMode);
    expect(shader.uniforms.uHoleLip).toBe(u.uHoleLip);
    mats.dispose();
  });
});
