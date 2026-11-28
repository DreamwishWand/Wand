import {isWandLanguage,type WandLanguage} from '../ui/preferences.ts';
/** MEDIA.md: native primary ID is the identity; language and optional slug
 * are presentation. No unverified specialization or service-specific URL. */
export function itemEntityHref(base:string,locale:WandLanguage,itemId:number):string{
  if((base!==''&&!/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(base))||!isWandLanguage(locale)||!Number.isSafeInteger(itemId)||itemId<=0)
    throw TypeError('INVALID_ITEM_ENTITY_LINK');
  return base+'/'+locale+'/'+itemId+'/';
}
/** Enable with the shared Item Page/resolver deployment, not with a legacy
 * Collection inspector or a generated placeholder route. */
export const ITEM_ENTITY_PAGE_AVAILABLE:boolean=false;
