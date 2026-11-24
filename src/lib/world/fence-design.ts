/** Local cardinal fence design graph. Each logical vertex is a Base family
 * unit, NOT a native serialized GridObject. Old catalog identities are only
 * candidates: resolve the current DB native key and footprint before use.
 * No derived Ext/DiagExt IDs are generated or exposed in the palette. */
import type {DesignItemGeometry,DesignPlacement} from './design-layout.ts';
import {nativeActionBlocked} from './native-edit-restrictions.ts';
import type {RoadPoint} from './road-design.ts';
const priorBases=new Map<number,string>([
 [40700000,'IronBricks'],[40700007,'BambooFence01'],[40700014,'BambooFence02'],
 [40700021,'ChainFence01'],[40700028,'ChainFence02'],[40700035,'DarkMountainFence'],
 [40700042,'DarkWoodFence'],[40700049,'UrbanWhiteFence'],[40700060,'AncientFence'],
 [40700067,'AtlanteanFence01'],[40700081,'IronFence01'],[40700088,'WoodenFence01'],
 [40700104,'LionKingFences01'],[40700112,'MythopiaFence01'],[40700191,'ClassicFarmFence'],
 [40700202,'ClassicFarmFenceSnow'],[40700213,'RusticLogFence'],[40700224,'RusticLogFenceSnow'],
 [40700246,'Biome2Fence'],[40700257,'BirdFeathersFence'],[40700268,'FairyLightFence'],
 [40700279,'LuxuriousWhiteFence'],[40700295,'ClassicFarmFence01'],[40700306,'HoneyLimestoneFence']
]);
const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
export function fenceBaseIdentity(id:number,nativeKey:unknown){
 const family=priorBases.get(id);
 return typeof nativeKey==='string'&&!!family&&normalize(nativeKey).includes(normalize(family))&&!/diagext|extension|(?:^|_)ext(?:_|\d|$)/i.test(nativeKey);
}
export function fenceBaseDefinition(id:number,definition:Record<string,unknown>){
 const f=definition.footprint as {sizeX?:unknown;sizeY?:unknown}|null;
 return definition.nativeType==='Furniture'&&f?.sizeX===1&&f.sizeY===1&&fenceBaseIdentity(id,definition.nativeName);
}
export function fencePitch(g:DesignItemGeometry|null|undefined,factor:number):number|null{
 if(!g||g.layer!=='fence'||!fenceBaseIdentity(g.itemId,g.name)||!(factor===1||factor===2)||nativeActionBlocked(g.editRestrictions,'select'))return null;
 const s=g.shapes[g.itemId+':8'];
 return s&&s.width===factor&&s.height===factor&&s.cellCount===factor*factor&&s.runs.length===factor&&s.runs.every((r,i)=>r.x===0&&r.y===i&&r.width===factor)?factor:null;
}
export interface FenceDesignEdge {readonly key:string;readonly from:RoadPoint;readonly to:RoadPoint;readonly a:number;readonly b:number;readonly itemId:number;readonly pitch:number}
/** Same-family adjacent cardinal vertices define the local design graph.
 * Never apply this to native Save records (Ext and diagonal state matter). */
export function fenceDesignEdges(placements:readonly DesignPlacement[],defs:ReadonlyMap<number,DesignItemGeometry>,factor:number):FenceDesignEdge[]{
 const nodes=new Map<string,DesignPlacement>(),out:FenceDesignEdge[]=[];
 const key=(itemId:number,x:number,y:number)=>itemId+':'+x+':'+y;
 for(const p of placements){const pitch=fencePitch(defs.get(p.itemId),factor);if(pitch&&p.orientation===2&&p.x%pitch===0&&p.y%pitch===0)nodes.set(key(p.itemId,p.x,p.y),p);}
 for(const a of nodes.values()){
  const pitch=fencePitch(defs.get(a.itemId),factor)!;
  for(const [dx,dy] of [[pitch,0],[0,pitch]]){
   const b=nodes.get(key(a.itemId,a.x+dx,a.y+dy));
   if(b)out.push({key:key(a.itemId,a.x,a.y)+':'+dx+':'+dy,from:{x:a.x+pitch/2,y:a.y+pitch/2},to:{x:b.x+pitch/2,y:b.y+pitch/2},a:a.id,b:b.id,itemId:a.itemId,pitch});
  }
 }
 return out;
}
export function fenceComponent(placements:readonly DesignPlacement[],defs:ReadonlyMap<number,DesignItemGeometry>,factor:number,seed:number):number[]{
 const ids=new Set<number>(),root=placements.find(p=>p.id===seed);
 if(!root||!fencePitch(defs.get(root.itemId),factor)||root.orientation!==2||root.x%factor!==0||root.y%factor!==0)return [];
 const adjacency=new Map<number,number[]>();
 for(const e of fenceDesignEdges(placements,defs,factor)){const a=adjacency.get(e.a)??[],b=adjacency.get(e.b)??[];a.push(e.b);b.push(e.a);adjacency.set(e.a,a);adjacency.set(e.b,b);}
 const queue=[seed];ids.add(seed);for(let i=0;i<queue.length;i++)for(const id of adjacency.get(queue[i])??[])if(!ids.has(id)){ids.add(id);queue.push(id);}
 return [...ids];
}
