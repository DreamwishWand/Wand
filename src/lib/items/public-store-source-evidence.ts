/** Join the existing canonical store source facts without inventing a
 * shop membership flag. Explicit display sequences, static list membership,
 * generated candidates and purchase prices are separate evidence families. */
import {ITEM_MASTER_LOCALES,type PublicCompleteItemMaster,type ItemFieldValue,type ItemMasterLocale} from './public-item-master.ts';
import {readItemPriceDetails,type ItemPriceDetails} from './public-item-price-details.ts';
import type {StoreDisplayScreen,CatalogAcquisitionFacts} from './public-item-details.ts';
type Obj=Readonly<Record<string,ItemFieldValue>>;
const obj=(v:unknown):v is Obj=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
function check(ok:unknown,why:string):asserts ok{if(!ok)throw TypeError('DB01_STORE_EVIDENCE_'+why);}
const unique=(a:readonly number[])=>[...new Set(a)].sort((a,b)=>a-b);
export interface StoreDisplaySequenceEvidence {
  readonly displayItemId:number;
  readonly sequenceIndex:number;
  readonly position:number;
  readonly applyToBuildingIds:readonly number[];
  readonly original:Obj;
  readonly buildings:readonly Readonly<{itemId:number;name:string|null}>[];
  readonly currentAvailabilityVerified:false;
}
export interface StoreItemSourceEvidence {
  readonly itemId:number;
  readonly status:'indexed'|'not_indexed'|'not_store_display_family';
  readonly configuredDefaultDisplay:Obj|null;
  readonly preDlcList:Obj|null;
  readonly explicitSequences:readonly Readonly<StoreDisplaySequenceEvidence>[];
  readonly generatedScreen:Readonly<StoreDisplayScreen>|null;
  readonly catalog:Readonly<CatalogAcquisitionFacts>|null;
  readonly layoutCandidates:ItemFieldValue|null;
  readonly dimensionComparisons:ItemFieldValue|null;
  readonly installedShelfCandidates:ItemFieldValue|null;
  readonly configuredPrice:Readonly<ItemPriceDetails>|null;
  readonly effectiveCategories:ItemFieldValue|null;
  readonly currentPremiumBundleIds:ItemFieldValue|null;
  readonly storeMembershipVerified:false;
  readonly currentAvailabilityVerified:false;
}
const fields=['nativeCategory','acquisition.additionalSources','acquisition.storeDisplayScreen',
  'acquisition.catalogFacts','acquisition.storeLayoutCandidates','acquisition.storeLayoutDimensionComparisons',
  'acquisition.storeDisplaySequenceLinks','acquisition.effectiveCategories','acquisition.premiumCurrentBundleIds','acquisition.storeInstalledShelfCandidates'];
