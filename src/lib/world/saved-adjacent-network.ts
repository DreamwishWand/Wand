import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import {roadPitch} from './road-design.ts';
import {fencePitch} from './fence-design.ts';
import type {DesignItemGeometry} from './design-layout.ts';
/** Cardinal same-style geometric adjacency, not a reconstructed native
 * road/fence graph. Derived fence pieces and unknown shape/state are excluded. */
export function savedAdjacentNetwork(root:MainlandSavedObject|null,objects:readonly MainlandSavedObject[]):number[]{
 if(!root||!root.shape||root.object.orientationCode!==8||root.object.subgrid)return [];
 const id=Number(root.object.itemId),layer=root.object.layer;
 if(layer!=='ground'&&layer!=='fence')return [];
 const def:DesignItemGeometry={itemId:id,name:root.object.name,layer,surfaceCapable:root.object.surfaceCapable,editRestrictions:root.object.editRestrictions,shapes:{[id+':8']:root.shape}};
 const pitch=layer==='ground'?roadPitch(def,root.factor):fencePitch(def,root.factor);
 if(!pitch||root.object.x%pitch||root.object.y%pitch)return [];
 const byCell=new Map<string,MainlandSavedObject>(),key=(x:number,y:number)=>x+':'+y;
 for(const p of objects){
  if(p.area!==root.area||p.factor!==root.factor||p.object.localGridOrdinal!==root.object.localGridOrdinal||p.object.itemId!==root.object.itemId)continue;
  if(!p.shape||p.shape.path!==root.shape.path||p.shape.width!==root.shape.width||p.shape.height!==root.shape.height||p.object.orientationCode!==8||p.object.subgrid||p.object.x%pitch||p.object.y%pitch)continue;
  const k=key(p.object.x,p.object.y);if(byCell.has(k))return [];byCell.set(k,p);
 }
 if(byCell.get(key(root.object.x,root.object.y))?.object.localOrdinal!==root.object.localOrdinal)return [];
 const seen=new Set([root.object.localOrdinal]),queue=[root];
 for(let i=0;i<queue.length;i++){const p=queue[i];for(const [dx,dy] of [[pitch,0],[-pitch,0],[0,pitch],[0,-pitch]]){
  const n=byCell.get(key(p.object.x+dx,p.object.y+dy));if(n&&!seen.has(n.object.localOrdinal)){seen.add(n.object.localOrdinal);queue.push(n);}
 }}
 return [...seen];
}
export const adjacentNetworkWords={
 ja:['同種の隣接セルを選択','接続状態は未確認。位置のみ編集できます。'],
 en:['Select adjacent matching cells','Connection state unverified. Position edits only.'],
 fr:['Sélectionner les cellules adjacentes identiques','Connexions non vérifiées. Position uniquement.'],
 it:['Seleziona celle adiacenti dello stesso tipo','Connessioni non verificate. Solo posizione.'],
 de:['Benachbarte gleiche Zellen auswählen','Verbindungen ungeprüft. Nur Position bearbeiten.'],
 'es-ES':['Seleccionar celdas adyacentes iguales','Conexiones sin verificar. Solo posición.'],
 'zh-CN':['选择相邻同类格子','连接状态未验证，仅编辑位置。'],
 'pt-BR':['Selecionar células adjacentes iguais','Conexões não verificadas. Apenas posição.']
} as const;
