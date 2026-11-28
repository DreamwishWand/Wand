import {openPrivateDiagnostic} from '../../../tools/photo-mode/gpu-scene-loader.ts';
import {combine,attachCompanion,attachProp,verifyBlob,type BlobEntry,type ClipEntry,type Manifest,type ActorEntry,type ActorAnchor,type ActorRoot,validActorRoot} from '../../../tools/photo-mode/split-loader.ts';
import type {NativeLoopPeriods} from './rig-sampler.ts';
import {validLimboMaterial,type LimboMaterial} from './limbo-material.ts';
import {validSkinPalette,skinTextureFor,type SkinPalette} from './skin-palette.ts';
import {validEyePalette,projectEyeMask,type EyePalette,type EyeSelection} from './eye-palette.ts';
import {validFaceMorphs,hasFaceMorph,applyFaceMorphs,type FaceChoices,type FaceMorphs} from './face-morph.ts';
import {validHeadGeometry,selectHead,headRoles,decodeHeadPart,type HeadGeometry} from './head-geometry.ts';
import {validBodyMorphs,applyBodyMorph,type BodyMorphs} from './body-morph.ts';
import type {PoseScene} from './scene-session.ts';
import {collectionItemHref,collectionItemIdFromSearch} from '../collection/item-permalink.ts';
export const bodyTypes=['male','female'] as const;
export type BodyType=typeof bodyTypes[number];
export type PairOption={kind:'pair';sourceSha256:string;asset:BlobEntry};
export type PlayerOption={kind:'player';sourceSha256:string;clip:ClipEntry}&(({accessoryIncluded:false;prop?:never}&({companionIncluded?:false;actor?:never;anchor?:never}|{companionIncluded:true;actor:ActorEntry;anchor:ActorAnchor;secondaryPassOmitted?:true;limboGeometryDiagnostic?:true;nativeLoops?:NativeLoopPeriods;actorRoot?:ActorRoot;limboMaterial?:LimboMaterial}))|{accessoryIncluded:true;prop:ActorEntry;anchor:ActorAnchor;companionIncluded?:never;actor?:never});
type AvatarBaseMaterial={mesh:number;primitive:number;role:'body'|'mermaidBody'|'face'|'eyes';vertices:number;texture:BlobEntry;uv:BlobEntry};
function validAvatarMaterials(rows:AvatarBaseMaterial[]){return Array.isArray(rows)&&rows.length>=3&&rows.length<=64&&rows.every(s=>s&&Number.isSafeInteger(s.mesh)&&s.mesh>=0&&Number.isSafeInteger(s.primitive)&&s.primitive>=0&&['body','mermaidBody','face','eyes'].includes(s.role)&&Number.isSafeInteger(s.vertices)&&s.vertices>0&&s.vertices<=100000&&validEntry(s.texture)&&validEntry(s.uv)&&s.uv.bytes===s.vertices*8)&&new Set(rows.map(s=>s.mesh+':'+s.primitive)).size===rows.length}
type MermaidBaseMaterial={mesh:number;primitive:number;flipV:boolean;texture:BlobEntry};
function validMermaidBaseMaterials(slots:MermaidBaseMaterial[]|undefined){return slots===undefined||Array.isArray(slots)&&slots.length===4&&slots.every(s=>s&&Number.isSafeInteger(s.mesh)&&s.mesh>=0&&Number.isSafeInteger(s.primitive)&&s.primitive>=0&&typeof s.flipV==='boolean'&&validEntry(s.texture))&&new Set(slots.map(s=>s.mesh+':'+s.primitive)).size===4}
export type MermaidOption={kind:'mermaid';sourceSha256:string;clip:ClipEntry;model:BlobEntry;camera:{center:[number,number,number];radius:number};neutralMaterialProjection:true;unresolvedTransform:number;nonTransform:number;baseMaterials?:MermaidBaseMaterial[]}&({accessoryIncluded?:false;prop?:never;anchor?:never}|{accessoryIncluded:true;prop:ActorEntry;anchor:ActorAnchor});
export type PreviewOption=PairOption|PlayerOption|MermaidOption;
export type PoseRow=Partial<Record<BodyType,PreviewOption>>;
export type PreviewIndex={schema:string;publicationAuthorized:boolean;testOnly:boolean;fullPoseVerified:boolean;bodyIcons:Record<BodyType,BlobEntry>;models?:Record<BodyType,BlobEntry>;items:Record<string,PoseRow>;variants?:Record<string,PoseRow[]>;avatarMaterials?:Record<string,AvatarBaseMaterial[]>;skinPalette?:SkinPalette;eyePalette?:EyePalette;faceMorphs?:FaceMorphs;headGeometry?:HeadGeometry;bodyMorphs?:BodyMorphs};
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
    function validateRow(options:PoseRow){for(const b of bodyTypes){const o=options[b];if(o){check(/^[a-f0-9]{64}$/.test(o.sourceSha256),'Invalid source');if(o.kind==='pair')check(validEntry(o.asset),'Invalid pair');else if(o.kind==='mermaid')check(validEntry(o.model)&&validEntry(o.clip)&&o.clip.sourceSha256===o.sourceSha256&&typeof o.clip.name==='string'&&o.neutralMaterialProjection===true&&Number.isSafeInteger(o.unresolvedTransform)&&o.unresolvedTransform>=0&&Number.isSafeInteger(o.nonTransform)&&o.nonTransform>=0&&Array.isArray(o.camera?.center)&&o.camera.center.length===3&&o.camera.center.every(v=>Number.isFinite(v)&&Math.abs(v)<10)&&Number.isFinite(o.camera.radius)&&o.camera.radius>0&&o.camera.radius<=10&&validMermaidBaseMaterials(o.baseMaterials)&&(o.accessoryIncluded===undefined||o.accessoryIncluded===false||o.accessoryIncluded===true&&validEntry(o.prop)&&o.prop.sourceSha256===o.sourceSha256&&Number.isSafeInteger(o.anchor.node)&&o.anchor.node>=0&&o.anchor.path==='root'),'Invalid mermaid scene');else check(o.kind==='player'&&m.models&&validEntry(o.clip)&&o.clip.sourceSha256===o.sourceSha256&&typeof o.clip.name==='string'&&((o.accessoryIncluded===false&&(o.companionIncluded===undefined||o.companionIncluded===false||o.companionIncluded===true&&validEntry(o.actor)&&/^[a-f0-9]{64}$/.test(o.actor.sourceSha256)&&Number.isSafeInteger(o.anchor.node)&&o.anchor.node>=0&&typeof o.anchor.path==='string'&&(o.secondaryPassOmitted===undefined||o.secondaryPassOmitted===true)&&(o.limboGeometryDiagnostic===undefined||o.limboGeometryDiagnostic===true)&&validNativeLoops(o.nativeLoops)&&validActorRoot(o.actorRoot)&&(o.limboMaterial===undefined||o.limboGeometryDiagnostic===true&&validLimboMaterial(o.limboMaterial))))||(o.accessoryIncluded===true&&o.companionIncluded===undefined&&validEntry(o.prop)&&o.prop.sourceSha256===o.sourceSha256&&Number.isSafeInteger(o.anchor.node)&&o.anchor.node>=0&&o.anchor.path==='root')),'Invalid player scene')}}}
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
    if(m.avatarMaterials){const expected=new Set(bodyTypes.flatMap(b=>m.models?.[b]?[m.models[b].sha256]:[]));for(const row of [...Object.values(m.items),...Object.values(m.variants??{}).flat()])for(const b of bodyTypes){const o=row[b];if(o?.kind==='pair')expected.add(o.asset.sha256);else if(o?.kind==='mermaid')expected.add(o.model.sha256)}check(Object.keys(m.avatarMaterials).length===expected.size&&[...expected].every(k=>validAvatarMaterials(m.avatarMaterials![k])),'Invalid avatar material coverage')}
    if(m.skinPalette!==undefined)check(m.avatarMaterials&&validSkinPalette(m.skinPalette),'Invalid skin palette');
    if(m.eyePalette!==undefined)check(m.avatarMaterials&&validEyePalette(m.eyePalette),'Invalid eye palette');
    if(m.faceMorphs!==undefined)check(m.avatarMaterials&&validFaceMorphs(m.faceMorphs),'Invalid face morphs');
    if(m.headGeometry!==undefined)check(m.avatarMaterials&&m.faceMorphs&&validHeadGeometry(m.headGeometry,Object.keys(m.avatarMaterials)),'Invalid head geometry');
    if(m.bodyMorphs!==undefined)check(m.avatarMaterials&&validBodyMorphs(m.bodyMorphs),'Invalid body morphs');
    return m;
  })();void request.catch(()=>{request=undefined})}
  return request;
}
export function assetUrl(base:string,e:BlobEntry,ext:'.glb'|'.png'|'.wpa'|'.uv'|'.webp'|'.wfm'|'.whg'|'.wbm'){check(validEntry(e),'Invalid asset');return base+'/photo-mode-preview/'+e.sha256+ext}
async function fetchAsset(base:string,entry:BlobEntry,ext:'.glb'|'.wpa'|'.png'|'.uv'|'.webp'|'.wfm'|'.whg'|'.wbm',signal:AbortSignal){
  const response=await fetch(assetUrl(base,entry,ext),{signal});check(response.ok,'Scene unavailable');
  return verifyBlob(await response.arrayBuffer(),entry);
}
const modelCache=new Map<string,ArrayBuffer>();
export async function loadPreviewScene(base:string,itemId:number,body:BodyType,index:PreviewIndex,entry:PreviewOption,companionLabel:string,signal:AbortSignal,propLabel='Prop',skinIndex?:number,eye?:EyeSelection,face?:FaceChoices,headIndex?:number,bodyTypeIndex?:number):Promise<PoseScene>{
  signal.throwIfAborted();
  let raw:ArrayBuffer;const modelKey=entry.kind==='pair'?entry.asset.sha256:entry.kind==='mermaid'?entry.model.sha256:index.models?.[body].sha256;
  const avatarSlots=modelKey?index.avatarMaterials?.[modelKey]??[]:[];
  if(entry.kind==='pair')raw=await fetchAsset(base,entry.asset,'.glb',signal);
  else {
    const model=entry.kind==='mermaid'?entry.model:index.models?.[body];check(model,'Model unavailable');
    const key=base+'/'+model.sha256;
    const [modelBytes,clipBytes]=await Promise.all([modelCache.get(key)??fetchAsset(base,model,'.glb',signal),fetchAsset(base,entry.clip,'.wpa',signal)]);
    signal.throwIfAborted();modelCache.set(key,modelBytes);
    const manifest:Manifest={schema:'wand.private-pose-package@1',privateOnly:true,publicationAuthorized:false,fullPoseVerified:false,model,clips:[entry.clip]};
    raw=await combine(modelBytes,clipBytes,manifest,entry.clip);
    if((entry.kind==='player'||entry.kind==='mermaid')&&entry.accessoryIncluded===true){const prop=await fetchAsset(base,entry.prop,'.glb',signal);signal.throwIfAborted();raw=await attachProp(raw,prop,entry.prop,entry.anchor,itemId,entry.sourceSha256)}
    else if(entry.kind==='player'&&entry.companionIncluded===true){const actor=await fetchAsset(base,entry.actor,'.glb',signal);signal.throwIfAborted();raw=await attachCompanion(raw,actor,entry.actor,entry.anchor,itemId,entry.sourceSha256,entry.actorRoot,entry.limboMaterial?.primitiveSlots)}
  }
  signal.throwIfAborted();
  const head=selectHead(index.headGeometry,modelKey,body,headIndex);
  const replacements=head?await Promise.all(headRoles.map(async role=>{const p=head.row.parts[role];return decodeHeadPart(await fetchAsset(base,p.asset,'.whg',signal),p,head.target.slots[role])})):[];
  signal.throwIfAborted();
  const g=openPrivateDiagnostic(raw,0,entry.kind==='player'&&entry.companionIncluded===true?entry.nativeLoops:undefined,entry.kind==='player'&&entry.companionIncluded===true?entry.limboMaterial:undefined,replacements);
  const paired=g.primitives.some(p=>p.actorId==='companion'),hasProp=g.primitives.some(p=>p.actorId==='prop');
  check((entry.kind==='player'||entry.kind==='mermaid')&&entry.accessoryIncluded===true?hasProp&&g.propItemId===itemId:!hasProp&&g.propItemId===undefined,'Prop identity mismatch');
  check(g.sourceSha256===entry.sourceSha256&&(entry.kind==='pair'||entry.kind==='player'&&entry.companionIncluded===true?paired&&g.companionItemId===itemId:!paired&&g.companionItemId===undefined),'Scene identity mismatch');
  const images=new Map<string,ImageBitmap>();
  try{
    const faceEntry=face&&hasFaceMorph(face)?(head?.row.morph??index.faceMorphs?.[body]):undefined;
    const faceBytes=faceEntry?await fetchAsset(base,faceEntry.asset,'.wfm',signal):undefined;
    const bodyEntry=entry.kind!=='mermaid'&&bodyTypeIndex!==undefined&&bodyTypeIndex>0?index.bodyMorphs?.[body]:undefined;
    const bodyBytes=bodyEntry?await fetchAsset(base,bodyEntry.asset,'.wbm',signal):undefined;
    const primitives=[];const used=new Set<MermaidBaseMaterial>();const usedAvatar=new Set<AvatarBaseMaterial>();const uvCache=new Map<string,Float32Array>();
    async function getTexture(e:BlobEntry,format:'png'|'webp'='png'){const key='material:'+e.sha256;let texture=images.get(key);if(!texture){const bytes=await fetchAsset(base,e,format==='png'?'.png':'.webp',signal);signal.throwIfAborted();texture=await createImageBitmap(new Blob([bytes],{type:'image/'+format}));images.set(key,texture)}return texture}
    async function getEyeTexture(selection:EyeSelection){
      const key='eye:'+selection.texture.sha256+':'+selection.indices.join(':');const cached=images.get(key);if(cached)return cached;
      const mask=await getTexture(selection.texture);signal.throwIfAborted();check(mask.width===512&&mask.height===512,'Invalid eye mask dimensions');
      const canvas=document.createElement('canvas');canvas.width=mask.width;canvas.height=mask.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});check(ctx,'Eye mask projection unavailable');ctx.drawImage(mask,0,0);
      const data=ctx.getImageData(0,0,canvas.width,canvas.height);projectEyeMask(data.data,selection.colors);ctx.putImageData(data,0,0);
      const texture=await createImageBitmap(canvas);images.set(key,texture);signal.throwIfAborted();return texture;
    }
    for(const p of g.primitives){signal.throwIfAborted();const {image,meshIndex,primitiveIndex,headReplaced,...primitive}=p;let texture:ImageBitmap|undefined;
      const slot=entry.kind==='mermaid'&&primitive.actorId==='player'?entry.baseMaterials?.find(s=>s.mesh===meshIndex&&s.primitive===primitiveIndex):undefined;
      const avatarSlot=primitive.actorId==='player'?avatarSlots.find(s=>s.mesh===meshIndex&&s.primitive===primitiveIndex):undefined;
      if(avatarSlot){check(!slot&&!usedAvatar.has(avatarSlot)&&avatarSlot.vertices*3===primitive.positions.length,'Invalid avatar material slot');usedAvatar.add(avatarSlot);let uv=headReplaced?primitive.uv:uvCache.get(avatarSlot.uv.sha256);if(!uv){const data=await fetchAsset(base,avatarSlot.uv,'.uv',signal);signal.throwIfAborted();uv=new Float32Array(data);check(uv.length===avatarSlot.vertices*2&&uv.every(Number.isFinite),'Invalid source UV');uvCache.set(avatarSlot.uv.sha256,uv)}const skin=skinTextureFor(index.skinPalette,skinIndex,body,avatarSlot.role);texture=avatarSlot.role==='eyes'&&eye?await getEyeTexture(eye):await getTexture(skin?.texture??avatarSlot.texture,skin?.format??'png');const positions=avatarSlot.role==='face'&&faceBytes&&face&&faceEntry?(check(faceEntry.vertices===primitive.positions.length/3,'Face mesh identity'),applyFaceMorphs(faceBytes,primitive.positions,face)):avatarSlot.role==='body'&&bodyBytes&&bodyEntry&&bodyTypeIndex!==undefined?(check(bodyEntry.vertices===primitive.positions.length/3,'Body mesh identity'),applyBodyMorph(bodyBytes,primitive.positions,bodyTypeIndex)):primitive.positions;primitives.push({...primitive,positions,uv,color:[1,1,1,1] as [number,number,number,number],texture});continue}
      if(slot){check(!used.has(slot),'Duplicate garment slot');used.add(slot);texture=await getTexture(slot.texture);const uv=slot.flipV?primitive.uv.slice():primitive.uv;if(slot.flipV)for(let i=1;i<uv.length;i+=2)uv[i]=1-uv[i];primitives.push({...primitive,uv,color:[1,1,1,1] as [number,number,number,number],texture});continue}
      if(image){check(image.mime==='image/png','Unsupported image');const key=image.bytes.byteOffset+':'+image.bytes.byteLength;texture=images.get(key);if(!texture){texture=await createImageBitmap(new Blob([new Uint8Array(image.bytes)],{type:image.mime}));images.set(key,texture)}}
      primitives.push({...primitive,texture});
    }
    check(entry.kind!=='mermaid'||used.size===(entry.baseMaterials?.length??0),'Missing garment material slot');
    check(usedAvatar.size===avatarSlots.length,'Missing avatar material slot');
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
