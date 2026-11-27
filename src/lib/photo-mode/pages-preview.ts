import {openPrivateDiagnostic} from '../../../tools/photo-mode/gpu-scene-loader.ts';
import {combine,verifyBlob,type BlobEntry,type ClipEntry,type Manifest} from '../../../tools/photo-mode/split-loader.ts';
import type {PoseScene} from './scene-session.ts';
export const bodyTypes=['male','female'] as const;
export type BodyType=typeof bodyTypes[number];
export type PairOption={kind:'pair';sourceSha256:string;asset:BlobEntry};
export type PlayerOption={kind:'player';sourceSha256:string;clip:ClipEntry;accessoryIncluded:false};
export type PreviewOption=PairOption|PlayerOption;
type PreviewIndex={schema:string;publicationAuthorized:boolean;testOnly:boolean;fullPoseVerified:boolean;bodyIcons:Record<BodyType,BlobEntry>;models?:Record<BodyType,BlobEntry>;items:Record<string,Partial<Record<BodyType,PreviewOption>>>};
function check(v:unknown,message:string):asserts v{if(!v)throw new Error(message)}
function validEntry(e:BlobEntry){return e&&/^[a-f0-9]{64}$/.test(e.sha256)&&Number.isSafeInteger(e.bytes)&&e.bytes>0&&e.bytes<=64*1024*1024}
let request:Promise<PreviewIndex|null>|undefined;
export function loadPagesPoseIndex(base:string){
  if(!request){request=(async()=>{
    const r=await fetch(base+'/photo-mode-preview/index.json');
    if(r.status===404)return null;
    check(r.ok,'Preview index unavailable');const m:PreviewIndex=await r.json();
    check((m.schema==='wand.photo-mode.pages-test@1'||m.schema==='wand.photo-mode.pages-test@2')&&m.publicationAuthorized===true&&m.testOnly===true&&m.fullPoseVerified===false,'Invalid approved test manifest');
    check(bodyTypes.every(b=>validEntry(m.bodyIcons[b])),'Invalid body icons');
    if(m.schema==='wand.photo-mode.pages-test@2')check(m.models&&bodyTypes.every(b=>validEntry(m.models![b])),'Invalid models');
    for(const [id,options] of Object.entries(m.items)){check(/^[1-9][0-9]{0,14}$/.test(id)&&Number.isSafeInteger(Number(id)),'Invalid item');for(const b of bodyTypes){const o=options[b];if(o){check(/^[a-f0-9]{64}$/.test(o.sourceSha256),'Invalid source');if(o.kind==='pair')check(validEntry(o.asset),'Invalid pair');else check(o.kind==='player'&&m.models&&validEntry(o.clip)&&o.clip.sourceSha256===o.sourceSha256&&typeof o.clip.name==='string'&&o.accessoryIncluded===false,'Invalid player scene')}}}
    return m;
  })();void request.catch(()=>{request=undefined})}
  return request;
}
export function assetUrl(base:string,e:BlobEntry,ext:'.glb'|'.png'|'.wpa'){check(validEntry(e),'Invalid asset');return base+'/photo-mode-preview/'+e.sha256+ext}
async function fetchAsset(base:string,entry:BlobEntry,ext:'.glb'|'.wpa',signal:AbortSignal){
  const response=await fetch(assetUrl(base,entry,ext),{signal});check(response.ok,'Scene unavailable');
  return verifyBlob(await response.arrayBuffer(),entry);
}
const modelCache=new Map<string,ArrayBuffer>();
export async function loadPreviewScene(base:string,itemId:number,body:BodyType,index:PreviewIndex,entry:PreviewOption,companionLabel:string,signal:AbortSignal):Promise<PoseScene>{
  signal.throwIfAborted();
  let raw:ArrayBuffer;
  if(entry.kind==='pair')raw=await fetchAsset(base,entry.asset,'.glb',signal);
  else {
    const model=index.models?.[body];check(model,'Model unavailable');
    const key=base+'/'+model.sha256;
    const [modelBytes,clipBytes]=await Promise.all([modelCache.get(key)??fetchAsset(base,model,'.glb',signal),fetchAsset(base,entry.clip,'.wpa',signal)]);
    signal.throwIfAborted();modelCache.set(key,modelBytes);
    const manifest:Manifest={schema:'wand.private-pose-package@1',privateOnly:true,publicationAuthorized:false,fullPoseVerified:false,model,clips:[entry.clip]};
    raw=await combine(modelBytes,clipBytes,manifest,entry.clip);
  }
  signal.throwIfAborted();
  const g=openPrivateDiagnostic(raw,0);
  const paired=g.primitives.some(p=>p.actorId==='companion');
  check(g.sourceSha256===entry.sourceSha256&&(entry.kind==='pair'?paired&&g.companionItemId===itemId:!paired&&g.companionItemId===undefined),'Scene identity mismatch');
  const images=new Map<string,ImageBitmap>();
  try{
    const primitives=[];
    for(const p of g.primitives){signal.throwIfAborted();const {image,...primitive}=p;let texture:ImageBitmap|undefined;
      if(image){check(image.mime==='image/png','Unsupported image');const key=image.bytes.byteOffset+':'+image.bytes.byteLength;texture=images.get(key);if(!texture){texture=await createImageBitmap(new Blob([new Uint8Array(image.bytes)],{type:image.mime}));images.set(key,texture)}}
      primitives.push({...primitive,texture});
    }
    signal.throwIfAborted();
    return {duration:g.sampler.duration,jointCounts:g.sampler.jointCounts,primitives,actors:[{id:'player',label:'',canHide:false},...(paired?[{id:'companion',label:companionLabel,canHide:true}]:[])],center:[0,1.05,0],radius:1.25,sample:t=>g.sampler.sample(t),dispose(){for(const im of images.values())im.close();images.clear()}};
  }catch(e){for(const im of images.values())im.close();throw e}
}