export async function readStoreItemSourceEvidence(db:PublicCompleteItemMaster,ids:readonly number[],locale:ItemMasterLocale):
  Promise<readonly (Readonly<StoreItemSourceEvidence>|null)[]>{
  check(Array.isArray(ids)&&ids.length<=10000&&ids.every(id),'IDS');
  check(ITEM_MASTER_LOCALES.includes(locale),'LOCALE');
  const release=db.release,catalog=new Set((await db.getFieldCatalog()).map(f=>f.field));
  const pinned=release.target.platform==='Steam'&&release.target.gameVersion==='1.26.2'&&
    release.sourceIl2cppDumpSha256==='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'&&
    release.sourceFilesSha256?.Furniture==='cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196'&&
    release.sourceFilesSha256?.Clothing==='a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946';
  const indexed=pinned&&fields.slice(0,7).every(f=>catalog.has(f));
  const rows=await db.getItemFields(ids,indexed?fields.filter(f=>catalog.has(f)):['nativeCategory']);
  const isFamily=(v:unknown)=>v==='Furniture'||v==='Clothing';
  const selected=unique(rows.flatMap(r=>indexed&&r&&isFamily(r.values.nativeCategory)?[r.itemId]:[]));
  const prices=new Map<number,Readonly<ItemPriceDetails>>();
  for(let i=0;i<selected.length;i+=1000)for(const r of await readItemPriceDetails(db,selected.slice(i,i+1000),locale))if(r)prices.set(r.itemId,r);
  const rawSequences=rows.map(r=>{
    const v=r?.values['acquisition.storeDisplaySequenceLinks']??[];
    check(Array.isArray(v)&&v.every(obj),'SEQUENCES');
    return v as readonly Obj[];
  });
  const displayIds=unique(rawSequences.flatMap(ls=>ls.map(l=>{
    check(id(l.displayItemId),'DISPLAY_ID');return l.displayItemId;
  })));
  const displayRows=displayIds.length?await db.getItemFields(displayIds,['nativeCategory','acquisition.storeDisplayDefinition']):[];
  const definitions=new Map<number,Obj>();
  for(const r of displayRows){
    check(r?.values.nativeCategory==='Display'&&obj(r.values['acquisition.storeDisplayDefinition']),'DISPLAY_DEFINITION');
    definitions.set(r.itemId,r.values['acquisition.storeDisplayDefinition']);
  }
  const buildingIds=unique(rawSequences.flatMap(ls=>ls.flatMap(l=>{
    check(Array.isArray(l.applyToBuildingIds)&&l.applyToBuildingIds.every(id),'BUILDINGS');return l.applyToBuildingIds;
  })));
  const buildings=new Map<number,Readonly<{itemId:number;name:string|null}>>();
  for(const r of buildingIds.length?await db.getItemFields(buildingIds,['nativeCategory','names.'+locale]):[]){
    check(r?.values.nativeCategory==='Building','BUILDING_JOIN');
    const name=r.values['names.'+locale];
    buildings.set(r.itemId,Object.freeze({itemId:r.itemId,name:typeof name==='string'&&name.length?name:null}));
  }
  return Object.freeze(rows.map((r,i)=>{
    if(!r)return null;
    const v=r.values,active=indexed&&isFamily(v.nativeCategory);
    const additional=v['acquisition.additionalSources']??[];
    check(Array.isArray(additional)&&additional.every(obj),'ADDITIONAL');
    const list=additional as readonly Obj[];
    const explicitSequences=active?rawSequences[i].map(l=>{
      const displayItemId=l.displayItemId,sequenceIndex=l.sequenceIndex,position=l.position;
      check(id(displayItemId)&&typeof sequenceIndex==='number'&&Number.isSafeInteger(sequenceIndex)&&sequenceIndex>=0&&
        typeof position==='number'&&Number.isSafeInteger(position)&&position>=0,'SEQUENCE_IDENTITY');
      const definition=definitions.get(displayItemId),seqs=definition?.itemSequences;
      check(Array.isArray(seqs)&&obj(seqs[sequenceIndex]),'SEQUENCE_JOIN');
      const seq=seqs[sequenceIndex];
      check(Array.isArray(seq.itemIds)&&seq.itemIds[position]===r.itemId&&
        JSON.stringify(seq.applyToBuildingIds)===JSON.stringify(l.applyToBuildingIds),'SEQUENCE_ITEM_JOIN');
      const applyToBuildingIds=l.applyToBuildingIds as readonly number[];
      return Object.freeze({displayItemId,sequenceIndex,position,applyToBuildingIds,original:l,
        buildings:Object.freeze(applyToBuildingIds.map(id=>{const b=buildings.get(id);check(b,'BUILDING_IDENTITY');return b;})),
        currentAvailabilityVerified:false as const});
    }):[];
    return Object.freeze({itemId:r.itemId,status:!indexed?'not_indexed' as const:active?'indexed' as const:'not_store_display_family' as const,
      configuredDefaultDisplay:active?list.find(e=>e.kind==='configured_store_display')??null:null,
      preDlcList:active?list.find(e=>e.kind==='pre_dlc_store_list_member')??null:null,
      explicitSequences:Object.freeze(explicitSequences),
      generatedScreen:active?(v['acquisition.storeDisplayScreen']??null) as unknown as Readonly<StoreDisplayScreen>|null:null,
      catalog:active?(v['acquisition.catalogFacts']??null) as unknown as Readonly<CatalogAcquisitionFacts>|null:null,
      layoutCandidates:active?v['acquisition.storeLayoutCandidates']??null:null,
      dimensionComparisons:active?v['acquisition.storeLayoutDimensionComparisons']??null:null,
      installedShelfCandidates:active?v['acquisition.storeInstalledShelfCandidates']??null:null,
      configuredPrice:prices.get(r.itemId)??null,
      effectiveCategories:active?v['acquisition.effectiveCategories']??null:null,
      currentPremiumBundleIds:active?v['acquisition.premiumCurrentBundleIds']??null:null,
      storeMembershipVerified:false as const,currentAvailabilityVerified:false as const});
  }));
}
