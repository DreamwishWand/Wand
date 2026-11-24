import type {ExploreItem} from './model';
import type {ReleaseGroup} from './series';
import {loadPinnedPublicNativeShopSnapshot,loadPinnedHistoricalNativeShopSnapshot} from '../acquisition/public-native-shop';
import {loadPublicStarpath} from '../guide/public-starpath';
interface Request {base:string}
self.onmessage=async(event:MessageEvent<Request>)=>{
  try{
    const base=event.data.base;
    const read=async(path:string)=>{
      const response=await fetch(base+'/'+path,{credentials:'same-origin'});
      if(!response.ok||response.redirected)throw Error('CATALOG_UNAVAILABLE');
      return response.json();
    };
    const versions=await read('ddv/item-master-releases.json');
    const version=versions.current;
    if(versions.schema!=='wand.item-master.versions@1'||typeof version!=='string'||!/^\d+\.\d+\.\d+$/.test(version))throw Error('INVALID_RELEASE');
    const release=versions.releases.find((v:{gameVersion:string})=>v.gameVersion===version);
    const complete=release?.complete;
    const data=await read('ddv/item-master/steam-'+version+(complete?'-complete':'')+'/explore.json');
    if(!release||data.schema!==(complete?'wand.explore.catalog@2':'wand.explore.catalog@1')||data.release!==(complete?.release??release.release)||!Array.isArray(data.items))throw Error('INVALID_CATALOG');
    const items:ExploreItem[]=data.items;
    if(items.some(i=>!Number.isSafeInteger(i.itemId)||i.itemId<=0||!i.names||!Array.isArray(i.universes)||!Array.isArray(i.tags)||!(i.nativeCategory==='Furniture'&&[0,1,2,3,7,8,9].includes(i.subtype)||i.nativeCategory==='Trimming'&&[0,1].includes(i.subtype)||i.nativeCategory==='Building'&&[0,1,2,3,4,5].includes(i.subtype)||i.nativeCategory==='Skin'&&[1,2,3,6].includes(i.subtype)||i.nativeCategory==='Environment')))throw Error('INVALID_ITEM');
    const [current,archive,starpath]=await Promise.allSettled([
      loadPinnedPublicNativeShopSnapshot(base),loadPinnedHistoricalNativeShopSnapshot(base),
      loadPublicStarpath(base+'/guide/public/starpath-cache-2026-11-22.json')
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
    self.postMessage({items,universeTags:data.universeTags??[],releases});
  }catch{self.postMessage({error:true});}
};
