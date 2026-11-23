/**
 * DB-03 source-backed reward origin graph shared by Guide, Collection and DB-02.
 *
 * Does not define new item IDs or season/event IDs: all IDs originate in the
 * pinned public Steam cache, existing Guide calendar, or DB-01 catalog.
 * These edges describe configured source candidates, never an owned item,
 * guaranteed grant, currently open event, or purchased premium pass.
 */
import {loadPublicStarpath,verifyPublicStarpath,STARPATH_SOURCE_SHA,STARPATH_PUBLIC_SHA}
  from './public-starpath.ts';
import {guideCalendarEvents} from './event-calendar.ts';
import type {Db01CatalogClient,Db01Item} from '../items/index';

export const DB03_REWARD_RELATION_CONTRACT='wand.db03.reward-relations@1' as const;
export type GuideRewardSection='normal'|'bonus'|'vault';
export type GuideItemRelationRole='configured_reward'|'vault_alternative_candidate'|'premium_access_currency';

interface RawReward {
  itemId:string;
  amount:number;
  premium:boolean;
  bonus:boolean;
  recurrent:boolean;
  price?:number;
  featuringPriority?:number;
  alternateItemId?:string;
}
interface RawPage {
  page:number;
  rewards:RawReward[];
  minPurchasedFromPreviousPage?:number;
  currencyConversionPage?:boolean;
}
interface RawSeason {
  id:string;
  title:string;
  definitionVersion:number;
  minGameVersion?:string|number;
  currencyName:string;
  startUtc:string;
  finishUtcExclusive:string;
  endUtcExclusive:string;
  premiumPrice:{itemId:string;amount:number};
  rewardPages:RawPage[];
  bonusPages:RawPage[];
  vaultRewards:RawReward[];
}
interface RawSnapshot {
  source:{platform:string;ownerDeclaredGameVersion:string;cacheCaptureDate:string;
    seasonCatalogComplete:false;liveAvailabilityVerified:false};
  seasons:RawSeason[];
}
interface CalendarEvent {
  id:string;
  kind:string;
  sourceSeasonId?:string;
}

