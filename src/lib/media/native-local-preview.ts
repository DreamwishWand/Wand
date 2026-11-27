import {validateLayer,type Layer,type ImageLayer,type ImageSource,type Affine,type View} from './native-map-renderer.ts';
import {parseNativeAreaRules,type AreaPlan} from './native-map-area-rules.ts';
export interface LocalNativeMap{readonly id:string;readonly width:number;readonly height:number;readonly ticksToCanvas:Affine;readonly locked:readonly Layer[];readonly unlocked:readonly Layer[];readonly areaPlan?:AreaPlan}
const sha=/^[a-f0-9]{64}$/;
const object=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function check(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}
const dimension=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0&&x<=32768;
function parseLayer(value:unknown,allowMask=true):Layer{
 check(object(value),'Invalid layer');
 const m=value.unitQuadToCanvas,c=value.rgba;
 check(Array.isArray(m)&&m.length===6&&m.every(Number.isFinite)&&Array.isArray(c)&&c.length===4&&c.every(Number.isFinite),'Invalid layer vectors');
 check(value.kind==='fill'||value.kind==='texture'||value.kind==='sdf','Invalid layer kind');
 const l:Layer={kind:value.kind,unitQuadToCanvas:m as unknown as Affine,rgba:c as unknown as Layer['rgba']};
 if(value.kind!=='fill'){
  check(typeof value.imageSha256==='string'&&sha.test(value.imageSha256)&&Array.isArray(value.size)&&value.size.length===2&&value.size.every(dimension)&&value.size[0]*value.size[1]<=100_000_000&&Array.isArray(value.wrap)&&value.wrap.length===2&&value.wrap.every(x=>x===0||x===1)&&value.colorSpace===(value.kind==='sdf'?'Linear':'sRGB'),'Invalid image');
  l.imageSha256=value.imageSha256;l.size=value.size as unknown as ImageLayer['size'];l.wrap=value.wrap as unknown as ImageLayer['wrap'];l.colorSpace=value.kind==='sdf'?'Linear':'sRGB';
 }
 if(value.mask!==undefined){
  const mask=value.mask;check(allowMask&&object(mask)&&Array.isArray(mask.overlayToMaskUv)&&mask.overlayToMaskUv.length===6&&mask.overlayToMaskUv.every(Number.isFinite),'Invalid mask');
  const uv=mask.overlayToMaskUv as unknown as Affine;
  if(mask.kind==='rect')l.mask={kind:'rect',overlayToMaskUv:uv};
  else{check(mask.kind==='alpha','Invalid mask kind');const image=parseLayer(mask.image,false);check(image.kind==='texture','Invalid mask image');l.mask={kind:'alpha',overlayToMaskUv:uv,image:image as ImageLayer};}
 }
 validateLayer(l);return l;
}
export function parseLocalNativePreview(value:unknown):LocalNativeMap[]{
 check(object(value)&&value.schema==='wand.media.native-local-preview@1'&&value.gameVersion==='1.26.2'&&value.privateOnly===true&&value.publicationAuthorized===false&&value.worldPlacementVerified===false&&Array.isArray(value.maps)&&value.maps.length>0&&value.maps.length<=10,'Not a private native map candidate');
 const ids=new Set<string>();
 return value.maps.map(m=>{
  check(object(m)&&typeof m.id==='string'&&/^MapVillage[A-Za-z0-9]+$/.test(m.id)&&!ids.has(m.id)&&dimension(m.width)&&dimension(m.height)&&Array.isArray(m.ticksToCanvas)&&m.ticksToCanvas.length===6&&m.ticksToCanvas.every(Number.isFinite),'Invalid native map');
  const t=m.ticksToCanvas;check(t[0]>0&&t[3]>0&&t[1]===0&&t[2]===0,'Invalid editor coordinate basis');ids.add(m.id);
  const layers=(x:unknown)=>{check(Array.isArray(x)&&x.length>0&&x.length<=512,'Invalid draw plan');return x.map(l=>parseLayer(l));};
  const locked=layers(m.locked),unlocked=layers(m.unlocked);
  const areaPlan=m.areaTypes!==undefined||m.areaRules!==undefined?parseNativeAreaRules(m,locked,unlocked):undefined;
  return {id:m.id,width:m.width,height:m.height,ticksToCanvas:t as unknown as Affine,locked,unlocked,...(areaPlan?{areaPlan}:{})};
 });
}
export function nativeEditorExtent(m:LocalNativeMap){const [a,,,,e,f]=m.ticksToCanvas,d=m.ticksToCanvas[3];return {x:-e/a,y:-f/d,w:m.width/a,h:m.height/d};}
export function editorViewToNativeCanvas(m:LocalNativeMap,v:{x:number;y:number;w:number;h:number}):View{
 const [a,,,d,e,f]=m.ticksToCanvas;check([v.x,v.y,v.w,v.h].every(Number.isFinite)&&v.w>0&&v.h>0,'Invalid editor viewport');
 return {x:a*v.x+e,y:d*v.y+f,width:a*v.w,height:d*v.h};
}
export function requiredLocalImages(maps:readonly LocalNativeMap[]){
 const ids=new Map<string,readonly [number,number]>();
 function add(l:Layer){if(l.kind!=='fill'){const i=l as ImageLayer,old=ids.get(i.imageSha256);check(!old||old[0]===i.size[0]&&old[1]===i.size[1],'Conflicting image dimensions');ids.set(i.imageSha256,i.size);}if(l.mask?.kind==='alpha')add(l.mask.image);}
 for(const m of maps)for(const l of [...m.locked,...m.unlocked])add(l);return ids;
}
/** Local-only image provider. Never fetches or uploads. File SHA is checked before decode. */
export function localNativeImageSource(files:readonly File[],maps:readonly LocalNativeMap[]):ImageSource{
 const required=requiredLocalImages(maps),bySha=new Map<string,File>(),verified=new Set<string>();
 for(const file of files){const m=/^([a-f0-9]{64})\.(webp|png)$/.exec(file.name);if(!m||!required.has(m[1]))continue;check(!bySha.has(m[1])&&file.size>0&&file.size<=80*1024*1024,'Duplicate or oversized local image');bySha.set(m[1],file);}
 check([...required.keys()].every(k=>bySha.has(k)),'Missing local image files');
 return async (layer,signal)=>{
  signal?.throwIfAborted();const file=bySha.get(layer.imageSha256);check(file,'Unknown local image');
  if(!verified.has(layer.imageSha256)){
   const bytes=await file.arrayBuffer();signal?.throwIfAborted();
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   check(digest===layer.imageSha256,'Local image digest mismatch');verified.add(digest);
  }
  signal?.throwIfAborted();const bitmap=await createImageBitmap(file,{colorSpaceConversion:'none',premultiplyAlpha:'none',imageOrientation:'none'});
  if(signal?.aborted||bitmap.width!==layer.size[0]||bitmap.height!==layer.size[1]){bitmap.close();signal?.throwIfAborted();throw Error('Local image dimensions mismatch');}
  return bitmap;
 };
}

