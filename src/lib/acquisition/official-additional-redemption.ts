/**
 * Additional native-version-independent public redemption history:
 * - 2024 timed Mickey BOO! Loungefly: official token, reward and deadline.
 * - 2025 Sakura Blossom Dragon: official token and companion reward.
 * - 2025 Pride: official reward announcement, independent community code
 *   evidence (the readable official article does not publish its code).
 *
 * None supplies a native Item ID. Name matching remains only a candidate.
 * No live redemption, player entitlement or shop rotation is inferred.
 */
import type {OfficialCampaign} from './origins.ts';

export const DB02_ADDITIONAL_CODES_SCHEMA=
  'wand.db02.official-and-corroborated-redemption-2024-2025@1' as const;
const GJ='https://disneydreamlightvalley.com/ja/news/JungleGetawayUpdate';
const DRAGON='https://disneydreamlightvalley.com/ja/news/update-dec-10-2025';
const PRIDE='https://disneydreamlightvalley.com/news/Pride2025';
const WIKI='https://dreamlightvalleywiki.com/Redemption_Codes';
const common=(name:string)=>Object.freeze({
  name,itemId:null,quantity:1,cumulativeWatchMinutes:null
});
export const ADDITIONAL_REDEMPTION_CAMPAIGNS:readonly OfficialCampaign[]=
Object.freeze([
  Object.freeze({
    campaignId:'code:DDV2024OOOOO',kind:'redeem_code' as const,
    name:'Mickey BOO! Loungefly 2024 collaboration',
    code:'DDV2024OOOOO',productId:null,
    window:Object.freeze({
      start:'2024-10-09',endExclusive:'2024-11-20T14:00:00Z'
    }),
    conditions:Object.freeze([
      'Official Jungle Getaway article directly publishes the code, named reward and November 20 2024 14:00 UTC redemption deadline',
      'Code contains digits 2, 0, 2, 4 and five trailing letter O characters; preserve exact spelling',
      'English Steam v1.26.2 ItemList has the exactly named backpack, but official article does not identify numeric Item ID',
      'Historical deadline is not a statement about the live game, previously claimed rewards, or mailbox possession'
    ]),
    rewards:Object.freeze([common('Mickey BOO! Loungefly Backpack')]),
    source:Object.freeze({
      sourceId:'official:jungle-getaway:ddv2024ooooo',
      kind:'official_publication' as const,
      sourceUrl:GJ,checkedOn:'2026-11-23',
      gameVersion:null,sha256:null
    }),
    availability:'not_live_verified' as const
  }),
  Object.freeze({
    campaignId:'code:COMMUNITYCOMPANIONDRAGON2025',
    kind:'redeem_code' as const,
    name:'2025 Sakura Blossom Dragon Community Companion',
    code:'COMMUNITYCOMPANIONDRAGON2025',productId:null,
    window:Object.freeze({start:'2025-12-10',endExclusive:null}),
    conditions:Object.freeze([
      'Official December 2025 Winter Ball patch notes directly publish the code for the cherry-blossom dragon companion',
      'Companion definitions are not among the 13,202 public DB-00 ItemList entries; do not substitute a visually similar native Companion Item ID',
      'End date, live redemption, ownership and native companion Item ID remain unverified'
    ]),
    rewards:Object.freeze([common('Sakura Blossom Dragon Companion')]),
    source:Object.freeze({
      sourceId:'official:winter-ball:community-dragon-2025',
      kind:'official_publication' as const,
      sourceUrl:DRAGON,checkedOn:'2026-11-23',
      gameVersion:null,sha256:null
    }),
    availability:'not_live_verified' as const
  }),
  Object.freeze({
    campaignId:'code:DDVPRIDE25',kind:'redeem_code' as const,
    name:'Pride 2025 celebration rewards',
    code:'DDVPRIDE25',productId:null,
    window:Object.freeze({start:'2025-06-20',endExclusive:null}),
    /** Unlike the 2023 and 2024 articles, the readable 2025 article omits code. */
    codeEvidence:Object.freeze({
      evidence:'community_code_report_official_reward_announcement' as const,
      codeSourceKind:'community_wiki' as const,
      codeSourceUrl:WIKI,checkedOn:'2026-11-23',
      officialArticleContainsReadableCode:false as const,
      nativeRewardItemIdVerified:false as const
    }),
    conditions:Object.freeze([
      'Official June 2025 Pride article identifies sweater, umbrella, festive pennants and one new unnamed Photo Mode frame as rewards',
      'DDVPRIDE25 is independently reported by the community redemption-code archive; the readable official page does not expose the code token',
      'Official article calls the decoration Gleam Festive Pennants; retain its exact wording instead of relabeling it from community reports',
      'Only independently exact matched game names may appear as Item-ID candidates; the Photo Mode Frame identity is not specified',
      'Neither live redemption, ownership nor individual Item-ID grant has been verified'
    ]),
    rewards:Object.freeze([
      common('Joy and Rainbows Sweater'),
      common('Joy and Rainbows Umbrella'),
      common('Gleam Festive Pennants'),
      common('Pride 2025 Photo Mode Frame (official name unspecified)')
    ]),
    source:Object.freeze({
      sourceId:'official:pride-2025:reward-collection',
      kind:'official_publication' as const,
      sourceUrl:PRIDE,checkedOn:'2026-11-23',
      gameVersion:null,sha256:null
    }),
    availability:'not_live_verified' as const
  })
]);
export const ADDITIONAL_REDEMPTION_COVERAGE=Object.freeze({
  officialExplicitCodeCampaigns:2 as const,
  communityCorroboratedCodeCampaigns:1 as const,
  totalCampaigns:3 as const,
  officiallyDescribedRewardRows:6 as const,
  officialNumericItemIdLinks:0 as const,
  claimedRewardVerified:false as const
});
