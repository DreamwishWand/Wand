/**
 * Official, retrospective Star Path ANNOUNCEMENT catalogue (not native seasons).
 *
 * Original native season IDs and Item-ID reward maps are intentionally null.
 * Only the two source-exact v1.26.2 cached seasons in reward-relations.ts can
 * answer item-acquisition queries. A public announcement is NOT a full season
 * archive, proof of current availability, or proof of owned rewards.
 */
import type {GuideRewardIndex,GuideStarpathSeason} from './reward-relations';

export const DB03_STARPATH_HISTORY_CONTRACT='wand.db03.official-starpath-announcements@1' as const;
export type OfficialEvidenceKind='contemporary_official_news'|'official_retrospective_reference';
export interface OfficialStarpathAnnouncement {
  readonly historyKey:string;
  readonly year:2022|2023|2024|2025|2026;
  readonly titleEn:string;
  readonly officialEvidenceUrl:string;
  readonly evidenceKind:OfficialEvidenceKind;
  /** Exact internal online season key is NOT established by an article. */
  readonly nativeSeasonId:null;
  readonly rewardItemIdsVerified:false;
  readonly taskDataVerified:false;
  readonly startUtc:null;
  readonly endUtc:null;
}
type Row=[string,OfficialStarpathAnnouncement['year'],string,string,OfficialEvidenceKind?];
const ROWS:readonly Row[]=[
  ['pixar-fest',2022,'Pixar Fest','https://disneydreamlightvalley.com/news/early-access-play-now'],
  ['villains',2022,'Villains','https://disneydreamlightvalley.com/news/update-oct-31','official_retrospective_reference'],
  ['festive',2022,'Festive','https://disneydreamlightvalley.com/news/update-dec-6'],
  ['centennial',2023,'Centennial','https://disneydreamlightvalley.com/news/TheLaughFloorUpdate','official_retrospective_reference'],
  ['disney-parks',2023,'Disney Parks','https://disneydreamlightvalley.com/news/Pride-of-the-Valley-Content-Update'],
  ['wonder-of-pixar',2023,'Wonder of Pixar','https://disneydreamlightvalley.com/fr/news/update-jun-7'],
  ['haunted-holiday',2023,'Haunted Holiday','https://disneydreamlightvalley.com/news/EnchantedAdventure_Update'],
  ['royal-winter',2023,'Royal Winter','https://disneydreamlightvalley.com/news/ThePumpkinKingReturnsUpdate'],
  ['lovely-monsters',2024,'Lovely Monsters','https://disneydreamlightvalley.com/news/TheLaughFloorUpdate'],
  ['a-day-at-disney',2024,'A Day at Disney','https://disneydreamlightvalley.com/news/ThrillsAndFrillsUpdate'],
  ['majesty-and-magnolias',2024,'Majesty and Magnolias','https://disneydreamlightvalley.com/news/update-june-26-2024'],
  ['dapper-delights',2024,'Dapper Delights','https://disneydreamlightvalley.com/news/update-aug-21-2024'],
  ['the-night-show',2024,'The Night Show','https://disneydreamlightvalley.com/fr/news/update-oct-9-2024'],
  ['the-frost-and-fairies',2024,'The Frost & Fairies','https://disneydreamlightvalley.com/news/update-dec-4-2024'],
  ['garden-of-whimsy',2025,'Garden of Whimsy','https://disneydreamlightvalley.com/news/update-apr-23-2025'],
  ['adventures-in-never-land',2025,'Adventures in Never Land','https://disneydreamlightvalley.com/news/update-jun-18-2025'],
  ['retro-roadtrip',2025,'Retro Roadtrip','https://disneydreamlightvalley.com/news/EmotionalRescueUpdate'],
  ['witchful-thinking',2025,'Witchful Thinking','https://disneydreamlightvalley.com/news/ReturntoBeastCastleUpdate'],
  ['winter-warmth',2025,'Winter Warmth','https://disneydreamlightvalley.com/news/WinterBallUpdate'],
  ['paw-fect-romance',2026,'Paw-fect Romance','https://disneydreamlightvalley.com/news/ThePuppyLoveUpdate'],
  ['godly-glamor',2026,'Godly Glamor','https://disneydreamlightvalley.com/news/update-jun-03-2026']
];
const OFFICIAL=new Set(['https://disneydreamlightvalley.com/']);
function assert(ok:unknown,message:string):asserts ok{
  if(!ok)throw new TypeError('DB03_STARPATH_HISTORY_'+message);
}
const historic=Object.freeze(ROWS.map(([slug,year,title,url,kind])=>{
  assert(/^[a-z0-9-]+$/.test(slug)&&title.length>3,'INVALID_NAME');
  const official=new URL(url);
  assert(OFFICIAL.has(official.origin+'/')&&!official.search&&!official.hash,'NONOFFICIAL_SOURCE');
  return Object.freeze({
    historyKey:year+'/'+slug,year,titleEn:title+' Star Path',
    officialEvidenceUrl:url,
    evidenceKind:kind??'contemporary_official_news',
    nativeSeasonId:null,rewardItemIdsVerified:false,taskDataVerified:false,
    startUtc:null,endUtc:null
  }) as OfficialStarpathAnnouncement;
}));
const index=new Map(historic.map(row=>[row.historyKey,row] as const));
assert(historic.length===21&&index.size===21,'DUPLICATE_HISTORY');
export interface GuideStarpathHistory {
  readonly contract:typeof DB03_STARPATH_HISTORY_CONTRACT;
  readonly verifiedNativeSeasons:readonly GuideStarpathSeason[];
  readonly officialAnnouncementsOnly:readonly OfficialStarpathAnnouncement[];
  readonly coverage:Readonly<{
    sourceVerifiedNativeSeasonCount:2;
    officialOnlyAnnouncementCount:21;
    reportedDistinctSeasonEvidenceCount:23;
    historicalCatalogueComplete:false;
    nativeRewardMappingsComplete:false;
    onlineStatusVerified:false;
  }>;
  getAnnouncement(historyKey:string):OfficialStarpathAnnouncement|null;
  listAnnouncements(year?:number):readonly OfficialStarpathAnnouncement[];
}
/**
 * Attach the official-only historic evidence to an *already source-verified*
 * reward index. Never turn a name into a fabricated cache season/event ID.
 */
export function createGuideStarpathHistory(rewards:GuideRewardIndex):GuideStarpathHistory{
  assert(rewards?.contract==='wand.db03.reward-relations@1'&&
    rewards.seasons?.length===2,'REWARD_INDEX_REQUIRED');
  assert(rewards.seasons.every(s=>!historic.some(h=>h.titleEn===s.title)),
    'OVERLAPPING_SOURCE_IDENTITY');
  const coverage=Object.freeze({
    sourceVerifiedNativeSeasonCount:2 as const,
    officialOnlyAnnouncementCount:21 as const,
    reportedDistinctSeasonEvidenceCount:23 as const,
    historicalCatalogueComplete:false as const,
    nativeRewardMappingsComplete:false as const,
    onlineStatusVerified:false as const
  });
  return Object.freeze({
    contract:DB03_STARPATH_HISTORY_CONTRACT,coverage,
    verifiedNativeSeasons:rewards.seasons,
    officialAnnouncementsOnly:historic,
    getAnnouncement:(key:string)=>typeof key==='string'?index.get(key)??null:null,
    listAnnouncements:(year?:number)=>year===undefined?historic:
      Object.freeze(historic.filter(row=>row.year===year))
  });
}
