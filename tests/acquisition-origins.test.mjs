import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  ORIGIN_SCHEMA, createAcquisitionOriginDatabase, starpathOriginRecords
} from '../src/lib/acquisition/origins.ts';
import {OFFICIAL_CAMPAIGNS} from '../src/lib/acquisition/official-campaigns.ts';

const snapshot = JSON.parse(readFileSync(new URL(
  '../static/guide/public/starpath-cache-2026-11-22.json', import.meta.url
), 'utf8'));

test('DB-03 original Star Path reward pages, bonuses and vaults project without parser duplication', () => {
  const {origins, campaigns} = starpathOriginRecords(snapshot);
  assert.equal(campaigns.length, 2);
  assert.equal(origins.length, 67);
  assert.equal(origins.filter(r => r.kind === 'star_path_premium').length > 0, true);
  assert.equal(origins.filter(r => r.kind === 'star_path_vault').length, 13);
  assert.equal(origins.filter(r => r.kind === 'star_path_free').length > 0, true);
  assert(origins.every(r => r.source.kind === 'unhashed_structural_candidate'));
  assert(origins.every(r => r.routeStatus === 'static_candidate_only'));
  assert(origins.every(r => r.availability === 'not_live_verified'));
  assert(origins.every(r => r.campaignId !== null));
  assert(origins.some(r => r.price !== null));
  assert(origins.some(r => r.price === null));
  assert(!origins.some(r => r.kind === 'premium_shop'));
  const db = createAcquisitionOriginDatabase(origins, campaigns);
  assert.equal(db.schema, ORIGIN_SCHEMA);
  assert.equal(db.getItem('170000115').origins.some(r => r.accessTier === 'premium'), true);
  assert(db.getItem(80100000).origins.length > 1);
  assert.equal(db.getItem(1).originCoverageComplete, false);
  assert.deepEqual(db.getItem(1).origins, []);
});

test('Official announcements preserve code, named rewards and absent Item IDs', () => {
  const pride = OFFICIAL_CAMPAIGNS.find(c => c.code === 'DDVPRIDE2026');
  assert(pride);
  assert.deepEqual(pride.rewards.map(r => r.name), ['Round Rainbow Garden', 'Butterfly Tiara']);
  assert(pride.rewards.every(r => r.itemId === null));
  const sea = OFFICIAL_CAMPAIGNS.find(c => c.campaignId === 'twitch:2026-keepsake-sea');
  assert(sea);
  assert.deepEqual(sea.rewards.map(r => r.cumulativeWatchMinutes), [60,90,120]);
  assert(sea.rewards.every(r => r.itemId === null));
  const db = createAcquisitionOriginDatabase([], OFFICIAL_CAMPAIGNS);
  assert.equal(db.getCoverage().rewardNamesAwaitingItemId, 70);
  assert.equal(db.getCoverage().linkedItemIds, 0);
  assert.equal(db.getCampaign('code:DDVPRIDE2026')?.code, 'DDVPRIDE2026');
  assert.equal(db.getItem(40000000).origins.length, 0);
});

test('One ID can have several independent sources and historical sale observations', () => {
  const {origins, campaigns} = starpathOriginRecords(snapshot);
  const original = origins[0];
  const offer = {
    ...original, originId:'sale:shop:offer1:2026-11-22',
    kind:'premium_shop',campaignId:'shop:offer1',
    name:'Synthetic Shop Offer',
    price:{quantity:1000,currency:'Moonstones',currencyItemId:'80100000'},
    salePeriods:[{start:'2026-11-18',endExclusive:'2026-11-25'}],
    source:{sourceId:'fixture:sale:01',kind:'verified_sale_snapshot',
      sourceUrl:'https://example.org/fixture',checkedOn:'2026-11-22',
      gameVersion:'1.26.2',sha256:'a'.repeat(64)}
  };
  const campaign = {...campaigns[0],campaignId:'shop:offer1',kind:'premium_shop',
    name:'Synthetic Shop Offer',rewards:[]};
  const db = createAcquisitionOriginDatabase([...origins, offer], [...campaigns, campaign]);
  const refs = db.getItem(original.itemId).origins;
  assert(refs.some(r => r.kind === original.kind));
  assert(refs.some(r => r.kind === 'premium_shop'));
  assert.equal(db.getOrigin(offer.originId).length, 1);
  assert.equal(db.getCoverage().routesBySourceKind.verified_sale_snapshot, 1);
  assert.equal(refs.find(r => r.kind === 'premium_shop')?.salePeriods.length, 1);
});

test('Fail closed: unknown campaigns, item-identity duplicates and invalid source', () => {
  const {origins, campaigns} = starpathOriginRecords(snapshot);
  const first = origins[0];
  assert.throws(() => createAcquisitionOriginDatabase([first, first], campaigns),
    /DB02_ORIGINS_DUPLICATE_LINK/);
  assert.throws(() => createAcquisitionOriginDatabase([
    {...first,campaignId:'missing:season'}
  ], campaigns), /DB02_ORIGINS_UNKNOWN_CAMPAIGN/);
  assert.throws(() => createAcquisitionOriginDatabase([
    {...first,itemId:'0001'}
  ], campaigns), /DB02_ORIGINS_ITEM_ID/);
  assert.throws(() => createAcquisitionOriginDatabase([
    {...first,source:{...first.source,sha256:'a'.repeat(64)}}
  ], campaigns), /DB02_ORIGINS_UNHASHED_SOURCE_CANNOT_ASSERT_HASH/);
  assert.throws(() => createAcquisitionOriginDatabase([
    {...first,kind:'premium_shop'}
  ], campaigns), /DB02_ORIGINS_CAMPAIGN_KIND/);
});

test('Native DB-02 data can be reused without claiming its static stalls are live sales', () => {
  const {origins, campaigns} = starpathOriginRecords(snapshot);
  const native = {getItem(id) {
    return {itemId:id,possibleStalls:[{status:'static_candidate_not_verified_for_sale'}]};
  }};
  const db = createAcquisitionOriginDatabase(origins,campaigns,native);
  const item = db.getItem(170000115);
  assert.equal(item.nativeAcquisition.itemId,170000115);
  assert.equal(item.nativeAcquisition.possibleStalls[0].status,
    'static_candidate_not_verified_for_sale');
  assert.equal(db.getCoverage().originCoverageComplete, false);
});
