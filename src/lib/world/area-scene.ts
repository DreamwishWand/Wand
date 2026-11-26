import type {DesignClipItem,DesignItemGeometry} from './design-layout.ts';
import {captureFurnitureGroup,groupAbsoluteCandidate,type GroupGeometry,type GroupPasteCandidate,type GroupPasteRow} from './group-paste.ts';
import {parseSupportScene,supportSceneRootCounts,type SupportScene} from './support-scene.ts';
import {CARDINAL_ORIENTATIONS,isCardinal} from './saved-map-transform.ts';
import {mainlandMapAnchor,mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
import {stockFootprintFeedback,type StockCandidate} from './save-furniture-placement.ts';
import {terrainWarnings,type TerrainRaster} from './terrain-binding.ts';
import {roadPitch} from './road-design.ts';
import {fenceFamily} from './fence-family-catalog.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';

export type SceneNetwork={kind:'road';diagonal:boolean}|{kind:'fence';diagonal:boolean;base:number};
export interface AreaSceneItem extends DesignClipItem{support:SupportScene|null;network:SceneNetwork|null}
export interface AreaScene{schema:'wand.preset.area-scene@1';gameVersion:'1.26.2';factor:2;anchor:'corner'|'center';items:AreaSceneItem[]}
const rec=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const int=(v:unknown,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
export function parseSceneNetwork(v:unknown,id:number,orientation:number):SceneNetwork{
 if(!rec(v)||typeof v.diagonal!=='boolean')throw Error('NETWORK');
 if(v.kind==='road'&&Object.keys(v).length===2&&Math.floor(id/100000)===401&&orientation===2)return {kind:'road',diagonal:v.diagonal};
 if(v.kind==='fence'&&Object.keys(v).length===3&&int(v.base,0xffffffff)&&(orientation===2||orientation===3)){
  const f=fenceFamily(v.base);
  if(f&&(id===f.base||(v.diagonal?f.diagExt:f.ext).includes(id))&&(id!==f.base||orientation===2))return {kind:'fence',base:v.base,diagonal:v.diagonal};
 }
 throw Error('NETWORK');
}
export function areaSceneCounts(items:readonly AreaSceneItem[]){
 const counts=new Map<number,number>();for(const p of items)if(!p.network){const row=p.support?supportSceneRootCounts(p.support):new Map([[p.itemId,1]]);for(const [id,n] of row)counts.set(id,(counts.get(id)??0)+n);}
 return counts;
}
export function parseAreaScene(raw:string):AreaScene{
 if(raw.length>262144)throw Error('SCENE_LIMIT');const v:unknown=JSON.parse(raw);
 if(!rec(v)||Object.keys(v).length!==5||v.schema!=='wand.preset.area-scene@1'||v.gameVersion!=='1.26.2'||v.factor!==2||!(v.anchor==='corner'||v.anchor==='center')||!Array.isArray(v.items)||!v.items.length||v.items.length>416)throw Error('SCENE_INVALID');
 const items:AreaSceneItem[]=v.items.map(p=>{
  if(!rec(p)||Object.keys(p).length!==6||!int(p.itemId,0xffffffff)||!int(p.dx,131072)||!int(p.dy,131072)||!int(p.orientation,3))throw Error('POSE');
  const network=p.network===null?null:parseSceneNetwork(p.network,p.itemId,p.orientation);
  const support=p.support===null?null:parseSupportScene(JSON.stringify(p.support));
  if(network&&support||!network&&Math.floor(p.itemId/100000)!==400||support&&support.ownerItemId!==p.itemId)throw Error('SCENE_ITEM');
  return {itemId:p.itemId,dx:p.dx,dy:p.dy,orientation:p.orientation,network,support};
 });
 const roads=items.filter(p=>p.network?.kind==='road'),fences=items.filter(p=>p.network?.kind==='fence');
 if(!roads.length&&!fences.length||roads.length>256||fences.length>128||[...areaSceneCounts(items).values()].reduce((a,b)=>a+b,0)>32||Math.min(...items.map(p=>p.dx))!==0||Math.min(...items.map(p=>p.dy))!==0)throw Error('SCENE_LIMIT');
 return {schema:'wand.preset.area-scene@1',gameVersion:'1.26.2',factor:2,anchor:v.anchor,items};
}
export function captureAreaPoses(items:readonly MainlandSavedObject[]):DesignClipItem[]|null{
 if(!items.length||items.length>416||new Set(items.map(p=>p.object.localOrdinal)).size!==items.length)return null;
 const rows:DesignClipItem[]=[];let roads=0,fences=0,furniture=0;
 for(const p of items){
  const id=Number(p.object.itemId),orientation=p.object.orientation,layer=p.object.layer;
  if(!p.shape||!isCardinal(orientation)||nativeActionBlocked(p.object.editRestrictions,'select')||!Number.isSafeInteger(p.x*2)||!Number.isSafeInteger(-p.y*2))return null;
  if(layer==='ground'&&Math.floor(id/100000)===401&&orientation==='GridOrientation_Down'&&!p.object.subgrid){if(++roads>256)return null;}
  else if(layer==='fence'&&Math.floor(id/100000)===407&&['GridOrientation_Down','GridOrientation_Left'].includes(orientation)&&!p.object.subgrid){if(++fences>128)return null;}
  else if(++furniture>32||!captureFurnitureGroup([p],true))return null;
  rows.push({itemId:id,dx:p.x*2,dy:-p.y*2,orientation:CARDINAL_ORIENTATIONS.indexOf(orientation)});
 }
 if(!roads&&!fences)return null;
 const x=Math.min(...rows.map(p=>p.dx)),y=Math.min(...rows.map(p=>p.dy));return rows.map(p=>({...p,dx:p.dx-x,dy:p.dy-y}));
}
export function areaSceneFromClip(clip:readonly DesignClipItem[],supports:readonly (SupportScene|null)[],networks:readonly (SceneNetwork|null)[]):AreaScene{
 if(clip.length!==supports.length||clip.length!==networks.length)throw Error('SCENE_LENGTH');
 return parseAreaScene(JSON.stringify({schema:'wand.preset.area-scene@1',gameVersion:'1.26.2',factor:2,anchor:'corner',items:clip.map((p,i)=>({...p,support:supports[i],network:networks[i]}))}));
}
/** Verify observed part dimensions and masks with current source geometry. */
export function networkSceneShape(p:AreaSceneItem,g:DesignItemGeometry|undefined,factor:1|2){
 if(!g||!p.network||g.itemId!==p.itemId||nativeActionBlocked(g.editRestrictions,'select'))return null;
 const s=g.shapes[p.itemId+':'+p.orientation*4];
 if(!s||s.acceptedFloorTypesFlag===undefined||!s.cellCount)return null;
 if(p.network.kind==='road')return roadPitch(g,factor)?s:null;
 const f=fenceFamily(p.network.base);if(!f||g.layer!=='fence')return null;
 const name=(g.name??'').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(!name.includes(f.name.toLowerCase().replace(/[^a-z0-9]/g,'')))return null;
 const k=p.itemId===f.base?1:(p.network.diagonal?f.diagExt:f.ext).indexOf(p.itemId)+1;
 if(k<1||p.itemId!==f.base&&(!name.includes('ext')||name.includes('diag')!==p.network.diagonal))return null;
 const w=p.network.diagonal||p.orientation===2?k*factor:factor,h=p.network.diagonal||p.orientation===3?k*factor:factor;
 return s.width===w&&s.height===h?s:null;
}
export type AreaSceneCandidate=GroupPasteCandidate&{areaRows:(GroupPasteRow&{scene?:SupportScene;network?:SceneNetwork})[]};
export function areaSceneCandidate(doc:AreaScene,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,defs:GroupGeometry,objects:readonly MainlandSavedObject[],omitted:number,wx:number,wy:number):AreaSceneCandidate|null{
 const hits=mainlandTerrainHits(grids,rasters,wx,wy);if(hits.length!==1)return null;
 const g=hits[0],bx=2*g.origin.position[0]+Math.floor((wx-2*g.origin.position[0])*g.factor)/g.factor,by=-2*g.origin.position[2]-Math.floor((-wy-2*g.origin.position[2])*g.factor)/g.factor;
 const positions=doc.items.map(p=>({itemId:p.itemId,x:bx+p.dx/2,y:by-p.dy/2,orientation:p.orientation}));
 const furniture=positions.filter((_,i)=>!doc.items[i].network),base=furniture.length?groupAbsoluteCandidate(furniture,grids,rasters,defs,areaSceneCounts(doc.items),objects,omitted):{rows:[],ghosts:[]};
 if(!base)return null;
 const rows:AreaSceneCandidate['areaRows']=[],ghosts:StockCandidate[]=[],anchors=new Set<string>();let cursor=0;
 for(let i=0;i<doc.items.length;i++){
  const p=doc.items[i],at=positions[i];
  if(!p.network){const row=base.rows[cursor],ghost=base.ghosts[cursor++];rows.push({...row,...(p.support?{scene:p.support}:{})});ghosts.push(ghost);continue;}
  const target=mainlandTerrainHits(grids,rasters,at.x+.001,at.y-.001);if(target.length!==1)return null;
  const d=target[0],r=rasters.get(d.key),s=networkSceneShape(p,defs.get(p.itemId)?.get(d.factor),d.factor);
  const x=(at.x-2*d.origin.position[0])*d.factor,y=(-at.y-2*d.origin.position[2])*d.factor,pitch=(p.network.kind==='road'?2:1)*d.factor;
  if(!s||!r||!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||x%pitch||y%pitch||x+s.width>d.sizeX*d.factor||y+s.height>d.sizeY*d.factor||terrainWarnings({raster:r,factor:d.factor,verifiedGridOrdinals:[]},s,x,y).length)return null;
  const key=d.key+':'+p.network.kind+':'+x+':'+y;if(anchors.has(key))return null;anchors.add(key);
  for(const run of s.runs)for(let j=0;j<run.width;j++){const a=mainlandMapAnchor(d,x+run.x+j+.5,y+run.y+.5),owners=mainlandTerrainHits(grids,rasters,a.x,a.y);if(owners.length!==1||owners[0].key!==d.key)return null;}
  if(p.network.kind==='road'&&objects.some(o=>o.area===d.key&&o.object.layer==='ground'&&o.object.x===x&&o.object.y===y))return null;
  if(p.network.kind==='fence'&&objects.some(o=>o.area===d.key&&o.object.layer==='fence'&&Math.abs(o.object.x-x)<=8*d.factor&&Math.abs(o.object.y-y)<=8*d.factor))return null;
  const destination={layoutId:d.layoutId,gridDataPath:d.gridDataPath,factor:d.factor,sizeX:d.sizeX,sizeY:d.sizeY};
  const orientation=CARDINAL_ORIENTATIONS[p.orientation],itemId=String(p.itemId);
  const ghost:StockCandidate={area:d.key,...mainlandMapAnchor(d,x,y),factor:d.factor,shape:s,plan:{action:'place',itemId,x,y,orientation},destination};
  if(p.network.kind==='fence'&&base.ghosts.some(other=>stockFootprintFeedback(ghost,[{area:other.area,x:other.x,y:other.y,factor:other.factor,shape:other.shape,object:{localOrdinal:1,localGridOrdinal:1,itemId:other.plan.itemId,x:0,y:0,orientation:'GridOrientation_Down',orientationCode:8,shapeKey:null,name:null,layer:'furniture',surfaceCapable:false}}]).overlaps))return null;
  rows.push({itemId,x,y,orientation,destination,network:p.network});ghosts.push(ghost);
 }
 return {rows,ghosts,areaRows:rows};
}
