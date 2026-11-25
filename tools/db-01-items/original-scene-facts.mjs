/** Fill only missing original SceneItemData fields before canonical columns.
 * Source: original frame fields ID=1, SceneType=6, Tags=17.
 * The sanitized numeric tuples are build inputs, not another runtime DB.
 */
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const SOURCE='d8fc56cfc282323df94461e360c26aaf98a884f01b7bd83cabf967ac2cd397d5';
const DUMP='0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08';
const FACTS='830a0b42835d12957ba5f8c41bbc5c8f30ea4e17c69dcd5a0a92c764f85f9149';
const check=(v,reason)=>{if(!v)throw Error('DB01_ORIGINAL_SCENE_'+reason);};
export function attachOriginalSceneFacts(project,source,byId){
  if(source.target.platform!=='Steam'||source.sourceFilesSha256?.Scene!==SOURCE||
     source.sourceIl2cppDumpSha256!==DUMP)return;
  const path=join(project,'data/ddv/item-master','original-scene-facts-steam-1.26.2.json');
  check(existsSync(path),'MISSING');
  const bytes=readFileSync(path);
  check(createHash('sha256').update(bytes).digest('hex')===FACTS,'FACTS_SHA');
  const rows=JSON.parse(bytes.toString('utf8'));
  check(Array.isArray(rows)&&rows.length===194&&[...byId.values()].filter(r=>r.nativeCategory==='Scene').length===194,'CENSUS');
  let previous=0,types=0,tagged=0;
  for(const [id,type,tags] of rows){
    const row=byId.get(id);
    check(Number.isSafeInteger(id)&&id>previous&&row?.nativeCategory==='Scene'&&row.sourceClass==='SceneItemData','IDENTITY');
    check(type===null||Number.isSafeInteger(type)&&type>=0&&type<=14,'TYPE');
    check(Array.isArray(tags)&&tags.every(t=>byId.get(t)?.nativeCategory==='Tag'),'TAGS');
    previous=id;
    const attributes=row.sourceAttributes??(row.sourceAttributes={});
    const current=key=>Object.hasOwn(row.nativeProperties,key)?row.nativeProperties[key]:attributes[key];
    const put=(key,value)=>{
      const old=current(key);
      if(old===undefined)attributes[key]=value;
      else check(JSON.stringify(old)===JSON.stringify(value),'CONFLICT_'+id+'_'+key);
    };
    if(type!==null){types++;put('SceneType',type);}
    else check(current('SceneType')===undefined,'OMITTED_TYPE');
    if(tags.length){tagged++;put('Tags',tags);}
    else check(current('Tags')===undefined||Array.isArray(current('Tags'))&&!current('Tags').length,'EMPTY_TAGS');
    const extracted=row.tags.filter(t=>t.sourceField===17).map(t=>t.id);
    check(!extracted.length||JSON.stringify(extracted)===JSON.stringify(tags),'TAG_CONFLICT');
  }
  check(types===193&&tagged===5,'FACT_CENSUS');
}
