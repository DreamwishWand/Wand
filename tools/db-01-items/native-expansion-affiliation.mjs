/** Offline, exact source-defined expansion association and independently
 * corroborated historical reward attribution. No inferred runtime access,
 * entitlement or availability; native tags alone never confirm a release.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
const PIN='7c0e95f138735a550f2c08d9aab5a7244132005be56855512753bd7a788c6c37';
const DATA='e29b027c584a20e4724d980fa4351b9121d4c69e75e21251ebfb2f5c62187392';
const AFTER='4ccf2816de3a5f2e27e780aa1c5a954b8ed0e325ccbd7d6bb76597f0f09ad41c';
const BEFORE='2a06e746b885057f0e00dd8d4ebd809f12aae6d9318c1266515cd2cdb8789daf';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
const PROTO='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const RELEASE='dlc.the-keepsake-sea';
const TAG=2001200066;
const sha=b=>createHash('sha256').update(b).digest('hex');
const check=(v,c)=>{if(!v)throw Error('DB01_NATIVE_EXPANSION_'+c)};
const id=v=>Number.isSafeInteger(v)&&v>0;
const json=v=>JSON.stringify(v);
const expansions=[['BaseGame',2001200028,1540000000],['Expansion01',2001200029,1540000101],
  ['Expansion02',2001200030,1540000119],['Expansion03',2001200040,1540000162],
  ['Expansion04',TAG,1540000209],['WinnieDLC',2001200067,1540000210]];
const selectors=[[3,'ActivityItem',false,'Default',null],[4,'Furniture',false,'',null],
  [5,'Clothing',false,'',null],[13,'MemoryShard',false,'',null],[16,'Trimming',false,'',null],
  [12,'Companion',true,'Pet',0]];
const keyByTag=new Map(expansions.map(([name,tag])=>[tag,name]));
const compareCounts=(a,b)=>json(Object.entries(a).sort())===json(Object.entries(b).sort());
const inc=(o,k)=>o[k]=(o[k]??0)+1;
const fresh=h=>h?.introducedVersion==='1.26.1'&&h.introducedAfterVersion==='1.25.3'&&
  h.introducedSourceCorpusSha256===AFTER;
function load(project,path,pin){
  const b=readFileSync(join(project,path));
  if(pin)check(sha(b)===pin,'PIN_'+path);
  return [JSON.parse(b),sha(b)];
}
function addEvidence(h,kind,value){
  const rows=h.contentOriginEvidence??[];
  if(!rows.some(r=>r[0]===kind&&r[1]===value))h.contentOriginEvidence=[...rows,[kind,value]];
  h.contentCandidateReleaseIds=[...new Set([...(h.contentCandidateReleaseIds??[]),RELEASE])].sort();
}
export function loadNativeExpansionAffiliation(project,source,history){
  const [d]=load(project,'data/ddv/item-master/native-expansion-affiliation-steam-1261.json',PIN);
  check(d.schema==='wand.db01.native-expansion-affiliation@1'&&d.platform==='Steam'&&
    d.observationVersion==='1.26.1'&&d.currentCompatibleVersion==='1.26.2'&&d.introducedAfter==='1.25.3'&&
    d.sourceCorpusSha256===AFTER&&d.previousSourceCorpusSha256===BEFORE&&d.sourceProtoDbSha256===PROTO&&
    d.sourceIl2cppDumpSha256===DUMP&&d.protoDbUnchangedAcrossHotfix===true&&
    d.contentReleaseAttributionVerifiedByTagAlone===false&&d.runtimeOwnershipVerified===false&&
    json(d.expansions)===json(expansions)&&json(d.selectors)===json(selectors)&&
    sha(json(Object.fromEntries(Object.entries(d.sourceFiles).sort(([a],[b])=>a<b?-1:a>b?1:0))))===AFTER,'SOURCE');
  const current=source.target.platform==='Steam'&&source.target.gameVersion==='1.26.2';
  if(current)check(source.sourceIl2cppDumpSha256===DUMP&&Object.entries(d.sourceFiles).every(([k,v])=>
    source.sourceFilesSha256[k]===(k==='Condition'?'9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c':v)),
    'CURRENT_SOURCE');
  const byId=new Map(source.items.map(r=>[r.itemId,r]));
  if(current)for(const [name,tag,scene] of expansions){
    check(byId.get(tag)?.nativeCategory==='Tag'&&byId.get(scene)?.nativeCategory==='Scene','NATIVE_EXPANSION_REFERENCE_'+name);
  }
  const raw=inflateSync(Buffer.from(d.data,'base64'),{maxOutputLength:1024*1024});
  check(sha(raw)===DATA&&d.dataSha256===DATA,'DATA_PIN');
  const rows=JSON.parse(raw),byItem=new Map(),freshTags=new Map(),byExpansion={},newByExpansion={},selectedByCategory={};
  let last=0,missing=0,unmapped=0,selected=0,tagged=0;
  check(rows.length===14197&&d.counts.rows===14197,'ROWS');
  for(const [i,tag,sel,field,isNew] of rows){
    check(id(i)&&i>last&&(tag===null||keyByTag.has(tag))&&
      (sel===null||Number.isInteger(sel)&&selectors[sel]!==undefined)&&
      (field===null||id(field))&&typeof isNew==='boolean'&&
      (tag!==null||sel!==null)&&(field!==null||tag===null),'ROW');
    last=i;
    const cat=sel===null?null:selectors[sel][1];
    if(sel!==null){
      const [code,,restrict,,subcode]=selectors[sel];
      check(Math.floor(i/10000000)===code&&(!restrict||Math.floor(i%10000000/100000)===subcode),'SELECTOR');
      selected++;inc(selectedByCategory,cat);
    }
    const key=tag===null?null:keyByTag.get(tag);
    if(tag!==null){tagged++;inc(byExpansion,key);if(isNew){inc(newByExpansion,key);freshTags.set(i,key);}}
    else if(field===null)unmapped++;else missing++;
    if(current){
      const r=byId.get(i);
      check(r&&(!cat||r.nativeCategory===cat)&&fresh(history.get(i))===isNew,'OWNER_'+i);
      check((source.sourceFieldDeclarations?.[r.sourceClass]?.Tags??null)===field,'TAG_DECLARATION_'+i);
      if(tag!==null)check(r.observedFields.some(x=>x[0]===field&&(x[1]===0||x[1]===2)),'TAG_WIRE_'+i);
      // The original signed-off ID census is authoritative. A canonical
      // positive tag on the same source field must agree with it.
      const existing=r.tags.filter(t=>keyByTag.has(t.id)&&t.sourceField===field).map(t=>t.id);
      check(existing.every(x=>x===tag),'CANONICAL_TAG_CONFLICT_'+i);
      byItem.set(i,{status:tag!==null?'tagged':field===null?'unmapped_tag_field':'no_matching_tag',
        expansionKey:key,tagItemId:tag,mandatoryTagSelectorIndex:sel,sourceVersion:'1.26.1'});
    }
    const h=history.get(i);
    if(key!==null&&isNew&&fresh(h)){
      h.nativeExpansionAtIntroduction=key;
      if(key==='Expansion04')addEvidence(h,'native_expansion_tag',tag);
    }
  }
  check(tagged===11277&&missing===2559&&unmapped===361&&selected===13915&&
    compareCounts(byExpansion,d.counts.byExpansion)&&compareCounts(newByExpansion,d.counts.newByExpansion)&&
    compareCounts(selectedByCategory,d.counts.selectedByCategory)&&newByExpansion.Expansion04===849,
    'CENSUS');
  if(current){
    const selectedIds=source.items.filter(r=>selectors.some(([code,,restrict,,sub])=>r.itemType.code===code&&
      (!restrict||r.itemType.subtypeCode===sub)));
    check(selectedIds.length===13915&&selectedIds.every(r=>byItem.get(r.itemId)?.mandatoryTagSelectorIndex!==null&&byItem.has(r.itemId)),'FULL_SELECTOR_CENSUS');
  }
  // Immutable historical reward relations, not reinterpreted from a later
  // native snapshot. They use existing shared DB source projections.
  const [scopes]=load(project,'data/ddv/item-master/historical-content-scope-steam-1261.json',
    'b673e86dee51967645004b64bb05562c717cce386956e888b934ca3cfc3e0346');
  const [origin]=load(project,'data/ddv/item-master/historical-content-origin-steam-1261.json');
  check(origin.introducedSourceCorpusSha256===AFTER&&origin.questProjection.sha256==='473c2eab85f294d0f9169306db8630bcdaa47dea080f48dd0303575b0a6f9ae3','ORIGIN_SOURCE');
  const [quests,questSha]=load(project,origin.questProjection.path,origin.questProjection.sha256);
  check(quests.provenance.originalMissionSha256===d.sourceFiles.Mission&&quests.provenance.staticCandidatesOnly===true,'QUEST_SOURCE');
  const [friends,friendSha]=load(project,'data/ddv/item-master/original-protodb-acquisition-steam-1.26.2.json');
  check(friends.sourceProtoDbSha256===PROTO&&friends.sourceIl2cppDumpSha256===DUMP&&
    friends.payloadSha256==='34ae5f96fadc07180faa52b07f99b232321d325665e5c637906b46030aeb1ca4','FRIEND_SOURCE');
  const friendRaw=inflateSync(Buffer.from(friends.packed,'base64'),{maxOutputLength:1024*1024});
  check(sha(friendRaw)===friends.payloadSha256,'FRIEND_PAYLOAD');
  const [characters]=JSON.parse(friendRaw);
  const [n,scenePin,sceneData]=origin.groups['scene.keepsake'];
  const sceneRaw=inflateSync(Buffer.from(sceneData,'base64'),{maxOutputLength:100000});
  const sceneIds=JSON.parse(sceneRaw);
  check(n===19&&sceneIds.length===19&&scenePin==='0ffb7b40e7ee070ae49775cc054fb2e904705cc098e6ae10a426c9f2a9d72a50'&&sha(sceneRaw)===scenePin,'CHARACTER_SOURCE');
  const rewards=new Map(),questIds=new Set(),friendIds=new Set();
  const add=(item,e)=>{if(freshTags.get(item)!=='Expansion04')return false;
    const list=rewards.get(item)??[];list.push(e);rewards.set(item,list);return true;};
  for(const [mission,cat] of scopes.scopeRows){
    if(cat!=='Mission')continue;
    const q=quests.rows[mission];
    if(q?.opaqueOverrideUnresolved)continue;
    for(const [table,slot,item,min,max,weight,state] of q?.additionalLoot??[]){
      if(!Number.isSafeInteger(min)||min<=0||min!==max||weight!==null||state!==false)continue;
      const i=Number(item);
      // These are configured positive table draws, not guaranteed quantities.
      if(add(i,{kind:'quest_configured_loot',sourceItemId:mission,tableIndex:table,itemIndex:slot,
        minimumRolls:min,maximumRolls:max,sourceSha256:questSha}))questIds.add(i);
    }
  }
  for(const [owner,levels] of characters){
    if(!sceneIds.includes(owner))continue;
    for(const [level,i,amount] of levels){
      if(!Number.isSafeInteger(amount)||amount<=0)continue;
      if(add(i,{kind:'character_friendship_reward',sourceItemId:owner,friendshipLevel:level,
        configuredAmount:amount,sourceSha256:friendSha}))friendIds.add(i);
    }
  }
  check(questIds.size===23&&friendIds.size===24&&rewards.size===46,'CORROBORATED_CENSUS');
  let assigned=0;
  for(const [i,links] of rewards){
    const h=history.get(i);
    if(!fresh(h))continue;
    h.corroboratedExpansionRewardEvidence=links;
    for(const link of links)addEvidence(h,link.kind==='quest_configured_loot'?'expansion_quest_configured_loot':'expansion_friendship_reward',link.sourceItemId);
    if(h.contentReleaseId!==null&&h.contentReleaseId!==RELEASE||
      h.contentCandidateReleaseIds.some(x=>x!==RELEASE)){
      h.contentOriginConflict=true;continue;
    }
    if(h.contentReleaseId===null){
      h.contentReleaseId=RELEASE;h.contentReleaseKind='paid_dlc';h.contentDlcType='expansion';
      h.contentAttributionEvidenceKind='verified_expansion_tag_and_reward';
      h.contentReleaseEvidenceSha256=sha(json([PIN,questSha,friendSha,scenePin]));
      h.contentAssignmentSha256=sha(json([i,RELEASE,AFTER,TAG,links]));
      assigned++;
    }
  }
  if(current)check(assigned===46,'ASSIGNED_CENSUS');
  // Corroborate exact historical expansion tags using typed gameplay links,
  // without inferring exclusivity of acquisition or runtime availability.
  // These source projections have already been validated by the historical
  // relation and scope builders. Load the same immutable evidence, not a
  // newer game's potentially changed recipes or store pools.
  const [relations,relationsSha]=load(project,'data/ddv/item-master/historical-content-relations-steam-1261.json');
  check(relations.introducedSourceCorpusSha256===AFTER&&
    relations.decodedSha256==='b2ba6018db5289be2ad23785b341db04fa7f2f6daaea91b8bff6777f593485c9','GAMEPLAY_RELATIONS_SOURCE');
  const relationRaw=inflateSync(Buffer.from(relations.data,'base64'),{maxOutputLength:100000});
  check(sha(relationRaw)===relations.decodedSha256,'GAMEPLAY_RELATIONS_DATA');
  const links=JSON.parse(relationRaw);
  const [recipes,recipeSha]=load(project,'static/acquisition/public/recipe-results-1.26.2.json',
    'ee767b8808f9bef078234d978c3893b5a9649050c7ccf8ee460bd3a32ef02f0e');
  const [activities,activitySha]=load(project,'static/acquisition/public/activity-result-paths-1.26.2.json',
    '97d02a35dbe78dab637f4eda7d6fdf61cf528bb77aab6f684483a5cf542eebbb');
  const scopeSha='b673e86dee51967645004b64bb05562c717cce386956e888b934ca3cfc3e0346';
  const [stalls,stallSha]=load(project,'static/acquisition/public/native-stall-slots-1.26.2.json',
    'ef18e94df460d7bd5c768ebc720c48425570ac549a49ebdac00ade34e5468d2a');
  const [,lootSha]=load(project,'static/acquisition/public/native-loot-candidates-1.26.2.json',
    'fba1d8163c30156941b108ce2ba37544f32e9c7d419f4c2b1f126b017c470a00');
  check(recipes.source.sha256===d.sourceFiles.ActivityData&&
    activities.sources.activityData.sha256===d.sourceFiles.ActivityData&&
    activities.sources.activityItem.sha256===d.sourceFiles.ActivityItem&&
    stalls.sources.building.sha256===d.sourceFiles.Building,'GAMEPLAY_SOURCE');
  const recipeById=new Map(recipes.recipes.map(r=>[r[0],r]));
  const activityById=new Map(activities.paths.map(r=>[r[0],r]));
  const stallIds=new Set(stalls.stalls.map(r=>r[0]));
  const gatedStalls=new Map();
  const gameplay=new Map(),gameplayKinds=new Map();
  const emit=(i,kind,sourceItemId,sourceSha256,extra={})=>{
    if(freshTags.get(i)!=='Expansion04')return;
    check(id(sourceItemId),'GAMEPLAY_SOURCE_ID');
    const list=gameplay.get(i)??[];
    const evidence={kind,sourceItemId,sourceSha256,...extra,
      sourceGameVersion:'1.26.1',runtimeAvailabilityVerified:false,exclusiveAcquisitionVerified:false};
    if(!list.some(e=>json(e)===json(evidence)))list.push(evidence);
    gameplay.set(i,list);
    const set=gameplayKinds.get(kind)??new Set();set.add(i);gameplayKinds.set(kind,set);
  };
  for(const [event,i,amount,role] of scopes.grantRows){
    // The original conditional event has a verified mandatory positive
    // expansion gate. A configured grant is not proof it has executed.
    emit(i,'expansion_gated_grant',event,scopeSha,{configuredAmount:amount,grantRole:role});
    if(role==='conditional_grant'&&stallIds.has(i)){
      const list=gatedStalls.get(i)??[];list.push(event);gatedStalls.set(i,list);
    }
  }
  for(const [i,refs] of links.recipe_dlc_result)for(const ref of refs){
    const r=recipeById.get(ref);
    check(r&&r[2]===i&&(r[1]===0||r[1]===1),'GAMEPLAY_RECIPE_RESULT');
    // Only fixed mandatory Item IDs, never tag alternatives or optional
    // ingredients. The ingredient and the result must both be new and have
    // the exact native expansion tag at introduction.
    const requiredIngredientItemIds=[...new Set(r[4].filter(x=>x[0]===0&&freshTags.get(x[1])==='Expansion04').map(x=>x[1]))].sort((a,b)=>a-b);
    if(requiredIngredientItemIds.length)emit(i,r[1]===0?'cooking_fixed_expansion_ingredient':'crafting_fixed_expansion_ingredient',ref,recipeSha,
      {requiredIngredientItemIds});
  }
  for(const [i,refs] of links.activity_dlc_result)for(const ref of refs){
    const r=activityById.get(ref);
    check(r&&r[2]===i&&(r[1]===0||r[1]===1),'GAMEPLAY_ACTIVITY_RESULT');
    emit(i,r[1]===0?'fishing_expansion_area':'mining_expansion_area',ref,activitySha,
      {historicalRelationSha256:relationsSha});
  }
  for(const [i,refs] of links.seed_dlc_crop)for(const ref of refs){
    const r=activityById.get(i);
    check(r&&r[1]===3&&r[2]===ref,'GAMEPLAY_SEED_RESULT');
    if(freshTags.get(ref)==='Expansion04')emit(i,'growing_expansion_crop',i,activitySha,{cropItemId:ref});
  }
  for(const i of sceneIds)emit(i,'character_expansion_scene',1540000209,scenePin);
  for(const [i,refs] of links.dlc_stall_pool)for(const ref of refs){
    // Name prefix alone is insufficient. Require a typed, positive
    // expansion-gated grant of the specific stall plus its original pool.
    const events=gatedStalls.get(ref);
    if(events?.length)emit(i,'expansion_gated_stall_pool',ref,stallSha,
      {grantEventItemIds:[...new Set(events)].sort((a,b)=>a-b),gateProjectionSha256:scopeSha,lootProjectionSha256:lootSha});
  }
  const gameplayCoverage=Object.fromEntries([...gameplayKinds].map(([k,set])=>[k,set.size]));
  check(gameplay.size===199&&compareCounts(gameplayCoverage,{
    cooking_fixed_expansion_ingredient:37,crafting_fixed_expansion_ingredient:104,
    fishing_expansion_area:17,mining_expansion_area:9,growing_expansion_crop:9,
    character_expansion_scene:19,expansion_gated_grant:1,expansion_gated_stall_pool:42
  }),'GAMEPLAY_CORROBORATED_CENSUS');
  let gameplayAssigned=0;
  for(const [i,evidence] of gameplay){
    const h=history.get(i);
    if(!fresh(h))continue;
    h.corroboratedExpansionGameplayEvidence=evidence;
    h.corroboratedExpansionGameplayKinds=[...new Set(evidence.map(e=>e.kind))].sort();
    for(const e of evidence)addEvidence(h,e.kind,e.sourceItemId);
    if(h.contentReleaseId!==null&&h.contentReleaseId!==RELEASE||
      h.contentCandidateReleaseIds.some(x=>x!==RELEASE)){
      h.contentOriginConflict=true;continue;
    }
    // Preserve stronger prior assignments, even if further evidence appears.
    if(h.contentReleaseId===null){
      h.contentReleaseId=RELEASE;h.contentReleaseKind='paid_dlc';h.contentDlcType='expansion';
      h.contentAttributionEvidenceKind='verified_expansion_tag_and_gameplay_relation';
      h.contentReleaseEvidenceSha256=sha(json([PIN,relationsSha,recipeSha,activitySha,scenePin,scopeSha,stallSha,lootSha]));
      h.contentAssignmentSha256=sha(json([i,RELEASE,AFTER,TAG,evidence]));
      gameplayAssigned++;
    }
  }
  if(current)check(gameplayAssigned===194,'GAMEPLAY_ASSIGNED_CENSUS');
  const metadata=current?{sourceGameVersion:'1.26.1',compatibleGameVersion:'1.26.2',
    sourceProjectionSha256:PIN,sourceProtoDbSha256:PROTO,sourceRecords:d.sourceRecords,
    expansions:d.expansions,selectors:d.selectors,coverage:d.counts,
    corroboratedHistoricalRewardCount:rewards.size,corroboratedHistoricalGameplayCount:gameplay.size,
    corroboratedHistoricalGameplayCoverage:gameplayCoverage,newGameplayAssignmentCount:gameplayAssigned,runtimeOwnershipVerified:false,
    contentReleaseAttributionVerifiedByTagAlone:false}:null;
  return {byItem,metadata};
}
