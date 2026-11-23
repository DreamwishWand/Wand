/** Pure display labels for source-qualified Quest backlink navigation. */
import type {WandLanguage} from '../ui/preferences.ts';
export interface CollectionQuestCopy {
  readonly title:string;
  readonly loading:string;
  readonly error:string;
  readonly retry:string;
  readonly targetHeading:string;
  readonly rewardHeading:string;
  readonly showAll:string;
  readonly empty:string;
  readonly caution:string;
}
const COPY={
  ja:{
    title:'関連クエスト',loading:'読み込み中…',
    error:'クエスト情報を読み込めませんでした。',retry:'再試行',
    targetHeading:'目標候補',rewardHeading:'報酬候補',
    showAll:'すべてガイドで見る',
    empty:'原本に関連クエストの記録はありません。',
    caution:'原本の静的な参照です。必須条件・達成状況・報酬の付与は保証しません。'
  },
  en:{
    title:'Related quests',loading:'Loading…',
    error:'Could not load quest links.',retry:'Retry',
    targetHeading:'Possible objectives',rewardHeading:'Possible rewards',
    showAll:'View all in Guide',
    empty:'No linked quests in the current source data.',
    caution:'Static game references only; requirements, progress and rewards are not guaranteed.'
  },
  fr:{
    title:'Quêtes associées',loading:'Chargement…',
    error:'Impossible de charger les liens de quête.',retry:'Réessayer',
    targetHeading:'Objectifs possibles',rewardHeading:'Récompenses possibles',
    showAll:'Tout voir dans le guide',
    empty:'Aucune quête liée dans les données actuelles.',
    caution:'Références statiques uniquement : objectifs, progression et gains non garantis.'
  },
  it:{
    title:'Missioni collegate',loading:'Caricamento…',
    error:'Impossibile caricare i collegamenti alle missioni.',retry:'Riprova',
    targetHeading:'Obiettivi possibili',rewardHeading:'Ricompense possibili',
    showAll:'Vedi tutto nella guida',
    empty:'Nessuna missione collegata nei dati attuali.',
    caution:'Solo riferimenti statici: requisiti, progressi e ricompense non sono garantiti.'
  },
  de:{
    title:'Zugehörige Quests',loading:'Wird geladen…',
    error:'Quest-Verknüpfungen konnten nicht geladen werden.',retry:'Erneut versuchen',
    targetHeading:'Mögliche Questziele',rewardHeading:'Mögliche Belohnungen',
    showAll:'Alle im Guide anzeigen',
    empty:'Keine Quest-Verknüpfungen in den aktuellen Quelldaten.',
    caution:'Nur statische Quelldaten; Ziele, Fortschritt und Belohnungen sind nicht garantiert.'
  },
  'es-ES':{
    title:'Misiones relacionadas',loading:'Cargando…',
    error:'No se pudieron cargar los enlaces a misiones.',retry:'Reintentar',
    targetHeading:'Posibles objetivos',rewardHeading:'Posibles recompensas',
    showAll:'Ver todas en la guía',
    empty:'No hay misiones vinculadas en los datos actuales.',
    caution:'Solo referencias estáticas; requisitos, progreso y recompensas sin confirmar.'
  },
  'zh-CN':{
    title:'相关任务',loading:'加载中…',
    error:'无法加载任务关联信息。',retry:'重试',
    targetHeading:'可能的任务目标',rewardHeading:'可能的奖励',
    showAll:'在指南中查看全部',
    empty:'当前原始数据中没有关联的任务。',
    caution:'仅为原始静态引用，不保证必需条件、任务进度或奖励发放。'
  },
  'pt-BR':{
    title:'Missões relacionadas',loading:'Carregando…',
    error:'Não foi possível carregar os vínculos das missões.',retry:'Tentar novamente',
    targetHeading:'Possíveis objetivos',rewardHeading:'Possíveis recompensas',
    showAll:'Ver tudo no Guia',
    empty:'Nenhuma missão vinculada nos dados atuais.',
    caution:'Apenas referências estáticas; requisitos, progresso e recompensas não são garantidos.'
  }
} satisfies Readonly<Record<WandLanguage,CollectionQuestCopy>>;
export function collectionQuestCopy(locale:string):CollectionQuestCopy{
  return Object.prototype.hasOwnProperty.call(COPY,locale)
    ? COPY[locale as WandLanguage] : COPY.ja;
}
