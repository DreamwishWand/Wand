const languages=['ja','en','fr','it','de','es-ES','zh-CN','pt-BR'];
const rows=[
 ['分割表示','すべて収集','すべて解除','全ピースの収集記録を解除しますか？','一部のピース形状は未確認です。','ピースを選択','ピース'],
 ['Show pieces','Collect all','Clear all','Clear all collected pieces?','Some piece shapes are unverified.','Select piece','Piece'],
 ['Afficher les pièces','Tout collecter','Tout effacer','Effacer toutes les pièces collectées ?','Certaines formes restent à vérifier.','Sélectionner une pièce','Pièce'],
 ['Mostra pezzi','Raccogli tutto','Rimuovi tutto','Rimuovere tutti i pezzi raccolti?','Alcune forme non sono verificate.','Seleziona pezzo','Pezzo'],
 ['Teile anzeigen','Alle sammeln','Alle zurücksetzen','Alle gesammelten Teile zurücksetzen?','Einige Teilformen sind ungeprüft.','Teil auswählen','Teil'],
 ['Mostrar piezas','Recoger todo','Borrar todo','¿Borrar todas las piezas recogidas?','Algunas formas no están verificadas.','Seleccionar pieza','Pieza'],
 ['显示碎片','全部收集','全部清除','清除所有已收集碎片？','部分碎片形状尚未验证。','选择碎片','碎片'],
 ['Mostrar peças','Coletar tudo','Limpar tudo','Limpar todas as peças coletadas?','Algumas formas não foram verificadas.','Selecionar peça','Peça']
] as const;
export function memoryPieceCopy(locale:string){
  const r=rows[languages.indexOf(locale)]??rows[1];
  return {split:r[0],all:r[1],clear:r[2],confirmClear:r[3],unverified:r[4],select:r[5],piece:r[6]};
}
