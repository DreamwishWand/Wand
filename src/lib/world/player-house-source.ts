import manifest from './player-house-source.json' with {type:'json'};
export async function readLocalHouseTemplates(files:readonly File[]):Promise<Map<number,string>>{
 if(!files.length||files.length>5)throw Error('HOUSE_SOURCE_COUNT');
 const result=new Map<number,string>();
 for(const file of files){
  if(file.size<1||file.size>8192)throw Error('HOUSE_SOURCE_SIZE');
  const data=new Uint8Array(await file.arrayBuffer());
  try{
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
   const row=manifest.templates.find(t=>t.sha256===hash);
   if(!row)throw Error('HOUSE_SOURCE_HASH');
   const hex=Array.from(data,b=>b.toString(16).padStart(2,'0')).join('');
   for(const id of row.itemIds)result.set(id,hex);
  }finally{data.fill(0);}
 }
 return result;
}
export const houseSourceWords={
 ja:['新規ハウス用のゲーム原本を読み込む（ローカル）','対応する原本ファイルではありません。','読み込み済みハウス'],
 en:['Load original house layouts locally','Unsupported original layout file.','Loaded house types'],
 fr:['Charger les plans originaux localement','Fichier original non compatible.','Types de maisons chargés'],
 it:['Carica i layout originali in locale','File originale non supportato.','Tipi di case caricati'],
 de:['Originale Hauslayouts lokal laden','Nicht unterstützte Originaldatei.','Geladene Haustypen'],
 'es-ES':['Cargar diseños originales localmente','Archivo original no compatible.','Tipos de casas cargados'],
 'zh-CN':['在本地读取原始房屋布局','不支持的原始布局文件。','已读取的房屋类型'],
 'pt-BR':['Carregar layouts originais localmente','Arquivo original não compatível.','Tipos de casas carregados']
} as const;

export const newHouseWords={
 ja:'新規内装を生成します。原本レイアウトは作業復元用にこの端末内だけに保持されます。ゲーム内動作は未検証です。',
 en:'Creates a new interior. The original layout is kept only on this device for draft recovery. In-game behavior is unverified.',
 fr:'Crée un nouvel intérieur. Le plan original reste uniquement sur cet appareil pour la reprise. Comportement en jeu non vérifié.',
 it:'Crea un nuovo interno. Il layout originale resta solo su questo dispositivo per il ripristino. Comportamento in gioco non verificato.',
 de:'Erstellt einen neuen Innenraum. Das Originallayout bleibt zur Wiederherstellung nur auf diesem Gerät. Spielverhalten ungeprüft.',
 'es-ES':'Crea un interior nuevo. El diseño original se conserva solo en este dispositivo para recuperar el borrador. Comportamiento en el juego sin verificar.',
 'zh-CN':'生成新的室内空间。原始布局仅保留在此设备上以恢复编辑。游戏内行为尚未验证。',
 'pt-BR':'Cria um novo interior. O layout original fica apenas neste dispositivo para recuperar o rascunho. Comportamento no jogo não verificado.'
} as const;
