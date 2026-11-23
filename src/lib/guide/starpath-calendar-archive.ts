/** Native Liveops.locbin titles (eight game locales), and historical calendar
 * boundaries recovered from owner game archives. Never synthesize exact hours
 * from civil-date announcements. Original cache SHA-256:
 * b66ca524e2ed2cd8133f5238591d3d361d074cb3b73b07cadb23fe5cdcbcd637
 * (2022-10-20, battlepasses.dat, 51593 bytes).
 * Game localization provenance: en-US Liveops.locbin SHA-256
 * cebfceb8f17035219934d721806dc945b5c115a91e3c3618e1ab9583c93969f8.
 */
import {GUIDE_EVENT_CALENDAR_AS_OF,type GuideCalendarEvent} from './event-calendar.ts';

const LANGUAGES=['en','ja','de','es','fr','it','pt','zh'] as const;
const TITLES:Readonly<Record<string,readonly string[]>>={
  "HauntingElegance2026": [
    "Haunting Elegance",
    "ホーンテッド・エレガンス",
    "Geisterhafte Eleganz",
    "Elegancia Aterradora",
    "Élégance spectrale",
    "Eleganza stregata",
    "Elegância Assombrosa",
    "幽魅典雅"
  ],
  "Seafaring2026": [
    "Seafaring Star Path",
    "「マリンアドベンチャー」スターパス",
    "„Seefahrt“—Sternenpfad",
    "Camino de Estrellas de A Mares",
    "Voie des étoiles Aventure maritime",
    "Cammino delle Stelle Alto mare",
    "Caminho de Estrelas Navegante",
    "航海星路"
  ],
  "PixarFestStarPath": [
    "Pixar Fest Star Path",
    "「ピクサーフェスト」スターパス",
    "Sternenpfad zum Pixar-Fest",
    "Camino de Estrellas del Pixar Fest",
    "Voie des étoiles Pixar Fest",
    "Cammino delle Stelle Pixar Fest",
    "Caminho de Estrelas Pixar Fest",
    "皮克斯嘉年华星路"
  ],
  "Halloween2022": [
    "Villains' Star Path",
    "「ヴィランズ」スターパス",
    "Sternenpfad der Bösewichte",
    "Camino de Estrellas de los villanos",
    "Voie des étoiles des méchants",
    "Cammino delle Stelle dei Cattivi",
    "Caminho de Estrelas dos Vilões",
    "反派星路"
  ],
  "Festive2022": [
    "Festive Star Path",
    "「フェスティブ」スターパス",
    "Festlicher Sternenpfad",
    "Camino de Estrellas festivo",
    "Voie des étoiles festive",
    "Cammino delle Stelle Festivo",
    "Caminho de Estrelas Festivo",
    "节日星路"
  ],
  "D1002022": [
    "Centennial Star Path",
    "「100周年」スターパス",
    "Sternenpfad der Hundertjahrfeier",
    "Camino de Estrellas del Centenario",
    "Voie des étoiles centenaire",
    "Cammino delle Stelle Centenario",
    "Caminho de Estrelas Centenário",
    "百年星路"
  ],
  "Parks2022": [
    "Disney Parks Star Path",
    "「ディズニーパーク」スターパス",
    "Sternenpfad der Disney Parks",
    "Camino de Estrellas de los Parques Disney",
    "Voie des étoiles des parcs Disney",
    "Cammino delle Stelle dei Parchi Disney",
    "Caminho de Estrelas Parques Disney",
    "迪士尼乐园星路"
  ],
  "PixarFest2023": [
    "The Wonder of Pixar Star Path",
    "「ピクサーの奇跡」スターパス",
    "Der Sternenpfad „Wunder von Pixar“",
    "Camino de Estrellas Wonder de Pixar",
    "La Voie des étoiles Wonder of Pixar",
    "Cammino delle Stelle Meraviglie della Pixar",
    "O Caminho de Estrelas The Wonder of Pixar",
    "皮克斯奇迹星路"
  ],
  "Halloween2023": [
    "Haunted Holiday Star Path",
    "「ホーンテッドホリデー」スターパス",
    "„‚Screamlight‘ Valley“ Sternenpfad",
    "Camino de Estrellas de Festividades Fantasmales",
    "Voie des étoiles des vacances hantées",
    "Cammino delle Stelle Feste infestate",
    "Caminho de Estrelas Festividades Assombradas",
    "幽灵假日星路"
  ],
  "Princesses2023": [
    "Royal Winter Star Path",
    "「ロイヤルウィンター」スターパス",
    "„Herrschaftlicher Winter“—Sternenpfad",
    "Camino de Estrellas de Invierno Real",
    "Voie des étoiles royale de l'hiver",
    "Cammino delle Stelle Inverno reale",
    "Caminho de Estrelas Inverno Real",
    "皇家冬日星路"
  ],
  "ADayatDisney": [
    "\"A Day at Disney\" Star Path",
    "「ディズニー・デー」スターパス",
    "„Ein Tag im Disneyland“—Sternenpfad",
    "Camino de estrellas \"Un día en Disney\"",
    "Voie des étoiles \"Un jour à Disney\"",
    "Cammino delle Stelle \"Una giornata da Disney\"",
    "Caminho de Estrelas \"Um Dia na Disney\"",
    "“迪士尼一日游”星路"
  ],
  "MajestyMagnolias2024": [
    "Majesty and Magnolias Star Path",
    "「マジェスティ&マグノリア」スターパス",
    "„Eitelkeit und Magnolien“—Sternenpfad",
    "Camino de Estrellas Majestuosidad y Magnolias",
    "Voie des étoiles Majesté et Magnolias",
    "Cammino delle Stelle Maestà e magnolie",
    "Caminho de Estrelas Majesty and Magnolias",
    "威严木兰星路"
  ],
  "TBD2024": [
    "The Night Show Star Path",
    "「ナイトショー」スターパス",
    "Der „Die nächtliche Show“—Sternenpfad",
    "Camino de Estrellas Espectáculo Nocturno",
    "La Voie des étoiles Le Spectacle nocturne",
    "Cammino delle Stelle Concerto rock",
    "Caminho de Estrelas Noite de Show",
    "夜间秀星路"
  ],
  "AdventuresInNeverland2025": [
    "\"Adventures in Never Land\" Star Path",
    "「ネバーランドの冒険」スターパス",
    "„Abenteuer im Nimmerland“—Sternenpfad",
    "Camino de Estrellas \"Aventuras en el País de Nunca Jamás\"",
    "Voie des étoiles \"Aventures au Pays imaginaire\"",
    "Cammino delle Stelle \"Avventure sull'Isola Che Non C'è\"",
    "Caminho de Estrelas \"Aventuras na Terra do Nunca\"",
    "“梦幻岛冒险”星路"
  ],
  "Dapper2024": [
    "Dapper Delights Star Path",
    "「レトロタイム」スターパス",
    "„Elegantes Vergnügen“—Sternenpfad",
    "Camino de Estrellas Delicias elegantes",
    "Voie des étoiles Les joies du raffinement",
    "Cammino delle Stelle Alta classe",
    "Caminho de Estrelas Elegância e Estilo",
    "优雅之乐星路"
  ],
  "ElementsOfNatureStarPath": [
    "Elements of Nature Star Path",
    "「アース・パワー」スターパス",
    "„Elemente der Natur“—Sternenpfad",
    "Camino de Estrellas de Elementos de la Naturaleza",
    "Voie des étoiles Éléments de la nature",
    "Cammino delle Stelle Elementi della natura",
    "Caminho de Estrelas Elementos da Natureza",
    "自然元素星路"
  ],
  "FrostAndFairies2024": [
    "The Frost & Fairies Star Path",
    "「フロスト&フェアリー」スターパス",
    "„Frost und Feen“—Sternenpfad",
    "Camino de Estrellas Escarcha y Hadas",
    "La Voie des étoiles Froid et fées",
    "Cammino delle Stelle Gelo e fate",
    "O Caminho de Estrelas Geadas & Fadas",
    "寒霜精灵星路"
  ],
  "GardenOfWhimsy2025": [
    "Garden of Whimsy Star Path",
    "「気まぐれな庭」スターパス",
    "„Garten der Wunder“—Sternenpfad",
    "Camino de Estrellas Jardín de la extravagancia",
    "Voie des étoiles Jardin fantastique",
    "Cammino delle Stelle Giardino straordinario",
    "Caminho de Estrelas Jardim Extravagante",
    "奇趣花园星路"
  ],
  "GodlyGlamorStarPath2026": [
    "Godly Glamor Star Path",
    "「ファンタスティック・ゴッド」スターパス",
    "„Göttlicher Glanz“—Sternenpfad",
    "Camino de Estrellas de Glamour Divino",
    "Voie des étoiles Glamour divin",
    "Cammino delle Stelle Stile divino",
    "Caminho de Estrelas Glamour dos Deuses",
    "神明风华星路"
  ],
  "OasisRetreat2025": [
    "The Oasis Retreat Star Path",
    "「癒しのオアシス」スターパス",
    "„Rückzug in die Oase“—Sternenpfad",
    "Camino de Estrellas Retiro en el oasis",
    "Voie des étoiles Retraite dans l'oasis",
    "Cammino delle Stelle Oasi rilassante",
    "Caminho de Estrelas Férias no Oásis",
    "绿洲隐居星路"
  ],
  "PawFectRomance2026": [
    "Paw-fect Romance",
    "パピーラブ",
    "Pfoten-tastische Romantik",
    "Romance Canino",
    "Patte-faite romance",
    "Zampe e romanticismo",
    "Romance Ide-au!",
    "犬心犬意"
  ],
  "PopCity2026": [
    "Pop City Star Path",
    "「ポップシティ」スターパス",
    "„Pop City“—Sternenpfad",
    "Camino de Estrellas de Ciudad Pop",
    "Voie des étoiles Ville pop",
    "Cammino delle Stelle Città del pop",
    "Caminho de Estrelas Pop na Cidade",
    "流行城市星路"
  ],
  "RetroRoadtrip2025": [
    "Retro Roadtrip Star Path",
    "「レトロ・ロードトリップ」スターパス",
    "„Retro-Roadtrip“—Sternenpfad",
    "Camino de Estrellas Viaje retro",
    "Voie des étoiles Road trip rétro",
    "Cammino delle Stelle Viaggio rétro",
    "Caminho de Estrelas Viagem Retrô",
    "怀旧之旅星路"
  ],
  "Sweetheart2023": [
    "Lovely Monsters Star Path",
    "「ラブリーモンスターズ」スターパス",
    "„Liebenswerte Monster“—Sternenpfad",
    "Camino de Estrellas de Monstruos Encantadores",
    "Voie des étoiles des gentils monstres",
    "Cammino delle Stelle Mostri adorabili",
    "Caminho de Estrelas Monstros Adoráveis",
    "可爱怪兽星路"
  ],
  "WinterWarmth2025": [
    "Winter Warmth Star Path",
    "「ハートフルウィンター」スターパス",
    "„Winterliche Wärme“—Sternenpfad",
    "Camino de Estrellas Calidez Invernal",
    "Voie des étoiles Chaleur hivernale",
    "Cammino delle Stelle Calore d'inverno",
    "Caminho de Estrelas Calor do Inverno",
    "冬日暖意星路"
  ],
  "WitchfullThinking2025": [
    "Witchful Thinking Star Path",
    "「魔女のススメ」スターパス",
    "„Verhexte Gedankenwelt“—Sternenpfad",
    "Camino de Estrellas Hechizos e ilusiones",
    "Voie des étoiles Sorcellébration",
    "Cammino delle Stelle Stregonerie",
    "Caminho de Estrelas Acredite em Bruxas",
    "女巫狂想星路"
  ],
  "EggstravaganzaMiniEvent": [
    "Eggstravaganza",
    "イースター",
    "Eivaganza",
    "Espectáculo de huevos",
    "Grande Œuforie",
    "Uova di primavera",
    "Eggstravaganza",
    "彩蛋盛宴"
  ],
  "FestiveMiniEvent": [
    "The Gift of Giving",
    "感謝のギフト",
    "Die Gabe des Schenkens",
    "El regalo de dar",
    "Le plaisir d'offrir",
    "La gioia di donare",
    "O Dom de Presentear",
    "慷慨回馈"
  ],
  "Summer2024": [
    "End of Summer",
    "夏の終わり",
    "Ende des Sommers",
    "final del verano",
    "Fin de l'été",
    "Fine dell'estate",
    "Fim do Verão",
    "夏末"
  ]
};
export function guideNativeTitle(key:string,language:string):string|undefined{
  const index=LANGUAGES.findIndex(value=>value===language.split('-')[0]);
  return TITLES[key]?.[index<0?0:index];
}
const IDS:Readonly<Record<string,string>>={
 'pixar-fest-star-path-2022':'PixarFestStarPath',
 'the-night-show-star-path-2024':'TBD2024',
 'haunting-elegance-2026':'HauntingElegance2026',
 'seafaring-2026':'Seafaring2026',
 'eggstravaganza-2023':'EggstravaganzaMiniEvent',
 'eggstravaganza-2024':'EggstravaganzaMiniEvent',
 'gift-of-giving-2024':'FestiveMiniEvent',
 'end-of-summer-2024':'Summer2024'
};
export function guideArchiveTitle(event:GuideCalendarEvent,language:string):string|undefined{
  const key=IDS[event.id]??(event.id.startsWith('archive-starpath-')?event.id.slice(17):'');
  return guideNativeTitle(key,language);
}
// Explicit dates in original English start/done mail; only split the exchange
// phase when the mail names a distinct last redemption day.
const DAYS:readonly (readonly [string,string,string,string|null,string|null])[]=[
 ['Festive2022','2022-12-06','2023-02-03','2023-01-27',null], // FestiveStart / FestiveDone
 ['D1002022','2023-02-16','2023-03-29',null,null], // D100Start
 ['Parks2022','2023-04-05','2023-05-24',null,'https://disneydreamlightvalley.com/news/Pride-of-the-Valley-Content-Update'], // official launch; native ParksDone
 ['PixarFest2023','2023-06-07','2023-08-14','2023-08-07',null], // SP05Start / PixarFest2023Done
 ['Halloween2023','2023-09-13','2023-11-08','2023-11-01',null], // SP06Start / SP06Done
 ['Princesses2023','2023-12-05','2024-01-31','2024-01-24',null], // Princesses2023Start / Done
 ['ADayatDisney','2024-05-01','2024-06-12',null,null], // DayADisney2024Start
 ['MajestyMagnolias2024','2024-06-26','2024-08-14',null,null] // MajestyMagnolia2024Start
];
export function mergeGuideArchivedStarpaths(events:readonly GuideCalendarEvent[]):GuideCalendarEvent[]{
  const shared={liveVerified:false,checkedDate:GUIDE_EVENT_CALENDAR_AS_OF,href:null} as const;
  const archived:GuideCalendarEvent[]=[
    {...shared,id:'archive-starpath-Halloween2022',kind:'starpath-archive',title:TITLES.Halloween2022[0],
     evidence:'verified-game-original',sourceUrl:null,precision:'utc-instant',
     startUtc:'2022-10-19T13:00:00Z',taskEndUtcExclusive:'2022-11-22T13:00:00Z',endUtcExclusive:'2022-11-29T13:00:00Z'},
    ...DAYS.map(([key,startDay,endDayInclusive,taskEndDayInclusive,sourceUrl]):GuideCalendarEvent=>({
      ...shared,id:'archive-starpath-'+key,kind:'starpath-history',title:TITLES[key][0],
      sourceUrl,evidence:sourceUrl?'official-announcement':'verified-game-original',
      precision:'date-only',startDay,endDayInclusive,officialEndUtc:null,
      ...(taskEndDayInclusive?{taskEndDayInclusive}:{})
    }))
  ];
  const ids=new Set(events.map(event=>event.id));
  return [...events,...archived.filter(event=>!ids.has(event.id))];
}
