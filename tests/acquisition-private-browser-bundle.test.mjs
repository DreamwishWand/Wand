import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {openPrivateSrc02Archive,loadPrivateSrc02BrowserBundle,
  PRIVATE_SRC02_BROWSER_CONTRACT,CURRENT_STEAM_1262_CONDITION_SHA256,REJECTED_R4_MANIFEST_SHA256
} from '../src/lib/acquisition/private-browser-bundle.mjs';

const SHA=x=>createHash('sha256').update(x).digest('hex');
const PACK=x=>Buffer.from(JSON.stringify(x)+'\n');
const FILES=['recipes.jsonl','acquisitions.jsonl','loot-tables.jsonl','shop-offers.jsonl',
 'stall-sources.jsonl','related-items.jsonl','ingredient-selector-membership.jsonl',
 'condition-gates.jsonl','condition-definitions.jsonl','report.json','unresolved.json'];
const put16=(b,v,n)=>b.writeUInt16LE(v,n);
const put32=(b,v,n)=>b.writeUInt32LE(v>>>0,n);
function crc32(data){let c=0xffffffff;for(const b of data){c^=b;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);}return(c^0xffffffff)>>>0;}
function zip(map){
 const locals=[],centrals=[];let start=0;
 for(const [filename,payload] of Object.entries(map)){
  const name=Buffer.from(filename), data=Buffer.from(payload),compressed=deflateRawSync(data),crc=crc32(data);
  const local=Buffer.alloc(30+name.length+compressed.length),central=Buffer.alloc(46+name.length);
  put32(local,0x04034b50,0);put16(local,20,4);put16(local,8,8);
  put32(local,crc,14);put32(local,compressed.length,18);put32(local,data.length,22);
  put16(local,name.length,26);name.copy(local,30);compressed.copy(local,30+name.length);
  put32(central,0x02014b50,0);put16(central,20,4);put16(central,20,6);
  put16(central,8,10);put32(central,crc,16);put32(central,compressed.length,20);
  put32(central,data.length,24);put16(central,name.length,28);put32(central,start,42);
  name.copy(central,46);locals.push(local);centrals.push(central);start+=local.length;
 }
 const central=Buffer.concat(centrals),tail=Buffer.alloc(22);
 put32(tail,0x06054b50,0);put16(tail,locals.length,8);put16(tail,locals.length,10);
 put32(tail,central.length,12);put32(tail,start,16);
 return new Uint8Array(Buffer.concat([...locals,central,tail]));
}
function fixture({tamper=false,invalidLink=false,extra=false,staleCondition=false}={}){
 const datasets=Object.fromEntries(FILES.filter(x=>x.endsWith('.jsonl')).map(x=>[x,Buffer.from('\n')]));
 const unresolved={schema:'wand.src02.unresolved@1',notAStatementOfAbsence:true,
  missingInPartialSrc01:[],unsupportedActivityDefinitions:[],selectorsNotFoundInObservedCookingFamilies:[]};
 const counts={recipes:0,cooking:0,crafting:0,acquisitions:0,growing:0,lootTables:0,
  shopOffersVerified:0,stallsWithStaticLoot:0,stallLootSlots:0,distinctStallLootTables:0,
  linkedItemIds:0,ingredientSelectorMembers:0,ingredientSelectorSourceDefinitions:4050,
  ingredientSelectorIdsReferenced:0,ingredientSelectorUses:0,
  ingredientSelectorIdsWithObservedMembers:0,ingredientSelectorIdsWithoutObservedMembers:0,
  conditionGates:0,conditionDefinitions:0,conditionGateUsages:0,conditionSourceDefinitions:5440,
  unsupportedActivityDefinitions:0,unresolvedLinkedItemIds:0,sourceItems:0};
 if(invalidLink){
   datasets['related-items.jsonl']=PACK({itemId:123,inSrc01:true,recipesProducedBy:[321],
      recipesUsedBy:[],acquisitionPaths:[],growPathsForSeed:[]});
   counts.linkedItemIds=1;
 }
 datasets['report.json']=PACK({schema:'wand.src02.report@1',status:'partial_native_extraction',counts});
 datasets['unresolved.json']=PACK(unresolved);
 const files=Object.fromEntries(Object.entries(datasets).map(([name,bytes])=>[name,SHA(bytes)]));
 const manifest={schema:'wand.src02@1',status:'partial_native_extraction',platform:'Steam',gameVersion:'1.26.2',
  source:{src01ManifestSha256:'b'.repeat(64),src01ItemsSha256:'c'.repeat(64),
    conditionSha256:staleCondition?'f9716fd7e80631213812ed2c93f802ee7ef73a0874214044d8e4304c555dc150':CURRENT_STEAM_1262_CONDITION_SHA256},
  counts,files};
 const manifestBytes=PACK(manifest);
 const trusted={platform:'Steam',gameVersion:'1.26.2',
  manifestSha256:SHA(manifestBytes),src01ManifestSha256:manifest.source.src01ManifestSha256,
  currentConditionSha256:CURRENT_STEAM_1262_CONDITION_SHA256};
 if(tamper)datasets['recipes.jsonl']=Buffer.from(' \n'); // same ledger, valid CRC
 const entries={'manifest.json':manifestBytes,...datasets};
 if(extra)entries['../../private.json']=Buffer.from('malicious');
 return {source:zip(entries),trusted};
}

