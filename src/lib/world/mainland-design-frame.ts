/** World design frame in original logical axes (X,+Z). The SVG display
 * reverses Y for the same north-up view as MainlandOverview. The worker
 * composes the original nonzero terrain and a unique Grid owner mask.
 * No virtual GridData path is ever passed to a source or save reader. */
import {bindMainland,mainlandExtent,sourceWorldScope,type MainlandGrid} from './mainland-world-coordinates.ts';
import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
import {terrainWarnings,type TerrainRaster} from './terrain-binding.ts';
import type {DesignItemGeometry,DesignPlacement,DesignTimeline} from './design-layout.ts';
import {currentDesign,DESIGN_LIMIT,DESIGN_FILE_LIMIT,parseDesign,serializeDesign,emptyDesign,restoreDesign} from './design-layout.ts';
import {roadPitch,localNetworkScope,type NetworkScope} from './road-design.ts';
import {fencePitch} from './fence-design.ts';
import {exclusiveAnchorClass} from './saved-map-transform.ts';
import type {SourceObjectShape} from './source-object-map.ts';
export interface MainlandDesignFrame {
 readonly grids:readonly MainlandGrid[];
 readonly scope:string;
 readonly raster:TerrainRaster;
 readonly owners:Uint8Array; // 0 = no nonzero source, 255 = overlapping
 readonly minX:number;readonly minZ:number;
}
export function composeMainlandDesignFrame(grids:readonly PublicTerrainGridRef[],rasters:ReadonlyMap<string,TerrainRaster>):MainlandDesignFrame{
 const bound=bindMainland(grids);
 if(!bound||bound.some(g=>g.factor!==1))throw Error('MAINLAND_FRAME_SOURCE');
 const ext=mainlandExtent(bound),minX=ext.x,minZ=-ext.y-ext.h,sizeX=ext.w,sizeY=ext.h;
 if(!Number.isSafeInteger(sizeX*sizeY)||sizeX*sizeY>2_500_000)throw Error('MAINLAND_FRAME_SIZE');
 const owners=new Uint8Array(sizeX*sizeY),values=new Uint32Array(sizeX*sizeY);
 for(let i=0;i<bound.length;i++){
  const g=bound[i],r=rasters.get(g.key);
  if(!r||r.sizeX!==g.sizeX||r.sizeY!==g.sizeY||r.nativeFloorValues.length!==g.sizeX*g.sizeY)throw Error('MAINLAND_FRAME_RASTER');
  const ox=2*g.origin.position[0]-minX,oz=2*g.origin.position[2]-minZ;
  for(let y=0;y<r.sizeY;y++)for(let x=0;x<r.sizeX;x++){
   const value=r.nativeFloorValues[y*r.sizeX+x];if(!value)continue;
   const j=(oz+y)*sizeX+ox+x;
   if(owners[j]){owners[j]=255;values[j]=0;}else{owners[j]=i+1;values[j]=value;}
  }
 }
 return {grids:bound,scope:sourceWorldScope(bound[0]),minX,minZ,owners,raster:{sizeX,sizeY,nativeFloorValues:values}};
}
export function mainlandFrameOffset(f:MainlandDesignFrame,g:MainlandGrid){return {x:2*g.origin.position[0]-f.minX,y:2*g.origin.position[2]-f.minZ};}
/** Every occupied cell must resolve to one original Grid, and the entire
 * native shape envelope must fit in that Grid. Zero/overlap are not guessed.
 * This is source mapping, not a collision or legal-placement verdict. */
