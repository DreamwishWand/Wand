/** DB-02 shared acquisition origin ledger. No new production JavaScript or save writes. */
import {
  loadPublicStarpath, verifyPublicStarpath, STARPATH_PUBLIC_SHA
} from '../guide/public-starpath.mjs';
import {OFFICIAL_CAMPAIGNS} from './official-campaigns.ts';
import {projectVerifiedSrc02Origins, type VerifiedSrc02OriginReader} from './native-origins.ts';

export const ORIGIN_SCHEMA = 'wand.db02.item-origins@1' as const;

export type OriginKind =
  | 'crafting' | 'cooking' | 'fishing' | 'mining' | 'foraging'
  | 'farming' | 'loot' | 'game_shop' | 'quest_reward' | 'event_reward'
  | 'star_path_free' | 'star_path_premium' | 'star_path_vault'
  | 'twitch_drop' | 'redeem_code' | 'premium_shop'
  | 'official_campaign' | 'purchase_bonus' | 'gift' | 'other';

export type SourceKind = 'verified_liveops_cache' | 'verified_game_native'
  | 'official_publication' | 'verified_sale_snapshot';
export type RouteStatus = 'confirmed_source_link' | 'static_candidate_only';
export type AccessTier = 'free' | 'premium' | 'not_applicable';

export interface OriginProvenance {
  readonly sourceId: string;
  readonly kind: SourceKind;
  readonly sourceUrl: string;
  readonly checkedOn: string;
  readonly gameVersion: string | null;
  /** Hash of the actual admitted source bytes; null for un-hashed official webpages. */
  readonly sha256: string | null;
}
export interface OriginWindow {
  readonly start: string | null;
  readonly endExclusive: string | null;
}
export interface OriginPrice {
  readonly quantity: number;
  readonly currency: string;
  readonly currencyItemId: string | null;
}
export interface ItemOrigin {
  readonly originId: string;
  readonly itemId: string;
  readonly kind: OriginKind;
  readonly routeStatus: RouteStatus;
  readonly campaignId: string | null;
  readonly name: string;
  readonly productId: string | null;
  readonly quantity: number | null;
  readonly price: OriginPrice | null;
  readonly accessTier: AccessTier;
  readonly window: OriginWindow;
  /** One period per observed sale, keeping separate reissues instead of overwriting. */
  readonly salePeriods: readonly OriginWindow[];
  readonly conditions: readonly string[];
  readonly source: OriginProvenance;
  /** Never inferred from static windows or an old announcement. */
  readonly availability: 'not_live_verified';
}

/** Official campaign records can be complete even when Item ID mapping is absent. */
export interface CampaignReward {
  readonly name: string;
  readonly itemId: string | null;
  readonly quantity: number | null;
  readonly cumulativeWatchMinutes: number | null;
}
export interface OfficialCampaign {
  readonly campaignId: string;
  readonly kind: 'twitch_drop' | 'redeem_code' | 'premium_shop' |
    'official_campaign' | 'purchase_bonus' | 'gift' | 'event_reward';
  readonly name: string;
  readonly code: string | null;
  readonly productId: string | null;
  readonly window: OriginWindow;
  readonly conditions: readonly string[];
  readonly rewards: readonly CampaignReward[];
  readonly source: OriginProvenance;
  readonly availability: 'not_live_verified';
}

export interface NativeAcquisitionReader {
  getItem(itemId: number): unknown;
}
export interface OriginDatabase {
  readonly schema: typeof ORIGIN_SCHEMA;
  readonly originCoverageComplete: false;
  getItem(itemId: number | string): {
    readonly itemId: string;
    readonly origins: readonly ItemOrigin[];
    readonly nativeAcquisition: unknown;
    readonly originCoverageComplete: false;
  };
  getCampaign(campaignId: string): OfficialCampaign | null;
  listCampaigns(): readonly OfficialCampaign[];
  getOrigin(originId: string): readonly ItemOrigin[];
  getCoverage(): {
    readonly linkedItemIds: number;
    readonly linkedRoutes: number;
    readonly campaigns: number;
    readonly rewardNamesAwaitingItemId: number;
    readonly routesBySourceKind: Readonly<Record<SourceKind, number>>;
    readonly originCoverageComplete: false;
  };
}

