/**
 * Read-only World source catalog constructor.
 * Rejects duplicated IDs, malformed source-native GridObject references,
 * fake composite IDs and unsupported footprints. No source Save editing.
 */
import type {SourceGridAreaCatalog,SourceGridAreaItem,
  SourceGridAreaFootprint} from './native-gridarea-base.ts';
import {describeNativeFloorMask} from './native-mask.ts';
import {registerSourceAnchorIndex} from './native-source-anchor-index.ts';

export const WORLD_SCHEMA='wand.db04.world@1';
export interface WorldCatalogManifest extends Record<string,unknown> {
  gameVersion:string;
  schema:string;
  status:string;
  sourceScopeVerified?:boolean;
}
export interface WorldSourceObject extends SourceGridAreaItem {
  gridEditRestrictions?:Readonly<Record<string,{value?:boolean;nativeWireField?:string}>>;
}
export interface WorldGridEntry {
  gridIdNative:number;
  gridDataPath:string;
  defaultObjectCount:number;
  tessellationFactor?:number;
}
export interface WorldAreaLayoutEntry {
  nativeAreaTypeCode:number;
  nativeAreaTypeName?:string|null;
  gridLayoutPath:string;
}
export interface WorldSourceLayout {
  layoutId:string;
  layoutKind?:string;
  nativeGridEntries?:WorldGridEntry[];
  areaLayoutReferences?:WorldAreaLayoutEntry[];
  gridReferences?:Array<{path:string;wireField?:string}>;
}
export interface WorldSourceGrid {
  gridId:string;
  sizeX?:number;
  sizeY?:number;
  nativeFloorTypePalette?:number[];
}
export interface WorldSourceDefaultObject {
  layoutObjectId:string;
  layoutId:string;
  gridIdNative:number;
  gridObjectIdNative:number;
  itemId:number;
  x:number;
  y:number;
  orientationCode:number;
  orientationName?:string|null;
  worldCoordinatesVerified:false;
  fixedImmovableVerified:false;
}
export interface WorldSourceCatalog extends SourceGridAreaCatalog {
  readonly manifest:WorldCatalogManifest;
  readonly objects:ReadonlyMap<string,WorldSourceObject>;
  readonly scenes:ReadonlyMap<string,Record<string,unknown>>;
  readonly grids:ReadonlyMap<string,WorldSourceGrid>;
  readonly layouts:ReadonlyMap<string,WorldSourceLayout>;
  readonly worlds:ReadonlyMap<string,Record<string,unknown>>;
  readonly areas:ReadonlyMap<string,Record<string,unknown>>;
  readonly layoutObjects:ReadonlyMap<string,WorldSourceDefaultObject>;
  readonly layoutObjectsByLayout:ReadonlyMap<string,readonly WorldSourceDefaultObject[]>;
  readonly layoutObjectsByGrid:ReadonlyMap<string,
    ReadonlyMap<number,readonly WorldSourceDefaultObject[]>>;
  readonly unresolved:Record<string,unknown>|null;
}

const isRecord=(value:unknown):value is Record<string,unknown>=>
  value!==null&&typeof value==='object'&&!Array.isArray(value);
const idText=(value:string|number):string=>String(value);
const uniqueMap=(rows:unknown,key:string):Map<string,Record<string,unknown>>=>{
  if (!Array.isArray(rows)) throw new TypeError('Invalid DB-04 entity collection');
  const index=new Map<string,Record<string,unknown>>();
  for (const record of rows) {
    if (!isRecord(record) ||
        (!Number.isSafeInteger(record[key]) && typeof record[key] !== 'string')) {
      throw new TypeError('Invalid DB-04 entity identifier');
    }
    const id=String(record[key]);
    if (!id || index.has(id)) throw new TypeError('Duplicate/empty DB-04 entity identifier');
    index.set(id, record);
  }
  return index;
};

function validateFootprint(footprint:unknown):void {
  if(footprint!==null&&!isRecord(footprint))
    throw new TypeError('Unverified or malformed native placement footprint');
  const f=footprint as Record<string,unknown>|null;
  const sx=f?.sizeX as number,sy=f?.sizeY as number;
  const override=f?.strideOverride as number|null|undefined;
  const sourceVerified=f?.strideOverrideSourceVerified as boolean|undefined;
  const wire=isRecord(f?.nativeWireFields)?f.nativeWireFields:null;
  const layers=f?.layerValues as number[]|undefined;
  if (footprint === null) return;
  if (!f || !Number.isInteger(sx) || !Number.isInteger(sy) ||
      sx<1||sy<1||sx>256||sy>256||sx*sy>16384 ||
      (override!==undefined&&override!==null&&
       (!Number.isInteger(override)||override < -2147483648 ||
        override>2147483647)) ||
      (sourceVerified!==undefined&&
       (typeof sourceVerified!=='boolean'||
        (sourceVerified&&!Number.isInteger(override))||
        (!sourceVerified&&override!=null))) ||
      (f.strideOverridePlacementSemanticsVerified!==undefined&&
       f.strideOverridePlacementSemanticsVerified!==false) ||
      (sourceVerified===true&&wire?.strideOverride!=='6.5') ||
      !Array.isArray(layers)||layers.length!==sx*sy||
      !layers.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=4294967295)||
      f.cellIndexToXYVerified!==false||f.layerMaskSemanticsVerified!==false) {
    throw new TypeError('Unverified or malformed native placement footprint');
  }
}

