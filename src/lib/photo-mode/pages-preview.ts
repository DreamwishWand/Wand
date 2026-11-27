import {openPrivateDiagnostic} from '../../../tools/photo-mode/gpu-scene-loader.ts';
import {combine,attachCompanion,attachProp,verifyBlob,type BlobEntry,type ClipEntry,type Manifest,type ActorEntry,type ActorAnchor,type ActorRoot,validActorRoot} from '../../../tools/photo-mode/split-loader.ts';
import type {NativeLoopPeriods} from './rig-sampler.ts';
import type {PoseScene} from './scene-session.ts';
import {collectionItemHref,collectionItemIdFromSearch} from '../collection/item-permalink.ts';
export const bodyTypes=['male','female'] as const;
export type BodyType=typeof bodyTypes[number];
export type PairOption={kind:'pair';sourceSha256:string;asset:BlobEntry};
export type PlayerOption={kind:'player';sourceSha256:string;clip:ClipEntry}&(({accessoryIncluded:false;prop?:never}&({companionIncluded?:false;actor?:never;anchor?:never}|{companionIncluded:true;actor:ActorEntry;anchor:ActorAnchor;secondaryPassOmitted?:true;limboGeometryDiagnostic?:true;nativeLoops?:NativeLoopPeriods;actorRoot?:ActorRoot}))|{accessoryIncluded:true;prop:ActorEntry;anchor:ActorAnchor;companionIncluded?:never;actor?:never});
export type MermaidOption={kind:'mermaid';sourceSha256:string;clip:ClipEntry;model:BlobEntry;camera:{center:[number,number,number];radius:number};neutralMaterialProjection:true;unresolvedTransform:number;nonTransform:number};
export type PreviewOption=PairOption|PlayerOption|MermaidOption;
export type PoseRow=Partial<Record<BodyType,PreviewOption>>;
export type PreviewIndex={schema:string;publicationAuthorized:boolean;testOnly:boolean;fullPoseVerified:boolean;bodyIcons:Record<BodyType,BlobEntry>;models?:Record<BodyType,BlobEntry>;items:Record<string,PoseRow>;variants?:Record<string,PoseRow[]>};
function check(v:unknown,message:string):asserts v{if(!v)throw new Error(message)}
function validNativeLoops(x:NativeLoopPeriods|undefined){return x===undefined||!!x&&Object.keys(x).length===2&&[x.player,x.companion].every(v=>Number.isFinite(v)&&v>0&&v<=600)&&Math.abs(x.player-x.companion)>1e-5}
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
    function validateRow(options:PoseRow){for(const b of bodyTypes){const o=options[b];if(o){check(/^[a-f0-9]{64}$/.test(o.sourceSha256),'Invalid source');if(o.kind==='pair')check(validEntry(o.asset),'Invalid pair');else if(o.kind==='mermaid')check(validEntry(o.model)&&validEntry(o.clip)&&o.clip.sourceSha256===o.sourceSha256&&typeof o.clip.name==='string'&&o.neutralMaterialProjection===true&&Number.isSafeInteger(o.unresolvedTransform)&&o.unresolvedTransform>=0&&Number.isSafeInteger(o.nonTransform)&&o.nonTransform>=0&&Array.isArray(o.camera?.center)&&o.camera.center.length===3&&o.camera.center.every(v=>Number.isFinite(v)&&Math.abs(v)<10)&&Number.isFinite(o.camera.radius)&&o.camera.radius>0&&o.camera.radius<=10,'Invalid mermaid scene');else check(o.kind==='player'&&m.models&&validEntry(o.clip)&&o.clip.sourceSha256===o.sourceSha256&&typeof o.clip.name==='string'&&((o.accessoryIncluded===false&&(o.companionIncluded===undefined||o.companionIncluded===false||o.companionIncluded===true&&validEntry(o.actor)&&/^[a-f0-9]{64}$/.test(o.actor.sourceSha256)&&Number.isSafeInteger(o.anchor.node)&&o.anchor.node>=0&&typeof o.anchor.path==='string'&&(o.secondaryPassOmitted===undefined||o.secondaryPassOmitted===true)&&(o.limboGeometryDiagnostic===undefined||o.limboGeometryDiagnostic===true)&&validNativeLoops(o.nativeLoops)&&validActorRoot(o.actorRoot)))||(o.accessoryIncluded===true&&o.companionIncluded===undefined&&validEntry(o.prop)&&o.prop.sourceSha256===o.sourceSha256&&Number.isSafeInteger(o.anchor.node)&&o.anchor.node>=0&&o.anchor.path==='root')),'Invalid player scene')}}}
    for(const [id,options] of Object.entries(m.items)){
      check(/^[1-9][0-9]{0,14}$/.test(id)&&Number.isSafeInteger(Number(id)),'Invalid item');validateRow(options);
    }
    for(const [id,variants] of Object.entries(m.variants??{})){
      check(m.items[id]&&Array.isArray(variants)&&variants.length>0&&variants.length<=8,'Invalid pose variants');
      const seen=new Set([bodyTypes.map(b=>m.items[id][b]?.sourceSha256).join(':')]);
      for(const row of variants){
        validateRow(row);check(bodyTypes.every(b=>row[b]),'Incomplete alternate pose');
        const k=bodyTypes.map(b=>row[b]?.sourceSha256).join(':');check(!seen.has(k),'Duplicate alternate pose');seen.add(k);
      }
    }
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
export async function loadPreviewScene(base:string,itemId:number,body:BodyType,index:PreviewIndex,entry:PreviewOption,companionLabel:string,signal:AbortSignal,propLabel='Prop'):Promise<PoseScene>{
  signal.throwIfAborted();
  let raw:ArrayBuffer;
  if(entry.kind==='pair')raw=await fetchAsset(base,entry.asset,'.glb',signal);
  else {
    const model=entry.kind==='mermaid'?entry.model:index.models?.[body];check(model,'Model unavailable');
    const key=base+'/'+model.sha256;
    const [modelBytes,clipBytes]=await Promise.all([modelCache.get(key)??fetchAsset(base,model,'.glb',signal),fetchAsset(base,entry.clip,'.wpa',signal)]);
    signal.throwIfAborted();modelCache.set(key,modelBytes);
    const manifest:Manifest={schema:'wand.private-pose-package@1',privateOnly:true,publicationAuthorized:false,fullPoseVerified:false,model,clips:[entry.clip]};
    raw=await combine(modelBytes,clipBytes,manifest,entry.clip);
    if(entry.kind==='player'&&entry.accessoryIncluded===true){const prop=await fetchAsset(base,entry.prop,'.glb',signal);signal.throwIfAborted();raw=await attachProp(raw,prop,entry.prop,entry.anchor,itemId,entry.sourceSha256)}
    else if(entry.kind==='player'&&entry.companionIncluded===true){const actor=await fetchAsset(base,entry.actor,'.glb',signal);signal.throwIfAborted();raw=await attachCompanion(raw,actor,entry.actor,entry.anchor,itemId,entry.sourceSha256,entry.actorRoot)}
  }
  signal.throwIfAborted();
  const g=openPrivateDiagnostic(raw,0,entry.kind==='player'&&entry.companionIncluded===true?entry.nativeLoops:undefined);
  const paired=g.primitives.some(p=>p.actorId==='companion'),hasProp=g.primitives.some(p=>p.actorId==='prop');
  check(entry.kind==='player'&&entry.accessoryIncluded===true?hasProp&&g.propItemId===itemId:!hasProp&&g.propItemId===undefined,'Prop identity mismatch');
  check(g.sourceSha256===entry.sourceSha256&&(entry.kind==='pair'||entry.kind==='player'&&entry.companionIncluded===true?paired&&g.companionItemId===itemId:!paired&&g.companionItemId===undefined),'Scene identity mismatch');
  const images=new Map<string,ImageBitmap>();
  try{
    const primitives=[];
    for(const p of g.primitives){signal.throwIfAborted();const {image,...primitive}=p;let texture:ImageBitmap|undefined;
      if(image){check(image.mime==='image/png','Unsupported image');const key=image.bytes.byteOffset+':'+image.bytes.byteLength;texture=images.get(key);if(!texture){texture=await createImageBitmap(new Blob([new Uint8Array(image.bytes)],{type:image.mime}));images.set(key,texture)}}
      primitives.push({...primitive,texture});
    }
    signal.throwIfAborted();
    return {duration:g.sampler.duration,jointCounts:g.sampler.jointCounts,primitives,actors:[{id:'player',label:'',canHide:false},...(paired?[{id:'companion',label:companionLabel,canHide:true}]:[]),...(hasProp?[{id:'prop',label:propLabel,canHide:true}]:[])],center:entry.kind==='mermaid'?entry.camera.center:[0,1.05,0],radius:entry.kind==='mermaid'?entry.camera.radius:1.25,sample:t=>g.sampler.sample(t),dispose(){for(const im of images.values())im.close();images.clear()}};
  }catch(e){for(const im of images.values())im.close();throw e}
}

