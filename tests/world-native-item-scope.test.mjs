import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDb04NativeItemScopeClient,DB04_NATIVE_SCOPE_CLIENT,
  DB04_WORLD_TAGS} from '../src/lib/world/native-item-scope.ts';

const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const encode=(s)=>new TextEncoder().encode(s);
const CATEGORIES={Furniture:6746,Clothing:2041,Trimming:365,ActivityItem:4050};
let fixtureRows;
function rows(){
  if(fixtureRows)return fixtureRows;
  const output=[];
  let next=1;
  for(const [nativeCategory,count] of Object.entries(CATEGORIES)){
    for(let i=0;i<count;i++){
      const itemId=next++;
      output.push({
        itemId,nativeCategory,
        worldsDirect:itemId===1?['IsDreamlightValley']:
          itemId===2?['IsEternityIsle']:[],
        universeTagsDirect:itemId===1?['Mickey']:[],
        universeSetCandidates:itemId===1?['Mickey']:
          itemId===2?['Ratatouille']:[],
        setDefinitionIds:itemId===1?[202000001]:
          itemId===2?[202000002]:[]
      });
    }
  }
  fixtureRows=output;
  return output;
}
function build(rowsOverride=rows(),alterAudit=()=>{}){
  const lines=rowsOverride.map(x=>JSON.stringify(x)).join('\n')+'\n';
  const rowsBytes=encode(lines);
  const audit={
    schema:'wand.collection.scope-evidence.private@1',
    sourcePlatform:'Steam',gameVersion:'1.26.2',
    privateOnly:true,publicationAuthorized:false,
    sourceSha256:Object.fromEntries(
      [...Object.keys(CATEGORIES),'Tag','Set'].map(n=>[n+'.json',hash(encode(n))])),
    rowsSha256:hash(rowsBytes),
    counts:{
      items:rowsOverride.length,
      world_direct:rowsOverride.filter(x=>x.worldsDirect.length).length,
      universe_direct:rowsOverride.filter(x=>x.universeTagsDirect.length).length,
      universe_set_candidate:rowsOverride.filter(x=>x.universeSetCandidates.length).length,
      universe_any_evidence:rowsOverride.filter(x=>
        x.universeTagsDirect.length||x.universeSetCandidates.length).length
    },
    byWorldTag:Object.fromEntries(DB04_WORLD_TAGS.filter(k=>rowsOverride.some(
      r=>r.worldsDirect.includes(k))).map(k=>
      [k,rowsOverride.filter(r=>r.worldsDirect.includes(k)).length]))
  };
  alterAudit(audit);
  const auditBytes=encode(JSON.stringify(audit)+'\n');
  return {auditBytes,rowsBytes,expectedAuditSha256:hash(auditBytes),
    expectedRowsSha256:hash(rowsBytes)};
}

