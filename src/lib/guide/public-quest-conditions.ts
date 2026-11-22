/**
 * DB-03 curated public Quest activation clauses from source-verified Steam
 * Mission.json. The complete owner-private shards and Condition index are NOT
 * shipped. The static AND/OR/NOT structure is preserved, never evaluated
 * against a player's save, location, DLC ownership or online availability.
 */
import {verifyPublicQuestIndex} from './public-guide.mjs';

export const PUBLIC_QUEST_CONDITIONS_SCHEMA='wand.db03.public-quest-conditions@2' as const;
export const PUBLIC_QUEST_CONDITIONS_FILE='quest-conditions-1.26.2-v2.json.gz.b64';
export const PUBLIC_QUEST_CONDITIONS_SHA256='adb57346bf52992f08691293043ac584f1e5d5983180c9c0ef9025da7f81e66f';
const DATA_BYTES=114107;
const BASE64_BYTES=16700;
const MISSION_SHA='f13958b52234f4cda92f0dd0bfff50be8a7f6625c8478785e2a077a5c7933d24';
const CONDITION_SHA='9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c';
const ID=/^[1-9][0-9]{0,15}$/;
const OPERATORS=['AND','OR','NOT'] as const;
export type PublicConditionOperator=(typeof OPERATORS)[number];
export type PublicConditionScalar=string|number|boolean;
export interface PublicConditionPredicate{
  readonly type:'predicate';
  readonly kind:string;
  readonly sourceFields:Readonly<Record<string,PublicConditionScalar>>;
}
export interface PublicConditionNested{
  readonly type:'nested';
  readonly tree:PublicConditionBranch;
}
export type PublicConditionNode=PublicConditionPredicate|PublicConditionNested;
export interface PublicConditionBranch{
  readonly operator:PublicConditionOperator;
  readonly clauses:readonly PublicConditionNode[];
}
export interface PublicQuestConditionRecord{
  readonly id:string;
  readonly availability:PublicConditionBranch|null;
  readonly unlock:PublicConditionBranch|null;
}
export interface PublicQuestConditionReader{
  readonly schema:typeof PUBLIC_QUEST_CONDITIONS_SCHEMA;
  readonly targetVersion:'1.26.2';
  readonly sourceProjectionVersion:'1.26.1';
  readonly coverage:Readonly<{
    quests:733;leaves:2515;availableWithLeaves:733;unlockWithLeaves:311;
    predicatesWithoutSelectedScalars:3;originallyUnprojected:80;
    restoredOriginalScalars:77;nativePayloadHasNoScalar:3;
    sourceIsStaticNotPlayerProgress:true;
    runtimePrerequisitesVerified:false;
  }>;
  getQuest(id:string):PublicQuestConditionRecord|null;
}
type Obj=Record<string,unknown>;
function obj(x:unknown):x is Obj{
  return !!x&&typeof x==='object'&&!Array.isArray(x);
}
function assert(ok:unknown,reason:string):asserts ok{
  if(!ok)throw new TypeError('PUBLIC_QUEST_CONDITIONS_'+reason);
}
function nativeId(x:unknown):x is string{
  return typeof x==='string'&&ID.test(x)&&Number.isSafeInteger(Number(x));
}
function scalar(x:unknown):x is PublicConditionScalar{
  return typeof x==='string'&&x.length<=512||
    typeof x==='number'&&Number.isSafeInteger(x)||
    typeof x==='boolean';
}
function shaHex(buffer:ArrayBuffer):Promise<string>{
  return crypto.subtle.digest('SHA-256',buffer).then(bytes=>
    [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join(''));
}
/** Parse a source-authenticated projection; no inferred or omitted predicate is
 * allowed to become a true statement or a standalone prerequisite.
 */
export function decodePublicQuestConditions(doc:unknown,publicQuestIndex:unknown):PublicQuestConditionReader{
  const questIndex=verifyPublicQuestIndex(publicQuestIndex);
  assert(obj(doc)&&doc.schema===PUBLIC_QUEST_CONDITIONS_SCHEMA&&
    obj(doc.target)&&doc.target.platform==='Steam'&&doc.target.gameVersion==='1.26.2'&&
    obj(doc.provenance)&&doc.provenance.sourceProjectionVersion==='1.26.1'&&
    doc.provenance.originalMissionSha256===MISSION_SHA&&
    doc.provenance.currentConditionSha256===CONDITION_SHA&&
    doc.provenance.sourceIsStaticNotPlayerProgress===true&&
    doc.provenance.conditionTreesNotRuntimePrerequisites===true&&
    doc.provenance.opaqueFieldsDecodedFromNativeMissionAndIL2CPP===true,'WRONG_PROVENANCE');
  const sourceOperators=doc.operators;
  assert(Array.isArray(sourceOperators)&&
    sourceOperators.length===3&&OPERATORS.every((x,i)=>sourceOperators[i]===x),
    'UNSUPPORTED_BOOLEAN_LOGIC');
  assert(Array.isArray(doc.kinds)&&doc.kinds.length===31&&
    doc.kinds.every((x:unknown)=>typeof x==='string'&&x.length>0&&x.length<100)&&
    new Set(doc.kinds).size===doc.kinds.length&&doc.kinds.includes('SubConditions'),
    'UNSUPPORTED_PREDICATE_CENSUS');
  assert(Array.isArray(doc.fields)&&doc.fields.length===58&&
    doc.fields.every((x:unknown)=>typeof x==='string'&&/^[a-zA-Z]{2,45}$/.test(x))&&
    new Set(doc.fields).size===doc.fields.length,'UNSUPPORTED_FIELD_CENSUS');
  assert(obj(doc.counts)&&doc.counts.quests===733&&doc.counts.leaves===2515&&
    doc.counts.availableWithLeaves===733&&doc.counts.unlockWithLeaves===311&&
    doc.counts.predicatesWithoutSelectedScalars===3&&
    doc.counts.originallyUnprojected===80&&
    doc.counts.restoredOriginalScalars===77&&
    doc.counts.nativePayloadHasNoScalar===3,'INVALID_SOURCE_CENSUS');
  assert(Array.isArray(doc.records)&&doc.records.length===733,'MISSING_QUESTS');
  const byId=new Map<string,PublicQuestConditionRecord>();
  let leaves=0,missingScalars=0,available=0,unlock=0;
  const kinds=doc.kinds as string[],fields=doc.fields as string[];
  const subCode=kinds.indexOf('SubConditions');
  function branch(raw:unknown,depth:number):PublicConditionBranch|null{
    if(raw===null)return null;
    assert(depth<=24&&Array.isArray(raw)&&raw.length===2&&
      Number.isInteger(raw[0])&&raw[0]>=0&&raw[0]<3&&
      Array.isArray(raw[1])&&raw[1].length<=256,'INVALID_BRANCH');
    const clauses:PublicConditionNode[]=[];
    for(const leaf of raw[1]){
      leaves++;assert(leaves<=4000,'TOO_MANY_CLAUSES');
      assert(Array.isArray(leaf)&&leaf.length===2&&
        Number.isInteger(leaf[0])&&leaf[0]>=0&&leaf[0]<kinds.length,
        'INVALID_PREDICATE');
      if(leaf[0]===subCode){
        const nested=branch(leaf[1],depth+1);
        assert(nested,'EMPTY_NESTED_SOURCE');
        clauses.push(Object.freeze({type:'nested' as const,tree:nested}));
        continue;
      }
      assert(Array.isArray(leaf[1])&&leaf[1].length<=fields.length,'INVALID_FIELDS');
      const values:Record<string,PublicConditionScalar>={};
      let lastField=-1;
      for(const item of leaf[1]){
        assert(Array.isArray(item)&&item.length===2&&
          Number.isInteger(item[0])&&item[0]>lastField&&item[0]<fields.length&&
          scalar(item[1]),'INVALID_SOURCE_SCALAR');
        values[fields[item[0]]]=item[1];
        lastField=item[0];
      }
      if(leaf[1].length===0)missingScalars++;
      clauses.push(Object.freeze({
        type:'predicate' as const,kind:kinds[leaf[0]],
        sourceFields:Object.freeze(values)
      }));
    }
    return Object.freeze({
      operator:OPERATORS[raw[0] as 0|1|2],
      clauses:Object.freeze(clauses)
    });
  }
  for(const entry of doc.records){
    assert(Array.isArray(entry)&&entry.length===3&&nativeId(entry[0])&&!byId.has(entry[0]),
      'INVALID_QUEST_RECORD');
    const a=branch(entry[1],0),u=branch(entry[2],0);
    if(a?.clauses.length)available++;
    if(u?.clauses.length)unlock++;
    byId.set(entry[0],Object.freeze({id:entry[0],availability:a,unlock:u}));
  }
  assert(leaves===2515&&missingScalars===3&&available===733&&unlock===311,
    'WRONG_SOURCE_AGGREGATES');
  assert(questIndex.quests.every((row:{id:string})=>byId.has(row.id)),
    'FOREIGN_OR_MISSING_PUBLIC_QUEST');
  const coverage=Object.freeze({
    quests:733 as const,leaves:2515 as const,availableWithLeaves:733 as const,
    unlockWithLeaves:311 as const,predicatesWithoutSelectedScalars:3 as const,
    originallyUnprojected:80 as const,restoredOriginalScalars:77 as const,
    nativePayloadHasNoScalar:3 as const,
    sourceIsStaticNotPlayerProgress:true as const,runtimePrerequisitesVerified:false as const
  });
  return Object.freeze({
    schema:PUBLIC_QUEST_CONDITIONS_SCHEMA,targetVersion:'1.26.2' as const,
    sourceProjectionVersion:'1.26.1' as const,coverage,
    getQuest(id:string){return nativeId(id)?byId.get(id)??null:null;}
  });
}
/** Only the small curated public artifact is downloaded. Browser decompression
 * is native and never requires raw game originals or any local save.
 */
export async function loadPublicQuestConditions(
  publicQuestIndex:unknown,url:string,fetcher:typeof fetch=fetch
):Promise<PublicQuestConditionReader>{
  assert(typeof url==='string'&&url.length>0&&url.length<2048,'INVALID_URL');
  assert(typeof DecompressionStream==='function'&&typeof crypto?.subtle?.digest==='function',
    'BROWSER_DECOMPRESSION_UNAVAILABLE');
  const response=await fetcher(url);
  assert(response.ok,'DOWNLOAD_FAILED');
  const encoded=(await response.text()).trim();
  assert(encoded.length===BASE64_BYTES&&/^[A-Za-z0-9+/]+={0,2}$/.test(encoded),
    'UNEXPECTED_ASSET_SIZE');
  const packed=Uint8Array.from(atob(encoded),x=>x.charCodeAt(0));
  assert(packed.byteLength<=20000,'COMPRESSED_ASSET_TOO_LARGE');
  const compressed=packed.buffer as ArrayBuffer;
  const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const raw=await new Response(stream).arrayBuffer();
  assert(raw.byteLength===DATA_BYTES&&await shaHex(raw)===PUBLIC_QUEST_CONDITIONS_SHA256,
    'SOURCE_FINGERPRINT_MISMATCH');
  return decodePublicQuestConditions(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),
    publicQuestIndex);
}

