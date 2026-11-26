import {currentDesign,serializeDesign,parseDesign,designItemCounts,DESIGN_FILE_LIMIT,type DesignTimeline,type DesignPlacement} from './design-layout.ts';
import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
export type WholeAreaKind='biome'|'floating-island';
const biomeKeys=new Set(['Urban','DarkMountains','Meadow','Savannah','Wetland','Forest','Cliff','Beach']);
/** A biome is one of the original eight mainland source grids. An island
 * with several source grids is not a single-grid whole-island preset.
 * Source identity, not a localized display label, determines eligibility. */
export function wholeAreaKind(grid:PublicTerrainGridRef|null,all:readonly PublicTerrainGridRef[]):WholeAreaKind|null{
 if(!grid||!all.some(g=>g.key===grid.key&&g.layoutId===grid.layoutId&&g.gridDataPath===grid.gridDataPath&&g.gridIdNative===grid.gridIdNative))return null;
 if(biomeKeys.has(grid.key)&&grid.layoutId.startsWith('SceneLayouts/Village04/DefaultVillageLayout01-')&&grid.gridIdNative===0)return 'biome';
 if(!/^SceneLayouts\/FloatingIslands\/FloatingIsland_[A-Za-z]+\/FloatingIsland_[A-Za-z]+Layout\.json$/.test(grid.layoutId)||grid.layoutId.includes('_TEMPLATE'))return null;
 return all.filter(g=>g.layoutId===grid.layoutId).length===1?'floating-island':null;
}
export function serializeWholeArea(t:DesignTimeline,grid:PublicTerrainGridRef,kind:WholeAreaKind):string{
 const text=JSON.stringify({schema:'wand.preset.whole-area-design@1',gameVersion:'1.26.2',kind,design:JSON.parse(serializeDesign(t,grid))});
 if(text.length>DESIGN_FILE_LIMIT)throw Error('AREA_PRESET_LIMIT');
 parseWholeArea(text,grid,kind);return text;
}
export function parseWholeArea(text:string,grid:PublicTerrainGridRef,kind:WholeAreaKind):DesignPlacement[]{
 if(text.length>DESIGN_FILE_LIMIT)throw Error('AREA_PRESET_LIMIT');
 const doc=JSON.parse(text);
 if(!doc||typeof doc!=='object'||Array.isArray(doc)||Object.keys(doc).length!==4||doc.schema!=='wand.preset.whole-area-design@1'||doc.gameVersion!=='1.26.2'||doc.kind!==kind)throw Error('AREA_PRESET_INVALID');
 const d=doc.design;
 if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).length!==3||!Array.isArray(d.placements)||d.placements.some((p:unknown)=>!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==5))throw Error('AREA_PRESET_PAYLOAD');
 return parseDesign(JSON.stringify(d),grid);
}
export function reviewWholeArea(t:DesignTimeline,placements:readonly DesignPlacement[]){
 const before=currentDesign(t),key=(p:DesignPlacement)=>[p.itemId,p.x,p.y,p.orientation].join(':'),counts=new Map<string,number>();
 for(const p of before){const k=key(p);counts.set(k,(counts.get(k)??0)+1);}
 let retained=0;
 for(const p of placements){const k=key(p),n=counts.get(k)??0;if(n){retained++;counts.set(k,n-1);}}
 return {retained,removed:before.length-retained,added:placements.length-retained,total:placements.length,counts:designItemCounts(placements)};
}
export const wholeAreaWords={
 ja:['Biomeを保存','浮島を保存','エリアPresetを開く','エリアPresetの確認','維持','除去','追加','合計','種類','設計のみを置き換えます。セーブ原本は変更しません。','適用','取消','対象エリアまたは配置形状が一致しません。'],
 en:['Save Biome','Save Floating Island','Open area preset','Review area preset','Retained','Removed','Added','Total','Types','Replaces the local design only; the original Save is unchanged.','Apply','Cancel','Area or item geometry does not match.'],
 fr:['Enregistrer le biome','Enregistrer l’île','Ouvrir le preset de zone','Vérifier le preset','Conservés','Retirés','Ajoutés','Total','Types','Remplace uniquement le plan local, sans modifier la sauvegarde.','Appliquer','Annuler','Zone ou géométrie incompatible.'],
 it:['Salva bioma','Salva isola','Apri preset area','Verifica preset area','Mantenuti','Rimossi','Aggiunti','Totale','Tipi','Sostituisce solo il progetto locale, non il salvataggio.','Applica','Annulla','Area o geometria incompatibile.'],
 de:['Biom speichern','Insel speichern','Bereichsvorlage öffnen','Bereichsvorlage prüfen','Behalten','Entfernt','Hinzugefügt','Gesamt','Typen','Ersetzt nur den lokalen Entwurf, nicht den Spielstand.','Anwenden','Abbrechen','Bereich oder Geometrie stimmt nicht überein.'],
 'es-ES':['Guardar bioma','Guardar isla','Abrir preset de zona','Revisar preset','Conservados','Eliminados','Añadidos','Total','Tipos','Solo reemplaza el diseño local, no la partida.','Aplicar','Cancelar','Zona o geometría incompatible.'],
 'zh-CN':['保存生态区','保存浮岛','打开区域预设','确认区域预设','保留','移除','添加','总数','种类','仅替换本地设计，不修改原始存档。','应用','取消','区域或物品形状不匹配。'],
 'pt-BR':['Salvar bioma','Salvar ilha','Abrir preset de área','Revisar preset','Mantidos','Removidos','Adicionados','Total','Tipos','Substitui apenas o projeto local, sem alterar o save.','Aplicar','Cancelar','Área ou geometria incompatível.']
} as const;
