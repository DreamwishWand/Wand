/**
 * SHA-pinned source-native Companion Item identities, Steam v1.26.2.
 *
 * Exact game source field 1 (Item ID), 2 (internal name key), and 3
 * (matching Companion.<key>_DisplayName localization key) are verified
 * offline. Original game binary/source file is not served.
 *
 * These definitions do NOT prove specific Twitch/code rewards or ownership.
 * The optional official name candidate crosswalk is explicitly semantic
 * and cannot be promoted to a verified campaign -> numeric Item ID link.
 */
import type {OfficialCampaign} from './origins.ts';

export const DB02_COMPANION_IDENTITIES_SCHEMA=
  'wand.db02.public-native-companion-identities@1' as const;
export const DB02_COMPANION_IDENTITIES_FILE=
  'native-companion-identities-1.26.2.json' as const;
export const DB02_COMPANION_IDENTITIES_BYTES=16882 as const;
export const DB02_COMPANION_IDENTITIES_SHA=
  '53ec1620d42cddc074043075e94aa7f580814c800b1efdfb67ff773f76253f88' as const;
export const DB02_COMPANION_ORIGINAL_SHA=
  '62008c61bf0b407c40d0adf417db043ab058f4ec0ca2764355e176a3532c2219' as const;

const KEY=/^[A-Za-z0-9_!.-]{1,130}$/;
const ID=/^[1-9][0-9]{0,15}$/;
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const PINNED=new WeakSet<object>();
const EMPTY_CANDIDATES=Object.freeze([]) as readonly CompanionOfficialNameCandidate[];
const PROPOSED=Object.freeze([
  Object.freeze({
    campaignId:'code:COMMUNITYCOMPANIONDRAGON2025',
    campaignKind:'redeem_code' as const,
    rewardName:'Sakura Blossom Dragon Companion',
    nativeKey:'Expansion02!BabyDragon!SakuraDragon'
  }),
  Object.freeze({
    campaignId:'twitch:2026-october-showcase',
    campaignKind:'twitch_drop' as const,
    rewardName:'Pirate Crocodile Companion',
    nativeKey:'Crocodile!PirateCrocodile'
  }),
  Object.freeze({
    campaignId:'twitch:2026-keepsake-sea',
    campaignKind:'twitch_drop' as const,
    rewardName:'Pirate Crocodile Companion',
    nativeKey:'Crocodile!PirateCrocodile'
  })
] as const);

