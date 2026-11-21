/**
 * Owner-private, SHA-pinned exact Steam v1.26.2 Tag.locbin localized display
 * strings (eight languages). Does not decode or publish game localization ZIPs.
 */
import {
  DB02_NATIVE_TAG_EVIDENCE_CONTRACT,
  DB02_NATIVE_TAG_SOURCE_SHA256,
  DB02_NATIVE_TAG_PARENT_SHA256
} from './native-tag-evidence.mjs';

export const DB02_TAG_LOCALES_CONTRACT = 'wand.db02.native-tag-locales@1';
export const DB02_TAG_EVIDENCE_MANIFEST_SHA256 = '26eb6d5e84683aae8e26b8720fd98fa7d0b5a3e607650b380c97e4f7de519ba6';
export const DB02_TAG_LOCALES = Object.freeze(['en','fr','it','de','es-ES','ja','zh-CN','pt-BR']);
export const DB02_TAG_LOCALE_ARCHIVE_SHA256 = Object.freeze({
  en:'792b400f79bd29440d2d6d624c16e92ce380a3b927ebf2c7e9b7f19121acda86',
  fr:'2769b7694887f0cd4331c01ebe63faa2b933f45c4e25b54434a2ba32249ec970',
  it:'dae2f265496cb60a525cd170f82f82b5e21f8194dcf9140865a57284360cbdbf',
  de:'bf545ab41e59ae2a28974d4ce8ff1d3e926ee0b7a196caf5fa1f46d5d9802538',
  'es-ES':'7daabcde7b39e152eee704216f5ed80e0c7a0a3ed7235f5b474e045c02cedaf5',
  ja:'071e495bc199898078f75c3c5aef51f1c7abc92da699a65578d109fbb9bd7758',
  'zh-CN':'977b8f9b8568cf6e2aac8d46f558e2748ba32e54bd9bf443c8175227ca80993c',
  'pt-BR':'ef5e376fc1f9f0f72e82bd85839d4241c7c037412c7fe68c7cddbaa6e5c67b16'
});
const fail = code => {throw new TypeError('DB02_TAG_LOCALES_'+code);};
const check = (condition,code) => {if(!condition)fail(code);};
const SHA = /^[0-9a-f]{64}$/;
const utf8=new TextDecoder('utf-8',{fatal:true});
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validName=v=>typeof v==='string'&&v.length>0&&v.length<=512&&v.trim()!==''&&
  !/[\x00-\x1f]/.test(v);
const validId=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const copyBytes=(input,max)=>{
  const b=input instanceof ArrayBuffer?new Uint8Array(input):input;
  check(b instanceof Uint8Array&&b.byteLength>2&&b.byteLength<=max,'INVALID_INPUT_BYTES');
  return new Uint8Array(b);
};
const sha=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');

/**
 * Requires a previously SHA-verified native Tag evidence object and an
 * independently trusted manifest hash from a release audit, never from ZIP.
 */
