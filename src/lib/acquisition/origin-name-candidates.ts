/**
 * DB-02 -> DB-01 name-only candidate bridge.
 * Consumes the existing SHA-verified DB-01 read API, never reparses LocDB.
 * An exact display name is NOT proof that a campaign awarded that Item ID.
 */
import type {Db01CatalogClient} from '../items/index.ts';
import type {OfficialCampaign} from './origins.ts';

export const OFFICIAL_NAME_CANDIDATE_SCHEMA = 'wand.db02.official-name-candidate@1' as const;

export interface OfficialNameCandidate {
  readonly campaignId: string;
  readonly rewardName: string;
  readonly itemId: string;
  readonly evidence: 'exact_current_en_name_only';
  readonly verifiedAcquisitionLink: false;
  readonly gameVersion: '1.26.2';
}

export interface OfficialNameCandidateIndex {
  readonly schema: typeof OFFICIAL_NAME_CANDIDATE_SCHEMA;
  readonly queryScope: 'source_verified_db01_names_only';
  readonly verifiedAcquisitionLinks: 0;
  getCandidatesForItem(itemId: number | string): readonly OfficialNameCandidate[];
  getCandidatesForCampaign(campaignId: string): readonly OfficialNameCandidate[];
  getSummary(): {
    readonly examinedRewardNames: number;
    readonly exactlyMatchedNames: number;
    readonly ambiguouslyMatchedNames: number;
    readonly unmatchedNames: number;
    readonly verifiedAcquisitionLinks: 0;
  };
}
function id(value: number | string): string {
  const v = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof v !== 'string' || !/^[1-9][0-9]{0,15}$/.test(v) || !Number.isSafeInteger(Number(v)))
    throw new TypeError('DB02_NAME_CANDIDATE_ID');
  return v;
}

/** Pass the existing, source-authenticated DB-01 client and public campaign ledger. */
export async function matchOfficialCampaignRewardNames(
  campaigns: readonly OfficialCampaign[],
  db01: Pick<Db01CatalogClient, 'source' | 'searchExactNames'>
): Promise<OfficialNameCandidateIndex> {
  if (db01?.source?.platform !== 'Steam' ||
      db01.source.gameVersion !== '1.26.2' ||
      db01.source.privateOnly !== true ||
      typeof db01.searchExactNames !== 'function')
    throw new TypeError('DB02_NAME_CANDIDATE_VERIFIED_DB01_REQUIRED');
  const byItem = new Map<string, OfficialNameCandidate[]>();
  const byCampaign = new Map<string, OfficialNameCandidate[]>();
  let examined = 0, matched = 0, ambiguous = 0, unmatched = 0;
  for (const campaign of campaigns) {
    if (campaign.source.kind !== 'official_publication') continue;
    for (const reward of campaign.rewards) {
      if (reward.itemId !== null) continue; // already explicitly linked elsewhere
      examined++;
      const rows = await db01.searchExactNames(reward.name, 'en', 500);
      // DB-01 uses substring search; exact comparison prevents accidental
      // matches such as 'Gamer Chair' vs. 'Winner\'s Gamer Chair'.
      const exact = rows.filter(row => row.evidence === 'current_exact_locdb_join' &&
        row.value.localeCompare(reward.name, 'en', {sensitivity:'accent'}) === 0);
      const unique = new Set(exact.map(row => id(row.itemId)));
      if (unique.size === 0) {unmatched++;continue;}
      if (unique.size !== 1) {ambiguous++;continue;}
      matched++;
      const candidate: OfficialNameCandidate = Object.freeze({
        campaignId:campaign.campaignId, rewardName:reward.name,
        itemId:[...unique][0], evidence:'exact_current_en_name_only',
        verifiedAcquisitionLink:false, gameVersion:'1.26.2'
      });
      (byItem.get(candidate.itemId) ?? (byItem.set(candidate.itemId,[]),
        byItem.get(candidate.itemId)!)).push(candidate);
      (byCampaign.get(candidate.campaignId) ?? (byCampaign.set(candidate.campaignId,[]),
        byCampaign.get(candidate.campaignId)!)).push(candidate);
    }
  }
  for (const rows of [...byItem.values(),...byCampaign.values()]) Object.freeze(rows);
  const summary = Object.freeze({
    examinedRewardNames:examined, exactlyMatchedNames:matched,
    ambiguouslyMatchedNames:ambiguous, unmatchedNames:unmatched,
    verifiedAcquisitionLinks:0 as const
  });
  return Object.freeze({
    schema:OFFICIAL_NAME_CANDIDATE_SCHEMA,
    queryScope:'source_verified_db01_names_only' as const,
    verifiedAcquisitionLinks:0 as const,
    getCandidatesForItem(itemId:number|string) {return byItem.get(id(itemId)) ?? [];},
    getCandidatesForCampaign(campaignId:string) {return byCampaign.get(campaignId) ?? [];},
    getSummary() {return summary;}
  });
}