export interface GuideStarpathSeason {
  readonly id:string;
  readonly eventId:string;
  readonly title:string;
  readonly definitionVersion:number;
  readonly currencyName:string;
  readonly startUtc:string;
  readonly taskEndUtcExclusive:string;
  readonly endUtcExclusive:string;
  readonly premiumAccessCurrencyItemId:string;
  readonly premiumAccessCost:number;
}
export interface GuideRewardOccurrence {
  /** Source-stable per-slot identity. DO NOT collapse equal item IDs. */
  readonly occurrenceId:string;
  readonly seasonId:string;
  readonly eventId:string;
  readonly section:GuideRewardSection;
  readonly page:number|null;
  readonly slot:number;
  readonly itemId:string;
  readonly amount:number;
  readonly premium:boolean;
  readonly bonus:boolean;
  readonly recurrent:boolean;
  readonly price?:number;
  readonly featuringPriority?:number;
  readonly alternateItemId?:string;
  readonly currencyName:string;
  readonly minPurchasedFromPreviousPage?:number;
  readonly currencyConversionPage:boolean;
}
export interface GuideRewardGroup {
  readonly key:string;
  readonly section:GuideRewardSection;
  readonly page:number|null;
  readonly minPurchased?:number;
  readonly currencyConversionPage:boolean;
  readonly rewards:readonly GuideRewardOccurrence[];
}
export interface GuideItemRelation {
  readonly itemId:string;
  readonly seasonId:string;
  readonly eventId:string;
  readonly role:GuideItemRelationRole;
  readonly occurrenceId:string|null;
  readonly occurrence:GuideRewardOccurrence|null;
  readonly configuredRewardOnly:true;
  readonly guaranteedGrant:false;
  readonly currentAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
}
export interface GuideRewardCoverage {
  readonly knownSeasonCount:number;
  readonly recordedRewardSlots:number;
  readonly distinctPrimaryRewardIds:number;
  readonly distinctRelatedItemIds:number;
  readonly knownEventCount:number;
  readonly historicalSeasonCatalogComplete:false;
  readonly playerProgressIncluded:false;
  readonly currentAvailabilityVerified:false;
  readonly questRewardRelations:'not_in_published_starpath_snapshot';
  readonly otherEventRewardRelations:'not_in_published_starpath_snapshot';
}
export interface GuideRewardEvidence {
  readonly platform:'Steam';
  readonly gameVersion:'1.26.2';
  readonly capturedDate:string;
  readonly liveopsSourceSha256:string;
  readonly publicProjectionSha256:string;
  readonly integrity:'source_structure_only'|'pinned_public_sha256';
}
export interface GuideEventRewards {
  readonly eventId:string;
  readonly coverage:'source_recorded'|'event_known_rewards_unpublished'|'event_not_in_verified_calendar';
  readonly rewards:readonly GuideRewardOccurrence[];
}
export interface GuideQuestRewards {
  readonly questId:string;
  readonly coverage:'private_quest_reward_source_required';
  readonly rewards:readonly never[];
}
export interface GuideRewardIndex {
  readonly contract:typeof DB03_REWARD_RELATION_CONTRACT;
  readonly evidence:Readonly<GuideRewardEvidence>;
  readonly coverage:Readonly<GuideRewardCoverage>;
  readonly seasons:readonly GuideStarpathSeason[];
  readonly occurrences:readonly GuideRewardOccurrence[];
  readonly itemIds:readonly string[];
  getSeason(seasonId:string):GuideStarpathSeason|null;
  getSeasonGroups(seasonId:string):readonly GuideRewardGroup[];
  getSeasonRewards(seasonId:string):readonly GuideRewardOccurrence[];
  getItemRelations(itemId:string|number):readonly GuideItemRelation[];
  /** DB-02 import surface: excludes unawarded Vault alternatives and premium currency. */
  getItemAcquisitionCandidates(itemId:string|number):readonly GuideItemRelation[];
  getEventRewards(eventId:string):GuideEventRewards;
  /** Explicitly unknown, not "zero rewards": private Mission source not shipped. */
  getQuestRewards(questId:string):GuideQuestRewards;
}

const GAME_ITEM_ID=/^[1-9][0-9]{0,15}$/;
const QUEST_ID=/^[1-9][0-9]{0,15}$/;
const EMPTY_GROUPS=Object.freeze([]) as readonly GuideRewardGroup[];
const EMPTY_REWARDS=Object.freeze([]) as readonly GuideRewardOccurrence[];
const EMPTY_RELATIONS=Object.freeze([]) as readonly GuideItemRelation[];
const EMPTY_QUEST=Object.freeze([]) as readonly never[];
function fail(message:string):never{throw new TypeError('DB03_REWARD_'+message);}
function check(value:unknown,message:string):asserts value{if(!value)fail(message);}
function canonicalItemId(value:string|number):string {
  const s=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;
  check(typeof s==='string'&&GAME_ITEM_ID.test(s)&&Number.isSafeInteger(Number(s)),'INVALID_ITEM_ID');
  return s;
}
function verifyReward(reward:RawReward,section:GuideRewardSection):void{
  check(reward!==null&&typeof reward==='object'&&!Array.isArray(reward),'INVALID_REWARD');
  canonicalItemId(reward.itemId);
  check(Number.isSafeInteger(reward.amount)&&reward.amount>0,'INVALID_REWARD_AMOUNT');
  check(typeof reward.premium==='boolean'&&typeof reward.bonus==='boolean'&&
    typeof reward.recurrent==='boolean'&&reward.bonus===(section==='bonus'),'INVALID_REWARD_FLAGS');
  check(reward.price===undefined||(Number.isSafeInteger(reward.price)&&reward.price>=0),'INVALID_PRICE');
  check(reward.featuringPriority===undefined||
    (Number.isSafeInteger(reward.featuringPriority)&&reward.featuringPriority>=0),'INVALID_PRIORITY');
  check(reward.alternateItemId===undefined||(section==='vault'&&
    canonicalItemId(reward.alternateItemId)!==reward.itemId),'INVALID_VAULT_ALTERNATIVE');
}
const freeze=<T extends object>(x:T):Readonly<T>=>Object.freeze(x);

