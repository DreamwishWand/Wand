import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import {mainlandMapAnchor,type MainlandGrid} from './mainland-world-coordinates.ts';
import {networkRows,type NetworkPose} from './biome-network-preset.ts';
import {fenceFamily} from './fence-family-catalog.ts';
import type {MapExtent} from './map-camera.ts';
export interface NetworkMapReceipt {key:string;rows:unknown}
export interface NetworkMapEdge {key:string;base:number;x1:number;y1:number;x2:number;y2:number}
export interface NetworkMapPart {style:number;diagonal:boolean;kind:'road'|'fence'}
const anchor=(x:number,y:number)=>x+':'+y;
const pose=(id:number,x:number,y:number,o:number)=>id+':'+x+':'+y+':'+o;
export function networkMapColor(id:number,kind:'road'|'fence'){
 // Schematic identifiers only, never claims about the actual material color.
 const colors=kind==='road'?['#a89775','#929f8f','#a7a9b8','#bc9a86','#91aeb1','#b3aa82','#ab98b5','#b1a49a']:['#e4c48e','#d5e3ca','#e6b6ae','#b9d3e8','#d6c3ed','#e7dba0','#b9e0dd','#e8c7d9'];
 return colors[((id^(id>>>8))>>>0)%colors.length];
}
export function buildNetworkMap(grids:readonly MainlandGrid[],objects:readonly MainlandSavedObject[],receipts:readonly NetworkMapReceipt[]){
 const parts=new Map<number,NetworkMapPart>(),edges:NetworkMapEdge[]=[];
 const byArea=new Map<string,MainlandSavedObject[]>();
 for(const p of objects)if(p.object.layer==='ground'||p.object.layer==='fence'){const a=byArea.get(p.area)??[];a.push(p);byArea.set(p.area,a);}
 for(const g of grids){
  const matching=receipts.filter(r=>r.key===g.key);if(matching.length!==1)continue;
  let rows:NetworkPose[];try{rows=networkRows(matching[0].rows,g);}catch{continue;}
  const old=byArea.get(g.key)??[],index=new Map<string,MainlandSavedObject>();
  let valid=old.length===rows.length&&new Set(old.map(p=>p.object.localGridOrdinal)).size<=1;
  for(const p of old){
   if(!p.shape||p.object.subgrid||p.object.orientationCode===null||p.factor!==g.factor){valid=false;break;}
   const key=pose(Number(p.object.itemId),p.object.x,p.object.y,p.object.orientationCode/4);
   if(index.has(key)){valid=false;break;}index.set(key,p);
  }
  if(!valid)continue;
  const groups=new Map<string,NetworkPose[]>();
  const local=new Map<number,NetworkMapPart>();
  for(const r of rows){
   const p=index.get(pose(r.itemId,r.x,r.y,r.orientation));
   if(!p||p.object.layer!==(r.network.kind==='road'?'ground':'fence')){valid=false;break;}
   const style=r.network.kind==='road'?r.itemId:r.network.base;
   local.set(p.object.localOrdinal,{style,diagonal:r.network.diagonal,kind:r.network.kind});
   if(r.network.kind==='fence'){const key=style+':'+r.network.diagonal,a=groups.get(key)??[];a.push(r);groups.set(key,a);}
  }
  if(!valid)continue;
  for(const [id,part] of local)parts.set(id,part);
  for(const group of groups.values()){
   const first=group[0].network;if(first.kind!=='fence')continue;
   const family=fenceFamily(first.base);if(!family)continue;
   const q=g.factor,posts=new Set(group.filter(r=>r.itemId===first.base).map(r=>anchor(r.x,r.y)));
   const occupied=new Set(posts),groupEdges:NetworkMapEdge[]=[],seen=new Set<string>();let validGroup=true;
   function add(ax:number,ay:number,bx:number,by:number){
    const k=anchor(ax,ay)+'>'+anchor(bx,by);if(seen.has(k))return;seen.add(k);
    const a=mainlandMapAnchor(g,ax+q/2,ay+q/2),b=mainlandMapAnchor(g,bx+q/2,by+q/2);
    groupEdges.push({key:g.key+':'+first.base+':'+first.diagonal+':'+k,base:first.base,x1:a.x,y1:a.y,x2:b.x,y2:b.y});
   }
   // Same endpoint convention as ddv-save-patch fence_topology::part_endpoints.
   for(const r of group){if(r.itemId===first.base)continue;
    const k=(first.diagonal?family.diagExt:family.ext).indexOf(r.itemId)+1,left=r.orientation===3;
    if(k<1){validGroup=false;break;}
    const ax=r.x-(left&&!first.diagonal?0:q),ay=r.y+(first.diagonal&&left?k*q:left||first.diagonal?-q:0);
    const dx=left&&!first.diagonal?0:q,dy=first.diagonal?(left?-q:q):left?q:0;
    const bx=ax+dx*(k+1),by=ay+dy*(k+1);
    if(!posts.has(anchor(ax,ay))||!posts.has(anchor(bx,by))){validGroup=false;break;}
    for(let n=1;n<=k;n++){const cell=anchor(ax+dx*n,ay+dy*n);if(occupied.has(cell)){validGroup=false;break;}occupied.add(cell);}
    if(!validGroup)break;add(ax,ay,bx,by);
   }
   if(!validGroup)continue;
   for(const r of group)if(r.itemId===first.base)for(const [dx,dy] of first.diagonal?[[q,q],[q,-q]]:[[q,0],[0,q]])if(posts.has(anchor(r.x+dx,r.y+dy)))add(r.x,r.y,r.x+dx,r.y+dy);
   edges.push(...groupEdges);
  }
 }
 return {parts,edges};
}
export function visibleNetworkEdges(edges:readonly NetworkMapEdge[],v:MapExtent){
 return edges.filter(e=>Math.max(e.x1,e.x2)>=v.x&&Math.min(e.x1,e.x2)<=v.x+v.w&&Math.max(e.y1,e.y2)>=v.y&&Math.min(e.y1,e.y2)<=v.y+v.h);
}
