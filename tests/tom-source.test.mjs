import test from 'node:test';
import assert from 'node:assert/strict';
import {hasTomSourceBase,tomSourceBaseIds,verifyTomItemReferences} from '../src/lib/items/tom-source.ts';
test('source customization flags select only observed eligible bases',()=>{
 assert.equal(tomSourceBaseIds('tom-furniture').length,40);
 assert.equal(tomSourceBaseIds('tom-clothing').length,35);
 assert.equal(hasTomSourceBase('tom-furniture',40300020),true);
 assert.equal(hasTomSourceBase('tom-furniture',40000001),false);
 assert.equal(hasTomSourceBase('tom-clothing',50000211),true);
 assert.equal(hasTomSourceBase('tom-clothing',40001801),false);
});
test('restore eligibility requires exact release, positive base facet and component class',async()=>{
 const release={target:{gameVersion:'1.26.2',platform:'Steam'},sourceIl2cppDumpSha256:'0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08',sourceFilesSha256:{Furniture:'cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196',Clothing:'a327869947785d3bbe0455b6132873b63878cb6cbb8dbd4cd00f76b294d1e946',TouchOfMagic:'78a5e5153c1a69cdcbf49b2902494322efbf564fa1a21ded4b12aecbdf36e70d'}};
 const db={release,getItem:async itemId=>({itemId,itemType:{code:4},sourceClass:'FurnitureItemData'}),getItems:async ids=>ids.map(itemId=>({itemId,itemType:{code:10,subtypeCode:1},sourceClass:'TextureItemData'}))};
 assert.equal(await verifyTomItemReferences(db,'tom-furniture',40001801,[{itemId:100100004,subtype:1}]),true);
 assert.equal(await verifyTomItemReferences(db,'tom-furniture',40000001,[]),false);
 assert.equal(await verifyTomItemReferences(db,'tom-furniture',40001801,[{itemId:100100004,subtype:0}]),false);
 assert.equal(await verifyTomItemReferences({...db,release:{...release,target:{...release.target,gameVersion:'1.27.0'}}},'tom-furniture',40001801,[]),false);
});
