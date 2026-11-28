/** Raw artwork references only. A published asset does not certify a native card composition. */
import type {PremiumBundleRevision} from '../items/public-item-master.ts';
import {parseBundleArtwork,type BundleArtwork} from './bundle-artwork.ts';
import {publicImageUrl,type ImageVariant} from './public-image-key.ts';
const origin='https://media.dreamwishwand.com';
const SHA=/^[0-9a-f]{64}$/;
const GUID=/^[0-9a-f]{32}$/;
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function check(v:unknown,message:string):asserts v {if(!v)throw new TypeError('Shop source: '+message);}
export function createShopSourceReader(doc:unknown,version='1.26.2'){
  const assets=new Map<string,BundleArtwork>();
  check(record(doc),'release');
  if(doc.state==='unpublished'){
    check(Object.keys(doc).length===1,'unpublished index');
  }else{
    check(Object.keys(doc).sort().join(',')==='gameVersion,images,publicReadbackVerified,publicationAuthorized,references,renderingVerified,schema,state'&&
      doc.schema==='wand.media.shop-source-release@1'&&doc.state==='published'&&doc.gameVersion===version&&
      doc.publicationAuthorized===true&&doc.publicReadbackVerified===true&&doc.renderingVerified===false&&
      record(doc.images)&&record(doc.references),'release identity');
    const images=new Map<string,unknown>();
    for(const [sha,row] of Object.entries(doc.images)){
      check(SHA.test(sha)&&record(row)&&Object.keys(row).sort().join(',')==='bytes,height,width','image metadata');
      images.set(sha,{sha256:sha,...row});
    }
    const used=new Set<string>();
    for(const [guid,pair] of Object.entries(doc.references)){
      check(GUID.test(guid)&&Array.isArray(pair)&&pair.length===2&&pair.every(x=>typeof x==='string'&&images.has(x)),'source reference');
      const result=parseBundleArtwork({original:images.get(pair[0]),thumbnail:images.get(pair[1])});
      check(result&&(Math.max(result.original.width,result.original.height)<=512?pair[0]===pair[1]:
        Math.max(result.thumbnail.width,result.thumbnail.height)===512),'thumbnail policy');
      used.add(pair[0]);used.add(pair[1]);
      assets.set(guid,Object.freeze({original:Object.freeze(result.original),thumbnail:Object.freeze(result.thumbnail)}));
    }
    check(assets.size>0&&used.size===images.size,'asset coverage');
  }
  function get(address:unknown):BundleArtwork|null {
    return typeof address==='string'&&/^guid:[a-f0-9]{32}$/.test(address)?assets.get(address.slice(5))??null:null;
  }
  return Object.freeze({get,
    url(address:unknown,variant:ImageVariant='thumbnail'){
      const a=get(address);
      return a&&(variant==='thumbnail'||variant==='original')?publicImageUrl(origin,variant,a[variant].sha256):null;
    },
    /** Resolve only explicit references in the selected DB-01 revision.
     * Missing/unknown addresses remain null. No item fallback or implied layout. */
    resolveRevision(revision:PremiumBundleRevision){
      const art=revision.artwork??{},mega=record(art.megaImages)?art.megaImages:{};
      return Object.freeze({renderingVerified:false as const,revisionSha256:revision.revisionSha256,
        image:get(art.image),background:get(art.background),
        megaImages:Object.freeze([1,2,3,4].map(n=>get(mega['OverridedImage'+n]))),
        components:Object.freeze(revision.components.map(c=>Object.freeze({
          itemId:c.itemId,quantity:c.quantity,explicitImage:get(c.image)
        })))});
    }
  });
}
let reader:Promise<ReturnType<typeof createShopSourceReader>>|undefined;
export function loadShopSourceMedia(){
  if(!reader)reader=import('../../../data/ddv/media/shop-sources-steam-1.26.2.json',{with:{type:'json'}}).then(m=>createShopSourceReader(m.default)).catch(e=>{reader=undefined;throw e;});
  return reader;
}
