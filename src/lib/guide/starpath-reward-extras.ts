/** Steam v1.26.2 source-pinned reward categories and additional native names.
 * Nine extra verified display names; eight Touch-of-Magic motifs have NO
 * native name. Never infer a player reward, event availability, or ownership.
 */
import {verifyPublicStarpath} from './public-starpath.ts';
import {
  starpathRewardName,VERIFIED_STARPATH_REWARD_NAMES,
  STARPATH_UNRESOLVED_REWARD_IDS,verifyStarpathRewardNameCensus
} from './starpath-reward-names.ts';
import type {WandLanguage} from '../ui/preferences.ts';

export const STARPATH_EXTRA_RELEASE=Object.freeze({
  file:'starpath-reward-extras-2026-11-22.json',
  bytes:4075,
  sha256:'e8e720ce43610e4e049baa31270ae586d1d03313c85a0c7833083eff5acd8ab2',
  privatePackageSha256:'0a1286655a0c4d2ceb91aa61a06c257d2cf485076c8a11dbf3484ad3b7bb5f25'
});
export type StarpathExtraCategory='Building'|'Currency'|'TouchOfMagic'|
  'Tool'|'Companion'|'Makeup'|'Skin'|'PhotoMode';
export const STARPATH_EXTRA_CATEGORIES:Readonly<Record<string,StarpathExtraCategory>>=
  Object.freeze({
  '20500163':'Building','80100000':'Currency',
  '100000775':'TouchOfMagic','100000776':'TouchOfMagic',
  '100000777':'TouchOfMagic','100000778':'TouchOfMagic',
  '100000779':'TouchOfMagic','100000780':'TouchOfMagic',
  '100000782':'TouchOfMagic','100000783':'TouchOfMagic',
  '110800069':'Tool','120000253':'Companion',
  '120000263':'Companion','140500052':'Makeup',
  '170000115':'Skin','190000033':'PhotoMode','190000034':'PhotoMode'
});
type NativeLocale='de'|'en-US'|'es'|'fr'|'it'|'ja'|'pt-BR'|'zh-CN';
const ORIGINAL_LANGS:readonly NativeLocale[]=
  Object.freeze(['de','en-US','es','fr','it','ja','pt-BR','zh-CN']);
const LANGUAGE:Readonly<Record<WandLanguage,NativeLocale>>=Object.freeze({
  ja:'ja',en:'en-US',fr:'fr',it:'it',de:'de',
  'es-ES':'es','pt-BR':'pt-BR','zh-CN':'zh-CN'
});
const ID=/^[1-9][0-9]{0,15}$/;
const SHA=/^[a-f0-9]{64}$/;
interface ExtraRow{
  readonly category:StarpathExtraCategory;
  readonly names:Readonly<Record<NativeLocale,string>>|null;
}
export interface StarpathRewardExtras{
  readonly schema:'wand.db03.starpath-reward-extra@1';
  readonly source:Readonly<{
    gameVersion:'Steam 1.26.2';
    database:'original 33,627-definition owner-private SQLite v2';
    privatePackageSha256:string;
    catalogComplete:false;
    published:Readonly<{
      localizedNames:9;sourceCategories:17;unlabeledMotifs:8;
    }>;
    locdbZipSha256:Readonly<Record<NativeLocale,string>>;
  }>;
  readonly rows:Readonly<Record<string,Readonly<ExtraRow>>>;
}
interface SourceReward{
  readonly itemId:string;readonly alternateItemId?:string;
}
interface RewardSeason{
  readonly rewardPages:readonly {readonly rewards:readonly SourceReward[]}[];
  readonly bonusPages:readonly {readonly rewards:readonly SourceReward[]}[];
  readonly vaultRewards:readonly SourceReward[];
  readonly premiumPrice:Readonly<{itemId:string}>;
}
interface RewardSnapshot{
  readonly seasons:readonly RewardSeason[];
}
type BinaryResponse=Pick<Response,'ok'|'arrayBuffer'>;
function check(ok:unknown,message:string):asserts ok{
  if(!ok)throw new TypeError('Star Path reward extras: '+message);
}
function record(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}

/** Requires the exact verified two-season source, not a lookalike season list.
 * Every named or unnamed extra Item ID must occur in the original reward
 * configuration, and MUST NOT overlap a verified public DB-01 Item label.
 */
