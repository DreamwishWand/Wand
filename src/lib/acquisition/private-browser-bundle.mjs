/**
 * Owner-private, local-file SRC-02 catalog loader. No network requests or
 * publication. All source bytes are authenticated by an independent SHA-256
 * manifest pin, and every member is authenticated by that manifest ledger.
 * Do not send returned data to a public API or automatic app export.
 */
import { createAcquisitionDatabase } from './index.mjs';

export const PRIVATE_SRC02_BROWSER_CONTRACT = 'wand.src02.private-browser-bundle@1';
// Independently captured Steam v1.26.2 original Condition.json fingerprint.
// The earlier Steam v1.26.1 original was mistakenly included in r4. It is
// forbidden even when a caller pins the old r4 manifest with SHA-256.
export const CURRENT_STEAM_1262_CONDITION_SHA256 = '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c';
export const REJECTED_R4_MANIFEST_SHA256 = '323f666cd30ae1e784879d4664ca57a845559734d147193b7d7177fd59eb938d';
const MAX_ARCHIVE = 24 * 1024 * 1024;
const MAX_FILE = 8 * 1024 * 1024;
const MAX_EXPANDED = 24 * 1024 * 1024;
const SHA = /^[a-f0-9]{64}$/;
const NAMES = Object.freeze({
  'recipes.jsonl':'recipes','acquisitions.jsonl':'acquisitions',
  'loot-tables.jsonl':'lootTables','shop-offers.jsonl':'shopOffers',
  'stall-sources.jsonl':'stallSources','related-items.jsonl':'relatedItems',
  'ingredient-selector-membership.jsonl':'ingredientMembership',
  'condition-gates.jsonl':'conditionGates','condition-definitions.jsonl':'conditionDefinitions',
  'report.json':'report','unresolved.json':'unresolved',
});
const EXPECTED = Object.freeze(['manifest.json', ...Object.keys(NAMES)]);
const dec = new TextDecoder('utf-8', {fatal:true});
const fail = reason => { throw new TypeError('PRIVATE_SRC02_' + reason); };
const check = (ok, reason) => {if(!ok)fail(reason);};
const u16 = (view,offset) => view.getUint16(offset,true);
const u32 = (view,offset) => view.getUint32(offset,true);
const plain = x => x !== null && typeof x==='object' && !Array.isArray(x);
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
  x=>x.toString(16).padStart(2,'0')).join('');
let crcTable;
function crc32(bytes){
  if(!crcTable)crcTable=Uint32Array.from({length:256},(_,i)=>{
    let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
    return c>>>0;
  });
  let c=0xffffffff;
  for(const v of bytes)c=(c>>>8)^crcTable[(c^v)&255];
  return (c^0xffffffff)>>>0;
}
function freezeDeep(root){
  const seen=new WeakSet(),pending=[root];
  while(pending.length){
    const obj=pending.pop();
    if(obj===null||typeof obj!=='object'||seen.has(obj))continue;
    check(Array.isArray(obj)||Object.getPrototypeOf(obj)===Object.prototype,
      'UNEXPECTED_SOURCE_OBJECT');
    seen.add(obj);
    for(const value of Object.values(obj))if(value!==null&&typeof value==='object')pending.push(value);
    Object.freeze(obj);
  }
  return root;
}

