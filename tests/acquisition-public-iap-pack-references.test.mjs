import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  loadPinnedPublicIapSource
} from '../src/lib/acquisition/public-static-iap.ts';
import {
  loadPinnedIapPackReferences,hasPinnedIapPackReferenceEvidence,
  DB02_IAP_PACK_LINKS_FILE,DB02_IAP_PACK_LINKS_BYTES,DB02_IAP_PACK_LINKS_SHA
} from '../src/lib/acquisition/public-iap-pack-references.ts';

const links=readFileSync(new URL(
  '../static/acquisition/public/'+DB02_IAP_PACK_LINKS_FILE,import.meta.url));
const packages=readFileSync(new URL(
  '../static/acquisition/public/iap-rewards-1.26.2.json',import.meta.url));
const fetcher=async url=>{
  assert(url.startsWith('/Wand/acquisition/public/'),url);
  return new Response(url.endsWith('/'+DB02_IAP_PACK_LINKS_FILE)?links:
    url.endsWith('/iap-rewards-1.26.2.json')?packages:'missing',
    {status:200});
};
const load=async()=>{
  const source=await loadPinnedPublicIapSource('/Wand',fetcher);
  const index=await loadPinnedIapPackReferences(source,'/Wand',fetcher);
  return {source,index};
};

