/** UI-only labels for DB-01's six source-backed Item ID acquisition axes. */
import type {GameNativeItemCategory} from '$lib/acquisition/game-native-item-categories.ts';

const LABELS:Readonly<Record<string,Readonly<Record<GameNativeItemCategory,string>>>>={
  ja:{
    ordinary_gameplay:'通常プレイ',premium_shop:'プレミアムショップ',
    star_path:'スターパス',in_game_limited_event:'ゲーム内期間限定イベント',
    real_time_limited_event:'現実時間連動の配布',
    iap_package_reward:'有料パッケージ報酬'
  },
  en:{
    ordinary_gameplay:'Normal gameplay',premium_shop:'Premium Shop',
    star_path:'Star Path',in_game_limited_event:'In-game limited event',
    real_time_limited_event:'Real-time distribution',
    iap_package_reward:'Paid package reward'
  },
  fr:{
    ordinary_gameplay:'Jeu normal',premium_shop:'Boutique premium',
    star_path:'Voie des étoiles',in_game_limited_event:'Événement temporaire du jeu',
    real_time_limited_event:'Distribution à durée limitée',
    iap_package_reward:'Récompense de pack payant'
  },
  it:{
    ordinary_gameplay:'Gioco normale',premium_shop:'Negozio premium',
    star_path:'Percorso stellare',in_game_limited_event:'Evento a tempo nel gioco',
    real_time_limited_event:'Distribuzione a tempo',
    iap_package_reward:'Ricompensa pacchetto a pagamento'
  },
  de:{
    ordinary_gameplay:'Normales Gameplay',premium_shop:'Premium-Shop',
    star_path:'Sternenpfad',in_game_limited_event:'Zeitlich begrenztes Spielevent',
    real_time_limited_event:'Zeitlich begrenzte Verteilung',
    iap_package_reward:'Belohnung aus Kaufpaket'
  },
  'es-ES':{
    ordinary_gameplay:'Juego normal',premium_shop:'Tienda prémium',
    star_path:'Camino de estrellas',in_game_limited_event:'Evento temporal del juego',
    real_time_limited_event:'Distribución por tiempo limitado',
    iap_package_reward:'Recompensa de paquete de pago'
  },
  'zh-CN':{
    ordinary_gameplay:'常规玩法',premium_shop:'高级商店',
    star_path:'星光之路',in_game_limited_event:'游戏内限时活动',
    real_time_limited_event:'现实时间限定发放',
    iap_package_reward:'付费礼包奖励'
  },
  'pt-BR':{
    ordinary_gameplay:'Jogo normal',premium_shop:'Loja premium',
    star_path:'Caminho Estelar',in_game_limited_event:'Evento temporário do jogo',
    real_time_limited_event:'Distribuição por tempo limitado',
    iap_package_reward:'Recompensa de pacote pago'
  }
};
const HEADINGS:Readonly<Record<string,string>>={
  ja:'入手元',en:'Acquisition source',fr:"Source d’obtention",
  it:'Origine oggetto',de:'Bezugsquelle','es-ES':'Procedencia',
  'zh-CN':'获取来源','pt-BR':'Origem do item'
};
export function collectionDb01AcquisitionLabel(locale:string,category:GameNativeItemCategory):string{
  return (LABELS[locale]??LABELS.en)[category];
}
export function collectionDb01AcquisitionHeading(locale:string):string{
  return HEADINGS[locale]??HEADINGS.en;
}