/** Factual source labels, not an evaluated runtime unlock graph. */
export function publicConditionDisplay(
  node:PublicConditionNode,publicIndex:{quests:readonly {id:string;names:Record<string,string>}[];
  characters:Record<string,Record<string,string>>},locale='ja'
):string{
  if(node.type==='nested')return '('+publicConditionText(node.tree,publicIndex,locale)+')';
  const v=node.sourceFields;
  const questName=(id:unknown)=>{
    const known=publicIndex.quests.find(row=>row.id===id);
    return known?.names?.[locale]||known?.names?.en||String(id??'不明');
  };
  const characterName=(id:unknown)=>{
    const known=typeof id==='string'?publicIndex.characters[id]:undefined;
    return known?.[locale]||known?.en||String(id??'不明');
  };
  const compare=(value:unknown)=>{
    const name=String(value??'');
    const symbols:Record<string,string>={
      Equal:'=',NotEqual:'≠',LessThan:'<',LessThanOrEqual:'≤',
      GreaterThan:'>',GreaterThanOrEqual:'≥'
    };
    return symbols[name]??(name?'('+name+')':'（比較未抽出）');
  };
  const originId=(value:unknown)=>value===undefined?'未抽出':String(value);
  let result:string;
  switch(node.kind){
    case 'MissionCompleted':
      result='「'+questName(v.missionId)+'」完了';break;
    case 'MissionStatus':
      result='「'+questName(v.missionId)+'」の状態：'+String(v.missionState??'未抽出');break;
    case 'MissionStepCompleted':
      result='「'+questName(v.missionId)+'」のステップ'+String(v.stepId??'不明')+'完了';break;
    case 'MissionStepStatus':
      result='「'+questName(v.missionId)+'」のステップ'+String(v.stepId??'不明')+'：'+String(v.status??'状態未抽出');break;
    case 'CharacterUnlocked':
      result='「'+characterName(v.characterId)+'」解放';break;
    case 'CharacterFriendship':
      result='「'+characterName(v.characterId)+'」友情レベル'+
        (v.comparisonOperator==='GreaterThanOrEqual'?' ≥ ':v.comparisonOperator==='Equal'?' = ':'（比較 '+String(v.comparisonOperator??'不明')+'）')+
        String(v.friendshipLevel??'不明');break;
    case 'AreaUnlocked':
      result='エリア '+String(v.villageArea??'未抽出')+' 解放';break;
    case 'CommonConditions':
      result='共通条件 '+String(v.conditionId??'未抽出');break;
    case 'RealmUnlocked':
      result='レルム '+String(v.universeId??'未抽出')+' 解放';break;
    case 'Inventory':
      result='アイテム '+String(v.itemId??'未抽出')+' '+String(v.amount??'数量未抽出');break;
    case 'Date':
      result='日時 '+compare(v.comparisonOperator)+' '+String(v.dateUtc??'値未抽出')+
        (v.localTime===true?'（原本UTC値・ローカル時刻比較）':'（原本UTC値）');break;
    case 'Timestamp':
      result='日時記録'+(v.elapsedSeconds!==undefined
        ?'からの経過 '+compare(v.comparisonOperator)+' '+v.elapsedSeconds+'秒'
        :v.numberOfResets!==undefined
          ?'のリセット回数 '+compare(v.comparisonOperator)+' '+v.numberOfResets
          :'（判定値未抽出）');break;
    case 'CharacterSkin':
      result='キャラクタースキン '+originId(v.skinId)+'：'+
        String(v.skinCondition??'状態未抽出');break;
    case 'DialogueFlag':
      result='会話フラグ '+originId(v.dialogueFlagId);break;
    case 'FloatingFestivalTime':
      result='フローティングフェスティバル '+String(v.eventKey??'イベント指定なし')+
        '：要求状態 '+String(v.requestedEventAvailability??'未抽出');break;
    case 'EventTimeSegment':
      result='イベント '+String(v.eventKey??'未抽出')+'：区分 '+
        String(v.eventSegment??'未抽出');break;
    case 'MemoryShard':
      result='記憶の欠片 '+originId(v.shardId)+'：進捗 '+
        compare(v.comparisonOperator)+' '+originId(v.progress);break;
    case 'KeyholeStatus':
      result='鍵穴 '+originId(v.keyholeKey)+'：状態比較 '+
        String(v.keyholeStatusOperator??'未抽出');break;
    case 'MountIsUnlocked':
      result='マウント '+originId(v.mountId)+'：解放状態';break;
    case 'StoreFront':
      result='販売プラットフォーム '+compare(v.equalOperator)+' '+
        String(v.storeFront??'未抽出');break;
    case 'OfflineAgegate':
      result='年齢確認ゲート条件';break;
    case 'Hourglass':
      result='砂時計レベル '+compare(v.comparisonOperator)+' '+
        originId(v.hourglassLevel);break;
    case 'Expansion':
      result=v.expansionName!==undefined?'拡張パック '+v.expansionName:
        '拡張パック条件（原本の対象値は空）';break;
    case 'AlwaysTrue':
      result='常に真（原本設定）';break;
    default:
      result=node.kind+'（原本設定'+(Object.keys(v).length? '・詳細あり':'・値未抽出')+'）';
  }
  return v.inversed===true?'否定('+result+')':result;
}
export function publicConditionText(
  branch:PublicConditionBranch|null,
  publicIndex:{quests:readonly {id:string;names:Record<string,string>}[];
  characters:Record<string,Record<string,string>>},
  locale='ja'
):string{
  if(!branch||!branch.clauses.length)return '条件の指定なし';
  const all=branch.clauses.map(n=>publicConditionDisplay(n,publicIndex,locale));
  if(branch.operator==='NOT')return 'NOT ('+all.join(' , ')+')';
  return all.join(branch.operator==='AND'?' かつ ':' または ');
}
