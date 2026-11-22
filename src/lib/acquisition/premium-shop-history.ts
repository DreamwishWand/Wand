/**
 * Third-party historical Premium Shop OBSERVATIONS. Prices/stock are NOT
 * authenticated from game/LiveOps, not current offers and not native offer IDs.
 * This intentionally does not populate ItemOrigin.confirmed_source_link.
 *
 * Limited observed weeks from https://dreamlightvalleywiki.com/Premium_Shop/2026
 * consulted 2026-11-22. Additional source weeks can be appended without
 * destroying separate prices/contents on a reappearance.
 */
export const PREMIUM_SHOP_HISTORY_SCHEMA = 'wand.db02.premium-shop-history@1' as const;
export interface ShopContent {
  readonly name: string;
  readonly quantity: number | null;
  readonly verifiedItemId: null;
}
export interface ShopAppearance {
  /** Editorial key only. NEVER substitute for a native Premium Shop offer ID. */
  readonly appearanceId: string;
  readonly productKey: string;
  readonly productName: string;
  readonly nativeOfferId: null;
  readonly gameItemId: null;
  readonly contents: readonly ShopContent[];
  readonly moonstonePrice: number;
  readonly saleStart: string;
  readonly saleEndExclusive: string;
  readonly priceEvidence: 'community_archive_only';
  readonly contentsEvidence: 'community_archive_only';
  readonly liveStockVerified: false;
  readonly source: {
    readonly kind: 'community_wiki';
    readonly url: 'https://dreamlightvalleywiki.com/Premium_Shop/2026';
    readonly checkedOn: '2026-11-22';
  };
}
type SourceRow = readonly [week: string, product: string, price: number, components: readonly (string | readonly [name: string, quantity: number])[]];
const CONTENT=(...names:(string|readonly [string,number])[])=>names;
const WINTER_DECOR=CONTENT(
  'Goofy\'s Festive Stall','Shining Winter Wishing Well',
  ['Magical Flurry Cloud',3],['Winter Holiday Bush',5],['Winter Holiday Hedge',5],
  ['Square Winter Holiday Bush',5],['Tall Winter Holiday Tree',5],
  ['Spindly Winter Holiday Tree',5],['Large Winter Holiday Tree',5],
  ['Small Winter Holiday Tree',5],['Winter Holiday Tree',5],
  ['Leaning Winter Holiday Tree',5]);
const WINTER_BUILDINGS=CONTENT('Scrooge McDuck\'s Holiday Shop','Winter Holiday Chez Remy','Winter Holiday Plaza Square');
const ROYAL_TOOLS=CONTENT('Roses and Gold Shovel','Roses and Gold Pickaxe',
  'Roses and Gold Fishing Rod','Roses and Gold Hourglass',
  'Roses and Gold Watering Can','Roses and Gold Phone');

