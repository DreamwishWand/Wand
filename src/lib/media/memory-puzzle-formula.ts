/** Independently expressed arithmetic observed in Steam 1.26.2 Custom/Puzzle.
 * Native shader object SHA256: 6590aad4564626d21aec18110b43d05865afb6cf13225667a4424925b714dd32
 * Four pixel variants agree before UI clipping/alpha discard.
 * Serialized material presets and normalized source-alpha blend are established.
 * Texture slot binding, sampler state, color space and saved-bit polarity remain unverified. This is not a product rendering gate.
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

/** Serialized material values, not the values after a runtime script updates
 * them. Only derived numeric properties are public; no native assets/code. */
export const PUZZLE_MATERIALS={
  mask:{name:'mat_Puzzle_mask',tint:[0,0,0],alpha:1,pieces:767,alphaClip:false},
  show:{name:'mat_Puzzle_show',tint:[0.9333332180976868,0.9882351756095886,1],alpha:0,pieces:0,alphaClip:true}
} as const satisfies Record<string,{name:string,tint:Rgb,alpha:number,pieces:number,alphaClip:boolean}>;
export type PuzzleMaterial=keyof typeof PUZZLE_MATERIALS;
/** RGB composition on an opaque normalized target, for the observed SrcAlpha,
 * OneMinusSrcAlpha blend. Color space and runtime underlay are separate inputs. */
export function puzzleBlend(underlay:Rgb,fragment:readonly [number,number,number,number],alphaClip:boolean):Rgb{
  const a=Math.max(0,Math.min(1,fragment[3]));
  if(alphaClip&&fragment[3]<0.001)return underlay;
  return [underlay[0]+a*(fragment[0]-underlay[0]),underlay[1]+a*(fragment[1]-underlay[1]),underlay[2]+a*(fragment[2]-underlay[2])];
}
export const puzzleBlendGlsl=`
vec3 puzzleBlend(vec3 underlay,vec4 fragment,bool alphaClip){
  if(alphaClip&&fragment.a<0.001)return underlay;
  return mix(underlay,fragment.rgb,clamp(fragment.a,0.0,1.0));
}`;
