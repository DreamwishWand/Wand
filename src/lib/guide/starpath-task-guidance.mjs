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
  'HauntingElegance2026/Task02':{
    kind:'StartDiscussion',hint:'Daily Discussions with Villagers',
    ja:'村人に話しかけて、1日1回の会話を行う。',
    en:'Start daily conversations with villagers.'},
  'HauntingElegance2026/Task04':{
    kind:'PetCompanion',hint:'Companion',
    ja:'同行しているオトモをなでる。',
    en:'Pet your equipped companion.'},
  'HauntingElegance2026/Task14':{
    kind:'PurchaseItem',hint:'Scrooge McDuck\'s Store',
    ja:'スクルージのお店で商品を購入する。',
    en:'Purchase items at Scrooge McDuck\'s Store.'},
  'HauntingElegance2026/Task18':{
    kind:'CookMeal',hint:'2-star meal',
    ja:'料理ステーションで星2の料理を作る。',
    en:'Cook meals with a two-star recipe.'},
  'HauntingElegance2026/Task19':{
    kind:'SellItem',hint:'Sell any fish',
    ja:'釣った魚を売却する。',
    en:'Sell fish you have caught.'},
  'HauntingElegance2026/Task22':{
    kind:'RoyalDuties',hint:'Dreamlight Duties',
    ja:'ドリームライトの任務を達成する。',
    en:'Complete Dreamlight Duties.'},
  'HauntingElegance2026/Task24':{
    kind:'TakePicture',hint:'selfie with Goofy',
    ja:'カメラでグーフィーが写るセルフィーを撮る。',
    en:'Take a selfie with Goofy in the frame.'},
  'HauntingElegance2026/Task31':{
    kind:'CraftItem',hint:'fabric',
    ja:'クラフトステーションで布（Fabric）を製作する。',
    en:'Craft Fabric at a crafting station.'},
  'HauntingElegance2026/Task34':{
    kind:'HangoutWithCharacter',hint:'pal Mickey',
    ja:'ミッキーマウスにハングアウトを依頼して、一緒に行動する。',
    en:'Ask Mickey Mouse to hang out, then spend time together.'},
  'HauntingElegance2026/Task41':{
    kind:'DesignChallenge',hint:'Submit an entry to DreamSnaps',
    ja:'ドリームスナップの開催中のお題に沿った写真を投稿する。',
    en:'Submit a qualifying photo to the current DreamSnaps challenge.'},
  'HauntingElegance2026/Task44':{
    kind:'DesignChallenge',hint:'Vote in a DreamSnaps',
    ja:'ドリームスナップの投票画面から作品に投票する。',
    en:'Vote for entries in a DreamSnaps contest.'},
  'HauntingElegance2026/Task50':{
    kind:'CookMeal',hint:'pumpkin-based meals',
    ja:'カボチャを材料に使う料理を作る。',
    en:'Cook meals using Pumpkin as an ingredient.'},
  'HauntingElegance2026/Task58':{
    kind:'CatchFish',hint:'Forest of Valor',
    ja:'勇気の森で魚を釣る。',
    en:'Catch fish in the Forest of Valor.'},
  'HauntingElegance2026/Task64':{
    kind:'FeedCritter',hint:'black Ravens',
    ja:'黒いカラスに近づき、その動物の好物を与える。',
    en:'Approach a black raven and feed it its favorite food.'},
  'HauntingElegance2026/Task71':{
    kind:'BoutiqueChallenge',hint:'Boutique Challenge with Daisy',
    ja:'デイジーのブティックでチャレンジを受けて達成する。',
    en:'Complete a Boutique Challenge at Daisy\'s Boutique.'},
  'HauntingElegance2026/Task75':{
    kind:'PurchaseItem',hint:'Gumbo from Tiana\'s Stall',
    ja:'ティアナの屋台でガンボを購入する。',
    en:'Buy Gumbo from Tiana\'s Stall.'},
  'HauntingElegance2026/Task81':{
    kind:'CraftItem',hint:'Miracle Fishing Bait',
    ja:'クラフトステーションでミラクル釣りエサを製作する。',
    en:'Craft Miracle Fishing Bait at a crafting station.'},
  'HauntingElegance2026/Task84':{
    kind:'RoyalDuties',hint:'fishing-related royal tasks',
    ja:'釣りに関するドリームライトの任務を達成する。',
    en:'Complete fishing-related Dreamlight Duties.'},
  'HauntingElegance2026/Task88':{
    kind:'FeedCritter',hint:'Black Sea Turtles',
    ja:'黒いウミガメに好物を与える。',
    en:'Feed black sea turtles their favorite food.'},
  'HauntingElegance2026/Task94':{
    kind:'CatchFish',hint:'gold ripples',
    ja:'金色のさざ波が出ている釣り場で魚を釣る。',
    en:'Catch fish from golden fishing ripples.'},
  'HauntingElegance2026/Task100':{
    kind:'CraftItem',hint:'Autumn Harvest Pennants or a Playful Pumpkin Scarecrow',
    ja:'「Autumn Harvest Pennants」か「Playful Pumpkin Scarecrow」を製作する。',
    en:'Craft Autumn Harvest Pennants or a Playful Pumpkin Scarecrow.'},
  'HauntingElegance2026/Task103':{
    kind:'CraftItem',hint:'Hay Bales',
    ja:'クラフトステーションで干し草の俵を製作する。',
    en:'Craft Hay Bales at a crafting station.'},
  'HauntingElegance2026/Task107':{
    kind:'FeedCritter',hint:'Raccoons',
    ja:'アライグマに近づいて、好物を与える。',
    en:'Approach raccoons and feed them their favorite food.'},
  'HauntingElegance2026/Task110':{
    kind:'CookMeal',hint:'Tekka Maki',
    ja:'料理ステーションで鉄火巻きを作る。',
    en:'Cook Tekka Maki at a cooking station.'},
  'HauntingElegance2026/Task118':{
    kind:'ServeRestaurantOrder',hint:'Remy\'s Restaurant',
    ja:'レミーのレストランで注文された料理を作り、客に提供する。',
    en:'Prepare and serve customer orders inside Remy\'s Restaurant.'},
  'HauntingElegance2026/Task121':{
    kind:'VisitArea',hint:'Haunted Floating Festival',
    ja:'開催期間内にホーンテッド・フローティング・フェスティバルのエリアを訪れる。',
    en:'Visit the Haunted Floating Festival area during its event window.'},
  'Seafaring2026/Task05':{
    kind:'PetCompanion',hint:'Pet your',
    ja:'オトモをなでる。',
    en:'Pet your companion.'},
  'Seafaring2026/Task10':{
    kind:'CatchFish',hint:'seaweed',
    ja:'海に釣り糸を垂らして海藻を釣る。',
    en:'Fish for seaweed in the ocean.'},
  'Seafaring2026/Task13':{
    kind:'FeedCritter',hint:'Sea Turtles',
    ja:'ウミガメに好物を与える。',
    en:'Feed sea turtles their favorite food.'},
  'Seafaring2026/Task15':{
    kind:'PurchaseItem',hint:'Scrooge McDuck\'s Store',
    ja:'スクルージのお店で商品を購入する。',
    en:'Buy items from Scrooge McDuck\'s Store.'},
  'Seafaring2026/Task16':{
    kind:'CatchFish',hint:'Dazzle Beach',
    ja:'輝きの浜辺で魚を釣る。',
    en:'Catch fish at Dazzle Beach.'},
  'Seafaring2026/Task21':{
    kind:'CatchFish',hint:'gold ripples',
    ja:'金色のさざ波が出ている場所で魚を釣る。',
    en:'Catch fish from golden fishing ripples.'},
  'Seafaring2026/Task37':{
    kind:'CraftItem',hint:'Natural Rock Paths',
    ja:'クラフトステーションで「Natural Rock Paths」を製作する。',
    en:'Craft Natural Rock Paths at a crafting station.'},
  'Seafaring2026/Task40':{
    kind:'PickUp',hint:'companion help you pick up scallops',
    ja:'オトモの収集補助を利用してホタテを拾う。',
    en:'Collect scallops with help from your companion.'},
  'Seafaring2026/Task41':{
    kind:'CatchFish',hint:'Dazzle Beach',
    ja:'輝きの浜辺で魚を釣る。',
    en:'Catch fish at Dazzle Beach.'},
  'Seafaring2026/Task48':{
    kind:'DesignChallenge',hint:'DreamSnaps contest',
    ja:'ドリームスナップのコンテストに写真を投稿する。',
    en:'Submit a photo to a DreamSnaps contest.'},
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
