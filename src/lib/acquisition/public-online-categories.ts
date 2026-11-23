/**
 * Steam v1.26.2 source-native ItemData.OnlineCategory projection.
 *
 * OnlineCategory.Premium is NOT proof of a Premium Shop offer. TimeLimited is
 * NOT proof of a Twitch Drop, redeem code, campaign or current availability.
 * These original metadata enums are kept independent from ItemOrigin links.
 */
export const DB02_ONLINE_CATEGORY_SCHEMA='wand.db02.native-online-category@1' as const;
export const DB02_ONLINE_CATEGORY_FILE='online-categories-1.26.2.json' as const;
export const DB02_ONLINE_CATEGORY_BYTES=22925 as const;
export const DB02_ONLINE_CATEGORY_SHA256=
  'abece12c9fc204abc13cc8dbe071e5e393fd3bee27f0dc4ba9901cf609cf0170' as const;
const ENUM='Definitions.Items.OnlineCategory';
const FAMILY_PINS=Object.freeze([
  ['Furniture','cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196',2823488,6746,[52],929,197],
  ['Clothing','a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946',698960,2041,[35],541,109],
  ['Trimming','a330a5b44860faece7eecb9c07acf3064b15010c97837d9d450f54a7b2ff966c',78930,365,[52],33,17],
  ['MountGear','c7d3f2fc5198e9886eac9fa1843c2b37eaa05cd2195e913f4966214d603bb28b',12182,63,[52],7,5],
  ['Makeup','ce83251a6ac082690c7a93698fee7526cf465b13a09d9e117d2e158500effe22',17940,69,[22],15,5],
  ['Tool','2126651d27fcee9974f79e1ab86bf961be70d6182a778c2fb62d6c3c09a1457d',25546,126,[15],86,17],
  ['Character','da6794c66a801a1de43a6ac7b7b79d77a663661f3226bc51a249092632777f0f',192762,142,[82],2,0],
  ['Companion','62008c61bf0b407c40d0adf417db043ab058f4ec0ca2764355e176a3532c2219',123360,394,[27],111,11],
  ['Skin','c557b76c8a762afb3d6cdd66e9c6ced22e7d863ff3dc7426f8f9aff3939e6371',32463,163,[17,27],106,7]
] as const);
const KINDS=Object.freeze(['premium','time_limited'] as const);
const BASE=/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const ID=/^[1-9][0-9]{0,15}$/;
const EMPTY_CATEGORIES=Object.freeze([]) as readonly NativeOnlineCategory[];
const EMPTY_ROWS=Object.freeze([]) as readonly NativeOnlineCategoryRow[];
const EMPTY_IDS=Object.freeze([]) as readonly string[];
export type NativeOnlineCategory=typeof KINDS[number];
export type NativeOnlineFamily=typeof FAMILY_PINS[number][0];