/**
 * Synchronous projection for an already source-verified public cache, or for
 * offline source validation tests. This entry point checks schema and provenance
 * but does not itself hash input bytes: use loadGuideRewardIndex() when fetching.
 */
function buildRewardIndex(snapshot:unknown,integrity:'source_structure_only'|'pinned_public_sha256'):GuideRewardIndex {
  const raw=verifyPublicStarpath(snapshot) as unknown as RawSnapshot;
  const calendar=guideCalendarEvents(raw) as CalendarEvent[];
  const starpathCalendar=calendar.filter(e=>e.kind==='starpath');
  check(starpathCalendar.length===raw.seasons.length,'EVENT_MISMATCH');

  const seasonRows:GuideStarpathSeason[]=[];
  const occurrences:GuideRewardOccurrence[]=[];
  const seasonGroups=new Map<string,readonly GuideRewardGroup[]>();
  const seasonRewards=new Map<string,readonly GuideRewardOccurrence[]>();
  const events=new Map<string,GuideStarpathSeason>();
  const byItem=new Map<string,GuideItemRelation[]>();
  const occurrenceIds=new Set<string>();

  function relation(id:string,seasonId:string,eventId:string,role:GuideItemRelationRole,occurrence:GuideRewardOccurrence|null){
    const ref=freeze({
      itemId:canonicalItemId(id),seasonId,eventId,role,
      occurrenceId:occurrence?.occurrenceId??null,occurrence,
      configuredRewardOnly:true as const,guaranteedGrant:false as const,
      currentAvailabilityVerified:false as const,playerOwnershipVerified:false as const
    });
    const rows=byItem.get(ref.itemId)??[];
    rows.push(ref);
    byItem.set(ref.itemId,rows);
  }

  for(const season of raw.seasons){
    const event=starpathCalendar.find(e=>e.sourceSeasonId===season.id);
    check(event&&typeof event.id==='string'&&!events.has(event.id),'INVALID_EVENT_ID');
    const eventId=event.id;
    check(typeof season.currencyName==='string'&&season.currencyName.length>0,'INVALID_TOKEN_CURRENCY');
    const premiumCurrency=canonicalItemId(season.premiumPrice.itemId);
    check(Number.isSafeInteger(season.premiumPrice.amount)&&season.premiumPrice.amount>0,'INVALID_PREMIUM_PRICE');
    const summary=freeze({
      id:season.id,eventId:eventId,title:season.title,
      definitionVersion:season.definitionVersion,currencyName:season.currencyName,
      startUtc:season.startUtc,taskEndUtcExclusive:season.finishUtcExclusive,
      endUtcExclusive:season.endUtcExclusive,
      premiumAccessCurrencyItemId:premiumCurrency,premiumAccessCost:season.premiumPrice.amount
    });
    seasonRows.push(summary);
    events.set(summary.eventId,summary);
    const groups:GuideRewardGroup[]=[];
    function addGroup(section:GuideRewardSection,page:number|null,source:readonly RawReward[],
      meta?:{minPurchasedFromPreviousPage?:number;currencyConversionPage?:boolean}):void {
      check(Array.isArray(source)&&source.length>0,'EMPTY_REWARD_GROUP');
      check(page===null||(Number.isSafeInteger(page)&&page>0),'INVALID_REWARD_PAGE');
      if(meta?.minPurchasedFromPreviousPage!==undefined)
        check(Number.isSafeInteger(meta.minPurchasedFromPreviousPage)&&meta.minPurchasedFromPreviousPage>=0,
          'INVALID_PAGE_UNLOCK_COUNT');
      const key=section==='vault'?'vault':section+'-'+page;
      check(!groups.some(g=>g.key===key),'DUPLICATE_REWARD_GROUP');
      const slots=source.map((r,i)=>{
        verifyReward(r,section);
        const occurrenceId=season.id+'/'+key+'/'+(i+1);
        check(!occurrenceIds.has(occurrenceId),'DUPLICATE_REWARD_SLOT');
        occurrenceIds.add(occurrenceId);
        const occurrence:GuideRewardOccurrence=freeze({
          occurrenceId,seasonId:season.id,eventId:eventId,section,page,slot:i+1,
          itemId:r.itemId,amount:r.amount,premium:r.premium,bonus:r.bonus,
          recurrent:r.recurrent,
          ...(r.price===undefined?{}:{price:r.price}),
          ...(r.featuringPriority===undefined?{}:{featuringPriority:r.featuringPriority}),
          ...(r.alternateItemId===undefined?{}:{alternateItemId:r.alternateItemId}),
          currencyName:season.currencyName,
          ...(meta?.minPurchasedFromPreviousPage===undefined?{}:
            {minPurchasedFromPreviousPage:meta.minPurchasedFromPreviousPage}),
          currencyConversionPage:meta?.currencyConversionPage===true
        });
        occurrences.push(occurrence);
        relation(r.itemId,season.id,eventId,'configured_reward',occurrence);
        if(r.alternateItemId)relation(r.alternateItemId,season.id,eventId,
          'vault_alternative_candidate',occurrence);
        return occurrence;
      });
      groups.push(freeze({
        key,section,page,
        ...(meta?.minPurchasedFromPreviousPage===undefined?{}:
          {minPurchased:meta.minPurchasedFromPreviousPage}),
        currencyConversionPage:meta?.currencyConversionPage===true,
        rewards:freeze(slots)
      }));
    }
    season.rewardPages.forEach(page=>addGroup('normal',page.page,page.rewards,page));
    season.bonusPages.forEach(page=>addGroup('bonus',page.page,page.rewards,page));
    addGroup('vault',null,season.vaultRewards);
    relation(premiumCurrency,season.id,eventId,'premium_access_currency',null);
    seasonGroups.set(season.id,freeze(groups));
    seasonRewards.set(season.id,freeze(groups.flatMap(group=>group.rewards)));
  }
  // These numbers are observed in exactly this pinned v1.26.2 owner cache;
  // a future cache requires a separately reviewed versioned source contract.
  check(occurrences.length===67&&new Set(occurrences.map(r=>r.itemId)).size===58&&
    byItem.size===60,'SOURCE_REWARD_CENSUS');
  const allOccurrences=freeze(occurrences);
  const allSeasons=freeze(seasonRows);
  const ids=freeze([...byItem.keys()].sort((a,b)=>Number(a)-Number(b)));
  for(const [id,rows] of byItem)byItem.set(id,freeze(rows) as GuideItemRelation[]);
  const coverage:GuideRewardCoverage=freeze({
    knownSeasonCount:allSeasons.length,recordedRewardSlots:allOccurrences.length,
    distinctPrimaryRewardIds:58,distinctRelatedItemIds:ids.length,
    knownEventCount:calendar.length,historicalSeasonCatalogComplete:false,
    playerProgressIncluded:false,currentAvailabilityVerified:false,
    questRewardRelations:'not_in_published_starpath_snapshot',
    otherEventRewardRelations:'not_in_published_starpath_snapshot'
  });
  const evidence:GuideRewardEvidence=freeze({
    platform:'Steam',gameVersion:'1.26.2',capturedDate:raw.source.cacheCaptureDate,
    liveopsSourceSha256:STARPATH_SOURCE_SHA,publicProjectionSha256:STARPATH_PUBLIC_SHA,integrity
  });
  function existingSeason(id:string):string|null {
    return typeof id==='string'&&seasonGroups.has(id)?id:null;
  }
  return freeze({
    contract:DB03_REWARD_RELATION_CONTRACT,evidence,coverage,
    seasons:allSeasons,occurrences:allOccurrences,itemIds:ids,
    getSeason:(id:string)=>allSeasons.find(s=>s.id===id)??null,
    getSeasonGroups:(id:string)=>seasonGroups.get(existingSeason(id)??'')??EMPTY_GROUPS,
    getSeasonRewards:(id:string)=>seasonRewards.get(existingSeason(id)??'')??EMPTY_REWARDS,
    getItemRelations:(id:string|number)=>byItem.get(canonicalItemId(id))??EMPTY_RELATIONS,
    getItemAcquisitionCandidates:(id:string|number)=>
      freeze((byItem.get(canonicalItemId(id))??EMPTY_RELATIONS).filter(r=>r.role==='configured_reward')),
    getEventRewards:(eventId:string):GuideEventRewards=>{
      const season=events.get(eventId);
      if(season)return freeze({
        eventId,coverage:'source_recorded' as const,
        rewards:seasonRewards.get(season.id)??EMPTY_REWARDS
      });
      return freeze({
        eventId,
        coverage:calendar.some(e=>e.id===eventId)
          ?'event_known_rewards_unpublished' as const:'event_not_in_verified_calendar' as const,
        rewards:EMPTY_REWARDS
      });
    },
    getQuestRewards:(questId:string):GuideQuestRewards=>{
      check(typeof questId==='string'&&QUEST_ID.test(questId),'INVALID_QUEST_ID');
      return freeze({
        questId,coverage:'private_quest_reward_source_required' as const,rewards:EMPTY_QUEST
      });
    }
  });
}

