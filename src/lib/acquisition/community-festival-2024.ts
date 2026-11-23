/**
 * Festival of Foolishness 2024: published event period with independently
 * reported per-code rewards. Do NOT present code/reward details as appearing
 * in the official FAQ: it establishes that NINE codes existed, not their
 * names or contents. Original source Item IDs and actual grants are unknown.
 *
 * Official announcement: https://disneydreamlightvalley.com/news/FestivalofFoolishness2024
 * Community archive: https://dreamlightvalleywiki.com/Festival_of_Foolishness_(2024)
 * Checked: 2026-11-23. No original game files or private saves included.
 */
import type {OfficialCampaign,CampaignReward} from './origins.ts';

export const DB02_FESTIVAL_2024_EVIDENCE_SCHEMA=
  'wand.db02.festival-of-foolishness-2024-community-codes@1' as const;
const OFFICIAL='https://disneydreamlightvalley.com/news/FestivalofFoolishness2024';
const ARCHIVE='https://dreamlightvalleywiki.com/Festival_of_Foolishness_(2024)';
const reward=(name:string,quantity:number):CampaignReward=>Object.freeze({
  name,itemId:null,quantity,cumulativeWatchMinutes:null
});
const data=Object.freeze([
  ['FOFSOUFFLE24', [['Soufflé',10]]],
  ['FOFFISH24', [['Kingfish',5],['Fugu',5],['Anglerfish',5]]],
  ['FOFGEMS24', [['Diamond',3],['Ruby',3],['Sapphire',3]]],
  ['FOFSHARDS24', [['Night Shard',10],['Dream Shard',10]]],
  ['FOFTHANKS24', [['Moonstone',150]]],
  ['FOFSNOW24', [['Hardwood',25],['Rope',25]]],
  ['FOFPRANK24', [['Moonstone',150]]],
  ['FOFWORKOUT24', [['Iron Ingot',25],['Coconut',25]]],
  ['FOFFLOWERS24', [
    ['Sunflower',5],['Blue Hydrangea',5],['Purple Hydrangea',5],
    ['Pink Hydrangea',5],['White & Red Hydrangea',5]
  ]]
] as const);

export const FESTIVAL_2024_CODE_COVERAGE=Object.freeze({
  officialEventCodeCount:9 as const,
  communityArchivedCodeCount:9 as const,
  communityArchivedRewardRows:20 as const,
  officialArticleProvidedCodeTokens:0 as const,
  officialArticleProvidedIndividualRewardNames:0 as const,
  originalNumericItemIdGrantsVerified:0 as const,
  redemptionOrPlayerOwnershipVerified:false as const
});

/**
 * A campaign for each reported code, rather than a generic "special event":
 * consumers can browse each reward and provenance independently, while the
 * game item may also have ordinary, independent acquisition routes.
 */
export const FESTIVAL_2024_COMMUNITY_REDEMPTION_CAMPAIGNS:
  readonly OfficialCampaign[]=Object.freeze(data.map(([code,rows])=>{
  const campaign:OfficialCampaign={
    campaignId:'code:'+code,kind:'redeem_code',
    name:'Festival of Foolishness 2024 — '+code,
    code,productId:null,
    // Official page gives the expiration DATE (August 16) but no precise
    // timestamp. Date-only end boundary must not be construed as a UTC instant.
    window:Object.freeze({start:'2024-07-16',endExclusive:'2024-08-16'}),
    communityArchiveEvidence:Object.freeze({
      evidence:'community_code_and_reward_mapping_for_official_event' as const,
      archiveKind:'community_wiki' as const,
      archiveUrl:ARCHIVE,
      checkedOn:'2026-11-23',
      officialArticleCodeCount:9 as const,
      officialArticleProvidesCodeTokens:false as const,
      officialArticleProvidesRewardNames:false as const,
      officialExpirationDate:'2024-08-16' as const,
      exactExpiryInstantVerified:false as const,
      nativeRewardItemIdVerified:false as const,
      actualRewardGrantedVerified:false as const
    }),
    conditions:Object.freeze([
      'Official FAQ confirms nine redeemable codes in the July 16 – August 16, 2024 text adventure.',
      'Code tokens and individual rewards are reported by a separate community archive, not published in the readable official FAQ.',
      'Expiry day is published as August 16, 2024; exact cutoff instant is not established by that official FAQ.',
      'This was a time-limited distribution route; the listed resources are not necessarily time-limited items.',
      'No Item ID, redemption result or player ownership is verified.'
    ]),
    rewards:Object.freeze(rows.map(([name,quantity])=>reward(name,quantity))),
    source:Object.freeze({
      sourceId:'official:festival-foolishness-2024:'+code.toLowerCase(),
      kind:'official_publication' as const,
      sourceUrl:OFFICIAL,checkedOn:'2026-11-23',
      gameVersion:null,sha256:null
    }),
    availability:'not_live_verified'
  };
  return Object.freeze(campaign);
}));
