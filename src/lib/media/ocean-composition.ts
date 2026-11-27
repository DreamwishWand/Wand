import type {Affine} from '../world/media-map-calibration.ts';
import {publicImageUrl} from './public-image-key.ts';
import type {PublishedWorldMap} from './public-world-map-parts.ts';

type RGBA=readonly [number,number,number,number];
type Geometry={readonly imageToCanvas:Affine;readonly width:number;readonly height:number};
type Fill=Geometry&{readonly kind:'fill';readonly rgba:RGBA};
type Sprite=Geometry&{readonly kind:'sprite';readonly sha256:string;readonly url:string};
type Sdf=Geometry&{readonly kind:'sdf';readonly sha256:string;readonly url:string;readonly rgba:RGBA};
export type OceanLayer=Fill|Sprite|Sdf;
export type OceanTransfer={readonly channel:'r'|'g'|'b'|'a';readonly table:readonly number[]};
export type OceanComposition={readonly width:number;readonly height:number;readonly parts:readonly OceanLayer[];readonly transfer:OceanTransfer};
const SHA=/^[a-f0-9]{64}$/;
const reference='84bd53fecc3ac63149952ae084c4d444ccbb25f923832d8940dd8742fffe265e';
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function check(v:unknown,code:string):asserts v{if(!v)throw new TypeError('OCEAN_COMPOSITION_'+code);}
function matrix(v:unknown):Affine{
  check(Array.isArray(v)&&v.length===6&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e7)&&Math.abs(v[0]*v[3]-v[1]*v[2])>1e-8,'MATRIX');
  return Object.freeze([...v]) as unknown as Affine;
}
function color(v:unknown):RGBA{
  check(Array.isArray(v)&&v.length===4&&v.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'COLOR');
  return Object.freeze([...v]) as unknown as RGBA;
}
function dimension(v:unknown):v is number{return typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=32768;}
function parseTransfer(v:unknown):OceanTransfer{
  check(record(v)&&typeof v.channel==='string'&&['r','g','b','a'].includes(v.channel)&&Array.isArray(v.table)&&v.table.length===256&&
    v.table.every((n,i,a)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1&&(i===0||n>=a[i-1]))&&
    v.table[0]===0&&v.table[255]===1,'POSITIVE_TRANSFER');
  return Object.freeze({channel:v.channel as OceanTransfer['channel'],table:Object.freeze([...v.table])});
}
export function resolveOceanComposition(doc:unknown,activation:unknown,map:PublishedWorldMap):OceanComposition|null{
  if(record(activation)&&activation.state==='unpublished')return null;
  check(record(activation)&&activation.state==='published'&&activation.canonicalMetadataVerified===true&&
    activation.referenceComparisonVerified===true&&activation.referenceSha256===reference&&record(activation.images),'ACTIVATION');
  check(record(doc)&&doc.schema==='wand.media.ocean-composition@1'&&doc.gameVersion==='1.26.2'&&doc.polarity==='positive'&&
    doc.referenceSha256===reference&&doc.world==='exp4'&&doc.width===10975&&doc.height===11085&&Array.isArray(doc.parts)&&
    doc.parts.length===45&&map.id==='MapVillageExpansion4'&&map.worldCandidate==='exp4','SOURCE');
  const transfer=parseTransfer(activation.transfer);
  const normal=new Map(map.parts.map(p=>[p.sha256,p]));
  const used=new Set<string>(),sdf=new Set<string>();
  let fills=0;
  const parts:OceanLayer[]=doc.parts.map(p=>{
    check(record(p),'PART');
    const imageToCanvas=matrix(p.imageToCanvas);
    if(p.kind==='fill'){fills++;return {kind:'fill',width:1,height:1,imageToCanvas,rgba:color(p.rgba)};}
    check(typeof p.sha256==='string'&&SHA.test(p.sha256)&&dimension(p.width)&&dimension(p.height),'IMAGE');
    const shape={sha256:p.sha256,width:p.width,height:p.height,imageToCanvas};
    if(p.kind==='sprite'){
      const verified=normal.get(p.sha256);
      check(verified&&verified.width===p.width&&verified.height===p.height&&!used.has(p.sha256),'SPRITE_RECEIPT');
      used.add(p.sha256);
      return {kind:'sprite',...shape,url:verified.url};
    }
    check(p.kind==='sdf'&&!sdf.has(p.sha256),'SDF');
    const receipt=(activation.images as Record<string,unknown>)[p.sha256];
    check(record(receipt)&&receipt.width===p.width&&receipt.height===p.height&&receipt.bytes===p.bytes,'SDF_RECEIPT');
    sdf.add(p.sha256);
    return {kind:'sdf',...shape,url:publicImageUrl('https://media.dreamwishwand.com','original',p.sha256),rgba:color(p.rgba)};
  });
  check(fills===2&&sdf.size===7&&used.size===36&&used.size===normal.size&&Object.keys(activation.images).length===7,'COVERAGE');
  return Object.freeze({width:doc.width,height:doc.height,parts:Object.freeze(parts),transfer});
}
export function oceanChannelMatrix(channel:OceanTransfer['channel']):string{
  return [...Array(15).fill(0),...['r','g','b','a'].map(c=>c===channel?1:0),0].join(' ');
}
export async function loadOceanComposition(map:PublishedWorldMap):Promise<OceanComposition|null>{
  if(map.id!=='MapVillageExpansion4')return null;
  const {default:activation}=await import('../../../data/ddv/media/keepsake-sea-activation-steam-1.26.2.json',{with:{type:'json'}});
  if(activation.state==='unpublished')return null;
  const {default:doc}=await import('../../../data/ddv/media/keepsake-sea-composition-steam-1.26.2.json',{with:{type:'json'}});
  return resolveOceanComposition(doc,activation,map);
}