test('original tag evidence reverses World and Universe items without inventing DLC or locations',async()=>{
  const db=await createDb04NativeItemScopeClient(build());
  assert.equal(db.contract,DB04_NATIVE_SCOPE_CLIENT);
  assert.equal(db.source.gameVersion,'1.26.2');
  assert.equal(db.source.originalItemDefinitions,13202);
  assert.equal(db.source.publicationAuthorized,false);
  assert.deepEqual(db.getItem(1)?.worldsDirect,['IsDreamlightValley']);
  assert.deepEqual(db.getItem(1)?.universeTagsDirect,['Mickey']);
  assert.deepEqual(db.getItem(2)?.universeSetCandidates,['Ratatouille']);
  assert.equal(db.getItem(5000)?.worldsDirect.length,0);
  assert.equal(db.getItem(999999999),null);
  const world=db.byWorldTag('IsDreamlightValley',{offset:0,limit:1});
  assert.deepEqual(world.itemIds,[1]);
  assert.equal(world.evidenceKind,'world_tag_direct');
  assert.equal(world.status,'source_native_tag_present');
  assert.equal(world.matchingItemIdsInSourceSubset,1);
  assert.equal(world.sourceCoverageComplete,false);
  assert.equal(world.gameUiMembershipVerified,false);
  assert.equal(world.acquisitionWorldVerified,false);
  assert.equal(world.dlcEntitlementVerified,false);
  const direct=db.byUniverseTag('Mickey','direct');
  const candidate=db.byUniverseTag('Ratatouille','set_candidate');
  assert.deepEqual(direct.itemIds,[1]);
  assert.deepEqual(candidate.itemIds,[2]);
  assert.equal(candidate.status,'source_name_candidate_present');
  assert.equal(db.byUniverseTag('Ratatouille','direct').status,'unverified');
  assert.equal(db.byWorldTag('isSeaOfSecrets').status,'unverified');
  assert.equal(db.byUniverseTag('Missing','set_candidate').status,'unverified');
});
test('private rows require independent trusted hashes and cannot mutate after loading',async()=>{
  const fixture=build();
  const db=await createDb04NativeItemScopeClient(fixture);
  const result=db.getItem(1);
  assert.throws(()=>result.worldsDirect.push('IsEternityIsle'),TypeError);
  assert.throws(()=>{result.itemId=10;},TypeError);
  assert.throws(()=>db.byWorldTag('not-a-world'),/UNKNOWN_WORLD_TAG/);
  assert.throws(()=>db.byUniverseTag('wrong name','direct'),/INVALID_UNIVERSE_QUERY/);
  assert.throws(()=>db.byWorldTag('IsDreamlightValley',{offset:0,limit:0}),
    /INVALID_PAGE/);
  assert.throws(()=>db.byWorldTag('IsDreamlightValley',{offset:-1,limit:1}),
    /INVALID_PAGE/);
  assert.throws(()=>db.getItem(0),/INVALID_ITEM_ID/);
  await assert.rejects(createDb04NativeItemScopeClient({
    ...fixture,expectedRowsSha256:'f'.repeat(64)}),/TRUSTED_SHA_MISMATCH/);
  fixture.rowsBytes[0]=0;
  assert.equal(db.getItem(1).itemId,1);
});
test('tampered signed audit ledgers and original semantic conflicts fail closed',async()=>{
  const wrongCounts=build(rows(),audit=>{audit.counts.world_direct=3;});
  await assert.rejects(createDb04NativeItemScopeClient(wrongCounts),
    /AUDIT_COUNT_MISMATCH/);
  const badWorld=rows().map(r=>({...r}));
  badWorld[0]={...badWorld[0],worldsDirect:['untrustedWorld']};
  await assert.rejects(createDb04NativeItemScopeClient(build(badWorld)),
    /ROW_SOURCE_SHAPE/);
  const conflict=rows().map(r=>({...r}));
  conflict[0]={...conflict[0],universeSetCandidates:['Ratatouille']};
  await assert.rejects(createDb04NativeItemScopeClient(build(conflict)),
    /ROW_SET_CANDIDATE_CONFLICT/);
  const wrongVersion=build(rows(),audit=>{audit.gameVersion='1.26.3';});
  await assert.rejects(createDb04NativeItemScopeClient(wrongVersion),
    /PRIVATE_CURRENT_SOURCE_REQUIRED/);
  const wrongCategory=rows().map(r=>({...r}));
  wrongCategory[0]={...wrongCategory[0],nativeCategory:'Clothing'};
  await assert.rejects(createDb04NativeItemScopeClient(build(wrongCategory)),
    /NATIVE_CATEGORY_COUNT_MISMATCH/);
});

test('archived source-attested private ZIP audit preserves native tag counts',async()=>{
  const original=build();
  const audit=JSON.parse(new TextDecoder().decode(original.auditBytes));
  audit.originalSourceSha256=audit.sourceSha256;
  delete audit.sourceSha256;
  audit.counts={
    items:audit.counts.items,
    worldDirect:audit.counts.world_direct,
    universeDirect:audit.counts.universe_direct,
    universeSetCandidate:audit.counts.universe_set_candidate,
    universeAnyEvidence:audit.counts.universe_any_evidence
  };
  audit.byNativeCategory=Object.fromEntries(
    Object.entries(CATEGORIES).map(([name,items])=>[name,{items}]));
  audit.worlds=[...DB04_WORLD_TAGS];
  audit.importStatus='private_candidate_only_not_merged_into_public_catalog';
  const auditBytes=encode(JSON.stringify(audit)+'\n');
  const result=await createDb04NativeItemScopeClient({
    auditBytes,rowsBytes:original.rowsBytes,
    expectedAuditSha256:hash(auditBytes),
    expectedRowsSha256:original.expectedRowsSha256
  });
  assert.deepEqual(result.byWorldTag('IsEternityIsle').itemIds,[2]);
  assert.deepEqual(result.byUniverseTag('Mickey','direct').itemIds,[1]);
  assert.equal(result.source.privateOnly,true);
  const forged=structuredClone(audit);
  forged.byNativeCategory.Furniture.items+=1;
  const tampered=encode(JSON.stringify(forged)+'\n');
  await assert.rejects(createDb04NativeItemScopeClient({
    auditBytes:tampered,rowsBytes:original.rowsBytes,
    expectedAuditSha256:hash(tampered),
    expectedRowsSha256:original.expectedRowsSha256
  }),/ARCHIVED_CATEGORY_COUNT/);
});
