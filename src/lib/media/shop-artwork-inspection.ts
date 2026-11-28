import type {PremiumBundleRevision} from '../items/public-item-master.ts';
import type {BundleArtwork} from './bundle-artwork.ts';
import type {ShopSourceKind} from './shop-source-media.ts';
import {shopArtworkTemplate} from './shop-artwork-layout.ts';
import {steamShopArtworkRules,nativeShopBindingAddress} from './shop-native-artwork.ts';

type Reader={get(address:unknown,kind?:ShopSourceKind):BundleArtwork|null};
export function inspectShopArtwork(revision:PremiumBundleRevision,reader:Reader,groupWidth:number){
  const art=revision.artwork??{};
  const mega=art.megaImages as Record<string,unknown>|undefined;
  const fields:{field:string;address:unknown;itemId?:number}[]=[
    {field:'Image',address:art.image},{field:'Background',address:art.background},
    ...[1,2,3,4].map(i=>({field:'OverridedImage'+i,address:mega?.['OverridedImage'+i]})),
    ...revision.components.map((c,i)=>({field:'Contents.'+i+'.Image',address:c.image,itemId:c.itemId}))
  ];
  const rows=fields.map(f=>({...f,
    sprite:reader.get(f.address,'Sprite'),texture:reader.get(f.address,'Texture2D')}));
  const native=steamShopArtworkRules(revision);
  const template=shopArtworkTemplate(native?.layout??art.lightLayout,groupWidth);
  // Explicit candidate bindings only; an absent override or ambiguous Icon is not a resolved native image.
  const slots=template?.slots.map(s=>{
    const nativeAddress=native?nativeShopBindingAddress(revision,s.binding):null;
    const field=nativeAddress?.status==='address'?nativeAddress.field:
      s.binding==='CurrentImage'?'Image':s.binding.startsWith('MegaBundleImage')?
      'OverridedImage'+s.binding.slice('MegaBundleImage'.length):
      'Contents.'+s.binding.match(/\d+/)?.[0]+'.Image';
    const row=rows.find(r=>r.field===field);
    const main=s.binding==='CurrentImage';
    // CurrentImage/Mega use Sprite. Item.Icon can use either native consumer;
    // use no image until that choice is known (or both exact aliases agree).
    const sprite=nativeAddress?.status==='address'?reader.get(nativeAddress.address,'Sprite'):null;
    const texture=nativeAddress?.status==='address'&&nativeAddress.consumer==='Icon'?reader.get(nativeAddress.address,'Texture2D'):null;
    const image=nativeAddress
      ?nativeAddress.status==='address'
        ?nativeAddress.consumer==='Sprite'?sprite:
          sprite&&texture&&sprite.original.sha256===texture.original.sha256&&sprite.thumbnail.sha256===texture.thumbnail.sha256?sprite:null
        :null
      :s.binding.startsWith('Items[')?null:row?.sprite??null;
    const adjustment=main&&image?native?.adjustment??null:null;
    return {...s,field,image,adjustment,nativeAddress};
  })??[];
  return {rows,template,slots,native,renderingVerified:false as const};
}
