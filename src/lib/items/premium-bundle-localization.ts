import type {ItemMasterLocale,PremiumBundleDefinition,PremiumBundleRevision} from './public-item-master.ts';
import {getVerifiedShopTitle} from '../acquisition/shop-localized-titles.ts';

export interface PremiumBundleRevisionText {
  readonly title:string|null;
  readonly description:string|null;
  /** Display fallback is the canonical component name, not a bundle title. */
  readonly displayTitle:string|null;
  readonly displayTitleSource:'bundle_title'|'single_component_item'|null;
}
export interface PremiumBundleLocalizedText {
  readonly bundleId:string;
  readonly locale:ItemMasterLocale;
  readonly current:Readonly<PremiumBundleRevisionText>|null;
  readonly legacy:Readonly<PremiumBundleRevisionText>|null;
}
const localeCode=(locale:ItemMasterLocale)=>locale==='en'?'en-US':locale==='es-ES'?'es':locale;
const present=(x:unknown):string|null=>typeof x==='string'&&x.trim().length>0?x:null;
export function singleComponentNameId(r:PremiumBundleRevision|null):number|null{
  return r&&r.components.length===1&&!present(r.title)&&!present(r.titleKey)?r.components[0].itemId:null;
}
export function resolvePremiumBundleText(b:Readonly<PremiumBundleDefinition>,locale:ItemMasterLocale,itemNames:ReadonlyMap<number,string>=new Map()):Readonly<PremiumBundleLocalizedText>{
  function resolve(r:PremiumBundleRevision|null,current:boolean):Readonly<PremiumBundleRevisionText>|null{
    if(!r)return null;
    const nativeLocale=current&&(r.language===locale||r.language===localeCode(locale));
    const nativeTitle=present(r.title);
    const verifiedTitle=current&&r.language==='en-US'&&nativeTitle?
      getVerifiedShopTitle(b.bundleId,nativeTitle,locale):null;
    const title=present(r.localizedText?.[locale]?.title)??(nativeLocale?nativeTitle:null)??verifiedTitle;
    const itemId=singleComponentNameId(r);
    const itemName=itemId===null?null:present(itemNames.get(itemId));
    return Object.freeze({
      title,
      description:present(r.localizedText?.[locale]?.description)??(nativeLocale?present(r.description):null),
      displayTitle:title??itemName,
      displayTitleSource:title?'bundle_title' as const:itemName?'single_component_item' as const:null
    });
  }
  return Object.freeze({bundleId:b.bundleId,locale,current:resolve(b.current,true),legacy:resolve(b.legacy,false)});
}
