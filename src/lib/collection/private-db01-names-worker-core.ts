/** Private DB-01 Steam v1.26.2 exact-name resolver, running off-thread.
 * Source hashes are independently pinned; ZIP entry hashes are checked by
 * the canonical DB-01 TS catalog. Historical names never become current.
 * Read-only, no upload, no client Save mutation, no original source publish.
 */
import {
  createDb01CatalogClient,DB01_LOCALES,
  type Db01Locale,type Db01ShardManifest,
} from '../items/index.ts';
import {openPrivateDb01Zip} from './private-db01-zip.ts';
import {
  DB01_PRIVATE_RELEASE,type Db01PrivateReleasePin,
} from './private-db01-release.ts';

const fail=(code:string):never=>{
  throw new TypeError('DB01_PRIVATE_NAMES_'+code);
};
const validId=(id:unknown):id is number=>
  typeof id==='number'&&Number.isSafeInteger(id)&&id>0&&id<=2147483647;
const hex=(bytes:Uint8Array):string=>
  Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');

export interface Db01PrivateNameRow{
  readonly itemId:number;
  readonly nativeCategory:string|null;
  readonly exactNames:Readonly<Partial<Record<Db01Locale,string>>>;
  readonly historicalNames:Readonly<Partial<Record<Db01Locale,string>>>;
}
export interface Db01PrivateNamesResult{
  readonly kind:'db01-private-exact-names';
  readonly target:Readonly<{platform:'Steam';gameVersion:'1.26.2'}>;
  readonly sourceManifestSha256:string;
  readonly sourceCoverageComplete:false;
  readonly saveVersionParityVerified:false;
  readonly historicalCandidatesImported:boolean;
  readonly historicalCandidateEvidence:
    'historical_prefix_crc_correlated_unverified_current';
  readonly historicalBaselineVersion:'1.26.1'|null;
  readonly historicalCandidatesAreCurrentVerified:false;
  readonly publicationAuthorized:false;
  readonly items:readonly Readonly<Db01PrivateNameRow>[];
}

/** Caller supplies owner-selected ZIP bytes; trusted SHA comes from the
 * independently audited module, not an untrusted ZIP entry or UI request.
 */
export async function inspectPrivateDb01Names(
  zipBytes:Uint8Array,
  itemIds:readonly number[],
  trusted:Db01PrivateReleasePin=DB01_PRIVATE_RELEASE,
):Promise<Readonly<Db01PrivateNamesResult>>{
  if(!(zipBytes instanceof Uint8Array)||!Array.isArray(itemIds)||
    itemIds.length>16384||
    itemIds.some((id,i)=>!validId(id)||(i>0&&itemIds[i-1]>=id)))
    fail('INVALID_ITEM_IDS');
  if(trusted?.platform!=='Steam'||trusted.gameVersion!=='1.26.2'||
    !/^[0-9a-f]{64}$/.test(trusted.manifestSha256??''))
    fail('RELEASE_PIN_REQUIRED');

  const zip=openPrivateDb01Zip(zipBytes);
  const manifestBytes=await zip.readShard('private-shards/manifest.json');
  const digest=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',manifestBytes)));
  if(digest!==trusted.manifestSha256)fail('MANIFEST_PIN_MISMATCH');
  const manifest:Db01ShardManifest=(()=>{
    try{
      return JSON.parse(new TextDecoder('utf-8',{fatal:true})
        .decode(manifestBytes)) as Db01ShardManifest;
    }catch{
      throw new TypeError('DB01_PRIVATE_NAMES_MANIFEST_INVALID');
    }
  })();
  if(manifest.platform!==trusted.platform||
    manifest.gameVersion!==trusted.gameVersion||
    manifest.nativeSourceManifestSha256!==trusted.nativeSourceManifestSha256||
    manifest.sourceItemsSha256!==trusted.sourceItemsSha256||
    manifest.publicationAuthorized!==false||manifest.privateOnly!==true)
    fail('SOURCE_PROVENANCE_MISMATCH');

  const client=createDb01CatalogClient(
    manifest,async path=>zip.readShard('private-shards/'+path));
  const rows:Readonly<Db01PrivateNameRow>[]=
    new Array<Readonly<Db01PrivateNameRow>>(itemIds.length);
  let next=0;
  async function process():Promise<void>{
    while(next<itemIds.length){
      const i=next++;
      const id=itemIds[i];
      const found=await client.getItem(id);
      if(found&&found.catalogDomain==='item'){
        const names:Partial<Record<Db01Locale,string>>={};
        for(const locale of DB01_LOCALES){
          if(typeof found.names[locale]==='string')
            names[locale]=found.names[locale];
        }
        const historicalNames:Partial<Record<Db01Locale,string>>={};
        if(manifest.historicalCandidatesIncluded){
          for(const locale of DB01_LOCALES){
            if(names[locale])continue;
            const candidate=await client.getName(id,locale,{allowHistorical:true});
            if(candidate?.evidence===
              'historical_prefix_crc_correlated_unverified_current'){
              if(candidate.baselineVersion!=='1.26.1')
                fail('HISTORICAL_BASELINE_MISMATCH');
              historicalNames[locale]=candidate.value;
            }
          }
        }
        rows[i]=Object.freeze({
          itemId:id,nativeCategory:found.nativeCategory,
          exactNames:Object.freeze(names),
          historicalNames:Object.freeze(historicalNames),
        });
      }else{
        rows[i]=Object.freeze({
          itemId:id,nativeCategory:null,
          exactNames:Object.freeze({}),historicalNames:Object.freeze({}),
        });
      }
    }
  }
  // Bounded concurrency: the SHA-pinned catalog deduplicates ID-bucket reads.
  await Promise.all(Array.from({length:Math.min(6,itemIds.length)},()=>process()));
  return Object.freeze({
    kind:'db01-private-exact-names' as const,
    target:Object.freeze({platform:'Steam' as const,gameVersion:'1.26.2' as const}),
    sourceManifestSha256:trusted.manifestSha256,
    sourceCoverageComplete:false as const,
    saveVersionParityVerified:false as const,
    historicalCandidatesImported:manifest.historicalCandidatesIncluded,
    historicalCandidateEvidence:
      'historical_prefix_crc_correlated_unverified_current' as const,
    historicalBaselineVersion:manifest.historicalCandidatesIncluded?
      '1.26.1' as const:null,
    historicalCandidatesAreCurrentVerified:false as const,
    publicationAuthorized:false as const,
    items:Object.freeze(rows),
  });
}
