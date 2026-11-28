import type {PublicCompleteItemMaster,ItemMasterLocale} from './public-item-master.ts';
import {usableItemName} from './display-name.ts';
export type ItemPlacementHint='indoor'|'outdoor'|'both';
export async function readItemPlacementHint(db:PublicCompleteItemMaster,id:number,nativeCategory:string):Promise<ItemPlacementHint|null>{
  if(nativeCategory!=='Furniture'&&nativeCategory!=='Building')return null;
  const field='placement.sourceOrdinaryScopeHint';
  if(!(await db.getFieldCatalog()).some(row=>row.field===field))return null;
  const [row]=await db.getItemFields([id],[field]);
  const hint=row?.values[field];
  return hint==='indoor'||hint==='outdoor'||hint==='both'?hint:null;
}
export interface ItemBundleContext {readonly count:number;readonly names:readonly string[]}
/** Membership in a published bundle definition, not a sale or eligibility claim.
 * Use the title from a revision that actually contains the selected Item ID. */
export async function readItemBundleContext(db:PublicCompleteItemMaster,id:number,locale:ItemMasterLocale):Promise<ItemBundleContext|null>{
  const [membership]=await db.getPremiumBundleMembership([id]);
  if(!membership?.bundleIds.length)return null;
  const ids=[...new Set(membership.bundleIds)];
  const current=new Set(membership.currentBundleIds),legacy=new Set(membership.legacyBundleIds);
  const rows=await db.getPremiumBundleLocalizedText(ids,locale);
  const names=new Set<string>();
  for(const row of rows){
    if(!row)continue;
    const title=(current.has(row.bundleId)?row.current?.displayTitle:null)
      ??(legacy.has(row.bundleId)?row.legacy?.displayTitle:null);
    if(usableItemName(title))names.add(title);
  }
  return {count:ids.length,names:[...names].sort((a,b)=>a.localeCompare(b,locale))};
}

export interface ItemIntroductionContext {readonly introduced:string|null;readonly observed:string|null;readonly releaseKind:'free_update'|'expansion'|'adventure_pack'|'paid_dlc'|null}
/** An observed source version is not necessarily an introduction or release date. */
export async function readItemIntroductionContext(db:PublicCompleteItemMaster,id:number):Promise<ItemIntroductionContext|null>{
  const [row]=await db.getItemContentOrigins([id]);
  if(!row)return null;
  const introduced=row.introducedVersion,observed=introduced===null?row.firstObservedVersion:null;
  const releaseKind=row.attribution!=='confirmed'?null:row.contentReleaseKind==='free_update'?'free_update':row.contentReleaseKind==='paid_dlc'?row.contentDlcType??'paid_dlc':null;
  return introduced||observed||releaseKind?{introduced,observed,releaseKind}:null;
}
