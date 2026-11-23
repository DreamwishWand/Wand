/** UI-safe DB-01 owner-local exact-name projection.
 * Copies allowlisted fields only. Historical correlated names require
 * explicit opt-in and never impersonate current 1.26.2 source labels.
 */
import {DB01_PRIVATE_RELEASE} from './private-db01-release.ts';
import type {Db01PrivateNamesResult} from './private-db01-names-worker-core.ts';

const LOCALES=new Set([
  'en','fr','it','de','es-ES','ja','zh-CN','pt-BR',
]);
const APPROVED=new Set(['ActivityItem','Furniture','Clothing','Trimming']);
const fail=(code:string):never=>{
  throw new TypeError('DB01_PRIVATE_VIEW_'+code);
};
function object(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function validateNames(value:unknown):Readonly<Record<string,string>>{
  if(!object(value))fail('UNVERIFIED_ITEM');
  const names:Record<string,string>={};
  for(const [locale,name] of Object.entries(value)){
    if(!LOCALES.has(locale)||typeof name!=='string'||
      !name.trim()||name.length>500)fail('UNVERIFIED_NAME');
    names[locale]=name;
  }
  return Object.freeze(names);
}
export interface Db01PrivatePreviewItem {
  readonly itemId:number;
  readonly [key:string]:unknown;
}
export interface Db01PrivatePreview {
  readonly privateOnly:true;
  readonly publishable:false;
  readonly items:readonly Db01PrivatePreviewItem[];
  readonly [key:string]:unknown;
}

/** Validate source and exact index order before the UI receives any names.
 * Reject any saved payload, foreign worker status or altered source digest.
 */
export function attachDb01PrivateNames<
  T extends Db01PrivatePreview
>(
  preview:T,
  result:unknown,
  locale:string='ja',
  {allowHistorical=false}:{allowHistorical?:boolean}={},
){
  if(!LOCALES.has(locale))fail('UNSUPPORTED_LOCALE');
  if(typeof allowHistorical!=='boolean')fail('INVALID_HISTORICAL_CHOICE');
  if(!preview||!Array.isArray(preview.items)||
    preview.privateOnly!==true||preview.publishable!==false||
    !object(result)||
    result.kind!=='db01-private-exact-names'||
    !object(result.target)||result.target.platform!=='Steam'||
    result.target.gameVersion!==DB01_PRIVATE_RELEASE.gameVersion||
    result.sourceManifestSha256!==DB01_PRIVATE_RELEASE.manifestSha256||
    result.sourceCoverageComplete!==false||
    result.saveVersionParityVerified!==false||
    typeof result.historicalCandidatesImported!=='boolean'||
    result.historicalCandidatesAreCurrentVerified!==false||
    result.historicalCandidateEvidence!==
      'historical_prefix_crc_correlated_unverified_current'||
    result.historicalBaselineVersion!==
      (result.historicalCandidatesImported?'1.26.1':null)||
    result.publicationAuthorized!==false||
    !Array.isArray(result.items)||
    result.items.length!==preview.items.length)
    fail('UNVERIFIED_RELEASE');
  const source=result as unknown as Db01PrivateNamesResult;
  const mapped=new Map<number,Readonly<{
    nativeCategory:string|null;
    exact:Readonly<Record<string,string>>;
    historical:Readonly<Record<string,string>>;
  }>>();
  for(let i=0;i<source.items.length;i++){
    const row=source.items[i];
    if(!Number.isSafeInteger(row?.itemId)||
      row.itemId!==preview.items[i].itemId||
      (row.nativeCategory!==null&&!APPROVED.has(row.nativeCategory)))
      fail('UNVERIFIED_ITEM');
    const exact=validateNames(row.exactNames);
    const historical=validateNames(row.historicalNames);
    if(!source.historicalCandidatesImported&&Object.keys(historical).length)
      fail('UNVERIFIED_HISTORY');
    if(Object.keys(historical).some(l=>exact[l]))
      fail('CONFLICTING_NAME_EVIDENCE');
    mapped.set(row.itemId,{nativeCategory:row.nativeCategory,exact,historical});
  }
  const items=preview.items.map(item=>{
    const match=mapped.get(item.itemId);
    const exact=match?.exact[locale]??match?.exact.en??null;
    const exactLocale=match?.exact[locale]?locale:
      match?.exact.en?'en':null;
    const history=allowHistorical&&!exact?
      match?.historical[locale]??match?.historical.en??null:null;
    const historyLocale=history?
      (match?.historical[locale]?locale:'en'):null;
    return Object.freeze({
      ...item,currentExactName:exact,currentExactNameLocale:exactLocale,
      privateHistoricalCandidate:history,
      privateHistoricalCandidateLocale:historyLocale,
      privateHistoricalCandidateUnverifiedCurrent:history!==null,
      currentExactSourceVersion:exact?'Steam v1.26.2':null,
      saveVersionParityVerified:false as const,
      verifiedNativeCategory:match?.nativeCategory??null,
    });
  });
  return Object.freeze({
    ...preview,items:Object.freeze(items),
    exactSourceNameCount:items.filter(i=>i.currentExactName!==null).length,
    historicalCandidateCount:items.filter(i=>i.privateHistoricalCandidate!==null).length,
    currentExactNamesLoaded:true as const,
    privateHistoryOptIn:allowHistorical,
    namesSource:'Steam v1.26.2 private DB-01',
    savedShopOwnershipVerified:false as const,
    publicationAuthorized:false as const,
  });
}
