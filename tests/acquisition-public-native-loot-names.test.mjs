import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  DB02_NATIVE_LOOT_NAME_FILE,DB02_NATIVE_LOOT_NAME_BYTES,
  DB02_NATIVE_LOOT_NAME_SHA256,
  hasPinnedNativeLootNameEvidence,loadPinnedNativeLootNames,
  joinPinnedNativeLootNames
} from '../src/lib/acquisition/public-native-loot-names.ts';
import {
  loadPinnedNativeLootCandidates,DB02_NATIVE_LOOT_FILE
} from '../src/lib/acquisition/public-native-loot.ts';

const root=new URL('../static/acquisition/public/',import.meta.url);
const namesBytes=readFileSync(new URL(DB02_NATIVE_LOOT_NAME_FILE,root));
const lootBytes=readFileSync(new URL(DB02_NATIVE_LOOT_FILE,root));
function localFetcher(flags={}){
  const requests=[];
  const fetcher=async url=>{
    requests.push(url);
    assert(url.startsWith('/Wand/acquisition/public/'));
    if(flags.missing)return new Response('missing',{status:404});
    const file=url.split('/').at(-1);
    const copy=file===DB02_NATIVE_LOOT_NAME_FILE?
      Buffer.from(namesBytes):file===DB02_NATIVE_LOOT_FILE?
      Buffer.from(lootBytes):null;
    assert(copy,'unexpected public asset '+url);
    if(file===DB02_NATIVE_LOOT_NAME_FILE){
      if(flags.corrupt)copy[100]^=1;
      if(flags.short)return new Response(copy.subarray(0,-1),{status:200});
    }
    return new Response(copy,{status:200});
  };
  return {fetcher,requests};
}
test('all 960 original LootTable name keys and all 28 native families are SHA-pinned',async()=>{
  assert.equal(namesBytes.length,DB02_NATIVE_LOOT_NAME_BYTES);
  assert.equal(createHash('sha256').update(namesBytes).digest('hex'),
    DB02_NATIVE_LOOT_NAME_SHA256);
  const raw=JSON.parse(namesBytes);
  assert.equal(raw.schema,'wand.db02.public-native-loot-name-keys@1');
  assert.equal(raw.source.sha256,
    '580db9ed81c37890fd1f8fab121a5d328c967d8c22ee253ff4c2b431d008d99c');
  assert.equal(raw.source.bytes,110133);
  const {requests,fetcher}=localFetcher();
  const names=await loadPinnedNativeLootNames('/Wand',fetcher);
  assert.equal(requests.length,1);
  assert(hasPinnedNativeLootNameEvidence(names));
  assert(!hasPinnedNativeLootNameEvidence({...names}));
  assert.equal(names.coverage.nativeLootTables,960);
  assert.equal(names.coverage.uniqueNativeNameKeys,960);
  assert.equal(names.coverage.nativeSourceFamilies,28);
  assert.equal(names.coverage.nativeNameOnlyNotGameplayContext,true);
  assert.equal(names.coverage.localizedDisplayNamesVerified,false);
  assert.equal(names.coverage.actualAcquisitionContextVerified,false);
  assert.equal(names.coverage.guaranteedDropsVerified,false);
  assert.equal(names.tableNames.length,960);
  assert.equal(names.listNativeFamilies().length,28);
  assert.equal(names.getFamilyTables('PoolingStall').length,226);
  assert.equal(names.getFamilyTables('Mission').length,204);
  assert.equal(names.getFamilyTables('Chest').length,70);
  assert(Object.isFrozen(names)&&Object.isFrozen(names.tableNames)&&
    Object.isFrozen(names.coverage)&&Object.isFrozen(names.listNativeFamilies()));
});
test('original native names are distinct from translated names, confirmed sources and live drops',async()=>{
  const names=await loadPinnedNativeLootNames('/Wand',localFetcher().fetcher);
  const table=names.getTableName(2090000000);
  assert(table);
  assert.deepEqual({
    id:table.tableId,name:table.nativeNameKey,family:table.sourceFamily
  },{id:'2090000000',name:'Chest!LootPresent1',family:'Chest'});
  assert.equal(table.originalKeyVerified,true);
  assert.equal(table.localizedDisplayNameVerified,false);
  assert.equal(table.gameplayAcquisitionContextVerified,false);
  assert(Object.isFrozen(table));
  assert(names.getFamilyTables('Chest').includes(table));
  assert.equal(names.getTableName(2090999999),null);
  assert.deepEqual(names.getFamilyTables('Unknown'),[]);
});
test('full native LootTable candidates join exact source-name keys without promoting Item availability',async()=>{
  const {requests,fetcher}=localFetcher();
  const [names,loot]=await Promise.all([
    loadPinnedNativeLootNames('/Wand',fetcher),
    loadPinnedNativeLootCandidates('/Wand',fetcher)
  ]);
  assert.equal(requests.length,2);
  const index=joinPinnedNativeLootNames(loot,names);
  assert.equal(index.schema,'wand.db02.public-native-named-loot-join@1');
  assert.equal(index.gameVersion,'1.26.2');
  assert.equal(index.loot,loot);
  assert.equal(index.names,names);
  assert.equal(index.sourceNativeNamesOnly,true);
  assert.equal(index.guaranteedDropsVerified,false);
  assert.equal(index.candidateRelations.length,3804);
  assert.equal(index.listCandidateItemIds().length,1100);
  assert.equal(index.familySummaries.length,28);
  const table=index.getTableNamedCandidates(2090000000);
  assert.equal(table.length,1);
  assert.equal(table[0].itemId,'80000000');
  assert.equal(table[0].nativeNameKey,'Chest!LootPresent1');
  assert.equal(table[0].nativeSourceFamily,'Chest');
  assert.equal(table[0].routeStatus,'static_candidate_only');
  assert.equal(table[0].originalNameVerified,true);
  assert.equal(table[0].localizedNameVerified,false);
  assert.equal(table[0].nativeNameOnlyNotGameplayContext,true);
  assert.equal(table[0].actualDropVerified,false);
  assert.equal(table[0].availabilityVerified,false);
  assert(index.getItemNamedCandidates('80000000').includes(table[0]));
  assert(index.getFamilyCandidates('Chest').includes(table[0]));
  assert.equal(index.getFamilySummary('PoolingStall')?.tables.length,226);
  assert.equal(index.getFamilySummary('Mission')?.tables.length,204);
  assert.equal(index.getFamilySummary('Chest')?.tables.length,70);
  for(const entry of index.candidateRelations){
    assert.equal(entry.lootCandidate.tableId,entry.tableId);
    assert.equal(entry.name.tableId,entry.tableId);
    assert.equal(entry.lootCandidate.itemId,entry.itemId);
    assert.equal(entry.routeStatus,'static_candidate_only');
    assert.equal(entry.actualDropVerified,false);
    assert(Object.isFrozen(entry));
  }
  assert(Object.isFrozen(index)&&Object.isFrozen(index.candidateRelations)&&
    Object.isFrozen(index.familySummaries)&&
    Object.isFrozen(index.listCandidateItemIds()));
  assert.deepEqual(index.getItemNamedCandidates(99999999),[]);
  assert.deepEqual(index.getTableNamedCandidates(2090999999),[]);
  assert.deepEqual(index.getFamilyCandidates('Unknown'),[]);
  assert.equal(index.getFamilySummary('Unknown'),null);
});
test('unverified source, forged projection, corrupted bytes or invalid IDs fail closed',async()=>{
  await assert.rejects(loadPinnedNativeLootNames(
    '/Wand',localFetcher({short:true}).fetcher),/DB02_NATIVE_LOOT_NAME_BYTES/);
  await assert.rejects(loadPinnedNativeLootNames(
    '/Wand',localFetcher({corrupt:true}).fetcher),/DB02_NATIVE_LOOT_NAME_SHA/);
  await assert.rejects(loadPinnedNativeLootNames(
    '/Wand',localFetcher({missing:true}).fetcher),/DB02_NATIVE_LOOT_NAME_DOWNLOAD_FAILED/);
  await assert.rejects(loadPinnedNativeLootNames(
    '/Wand/../invalid',localFetcher().fetcher),/DB02_NATIVE_LOOT_NAME_INVALID_BASE_PATH/);
  const {fetcher}=localFetcher();
  const [names,loot]=await Promise.all([
    loadPinnedNativeLootNames('/Wand',fetcher),
    loadPinnedNativeLootCandidates('/Wand',fetcher)
  ]);
  assert.throws(()=>joinPinnedNativeLootNames(loot,{...names}),
    /PINNED_NATIVE_SOURCES_REQUIRED/);
  assert.throws(()=>joinPinnedNativeLootNames({...loot},names),
    /PINNED_NATIVE_SOURCES_REQUIRED/);
  const index=joinPinnedNativeLootNames(loot,names);
  assert.throws(()=>names.getTableName('02090000000'),/INVALID_ITEM_ID/);
  assert.throws(()=>names.getFamilyTables('bad space'),/INVALID_FAMILY/);
  assert.throws(()=>index.getItemNamedCandidates(-1),/INVALID_ITEM_ID/);
  assert.throws(()=>index.getFamilyCandidates('INVALID FAMILY'),/INVALID_FAMILY/);
});
