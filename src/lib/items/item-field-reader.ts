/**
 * Service-neutral ItemID field selection and reverse lookup.
 * All columns are generated from the same canonical release as the complete
 * row shards. Missing field, explicit null, and unknown ItemID stay distinct.
 */
export type ItemFieldScalar=string|number|boolean|null;
export type ItemFieldValue=ItemFieldScalar|readonly ItemFieldValue[]|
  {readonly [key:string]:ItemFieldValue};
export type ItemFieldRow=readonly [number,ItemFieldValue];
export interface ItemFieldBlock {
  readonly path:string;
  readonly firstId:number;
  readonly lastId:number;
  readonly count:number;
}
export interface ItemFieldInfo {
  readonly field:string;
  readonly count:number;
  readonly blocks:readonly ItemFieldBlock[];
}
export interface ItemFieldProjection {
  readonly itemId:number;
  readonly values:Readonly<Record<string,ItemFieldValue>>;
}
export type ItemFieldMatch={readonly kind:'present'}|
  {readonly kind:'equals'|'contains';readonly value:ItemFieldScalar};
export interface ItemFieldReader {
  getFieldCatalog():Promise<readonly ItemFieldInfo[]>;
  getFieldRows(field:string):Promise<readonly ItemFieldRow[]>;
  getItemFields(ids:readonly number[],fields:readonly string[]):
    Promise<readonly (Readonly<ItemFieldProjection>|null)[]>;
  findItemIdsByField(field:string,match:ItemFieldMatch):Promise<readonly number[]>;
}
type AssetInfo=Readonly<{count:number;bytes:number;sha256:string}>;
const FIELD=/^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)?$/;
const ID=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function check(v:unknown,code:string):asserts v{
  if(!v)throw Error('ITEM_MASTER_FIELD_'+code);
}
function scalar(v:unknown):v is ItemFieldScalar{
  return v===null||typeof v==='string'||typeof v==='boolean'||
    typeof v==='number'&&Number.isFinite(v);
}
function valid(v:unknown,depth=0):v is ItemFieldValue{
  return depth<=24&&(scalar(v)||Array.isArray(v)&&v.every(x=>valid(x,depth+1))||
    obj(v)&&Object.values(v).every(x=>valid(x,depth+1)));
}
function fieldName(v:unknown):v is string{
  return typeof v==='string'&&FIELD.test(v)&&!v.split('.').some(s=>
    ['__proto__','constructor','prototype'].includes(s));
}
export function createItemFieldReader(
  definitionCount:number,assets:Readonly<Record<string,AssetInfo>>|undefined,
  load:(path:string)=>Promise<unknown>,
):ItemFieldReader{
  let catalogTask:Promise<ReadonlyMap<string,ItemFieldInfo>>|undefined;
  async function catalog():Promise<ReadonlyMap<string,ItemFieldInfo>>{
    if(catalogTask)return catalogTask;
    const task=(async()=>{
      const raw=await load('fields/index.json');
      check(obj(raw)&&raw.schema==='wand.item-master.fields@1'&&
        raw.definitionCount===definitionCount&&Array.isArray(raw.fields)&&
        raw.fields.length===assets?.['fields/index.json']?.count,'CATALOG');
      const map=new Map<string,ItemFieldInfo>();
      for(const entry of raw.fields){
        check(obj(entry)&&fieldName(entry.field)&&!map.has(entry.field)&&
          ID(entry.count)&&entry.count<=definitionCount&&Array.isArray(entry.blocks)&&
          entry.blocks.length>0,'CATALOG_ENTRY');
        let count=0,last=0;
        for(const [i,block] of entry.blocks.entries()){
          check(obj(block)&&block.path==='fields/'+entry.field+'/'+i+'.json'&&
            ID(block.firstId)&&ID(block.lastId)&&block.firstId>last&&
            block.lastId>=block.firstId&&ID(block.count)&&block.count<=4096&&
            assets?.[block.path as string]?.count===block.count,'CATALOG_BLOCK');
          count+=block.count;last=block.lastId;
        }
        check(count===entry.count,'CATALOG_COUNT');
        map.set(entry.field,entry as unknown as ItemFieldInfo);
      }
      check(map.get('itemId')?.count===definitionCount,'IDENTITY_COUNT');
      return map;
    })();
    catalogTask=task;
    try{return await task;}catch(err){if(catalogTask===task)catalogTask=undefined;throw err;}
  }
  async function info(field:string):Promise<ItemFieldInfo>{
    check(fieldName(field),'INVALID_NAME');
    const found=(await catalog()).get(field);
    check(found,'UNKNOWN_FIELD');
    return found;
  }
  async function blockRows(field:string,block:ItemFieldBlock):Promise<readonly ItemFieldRow[]>{
    const raw=await load(block.path);
    check(obj(raw)&&raw.schema==='wand.item-master.field-block@1'&&raw.field===field&&
      Array.isArray(raw.items)&&raw.items.length===block.count,'BLOCK');
    let last=0;
    for(const pair of raw.items){
      check(Array.isArray(pair)&&pair.length===2&&ID(pair[0])&&pair[0]>last&&
        valid(pair[1])&&(field!=='itemId'||pair[0]===pair[1]),'ROW');
      last=pair[0];
    }
    check(raw.items[0][0]===block.firstId&&last===block.lastId,'BLOCK_RANGE');
    return raw.items as readonly ItemFieldRow[];
  }
  async function rows(field:string,ids?:ReadonlySet<number>):Promise<readonly ItemFieldRow[]>{
    const entry=await info(field);
    const sortedIds=ids?[...ids].sort((a,b)=>a-b):undefined;
    const blocks=entry.blocks.filter(b=>{
      if(!sortedIds)return true;
      let lo=0,hi=sortedIds.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(sortedIds[mid]<b.firstId)lo=mid+1;else hi=mid;}
      return lo<sortedIds.length&&sortedIds[lo]<=b.lastId;
    });
    const result:ItemFieldRow[]=[];
    // Limit concurrent asset loads; no full-row, other-field or other-language loads.
    for(let i=0;i<blocks.length;i+=8){
      const batches=await Promise.all(blocks.slice(i,i+8).map(b=>blockRows(field,b)));
      for(const batch of batches)for(const row of batch)
        if(!ids||ids.has(row[0]))result.push(row);
    }
    return Object.freeze(result);
  }
  return Object.freeze({
    async getFieldCatalog(){return Object.freeze([...(await catalog()).values()]);},
    getFieldRows(field:string){return rows(field);},
    async getItemFields(ids:readonly number[],fields:readonly string[]){
      check(Array.isArray(ids)&&ids.length<=10000&&ids.every(ID),'INVALID_IDS');
      check(Array.isArray(fields)&&fields.length<=256&&fields.every(fieldName),'INVALID_FIELDS');
      const uniqueFields=[...new Set(fields)];
      for(const field of uniqueFields)await info(field);
      const selected=new Set(ids);
      const existing=new Map<number,Record<string,ItemFieldValue>>();
      for(const [id] of await rows('itemId',selected))existing.set(id,Object.create(null));
      const known=new Set(existing.keys());
      for(const field of uniqueFields){
        if(!known.size)break;
        for(const [id,value] of await rows(field,known))existing.get(id)![field]=value;
      }
      const output=new Map<number,Readonly<ItemFieldProjection>>();
      for(const [id,values] of existing)output.set(id,Object.freeze({itemId:id,values:Object.freeze(values)}));
      return Object.freeze(ids.map(id=>output.get(id)??null));
    },
    async findItemIdsByField(field:string,match:ItemFieldMatch){
      check(obj(match)&&(match.kind==='present'||
        (match.kind==='equals'||match.kind==='contains')&&scalar(match.value)),'INVALID_MATCH');
      const found=(await rows(field)).filter(([,value])=>match.kind==='present'||
        (match.kind==='equals'?value===match.value:
          Array.isArray(value)&&value.some(v=>v===match.value)));
      return Object.freeze(found.map(([id])=>id));
    }
  });
}
