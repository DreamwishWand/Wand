/** Shared original-size lossless WebP delivery for all Wand services.
 * Private extraction metadata and candidates are never accepted as releases.
 * A publisher must pin the verified, publicly readable group indexes.
 */
import uiRelease from '../../../data/ddv/media/shared-ui-steam-1.26.2.json' with {type:'json'};
import {publicImageUrl,publicMediaOrigin} from './public-image-key.ts';
export type SharedMediaGroup = 'ui' | 'maps' | 'memories';
export type SharedMediaKind = 'Sprite' | 'Texture2D';
export interface SharedMediaImage {
  readonly kind: SharedMediaKind;
  readonly sha256: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
}
export interface SharedMediaPin {
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly nameCount: number;
}
export interface SharedMediaPublication {
  readonly state: 'published';
  readonly publicationAuthorized: true;
  readonly publicReadbackVerified: true;
  readonly gameVersion: string;
  readonly origin: string;
  readonly groups: Readonly<Partial<Record<SharedMediaGroup, SharedMediaPin>>>;
}
export type SharedMediaActivation = SharedMediaPublication | {readonly state:'unpublished'};
// The R2 staging bucket is not a public image source.
export const SHARED_MEDIA_ACTIVATION: SharedMediaActivation = {state:'unpublished'};
const SHA=/^[0-9a-f]{64}$/;
const VERSION=/^\d+\.\d+\.\d+$/;
const GROUPS=['ui','maps','memories'] as const;
const record=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const positive=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
function assert(x:unknown,message:string):asserts x { if(!x)throw new TypeError('Shared media: '+message); }

function validImage(value:unknown):value is SharedMediaImage {
  return record(value)&&Object.keys(value).sort().join(',')==='bytes,height,kind,sha256,width'&&
    (value.kind==='Sprite'||value.kind==='Texture2D')&&typeof value.sha256==='string'&&SHA.test(value.sha256)&&
    positive(value.bytes)&&positive(value.width)&&value.width<=16384&&positive(value.height)&&value.height<=16384;
}
export function sharedMediaUrl(origin:string,image:SharedMediaImage):string {
  assert(validImage(image),'invalid image');
  return publicImageUrl(origin,'original',image.sha256);
}
export function parseSharedMediaIndex(doc:unknown,group:SharedMediaGroup,version:string,count:number):ReadonlyMap<string,readonly SharedMediaImage[]> {
  assert(record(doc)&&Object.keys(doc).sort().join(',')==='entries,gameVersion,group,schema'&&
    doc.schema==='wand.shared-media-index@1'&&doc.gameVersion===version&&doc.group===group&&record(doc.entries),'index identity');
  const entries=Object.entries(doc.entries);
  assert(entries.length===count,'name count');
  const result=new Map<string,readonly SharedMediaImage[]>();
  for(const [name,rows] of entries){
    assert(name.length>0&&name.length<=256&&Array.isArray(rows)&&rows.length>0&&rows.every(validImage),'asset entry');
    const unique=new Set(rows.map(r=>r.kind+':'+r.sha256));
    assert(unique.size===rows.length,'duplicate asset');
    result.set(name,Object.freeze(rows.map(r=>Object.freeze({...r}))));
  }
  return result;
}
/** Static app-host UI index avoids one more R2 request and reuses the named-image reader. */
export function parseStaticUiRelease(doc:unknown):ReadonlyMap<string,readonly SharedMediaImage[]>|null{
  assert(record(doc),'static UI release');
  if(doc.state==='unpublished'){assert(Object.keys(doc).length===1,'unpublished UI release');return null;}
  assert(Object.keys(doc).sort().join(',')==='index,publicReadbackVerified,publicationAuthorized,state'&&
    doc.state==='published'&&doc.publicationAuthorized===true&&doc.publicReadbackVerified===true&&
    record(doc.index)&&typeof doc.index.gameVersion==='string'&&VERSION.test(doc.index.gameVersion)&&record(doc.index.entries),'unverified static UI release');
  return parseSharedMediaIndex(doc.index,'ui',doc.index.gameVersion,Object.keys(doc.index.entries).length);
}
export function createSharedMediaClient(activation:SharedMediaActivation=SHARED_MEDIA_ACTIVATION,fetcher:typeof fetch=fetch,staticUi:unknown=uiRelease){
  const ui=activation===SHARED_MEDIA_ACTIVATION?parseStaticUiRelease(staticUi):null;
  const uiOrigin='https://media.dreamwishwand.com';
  const cache=new Map<SharedMediaGroup,Promise<ReadonlyMap<string,readonly SharedMediaImage[]>>>();
  const empty:ReadonlyMap<string,readonly SharedMediaImage[]>=new Map();
  let origin:string|null=null;
  if(activation.state==='published'){
    assert(activation.publicationAuthorized===true&&activation.publicReadbackVerified===true&&VERSION.test(activation.gameVersion),'unverified publication');
    origin=publicMediaOrigin(activation.origin);
    for(const [g,pin] of Object.entries(activation.groups)){
      assert(GROUPS.includes(g as SharedMediaGroup)&&pin&&SHA.test(pin.sha256)&&
        pin.file===g+'-'+pin.sha256.slice(0,16)+'.json'&&positive(pin.bytes)&&pin.bytes<=16*1024*1024&&positive(pin.nameCount),'invalid index pin');
    }
  } else {assert(activation.state==='unpublished','invalid activation');}
  async function load(group:SharedMediaGroup):Promise<ReadonlyMap<string,readonly SharedMediaImage[]>>{
    if(group==='ui'&&ui)return ui;
    if(activation.state!=='published'||!origin)return empty;
    const pin=activation.groups[group];if(!pin)return empty;
    const previous=cache.get(group);if(previous)return previous;
    const promise=(async()=>{
      const response=await fetcher(origin+'/media/shared/index/'+activation.gameVersion+'/'+pin.file,{credentials:'omit',redirect:'error'});
      assert(response.ok,'index request failed');
      const bytes=await response.arrayBuffer();
      assert(bytes.byteLength===pin.bytes,'index byte length');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
      assert(hash===pin.sha256,'index SHA-256');
      return parseSharedMediaIndex(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),group,activation.gameVersion,pin.nameCount);
    })();
    cache.set(group,promise);
    try{return await promise;}catch(error){cache.delete(group);throw error;}
  }
  return {
    async find(group:SharedMediaGroup,name:string,kind:SharedMediaKind='Sprite'){
      const index=await load(group);
      return (index.get(name)??[]).filter(row=>row.kind===kind).map(image=>({...image,url:sharedMediaUrl(group==='ui'&&ui?uiOrigin:origin!,image)}));
    },
    async unique(group:SharedMediaGroup,name:string,kind:SharedMediaKind='Sprite'){
      const matches=await this.find(group,name,kind);
      // Never choose arbitrarily when a name has several different pixels.
      return matches.length===1?matches[0]:null;
    },
    async names(group:SharedMediaGroup,prefix=''){
      return [...(await load(group)).keys()].filter(name=>name.startsWith(prefix));
    }
  };
}