test('current Steam v1.26.2 Condition SHA is independent of rejected r4 manifest',()=>{
 assert.equal(CURRENT_STEAM_1262_CONDITION_SHA256,
  '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c');
 assert.equal(REJECTED_R4_MANIFEST_SHA256,
  '323f666cd30ae1e784879d4664ca57a845559734d147193b7d7177fd59eb938d');
});
test('old 1.26.1 Condition source cannot be admitted under a matching pinned manifest SHA',async()=>{
 const x=fixture({staleCondition:true});
 await assert.rejects(loadPrivateSrc02BrowserBundle(x.source,x.trusted),/STALE_OR_UNVERIFIED_CONDITION_SOURCE/);
});
test('invalid independent Condition pin fails before ZIP is trusted',async()=>{
 const x=fixture();
 await assert.rejects(loadPrivateSrc02BrowserBundle(x.source,{...x.trusted,currentConditionSha256:'f9716fd7e80631213812ed2c93f802ee7ef73a0874214044d8e4304c555dc150'}),/INDEPENDENT_CURRENT_SOURCE_PIN_REQUIRED/);
});
test('synthetic archive loads exact 12 source members and strictly private query facade',async()=>{
 const x=fixture();const a=await loadPrivateSrc02BrowserBundle(x.source,x.trusted);
 assert.equal(a.contract,PRIVATE_SRC02_BROWSER_CONTRACT);
 assert.equal(a.manifestSha256,x.trusted.manifestSha256);
 assert.equal(a.privateSource,true);assert.equal(a.publishable,false);
 assert.equal(a.currentShopOffersVerified,false);assert.equal(a.saveWritingAuthorized,false);
 assert.equal(a.counts.recipes,0);assert.equal(a.getItem(777)?.status,'unresolved_or_no_verified_link');
 assert.ok(Object.isFrozen(a));assert.ok(Object.isFrozen(a.counts));
 assert.throws(()=>{a.counts.recipes=12},TypeError);
});
test('even valid current r5 source is never accepted without an independent caller pin',async()=>{
 const x=fixture();
 await assert.rejects(loadPrivateSrc02BrowserBundle(x.source),/INDEPENDENT_CURRENT_SOURCE_PIN_REQUIRED/);
});
test('independent manifest mismatch fails before any game row is trusted',async()=>{
 const x=fixture();await assert.rejects(
  loadPrivateSrc02BrowserBundle(x.source,{...x.trusted,manifestSha256:'a'.repeat(64)}),/MANIFEST_PIN_MISMATCH/);
});
test('single changed member is rejected even if ZIP CRC is recomputed',async()=>{
 const x=fixture({tamper:true});
 await assert.rejects(loadPrivateSrc02BrowserBundle(x.source,x.trusted),/FILE_SHA256_recipes.jsonl/);
});
test('dangling native references fail despite valid file ledger',async()=>{
 const x=fixture({invalidLink:true});
 await assert.rejects(loadPrivateSrc02BrowserBundle(x.source,x.trusted),/Broken reference/);
});
test('ZIP directory rejects traversal and extra entries before exposing any payload',()=>{
 const x=fixture({extra:true});assert.throws(()=>openPrivateSrc02Archive(x.source),/ENTRY_COUNT_OR_DISK/);
});
test('ZIP rejects altered CRC, wrong bytes and missing entries',async()=>{
 const x=fixture();
 const bytes=new Uint8Array(x.source);const marker=Buffer.from('manifest.json');
 const start=30+marker.length;bytes[start+5]^=0xff;
 await assert.rejects(openPrivateSrc02Archive(bytes).readFile('manifest.json'));
 const y=zip({'manifest.json':Buffer.from('{}')});
 assert.throws(()=>openPrivateSrc02Archive(y),/ENTRY_COUNT_OR_DISK/);
});
test('rejects misplaced input, unverifiable expected pin and forbidden file reads',async()=>{
 const x=fixture();
 await assert.rejects(loadPrivateSrc02BrowserBundle(x.source,{...x.trusted,gameVersion:'1.26.3'}),/INDEPENDENT_CURRENT_SOURCE_PIN_REQUIRED/);
 await assert.rejects(openPrivateSrc02Archive(x.source).readFile('../profile.json'),/FORBIDDEN_FILE/);
 assert.throws(()=>openPrivateSrc02Archive(new Uint8Array(17)),/ARCHIVE_SIZE/);
});