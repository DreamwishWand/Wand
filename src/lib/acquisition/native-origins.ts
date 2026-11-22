/**
 * DB-02 r5 source-authenticated native recipe/loot candidate projection.
 * Uses existing SRC-02 getItem; does not reparse ActivityData, shops or conditions.
 * The returned records are source-linked definitions, never live stock or unlocks.
 */
import type {ItemOrigin, OriginKind, OriginProvenance} from './origins.ts';

const SRC02_MANIFEST_SHA='ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c';
const SRC02_CONTRACT='wand.src02.private-browser-bundle@1';
const MAX_ITEMS=20000;
const ID=/^[1-9][0-9]{0,15}$/;
const KEY=/^[a-zA-Z0-9][a-zA-Z0-9:._\/-]{0,127}$/;
const SOURCE: OriginProvenance=Object.freeze({
  sourceId:'src02:steam-1262:r5',
  kind:'verified_game_native',
  sourceUrl:'/private/src-02-acquisition/r5',
  checkedOn:'2026-11-21',
  gameVersion:'1.26.2',
  sha256:SRC02_MANIFEST_SHA
});

export interface VerifiedSrc02OriginReader {
  readonly contract: string;
  readonly manifestSha256: string;
  readonly privateSource: boolean;
  readonly publishable: boolean;
  readonly verified: boolean;
  readonly provenanceMatched: boolean;
  readonly currentShopOffersVerified: boolean;
  readonly currentAvailabilityVerified: boolean;
  readonly source: {readonly platform:string;readonly gameVersion:string};
  getItem(id:number): unknown;
}
type RecordValue=Record<string,unknown>;
function record(x:unknown): x is RecordValue {
  return x!==null && typeof x==='object' && !Array.isArray(x);
}
function itemId(x:unknown):string {
  const key=typeof x==='number' && Number.isSafeInteger(x)?String(x):x;
  if(typeof key!=='string'||!ID.test(key)||!Number.isSafeInteger(Number(key)))
    throw new TypeError('DB02_NATIVE_ORIGINS_INVALID_ITEM_ID');
  return key;
}
function sourceRow(v:unknown): RecordValue {
  if(!record(v))throw new TypeError('DB02_NATIVE_ORIGINS_INVALID_ROW');
  return v;
}
function validRouteId(v:unknown):string {
  if(typeof v!=='string'||!KEY.test(v))
    throw new TypeError('DB02_NATIVE_ORIGINS_INVALID_ROUTE_ID');
  return v;
}
function conditions(row:RecordValue):readonly string[] {
  return typeof row.conditionDigest==='string'&&/^[0-9a-f]{64}$/.test(row.conditionDigest)
    ? Object.freeze(['Native condition gate (not evaluated): '+row.conditionDigest]):Object.freeze([]);
}
function quantity(n:unknown):number|null {
  if(n==null)return null;
  if(typeof n!=='number'||!Number.isSafeInteger(n)||n<1)
    throw new TypeError('DB02_NATIVE_ORIGINS_QUANTITY');
  return n;
}
const NATIVE_KINDS: Readonly<Record<string,OriginKind>>=Object.freeze({
  fishing:'fishing',mining:'mining',growing:'farming',
  foraging:'foraging',digging:'other',timebending:'other'
});

/**
 * Import only IDs actually requested by the consumer (DB-00 catalog, Search,
 * Collection or Save Editor). For whole-catalog import pass DB-00 Item IDs.
 */
