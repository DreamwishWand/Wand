/** Build-only exact FurnitureItemData.Container -> Meta.ContainerInventory link.
 * Preserve unknown template references and serialized size, not actual contents,
 * instantiation, player inventory or runtime capacity.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const PIN='2e6ceff448664b121de001d44ab6a63ade38e8db02c04cdca22881ffe7a4eb5a';
const FURN='cde1b6e4dd37085e829c2e4548b89091bbf8d543cee92e6031b2f5bddc794196';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
const PROTO='dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
const CP='f0830f95341b52386a2268e146c2541229f02f1801b6f2ae2398b4b9b3b18e2f';
const check=(v,c)=>{if(!v)throw Error('DB01_CONTAINER_FURNITURE_'+c)};
const sha=b=>createHash('sha256').update(b).digest('hex');
const positive=v=>Number.isSafeInteger(v)&&v>0;
export function loadContainerFurnitureSources(project,source,byId,protoSha,inventorySources){
  const result=new Map();
  if(source.target.platform!=='Steam'||source.target.gameVersion!=='1.26.2')return result;
  const bytes=readFileSync(join(project,'data/ddv/item-master/container-furniture-source-steam-1.26.2.json'));
  check(sha(bytes)===PIN,'PIN');
  const d=JSON.parse(bytes);
  check(d.schema==='wand.db01.container-furniture-source@1'&&d.target.platform==='Steam'&&d.target.gameVersion==='1.26.2'&&
    protoSha===PROTO&&d.sourceProtoDbSha256===PROTO&&d.sourceIl2cppDumpSha256===DUMP&&source.sourceIl2cppDumpSha256===DUMP&&
    d.sourceFurnitureSha256===FURN&&source.sourceFilesSha256.Furniture===FURN&&
    d.fieldContract.furnitureContainer===28&&d.fieldContract.templateKey===1&&d.fieldContract.upgradeItem===3&&
    d.fieldContract.templateSize===2&&d.fieldContract.templateSlots===3&&
    source.sourceFieldDeclarations.FurnitureItemData.Container===28&&
    d.runtimeContentsVerified===false&&d.capacityRuntimeVerified===false&&d.spawnVerified===false,'SOURCE');
  const templates=new Map();
  let totalSlots=0,totalPopulated=0;
  for(const [name,index,size,slots,populated,recordSha] of d.templates){
    check(typeof name==='string'&&name.length>0&&!templates.has(name)&&Number.isSafeInteger(index)&&index>=0&&positive(size)&&
      Number.isSafeInteger(slots)&&slots>=0&&Number.isSafeInteger(populated)&&populated>=0&&populated<=slots&&
      /^[a-f0-9]{64}$/.test(recordSha),'TEMPLATE');
    templates.set(name,{index,size,slots,populated,recordSha});
    totalSlots+=slots;totalPopulated+=populated;
  }
  check(templates.size===88&&totalSlots===147&&totalPopulated===146,'TEMPLATE_CENSUS');
  const templateContents=new Map();
  for(const [itemId,links] of inventorySources)for(const l of links){
    if(l.kind!=='configured_container_slot')continue;
    check(templates.has(l.sourceId)&&l.sourceProjectionSha256===CP,'TEMPLATE_JOIN');
    const list=templateContents.get(l.sourceId)??[];list.push([itemId,l]);templateContents.set(l.sourceId,list);
  }
  const furnitureIds=new Set(d.furniture.map(r=>r[0]));
  check(furnitureIds.size===136&&d.furniture.length===136,'FURNITURE_CENSUS');
  // Check the full typed owner census against the existing canonical wire observations.
  const observed=[...byId.values()].filter(r=>r.sourceClass==='FurnitureItemData'&&r.observedFields.some(x=>x[0]===28&&x[1]===2));
  check(observed.length===136&&observed.every(r=>furnitureIds.has(r.itemId)),'OWNER_CENSUS');
  let last=0,refs=0,upgrades=0,populatedOwners=0,sourceOccurrences=0,canonicalOccurrences=0;
  const matchedTemplates=new Set(),linkedItems=new Set();
  for(const [id,name,upgrade] of d.furniture){
    const owner=byId.get(id);
    check(positive(id)&&id>last&&owner?.nativeCategory==='Furniture'&&owner.sourceClass==='FurnitureItemData'&&
      owner.observedFields.some(x=>x[0]===28&&x[1]===2&&x[2]===1)&&
      (name===null||templates.has(name))&&(upgrade===null||furnitureIds.has(upgrade)&&upgrade!==id),'OWNER');
    last=id;
    const tpl=name===null?null:templates.get(name);
    if(tpl){refs++;matchedTemplates.add(name);sourceOccurrences+=tpl.populated;if(tpl.populated)populatedOwners++;}
    if(upgrade!==null)upgrades++;
    const contents=(templateContents.get(name)??[]).slice().sort((a,b)=>a[1].sourcePosition-b[1].sourcePosition);
    check(contents.length<=(tpl?.populated??0),'CONTENT_COUNT');
    for(const [itemId,l] of contents){
      const target=inventorySources.get(itemId);
      target.push({kind:'configured_container_furniture_slot',sourceId:id,templateKey:name,
        sourcePosition:l.sourcePosition,configuredAmount:l.configuredAmount,sourceConfiguredSize:tpl.size,
        sourceGameVersion:'1.26.1',sourceProtoDbSha256:PROTO,sourceProjectionSha256:PIN,templateProjectionSha256:CP,
        currentAvailabilityVerified:false,grantVerified:false,playerOwnershipVerified:false});
      canonicalOccurrences++;linkedItems.add(itemId);
    }
    result.set(id,{status:tpl?'configured_template_reference':'container_field_without_template_key',
      templateKey:name,sourceConfiguredSize:tpl?.size??null,upgradedFurnitureItemId:upgrade,
      templateRecordIndex:tpl?.index??null,templateRecordSha256:tpl?.recordSha??null,
      configuredSlotCount:tpl?.slots??null,populatedSlotCount:tpl?.populated??null,
      configuredContentItemIds:[...new Set(contents.map(r=>r[0]))].sort((a,b)=>a-b),
      sourceGameVersion:'1.26.1',sourceFurnitureSha256:FURN,sourceProtoDbSha256:PROTO,sourceProjectionSha256:PIN,
      capacityRuntimeVerified:false,runtimeContentsVerified:false,spawnVerified:false});
  }
  check(refs===131&&matchedTemplates.size===54&&upgrades===16&&populatedOwners===52&&sourceOccurrences===85&&
    canonicalOccurrences<=85&&linkedItems.size<=67,'RELATION_CENSUS');
  console.log('DB01_CONTAINER_FURNITURE '+JSON.stringify({furniture:result.size,refs,upgrades,populatedOwners,sourceOccurrences,canonicalOccurrences,canonicalDistinctContentItems:linkedItems.size}));
  return result;
}
