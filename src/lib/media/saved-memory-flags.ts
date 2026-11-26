export interface SavedMemoryFlags{
  readonly contract:'wand.memory.raw-flags@1';
  readonly saveSchema:number|null;
  readonly status:'unsupported_schema'|'not_observed'|'incompatible_structure'|'partial_inconclusive'|'observed_empty'|'observed';
  readonly entries:Readonly<Record<string,number>>;
  readonly pieceBitMappingVerified:false;
  readonly saveFileModified:false;
}
const statuses=new Set(['unsupported_schema','not_observed','incompatible_structure','partial_inconclusive','observed_empty','observed']);
function obj(x:unknown):x is Record<string,unknown>{return x!==null&&typeof x==='object'&&!Array.isArray(x);}
export function sanitizeSavedMemoryFlags(x:unknown):SavedMemoryFlags{
  const fail=()=>{throw new TypeError('SAVE_MEMORY_FLAGS_INVALID');};
  if(!obj(x)||x.contract!=='wand.memory.raw-flags@1'||x.pieceBitMappingVerified!==false||x.saveFileModified!==false||
    typeof x.status!=='string'||!statuses.has(x.status)||!obj(x.entries))throw new TypeError('SAVE_MEMORY_FLAGS_INVALID');
  const schema=x.saveSchema;
  if(schema!==null&&(typeof schema!=='number'||!Number.isSafeInteger(schema)))fail();
  const rows=Object.entries(x.entries);
  if(rows.length>4096)fail();
  const supported=schema===626||schema===643;
  if((x.status==='unsupported_schema')===supported)fail();
  if(!['observed','partial_inconclusive'].includes(x.status)&&rows.length)fail();
  if(x.status==='observed'&&!rows.length)fail();
  const entries:Record<string,number>=Object.create(null);
  for(const [key,value] of rows){
    const id=Number(key);
    if(!Number.isInteger(id)||id<1||id>2147483647||String(id)!==key||
       typeof value!=='number'||!Number.isInteger(value)||value< -2147483648||value>2147483647)
      throw new TypeError('SAVE_MEMORY_FLAGS_INVALID');
    entries[key]=value;
  }
  return Object.freeze({contract:'wand.memory.raw-flags@1',saveSchema:schema as number|null,
    status:x.status as SavedMemoryFlags['status'],entries:Object.freeze(entries),pieceBitMappingVerified:false,saveFileModified:false});
}
/** No absent entry, negative value or unknown upper bit is treated as zero. */
export function memoryCandidateFlags(projection:SavedMemoryFlags|null|undefined,itemId:number,shards:number):number|null{
  if(!projection||!Number.isInteger(shards)||shards<1||shards>10)return null;
  const value=projection.entries[String(itemId)];
  return Number.isInteger(value)&&value>=0&&value<2**shards?value:null;
}
