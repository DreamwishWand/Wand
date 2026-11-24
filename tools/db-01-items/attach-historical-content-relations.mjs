/**
 * Offline evidence projection: verified historical introduction relations.
 * Exact typed acquisition paths and source-side DLC gates are independent
 * from live availability, account entitlement and collection visibility.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(ok,code)=>{if(!ok)throw Error('DB01_HISTORICAL_RELATIONS_'+code)};
const id=x=>Number.isSafeInteger(x)&&x>0;
const cohort='dlc.the-keepsake-sea';
const groups={
  activity_dlc_area:[54,'ActivityData'],
  activity_dlc_result:[27,'ActivityItem'],
  building_scene:[12,'Building'],
  critter_source_area:[15,'Companion'],
  dlc_stall_pool:[48,'ActivityItem'],
  dlc_stall_slot:[7,'Building'],
  memory_expansion_gate:[25,'MemoryShard'],
  memory_world_tag:[34,'MemoryShard'],
  offgrid_parent_scene:[2,'Building'],
  recipe_dlc_result:[142,null],
  recipe_fixed_dlc_ingredient:[142,'ActivityData'],
  seed_dlc_crop:[9,'ActivityItem']
};
const pins={
  'recipe-results-1.26.2.json':'ee767b8808f9bef078234d978c3893b5a9649050c7ccf8ee460bd3a32ef02f0e',
  'activity-result-paths-1.26.2.json':'97d02a35dbe78dab637f4eda7d6fdf61cf528bb77aab6f684483a5cf542eebbb',
  'native-stall-slots-1.26.2.json':'ef18e94df460d7bd5c768ebc720c48425570ac549a49ebdac00ade34e5468d2a',
  'native-loot-candidates-1.26.2.json':'fba1d8163c30156941b108ce2ba37544f32e9c7d419f4c2b1f126b017c470a00'
};
function load(project,name){
  const bytes=readFileSync(join(project,'static/acquisition/public',name));
  check(sha(bytes)===pins[name],'PROJECTION_SHA_'+name);
  return JSON.parse(bytes);
}
const inDlcArea=a=>Number.isInteger(a)&&a>=48&&a<=63;
const localActivity=p=>p?.[1]===0
  ?Array.isArray(p[4][0])&&p[4][0].length>0&&p[4][0].every(inDlcArea)
  :p?.[1]===1&&inDlcArea(p[4][0])&&(p[4][1]===null||p[4][1]===1540000209);

export function attachHistoricalContentRelations(project,source,history,fresh,add,verifiedPackages){
  const bytes=readFileSync(join(project,'data/ddv/item-master/historical-content-relations-steam-1261.json'));
  const d=JSON.parse(bytes);
  check(d.schema==='wand.db01.historical-content-relations@1'&&d.platform==='Steam'&&
    d.introducedVersion==='1.26.1'&&d.introducedSourceCorpusSha256===
      '4ccf2816de3a5f2e27e780aa1c5a954b8ed0e325ccbd7d6bb76597f0f09ad41c'&&
    d.coverage.actualAvailabilityVerified===false&&d.coverage.allContentAttributionVerified===false,
    'SOURCE');
  const current=source.target.gameVersion==='1.26.2';
  const byId=new Map(source.items.map(r=>[r.itemId,r]));
  if(current){
    check(Object.entries(d.sourceFiles).every(([k,v])=>source.sourceFilesSha256[k]===v)&&
      source.sourceFilesSha256.Condition===d.condition.afterSha256,'ORIGINAL_SHA');
    const declarations=source.sourceFieldDeclarations;
    check(declarations.MemoryShardItemData?.Conditions===16&&declarations.MemoryShardItemData?.Tags===15&&
      declarations.ConditionItemData?.Conditions===6&&
      byId.get(d.condition.id)?.nativeCategory==='Condition'&&
      byId.get(d.condition.id)?.nativeKey==='Expansions!BoughtExpansion04','CONDITION_DECLARATIONS');
  }
  // The archived Condition definition was byte-identical in 1.26.1/1.26.2.
  // Its sole positive Expansion04 predicate is referenced by a sole positive
  // common-condition leaf on each of these 25 MemoryShard records.
  check(d.condition.id===2130004933&&d.condition.expansion==='Expansion04'&&
    d.condition.operator==='and'&&d.condition.inversed===false&&
    d.condition.unchangedFrameSha256==='b6b22dcad3b789138d5d7923f9f72afb7ddfd2f030232b157ff69b80e871e62f'&&
    d.condition.conditionListSha256==='bd78e23b6b0326f6a76c8508bfd2cb047339240a0c6643a8b764f1345fcd1eb2'&&
    d.condition.memoryConditionListSha256==='ab60b119dfb13d021d9c43baa7dae3757ad9d5bb5e5d56a28d9aee046f217e9a',
    'POSITIVE_GATE');
  const raw=inflateSync(Buffer.from(d.data,'base64'),{maxOutputLength:100000});
  check(sha(raw)===d.decodedSha256&&d.decodedSha256==='b2ba6018db5289be2ad23785b341db04fa7f2f6daaea91b8bff6777f593485c9','DATA_SHA');
  const data=JSON.parse(raw);
  check(Object.keys(data).length===Object.keys(groups).length,'GROUPS');
  const recipes=load(project,'recipe-results-1.26.2.json');
  const activities=load(project,'activity-result-paths-1.26.2.json');
  const stalls=load(project,'native-stall-slots-1.26.2.json');
  const loot=load(project,'native-loot-candidates-1.26.2.json');
  check(recipes.source.sha256===d.sourceFiles.ActivityData&&
    activities.sources.activityData.sha256===d.sourceFiles.ActivityData&&
    activities.sources.activityItem.sha256===d.sourceFiles.ActivityItem&&
    stalls.sources.building.sha256===d.sourceFiles.Building&&
    stalls.sources.loot.sha256===d.sourceFiles.LootTable&&loot.source.sha256===d.sourceFiles.LootTable,'JOIN_SOURCE');
  const recipeById=new Map(recipes.recipes.map(r=>[r[0],r]));
  const activityById=new Map(activities.paths.map(r=>[r[0],r]));
  const stallById=new Map(stalls.stalls.map(r=>[r[0],r]));
  const lootById=new Map(loot.tables.map(([i,g])=>[i,new Set(g.flatMap(x=>x[1].map(x=>x[0])))]));
  const hasRecipe=new Set(data.recipe_fixed_dlc_ingredient.map(x=>x[0]));
  const hasActivity=new Set(data.activity_dlc_area.map(x=>x[0]));
  const memoryTags=new Set(data.memory_world_tag.map(x=>x[0]));
  const hasStall=new Set(data.dlc_stall_slot.map(x=>x[0]));
  const evidenceIds=new Set(),memory=new Set();
  const exactStall=i=>hasStall.has(i)&&stallById.get(i)?.[1].startsWith('Expansion04!');
  for(const [kind,[count,category]] of Object.entries(groups)){
    const entries=data[kind];
    check(Array.isArray(entries)&&entries.length===count&&d.groups[kind]===count,'COUNT_'+kind);
    let last=0;
    for(const [i,refs] of entries){
      check(id(i)&&i>last&&Array.isArray(refs)&&refs.length>0&&refs.every((v,j)=>id(v)&&(j===0||refs[j-1]<v)),'ROW_'+kind);
      last=i;
      evidenceIds.add(i);
      if(current)check(fresh(history.get(i))&&(!category||byId.get(i)?.nativeCategory===category),'OWNER_'+kind);
      for(const ref of refs){
        let valid=false;
        switch(kind){
          case 'activity_dlc_area':valid=ref===i&&localActivity(activityById.get(i));break;
          case 'activity_dlc_result':valid=hasActivity.has(ref)&&localActivity(activityById.get(ref))&&activityById.get(ref)?.[2]===i;break;
          case 'recipe_fixed_dlc_ingredient':valid=recipeById.get(i)?.[4].some(x=>x[0]===0&&x[1]===ref);break;
          case 'recipe_dlc_result':valid=hasRecipe.has(ref)&&recipeById.get(ref)?.[2]===i;break;
          case 'seed_dlc_crop':valid=activityById.get(i)?.[1]===3&&activityById.get(i)?.[2]===ref;break;
          case 'dlc_stall_slot':valid=ref===i&&exactStall(i);break;
          case 'dlc_stall_pool':valid=exactStall(ref)&&stallById.get(ref)[3].some(t=>lootById.get(t)?.has(i));break;
          case 'memory_world_tag':valid=ref===2001200066;break;
          case 'memory_expansion_gate':
            valid=ref===d.condition.id&&memoryTags.has(i);
            if(valid)memory.add(i);
            break;
          case 'critter_source_area':valid=Math.floor(i/100000)===1201&&inDlcArea(ref);break;
          case 'building_scene':valid=ref===1540000209;break;
          case 'offgrid_parent_scene':valid=ref===1540000209&&Math.floor(i/100000)===204;break;
        }
        check(valid,'REFERENCE_'+kind+'_'+i);
        if(fresh(history.get(i)))add(i,kind==='offgrid_parent_scene'?'offgrid_scene_reference':kind,ref,cohort);
      }
    }
  }
  check(evidenceIds.size===447&&memory.size===25,'EVIDENCE_CENSUS');

  // Strong, individual source attribution: a positive, sole DLC purchase
  // predicate (memory) or direct reward in an explicitly associated DLC
  // purchase package (IAP). Other relations remain candidates. A configured
  // reward does not prove grant, ownership, availability or exact launch date.
  const verified=new Map();
  for(const i of memory)if(fresh(history.get(i)))verified.set(i,'verified_dlc_condition');
  for(const i of verifiedPackages)if(fresh(history.get(i)))verified.set(i,'verified_dlc_package');
  if(current)check(verified.size===29,'VERIFIED_CENSUS');
  const assignmentSha=sha(Buffer.from(JSON.stringify([...verified].sort((a,b)=>a[0]-b[0]))));
  for(const [i,kind] of verified){
    const h=history.get(i);
    h.contentAttributionEvidenceKind=kind;
    // Do not silently overwrite an independently reviewed assignment.
    if(h.contentReleaseId!==null&&h.contentReleaseId!==cohort){
      h.contentOriginConflict=true;
      continue;
    }
    if(h.contentReleaseId===null){
      h.contentReleaseId=cohort;
      h.contentReleaseKind='paid_dlc';
      h.contentDlcType='expansion';
      h.contentReleaseEvidenceSha256=sha(bytes);
      h.contentAssignmentSha256=assignmentSha;
    }
  }
  return {evidenceIds,verified};
}
