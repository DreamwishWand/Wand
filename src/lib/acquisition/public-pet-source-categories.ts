/**
 * Exact v1.26.2 native companion/PetItemData.Source metadata.
 *
 * The 134 nonzero source field values are category labels in the original
 * Steam file, NOT specific campaign, native Shop offer, code or Twitch Drop
 * links. A matching category does not verify a grant or player ownership.
 */
export const DB02_PET_SOURCE_SCHEMA='wand.db02.native-pet-source-categories@1' as const;
export const DB02_PET_SOURCE_FILE='pet-source-categories-1.26.2.json' as const;
export const DB02_PET_SOURCE_BYTES=2061 as const;
export const DB02_PET_SOURCE_SHA=
  '7a582908a3b89df6508ab36ae59bcf2ba88c580e8ad1167e5852e7b1f4203975' as const;
const ORIGINAL_SHA='62008c61bf0b407c40d0adf417db043ab058f4ec0ca2764355e176a3532c2219';
const CATEGORIES=Object.freeze([
  'quest','timebending','event','star_path','premium_shop','exclusive_promotion'
] as const);
const COUNTS=Object.freeze([8,1,9,7,95,14]);
const ID=/^[1-9][0-9]{0,15}$/;
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const PINNED=new WeakSet<object>();
const EMPTY=Object.freeze([]) as readonly NativePetSourceCategory[];
const EMPTY_IDS=Object.freeze([]) as readonly string[];

