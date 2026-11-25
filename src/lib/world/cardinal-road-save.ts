import {mainlandMapAnchor,mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import {terrainWarnings} from './terrain-binding.ts';
import {fenceFamily} from './fence-family-catalog.ts';
import {fencePitch} from './fence-design.ts';
import {roadStroke,roadPitch,type RoadPoint} from './road-design.ts';
export const CARDINAL_ROAD_ID=40100068;
export const ROAD_COPY_LIMIT=256;
export type CardinalRoadTool='line'|'outline'|'fill'|'erase-line'|'erase-rect'|'connect-line'|'connect-outline'|'diagonal-line';
export function roadSeedEligible(p:MainlandSavedObject|null):boolean{
 if(!p?.shape||p.shape.acceptedFloorTypesFlag===undefined||p.object.orientationCode!==8||p.object.subgrid)return false;
 const id=Number(p.object.itemId);
 return roadPitch({itemId:id,name:p.object.name,layer:p.object.layer,surfaceCapable:p.object.surfaceCapable,editRestrictions:p.object.editRestrictions,shapes:{[id+':8']:p.shape}},p.factor)!==null;
}
export interface CardinalRoadCandidate{
 plan:{destination:{layoutId:string;gridDataPath:string;factor:1|2;sizeX:number;sizeY:number};cells:readonly [number,number][];erase:boolean;itemId:number;seed:[number,number]};
 ghosts:readonly {x:number;y:number;size:number}[];
}
export function cardinalRoadCandidate(seed:MainlandSavedObject,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,objects:readonly MainlandSavedObject[],a:RoadPoint,b:RoadPoint,tool:CardinalRoadTool):CardinalRoadCandidate|null{
 if(!roadSeedEligible(seed)||!seed.shape)return null;
 const g=grids.find(g=>g.key===seed.area),r=g&&rasters.get(g.key);if(!g||!r||g.factor!==seed.factor)return null;
 const pitch=2*g.factor,shape=seed.shape;
 const snap=(p:RoadPoint)=>({x:Math.floor((p.x-2*g.origin.position[0])*g.factor/pitch)*pitch,y:Math.floor((-p.y-2*g.origin.position[2])*g.factor/pitch)*pitch});
 if(tool==='connect-line'||tool==='connect-outline'||tool==='diagonal-line')return null;
 const start=snap(a),end=snap(b),stroke=roadStroke([start,end],tool,pitch);if(!stroke||!stroke.length||stroke.length>ROAD_COPY_LIMIT)return null;
 const erase=tool.startsWith('erase'),cells:[number,number][]=[],ghosts:{x:number;y:number;size:number}[]=[];
 const roadByCell=new Map<string,MainlandSavedObject[]>();
 for(const p of objects){if(p.area!==g.key||p.object.layer!=='ground')continue;const key=p.object.x+':'+p.object.y,list=roadByCell.get(key)??[];list.push(p);roadByCell.set(key,list);}
 for(const p of stroke){
  if(p.x<0||p.y<0||p.x+pitch>g.sizeX*g.factor||p.y+pitch>g.sizeY*g.factor||terrainWarnings({raster:r,factor:g.factor,verifiedGridOrdinals:[]},shape,p.x,p.y).length)return null;
  for(const run of shape.runs)for(let dx=0;dx<run.width;dx++){const q=mainlandMapAnchor(g,p.x+run.x+dx+.5,p.y+run.y+.5),hits=mainlandTerrainHits(grids,rasters,q.x,q.y);if(hits.length!==1||hits[0].key!==g.key)return null;}
  const existing=roadByCell.get(p.x+':'+p.y)??[];
  if(existing.length>1||existing.some(o=>!roadSeedEligible(o)||o.object.itemId!==seed.object.itemId||o.object.localGridOrdinal!==seed.object.localGridOrdinal))return null;
  if(erase?!existing.length:existing.length>0)continue;
  cells.push([p.x,p.y]);ghosts.push({...mainlandMapAnchor(g,p.x,p.y),size:pitch/g.factor});
 }
 return cells.length?{plan:{destination:{layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY},cells,erase,itemId:Number(seed.object.itemId),seed:[seed.object.x,seed.object.y]},ghosts}:null;
}
export const FENCE_COPY_LIMIT=128;
export function fenceSeedEligible(p:MainlandSavedObject|null):boolean{
 if(!p?.shape||!fenceFamily(Number(p.object.itemId))||p.object.orientationCode!==8||p.object.subgrid)return false;
 const id=Number(p.object.itemId);
 return fencePitch({itemId:id,name:p.object.name,layer:p.object.layer,surfaceCapable:p.object.surfaceCapable,editRestrictions:p.object.editRestrictions,shapes:{[id+':8']:p.shape}},p.factor)!==null;
}
export interface CardinalFenceCandidate{
 plan:{destination:CardinalRoadCandidate['plan']['destination'];nodes:readonly [number,number][];base:number;erase?:boolean;seed?:[number,number];replacement?:number;diagonal?:true};
 ghosts:CardinalRoadCandidate['ghosts'];
}
export function cardinalFenceCandidate(seed:MainlandSavedObject,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,objects:readonly MainlandSavedObject[],a:RoadPoint,b:RoadPoint,tool:CardinalRoadTool):CardinalFenceCandidate|null{
 if(!fenceSeedEligible(seed)||!seed.shape||!['line','outline','erase-line','erase-rect','connect-line','connect-outline','diagonal-line'].includes(tool))return null;
 const erase=tool.startsWith('erase'),connect=tool.startsWith('connect'),diagonal=tool==='diagonal-line';
 const g=grids.find(g=>g.key===seed.area),r=g&&rasters.get(g.key);if(!g||!r||g.factor!==seed.factor)return null;
 const pitch=g.factor,shape=seed.shape;
 const snap=(p:RoadPoint)=>({x:Math.floor((p.x-2*g.origin.position[0])*g.factor/pitch)*pitch,y:Math.floor((-p.y-2*g.origin.position[2])*g.factor/pitch)*pitch});
 const first=snap(a),last=snap(b);
 let stroke:RoadPoint[]|null;
 if(diagonal){
  const dx=last.x-first.x,dy=last.y-first.y,steps=Math.abs(dx)/pitch;
  if(!steps||Math.abs(dx)!==Math.abs(dy)||steps>=FENCE_COPY_LIMIT)return null;
  stroke=Array.from({length:steps+1},(_,i)=>({x:first.x+Math.sign(dx)*i*pitch,y:first.y+Math.sign(dy)*i*pitch}));if(dx<0)stroke.reverse();
 }else stroke=roadStroke([first,last],tool==='connect-line'?'line':tool==='connect-outline'?'outline':tool,pitch);
 if(!stroke||!stroke.length||stroke.length>FENCE_COPY_LIMIT)return null;
 const fences=objects.filter(p=>p.area===g.key&&p.object.layer==='fence');
 if(fences.some(p=>!p.shape||p.object.localGridOrdinal!==seed.object.localGridOrdinal))return null;
 const nodes:[number,number][]=[],ghosts:{x:number;y:number;size:number}[]=[];
 // Each generated diagonal Ext has a square bounding box of at most
 // four logical cells. Conservatively validate the whole span envelope,
 // including off-diagonal cells, rather than assuming a sparse footprint.
 if(diagonal){
  for(let at=0;at<stroke.length-1;at+=5){
   const end=Math.min(at+5,stroke.length-1),a=stroke[at],b=stroke[end];
   for(let y=Math.min(a.y,b.y);y<=Math.max(a.y,b.y);y+=pitch)for(let x=Math.min(a.x,b.x);x<=Math.max(a.x,b.x);x+=pitch){
    if(x<0||y<0||x+pitch>g.sizeX*g.factor||y+pitch>g.sizeY*g.factor||terrainWarnings({raster:r,factor:g.factor,verifiedGridOrdinals:[]},shape,x,y).length)return null;
    for(const run of shape.runs)for(let dx=0;dx<run.width;dx++){const q=mainlandMapAnchor(g,x+run.x+dx+.5,y+run.y+.5),hits=mainlandTerrainHits(grids,rasters,q.x,q.y);if(hits.length!==1||hits[0].key!==g.key)return null;}
   }
  }
 }
 for(const p of stroke){
  if(p.x<0||p.y<0||p.x+pitch>g.sizeX*g.factor||p.y+pitch>g.sizeY*g.factor||!erase&&terrainWarnings({raster:r,factor:g.factor,verifiedGridOrdinals:[]},shape,p.x,p.y).length)return null;
  for(const run of shape.runs)for(let dx=0;dx<run.width;dx++){const q=mainlandMapAnchor(g,p.x+run.x+dx+.5,p.y+run.y+.5),hits=mainlandTerrainHits(grids,rasters,q.x,q.y);if(hits.length!==1||hits[0].key!==g.key)return null;}
  // Must remain separate from every current native fence footprint and
  // the Rust writer's conservative eight-logical-cell isolation radius.
  if(!erase&&!connect&&fences.some(f=>{const dx=p.x-f.object.x,dy=p.y-f.object.y;return Math.abs(dx)<=8*pitch&&Math.abs(dy)<=8*pitch||dx>=-pitch&&dx<=f.shape!.width&&dy>=-pitch&&dy<=f.shape!.height;}))return null;
  nodes.push([p.x,p.y]);ghosts.push({...mainlandMapAnchor(g,p.x,p.y),size:1});
 }
 return {plan:{destination:{layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY},nodes,base:Number(seed.object.itemId),...(erase||connect?{erase,seed:[seed.object.x,seed.object.y] as [number,number]}:{}),...(diagonal?{diagonal:true as const}:{})},ghosts};
}
export function fenceReplacementCandidate(seed:MainlandSavedObject,grids:readonly MainlandGrid[],replacement:number):CardinalFenceCandidate|null{
 if(!fenceSeedEligible(seed)||replacement===Number(seed.object.itemId)||!fenceFamily(replacement))return null;
 const g=grids.find(g=>g.key===seed.area);if(!g||g.factor!==seed.factor)return null;
 const point:[number,number]=[seed.object.x,seed.object.y];
 return {plan:{destination:{layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY},nodes:[point],base:Number(seed.object.itemId),erase:false,seed:point,replacement},ghosts:[]};
}
export const diagonalFenceWords={ja:'斜め直線（45°）',en:'Diagonal line (45°)',fr:'Ligne diagonale (45°)',it:'Linea diagonale (45°)',de:'Diagonale (45°)','es-ES':'Línea diagonal (45°)','zh-CN':'对角直线（45°）','pt-BR':'Linha diagonal (45°)'} as const;
export const fenceMutationWords={
 ja:['直線接続','枠で接続','選択した接続全体のスタイルを変更','置換先','原本形状の一致を確認できた場合のみ置換できます。'],
 en:['Connect line','Connect outline','Replace selected network style','Replacement','Replacement requires matching source geometry.'],
 fr:['Relier par ligne','Relier par contour','Remplacer le style du réseau sélectionné','Remplacement','Géométrie source identique requise.'],
 it:['Collega linea','Collega contorno','Sostituisci stile della rete selezionata','Sostituzione','Richiesta geometria originale identica.'],
 de:['Linie verbinden','Umriss verbinden','Stil des gewählten Netzes ersetzen','Ersatz','Gleiche Quellgeometrie erforderlich.'],
 'es-ES':['Conectar línea','Conectar contorno','Sustituir estilo de la red seleccionada','Sustitución','Se requiere geometría original idéntica.'],
 'zh-CN':['连接直线','连接边框','替换所选网络的样式','替换为','需要匹配原始形状。'],
 'pt-BR':['Conectar linha','Conectar contorno','Trocar estilo da rede selecionada','Substituição','Geometria original compatível necessária.']
} as const;
export const isolatedFenceWords={
 ja:['既存の直交フェンスを編集','直線・枠を独立配置、または選択した接続内を撤去します。','フェンスの原本形状を確認中'],
 en:['Edit cardinal fence','Place an isolated line/outline or erase within the selected network.','Checking original fence geometry'],
 fr:['Modifier la clôture','Placez une ligne ou un contour isolé, ou effacez dans le réseau choisi.','Vérification des formes originales'],
 it:['Modifica recinzione','Posiziona una linea o contorno isolato, oppure cancella nella rete selezionata.','Verifica delle forme originali'],
 de:['Zaun bearbeiten','Separaten Zaun zeichnen oder im gewählten Netz löschen.','Originalformen werden geprüft'],
 'es-ES':['Editar valla','Dibuja una valla aislada o borra dentro de la red elegida.','Comprobando geometría original'],
 'zh-CN':['编辑直角围栏','放置独立直线或边框，或删除所选网络中的格子。','正在验证原始围栏形状'],
 'pt-BR':['Editar cerca','Desenhe cerca isolada ou apague na rede selecionada.','Verificando formas originais']
} as const;
export const cardinalRoadWords={
 ja:['直交道路を編集','直線','枠','塗りつぶし','直線撤去','範囲撤去','始点と終点をクリック','対象セル','変更を検証してコピーを作成','対象範囲またはセーブ構造を確認できません。','閉じる','在庫・コレクションは変更しません。'],
 en:['Edit cardinal road','Line','Outline','Fill','Erase line','Erase rectangle','Click start and end','Cells','Validate and create copy','Unsupported area or Save structure.','Close','Inventory and Collection remain unchanged.'],
 fr:['Modifier la route','Ligne','Contour','Remplir','Effacer ligne','Effacer zone','Cliquez le début et la fin','Cases','Vérifier et créer','Zone ou sauvegarde non prise en charge.','Fermer','Inventaire et Collection inchangés.'],
 it:['Modifica strada','Linea','Contorno','Riempi','Cancella linea','Cancella area','Seleziona inizio e fine','Celle','Verifica e crea copia','Area o salvataggio non supportato.','Chiudi','Inventario e Collezione invariati.'],
 de:['Weg bearbeiten','Linie','Umriss','Füllen','Linie löschen','Fläche löschen','Start und Ende anklicken','Felder','Prüfen und Kopie erstellen','Bereich oder Spielstand nicht unterstützt.','Schließen','Inventar und Sammlung unverändert.'],
 'es-ES':['Editar camino','Línea','Contorno','Rellenar','Borrar línea','Borrar área','Pulsa inicio y fin','Celdas','Verificar y crear copia','Zona o partida no compatible.','Cerrar','Inventario y colección intactos.'],
 'zh-CN':['编辑直角道路','直线','轮廓','填充','删除直线','删除区域','点击起点和终点','格子','验证并创建副本','区域或存档结构不支持。','关闭','不改变库存和收藏。'],
 'pt-BR':['Editar caminho','Linha','Contorno','Preencher','Apagar linha','Apagar área','Clique no início e fim','Células','Verificar e criar cópia','Área ou Save incompatível.','Fechar','Inventário e Coleção intactos.']
} as const;
