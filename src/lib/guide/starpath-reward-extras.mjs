/** Source-pinned v1.26.2 crosswalk for Star Path rewards outside public DB-01 item categories.
 * Nine names came from exact original item localization keys, eight motifs have no native label.
 * Never substitute historical names or private R2 URLs.
 */
import {starpathRewardName,VERIFIED_STARPATH_REWARD_NAMES} from './starpath-reward-names.mjs';
export const STARPATH_EXTRA_RELEASE=Object.freeze({
  file:'starpath-reward-extras-2026-11-22.json',
  bytes:4075,
  sha256:'e8e720ce43610e4e049baa31270ae586d1d03313c85a0c7833083eff5acd8ab2',
  privatePackageSha256:'0a1286655a0c4d2ceb91aa61a06c257d2cf485076c8a11dbf3484ad3b7bb5f25'
});
export const STARPATH_EXTRA_CATEGORIES=Object.freeze({
  '20500163':'Building','80100000':'Currency',
  '100000775':'TouchOfMagic','100000776':'TouchOfMagic',
  '100000777':'TouchOfMagic','100000778':'TouchOfMagic',
  '100000779':'TouchOfMagic','100000780':'TouchOfMagic',
  '100000782':'TouchOfMagic','100000783':'TouchOfMagic',
  '110800069':'Tool','120000253':'Companion',
  '120000263':'Companion','140500052':'Makeup',
  '170000115':'Skin','190000033':'PhotoMode','190000034':'PhotoMode'
});
const ORIGINAL_LANGS=['de','en-US','es','fr','it','ja','pt-BR','zh-CN'];
const LANGUAGE=Object.freeze({ja:'ja',en:'en-US',fr:'fr',it:'it',de:'de','es-ES':'es','pt-BR':'pt-BR','zh-CN':'zh-CN'});
const assert=(x,m)=>{if(!x)throw new TypeError('Star Path reward extras: '+m)};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const num=/^[1-9][0-9]{0,15}$/;
export function verifyStarpathRewardExtras(data,seasonSnapshot){
  assert(obj(data)&&data.schema==='wand.db03.starpath-reward-extra@1','schema');
  const source=data.source;
  assert(obj(source)&&source.gameVersion==='Steam 1.26.2'&&
    source.database==='original 33,627-definition owner-private SQLite v2'&&
    source.privatePackageSha256===STARPATH_EXTRA_RELEASE.privatePackageSha256&&
    source.catalogComplete===false&&source.published?.localizedNames===9&&
    source.published?.sourceCategories===17&&source.published?.unlabeledMotifs===8&&
    obj(source.locdbZipSha256)&&Object.keys(source.locdbZipSha256).length===8&&
    ORIGINAL_LANGS.every(l=>/^[a-f0-9]{64}$/.test(source.locdbZipSha256[l])),'source');
  assert(obj(data.rows)&&Object.keys(data.rows).length===17&&
    Object.keys(data.rows).every(id=>Object.hasOwn(STARPATH_EXTRA_CATEGORIES,id)),'17 source IDs');
  assert(Array.isArray(seasonSnapshot?.seasons)&&seasonSnapshot.seasons.length===2,'season context');
  const references=new Set();
  for(const season of seasonSnapshot.seasons){
    for(const reward of [...season.rewardPages.flatMap(p=>p.rewards),...season.bonusPages.flatMap(p=>p.rewards),...season.vaultRewards]){
      references.add(reward.itemId);
      if(reward.alternateItemId)references.add(reward.alternateItemId);
    }
    assert(season.premiumPrice.itemId==='80100000','premium currency identity');
    references.add(season.premiumPrice.itemId);
  }
  assert(references.size===60,'reward source census');
  let translated=0,motifs=0;
  for(const [id,expectedCategory] of Object.entries(STARPATH_EXTRA_CATEGORIES)){
    assert(references.has(id)&&num.test(id)&&!Object.hasOwn(VERIFIED_STARPATH_REWARD_NAMES,id),'non-public category');
    const row=data.rows[id];
    assert(obj(row)&&row.category===expectedCategory,'native category');
    if(expectedCategory==='TouchOfMagic'){
      assert(row.names===null,'motif must not invent native name');motifs++;
    }else{
      assert(obj(row.names)&&Object.keys(row.names).length===8&&
        ORIGINAL_LANGS.every(l=>Object.hasOwn(row.names,l)),'original locales');
      for(const value of Object.values(row.names)){
        assert(typeof value==='string'&&value.length>0&&value.length<=300&&
          !/[<>\u0000-\u001f]/.test(value),'unsafe original label');
      }
      translated++;
    }
  }
  assert(translated===9&&motifs===8,'name status counts');
  assert(Object.keys(VERIFIED_STARPATH_REWARD_NAMES).length===43&&
    [...references].every(id=>Object.hasOwn(STARPATH_EXTRA_CATEGORIES,id)||
      Object.hasOwn(VERIFIED_STARPATH_REWARD_NAMES,id)),'complete public label closure');
  return data;
}
export async function loadStarpathRewardExtras(url,seasonSnapshot,fetcher=fetch){
  const r=await fetcher(url);assert(r.ok,'fetch failed');
  const buf=await r.arrayBuffer();
  assert(buf.byteLength===STARPATH_EXTRA_RELEASE.bytes,'size mismatch');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buf)))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  assert(hash===STARPATH_EXTRA_RELEASE.sha256,'fingerprint mismatch');
  return verifyStarpathRewardExtras(JSON.parse(new TextDecoder().decode(buf)),seasonSnapshot);
}
export function starpathRewardDisplayName(id,locale='ja',extras=null){
  if(typeof id!=='string'||!num.test(id))return null;
  const known=starpathRewardName(id,locale);
  if(known)return known;
  const row=extras?.rows&&Object.hasOwn(extras.rows,id)?extras.rows[id]:null;
  if(!row)return null;
  if(row.category==='TouchOfMagic')return locale==='ja'?'モチーフ（正式名称なし）':'Motif (no official display name)';
  const language=Object.hasOwn(LANGUAGE,locale)?LANGUAGE[locale]:null;
  return language&&row.names?.[language]||null;
}
