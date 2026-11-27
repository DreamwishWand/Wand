/** A room design is a local collection of explicitly selected surfaces,
 * not a native Save or a new Wand Preset category. */
import {emptyDesign,currentDesign,serializeDesign,parseDesign,designItemCounts,type DesignTimeline,type DesignItemGeometry} from './design-layout.ts';
import {readRoomFinish} from './room-finish-design.ts';
import type {RoomDesignTemplate} from './room-design.ts';
export interface RoomProjectSurface{id:number;template:RoomDesignTemplate;timeline:DesignTimeline;finish:number;definitions:ReadonlyMap<number,DesignItemGeometry>}
export const ROOM_PROJECT_FILE_LIMIT=2_000_000;
export const ROOM_PROJECT_WALL_LIMIT=8;
export const ROOM_PROJECT_DRAFT_KEY='room-project:current@1';
export function newRoomSurface(id:number,template:RoomDesignTemplate):RoomProjectSurface{return {id,template,timeline:emptyDesign(),finish:0,definitions:new Map()};}
export function roomProjectCounts(surfaces:readonly RoomProjectSurface[]){
 const furniture=new Map<number,number>(),finishes=new Map<number,number>();
 for(const s of surfaces){for(const [id,n] of designItemCounts(currentDesign(s.timeline)))furniture.set(id,(furniture.get(id)??0)+n);if(s.finish)finishes.set(s.finish,(finishes.get(s.finish)??0)+1);}
 return {furniture,finishes};
}
export function serializeRoomProject(surfaces:readonly RoomProjectSurface[],selected:number):string{
 const text=JSON.stringify({schema:'wand.room-design@1',surfaces:surfaces.map(s=>({id:s.id,design:{...JSON.parse(serializeDesign(s.timeline,s.template.grid)),roomFinish:s.finish}})),selected});
 if(text.length>ROOM_PROJECT_FILE_LIMIT)throw Error('ROOM_PROJECT_SIZE');return text;
}
export function parseRoomProject(raw:string,templates:readonly RoomDesignTemplate[],backup=false):{surfaces:RoomProjectSurface[];selected:number}{
 if(raw.length>ROOM_PROJECT_FILE_LIMIT)throw Error('ROOM_PROJECT_SIZE');const v=JSON.parse(raw);
 if(!v||v.schema!=='wand.room-design@1'||Object.keys(v).length!==3||!Array.isArray(v.surfaces)||!v.surfaces.length||v.surfaces.length>ROOM_PROJECT_WALL_LIMIT+1)throw Error('ROOM_PROJECT');
 const ids=new Set<number>(),surfaces:RoomProjectSurface[]=[];
 for(const row of v.surfaces){
  if(!row||Object.keys(row).length!==2||!Number.isSafeInteger(row.id)||row.id<1||row.id>=Number.MAX_SAFE_INTEGER-1||ids.has(row.id))throw Error('ROOM_SURFACE_ID');
  const template=templates.find(t=>t.grid.key===row.design?.grid?.key);if(!template||template.kind==='support'||(surfaces.length===0?template.kind!=='floor':template.kind!=='wall'))throw Error('ROOM_SURFACE');
  const placements=parseDesign(JSON.stringify(row.design),template.grid,false,backup&&template.kind==='floor'),finish=readRoomFinish(row.design,template.kind)??0;
  ids.add(row.id);surfaces.push({...newRoomSurface(row.id,template),finish,timeline:{snapshots:[placements],cursor:0,nextId:placements.reduce((n,p)=>Math.max(n,p.id+1),1)}});
 }
 if(!ids.has(v.selected))throw Error('ROOM_SELECTED');
 return {surfaces,selected:v.selected};
}
export const roomProjectWords={
ja:['部屋全体を設計','床面','壁面','壁を追加','壁を削除','部屋設計を保存','部屋設計を開く','必要アイテム','部屋設計を終了','壁面は任意に選択してください。原本上の部屋との対応は未確認です。','読み込み・保存に失敗しました。','前回の部屋設計を復元','新しく開始','壁面を削除しますか？','現在の部屋設計を置き換えますか？','仕上げ適用面数','設計を読み込み中…','床面を選択','ローカル保存済み','自動保存できません。設計ファイルを保存してください。'],
en:['Design a room','Floor','Wall','Add wall','Remove wall','Save room design','Open room design','Required items','Close room design','Choose wall templates explicitly. Native room-to-wall mapping is unverified.','Unable to load or save design.','Resume last room','Start new','Remove this wall?','Replace current room design?','Finished surfaces','Loading design…','Choose floor','Saved locally','Autosave unavailable. Save the design file.'],
fr:['Concevoir une pièce','Sol','Mur','Ajouter un mur','Retirer le mur','Enregistrer la pièce','Ouvrir la pièce','Objets requis','Fermer','Choisissez les murs. Correspondance native non vérifiée.','Erreur de lecture ou sauvegarde.','Reprendre la pièce','Nouvelle pièce','Retirer ce mur ?','Remplacer la pièce ?','Surfaces finies','Chargement…','Choisir le sol','Sauvegardé localement','Sauvegarde automatique indisponible.'],
it:['Progetta stanza','Pavimento','Parete','Aggiungi parete','Rimuovi parete','Salva stanza','Apri stanza','Oggetti richiesti','Chiudi','Scegli le pareti; corrispondenza nativa non verificata.','Errore di lettura o salvataggio.','Riprendi stanza','Nuova stanza','Rimuovere la parete?','Sostituire la stanza?','Superfici finite','Caricamento…','Scegli pavimento','Salvato localmente','Salvataggio automatico non disponibile.'],
de:['Raum gestalten','Boden','Wand','Wand hinzufügen','Wand entfernen','Raum speichern','Raum öffnen','Benötigte Objekte','Schließen','Wände wählen; native Zuordnung ungeprüft.','Lesen oder Speichern fehlgeschlagen.','Raum fortsetzen','Neu beginnen','Wand entfernen?','Raum ersetzen?','Gestaltete Flächen','Wird geladen…','Boden wählen','Lokal gespeichert','Automatische Speicherung nicht verfügbar.'],
'es-ES':['Diseñar habitación','Suelo','Pared','Añadir pared','Quitar pared','Guardar habitación','Abrir habitación','Objetos necesarios','Cerrar','Elige las paredes; correspondencia nativa no verificada.','Error de lectura o guardado.','Continuar habitación','Empezar de nuevo','¿Quitar pared?','¿Reemplazar habitación?','Superficies acabadas','Cargando…','Elegir suelo','Guardado local','Guardado automático no disponible.'],
'zh-CN':['设计房间','地面','墙面','添加墙面','移除墙面','保存房间','打开房间','所需物品','关闭','请选择墙面模板，原生对应关系尚未验证。','读取或保存失败。','恢复上次房间','新建','移除此墙面？','替换当前房间？','饰面数量','加载中…','选择地面','已本地保存','无法自动保存，请保存设计文件。'],
'pt-BR':['Projetar cômodo','Piso','Parede','Adicionar parede','Remover parede','Salvar cômodo','Abrir cômodo','Itens necessários','Fechar','Escolha as paredes; associação nativa não verificada.','Falha ao ler ou salvar.','Retomar cômodo','Novo cômodo','Remover parede?','Substituir cômodo?','Superfícies acabadas','Carregando…','Escolher piso','Salvo localmente','Salvamento automático indisponível.']
} as const;