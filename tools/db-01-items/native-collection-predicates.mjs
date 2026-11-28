/** Build-only static ICollectionItem.CanBeCollected predicates from
 * Steam 1.26.2 IL2CPP dump and exact native assembly. Not CollectionVisibility,
 * runtime catalog membership, ownership, or acquisition. Never turn an
 * absent decoded value whose wire field is present into a default.
 */
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
const NATIVE='a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653';
const flags={
 FurnitureItemData:['IsHidden',24,0x3BACBC0],
 ClothingItemData:['IsHidden',29,0x3C38450],
 CharacterItemData:['IsDebug',11,0x3D128B0],
 ActivityItemData:['IsMissionItem',8,0x3B71C80],
 CropItemData:['IsMissionItem',20,0x3B7CF70],
 MineralItemData:['IsMissionItem',11,0x3B8FFD0],
 FishItemData:['IsMissionItem',12,0x3B8FFD0],
 FlowerItemData:['IsMissionItem',10,0x3D532D0],
 IngredientItemData:['IsMissionItem',11,0x3D532D0]
};
const unconditional=new Set(['BuffElixirItemData','MemoryShardItemData','ManualItemData',
 'FurnitureAncientMachineItemData','TrimmingItemData','FigurineItemData','StoryItemData',
 'PetItemData','CritterItemData','MountItemData']);
export function nativeCollectionPredicate(row,source){
 if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2'||source.sourceIl2cppDumpSha256!==DUMP)return null;
 const cls=row.sourceClass,sha=source.sourceFilesSha256[row.nativeCategory];
 if(!/^[a-f0-9]{64}$/.test(sha??''))return null;
 const base={sourceClass:cls,sourceNativeCategory:row.nativeCategory,sourceGameVersion:source.target.gameVersion,
  sourceFileSha256:sha,sourceIl2cppDumpSha256:DUMP,nativeAssemblySha256:NATIVE,
  runtimeMembershipVerified:false,currentAvailabilityVerified:false};
 if(unconditional.has(cls))return {...base,predicate:'always_true',nativeRva:0x680390,
  sourceField:null,sourceFieldNumber:null,sourceFieldPresent:null,sourceValue:null,eligible:true};
 const rule=flags[cls]??(cls==='FurnitureSnippetTrapItemData'?['Level',11,0x3C082F0]:null);
 if(!rule)return null; // FenceAndRoad and Meal require additional native conditions.
 const [field,number,rva]=rule;
 const decl=source.sourceFieldDeclarations?.[cls];
 if(decl?.[field]!==number||!Array.isArray(row.observedFields))return null;
 const p={...row.nativeProperties,...row.sourceAttributes};
 const present=row.observedFields.some(([n])=>n===number);
 let value=p[field];
 if(value===undefined&&!present&&field!=='Level')value=false;
 const known=field==='Level'?Number.isSafeInteger(value):typeof value==='boolean';
 const eligible=known?(field==='Level'?value===1:!value):null;
 return {...base,predicate:field==='Level'?'level_equals_one':'not_'+field,nativeRva:rva,
  sourceField:field,sourceFieldNumber:number,sourceFieldPresent:present,sourceValue:known?value:null,eligible};
}
