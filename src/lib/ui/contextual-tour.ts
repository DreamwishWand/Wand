import type {WandLanguage} from './preferences';
import type {ShellCopy} from './shell-copy';

export interface TourStep {
  description:string;
  /** First currently rendered, visible selector wins. No route-internal code is changed. */
  selectors:readonly string[];
}
export interface TourDeck {
  title:string;
  steps:readonly TourStep[];
}
export interface TourNavigationCopy {
  previous:string;
  next:string;
  done:string;
  progress:string;
}

export const TOUR_NAVIGATION:Record<WandLanguage,TourNavigationCopy>={
  ja:{previous:'戻る',next:'次へ',done:'完了',progress:'手順'},
  en:{previous:'Back',next:'Next',done:'Finish',progress:'Step'},
  fr:{previous:'Retour',next:'Suivant',done:'Terminer',progress:'Étape'},
  it:{previous:'Indietro',next:'Avanti',done:'Fine',progress:'Passaggio'},
  de:{previous:'Zurück',next:'Weiter',done:'Fertig',progress:'Schritt'},
  'es-ES':{previous:'Atrás',next:'Siguiente',done:'Finalizar',progress:'Paso'},
  'zh-CN':{previous:'上一步',next:'下一步',done:'完成',progress:'步骤'},
  'pt-BR':{previous:'Voltar',next:'Próximo',done:'Concluir',progress:'Etapa'}
};

/** Small additional decks for Guide routes that have no legacy page-specific copy. */
const GUIDE_DETAILS:Record<WandLanguage,{
  hub:readonly [string,string,string];
  events:readonly [string,string,string];
  source:readonly [string,string,string];
}>={
  ja:{
    hub:['クエスト・スターパス・イベントのガイドへ移動できます。','タイムラインでイベントの開催期間を比較できます。','期間移動・5週／9週の切り替えができます。'],
    events:['イベント名や報酬アイテム名から検索できます。','報酬の区分で表示対象を絞り込めます。','イベントを選ぶと設定されている報酬候補を確認できます。'],
    source:['必要に応じて原本から抽出したローカルデータを読み込めます。','名称やIDで収録クエストを検索できます。','検索結果を選択すると原本由来の詳細を確認できます。']
  },
  en:{
    hub:['Open the quest, Star Path, or event guide.','Compare event periods on the timeline.','Move between periods or switch between 5 and 9 weeks.'],
    events:['Search by event name or reward item.','Narrow the results by reward category.','Select an event to inspect its configured reward candidates.'],
    source:['Optionally load locally extracted source data.','Search indexed quests by name or ID.','Select a result to inspect source-backed details.']
  },
  fr:{
    hub:['Ouvrez les guides de quêtes, Pass étoiles et événements.','Comparez les périodes des événements sur la frise.','Parcourez les périodes et choisissez 5 ou 9 semaines.'],
    events:['Recherchez un événement ou un objet de récompense.','Filtrez les résultats par catégorie.','Choisissez un événement pour voir les récompenses configurées.'],
    source:['Chargez si nécessaire les données source locales.','Recherchez les quêtes par nom ou identifiant.','Sélectionnez un résultat pour afficher les détails de la source.']
  },
  it:{
    hub:['Apri le guide a missioni, Star Path ed eventi.','Confronta i periodi degli eventi sulla timeline.','Naviga tra i periodi e scegli 5 o 9 settimane.'],
    events:['Cerca eventi o oggetti premio.','Filtra i risultati per categoria.','Seleziona un evento per vedere i premi configurati.'],
    source:['Carica facoltativamente i dati locali estratti dal gioco.','Cerca missioni per nome o ID.','Seleziona un risultato per vedere i dettagli originali.']
  },
  de:{
    hub:['Öffne die Guides für Quests, Sternenpfade und Events.','Vergleiche Event-Zeiträume auf der Zeitleiste.','Wechsle den Zeitraum oder wähle 5 bzw. 9 Wochen.'],
    events:['Suche nach Eventnamen oder Belohnungen.','Filtere nach Belohnungskategorie.','Wähle ein Event, um konfigurierte Belohnungen anzusehen.'],
    source:['Lade bei Bedarf lokal extrahierte Quelldaten.','Suche Quests nach Namen oder ID.','Wähle ein Ergebnis für Details aus den Quelldaten.']
  },
  'es-ES':{
    hub:['Abre las guías de misiones, caminos de estrellas y eventos.','Compara los períodos de eventos en la cronología.','Cambia de período o elige 5 o 9 semanas.'],
    events:['Busca eventos u objetos de recompensa.','Filtra los resultados por categoría.','Selecciona un evento para consultar las recompensas configuradas.'],
    source:['Carga opcionalmente datos originales extraídos en local.','Busca misiones por nombre o ID.','Elige un resultado para ver los detalles originales.']
  },
  'zh-CN':{
    hub:['打开任务、星光之路和活动指南。','在时间轴中比较活动举办时间。','切换时间段或选择显示 5 周／9 周。'],
    events:['按活动名称或奖励物品搜索。','按奖励类别筛选结果。','选择活动可查看其配置的奖励项目。'],
    source:['可按需载入本地提取的游戏原始数据。','按名称或 ID 搜索任务。','选择结果以查看原始数据中的详情。']
  },
  'pt-BR':{
    hub:['Acesse os guias de missões, Star Path e eventos.','Compare os períodos de eventos na linha do tempo.','Navegue entre períodos ou escolha 5 ou 9 semanas.'],
    events:['Pesquise eventos ou itens de recompensa.','Filtre os resultados por categoria.','Selecione um evento para consultar as recompensas configuradas.'],
    source:['Se desejar, carregue dados originais extraídos localmente.','Pesquise missões por nome ou ID.','Selecione um resultado para ver os detalhes da fonte.']
  }
};

