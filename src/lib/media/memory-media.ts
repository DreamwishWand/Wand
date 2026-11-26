/** Native completed memory art and shared mask/outline sources. No saved
 * piece-bit interpretation until the native mapping and renderer are verified.
 */
import release from '../../../data/ddv/media/memory-steam-1.26.2.json' with {type:'json'};
import {publicImageUrl,type ImageVariant} from './public-image-key.ts';
import type {ItemImage} from './item-media.ts';
const ORIGIN='https://media.dreamwishwand.com';
const SHA=/^[0-9a-f]{64}$/;
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const check=(v:unknown,m:string):void=>{if(!v)throw new TypeError('Memory media: '+m);};
export interface MemorySources {
  readonly original:ItemImage; readonly thumbnail:ItemImage;
  readonly mask:ItemImage; readonly outline:ItemImage;
  readonly numberOfShards:number; readonly pieceBitMappingVerified:false;
}
export function createMemoryMediaReader(input:unknown,version='1.26.2'){
  const rows=new Map<number,MemorySources>();
  if(record(input)&&input.state==='unpublished')return {get:(id:number)=>rows.get(id)??null};
  if(!record(input)||input.schema!=='wand.media.memory-release@1'||input.state!=='published'||
    input.gameVersion!==version||input.canonicalMetadataVerified!==true||input.pieceBitMappingVerified!==false||
    !record(input.items)||!record(input.images))throw new TypeError('Memory media: release identity');
  const images=new Map<string,ItemImage>();
  for(const [sha,image] of Object.entries(input.images)){
    if(!SHA.test(sha)||!record(image)||!integer(image.width)||!integer(image.height)||!integer(image.bytes)||
      image.width>16384||image.height>16384)throw new TypeError('Memory media: image identity');
    images.set(sha,Object.freeze({sha256:sha,width:image.width,height:image.height,url:publicImageUrl(ORIGIN,'original',sha)}));
  }
  const used=new Set<string>();
  function resolve(sha:unknown):ItemImage{
    if(typeof sha!=='string')throw new TypeError('Memory media: image reference');
    const result=images.get(sha);
    if(!result)throw new TypeError('Memory media: unresolved image');
    used.add(sha);return result;
  }
  for(const [key,row] of Object.entries(input.items)){
    const id=Number(key);
    if(!integer(id)||String(id)!==key||!Array.isArray(row)||row.length!==5||!integer(row[4]))
      throw new TypeError('Memory media: item identity');
    const [original,thumbnail,mask,outline]=row.slice(0,4).map(resolve);
    check(thumbnail.width<=original.width&&thumbnail.height<=original.height&&
      Math.max(thumbnail.width,thumbnail.height)<=512&&
      (Math.max(original.width,original.height)<=512?thumbnail.sha256===original.sha256:
       Math.max(thumbnail.width,thumbnail.height)===512),'thumbnail policy');
    rows.set(id,Object.freeze({original,thumbnail,mask,outline,numberOfShards:row[4],pieceBitMappingVerified:false}));
  }
  check(rows.size>0&&used.size===images.size,'coverage');
  return {get:(id:number)=>rows.get(id)??null};
}
const reader=createMemoryMediaReader(release);
export function memoryItemIds():readonly number[]{return Object.keys(release.items).map(Number).sort((a,b)=>a-b);}
export function getMemorySources(itemId:number):MemorySources|null{return reader.get(itemId);}
export function getMemoryImage(itemId:number,variant:ImageVariant='thumbnail'):ItemImage|null{
  if(variant!=='original'&&variant!=='thumbnail')return null;
  return getMemorySources(itemId)?.[variant]??null;
}
