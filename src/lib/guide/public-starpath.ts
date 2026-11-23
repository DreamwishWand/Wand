/**
 * DB-03 public Steam v1.26.2 Star Path source snapshot.
 *
 * Two observed seasons are NOT a complete historic season catalog. Only the
 * original SHA-pinned 2026-11-22 cache is published. These rows encode
 * configured rewards, tasks and UTC schedule — not live online availability,
 * a purchased premium pass, a granted reward, or any player's progress.
 */
export const STARPATH_CACHE_SCHEMA='wand.db03.public-starpath-cache@1' as const;
export const STARPATH_SOURCE_SHA=
  '4168d6ec580b04893f701dec5f0509589d39fb2e838d08bac724a9720caecf14' as const;
export const STARPATH_PUBLIC_SHA=
  '78819b4d36042e3c60b576583149e58541d3ca297fa0c3ba8a9a775009614198' as const;
export const STARPATH_PUBLIC_BYTES=34617 as const;
export type PublicStarpathSeasonId='HauntingElegance2026'|'Seafaring2026';
export const STARPATH_PUBLIC_SEASONS:
  readonly PublicStarpathSeasonId[]=Object.freeze([
    'HauntingElegance2026','Seafaring2026'
  ]);

export interface PublicStarpathSource{
  readonly platform:'Steam';
  readonly ownerDeclaredGameVersion:'1.26.2';
  readonly cacheCaptureDate:'2026-11-22';
  readonly fileSha256:typeof STARPATH_SOURCE_SHA;
  readonly sourceBytes:186442;
  readonly sourceType:'owner_private_liveops_cache';
  readonly liveAvailabilityVerified:false;
  readonly seasonCatalogComplete:false;
}
export interface PublicStarpathReward{
  readonly itemId:string;
  readonly amount:number;
  readonly premium:boolean;
  readonly bonus:boolean;
  readonly recurrent:boolean;
  readonly price?:number;
  readonly featuringPriority?:number;
  /** Native Vault alternative, not a second granted item. */
  readonly alternateItemId?:string;
}
export interface PublicStarpathRewardPage{
  readonly page:number;
  readonly layout?:string;
  readonly rewards:readonly PublicStarpathReward[];
  readonly minPurchasedFromPreviousPage?:number;
  readonly currencyConversionPage?:boolean;
}
export interface PublicStarpathTask{
  readonly id:string;
  readonly objectiveKind:string;
  readonly tokenReward:number;
  readonly description:string|null;
  readonly descriptionKey:string|null;
  readonly availableOnDay?:number;
}
export interface PublicStarpathCounts{
  readonly rewardPages:number;
  readonly bonusPages:number;
  readonly normalRewards:number;
  readonly bonusRewards:number;
  readonly vaultRewards:number;
  readonly dailyTasks:number;
  readonly weeklyTasks:number;
  readonly weeks:number;
}
export interface PublicStarpathSeason{
  readonly id:PublicStarpathSeasonId;
  readonly title:string;
  readonly definitionVersion:12602;
  readonly minGameVersion:string;
  readonly locale:'en-US';
  readonly currencyName:string;
  readonly startUtc:string;
  /** Task deadline is exclusive, separate from the reward-exchange deadline. */
  readonly finishUtcExclusive:string;
  readonly endUtcExclusive:string;
  readonly premiumPrice:Readonly<{itemId:string;amount:number}>;
  readonly freeActiveTaskSlots:number;
  readonly premiumActiveTaskSlots:number;
  readonly rewardPages:readonly PublicStarpathRewardPage[];
  readonly bonusPages:readonly PublicStarpathRewardPage[];
  readonly vaultRewards:readonly PublicStarpathReward[];
  readonly tasks:readonly PublicStarpathTask[];
  readonly weeklyTasks:readonly (readonly PublicStarpathTask[])[];
  readonly counts:PublicStarpathCounts;
}
export interface PublicStarpathSnapshot{
  readonly schema:typeof STARPATH_CACHE_SCHEMA;
  readonly source:PublicStarpathSource;
  readonly seasons:readonly PublicStarpathSeason[];
}
type ByteResponse=Pick<Response,'ok'|'arrayBuffer'>;
const ID=/^[1-9][0-9]{0,15}$/;
const DAILY=/^Task[0-9]{2,3}$/;
const WEEKLY=/^Week[0-9]{2}Task[0-9]{2,3}$/;
const UTC_INSTANT=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const EXPECTED=Object.freeze([
  [6,4,34,9,7,121,21,7],
  [2,1,10,1,6,25,18,6]
]);
function check(value:unknown,code:string):asserts value{
  if(!value)throw new TypeError('Public Star Path: '+code);
}
function record(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function nativeId(value:unknown):value is string{
  return typeof value==='string'&&ID.test(value)&&
    Number.isSafeInteger(Number(value));
}
function nonnegative(value:unknown):value is number{
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
}
function positive(value:unknown):value is number{
  return nonnegative(value)&&value>0;
}
function exactUtc(value:unknown):value is string{
  return typeof value==='string'&&UTC_INSTANT.test(value)&&
    Number.isFinite(Date.parse(value))&&
    new Date(value).toISOString().replace('.000Z','Z')===value;
}
function rewardRow(raw:unknown,section:'normal'|'bonus'|'vault'):void{
  check(record(raw)&&nativeId(raw.itemId)&&positive(raw.amount)&&
    typeof raw.premium==='boolean'&&raw.bonus===(section==='bonus')&&
    typeof raw.recurrent==='boolean','reward');
  if(raw.price!==undefined)check(nonnegative(raw.price),'reward price');
  if(raw.featuringPriority!==undefined)
    check(nonnegative(raw.featuringPriority),'reward priority');
  if(raw.alternateItemId!==undefined)
    check(section==='vault'&&nativeId(raw.alternateItemId)&&
      raw.alternateItemId!==raw.itemId,'vault alternative');
}
function rewardPages(value:unknown,section:'normal'|'bonus'):number{
  check(Array.isArray(value),'reward page');
  let total=0;
  for(const page of value){
    check(record(page)&&positive(page.page)&&
      (page.layout===undefined||(typeof page.layout==='string'&&
        page.layout.length>0&&page.layout.length<=100))&&
      Array.isArray(page.rewards),'reward page');
    if(page.minPurchasedFromPreviousPage!==undefined)
      check(nonnegative(page.minPurchasedFromPreviousPage),'previous page threshold');
    if(page.currencyConversionPage!==undefined)
      check(typeof page.currencyConversionPage==='boolean','currency conversion');
    for(const reward of page.rewards){
      rewardRow(reward,section);total++;
    }
  }
  return total;
}
function taskRow(raw:unknown,seasonId:PublicStarpathSeasonId,weekly:boolean):void{
  check(record(raw)&&typeof raw.id==='string'&&
    (weekly?WEEKLY:DAILY).test(raw.id)&&
    typeof raw.objectiveKind==='string'&&raw.objectiveKind.length>0&&
    raw.objectiveKind.length<=100&&nonnegative(raw.tokenReward)&&
    (raw.description===null||typeof raw.description==='string')&&
    (raw.descriptionKey===null||typeof raw.descriptionKey==='string'),
    'task');
  if(weekly){
    check(raw.description===null&&
      raw.descriptionKey==='Liveops.'+seasonId+'_'+raw.id+'_Description',
      'unresolved localization');
  }else check(typeof raw.description==='string'&&
    raw.description.length>0,'daily cached description');
  if(raw.availableOnDay!==undefined)
    check(nonnegative(raw.availableOnDay),'daily availability offset');
}
/**
 * Validate source provenance, exact season census, ORIGINAL reward/Task IDs,
 * UTC-exclusive periods and all source-configured counts. Does not resolve
 * native objective selectors or infer game/player entitlement.
 *
 * Raw JSON is not marked as verified merely because it has matching fields:
 * callers fetching it MUST use loadPublicStarpath (byte count + SHA-256).
 */
export function verifyPublicStarpath(data:unknown):PublicStarpathSnapshot{
  check(record(data)&&data.schema===STARPATH_CACHE_SCHEMA,'schema');
  const source=data.source;
  check(record(source)&&source.fileSha256===STARPATH_SOURCE_SHA&&
    source.sourceBytes===186442&&source.platform==='Steam'&&
    source.ownerDeclaredGameVersion==='1.26.2'&&
    source.cacheCaptureDate==='2026-11-22'&&
    source.sourceType==='owner_private_liveops_cache'&&
    source.liveAvailabilityVerified===false&&
    source.seasonCatalogComplete===false,'provenance');
  check(Array.isArray(data.seasons)&&data.seasons.length===2,'seasons');
  for(let i=0;i<2;i++){
    const season:unknown=data.seasons[i];
    check(record(season)&&season.id===STARPATH_PUBLIC_SEASONS[i]&&
      typeof season.title==='string'&&season.title.length>0&&
      season.locale==='en-US'&&season.definitionVersion===12602&&
      typeof season.minGameVersion==='string'&&
      typeof season.currencyName==='string'&&
      exactUtc(season.startUtc)&&exactUtc(season.finishUtcExclusive)&&
      exactUtc(season.endUtcExclusive)&&
      season.startUtc<season.finishUtcExclusive&&
      season.finishUtcExclusive<season.endUtcExclusive,
      'season identity');
    const counts=season.counts;
    check(record(counts)&&[
      counts.rewardPages,counts.bonusPages,counts.normalRewards,
      counts.bonusRewards,counts.vaultRewards,counts.dailyTasks,
      counts.weeklyTasks,counts.weeks
    ].every((n,j)=>n===EXPECTED[i][j]),'season census');
    check(Array.isArray(season.rewardPages)&&
      season.rewardPages.length===counts.rewardPages&&
      Array.isArray(season.bonusPages)&&
      season.bonusPages.length===counts.bonusPages&&
      Array.isArray(season.vaultRewards)&&
      season.vaultRewards.length===counts.vaultRewards&&
      Array.isArray(season.tasks)&&season.tasks.length===counts.dailyTasks&&
      Array.isArray(season.weeklyTasks)&&
      season.weeklyTasks.length===counts.weeks,'season collections');
    check(record(season.premiumPrice)&&
      nativeId(season.premiumPrice.itemId)&&
      positive(season.premiumPrice.amount)&&
      nonnegative(season.freeActiveTaskSlots)&&
      nonnegative(season.premiumActiveTaskSlots),'premium access source');
    check(rewardPages(season.rewardPages,'normal')===counts.normalRewards&&
      rewardPages(season.bonusPages,'bonus')===counts.bonusRewards,
      'source reward census');
    for(const row of season.vaultRewards)rewardRow(row,'vault');
    const taskIds=new Set<string>();
    for(const raw of season.tasks){
      taskRow(raw,season.id as PublicStarpathSeasonId,false);
      const id=(raw as PublicStarpathTask).id;
      check(!taskIds.has(id),'duplicate task');taskIds.add(id);
    }
    let weeklyCount=0;
    for(const [weekIndex,week] of season.weeklyTasks.entries()){
      check(Array.isArray(week),'weekly tasks');
      for(const raw of week){
        taskRow(raw,season.id as PublicStarpathSeasonId,true);
        const id=(raw as PublicStarpathTask).id;
        check(id.startsWith('Week'+String(weekIndex+1).padStart(2,'0')+'Task'),
          'weekly source position');
        check(!taskIds.has(id),'duplicate task');taskIds.add(id);
        weeklyCount++;
      }
    }
    check(weeklyCount===counts.weeklyTasks&&
      taskIds.size===counts.dailyTasks+counts.weeklyTasks,
      'weekly census');
  }
  return data as unknown as PublicStarpathSnapshot;
}
/** Fetch the one SHA-pinned public projection without private game files. */
export async function loadPublicStarpath(
  url:string,fetcher:(url:string)=>Promise<ByteResponse>=fetch
):Promise<PublicStarpathSnapshot>{
  const response=await fetcher(url);check(response.ok,'download failed');
  const raw=await response.arrayBuffer();
  check(raw.byteLength===STARPATH_PUBLIC_BYTES,'publication size mismatch');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  check(hash===STARPATH_PUBLIC_SHA,'publication fingerprint mismatch');
  return verifyPublicStarpath(JSON.parse(new TextDecoder('utf-8',{
    fatal:true
  }).decode(raw)));
}
