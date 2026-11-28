import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {compileAreaRules} from './compile_native_map_area_rules.mjs';
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
const read=p=>JSON.parse(readFileSync(p,'utf8'));
export function compileGridRules(graph,geometry,binding,locks,settings,extras,lossless,manifest,witness){
 check(witness.schema==='wand.src04.native-map-grid-lock-witness@1'&&witness.privateOnly===true&&witness.publicationAuthorized===false&&witness.runtimeVisibilityVerified===false&&witness.prefabSha256===locks.prefabSha256,'Invalid source grid witness');
 const adjusted=structuredClone(locks),labels=new Map();
 for(const w of witness.maps){
  check(/^MapVillageExpansion4Underwater0[234]$/.test(w.prefab)&&!labels.has(w.prefab)&&w.entries.length===4,'Unexpected grid map');
  const map=adjusted.maps.find(m=>m.id===w.prefab),source=geometry.maps.find(m=>m.id===w.prefab);
  check(map&&source&&map.areas.length===4&&map.overlays.length===4&&source.layers.every(l=>l.blockerAreaTypes.length===0),'Unsupported grid dependencies');
  const names=new Set(),nodes=new Set(),overlays=new Set(),paths=new Set();
  const ordered=[...w.entries].sort((a,b)=>a.name.localeCompare(b.name));
  for(const [i,row] of ordered.entries()){
   const a=map.areas.find(a=>a.node===row.node),o=map.overlays.find(o=>o.node===row.overlayNode);
   check(a&&o&&a.areaType===row.areaType&&o.areaType===row.areaType&&a.overlayNode===o.node&&a.enabled&&a.mode==='overlay'&&o.mode==='area-lock'&&!a.blockers.length&&!a.areaNameCanvasGroup,'Grid binding mismatch');
   check(/^(Pirate|Candy|Kingdom)[1-4]$/.test(row.name)&&!names.has(row.name)&&!nodes.has(row.node)&&!overlays.has(row.overlayNode)&&!paths.has(row.gridDataPath),'Duplicate grid binding');
   names.add(row.name);nodes.add(row.node);overlays.add(row.overlayNode);paths.add(row.gridDataPath);
   a.areaType=i+1;o.areaType=i+1;
  }
  labels.set(w.prefab,ordered.map(row=>row.name));
 }
 check(labels.size===3,'Missing grid maps');
 const result=compileAreaRules(graph,geometry,binding,adjusted,settings,extras,lossless,manifest);
 return {...result,schema:'wand.media.native-cdn-area-preview@2',maps:result.maps.map(m=>labels.has(m.id)?{...m,gridStateLabels:labels.get(m.id)}:m)};
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 const args=process.argv.slice(2);check(args.length===10,'Usage: GRAPH GEOMETRY BINDING LOCKS ALPHA EXTRAS LOSSLESS MANIFEST GRID_WITNESS PRIVATE_OUT');
 const out=resolve(args.pop());for(let p=dirname(out);;p=dirname(p)){check(!existsSync(join(p,'.git')),'Private output outside Git required');if(dirname(p)===p)break;}
 writeFileSync(out,JSON.stringify(compileGridRules(...args.map(read))),{flag:'wx'});
}
