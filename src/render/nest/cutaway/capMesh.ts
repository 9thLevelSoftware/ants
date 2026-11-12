// One cut face on screen: the soil cross-section (#3A2A1E, textured with the soil set, stone grey where a hard object
// is cut) with holes where the face crosses open nest space or air, and a 0.25 BU line along every cut edge
// (GDD 08 4.3). The disc of a horizontal slice is limited to the cut radius.
import {
  Color, CylinderGeometry, DataTexture, DoubleSide, LinearFilter, Matrix4, Mesh, PlaneGeometry, RGFormat, ShaderMaterial, UniformsLib,
  UniformsUtils, UnsignedByteType, Vector3, type BufferGeometry, type IUniform,
} from 'three';
import { GLSL_NOISE, GLSL_TRIPLANAR } from '@/render/world/materials';
import type { TextureSet } from '@/render/world/materials';
import { GLSL_NOISE3 } from '../materials/glsl';
import type { NestUniforms } from '../materials/nestUniforms';
import { CUTAWAY } from '../params';
import type { CapFace } from './capFaces';
import type { CapImage } from './capRaster';

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
varying vec3 vCapW;
varying vec3 vCapN;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vCapW = w.xyz;
  vCapN = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
${GLSL_NOISE}
${GLSL_TRIPLANAR}
${GLSL_NOISE3}
uniform sampler2D tCap;
uniform sampler2D tWrA, tWrN, tWrR; uniform float uWrScale;
uniform vec3 uCapCol; uniform vec3 uStoneCol; uniform vec3 uEdgeCol; uniform vec3 uCutFill;
uniform float uEdgeW; uniform float uRadialLimit; uniform vec3 uCutC; uniform float uCutR; uniform float uBu;
varying vec2 vUv;
varying vec3 vCapW;
varying vec3 vCapN;
void main() {
  #include <logdepthbuf_fragment>
  vec2 t = texture2D(tCap, vUv).rg;
  if (t.r < 0.5) discard;
  if (uRadialLimit > 0.5) { vec2 r = vCapW.xz - uCutC.xz; if (dot(r, r) > uCutR * uCutR) discard; }
  vec3 alb; vec3 nw; float rg;
  vec3 n = normalize(vCapN);
  wrTri(tWrA, tWrN, tWrR, vCapW, n, uWrScale, 1.0, alb, nw, rg);
  float l = dot(alb, vec3(0.2126, 0.7152, 0.0722));
  vec3 q = vCapW / uBu;
  float strata = nestN3(vec3(q.x * 0.15, q.y * 1.6, q.z * 0.15));
  vec3 col = mix(uCapCol, uStoneCol, step(0.5, t.g)) * clamp(0.45 + 5.0 * l, 0.45, 1.6);
  col = mix(col, col * vec3(1.12, 0.98, 0.85), strata * 0.5);
  float lit = 0.75 + 0.25 * abs(dot(nw, normalize(cameraPosition - vCapW)));
  col *= lit;
  if (t.r < 0.5 + max(uEdgeW, 1.5 * fwidth(t.r))) col = uEdgeCol; // at least ~1 px wide from far away
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class CapMesh {
  readonly mesh: Mesh;
  private tex: DataTexture | null = null;
  private material: ShaderMaterial;
  private uploaded = -1;

  constructor(u: NestUniforms, soil: TextureSet, soilScaleMm: number) {
    this.material = new ShaderMaterial({
      name: 'nest:cap',
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...UniformsUtils.merge([UniformsLib.fog]),
        tCap: { value: null },
        tWrA: { value: soil.albedo }, tWrN: { value: soil.normal }, tWrR: { value: soil.rough }, uWrScale: { value: soilScaleMm },
        uCapCol: { value: new Color(CUTAWAY.capHex).multiplyScalar(CUTAWAY.capLevel) },
        uStoneCol: { value: new Color(CUTAWAY.stoneHex).multiplyScalar(CUTAWAY.capLevel) },
        uEdgeCol: { value: new Color(CUTAWAY.edgeHex) },
        uEdgeW: { value: CUTAWAY.edgeBU }, // solidness units: the ramp is 1 BU wide
        uRadialLimit: { value: 0 },
        uCutC: u.uCutC, uCutR: u.uCutR, uBu: u.uBu, uCutFill: u.uCutFill,
      } as Record<string, IUniform>,
      side: DoubleSide,
      fog: true,
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.material);
    this.mesh.name = 'nest:cutaway-cap';
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Shows the image on its face (re-uploads and re-places when its revision changed). */
  show(img: CapImage | null, revision: number): void {
    if (!img) { this.mesh.visible = false; return; }
    if (revision !== this.uploaded) {
      this.uploaded = revision;
      if (!this.tex || this.tex.image.width !== img.width || this.tex.image.height !== img.height) {
        this.tex?.dispose();
        this.tex = new DataTexture(img.data, img.width, img.height, RGFormat, UnsignedByteType);
        this.tex.magFilter = LinearFilter; this.tex.minFilter = LinearFilter; this.tex.generateMipmaps = false;
        this.tex.unpackAlignment = 1;
        this.material.uniforms.tCap.value = this.tex;
      } else {
        this.tex.image.data = img.data;
      }
      this.tex.needsUpdate = true;
      this.place(img.face);
    }
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.tex?.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }

  private place(f: CapFace): void {
    let geo: BufferGeometry;
    const m = new Matrix4();
    if (f.kind === 'cylinder') {
      const h = f.v1 - f.v0;
      geo = new CylinderGeometry(f.radius, f.radius, h, 192, 1, true);
      m.makeTranslation(f.o.x, f.o.y + f.v0 + h / 2, f.o.z);
    } else {
      geo = new PlaneGeometry(1, 1);
      const cu = (f.u0 + f.u1) / 2, cv = (f.v0 + f.v1) / 2;
      const U = new Vector3(f.a.x, f.a.y, f.a.z).multiplyScalar(f.u1 - f.u0);
      const V = new Vector3(f.b.x, f.b.y, f.b.z).multiplyScalar(f.v1 - f.v0);
      const W = new Vector3().crossVectors(U, V).normalize();
      m.makeBasis(U, V, W).setPosition(f.o.x + f.a.x * cu + f.b.x * cv, f.o.y + f.a.y * cu + f.b.y * cv, f.o.z + f.a.z * cu + f.b.z * cv);
    }
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
    this.mesh.matrix.copy(m);
    this.mesh.matrixWorldNeedsUpdate = true;
    this.material.uniforms.uRadialLimit.value = f.radial ? 1 : 0;
  }
}
