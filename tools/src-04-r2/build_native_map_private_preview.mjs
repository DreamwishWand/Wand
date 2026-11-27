// Private offline plan from the original extracted graphs and the existing image ledger.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {buildNativeMaskedPreview} from '../../src/lib/media/native-map-draw-plan.ts';
import {computeNativeCanvasAlpha} from '../../src/lib/media/native-map-canvas-alpha.ts';
const [graphPath,geometryPath,bindingPath,lockPath,alphaPath,hiresReceipt,lowresReceipt,outPath]=process.argv.slice(2);
if(!outPath)throw Error('Usage: node --experimental-strip-types build_native_map_private_preview.mjs GRAPH GEOMETRY BINDING LOCK_GRAPH ALPHA_SETTINGS HIRES_RECEIPT LOWRES_RECEIPT OUT');
const out=resolve(outPath);
for(let p=dirname(out);;p=dirname(p)){if(existsSync(join(p,'.git')))throw Error('Private output outside Git required');if(dirname(p)===p)break;}
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const raw=read(graphPath),geometry=read(geometryPath),binding=read(bindingPath),locks=read(lockPath),settings=read(alphaPath);
const require=(ok,msg)=>{if(!ok)throw Error(msg)};
require(raw.renderGraphSchema==='wand.src04.native-map-render-graph@1'&&raw.worldPlacementVerified===false,'Unexpected raw graph');
require(geometry.schema==='wand.src04.native-map-geometry-candidate@1'&&binding.schema==='wand.src04.native-map-image-candidate@1'&&locks.schema==='wand.src04.native-map-lock-graph@1'&&settings.schema==='wand.src04.native-map-alpha-settings@1','Unexpected schema');
require([geometry,binding,locks,settings].every(x=>x.privateOnly===true&&x.publicationAuthorized===false),'Private candidates required');
require(geometry.sources.prefabSha256===raw.prefabSha256&&binding.sources.prefabSha256===raw.prefabSha256&&locks.prefabSha256===raw.prefabSha256,'Prefab source mismatch');
require(settings.menus.length===2&&JSON.stringify(settings.menus[0].settings)===JSON.stringify(settings.menus[1].settings),'Alpha settings mismatch');
const refKey=r=>r.cab.toLowerCase()+'/'+r.pathID;
const refs=new Map();
for(const m of binding.maps)for(const l of m.layers)if(l.source){
 const key=refKey(l.source);require(!refs.has(key)&&/^[a-f0-9]{64}$/.test(l.imageSha256),'Invalid old image identity');
 refs.set(key,l.imageSha256);
}
require(refs.size===116,'Unexpected existing asset count');
for(const path of [hiresReceipt,lowresReceipt]){
 const r=read(path);require(r.privateOnly===true&&r.publicationAuthorized===false&&r.roundtripVerified===true&&/^[a-f0-9]{64}$/.test(r.imageSha256),'Unverified additional image receipt');
 const key=refKey(r);require(!refs.has(key),'Duplicate lock image identity');refs.set(key,r.imageSha256);
}
require(refs.size===118&&new Set(refs.values()).size===118,'Unexpected image identities');
const maps=[];
for(const m of geometry.maps){
 const world=raw.worlds.find(w=>w.prefab===m.id),lock=locks.maps.find(w=>w.id===m.id),old=binding.maps.find(w=>w.id===m.id);
 require(world&&lock&&old,'Missing world');
 const back=m.layers.map(l=>{
  const prior=old.layers.find(p=>p.node===l.node);require(prior&&prior.kind===l.kind,'Missing prior image binding');
  if(l.source)require(refKey(l.source)===refKey(prior.source),'Source identity changed');
  return {...l,...(l.source?{imageSha256:prior.imageSha256}:{})};
 });
 const results={};
 for(const state of [true,false]){
  const states=new Map(lock.areas.map(a=>[a.areaType,state]));
  const alpha=computeNativeCanvasAlpha(world.renderNodes,lock.canvasGroups,lock.areas,raw.prefabCab,settings.menus[0].settings,states);
  const plan=buildNativeMaskedPreview(back,lock.overlays,world.renderNodes.map(n=>n.rectTransform),m.rootToCanvas,states,r=>refs.get(refKey(r)),alpha);
  const adjusted=back.filter(l=>l.blockerAreaTypes.every(id=>states.get(id))&&alpha.get(l.node)!==1);
  require(adjusted.length===(state?(m.id==='MapVillage04'?7:m.id==='MapVillageExpansion4'?1:0):0),'Unexpected background opacity');
  const key=state?'locked':'unlocked';results[key]={layers:plan.layers.length,masks:plan.layers.filter(l=>l.mask).length,alphaAdjustedBackground:adjusted.length};
  results[key+'Plan']=plan.layers;
 }
 maps.push({id:m.id,width:m.width,height:m.height,...results});
}
require(maps.length===10&&maps.reduce((s,m)=>s+m.locked.layers,0)===213&&maps.reduce((s,m)=>s+m.unlocked.layers,0)===119,'Unexpected draw coverage');
writeFileSync(out,JSON.stringify({privateOnly:true,publicationAuthorized:false,refs:[...refs],maps}),{flag:'wx'});
console.log('10 maps; 118 source identities; 213/119 draw candidates. Old encoded image keys are not CDN receipts.');
