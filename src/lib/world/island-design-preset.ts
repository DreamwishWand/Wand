import {bindFloatingIslandGrid} from './mainland-world-coordinates.ts';
import {currentDesign,emptyDesign,serializeDesign,parseDesign,DESIGN_FILE_LIMIT,DESIGN_LIMIT,restoreDesign,type DesignTimeline,type DesignPlacement,type DesignItemGeometry} from './design-layout.ts';
import {reviewWholeArea} from './whole-area-preset.ts';
import type {PublicTerrainGridRef} from './public-terrain-projection.ts';
export function islandPresetGrids(grid:PublicTerrainGridRef|null,all:readonly PublicTerrainGridRef[]):PublicTerrainGridRef[]{
 if(!grid||!bindFloatingIslandGrid(grid))return [];
 const group=all.filter(g=>g.layoutId===grid.layoutId);
 if(!group.length||group.length>16||group.some(g=>!bindFloatingIslandGrid(g))||new Set(group.map(g=>g.key)).size!==group.length||
 !group.some(g=>g.key===grid.key&&g.gridDataPath===grid.gridDataPath&&g.gridIdNative===grid.gridIdNative))return [];
 return [...group].sort((a,b)=>a.gridIdNative-b.gridIdNative);
}
export function serializeIslandDesign(grids:readonly PublicTerrainGridRef[],layouts:Readonly<Record<string,DesignTimeline>>){
 if(!grids.length||grids.some(g=>!bindFloatingIslandGrid(g)||g.layoutId!==grids[0].layoutId)||new Set(grids.map(g=>g.key)).size!==grids.length)throw Error('ISLAND_PRESET_SCOPE');
 const text=JSON.stringify({schema:'wand.preset.floating-island-design@1',gameVersion:'1.26.2',layoutId:grids[0].layoutId,areas:grids.map(g=>JSON.parse(serializeDesign(layouts[g.key]??emptyDesign(),g)))});
 parseIslandDesign(text,grids);return text;
}
export function parseIslandDesign(text:string,grids:readonly PublicTerrainGridRef[]):Map<string,DesignPlacement[]>{
 if(text.length>DESIGN_FILE_LIMIT)throw Error('ISLAND_PRESET_LIMIT');
 const d=JSON.parse(text);
 if(!grids.length||grids.some(g=>!bindFloatingIslandGrid(g)||g.layoutId!==grids[0].layoutId)||!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).length!==4||d.schema!=='wand.preset.floating-island-design@1'||d.gameVersion!=='1.26.2'||d.layoutId!==grids[0].layoutId||!Array.isArray(d.areas)||d.areas.length!==grids.length)throw Error('ISLAND_PRESET_SCOPE');
 const out=new Map<string,DesignPlacement[]>();let total=0;
 for(const g of grids){
  const matches=d.areas.filter((x:unknown)=>!!x&&typeof x==='object'&&!Array.isArray(x)&&(x as {grid?:{key?:string}}).grid?.key===g.key);
  const a=matches[0];
  if(matches.length!==1||Object.keys(a).length!==3||!a.grid||Object.keys(a.grid).length!==7||!Array.isArray(a.placements)||a.placements.some((p:unknown)=>!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==5))throw Error('ISLAND_PRESET_GRID');
  const rows=parseDesign(JSON.stringify(a),g);total+=rows.length;if(total>DESIGN_LIMIT)throw Error('ISLAND_PRESET_LIMIT');out.set(g.key,rows);
 }
 return out;
}
export function reviewIslandDesign(grids:readonly PublicTerrainGridRef[],layouts:Readonly<Record<string,DesignTimeline>>,incoming:ReadonlyMap<string,readonly DesignPlacement[]>,definitions:ReadonlyMap<string,ReadonlyMap<number,DesignItemGeometry>>){
 const next:Record<string,DesignTimeline>={},summaries:{key:string;retained:number;removed:number;added:number;total:number}[]=[];
 for(const g of grids){
  const rows=incoming.get(g.key),defs=definitions.get(g.key);if(!rows||!defs)return null;
  const before=layouts[g.key]??emptyDesign(),summary=reviewWholeArea(before,rows);
  const updated=summary.removed||summary.added?restoreDesign(before,rows,defs,g.sizeX*g.factor,g.sizeY*g.factor):before;
  if(!updated)return null;
  next[g.key]=updated;summaries.push({key:g.key,retained:summary.retained,removed:summary.removed,added:summary.added,total:summary.total});
 }
 return {next,summaries};
}
export const islandPresetWords={
 ja:['浮島全体を保存','浮島Presetを開く','浮島全体Preset','すべてのGridの装飾設計を保存・置換します。セーブは変更しません。','確認中…','浮島Presetを処理できません。下書き・対象Grid・配置形状を確認してください。','浮島全体に適用','取消'],
 en:['Save whole island','Open island preset','Whole island preset','Save or replace the local designs of all grids. The Save remains unchanged.','Checking…','Unable to process island preset. Check drafts, grids and geometry.','Apply to whole island','Cancel'],
 fr:['Enregistrer toute l’île','Ouvrir le preset de l’île','Preset de l’île entière','Enregistre ou remplace les plans de toutes les grilles. La sauvegarde reste inchangée.','Vérification…','Vérifiez les brouillons, grilles et géométries.','Appliquer à toute l’île','Annuler'],
 it:['Salva tutta l’isola','Apri preset isola','Preset isola intera','Salva o sostituisce i progetti di tutte le griglie. Il salvataggio resta invariato.','Verifica…','Controlla bozze, griglie e geometrie.','Applica a tutta l’isola','Annulla'],
 de:['Ganze Insel speichern','Inselvorlage öffnen','Vorlage der ganzen Insel','Speichert oder ersetzt Entwürfe aller Raster. Spielstand bleibt unverändert.','Prüfung…','Entwürfe, Raster und Geometrien prüfen.','Auf ganze Insel anwenden','Abbrechen'],
 'es-ES':['Guardar toda la isla','Abrir preset de isla','Preset de isla completa','Guarda o sustituye diseños de todas las cuadrículas. No cambia la partida.','Comprobando…','Comprueba borradores, cuadrículas y geometría.','Aplicar a toda la isla','Cancelar'],
 'zh-CN':['保存整个浮岛','打开浮岛预设','完整浮岛预设','保存或替换所有网格的本地设计，不修改存档。','检查中…','请检查草稿、网格和物品形状。','应用到整个浮岛','取消'],
 'pt-BR':['Salvar ilha inteira','Abrir preset da ilha','Preset da ilha inteira','Salva ou substitui os projetos de todas as grades. Não altera o save.','Verificando…','Confira rascunhos, grades e geometria.','Aplicar à ilha inteira','Cancelar']
} as const;
