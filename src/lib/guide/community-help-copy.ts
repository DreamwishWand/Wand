import type {WandLanguage} from '$lib/ui/preferences.ts';
const COPY={
ja:['コミュニティヘルプセンター','関連する不具合','攻略Tips','質問','問題を報告','Tipsを投稿','質問する','準備中','読み込み中','関連する投稿はありません','投稿を取得できませんでした','再試行','すべて見る','未解決','解決済み','回答','評価'],
en:['Community Help Center','Related issues','Tips','Questions','Report an issue','Share a tip','Ask a question','Coming soon','Loading','No related posts','Could not load posts','Retry','View all','Open','Resolved','Answers','Score'],
fr:['Centre d’aide communautaire','Problèmes associés','Astuces','Questions','Signaler un problème','Partager une astuce','Poser une question','Bientôt disponible','Chargement','Aucune publication associée','Impossible de charger les publications','Réessayer','Tout voir','Non résolu','Résolu','Réponses','Score'],
it:['Centro assistenza della community','Problemi correlati','Consigli','Domande','Segnala un problema','Condividi un consiglio','Fai una domanda','Prossimamente','Caricamento','Nessun post correlato','Impossibile caricare i post','Riprova','Vedi tutti','Aperto','Risolto','Risposte','Punteggio'],
de:['Community-Hilfezentrum','Bekannte Probleme','Tipps','Fragen','Problem melden','Tipp teilen','Frage stellen','Demnächst','Wird geladen','Keine zugehörigen Beiträge','Beiträge konnten nicht geladen werden','Erneut versuchen','Alle anzeigen','Offen','Gelöst','Antworten','Bewertung'],
'es-ES':['Centro de ayuda de la comunidad','Problemas relacionados','Consejos','Preguntas','Informar de un problema','Compartir un consejo','Hacer una pregunta','Próximamente','Cargando','No hay publicaciones relacionadas','No se pudieron cargar las publicaciones','Reintentar','Ver todo','Abierto','Resuelto','Respuestas','Puntuación'],
'zh-CN':['社区帮助中心','相关问题','攻略技巧','提问','报告问题','分享技巧','提出问题','即将推出','加载中','暂无相关帖子','无法加载帖子','重试','查看全部','未解决','已解决','回答','评分'],
'pt-BR':['Central de ajuda da comunidade','Problemas relacionados','Dicas','Perguntas','Relatar um problema','Compartilhar uma dica','Fazer uma pergunta','Em breve','Carregando','Nenhuma publicação relacionada','Não foi possível carregar as publicações','Tentar novamente','Ver tudo','Aberto','Resolvido','Respostas','Pontuação']
} as const satisfies Record<WandLanguage,readonly [string,string,string,string,string,string,string,string,string,string,string,string,string,string,string,string,string]>;
export function guideHelpCopy(language:WandLanguage){
  const [heading,issue,tip,question,report,share,ask,unavailable,loading,empty,error,retry,all,open,resolved,answers,score]=COPY[language]??COPY.en;
  return {heading,sections:{issue,tip,question},actions:{issue:report,tip:share,question:ask},unavailable,loading,empty,error,retry,all,open,resolved,answers,score};
}
