/**
 * Build-only unpacker for the sanitized public DB-01 master archive.
 * Runs before Vite dev/build. Publishes all version-listed releases, preserving
 * older snapshots; no original game file, credentials or player saves ship.
 */
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,renameSync,rmSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {materializeExpandedMaster} from './materialize-expanded-master.mjs';
import {materializeCompleteSourceMaster} from './materialize-complete-source-master.mjs';
import {publishCurrentProjections} from './publish-current-projections.mjs';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const targetRoot=join(project,'static/ddv/item-master');
const catalog=JSON.parse(readFileSync(join(project,'static/ddv/item-master-releases.json'),'utf8'));
const hex=b=>createHash('sha256').update(b).digest('hex');
function check(ok,code){if(!ok)throw Error('DB01_PUBLIC_MASTER_'+code)}
const VERSION=/^[0-9]+\.[0-9]+\.[0-9]+$/;
const SHA=/^[0-9a-f]{64}$/;
check(catalog.schema==='wand.item-master.versions@1' &&
  typeof catalog.current==='string' &&
  VERSION.test(catalog.current) &&
  Array.isArray(catalog.releases)&&catalog.releases.length>0,
  'INVALID_VERSION_CATALOG');
const seenVersions=new Set();
for(const entry of catalog.releases){
  check(entry && typeof entry==='object' &&
    typeof entry.gameVersion==='string' && VERSION.test(entry.gameVersion) &&
    !seenVersions.has(entry.gameVersion) &&
    typeof entry.release==='string' &&
    entry.release.startsWith('steam-'+entry.gameVersion+'-item-id-master-v') &&
    Number.isSafeInteger(entry.count) && entry.count>0 && entry.count<=1000000 &&
    typeof entry.archiveSha256==='string' && SHA.test(entry.archiveSha256),
    'INVALID_RELEASE_ENTRY');
  seenVersions.add(entry.gameVersion);
}
check(seenVersions.has(catalog.current),'CURRENT_VERSION_UNPUBLISHED');
for(const entry of catalog.releases){
const gameVersion=entry.gameVersion;
const destination=join(targetRoot,'steam-'+gameVersion);
const archive=join(project,'data/ddv/item-master','steam-'+gameVersion+'.zip');
const RELEASE_SHA=entry.archiveSha256;
const bytes=readFileSync(archive);
check(hex(bytes)===RELEASE_SHA,'ARCHIVE_SHA_MISMATCH');
const u16=n=>bytes.readUInt16LE(n),u32=n=>bytes.readUInt32LE(n);
let eocd=-1;
for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
  if(u32(i)===0x06054b50){eocd=i;break}
}
check(eocd>=0,'ZIP_DIRECTORY_MISSING');
const count=u16(eocd+10),offset=u32(eocd+16);
check(count===257,'ZIP_ENTRY_COUNT');
const files=new Map();
let pos=offset;
for(let i=0;i<count;i++){
  check(pos+46<=bytes.length&&u32(pos)===0x02014b50,'ZIP_ENTRY');
  const method=u16(pos+10),packed=u32(pos+20),size=u32(pos+24);
  const nameLength=u16(pos+28),extra=u16(pos+30),comment=u16(pos+32);
  const local=u32(pos+42),name=bytes.subarray(pos+46,pos+46+nameLength).toString('utf8');
  check(name==='index.json'||/^id\/[0-9a-f]{2}\.json$/.test(name),'UNEXPECTED_PATH');
  check(!files.has(name)&&size>0&&size<1000000&&packed>0,'ZIP_DUPLICATE_OR_SIZE');
  check(local+30<=bytes.length&&u32(local)===0x04034b50,'ZIP_LOCAL_HEADER');
  const start=local+30+u16(local+26)+u16(local+28);
  check(start+packed<=bytes.length,'ZIP_COMPRESSED_RANGE');
  const compressed=bytes.subarray(start,start+packed);
  check(method===8||method===0,'ZIP_COMPRESSION');
  const raw=method===8?inflateRawSync(compressed):compressed;
  check(raw.length===size,'ZIP_UNPACK_SIZE');
  files.set(name,raw);
  pos+=46+nameLength+extra+comment;
}
const release=JSON.parse(files.get('index.json').toString('utf8'));
check(release.schema==='wand.item-master.release@1'&&
  release.version===entry.release&&
  release.target.platform==='Steam'&&
  release.target.gameVersion===gameVersion&&
  release.count===entry.count&&release.bucketCount===256&&
  Object.keys(release.shards).length===256,'RELEASE_SCHEMA');
