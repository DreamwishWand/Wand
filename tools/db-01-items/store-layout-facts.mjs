/** Build-only original StoreLayoutArea predicates and Display Item relations.
 * A match compares only declared type/subtype and direct source tag criteria.
 * It never evaluates grid qualifiers, dynamic tags, runtime state or stock.
 */
import {readFileSync,existsSync} from 'node:fs';
const SHA=/^[0-9a-f]{64}$/;
const check=(ok,code)=>{if(!ok)throw Error('DB01_STORE_LAYOUT_'+code)};
const SHELF_TYPES=['Feet','Back','Hand','Head','Neck','Top','Bottom','Costume','Jewelry',
  'SmallFurniture','Trimming','WallFurniture','BayWindowFurniture'];
export function buildStoreLayoutFacts(source,rows,screens){
  const result={areas:[],displayDefinitions:new Map(),sequenceLinks:new Map(),candidates:new Map(),dimensionComparisons:new Map()};
  const version=source.target.gameVersion;
  check(/^\d+\.\d+\.\d+$/.test(version),'VERSION');
  const path=new URL('../../data/ddv/item-master/store-layout-source-steam-'+version+'.json',import.meta.url);
  if(!existsSync(path))return result;
  const d=JSON.parse(readFileSync(path,'utf8'));
  check(d.schema==='wand.db01.store-layout-source@1'&&d.target.platform==='Steam'&&d.target.gameVersion===version&&
    SHA.test(d.sourceProtoDbSha256)&&d.sourceIl2cppDumpSha256===source.sourceIl2cppDumpSha256&&
    ['Display','Furniture','Clothing'].every(k=>d.sourceFiles[k]===source.sourceFilesSha256[k]),'SOURCE');
  const byId=new Map(rows.map(r=>[r.itemId,r]));
  const idOf=(id,c)=>Number.isSafeInteger(id)&&id>0&&byId.has(id)&&(!c||byId.get(id).nativeCategory===c);
  const isInts=v=>Array.isArray(v)&&v.length>0&&v.every(n=>Number.isSafeInteger(n)&&n>=0);
  const byKey=new Map();
  for(const [key,recordIndex,sourceRecordSha256,filter] of d.areas){
    check(/^StoreLayoutArea_[A-Za-z0-9]+$/.test(key)&&!byKey.has(key)&&
      Number.isInteger(recordIndex)&&SHA.test(sourceRecordSha256)&&
      filter.min===1&&[1,100000].includes(filter.max),'AREA');
    check(!filter.typeCodes||isInts(filter.typeCodes),'TYPE');
    check(!filter.subtypes||filter.subtypes.every(([kind,values])=>[3,6,7].includes(kind)&&isInts(values)),'SUBTYPE');
    for(const field of ['allTags','anyTags'])
      check(!filter[field]||isInts(filter[field])&&filter[field].every(id=>idOf(id,'Tag')),'TAG');
    check(!filter.anyTags||typeof filter.invertAnyTags==='boolean','TAG_INVERT');
    if(filter.grid){
      const g=filter.grid;
      for(const field of ['minArea','maxArea'])check(!g[field]||isInts(g[field])&&g[field].length===2,'GRID_SIZE');
      for(const field of ['sizeQualifiers','excludedLayers'])check(!g[field]||isInts(g[field]),'GRID_ENUM');
      check(!g.ignoreSizeForTags||g.ignoreSizeForTags.every(id=>idOf(id,'Tag')),'GRID_TAG');
    }
    const area={key,recordIndex,sourceRecordSha256,filter,sourceProtoDbSha256:d.sourceProtoDbSha256};
    byKey.set(key,area);result.areas.push(area);
  }
  check(result.areas.length===27&&result.areas.every((a,i)=>a.recordIndex===1895+i),'AREA_CENSUS');
  const seq=(id,relation)=>{const a=result.sequenceLinks.get(id)??[];a.push(relation);result.sequenceLinks.set(id,a);};
  let sequenceCount=0;
  for(const [id,key,kind,shelf,layouts,sequences,extraAmount,alternate] of d.displays){
    check(idOf(id,'Display')&&byId.get(id).nativeKey===key&&!result.displayDefinitions.has(id)&&[1,2].includes(kind),'DISPLAY');
    check(alternate===null||idOf(alternate,'Display'),'ALTERNATE');
    check(kind===1?shelf.length===0&&layouts.length>0:layouts.length===0&&shelf.length>0,'DISPLAY_KIND');
    const shelfSlots=shelf.map(([typeCode,amount])=>{
      const areaKey='StoreLayoutArea_'+SHELF_TYPES[typeCode];
      check(byKey.has(areaKey)&&Number.isSafeInteger(amount)&&amount>0,'SHELF');
      return {typeCode,amount,areaKey};
    });
    const stageLayouts=layouts.map(([typeCode,weight])=>{
      check([0,1,2,3,4,5,6].includes(typeCode)&&Number.isSafeInteger(weight)&&weight>0,'LAYOUT');
      return {typeCode,weight};
    });
    const itemSequences=sequences.map(([layoutType,itemIds,applyToBuildingIds],sequenceIndex)=>{
      check((kind===1?stageLayouts.some(l=>l.typeCode===layoutType):layoutType===null)&&
        itemIds.length>0&&itemIds.every(i=>idOf(i))&&applyToBuildingIds.every(i=>idOf(i,'Building')),'SEQUENCE');
      itemIds.forEach((itemId,position)=>{
        sequenceCount++;
        seq(itemId,{displayItemId:id,sequenceIndex,position,layoutType,applyToBuildingIds,
          sourceField:kind===1?'DisplayType.StoreStage.ItemsSequence':'DisplayType.StoreShelf.ItemsSequence',
          currentAvailabilityVerified:false});
      });
      return {layoutType,itemIds,applyToBuildingIds};
    });
    result.displayDefinitions.set(id,{kind:kind===1?'stage':'shelf',shelfSlots,stageLayouts,itemSequences,
      extraAmount,alternateOfDisplayItemId:alternate,sourceDisplaySha256:d.sourceFiles.Display,
      currentAvailabilityVerified:false});
  }
  check(result.displayDefinitions.size===17&&result.sequenceLinks.size===15&&sequenceCount===19,'DISPLAY_CENSUS');
  // Reuse the existing three verified native screening predicates. Restrict
  // this comparison to their scope. Source-direct tag matches are not
  // assertions about native dynamic or set-derived tag resolution.
  const counts={Furniture:0,Clothing:0},matches={Furniture:0,Clothing:0},perArea={};
  for(const row of rows){
    if(screens.get(row.itemId)?.status!=='not_excluded_by_reviewed_gates')continue;
    const category=row.nativeCategory;
    check(category==='Furniture'||category==='Clothing','SCREEN_SCOPE');
    const kind=category==='Furniture'?3:6,typeCode=category==='Furniture'?4:5;
    check(row.itemType.code===typeCode&&row.itemType.subtypeNameVerified,'ITEM_TYPE');
    const sub=row.itemType.subtypeCode;
    const tags=new Set(row.tags.filter(t=>t.sourceField===9).map(t=>t.id));
    const matchingAreas=result.areas.filter(({filter:f})=>
      (!f.typeCodes||f.typeCodes.includes(typeCode))&&
      (!f.subtypes||f.subtypes.some(([k,values])=>k===kind&&values.includes(sub)))&&
      (!f.allTags||f.allTags.every(id=>tags.has(id)))&&
      (!f.anyTags||f.anyTags.some(id=>tags.has(id))!==f.invertAnyTags)
    );
    counts[category]++;
    if(matchingAreas.length)matches[category]++;
    const matchingAreaKeys=matchingAreas.map(a=>a.key);
    const gridReviewAreaKeys=matchingAreas.filter(a=>a.filter.grid).map(a=>a.key);
    // Compare serialized dimensions to the original explicit numeric bounds.
    // This does not evaluate GridAreaSizeQualifier, layer exclusions, dynamic
    // tags, ignored-size handling, stride, or the native layout predicate.
    const g=row.sourceAttributes?.GridAreaData;
    const size=g&&Number.isSafeInteger(g.SizeX)&&g.SizeX>0&&
      Number.isSafeInteger(g.SizeY)&&g.SizeY>0?[g.SizeX,g.SizeY]:null;
    const within=(xy,filter)=>xy.every((n,i)=>
      (!filter.minArea||n>=filter.minArea[i])&&(!filter.maxArea||n<=filter.maxArea[i]));
    const comparisons=matchingAreas.filter(a=>a.filter.grid).map(a=>{
      const f=a.filter.grid;
      return {areaKey:a.key,sourceSizeXY:size,
        directWithinNumericBounds:size?within(size,f):null,
        swappedWithinNumericBounds:size&&f.canRotate===true?within([size[1],size[0]],f):null,
        directIgnoreSizeTagIds:(f.ignoreSizeForTags??[]).filter(id=>tags.has(id)),
        gridPredicateEvaluated:false,storeMembershipVerified:false,
        currentAvailabilityVerified:false};
    });
    if(comparisons.length)result.dimensionComparisons.set(row.itemId,comparisons);
    for(const key of matchingAreaKeys)perArea[category+'.'+key]=(perArea[category+'.'+key]??0)+1;
    result.candidates.set(row.itemId,{matchingAreaKeys,gridReviewAreaKeys,
      basis:'native_type_subtype_and_direct_source_tags',
      runtimeTagMatchingVerified:false,gridPredicateEvaluated:false,
      storeMembershipVerified:false,currentAvailabilityVerified:false});
  }
  check(counts.Furniture===1544&&counts.Clothing===904&&matches.Furniture===1544&&matches.Clothing===864,'MATCH_CENSUS');
  check(perArea['Clothing.StoreLayoutArea_Top']===205&&perArea['Clothing.StoreLayoutArea_Jewelry']===140&&
    perArea['Furniture.StoreLayoutArea_10x10']===23&&perArea['Furniture.StoreLayoutArea_WallFurniture']===298,'MATCH_SAMPLE_CENSUS');
  console.log('DB01_STORE_LAYOUT '+JSON.stringify({counts,matches,perArea,sequenceCount}));
  return result;
}