/** Fixed set of source members. Reject extra paths, duplicates, ZIP64, symlinks and encryption. */
export function openPrivateSrc02Archive(input){
  check(input instanceof Uint8Array && input.byteLength>=22 && input.byteLength<=MAX_ARCHIVE,'ARCHIVE_SIZE');
  const view=new DataView(input.buffer,input.byteOffset,input.byteLength);
  let eocd=-1;
  for(let p=input.byteLength-22;p>=Math.max(0,input.byteLength-65557);p--){
    if(u32(view,p)===0x06054b50 && p+22+u16(view,p+20)===input.byteLength){eocd=p;break;}
  }
  check(eocd>=0,'EOCD_MISSING');
  check(u16(view,eocd+4)===0 && u16(view,eocd+6)===0 &&
    u16(view,eocd+8)===EXPECTED.length && u16(view,eocd+10)===EXPECTED.length,
    'ENTRY_COUNT_OR_DISK');
  const begin=u32(view,eocd+16), size=u32(view,eocd+12);
  check(begin!==0xffffffff&&size!==0xffffffff&&begin+size===eocd,
    'CENTRAL_DIRECTORY');
  const descriptors=new Map(); let pos=begin, expandedTotal=0;
  for(let i=0;i<EXPECTED.length;i++){
    check(pos+46<=eocd&&u32(view,pos)===0x02014b50,'CENTRAL_HEADER');
    const madeBy=u16(view,pos+4), flags=u16(view,pos+8), method=u16(view,pos+10);
    const crc=u32(view,pos+16),length=u32(view,pos+20),rawSize=u32(view,pos+24);
    const nameLength=u16(view,pos+28),extra=u16(view,pos+30),comment=u16(view,pos+32);
    const disk=u16(view,pos+34),externalAttr=u32(view,pos+38),local=u32(view,pos+42);
    const end=pos+46+nameLength+extra+comment;
    check(end<=eocd&&disk===0&&flags===0&&(method===0||method===8)&&
      length<=MAX_FILE&&rawSize<=MAX_FILE&&rawSize!==0xffffffff,
      'UNSUPPORTED_ENTRY');
    // Reject Unix symlinks (including otherwise valid names).
    check((madeBy>>>8)!==3 || ((externalAttr>>>16)&0xf000)!==0xa000,'SYMLINK');
    const name=dec.decode(input.subarray(pos+46,pos+46+nameLength));
    check(EXPECTED.includes(name)&&!descriptors.has(name),'UNEXPECTED_MEMBER');
    check(local+30<=begin&&u32(view,local)===0x04034b50,'LOCAL_HEADER');
    const localNameLen=u16(view,local+26),localExtraLen=u16(view,local+28);
    const offset=local+30+localNameLen+localExtraLen;
    check(u16(view,local+6)===flags&&u16(view,local+8)===method&&
      u32(view,local+14)===crc&&u32(view,local+18)===length&&
      u32(view,local+22)===rawSize&&offset+length<=begin&&
      dec.decode(input.subarray(local+30,local+30+localNameLen))===name,
      'LOCAL_HEADER_MISMATCH');
    check(!(method===0&&length!==rawSize),'STORED_SIZE_MISMATCH');
    descriptors.set(name,{offset,length,rawSize,crc,method});
    expandedTotal+=rawSize;check(expandedTotal<=MAX_EXPANDED,'TOTAL_EXPANDED_LIMIT');
    pos=end;
  }
  check(pos===eocd&&descriptors.size===EXPECTED.length,'INCOMPLETE_ARCHIVE');
  return Object.freeze({
    fileCount:descriptors.size,
    async readFile(name){
      check(EXPECTED.includes(name),'FORBIDDEN_FILE');
      const info=descriptors.get(name);
      check(info,'MISSING_FILE');
      const compressed=input.subarray(info.offset,info.offset+info.length);
      let data;
      if(info.method===0)data=new Uint8Array(compressed);
      else {
        check(typeof DecompressionStream==='function','RAW_DEFLATE_UNAVAILABLE');
        const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const reader=stream.getReader();
        const chunks=[];let size=0;
        try {
          while(true){
            const {value,done}=await reader.read();if(done)break;
            size+=value.length;
            if(size>info.rawSize||size>MAX_FILE)fail('DECOMPRESSION_LIMIT');
            chunks.push(value);
          }
        } finally {reader.releaseLock();}
        data=new Uint8Array(size);
        let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}
      }
      check(data.length===info.rawSize&&crc32(data)===info.crc,'DATA_CRC_OR_LENGTH');
      return data;
    }
  });
}

function parseLines(bytes,filename){
  const result=[];
  for(const [index,line] of dec.decode(bytes).split(/\r?\n/).entries()){
    if(!line.trim())continue;
    let row;
    try{row=JSON.parse(line);}catch{fail('INVALID_JSONL_'+filename+'_'+(index+1));}
    check(plain(row),'NONOBJECT_JSONL');
    result.push(row);
  }
  return result;
}
function countCheck(c,loaded){
  check(plain(c)&&loaded.report.schema==='wand.src02.report@1' &&
    loaded.report.status==='partial_native_extraction' &&
    JSON.stringify(c)===JSON.stringify(loaded.report.counts),'REPORT_COUNTS');
  for(const [field,length] of Object.entries({
    recipes:loaded.recipes.length,
    cooking:loaded.recipes.filter(x=>x.type==='cooking').length,
    crafting:loaded.recipes.filter(x=>x.type==='crafting').length,
    acquisitions:loaded.acquisitions.length,
    growing:loaded.acquisitions.filter(x=>x.type==='growing').length,
    lootTables:loaded.lootTables.length,
    shopOffersVerified:loaded.shopOffers.length,
    stallsWithStaticLoot:loaded.stallSources.length,
    stallLootSlots:loaded.stallSources.reduce((n,s)=>n+s.slotLootTableIds.length,0),
    distinctStallLootTables:new Set(loaded.stallSources.flatMap(x=>x.slotLootTableIds)).size,
    linkedItemIds:loaded.relatedItems.length,
    ingredientSelectorMembers:loaded.ingredientMembership.length,
    conditionGates:loaded.conditionGates.length,
    conditionDefinitions:loaded.conditionDefinitions.length,
    conditionGateUsages:loaded.conditionGates.reduce((n,g)=>n+g.usedBy.length,0),
    unsupportedActivityDefinitions:loaded.unresolved.unsupportedActivityDefinitions?.length,
    unresolvedLinkedItemIds:loaded.unresolved.missingInPartialSrc01?.length
  }))check(c[field]===length,'COUNT_'+field);
  check(c.ingredientSelectorSourceDefinitions===4050&&
    Number.isSafeInteger(c.conditionSourceDefinitions)&&
    c.conditionSourceDefinitions>=loaded.conditionDefinitions.length,
    'SOURCE_COVERAGE');
  check(loaded.unresolved.schema==='wand.src02.unresolved@1'&&
    loaded.unresolved.notAStatementOfAbsence===true&&
    Array.isArray(loaded.unresolved.unsupportedActivityDefinitions)&&
    Array.isArray(loaded.unresolved.missingInPartialSrc01),'UNRESOLVED_SCHEMA');
  const missing=new Set(loaded.unresolved.missingInPartialSrc01);
  check(missing.size===loaded.unresolved.missingInPartialSrc01.length&&
    loaded.relatedItems.every(x=>x.inSrc01===!missing.has(x.itemId))&&
    loaded.relatedItems.filter(x=>!x.inSrc01).length===missing.size,
    'SRC01_MEMBERSHIP');
  check(Array.isArray(loaded.unresolved.selectorsNotFoundInObservedCookingFamilies)&&
    loaded.unresolved.selectorsNotFoundInObservedCookingFamilies.length===c.ingredientSelectorIdsWithoutObservedMembers,
    'INGREDIENT_UNRESOLVED');
}