export function projectVerifiedSrc02Origins(
  bundle:VerifiedSrc02OriginReader,
  itemIds:readonly (string|number)[]
): readonly ItemOrigin[] {
  if(!bundle || bundle.contract!==SRC02_CONTRACT ||
    bundle.manifestSha256!==SRC02_MANIFEST_SHA ||
    bundle.privateSource!==true || bundle.publishable!==false ||
    bundle.verified!==true || bundle.provenanceMatched!==true ||
    bundle.currentShopOffersVerified!==false ||
    bundle.currentAvailabilityVerified!==false ||
    bundle.source?.platform!=='Steam' || bundle.source?.gameVersion!=='1.26.2' ||
    typeof bundle.getItem!=='function')
      throw new TypeError('DB02_NATIVE_ORIGINS_VERIFIED_PRIVATE_R5_REQUIRED');
  if(!Array.isArray(itemIds)||itemIds.length>MAX_ITEMS)
    throw new TypeError('DB02_NATIVE_ORIGINS_ID_BATCH_LIMIT');
  const ids=[...new Set(itemIds.map(itemId))];
  const output:ItemOrigin[]=[];
  const keys=new Set<string>();
  function append(routeId:string,item:string,kind:OriginKind,status:
    'confirmed_source_link'|'static_candidate_only',
    name:string,amount:number|null,restrictions:readonly string[]):void {
    const key=routeId+'\0'+item;
    if(keys.has(key))return;
    keys.add(key);
    output.push({
      originId:routeId,itemId:item,kind,routeStatus:status,
      campaignId:null,name,productId:null,quantity:amount,
      price:null,accessTier:'not_applicable',
      window:{start:null,endExclusive:null},salePeriods:[],
      conditions:restrictions,source:SOURCE,availability:'not_live_verified'
    });
  }
  for(const requested of ids){
    const id=itemId(requested);
    const value=bundle.getItem(Number(id));
    if(value==null)continue;
    const row=sourceRow(value);
    // Unresolved IDs must not be treated as negative acquisition evidence.
    if(row.status==='unresolved_or_no_verified_link' &&
        !Array.isArray(row.possibleStalls))continue;
    if(row.itemId!==undefined && itemId(row.itemId)!==id)
      throw new TypeError('DB02_NATIVE_ORIGINS_WRONG_ITEM');
    for(const recipe of Array.isArray(row.madeBy)?row.madeBy:[]){
      const r=sourceRow(recipe);
      if(r.type!=='crafting'&&r.type!=='cooking')
        throw new TypeError('DB02_NATIVE_ORIGINS_RECIPE_TYPE');
      if(itemId(r.resultItemId)!==id)
        throw new TypeError('DB02_NATIVE_ORIGINS_RECIPE_ITEM');
      const rid=itemId(r.recipeId);
      append('native:recipe:'+rid,id,r.type,'confirmed_source_link',
        typeof r.nameKey==='string'?r.nameKey:r.type+' recipe',quantity(r.resultQuantity),
        conditions(r));
    }
    for(const path of Array.isArray(row.acquisitionPaths)?row.acquisitionPaths:[]){
      const r=sourceRow(path);
      if(itemId(r.itemId)!==id)
        throw new TypeError('DB02_NATIVE_ORIGINS_PATH_ITEM');
      const routeId=validRouteId(r.pathId);
      const type=typeof r.type==='string'?r.type:'other';
      const kind=NATIVE_KINDS[type]??'other';
      append('native:path:'+routeId,id,kind,'confirmed_source_link',
        typeof r.nameKey==='string'?r.nameKey:type,null,conditions(r));
    }
    for(const offer of Array.isArray(row.shopOffers)?row.shopOffers:[]){
      const r=sourceRow(offer);
      if(itemId(r.itemId)!==id)
        throw new TypeError('DB02_NATIVE_ORIGINS_OFFER_ITEM');
      const offerId=typeof r.offerId==='number' ? itemId(r.offerId) : validRouteId(r.offerId);
      append('native:shop-offer:'+offerId,id,'game_shop','static_candidate_only',
        'Native source shop offer',null,Object.freeze(['Current stock, price and eligibility not verified']));
    }
    for(const stall of Array.isArray(row.possibleStalls)?row.possibleStalls:[]){
      const r=sourceRow(stall);
      const stallId=itemId(r.stallId);
      append('native:stall:'+stallId,id,'game_shop','static_candidate_only',
        typeof r.nameKey==='string'?r.nameKey:'Static stall candidate',null,
        Object.freeze(['Static candidate pool; not an active sale']));
    }
  }
  return Object.freeze(output.map(route=>Object.freeze({
    ...route,window:Object.freeze({...route.window}),
    salePeriods:Object.freeze([...route.salePeriods])
  })));
}
