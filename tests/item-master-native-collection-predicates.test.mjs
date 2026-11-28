import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openCurrentItemDatabase} from '../src/lib/items/public-item-master.ts';
import {nativeCollectionPredicate} from '../tools/db-01-items/native-collection-predicates.mjs';
test('native collection predicates retain provenance and separate excluded from unclassified definitions',async()=>{
 const db=await openCurrentItemDatabase('',async url=>new Response(await readFile('static'+url),{status:200}));
 const [predicates,booleans,categories,scopes,families]=await Promise.all(['collection.nativeEligibility','collection.nativeCanBeCollected','acquisition.effectiveCategories','definitionScope','nativeCategory'].map(f=>db.getFieldRows(f)));
 const known=new Map(booleans),classified=new Map(categories),scope=new Map(scopes),family=new Map(families);
 const counts={};const fields=new Map();
 for(const [id,p] of predicates){
   assert.equal(p.sourceNativeCategory,family.get(id));assert.equal(p.sourceGameVersion,db.release.target.gameVersion);
   assert.equal(p.sourceFileSha256,db.release.sourceFilesSha256[p.sourceNativeCategory]);
   assert.equal(p.nativeAssemblySha256,'a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653');
   assert.equal(p.runtimeMembershipVerified,false);assert.equal(p.currentAvailabilityVerified,false);
   if(p.eligible===null)assert(!known.has(id));else assert.equal(known.get(id),p.eligible);
   if(p.sourceField!==null){
     if(p.predicate==='name_not_contains_literal'){
       assert.equal(p.sourceField,'Name');assert.equal(p.excludedNameSubstring,'Ext!');
       assert.equal(p.nativeLiteralRva,0x9A35730);
       if(p.eligible!==null)assert.equal(p.eligible,!p.sourceValue.includes('Ext!'));
     }else{
       if(!fields.has(p.sourceField))fields.set(p.sourceField,new Map(await db.getFieldRows('source.'+p.sourceField)));
       const raw=fields.get(p.sourceField).get(id);
       if(raw!==undefined)assert.equal(p.sourceValue,raw);
       if(p.eligible!==null)assert.equal(p.eligible,p.predicate==='not_mission_or_rubbish'&&id===30300494?false:p.sourceField==='Level'?p.sourceValue===1:!p.sourceValue);
     }
   }else assert.equal(p.eligible,true);
   if(scope.get(id)!=='source_candidate')continue;
   const c=counts[p.sourceNativeCategory]??={reviewed:0,eligible:0,excluded:0,unresolved:0,eligibleUnclassified:0,excludedUnclassified:0};
   c.reviewed++;
   if(p.eligible===null)c.unresolved++;
   else if(p.eligible){c.eligible++;if(!classified.has(id))c.eligibleUnclassified++;}
   else {c.excluded++;if(!classified.has(id))c.excludedUnclassified++;}
 }
 assert.equal(known.size,predicates.filter(([,p])=>p.eligible!==null).length);
 assert(predicates.some(([,p])=>p.sourceClass==='FenceAndRoadItemData'));
 assert(predicates.some(([id,p])=>id===30300494&&p.sourceClass==='MealItemData'&&p.eligible===false));
 assert.equal(counts.MemoryShard.reviewed,472);assert.equal(counts.MemoryShard.eligible,472);
 assert.equal(counts.Character.reviewed,142);assert.equal(counts.Character.excluded,60);
 assert(counts.Furniture.reviewed>0);assert(counts.Clothing.reviewed>0);assert(counts.ActivityItem.reviewed>0);
 console.log('DB01_NATIVE_COLLECTION_PREDICATES '+JSON.stringify(counts));
});
test('present-but-undecoded source flag is unknown, never false by default',()=>{
 const source={target:{platform:'Steam',gameVersion:'1.26.2'},sourceIl2cppDumpSha256:'0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08',sourceFilesSha256:{Clothing:'a'.repeat(64)},sourceFieldDeclarations:{ClothingItemData:{IsHidden:29}}};
 const row={sourceClass:'ClothingItemData',nativeCategory:'Clothing',observedFields:[[29,0]],sourceAttributes:{}};
 assert.equal(nativeCollectionPredicate(row,source).eligible,null);
 assert.equal(nativeCollectionPredicate({...row,observedFields:[]},source).eligible,true);
 assert.equal(nativeCollectionPredicate({...row,sourceAttributes:{IsHidden:true}},source).eligible,false);
 assert.equal(nativeCollectionPredicate(row,{...source,target:{...source.target,gameVersion:'1.27.0'}}),null);
});

test('native meal rubbish and fence extension literal exclusions preserve exact semantics',()=>{
 const source={target:{platform:'Steam',gameVersion:'1.26.2'},sourceIl2cppDumpSha256:'0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08',sourceFilesSha256:{ActivityItem:'a'.repeat(64),Furniture:'b'.repeat(64)},sourceFieldDeclarations:{MealItemData:{IsMissionItem:12},FenceAndRoadItemData:{Name:2}}};
 const meal={sourceClass:'MealItemData',nativeCategory:'ActivityItem',itemId:30300493,observedFields:[],sourceAttributes:{}};
 assert.equal(nativeCollectionPredicate(meal,source).eligible,true);
 assert.equal(nativeCollectionPredicate({...meal,itemId:30300494},source).eligible,false);
 assert.equal(nativeCollectionPredicate({...meal,observedFields:[[12,0]]},source).eligible,null);
 assert.equal(nativeCollectionPredicate({...meal,sourceAttributes:{IsMissionItem:true}},source).eligible,false);
 const fence={sourceClass:'FenceAndRoadItemData',nativeCategory:'Furniture',nativeKey:'Fence!Test',observedFields:[[2,2]]};
 assert.equal(nativeCollectionPredicate(fence,source).eligible,true);
 assert.equal(nativeCollectionPredicate({...fence,nativeKey:'Fence!Ext!Test'},source).eligible,false);
 assert.equal(nativeCollectionPredicate({...fence,nativeKey:'Fence!ext!Test'},source).eligible,true);
 assert.equal(nativeCollectionPredicate({...fence,nativeKey:undefined},source).eligible,null);
});
