/** Steam v1.26.2 public Quest source: typed, read-only Character↔Quest index.
 *
 * CharacterName records include NPCs, placeholders and non-villager labels.
 * They do not prove unlockability, residency, current presence or player state.
 * The caller-supplied Quest catalogue must pass the original source validator
 * before this module can derive any public Character↔Quest relation.
 */
import {
  PUBLIC_GUIDE_LOCALES,verifyPublicQuestIndex,formatPublicGuideText
} from './public-guide.mjs';

export type PublicCharacterLocale =
  'ja'|'en'|'fr'|'it'|'de'|'es-ES'|'zh-CN'|'pt-BR';
export type PublicCharacterSearchMode='all'|'withQuests'|'withoutQuests';

export const GUIDE_CHARACTER_DIRECTORY_SCHEMA=
  'wand.db03.public-character-directory@1' as const;
export const GUIDE_CHARACTER_LABEL_CENSUS=Object.freeze({
  labels:142,withLinkedQuests:86,withoutLinkedQuests:56,
  internalMarkers:3,linkedQuests:733
});

export interface PublicCharacterQuest{
  readonly id:string;
  readonly characterId:string;
  readonly names:Readonly<Partial<Record<PublicCharacterLocale,string>>>;
  readonly internalName?:string;
}
export interface PublicCharacterEntry{
  readonly id:string;
  readonly names:Readonly<Record<PublicCharacterLocale,string>>;
  readonly quests:readonly PublicCharacterQuest[];
  readonly internal:boolean;
}
export interface PublicCharacterDirectory{
  readonly schema:typeof GUIDE_CHARACTER_DIRECTORY_SCHEMA;
  readonly gameVersion:'1.26.2';
  readonly sourceDefinitionOnly:true;
  readonly playerUnlockVerified:false;
  readonly counts:Readonly<{
    labels:number;withLinkedQuests:number;withoutLinkedQuests:number;
    internalMarkers:number;linkedQuests:number;
  }>;
  readonly rows:readonly PublicCharacterEntry[];
  readonly byId:ReadonlyMap<string,PublicCharacterEntry>;
}
export interface PublicCharacterSearchInput{
  readonly query?:string;
  readonly locale?:string;
  readonly mode?:string;
  readonly limit?:number;
  readonly offset?:number;
}
export interface PublicCharacterSearchResult{
  readonly total:number;
  readonly rows:readonly PublicCharacterEntry[];
}

type SourceQuest=PublicCharacterQuest;
interface VerifiedQuestCharacterSource{
  readonly characters:Readonly<Record<string,unknown>>;
  readonly quests:readonly SourceQuest[];
}
interface BuildEntry{
  readonly id:string;
  readonly names:Readonly<Record<PublicCharacterLocale,string>>;
  readonly quests:SourceQuest[];
  readonly internal:boolean;
}

