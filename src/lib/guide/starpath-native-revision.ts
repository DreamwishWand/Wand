/**
 * Independent source-evidenced revision audit for an overlapping Star Path
 * in two owner-held Steam LiveOps caches. This is NOT an exhaustive Star Path
 * archive, an online activity check, an ownership record, or a claim that a
 * season absent from one cache was introduced in another version.
 *
 * The curated 1.5KB public evidence is authenticated by the offline producer
 * (original bytes SHA-256 verified) and by the browser (published SHA-256).
 * Raw owner caches and other private source bytes are never downloaded here.
 */
import {verifyPublicStarpath} from './public-starpath.ts';

export const STARPATH_NATIVE_REVISION_CONTRACT='wand.db03.starpath-native-revision-evidence@1' as const;
export const STARPATH_NATIVE_REVISION_FILE='starpath-native-revision-evidence-1.25.0-1.26.2.json' as const;
export const STARPATH_NATIVE_REVISION_PUBLIC_SHA='ef6ed2192cbdbdf5a79887183878f6cece363e0ad0416f4863763afe31692eb2' as const;
export const STARPATH_NATIVE_REVISION_PUBLIC_BYTES=1529 as const;
const ORIGINALS=[
  {gameVersion:'1.25.0',sourceBytes:140265,
    sourceSha256:'820d9838722e1f28b2211ebd7a24a97393c273ac09b22dfde0a9610ea5184b53',
    seasonIds:['HauntingElegance2026']},
  {gameVersion:'1.26.2',sourceBytes:186442,
    sourceSha256:'4168d6ec580b04893f701dec5f0509589d39fb2e838d08bac724a9720caecf14',
    seasonIds:['HauntingElegance2026','Seafaring2026']}
] as const;

