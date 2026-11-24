/**
 * Offline historical content-origin evidence. No new product JavaScript.
 * An origin candidate is NOT an entitlement, a confirmed release assignment,
 * or proof of actual acquisition. Retain original release-time observations
 * when later game versions modify tags, missions, or acquisition methods.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {attachHistoricalContentRelations} from './attach-historical-content-relations.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(ok,code)=>{if(!ok)throw Error('DB01_CONTENT_ORIGIN_'+code)};
const id=x=>Number.isSafeInteger(x)&&x>0;
const cohort='dlc.the-keepsake-sea',free='version.26';
const groupContract={
  'tag.keepsake':[654,'world_tag',2001200066,cohort],
  'tag.valley':[18,'world_tag',2001200028,null],
  'tag.rift':[3,'world_tag',2001200029,null],
  'scene.keepsake':[19,'character_scene',1540000209,cohort],
  'scene.valley':[1,'character_scene',1540000000,null],
  'scope.keepsake':[45,'mission_scope','Expansion04Main',cohort]
};
function pinned(project,path,digest){
  const bytes=readFileSync(join(project,path));
  check(sha(bytes)===digest,'PROJECTION_SHA_'+path);
  return JSON.parse(bytes);
}
export function attachHistoricalContentOrigin(project,source,history){
  const d=JSON.parse(readFileSync(join(project,'data/ddv/item-master/historical-content-origin-steam-1261.json'),'utf8'));
  check(d.schema==='wand.db01.historical-content-origin@1'&&d.platform==='Steam'&&
    d.introducedAfter==='1.25.3'&&d.introducedVersion==='1.26.1'&&
    d.introducedSourceCorpusSha256==='4ccf2816de3a5f2e27e780aa1c5a954b8ed0e325ccbd7d6bb76597f0f09ad41c'&&
    d.coverage.contentAttributionVerified===false,'SOURCE');
  const current=source.target.gameVersion==='1.26.2';
  // Historical observations are pinned to the introduction corpus, not
  // reinterpreted from current tags. All audited files were unchanged in the hotfix.
  if(current)check(Object.entries(d.sourceFiles).every(([k,v])=>source.sourceFilesSha256[k]===v),'ORIGINAL_SHA');
  const fresh=h=>h?.introducedVersion===d.introducedVersion&&h.introducedAfterVersion===d.introducedAfter&&
    h.introducedSourceCorpusSha256===d.introducedSourceCorpusSha256;
  const facts=new Map(),candidates=new Map();
  function add(i,kind,value,candidate=null){
    if(!fresh(history.get(i))){
      check(!current,'HISTORICAL_ID_'+i);
      return;
    }
    if(!facts.has(i))facts.set(i,[]);
    const row=[kind,value];
    if(!facts.get(i).some(x=>x[0]===kind&&x[1]===value))facts.get(i).push(row);
    if(candidate){
      if(!candidates.has(i))candidates.set(i,new Set());
      candidates.get(i).add(candidate);
    }
  }
  const groups={};
  for(const [key,[expected,kind,detail,candidate]] of Object.entries(groupContract)){
    const [count,digest,b64]=d.groups[key];
    const raw=inflateSync(Buffer.from(b64,'base64'),{maxOutputLength:100000});
    const ids=JSON.parse(raw);
    check(count===expected&&sha(raw)===digest&&ids.length===expected&&ids.every((x,j)=>id(x)&&(j===0||x>ids[j-1])),'GROUP_'+key);
    groups[key]=ids;
    for(const i of ids)add(i,kind,detail,candidate);
  }
  // Update26 alone does not identify a free update: 339 furniture/clothing
  // definitions with that name marker have the Keepsake Sea world tag.
  for(const i of groups['tag.valley']){
    const h=history.get(i);
    if(fresh(h)&&h.nativeContentMarker==='update26')add(i,'native_name_marker','update26',free);
  }
  const quests=pinned(project,d.questProjection.path,d.questProjection.sha256);
  check(quests.provenance.originalMissionSha256===d.sourceFiles.Mission&&quests.provenance.staticCandidatesOnly===true,'QUEST_SOURCE');
  const rewardIds=new Set();
  for(const q of groups['scope.keepsake'])for(const row of quests.rows[String(q)]?.additionalLoot??[]){
    const i=Number(row[2]);
    if(fresh(history.get(i))){rewardIds.add(i);add(i,'quest_reward_candidate',q,cohort);}
  }
  const iap=pinned(project,d.iapProjection.path,d.iapProjection.sha256);
  check(iap.source.sourceSchema==='Definitions.IAPData'&&iap.source.staticallyConfiguredOnly===true&&
    iap.source.accountEntitlementVerified===false,'IAP_SOURCE');
  const packageIds=new Set();
  for(const row of iap.packages){
    if(row[3]!=='Expansion04')continue;
    for(const [item] of row[9]){
      const i=Number(item);
      if(fresh(history.get(i))){packageIds.add(i);add(i,'iap_direct_expansion_reward',row[0],cohort);}
    }
  }
  // Shop evidence is an acquisition route, independent of candidate release.
  // Likewise preserve a native name marker without inferring an assignment.
  for(const [i,h] of history){
    if(!fresh(h))continue;
    if(h.nativeContentMarker)add(i,'native_name_marker',h.nativeContentMarker);
    if(h.introductionShopSnapshot)add(i,'premium_shop_snapshot',h.introductionShopSnapshot);
  }
  if(current){
    check(rewardIds.size===33&&packageIds.size===4&&
      [...candidates.values()].filter(x=>x.has(cohort)).length===719&&
      [...candidates.values()].filter(x=>x.has(free)).length===18&&
      [...candidates.values()].every(x=>x.size===1),'CANDIDATE_CENSUS');
  }
  const additional=attachHistoricalContentRelations(project,source,history,fresh,add,packageIds);
  if(current){
    check([...candidates.values()].filter(x=>x.has(cohort)).length===1058&&
      [...candidates.values()].filter(x=>x.has(free)).length===18&&
      [...candidates.values()].every(x=>x.size===1)&&additional.verified.size===29,'EXTENDED_CENSUS');
  }
  for(const [i,rows] of facts){
    const h=history.get(i);
    h.contentOriginEvidence=rows;
    if(candidates.has(i))h.contentCandidateReleaseIds=[...candidates.get(i)].sort();
  }
  return history;
}
