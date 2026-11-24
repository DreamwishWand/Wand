import {publicQuestSection,comparePublicQuestBrowseOrder,formatPublicGuideText,type PublicQuestIndex,type PublicQuestIndexRow,type PublicQuestSection,type PublicGuideLocale} from './public-guide.ts';
import {COLLECTION_UNIVERSE_TAG_NAMES} from '../collection/universe-tag-names.ts';
import type {PublicEventFriendshipRewards} from './public-event-friendship-rewards.ts';
export type QuestGroupSection='realm'|'friendship'|'event'|'premium';
export interface QuestBrowseGroup{readonly id:string;readonly name:string;readonly rows:readonly PublicQuestIndexRow[];readonly characterId?:string}
const realmUniverse:Readonly<Record<string,string>>={
 WallE:'WALL·E',Moana:'Moana',Ratatouille:'Ratatouille',Frozen:'Frozen',ToyStory:'Toy Story',
 LionKing:'The Lion King',BeautyBeast:'Beauty and the Beast',MonsterInc:'Monsters, Inc.',
 Mulan:'Mulan',Aladdin:'Aladdin',Alice:'Alice in Wonderland',InsideOut:'Inside Out',
 LadyAndTheTramp:'Lady and the Tramp',Hercules:'Hercules'
};
const eventNames:Readonly<Record<string,readonly [string,string,string?]>>={
 Spring:['Eggstravaganza','エッグストラヴァガンザ','Eggstravaganza_UI_2026'],
 Park:['Dreamlight Parks Fest','ドリームライトパークフェスト','DreamlightParkFest_UI_2026'],
 TreasureHunt:['Treasure Hunt','宝探し','TreasureHunt_UI_2026'],
 FloatingFestival:['Floating Festival','フローティングフェスティバル'],
 'FloatingFestival/Parks':['Parks Floating Festival','パークフローティングフェスティバル','ParksFloatingFestival'],
 'FloatingFestival/Halloween':['Haunted Floating Festival','ホーンテッドフローティングフェスティバル','HauntedFloatingFestival2026'],
 Valentines:['Valley Valentines','バレーバレンタイン','ValleyValentines_UI_2026'],
 ClickMagic:['Click & Magic','クリック＆マジック','ClickAndMagic_UI_2026'],
 MemoryMania:['Memory Mania','メモリーマニア','MemoryMania_UI_2026'],
 SummerSizzle:['Summer Sizzle','サマーシズル','SummerSizzle_UI_2026']
};
export function isQuestGroupSection(section:PublicQuestSection):section is QuestGroupSection{
 return section==='realm'||section==='friendship'||section==='event'||section==='premium';
}
/** Native mission namespace, not guessed from translated titles. Repeat
 * visits to the same Realm are retained inside its universe group. */
export function questBrowseGroupId(row:PublicQuestIndexRow):string{
 const section=publicQuestSection(row),parts=row.internalName.split('!');
 if(section==='friendship'||section==='premium')return row.characterId;
 if(section==='realm')return parts[1]==='LionKing2'?'LionKing':parts[1]==='BeautyBeast2'?'BeautyBeast':parts[1]||'';
 if(section==='event'){
  const family=parts[2]||'';
  if(family==='FloatingFestival'&&['Parks','Halloween'].includes(parts[3]))return family+'/'+parts[3];
  return family;
 }
 return '';
}
function characterLabel(index:PublicQuestIndex,id:string,locale:string){
 const names=index.characters[id];return formatPublicGuideText(names?.[locale as PublicGuideLocale]||names?.en||'')||'—';
}
function groupLabel(index:PublicQuestIndex,section:QuestGroupSection,id:string,locale:string,events:PublicEventFriendshipRewards|null){
 if(section==='friendship'||section==='premium')return characterLabel(index,id,locale);
 if(section==='realm'){
  const universe=COLLECTION_UNIVERSE_TAG_NAMES.find(row=>row.names.en===realmUniverse[id]);
  return formatPublicGuideText(universe?.names[locale as PublicGuideLocale]||universe?.names.en||realmUniverse[id]||id);
 }
 const labels=eventNames[id];
 const native=labels?.[2]&&events?.events.find(event=>event.id===labels[2]);
 return formatPublicGuideText((native&&native.names[locale])||(native&&native.names.en)||(locale==='ja'?labels?.[1]:labels?.[0])||id);
}
export function questBrowseGroups(index:PublicQuestIndex,section:QuestGroupSection,locale:string,events:PublicEventFriendshipRewards|null=null):QuestBrowseGroup[]{
 const groups=new Map<string,PublicQuestIndexRow[]>();
 for(const row of index.quests){
  if(publicQuestSection(row)!==section)continue;
  const key=questBrowseGroupId(row);const rows=groups.get(key)??[];rows.push(row);groups.set(key,rows);
 }
 const out=[...groups].map(([id,rows])=>({id,name:groupLabel(index,section,id,locale,events),rows:rows.sort((a,b)=>
  section==='realm'||section==='event'?Number(a.id)-Number(b.id):comparePublicQuestBrowseOrder(a,b,index,locale)),
  characterId:section==='friendship'||section==='premium'?id:undefined}));
 if(section==='friendship'||section==='premium')out.sort((a,b)=>a.name.localeCompare(b.name,locale)||a.id.localeCompare(b.id));
 else out.sort((a,b)=>Number(a.rows[0].id)-Number(b.rows[0].id));
 return out;
}