export async function loadVerifiedNativeTagLocales(manifestInput,rowsInput,tagEvidence,{
  expectedManifestSha256
}={}){
  check(SHA.test(expectedManifestSha256??'')&&
    tagEvidence?.contract===DB02_NATIVE_TAG_EVIDENCE_CONTRACT&&
    tagEvidence?.verified===true&&tagEvidence.privateSource===true&&
    tagEvidence.publishable===false&&Object.isFrozen(tagEvidence)&&
    tagEvidence.manifestSha256===DB02_TAG_EVIDENCE_MANIFEST_SHA256&&
    tagEvidence.parentSrc02ManifestSha256===DB02_NATIVE_TAG_PARENT_SHA256&&
    tagEvidence.nativeTagSourceSha256===DB02_NATIVE_TAG_SOURCE_SHA256&&
    Object.isFrozen(tagEvidence.allTags),
    'TRUSTED_TAG_PARENT_REQUIRED');
  check(globalThis.crypto?.subtle,'SHA256_UNAVAILABLE');
  const manifestBytes=copyBytes(manifestInput,256*1024);
  check(await sha(manifestBytes)===expectedManifestSha256,'MANIFEST_SHA256_MISMATCH');
  let manifest;
  try{manifest=JSON.parse(utf8.decode(manifestBytes));}catch{fail('INVALID_MANIFEST_JSON');}
  check(manifest?.schema===DB02_TAG_LOCALES_CONTRACT&&
    manifest.platform==='Steam'&&manifest.gameVersion==='1.26.2'&&
    manifest.privateOnly===true&&manifest.publicationAuthorized===false&&
    manifest.parentTagManifestSha256===DB02_TAG_EVIDENCE_MANIFEST_SHA256&&
    manifest.parentSrc02R5ManifestSha256===DB02_NATIVE_TAG_PARENT_SHA256&&
    manifest.nativeTagSha256===DB02_NATIVE_TAG_SOURCE_SHA256&&
    manifest.localizationCategory==='Tag.locbin'&&
    manifest.sourceKeyTransform==='Tag.<key> => <key> in Tag.locbin'&&
    plain(manifest.localeArchiveSha256)&&
    Object.keys(manifest.localeArchiveSha256).length===DB02_TAG_LOCALES.length&&
    DB02_TAG_LOCALES.every(l=>manifest.localeArchiveSha256[l]===DB02_TAG_LOCALE_ARCHIVE_SHA256[l])&&
    plain(manifest.files)&&Object.keys(manifest.files).length===2&&
    SHA.test(manifest.files['tag-locales.jsonl']??'')&&SHA.test(manifest.files['report.json']??''),
    'SOURCE_PROVENANCE_OR_ARCHIVE_MISMATCH');
  const counts=manifest.counts;
  check(plain(counts)&&
    counts.nativeTagDefinitions===tagEvidence.allTags.length&&
    counts.languages===DB02_TAG_LOCALES.length&&
    counts.translatedTagStrings===counts.languages*counts.nativeTagDefinitions,
    'INVALID_TRANSLATION_COUNTS');
  const bytes=copyBytes(rowsInput,1024*1024);
  check(await sha(bytes)===manifest.files['tag-locales.jsonl'],'ROWS_SHA256_MISMATCH');
  let records;
  try{
    const str=utf8.decode(bytes);
    check(str.endsWith('\n'),'JSONL_TERMINATOR');
    records=str.split('\n');records.pop();
    check(records.length===counts.nativeTagDefinitions,'ROW_COUNT_MISMATCH');
    records=records.map(line=>JSON.parse(line));
  }catch(e){
    if(String(e?.message??'').startsWith('DB02_TAG_LOCALES_'))throw e;
    fail('BAD_ROWS_JSON');
  }
  const byId=new Map();
  const ordered=[];
  for(let i=0;i<records.length;i++){
    const row=records[i],tag=tagEvidence.allTags[i];
    check(plain(row)&&Object.keys(row).length===2&&validId(row.tagId)&&
      row.tagId===tag.tagId&&plain(row.localizedNames)&&
      Object.keys(row.localizedNames).length===DB02_TAG_LOCALES.length&&
      DB02_TAG_LOCALES.every(locale=>validName(row.localizedNames[locale])),
      'INVALID_OR_UNMATCHED_TAG_LOCALIZATION');
    const names=Object.freeze(Object.fromEntries(DB02_TAG_LOCALES.map(locale=>[locale,row.localizedNames[locale]])));
    const record=Object.freeze({tagId:row.tagId,localizedNames:names,
      nativeName:tag.nativeName,displayNameKey:tag.displayNameKey,
      usedByRecipeSelector:tag.usedByRecipeSelector,
      usedByIngredientMembership:tag.usedByIngredientMembership,
      exactGameVersion:'1.26.2',localizationExactSourceVerified:true,
      liveRecipeEligibilityVerified:false,ownershipVerified:false});
    byId.set(row.tagId,record);ordered.push(record);
  }
  const allTags=Object.freeze(ordered);
  function getTag(id){check(validId(id),'INVALID_QUERY_ID');return byId.get(id)??null;}
  function getDisplayName(id,locale){
    check(validId(id)&&DB02_TAG_LOCALES.includes(locale),'INVALID_QUERY');
    const row=byId.get(id);
    return row?Object.freeze({tagId:id,locale,value:row.localizedNames[locale],
      evidence:'steam1262_exact_tag_locbin',sourceGameVersion:'1.26.2',
      actualPlayerEligibilityVerified:false}):null;
  }
  return Object.freeze({contract:DB02_TAG_LOCALES_CONTRACT,
    verified:true,privateSource:true,publishable:false,
    platform:'Steam',gameVersion:'1.26.2',
    manifestSha256:expectedManifestSha256,
    parentTagManifestSha256:DB02_TAG_EVIDENCE_MANIFEST_SHA256,
    sourceExactLocalizedTagCoverageComplete:true,
    completeGameLocalizationVerified:false,
    liveAvailabilityVerified:false,playerOwnershipVerified:false,
    saveWritingAuthorized:false,
    counts:Object.freeze({...counts}),allTags,
    getTag,getDisplayName,
    getRecipeSelectorName(id,locale){
      const tag=getTag(id);return tag?.usedByRecipeSelector?getDisplayName(id,locale):null;
    },
    getIngredientMembershipName(id,locale){
      const tag=getTag(id);return tag?.usedByIngredientMembership?getDisplayName(id,locale):null;
    }
  });
}