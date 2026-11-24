import type {MapObjectLayer} from './source-map-layers.ts';
import {nativeActionBlocked,type NativeEditRestrictions} from './native-edit-restrictions.ts';
export const WORLD_LAYERS=['furniture','building','landscape','surface','ground','fence','fixed','other'] as const;
export type WorldLayer=typeof WORLD_LAYERS[number];
export interface WorldLayerState {readonly hidden:readonly WorldLayer[];readonly locked:readonly WorldLayer[]}
export interface WorldLayerObject {readonly layer:MapObjectLayer;readonly nativeType?:string|null;readonly editRestrictions?:NativeEditRestrictions}
export const defaultWorldLayers=():WorldLayerState=>({hidden:[],locked:[]});
/** Building identity is source-derived. A surface capability alone does not
 * make an item a supported child; fixed indicates a source restriction. */
export function worldLayer(o:WorldLayerObject):WorldLayer{
 if(o.nativeType==='Building')return 'building';
 if(nativeActionBlocked(o.editRestrictions,'select')||
  ['move','rotate','remove'].every(k=>o.editRestrictions?.[k as 'move'|'rotate'|'remove']==='denied'))return 'fixed';
 return o.layer;
}
export function layerVisible(state:WorldLayerState,o:WorldLayerObject){return !state.hidden.includes(worldLayer(o));}
export function layerSelectable(state:WorldLayerState,o:WorldLayerObject){return layerVisible(state,o)&&!state.locked.includes(worldLayer(o));}
export function toggleWorldLayer(state:WorldLayerState,layer:WorldLayer,kind:'hidden'|'locked'):WorldLayerState{
 const old=state[kind];return {...state,[kind]:old.includes(layer)?old.filter(v=>v!==layer):[...old,layer]};
}
