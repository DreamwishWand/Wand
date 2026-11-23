/**
 * MEDIA -> DB-04 map registration. Source GridData CELL EDGES map into
 * pixels of the original, uncropped MEDIA WebP, not a thumbnail or Save
 * coordinate. The caller must establish registration from game evidence.
 * Loading a local manifest does not authenticate its calibration.
 */
export const MAP_CALIBRATION_SCHEMA='wand.db04.media-map-calibration@1' as const;
export type Affine=readonly [number,number,number,number,number,number];
export interface GridMapIdentity {
  readonly layoutId:string;readonly nativeGridId:number;
  readonly gridDataPath:string;readonly sizeX:number;readonly sizeY:number;
}
export interface GridMapBinding extends GridMapIdentity {
  readonly gridToImage:Affine;
}
export interface MapCalibration {
  readonly schema:typeof MAP_CALIBRATION_SCHEMA;
  readonly platform:string;readonly gameVersion:string;readonly regionKey:string;
  readonly image:{readonly filename:string;readonly sha256:string;
    readonly width:number;readonly height:number};
  readonly grids:readonly GridMapBinding[];
}
type Row=Record<string,unknown>;
const record=(v:unknown):v is Row=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min:number,max:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const safePath=(v:unknown,prefix:string):v is string=>
  typeof v==='string'&&v.length<=512&&v.startsWith(prefix)&&v.endsWith('.json')&&
  !v.includes('..')&&!v.includes('\\')&&!/\p{Cc}/u.test(v);
const text=(v:unknown,max:number):v is string=>
  typeof v==='string'&&v.length>0&&v.length<=max&&!/\p{Cc}/u.test(v);
const fail=()=>new TypeError('DB04_MEDIA_MAP_CALIBRATION_INVALID');
export function projectGridEdge(m:Affine,x:number,y:number){
  return {x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]};
}
/** Unclipped inverse for previews extending beyond the selected source Grid. */
export function imagePixelToUnboundedGridCell(binding:GridMapBinding,px:number,py:number){
  if(!Number.isFinite(px)||!Number.isFinite(py))return null;
  const [a,b,c,d,e,f]=binding.gridToImage;
  const det=a*d-b*c;
  const x=(d*(px-e)-c*(py-f))/det;
  const y=(-b*(px-e)+a*(py-f))/det;
  if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>1e6||Math.abs(y)>1e6)return null;
  return {x:Math.floor(x),y:Math.floor(y)};
}
export function imagePixelToGridCell(binding:GridMapBinding,px:number,py:number){
  const cell=imagePixelToUnboundedGridCell(binding,px,py);
  return cell&&cell.x>=0&&cell.y>=0&&cell.x<binding.sizeX&&cell.y<binding.sizeY?cell:null;
}
export function parseMapCalibration(input:unknown):MapCalibration{
  if(!record(input)||input.schema!==MAP_CALIBRATION_SCHEMA||
    input.platform!=='Steam'||!text(input.gameVersion,32)||
    !/^\d+\.\d+\.\d+$/.test(input.gameVersion)||
    !text(input.regionKey,256)||!record(input.image)||
    !text(input.image.filename,255)||!/^([^/\\]+)\.webp$/i.test(input.image.filename)||
    !text(input.image.sha256,64)||!/^[a-f0-9]{64}$/.test(input.image.sha256)||
    !integer(input.image.width,1,32768)||!integer(input.image.height,1,32768)||
    input.image.width*input.image.height>100_000_000||
    !Array.isArray(input.grids)||input.grids.length<1||input.grids.length>2048)
    throw fail();
  const image={filename:input.image.filename,sha256:input.image.sha256,
    width:input.image.width,height:input.image.height};
  const seen=new Set<string>();
  const grids:GridMapBinding[]=input.grids.map(g=>{
    if(!record(g)||!safePath(g.layoutId,'SceneLayouts/')||
      !safePath(g.gridDataPath,'GridData/')||!integer(g.nativeGridId,0,0xffffffff)||
      !integer(g.sizeX,1,65536)||!integer(g.sizeY,1,65536)||
      g.sizeX*g.sizeY>16_777_216||
      !Array.isArray(g.gridToImage)||g.gridToImage.length!==6||
      !g.gridToImage.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e7))
      throw fail();
    const m=g.gridToImage as unknown as Affine;
    const scale=Math.hypot(m[0],m[1])*Math.hypot(m[2],m[3]);
    const det=m[0]*m[3]-m[1]*m[2];
    if(scale<1e-12||Math.abs(det)/scale<1e-6)throw fail();
    for(const x of [0,g.sizeX])for(const y of [0,g.sizeY]){
      const p=projectGridEdge(m,x,y);
      if(p.x< -1e-6||p.y< -1e-6||p.x>image.width+1e-6||
        p.y>image.height+1e-6)throw fail();
    }
    const key=g.layoutId+'\0'+g.nativeGridId;
    if(seen.has(key))throw fail();
    seen.add(key);
    return {layoutId:g.layoutId,nativeGridId:g.nativeGridId,gridDataPath:g.gridDataPath,
      sizeX:g.sizeX,sizeY:g.sizeY,gridToImage:[...m] as Affine};
  });
  return {schema:MAP_CALIBRATION_SCHEMA,platform:input.platform,
    gameVersion:input.gameVersion,regionKey:input.regionKey,image,grids};
}
export function findMapBinding(calibration:MapCalibration,selection:GridMapIdentity&
  {platform:string;gameVersion:string;regionKey:string}):GridMapBinding|null{
  if(calibration.platform!==selection.platform||
    calibration.gameVersion!==selection.gameVersion||
    calibration.regionKey!==selection.regionKey)return null;
  return calibration.grids.find(g=>g.layoutId===selection.layoutId&&
    g.nativeGridId===selection.nativeGridId&&g.gridDataPath===selection.gridDataPath&&
    g.sizeX===selection.sizeX&&g.sizeY===selection.sizeY)??null;
}
export function matchesMapImage(calibration:MapCalibration,image:{
  filename:string;sha256:string;width:number;height:number}):boolean{
  return image.filename===calibration.image.filename&&image.sha256===calibration.image.sha256&&
    image.width===calibration.image.width&&image.height===calibration.image.height;
}
