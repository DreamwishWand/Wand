import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadVerifiedAcquisitionBundle } from '../tools/src-02-acquisition/verify_bundle.mjs';
import { createAcquisitionCatalogJoin } from '../src/lib/acquisition/db00-join.mjs';

const hash = b => createHash('sha256').update(b).digest('hex');
const srcSha = 'a'.repeat(64), itemSha = 'b'.repeat(64);
const source = { schema: 'wand.src01.steam-native@1', platform: 'Steam', gameVersion: '1.26.2',
  itemsSha256: itemSha, itemCount: 2 };
const sourceBytes = Buffer.from(JSON.stringify(source));
const original = () => ({
  'recipes.jsonl': [{ recipeId: 2050000004, type: 'cooking', resultItemId: 11, ingredients: [] }],
  'acquisitions.jsonl': [{ pathId: 'growing:10', type: 'growing', itemId: 11, seedItemId: 10 }],
  'loot-tables.jsonl': [{ lootTableId: 2090000001, groups: [{ index: 0,
    candidates: [{ itemId: 11, conditionDigest: null }] }] }],
  'shop-offers.jsonl': [],
  'stall-sources.jsonl': [{ stallId: 20100000, nameKey: 'Meadow', shopDataKey: 'Meadow',
    slotLootTableIds: [2090000001], inventoryStatus: 'static_loot_candidates_only' }],
  'condition-gates.jsonl': [],
  'condition-definitions.jsonl': [],
  'related-items.jsonl': [
    { itemId: 10, inSrc01: true, recipesProducedBy: [], recipesUsedBy: [],
      growPathsForSeed: ['growing:10'], acquisitionPaths: [] },
    { itemId: 11, inSrc01: false, recipesProducedBy: [2050000004], recipesUsedBy: [],
      growPathsForSeed: [], acquisitionPaths: ['growing:10'] }],
  'report.json': {},
  'unresolved.json': { schema: 'wand.src02.unresolved@1', notAStatementOfAbsence: true,
    missingInPartialSrc01: [11], unsupportedActivityDefinitions: [] }
});
const manifestCounts = { recipes: 1, cooking: 1, crafting: 0, acquisitions: 1, growing: 1,
  lootTables: 1, shopOffersVerified: 0, stallsWithStaticLoot: 1, stallLootSlots: 1,
  distinctStallLootTables: 1, linkedItemIds: 2, sourceItems: 2,
  unresolvedLinkedItemIds: 1, unsupportedActivityDefinitions: 0,
  conditionSourceDefinitions: 0, conditionGates: 0, conditionDefinitions: 0,
  conditionGateUsages: 0 };
async function fixture(withMembership = false) {
  const root = await mkdtemp(join(tmpdir(), 'wand-src02-'));
  const data = original();
  const counts = structuredClone(manifestCounts);
  if (withMembership) {
    data['ingredient-selector-membership.jsonl'] = [{
      itemId: 30200000, nativeClass:'CropItemData', cookingIngredientTypeId:2001400014,
      tagIds:[2001200019], source:{kind:'game_native',file:'itemlist/ActivityItem.json',
        definitionId:30200000,classEvidence:'observed_native_id_family_and_named_field_contract',
        cookingIngredientTypeField:11,tagsField:30} }];
    data['unresolved.json'].selectorsNotFoundInObservedCookingFamilies = [];
    Object.assign(counts,{ingredientSelectorMembers:1,ingredientSelectorSourceDefinitions:4050,
      ingredientSelectorIdsReferenced:0,ingredientSelectorUses:0,
      ingredientSelectorIdsWithObservedMembers:0,ingredientSelectorIdsWithoutObservedMembers:0});
  }
  data['report.json'] = {schema:'wand.src02.report@1',status:'partial_native_extraction',counts};
  const files = {};
  for (const [name, rows] of Object.entries(data)) {
    const bytes = name.endsWith('.jsonl') ?
      Buffer.from(rows.map(r=>JSON.stringify(r)+'\n').join('') || '\n') : Buffer.from(JSON.stringify(rows)+'\n');
    await writeFile(join(root, name), bytes);
    files[name] = hash(bytes);
  }
  const manifest = {schema:'wand.src02@1', status:'partial_native_extraction',
    platform:'Steam',gameVersion:'1.26.2',source:{
      src01ManifestSha256:hash(sourceBytes),src01ItemsSha256:itemSha,
      conditionSha256:srcSha},
    files,counts};
  await writeFile(join(root,'manifest.json'), JSON.stringify(manifest)+'\n');
  const sourcePath = join(root,'src01-manifest.json');
  await writeFile(sourcePath, sourceBytes);
  return {root,manifest,sourcePath};
}
function snapshot(manifest, complete = false) {
  return {schema:'wand.game-db.snapshot@1',id:'src01-test',
    target:{platform:'Steam',gameVersion:'1.26.2',buildId:null,
      sourceSha256:manifest.source.src01ManifestSha256},
    coverage:{scope:'src01-partial-native-items',complete,categories:['ActivityItem']},
    sources:[{id:'src01',sha256:srcSha,visibility:'private'}],
    publishable:false,releases:[],items:[
      {id:'10',names:{},nameStatus:'unverified',category:null,subcategory:null,
        worlds:[],universes:[],contentIds:[],releaseIds:[],relations:[],sourceRefs:['src01']}
    ]};
}

