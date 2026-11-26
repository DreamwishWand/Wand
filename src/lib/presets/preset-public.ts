/** Validate shareable decoration payloads using the original editor parsers and
 * trusted game catalog identities. This is not a placement/entitlement proof.
 * Native private backups and game-issued codes have different publication paths.
 * No free-text metadata, unknown fields or local Save identifiers are exported. */
import {presetHeader} from './preset-session-format.ts';
import {PRESET_MAX_BYTES} from './preset-file.ts';
import {parseSceneAnyFactor} from '../world/scene-preset.ts';
import {parseMixedScene,parseSupportScene,type SupportScene} from '../world/support-scene.ts';
import {parseAreaScene} from '../world/area-scene.ts';
import {parseDesign,serializeDesign,type DesignPlacement} from '../world/design-layout.ts';
import {parseWholeArea,wholeAreaKind,type WholeAreaKind} from '../world/whole-area-preset.ts';
import {parseBiomeNetwork} from '../world/biome-network-preset.ts';
import {parseBiomeDecoration} from '../world/biome-decoration-preset.ts';
import {parseIslandDecoration} from '../world/island-decoration-preset.ts';
import {parseIslandDesign,islandPresetGrids} from '../world/island-design-preset.ts';
import {parseRegionDecoration} from '../world/region-decoration-backup.ts';
import {parseRoomProject} from '../world/room-project-design.ts';
import {roomDesignTemplates,supportDesignTemplate} from '../world/room-design.ts';
import {readRoomFinish,roomFinishKind} from '../world/room-finish-design.ts';
import {parsePublicTerrainRelease,sameTerrainGrid,type PublicTerrainGridRef,type PublicTerrainRelease} from '../world/public-terrain-projection.ts';
import {bindMainland,bindMainlandGrid,bindFloatingIslandGrid,type MainlandGrid} from '../world/mainland-world-coordinates.ts';
import {supportTerrainRow,type SupportTree} from '../world/subgrid-local.ts';

