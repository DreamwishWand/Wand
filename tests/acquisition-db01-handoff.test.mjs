import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  DB02_DB01_ACQUISITION_SCHEMA,DB02_DB01_ACQUISITION_FILE,
  parseDb01ItemAcquisition,loadDb01ItemAcquisitionHandoff,
  hasDb01ItemAcquisitionHandoff
} from '../src/lib/acquisition/db01-item-acquisition.ts';
import {DB02_ACQUISITION_CATEGORY_ORDER}
  from '../src/lib/acquisition/game-native-item-categories.ts';

const data=readFileSync(new URL(
  '../static/acquisition/public/'+DB02_DB01_ACQUISITION_FILE,import.meta.url
));
const raw=JSON.parse(data.toString('utf8'));
const groups=[
  'ordinary_gameplay','premium_shop','star_path',
  'in_game_limited_event','real_time_limited_event','iap_package_reward'
];
const counts=[2667,272,64,139,14,158];

test('DB-01 receives six immutable categories with accurate, source-only coverage',()=>{
  const index=parseDb01ItemAcquisition(raw);
  assert.equal(index.schema,DB02_DB01_ACQUISITION_SCHEMA);
  assert.equal(index.gameVersion,'1.26.2');
  assert.equal(index.complete,false);
  assert.deepEqual(DB02_ACQUISITION_CATEGORY_ORDER,groups);
  assert.deepEqual(index.categoryOrder,groups);
  assert.equal(index.listItemIds().length,4875);
  assert(Object.isFrozen(index));
  assert(Object.isFrozen(index.coverage));
  assert(hasDb01ItemAcquisitionHandoff(index));
  assert(!hasDb01ItemAcquisitionHandoff({...index}));
  for(let i=0;i<groups.length;i++){
    const category=groups[i],ids=index.listItemIds(category);
    assert.equal(ids.length,counts[i],category);
    assert(Object.isFrozen(ids));
    assert.deepEqual(ids,[...ids].sort((a,b)=>Number(a)-Number(b)));
    for(const id of ids){
      const row=index.getItem(id);
      assert(row.classified);
      assert(row.categories.includes(category));
      assert(row.details[category].length>0);
      assert(Object.isFrozen(row));
      assert(Object.isFrozen(row.details));
      assert(Object.isFrozen(row.details[category]));
      assert.equal(row.currentAvailabilityVerified,false);
    }
  }
  assert.equal(index.coverage.twitchDropItemIdLinks,0);
  assert.equal(index.coverage.redeemCodeItemIdLinks,0);
  assert.equal(index.coverage.allGameItemIdsCovered,false);
  assert.equal(index.coverage.missingItemIdMeans,'unclassified_not_unobtainable');
});

test('specific Twitch Drops and code rewards remain unresolved, not invented',()=>{
  const index=parseDb01ItemAcquisition(raw);
  let realWorld=0,unresolved=0;
  for(const id of index.listItemIds()){
    const row=index.getItem(id);
    if(row.categories.includes('real_time_limited_event')){
      realWorld++;
      assert.deepEqual(row.details.real_time_limited_event,
        ['exclusive_promotion_unspecified']);
    }
    if(!row.classified){
      unresolved++;
      assert.equal(row.categories.length,0);
      assert(row.unresolvedOnlineHints.length>0);
    }
  }
  assert.equal(realWorld,14);
  assert.equal(unresolved,1628);
  const absent=index.getItem('99999999999');
  assert.equal(absent.classified,false);
  assert.deepEqual(absent.categories,[]);
  assert.deepEqual(absent.unresolvedOnlineHints,[]);
  assert(!('currentlyObtainable' in absent));
  assert(!('twitchCampaign' in absent));
  assert(!('promoCode' in absent));
});

test('DB-01 source bytes are consumed through one browser-compatible fetch',async()=>{
  let requests=0;
  const index=await loadDb01ItemAcquisitionHandoff('/Wand',async url=>{
    requests++;
    assert.equal(url,'/Wand/acquisition/public/'+DB02_DB01_ACQUISITION_FILE);
    return new Response(data,{status:200});
  });
  assert.equal(requests,1);
  assert.equal(index.coverage.distinctClassifiedItemIds,3247);
  assert.equal(index.getItem(index.listItemIds('star_path')[0]).classified,true);
});

test('schema and category tampering fail closed',()=>{
  assert.throws(()=>parseDb01ItemAcquisition({...raw,schema:'invalid'}),
    /SCHEMA/);
  assert.throws(()=>parseDb01ItemAcquisition({...raw,categoryOrder:[...groups].reverse()}),
    /SCHEMA/);
  assert.throws(()=>parseDb01ItemAcquisition({
    ...raw,coverage:{...raw.coverage,distinctClassifiedItemIds:4875}
  }),/COVERAGE/);
  const altered=[...raw.items];
  altered[0]=['000001',...altered[0].slice(1)];
  assert.throws(()=>parseDb01ItemAcquisition({...raw,items:altered}),
    /ITEM_ID/);
  const noDetail=[...raw.items];
  noDetail[0]=[noDetail[0][0],[['iap_package_reward',['twitch_drop']]],noDetail[0][2]];
  assert.throws(()=>parseDb01ItemAcquisition({...raw,items:noDetail}),
    /DETAIL/);
  assert.throws(()=>parseDb01ItemAcquisition({...raw,items:raw.items.slice(1)}),
    /COVERAGE/);
  assert.throws(()=>parseDb01ItemAcquisition({...raw,items:[...raw.items].reverse()}),
    /ROW_ORDER_OR_DUPLICATE/);
});
