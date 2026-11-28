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

test('male selection precedes the primary fallback, and non-GUID source values do not silently fall back',()=>{
 const m=row('ClothingItemData',{iconGuid:null,'source.IconAddress':'','source.MaleIconAddress':male});
 assert.equal(selectShopProfileIcon(m,'male',true).guid,male);
 assert.equal(selectShopProfileIcon(m,'default',true).reason,'missing_primary');
 assert.equal(selectShopProfileIcon(row('ClothingItemData',{'source.MaleIconAddress':'unknown/address'}),'male',true).reason,'unsupported_address');
 assert.equal(selectShopProfileIcon(row('FurnitureItemData',{'source.IconAddress':'unknown/address'}),'default',true).reason,'unsupported_address');
});
test('existing typed GUID artwork is reused only for the exact native consumer',async()=>{
 const clothing=row('ClothingItemData',{'source.MaleIconAddress':male});
 const db={getFieldCatalog:async()=>['sourceClass','iconGuid','source.IconAddress','source.MaleIconAddress'].map(field=>({field})),getItemFields:async()=>[clothing]};
 const media={getItemImage:async()=>{throw Error('male must not use primary');}};
 const original={sha256:'1'.repeat(64),width:400,height:400,bytes:1};
 const thumbnail={sha256:'2'.repeat(64),width:256,height:256,bytes:1};
 const sprite={original,thumbnail};
 const make=texture=>({get:(address,kind)=>address==='guid:'+male?(kind==='Sprite'?sprite:texture):null,url:()=> 'https://media.dreamwishwand.com/images/'+thumbnail.sha256+'.webp'});
 const r=await readShopPrimaryIconCandidate(db,media,123,'thumbnail','male',make(null),'Sprite');
 assert.equal(r.image.sha256,thumbnail.sha256);assert.equal(r.imageSource,'published_guid');
 assert.equal((await readShopPrimaryIconCandidate(db,media,123,'thumbnail','male',make(null),'Icon')).image,null);
 assert.equal((await readShopPrimaryIconCandidate(db,media,123,'thumbnail','male',make(sprite),'Icon')).image.sha256,thumbnail.sha256);
 assert.equal((await readShopPrimaryIconCandidate(db,media,123,'thumbnail','male',make({...sprite,thumbnail:{...thumbnail,sha256:'3'.repeat(64)}}),'Icon')).image,null);
});
