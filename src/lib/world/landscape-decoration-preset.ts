import {landscapeSourceEligible,stockFootprintFeedback,type StockCandidate} from './save-furniture-placement.ts';
import {mainlandMapAnchor,mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
import {terrainWarnings,type TerrainRaster} from './terrain-binding.ts';
import {CARDINAL_ORIENTATIONS} from './saved-map-transform.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import type {DesignItemGeometry} from './design-layout.ts';
export interface LandscapePose{itemId:number;x:number;y:number;orientation:number}
export const landscapePoseKey=(p:LandscapePose)=>[p.itemId,p.x,p.y,p.orientation].join(':');
export function landscapeRows(value:unknown,g:MainlandGrid):LandscapePose[]{
 if(!Array.isArray(value)||value.length>2048)throw Error('LANDSCAPE_LIMIT');
 const anchors=new Set<string>();
 return value.map(p=>{if(!p||Object.keys(p).length!==4||!Number.isSafeInteger(p.itemId)||Math.floor(p.itemId/100000)!==402||!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)||p.x<0||p.y<0||p.x>=g.sizeX*g.factor||p.y>=g.sizeY*g.factor||!Number.isInteger(p.orientation)||p.orientation<0||p.orientation>3||anchors.has(p.x+':'+p.y))throw Error('LANDSCAPE_POSE');anchors.add(p.x+':'+p.y);return {itemId:p.itemId,x:p.x,y:p.y,orientation:p.orientation};});
}
export function landscapeObjectPose(p:MainlandSavedObject):LandscapePose{return {itemId:Number(p.object.itemId),x:p.object.x,y:p.object.y,orientation:CARDINAL_ORIENTATIONS.indexOf(p.object.orientation as typeof CARDINAL_ORIENTATIONS[number])};}
export function verifiedLandscape(g:MainlandGrid,objects:readonly MainlandSavedObject[],observed:unknown){
 const native=landscapeRows(observed,g),eligible=new Set(objects.filter(p=>p.area===g.key&&landscapeSourceEligible(p)).map(p=>landscapePoseKey(landscapeObjectPose(p))));
 return native.filter(p=>eligible.has(landscapePoseKey(p)));
}
export function reviewLandscape(g:MainlandGrid,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,objects:readonly MainlandSavedObject[],before:readonly LandscapePose[],after:readonly LandscapePose[],defs:ReadonlyMap<number,DesignItemGeometry>){
 const r=rasters.get(g.key);if(!r)return null;
 try{landscapeRows(before,g);landscapeRows(after,g);}catch{return null;}
 const old=new Set(before.map(landscapePoseKey)),next=new Set(after.map(landscapePoseKey)),removed:MainlandSavedObject[]=[],ghosts:StockCandidate[]=[];
 for(const p of before){const matches=objects.filter(o=>o.area===g.key&&landscapeSourceEligible(o)&&landscapePoseKey(landscapeObjectPose(o))===landscapePoseKey(p));if(matches.length!==1)return null;if(!next.has(landscapePoseKey(p)))removed.push(matches[0]);}
 const remaining=objects.filter(o=>!removed.includes(o));
 const destination={layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY};
 for(const p of after){if(old.has(landscapePoseKey(p)))continue;
  const def=defs.get(p.itemId),shape=def?.shapes[p.itemId+':'+p.orientation*4];
  if(!def||def.layer!=='landscape'||def.editRestrictions?.remove!=='allowedFlag'||nativeActionBlocked(def.editRestrictions,'select')||!shape||!shape.cellCount||terrainWarnings({raster:r,factor:g.factor,verifiedGridOrdinals:[]},shape,p.x,p.y).length)return null;
  for(const run of shape.runs)for(let x=0;x<run.width;x++){const a=mainlandMapAnchor(g,p.x+run.x+x+.5,p.y+run.y+.5),hits=mainlandTerrainHits(grids,rasters,a.x,a.y);if(hits.length!==1||hits[0].key!==g.key)return null;}
  const ghost:StockCandidate={area:g.key,...mainlandMapAnchor(g,p.x,p.y),factor:g.factor,shape,destination,plan:{action:'place',itemId:String(p.itemId),x:p.x,y:p.y,orientation:CARDINAL_ORIENTATIONS[p.orientation]}};
  const overlap=stockFootprintFeedback(ghost,remaining);if(overlap.unknown||overlap.overlaps)return null;
  remaining.push({area:g.key,x:ghost.x,y:ghost.y,factor:g.factor,shape,object:{localOrdinal:1_000_000+ghosts.length,localGridOrdinal:1,itemId:String(p.itemId),x:p.x,y:p.y,orientation:CARDINAL_ORIENTATIONS[p.orientation],orientationCode:p.orientation*4,shapeKey:null,name:null,layer:'landscape',surfaceCapable:false}});
  ghosts.push(ghost);
 }
 if(removed.length+ghosts.length>2048)return null;
 return {plan:{destination,before,after},removed,ghosts,retained:before.length-removed.length,changed:!!(removed.length+ghosts.length)};
}
export const landscapeBackupWords={ja:'景観・樹木',en:'Landscaping',fr:'Paysage',it:'Paesaggio',de:'Landschaft','es-ES':'Paisaje','zh-CN':'景观与树木','pt-BR':'Paisagem'} as const;
