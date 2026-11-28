import type {ExploreItem} from './model';
import type {ReleaseGroup} from './series';
import {openCurrentItemDatabase,type ItemMasterTagLabel} from '../items/public-item-master';
import {loadPinnedPublicNativeShopSnapshot,loadPinnedHistoricalNativeShopSnapshot} from '../acquisition/public-native-shop';
import {loadPublicStarpath} from '../guide/public-starpath';
interface Request {base:string}
self.onmessage=async(event:MessageEvent<Request>)=>{
  try{
    const base=event.data.base;
    const db=await openCurrentItemDatabase(base);
    const data=await db.getDecorationBrowse();
    const items=data.items as readonly ExploreItem[];
    if(items.some(i=>!Number.isSafeInteger(i.itemId)||i.itemId<=0||!i.names||!Array.isArray(i.universes)||!Array.isArray(i.tags)||!(i.nativeCategory==='Furniture'&&[0,1,2,3,7,8,9].includes(i.subtype)||i.nativeCategory==='Trimming'&&[0,1].includes(i.subtype)||i.nativeCategory==='Building'&&[0,1,2,3,4,5].includes(i.subtype)||i.nativeCategory==='Skin'&&[1,2,3,6].includes(i.subtype)||i.nativeCategory==='Environment')))throw Error('INVALID_ITEM');
    const [current,archive,starpath,facetResult]=await Promise.allSettled([
      loadPinnedPublicNativeShopSnapshot(base),loadPinnedHistoricalNativeShopSnapshot(base),
      loadPublicStarpath(base+'/guide/public/starpath-cache-2026-11-22.json'),
      db.getCollectionFacets()
    ]);
    const releases:ReleaseGroup[]=[];
    const offers=new Map<string,ReleaseGroup>();
    for(const result of [current,archive])if(result.status==='fulfilled')for(const offer of result.value.offers){
      const ids=[...new Set(offer.components.map(c=>Number(c.itemId)))].sort((a,b)=>a-b);
      if(ids.length<2||!offer.title)continue;
      const key='shop:'+offer.nativeOfferId+':'+ids.join(',');
      offers.set(key,{key,label:offer.title,kind:'shop',ids});
    }
    releases.push(...offers.values());
    if(starpath.status==='fulfilled')for(const season of starpath.value.seasons){
      const ids=[...new Set([...season.rewardPages,...season.bonusPages].flatMap(p=>p.rewards.map(r=>Number(r.itemId))))];
      releases.push({key:'season:'+season.id,label:season.title,kind:'season',ids});
    }
    let worldTags:readonly ItemMasterTagLabel[]=[];
    let enriched=items;
    if(facetResult.status==='fulfilled'&&facetResult.value){
      const facets=facetResult.value;
      worldTags=facets.worldTags;
      const keys=new Map(worldTags.map(row=>[row.tagId,row.key]));
      const worlds=new Map(facets.worldSourceTagItems.map(([id,tags])=>[id,tags.flatMap(tag=>{const key=keys.get(tag);return key?[key]:[];})]));
      enriched=items.map(i=>({...i,worlds:worlds.get(i.itemId)??[]}));
    }
    self.postMessage({items:enriched,universeTags:data.universeTags??[],worldTags,releases});
  }catch{self.postMessage({error:true});}
};
