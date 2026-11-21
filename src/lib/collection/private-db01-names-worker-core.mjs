/** Private DB-01 Steam v1.26.2 exact-name overlay.
 * Independent pins come from owner-private DB-01 release audit, not the ZIP.
 * Never uses historical correlated labels or unclassified definitions as items.
 */
import { createDb01CatalogClient } from '../items/index.ts';
import { openPrivateDb01Zip } from './private-db01-zip.mjs';
import { DB01_PRIVATE_RELEASE } from './private-db01-release.mjs';

const fail = code => {throw new TypeError('DB01_PRIVATE_NAMES_'+code);};
const validId = id => Number.isSafeInteger(id)&&id>0&&id<=2147483647;
const locales = ['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'];
const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');

export async function inspectPrivateDb01Names(zipBytes,itemIds, trusted=DB01_PRIVATE_RELEASE) {
  if(!(zipBytes instanceof Uint8Array)||!Array.isArray(itemIds)||itemIds.length>16384 ||
     itemIds.some((id,i)=>!validId(id)||(i>0&&itemIds[i-1]>=id)))fail('INVALID_ITEM_IDS');
  if(trusted?.platform!=='Steam'||trusted.gameVersion!=='1.26.2'||
     !/^[0-9a-f]{64}$/.test(trusted.manifestSha256??''))fail('RELEASE_PIN_REQUIRED');
  const zip=openPrivateDb01Zip(zipBytes);
  const manifestBytes=await zip.readShard('private-shards/manifest.json');
  const digest=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',manifestBytes)));
  if(digest!==trusted.manifestSha256)fail('MANIFEST_PIN_MISMATCH');
  let manifest;
  try {manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifestBytes));}
  catch {fail('MANIFEST_INVALID');}
  if(manifest.platform!==trusted.platform||manifest.gameVersion!==trusted.gameVersion||
     manifest.nativeSourceManifestSha256!==trusted.nativeSourceManifestSha256||
     manifest.sourceItemsSha256!==trusted.sourceItemsSha256||
     manifest.publicationAuthorized!==false||manifest.privateOnly!==true)
    fail('SOURCE_PROVENANCE_MISMATCH');
  const client=createDb01CatalogClient(manifest,async path=>zip.readShard('private-shards/'+path));
  const rows=new Array(itemIds.length);
  let next=0;
  async function worker(){
    while(next<itemIds.length){
      const i=next++,id=itemIds[i];
      const found=await client.getItem(id);
      if(found && found.catalogDomain==='item'){
        const names={};
        for(const locale of locales){
          if(typeof found.names[locale]==='string')names[locale]=found.names[locale];
        }
        // Previous-version names are never current labels. Only DB-01's own
        // explicit allowHistorical return path can provide them.
        const historicalNames={};
        if(manifest.historicalCandidatesIncluded){
          for(const locale of locales){
            if(names[locale])continue;
            const candidate=await client.getName(id,locale,{allowHistorical:true});
            if(candidate?.evidence==='historical_prefix_crc_correlated_unverified_current'){
              if(candidate.baselineVersion!=='1.26.1')fail('HISTORICAL_BASELINE_MISMATCH');
              historicalNames[locale]=candidate.value;
            }
          }
        }
        rows[i]=Object.freeze({itemId:id,nativeCategory:found.nativeCategory,
          exactNames:Object.freeze(names),historicalNames:Object.freeze(historicalNames)});
      } else rows[i]=Object.freeze({itemId:id,nativeCategory:null,
        exactNames:Object.freeze({}),historicalNames:Object.freeze({})});
    }
  }
  await Promise.all(Array.from({length:Math.min(6,itemIds.length)},worker));
  return Object.freeze({
    kind:'db01-private-exact-names',
    target:Object.freeze({platform:'Steam',gameVersion:'1.26.2'}),
    sourceManifestSha256:trusted.manifestSha256,
    sourceCoverageComplete:false,
    saveVersionParityVerified:false,
    historicalCandidatesImported:manifest.historicalCandidatesIncluded,
    historicalCandidateEvidence:'historical_prefix_crc_correlated_unverified_current',
    historicalBaselineVersion:manifest.historicalCandidatesIncluded?'1.26.1':null,
    historicalCandidatesAreCurrentVerified:false,
    publicationAuthorized:false,
    items:Object.freeze(rows)
  });
}