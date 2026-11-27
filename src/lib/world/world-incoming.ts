import {writable} from 'svelte/store';
import {sceneFromClip} from './scene-preset.ts';
import type {PresetKind,PresetSchema,SessionPreset} from '../presets/preset-session-format.ts';
export interface WorldCatalogCandidate {itemId:number;name:string}
export type WorldIncoming={type:'catalog';items:readonly WorldCatalogCandidate[]}|{type:'preset';id:number;name:string;schema:PresetSchema;kind:PresetKind};
export const worldIncoming=writable<WorldIncoming|null>(null);
export function catalogPlacementCandidate(item:{itemId:number;nativeCategory:string;subtype:number}){
 return item.nativeCategory==='Furniture'&&![1,3,7].includes(item.subtype)&&Number.isSafeInteger(item.itemId)&&item.itemId>0&&item.itemId<=0xffffffff;
}
export function catalogHandoff(items:readonly WorldCatalogCandidate[]):WorldIncoming|null{
 const valid=new Map<number,WorldCatalogCandidate>();
 for(const item of items){
  if(valid.has(item.itemId))continue;
  try{sceneFromClip([{itemId:item.itemId,dx:0,dy:0,orientation:2}],2,'corner');}catch{continue;}
  valid.set(item.itemId,{itemId:item.itemId,name:item.name.slice(0,160)});
 }
 return valid.size?{type:'catalog',items:[...valid.values()]}:null;
}
export function catalogPlacementFile(item:WorldCatalogCandidate){
 const scene=sceneFromClip([{itemId:item.itemId,dx:0,dy:0,orientation:2}],2,'corner');
 return new File([JSON.stringify(scene)],'wand-placement-'+item.itemId+'.json',{type:'application/json'});
}
export function presetHandoff(entry:SessionPreset):WorldIncoming|null{
 return entry.domain==='wand'&&!entry.privateBackup?{type:'preset',id:entry.id,name:entry.name,schema:entry.schema,kind:entry.kind}:null;
}
export function incomingMatches(entry:WorldIncoming|null,schemas:readonly PresetSchema[],kinds?:readonly PresetKind[]){
 if(!entry)return false;
 const schema=entry.type==='catalog'?'wand.preset.scene@1':entry.schema,kind=entry.type==='catalog'?'scene':entry.kind;
 return (!schemas.length||schemas.includes(schema))&&(!kinds||kinds.includes(kind));
}
export const worldIncomingWords={
 ja:['ワールドエディターで配置・復元','配置候補を送る','受け取ったアイテム・プリセット','対象のエリア・部屋を選び、対応する配置・復元ボタンを開いてください。','受け取りを解除','配置候補'],
 en:['Place / restore in World Editor','Send placement candidates','Incoming items / preset','Choose the target area or room and open its placement or restore action.','Clear incoming selection','Placement candidates'],
 fr:['Placer / restaurer dans l’éditeur','Envoyer les objets','Objets / preset reçus','Choisissez la zone ou la pièce puis ouvrez l’action correspondante.','Effacer la sélection','Objets à placer'],
 it:['Posiziona / ripristina nell’editor','Invia oggetti','Oggetti / preset ricevuti','Scegli area o stanza e apri l’azione corrispondente.','Cancella selezione','Oggetti da posizionare'],
 de:['Im Welteditor platzieren / wiederherstellen','Objekte senden','Empfangene Objekte / Vorlage','Bereich oder Raum auswählen und passende Aktion öffnen.','Auswahl löschen','Platzierungsobjekte'],
 'es-ES':['Colocar / restaurar en el editor','Enviar objetos','Objetos / preset recibidos','Elige zona o habitación y abre la acción correspondiente.','Borrar selección','Objetos para colocar'],
 'zh-CN':['在世界编辑器放置或恢复','发送放置候选','收到的物品或预设','选择目标区域或房间，然后打开对应的放置或恢复操作。','清除选择','放置候选'],
 'pt-BR':['Posicionar / restaurar no editor','Enviar objetos','Itens / preset recebidos','Escolha a área ou cômodo e abra a ação correspondente.','Limpar seleção','Itens para posicionar']
} as const;
