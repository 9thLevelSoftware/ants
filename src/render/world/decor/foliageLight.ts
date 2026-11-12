// Lighting patch for thin foliage (grass blades, leaves, petals): three's lights_fragment_begin with the shared
// forest dapple (materials/dapple.ts) on the key light, plus back-lit transmission inside the directional-light loop
// (spike-look 2.7), shadowed by the same shadow map. Golden hour: blades glow when the sun is behind them.
import { dappledLightsChunk } from '../materials/dapple';

const DIR_LOOP = 'for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {';
const RE_LINE = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';

/**
 * Replacement for `#include <lights_fragment_begin>`. Needs `varying vec3 vWrW` (world position), GLSL_NOISE,
 * GLSL_DAPPLE and a float expression `transl` (strength x tint is applied by the caller through `tintExpr`).
 */
export function foliageLightsChunk(strengthExpr: string, tintExpr: string): string {
  const src = dappledLightsChunk();
  const at = src.indexOf(DIR_LOOP);
  if (at < 0) throw new Error('lights_fragment_begin changed: directional loop not found');
  const head = src.slice(0, at), loop = src.slice(at);
  if (!loop.includes(RE_LINE)) throw new Error('lights_fragment_begin changed: RE_Direct call not found');
  const patched = loop.replace(RE_LINE, `${RE_LINE}
		{ float fwdT = pow( saturate( dot( geometryViewDir, -directLight.direction ) ), 6.0 );
		  float backT = saturate( dot( -geometryNormal, directLight.direction ) );
		  dcTransl += directLight.color * ( 0.55 * backT + 1.6 * fwdT * ( 0.35 + backT ) ); }`);
  return `vec3 dcTransl = vec3( 0.0 );\n${head}${patched}
reflectedLight.directDiffuse += ( ${strengthExpr} ) * dcTransl * diffuseColor.rgb * ( ${tintExpr} ) * RECIPROCAL_PI;
`;
}