export function resolveMainlandDesign(f:MainlandDesignFrame,x:number,y:number,shape:SourceObjectShape):{grid:MainlandGrid;x:number;y:number}|null{
 const w=f.raster.sizeX,h=f.raster.sizeY;
 if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||x+shape.width>w||y+shape.height>h||!shape.runs.length||!shape.cellCount||shape.cellCount>65536)return null;
 let owner=0,count=0;
 for(const r of shape.runs){
  if(![r.x,r.y,r.width].every(Number.isSafeInteger)||r.x<0||r.y<0||r.width<1||r.x+r.width>shape.width||r.y>=shape.height)return null;
  for(let dx=0;dx<r.width;dx++){
   const n=f.owners[(y+r.y)*w+x+r.x+dx];if(!n||n===255||owner&&n!==owner)return null;owner=n;count++;
  }
 }
 const grid=f.grids[owner-1];if(!grid||count!==shape.cellCount)return null;
 const o=mainlandFrameOffset(f,grid),lx=x-o.x,ly=y-o.y;
 return lx>=0&&ly>=0&&lx+shape.width<=grid.sizeX&&ly+shape.height<=grid.sizeY?{grid,x:lx,y:ly}:null;
}
export function mainlandNetworkScope(f:MainlandDesignFrame|null):NetworkScope{
 if(!f)return localNetworkScope;
 return p=>{const {x,y}=p,w=f.raster.sizeX;if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||x>=w||y>=f.raster.sizeY)return null;const n=f.owners[y*w+x];return n&&n!==255?f.grids[n-1]?.key??null:null;};
}
export function mainlandItemsValid(f:MainlandDesignFrame|null,items:readonly Pick<DesignPlacement,'itemId'|'x'|'y'|'orientation'>[],defs:ReadonlyMap<number,DesignItemGeometry>):boolean{
 if(!f)return true;
 return items.every(p=>{
  const g=defs.get(p.itemId),s=g?.shapes[p.itemId+':'+p.orientation*4];
  if(!g||!s||g.layer==='surface')return false;
  const target=resolveMainlandDesign(f,p.x,p.y,s);if(!target)return false;
  if(g.nativeType==='Building'&&terrainWarnings({raster:f.raster,factor:1,verifiedGridOrdinals:[]},s,p.x,p.y).length)return false;
  const kind=exclusiveAnchorClass(String(p.itemId));
  if(kind){const pitch=kind==='ground'?roadPitch(g,target.grid.factor):fencePitch(g,target.grid.factor);return !!pitch&&p.orientation===2&&target.x%pitch===0&&target.y%pitch===0;}
  return true;
 });
}
export function validatedMainlandPlan(f:MainlandDesignFrame|null,old:DesignTimeline,next:DesignTimeline|null,defs:ReadonlyMap<number,DesignItemGeometry>):DesignTimeline|null{
 if(!next||!f)return next;
 const before=new Map(currentDesign(old).map(p=>[p.id,p]));
 const changed=currentDesign(next).filter(p=>before.get(p.id)!==p);
 // Generic translation must not silently reconstruct network topology.
 if(changed.some(p=>{const o=before.get(p.id);return !!o&&!!exclusiveAnchorClass(String(o.itemId))&&(o.x!==p.x||o.y!==p.y||o.orientation!==p.orientation);}))return null;
 return mainlandItemsValid(f,changed,defs)?next:null;
}
/** Portable world document contains eight real grid documents, never raw
 * Save data. Reuses the existing exact native-grid identity validator. */
