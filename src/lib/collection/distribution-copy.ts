/** Compact, localizable source-route group labels. Never labels an item
 * itself permanently/temporarily available, or currently obtainable. */
import type {WandLanguage} from '../ui/preferences.ts';
import type {
  CollectionDistributionGroup,CollectionDistributionProof
} from './distribution-evidence.ts';

interface DistributionCopy{
  readonly title:string;
  readonly sourcesLabel:string;
  readonly caveat:string;
  readonly groups:Readonly<Record<CollectionDistributionGroup,string>>;
  readonly proofs:Readonly<Record<CollectionDistributionProof,string>>;
}
const COPY={
  ja:{
    title:'入手・配布の区分',sourcesLabel:'原本で確認できた経路と候補',
    caveat:'経路は重複します。現在の入手可否やアイテム自体の期間限定性は未確認です。',
    groups:{
      ordinary_gameplay:'ゲーム内の入手経路',
      gameplay_time_condition:'ゲーム内時間に条件がある経路',
      real_world_distribution:'現実時間・オンラインに連動する配布元'
    },
    proofs:{
      configured_item_id_link:'Item IDの出典一致',
      native_source_category:'原本のカテゴリ分類',
      configured_route_unverified:'入手経路の候補',
      name_only_candidate:'名称一致のみ（未確認）'
    }
  },
  en:{
    title:'Acquisition and distribution',sourcesLabel:'Source-linked routes and candidates',
    caveat:'Routes may overlap. Current availability and whether the item itself is limited are unverified.',
    groups:{
      ordinary_gameplay:'In-game acquisition routes',
      gameplay_time_condition:'Routes with in-game clock conditions',
      real_world_distribution:'Real-world and online distribution sources'
    },
    proofs:{
      configured_item_id_link:'Source-linked Item ID',
      native_source_category:'Original source category',
      configured_route_unverified:'Unverified route',
      name_only_candidate:'Name match only (unverified)'
    }
  },
  fr:{
    title:'Obtention et distribution',sourcesLabel:'Parcours et indices des sources',
    caveat:'Plusieurs parcours sont possibles. Disponibilité actuelle et caractère limité de l’objet non vérifiés.',
    groups:{
      ordinary_gameplay:'Obtention dans le jeu',
      gameplay_time_condition:'Conditions d’heure dans le jeu',
      real_world_distribution:'Distribution réelle et en ligne'
    },
    proofs:{
      configured_item_id_link:'ID de l’objet lié à la source',
      native_source_category:'Catégorie du jeu d’origine',
      configured_route_unverified:'Parcours non confirmé',
      name_only_candidate:'Nom similaire uniquement (non vérifié)'
    }
  },
  it:{
    title:'Ottenimento e distribuzione',sourcesLabel:'Percorsi e ipotesi delle fonti',
    caveat:'I percorsi possono sovrapporsi. Disponibilità e limitazioni temporali dell’oggetto non verificate.',
    groups:{
      ordinary_gameplay:'Ottenimento nel gioco',
      gameplay_time_condition:'Condizioni orarie nel gioco',
      real_world_distribution:'Distribuzione online e nel mondo reale'
    },
    proofs:{
      configured_item_id_link:'ID oggetto collegato alla fonte',
      native_source_category:'Categoria nei dati originali',
      configured_route_unverified:'Percorso non confermato',
      name_only_candidate:'Solo somiglianza del nome (non verificata)'
    }
  },
  de:{
    title:'Erwerb und Verteilung',sourcesLabel:'Quellenbasierte Wege und Kandidaten',
    caveat:'Mehrere Wege sind möglich. Verfügbarkeit und zeitliche Begrenzung des Items sind unbestätigt.',
    groups:{
      ordinary_gameplay:'Erwerbswege im Spiel',
      gameplay_time_condition:'Wege mit spielinternen Zeitbedingungen',
      real_world_distribution:'Reale und Online-Verteilungsquellen'
    },
    proofs:{
      configured_item_id_link:'Quellenbelegte Item-ID',
      native_source_category:'Ursprüngliche Quellenkategorie',
      configured_route_unverified:'Unbestätigter Weg',
      name_only_candidate:'Nur Namensübereinstimmung (unbestätigt)'
    }
  },
  'es-ES':{
    title:'Obtención y distribución',sourcesLabel:'Vías y candidatos según las fuentes',
    caveat:'Las vías pueden coincidir. No se ha verificado la disponibilidad ni si el objeto es limitado.',
    groups:{
      ordinary_gameplay:'Vías de obtención en el juego',
      gameplay_time_condition:'Vías con horario dentro del juego',
      real_world_distribution:'Fuentes de distribución real y en línea'
    },
    proofs:{
      configured_item_id_link:'ID del objeto vinculado a la fuente',
      native_source_category:'Categoría en los datos originales',
      configured_route_unverified:'Vía sin confirmar',
      name_only_candidate:'Solo coincidencia del nombre (sin verificar)'
    }
  },
  'zh-CN':{
    title:'获取与发放类别',sourcesLabel:'原始数据中的获取途径及候选',
    caveat:'同一物品可有多种途径。当前能否获取及物品本身是否限时尚未验证。',
    groups:{
      ordinary_gameplay:'游戏内获取途径',
      gameplay_time_condition:'有游戏内时间条件的途径',
      real_world_distribution:'与现实时间及在线活动有关的发放来源'
    },
    proofs:{
      configured_item_id_link:'物品 ID 与来源对应',
      native_source_category:'原始数据分类',
      configured_route_unverified:'尚未确认的途径',
      name_only_candidate:'仅名称匹配（未验证）'
    }
  },
  'pt-BR':{
    title:'Obtenção e distribuição',sourcesLabel:'Rotas e candidatos identificados nas fontes',
    caveat:'As rotas podem coincidir. Disponibilidade atual e limite temporal do item não foram verificados.',
    groups:{
      ordinary_gameplay:'Rotas de obtenção no jogo',
      gameplay_time_condition:'Rotas com condições de horário no jogo',
      real_world_distribution:'Fontes de distribuição real e online'
    },
    proofs:{
      configured_item_id_link:'ID do item ligado à fonte',
      native_source_category:'Categoria nos dados originais',
      configured_route_unverified:'Rota não confirmada',
      name_only_candidate:'Apenas correspondência de nome (não verificada)'
    }
  }
} satisfies Readonly<Record<WandLanguage,DistributionCopy>>;
export function collectionDistributionCopy(locale:string):DistributionCopy{
  return Object.prototype.hasOwnProperty.call(COPY,locale)
    ? COPY[locale as WandLanguage] : COPY.ja;
}
