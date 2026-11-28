import {nativeActionBlocked} from './native-edit-restrictions.ts';
import {isCardinal} from './saved-map-transform.ts';
import {stockSourceEligible,landscapeSourceEligible,buildingSourceEligible} from './save-furniture-placement.ts';
import {WORLD_BATCH_LIMIT} from './saved-map-batch.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
export interface GroupPickupRow{localOrdinal:number;itemId:string;expectedX:number;expectedY:number;expectedOrientation:string;includeSupport?:true;includeStorage?:true}
export function emptyStoragePickupEligible(p:MainlandSavedObject,free=false):boolean{
 const o=p.object;
 return !!p.shape&&(o.layer==='furniture'||free&&o.layer==='surface')&&Math.floor(Number(o.itemId)/100000)===400&&o.storage===true&&o.storageEmpty===true&&!o.subgrid&&isCardinal(o.orientation)&&(free||!nativeActionBlocked(o.editRestrictions,'select')&&!nativeActionBlocked(o.editRestrictions,'remove'));
}
/** A selection is either entirely eligible or entirely refused. Do not
 * silently skip a locked/unknown/stateful object or partially return stock. */
export function groupPickupPlan(items:readonly MainlandSavedObject[],free=false):GroupPickupRow[]|null{
 if(!items.length||items.length>WORLD_BATCH_LIMIT||items.length===1&&!items[0].object.subgrid)return null;
 const seen=new Set<number>(),out:GroupPickupRow[]=[];
 for(const p of items){
  const o=p.object;
  const support=!!p.shape&&(o.layer==='furniture'||free&&o.layer==='surface')&&Math.floor(Number(o.itemId)/100000)===400&&o.subgrid?.status==='resolved_full'&&o.subgrid.objectCount<32&&isCardinal(o.orientation)&&(free||!nativeActionBlocked(o.editRestrictions,'select')&&!nativeActionBlocked(o.editRestrictions,'remove'));
  const storage=emptyStoragePickupEligible(p,free);
  const other=free&&(landscapeSourceEligible(p,free)||buildingSourceEligible(p));
  if(((o.storage===true||o.storageKnown===true)&&!storage)||(!support&&!storage&&!other&&!(stockSourceEligible(p,free)&&isCardinal(o.orientation)))||!Number.isSafeInteger(o.localOrdinal)||o.localOrdinal<1||seen.has(o.localOrdinal)||!Number.isSafeInteger(o.x)||!Number.isSafeInteger(o.y)||!o.orientation)return null;
  seen.add(o.localOrdinal);
  out.push({localOrdinal:o.localOrdinal,itemId:o.itemId,expectedX:o.x,expectedY:o.y,expectedOrientation:o.orientation,...(support?{includeSupport:true as const}:{}),...(storage?{includeStorage:true as const}:{})});
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

export const supportPickupWords={
 ja:['支持家具と小物を回収','支持家具とその上のすべての小物をインベントリへ戻します。'],
 en:['Return furniture and contents','Return the support furniture and all its contents to inventory.'],
 fr:['Ranger meuble et objets','Ranger le meuble et tous ses objets.'],
 it:['Riponi mobile e oggetti','Riponi il mobile e tutti gli oggetti.'],
 de:['Möbel und Inhalt zurücklegen','Möbel und alle darauf platzierten Objekte ins Inventar legen.'],
 'es-ES':['Recoger mueble y objetos','Devolver el mueble y todos sus objetos al inventario.'],
 'zh-CN':['收回支撑家具和物品','将支撑家具及其所有物品收回库存。'],
 'pt-BR':['Recolher móvel e objetos','Recolher o móvel e todos os seus objetos ao inventário.']
} as const;

/** Non-stock removals must not be presented as returning items to inventory. */
export const mixedPickupWords={
 ja:['選択物を一括撤去','家具は在庫へ戻し、景観・建物は既存の撤去契約に従って取り除きます。'],
 en:['Remove selected objects','Return furniture to stock; remove landscape and buildings using their native removal rules.'],
 fr:['Retirer les objets sélectionnés','Ranger les meubles et retirer les paysages et bâtiments selon leurs règles natives.'],
 it:['Rimuovi oggetti selezionati','Riponi i mobili e rimuovi paesaggi ed edifici secondo le regole native.'],
 de:['Auswahl entfernen','Möbel ins Inventar legen, Landschaft und Gebäude nach ihren nativen Regeln entfernen.'],
 'es-ES':['Retirar objetos seleccionados','Devolver muebles al inventario y retirar paisajes y edificios según sus reglas nativas.'],
 'zh-CN':['批量移除所选物件','家具返回库存，景观和建筑按原生移除规则处理。'],
 'pt-BR':['Remover objetos selecionados','Devolver móveis ao inventário e remover paisagens e edifícios pelas regras nativas.']
} as const;
