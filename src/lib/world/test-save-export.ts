/** Explicit deployment allowlist. Production custom domains are not enabled. */
export function testSaveExportEnabled(location:Pick<Location,'hostname'|'protocol'|'pathname'>|null|undefined):boolean{
 if(!location||!(location.pathname==='/Wand'||location.pathname.startsWith('/Wand/')))return false;
 return location.protocol==='https:'&&location.hostname==='dreamwishwand.github.io'||
  location.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(location.hostname);
}
export const testSaveWords={
 ja:['テスト用セーブコピーを作成','ゲーム内動作未確認。破損の可能性があります。必ず原本を保管してください。','テスト用セーブコピーを保存'],
 en:['Create test Save copy','In-game behavior unverified. The copy may be corrupted. Keep the original.','Download test Save copy'],
 fr:['Créer une copie de test','Comportement en jeu non vérifié. Risque de corruption. Conservez l’original.','Télécharger la copie de test'],
 it:['Crea copia di prova','Comportamento in gioco non verificato. Rischio di corruzione. Conserva l’originale.','Scarica copia di prova'],
 de:['Testkopie erstellen','Spielverhalten ungeprüft. Die Kopie kann beschädigt sein. Original behalten.','Testkopie herunterladen'],
 'es-ES':['Crear copia de prueba','Comportamiento en juego no verificado. Riesgo de corrupción. Conserva el original.','Descargar copia de prueba'],
 'zh-CN':['创建测试存档副本','游戏内行为尚未验证，副本可能损坏。请保留原始存档。','下载测试存档副本'],
 'pt-BR':['Criar cópia de teste','Comportamento no jogo não verificado. A cópia pode ser corrompida. Guarde o original.','Baixar cópia de teste']
} as const;