export function poseRows(index:Pick<PreviewIndex,'items'|'variants'>,itemId:number):PoseRow[]{
  const id=String(itemId),first=index.items[id];
  return first?[first,...(index.variants?.[id]??[])]:[];
}
/** Exact original player-clip hashes for both body types establish a shared pose. */
export function poseSourceIdentity(row:PoseRow|undefined):string|null{
  if(!row?.male||!row.female)return null;
  return row.male.sourceSha256+'.'+row.female.sourceSha256;
}
export function relatedPoseMatches(index:Pick<PreviewIndex,'items'|'variants'>,itemId:number,poseIndex=0):{itemId:number;poseIndex:number;identity:string}[]{
  const identity=poseSourceIdentity(poseRows(index,itemId)[poseIndex]);
  if(!identity)return [];
  return Object.keys(index.items).map(Number).sort((a,b)=>a-b).flatMap(id=>{
    if(id===itemId)return [];
    const match=poseRows(index,id).findIndex(row=>poseSourceIdentity(row)===identity);
    return match>=0?[{itemId:id,poseIndex:match,identity}]:[];
  });
}
export function relatedPoseItems(index:Pick<PreviewIndex,'items'|'variants'>,itemId:number,poseIndex=0):number[]{
  return relatedPoseMatches(index,itemId,poseIndex).map(x=>x.itemId);
}
const poseIdentityPattern=/^[a-f0-9]{64}\.[a-f0-9]{64}$/;
export function collectionPoseHref(base:string,itemId:number,identity:string):string{
  check(poseIdentityPattern.test(identity),'Invalid pose identity');
  return collectionItemHref(base,itemId)+'&pose='+identity;
}
export function collectionPoseFromSearch(index:Pick<PreviewIndex,'items'|'variants'>,itemId:number,search:string):number|null{
  if(collectionItemIdFromSearch(search)!==itemId)return null;
  const keys=new URLSearchParams(search).getAll('pose');
  if(keys.length!==1||!poseIdentityPattern.test(keys[0]))return null;
  const match=poseRows(index,itemId).findIndex(row=>poseSourceIdentity(row)===keys[0]);
  return match>=0?match:null;
}