/** Source from a separately audited ledger, never from the user-selected ZIP. */
export async function loadPrivateSrc02BrowserBundle(archiveBytes, trusted){
  check(trusted&&trusted.platform==='Steam'&&trusted.gameVersion==='1.26.2'&&
    SHA.test(trusted.manifestSha256)&&SHA.test(trusted.src01ManifestSha256)&&
    trusted.currentConditionSha256===CURRENT_STEAM_1262_CONDITION_SHA256,
    'INDEPENDENT_CURRENT_SOURCE_PIN_REQUIRED');
  const archive=openPrivateSrc02Archive(archiveBytes);
  const manifestBytes=await archive.readFile('manifest.json');
  const sha=await digest(manifestBytes);
  check(sha===trusted.manifestSha256,'MANIFEST_PIN_MISMATCH');
  let manifest;
  try{manifest=JSON.parse(dec.decode(manifestBytes));}catch{fail('MANIFEST_JSON');}
  check(manifest?.schema==='wand.src02@1'&&manifest.status==='partial_native_extraction'&&
    manifest.platform===trusted.platform&&manifest.gameVersion===trusted.gameVersion&&
    manifest.source?.src01ManifestSha256===trusted.src01ManifestSha256&&
    plain(manifest.files)&&Object.keys(manifest.files).length===Object.keys(NAMES).length&&
    Object.keys(NAMES).every(n=>SHA.test(manifest.files[n])),
    'MANIFEST_SOURCE_OR_LEDGER');
  check(manifest.source?.conditionSha256===CURRENT_STEAM_1262_CONDITION_SHA256,
    'STALE_OR_UNVERIFIED_CONDITION_SOURCE');
  const loaded={manifest};
  for(const [name,key] of Object.entries(NAMES)){
    const bytes=await archive.readFile(name);
    check(await digest(bytes)===manifest.files[name],'FILE_SHA256_'+name);
    try{loaded[key]=name.endsWith('.jsonl')?parseLines(bytes,name):JSON.parse(dec.decode(bytes));}
    catch(e){if(e?.message?.startsWith('PRIVATE_SRC02_'))throw e;fail('INVALID_JSON_'+name);}
  }
  countCheck(manifest.counts,loaded);
  const db=createAcquisitionDatabase(loaded); // Fail closed on broken links and native conditions.
  freezeDeep(loaded);
  return Object.freeze({
    contract:PRIVATE_SRC02_BROWSER_CONTRACT,
    manifestSha256:sha,privateSource:true,publishable:false,
    verified:true,provenanceMatched:true,
    source:Object.freeze({platform:manifest.platform,gameVersion:manifest.gameVersion}),
    counts:Object.freeze({...manifest.counts}),
    currentShopOffersVerified:false,playerOwnershipVerified:false,
    currentAvailabilityVerified:false,saveWritingAuthorized:false,
    getItem(id){return freezeDeep(db.getItem(id));},
    getRecipe(id){return db.getRecipe(id);},
    getStaticStall(id){return db.getStallStaticCatalog(id);},
    getPossibleStallsForItem(id){return freezeDeep(db.getPossibleStallsForItem(id));},
    getIngredientSelectorCandidates(id){return db.getIngredientSelectorCandidates(id);}
  });
}