const ID = /^[1-9][0-9]{0,15}$/;
const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9:._\/-]{0,127}$/;
const SHA = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d\d-\d\d$/;
const VALID_KINDS: ReadonlySet<string> = new Set<OriginKind>([
  'crafting','cooking','fishing','mining','foraging','farming','loot',
  'game_shop','quest_reward','event_reward','star_path_free',
  'star_path_premium','star_path_vault','twitch_drop','redeem_code',
  'premium_shop','official_campaign','purchase_bonus','gift','other'
]);
const ONLINE = new Set<OriginKind>([
  'star_path_free','star_path_premium','star_path_vault','twitch_drop',
  'redeem_code','premium_shop','official_campaign','purchase_bonus','gift'
]);
function assert(ok: unknown, why: string): asserts ok {
  if (!ok) throw new TypeError('DB02_ORIGINS_' + why);
}
function id(value: unknown): string {
  const key = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  assert(typeof key === 'string' && ID.test(key) && Number.isSafeInteger(Number(key)), 'ITEM_ID');
  return key;
}
function period(value: OriginWindow): void {
  assert(value !== null && typeof value === 'object', 'PERIOD');
  for (const date of [value.start, value.endExclusive]) {
    assert(date === null || (typeof date === 'string' &&
      (DATE.test(date) || (!Number.isNaN(Date.parse(date)) && /Z$/.test(date)))), 'DATE');
  }
  if (value.start && value.endExclusive)
    assert(value.start < value.endExclusive, 'PERIOD_ORDER');
}
function provenance(source: OriginProvenance): void {
  assert(source && SAFE_KEY.test(source.sourceId) &&
    ['verified_liveops_cache','verified_game_native','official_publication','verified_sale_snapshot']
      .includes(source.kind) &&
    typeof source.sourceUrl === 'string' && source.sourceUrl.length > 0 &&
    (source.sourceUrl.startsWith('https://') || source.sourceUrl.startsWith('/')) &&
    DATE.test(source.checkedOn) &&
    (source.gameVersion === null || /^\d+\.\d+\.\d+$/.test(source.gameVersion)) &&
    (source.sha256 === null || SHA.test(source.sha256)), 'PROVENANCE');
  if (source.kind === 'official_publication')
    assert(source.sourceUrl.startsWith('https://'), 'OFFICIAL_URL');
  else assert(source.sha256 !== null, 'SOURCE_HASH');
}
function validateCampaign(c: OfficialCampaign): void {
  assert(c && SAFE_KEY.test(c.campaignId) &&
    ['twitch_drop','redeem_code','premium_shop','official_campaign',
      'purchase_bonus','gift','event_reward'].includes(c.kind) &&
    !!c.name && Array.isArray(c.rewards) && Array.isArray(c.conditions) &&
    c.availability === 'not_live_verified' &&
    (c.code === null || /^[A-Za-z0-9_-]{3,80}$/.test(c.code)) &&
    (c.productId === null || SAFE_KEY.test(c.productId)), 'CAMPAIGN');
  period(c.window);
  provenance(c.source);
  for (const reward of c.rewards) {
    assert(reward && typeof reward.name === 'string' && !!reward.name &&
      (reward.itemId === null || id(reward.itemId) === reward.itemId) &&
      (reward.quantity === null || (Number.isSafeInteger(reward.quantity) && reward.quantity > 0)) &&
      (reward.cumulativeWatchMinutes === null ||
        (Number.isSafeInteger(reward.cumulativeWatchMinutes) &&
        reward.cumulativeWatchMinutes > 0)), 'CAMPAIGN_REWARD');
  }
}
function validateOrigin(o: ItemOrigin): void {
  assert(o && SAFE_KEY.test(o.originId) && id(o.itemId) === o.itemId &&
    VALID_KINDS.has(o.kind) && !!o.name && 
    ['confirmed_source_link','static_candidate_only'].includes(o.routeStatus) &&
    ['free','premium','not_applicable'].includes(o.accessTier) &&
    (o.campaignId === null || SAFE_KEY.test(o.campaignId)) &&
    (o.productId === null || SAFE_KEY.test(o.productId)) &&
    (o.quantity === null || (Number.isSafeInteger(o.quantity) && o.quantity > 0)) &&
    o.availability === 'not_live_verified' &&
    Array.isArray(o.salePeriods) && Array.isArray(o.conditions), 'ORIGIN');
  if (ONLINE.has(o.kind)) assert(o.campaignId !== null, 'ONLINE_CAMPAIGN_REQUIRED');
  if (o.price !== null) {
    assert(Number.isSafeInteger(o.price.quantity) && o.price.quantity >= 0 &&
      !!o.price.currency && (o.price.currencyItemId === null ||
      id(o.price.currencyItemId) === o.price.currencyItemId), 'PRICE');
  }
  period(o.window);
  for (const p of o.salePeriods) period(p);
  provenance(o.source);
  // The official web articles cited in this release list names, not native Item IDs.
  if (o.routeStatus === 'confirmed_source_link')
    assert(o.source.kind !== 'official_publication', 'OFFICIAL_NAME_NOT_ITEM_ID_EVIDENCE');
}