const ID=/^[1-9]\d{0,15}$/;
const INTERNAL=/\{(?:LegacyPlaceholder|Placeholder|DoNotTranslate)\}/i;
const LOCALES:readonly PublicCharacterLocale[]=[
  'ja','en','fr','it','de','es-ES','zh-CN','pt-BR'
];
const localeSet=new Set<string>(LOCALES);
const normalize=(value:string):string=>value.normalize('NFKC').toLocaleLowerCase();
function check(ok:unknown,message:string):asserts ok{
  if(!ok)throw new TypeError('Guide characters: '+message);
}
function isObject(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function isLocale(value:string):value is PublicCharacterLocale{
  return localeSet.has(value);
}

/** One verified original Quest ID points to exactly one native Character label.
 * The native Character name is not proof that the label is a playable villager.
 */
export function derivePublicGuideCharacters(index:unknown):PublicCharacterDirectory{
  verifyPublicQuestIndex(index);
  const source=index as VerifiedQuestCharacterSource;
  const byId=new Map<string,BuildEntry>();
  check(isObject(source.characters)&&
    Object.keys(source.characters).length===GUIDE_CHARACTER_LABEL_CENSUS.labels,
    'source label census');
  check(PUBLIC_GUIDE_LOCALES.length===LOCALES.length&&
    LOCALES.every(lang=>PUBLIC_GUIDE_LOCALES.includes(lang)),
    'source locale agreement');

  for(const [id,value] of Object.entries(source.characters)){
    check(ID.test(id)&&Number.isSafeInteger(Number(id))&&
      isObject(value)&&Object.keys(value).length===LOCALES.length&&
      Object.keys(value).every(key=>isLocale(key)&&
        typeof value[key]==='string'&&(value[key] as string).length>0&&
        (value[key] as string).length<=480),'malformed source label');

    const names={} as Record<PublicCharacterLocale,string>;
    for(const lang of LOCALES){
      const label=value[lang];
      check(typeof label==='string','malformed source label');
      names[lang]=label;
    }
    const safeNames=Object.freeze(names);
    byId.set(id,{
      id,names:safeNames,quests:[],
      internal:LOCALES.some(lang=>INTERNAL.test(safeNames[lang]))
    });
  }
  for(const quest of source.quests){
    check(typeof quest.characterId==='string'&&byId.has(quest.characterId),
      'quest linked to unknown source label');
    byId.get(quest.characterId)!.quests.push(quest);
  }
  const rows:PublicCharacterEntry[]=[];
  const directoryMap=new Map<string,PublicCharacterEntry>();
  for(const entry of byId.values()){
    const row=Object.freeze({
      id:entry.id,names:entry.names,
      quests:Object.freeze([...entry.quests]),
      internal:entry.internal
    });
    rows.push(row);
    directoryMap.set(row.id,row);
  }
  const counts=Object.freeze({
    labels:rows.length,
    withLinkedQuests:rows.filter(row=>row.quests.length>0).length,
    withoutLinkedQuests:rows.filter(row=>row.quests.length===0).length,
    internalMarkers:rows.filter(row=>row.internal).length,
    linkedQuests:rows.reduce((sum,row)=>sum+row.quests.length,0)
  });
  check(Object.entries(GUIDE_CHARACTER_LABEL_CENSUS).every(
    ([key,value])=>counts[key as keyof typeof counts]===value),
    'source character/quest census');
  return Object.freeze({
    schema:GUIDE_CHARACTER_DIRECTORY_SCHEMA,
    gameVersion:'1.26.2' as const,
    sourceDefinitionOnly:true as const,
    playerUnlockVerified:false as const,
    counts,rows:Object.freeze(rows),byId:directoryMap
  });
}

export function sourceCharacterName(
  row:PublicCharacterEntry|null|undefined,locale:string='ja'
):string{
  if(!row||!isLocale(locale))return '';
  return formatPublicGuideText(row.names?.[locale]||'');
}

function validateDirectory(
  directory:PublicCharacterDirectory
):asserts directory is PublicCharacterDirectory{
  check(directory?.schema===GUIDE_CHARACTER_DIRECTORY_SCHEMA&&
    directory.gameVersion==='1.26.2'&&
    directory.sourceDefinitionOnly===true&&
    directory.playerUnlockVerified===false&&
    Array.isArray(directory.rows)&&directory.rows.length===142&&
    directory.byId instanceof Map&&directory.byId.size===142,
    'directory');
}

export function filterPublicGuideCharacters(
  directory:PublicCharacterDirectory,
  {query='',locale='ja',mode='all',limit=48,offset=0}:PublicCharacterSearchInput={}
):PublicCharacterSearchResult{
  validateDirectory(directory);
  check(typeof query==='string'&&query.length<=120&&
    isLocale(locale)&&
    (mode==='all'||mode==='withQuests'||mode==='withoutQuests')&&
    Number.isInteger(limit)&&limit>=1&&limit<=142&&
    Number.isInteger(offset)&&offset>=0,'search input');
  const words=normalize(query.trim()).split(/\s+/).filter(Boolean);
  const filtered=directory.rows.filter(row=>{
    if(mode==='withQuests'&&row.quests.length===0)return false;
    if(mode==='withoutQuests'&&row.quests.length!==0)return false;
    if(!words.length)return true;
    const searchable=normalize([row.id,...Object.values(row.names)].join(' '));
    return words.every(word=>searchable.includes(word));
  });
  filtered.sort((a,b)=>sourceCharacterName(a,locale).localeCompare(
    sourceCharacterName(b,locale),locale==='ja'?'ja':locale==='en'?'en':locale
  )||a.id.localeCompare(b.id));
  return Object.freeze({total:filtered.length,
    rows:Object.freeze(filtered.slice(offset,offset+limit))});
}

export function findPublicCharacterByLink(
  directory:PublicCharacterDirectory,search:string=''
):PublicCharacterEntry|null{
  validateDirectory(directory);
  if(typeof search!=='string'||search.length>2048)return null;
  const ids=new URLSearchParams(search).getAll('character');
  if(ids.length!==1||!ID.test(ids[0]))return null;
  return directory.byId.get(ids[0])??null;
}