test('native IAP reference projection is source-pinned and contains six exact edges',async()=>{
  assert.equal(links.length,DB02_IAP_PACK_LINKS_BYTES);
  assert.equal(createHash('sha256').update(links).digest('hex'),DB02_IAP_PACK_LINKS_SHA);
  const doc=JSON.parse(links.toString('utf8'));
  assert.deepEqual(doc.coverage,{
    appleAppStoreOnlyAdditionalReferences:3,danglingPackReferences:0,
    nativeAdditionalReferences:3,nativeIapPackages:53,nativeNestedReferences:3,
    onlineRewardGrantsVerified:0,recordEnvelopes:2246,totalPackReferences:6
  });
  assert.equal(doc.source.originalProtoDbSha256,
    'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623');
  assert.equal(doc.source.additionalIapPacksField,19);
  assert.equal(doc.source.nestedRewardsField,11);
  assert.equal(doc.source.marketplaceEnum9,'AppleAppStore');
  assert.equal(doc.source.accountEntitlementVerified,false);
  assert.equal(doc.source.additionalPackGrantVerified,false);
  assert.equal(doc.source.nestedRewardGrantVerified,false);
  assert.deepEqual(doc.relations,[
    ['Expansion2PackMagicalEdition','additional_pack','Expansion2PackExpansionPass',[9],[]],
    ['Expansion3PackDeluxeEdition','additional_pack','Expansion3PackExpansionPass',[9],[]],
    ['Expansion4PackDeluxeEdition','additional_pack','Expansion4PackExpansionPass',[9],[]],
    ['FoundersPackDeluxe','nested_rewards','FoundersPackBaseGame',[],[]],
    ['FoundersPackUltimate','nested_rewards','FoundersPackDeluxe',[],[]],
    ['NintendoPOSAJP','nested_rewards','FoundersPackBaseGame',[],[]]
  ]);
  const {source,index}=await load();
  assert(hasPinnedIapPackReferenceEvidence(index));
  assert(!hasPinnedIapPackReferenceEvidence({...index}));
  assert.equal(index.references.length,6);
  assert.equal(index.coverage.nativeIapPackages,53);
  assert.equal(index.coverage.nativeNestedReferences,3);
  assert.equal(index.coverage.nativeAdditionalReferences,3);
  assert.equal(index.coverage.appleAppStoreOnlyAdditionalReferences,3);
  assert.equal(index.coverage.onlineRewardGrantsVerified,0);
  assert.equal(index.coverage.nestedRewardExpansionVerified,false);
  assert.equal(index.coverage.accountEntitlementVerified,false);
  assert.equal(index.coverage.storefrontAvailabilityVerified,false);
  assert.equal(source.origins.length,291); // no new granted Item origins
  assert.equal(source.getPackageOrigins('FoundersPackUltimate').length,26);
  assert(Object.isFrozen(index));
  assert(Object.isFrozen(index.references));
  for(const edge of index.references){
    assert(Object.isFrozen(edge));
    assert(Object.isFrozen(edge.supportedMarketplaces));
    assert(Object.isFrozen(edge.unsupportedMarketplaces));
    assert.equal(edge.accountEntitlementVerified,false);
    assert.equal(edge.currentStorefrontAvailabilityVerified,false);
    assert.equal(edge.grantsAdditionalPackageVerified,false);
    assert.equal(edge.grantsNestedRewardsVerified,false);
    assert.equal(edge.source.kind,'verified_game_native');
    assert.equal(edge.source.gameVersion,'1.26.2');
    assert.equal(edge.source.sha256,doc.source.originalProtoDbSha256);
    assert(source.getPackage(edge.fromPackageId));
    assert(source.getPackage(edge.toPackageId));
    assert(index.getFromPackage(edge.fromPackageId).includes(edge));
    assert(index.getToPackage(edge.toPackageId).includes(edge));
  }
});
test('AppleAppStore-only additional pack refs never imply a Steam DLC entitlement',async()=>{
  const {index}=await load();
  for(const [from,to] of [
    ['Expansion2PackMagicalEdition','Expansion2PackExpansionPass'],
    ['Expansion3PackDeluxeEdition','Expansion3PackExpansionPass'],
    ['Expansion4PackDeluxeEdition','Expansion4PackExpansionPass']
  ]){
    const refs=index.getFromPackage(from);
    assert.equal(refs.length,1);
    assert.equal(refs[0].kind,'additional_pack');
    assert.equal(refs[0].toPackageId,to);
    assert.equal(refs[0].originalFieldPath,
      'IAPData.AdditionalIAPPacks[19].IapPack[1]');
    assert.equal(refs[0].declaredAppleAppStoreOnly,true);
    assert.deepEqual(refs[0].supportedMarketplaces,[9]);
    assert.deepEqual(refs[0].unsupportedMarketplaces,[]);
    assert.deepEqual(index.getAdditionalForMarketplace(from,5),[]); // Steam
    assert.deepEqual(index.getAdditionalForMarketplace(from,9),refs); // AppleAppStore
    assert.deepEqual(index.getAdditionalForMarketplace(from,Number.NaN),[]);
    assert.deepEqual(index.getAdditionalForMarketplace(from,-1),[]);
  }
  assert.equal(index.getFromPackage('unknown').length,0);
  assert.equal(index.getToPackage('unknown').length,0);
});
test('exact NestedRewards chain is structural only and never expands 291 direct Item origins',async()=>{
  const {source,index}=await load();
  assert.deepEqual(index.getNestedRewardPath('FoundersPackUltimate'),[
    'FoundersPackUltimate','FoundersPackDeluxe','FoundersPackBaseGame'
  ]);
  assert.deepEqual(index.getNestedRewardPath('FoundersPackDeluxe'),[
    'FoundersPackDeluxe','FoundersPackBaseGame'
  ]);
  assert.deepEqual(index.getNestedRewardPath('NintendoPOSAJP'),[
    'NintendoPOSAJP','FoundersPackBaseGame'
  ]);
  assert.deepEqual(index.getNestedRewardPath('Expansion4PackDeluxeEdition'),[
    'Expansion4PackDeluxeEdition'
  ]); // AdditionalIAPPacks is NOT NestedRewards
  assert.equal(index.getNestedRewardPath('not-a-package'),null);
  assert(Object.isFrozen(index.getNestedRewardPath('FoundersPackUltimate')));
  const refs=index.getToPackage('FoundersPackBaseGame');
  assert.equal(refs.length,2);
  assert(refs.every(r=>r.originalFieldPath==='IAPData.NestedRewards[11]'));
  assert(source.getPackageOrigins('FoundersPackUltimate').every(r=>
    r.productId==='FoundersPackUltimate'));
  assert.equal(source.getItemOrigins('40000153').some(r=>
    r.productId==='FoundersPackUltimate'),false);
});
test('both SHA-pinned sources are required; corrupted JSON, forged source, invalid base fail closed',async()=>{
  const {source}=await load();
  const broken=Buffer.from(links);
  broken[200]^=1;
  await assert.rejects(loadPinnedIapPackReferences(source,'/Wand',
    async()=>new Response(broken,{status:200})),/PUBLIC_SHA/);
  await assert.rejects(loadPinnedIapPackReferences(source,'/Wand',
    async()=>new Response(links.subarray(1),{status:200})),/PUBLIC_SIZE/);
  await assert.rejects(loadPinnedIapPackReferences({...source},'/Wand',fetcher),
    /AUTHENTICATED_NATIVE_IAP_REQUIRED/);
  let fetched=false;
  await assert.rejects(loadPinnedIapPackReferences(source,'/Wand/../bad',
    async()=>{fetched=true;return new Response(links);}),/INVALID_BASE_PATH/);
  assert.equal(fetched,false);
});
