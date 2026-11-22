/**
 * DB-02 official-publication evidence, 2026-11-22.
 * Item IDs are deliberately null until independently joined to verified game IDs.
 * Historical publication does not prove current entitlement, redemption, or stock.
 */
import type {OfficialCampaign} from './origins.ts';

export const OFFICIAL_CAMPAIGNS: readonly OfficialCampaign[] = Object.freeze([
  {
    campaignId:'twitch:2026-october-showcase',
    kind:'twitch_drop',
    name:'2026 Showcase Twitch Drops',
    code:null,productId:null,
    window:{start:'2026-10-21',endExclusive:'2026-10-29'},
    conditions:['Link Twitch and game account','Watch partnered creators',
      'Specific viewing requirement not stated in this announcement'],
    rewards:[
      {name:'Pirate Crocodile Companion skin',itemId:null,quantity:1,cumulativeWatchMinutes:null}
    ],
    source:{
      sourceId:'official:twitch:2026-showcase',
      kind:'official_publication',
      sourceUrl:'https://disneydreamlightvalley.com/news/2026ShowcaseHighlights',
      checkedOn:'2026-11-22',gameVersion:null,sha256:null
    },
    availability:'not_live_verified'
  },
  {
    campaignId:'premium:hercules-bundle:2026',
    kind:'premium_shop',
    name:'Hercules Bundle (2026 update announcement)',
    code:null,productId:null,
    window:{start:null,endExclusive:null},
    conditions:['Official announcement confirms bundle content',
      'Offer ID, price, sale dates and rotation history not established'],
    rewards:[
      {name:'Gilded Agora Building Kit',itemId:null,quantity:1,cumulativeWatchMinutes:null},
      {name:'Grecian Villa House Style',itemId:null,quantity:1,cumulativeWatchMinutes:null},
      {name:'Puppy companion (official description)',itemId:null,quantity:1,cumulativeWatchMinutes:null}
    ],
    source:{
      sourceId:'official:premium:hercules-2026',
      kind:'official_publication',
      sourceUrl:'https://disneydreamlightvalley.com/news/update-jun-03-2026',
      checkedOn:'2026-11-22',gameVersion:null,sha256:null
    },
    availability:'not_live_verified'
  },
  {
    campaignId: 'twitch:2026-keepsake-sea',
    kind: 'twitch_drop',
    name: 'The Keepsake Sea Twitch Drops',
    code: null,
    productId: null,
    window: {start:'2026-11-18T14:00:00Z',endExclusive:'2026-12-03T05:00:00Z'},
    conditions: ['Link Twitch and game account', 'Watch eligible creators',
      'Claim on Twitch and redeem from in-game mailbox',
      'November 18 news gives November 25 end; current official Drops page gives December 2 — date discrepancy retained'],
    rewards: [
      {name:'Keepsake Sea Photo Frame',itemId:null,quantity:1,cumulativeWatchMinutes:60},
      {name:'Pirate Crocodile Companion',itemId:null,quantity:1,cumulativeWatchMinutes:90},
      {name:'Sea Witch Ship',itemId:null,quantity:1,cumulativeWatchMinutes:120}
    ],
    source: {
      sourceId:'official:twitch:2026-keepsake-sea',
      kind:'official_publication',
      sourceUrl:'https://disneydreamlightvalley.com/twitch-drops',
      checkedOn:'2026-11-22',gameVersion:null,sha256:null
    },
    availability:'not_live_verified'
  },
  {
    campaignId:'twitch:2023-launch',
    kind:'twitch_drop',
    name:'First Twitch Drops (Pride of the Valley)',
    code:null,productId:null,
    window:{start:'2023-04-05',endExclusive:'2023-04-13'},
    conditions:['Link Twitch and game account','Watch eligible creators','Claim from mailbox'],
    rewards:[
      {name:'Gamer Mickey Ears Headband',itemId:null,quantity:1,cumulativeWatchMinutes:15},
      {name:'Gamer Chair',itemId:null,quantity:1,cumulativeWatchMinutes:45},
      {name:'Gamer Laptop',itemId:null,quantity:1,cumulativeWatchMinutes:90},
      {name:'Comfy Gamer Hoodie',itemId:null,quantity:1,cumulativeWatchMinutes:150}
    ],
    source:{
      sourceId:'official:twitch:2023-launch',
      kind:'official_publication',
      sourceUrl:'https://disneydreamlightvalley.com/news/announcing-twitch-drops',
      checkedOn:'2026-11-22',gameVersion:null,sha256:null
    },
    availability:'not_live_verified'
  },
  {
    campaignId:'code:DDVPRIDE2026',
    kind:'redeem_code',
    name:'Pride in the Valley 2026',
    code:'DDVPRIDE2026',productId:null,
    window:{start:'2026-06-03',endExclusive:null},
    conditions:['Redeem in Settings > Help', 'Delivered via in-game mailbox',
      'End date not published in source'],
    rewards:[
      {name:'Round Rainbow Garden',itemId:null,quantity:1,cumulativeWatchMinutes:null},
      {name:'Butterfly Tiara',itemId:null,quantity:1,cumulativeWatchMinutes:null}
    ],
    source:{
      sourceId:'official:pride:2026',
      kind:'official_publication',
      sourceUrl:'https://disneydreamlightvalley.com/news/PrideMonth2026',
      checkedOn:'2026-11-22',gameVersion:null,sha256:null
    },
    availability:'not_live_verified'
  },
  {
    campaignId:'purchase:keepsake-sea-deluxe-2026',
    kind:'purchase_bonus',
    name:'The Keepsake Sea – Deluxe Edition',
    code:null,productId:null,
    window:{start:'2026-11-18',endExclusive:null},
    conditions:['Purchase the specified Deluxe Edition',
      'Ownership and claimed rewards not verifiable from local item definitions'],
    rewards:[
      {name:'Gilded Shell Tops',itemId:null,quantity:1,cumulativeWatchMinutes:null},
      {name:'Merfolk Mansion House Style',itemId:null,quantity:1,cumulativeWatchMinutes:null},
      {name:'Flounder Adventure Companion',itemId:null,quantity:1,cumulativeWatchMinutes:null},
      {name:'Sebastian Adventure Companion',itemId:null,quantity:1,cumulativeWatchMinutes:null},
      {name:'Moonstones',itemId:null,quantity:10000,cumulativeWatchMinutes:null}
    ],
    source:{
      sourceId:'official:keepsake-sea:deluxe',
      kind:'official_publication',
      sourceUrl:'https://disneydreamlightvalley.com/news/2026ShowcaseHighlights',
      checkedOn:'2026-11-22',gameVersion:null,sha256:null
    },
    availability:'not_live_verified'
  },
  {
    campaignId:'purchase:keepsake-sea-launch-2026',
    kind:'purchase_bonus',
    name:'The Keepsake Sea launch play reward',
    code:null,productId:null,
    window:{start:'2026-11-18',endExclusive:'2026-12-03'},
    conditions:['Purchase The Keepsake Sea expansion', 'Play between November 18 and December 2, 2026',
      'Official announcement did not specify an Item ID'],
    rewards:[
      {name:'Villanous Fin (official article wording)',itemId:null,quantity:1,cumulativeWatchMinutes:null}
    ],
    source:{
      sourceId:'official:keepsake-sea:launch',
      kind:'official_publication',
      sourceUrl:'https://disneydreamlightvalley.com/news/TheKeepsakeSea2026',
      checkedOn:'2026-11-22',gameVersion:null,sha256:null
    },
    availability:'not_live_verified'
  }
] satisfies OfficialCampaign[]);
