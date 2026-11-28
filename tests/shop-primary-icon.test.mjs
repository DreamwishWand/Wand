import test from 'node:test';
import assert from 'node:assert/strict';
import {selectShopProfileIcon,readShopPrimaryIconCandidate} from '../src/lib/media/shop-primary-icon.ts';
const primary='a'.repeat(32),male='b'.repeat(32);
const row=(sourceClass,extra={})=>({itemId:123,values:{sourceClass,iconGuid:primary,'source.IconAddress':'guid:'+primary,...extra}});
test('source class getter and male profile branches remain distinct',()=>{
 for(const c of ['FurnitureItemData','HouseSkinItemData','CritterItemData','DecalItemData','ToolItemData','CharacterSkinItemData']){
   assert.equal(selectShopProfileIcon(row(c),'male',false).guid,primary);
 }
 const clothing=row('ClothingItemData',{'source.MaleIconAddress':'guid:'+male});
 assert.equal(selectShopProfileIcon(clothing,'default',true).guid,primary);
 assert.equal(selectShopProfileIcon(clothing,'male',true).guid,male);
 assert.equal(selectShopProfileIcon(clothing,'male',true).status,'male');
 assert.equal(selectShopProfileIcon(clothing,'male',false).reason,'unknown_male_field');
 assert.equal(selectShopProfileIcon(row('ClothingItemData'),'male',true).guid,primary);
 assert.equal(selectShopProfileIcon(row('UnknownItemData'),'default',true).reason,'unknown_class');
 assert.equal(selectShopProfileIcon(row('FurnitureItemData',{iconGuid:null}),'default',true).reason,'missing_primary');
 assert.equal(selectShopProfileIcon(row('FurnitureItemData',{'source.IconAddress':male}),'default',true).reason,'conflicting_primary');
});
test('only exact primary canonical ItemID index is used; distinct male never uses primary',async()=>{
 const clothing=row('ClothingItemData',{'source.MaleIconAddress':male});
 const fields=['sourceClass','iconGuid','source.IconAddress','source.MaleIconAddress'];
 const db={getFieldCatalog:async()=>fields.map(field=>({field})),getItemFields:async(ids,requested)=>{assert.equal(ids.length,1);assert.deepEqual(new Set(requested),new Set(fields));return [clothing];}};
 const calls=[],image={url:'https://media.dreamwishwand.com/images/test.webp'};
 const media={getItemImage:async(id,variant)=>{calls.push([id,variant]);return image;}};
 const a=await readShopPrimaryIconCandidate(db,media,123,'original');
 assert.equal(a.image,image);assert.equal(a.renderingVerified,false);
 const b=await readShopPrimaryIconCandidate(db,media,123,'thumbnail','male');
 assert.equal(b.selection.status,'male');assert.equal(b.image,null);
 assert.deepEqual(calls,[[123,'original']]);
 assert.equal(await readShopPrimaryIconCandidate(db,media,124),null);
});
