/**
 * DB-02 Steam 1.26.2 SRC-02 r5 native acquisition-origin projection.
 * Reuse source-attested private getItem() rather than parsing activity tables.
 *
 * LootTable entries in r5 are ALWAYS unverified context candidates (3,804);
 * they must never become confirmed drops. Static stall pools are not live stock.
 */
import type {
  ItemOrigin, OriginKind, OriginProvenance, NativeOriginDetails
} from './origins.ts';
import {
  loadPrivateSrc02BrowserBundle,
  CURRENT_STEAM_1262_CONDITION_SHA256,
  type Src02IndependentPin
} from './private-browser-bundle.mjs';

const SRC02_MANIFEST_SHA='ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c';
const SRC02_CONTRACT='wand.src02.private-browser-bundle@1';
const MAX_ITEMS=20000;
const ID=/^[1-9][0-9]{0,15}$/;
const KEY=/^[a-zA-Z0-9][a-zA-Z0-9:._\/-]{0,127}$/;
const SHA=/^[a-f0-9]{64}$/;
const SOURCE:OriginProvenance=Object.freeze({
  sourceId:'src02:steam-1262:r5',kind:'verified_game_native',
  sourceUrl:'/private/src-02-acquisition/r5',
  checkedOn:'2026-11-21',gameVersion:'1.26.2',sha256:SRC02_MANIFEST_SHA
});
const STRUCTURAL_SOURCE:OriginProvenance=Object.freeze({
  ...SOURCE,sourceId:'src02:structure-only:r5',
  kind:'unhashed_structural_candidate',sha256:null
});
/** Only admission through the owner-local SHA-pinned loader grants this brand. */
const VERIFIED_BUNDLES=new WeakSet<object>();
/** Runtime source identity: flags and copied digests alone are insufficient. */
export function hasPinnedSrc02OriginReader(input:unknown):input is VerifiedSrc02OriginReader{
  return input!==null&&typeof input==='object'&&VERIFIED_BUNDLES.has(input);
}

/** Never fetch or publish original game files: caller supplies local archive bytes. */
export async function loadVerifiedSrc02OriginReader(
  archive:Uint8Array,trusted:Src02IndependentPin
):Promise<VerifiedSrc02OriginReader>{
  assert(trusted?.manifestSha256===SRC02_MANIFEST_SHA &&
    trusted.currentConditionSha256===CURRENT_STEAM_1262_CONDITION_SHA256,
    'EXACT_R5_TRUST_REQUIRED');
  const reader=await loadPrivateSrc02BrowserBundle(archive,trusted);
  assert(reader.manifestSha256===SRC02_MANIFEST_SHA &&
    reader.counts?.acquisitions===4567 &&
    reader.counts?.recipes===1943 &&
    reader.counts?.shopOffersVerified===0 &&
    reader.counts?.linkedItemIds===3342,
    'SOURCE_R5_CENSUS');
  VERIFIED_BUNDLES.add(reader);
  return reader;
}

