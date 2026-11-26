import {presetHeader} from './preset-session-format.ts';
import {parseSupportScene,supportSceneCounts,parseMixedScene,mixedSceneCounts,supportSceneRootCounts} from '../world/support-scene.ts';
import {parseAreaScene,areaSceneCounts} from '../world/area-scene.ts';
import {parseSceneAnyFactor,sceneItemCounts} from '../world/scene-preset.ts';
/** Structural item counts only. Does not authorize placement, restore, publication
 * or entitlement. Known nested support trees count once; no recursive scan of
 * arbitrary private payload fields. */
export function presetItems(raw:string):Map<number,number>|null{
 try{
  const header=presetHeader(raw),v=JSON.parse(raw),counts=new Map<number,number>();let total=0;
  const add=(id:number,n=1)=>{if(!Number.isSafeInteger(id)||id<1||id>0xffffffff||!Number.isSafeInteger(n)||n<1||(total+=n)>200000)throw Error('COUNT');counts.set(id,(counts.get(id)??0)+n);};
  const merge=(m:ReadonlyMap<number,number>)=>{for(const [id,n] of m)add(id,n);};
  const support=(s:unknown,root=false)=>{const scene=parseSupportScene(JSON.stringify(s));merge(root?supportSceneRootCounts(scene):supportSceneCounts(scene.tree));};
  function walk(d:any,depth=0):void{
   if(!d||depth>8)throw Error('SHAPE');
   switch(d.schema){
    case 'wand.preset.scene@1':merge(sceneItemCounts(parseSceneAnyFactor(JSON.stringify(d)).items));return;
    case 'wand.preset.mixed-scene@1':merge(mixedSceneCounts(parseMixedScene(JSON.stringify(d)).items));return;
    case 'wand.preset.area-scene@1':{const a=parseAreaScene(JSON.stringify(d));merge(areaSceneCounts(a.items));for(const p of a.items)if(p.network)add(p.itemId);return;}
    case 'wand.preset.support-scene@1':support(d,true);return;
    case 'wand.world-design@1':if(!Array.isArray(d.placements))throw Error('PLACEMENTS');for(const p of d.placements){add(p.itemId);if(p.attachment)support(p.attachment.scene);}if(d.roomFinish)add(d.roomFinish);return;
    case 'wand.preset.whole-area-design@1':walk(d.design,depth+1);return;
    case 'wand.preset.biome-network@1':if(!Array.isArray(d.rows))throw Error('NETWORK');for(const p of d.rows)add(p.itemId);return;
    case 'wand.preset.biome-decoration@1':case 'wand.preset.world-grid-decoration@1':case 'wand.preset.island-grid-decoration@1':walk(d.furniture,depth+1);walk(d.network,depth+1);if(d.supports){if(!Array.isArray(d.supports))throw Error('SUPPORT');for(const p of d.supports)support(p.scene);}return;
    case 'wand.preset.world-decoration@1':case 'wand.preset.floating-island-decoration@1':case 'wand.preset.floating-island-design@1':case 'wand.mainland-design@1':case 'wand.world-scope-design@1':if(!Array.isArray(d.areas))throw Error('AREAS');for(const a of d.areas)walk(a,depth+1);return;
    case 'wand.preset.region-decoration@1':walk(d.world,depth+1);return;
    case 'wand.room-design@1':if(!Array.isArray(d.surfaces))throw Error('ROOM');for(const s of d.surfaces)walk(s.design,depth+1);return;
    case 'wand.preset.indoor-decoration@1':if(!Array.isArray(d.rooms))throw Error('INDOOR');for(const e of d.rooms)walk(e.design,depth+1);return;
    default:throw Error('TYPE');
   }
  }
  if(header.domain==='tom'){add(v.baseItemId);return counts;}
  if(header.domain!=='wand')return null;
  walk(v);return counts;
 }catch{return null;}
}
