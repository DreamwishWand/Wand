import test from 'node:test';
import assert from 'node:assert/strict';
import { attachDb01PrivateNames } from '../src/lib/collection/private-db01-names-view.mjs';
import { DB01_PRIVATE_RELEASE } from '../src/lib/collection/private-db01-release.mjs';

const preview=()=>({privateOnly:true,publishable:false,items:[
 {itemId:401,historicalLabel:'Old name',referenceCount:2},
 {itemId:402,historicalLabel:'Other old name',referenceCount:1}
]});
const source=()=>({
 kind:'db01-private-exact-names',target:{platform:'Steam',gameVersion:'1.26.2'},
 sourceManifestSha256:DB01_PRIVATE_RELEASE.manifestSha256,
 sourceCoverageComplete:false,saveVersionParityVerified:false,
 historicalCandidatesImported:true,
 historicalCandidateEvidence:'historical_prefix_crc_correlated_unverified_current',
 historicalBaselineVersion:'1.26.1',historicalCandidatesAreCurrentVerified:false,publicationAuthorized:false,
 items:[{itemId:401,nativeCategory:'Furniture',exactNames:{ja:'現在の名称',en:'Current name'},historicalNames:{fr:'Ancien nom'}},
        {itemId:402,nativeCategory:'Clothing',exactNames:{en:'Verified fallback'},historicalNames:{fr:'Ancien vêtement'}}]
});

test('current exact source takes precedence over historical label, without asserting save parity',()=>{
 const output=attachDb01PrivateNames(preview(),source(),'ja');
 assert.equal(output.items[0].currentExactName,'現在の名称');
 assert.equal(output.items[0].currentExactNameLocale,'ja');
 assert.equal(output.items[1].currentExactName,'Verified fallback');
 assert.equal(output.items[1].currentExactNameLocale,'en');
 assert.equal(output.exactSourceNameCount,2);
 assert.equal(output.items[0].saveVersionParityVerified,false);
 assert.equal(output.savedShopOwnershipVerified,false);
 assert.equal(output.publicationAuthorized,false);
 assert.equal(output.items[0].historicalLabel,'Old name');
});
test('locale changes use only independently verified official locale names',()=>{
 const out=attachDb01PrivateNames(preview(),source(),'de');
 assert.equal(out.items[0].currentExactName,'Current name');
 assert.equal(out.items[0].currentExactNameLocale,'en');
 assert.throws(()=>attachDb01PrivateNames(preview(),source(),'ru'),/UNSUPPORTED_LOCALE/);
});
test('tampered source pin, cross-version, historical inclusion and forged release status are rejected',()=>{
 for(const patch of [
 {sourceManifestSha256:'0'.repeat(64)},
 {target:{platform:'Steam',gameVersion:'1.26.1'}},
 {historicalCandidatesAreCurrentVerified:true},{historicalBaselineVersion:'1.26.2'},
 {publicationAuthorized:true},{saveVersionParityVerified:true},
 ])assert.throws(()=>attachDb01PrivateNames(preview(),{...source(),...patch}),/UNVERIFIED_RELEASE/);
});
test('cross-ID substitution, malformed names and unclassified spoof are rejected',()=>{
 const src=source();
 assert.throws(()=>attachDb01PrivateNames(preview(),{...src,items:[{...src.items[0],itemId:999},src.items[1]]}),/UNVERIFIED_ITEM/);
 assert.throws(()=>attachDb01PrivateNames(preview(),{...src,items:[{...src.items[0],exactNames:{ja:'  '}},src.items[1]]}),/UNVERIFIED_NAME/);
 assert.throws(()=>attachDb01PrivateNames(preview(),{...src,items:[{...src.items[0],nativeCategory:'Dialogue'},src.items[1]]}),/UNVERIFIED_ITEM/);
});
test('output drops arbitrary worker fields and is immutable',()=>{
 const src=source();src.items[0].personalSaveValue='secret value';src.personalSavePayload='SECRET';
 const out=attachDb01PrivateNames(preview(),src,'ja');
 assert.ok(!JSON.stringify(out).includes('secret value'));
 assert.ok(!JSON.stringify(out).includes('SECRET'));
 assert.ok(Object.isFrozen(out.items));
 assert.ok(Object.isFrozen(out.items[0]));
 assert.throws(()=>{out.items[0].currentExactName='fake';},TypeError);
});
test('no exact name remains unavailable instead of copying historical candidate as current',()=>{
 const src=source();src.items[1].exactNames={};
 const out=attachDb01PrivateNames(preview(),src,'ja');
 assert.equal(out.items[1].currentExactName,null);
 assert.equal(out.items[1].historicalLabel,'Other old name');
 assert.equal(out.exactSourceNameCount,1);
});

test('historical v1.26.1 candidate is strictly opt-in and never labeled current exact',()=>{
 const fixture=source();
 const off=attachDb01PrivateNames(preview(),fixture,'fr');
 const on=attachDb01PrivateNames(preview(),fixture,'fr',{allowHistorical:true});
 assert.equal(off.items[0].privateHistoricalCandidate,null);
 // Current English exact has precedence even over French previous-version candidate.
 assert.equal(on.items[0].currentExactName,'Current name');
 assert.equal(on.items[0].privateHistoricalCandidate,null);
 assert.equal(on.items[0].saveVersionParityVerified,false);
 const missing=structuredClone(fixture);
 missing.items[1].exactNames={};
 const newer=attachDb01PrivateNames(preview(),missing,'fr',{allowHistorical:true});
 assert.equal(newer.items[1].currentExactName,null);
 assert.equal(newer.items[1].privateHistoricalCandidate,'Ancien vêtement');
 assert.equal(newer.items[1].privateHistoricalCandidateUnverifiedCurrent,true);
 assert.equal(newer.items[1].privateHistoricalCandidateLocale,'fr');
 assert.equal(newer.historicalCandidateCount,1);
 assert.equal(newer.privateHistoryOptIn,true);
});