export interface NativeOnlineCategoryRow {
  readonly itemId:string;
  readonly family:NativeOnlineFamily;
  readonly category:NativeOnlineCategory;
  readonly sourceFile:string;
  readonly categoryFieldNumber:number;
  readonly originalSha256:string;
  readonly originalCategoryOnly:true;
  readonly specificOfferOrCampaignVerified:false;
  readonly currentAvailabilityVerified:false;
  readonly playerAcquisitionVerified:false;
}
export interface NativeOnlineCategoryIndex {
  readonly schema:typeof DB02_ONLINE_CATEGORY_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly nativeEnum:typeof ENUM;
  readonly rows:readonly NativeOnlineCategoryRow[];
  readonly coverage:Readonly<{
    sourceFamilies:9;
    sourceDefinitionRecords:10109;
    premiumCategoryRows:1830;
    timeLimitedCategoryRows:368;
    explicitNonzeroCategoryRows:2198;
    singleOfferOrCampaignLinkVerified:false;
    currentAvailabilityVerified:false;
    playerAcquisitionVerified:false;
    allItemTypesCovered:false;
  }>;
  getItemCategories(itemId:string|number):readonly NativeOnlineCategory[];
  getItemClassifications(itemId:string|number):readonly NativeOnlineCategoryRow[];
  getCategoryItemIds(category:NativeOnlineCategory):readonly string[];
  getFamilyCategoryItemIds(
    family:NativeOnlineFamily,category:NativeOnlineCategory
  ):readonly string[];
}
function check(value:unknown,code:string):asserts value {
  if(!value)throw new TypeError('DB02_NATIVE_ONLINE_CATEGORY_'+code);
}
function record(x:unknown):x is Record<string,unknown>{
  return x!==null&&typeof x==='object'&&!Array.isArray(x);
}
function normalizeId(raw:unknown):string {
  const value=typeof raw==='number'&&Number.isSafeInteger(raw)?String(raw):raw;
  check(typeof value==='string'&&ID.test(value)&&
    Number.isSafeInteger(Number(value)),'INVALID_ITEM_ID');
  return value;
}
function parse(raw:unknown):NativeOnlineCategoryIndex {
  check(record(raw)&&raw.schema===DB02_ONLINE_CATEGORY_SCHEMA&&
    record(raw.target)&&raw.target.platform==='Steam'&&
    raw.target.gameVersion==='1.26.2'&&raw.nativeEnum===ENUM&&
    Array.isArray(raw.families)&&raw.families.length===FAMILY_PINS.length&&
    record(raw.coverage),'SCHEMA');
  const census=raw.coverage;
  check(census.sourceFamilies===9&&
    census.sourceDefinitionRecords===10109&&
    census.premiumCategoryRows===1830&&
    census.timeLimitedCategoryRows===368&&
    census.explicitNonzeroCategoryRows===2198&&
    census.singleOfferOrCampaignLinkVerified===false&&
    census.currentAvailabilityVerified===false&&
    census.playerAcquisitionVerified===false&&
    census.allItemTypesCovered===false,'SOURCE_CENSUS');
  const byItem=new Map<string,NativeOnlineCategoryRow[]>();
  const byCategory=new Map<NativeOnlineCategory,string[]>();
  const byFamily=new Map<NativeOnlineFamily,Map<NativeOnlineCategory,readonly string[]>>();
  const rows:NativeOnlineCategoryRow[]=[];
  const usedIds=new Set<string>();
  for(let i=0;i<FAMILY_PINS.length;i++){
    const spec=FAMILY_PINS[i];
    const source=raw.families[i];
    check(record(source)&&source.family===spec[0]&&
      source.sourceFile==='StreamingAssets/itemlist/'+spec[0]+'.json'&&
      source.originalSha256===spec[1]&&source.originalBytes===spec[2]&&
      source.nativeRecords===spec[3]&&
      Array.isArray(source.categoryFields)&&
      source.categoryFields.length===spec[4].length&&
      source.categoryFields.every((x:unknown,j:number)=>x===spec[4][j]),
      'NATIVE_SOURCE_PIN');
    const categoryMap=new Map<NativeOnlineCategory,readonly string[]>();
    for(let j=0;j<KINDS.length;j++){
      const kind=KINDS[j];
      const input=source[kind==='premium'?'premium':'timeLimited'];
      check(Array.isArray(input)&&input.length===spec[5+j],'CATEGORY_COUNT');
      const ids:string[]=[];
      let previous=0;
      for(const rawId of input){
        check(typeof rawId==='number'&&Number.isSafeInteger(rawId)&&
          rawId>previous&&rawId>0,'SORTED_SOURCE_IDS');
        previous=rawId;
        const id=normalizeId(rawId);
        check(!usedIds.has(id),'DUPLICATE_SOURCE_ID');
        usedIds.add(id);
        const categoryFieldNumber=spec[0]==='Skin'?
          Math.floor(rawId/100000)===1700?27:17:spec[4][0];
        const row:NativeOnlineCategoryRow=Object.freeze({
          itemId:id,family:spec[0],category:kind,sourceFile:source.sourceFile as string,
          categoryFieldNumber,originalSha256:spec[1],originalCategoryOnly:true,
          specificOfferOrCampaignVerified:false,
          currentAvailabilityVerified:false,playerAcquisitionVerified:false
        });
        rows.push(row);
        byItem.set(id,[row]);
        ids.push(id);
        const previousIds=byCategory.get(kind);
        if(previousIds)previousIds.push(id);
        else byCategory.set(kind,[id]);
      }
      categoryMap.set(kind,Object.freeze(ids));
    }
    byFamily.set(spec[0],categoryMap);
  }
  check(rows.length===2198&&usedIds.size===2198&&
    byCategory.get('premium')?.length===1830&&
    byCategory.get('time_limited')?.length===368,'TOTAL_RELATIONS');
  for(const itemRows of byItem.values())Object.freeze(itemRows);
  for(const ids of byCategory.values())ids.sort((a,b)=>Number(a)-Number(b));
  for(const ids of byCategory.values())Object.freeze(ids);
  return Object.freeze({
    schema:DB02_ONLINE_CATEGORY_SCHEMA,gameVersion:'1.26.2' as const,
    nativeEnum:ENUM,rows:Object.freeze(rows),
    coverage:Object.freeze({
      sourceFamilies:9 as const,sourceDefinitionRecords:10109 as const,
      premiumCategoryRows:1830 as const,timeLimitedCategoryRows:368 as const,
      explicitNonzeroCategoryRows:2198 as const,
      singleOfferOrCampaignLinkVerified:false as const,
      currentAvailabilityVerified:false as const,
      playerAcquisitionVerified:false as const,allItemTypesCovered:false as const
    }),
    getItemCategories(rawId:string|number){
      const itemRows=byItem.get(normalizeId(rawId));
      return itemRows?Object.freeze([itemRows[0].category]):EMPTY_CATEGORIES;
    },
    getItemClassifications(rawId:string|number){
      return byItem.get(normalizeId(rawId))??EMPTY_ROWS;
    },
    getCategoryItemIds(kind:NativeOnlineCategory){
      check(KINDS.includes(kind),'INVALID_CATEGORY');
      return byCategory.get(kind)??EMPTY_IDS;
    },
    getFamilyCategoryItemIds(family:NativeOnlineFamily,kind:NativeOnlineCategory){
      check(FAMILY_PINS.some(row=>row[0]===family),'INVALID_FAMILY');
      check(KINDS.includes(kind),'INVALID_CATEGORY');
      return byFamily.get(family)?.get(kind)??EMPTY_IDS;
    }
  });
}
/** SHA-pinned, opt-in browser loader. No per-user Save or online server access. */
export async function loadPinnedNativeOnlineCategories(
  basePath='',fetcher:typeof fetch=fetch
):Promise<NativeOnlineCategoryIndex>{
  check(typeof basePath==='string'&&(basePath===''||BASE.test(basePath)),
    'INVALID_BASE_PATH');
  const response=await fetcher(basePath+'/acquisition/public/'+DB02_ONLINE_CATEGORY_FILE);
  check(response.ok,'DOWNLOAD_FAILED');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===DB02_ONLINE_CATEGORY_BYTES,'BYTES');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  check(digest===DB02_ONLINE_CATEGORY_SHA256,'SHA');
  return parse(JSON.parse(new TextDecoder().decode(bytes)));
}