export interface NativeCompanionIdentity{
  readonly itemId:string;
  readonly nativeNameKey:string;
  /** Was directly validated in original bytes; not a translated name. */
  readonly sourceLocalizationNameKey:string;
  readonly originalSourceSha256:typeof DB02_COMPANION_ORIGINAL_SHA;
  readonly sourceDefinitionIdVerified:true;
  readonly sourceNameKeyVerified:true;
  readonly translatedDisplayNameVerified:false;
  readonly specificCampaignLinkVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface PinnedNativeCompanionIdentityIndex{
  readonly schema:typeof DB02_COMPANION_IDENTITIES_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly originalSha256:typeof DB02_COMPANION_ORIGINAL_SHA;
  readonly identities:readonly NativeCompanionIdentity[];
  readonly coverage:Readonly<{
    originalCompanionDefinitions:394;
    distinctCompanionItemIds:394;
    uniqueNativeNameKeys:394;
    nativeLocalizationKeyPatternVerified:true;
    specificCampaignLinksVerified:0;
    translatedDisplayNamesVerified:false;
    playerAcquisitionVerified:false;
  }>;
  getItem(itemId:string|number):NativeCompanionIdentity|null;
  getByNativeNameKey(name:string):NativeCompanionIdentity|null;
  listItemIds():readonly string[];
}
export interface CompanionOfficialNameCandidate{
  readonly campaignId:string;
  readonly campaignKind:'twitch_drop'|'redeem_code';
  readonly rewardName:string;
  readonly itemId:string;
  readonly companion:NativeCompanionIdentity;
  readonly officialSourceUrl:string;
  readonly evidence:'native_key_semantic_name_candidate_only';
  readonly originalNativeItemIdVerified:true;
  readonly originalNativeNameKeyVerified:true;
  readonly officialCampaignRewardNameVerified:true;
  readonly officialCampaignNumericItemIdLinkVerified:false;
  readonly campaignGrantVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface CompanionOfficialNameCandidateIndex{
  readonly schema:'wand.db02.official-native-companion-name-candidates@1';
  readonly targetVersion:'1.26.2';
  readonly native:PinnedNativeCompanionIdentityIndex;
  readonly coverage:Readonly<{
    semanticCandidateRelations:3;
    distinctNativeCandidateItemIds:2;
    officialNumericItemIdLinksVerified:0;
    playerGrantsVerified:0;
    nativeNameOnlyNotCampaignProof:true;
  }>;
  getItemCandidates(itemId:string|number):readonly CompanionOfficialNameCandidate[];
  getCampaignCandidates(campaignId:string):readonly CompanionOfficialNameCandidate[];
}
function ensure(ok:unknown,code:string):asserts ok {
  if(!ok)throw new TypeError('DB02_COMPANION_IDENTITIES_'+code);
}
function object(x:unknown):x is Record<string,unknown>{
  return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function canonicalId(x:unknown):string{
  const v=typeof x==='number'&&Number.isSafeInteger(x)?String(x):x;
  ensure(typeof v==='string'&&ID.test(v)&&Number.isSafeInteger(Number(v)),
    'INVALID_ID');
  return v;
}
function nativeKey(x:unknown):string{
  ensure(typeof x==='string'&&KEY.test(x),'INVALID_NATIVE_KEY');
  return x;
}
function add<V>(m:Map<string,V[]>,k:string,v:V):void{
  const list=m.get(k);
  if(list)list.push(v);else m.set(k,[v]);
}
function parse(data:unknown):PinnedNativeCompanionIdentityIndex{
  ensure(object(data)&&data.schema===DB02_COMPANION_IDENTITIES_SCHEMA&&
    object(data.target)&&data.target.platform==='Steam'&&
    data.target.gameVersion==='1.26.2'&&
    object(data.source)&&
    data.source.file==='ddv_Data/StreamingAssets/itemlist/Companion.json'&&
    data.source.bytes===123360&&
    data.source.sha256===DB02_COMPANION_ORIGINAL_SHA&&
    object(data.coverage)&&
    data.coverage.originalCompanionDefinitions===394&&
    data.coverage.uniqueNativeNameKeys===394&&
    data.coverage.distinctCompanionItemIds===394&&
    data.coverage.sourceCategoryAndCampaignNotImplied===true&&
    data.coverage.localizedDisplayNamesVerified===false&&
    data.coverage.specificCampaignLinksVerified===false&&
    data.coverage.actualPlayerGrantVerified===false&&
    Array.isArray(data.identities)&&data.identities.length===394,
    'SOURCE_SCHEMA');
  const byId=new Map<string,NativeCompanionIdentity>();
  const byName=new Map<string,NativeCompanionIdentity>();
  const identities:NativeCompanionIdentity[]=[];
  let last=0;
  for(const tuple of data.identities){
    ensure(Array.isArray(tuple)&&tuple.length===2&&
      typeof tuple[0]==='number'&&Number.isSafeInteger(tuple[0])&&
      tuple[0]>last&&typeof tuple[1]==='string',
      'INVALID_SOURCE_ROW');
    last=tuple[0];
    const itemId=canonicalId(tuple[0]);
    const key=nativeKey(tuple[1]);
    ensure(!byId.has(itemId)&&!byName.has(key),'DUPLICATE_ORIGINAL_ROW');
    const identity:NativeCompanionIdentity=Object.freeze({
      itemId,nativeNameKey:key,
      sourceLocalizationNameKey:'Companion.'+key+'_DisplayName',
      originalSourceSha256:DB02_COMPANION_ORIGINAL_SHA,
      sourceDefinitionIdVerified:true as const,
      sourceNameKeyVerified:true as const,
      translatedDisplayNameVerified:false as const,
      specificCampaignLinkVerified:false as const,
      playerOwnershipVerified:false as const
    });
    byId.set(itemId,identity);
    byName.set(key,identity);
    identities.push(identity);
  }
  ensure(identities.length===394&&byId.size===394&&byName.size===394,
    'COMPANION_SOURCE_CENSUS');
  ensure(byName.get('Expansion02!BabyDragon!SakuraDragon')?.itemId==='120000191'&&
    byName.get('Crocodile!PirateCrocodile')?.itemId==='120000249',
    'KEY_ITEM_ID_CROSSWALK');
  const ids=Object.freeze([...byId.keys()]);
  const result:PinnedNativeCompanionIdentityIndex=Object.freeze({
    schema:DB02_COMPANION_IDENTITIES_SCHEMA,gameVersion:'1.26.2' as const,
    originalSha256:DB02_COMPANION_ORIGINAL_SHA,
    identities:Object.freeze(identities),
    coverage:Object.freeze({
      originalCompanionDefinitions:394 as const,
      distinctCompanionItemIds:394 as const,
      uniqueNativeNameKeys:394 as const,
      nativeLocalizationKeyPatternVerified:true as const,
      specificCampaignLinksVerified:0 as const,
      translatedDisplayNamesVerified:false as const,
      playerAcquisitionVerified:false as const
    }),
    getItem(itemId:string|number){return byId.get(canonicalId(itemId))??null;},
    getByNativeNameKey(key:string){return byName.get(nativeKey(key))??null;},
    listItemIds(){return ids;}
  });
  PINNED.add(result);
  return result;
}
export function hasPinnedCompanionIdentityEvidence(
  value:unknown
):value is PinnedNativeCompanionIdentityIndex{
  return value!==null&&typeof value==='object'&&PINNED.has(value);
}
export async function loadPinnedNativeCompanionIdentities(
  basePath='',fetcher:typeof fetch=fetch
):Promise<PinnedNativeCompanionIdentityIndex>{
  ensure(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  ensure(typeof fetcher==='function','FETCH_REQUIRED');
  const response=await fetcher(basePath+'/acquisition/public/'+
    DB02_COMPANION_IDENTITIES_FILE);
  ensure(response.ok,'FETCH');
  const bytes=await response.arrayBuffer();
  ensure(bytes.byteLength===DB02_COMPANION_IDENTITIES_BYTES,'BYTES');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  ensure(hash===DB02_COMPANION_IDENTITIES_SHA,'SHA');
  return parse(JSON.parse(new TextDecoder().decode(bytes)));
}
/**
 * Transparent semantic name proposals ONLY. Matching official reward wording
 * to a distinct original internal name key does not prove the campaign grants
 * that numeric Item ID. Does not modify the confirmed ItemOrigin ledger.
 */
export function joinOfficialNativeCompanionNameCandidates(
  native:PinnedNativeCompanionIdentityIndex,
  campaigns:readonly OfficialCampaign[]
):CompanionOfficialNameCandidateIndex{
  ensure(hasPinnedCompanionIdentityEvidence(native)&&
    native.schema===DB02_COMPANION_IDENTITIES_SCHEMA&&
    native.gameVersion==='1.26.2'&&
    native.coverage.specificCampaignLinksVerified===0&&
    Array.isArray(campaigns),'PINNED_ORIGINALS_REQUIRED');
  const byItem=new Map<string,CompanionOfficialNameCandidate[]>();
  const byCampaign=new Map<string,CompanionOfficialNameCandidate[]>();
  const campaignsById=new Map<string,OfficialCampaign>(
    campaigns.map((c:OfficialCampaign)=>[c.campaignId,c] as const)
  );
  const foundIds=new Set<string>();
  let count=0;
  for(const expected of PROPOSED){
    const campaign=campaignsById.get(expected.campaignId);
    const companion=native.getByNativeNameKey(expected.nativeKey);
    ensure(campaign?.kind===expected.campaignKind&&
      campaign.source.kind==='official_publication'&&
      typeof campaign.source.sourceUrl==='string'&&
      campaign.source.sourceUrl.startsWith('https://disneydreamlightvalley.com/')&&
      campaign.rewards.some((r:OfficialCampaign['rewards'][number])=>
        r.name===expected.rewardName&&r.itemId===null)&&
      companion?.sourceNameKeyVerified===true&&
      companion.specificCampaignLinkVerified===false,
      'OFFICIAL_NAME_EVIDENCE_REQUIRED');
    const row:CompanionOfficialNameCandidate=Object.freeze({
      campaignId:expected.campaignId,
      campaignKind:expected.campaignKind,
      rewardName:expected.rewardName,
      itemId:companion.itemId,
      companion,officialSourceUrl:campaign.source.sourceUrl,
      evidence:'native_key_semantic_name_candidate_only' as const,
      originalNativeItemIdVerified:true as const,
      originalNativeNameKeyVerified:true as const,
      officialCampaignRewardNameVerified:true as const,
      officialCampaignNumericItemIdLinkVerified:false as const,
      campaignGrantVerified:false as const,
      currentAvailabilityVerified:false as const,
      playerOwnershipVerified:false as const
    });
    add(byItem,companion.itemId,row);
    add(byCampaign,expected.campaignId,row);
    foundIds.add(companion.itemId);
    count++;
  }
  ensure(count===3&&foundIds.size===2,'CANDIDATE_CENSUS');
  for(const rows of byItem.values())Object.freeze(rows);
  for(const rows of byCampaign.values())Object.freeze(rows);
  return Object.freeze({
    schema:'wand.db02.official-native-companion-name-candidates@1' as const,
    targetVersion:'1.26.2' as const,native,
    coverage:Object.freeze({
      semanticCandidateRelations:3 as const,
      distinctNativeCandidateItemIds:2 as const,
      officialNumericItemIdLinksVerified:0 as const,
      playerGrantsVerified:0 as const,
      nativeNameOnlyNotCampaignProof:true as const
    }),
    getItemCandidates(rawId:string|number){
      return byItem.get(canonicalId(rawId))??EMPTY_CANDIDATES;
    },
    getCampaignCandidates(campaignId:string){
      ensure(typeof campaignId==='string'&&
        /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/.test(campaignId),
        'INVALID_CAMPAIGN_ID');
      return byCampaign.get(campaignId)??EMPTY_CANDIDATES;
    }
  });
}
