/** UI-side allowlist: current exact names and opt-in historical candidates NEVER merge. */
import { DB01_PRIVATE_RELEASE } from './private-db01-release.mjs';
const LOCALES=new Set(['en','fr','it','de','es-ES','ja','zh-CN','pt-BR']);
const fail=code=>{throw new TypeError('DB01_PRIVATE_VIEW_'+code);};
const approvedFamily=new Set(['ActivityItem','Furniture','Clothing','Trimming']);
function validateNames(value){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('UNVERIFIED_ITEM');
  const names={};
  for(const [locale,name] of Object.entries(value)){
    if(!LOCALES.has(locale)||typeof name!=='string'||!name.trim()||name.length>500)
      fail('UNVERIFIED_NAME');
    names[locale]=name;
  }
  return Object.freeze(names);
}

/** A historical Steam 1.26.1 candidate is only presented with explicit opt-in. */
export function attachDb01PrivateNames(preview, result, locale='ja', {allowHistorical=false}={}) {
  if(!LOCALES.has(locale))fail('UNSUPPORTED_LOCALE');
  if(typeof allowHistorical!=='boolean')fail('INVALID_HISTORICAL_CHOICE');
  if(!preview||!Array.isArray(preview.items)||preview.privateOnly!==true||preview.publishable!==false||
     result?.kind!=='db01-private-exact-names'||result?.target?.platform!=='Steam'||
     result.target.gameVersion!==DB01_PRIVATE_RELEASE.gameVersion||
     result.sourceManifestSha256!==DB01_PRIVATE_RELEASE.manifestSha256||
     result.sourceCoverageComplete!==false||result.saveVersionParityVerified!==false||
     typeof result.historicalCandidatesImported!=='boolean'||
     result.historicalCandidatesAreCurrentVerified!==false||
     result.historicalCandidateEvidence!=='historical_prefix_crc_correlated_unverified_current'||
     result.historicalBaselineVersion!==(result.historicalCandidatesImported?'1.26.1':null)||
     result.publicationAuthorized!==false||
     !Array.isArray(result.items)||result.items.length!==preview.items.length)
    fail('UNVERIFIED_RELEASE');
  const mapped=new Map();
  for(let i=0;i<result.items.length;i++){
    const row=result.items[i];
    if(!Number.isSafeInteger(row?.itemId)||row.itemId!==preview.items[i].itemId||
       (row.nativeCategory!==null&&!approvedFamily.has(row.nativeCategory)))fail('UNVERIFIED_ITEM');
    const exact=validateNames(row.exactNames);
    const historical=validateNames(row.historicalNames);
    if(!result.historicalCandidatesImported&&Object.keys(historical).length)fail('UNVERIFIED_HISTORY');
    if(Object.keys(historical).some(l=>exact[l]))fail('CONFLICTING_NAME_EVIDENCE');
    mapped.set(row.itemId,{nativeCategory:row.nativeCategory,exact,historical});
  }
  const items=preview.items.map(item=>{
    const match=mapped.get(item.itemId);
    const exact=match?.exact[locale]??match?.exact.en??null;
    const exactLocale=match?.exact[locale]?locale:match?.exact.en?'en':null;
    const history=allowHistorical&&!exact?
      match?.historical[locale]??match?.historical.en??null : null;
    const historyLocale=history?(match?.historical[locale]?locale:'en'):null;
    return Object.freeze({...item,
      currentExactName:exact,currentExactNameLocale:exactLocale,
      privateHistoricalCandidate:history,privateHistoricalCandidateLocale:historyLocale,
      privateHistoricalCandidateUnverifiedCurrent:history!==null,
      currentExactSourceVersion:exact?'Steam v1.26.2':null,
      saveVersionParityVerified:false,
      verifiedNativeCategory:match?.nativeCategory??null});
  });
  return Object.freeze({...preview,items:Object.freeze(items),
    exactSourceNameCount:items.filter(i=>i.currentExactName!==null).length,
    historicalCandidateCount:items.filter(i=>i.privateHistoricalCandidate!==null).length,
    currentExactNamesLoaded:true,privateHistoryOptIn:allowHistorical,
    namesSource:'Steam v1.26.2 private DB-01',
    savedShopOwnershipVerified:false,publicationAuthorized:false});
}