test('full private bundle digests and DB-00 exact-origin join', async () => {
  const {root,manifest,sourcePath} = await fixture();
  try {
    const bundle=await loadVerifiedAcquisitionBundle(root,{src01ManifestPath:sourcePath});
    assert.equal(bundle.verified,true);
    assert.equal(bundle.shopOffers.length,0);
    const join=createAcquisitionCatalogJoin(snapshot(manifest),bundle);
    assert.equal(join.publishable,false);
    assert.equal(join.getRecipe(2050000004).resultItemId,11);
    assert.equal(join.lookup(10).acquisition.growsInto[0].itemId,11);
    assert.equal(join.lookup(11).classification,'unresolved_in_partial_catalog');
    assert.equal(join.lookup(11).acquisitionLinksVerifiedFromNativeData,true);
    assert.equal(join.lookup(11).currentAvailabilityVerified,false);
    assert.equal(join.lookup(11).ownedOrUnlocked,'unknown');
    assert.equal(join.getPossibleStallsForItem(11)[0].status,'static_candidate_not_verified_for_sale');
    assert.equal(join.lookup(100).classification,'unresolved_in_partial_catalog');
    assert.equal(createAcquisitionCatalogJoin(snapshot(manifest,true),bundle).lookup(100).classification,'not_in_exact_catalog');
  } finally {await rm(root,{recursive:true,force:true});}
});

test('rejects tampered payload even when JSON remains parseable',async()=>{
  const {root}=await fixture();
  try {
    await writeFile(join(root,'recipes.jsonl'),'{}\n');
    await assert.rejects(loadVerifiedAcquisitionBundle(root),/DIGEST_MISMATCH_recipes/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('rejects bad SRC-01 pin and mismatched DB-00 platform/version/digest',async()=>{
  const {root,manifest,sourcePath}=await fixture();
  try {
    await writeFile(sourcePath,'{}');
    await assert.rejects(loadVerifiedAcquisitionBundle(root,{src01ManifestPath:sourcePath}),/SRC01_MANIFEST_DIGEST_MISMATCH/);
    const bundle=await loadVerifiedAcquisitionBundle(root);
    for (const changed of [{ platform:'Nintendo Switch' },{gameVersion:'1.26.1'},
      {sourceSha256:'c'.repeat(64)}]) {
      const s=snapshot(manifest);Object.assign(s.target,changed);
      assert.throws(()=>createAcquisitionCatalogJoin(s,bundle),/EXACT_SOURCE_MISMATCH/);
    }
  } finally {await rm(root,{recursive:true,force:true});}
});

test('rejects forged manifest count even when checksum is valid',async()=>{
  const {root,manifest}=await fixture();
  try {
    manifest.counts.growing=999;
    await writeFile(join(root,'manifest.json'),JSON.stringify(manifest));
    await assert.rejects(loadVerifiedAcquisitionBundle(root),/COUNT_growing|REPORT_COUNTS_MISMATCH/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('rejects a symlinked dataset before reading bytes',async()=>{
  const {root}=await fixture();
  try {
    const filename=join(root,'recipes.jsonl');
    const content=await readFile(filename);
    await rm(filename);
    await writeFile(join(root,'other.txt'),content);
    await symlink(join(root,'other.txt'),filename);
    await assert.rejects(loadVerifiedAcquisitionBundle(root),/NOT_REGULAR_FILE_OR_OVERSIZE/);
  } finally {await rm(root,{recursive:true,force:true});}
});


test('rejects forged condition-gate count even if all file digests are authentic',async()=>{
  const {root,manifest}=await fixture();
  try {
    const gate={conditionDigest:'e'.repeat(64),availabilityEvaluated:false,
      usedBy:[{kind:'recipe',recipeId:2050000004}],
      tree:{status:'static_predicate_structure_only',operator:'and',predicates:[]}};
    const bytes=Buffer.from(JSON.stringify(gate)+'\n');
    await writeFile(join(root,'condition-gates.jsonl'),bytes);
    manifest.files['condition-gates.jsonl']=hash(bytes);
    await writeFile(join(root,'manifest.json'),JSON.stringify(manifest)+'\n');
    await assert.rejects(loadVerifiedAcquisitionBundle(root),/COUNT_conditionGates/);
  } finally {await rm(root,{recursive:true,force:true});}
});


test('new native ingredient membership file is required, SHA-pinned and counts checked',async()=>{
  const {root,manifest}=await fixture(true);
  try {
    const loaded=await loadVerifiedAcquisitionBundle(root);
    assert.equal(loaded.ingredientMembership.length,1);
    assert.deepEqual(loaded.ingredientMembership[0].tagIds,[2001200019]);
    manifest.files['ingredient-selector-membership.jsonl']='a'.repeat(64);
    await writeFile(join(root,'manifest.json'),JSON.stringify(manifest)+'\n');
    await assert.rejects(loadVerifiedAcquisitionBundle(root),/DIGEST_MISMATCH_ingredient-selector-membership/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('forged source member field and forged member count fail even after digest update',async()=>{
  const {root,manifest}=await fixture(true);
  try {
    const file=join(root,'ingredient-selector-membership.jsonl');
    const tampered=JSON.parse((await readFile(file,'utf8')).trim());
    tampered.source.tagsField=11;
    const bytes=Buffer.from(JSON.stringify(tampered)+'\n');
    await writeFile(file,bytes);
    manifest.files['ingredient-selector-membership.jsonl']=hash(bytes);
    await writeFile(join(root,'manifest.json'),JSON.stringify(manifest)+'\n');
    await assert.rejects(loadVerifiedAcquisitionBundle(root),/Invalid typed ingredient selector/);
    manifest.counts.ingredientSelectorMembers=2;
    await writeFile(join(root,'manifest.json'),JSON.stringify(manifest)+'\n');
    await assert.rejects(loadVerifiedAcquisitionBundle(root),/REPORT_COUNTS_MISMATCH|COUNT_ingredientSelectorMembers/);
  } finally {await rm(root,{recursive:true,force:true});}
});