import {landscapeSourceEligible,landscapePlacementEligible,stockFootprintFeedback,type StockCandidate} from './save-furniture-placement.ts';
import {mainlandMapAnchor,mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
import {terrainWarnings,type TerrainRaster} from './terrain-binding.ts';
import {CARDINAL_ORIENTATIONS} from './saved-map-transform.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import type {DesignItemGeometry} from './design-layout.ts';
export interface LandscapePose{itemId:number;x:number;y:number;orientation:number}
export const landscapePoseKey=(p:LandscapePose)=>[p.itemId,p.x,p.y,p.orientation].join(':');
export function landscapeRows(value:unknown,g:MainlandGrid):LandscapePose[]{
 if(!Array.isArray(value)||value.length>2048)throw Error('LANDSCAPE_LIMIT');
 return value.map(p=>{if(!p||Object.keys(p).length!==4||!Number.isSafeInteger(p.itemId)||Math.floor(p.itemId/100000)!==402||!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)||p.x<0||p.y<0||p.x>=g.sizeX*g.factor||p.y>=g.sizeY*g.factor||!Number.isInteger(p.orientation)||p.orientation<0||p.orientation>3)throw Error('LANDSCAPE_POSE');return {itemId:p.itemId,x:p.x,y:p.y,orientation:p.orientation};});
}
export function landscapeObjectPose(p:MainlandSavedObject):LandscapePose{return {itemId:Number(p.object.itemId),x:p.object.x,y:p.object.y,orientation:CARDINAL_ORIENTATIONS.indexOf(p.object.orientation as typeof CARDINAL_ORIENTATIONS[number])};}
const counts=(rows:readonly LandscapePose[])=>{const out=new Map<string,number>();for(const p of rows){const k=landscapePoseKey(p);out.set(k,(out.get(k)??0)+1);}return out;};
const uniqueAnchors=(rows:readonly LandscapePose[])=>new Set(rows.map(p=>p.x+':'+p.y)).size===rows.length;
export function verifiedLandscape(g:MainlandGrid,objects:readonly MainlandSavedObject[],observed:unknown,free=false){
 const native=landscapeRows(observed,g),expected=counts(native),eligible=counts(objects.filter(p=>p.area===g.key&&landscapeSourceEligible(p,free)).map(landscapeObjectPose));
 const anchors=new Map<string,number>();for(const p of native){const k=p.x+':'+p.y;anchors.set(k,(anchors.get(k)??0)+1);}
 return native.filter(p=>expected.get(landscapePoseKey(p))===eligible.get(landscapePoseKey(p))&&(free||anchors.get(p.x+':'+p.y)===1));
}
export function landscapeDelta(g:MainlandGrid,objects:readonly MainlandSavedObject[],before:readonly LandscapePose[],after:readonly LandscapePose[],free=false){
 try{landscapeRows(before,g);landscapeRows(after,g);}catch{return null;}
 if(!free&&(!uniqueAnchors(before)||!uniqueAnchors(after)))return null;
 const old=counts(before),next=counts(after),removed:MainlandSavedObject[]=[],added:LandscapePose[]=[];
 for(const [key,n] of old){
  const matches=objects.filter(o=>o.area===g.key&&landscapeSourceEligible(o,free)&&landscapePoseKey(landscapeObjectPose(o))===key).sort((a,b)=>a.object.localOrdinal-b.object.localOrdinal);
  if(matches.length!==n)return null;removed.push(...matches.slice(Math.min(n,next.get(key)??0)));
 }
 const retained=new Map(old);
 for(const p of after){const k=landscapePoseKey(p),n=retained.get(k)??0;if(n>0)retained.set(k,n-1);else added.push(p);}
 return {removed,added};
}
export function reviewLandscape(g:MainlandGrid,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,objects:readonly MainlandSavedObject[],before:readonly LandscapePose[],after:readonly LandscapePose[],defs:ReadonlyMap<number,DesignItemGeometry>,free=false){
 const r=rasters.get(g.key),delta=landscapeDelta(g,objects,before,after,free);if(!r||!delta)return null;
 const {removed,added}=delta,ghosts:StockCandidate[]=[];
 const remaining=objects.filter(o=>!removed.includes(o));
 const destination={layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY};
 for(const p of added){
  const def=defs.get(p.itemId),shape=def?.shapes[p.itemId+':'+p.orientation*4];
  if(!def||!landscapePlacementEligible(def,free)||!shape||!shape.cellCount||shape.cellCount>65536||!free&&terrainWarnings({raster:r,factor:g.factor,verifiedGridOrdinals:[]},shape,p.x,p.y).length)return null;
  if(!free)for(const run of shape.runs)for(let x=0;x<run.width;x++){const a=mainlandMapAnchor(g,p.x+run.x+x+.5,p.y+run.y+.5),hits=mainlandTerrainHits(grids,rasters,a.x,a.y);if(hits.length!==1||hits[0].key!==g.key)return null;}
  const ghost:StockCandidate={area:g.key,...mainlandMapAnchor(g,p.x,p.y),factor:g.factor,shape,destination,plan:{action:'place',itemId:String(p.itemId),x:p.x,y:p.y,orientation:CARDINAL_ORIENTATIONS[p.orientation]}};
  const overlap=stockFootprintFeedback(ghost,remaining);if(!free&&(overlap.unknown||overlap.overlaps))return null;
  remaining.push({area:g.key,x:ghost.x,y:ghost.y,factor:g.factor,shape,object:{localOrdinal:1_000_000+ghosts.length,localGridOrdinal:1,itemId:String(p.itemId),x:p.x,y:p.y,orientation:CARDINAL_ORIENTATIONS[p.orientation],orientationCode:p.orientation*4,shapeKey:null,name:null,layer:'landscape',surfaceCapable:false}});
  ghosts.push(ghost);
 }
 if(removed.length+ghosts.length>2048)return null;
 return {plan:{destination,before,after,...(free?{freePlacement:true}:{})},removed,ghosts,retained:before.length-removed.length,changed:!!(removed.length+ghosts.length)};
}
export const landscapeBackupWords={ja:'景観・樹木',en:'Landscaping',fr:'Paysage',it:'Paesaggio',de:'Landschaft','es-ES':'Paisaje','zh-CN':'景观与树木','pt-BR':'Paisagem'} as const;
