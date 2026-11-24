import type {ExploreItem} from './model';
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
    const data=await read('ddv/item-master/steam-'+version+'/explore.json');
    if(!release||data.schema!=='wand.explore.catalog@1'||data.release!==release.release||!Array.isArray(data.items))throw Error('INVALID_CATALOG');
    const items:ExploreItem[]=data.items;
    if(items.some(i=>!Number.isSafeInteger(i.itemId)||i.itemId<=0||!i.names||!Array.isArray(i.universes)||!Array.isArray(i.tags)||!(i.nativeCategory==='Furniture'&&[0,1,2,3,7,8,9].includes(i.subtype)||i.nativeCategory==='Trimming'&&[0,1].includes(i.subtype))))throw Error('INVALID_ITEM');
    self.postMessage({items});
  }catch{self.postMessage({error:true});}
};