/** Only individually observed weekly lines; do not manufacture missing weeks. */
const ROWS: readonly SourceRow[]=[
  ['2026-11-18','Mickey & Friends Celebration Houses',4000,CONTENT(
    'Mickey\'s Celebration House','Minnie\'s Celebration House',
    'Donald\'s Celebration Boat','Goofy\'s Celebration House','Daisy\'s Celebration House')],
  ['2026-11-18','Deluxe Winter Holiday Bundle',8000,CONTENT('Winter Holiday Dream Castle',
    'Winter Holiday Plaza Square',...WINTER_BUILDINGS.filter(x=>x!=='Winter Holiday Plaza Square'),...WINTER_DECOR)],
  ['2026-11-18','Winter Holiday Dream Castle',3500,CONTENT('Winter Holiday Dream Castle')],
  ['2026-11-18','Deluxe Winter Holiday Building Set',3500,WINTER_BUILDINGS],
  ['2026-11-18','Deluxe Winter Holiday Decoration Set',3000,WINTER_DECOR],
  ['2026-11-18','Snowy Pink Celebration Castle Bundle',4275,CONTENT(
    ['Snowy Pink Celebration Tower',10],['Snowy Pink Celebration Covered Walkway',10],
    ['Snowy Pink Celebration Bridge',10],'Snowy Pink Celebration Castle')],
  ['2026-11-18','Snowy Pink Celebration Bridge Set',1750,CONTENT(
    ['Snowy Pink Celebration Tower',10],['Snowy Pink Celebration Covered Walkway',10],
    ['Snowy Pink Celebration Bridge',10])],
  ['2026-11-18','Snowy Pink Celebration Castle',3000,CONTENT('Snowy Pink Celebration Castle')],
  ['2026-11-18','Sweet Bee Shoes',1600,CONTENT('Sweet Bee Shoes')],
  ['2026-11-18','Donut Duo',900,CONTENT(
    'Mickey Mouse Cocoa Donut Headband','Mickey Mouse Strawberry Donut Headband')],
  ['2026-11-11','Snowy Beast\'s Castle',1500,CONTENT('Snowy Beast\'s Castle')],
  ['2026-11-11','Ballerina Ensemble',1750,CONTENT('Ballerina Dress','Ballerina Tiara','Ballerina Shoes')],
  ['2026-11-11','Festive Sparkles Set',1500,CONTENT('Festive Spiral Sparkles','Festive Snowflake Sparkles')],
  ['2026-11-11','Holiday Wreath Eeyore',2500,CONTENT('Holiday Wreath Eeyore')],
  ['2026-11-11','Belle\'s Cottage',3750,CONTENT('Belle\'s Cottage')],
  ['2026-11-11','Belle\'s Royal Tools',3750,ROYAL_TOOLS],
  ['2026-11-11','Footstool Bundle',3000,CONTENT('The Footstool','The Footstool\'s Enchanted House')],
  ['2026-11-11','Winter\'s Wonder Belle',2500,CONTENT('Winter\'s Wonder Belle')],
  ['2026-11-11','Midnight Garden Gazebo',1500,CONTENT('Midnight Garden Gazebo')],
  ['2026-11-11','Enchanted Ice Fountain',1750,CONTENT('Enchanted Ice Fountain')],
  ['2026-11-11','Cupid Fountain',1750,CONTENT('Cupid Fountain')],
  ['2026-11-11','Romantic Set',1200,CONTENT('Floating Lanterns','Swan Boat')],
  ['2026-11-11','Love and Airborne Hearts',1000,CONTENT(
    ['Airborne Heart',2],['Love Is in the Air Hearts',2])],
  ['2026-11-11','La Bouff Bedroom Set',1800,CONTENT(
    'La Bouff Bed','La Bouff Dresser','La Bouff Night Stand','La Bouff Wardrobe',
    'La Bouff Carpet','La Bouff Chandelier','La Bouff Lamp')],
  ['2026-11-04','New Orleans Pergola Set',1500,CONTENT(
    ['New Orleans Pergola',8],['New Orleans Pergola Corner',8])],
  ['2026-11-04','Pirates of the Caribbean House',3000,CONTENT('Pirates of the Caribbean House')],
  ['2026-11-04','Haunted Mansion Wall Kit',2000,CONTENT(
    'Haunted Mansion Wall Preset',['Haunted Mansion Floral Wall',10],
    ['Haunted Mansion Gate',10],['Haunted Mansion Brick Wall',10],
    ['Haunted Mansion Wall',10],['Haunted Mansion Fence-Topped Wall',10],
    ['Haunted Mansion Pillar',10])],
  ['2026-11-04','Aurora Costume Dresses',1200,CONTENT('Pink Aurora Costume Dress','Blue Aurora Costume Dress')],
  ['2026-11-04','Chernabog\'s Changing Castle',1575,CONTENT('Chernabog\'s Changing Castle')],
  ['2026-10-21','Night Mare Mount Accessories',1500,CONTENT(
    'Night Mare Saddle','Night Mare Horse Pack','Night Mare Saddle Blanket','Night Mare Harness')],
  ['2026-10-21','Baby Lynx',2000,CONTENT('Baby Lynx')],
  ['2026-10-21','Haunted Sky',2000,CONTENT('Haunted Sky')],
  ['2026-10-21','Haunted Water Mist',1200,CONTENT(['Haunted Water Mist',3])],
  ['2026-10-21','Witchy Set',1500,CONTENT(
    'Witchy Vanity Desk',['Greenhouse Bench',3],'Hocus Pocus Cauldron',
    ['Witch\'s Dark Bookcase',3],['Glass Potion Case',4])],
  ['2026-10-21','Golden Bloom Cottage',3000,CONTENT('Golden Bloom Cottage')],
  ['2026-10-21','Autumnal Clock Tower',1500,CONTENT('Autumnal Clock Tower')],
  ['2026-10-21','Swirling Leaves Set',1000,CONTENT(['Swirling Leaves',3],['Swirling Forest Leaves',3])],
  ['2026-10-21','Autumnal Mushroom Pond',1350,CONTENT('Autumnal Mushroom Pond')],
  ['2026-09-16','Belle\'s Royal Tools',3750,ROYAL_TOOLS],
  ['2026-09-16','Footstool Bundle',3000,CONTENT(
    'The Footstool','Cozy Castle Rug','The Footstool\'s Enchanted House')],
  ['2026-09-16','Winter\'s Wonder Belle',2500,CONTENT('Winter\'s Wonder Belle')],
  ['2026-09-16','Enchanted Ice Fountain',1750,CONTENT('Enchanted Ice Fountain')]
];
const URL='https://dreamlightvalleywiki.com/Premium_Shop/2026' as const;
const SOURCE=Object.freeze({kind:'community_wiki' as const,url:URL,checkedOn:'2026-11-22' as const});
const DAY=/^20\d{2}-\d{2}-\d{2}$/;
const EMPTY=Object.freeze([]) as readonly ShopAppearance[];
function assert(ok:unknown,code:string):asserts ok{
  if(!ok)throw new TypeError('DB02_SHOP_HISTORY_'+code);
}
function weekEnd(date:string):string {
  const start=new Date(date+'T00:00:00Z');
  assert(!Number.isNaN(start.valueOf())&&start.toISOString().startsWith(date),'INVALID_DATE');
  start.setUTCDate(start.getUTCDate()+7);
  return start.toISOString().slice(0,10);
}
function canonical(name:string):string {
  assert(typeof name==='string'&&name.length>0&&name.length<200,'INVALID_PRODUCT_NAME');
  const cleaned=name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  assert(cleaned.length>2,'INVALID_PRODUCT_KEY');
  return cleaned;
}
const byDate=new Map<string,ShopAppearance[]>();
const byProduct=new Map<string,ShopAppearance[]>();
const all:ShopAppearance[]=[];
const seen=new Set<string>();
const productNames=new Map<string,string>();
for(const [date,name,price,rawContents] of ROWS){
  assert(DAY.test(date)&&Number.isSafeInteger(price)&&price>0&&
    Array.isArray(rawContents)&&rawContents.length>0,'INVALID_HISTORY_ROW');
  const productKey=canonical(name);
  const existing=productNames.get(productKey);
  assert(existing===undefined||existing===name,'PRODUCT_KEY_COLLISION');
  productNames.set(productKey,name);
  const appearanceId=date+'/'+productKey;
  assert(!seen.has(appearanceId),'DUPLICATE_SALE');
  seen.add(appearanceId);
  const contents=Object.freeze(rawContents.map(raw=>{
    const itemName=typeof raw==='string'?raw:raw[0];
    const quantity=typeof raw==='string'?1:raw[1];
    assert(typeof itemName==='string'&&itemName.length>0&&
      Number.isSafeInteger(quantity)&&quantity>0,'CONTENT');
    return Object.freeze({name:itemName,quantity,verifiedItemId:null});
  }));
  const row:ShopAppearance=Object.freeze({
    appearanceId,productKey,productName:name,nativeOfferId:null,gameItemId:null,
    contents,moonstonePrice:price,saleStart:date,saleEndExclusive:weekEnd(date),
    priceEvidence:'community_archive_only',contentsEvidence:'community_archive_only',
    liveStockVerified:false,source:SOURCE
  });
  all.push(row);
  (byDate.get(date)??(byDate.set(date,[]),byDate.get(date)!)).push(row);
  (byProduct.get(productKey)??(byProduct.set(productKey,[]),byProduct.get(productKey)!)).push(row);
}
for(const group of [...byDate.values(),...byProduct.values()])Object.freeze(group);
const ALL=Object.freeze(all);
const coverage=Object.freeze({
  recordedAppearances:ALL.length,
  observedWeeks:byDate.size,
  distinctProducts:byProduct.size,
  nativeOfferIdsVerified:0 as const,
  gameItemIdsVerified:0 as const,
  liveStockVerified:false as const,
  historicalCoverageComplete:false as const
});
export interface HistoricalPremiumShopIndex {
  readonly schema:typeof PREMIUM_SHOP_HISTORY_SCHEMA;
  readonly offers:readonly ShopAppearance[];
  readonly coverage:typeof coverage;
  getWeek(date:string):readonly ShopAppearance[];
  getProduct(product:string):readonly ShopAppearance[];
  listReissuedProducts():readonly {readonly productName:string;readonly appearances:readonly ShopAppearance[]}[];
}
export const historicalPremiumShop:HistoricalPremiumShopIndex=Object.freeze({
  schema:PREMIUM_SHOP_HISTORY_SCHEMA,offers:ALL,coverage,
  getWeek(date:string){return byDate.get(date)??EMPTY;},
  getProduct(product:string){return byProduct.get(canonical(product))??EMPTY;},
  listReissuedProducts(){return Object.freeze([...byProduct.values()]
    .filter(rows=>rows.length>1)
    .map(rows=>Object.freeze({productName:rows[0].productName,appearances:rows}))); }
});
