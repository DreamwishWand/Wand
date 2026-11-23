import type {WandLanguage} from './preferences';
import type {OperationIssueCode,OperationIssueState} from './operation-issues';

export interface HistoryExtraCopy{
  saveTab:string;
  issuesButton:string;
  acknowledge:string;
  acknowledged:string;
  resolved:string;
  issueTitle:Record<OperationIssueCode,string>;
  issueDetail:Record<OperationIssueCode,string>;
}
const ISSUE_COPY:Record<WandLanguage,HistoryExtraCopy>={
 ja:{
  saveTab:'Save Editor',issuesButton:'エラーを確認',acknowledge:'確認済みにする',acknowledged:'確認済み',resolved:'解消済み',
  issueTitle:{'save-file-rejected':'セーブファイルを選択できませんでした','save-read-invalid':'セーブファイルを解析できませんでした','collection-history-stale':'Collectionの編集履歴が無効になりました','collection-history-failed':'Collectionの履歴操作に失敗しました'},
  issueDetail:{'save-file-rejected':'対応する形式の空でないファイルを選択してください。','save-read-invalid':'ファイルの形式や互換性を確認して、必要なら別のセーブを選択してください。','collection-history-stale':'別の操作で記録が変更されたため、古い履歴は安全のため破棄しました。','collection-history-failed':'操作は完了していません。現在の記録を確認してください。'}
 },
 en:{
  saveTab:'Save Editor',issuesButton:'Review errors',acknowledge:'Mark as read',acknowledged:'Read',resolved:'Resolved',
  issueTitle:{'save-file-rejected':'Save file could not be selected','save-read-invalid':'Save file could not be parsed','collection-history-stale':'Collection edit history expired','collection-history-failed':'Collection history action failed'},
  issueDetail:{'save-file-rejected':'Select a nonempty file in a supported format.','save-read-invalid':'Check the format and compatibility, or select a different save.','collection-history-stale':'The record changed elsewhere, so stale history was discarded for safety.','collection-history-failed':'The operation did not complete. Check the current record.'}
 },
 fr:{
  saveTab:'Éditeur de sauvegarde',issuesButton:'Voir les erreurs',acknowledge:'Marquer comme lu',acknowledged:'Lu',resolved:'Résolu',
  issueTitle:{'save-file-rejected':'Sélection du fichier impossible','save-read-invalid':'Analyse de la sauvegarde impossible','collection-history-stale':'Historique Collection obsolète','collection-history-failed':'Échec de l’historique Collection'},
  issueDetail:{'save-file-rejected':'Choisissez un fichier non vide au format pris en charge.','save-read-invalid':'Vérifiez le format ou choisissez une autre sauvegarde.','collection-history-stale':'Les données ont changé ailleurs. L’historique périmé a été effacé.','collection-history-failed':'L’opération n’a pas abouti. Vérifiez les données actuelles.'}
 },
 it:{
  saveTab:'Editor salvataggi',issuesButton:'Mostra errori',acknowledge:'Segna come letto',acknowledged:'Letto',resolved:'Risolto',
  issueTitle:{'save-file-rejected':'Impossibile selezionare il salvataggio','save-read-invalid':'Impossibile analizzare il salvataggio','collection-history-stale':'Cronologia Collection non valida','collection-history-failed':'Operazione cronologia Collection non riuscita'},
  issueDetail:{'save-file-rejected':'Seleziona un file non vuoto in formato supportato.','save-read-invalid':'Controlla il formato o scegli un altro salvataggio.','collection-history-stale':'I dati sono cambiati altrove; la cronologia precedente è stata scartata.','collection-history-failed':'Operazione non completata. Controlla i dati attuali.'}
 },
 de:{
  saveTab:'Save Editor',issuesButton:'Fehler ansehen',acknowledge:'Als gelesen markieren',acknowledged:'Gelesen',resolved:'Behoben',
  issueTitle:{'save-file-rejected':'Speicherdatei konnte nicht ausgewählt werden','save-read-invalid':'Speicherdatei konnte nicht gelesen werden','collection-history-stale':'Collection-Verlauf ist veraltet','collection-history-failed':'Collection-Verlaufsaktion fehlgeschlagen'},
  issueDetail:{'save-file-rejected':'Wähle eine nicht leere Datei in einem unterstützten Format.','save-read-invalid':'Prüfe Format und Kompatibilität oder wähle eine andere Datei.','collection-history-stale':'Die Daten wurden anderweitig geändert. Der alte Verlauf wurde verworfen.','collection-history-failed':'Die Aktion wurde nicht abgeschlossen. Prüfe den aktuellen Stand.'}
 },
 'es-ES':{
  saveTab:'Editor de partidas',issuesButton:'Ver errores',acknowledge:'Marcar como leído',acknowledged:'Leído',resolved:'Resuelto',
  issueTitle:{'save-file-rejected':'No se pudo seleccionar la partida','save-read-invalid':'No se pudo analizar la partida','collection-history-stale':'Historial de Collection caducado','collection-history-failed':'Error en el historial de Collection'},
  issueDetail:{'save-file-rejected':'Selecciona un archivo no vacío de formato admitido.','save-read-invalid':'Comprueba el formato o elige otra partida.','collection-history-stale':'Los datos cambiaron en otro lugar y se descartó el historial anterior.','collection-history-failed':'La operación no terminó. Comprueba los datos actuales.'}
 },
 'zh-CN':{
  saveTab:'存档编辑器',issuesButton:'查看错误',acknowledge:'标记为已读',acknowledged:'已读',resolved:'已解决',
  issueTitle:{'save-file-rejected':'无法选择存档文件','save-read-invalid':'无法解析存档文件','collection-history-stale':'Collection 编辑历史已失效','collection-history-failed':'Collection 历史操作失败'},
  issueDetail:{'save-file-rejected':'请选择受支持格式的非空文件。','save-read-invalid':'检查文件格式和兼容性，或选择其他存档。','collection-history-stale':'记录已在其他位置更改，旧历史已安全丢弃。','collection-history-failed':'操作未完成，请检查当前记录。'}
 },
 'pt-BR':{
  saveTab:'Editor de Save',issuesButton:'Ver erros',acknowledge:'Marcar como lido',acknowledged:'Lido',resolved:'Resolvido',
  issueTitle:{'save-file-rejected':'Não foi possível selecionar o save','save-read-invalid':'Não foi possível analisar o save','collection-history-stale':'Histórico de Collection expirou','collection-history-failed':'Falha no histórico de Collection'},
  issueDetail:{'save-file-rejected':'Selecione um arquivo não vazio em formato aceito.','save-read-invalid':'Verifique o formato ou selecione outro save.','collection-history-stale':'O registro mudou em outro lugar e o histórico antigo foi descartado.','collection-history-failed':'A operação não foi concluída. Verifique o registro atual.'}
 }
};
export function historyExtraCopy(locale:WandLanguage):HistoryExtraCopy{return ISSUE_COPY[locale];}
export function issueStateLabel(copy:HistoryExtraCopy,state:OperationIssueState):string{
  return state==='resolved'?copy.resolved:copy.acknowledged;
}