export interface VerifiedSrc02OriginReader {
  readonly contract:string;
  readonly manifestSha256:string;
  readonly privateSource:boolean;
  readonly publishable:boolean;
  readonly verified:boolean;
  readonly provenanceMatched:boolean;
  readonly currentShopOffersVerified:boolean;
  readonly currentAvailabilityVerified:boolean;
  readonly source:{readonly platform:string;readonly gameVersion:string};
  getItem(id:number):unknown;
}
type Data=Record<string,unknown>;
function object(value:unknown):value is Data{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function assert(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('DB02_NATIVE_ORIGINS_'+reason);
}
function row(value:unknown):Data{
  assert(object(value),'INVALID_ROW');return value;
}
function id(raw:unknown):string{
  const value=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  assert(typeof value==='string'&&ID.test(value)&&Number.isSafeInteger(Number(value)),
    'INVALID_ITEM_ID');
  return value;
}
function key(raw:unknown):string{
  assert(typeof raw==='string'&&KEY.test(raw),'INVALID_ROUTE_ID');return raw;
}
function optionalNonnegative(raw:unknown):number|null{
  if(raw===null||raw===undefined)return null;
  assert(Number.isSafeInteger(raw)&&typeof raw==='number'&&raw>=0,'NATIVE_NUMBER');
  return raw;
}
function positiveNumber(raw:unknown):number{
  assert(typeof raw==='number'&&Number.isFinite(raw)&&raw>0,'POSITIVE_NUMBER');
  return raw;
}
function optionalId(raw:unknown):string|null{
  return raw===null||raw===undefined?null:id(raw);
}
function numbers(raw:unknown):readonly number[]{
  assert(Array.isArray(raw)&&raw.every(v=>typeof v==='number'&&
    Number.isSafeInteger(v)&&v>=0),'INVALID_AREA_OR_SCENE_CODES');
  return Object.freeze([...raw]);
}
function words(raw:unknown):readonly string[]{
  assert(Array.isArray(raw)&&raw.every(v=>typeof v==='string'&&v.length>0),
    'INVALID_ACTIVITY_TAGS');
  return Object.freeze([...raw]);
}
function conditions(data:Data):readonly string[]{
  const digest=data.conditionDigest;
  assert(digest===null||digest===undefined||(typeof digest==='string'&&SHA.test(digest)),
    'INVALID_CONDITION_DIGEST');
  return digest?Object.freeze(['Native condition gate (not evaluated): '+digest]):
    Object.freeze([]);
}
const TYPES:Readonly<Record<string,{kind:OriginKind;file:string;confirmed:boolean}>>=
  Object.freeze({
    fishing:{kind:'fishing',file:'itemlist/ActivityData.json',confirmed:true},
    mining:{kind:'mining',file:'itemlist/ActivityData.json',confirmed:true},
    growing:{kind:'farming',file:'itemlist/ActivityItem.json',confirmed:true},
    timebending:{kind:'timebending',file:'itemlist/ActivityData.json',confirmed:true},
    loot_table_candidate:{kind:'loot',file:'itemlist/LootTable.json',confirmed:false}
  });
const EMPTY_NUMBER=Object.freeze([]) as readonly number[];
const EMPTY_WORDS=Object.freeze([]) as readonly string[];

function activityDetails(raw:Data):NativeOriginDetails{
  const type=raw.type;
  assert(typeof type==='string'&&TYPES[type]!==undefined,'UNSUPPORTED_NATIVE_PATH');
  const shape=TYPES[type];
  const provenance=row(raw.source);
  // Growing rows in original r5 intentionally omit top-level definitionId;
  // the source-verified ActivityItem definition ID is in source.definitionId.
  const definitionId=id(raw.definitionId??provenance.definitionId);
  assert(provenance.kind==='game_native'&&provenance.file===shape.file&&
    id(provenance.definitionId)===definitionId,'PATH_SOURCE');
  const sourcePathId=key(raw.pathId);
  assert(sourcePathId.startsWith((type==='loot_table_candidate'?'loot':type)+':'),
    'PATH_PREFIX');
  const isLoot=type==='loot_table_candidate';
  if(isLoot){
    assert(raw.contextVerified===false,'LOOT_CONTEXT_UNVERIFIED_REQUIRED');
    assert(optionalNonnegative(raw.groupIndex)!==null,'LOOT_GROUP');
  }
  let areaIds:readonly number[]=EMPTY_NUMBER;
  let sceneIds:readonly number[]=EMPTY_NUMBER;
  let rarity:number|null=null,seedItemId:string|null=null;
  let growthSeconds:number|null=null,yieldedQuantity:number|null=null;
  let minHourglassLevel:number|null=null;
  let amountRange:Readonly<{min:number;max:number}>|null=null;
  let weathers:readonly string[]=EMPTY_WORDS,timeOfDays:readonly string[]=EMPTY_WORDS;

  if(type==='fishing'){
    areaIds=numbers(raw.areaIds);
    rarity=optionalNonnegative(raw.rarity);
    weathers=words(raw.weathers);
    timeOfDays=words(raw.timeOfDays);
  }else if(type==='mining'){
    const a=optionalNonnegative(raw.areaId),s=optionalNonnegative(raw.sceneId);
    areaIds=a===null?EMPTY_NUMBER:Object.freeze([a]);
    sceneIds=s===null?EMPTY_NUMBER:Object.freeze([s]);
    rarity=optionalNonnegative(raw.rarity);
  }else if(type==='growing'){
    seedItemId=id(raw.seedItemId);
    areaIds=numbers(raw.villageAreaIds);
    growthSeconds=positiveNumber(raw.growthSeconds);
    yieldedQuantity=positiveNumber(raw.producedAmount);
    assert(Number.isSafeInteger(yieldedQuantity),'GROWING_YIELD');
  }else if(type==='timebending'){
    assert(Array.isArray(raw.locations),'TIMEBENDING_LOCATIONS');
    const areas:number[]=[],scenes:number[]=[];
    for(const location of raw.locations){
      const point=row(location);
      const a=optionalNonnegative(point.areaId),s=optionalNonnegative(point.sceneId);
      if(a!==null&&!areas.includes(a))areas.push(a);
      if(s!==null&&!scenes.includes(s))scenes.push(s);
    }
    areaIds=Object.freeze(areas);sceneIds=Object.freeze(scenes);
    minHourglassLevel=optionalNonnegative(raw.minHourglassLevel);
    if(raw.minMax!==null&&raw.minMax!==undefined){
      const range=row(raw.minMax);
      const min=optionalNonnegative(range.min),max=optionalNonnegative(range.max);
      assert(min!==null&&max!==null&&min<=max,'TIMEBENDING_AMOUNT_RANGE');
      amountRange=Object.freeze({min,max});
    }
  }

  return Object.freeze({
    family:type as NativeOriginDetails['family'],
    pathId:sourcePathId,definitionId,sourceFile:shape.file,
    areaIds,sceneIds,rarity,weathers,timeOfDays,seedItemId,
    growthSeconds,yieldedQuantity,minHourglassLevel,amountRange,
    lootTableId:isLoot?definitionId:null,
    lootGroupIndex:isLoot?optionalNonnegative(raw.groupIndex):null,
    lootContextVerified:isLoot?false:null,
    stallId:null,stallSlotIndex:null,
    candidateGroupIndexes:EMPTY_NUMBER,conditionalFilter:null
  });
}
function stallDetails(stall:Data,slot:Data|null):NativeOriginDetails{
  const stallId=id(stall.stallId);
  assert(stall.status==='static_candidate_not_verified_for_sale',
    'STALL_NOT_STATIC');
  const slotIndex=slot===null?null:optionalNonnegative(slot.slotIndex);
  const lootTableId=slot===null?null:id(slot.lootTableId);
  assert(slot===null||(slotIndex!==null&&Array.isArray(slot.candidateGroupIndexes)),
    'STALL_LOOT_SLOT');
  const groupIndexes=slot===null?EMPTY_NUMBER:numbers(slot.candidateGroupIndexes);
  return Object.freeze({
    family:'static_stall_candidate',
    pathId:slot===null?'stall:'+stallId:
      'stall:'+stallId+':slot:'+slotIndex+':loot:'+lootTableId,
    definitionId:lootTableId,
    sourceFile:'itemlist/LootTable.json',
    areaIds:EMPTY_NUMBER,sceneIds:EMPTY_NUMBER,rarity:null,
    weathers:EMPTY_WORDS,timeOfDays:EMPTY_WORDS,
    seedItemId:null,growthSeconds:null,yieldedQuantity:null,
    minHourglassLevel:null,amountRange:null,
    lootTableId,lootGroupIndex:null,lootContextVerified:null,
    stallId,stallSlotIndex:slotIndex,candidateGroupIndexes:groupIndexes,
    conditionalFilter:typeof stall.hasConditionalFilter==='boolean'?
      stall.hasConditionalFilter:null
  });
}

/**
 * Source-pinned r5 data are interpreted strictly by known original definitions.
 * Returns all native paths including 3,804 non-contextual LootTable candidates,
 * preserving fishing/mining area codes and seed/crop/timebending facts.
 * Static stall candidate slots never masquerade as current offers.
 */
function projectSrc02(
  bundle:VerifiedSrc02OriginReader,
  itemIds:readonly (number|string)[],
  attested:boolean
):readonly ItemOrigin[]{
  if(!bundle||bundle.contract!==SRC02_CONTRACT||
    bundle.manifestSha256!==SRC02_MANIFEST_SHA||
    bundle.privateSource!==true||bundle.publishable!==false||
    bundle.verified!==true||bundle.provenanceMatched!==true||
    bundle.currentShopOffersVerified!==false||
    bundle.currentAvailabilityVerified!==false||
    bundle.source?.platform!=='Steam'||bundle.source?.gameVersion!=='1.26.2'||
    typeof bundle.getItem!=='function')
    throw new TypeError('DB02_NATIVE_ORIGINS_VERIFIED_PRIVATE_R5_REQUIRED');
  if(attested)assert(VERIFIED_BUNDLES.has(bundle),'PINNED_SOURCE_REQUIRED');
  assert(Array.isArray(itemIds)&&itemIds.length<=MAX_ITEMS,'ID_BATCH_LIMIT');
  const keys=[...new Set(itemIds.map(id))];
  const provenance=attested?SOURCE:STRUCTURAL_SOURCE;
  const output:ItemOrigin[]=[];
  const unique=new Set<string>();
  function append(originId:string,itemId:string,kind:OriginKind,
    status:'confirmed_source_link'|'static_candidate_only',name:string,
    amount:number|null,conditionList:readonly string[],
    nativeDetails?:NativeOriginDetails):void{
    const key=originId+'\0'+itemId;
    if(unique.has(key))return;
    unique.add(key);
    output.push(Object.freeze({
      originId,itemId,kind,
      routeStatus:attested?status:'static_candidate_only',campaignId:null,
      name,productId:null,quantity:amount,price:null,accessTier:'not_applicable',
      window:Object.freeze({start:null,endExclusive:null}),
      salePeriods:EMPTY_NUMBER as readonly never[],
      conditions:Object.freeze([...conditionList]),source:provenance,
      ...(nativeDetails===undefined?{}:{nativeDetails}),
      availability:'not_live_verified'
    }));
  }
  for(const requested of keys){
    const itemId=id(requested);
    const raw=bundle.getItem(Number(itemId));
    if(raw===null||raw===undefined)continue;
    const source=row(raw);
    if(source.itemId!==undefined&&id(source.itemId)!==itemId)
      throw new TypeError('DB02_NATIVE_ORIGINS_WRONG_ITEM');
    if(source.status==='unresolved_or_no_verified_link'&&
      !Array.isArray(source.possibleStalls))continue;
    for(const recipe of Array.isArray(source.madeBy)?source.madeBy:[]){
      const r=row(recipe);
      assert(r.type==='crafting'||r.type==='cooking','RECIPE_TYPE');
      assert(id(r.resultItemId)===itemId,'RECIPE_ITEM');
      const recipeId=id(r.recipeId);
      const amount=r.resultQuantity==null?null:positiveNumber(r.resultQuantity);
      assert(amount===null||Number.isSafeInteger(amount),'RECIPE_YIELD');
      append('native:recipe:'+recipeId,itemId,r.type,'confirmed_source_link',
        typeof r.nameKey==='string'?r.nameKey:r.type+' recipe',
        amount,conditions(r));
    }
    for(const path of Array.isArray(source.acquisitionPaths)?source.acquisitionPaths:[]){
      const r=row(path);
      assert(id(r.itemId)===itemId,'PATH_ITEM');
      const context=activityDetails(r);
      const descriptor=TYPES[context.family];
      let amount:number|null=null;
      if(context.family==='growing')amount=context.yieldedQuantity;
      if(context.family==='timebending'&&r.amount!==null&&r.amount!==undefined){
        amount=positiveNumber(r.amount);
        assert(Number.isSafeInteger(amount),'TIMEBENDING_YIELD');
      }
      const status=descriptor.confirmed?'confirmed_source_link':'static_candidate_only';
      const extra=context.family==='loot_table_candidate'?[
        'Native LootTable candidate; source does not verify a gameplay acquisition context',
        'Loot group index: '+context.lootGroupIndex
      ]:[];
      if(context.family==='growing')
        extra.push('Requires seed Item ID: '+context.seedItemId);
      append('native:path:'+context.pathId,itemId,descriptor.kind,status,
        typeof r.nameKey==='string'?r.nameKey:context.family,amount,
        [...conditions(r),...extra],context);
    }
    for(const offer of Array.isArray(source.shopOffers)?source.shopOffers:[]){
      const r=row(offer);
      assert(id(r.itemId)===itemId,'OFFER_ITEM');
      const offerId=typeof r.offerId==='number'?id(r.offerId):key(r.offerId);
      append('native:shop-offer:'+offerId,itemId,'game_shop','static_candidate_only',
        'Native source shop offer',null,
        ['Current stock, price and eligibility not verified']);
    }
    for(const sourceStall of Array.isArray(source.possibleStalls)?source.possibleStalls:[]){
      const stall=row(sourceStall),stallId=id(stall.stallId);
      const slots=Array.isArray(stall.slots)?stall.slots:[];
      if(slots.length===0){
        const context=stallDetails(stall,null);
        append('native:stall:'+stallId,itemId,'game_shop','static_candidate_only',
          typeof stall.nameKey==='string'?stall.nameKey:'Static stall candidate',
          null,['Static stall pool; no actual sale verified'],context);
        continue;
      }
      for(const slot of slots){
        const context=stallDetails(stall,row(slot));
        append('native:'+context.pathId,itemId,'game_shop','static_candidate_only',
          typeof stall.nameKey==='string'?stall.nameKey:'Static stall candidate',
          null,['Static stall loot candidate; no stock, price or eligibility verified',
            'Native group candidates: '+context.candidateGroupIndexes.join(',')],
          context);
      }
    }
  }
  return Object.freeze(output);
}

/**
 * Authenticated production entrypoint: only objects returned by the owner-local
 * r5 SHA loader may expose source-verified native paths. Metadata flags and a
 * copied SHA string do NOT prove actual source bytes.
 */
export function projectVerifiedSrc02Origins(
  bundle:VerifiedSrc02OriginReader,
  itemIds:readonly (number|string)[]
):readonly ItemOrigin[]{
  return projectSrc02(bundle,itemIds,true);
}
/** Structural/fixture projection only; all results remain unverified candidates. */
export function projectStructuralSrc02Origins(
  bundle:VerifiedSrc02OriginReader,
  itemIds:readonly (number|string)[]
):readonly ItemOrigin[]{
  return projectSrc02(bundle,itemIds,false);
}
