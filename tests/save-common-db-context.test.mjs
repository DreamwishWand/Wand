import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchSaveItemIdsToDb00,resolveSaveItemStaticEvidence
} from '../src/lib/save/common-db-context.ts';

const snapshot={
  kind:'db_snapshot',id:'source-steam-1262',
  target:{platform:'Steam',gameVersion:'1.26.2'},
  coverage:{complete:true,semanticCategoriesVerified:false},
  items:[
    {id:'30000031',names:{ja:'ピュアナイトシャード',en:'Pure Night Shard'},
     nameStatus:'verified',category:'Source Activity Items',
     nativeCategory:'ActivityItem',contentIds:[]},
    {id:'40000001',names:{en:'Sample Exclusive Decoration'},
     nameStatus:'verified',category:'Furniture',
     nativeCategory:'Furniture',contentIds:['expansion-candidate']}
  ]
};

test('DB-05 maps saved Item IDs using existing DB-00 only, no edit permissions',()=>{
  const mapped=matchSaveItemIdsToDb00(
    ['30000031','40000001','9999999999999999'],snapshot);
  assert.equal(mapped.catalogSnapshot,'source-steam-1262');
  assert.equal(mapped.rows[0].name,'ピュアナイトシャード');
  assert.equal(mapped.rows[0].category,'Source Activity Items');
  assert.equal(mapped.rows[1].name,'Sample Exclusive Decoration');
  assert.deepEqual(mapped.rows[1].contentIds,['expansion-candidate']);
  assert.equal(mapped.rows[1].dlcOwnershipVerified,false);
  assert.equal(mapped.rows[1].editingAllowedByCatalog,false);
  assert.equal(mapped.rows[2].match,'not_in_db00_snapshot');
  assert.equal(mapped.rows[2].editingAllowedByCatalog,false);
  // Unknown IDs must not be treated as corrupt saves or editing disallow.
  assert.throws(()=>matchSaveItemIdsToDb00(['0'],snapshot),/LOOKUP_INVALID/);
});

test('partial DB-00 snapshot leaves missing IDs unresolved',()=>{
  const partial={...snapshot,coverage:{complete:false}};
  const mapped=matchSaveItemIdsToDb00(['123456789'],partial);
  assert.equal(mapped.rows[0].match,'not_in_partial_db00_snapshot');
});

test('DB-01..04 overlays reuse verified clients without claiming entitlements',async()=>{
  const calls={db02:0,db03:0,db04:0};
  const result=await resolveSaveItemStaticEvidence('40000001',{
    db01:{
      source:{gameVersion:'1.26.2'},
      async getItem(){return {nativeCategory:'Furniture',names:{ja:'家具A'}};}
    },
    db02:{
      source:{gameVersion:'1.26.2'},
      async getItem(){calls.db02++;return {staticAcquisition:{
        acquisitionPaths:[{kind:'craft'}],shopOffers:[]
      }};}
    },
    db03:{
      source:{db01GameVersion:'1.26.2',guideGameVersion:'1.26.2'},
      async getForItem(){calls.db03++;return [{questId:123,referenceKind:'objective_candidate'}];}
    },
    db04:{
      source:{db01GameVersion:'1.26.2',worldGameVersion:'1.26.2'},
      async getItem(){calls.db04++;return {
        nativeCategory:'Furniture',footprint:{sizeX:2,sizeY:3}
      };}
    }
  });
  assert.equal(result.db01NativeCategory,'Furniture');
  assert.equal(result.db01JapaneseName,'家具A');
  assert.equal(result.db02AcquisitionPathCount,1);
  assert.equal(result.db02PossibleShopCount,0);
  assert.equal(result.db03QuestReferenceCount,1);
  assert.deepEqual(result.db04Footprint,{x:2,y:3});
  assert.deepEqual(calls,{db02:1,db03:1,db04:1});
  for(const key of ['saveWritingAuthorized','questCompletionVerified',
    'placementLegalityVerified','dlcOwnershipVerified'])
    assert.equal(result[key],false);
});

test('mismatched source version is not used as DLC or edit denial',async()=>{
  let called=false;
  const evidence=await resolveSaveItemStaticEvidence('40000001',{
    db01:{source:{gameVersion:'1.26.2'},
      async getItem(){return {nativeCategory:'Furniture',names:{ja:'家具A'}};}},
    db04:{source:{db01GameVersion:'1.25.0',worldGameVersion:'1.26.2'},
      async getItem(){called=true;throw Error('must not call stale DB04');}}
  });
  assert.equal(called,false);
  assert.equal(evidence.db04Footprint,null);
  assert.equal(evidence.saveWritingAuthorized,false);
  await assert.rejects(resolveSaveItemStaticEvidence('0',{}),/ITEM_ID_INVALID/);
});