export function createWorldCatalog(bundle:unknown):WorldSourceCatalog {
  if (!isRecord(bundle) || !isRecord(bundle.manifest) || bundle.manifest.schema !== WORLD_SCHEMA ||
      bundle.manifest.status !== 'partial_game_native_evidence') {
    throw new TypeError('Unsupported or unverified DB-04 manifest');
  }
  const objects = uniqueMap(bundle.objects, 'itemId');
  const scenes = uniqueMap(bundle.scenes, 'sceneId');
  const grids = uniqueMap(bundle.grids, 'gridId');
  const layouts = uniqueMap(bundle.layouts, 'layoutId');
  const worlds = uniqueMap(bundle.worlds ?? [], 'worldId');
  const areas = uniqueMap(bundle.areas ?? [], 'areaId');
  const layoutObjects = uniqueMap(bundle.layoutObjects ?? [], 'layoutObjectId');
  const layoutObjectsByLayout=new Map<string,WorldSourceDefaultObject[]>();
  // Reuse exact native Grid.ID buckets across viewport and anchor queries.
  // A large original GridCollection may contain many unrelated grids.
  const layoutObjectsByGrid=new Map<string,Map<number,WorldSourceDefaultObject[]>>();
  for (const rawObject of layoutObjects.values()) {
    const object=rawObject as Record<string,unknown>;
    if (!layouts.has(object.layoutId as string)) {
      throw new TypeError('DB-04 default object references an absent native layout');
    }
    if (!Number.isSafeInteger(object.x) || !Number.isSafeInteger(object.y) ||
        !Number.isSafeInteger(object.gridIdNative) ||
        (object.gridIdNative as number)<0||(object.gridIdNative as number)>0xffffffff ||
        !Number.isSafeInteger(object.gridObjectIdNative) ||
        (object.gridObjectIdNative as number)<0||(object.gridObjectIdNative as number)>0xffffffff ||
        // The original GridCollection map key and GridObject.ID were checked
        // by extraction. Never let a divergent exported composite ID point a
        // save/editor join at a different native object after JSON mutation.
        object.layoutObjectId !==
          `${object.layoutId}#grid=${object.gridIdNative}#object=${object.gridObjectIdNative}` ||
        !Number.isSafeInteger(object.itemId) ||
        object.worldCoordinatesVerified !== false ||
        object.fixedImmovableVerified !== false) {
      throw new TypeError('Invalid native default object evidence');
    }
    const id=object.layoutId as string;
    const nativeGridId=object.gridIdNative as number;
    const entry=object as unknown as WorldSourceDefaultObject;
    const rows=layoutObjectsByLayout.get(id)??[];
    rows.push(entry);
    layoutObjectsByLayout.set(id,rows);
    const buckets=layoutObjectsByGrid.get(id)??new Map<number,WorldSourceDefaultObject[]>();
    const gridRows=buckets.get(nativeGridId)??[];
    gridRows.push(entry);
    buckets.set(nativeGridId,gridRows);
    layoutObjectsByGrid.set(id,buckets);

  }
  for (const item of objects.values()) validateFootprint(item.footprint);
  const catalog:WorldSourceCatalog = {
    manifest:bundle.manifest as unknown as WorldCatalogManifest,
    objects:objects as unknown as ReadonlyMap<string,WorldSourceObject>,
    scenes,grids:grids as unknown as ReadonlyMap<string,WorldSourceGrid>,
    layouts:layouts as unknown as ReadonlyMap<string,WorldSourceLayout>,
    worlds,areas,
    layoutObjects:layoutObjects as unknown as ReadonlyMap<string,WorldSourceDefaultObject>,
    layoutObjectsByLayout,layoutObjectsByGrid,
    unresolved:isRecord(bundle.unresolved)?bundle.unresolved:null
  };
  registerSourceAnchorIndex(catalog);
  return catalog;
}

// Explicit "false" is a valid native restriction; missing flags are NOT permission.
export function checkNativeEditRestriction(catalog:WorldSourceCatalog,itemId:string|number,action:string) {
  const allowed = new Set(['canMove', 'canRotate', 'canBeRemoved', 'canBeSelected', 'canSwitchGrid']);
  if (!allowed.has(action)) throw new TypeError('Unknown DB-04 edit action');
  const record = catalog.objects.get(idText(itemId));
  if (!record) return { status: 'unknown_item' };
  const flag = record.gridEditRestrictions?.[action];
  if (flag?.value === false) return { status: 'denied_by_native_flag', evidence: flag.nativeWireField };
  if (flag?.value === true) return { status: 'native_flag_true_not_full_placement_permission',
    evidence: flag.nativeWireField };
  return { status: 'unresolved' };
}

// These records are NOT a save-specific world snapshot (reserved for DB-05).
export function getNativeWorld(catalog:WorldSourceCatalog,worldId:string|number) {
  return catalog.worlds.get(String(worldId)) ?? null;
}

export function getNativeAreasForScene(catalog:WorldSourceCatalog,sceneId:string|number) {
  const id = idText(sceneId);
  return [...catalog.areas.values()].filter(area => String(area.parentSceneId) === id);
}

export function getNativeScene(catalog:WorldSourceCatalog,sceneId:string|number) {
  return catalog.scenes.get(idText(sceneId)) ?? null;
}

export function getNativeFloorPalette(catalog:WorldSourceCatalog,gridId:string|number) {
  const native = catalog.grids.get(String(gridId));
  if (!native || !Array.isArray(native.nativeFloorTypePalette)) return null;
  return native.nativeFloorTypePalette.map(value => ({
    nativeValue: value, ...describeNativeFloorMask(value),
  }));
}

export function getLayoutGridReferences(catalog:WorldSourceCatalog,layoutId:string|number) {
  const refs = catalog.layouts.get(String(layoutId))?.gridReferences ?? [];
  return refs.map(ref => ({
    path: ref.path, wireField: ref.wireField,
    knownGrid: catalog.grids.has(ref.path),
  }));
}