function frozen<T>(v: T): Readonly<T> { return Object.freeze(v); }

/** Every route is independently addressable, including multiple sales of the same item. */
export function createAcquisitionOriginDatabase(
  origins: readonly ItemOrigin[],
  campaigns: readonly OfficialCampaign[] = [],
  native: NativeAcquisitionReader | null = null
): OriginDatabase {
  const byCampaign = new Map<string, OfficialCampaign>();
  for (const c of campaigns) {
    validateCampaign(c);
    assert(!byCampaign.has(c.campaignId), 'DUPLICATE_CAMPAIGN');
    byCampaign.set(c.campaignId, c);
  }
  const byItem = new Map<string, ItemOrigin[]>();
  const byRoute = new Map<string, ItemOrigin[]>();
  const unique = new Set<string>();
  const sources: Record<SourceKind, number> = {
    verified_liveops_cache: 0, verified_game_native: 0,
    official_publication: 0, verified_sale_snapshot: 0
  };
  for (const o of origins) {
    validateOrigin(o);
    if (o.campaignId !== null) {
      const campaign = byCampaign.get(o.campaignId);
      assert(campaign !== undefined, 'UNKNOWN_CAMPAIGN');
      if (o.kind === 'twitch_drop' || o.kind === 'redeem_code' ||
          o.kind === 'premium_shop' || o.kind === 'purchase_bonus') {
        assert(campaign.kind === o.kind, 'CAMPAIGN_KIND');
      }
    }
    const key = o.originId + '\u0000' + o.itemId;
    assert(!unique.has(key), 'DUPLICATE_LINK');
    unique.add(key);
    (byItem.get(o.itemId) ?? (byItem.set(o.itemId, []), byItem.get(o.itemId)!)).push(o);
    (byRoute.get(o.originId) ?? (byRoute.set(o.originId, []), byRoute.get(o.originId)!)).push(o);
    sources[o.source.kind]++;
  }
  for (const links of [...byItem.values(), ...byRoute.values()]) Object.freeze(links);
  const campaignList = Object.freeze([...campaigns]);
  const coverage = frozen({
    linkedItemIds: byItem.size,
    linkedRoutes: origins.length,
    campaigns: campaigns.length,
    rewardNamesAwaitingItemId: campaigns.reduce(
      (n, c) => n + c.rewards.filter(r => r.itemId === null).length, 0),
    routesBySourceKind: frozen(sources),
    originCoverageComplete: false as const
  });
  return frozen({
    schema: ORIGIN_SCHEMA,
    originCoverageComplete: false as const,
    getItem(itemId: number | string) {
      const key = id(itemId);
      return frozen({
        itemId: key,
        origins: byItem.get(key) ?? Object.freeze([] as ItemOrigin[]),
        nativeAcquisition: native?.getItem(Number(key)) ?? null,
        originCoverageComplete: false as const
      });
    },
    getOrigin(originId: string) { return byRoute.get(originId) ?? []; },
    getCampaign(campaignId: string) { return byCampaign.get(campaignId) ?? null; },
    listCampaigns() { return campaignList; },
    getCoverage() { return coverage; }
  });
}

interface StarReward {
  itemId: string;
  amount: number;
  premium: boolean;
  bonus: boolean;
  recurrent: boolean;
  price?: number;
  alternateItemId?: string;
}
interface StarPage { page: number; rewards: StarReward[]; }
interface StarSeason {
  id: string; title: string; currencyName: string;
  startUtc: string; finishUtcExclusive: string; endUtcExclusive: string;
  rewardPages: StarPage[]; bonusPages: StarPage[]; vaultRewards: StarReward[];
}
interface StarSnapshot {
  source: { ownerDeclaredGameVersion: string };
  seasons: StarSeason[];
}

const STARPATH_SOURCE: OriginProvenance = Object.freeze({
  sourceId: 'db03:starpath:2026-11-22',
  kind: 'verified_liveops_cache',
  sourceUrl: '/guide/public/starpath-cache-2026-11-22.json',
  checkedOn: '2026-11-22',
  gameVersion: '1.26.2',
  sha256: STARPATH_PUBLIC_SHA
});