// A minimal Collection-only projection: Item ID + browseable source Tags.
 // No names, GUIDs, raw source definitions, CollectionSet predicates, or
 // player data are copied. Source Tag associations are NOT verified visible
 // Collection/world memberships.
const COLLECTION_FACETS=new Set([
  'color','furnitureStyle','clothingStyle','furnitureKind',
  'clothingSlot','disneyUniverse','worldContextTag','ingredientKind','mealKind'
]);
const collectionRows=[];
const exploreRows=[];
const collectionCategoryRows=[];
// Narrow per-ID original ActivityItemType projection. The public Item master
// already contains each verified IL2CPP subtype; do not guess from display
// names or expand the game's Collection menu.
const activityTypeRows=[];
// Exact native IL2CPP subtype per published Item ID, not invented Collection
// menu membership. This includes Furniture, Clothing and Trimming records
// previously obscured by the 29 empty scaffold categories.
const nativeSubtypeRows=[];
// Exact Item-ID universe references from original Tags AND already-verified
// Collection selector candidates. This is an extra browse relation, never
// runtime Collection membership, world location or entitlement.
const universeSourceRows=[];
const universeSourceTagRows=[];
// Exact Steam 1.26.2 original CollectionSubMenu enum codes. Original source
// predicates are browse *candidates*, not proven game runtime membership.
const ORIGINAL_SUBMENU_CODES=new Set([
  0,1,2,3,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20
]);
function originalCategoryCodes(row){
  const codes=new Set();
  for(const candidate of row.collectionSourceCandidates){
    if(Number.isInteger(candidate.submenuCode)&&
      ORIGINAL_SUBMENU_CODES.has(candidate.submenuCode))
      codes.add(candidate.submenuCode);
  }
  // Source ItemType/ActivityItemType is separately verified for these
  // original records. This is reference browsing, NOT native CollectionSet
  // membership; do not use it as a completed-Collection denominator.
  if(row.nativeCategory==='Furniture'||
     row.nativeCategory==='WallpaperAndFlooring')codes.add(3);
  if(row.nativeCategory==='Clothing')codes.add(4);
  if(row.nativeCategory==='ActivityItem'){
    const code=row.itemType?.subtypeCode;
    const mapped=new Map([
      [2,0],[4,0],[11,0],  // crop, seed, ingredient
      [10,1],[3,2],[8,8],[16,9],[17,10],
    ]).get(code);
    if(mapped!==undefined)codes.add(mapped);
  }
  return [...codes].sort((a,b)=>a-b);
}
let found=0,tagRefs=0,candidates=0;
const seen=new Set();
for(let bucket=0;bucket<256;bucket++){
  const key=bucket.toString(16).padStart(2,'0'),path='id/'+key+'.json';
  const file=files.get(path),meta=release.shards[path];
  check(file&&meta&&file.length===meta.bytes&&hex(file)===meta.sha256,'SHARD_SHA_'+key);
  const obj=JSON.parse(file.toString('utf8'));
  check(obj.schema==='wand.item-master.shard@1'&&obj.bucket===key&&
    Array.isArray(obj.items)&&obj.items.length===meta.count,'SHARD_FORMAT_'+key);
  for(const row of obj.items){
    check(Number.isSafeInteger(row.itemId)&&row.itemId>0&&
      (row.itemId&255)===bucket&&!seen.has(row.itemId)&&
      typeof row.iconGuid==='string'&&/^[0-9a-f]{32}$/.test(row.iconGuid)&&
      Array.isArray(row.tags)&&Array.isArray(row.collectionSourceCandidates)&&
      row.collectionMembershipVerified===false&&
      row.worldMembershipVerified===false&&
      row.availabilityVerified===false,'BAD_ITEM_ROW_'+row.itemId);
    seen.add(row.itemId);found++;
    const browseTags=row.tags.filter(t=>COLLECTION_FACETS.has(t.facet)&&
      typeof t.key==='string'&&t.key.length>0&&t.key.length<=128)
      .map(t=>[t.facet,t.key]);
    if(browseTags.length)collectionRows.push([row.itemId,browseTags]);
    const universeKeys=new Set(browseTags.filter(t=>t[0]==='disneyUniverse')
      .map(t=>t[1]));
    for(const candidate of row.collectionSourceCandidates){
      if(typeof candidate.universeTagKey==='string'&&
        /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(candidate.universeTagKey))
        universeKeys.add(candidate.universeTagKey);
    }
    if(universeKeys.size)universeSourceRows.push([row.itemId,
      [...universeKeys].sort()]);
    // Canonical original Tag IDs avoid fragile cross-locale native key/name
    // joins and also permit real zero-linked universe categories.
    const universeTagIds=new Set(row.tags.filter(t=>
      t.facet==='disneyUniverse'&&Number.isSafeInteger(t.id)&&
      t.id>=2000500000&&t.id<2000600000).map(t=>t.id));
    for(const candidate of row.collectionSourceCandidates){
      if(Number.isSafeInteger(candidate.universeTagId)&&
        candidate.universeTagId>=2000500000&&
        candidate.universeTagId<2000600000)
        universeTagIds.add(candidate.universeTagId);
    }
    if(universeTagIds.size)universeSourceTagRows.push([
      row.itemId,[...universeTagIds].sort((a,b)=>a-b)
    ]);
    const sourceCategories=originalCategoryCodes(row);
    if(sourceCategories.length)collectionCategoryRows.push([row.itemId,sourceCategories]);
    const nativeType=row.itemType;
    check(Number.isSafeInteger(nativeType?.code)&&nativeType.code>=0&&
      nativeType.code<=100&&
      Math.floor(row.itemId/10000000)===nativeType.code&&
      typeof nativeType.name==='string'&&
      /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(nativeType.name)&&
      Number.isSafeInteger(nativeType.subtypeCode)&&
      nativeType.subtypeCode>=0&&nativeType.subtypeCode<=99&&
      Math.floor((row.itemId%10000000)/100000)===nativeType.subtypeCode&&
      typeof nativeType.subtypeNameVerified==='boolean'&&
      (!nativeType.subtypeNameVerified||
        (typeof nativeType.subtypeName==='string'&&
          /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(nativeType.subtypeName))),
      'NATIVE_ORIGINAL_SUBTYPE_'+row.itemId);
    nativeSubtypeRows.push([row.itemId,nativeType.name,
      nativeType.subtypeCode,
      nativeType.subtypeNameVerified?nativeType.subtypeName:null]);
    if(row.nativeCategory==='ActivityItem'){
      check(nativeType?.code===3&&nativeType.name==='ActivityItem'&&
        Number.isSafeInteger(nativeType.subtypeCode)&&
        nativeType.subtypeCode>=0&&nativeType.subtypeCode<=999&&
        Math.floor((row.itemId%10000000)/100000)===nativeType.subtypeCode&&
        typeof nativeType.subtypeNameVerified==='boolean'&&
        (!nativeType.subtypeNameVerified||
          (typeof nativeType.subtypeName==='string'&&
            nativeType.subtypeName.length>0&&nativeType.subtypeName.length<=128)),
        'ACTIVITY_ORIGINAL_SUBTYPE_'+row.itemId);
      activityTypeRows.push([row.itemId,nativeType.subtypeCode,
        nativeType.subtypeNameVerified?nativeType.subtypeName:null]);
    }
    // Decorate reference browse: only known decorating furniture families.
    // No placement/ownership/availability claim is made by this projection.
    if((row.nativeCategory==='Furniture'&&[0,1,2,3,7,8,9].includes(nativeType.subtypeCode))||
       (row.nativeCategory==='Trimming'&&[0,1].includes(nativeType.subtypeCode)))
      exploreRows.push({itemId:row.itemId,names:row.names,nativeCategory:row.nativeCategory,
        subtype:nativeType.subtypeCode,
        tags:browseTags.filter(t=>['color','furnitureStyle','furnitureKind'].includes(t[0])),
        universes:[...universeTagIds].sort((a,b)=>a-b)});
    tagRefs+=row.tags.length;
    candidates+=row.collectionSourceCandidates.length;
  }
}
check(found===release.count&&nativeSubtypeRows.length===release.count&&
  activityTypeRows.length===4050&&
  tagRefs===release.coverage.sourceTagReferences&&
  candidates===release.coverage.sourceCollectionCandidateReferences,
  'COVERAGE_MISMATCH');