type Catalog={release:PublicTerrainRelease;rooms:ReturnType<typeof roomDesignTemplates>;support:unknown};
export function createPresetShareCatalog(index:unknown,rooms:unknown,support:unknown):Catalog{
 return {release:parsePublicTerrainRelease(index),rooms:roomDesignTemplates(rooms),support};
}
const fail=():never=>{throw Error('PRESET_SHARE_INVALID');};
const rec=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function keys(v:unknown,required:string[],optional:string[]=[]){
 if(!rec(v)||required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k)))fail();
}
const same=(a:unknown,b:unknown):boolean=>{
 if(a===b)return true;
 if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>same(v,b[i]));
 if(rec(a)&&rec(b))return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
 return false;
};
const positive=(n:unknown,max=0xffffffff):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=max;
export function validateShareablePreset(raw:string,catalog:Catalog):string{
 if(new Blob([raw]).size>PRESET_MAX_BYTES)fail();
 const header=presetHeader(raw);if(header.domain!=='wand'||header.privateBackup)throw Error('PRESET_PRIVATE_OR_NATIVE');
 const doc=JSON.parse(raw),all=catalog.release.entries.flatMap(e=>e.grids);
 let total=0;
 function count(n:number){total+=n;if(total>200000)fail();}
 function support(scene:SupportScene){
  function tree(t:SupportTree){
   if(!t.sourcePath)fail();
   const raster=supportTerrainRow(catalog.support,t.sourcePath!);if(!raster)fail();
   count(t.objects.length);
   for(const p of t.objects){if(p.x<0||p.y<0||p.x>=raster!.sizeX*t.factor||p.y>=raster!.sizeY*t.factor)fail();if(p.child)tree(p.child);}
  }tree(scene.tree);
 }
 function grid(v:any):PublicTerrainGridRef{
  keys(v,['key','layoutId','gridDataPath','gridIdNative','sizeX','sizeY','factor']);
  let g=all.find(g=>sameTerrainGrid(g,v))??catalog.rooms.find(t=>sameTerrainGrid(t.grid,v))?.grid;
  if(!g&&typeof v.key==='string'&&v.key.startsWith('room-design:support:')){
   const owner=Number(v.key.split(':')[2]);if(positive(owner)&&typeof v.gridDataPath==='string'&&(v.factor===1||v.factor===2)){
    const t=supportDesignTemplate(catalog.support,owner,v.gridDataPath,'Support',v.factor);if(t&&sameTerrainGrid(t.grid,v))g=t.grid;
   }
  }return g??fail();
 }
 function areaGrid(v:any):MainlandGrid{const g=grid(v);return bindMainlandGrid(g)??bindFloatingIslandGrid(g)??fail();}
 function design(d:any,expected?:PublicTerrainGridRef){
  keys(d,['schema','grid','placements'],['roomFinish']);if(d.schema!=='wand.world-design@1')fail();
  const g=grid(d.grid);if(expected&&!sameTerrainGrid(g,expected))fail();
  const rows=parseDesign(JSON.stringify(d),g),finish=readRoomFinish(d,roomFinishKind(g));
  const canonical=JSON.parse(serializeDesign({snapshots:[rows],cursor:0,nextId:1},g));if(finish!==undefined)canonical.roomFinish=finish;
  if(!same(canonical,d))fail();
  count(rows.length);for(const p of rows)if(p.attachment)support(p.attachment.scene);
  return rows;
 }
 function whole(d:any,expected?:PublicTerrainGridRef,kind?:WholeAreaKind){
  keys(d,['schema','gameVersion','kind','design']);const g=grid(d.design?.grid);
  if(expected&&!sameTerrainGrid(expected,g)||kind&&kind!==d.kind)fail();
  if(d.kind==='world-grid'?!bindMainlandGrid(g):d.kind==='floating-island'?!bindFloatingIslandGrid(g):wholeAreaKind(g,all)!=='biome')fail();
  parseWholeArea(JSON.stringify(d),g,d.kind);design(d.design,g);return g;
 }
 function network(d:any,g:MainlandGrid){
  keys(d,['schema','gameVersion','grid','rows']);if(!sameTerrainGrid(grid(d.grid),g))fail();
  const rows=parseBiomeNetwork(JSON.stringify(d),g);if(!same(rows,d.rows))fail();count(rows.length);
 }
 function decoration(d:any,g:MainlandGrid,mode:'biome'|'island'|'world'){
  keys(d,['schema','gameVersion','furniture','network'],['supports']);parseBiomeDecoration(JSON.stringify(d),g,mode==='island',mode==='world');
  whole(d.furniture,g,mode==='island'?'floating-island':mode==='world'?'world-grid':'biome');network(d.network,g);
  if(d.supports)for(const p of d.supports){keys(p,['placementId','scene']);const scene=parseSupportScene(JSON.stringify(p.scene));if(!same(scene,p.scene))fail();support(scene);}
 }
 function worldGrids(scope:unknown){const entry=catalog.release.entries.find(e=>e.scope===scope);return entry?bindMainland(entry.grids)??fail():fail();}
 function islandGrids(layout:unknown){const source=all.find(g=>g.layoutId===layout);if(!source)fail();const grids=islandPresetGrids(source!,all).map(bindFloatingIslandGrid);if(!grids.length||grids.some(g=>!g))fail();return grids as MainlandGrid[];}
 function multiarea(d:any,grids:readonly MainlandGrid[],fn:(a:any,g:MainlandGrid)=>void,identity:(a:any)=>any){
  if(!Array.isArray(d.areas)||d.areas.length!==grids.length)fail();
  const used=new Set<string>();for(const a of d.areas){const g=grid(identity(a));const match=grids.find(t=>sameTerrainGrid(t,g));if(!match||used.has(g.key))fail();used.add(g.key);fn(a,match!);}
 }
 function worldDecoration(d:any){keys(d,['schema','gameVersion','scope','areas']);const grids=worldGrids(d.scope);parseIslandDecoration(JSON.stringify(d),grids,true);multiarea(d,grids,(a,g)=>decoration(a,g,'world'),a=>a.furniture?.design?.grid);return grids;}
 function room(d:any){
  keys(d,['schema','surfaces','selected']);const project=parseRoomProject(JSON.stringify(d),catalog.rooms);
  for(let i=0;i<project.surfaces.length;i++){const s=d.surfaces[i];keys(s,['id','design']);design(s.design,project.surfaces[i].template.grid);}
 }
 switch(doc.schema){
  case 'wand.preset.scene@1':{const p=parseSceneAnyFactor(raw);if(!same(p,doc))fail();count(p.items.length);break;}
  case 'wand.preset.mixed-scene@1':{const p=parseMixedScene(raw);if(!same(p,doc))fail();count(p.items.length);for(const o of p.items)if(o.support)support(o.support);break;}
  case 'wand.preset.area-scene@1':{const p=parseAreaScene(raw);if(!same(p,doc))fail();count(p.items.length);for(const o of p.items)if(o.support)support(o.support);break;}
  case 'wand.preset.support-scene@1':{const p=parseSupportScene(raw);if(!same(p,doc))fail();count(1);support(p);break;}
  case 'wand.world-design@1':design(doc);break;
  case 'wand.preset.whole-area-design@1':whole(doc);break;
  case 'wand.preset.biome-network@1':network(doc,areaGrid(doc.grid));break;
  case 'wand.preset.biome-decoration@1':decoration(doc,areaGrid(doc.furniture?.design?.grid),'biome');break;
  case 'wand.preset.floating-island-design@1':{keys(doc,['schema','gameVersion','layoutId','areas']);const grids=islandGrids(doc.layoutId);parseIslandDesign(raw,grids);multiarea(doc,grids,(a,g)=>{design(a,g);},a=>a.grid);break;}
  case 'wand.preset.floating-island-decoration@1':{keys(doc,['schema','gameVersion','layoutId','areas']);const grids=islandGrids(doc.layoutId);parseIslandDecoration(raw,grids);multiarea(doc,grids,(a,g)=>decoration(a,g,'island'),a=>a.furniture?.design?.grid);break;}
  case 'wand.preset.world-decoration@1':worldDecoration(doc);break;
  case 'wand.preset.region-decoration@1':{keys(doc,['schema','region','world']);const grids=worldDecoration(doc.world);parseRegionDecoration(raw,grids);break;}
  case 'wand.mainland-design@1':case 'wand.world-scope-design@1':{
   const mainland=doc.schema==='wand.mainland-design@1';
   keys(doc,mainland?['schema','platform','gameVersion','areas']:['schema','platform','gameVersion','scope','areas']);
   if(doc.platform!=='Steam'||doc.gameVersion!=='1.26.2'||!mainland&&doc.scope==='Village04')fail();
   const ids=new Set<number>();multiarea(doc,worldGrids(mainland?'Village04':doc.scope),(a,g)=>{for(const p of design(a,g)){if(ids.has(p.id)||ids.size>=5000)fail();ids.add(p.id);}},a=>a.grid);break;
  }
  case 'wand.room-design@1':room(doc);break;
  case 'wand.preset.indoor-decoration@1':{
   keys(doc,['schema','gameVersion','scope','rooms']);if(doc.gameVersion!=='1.26.2'||!doc.rooms.length||doc.rooms.length>2048||doc.scope==='room'&&doc.rooms.length!==1)fail();
   let floor=0,next=1;for(const e of doc.rooms){keys(e,['floor','room','wallPositions','design']);if(!positive(e.floor,2048)||doc.scope!=='building'&&e.floor!==1||e.floor<floor)fail();if(e.floor!==floor){floor=e.floor;next=1;}if(e.room!==next++)fail();room(e.design);if(!Array.isArray(e.wallPositions)||e.wallPositions.length!==e.design.surfaces.length||e.wallPositions.some((p:unknown,i:number)=>i===0?p!==null:!Number.isSafeInteger(p)||Number(p)<0||Number(p)>32)||new Set(e.wallPositions).size!==e.wallPositions.length)fail();}
   break;
  }
  default:fail();
 }
 // JSON data only, no manifest containing author/account identity. Unknown
 // fields are rejected, not silently copied or sanitized into public content.
 return JSON.stringify(doc);
}
