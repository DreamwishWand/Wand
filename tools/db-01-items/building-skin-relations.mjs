/** Build-only, SHA-pinned building skin selectors and browse associations.
 * A skin's target is not its design universe. Keep both independently.
 */
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

const check=(ok,code)=>{if(!ok)throw Error('DB01_BUILDING_SKIN_'+code)};
const classes={1:'StallSkinItemData',2:'BuildingOtherSkinItemData',6:'HouseSkinItemData'};
// Individual, reviewed native keys with an explicit franchise motif. No
// substring heuristic and no inference from the employee of the target.
const motifs=new Map([
  ['Goofy!LionKingInspiredGoofyStall01',2000500010],
  ['Goofy!MoanaGoofyStall01',2000500003],
  ['Goofy!TangledInspiredGoofyStall',2000500008],
  ['Goofy!CocoInspiredGoofyStall',2000500027],
  ['Goofy!LadyAndTheTrampGoofyStall',2000500058],
  ['Goofy!ToyStoryStall',2000500006],
  ['Goofy!PocahontasStall',2000500053],
  ['Well!AladdinInspiredWellSkin',2000500048],
  ['Well!AliceInspiredWellSkin',2000500032],
  ['Well!NeverlandWishingWellSkin',2000500060],
  ['Well!InsideOutWishingWellSkin',2000500045],
  ['Well!CocoInspiredWishingWell',2000500027],
  ['Well!LadyAndTheTrampWishingWell',2000500058],
  ['Well!PocahontasWell',2000500053],
  ['Well!ToyStoryWell',2000500006]
]);
const uniq=a=>[...new Set(a)].sort((a,b)=>a-b);
export function loadBuildingSkinRelations(project,source,byId){
  const version=source.target.gameVersion;
  check(/^\d+\.\d+\.\d+$/.test(version),'VERSION');
  const root=join(project,'data/ddv/item-master');
  const path=[join(root,'building-skin-relations-steam-'+version+'.json'),
    join(root,'building-skin-relations-steam-1.26.2.json')].find(p=>existsSync(p));
  const result=new Map();
  if(!path)return result;
  const d=JSON.parse(readFileSync(path,'utf8'));
  check(d.schema==='wand.db01.building-skin-relations@1'&&d.target.platform==='Steam'&&
    Object.keys(d.sourceFiles).length===4,'SCHEMA');
  if(!['Building','Skin','Character','Tag'].every(k=>d.sourceFiles[k]===source.sourceFilesSha256[k])||
      d.sourceIl2cppDumpSha256!==source.sourceIl2cppDumpSha256){
    check(d.target.gameVersion!==version,'SOURCE_SHA');
    return result;
  }
  const declarations=source.sourceFieldDeclarations;
  // Cross-check the original field declarations already in the canonical archive.
  check(declarations.StallSkinItemData?.AllStallsWithEmployeeItems===19&&
    declarations.StallSkinItemData?.StallItemsIDs===20&&declarations.StallSkinItemData?.StallEmployeeItemsIDs===21&&
    declarations.BuildingOtherSkinItemData?.OtherItemsIDs===6&&
    declarations.BuildingOtherSkinItemData?.AllWellsItemsExcept===19&&
    declarations.BuildingOtherSkinItemData?.ExceptItemsIDs===20&&
    declarations.HouseSkinItemData?.HouseItemID===6,'FIELD_CONTRACT');
  const all=[...byId.values()].filter(r=>r.nativeCategory==='Skin'&&Object.hasOwn(classes,r.itemType.subtypeCode));
  check(d.rows.length===all.length,'CENSUS');
  const counts={};
  let prior=0;
  for(const raw of d.rows){
    const [i,targets,secondary,flag]=raw;
    const row=byId.get(i),type=row?.itemType.subtypeCode,cls=classes[type];
    check(Number.isSafeInteger(i)&&i>prior&&row?.nativeCategory==='Skin'&&cls===row.sourceClass&&
      Array.isArray(targets)&&targets.every(id=>byId.get(id)?.nativeCategory==='Building'),'ROW_'+i);
    prior=i;
    counts[cls]=(counts[cls]??0)+1;
    const relation={targetBuildingItemIds:targets};
    if(type===6){
      check(raw.length===2&&targets.length===1&&byId.get(targets[0]).itemType.subtypeCode===0,'HOUSE_TARGET');
    }else{
      check(raw.length===4&&Array.isArray(secondary)&&Array.isArray(flag)&&flag.length<=1&&flag.every(x=>x===0||x===1),'SELECTOR');
      if(type===1){
        check(targets.every(id=>byId.get(id).itemType.subtypeCode===1)&&secondary.every(id=>byId.get(id)?.nativeCategory==='Character'),'STALL_TARGET');
        Object.assign(relation,{allStallsWithEmployeeItems:flag.length?Boolean(flag[0]):null,employeeCharacterItemIds:secondary});
      }else{
        check(secondary.every(id=>byId.get(id)?.nativeCategory==='Building'),'EXCEPT_TARGET');
        Object.assign(relation,{allWellsItemsExcept:flag.length?Boolean(flag[0]):null,excludedBuildingItemIds:secondary});
      }
    }
    const parentTags=uniq(targets.flatMap(id=>byId.get(id).universeTagIds));
    let candidate=null;
    if(type===6&&parentTags.length===1){
      candidate={kind:'house_skin_base_building_association',buildingItemId:targets[0],universeTagId:parentTags[0]};
    }else if(motifs.has(row.nativeKey)){
      candidate={kind:'reviewed_skin_design_motif',nativeKey:row.nativeKey,universeTagId:motifs.get(row.nativeKey)};
    }
    if(candidate)check(byId.get(candidate.universeTagId)?.nativeCategory==='Tag'&&
      candidate.universeTagId>=2000500000&&candidate.universeTagId<2000600000,'UNIVERSE_TARGET');
    result.set(i,{relation,relatedBuildingUniverseTagIds:parentTags,candidate,applied:!!candidate&&!row.universeTagIds.length});
  }
  check(Object.keys(counts).length===Object.keys(d.coverage).length&&Object.entries(counts).every(([k,v])=>d.coverage[k]===v),'SUBTYPE_CENSUS');
  if(version==='1.26.2')check(result.size===59&&[...result.values()].filter(r=>r.candidate?.kind==='house_skin_base_building_association').length===12&&
    [...result.values()].filter(r=>r.candidate?.kind==='reviewed_skin_design_motif').length===15,'REVIEWED_CENSUS');
  console.log('DB01_BUILDING_SKIN_UNIVERSE '+JSON.stringify({relations:result.size,
    candidates:[...result.values()].filter(r=>r.candidate).length,
    applied:[...result.values()].filter(r=>r.applied).length}));
  return result;
}
