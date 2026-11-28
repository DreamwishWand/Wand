export const PRESET_SCHEMAS=[
 'wand.preset.scene@1','wand.preset.mixed-scene@1','wand.preset.area-scene@1','wand.preset.support-scene@1',
 'wand.preset.whole-area-design@1','wand.preset.biome-network@1','wand.preset.biome-decoration@1',
 'wand.preset.floating-island-design@1','wand.preset.floating-island-decoration@1','wand.preset.world-decoration@1','wand.preset.world-grid-decoration@1',
 'wand.preset.region-decoration@1','wand.preset.indoor-decoration@1','wand.room-design@1','wand.world-design@1','wand.mainland-design@1','wand.world-scope-design@1','wand.preset.native-backup@1','wand.preset.game-code@1'
] as const;
export type PresetSchema=typeof PRESET_SCHEMAS[number];
export type PresetKind='scene'|'support'|'biome'|'island'|'world'|'region'|'room'|'floor'|'building'|'design'|'network'|'tom-furniture'|'tom-clothing'|'native-decoration'|'decoration-code'|'shop-code';
export type PresetDomain='wand'|'tom'|'game';
export function presetDomain(kind:PresetKind):PresetDomain{return kind==='tom-furniture'||kind==='tom-clothing'?'tom':kind==='native-decoration'||kind==='decoration-code'||kind==='shop-code'?'game':'wand';}
export interface PresetHeader{schema:PresetSchema;kind:PresetKind;version:string|null;domain:PresetDomain;privateBackup:boolean}
export const PRESET_FILE_LIMIT=16_000_000,PRESET_SESSION_LIMIT=128_000_000,PRESET_SESSION_COUNT=100;
export const SCENE_SCHEMAS=['wand.preset.scene@1','wand.preset.mixed-scene@1','wand.preset.area-scene@1','wand.preset.support-scene@1'] as const;
/** Classification only. The original editor parser and worker are the sole
 * authority for compatibility and writes. No native Save format is accepted. */
export function presetHeader(raw:string):PresetHeader{
 if(!raw.length||raw.length>PRESET_FILE_LIMIT)throw Error('PRESET_SIZE');
 const v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v)||!PRESET_SCHEMAS.includes(v.schema))throw Error('PRESET_TYPE');
 const schema=v.schema as PresetSchema;
 let kind:PresetKind;
 switch(schema){
  case 'wand.preset.native-backup@1':{
   if(Object.keys(v).length!==6||![624,626,643].includes(v.gameSchema)||!v.payload||typeof v.payload!=='object'||Array.isArray(v.payload))throw Error('PRESET_NATIVE');
   if(v.kind==='native-decoration'){if(v.storage!=='decoration'||v.baseItemId!==null||typeof v.payload.PresetName!=='string'||!v.payload.GridCollection||!Number.isInteger(v.payload.StateFlags)||(v.payload.StateFlags&16)!==0)throw Error('PRESET_NATIVE');}
   else if(v.kind==='tom-furniture'||v.kind==='tom-clothing'){if(v.kind==='tom-furniture'?v.storage!=='furniture':!['female','male'].includes(v.storage))throw Error('PRESET_NATIVE');if(!Number.isSafeInteger(v.baseItemId)||v.baseItemId<1||v.baseItemId>0xffffffff||v.payload.Item!==v.baseItemId||!Number.isSafeInteger(v.payload.Id)||v.payload.Id<0)throw Error('PRESET_NATIVE');}
   else throw Error('PRESET_NATIVE');
   kind=v.kind;break;
  }
  case 'wand.preset.game-code@1':{
   if(Object.keys(v).length!==4||!['decoration','shop'].includes(v.purpose)||typeof v.code!=='string'||!v.code.trim()||v.code.length>128||/[\u0000-\u001f\u007f]/.test(v.code)||v.status!=='unverified')throw Error('PRESET_CODE');kind=v.purpose==='shop'?'shop-code':'decoration-code';break;
  }
  case 'wand.preset.scene@1':case 'wand.preset.mixed-scene@1':case 'wand.preset.area-scene@1':if(!Array.isArray(v.items))throw Error('PRESET_ITEMS');kind='scene';break;
  case 'wand.preset.support-scene@1':if(!v.tree)throw Error('PRESET_TREE');kind='support';break;
  case 'wand.preset.whole-area-design@1':if(!v.design||!['biome','floating-island','world-grid'].includes(v.kind))throw Error('PRESET_AREA');kind=v.kind==='biome'?'biome':v.kind==='floating-island'?'island':'world';break;
  case 'wand.preset.biome-network@1':if(!Array.isArray(v.rows))throw Error('PRESET_NETWORK');kind='network';break;
  case 'wand.preset.biome-decoration@1':if(!v.furniture||!v.network)throw Error('PRESET_AREA');kind='biome';break;
  case 'wand.preset.floating-island-design@1':case 'wand.preset.floating-island-decoration@1':if(!Array.isArray(v.areas))throw Error('PRESET_AREA');kind='island';break;
  case 'wand.preset.world-grid-decoration@1':if(!v.furniture||!v.network)throw Error('PRESET_AREA');kind='world';break;
  case 'wand.preset.world-decoration@1':if(!Array.isArray(v.areas))throw Error('PRESET_AREA');kind='world';break;
  case 'wand.preset.region-decoration@1':if(!v.region||!!v.world===!!v.island)throw Error('PRESET_REGION');kind='region';break;
  case 'wand.preset.indoor-decoration@1':if(!Array.isArray(v.rooms)||!['room','floor','building'].includes(v.scope))throw Error('PRESET_ROOM');kind=v.scope;break;
  case 'wand.room-design@1':if(!Array.isArray(v.surfaces))throw Error('PRESET_ROOM');kind='room';break;
  case 'wand.world-design@1':if(!Array.isArray(v.placements))throw Error('PRESET_DESIGN');kind='design';break;
  default:if(!Array.isArray(v.areas))throw Error('PRESET_DESIGN');kind='design';
 }
 const version=schema==='wand.preset.region-decoration@1'?(v.world??v.island)?.gameVersion:v.gameVersion;
 return {schema,kind,domain:presetDomain(kind),privateBackup:schema==='wand.preset.native-backup@1',version:typeof version==='string'&&/^\d+\.\d+(\.\d+)?$/.test(version)?version:null};
}
export interface PublicPresetSource{workId:string;revisionId:string;creatorProfileId:string;creatorName:string;title:string}
export interface SessionPreset extends PresetHeader{ id:number;name:string;file:File;publicSource?:PublicPresetSource }
export function filterSessionPresets(entries:readonly SessionPreset[],schemas:readonly PresetSchema[],query='',kinds?:readonly PresetKind[]){
 const q=query.trim().toLocaleLowerCase();
 return entries.filter(e=>(!schemas.length||schemas.includes(e.schema))&&(!kinds||kinds.includes(e.kind))&&(!q||e.name.toLocaleLowerCase().includes(q))).slice().sort((a,b)=>b.id-a.id);
}
export function validPresetName(name:string){return name.trim().length>0&&name.trim().length<=160&&!/[\u0000-\u001f\u007f]/.test(name);}