function entry(description:string,...selectors:string[]):TourStep{
  return {description,selectors};
}

export function contextualTour(route:string,copy:ShellCopy,locale:WandLanguage):TourDeck{
  const path=route.replace(/\/+$/,'')||'/';
  const navigation=copy.tutorials;
  if(path==='/')return {
    title:navigation.home.title,
    steps:[
      entry(navigation.home.steps[0],'.portal-card-collection','.portal-grid'),
      entry(navigation.home.steps[1],'.portal-card.planned'),
      entry(navigation.home.steps[2],'.header-home-button')
    ]
  };
  if(path.startsWith('/collection'))return {
    title:navigation.collection.title,
    steps:[
      entry(navigation.collection.steps[0],'.collection-workspace .search-box','.collection-page .toolbar'),
      entry(navigation.collection.steps[1],'.collection-results .item-card-body','.facet-grid .facet-card','.collection-results'),
      entry(navigation.collection.steps[2],'.shell-save-button'),
      entry(navigation.collection.steps[3],'.shell-file-desktop button:not(:disabled)','.shell-file-mobile button:not(:disabled)','.shell-more-root button:not(:disabled)')
    ]
  };
  if(path.startsWith('/guide/star-path'))return{
    title:navigation.starpath.title,
    steps:[
      entry(navigation.starpath.steps[0],'.starpath .seasons','.starpath .historic-starpaths'),
      entry(navigation.starpath.steps[1],'.starpath .search','.starpath .reward-search','.starpath .tabs')
    ]
  };
  if(path.startsWith('/guide/characters'))return{
    title:navigation.characters.title,
    steps:[
      entry(navigation.characters.steps[0],'.character-guide .controls'),
      entry(navigation.characters.steps[1],'.character-guide .characters','.character-guide .workspace')
    ]
  };
  if(path.startsWith('/guide/events'))return{
    title:navigation.guide.title,
    steps:[
      entry(GUIDE_DETAILS[locale].events[0],'.event-guide .search'),
      entry(GUIDE_DETAILS[locale].events[1],'.event-guide .filters'),
      entry(GUIDE_DETAILS[locale].events[2],'.event-guide .event-list','.event-guide .workspace')
    ]
  };
  if(path.startsWith('/guide/source'))return{
    title:navigation.guide.title,
    steps:[
      entry(GUIDE_DETAILS[locale].source[0],'.guide-page .guide-import'),
      entry(GUIDE_DETAILS[locale].source[1],'.guide-page .guide-toolbar'),
      entry(GUIDE_DETAILS[locale].source[2],'.guide-page .guide-results','.guide-page .guide-list')
    ]
  };
  if(path.startsWith('/guide/quests'))return{
    title:navigation.guide.title,
    steps:[
      entry(navigation.guide.steps[0],'.quests-public .searchbar','.quests-public .quest-sections'),
      entry(navigation.guide.steps[1],'.quests-public .results','.quests-public .workspace')
    ]
  };
  if(path.startsWith('/guide'))return{
    title:navigation.guide.title,
    steps:[
      entry(GUIDE_DETAILS[locale].hub[0],'.guide-app .guide-sections'),
      entry(GUIDE_DETAILS[locale].hub[1],'.guide-app .timeline-panel'),
      entry(GUIDE_DETAILS[locale].hub[2],'.guide-app .calendar-nav')
    ]
  };
  if(path.startsWith('/world'))return{
    title:navigation.world.title,
    steps:[
      entry(navigation.world.steps[0],'.world-preview .world-toolbar','.graph-panel .graph-file','.header-context-tools'),
      entry(navigation.world.steps[1],'.world-preview .selector-row','.graph-panel .graph-controls','.world-preview .world-panel')
    ]
  };
  if(path.startsWith('/save'))return{
    title:navigation.save.title,
    steps:[
      entry(navigation.save.steps[0],'.shell-save-button','.save-diagnostics-page .local-picker'),
      entry(navigation.save.steps[1],'.dev-preview section[aria-label="数量変更の検証"]','.save-diagnostics-page .local-picker','.dev-preview .saved-slots'),
      entry(navigation.save.steps[2],'.dev-preview .active-save-file','.save-diagnostics-page .disclaimer','.shell-save-button')
    ]
  };
  return{title:navigation.home.title,steps:[entry(navigation.home.steps[2],'.header-home-button')]};
}
