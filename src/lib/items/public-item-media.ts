/** Read-only adapter to the existing SRC-04 public image resolver.
 * Native GUID identifies a source asset, not an encoded image SHA or URL.
 * Publication and exact ItemID-to-image mapping remain SRC-04 responsibilities.
 */
import type {PublicCompleteItemMaster} from './public-item-master.ts';
import {createItemMediaClient,ITEM_MEDIA_ACTIVATION,type ItemMediaActivation,type ItemImage} from '../media/item-media.ts';
import type {ImageVariant} from '../media/public-image-key.ts';

type ItemIdentityReader=Pick<PublicCompleteItemMaster,'release'|'getItemFields'>;
export type ItemMediaStatus='unpublished'|'version_mismatch'|'published';
export interface PublicItemMediaReader {
  readonly status:ItemMediaStatus;
  getItemImages(ids:readonly number[],variant?:ImageVariant):Promise<readonly (ItemImage|null)[]>;
  getItemImage(id:number,variant?:ImageVariant):Promise<ItemImage|null>;
}
const validId=(id:number)=>Number.isSafeInteger(id)&&id>0;
const GUID=/^[0-9a-f]{32}$/;
export function createPublicItemMediaReader(master:ItemIdentityReader,
  activation:ItemMediaActivation=ITEM_MEDIA_ACTIVATION,fetcher:typeof fetch=fetch):PublicItemMediaReader{
  const status:ItemMediaStatus=activation.state!=='published'?'unpublished':
    activation.gameVersion!=='steam-'+master.release.target.gameVersion?'version_mismatch':'published';
  // Use SRC-04's existing pinned manifest, validation, cache and URL rules.
  const media=status==='published'?createItemMediaClient(activation,fetcher):null;
  async function getItemImages(ids:readonly number[],variant:ImageVariant='thumbnail'){
    if(!Array.isArray(ids)||ids.length>4096||!ids.every(validId))throw new TypeError('DB01_MEDIA_INVALID_IDS');
    if(variant!=='thumbnail'&&variant!=='original')throw new TypeError('DB01_MEDIA_INVALID_VARIANT');
    if(!media)return Object.freeze(ids.map(()=>null));
    const records=await master.getItemFields(ids,['iconGuid']);
    const selected=new Set<number>();
    for(const record of records){
      if(record&&typeof record.values.iconGuid==='string'&&GUID.test(record.values.iconGuid))
        selected.add(record.itemId);
    }
    const known=[...selected],resolved=new Map<number,ItemImage|null>();
    for(let start=0;start<known.length;start+=8){
      await Promise.all(known.slice(start,start+8).map(async id=>{
        resolved.set(id,await media.getItemImage(id,variant));
      }));
    }
    return Object.freeze(ids.map(id=>resolved.get(id)??null));
  }
  return Object.freeze({status,getItemImages,
    async getItemImage(id:number,variant:ImageVariant='thumbnail'){
      return (await getItemImages([id],variant))[0]??null;
    }
  });
}
