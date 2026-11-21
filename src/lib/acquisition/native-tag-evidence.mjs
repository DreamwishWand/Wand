/**
 * Private, read-only TagItemData overlay for exact-version SRC-02 r5.
 * `nativeName` and `displayNameKey` are source identifiers, NOT translated names.
 * No raw game data is bundled and no network, save or ownership API is exposed.
 */
export const DB02_NATIVE_TAG_EVIDENCE_CONTRACT = 'wand.db02.native-tag-evidence@1';
export const DB02_NATIVE_TAG_SOURCE_SHA256 = 'bc537ad3278483cb6b64a344fa70f73dca7e66ff146b1e0d032e2f209ba813a4';
export const DB02_NATIVE_TAG_PARENT_SHA256 = 'ec1efd589dd5390f11f5a99411bcf3f1c6bc34309ddfa68e51589c078601f31c';
const SOURCE_CONDITION_SHA256 = '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c';
const SHA = /^[a-f0-9]{64}$/;
const decoder = new TextDecoder('utf-8', {fatal:true});
const fail = code => {throw new TypeError('DB02_TAG_'+code);};
const check = (ok,code) => {if(!ok)fail(code);};
const validId = v => typeof v === 'number' && Number.isSafeInteger(v) && v > 2_000_000_000 && v <= 2_147_483_647;
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const validKey = (v,max) => typeof v === 'string' && v.length>0 && v.length<=max &&
  v.trim()===v && !/[\x00-\x1f]/.test(v);
async function digest(value){
  const result=await crypto.subtle.digest('SHA-256',value);
  return Array.from(new Uint8Array(result),v=>v.toString(16).padStart(2,'0')).join('');
}
function requireBytes(value,max){
  const bytes=value instanceof ArrayBuffer?new Uint8Array(value):value;
  check(bytes instanceof Uint8Array && bytes.byteLength>=2 && bytes.byteLength<=max,'INPUT_BYTES');
  return bytes;
}

/**
 * Manifest hash MUST be pinned independently of user-selected private files.
 * No record is usable until BOTH manifest SHA and rows SHA have been verified.
 */
