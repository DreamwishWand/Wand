/** Collection acquisition panel copy for every supported Wand language.
 * Pure UI labels; game source evidence, Item IDs and method classification
 * remain in the independently verified DB-00/DB-02 readers. */
import type {WandLanguage} from '../ui/preferences.ts';
import type {
  CollectionAcquisitionKind,CollectionAcquisitionCandidate
} from './acquisition-summary.ts';

export interface CollectionAcquisitionCopy {
  readonly title:string;
  readonly loading:string;
  readonly error:string;
  readonly retry:string;
  readonly sourcesLabel:string;
  readonly candidatesTitle:string;
  readonly candidatesLabel:string;
  readonly caveat:string;
  readonly empty:string;
  readonly kinds:Readonly<Record<CollectionAcquisitionKind,string>>;
  readonly candidates:Readonly<Record<CollectionAcquisitionCandidate,string>>;
}

const COPY={
  ja:{
    title:'入手元',loading:'読み込み中…',error:'情報を読み込めませんでした。',
    retry:'再試行',sourcesLabel:'原本に登録された入手元',
    candidatesTitle:'原本上の候補',candidatesLabel:'入手を保証しない原本上の候補',
    caveat:'現在の販売・入手可否は未確認です。',
    empty:'登録済みの入手元情報はありません。',
    kinds:{
      crafting:'クラフト',cooking:'料理',fishing:'釣り',mining:'採掘',
      timebending:'タイムベンディング',farming:'栽培',foraging:'採集',
      game_shop:'ゲーム内ショップ',quest_reward:'クエスト報酬',
      event_reward:'イベント報酬',friendship_reward:'友情報酬',
      starpath:'スターパス',twitch_drop:'Twitch Drops',
      redeem_code:'交換コード',premium_shop:'プレミアムショップ',
      official_campaign:'公式キャンペーン',purchase_bonus:'購入特典',
      gift:'配布'
    },
    candidates:{loot_table:'抽選テーブル',stall_slot:'店舗の陳列候補'}
  },
  en:{
    title:'How to obtain',loading:'Loading…',error:'Could not load sources.',
    retry:'Retry',sourcesLabel:'Source-linked acquisition methods',
    candidatesTitle:'Possible sources',candidatesLabel:'Unconfirmed acquisition candidates',
    caveat:'Current availability and sales are not verified.',
    empty:'No acquisition sources recorded.',
    kinds:{
      crafting:'Crafting',cooking:'Cooking',fishing:'Fishing',mining:'Mining',
      timebending:'Timebending',farming:'Growing',foraging:'Foraging',
      game_shop:'In-game shop',quest_reward:'Quest reward',
      event_reward:'Event reward',friendship_reward:'Friendship reward',
      starpath:'Star Path',twitch_drop:'Twitch Drops',
      redeem_code:'Redemption code',premium_shop:'Premium Shop',
      official_campaign:'Official promotion',purchase_bonus:'Purchase bonus',
      gift:'Gift'
    },
    candidates:{loot_table:'Loot table',stall_slot:'Stall stock candidate'}
  },
  fr:{
    title:'Comment obtenir',loading:'Chargement…',
    error:'Impossible de charger les sources.',retry:'Réessayer',
    sourcesLabel:'Méthodes liées aux sources du jeu',
    candidatesTitle:'Sources possibles',candidatesLabel:'Sources non confirmées',
    caveat:'Disponibilité et ventes actuelles non vérifiées.',
    empty:'Aucune source d’obtention enregistrée.',
    kinds:{
      crafting:'Fabrication',cooking:'Cuisine',fishing:'Pêche',mining:'Minage',
      timebending:'Chrono-sablier',farming:'Culture',foraging:'Cueillette',
      game_shop:'Boutique du jeu',quest_reward:'Récompense de quête',
      event_reward:'Récompense d’événement',
      friendship_reward:'Récompense d’amitié',starpath:'Voie des étoiles',
      twitch_drop:'Twitch Drops',redeem_code:'Code à utiliser',
      premium_shop:'Boutique premium',official_campaign:'Promotion officielle',
      purchase_bonus:'Bonus d’achat',gift:'Cadeau'
    },
    candidates:{loot_table:'Table de butin',stall_slot:'Stock potentiel d’étal'}
  },
  it:{
    title:'Come ottenerlo',loading:'Caricamento…',
    error:'Impossibile caricare le fonti.',retry:'Riprova',
    sourcesLabel:'Metodi di ottenimento verificati nelle fonti',
    candidatesTitle:'Fonti possibili',candidatesLabel:'Possibili fonti non confermate',
    caveat:'Disponibilità e vendite attuali non verificate.',
    empty:'Nessuna fonte di ottenimento registrata.',
    kinds:{
      crafting:'Creazione',cooking:'Cucina',fishing:'Pesca',mining:'Estrazione',
      timebending:'Piegatempo',farming:'Coltivazione',foraging:'Raccolta',
      game_shop:'Negozio nel gioco',quest_reward:'Ricompensa missione',
      event_reward:'Ricompensa evento',friendship_reward:'Ricompensa amicizia',
      starpath:'Percorso stellare',twitch_drop:'Twitch Drops',
      redeem_code:'Codice promozionale',premium_shop:'Negozio premium',
      official_campaign:'Promozione ufficiale',
      purchase_bonus:'Bonus acquisto',gift:'Regalo'
    },
    candidates:{loot_table:'Tabella del bottino',stall_slot:'Possibile scorta bancarella'}
  },
  de:{
    title:'Bezugsquellen',loading:'Wird geladen…',
    error:'Quellen konnten nicht geladen werden.',retry:'Erneut versuchen',
    sourcesLabel:'Durch Quelldaten belegte Bezugsarten',
    candidatesTitle:'Mögliche Quellen',
    candidatesLabel:'Nicht bestätigte Bezugsquellen',
    caveat:'Aktuelle Verfügbarkeit und Angebote sind nicht bestätigt.',
    empty:'Keine Bezugsquellen erfasst.',
    kinds:{
      crafting:'Herstellung',cooking:'Kochen',fishing:'Angeln',mining:'Bergbau',
      timebending:'Zeitkrümmung',farming:'Anbau',foraging:'Sammeln',
      game_shop:'Spielgeschäft',quest_reward:'Questbelohnung',
      event_reward:'Eventbelohnung',friendship_reward:'Freundschaftsbelohnung',
      starpath:'Sternenpfad',twitch_drop:'Twitch Drops',
      redeem_code:'Einlösecode',premium_shop:'Premium-Shop',
      official_campaign:'Offizielle Aktion',purchase_bonus:'Kaufbonus',
      gift:'Geschenk'
    },
    candidates:{loot_table:'Beutetabelle',stall_slot:'Mögliches Standangebot'}
  },
  'es-ES':{
    title:'Cómo conseguirlo',loading:'Cargando…',
    error:'No se pudieron cargar las fuentes.',retry:'Reintentar',
    sourcesLabel:'Métodos respaldados por datos del juego',
    candidatesTitle:'Fuentes posibles',
    candidatesLabel:'Fuentes de obtención sin confirmar',
    caveat:'No se han verificado las ofertas ni la disponibilidad actuales.',
    empty:'No hay fuentes de obtención registradas.',
    kinds:{
      crafting:'Fabricación',cooking:'Cocina',fishing:'Pesca',mining:'Minería',
      timebending:'Distorsión temporal',farming:'Cultivo',foraging:'Recolección',
      game_shop:'Tienda del juego',quest_reward:'Recompensa de misión',
      event_reward:'Recompensa de evento',
      friendship_reward:'Recompensa de amistad',
      starpath:'Camino de estrellas',twitch_drop:'Twitch Drops',
      redeem_code:'Código de canje',premium_shop:'Tienda prémium',
      official_campaign:'Promoción oficial',purchase_bonus:'Bono de compra',
      gift:'Regalo'
    },
    candidates:{loot_table:'Tabla de botín',stall_slot:'Posible artículo de puesto'}
  },
  'zh-CN':{
    title:'获取方式',loading:'加载中…',error:'无法加载来源信息。',
    retry:'重试',sourcesLabel:'游戏原始数据中的获取方式',
    candidatesTitle:'可能的来源',candidatesLabel:'尚未确认的获取来源',
    caveat:'当前销售和可获取情况未经确认。',
    empty:'暂无已记录的获取来源。',
    kinds:{
      crafting:'制作',cooking:'烹饪',fishing:'钓鱼',mining:'采矿',
      timebending:'时间弯曲',farming:'种植',foraging:'采集',
      game_shop:'游戏内商店',quest_reward:'任务奖励',event_reward:'活动奖励',
      friendship_reward:'友谊奖励',starpath:'星光之路',
      twitch_drop:'Twitch 掉宝',redeem_code:'兑换码',
      premium_shop:'高级商店',official_campaign:'官方活动',
      purchase_bonus:'购买奖励',gift:'赠礼'
    },
    candidates:{loot_table:'掉落表',stall_slot:'摊位候选商品'}
  },
  'pt-BR':{
    title:'Como obter',loading:'Carregando…',
    error:'Não foi possível carregar as fontes.',retry:'Tentar novamente',
    sourcesLabel:'Métodos confirmados nos dados do jogo',
    candidatesTitle:'Fontes possíveis',candidatesLabel:'Fontes não confirmadas',
    caveat:'A disponibilidade e as ofertas atuais não foram verificadas.',
    empty:'Nenhuma fonte de obtenção registrada.',
    kinds:{
      crafting:'Criação',cooking:'Culinária',fishing:'Pesca',mining:'Mineração',
      timebending:'Dobra temporal',farming:'Cultivo',foraging:'Coleta',
      game_shop:'Loja do jogo',quest_reward:'Recompensa de missão',
      event_reward:'Recompensa de evento',
      friendship_reward:'Recompensa de amizade',
      starpath:'Caminho das Estrelas',twitch_drop:'Twitch Drops',
      redeem_code:'Código de resgate',premium_shop:'Loja Premium',
      official_campaign:'Promoção oficial',purchase_bonus:'Bônus de compra',
      gift:'Presente'
    },
    candidates:{loot_table:'Tabela de saque',stall_slot:'Possível item de barraca'}
  }
} satisfies Readonly<Record<WandLanguage,CollectionAcquisitionCopy>>;

export function collectionAcquisitionCopy(locale:string):CollectionAcquisitionCopy{
  return Object.prototype.hasOwnProperty.call(COPY,locale)
    ? COPY[locale as WandLanguage] : COPY.ja;
}
