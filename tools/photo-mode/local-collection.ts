import {combine,verifyBlob,type BlobEntry,type ClipEntry,type Manifest} from './split-loader.ts';
import {openPrivateDiagnostic} from './gpu-scene-loader.ts';
import type {PoseScene} from '../../src/lib/photo-mode/scene-session.ts';

export const bodyTypes=['male','female'] as const;
export type BodyType=typeof bodyTypes[number];
type LocalOption={kind:'player';sourceSha256:string;clip:ClipEntry;accessoryIncluded:false}|{kind:'pair';sourceSha256:string;asset:BlobEntry};
type LocalManifest={schema:string;privateOnly:boolean;publicationAuthorized:boolean;fullPoseVerified:boolean;gameVersion:string;models:Record<BodyType,BlobEntry>;bodyIcons:Record<BodyType,BlobEntry>;items:Record<string,Record<BodyType,LocalOption>>};
function check(x:unknown,m:string):asserts x{if(!x)throw Error(m)}
const hash=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
function validateEntry(e:BlobEntry){check(e&&hash(e.sha256)&&Number.isSafeInteger(e.bytes)&&e.bytes>0&&e.bytes<=64*1024*1024,'invalid asset entry')}
export class LocalCollectionPackage {
  private files:Map<string,File>;
  private manifest:LocalManifest;
  private cache=new Map<string,Promise<ArrayBuffer>>();
  private constructor(files:Map<string,File>,manifest:LocalManifest){this.files=files;this.manifest=manifest}
  static async open(files:Iterable<File>){
    const map=new Map<string,File>();
    for(const file of files){check(!map.has(file.name),'duplicate file name');map.set(file.name,file)}
    const f=map.get('local-preview.json');check(f&&f.size<=2*1024*1024,'missing local manifest');
    const m:LocalManifest=JSON.parse(await f.text());
    check(m.schema==='wand.photo-mode.private-local-collection@1'&&m.privateOnly===true&&m.publicationAuthorized===false&&m.fullPoseVerified===false,'private diagnostic only');
    check(Object.keys(m.items).length<=10000,'too many items');
    for(const b of bodyTypes){validateEntry(m.models[b]);validateEntry(m.bodyIcons[b])}
    for(const [id,row] of Object.entries(m.items)){check(/^[1-9][0-9]{0,14}$/.test(id)&&Number.isSafeInteger(Number(id)),'invalid item');for(const b of bodyTypes){const o=row[b];check(o&&hash(o.sourceSha256),'invalid source clip');if(o.kind==='player'){validateEntry(o.clip);check(o.clip.sourceSha256===o.sourceSha256&&typeof o.clip.name==='string'&&o.accessoryIncluded===false,'invalid player clip')}else{check(o.kind==='pair','invalid scene');validateEntry(o.asset)}}}
    return new LocalCollectionPackage(map,m);
  }
  has(itemId:number){return Object.hasOwn(this.manifest.items,String(itemId))}
  async asset(entry:BlobEntry,ext:'.glb'|'.wpa'|'.png'){
    validateEntry(entry);const name=entry.sha256+ext,f=this.files.get(name);check(f&&f.size===entry.bytes,'missing asset');return verifyBlob(await f.arrayBuffer(),entry)
  }
  icon(body:BodyType){return this.asset(this.manifest.bodyIcons[body],'.png')}
  private model(body:BodyType){let cached=this.cache.get(body);if(!cached){cached=this.asset(this.manifest.models[body],'.glb');this.cache.set(body,cached);void cached.catch(()=>this.cache.delete(body))}return cached}
  async geometry(itemId:number,body:BodyType){
    const entry=this.manifest.items[String(itemId)]?.[body];check(entry,'item scene not included');
    let raw:ArrayBuffer;
    if(entry.kind==='pair')raw=await this.asset(entry.asset,'.glb');
    else {const m:Manifest={schema:'wand.private-pose-package@1',privateOnly:true,publicationAuthorized:false,fullPoseVerified:false,model:this.manifest.models[body],clips:[entry.clip]};raw=await combine(await this.model(body),await this.asset(entry.clip,'.wpa'),m,entry.clip)}
    const g=openPrivateDiagnostic(raw,0);check(g.sourceSha256===entry.sourceSha256,'source animation mismatch');
    const paired=g.primitives.some(p=>p.actorId==='companion');
    check(entry.kind==='pair'?paired&&g.companionItemId===itemId:!paired&&g.companionItemId===undefined,'actor identity mismatch');
    return g;
  }
  async scene(itemId:number,body:BodyType,companionLabel:string,signal:AbortSignal):Promise<PoseScene>{
    signal.throwIfAborted();const g=await this.geometry(itemId,body);signal.throwIfAborted();const images=new Map<string,ImageBitmap>();
    try{
      const primitives=[];
      for(const p of g.primitives){signal.throwIfAborted();const {image,...primitive}=p;let texture:ImageBitmap|undefined;
        if(image){check(image.mime==='image/png','unsupported image');const key=image.bytes.byteOffset+':'+image.bytes.byteLength;texture=images.get(key);if(!texture){texture=await createImageBitmap(new Blob([new Uint8Array(image.bytes)],{type:image.mime}));images.set(key,texture)}}
        primitives.push({...primitive,texture});
      }
      signal.throwIfAborted();
      const actors=[{id:'player',label:'',canHide:false}];if(primitives.some(p=>p.actorId==='companion'))actors.push({id:'companion',label:companionLabel,canHide:true});
      return {duration:g.sampler.duration,jointCounts:g.sampler.jointCounts,primitives,actors,center:[0,1.05,0],radius:1.25,sample:t=>g.sampler.sample(t),dispose(){for(const im of images.values())im.close();images.clear()}};
    }catch(e){for(const im of images.values())im.close();throw e}
  }
}
