/** Independently expressed arithmetic observed in Steam 1.26.2 Custom/Puzzle.
 * Native shader object SHA256: 6590aad4564626d21aec18110b43d05865afb6cf13225667a4424925b714dd32
 * Four pixel variants agree before UI clipping/alpha discard.
 * Texture slot binding, sampler state, color space, material values and save
 * flag polarity are not established. This is not a product rendering gate.
 */
export type Rgb=readonly [number,number,number];
export function puzzleMaskValue(r:number,g:number):number{
  if(![r,g].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new RangeError('Normalized mask channels required');
  return Math.trunc(r*255)|(Math.trunc(g*255)<<8);
}
export function puzzleFragment(maskR:number,maskG:number,contourR:number,flags:number,
  tex0:Rgb,tint:Rgb,opacity:number):readonly [number,number,number,number]{
  if(!Number.isInteger(flags)||flags<0||flags>65535||
    ![contourR,opacity,...tex0,...tint].every(v=>Number.isFinite(v)&&v>=0&&v<=1))
    throw new RangeError('Invalid puzzle inputs');
  const hit=(puzzleMaskValue(maskR,maskG)&flags)!==0?1:0;
  // Alpha is intentionally not clamped here: the native fragment can exceed 1.
  return [tint[0]+contourR*(tex0[0]-tint[0]),
    tint[1]+contourR*(tex0[1]-tint[1]),
    tint[2]+contourR*(tex0[2]-tint[2]),
    (1+hit-contourR)*opacity];
}
export const puzzleFragmentGlsl=`
vec4 puzzleFragment(vec2 maskRG,float contourR,int flags,vec3 tex0,vec3 tint,float opacity){
  uvec2 rg=uvec2(maskRG*255.0);
  uint code=rg.x|(rg.y<<8u);
  float hit=(code&uint(flags))!=0u?1.0:0.0;
  return vec4(tint+contourR*(tex0-tint),(1.0+hit-contourR)*opacity);
}`;