export function serializeMainlandDesign(f:MainlandDesignFrame,t:DesignTimeline,defs:ReadonlyMap<number,DesignItemGeometry>):string{
 const groups=new Map(f.grids.map(g=>[g.key,[] as DesignPlacement[]]));
 for(const p of currentDesign(t)){
  const s=defs.get(p.itemId)?.shapes[p.itemId+':'+p.orientation*4],target=s?resolveMainlandDesign(f,p.x,p.y,s):null;
  if(!target||!mainlandItemsValid(f,[p],defs))throw Error('MAINLAND_DESIGN_INVALID');
  groups.get(target.grid.key)!.push({...p,x:target.x,y:target.y});
 }
 const identity=f.scope==='Village04'?{schema:'wand.mainland-design@1'}:{schema:'wand.world-scope-design@1',scope:f.scope};
 const text=JSON.stringify({...identity,platform:'Steam',gameVersion:'1.26.2',areas:f.grids.map(g=>JSON.parse(serializeDesign({...emptyDesign(),snapshots:[groups.get(g.key)!]},g)))});
 if(text.length>DESIGN_FILE_LIMIT)throw Error('DESIGN_FILE_LIMIT');return text;
}
export function parseMainlandDesign(text:string,f:MainlandDesignFrame,sourceAreas?:Map<number,string>):DesignPlacement[]{
 if(text.length>DESIGN_FILE_LIMIT)throw Error('DESIGN_FILE_LIMIT');
 const doc=JSON.parse(text);
 if((f.scope==='Village04'?doc?.schema!=='wand.mainland-design@1':doc?.schema!=='wand.world-scope-design@1'||doc.scope!==f.scope)||doc.platform!=='Steam'||doc.gameVersion!=='1.26.2'||!Array.isArray(doc.areas)||doc.areas.length!==f.grids.length)throw Error('MAINLAND_DESIGN_INVALID');
 const ids=new Set<number>(),result:DesignPlacement[]=[];
 for(const g of f.grids){
  const matches=doc.areas.filter((a:unknown)=>a!==null&&typeof a==='object'&&(a as {grid?:{key?:string}}).grid?.key===g.key);
  if(matches.length!==1)throw Error('MAINLAND_DESIGN_GRID');
  const offset=mainlandFrameOffset(f,g);
  for(const p of parseDesign(JSON.stringify(matches[0]),g)){
   if(ids.has(p.id)||result.length>=DESIGN_LIMIT)throw Error('MAINLAND_DESIGN_LIMIT');
   ids.add(p.id);sourceAreas?.set(p.id,g.key);result.push({...p,x:p.x+offset.x,y:p.y+offset.y});
  }
 }
 return result;
}

export function mainlandImportMatches(f:MainlandDesignFrame,placements:readonly DesignPlacement[],defs:ReadonlyMap<number,DesignItemGeometry>,sourceAreas:ReadonlyMap<number,string>):boolean{
 if(placements.length!==sourceAreas.size||!mainlandItemsValid(f,placements,defs))return false;
 return placements.every(p=>{const shape=defs.get(p.itemId)?.shapes[p.itemId+':'+p.orientation*4];return !!shape&&resolveMainlandDesign(f,p.x,p.y,shape)?.grid.key===sourceAreas.get(p.id);});
}

/** Explicitly add previous area drafts to the common world design. Do not
 * mutate the original timelines or guess a source owner. Exact duplicates
 * are skipped; incompatible or out-of-source records reject the whole copy.
 * One world transaction, with new synthetic IDs and a single Undo. */
export function mergeMainlandAreaDrafts(f:MainlandDesignFrame,t:DesignTimeline,areas:Readonly<Record<string,DesignTimeline>>,defs:ReadonlyMap<number,DesignItemGeometry>):DesignTimeline|null{
 const old=currentDesign(t),added:DesignPlacement[]=[],seen=new Set(old.map(p=>[p.itemId,p.x,p.y,p.orientation].join(':')));
 let id=t.nextId;
 for(const g of f.grids){
  const source=areas[g.key];if(!source)continue;
  const offset=mainlandFrameOffset(f,g);
  for(const p of currentDesign(source)){
   const next={...p,id,x:p.x+offset.x,y:p.y+offset.y};
   const shape=defs.get(p.itemId)?.shapes[p.itemId+':'+p.orientation*4];
   if(!shape||resolveMainlandDesign(f,next.x,next.y,shape)?.grid.key!==g.key||!mainlandItemsValid(f,[next],defs))return null;
   const key=[next.itemId,next.x,next.y,next.orientation].join(':');
   if(seen.has(key))continue;
   if(old.length+added.length>=DESIGN_LIMIT||!Number.isSafeInteger(id+1))return null;
   added.push(next);seen.add(key);id++;
  }
 }
 return added.length?restoreDesign(t,[...old,...added],defs,f.raster.sizeX,f.raster.sizeY):t;
}