export function verifyStarpathRewardExtras(
  data:unknown,seasonSnapshot:unknown
):StarpathRewardExtras{
  const sourceCatalog=verifyPublicStarpath(seasonSnapshot) as RewardSnapshot;
  verifyStarpathRewardNameCensus();
  check(record(data)&&data.schema==='wand.db03.starpath-reward-extra@1','schema');
  const source=data.source;
  check(record(source)&&source.gameVersion==='Steam 1.26.2'&&
    source.database==='original 33,627-definition owner-private SQLite v2'&&
    source.privatePackageSha256===STARPATH_EXTRA_RELEASE.privatePackageSha256&&
    source.catalogComplete===false,'source');
  const published=source.published;
  const zip=source.locdbZipSha256;
  check(record(published)&&published.localizedNames===9&&
    published.sourceCategories===17&&published.unlabeledMotifs===8&&
    record(zip)&&Object.keys(zip).length===8&&
    ORIGINAL_LANGS.every(locale=>typeof zip[locale]==='string'&&
      SHA.test(zip[locale] as string)),'source');
  check(record(data.rows)&&Object.keys(data.rows).length===17&&
    Object.keys(data.rows).every(id=>Object.hasOwn(STARPATH_EXTRA_CATEGORIES,id)),
    '17 source IDs');
  check(sourceCatalog.seasons.length===2,'season context');
  const references=new Set<string>();
  for(const season of sourceCatalog.seasons){
    for(const reward of [
      ...season.rewardPages.flatMap(page=>page.rewards),
      ...season.bonusPages.flatMap(page=>page.rewards),
      ...season.vaultRewards
    ]){
      references.add(reward.itemId);
      if(reward.alternateItemId)references.add(reward.alternateItemId);
    }
    check(season.premiumPrice.itemId==='80100000','premium currency identity');
    references.add(season.premiumPrice.itemId);
  }
  check(references.size===60,'reward source census');
  let translated=0,motifs=0;
  for(const [id,category] of Object.entries(STARPATH_EXTRA_CATEGORIES)){
    check(references.has(id)&&ID.test(id)&&Number.isSafeInteger(Number(id))&&
      !Object.hasOwn(VERIFIED_STARPATH_REWARD_NAMES,id),'non-public category');
    const row=data.rows[id];
    check(record(row)&&row.category===category,'native category');
    if(category==='TouchOfMagic'){
      check(row.names===null,'motif must not invent native name');motifs++;
    }else{
      const nativeNames=row.names;
      check(record(nativeNames)&&Object.keys(nativeNames).length===8&&
        ORIGINAL_LANGS.every(locale=>Object.hasOwn(nativeNames,locale)),
        'original locales');
      for(const value of Object.values(nativeNames)){
        check(typeof value==='string'&&value.length>0&&value.length<=300&&
          !/[<>\u0000-\u001f]/.test(value),'unsafe original label');
      }
      translated++;
    }
  }
  check(translated===9&&motifs===8,'name status counts');
  check(Object.keys(VERIFIED_STARPATH_REWARD_NAMES).length===43&&
    [...references].every(id=>Object.hasOwn(STARPATH_EXTRA_CATEGORIES,id)||
      Object.hasOwn(VERIFIED_STARPATH_REWARD_NAMES,id))&&
    STARPATH_UNRESOLVED_REWARD_IDS.every(id=>
      Object.hasOwn(STARPATH_EXTRA_CATEGORIES,id)),
    'complete public label closure');
  return data as unknown as StarpathRewardExtras;
}
export async function loadStarpathRewardExtras(
  url:string,seasonSnapshot:unknown,
  fetcher:(url:string)=>Promise<BinaryResponse>=fetch
):Promise<StarpathRewardExtras>{
  const response=await fetcher(url);check(response.ok,'fetch failed');
  const bytes=await response.arrayBuffer();
  check(bytes.byteLength===STARPATH_EXTRA_RELEASE.bytes,'size mismatch');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(n=>n.toString(16).padStart(2,'0')).join('');
  check(sha===STARPATH_EXTRA_RELEASE.sha256,'fingerprint mismatch');
  return verifyStarpathRewardExtras(JSON.parse(
    new TextDecoder('utf-8',{fatal:true}).decode(bytes)),seasonSnapshot);
}
/** Only native exact-label names. Unnamed motifs use an explicit generic
 * classification label, never a fabricated official in-game title.
 */
export function starpathRewardDisplayName(
  id:unknown,locale:string='ja',extras:StarpathRewardExtras|null=null
):string|null{
  if(typeof id!=='string'||!ID.test(id)||
    !Number.isSafeInteger(Number(id))||!Object.hasOwn(LANGUAGE,locale))
    return null;
  const known=starpathRewardName(id,locale);
  if(known)return known;
  const row=extras?.rows&&Object.hasOwn(extras.rows,id)?extras.rows[id]:null;
  if(!row)return null;
  if(row.category==='TouchOfMagic')
    return locale==='ja'?'モチーフ（正式名称なし）':'Motif (no official display name)';
  const lang=LANGUAGE[locale as WandLanguage];
  return row.names?.[lang]||null;
}
