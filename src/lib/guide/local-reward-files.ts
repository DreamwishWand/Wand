/**
 * Owner-local, source-attested DB-03 reward imports for the Guide UI.
 *
 * All five inputs are selected explicitly by the user. Nothing is fetched,
 * uploaded, persisted, emitted as public data or used to modify a save.
 * Identify each original private projection by its unique byte length, then
 * delegate its SHA-256 and native-schema checks to the existing DB-03 loaders.
 */
import {
  DB03_PRIVATE_REWARD_SOURCE,loadPinnedPrivateGuideRewardIndex
} from './private-reward-evidence.ts';
import {
  loadVerifiedRewardSourceEquivalence,joinEquivalentCurrentRewardCandidates,
  type CurrentCompatibleRewardReader
} from './reward-source-equivalence.ts';
import {GUIDE_SOURCE_COMPOSITE_V2_BYTES} from './source-composite.ts';

export type LocalRewardFileRole=
  'eventLinks'|'questFlows'|'friendshipDefaults'|'guideSourceCompositeV2'|'protoDbBridge';
export interface LocalGuideRewardFile{
  readonly name:string;
  readonly size:number;
  arrayBuffer():Promise<ArrayBuffer>;
}
export const DB03_LOCAL_REWARD_REQUIRED_FILES=Object.freeze({
  eventLinks:DB03_PRIVATE_REWARD_SOURCE.eventLinks.bytes,
  questFlows:DB03_PRIVATE_REWARD_SOURCE.questFlows.bytes,
  friendshipDefaults:DB03_PRIVATE_REWARD_SOURCE.friendshipDefaults.bytes,
  guideSourceCompositeV2:GUIDE_SOURCE_COMPOSITE_V2_BYTES,
  protoDbBridge:1470
} as const satisfies Record<LocalRewardFileRole,number>);

function check(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB03_LOCAL_REWARD_'+reason);
}

/**
 * A complete import requires exactly five size-distinct original files.
 * Filenames are not trusted: the already-existing DB-03 SHA-256 checks
 * authenticate every file before any candidate becomes available.
 */
export async function loadVerifiedLocalGuideRewards(
  selected:readonly LocalGuideRewardFile[]
):Promise<CurrentCompatibleRewardReader>{
  check(Array.isArray(selected)&&selected.length===5,'REQUIRE_FIVE_FILES');
  const roles=Object.entries(DB03_LOCAL_REWARD_REQUIRED_FILES) as [LocalRewardFileRole,number][];
  const bySize=new Map<number,LocalGuideRewardFile>();
  for(const file of selected){
    check(file!==null&&typeof file==='object'&&typeof file.name==='string'&&
      typeof file.arrayBuffer==='function'&&
      Number.isSafeInteger(file.size)&&file.size>0,'INVALID_FILE');
    check(roles.some(([,bytes])=>bytes===file.size),'UNKNOWN_SOURCE_SIZE');
    check(!bySize.has(file.size),'DUPLICATE_SOURCE_SIZE');
    bySize.set(file.size,file);
  }
  check(roles.every(([,bytes])=>bySize.has(bytes)),'MISSING_SOURCE_FILE');
  // Each private input is < 520 KiB and copied only after all file sizes pass.
  const files=await Promise.all(roles.map(async ([role,bytes])=>{
    const contents=await bySize.get(bytes)!.arrayBuffer();
    check(contents instanceof ArrayBuffer&&contents.byteLength===bytes,
      'SOURCE_CHANGED_DURING_READ_'+role);
    return [role,new Uint8Array(contents)] as const;
  }));
  const data=Object.fromEntries(files) as Record<LocalRewardFileRole,Uint8Array>;
  const [archived,proof]=await Promise.all([
    loadPinnedPrivateGuideRewardIndex({
      eventLinks:data.eventLinks,questFlows:data.questFlows,
      friendshipDefaults:data.friendshipDefaults
    }),
    loadVerifiedRewardSourceEquivalence({
      guideSourceCompositeV2:data.guideSourceCompositeV2,
      protoDbBridge:data.protoDbBridge
    })
  ]);
  return joinEquivalentCurrentRewardCandidates(archived,proof);
}
