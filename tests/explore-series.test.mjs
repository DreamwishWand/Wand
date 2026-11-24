import test from 'node:test';
import assert from 'node:assert/strict';
import {seriesShelves,designTiles} from '../src/lib/explore/series.ts';
const item=(id,en,set,style=[],nativeCategory='Furniture',extra={})=>({itemId:id,names:{en},nativeCategory,subtype:0,tags:style.map(s=>['furnitureStyle',s]),universes:[2000500017],sourceSetItemId:set,...extra});
test('exact offer first, real cohesive set across categories, mixed set split by theme/style, every ID reachable',()=>{
 const rows=[item(1,'Table',2040000081),item(2,'Stall',2040000081,[],'Building'),item(3,'Bookish Tiles',2040000246),item(4,'Party Disco Ball',2040000246),item(5,'Old Chair',2040000076,['Rustic']),item(6,'Modern Chair',2040000076,['Modern']),item(7,'Unknown',null),item(8,'Offer light',null),item(9,'Offer rug',null)];
 const groups=seriesShelves(rows,[{key:'shop:1',label:'Offer',kind:'shop',ids:[8,9]}]);
 assert.equal(groups[0].kind,'shop');
 assert.deepEqual(groups.find(g=>g.key==='set:2040000081').items.map(i=>i.itemId),[1,2]);
 assert.notEqual(groups.find(g=>g.items.some(i=>i.itemId===3)).key,groups.find(g=>g.items.some(i=>i.itemId===4)).key);
 assert.notEqual(groups.find(g=>g.items.some(i=>i.itemId===5)).key,groups.find(g=>g.items.some(i=>i.itemId===6)).key);
 assert.deepEqual(groups.flatMap(g=>g.items.map(i=>i.itemId)).sort((a,b)=>a-b),rows.map(i=>i.itemId));
});
test('variant grouping needs shared source prefab and different verified colors, not names alone',()=>{
 const a=item(1,'Black Dining Table',2040000103,[], 'Furniture',{prefabGuid:'abc',tags:[['color','Black'],['furnitureKind','Table']]});
 const b=item(2,'White Dining Table',2040000103,[], 'Furniture',{prefabGuid:'abc',tags:[['color','White'],['furnitureKind','Table']]});
 const c={...b,itemId:3,prefabGuid:'different'};
 assert.deepEqual(designTiles([a,b,c]).map(t=>t.items.map(i=>i.itemId)),[[1,2],[3]]);
 assert.equal(designTiles([{...a,prefabGuid:null},{...b,prefabGuid:null}]).length,2);
});

test('current DB-01 projection preserves all special-universe IDs through series and variants',async()=>{
 const {readFileSync}=await import('node:fs');
 const {loadPinnedPublicNativeShopSnapshot,loadPinnedHistoricalNativeShopSnapshot}=await import('../src/lib/acquisition/public-native-shop.ts');
 const {loadPublicStarpath}=await import('../src/lib/guide/public-starpath.ts');
 const read=p=>readFileSync(new URL('../static/'+p,import.meta.url));
 const versions=JSON.parse(read('ddv/item-master-releases.json'));
 const entry=versions.releases.find(e=>e.gameVersion===versions.current);
 const catalog=JSON.parse(read('ddv/item-master/steam-'+versions.current+(entry.complete?'-complete':'')+'/explore.json'));
 const fetcher=async url=>new Response(read(String(url).replace(/^\/Wand\//,'')));
 const [current,archive,starpath]=await Promise.all([loadPinnedPublicNativeShopSnapshot('/Wand',fetcher),loadPinnedHistoricalNativeShopSnapshot('/Wand',fetcher),loadPublicStarpath('/Wand/guide/public/starpath-cache-2026-11-22.json',fetcher)]);
 const releases=[...current.offers,...archive.offers].filter(o=>o.title).map(o=>({key:'shop:'+o.nativeOfferId+':'+o.components.map(c=>c.itemId).join(','),label:o.title,kind:'shop',ids:o.components.map(c=>Number(c.itemId))}));
 for(const season of starpath.seasons)releases.push({key:'season:'+season.id,label:season.title,kind:'season',ids:[...season.rewardPages,...season.bonusPages].flatMap(p=>p.rewards.map(r=>Number(r.itemId)))});
 for(const universe of [2000500023,2000500017]){
  const rows=catalog.items.filter(i=>i.universes.includes(universe));
  const groups=seriesShelves(rows,releases);
  const ids=groups.flatMap(g=>designTiles(g.items).flatMap(t=>t.items.map(i=>i.itemId)));
  assert.deepEqual(ids.sort((a,b)=>a-b),rows.map(i=>i.itemId).sort((a,b)=>a-b));
  assert.ok(groups.length>1);
  const byKind={};for(const g of groups)byKind[g.kind]=(byKind[g.kind]??0)+g.items.length;
  const variants=groups.flatMap(g=>designTiles(g.items)).filter(t=>t.items.length>1);
  console.log('EXPLORE_SERIES_CENSUS '+JSON.stringify({universe,total:rows.length,shelves:groups.length,byKind,variantGroups:variants.length,variantItems:variants.reduce((n,t)=>n+t.items.length,0),sampleVariants:variants.slice(0,5).map(t=>t.items.map(i=>i.names.en)),sourceKeySamples:rows.filter(i=>/^(?:Black|White|Dark Wood|Pale Wood) /i.test(i.names.en??'')).slice(0,12).map(i=>({name:i.names.en,key:i.nativeKey,footprint:!!i.footprintSignature,prefab:!!i.prefabGuid}))}));
 }
});

test('distinct prefab color variants require exact original key stem and full matching footprint',()=>{
 const a=item(1,'Black Dining Table',2040000103,[],'Furniture',{nativeKey:'DiningTable_Black',footprintSignature:'grid1',prefabGuid:'a',tags:[['color','Black'],['furnitureKind','Table']]});
 const b=item(2,'White Dining Table',2040000103,[],'Furniture',{nativeKey:'DiningTable_White',footprintSignature:'grid1',prefabGuid:'b',tags:[['color','White'],['furnitureKind','Table']]});
 assert.deepEqual(designTiles([a,b]).map(t=>t.items.map(i=>i.itemId)),[[1,2]]);
 assert.equal(designTiles([a,{...b,footprintSignature:'grid2'}]).length,2);
 assert.equal(designTiles([a,{...b,nativeKey:'Different_White'}]).length,2);
});
