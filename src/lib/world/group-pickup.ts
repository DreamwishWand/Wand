import {stockSourceEligible} from './save-furniture-placement.ts';
import {WORLD_BATCH_LIMIT} from './saved-map-batch.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
export interface GroupPickupRow{localOrdinal:number;itemId:string;expectedX:number;expectedY:number;expectedOrientation:string}
/** A selection is either entirely eligible or entirely refused. Do not
 * silently skip a locked/unknown/stateful object or partially return stock. */
export function groupPickupPlan(items:readonly MainlandSavedObject[]):GroupPickupRow[]|null{
 if(items.length<2||items.length>WORLD_BATCH_LIMIT)return null;
 const seen=new Set<number>(),out:GroupPickupRow[]=[];
 for(const p of items){
  const o=p.object;
  if(!stockSourceEligible(p)||!Number.isSafeInteger(o.localOrdinal)||o.localOrdinal<1||seen.has(o.localOrdinal)||!Number.isSafeInteger(o.x)||!Number.isSafeInteger(o.y)||!o.orientation)return null;
  seen.add(o.localOrdinal);
  out.push({localOrdinal:o.localOrdinal,itemId:o.itemId,expectedX:o.x,expectedY:o.y,expectedOrientation:o.orientation});
 }
 return out.sort((a,b)=>a.localOrdinal-b.localOrdinal);
}
export const groupPickupWords={
 ja:['まとめて回収','選択中の家具をすべてインベントリへ戻します。','確認中…','全件確認済み。まとめて反映できます。','回収できない家具、在庫または参照が含まれています。','取消'],
 en:['Return group to inventory','Return all selected furniture to inventory.','Checking…','All items validated; apply together.','A furniture object, stock entry or reference prevents pickup.','Cancel'],
 fr:['Ranger le groupe','Ranger tous les meubles sélectionnés.','Vérification…','Tous les objets sont vérifiés.','Un objet, stock ou lien empêche le retrait.','Annuler'],
 it:['Riponi gruppo','Riponi tutti i mobili selezionati.','Verifica…','Tutti gli oggetti verificati.','Un oggetto, una scorta o un riferimento impedisce il ritiro.','Annulla'],
 de:['Gruppe ins Inventar','Alle gewählten Möbel ins Inventar zurücklegen.','Prüfung…','Alle Objekte geprüft.','Ein Objekt, Bestand oder Verweis verhindert die Aufnahme.','Abbrechen'],
 'es-ES':['Recoger grupo','Devolver todos los muebles seleccionados al inventario.','Comprobando…','Todos los objetos verificados.','Un objeto, inventario o referencia impide la recogida.','Cancelar'],
 'zh-CN':['批量收回','将所选家具全部收回库存。','验证中…','全部物品已验证，可统一应用。','部分物品、库存或引用不允许收回。','取消'],
 'pt-BR':['Recolher grupo','Recolher todos os móveis selecionados ao inventário.','Verificando…','Todos os objetos verificados.','Um objeto, estoque ou referência impede a retirada.','Cancelar']
} as const;
