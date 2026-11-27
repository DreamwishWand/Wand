/** Shared Item DB source-backed customization facet, Steam 1.26.2 only.
 * Generated from Furniture/Clothing itemlist CanAddDecals + CanChangeColor
 * (native fields 22/23 and 24/25). Positive source flags, not entitlement.
 * FurnitureItemData subtypes 0 and 3; other classes deliberately excluded.
 * No separate item names, artwork, or private game-source data.
 */
import type {PublicCompleteItemMaster} from './public-item-master.ts';
const FURNITURE=new Set<number>([40001801,40001803,40001880,40001882,40001883,40001884,40001885,40001891,40001892,40001897,40001898,40001899,40001900,40001906,40001908,40002397,40002585,40002686,40002687,40002688,40002689,40002690,40002706,40002707,40002727,40002816,40004339,40004421,40004469,40005102,40005125,40005130,40005139,40005140,40005141,40005142,40005233,40005647,40006207,40300020]);
const CLOTHING=new Set<number>([50000211,50000227,50000338,50000349,50000402,50000403,50200124,50200125,50400058,50400059,50400060,50400065,50400066,50400071,50400075,50400116,50400152,50400164,50600060,50700089,50700090,50700091,50700168,50700172,50700174,50700191,50800026,50900051,50900052,50900065,50900069,50900139,50900337,51200015,51200016]);
export type TomKind='tom-furniture'|'tom-clothing';
export type TomComponentReference={readonly itemId:number;readonly subtype:number};
export function tomSourceBaseIds(kind:TomKind):readonly number[]{
 return Object.freeze([...(kind==='tom-furniture'?FURNITURE:CLOTHING)]);
}
export function hasTomSourceBase(kind:TomKind,id:number):boolean{
 return (kind==='tom-furniture'?FURNITURE:CLOTHING).has(id);
}
export async function verifyTomItemReferences(db:PublicCompleteItemMaster,kind:TomKind,id:number,components:readonly TomComponentReference[]):Promise<boolean>{
 const release=db.release;
 if(release.target.gameVersion!=='1.26.2'||release.target.platform!=='Steam'||
  release.sourceIl2cppDumpSha256!=='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08'||
  release.sourceFilesSha256?.Furniture!=='cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196'||
  release.sourceFilesSha256?.Clothing!=='a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946'||
  release.sourceFilesSha256?.TouchOfMagic!=='78a5e5153c1a69cdcbf49b2902494322efbf564fa1a21ded4b12aecbdf36e70d'||
  !hasTomSourceBase(kind,id)||components.length>1024)return false;
 const base=await db.getItem(id);
 if(!base||base.itemId!==id||base.itemType.code!==(kind==='tom-furniture'?4:5)||
  base.sourceClass!==(kind==='tom-furniture'?'FurnitureItemData':'ClothingItemData'))return false;
 for(let start=0;start<components.length;start+=128){
  const expected=components.slice(start,start+128);
  if(expected.some(v=>!Number.isSafeInteger(v.itemId)||v.itemId<1||![0,1].includes(v.subtype)))return false;
  const found=await db.getItems(expected.map(v=>v.itemId));
  if(found.length!==expected.length||found.some((v,i)=>!v||v.itemId!==expected[i].itemId||v.itemType.code!==10||
   v.itemType.subtypeCode!==expected[i].subtype||v.sourceClass!==(expected[i].subtype===0?'DecalItemData':'TextureItemData')))return false;
 }
 return true;
}