export type NativePetSourceCategory=(typeof CATEGORIES)[number];
export interface NativePetSourceClassification {
  readonly itemId:string;
  readonly category:NativePetSourceCategory;
  readonly originalFieldNumber:9;
  readonly sourceCategoryOnly:true;
  readonly campaignLinkVerified:false;
  readonly playerAcquisitionVerified:false;
}
export interface NativePetSourceIndex {
  readonly schema:typeof DB02_PET_SOURCE_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly originalSha256:typeof ORIGINAL_SHA;
  readonly classifications:readonly NativePetSourceClassification[];
  readonly coverage:Readonly<{
    explicitSourceRows:134;
    nativePremiumStorePetIds:95;
    nativeExclusivePromotionPetIds:14;
    specificOnlineCampaignLinksVerified:0;
    allItemTypesCovered:false;
    playerAcquisitionVerified:false;
  }>;
  getItemCategories(itemId:number|string):readonly NativePetSourceCategory[];
  getItemClassifications(itemId:number|string):readonly NativePetSourceClassification[];
  getCategoryItemIds(category:NativePetSourceCategory):readonly string[];
}
function check(ok:unknown,code:string):asserts ok {
  if(!ok)throw new TypeError('DB02_PET_SOURCE_'+code);
}
function object(x:unknown):x is Record<string,unknown>{
  return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function normalizeId(x:unknown):string{
  const value=typeof x==='number'&&Number.isSafeInteger(x)?String(x):x;
  check(typeof value==='string'&&ID.test(value)&&
    Number.isSafeInteger(Number(value)),'INVALID_ITEM_ID');
  return value;
}
function decode(raw:unknown):NativePetSourceIndex{
  check(object(raw)&&raw.schema===DB02_PET_SOURCE_SCHEMA&&
    object(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2'&&
    object(raw.source)&&object(raw.coverage)&&
    Array.isArray(raw.categories)&&raw.categories.length===6,'SCHEMA');
  const source=raw.source,census=raw.coverage;
  check(source.originalFile==='StreamingAssets/itemlist/Companion.json'&&
    source.originalSha256===ORIGINAL_SHA&&source.originalBytes===123360&&
    source.recordType==='Definitions.Items.PetItemData'&&
    source.enumType==='Definitions.Items.MetaLocation'&&
    source.sourceFieldNumber===9&&
    source.onlyExplicitNonWorldSourceValues===true,'SOURCE_PIN');
  const groupSizes=census.groupSizes;
  check(census.sourcePinnedPetRows===134&&
    Array.isArray(groupSizes)&&groupSizes.length===6&&
    COUNTS.every((n,i)=>groupSizes[i]===n)&&
    census.individualCampaignLinksVerified===false&&
    census.playerAcquisitionVerified===false&&
    census.allItemTypesCovered===false,'SOURCE_CENSUS');
  const classifications:NativePetSourceClassification[]=[];
  const categoriesByItem=new Map<string,readonly NativePetSourceCategory[]>();
  const classificationsByItem=new Map<string,readonly NativePetSourceClassification[]>();
  const byCategory=new Map<NativePetSourceCategory,readonly string[]>();
  for(let i=0;i<CATEGORIES.length;i++){
    const entry=raw.categories[i];
    check(Array.isArray(entry)&&entry.length===2&&
      entry[0]===CATEGORIES[i]&&Array.isArray(entry[1])&&
      entry[1].length===COUNTS[i],'CATEGORY_RECORD');
    const category=CATEGORIES[i];
    const itemIds:string[]=[];
    let previous=0;
    for(const sourceId of entry[1]){
      check(typeof sourceId==='number'&&Number.isSafeInteger(sourceId)&&
        sourceId>=120000000&&sourceId<120100000&&sourceId>previous,
        'SORTED_ORIGINAL_ITEM_IDS');
      previous=sourceId;
      const itemId=normalizeId(sourceId);
      check(!categoriesByItem.has(itemId),'DUPLICATE_PET_SOURCE');
      const candidate:NativePetSourceClassification=Object.freeze({
        itemId,category,originalFieldNumber:9 as const,
        sourceCategoryOnly:true as const,campaignLinkVerified:false as const,
        playerAcquisitionVerified:false as const
      });
      const itemClasses=Object.freeze([candidate]);
      classifications.push(candidate);
      itemIds.push(itemId);
      categoriesByItem.set(itemId,Object.freeze([category]));
      classificationsByItem.set(itemId,itemClasses);
    }
    byCategory.set(category,Object.freeze(itemIds));
  }
  check(classifications.length===134&&classificationsByItem.size===134,
    'TOTAL_RELATIONS');
  const result:NativePetSourceIndex=Object.freeze({
    schema:DB02_PET_SOURCE_SCHEMA,gameVersion:'1.26.2' as const,
    originalSha256:ORIGINAL_SHA,
    classifications:Object.freeze(classifications),
    coverage:Object.freeze({
      explicitSourceRows:134 as const,nativePremiumStorePetIds:95 as const,
      nativeExclusivePromotionPetIds:14 as const,
      specificOnlineCampaignLinksVerified:0 as const,
      allItemTypesCovered:false as const,playerAcquisitionVerified:false as const
    }),
    getItemCategories(raw:number|string){
      return categoriesByItem.get(normalizeId(raw))??EMPTY;
    },
    getItemClassifications(raw:number|string){
      return classificationsByItem.get(normalizeId(raw))??
        Object.freeze([]) as readonly NativePetSourceClassification[];
    },
    getCategoryItemIds(category:NativePetSourceCategory){
      check(CATEGORIES.includes(category),'INVALID_CATEGORY');
      return byCategory.get(category)??EMPTY_IDS;
    }
  });
  PINNED.add(result);
  return result;
}
export function hasPinnedNativePetSourceEvidence(x:unknown):x is NativePetSourceIndex{
  return x!==null&&typeof x==='object'&&PINNED.has(x);
}
/** Byte-level public projection SHA pin; original file remains owner-local. */
export async function loadPinnedNativePetSourceCategories(
  basePath='',fetcher:typeof fetch=fetch
):Promise<NativePetSourceIndex>{
  check(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  const url=basePath+'/acquisition/public/'+DB02_PET_SOURCE_FILE;
  const response=await fetcher(url);
  check(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===DB02_PET_SOURCE_BYTES,'SIZE');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(v=>v.toString(16).padStart(2,'0')).join('');
  check(digest===DB02_PET_SOURCE_SHA,'SHA');
  return decode(JSON.parse(new TextDecoder().decode(bytes)));
}
