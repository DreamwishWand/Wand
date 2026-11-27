import {selectNativeBackgroundLayers} from './native-map-blocker-visibility.ts';
import {selectLockOverlayCandidates,type LockOverlayCandidate} from './native-map-mask-geometry.ts';
import {validateLayer,type Layer,type ImageLayer,type Affine,type Color} from './native-map-renderer.ts';
export type NativeRef={cab:string;pathID:string};
export type NativeImage={source:NativeRef;size:readonly [number,number];sampling:{wrapU:number;wrapV:number;textureColorSpace:number;filterMode:number;mipCount:number}};
export type Background=Layer&{node:string;blockerAreaTypes:readonly number[]};
export type Overlay=LockOverlayCandidate&{kind:'fill'|'texture';rgba:Color;image?:NativeImage;mask?:NonNullable<LockOverlayCandidate['mask']>&{image?:NativeImage}};
export type ResolveImage=(ref:NativeRef)=>string|undefined;
function check(ok:unknown,message:string):asserts ok{if(!ok)throw new Error(message);}
function multiply(a:Affine,b:Affine):Affine{
 return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
function image(i:NativeImage|undefined,quad:Affine,rgba:Color,resolve:ResolveImage):ImageLayer{
 check(i&&i.sampling.filterMode===1&&i.sampling.mipCount===1&&i.sampling.textureColorSpace===1,'Unsupported overlay image sampler');
 const sha=resolve(i.source);check(sha,'Unresolved native overlay or mask texture');
 const l:ImageLayer={kind:'texture',imageSha256:sha,size:i.size,wrap:[i.sampling.wrapU,i.sampling.wrapV],colorSpace:'sRGB',unitQuadToCanvas:quad,rgba};validateLayer(l);return l;
}
/** Unpublished preview plan. CanvasGroup alpha must be computed for the same area state; save-derived predicates are not evaluated here. */
export function buildNativeMaskedPreview(background:readonly Background[],overlays:readonly Overlay[],nodeOrder:readonly string[],rootToCanvas:Affine,locked:ReadonlyMap<number,boolean>,resolve:ResolveImage,canvasAlpha:ReadonlyMap<string,number>){
 const order=new Map(nodeOrder.map((id,i)=>[id,i]));check(order.size===nodeOrder.length,'Duplicate native node');
 const rows:{node:string;layer:Layer}[]=selectNativeBackgroundLayers(background,locked).map(layer=>({node:layer.node,layer}));
 for(const {overlay:o,overlayToMaskUv} of selectLockOverlayCandidates(overlays,locked)){
  check(order.get(o.node)===o.drawOrder&&o.mask,'Native overlay order mismatch');
  const quad=multiply(rootToCanvas,o.quad);
  const layer:Layer=o.kind==='fill'?{kind:'fill',unitQuadToCanvas:quad,rgba:o.rgba}:image(o.image,quad,o.rgba,resolve);
  layer.mask=o.mask.kind==='solid-fallback'?{kind:'rect',overlayToMaskUv}:{kind:'alpha',overlayToMaskUv,image:image(o.mask.image,multiply(rootToCanvas,o.mask.quad),[1,1,1,1],resolve)};
  rows.push({node:o.node,layer});
 }
 const seen=new Set<string>();for(const r of rows){check(order.has(r.node)&&!seen.has(r.node),'Missing or duplicate draw node');seen.add(r.node);validateLayer(r.layer);}
 rows.sort((a,b)=>order.get(a.node)!-order.get(b.node)!);
 const layers=rows.map(r=>{
  const alpha=canvasAlpha.get(r.node);check(typeof alpha==='number'&&Number.isFinite(alpha)&&alpha>=0&&alpha<=1,'Missing or invalid native CanvasGroup alpha');
  const rgba:Color=[r.layer.rgba[0],r.layer.rgba[1],r.layer.rgba[2],r.layer.rgba[3]*alpha];
  return {...r.layer,rgba};
 });
 return {layers,runtimeVisibilityVerified:false as const,canvasGroupAlphaApplied:true as const,canvasGroupAlphaVerified:false as const,maskGpuVerified:false as const};
}