/** Structural validation only: callers may supply a locally loaded snapshot. */
export function createGuideRewardIndex(snapshot:unknown):GuideRewardIndex{
  return buildRewardIndex(snapshot,'source_structure_only');
}
/** Only this entry point checks the SHA-256 of the published projection bytes. */
export async function loadGuideRewardIndex(url:string,fetcher:typeof fetch=fetch):Promise<GuideRewardIndex>{
  const snapshot=await loadPublicStarpath(url,fetcher);
  return buildRewardIndex(snapshot,'pinned_public_sha256');
}

/**
 * Optional *local/private* DB-01 membership join. The shared canonical Item ID
 * is not redefined, no universe classification is invented, and nothing uploads
 * or publishes DB-01's private category/locale shards.
 */
export interface GuideDb01ItemMembership {
  readonly itemId:string;
  readonly item:Readonly<Db01Item>|null;
  readonly status:'present_in_supplied_db01'|'not_in_supplied_db01';
  readonly sourceRelations:readonly GuideItemRelation[];
}
export async function joinGuideRewardsToDb01(
  guide:GuideRewardIndex,
  db01:Pick<Db01CatalogClient,'getItems'>
):Promise<readonly GuideDb01ItemMembership[]>{
  check(guide?.contract===DB03_REWARD_RELATION_CONTRACT,'INVALID_REWARD_INDEX');
  check(db01&&typeof db01.getItems==='function','DB01_CLIENT_REQUIRED');
  const numericIds=guide.itemIds.map(id=>Number(id));
  const rows=await db01.getItems(numericIds);
  check(Array.isArray(rows)&&rows.length===numericIds.length,'DB01_LOOKUP_MISMATCH');
  return freeze(guide.itemIds.map((id,i)=>{
    const row=rows[i]??null;
    check(row===null||(row.itemId===numericIds[i]),'DB01_IDENTITY_MISMATCH');
    return freeze({
      itemId:id,item:row,
      status:row===null?'not_in_supplied_db01' as const:'present_in_supplied_db01' as const,
      sourceRelations:guide.getItemRelations(id)
    });
  }));
}
