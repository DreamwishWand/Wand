import type {ItemMasterLocale,PremiumBundleDefinition,PremiumBundleRevision} from './public-item-master.ts';
import {getVerifiedShopTitle} from '../acquisition/shop-localized-titles.ts';

export interface PremiumBundleRevisionText {
  readonly title:string|null;
  readonly description:string|null;
}
export interface PremiumBundleLocalizedText {
  readonly bundleId:string;
  readonly locale:ItemMasterLocale;
  readonly current:Readonly<PremiumBundleRevisionText>|null;
  readonly legacy:Readonly<PremiumBundleRevisionText>|null;
}
const localeCode=(locale:ItemMasterLocale)=>locale==='en'?'en-US':locale==='es-ES'?'es':locale;
const present=(x:unknown):string|null=>typeof x==='string'&&x.trim().length>0?x:null;
export function resolvePremiumBundleText(b:Readonly<PremiumBundleDefinition>,locale:ItemMasterLocale):Readonly<PremiumBundleLocalizedText>{
  function resolve(r:PremiumBundleRevision|null,current:boolean):Readonly<PremiumBundleRevisionText>|null{
    if(!r)return null;
    const nativeLocale=current&&(r.language===locale||r.language===localeCode(locale));
    const nativeTitle=present(r.title);
    const verifiedTitle=current&&r.language==='en-US'&&nativeTitle?
      getVerifiedShopTitle(b.bundleId,nativeTitle,locale):null;
    return Object.freeze({
      title:present(r.localizedText?.[locale]?.title)??(nativeLocale?nativeTitle:null)??verifiedTitle,
      description:present(r.localizedText?.[locale]?.description)??(nativeLocale?present(r.description):null)
    });
  }
  return Object.freeze({bundleId:b.bundleId,locale,current:resolve(b.current,true),legacy:resolve(b.legacy,false)});
}