export interface StarpathNativeRevisionEdit{
  readonly taskId:'Task15'|'Task64'|'Task100';
  readonly earlier:string;
  readonly later:string;
}
export interface StarpathNativeRevision{
  readonly seasonId:'HauntingElegance2026';
  readonly earlierDefinitionVersion:12500;
  readonly laterDefinitionVersion:12602;
  readonly rewardSlotsWithIdenticalFullSourceDefinition:50;
  readonly rewardSourceIdentity:'exact_full_reward_pages_bonus_and_vault';
  readonly dailyTasksWithSameIdAndNonDescriptionFields:121;
  readonly unchangedWeeklyTasks:true;
  readonly descriptionEdits:readonly StarpathNativeRevisionEdit[];
  readonly platformFilter:Readonly<{
    earlier:'absent_from_source';
    later:Readonly<{excludes:readonly ['AppleArcade']}>;
  }>;
  readonly allOtherStaticSeasonFieldsUnchanged:true;
}
export interface StarpathNativeRevisionEvidence{
  readonly schema:typeof STARPATH_NATIVE_REVISION_CONTRACT;
  readonly evidence:Readonly<{
    platform:'Steam';
    comparisonIsStaticConfigOnly:true;
    liveStatusVerified:false;
    historicalSeasonCatalogComplete:false;
    sources:readonly {gameVersion:string;sourceBytes:number;sourceSha256:string;seasonIds:readonly string[]}[];
  }>;
  readonly matchedSeason:StarpathNativeRevision;
  readonly onlyInLaterSnapshot:readonly ['Seafaring2026'];
  readonly onlyInEarlierSnapshot:readonly [];
  readonly unseenHistoricalSeasonIdsVerified:0;
  /** No native historical ID is inferred for the 21 official-only seasons. */
  getVerifiedSeasonRevision(seasonId:string):StarpathNativeRevision|null;
}
type Obj=Record<string,unknown>;
const obj=(x:unknown):x is Obj=>!!x&&typeof x==='object'&&!Array.isArray(x);
function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB03_STARPATH_NATIVE_REVISION_'+reason);
}
function exactly(left:unknown,right:readonly string[]):boolean{
  return Array.isArray(left)&&left.length===right.length&&
    right.every((expected,i)=>left[i]===expected);
}
/** Source-verified metadata (not raw encrypted/live cache bytes) is immutable. */
export function verifyStarpathNativeRevisionEvidence(
  doc:unknown,publicSeasonSnapshot:unknown
):StarpathNativeRevisionEvidence{
  const snapshot=verifyPublicStarpath(publicSeasonSnapshot);
  check(obj(doc)&&doc.schema===STARPATH_NATIVE_REVISION_CONTRACT,'SCHEMA');
  const evidence=doc.evidence;
  check(obj(evidence)&&evidence.platform==='Steam'&&
    evidence.comparisonIsStaticConfigOnly===true&&evidence.liveStatusVerified===false&&
    evidence.historicalSeasonCatalogComplete===false&&
    Array.isArray(evidence.sources)&&evidence.sources.length===2,'PROVENANCE');
  for(let i=0;i<2;i++){
    const row=evidence.sources[i],expected=ORIGINALS[i];
    check(obj(row)&&row.gameVersion===expected.gameVersion&&
      row.sourceBytes===expected.sourceBytes&&row.sourceSha256===expected.sourceSha256&&
      exactly(row.seasonIds,expected.seasonIds),'ORIGINAL_SOURCE_MISMATCH');
  }
  check(exactly(doc.onlyInEarlierSnapshot,[])&&
    exactly(doc.onlyInLaterSnapshot,['Seafaring2026'])&&
    doc.unseenHistoricalSeasonIdsVerified===0,'SNAPSHOT_COVERAGE');
  const comparison=doc.matchedSeason;
  check(obj(comparison)&&comparison.seasonId==='HauntingElegance2026'&&
    comparison.earlierDefinitionVersion===12500&&
    comparison.laterDefinitionVersion===12602&&
    comparison.rewardSlotsWithIdenticalFullSourceDefinition===50&&
    comparison.rewardSourceIdentity==='exact_full_reward_pages_bonus_and_vault'&&
    comparison.dailyTasksWithSameIdAndNonDescriptionFields===121&&
    comparison.unchangedWeeklyTasks===true&&
    comparison.allOtherStaticSeasonFieldsUnchanged===true,'REVISION_CONTRACT');
  check(obj(comparison.platformFilter)&&
    comparison.platformFilter.earlier==='absent_from_source'&&
    obj(comparison.platformFilter.later)&&
    exactly(comparison.platformFilter.later.excludes,['AppleArcade']),'PLATFORM_FILTER_EVIDENCE');
  const current=snapshot.seasons.find((s:{id:string})=>s.id==='HauntingElegance2026');
  check(current&&current.definitionVersion===comparison.laterDefinitionVersion&&
    current.tasks.length===121&&
    current.counts.normalRewards+current.counts.bonusRewards+
      current.counts.vaultRewards===comparison.rewardSlotsWithIdenticalFullSourceDefinition,
    'PINNED_PUBLIC_SEASON_MISMATCH');
  check(Array.isArray(comparison.descriptionEdits)&&
    comparison.descriptionEdits.length===3,'TASK_EDIT_COUNT');
  const tasks=['Task15','Task64','Task100'] as const;
  const descriptions:StarpathNativeRevisionEdit[]=comparison.descriptionEdits.map(
    (raw:unknown,i:number)=>{
      const expected=tasks[i];
      check(obj(raw)&&raw.taskId===expected&&
        typeof raw.earlier==='string'&&raw.earlier.length>0&&raw.earlier.length<=180&&
        typeof raw.later==='string'&&raw.later.length>0&&raw.later.length<=180&&
        raw.earlier!==raw.later&&
        current.tasks.find((task:{id:string})=>task.id===expected)?.description===raw.later,
        'UNVERIFIED_TASK_DESCRIPTION');
      return Object.freeze({taskId:expected,earlier:raw.earlier,later:raw.later});
    }
  );
  const revision:StarpathNativeRevision=Object.freeze({
    seasonId:'HauntingElegance2026' as const,
    earlierDefinitionVersion:12500 as const,laterDefinitionVersion:12602 as const,
    rewardSlotsWithIdenticalFullSourceDefinition:50 as const,
    rewardSourceIdentity:'exact_full_reward_pages_bonus_and_vault' as const,
    dailyTasksWithSameIdAndNonDescriptionFields:121 as const,
    unchangedWeeklyTasks:true as const,
    descriptionEdits:Object.freeze(descriptions),
    platformFilter:Object.freeze({
      earlier:'absent_from_source' as const,
      later:Object.freeze({excludes:Object.freeze(['AppleArcade'] as const)})
    }),
    allOtherStaticSeasonFieldsUnchanged:true as const
  });
  const sources=Object.freeze(ORIGINALS.map(row=>Object.freeze({
    gameVersion:row.gameVersion,sourceBytes:row.sourceBytes,sourceSha256:row.sourceSha256,
    seasonIds:Object.freeze([...row.seasonIds])
  })));
  return Object.freeze({
    schema:STARPATH_NATIVE_REVISION_CONTRACT,
    evidence:Object.freeze({
      platform:'Steam' as const,comparisonIsStaticConfigOnly:true as const,
      liveStatusVerified:false as const,historicalSeasonCatalogComplete:false as const,
      sources
    }),
    matchedSeason:revision,
    onlyInLaterSnapshot:Object.freeze(['Seafaring2026'] as const),
    onlyInEarlierSnapshot:Object.freeze([] as const),
    unseenHistoricalSeasonIdsVerified:0 as const,
    getVerifiedSeasonRevision:(id:string)=>id==='HauntingElegance2026'?revision:null
  });
}
export async function loadStarpathNativeRevisionEvidence(
  url:string,publicSeasonSnapshot:unknown,fetcher:typeof fetch=fetch
):Promise<StarpathNativeRevisionEvidence>{
  check(typeof url==='string'&&url.length>0&&url.length<2048,'INVALID_URL');
  const response=await fetcher(url);
  check(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===STARPATH_NATIVE_REVISION_PUBLIC_BYTES,'PUBLIC_ASSET_BYTES');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(v=>v.toString(16).padStart(2,'0')).join('');
  check(hash===STARPATH_NATIVE_REVISION_PUBLIC_SHA,'PUBLIC_ASSET_SHA');
  return verifyStarpathNativeRevisionEvidence(
    JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),publicSeasonSnapshot);
}
