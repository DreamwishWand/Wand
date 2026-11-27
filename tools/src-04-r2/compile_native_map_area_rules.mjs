// Private offline compiler: original graph + verified encoded image bindings.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {buildNativeMaskedPreview} from '../../src/lib/media/native-map-draw-plan.ts';
import {computeNativeCanvasAlpha} from '../../src/lib/media/native-map-canvas-alpha.ts';
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const key=r=>r.cab.toLowerCase()+'/'+r.pathID;
const clean=l=>({kind:l.kind,unitQuadToCanvas:l.unitQuadToCanvas,rgba:l.rgba,...(l.kind==='fill'?{}:{imageSha256:l.imageSha256,size:l.size,wrap:l.wrap,colorSpace:l.colorSpace}),...(l.mask?{mask:l.mask.kind==='rect'?{kind:'rect',overlayToMaskUv:l.mask.overlayToMaskUv}:{kind:'alpha',overlayToMaskUv:l.mask.overlayToMaskUv,image:clean(l.mask.image)}}:{})});
export function compileAreaRules(raw,geometry,binding,locks,settings,extras,lossless,manifest){
 check(raw.prefabSha256===geometry.sources.prefabSha256&&raw.prefabSha256===binding.sources.prefabSha256&&raw.prefabSha256===locks.prefabSha256,'Source mismatch');
 check(manifest.schema==='wand.media.native-cdn-preview@1'&&manifest.gameVersion==='1.26.2'&&manifest.privateOnly===true&&manifest.publicationAuthorized===false&&manifest.worldPlacementVerified===false&&manifest.cdnVerified===true&&manifest.sourcePixelsVerified===true,'Private verified manifest required');
 check([geometry,binding,locks,settings,lossless].every(d=>d.privateOnly===true&&d.publicationAuthorized===false),'Private source required');
 const refs=new Map();
 function add(ref,old){const v=lossless.images[old];check(v&&manifest.images[v.sha256]&&!refs.has(key(ref)),'Unverified or duplicate image binding');refs.set(key(ref),v.sha256);}
 for(const m of binding.maps)for(const l of m.layers)if(l.source)add(l.source,l.imageSha256);
 for(const r of Object.values(extras)){check(r.privateOnly===true&&r.publicationAuthorized===false&&r.roundtripVerified===true,'Unverified extra');add(r,r.imageSha256);}
 check(refs.size===118&&new Set(refs.values()).size===118,'Source image coverage');
 const out=[];
 for(const m of manifest.maps){
  const w=raw.worlds.find(w=>w.prefab===m.id),g=geometry.maps.find(g=>g.id===m.id),lock=locks.maps.find(l=>l.id===m.id);
  check(w&&g&&lock&&m.width===g.width&&m.height===g.height,'Map mismatch');
  const order=w.renderNodes.map(n=>n.rectTransform),byNode=new Map(w.renderNodes.map(n=>[n.rectTransform,n]));
  const back=g.layers.map(l=>({...l,...(l.source?{imageSha256:refs.get(key(l.source))}:{})}));
  const areaTypes=[...new Set(lock.areas.map(a=>a.areaType))].sort((a,b)=>a-b),all=new Map(areaTypes.map(a=>[a,true]));
  const visibleNodes=order.filter(id=>back.some(l=>l.node===id)||lock.overlays.some(l=>l.node===id&&l.mode==='area-lock'));
  const groupAt=new Map(lock.canvasGroups.map(g=>[g.node,g.pathID]));
  const groupDeps=new Map();
  for(const a of lock.areas)if(a.enabled){for(const ref of [a.mode==='canvas-group'?a.canvasGroup:null,a.areaNameCanvasGroup])if(ref){const ids=groupDeps.get(ref.pathID)??new Set();ids.add(a.areaType);groupDeps.set(ref.pathID,ids);}}
  const dependencies=visibleNodes.map(id=>{
   const b=back.find(l=>l.node===id),o=lock.overlays.find(l=>l.node===id&&l.mode==='area-lock');
   const deps=new Set(b?.blockerAreaTypes??[]);if(o)deps.add(o.areaType);
   for(let n=id;n!=='0';n=byNode.get(n).parent){check(byNode.has(n),'Unknown node');for(const a of groupDeps.get(groupAt.get(n))??[])deps.add(a);}
   return [...deps].sort((a,b)=>a-b);
  });
  function plan(states){
   const alpha=computeNativeCanvasAlpha(w.renderNodes,lock.canvasGroups,lock.areas,raw.prefabCab,settings.menus[0].settings,states);
   const layers=buildNativeMaskedPreview(back,lock.overlays,order,g.rootToCanvas,states,r=>refs.get(key(r)),alpha).layers.map(clean);
   const ids=visibleNodes.filter(id=>{const b=back.find(l=>l.node===id),o=lock.overlays.find(l=>l.node===id&&l.mode==='area-lock');return b?b.blockerAreaTypes.every(a=>states.get(a)):states.get(o.areaType);});
   check(ids.length===layers.length,'Draw order mismatch');return new Map(ids.map((id,i)=>[id,layers[i]]));
  }
  const locked=plan(all),unlocked=plan(new Map(areaTypes.map(a=>[a,false])));
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  check(same([...locked.values()],m.locked.map(clean))&&same([...unlocked.values()],m.unlocked.map(clean)),'Existing verified endpoint mismatch: '+m.id);
  const rules=visibleNodes.map((id,i)=>{
   const deps=dependencies[i];check(deps.length<=8,'Too many dependent areas');const base=locked.get(id),variants=[];
   for(let bits=0;bits<2**deps.length;bits++){
    const states=new Map(all);deps.forEach((a,j)=>states.set(a,!!(bits&(1<<j))));const l=plan(states).get(id);
    if(!l){variants.push(null);continue;}
    check(same({...l,rgba:base.rgba},base)&&l.rgba.slice(0,3).every((v,j)=>v===base.rgba[j]),'State changes image or geometry');variants.push(l.rgba[3]);
   }
   return {areas:deps,alpha:variants};
  });
  // Exhaustively compare each possible state, with actual original graph evaluation.
  check(areaTypes.length<=16,'Too many source areas');let checked=0;
  for(let bits=0;bits<2**areaTypes.length;bits++){
   const states=new Map(areaTypes.map((a,j)=>[a,!!(bits&(1<<j))]));const expected=[...plan(states).values()];
   const actual=rules.flatMap((r,i)=>{const index=r.areas.reduce((n,a,j)=>n+(states.get(a)?1<<j:0),0),alpha=r.alpha[index],base=m.locked[i];return alpha===null?[]:[{...clean(base),rgba:[...base.rgba.slice(0,3),alpha]}];});
   check(same(actual,expected),'Mixed state mismatch: '+m.id+' '+bits);checked++;
  }
  out.push({...m,areaTypes,areaRules:rules});console.log(m.id,areaTypes.length,'areas',checked,'states');
 }
 return {...manifest,maps:out,schema:'wand.media.native-cdn-area-preview@1',runtimeVisibilityVerified:false};
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 const [g,geom,b,lock,alpha,extra,lossless,manifest,out]=process.argv.slice(2);check(out,'Usage: GRAPH GEOMETRY BINDING LOCKS ALPHA EXTRA_REFS LOSSLESS MANIFEST PRIVATE_OUT');
 for(let p=dirname(resolve(out));;p=dirname(p)){check(!existsSync(join(p,'.git')),'Private output outside Git required');if(dirname(p)===p)break;}
 writeFileSync(out,JSON.stringify(compileAreaRules(...[g,geom,b,lock,alpha,extra,lossless,manifest].map(read))),{flag:'wx'});
}
