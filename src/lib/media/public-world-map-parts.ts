import {publicImageUrl} from './public-image-key.ts';
import type {Affine} from '../world/media-map-calibration.ts';
import type {LoadedMapPart} from './world-map-parts.ts';

export type RenderableMapPart=Pick<LoadedMapPart,'sha256'|'width'|'height'|'url'|'imageToCanvas'>;
export interface PublishedWorldMap {
  readonly id:string;
  readonly worldCandidate:string;
  readonly width:number;
  readonly height:number;
  readonly oceanMissing:boolean;
  readonly visualReviewRequired:boolean;
  readonly worldPlacementVerified:false;
  readonly parts:readonly RenderableMapPart[];
}
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_]{1,128}$/;
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const size=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=32768;
const ident=(v:unknown):v is string=>typeof v==='string'&&ID.test(v);
function check(v:unknown,code:string):asserts v{if(!v)throw new TypeError('MAP_PART_RELEASE_'+code);}
function exact(v:Record<string,unknown>,keys:string){return Object.keys(v).sort().join(',')===keys;}
export function parsePublishedWorldMapParts(doc:unknown,version:string,origin='https://media.dreamwishwand.com'){
  check(record(doc)&&exact(doc,'canonicalMetadataVerified,gameVersion,images,maps,schema,state')&&
    doc.schema==='wand.media.world-map-parts@1'&&doc.state==='published'&&doc.canonicalMetadataVerified===true&&
    /^\d+\.\d+\.\d+$/.test(version)&&doc.gameVersion===version&&record(doc.images)&&
    Array.isArray(doc.maps)&&doc.maps.length>0&&doc.maps.length<=128,'IDENTITY');
  const images=new Map<string,{width:number;height:number;url:string}>();
  for(const [sha,v] of Object.entries(doc.images)){
    check(SHA.test(sha)&&record(v)&&exact(v,'bytes,height,width')&&size(v.width)&&size(v.height)&&
      v.width*v.height<=100_000_000&&typeof v.bytes==='number'&&Number.isSafeInteger(v.bytes)&&
      v.bytes>=20&&v.bytes<=80*1024*1024,'IMAGE');
    images.set(sha,{width:v.width,height:v.height,url:publicImageUrl(origin,'original',sha)});
  }
  const maps:PublishedWorldMap[]=[];
  const ids=new Set<string>(),used=new Set<string>();
  for(const w of doc.maps){
    check(record(w)&&exact(w,'height,id,oceanMissing,parts,visualReviewRequired,width,worldCandidate,worldPlacementVerified')&&
      ident(w.id)&&ident(w.worldCandidate)&&!ids.has(w.id)&&size(w.width)&&size(w.height)&&
      w.width*w.height<=200_000_000&&typeof w.oceanMissing==='boolean'&&typeof w.visualReviewRequired==='boolean'&&
      (!w.oceanMissing||w.visualReviewRequired)&&w.worldPlacementVerified===false&&
      Array.isArray(w.parts)&&w.parts.length>0&&w.parts.length<=512,'MAP');
    ids.add(w.id);
    const parts:RenderableMapPart[]=w.parts.map(row=>{
      check(Array.isArray(row)&&row.length===2&&typeof row[0]==='string'&&images.has(row[0]),'REFERENCE');
      const [sha,m]=row;
      check(Array.isArray(m)&&m.length===6&&m.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e7)&&
        Math.abs(m[0]*m[3]-m[1]*m[2])>1e-8,'MATRIX');
      used.add(sha);
      return Object.freeze({sha256:sha,...images.get(sha)!,imageToCanvas:Object.freeze([...m]) as Affine});
    });
    maps.push(Object.freeze({id:w.id,worldCandidate:w.worldCandidate,width:w.width,height:w.height,
      oceanMissing:w.oceanMissing,visualReviewRequired:w.visualReviewRequired,worldPlacementVerified:false,parts:Object.freeze(parts)}));
  }
  check(used.size===images.size,'UNREFERENCED_IMAGE');
  return Object.freeze({gameVersion:version,maps:Object.freeze(maps)});
}
