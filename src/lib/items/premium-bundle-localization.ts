import type {ItemMasterLocale,PremiumBundleDefinition,PremiumBundleRevision} from './public-item-master.ts';
import {getVerifiedShopTitle} from '../acquisition/shop-localized-titles.ts';

export interface PremiumBundleRevisionText {
  readonly title:string|null;
  readonly description:string|null;
  /** Display fallback is the canonical component name, not a bundle title. */
  readonly displayTitle:string|null;
  readonly displayTitleSource:'bundle_title'|'single_component_item'|null;
  /** Same order as the source revision components. Missing/ambiguous text is null. */
  readonly componentDescriptions:readonly (string|null)[];
}
export interface PremiumBundleLocalizedText {
  readonly bundleId:string;
  readonly locale:ItemMasterLocale;
  readonly current:Readonly<PremiumBundleRevisionText>|null;
  readonly legacy:Readonly<PremiumBundleRevisionText>|null;
}
const localeCode=(locale:ItemMasterLocale)=>locale==='en'?'en-US':locale==='es-ES'?'es':locale;
const present=(x:unknown):string|null=>typeof x==='string'&&x.trim().length>0?x:null;
// Native Unity line-wrap hints are not literal user-facing text.
function displayText(x:unknown):string|null{
  const raw=present(x);
  if(!raw)return null;
  const value=raw.replace(/<\/?nobr>/g,'').replace(/[\u200b\u00ad]/g,'');
  return /^(?:\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}|Lorem ipsum\b)/i.test(value.trim())?null:present(value);
}
export function singleComponentNameId(r:PremiumBundleRevision|null):number|null{
  return r&&r.components.length===1&&!present(r.title)&&!present(r.titleKey)?r.components[0].itemId:null;
}
export function resolvePremiumBundleText(b:Readonly<PremiumBundleDefinition>,locale:ItemMasterLocale,itemNames:ReadonlyMap<number,string>=new Map(),componentTexts:ReadonlyMap<string,Readonly<Partial<Record<ItemMasterLocale,string>>>>=new Map()):Readonly<PremiumBundleLocalizedText>{
  function resolve(r:PremiumBundleRevision|null,current:boolean):Readonly<PremiumBundleRevisionText>|null{
    if(!r)return null;
    const nativeLocale=current&&(r.language===locale||r.language===localeCode(locale));
    const nativeTitle=present(r.title);
    const verifiedTitle=current&&r.language==='en-US'&&nativeTitle?
      getVerifiedShopTitle(b.bundleId,nativeTitle,locale):null;
    const title=displayText(r.localizedText?.[locale]?.title)??(nativeLocale?displayText(nativeTitle):null)??displayText(verifiedTitle);
    const itemId=singleComponentNameId(r);
    const itemName=itemId===null?null:displayText(itemNames.get(itemId));
    return Object.freeze({
      title,
      description:displayText(r.localizedText?.[locale]?.description)??(nativeLocale?displayText(r.description):null),
      componentDescriptions:Object.freeze(r.components.map(c=>{
        const raw=present(c.description);
        if(!raw||!current)return null;
        return displayText(r.language==='en-US'?componentTexts.get(raw)?.[locale]:null)??(nativeLocale?displayText(raw):null);
      })),
      displayTitle:title??itemName,
      displayTitleSource:title?'bundle_title' as const:itemName?'single_component_item' as const:null
    });
  }
  return Object.freeze({bundleId:b.bundleId,locale,current:resolve(b.current,true),legacy:resolve(b.legacy,false)});
}