export async function loadVerifiedNativeTagEvidence(manifestInput,rowsInput,{
  expectedManifestSha256,expectedParentSrc02ManifestSha256=DB02_NATIVE_TAG_PARENT_SHA256,
}={}){
  check(SHA.test(expectedManifestSha256??'') &&
    expectedParentSrc02ManifestSha256===DB02_NATIVE_TAG_PARENT_SHA256,
    'INDEPENDENT_SOURCE_PINS_REQUIRED');
  check(globalThis.crypto?.subtle,'SHA256_UNAVAILABLE');
  const manifestBytes=requireBytes(manifestInput,256*1024);
  check(await digest(manifestBytes)===expectedManifestSha256,'MANIFEST_SHA256_MISMATCH');
  let manifest;
  try{manifest=JSON.parse(decoder.decode(manifestBytes));}
  catch{fail('INVALID_MANIFEST_JSON');}
  check(manifest?.schema===DB02_NATIVE_TAG_EVIDENCE_CONTRACT &&
    manifest.platform==='Steam' && manifest.gameVersion==='1.26.2' &&
    manifest.privateOnly===true && manifest.publicationAuthorized===false &&
    manifest.parentSrc02ManifestSha256===expectedParentSrc02ManifestSha256 &&
    manifest.nativeTagSourceSha256===DB02_NATIVE_TAG_SOURCE_SHA256 &&
    manifest.conditionSourceSha256===SOURCE_CONDITION_SHA256 &&
    manifest.nativeNameField===2 && manifest.displayNameKeyField===3 &&
    isObject(manifest.counts) && isObject(manifest.files) &&
    SHA.test(manifest.files['tags.jsonl']??'') && SHA.test(manifest.files['report.json']??'') &&
    Object.keys(manifest.files).length===2,
    'SOURCE_VERSION_OR_PROVENANCE_MISMATCH');
  const counts=manifest.counts;
  check(Number.isSafeInteger(counts.nativeTagDefinitions) && counts.nativeTagDefinitions>0 &&
    counts.nativeTagDefinitions<=5000 &&
    Number.isSafeInteger(counts.recipeSelectorTagIds) &&
    Number.isSafeInteger(counts.ingredientMembershipTagIds) &&
    Number.isSafeInteger(counts.uniqueReferencedTagIds) &&
    counts.recipeSelectorTagIds>=0 && counts.ingredientMembershipTagIds>=0 &&
    counts.uniqueReferencedTagIds>=0 &&
    counts.uniqueReferencedTagIds<=counts.nativeTagDefinitions,
    'INVALID_SOURCE_COUNTS');
  const rowsBytes=requireBytes(rowsInput,1024*1024);
  check(await digest(rowsBytes)===manifest.files['tags.jsonl'],'ROW_SHA256_MISMATCH');
  let records;
  try{
    const data=decoder.decode(rowsBytes);
    check(data.endsWith('\n'),'INVALID_ROW_TERMINATOR');
    const lines=data.split('\n');lines.pop();
    check(lines.length===counts.nativeTagDefinitions,'ROW_COUNT_MISMATCH');
    records=lines.map(line=>JSON.parse(line));
  }catch(e){
    if(String(e?.message??'').startsWith('DB02_TAG_'))throw e;
    fail('BAD_ROW_JSON');
  }
  let prev=0, recipeCount=0, memberCount=0, unionCount=0;
  const byId=new Map();
  const recipeIds=[];const membershipIds=[];
  for(const record of records){
    check(isObject(record) && Object.keys(record).length===6 &&
      validId(record.tagId) && record.tagId>prev &&
      record.frameKey===record.tagId-2_000_000_000 &&
      validKey(record.nativeName,256) && validKey(record.displayNameKey,512) &&
      typeof record.usedByRecipeSelector==='boolean' &&
      typeof record.usedByIngredientMembership==='boolean',
      'INVALID_NATIVE_TAG_ROW');
    prev=record.tagId;
    const copy=Object.freeze({tagId:record.tagId,frameKey:record.frameKey,
      nativeName:record.nativeName,displayNameKey:record.displayNameKey,
      usedByRecipeSelector:record.usedByRecipeSelector,
      usedByIngredientMembership:record.usedByIngredientMembership,
      namesLocalizedVerified:false,liveEligibilityVerified:false,
      currentGameSourceVerified:true,sourceFieldNumbers:Object.freeze({
        ID:1,Name:2,DisplayName:3})});
    byId.set(copy.tagId,copy);
    if(copy.usedByRecipeSelector){recipeCount++;recipeIds.push(copy.tagId);}
    if(copy.usedByIngredientMembership){memberCount++;membershipIds.push(copy.tagId);}
    if(copy.usedByRecipeSelector||copy.usedByIngredientMembership)unionCount++;
  }
  check(recipeCount===counts.recipeSelectorTagIds &&
    memberCount===counts.ingredientMembershipTagIds &&
    unionCount===counts.uniqueReferencedTagIds,
    'REFERENCED_TAG_COUNT_MISMATCH');
  const list=Object.freeze([...byId.values()]);
  return Object.freeze({
    contract:DB02_NATIVE_TAG_EVIDENCE_CONTRACT,
    privateSource:true,publishable:false,verified:true,
    sourceVersion:'Steam v1.26.2',
    manifestSha256:expectedManifestSha256,
    parentSrc02ManifestSha256:expectedParentSrc02ManifestSha256,
    nativeTagSourceSha256:DB02_NATIVE_TAG_SOURCE_SHA256,
    namesLocalizedVerified:false,liveEligibilityVerified:false,
    playerOwnershipVerified:false,saveWritingAuthorized:false,
    counts:Object.freeze({...counts}),
    allTags:list,
    recipeSelectorTagIds:Object.freeze(recipeIds),
    ingredientMembershipTagIds:Object.freeze(membershipIds),
    getTag(id){check(validId(id),'INVALID_QUERY_ID');return byId.get(id)??null;},
    getRecipeSelectorTag(id){check(validId(id),'INVALID_QUERY_ID');const row=byId.get(id);return row?.usedByRecipeSelector?row:null;},
    getIngredientMembershipTag(id){check(validId(id),'INVALID_QUERY_ID');const row=byId.get(id);return row?.usedByIngredientMembership?row:null;},
  });
}