mkdirSync(targetRoot,{recursive:true});
const staging=mkdtempSync(join(targetRoot,'.item-master-'));
try{
  for(const [name,data] of files){
    const output=join(staging,name);
    mkdirSync(dirname(output),{recursive:true});
    writeFileSync(output,data);
  }
  exploreRows.sort((a,b)=>a.itemId-b.itemId);
  writeFileSync(join(staging,'explore.json'),JSON.stringify({
    schema:'wand.explore.catalog@1',release:entry.release,items:exploreRows
  })+'\n');
  rmSync(destination,{recursive:true,force:true});
  renameSync(staging,destination);
}catch(error){
  rmSync(staging,{recursive:true,force:true});
  throw error;
}
// Generated from the SHA-pinned archive by the existing build-only tool.
// Collection consumes this small filter index only on demand, and continues
// to use DB-01 getItem() for the complete per-ID detail on inspection.
const collectionDestination=join(project,'static/ddv/collection',
  'db01-facets-'+gameVersion.replaceAll('.','')+'.json');
mkdirSync(dirname(collectionDestination),{recursive:true});
collectionRows.sort((a,b)=>a[0]-b[0]);
collectionCategoryRows.sort((a,b)=>a[0]-b[0]);
activityTypeRows.sort((a,b)=>a[0]-b[0]);
nativeSubtypeRows.sort((a,b)=>a[0]-b[0]);
universeSourceRows.sort((a,b)=>a[0]-b[0]);
universeSourceTagRows.sort((a,b)=>a[0]-b[0]);
writeFileSync(collectionDestination,JSON.stringify({
  schema:'wand.collection.db01-native-facets@1',
  release:entry.release,
  sourceArchiveSha256:RELEASE_SHA,
  sourceItemCount:found,
  taggedItems:collectionRows.length,
  categoryItemCount:collectionCategoryRows.length,
  categoryItems:collectionCategoryRows,
  activityTypeItemCount:activityTypeRows.length,
  activityTypeItems:activityTypeRows,
  nativeSubtypeItemCount:nativeSubtypeRows.length,
  nativeSubtypeItems:nativeSubtypeRows,
  nativeSubtypeEvidence:'original_il2cpp_item_type_and_subtype',
  nativeSubtypeGameUiMembershipVerified:false,
  universeSourceItemCount:universeSourceRows.length,
  universeSourceItems:universeSourceRows,
  universeSourceEvidence:'original_tag_or_collection_predicate_tag',
  universeSourceGameUiMembershipVerified:false,
  universeSourceTagCount:universeSourceTagRows.length,
  universeSourceTagItems:universeSourceTagRows,
  universeSourceTagEvidence:'original_tag_id_or_collection_predicate_tag_id',
  universeSourceTagGameUiMembershipVerified:false,
  activityTypeEvidence:'original_il2cpp_activity_item_type',
  activityTypeGameUiMembershipVerified:false,
  categoryEvidence:'original_collectionset_source_candidate_or_verified_native_item_type',
  gameRuntimeMembershipVerified:false,
  items:collectionRows
})+'\n');
console.log('DB-01 Collection browse subset:',collectionRows.length,'tagged Item IDs,',
  activityTypeRows.length,'source-native ActivityItem subtypes,',
  nativeSubtypeRows.length,'native Item Type IDs');
console.log('DB-01 public Item master:',gameVersion,found,'items,',tagRefs,'tags,',candidates,'Collection source candidates');
materializeExpandedMaster(project,entry,release,files,collectionDestination);
materializeCompleteSourceMaster(project,entry,release,files);
}


const currentEntry=catalog.releases.find(entry=>entry.gameVersion===catalog.current);
check(currentEntry?.complete,'CURRENT_COMPLETE_REQUIRED');
publishCurrentProjections(targetRoot,currentEntry);
