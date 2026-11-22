import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalPremiumShop} from '../src/lib/acquisition/premium-shop-history.ts';
import {matchPremiumShopHistoryToDb01} from '../src/lib/acquisition/premium-shop-candidates.ts';
import {
  createAcquisitionOriginDatabase,loadUnifiedAcquisitionOriginDatabase,starpathOriginRecords
} from '../src/lib/acquisition/origins.ts';
import {OFFICIAL_CAMPAIGNS} from '../src/lib/acquisition/official-campaigns.ts';
import {readFileSync} from 'node:fs';

test('2026 Premium Shop weekly observations preserve all prices and original bundle counts',()=>{
  const h=historicalPremiumShop;
  assert.equal(h.coverage.recordedAppearances,42);
  assert.equal(h.coverage.observedWeeks,5);
  assert.equal(h.getWeek('2026-11-18').length,10);
  assert.equal(h.getWeek('2026-11-11').length,14);
  assert.equal(h.getWeek('2026-11-04').length,5);
  assert.equal(h.getWeek('2026-10-21').length,9);
  assert.equal(h.getWeek('2026-09-16').length,4);
  assert.equal(h.getWeek('2026-11-25').length,0);
  const holiday=h.getProduct('Deluxe Winter Holiday Bundle');
  assert.equal(holiday.length,1);
  assert.equal(holiday[0].moonstonePrice,8000);
  assert.equal(holiday[0].contents.length,16);
  assert.equal(holiday[0].contents.find(c=>c.name==='Winter Holiday Bush')?.quantity,5);
  assert.equal(holiday[0].saleEndExclusive,'2026-11-25');
  assert(h.offers.every(x=>x.nativeOfferId===null&&x.gameItemId===null&&
    x.contents.every(y=>y.verifiedItemId===null)&&!x.liveStockVerified));
  assert(h.offers.every(x=>x.priceEvidence==='community_archive_only'));
});

test('Repeated Premium Shop products keep distinct appearances and even different bundle contents',()=>{
  const h=historicalPremiumShop;
  const variants=h.getProduct('Footstool Bundle');
  assert.equal(variants.length,2);
  assert.deepEqual(variants.map(x=>x.saleStart),['2026-11-11','2026-09-16']);
  assert.equal(variants[0].contents.length,2);
  assert.equal(variants[1].contents.length,3);
  assert(h.listReissuedProducts().some(x=>x.productName==='Enchanted Ice Fountain'));
  assert(h.listReissuedProducts().some(x=>x.productName==='Belle\'s Royal Tools'));
  const a=createAcquisitionOriginDatabase([],OFFICIAL_CAMPAIGNS);
  assert.equal(a.getHistoricalPremiumShopWeek('2026-11-18').length,10);
  assert.equal(a.getHistoricalPremiumShopProduct('Footstool Bundle').length,2);
  assert.equal(a.getHistoricalPremiumShopCoverage().nativeOfferIdsVerified,0);
});

test('Historical shop exact-name matching yields candidate Item IDs, never verified shop sales',async()=>{
  const known=new Map([
    ['Winter Holiday Dream Castle',50400300],
    ['Enchanted Ice Fountain',40007891],
    ['Belle\'s Royal Tools',40009654]
  ]);
  let calls=0;
  const db01={
    source:{platform:'Steam',gameVersion:'1.26.2',privateOnly:true},
    async searchExactNames(name,locale){
      assert.equal(locale,'en');
      calls++;
      if(!known.has(name))return [];
      const id=known.get(name);
      return [
        {itemId:id,value:name,locale,evidence:'current_exact_locdb_join'},
        {itemId:999,value:name+' Faux',locale,evidence:'current_exact_locdb_join'}
      ];
    }
  };
  const candidates=await matchPremiumShopHistoryToDb01(db01);
  assert.equal(candidates.coverage.uniqueExactNativeNames,3);
  assert.equal(candidates.coverage.nativePurchaseLinksVerified,0);
  assert.equal(candidates.getItemCandidates(50400300).length,2);
  assert.equal(candidates.getItemCandidates(40007891).length,2);
  assert(candidates.getItemCandidates(50400300).every(c=>c.acquisitionLinkVerified===false));
  assert.equal(candidates.getProductCandidates('Deluxe Winter Holiday Bundle')
    .some(c=>c.componentName==='Winter Holiday Dream Castle'),true);
  assert.equal(candidates.getItemCandidates(999).length,0);
  assert.equal(calls,candidates.coverage.searchedDistinctComponentNames);
});

test('DB-03 structure-only projection cannot forge hash-verified acquisition origins',()=>{
  const raw=JSON.parse(readFileSync(new URL(
    '../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url),'utf8'));
  const {origins}=starpathOriginRecords(raw);
  assert.equal(origins.length,67);
  assert(origins.every(x=>x.routeStatus==='static_candidate_only'));
  assert(origins.every(x=>x.source.kind==='unhashed_structural_candidate'));
  assert(origins.every(x=>x.source.sha256===null));
});

test('DB-03 pinned SHA loader projects verified acquisition origins while retaining official history',async()=>{
  const bytes=readFileSync(new URL(
    '../static/guide/public/starpath-cache-2026-11-22.json',import.meta.url));
  const arrayBuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const fetcher=async url=>{
    assert.equal(url,'/Wand/guide/public/starpath-cache-2026-11-22.json');
    return {ok:true,arrayBuffer:async()=>arrayBuffer};
  };
  const db=await loadUnifiedAcquisitionOriginDatabase(fetcher,null,'/Wand');
  assert.equal(db.getCoverage().linkedRoutes,67);
  assert.equal(db.getCoverage().campaigns,OFFICIAL_CAMPAIGNS.length+2);
  assert(db.getItem(170000115).origins.some(x=>x.routeStatus==='confirmed_source_link'&&
    x.source.kind==='verified_liveops_cache'));
  const free=db.getItem(80100000).origins;
  assert(free.length>1);
  assert(free.some(x=>x.conditions.some(c=>c.includes('Recurrent reward'))));
  assert.deepEqual(db.getCampaign('code:DDVPRIDE2026')?.rewards.map(r=>r.name),
    ['Round Rainbow Garden','Butterfly Tiara']);
  assert.equal(db.getHistoricalPremiumShopCoverage().historicalCoverageComplete,false);
});
