/**
 * Editorial, actionable Star Path explanations; NOT official LocDB translations.
 * Only source-identified season + Task IDs are allowed. Missing review -> null.
 * Curated explanations must not be shown as computed quest progress or rewards.
 */
export const STARPATH_GUIDANCE_CONTRACT='wand.db03.starpath-editorial-action@1';
const docs={
  'HauntingElegance2026/Task17':{
    kind:'HangoutWithCharacter',hint:'hot-tempered duck',
    ja:'ドナルドダックを同行者にして、一緒に行動する。',
    en:'Ask Donald Duck to hang out, then spend time together.'},
  'HauntingElegance2026/Task26':{
    kind:'StartDiscussion',hint:'long-bearded wizard',
    ja:'マーリンに話しかけて、1日の会話をする。',
    en:'Start a daily conversation with Merlin.'},
  'HauntingElegance2026/Task09':{
    kind:'TakePicture',hint:'Mickey Mouse',
    ja:'ミッキーマウスが写るようにカメラでセルフィーを撮る。',
    en:'Take a selfie with Mickey Mouse in the picture.'},
  'HauntingElegance2026/Task07':{
    kind:'StartDiscussion',hint:'Goofy',
    ja:'グーフィーに話しかけて、1日の会話をする。',
    en:'Have a daily discussion with Goofy.'},
  'HauntingElegance2026/Task01':{
    kind:'PickUp',hint:'Night Thorns',
    ja:'バレー内の闇のトゲを取り除く。',
    en:'Remove Night Thorns in the Valley.'},
  'HauntingElegance2026/Task10':{
    kind:'GardeningHarvest',hint:'mushroom',
    ja:'キノコを採取する。',
    en:'Collect mushrooms.'},
  'HauntingElegance2026/Task15':{
    kind:'PickUp',hint:'yellow flowers',
    ja:'黄色い花を拾う。',
    en:'Pick up yellow flowers.'},
  'HauntingElegance2026/Task51':{
    kind:'VisitArea',hint:'House of the Pumpkin King',
    ja:'ジャック・スケリントンの家を訪れる。',
    en:'Visit Jack Skellington\'s house.'},
  'HauntingElegance2026/Task52':{
    kind:'HangoutWithCharacter',hint:'Pumpkin King',
    ja:'ジャック・スケリントンを同行者にして一緒に行動する。',
    en:'Hang out with Jack Skellington.'},
  'HauntingElegance2026/Task59':{
    kind:'StartDiscussion',hint:'top shopkeeper',
    ja:'スクルージ・マクダックに話しかけて、その日の会話をする。',
    en:'Have a daily conversation with Scrooge McDuck.'},
  'HauntingElegance2026/Task70':{
    kind:'GiftToCharacter',hint:'patchwork Villager',
    ja:'サリーに、その日の好物のギフトを渡す。',
    en:'Give Sally one of her favorite gifts for the day.'},
  'HauntingElegance2026/Task76':{
    kind:'TakePicture',hint:'hot-tempered duck',
    ja:'ドナルドダックが写るようにセルフィーを撮る。',
    en:'Take a selfie with Donald Duck.'},
  'HauntingElegance2026/Task78':{
    kind:'GiftToCharacter',hint:'Sugar Rush racer',
    ja:'ヴァネロペに、その日の好物のギフトを渡す。',
    en:'Give Vanellope one of her favorite gifts for the day.'},
  'HauntingElegance2026/Task80':{
    kind:'Friend',hint:'Friendship Level 4 with the Pumpkin King',
    ja:'ジャック・スケリントンとの友情レベルを4にする。',
    en:'Reach friendship level 4 with Jack Skellington.'},
  'HauntingElegance2026/Task95':{
    kind:'DigTile',hint:'pottery material',
    ja:'地面を掘って粘土を入手する。',
    en:'Dig the ground to collect Clay.'},
  'HauntingElegance2026/Task97':{
    kind:'GiftToCharacter',hint:'Pumpkin King',
    ja:'ジャック・スケリントンに、その日の好物のギフトを渡す。',
    en:'Give Jack Skellington one of his favorite gifts for the day.'},
  'HauntingElegance2026/Task102':{
    kind:'HangoutWithCharacter',hint:'patchwork Villager',
    ja:'サリーを同行者にして一緒に行動する。',
    en:'Hang out with Sally.'},
  'HauntingElegance2026/Task106':{
    kind:'GardeningHarvest',hint:'vampire repellent',
    ja:'ニンニクを収穫する。',
    en:'Harvest Garlic.'},
  'HauntingElegance2026/Task108':{
    kind:'TakePicture',hint:'Jack Skellington and his bone-chilling House',
    ja:'ジャック・スケリントンと彼の家の両方が写る写真を撮る。',
    en:'Take a photo showing both Jack Skellington and his house.'},
  'HauntingElegance2026/Task112':{
    kind:'HangoutWithCharacter',hint:'long-bearded wizard',
    ja:'マーリンを同行者にして一緒に行動する。',
    en:'Hang out with Merlin.'},
  'Seafaring2026/Task19':{
    kind:'GiftToCharacter',hint:'boy who never grows up',
    ja:'ピーター・パンに、その日の好物のギフトを渡す。',
    en:'Give Peter Pan one of his favorite gifts for the day.'},
  'Seafaring2026/Task23':{
    kind:'HangoutWithCharacter',hint:'dinglehoppers',
    ja:'アリエルを同行者にして、一緒に行動する。',
    en:'Hang out with Ariel.'},
  'Seafaring2026/Task39':{
    kind:'TakePicture',hint:'seven sisters',
    ja:'アリエルが写るようにセルフィーを撮る。',
    en:'Take a selfie with Ariel in the picture.'},
  'Seafaring2026/Task44':{
    kind:'GiftToCharacter',hint:'seafaring prince',
    ja:'エリック王子に、その日の好物のギフトを渡す。',
    en:'Give Prince Eric one of his favorite gifts for the day.'},
  'Seafaring2026/Task55':{
    kind:'HangoutWithCharacter',hint:'seafaring prince',
    ja:'エリック王子を同行者にして、一緒に行動する。',
    en:'Hang out with Prince Eric.'},
  'Seafaring2026/Task34':{
    kind:'SellItem',hint:'100 seafood',
    ja:'魚介類を合計100個売却する。',
    en:'Sell 100 seafood items.'},
  'Seafaring2026/Task47':{
    kind:'CraftItem',hint:'Helm Bookshelf',
    ja:'クラフトステーションで「Helm Bookshelf」を製作する。',
    en:'Craft the Helm Bookshelf at a crafting station.'}
};
const weekly={
  'HauntingElegance2026/Week01Task03':{
    kind:'HangoutWithCharacter',
    ja:'ジャック・スケリントンとハングアウトする。',
    en:'Hang out with Jack Skellington.'},
  'HauntingElegance2026/Week02Task03':{
    kind:'TakePicture',
    // Source-verified furniture target: Star Path tier-5 Candy Cane Door;
    // do not misdirect the player toward Jack's exterior house entrance.
    ja:'スターパス報酬の「Candy Cane Door」を自宅の室内ドアに設置して写真に撮る。',
    en:'Place the Candy Cane Door reward on an interior house door, then photograph it.'},
  'HauntingElegance2026/Week07Task01':{
    kind:'GiftToCharacter',
    ja:'ジャック・スケリントンに、その日の好物のギフトを渡す。',
    en:'Give Jack Skellington a favorite gift.'},
  'HauntingElegance2026/Week07Task02':{
    kind:'Friend',
    ja:'サリーとの友情レベルを5にする。',
    en:'Reach friendship level 5 with Sally.'},
  'Seafaring2026/Week02Task01':{
    kind:'HangoutWithCharacter',
    ja:'アリエルを同行者にして、一緒に行動する。',
    en:'Hang out with Ariel.'},
  'Seafaring2026/Week04Task01':{
    kind:'Friend',
    ja:'モアナとの友情レベルを5にする。',
    en:'Reach friendship level 5 with Moana.'},
  'Seafaring2026/Week05Task03':{
    kind:'TakePicture',
    ja:'アリエルと一緒にセルフィーを撮る。',
    en:'Take a selfie with Ariel.'},
  'Seafaring2026/Week06Task01':{
    kind:'GiftToCharacter',
    ja:'アリエルに、その日の好物のギフトを渡す。',
    en:'Give Ariel one of her favorite gifts.'}
};
export function actionableStarpathTask(seasonId,task,language='ja'){
  if(!task||typeof task.id!=='string'||!['ja','en'].includes(language))return null;
  const record=docs[seasonId+'/'+task.id];
  if(record){
    if(task.objectiveKind!==record.kind||
      typeof task.description!=='string'||
      !task.description.toLowerCase().includes(record.hint.toLowerCase()))return null;
    return {action:record[language],reviewed:true,source:'editorial-interpretation'};
  }
  const w=weekly[seasonId+'/'+task.id];
  if(w && task.objectiveKind===w.kind && task.descriptionKey==='Liveops.'+seasonId+'_'+task.id+'_Description'){
    return {action:w[language],reviewed:true,source:'editorial-interpretation'};
  }
  return null;
}
export const STARPATH_REVIEWED_DAILY_COUNT=Object.keys(docs).length;
export const STARPATH_REVIEWED_WEEKLY_COUNT=Object.keys(weekly).length;

/**
 * Present verified game text first when no specific editorial instruction is
 * available. Editorial steps are authored in Japanese and English only;
 * they must never masquerade as official text in another UI language.
 */
export function starpathTaskDisplay(seasonId,task,locale,sourceText){
  const verifiedLanguage=locale==='ja'||locale==='en'?locale:null;
  const reviewed=verifiedLanguage?actionableStarpathTask(seasonId,task,verifiedLanguage):null;
  const original=typeof sourceText==='string'&&sourceText.trim()?sourceText:
    (typeof task?.description==='string'&&task.description.trim()?task.description:'');
  return {
    headline:reviewed?.action||original||'説明未確認',
    // Source authenticity is explained once per page, not on every unreviewed item.
    note:reviewed?'ゲーム内表記：'+(original||'説明未確認'):null,
    reviewed:!!reviewed
  };
}