export interface LocalNativePreviewPack{readonly maps:readonly LocalNativeMap[];readonly source:ImageSource}
export async function readNativeManifest(files:readonly File[]):Promise<unknown>{
 const manifests=files.filter(f=>/\.json$/i.test(f.name));
 check(manifests.length===1&&manifests[0].size>0&&manifests[0].size<=4*1024*1024,'Select exactly one native map JSON manifest (max 4 MiB)');
 return JSON.parse(await manifests[0].text());
}
export async function openLocalNativePreview(files:readonly File[],doc?:unknown):Promise<LocalNativePreviewPack>{
 const maps=parseLocalNativePreview(doc===undefined?await readNativeManifest(files):doc);
 return {maps,source:localNativeImageSource(files,maps)};
}
const EDITOR_MAP_IDS:Readonly<Record<string,string>>=Object.freeze({
 Village04:'MapVillage04',VillageExpansion01:'MapVillageExpansion1',VillageExpansion02:'MapVillageExpansion2',
 VillageExpansion03:'MapVillageExpansion3',VillageExpansion04:'MapVillageExpansion4',VillageWinnieDLC:'MapVillageWinnieDLCMini01'
});
/** Source-world mapping only. Independent islands/underwater/rooms are not registered. */
export function nativeMapForEditor(pack:LocalNativePreviewPack|null,scope:string,independent:boolean):LocalNativeMap|null{
 if(!pack||independent||!Object.hasOwn(EDITOR_MAP_IDS,scope))return null;
 const m=pack.maps.find(m=>m.id===EDITOR_MAP_IDS[scope]);
 return m&&m.ticksToCanvas[0]===m.ticksToCanvas[3]?m:null;
}

/** Only the six connected source worlds are mapped; other scenes are independent. */
export function nativeMapSourceScope(id:string):string|null{
 return Object.entries(EDITOR_MAP_IDS).find(([,map])=>map===id)?.[0]??null;
}