/**
 * Consumes DB-03's verified cached snapshot. Do not copy or fork its parser.
 * Call loadStarpathAcquisitionDatabase for the source-hash-verified production path.
 */
export function starpathOriginRecords(verifiedDb03Snapshot: unknown): {
  origins: ItemOrigin[];
  campaigns: OfficialCampaign[];
} {
  const snapshot = verifyPublicStarpath(verifiedDb03Snapshot) as StarSnapshot;
  const origins: ItemOrigin[] = [];
  const campaigns: OfficialCampaign[] = [];
  for (const season of snapshot.seasons) {
    const campaignId = 'starpath:' + season.id;
    const window = frozen({start: season.startUtc, endExclusive: season.endUtcExclusive});
    campaigns.push({
      campaignId, kind: 'event_reward', name: season.title, code: null,
      productId: null, window, conditions: frozen(['Star Path progress and reward claim']),
      rewards: frozen([]), source: STARPATH_SOURCE,
      availability: 'not_live_verified'
    });
    const add = (r: StarReward, group: string, page: number, position: number) => {
      const kind: OriginKind = group === 'vault' ? 'star_path_vault' :
        r.premium ? 'star_path_premium' : 'star_path_free';
      const conditions = [
        r.premium ? 'Premium Star Path entitlement required' : 'Free reward tier',
        group === 'vault' ? 'Vault reward' :
          group === 'bonus' ? 'Bonus page unlock conditions' : 'Reward page unlock conditions'
      ];
      if (r.alternateItemId) conditions.push('Alternate Item ID: ' + id(r.alternateItemId));
      if (r.recurrent) conditions.push('Repeatable reward in native snapshot');
      origins.push({
        originId: `starpath:${season.id}:${group}:${page}:${position}`,
        itemId: id(r.itemId), kind, routeStatus: 'confirmed_source_link',
        campaignId, name: season.title, productId: null,
        quantity: r.amount,
        price: r.price === undefined ? null : {
          quantity: r.price, currency: season.currencyName, currencyItemId: null
        },
        accessTier: r.premium ? 'premium' : 'free', window,
        salePeriods: frozen([]), conditions: frozen(conditions),
        source: STARPATH_SOURCE, availability: 'not_live_verified'
      });
    };
    for (const p of season.rewardPages) p.rewards.forEach((r, i) => add(r, 'page', p.page, i));
    for (const p of season.bonusPages) p.rewards.forEach((r, i) => add(r, 'bonus', p.page, i));
    season.vaultRewards.forEach((r, i) => add(r, 'vault', 0, i));
  }
  return {origins, campaigns};
}

/** Normal consumer: DB-03 verifies the 34,617 source bytes and pinned SHA-256 first. */
export async function loadStarpathAcquisitionDatabase(
  fetcher: typeof fetch = fetch,
  native: NativeAcquisitionReader | null = null,
  basePath = ''
): Promise<OriginDatabase> {
  assert(basePath === '' || (basePath.startsWith('/') && !basePath.includes('..') && !basePath.endsWith('/')), 'BASE_PATH');
  const snapshot: unknown = await loadPublicStarpath(
    basePath + '/guide/public/starpath-cache-2026-11-22.json', fetcher
  );
  const {origins, campaigns} = starpathOriginRecords(snapshot);
  return createAcquisitionOriginDatabase(origins, campaigns, native);
}

/** Source-authenticated DB-03 paths plus independent official campaign history. */
export async function loadUnifiedAcquisitionOriginDatabase(
  fetcher: typeof fetch = fetch,
  native: NativeAcquisitionReader | null = null,
  basePath = '',
  nativeItemIds: readonly (string | number)[] = []
): Promise<OriginDatabase> {
  assert(basePath === '' || (basePath.startsWith('/') && !basePath.includes('..') && !basePath.endsWith('/')), 'BASE_PATH');
  const snapshot: unknown = await loadPublicStarpath(
    basePath + '/guide/public/starpath-cache-2026-11-22.json', fetcher
  );
  const starpath = starpathOriginRecords(snapshot);
  // Import only requested Item IDs from the exact verified private r5 bundle.
  // Other callers retain the static native view without making source claims.
  const nativeRoutes = nativeItemIds.length ? projectVerifiedSrc02Origins(
    native as VerifiedSrc02OriginReader, nativeItemIds
  ) : [];
  return createAcquisitionOriginDatabase(
    [...starpath.origins, ...nativeRoutes],
    [...starpath.campaigns, ...OFFICIAL_CAMPAIGNS], native
  );
}
