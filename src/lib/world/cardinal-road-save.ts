import {mainlandMapAnchor,mainlandTerrainHits,type MainlandGrid} from './mainland-world-coordinates.ts';
import type {MainlandSavedObject} from './mainland-saved-objects.ts';
import type {TerrainRaster} from './terrain-binding.ts';
import type {SourceObjectShape} from './source-object-map.ts';
import {terrainWarnings} from './terrain-binding.ts';
import {fenceFamily} from './fence-family-catalog.ts';
import {fencePitch} from './fence-design.ts';
import {roadStroke,roadPitch,type RoadPoint} from './road-design.ts';
export const CARDINAL_ROAD_ID=40100068;
export const ROAD_COPY_LIMIT=256;
export type CardinalRoadTool='line'|'outline'|'fill'|'erase-line'|'erase-rect'|'connect-line'|'connect-outline'|'diagonal-line'|'diagonal-connect'|'diagonal-erase'|'diagonal-erase-rect'|'diagonal-fill'|'replace-road'|'brush'|'erase-brush'|'connect-brush';
export interface NetworkStyle{readonly styleOnly:true;readonly area:string;readonly factor:1|2;readonly itemId:number;readonly name:string;readonly kind:'road'|'fence';readonly shape:SourceObjectShape}
export type NetworkSource=MainlandSavedObject|NetworkStyle;
export const isNetworkStyle=(p:NetworkSource|null):p is NetworkStyle=>!!p&&'styleOnly' in p;
export const networkItemId=(p:NetworkSource|null)=>p?(isNetworkStyle(p)?p.itemId:Number(p.object.itemId)):0;
export function roadSeedEligible(p:NetworkSource|null):boolean{
 if(isNetworkStyle(p))return p.kind==='road';
 if(!p?.shape||p.shape.acceptedFloorTypesFlag===undefined||p.object.orientationCode!==8||p.object.subgrid)return false;
 const id=Number(p.object.itemId);
 return roadPitch({itemId:id,name:p.object.name,layer:p.object.layer,surfaceCapable:p.object.surfaceCapable,editRestrictions:p.object.editRestrictions,shapes:{[id+':8']:p.shape}},p.factor)!==null;
}
export interface CardinalRoadCandidate{
 plan:{destination:{layoutId:string;gridDataPath:string;factor:1|2;sizeX:number;sizeY:number};cells:readonly [number,number][];erase:boolean;itemId:number;seed?:[number,number];diagonal?:true;replacement?:number};
 ghosts:readonly {x:number;y:number;size:number}[];
}
export function cardinalRoadCandidate(seed:NetworkSource,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,objects:readonly MainlandSavedObject[],a:RoadPoint,b:RoadPoint,tool:CardinalRoadTool,replacement?:number,trail?:readonly RoadPoint[]):CardinalRoadCandidate|null{
 if(!roadSeedEligible(seed)||!seed.shape)return null;
 const g=grids.find(g=>g.key===seed.area),r=g&&rasters.get(g.key);if(!g||!r||g.factor!==seed.factor)return null;
 const pitch=2*g.factor,shape=seed.shape,style=isNetworkStyle(seed),itemId=networkItemId(seed);
 if(style&&!['brush','line','outline','fill','diagonal-line','diagonal-fill'].includes(tool))return null;
 const snap=(p:RoadPoint)=>({x:Math.floor((p.x-2*g.origin.position[0])*g.factor/pitch)*pitch,y:Math.floor((-p.y-2*g.origin.position[2])*g.factor/pitch)*pitch});
 if(['connect-line','connect-outline','diagonal-connect','connect-brush'].includes(tool))return null;
 const diagonal=tool.startsWith('diagonal-'),replace=tool==='replace-road';
 if(replace&&(!Number.isSafeInteger(replacement)||Math.floor(replacement!/100000)!==401||replacement===itemId))return null;
 const start=snap(a),end=snap(b);
 let stroke:RoadPoint[]|null;
 if(tool==='diagonal-line'||tool==='diagonal-erase'){
  const dx=end.x-start.x,dy=end.y-start.y,n=Math.abs(dx)/pitch;
  if(Math.abs(dx)!==Math.abs(dy)||n>=ROAD_COPY_LIMIT)return null;
  stroke=Array.from({length:n+1},(_,i)=>({x:start.x+Math.sign(dx)*i*pitch,y:start.y+Math.sign(dy)*i*pitch}));
 }else if(savedNetworkFreehand(tool)){if(!trail?.length)return null;stroke=roadStroke(trail.map(snap),tool==='erase-brush'?'erase':'brush',pitch);}
 else stroke=roadStroke([start,end],tool==='diagonal-fill'||replace?'fill':tool==='diagonal-erase-rect'?'erase-rect':tool as 'line'|'outline'|'fill'|'erase-line'|'erase-rect',pitch);
 if(!stroke||!stroke.length||stroke.length>ROAD_COPY_LIMIT)return null;
 const erase=tool.startsWith('erase')||tool==='diagonal-erase'||tool==='diagonal-erase-rect',cells:[number,number][]=[],ghosts:{x:number;y:number;size:number}[]=[];
 const roadByCell=new Map<string,MainlandSavedObject[]>();
 for(const p of objects){if(p.area!==g.key||p.object.layer!=='ground')continue;const key=p.object.x+':'+p.object.y,list=roadByCell.get(key)??[];list.push(p);roadByCell.set(key,list);}
 for(const p of stroke){
  if(p.x<0||p.y<0||p.x+pitch>g.sizeX*g.factor||p.y+pitch>g.sizeY*g.factor||terrainWarnings({raster:r,factor:g.factor,verifiedGridOrdinals:[]},shape,p.x,p.y).length)return null;
  for(const run of shape.runs)for(let dx=0;dx<run.width;dx++){const q=mainlandMapAnchor(g,p.x+run.x+dx+.5,p.y+run.y+.5),hits=mainlandTerrainHits(grids,rasters,q.x,q.y);if(hits.length!==1||hits[0].key!==g.key)return null;}
  const existing=roadByCell.get(p.x+':'+p.y)??[];
  if(existing.length>1||existing.some(o=>!roadSeedEligible(o)||!style&&o.object.localGridOrdinal!==seed.object.localGridOrdinal))return null;
  if(style&&existing.length)return null;
  if(replace&&existing.length&&Number(existing[0].object.itemId)!==itemId)continue;
  if(!replace&&existing.some(o=>Number(o.object.itemId)!==itemId))return null;
  if(erase||replace?!existing.length:existing.length>0)continue;
  cells.push([p.x,p.y]);ghosts.push({...mainlandMapAnchor(g,p.x,p.y),size:pitch/g.factor});
 }
 return cells.length?{plan:{destination:{layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY},cells,erase,itemId,...(style?{}:{seed:[seed.object.x,seed.object.y] as [number,number]}),...(diagonal?{diagonal:true as const}:{}),...(replace?{replacement}:{})},ghosts}:null;
}
export const FENCE_COPY_LIMIT=128;
export function fenceSeedEligible(p:NetworkSource|null):boolean{
 if(isNetworkStyle(p))return p.kind==='fence';
 if(!p?.shape||!fenceFamily(Number(p.object.itemId))||p.object.orientationCode!==8||p.object.subgrid)return false;
 const id=Number(p.object.itemId);
 return fencePitch({itemId:id,name:p.object.name,layer:p.object.layer,surfaceCapable:p.object.surfaceCapable,editRestrictions:p.object.editRestrictions,shapes:{[id+':8']:p.shape}},p.factor)!==null;
}
export interface CardinalFenceCandidate{
 plan:{destination:CardinalRoadCandidate['plan']['destination'];nodes:readonly [number,number][];base:number;erase?:boolean;seed?:[number,number];replacement?:number;diagonal?:true};
 ghosts:CardinalRoadCandidate['ghosts'];
}
export function cardinalFenceCandidate(seed:NetworkSource,grids:readonly MainlandGrid[],rasters:ReadonlyMap<string,TerrainRaster>,objects:readonly MainlandSavedObject[],a:RoadPoint,b:RoadPoint,tool:CardinalRoadTool,trail?:readonly RoadPoint[]):CardinalFenceCandidate|null{
 if(!fenceSeedEligible(seed)||!seed.shape||!['line','outline','erase-line','erase-rect','connect-line','connect-outline','diagonal-line','diagonal-connect','diagonal-erase','diagonal-erase-rect','brush','erase-brush','connect-brush'].includes(tool))return null;
 const diagonal=tool.startsWith('diagonal-'),erase=tool.startsWith('erase')||tool==='diagonal-erase'||tool==='diagonal-erase-rect',connect=tool.startsWith('connect')||tool==='diagonal-connect';
 const g=grids.find(g=>g.key===seed.area),r=g&&rasters.get(g.key);if(!g||!r||g.factor!==seed.factor)return null;
 const pitch=g.factor,shape=seed.shape,style=isNetworkStyle(seed);
 if(style&&(erase||connect))return null;
 const snap=(p:RoadPoint)=>({x:Math.floor((p.x-2*g.origin.position[0])*g.factor/pitch)*pitch,y:Math.floor((-p.y-2*g.origin.position[2])*g.factor/pitch)*pitch});
 const first=snap(a),last=snap(b);
 let stroke:RoadPoint[]|null;
 if(diagonal&&tool!=='diagonal-erase-rect'){
  const dx=last.x-first.x,dy=last.y-first.y,steps=Math.abs(dx)/pitch;
  if((!steps&&!erase)||Math.abs(dx)!==Math.abs(dy)||steps>=FENCE_COPY_LIMIT)return null;
  stroke=Array.from({length:steps+1},(_,i)=>({x:first.x+Math.sign(dx)*i*pitch,y:first.y+Math.sign(dy)*i*pitch}));if(dx<0)stroke.reverse();
 }else if(savedNetworkFreehand(tool)){if(!trail?.length)return null;stroke=roadStroke(trail.map(snap),tool==='erase-brush'?'erase':'brush',pitch);}
 else stroke=roadStroke([first,last],tool==='connect-line'?'line':tool==='connect-outline'?'outline':tool==='diagonal-erase-rect'?'erase-rect':tool as 'line'|'outline'|'erase-line'|'erase-rect',pitch);
 if(!stroke||!stroke.length||stroke.length>FENCE_COPY_LIMIT)return null;
 const fences=objects.filter(p=>p.area===g.key&&p.object.layer==='fence');
 if(fences.some(p=>!p.shape||!style&&p.object.localGridOrdinal!==seed.object.localGridOrdinal))return null;
 const nodes:[number,number][]=[],ghosts:{x:number;y:number;size:number}[]=[];
 // Each generated diagonal Ext has a square bounding box of at most
 // four logical cells. Conservatively validate the whole span envelope,
 // including off-diagonal cells, rather than assuming a sparse footprint.
 if(diagonal&&!erase&&!connect){
  for(let at=0;at<stroke.length-1;at+=5){
   const end=Math.min(at+5,stroke.length-1),a=stroke[at],b=stroke[end];
   for(let y=Math.min(a.y,b.y);y<=Math.max(a.y,b.y);y+=pitch)for(let x=Math.min(a.x,b.x);x<=Math.max(a.x,b.x);x+=pitch){
    if(x<0||y<0||x+pitch>g.sizeX*g.factor||y+pitch>g.sizeY*g.factor||terrainWarnings({raster:r,factor:g.factor,verifiedGridOrdinals:[]},shape,x,y).length)return null;
    for(const run of shape.runs)for(let dx=0;dx<run.width;dx++){const q=mainlandMapAnchor(g,x+run.x+dx+.5,y+run.y+.5),hits=mainlandTerrainHits(grids,rasters,q.x,q.y);if(hits.length!==1||hits[0].key!==g.key)return null;}
   }
  }
 }
 // A connected diagonal edit may create a span reaching four cells
 // beyond the drawn segment. Validate the entire local envelope until
 // exact per-part preview geometry is exposed by Rust.
 if(diagonal&&connect){
  const checked=new Set<string>();
  for(const p of stroke)for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
   const x=p.x+dx*pitch,y=p.y+dy*pitch,key=x+':'+y;if(checked.has(key))continue;checked.add(key);
   if(x<0||y<0||x+pitch>g.sizeX*g.factor||y+pitch>g.sizeY*g.factor||terrainWarnings({raster:r,factor:g.factor,verifiedGridOrdinals:[]},shape,x,y).length)return null;
   for(const run of shape.runs)for(let rx=0;rx<run.width;rx++){const q=mainlandMapAnchor(g,x+run.x+rx+.5,y+run.y+.5),hits=mainlandTerrainHits(grids,rasters,q.x,q.y);if(hits.length!==1||hits[0].key!==g.key)return null;}
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
 return {plan:{destination:{layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY},nodes,base:networkItemId(seed),...(!style&&(erase||connect)?{erase,seed:[seed.object.x,seed.object.y] as [number,number]}:{}),...(diagonal?{diagonal:true as const}:{})},ghosts};
}
export function fenceReplacementCandidate(seed:MainlandSavedObject,grids:readonly MainlandGrid[],replacement:number):CardinalFenceCandidate|null{
 if(!fenceSeedEligible(seed)||replacement===Number(seed.object.itemId)||!fenceFamily(replacement))return null;
 const g=grids.find(g=>g.key===seed.area);if(!g||g.factor!==seed.factor)return null;
 const point:[number,number]=[seed.object.x,seed.object.y];
 return {plan:{destination:{layoutId:g.layoutId,gridDataPath:g.gridDataPath,factor:g.factor,sizeX:g.sizeX,sizeY:g.sizeY},nodes:[point],base:Number(seed.object.itemId),erase:false,seed:point,replacement},ghosts:[]};
}
export const diagonalFenceWords={ja:'斜め直線（45°）',en:'Diagonal line (45°)',fr:'Ligne diagonale (45°)',it:'Linea diagonale (45°)',de:'Diagonale (45°)','es-ES':'Línea diagonal (45°)','zh-CN':'对角直线（45°）','pt-BR':'Linha diagonal (45°)'} as const;
export const diagonalMutationWords={
 ja:['斜め接続','斜め直線撤去','斜めフェンス範囲撤去'],
 en:['Connect diagonal','Erase diagonal line','Erase diagonal fences in area'],
 fr:['Relier en diagonale','Effacer ligne diagonale','Effacer clôtures diagonales dans la zone'],
 it:['Collega diagonale','Cancella linea diagonale','Cancella recinzioni diagonali nell’area'],
 de:['Diagonal verbinden','Diagonale löschen','Diagonale Zäune im Bereich löschen'],
 'es-ES':['Conectar diagonal','Borrar línea diagonal','Borrar vallas diagonales en área'],
 'zh-CN':['斜向连接','删除斜线','删除范围内斜向围栏'],
 'pt-BR':['Conectar diagonal','Apagar linha diagonal','Apagar cercas diagonais na área']
} as const;
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
export const roadMutationWords={
 ja:['斜めモード塗りつぶし','範囲内の道路スタイル置換','道路を編集'],
 en:['Diagonal-mode fill','Replace road style in area','Edit road'],
 fr:['Remplissage diagonal','Remplacer le style dans la zone','Modifier le chemin'],
 it:['Riempi in diagonale','Sostituisci stile nell’area','Modifica strada'],
 de:['Diagonal füllen','Wegstil im Bereich ersetzen','Weg bearbeiten'],
 'es-ES':['Relleno diagonal','Sustituir estilo en zona','Editar camino'],
 'zh-CN':['斜向模式填充','替换范围内道路样式','编辑道路'],
 'pt-BR':['Preencher modo diagonal','Trocar estilo na área','Editar caminho']
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

export function savedNetworkFreehand(tool:CardinalRoadTool):boolean{return tool==='brush'||tool==='erase-brush'||tool==='connect-brush';}
/** Store one sample per visited native logical cell. An oversize stroke is
 * refused in its entirety, not silently truncated. */
export function appendSavedStroke(points:readonly RoadPoint[],point:RoadPoint,grid:MainlandGrid,pitch:number,limit:number):RoadPoint[]|null{
 if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(pitch)||pitch<1)return null;
 const snap=(p:RoadPoint)=>({x:Math.floor((p.x-2*grid.origin.position[0])*grid.factor/pitch)*pitch,y:Math.floor((-p.y-2*grid.origin.position[2])*grid.factor/pitch)*pitch});
 const local=snap(point),last=points[points.length-1];
 if(local.x<0||local.y<0||local.x+pitch>grid.sizeX*grid.factor||local.y+pitch>grid.sizeY*grid.factor)return null;
 if(last){const before=snap(last);if(before.x===local.x&&before.y===local.y)return [...points];}
 if(points.length>=limit)return null;
 return [...points,point];
}
export const savedBrushWords={
 ja:['自由描画','自由消去','自由接続','マップ上をドラッグ'],
 en:['Freehand draw','Freehand erase','Freehand connect','Drag on the map'],
 fr:['Dessin libre','Effacement libre','Connexion libre','Glissez sur la carte'],
 it:['Disegno libero','Cancella a mano libera','Collega a mano libera','Trascina sulla mappa'],
 de:['Freihand zeichnen','Freihand löschen','Freihand verbinden','Auf der Karte ziehen'],
 'es-ES':['Dibujo libre','Borrado libre','Conexión libre','Arrastra en el mapa'],
 'zh-CN':['自由绘制','自由擦除','自由连接','在地图上拖动'],
 'pt-BR':['Desenho livre','Apagar à mão livre','Conexão livre','Arraste no mapa']
} as const;

export const networkPaletteWords={
 ja:['道・フェンスを新規設置','エリア','道','フェンス','スタイルを検索','スタイルを選択','原本の形状を確認中…','既存の道・フェンスがなくても配置できます。'],
 en:['Draw new paths or fences','Area','Paths','Fences','Find style','Choose style','Checking source geometry…','Place without an existing path or fence.'],
 fr:['Tracer chemins et clôtures','Zone','Chemins','Clôtures','Rechercher','Choisir le style','Vérification des formes…','Placement sans chemin ni clôture existante.'],
 it:['Disegna sentieri e recinzioni','Area','Sentieri','Recinzioni','Cerca stile','Scegli stile','Verifica forme…','Posiziona senza elementi preesistenti.'],
 de:['Wege und Zäune neu zeichnen','Gebiet','Wege','Zäune','Stil suchen','Stil wählen','Originalformen werden geprüft…','Platzierung ohne vorhandene Wege oder Zäune.'],
 'es-ES':['Dibujar caminos y vallas','Zona','Caminos','Vallas','Buscar estilo','Elegir estilo','Comprobando formas…','Coloca sin caminos ni vallas existentes.'],
 'zh-CN':['新建道路和围栏','区域','道路','围栏','搜索样式','选择样式','正在验证原始形状…','无需已有道路或围栏即可放置。'],
 'pt-BR':['Desenhar caminhos e cercas','Área','Caminhos','Cercas','Buscar estilo','Escolher estilo','Verificando formas…','Coloque sem caminho ou cerca existente.']
} as const;
