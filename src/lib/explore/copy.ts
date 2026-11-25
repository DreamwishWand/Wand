import type {ExploreCategory} from './scope.ts';
const locales=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'];
const words:Record<string,readonly string[]>={
  outdoor:['屋外','Outdoors','Extérieur','Esterno','Draußen','Exterior','室外','Exterior'],
  indoor:['屋内','Indoors','Intérieur','Interno','Drinnen','Interior','室内','Interior'],
  all:['すべて','All','Tout','Tutto','Alle','Todo','全部','Todos'],
  search:['アイテムを検索','Search items','Rechercher','Cerca','Suchen','Buscar','搜索物品','Pesquisar'],
  filters:['フィルター','Filters','Filtres','Filtri','Filter','Filtros','筛选','Filtros'],
  owned:['所有済みのみ','Owned only','Possédés','Posseduti','Im Besitz','En posesión','仅已拥有','Possuídos'],
  noOwnership:['所有情報なし','No ownership data','Aucune donnée de possession','Nessun dato di possesso','Keine Besitzdaten','Sin datos de posesión','无拥有数据','Sem dados de posse'],
  favorites:['お気に入り','Favorites','Favoris','Preferiti','Favoriten','Favoritos','收藏','Favoritos'],
  boards:['ムードボード','Moodboards','Planches','Moodboard','Moodboards','Paneles','灵感板','Moodboards'],
  category:['カテゴリー','Category','Catégorie','Categoria','Kategorie','Categoría','类别','Categoria'],
  universe:['ユニバース','Universe','Univers','Universo','Universum','Universo','系列','Universo'],
  world:['ワールド','World','Monde','Mondo','Welt','Mundo','世界','Mundo'],
  clear:['クリア','Clear','Effacer','Cancella','Zurücksetzen','Borrar','清除','Limpar'],
  close:['閉じる','Close','Fermer','Chiudi','Schließen','Cerrar','关闭','Fechar'],
  select:['複数選択','Multi-select','Sélection multiple','Selezione multipla','Mehrfachauswahl','Selección múltiple','多选','Seleção múltipla'],
  furniture:['家具','Furniture','Meubles','Mobili','Möbel','Muebles','家具','Móveis'],
  allTypes:['全種類','All types','Tous les types','Tutti i tipi','Alle Arten','Todos los tipos','所有类别','Todos os tipos'],
  seating:['椅子・ソファ','Seating','Sièges','Sedute','Sitzmöbel','Asientos','座椅','Assentos'],
  table:['テーブル','Tables','Tables','Tavoli','Tische','Mesas','桌子','Mesas'],
  bed:['ベッド','Beds','Lits','Letti','Betten','Camas','床','Camas'],
  storage:['収納・棚','Storage','Rangement','Contenitori','Aufbewahrung','Almacenamiento','储物','Armazenamento'],
  lighting:['照明','Lighting','Éclairage','Illuminazione','Beleuchtung','Iluminación','照明','Iluminação'],
  equipment:['家電・設備','Equipment','Équipement','Attrezzature','Geräte','Equipamiento','设备','Equipamentos'],
  decor:['装飾品・小物','Decor','Décoration','Decorazioni','Dekoration','Decoración','装饰','Decoração'],
  rug:['ラグ','Rugs','Tapis','Tappeti','Teppiche','Alfombras','地毯','Tapetes'],
  wall:['壁掛け','Wall decor','Décor mural','Decorazioni da parete','Wanddeko','Decoración mural','墙饰','Decoração de parede'],
  ceiling:['天井装飾','Ceiling decor','Décor de plafond','Decorazioni da soffitto','Deckendeko','Decoración de techo','天花板装饰','Decoração de teto'],
  'window-door':['窓・ドア','Windows & doors','Fenêtres et portes','Finestre e porte','Fenster & Türen','Ventanas y puertas','门窗','Janelas e portas'],
  other:['その他の家具','Other furniture','Autres meubles','Altri mobili','Andere Möbel','Otros muebles','其他家具','Outros móveis'],
  landscaping:['景観','Landscaping','Paysage','Paesaggio','Landschaft','Paisajismo','景观','Paisagismo'],
  path:['道','Paths','Chemins','Sentieri','Wege','Caminos','道路','Caminhos'],
  fence:['フェンス','Fences','Clôtures','Recinzioni','Zäune','Vallas','围栏','Cercas'],
  buildings:['建物','Buildings','Bâtiments','Edifici','Gebäude','Edificios','建筑','Construções'],
  wallpaper:['壁紙','Wallpaper','Papier peint','Carta da parati','Tapeten','Papel pintado','壁纸','Papel de parede'],
  flooring:['床板','Flooring','Sols','Pavimenti','Böden','Suelos','地板','Pisos'],
  environment:['環境','Environment','Environnement','Ambiente','Umgebung','Entorno','环境','Ambiente']
};
export function exploreLabel(locale:string,key:string):string{
  const row=words[key];return row?.[locales.indexOf(locale)]??row?.[1]??key;
}
export const CATEGORY_ICONS:Record<ExploreCategory,string>={
  seating:'chair',table:'table',bed:'bed',storage:'storage',lighting:'lamp',equipment:'settings',decor:'sparkles',rug:'grid',wall:'gallery',ceiling:'lamp', 'window-door':'door',other:'collection',landscaping:'plant',path:'path',fence:'fence',buildings:'home',wallpaper:'gallery',flooring:'grid',environment:'mountain'
};
