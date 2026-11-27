/** Original map layout evidence, not a calibrated world/grid coordinate map.
 * Preserve source part order and affine transforms. Never fetch report paths.
 * The local reader verifies the actual original bytes before creating URLs.
 */
import type {Affine} from '../world/media-map-calibration.ts';
import type {MapExtent} from '../world/map-camera.ts';
const SHA=/^[a-f0-9]{64}$/;
const ORIGINAL=/^images\/maps\/original\/([a-f0-9]{2})\/([a-f0-9]{64})\.webp$/;
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256&&!/[\x00-\x1f]/.test(v);
const size=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=32768;
function check(v:unknown,code:string):asserts v{if(!v)throw new TypeError('MAP_PARTS_'+code);}
export interface MapPart {
  readonly name:string;
  readonly sourceFilename:string;
  readonly sha256:string;
  readonly imageToCanvas:Affine;
}
export interface WorldMapParts {
  readonly id:string;
  readonly worldCandidate:string;
  readonly width:number;
  readonly height:number;
  readonly referenceSha256:string;
  readonly status:string;
  readonly parts:readonly MapPart[];
  readonly worldPlacementVerified:false;
  readonly oceanMissing:boolean;
}
export interface WorldMapPartReport {
  readonly gameVersion:string;
  readonly maps:readonly WorldMapParts[];
  readonly publicationAuthorized:false;
}
export interface LoadedMapPart extends MapPart{
  readonly width:number;
  readonly height:number;
  readonly url:string;
}
export function parseWorldMapPartReport(doc:unknown):WorldMapPartReport{
  check(record(doc)&&['wand.src04.world-map-composition@2','wand.src04.world-map-repair@3'].includes(String(doc.schema))&&
    typeof doc.gameVersion==='string'&&/^\d+\.\d+\.\d+$/.test(doc.gameVersion)&&
    doc.publicationAuthorized===false&&Array.isArray(doc.worlds)&&doc.worlds.length>0&&doc.worlds.length<=128,'REPORT');
  const ids=new Set<string>();
  const maps:WorldMapParts[]=doc.worlds.map(w=>{
    check(record(w)&&text(w.prefab)&&text(w.worldCandidate)&&text(w.status)&&
      size(w.width)&&size(w.height)&&w.width*w.height<=200_000_000&&
      typeof w.sha256==='string'&&SHA.test(w.sha256)&&w.worldPlacementVerified===false&&
      Array.isArray(w.parts)&&w.parts.length>0&&w.parts.length<=512,'MAP');
    check(!ids.has(w.prefab),'DUPLICATE_MAP');ids.add(w.prefab);
    const parts:MapPart[]=w.parts.map(p=>{
      check(record(p)&&text(p.name)&&typeof p.imageSha256==='string'&&SHA.test(p.imageSha256)&&
        typeof p.imagePath==='string'&&record(p.layoutEvidence)&&p.layoutEvidence.componentEnabled===true&&
        p.layoutEvidence.mapping==='observed_guid_field_exact_catalog_internal_id_container_pptr'&&
        ['native_pixel_copy','affine_resample_no_downscale'].includes(String(p.renderMode))&&
        Array.isArray(p.imageToCanvas)&&p.imageToCanvas.length===6&&
        p.imageToCanvas.every((v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e7),'PART');
      const path=ORIGINAL.exec(p.imagePath);
      check(path&&path[1]===path[2].slice(0,2),'SOURCE_FILENAME');
      const matrix=[...p.imageToCanvas] as unknown as Affine;
      check(Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2])>1e-8,'SINGULAR_MATRIX');
      return {name:p.name,sourceFilename:path[2]+'.webp',sha256:p.imageSha256,imageToCanvas:matrix};
    });
    return {id:w.prefab,worldCandidate:w.worldCandidate,width:w.width,height:w.height,
      referenceSha256:w.sha256,status:w.status,parts,worldPlacementVerified:false,
      oceanMissing:w.status==='incomplete_ocean_not_rendered'};
  });
  return {gameVersion:doc.gameVersion,maps,publicationAuthorized:false};
}
export function mapPartBounds(p:Pick<LoadedMapPart,'imageToCanvas'|'width'|'height'>):MapExtent{
  const [a,b,c,d,e,f]=p.imageToCanvas;
  const xs=[e,e+a*p.width,e+c*p.height,e+a*p.width+c*p.height];
  const ys=[f,f+b*p.width,f+d*p.height,f+b*p.width+d*p.height];
  const x=Math.min(...xs),y=Math.min(...ys);
  return {x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y};
}
export function visibleMapParts<T extends Pick<LoadedMapPart,'imageToCanvas'|'width'|'height'>>(parts:readonly T[],view:MapExtent):T[]{
  // Stable painter order. A rotated/flipped part's bounding box is
  // conservative; a false positive may render a part, never hide it.
  return parts.filter(p=>{
    const b=mapPartBounds(p);
    return b.x<view.x+view.w&&b.x+b.w>view.x&&b.y<view.y+view.h&&b.y+b.h>view.y;
  });
}
export function localMapPartFiles(files:readonly File[],map:WorldMapParts):ReadonlyMap<string,File>{
  const required=new Set(map.parts.map(p=>p.sourceFilename)),found=new Map<string,File>();
  for(const f of files){
    if(!required.has(f.name))continue;
    check(!found.has(f.name),'AMBIGUOUS_FILE');
    found.set(f.name,f);
  }
  return found;
}
export async function verifyMapPartBytes(file:Blob,sha256:string):Promise<ArrayBuffer>{
  check(SHA.test(sha256)&&file.size>=20&&file.size<=80*1024*1024,'FILE_SIZE');
  const data=await file.arrayBuffer(),bytes=new Uint8Array(data);
  const ascii=(offset:number)=>String.fromCharCode(...bytes.subarray(offset,offset+4));
  check(ascii(0)==='RIFF'&&ascii(8)==='WEBP'&&new DataView(data).getUint32(4,true)+8===data.byteLength,'WEBP');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
  check(digest===sha256,'SHA');
  return data;
}
export async function loadLocalMapParts(map:WorldMapParts,files:readonly File[],signal:AbortSignal):Promise<LoadedMapPart[]>{
  const selected=localMapPartFiles(files,map);
  check(map.parts.every(p=>selected.has(p.sourceFilename)),'MISSING_FILES');
  check([...selected.values()].reduce((n,f)=>n+f.size,0)<=512*1024*1024,'TOTAL_BYTES');
  const loaded:LoadedMapPart[]=[];
  try{
    for(const part of map.parts){
      signal.throwIfAborted();
      const file=selected.get(part.sourceFilename)!;
      const raw=await verifyMapPartBytes(file,part.sha256);
      signal.throwIfAborted();
      const blob=new Blob([raw],{type:'image/webp'});
      const bitmap=await createImageBitmap(blob);
      let width:number,height:number;
      try{
        width=bitmap.width;height=bitmap.height;
        check(size(width)&&size(height)&&width*height<=100_000_000,'IMAGE_DIMENSIONS');
      }finally{bitmap.close();}
      signal.throwIfAborted();
      loaded.push({...part,width,height,url:URL.createObjectURL(blob)});
    }
    return loaded;
  }catch(e){for(const p of loaded)URL.revokeObjectURL(p.url);throw e;}
}
