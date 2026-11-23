/**
 * Official 2023 + 2024 Pride redemption-code reward families.
 *
 * Primary evidence:
 *   https://disneydreamlightvalley.com/news/Pride-2023 (20 Jun 2023)
 *   https://disneydreamlightvalley.com/news/Pride-2024 (26 Jun 2024)
 *
 * Original official articles provide CODE -> COLORWAY + ITEM-TYPE mappings,
 * NOT numeric Item IDs. The reward name uses the corresponding verified public
 * Steam v1.26.2 DB-00 English display label when the article uses a shorter
 * name ("Gleam Tee", "Ear Headband"). This is an explicit label alignment
 * for name-only discovery, not an official Item-ID linkage.
 *
 * All Item IDs must remain null. Never promote a unique name match to a
 * verified code grant, actual ownership or a live redemption entitlement.
 */
import type {OfficialCampaign,CampaignReward} from './origins.ts';

export const DB02_PRIDE_REDEMPTION_SOURCE_SCHEMA=
  'wand.db02.official-pride-redemption-campaigns@1' as const;

const SHADES=Object.freeze([
  ['Gleam','PRIDE20231','PRIDEGLEAM24'],
  ['Illuminate','PRIDE20232','PRIDEILLUMINATE24'],
  ['Shine','PRIDE20233','PRIDESHINE24'],
  ['Shimmer','PRIDE20234','PRIDESHIMMER24'],
  ['Glow','PRIDE20235','PRIDEGLOW24'],
  ['Radiate','PRIDE20236','PRIDERADIATE24'],
  ['Bright','PRIDE20237','PRIDEBRIGHT24'],
  ['Dazzle','PRIDE20238','PRIDEDAZZLE24']
] as const);
const TYPES_2024=Object.freeze([
  'Balloon Arch','Balloon Bouquet','Ears Headband','Popcorn Bucket'
] as const);
const official2023='https://disneydreamlightvalley.com/news/Pride-2023';
const official2024='https://disneydreamlightvalley.com/news/Pride-2024';

function reward(name:string):CampaignReward{
  return Object.freeze({name,itemId:null,quantity:1,cumulativeWatchMinutes:null});
}
function code2023(shade:string,code:string):OfficialCampaign{
  return Object.freeze({
    campaignId:'code:'+code,
    kind:'redeem_code' as const,
    name:'Pride 2023 '+shade+' Tee',code,productId:null,
    window:Object.freeze({start:'2023-06-20',endExclusive:null}),
    conditions:Object.freeze([
      'The official 2023 Pride article explicitly identifies this code and its '+shade+' Tee reward',
      'The game-native DB-00 English display label prefixes the official '+shade+' Tee name with Pride —',
      'The published article has no numeric Item ID or verified expiration date',
      'Name alignment identifies a candidate only; code redemption, account ownership and current availability are unverified'
    ]),
    rewards:Object.freeze([reward('Pride — '+shade+' Tee')]),
    source:Object.freeze({
      sourceId:'official:pride-2023:'+code,
      kind:'official_publication' as const,
      sourceUrl:official2023,checkedOn:'2026-11-23',
      gameVersion:null,sha256:null
    }),
    availability:'not_live_verified' as const
  });
}
function code2024(shade:string,code:string):OfficialCampaign{
  return Object.freeze({
    campaignId:'code:'+code,
    kind:'redeem_code' as const,
    name:'Pride 2024 '+shade+' Colorway',code,productId:null,
    window:Object.freeze({start:'2024-06-26',endExclusive:null}),
    conditions:Object.freeze([
      'Official 2024 article explicitly lists '+code+' and the '+shade+' colorway',
      'The official article provides one Balloon Arch, one Balloon Bouquet, one Ear Headband, and one Popcorn Bucket for the colorway',
      'The game-native English DB-00 label is Ears Headband, while the official article says Ear Headband',
      'The official article states the codes will not expire, but live redemption and player entitlement were not checked',
      'Native Item IDs are discovered only through name matching; no numeric Item IDs appear in the official article'
    ]),
    rewards:Object.freeze(TYPES_2024.map(kind=>reward(shade+' '+kind))),
    source:Object.freeze({
      sourceId:'official:pride-2024:'+code,
      kind:'official_publication' as const,
      sourceUrl:official2024,checkedOn:'2026-11-23',
      gameVersion:null,sha256:null
    }),
    availability:'not_live_verified' as const
  });
}
/** Official 16 codes / 40 source-described rewards. All native Item IDs intentionally null. */
export const OFFICIAL_PRIDE_REDEMPTION_CAMPAIGNS:readonly OfficialCampaign[]=
  Object.freeze([
    ...SHADES.map(([shade,code])=>code2023(shade,code)),
    ...SHADES.map(([shade,,code])=>code2024(shade,code))
  ]);
export const DB02_PRIDE_REDEMPTION_COVERAGE=Object.freeze({
  authoritativeOfficialArticles:2 as const,
  teeCodes2023:8 as const,
  colorwayCodes2024:8 as const,
  totalCodes:16 as const,
  sourceDescribedRewardRows:40 as const,
  directOfficialNumericItemIdLinks:0 as const,
  nameMatchesNotCodeGrantProof:true as const,
  liveRedemptionVerified:false as const,
  playerOwnershipVerified:false as const
});
