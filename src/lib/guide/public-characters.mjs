/** Source-scoped, public Guide character-name dictionary.
 * These 142 records include source placeholders, NPCs and other entity labels.
 * They are NOT a census of unlockable villagers or player achievements.
 */
import {PUBLIC_GUIDE_LOCALES,verifyPublicQuestIndex,formatPublicGuideText} from './public-guide.mjs';

export const GUIDE_CHARACTER_LABEL_CENSUS=Object.freeze({
  labels:142,withLinkedQuests:86,withoutLinkedQuests:56,
  internalMarkers:3,linkedQuests:733
});
const ID=/^[1-9]\d{0,15}$/;
const INTERNAL=/\{(?:LegacyPlaceholder|Placeholder|DoNotTranslate)\}/i;
const assert=(value,message)=>{if(!value)throw new TypeError('Guide characters: '+message)};
const norm=value=>value.normalize('NFKC').toLocaleLowerCase();

export function derivePublicGuideCharacters(index){
  verifyPublicQuestIndex(index);
  const byId=new Map();
  const locales=new Set(PUBLIC_GUIDE_LOCALES);
  assert(Object.keys(index.characters).length===GUIDE_CHARACTER_LABEL_CENSUS.labels,'source label census');
  for(const [id,names] of Object.entries(index.characters)){
    assert(ID.test(id)&&names&&typeof names==='object'&&!Array.isArray(names)&&
      Object.keys(names).length===8&&
      Object.keys(names).every(k=>locales.has(k)&&typeof names[k]==='string'&&
        names[k].length>0&&names[k].length<=480),'malformed source label');
    byId.set(id,{id,names,quests:[],internal: Object.values(names).some(label=>INTERNAL.test(label))});
  }
  for(const quest of index.quests){
    assert(typeof quest.characterId==='string'&&byId.has(quest.characterId),
      'quest linked to unknown source label');
    byId.get(quest.characterId).quests.push(quest);
  }
  const rows=[...byId.values()];
  const counts={
    labels:rows.length,
    withLinkedQuests:rows.filter(x=>x.quests.length>0).length,
    withoutLinkedQuests:rows.filter(x=>x.quests.length===0).length,
    internalMarkers:rows.filter(x=>x.internal).length,
    linkedQuests:rows.reduce((n,x)=>n+x.quests.length,0)
  };
  assert(Object.entries(GUIDE_CHARACTER_LABEL_CENSUS).every(([k,v])=>counts[k]===v),
    'source character/quest census');
  return {schema:'wand.db03.public-character-directory@1',counts,rows,byId};
}

export function sourceCharacterName(row,locale='ja'){
  if(!row||!PUBLIC_GUIDE_LOCALES.includes(locale))return '';
  return formatPublicGuideText(row.names?.[locale]||'');
}

export function filterPublicGuideCharacters(directory,{
  query='',locale='ja',mode='all',limit=48,offset=0
}={}){
  assert(directory?.schema==='wand.db03.public-character-directory@1'&&
    Array.isArray(directory.rows)&&directory.rows.length===142,'directory');
  assert(typeof query==='string'&&query.length<=120&&
    PUBLIC_GUIDE_LOCALES.includes(locale)&&
    ['all','withQuests','withoutQuests'].includes(mode)&&
    Number.isInteger(limit)&&limit>=1&&limit<=142&&
    Number.isInteger(offset)&&offset>=0,'search input');
  const words=norm(query.trim()).split(/\s+/).filter(Boolean);
  const filtered=directory.rows.filter(row=>{
    if(mode==='withQuests'&&row.quests.length===0)return false;
    if(mode==='withoutQuests'&&row.quests.length!==0)return false;
    if(!words.length)return true;
    const searchable=norm([row.id,...Object.values(row.names)].join(' '));
    return words.every(word=>searchable.includes(word));
  });
  filtered.sort((a,b)=>sourceCharacterName(a,locale).localeCompare(sourceCharacterName(b,locale),
    locale==='ja'?'ja':locale==='en'?'en':locale)||a.id.localeCompare(b.id));
  return {total:filtered.length,rows:filtered.slice(offset,offset+limit)};
}

export function findPublicCharacterByLink(directory,search=''){
  assert(directory?.schema==='wand.db03.public-character-directory@1'&&
    directory.byId instanceof Map,'directory');
  if(typeof search!=='string'||search.length>2048)return null;
  const ids=new URLSearchParams(search).getAll('character');
  if(ids.length!==1||!ID.test(ids[0]))return null;
  return directory.byId.get(ids[0])||null;
}
