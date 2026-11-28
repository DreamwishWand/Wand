/**
 * Source-backed Steam 1.26.2 BundleViewModel field interpretation.
 * GameAssembly SHA256 a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653
 * dump.cs SHA256 0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08
 * This is not a category/group selection or rendering verification.
 */
import type {PremiumBundleRevision} from '../items/public-item-master.ts';
import {SHOP_LIGHT_LAYOUTS,type ShopLightLayout,type ShopArtworkBinding} from './shop-artwork-layout.ts';
const legacyLayouts=['Dual','Dual_1','Dual_2','Single','Single_1','Single_2','Single_11','Single_12','Single_22_Large','Single_22_Small','Single_111','Single_122','Single_222','Single_Mega_11','Single_Mega_111','Single_Mega_1111'] as const;
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export type NativeShopAdjustment={readonly fill:'contain'|'cover';readonly margins:readonly [number,number,number,number]};
export function nativeShopAdjustment(value:unknown):NativeShopAdjustment|null{
  if(!record(value))return null;
  // Definitions.ImageFillMode: EnvelopeParent=0, FitInParent=1.
  // ImageAdjustmentBinding.SetValue 0x6B68983..0x6B68A82:
  // AspectRatioFitter mode 3 if 1, otherwise 4; offsetMin=(L,B), offsetMax=(-R,-T).
  const mode=value.FillMode??'EnvelopeParent';
  if(mode!=='EnvelopeParent'&&mode!=='FitInParent')return null;
  const margins=['MarginTop','MarginRight','MarginBottom','MarginLeft'].map(k=>value[k]??0);
  if(!margins.every(n=>typeof n==='number'&&Number.isInteger(n)&&Math.abs(n)<=4096))return null;
  return {fill:mode==='FitInParent'?'contain':'cover',margins:margins as [number,number,number,number]};
}
export function steamShopArtworkRules(revision:PremiumBundleRevision){
  if(revision.gameVersion!=='1.26.2')return null;
  const art=revision.artwork??{};
  // Protobuf enum zero is Light_Dual and Dual. Constructor and SetDefaultData
  // do not change either; BundleViewModel .ctor 0x6F3E20B..0x6F3E242
  // copies separate fields without translating the legacy layout.
  const light=art.lightLayout??'Light_Dual',legacy=art.layout??'Dual';
  if(typeof light!=='string'||!(SHOP_LIGHT_LAYOUTS as readonly string[]).includes(light)||
     typeof legacy!=='string'||!(legacyLayouts as readonly string[]).includes(legacy))return null;
  const mega=legacy.startsWith('Single_Mega_')||light.startsWith('Light_Mega_');
  // .ctor 0x6F3E2DB..0x6F3E33D: retain nonempty Image only for non-mega.
  // get_CurrentImage 0x6F3D320: otherwise use first *runtime* Items.Icon.
  const image=typeof art.image==='string'&&art.image.length>0&&!mega?art.image:null;
  // .ctor 0x6F3E342..0x6F3E3B6 passes explicit adjustment only when enabled.
  // Missing/disabled adjustment is not proof of prefab default geometry.
  const adjustment=art.adjustImage===true?nativeShopAdjustment(art.imageAdjustment):null;
  return {layout:light as ShopLightLayout,layoutDefaulted:art.lightLayout==null,
    legacyLayout:legacy,mega,currentImage:image,currentImageNeedsRuntimeIcon:image===null,adjustment};
}

/** Address-level selection. The first content is appended before any generated
 * entries (LoadItemsAsync.MoveNext 0x6F4478D..0x6F44842); later positions need
 * a reconstructed runtime prefix. Caller-supplied verified prefix is optional.
 * CurrentImage and MegaBundleImage use Sprite; Items.Icon has both consumers.
 * An explicit but unavailable image never falls back to another address.
 */
export type NativeShopBindingAddress =
  |{readonly status:'address';readonly address:string;readonly field:string;readonly consumer:'Sprite'|'Icon'}
  |{readonly status:'unresolved';readonly reason:'unsupported_revision'|'runtime_icon_address'|'runtime_order'|'empty_runtime_items'};
const nonempty=(v:unknown):v is string=>typeof v==='string'&&v.length>0;
export function nativeShopBindingAddress(revision:PremiumBundleRevision,binding:ShopArtworkBinding,
  verifiedRuntimePrefix?:readonly {readonly address:string|null;readonly field:string}[]):NativeShopBindingAddress{
  const native=steamShopArtworkRules(revision);
  if(!native)return {status:'unresolved',reason:'unsupported_revision'};
  const explicit=(address:string,field:string,consumer:'Sprite'|'Icon'):NativeShopBindingAddress=>({status:'address',address,field,consumer});
  if(binding==='CurrentImage'&&native.currentImage)return explicit(native.currentImage,'Image','Sprite');
  const mega=/^MegaBundleImage([1-4])$/.exec(binding);
  const icon=/^Items\[(\d+)\]\.Icon$/.exec(binding);
  const index=mega?Number(mega[1])-1:icon?Number(icon[1]):0;
  if(mega){
    const field='OverridedImage'+mega[1], art=revision.artwork??{};
    const overrides=record(art.megaImages)?art.megaImages:{};
    const address=overrides[field];
    if(nonempty(address))return explicit(address,field,'Sprite');
  }
  const consumer=icon?'Icon':'Sprite';
  const proven=verifiedRuntimePrefix?.[index];
  if(proven)return nonempty(proven.address)?explicit(proven.address,proven.field,consumer):{status:'unresolved',reason:'runtime_icon_address'};
  if(index!==0)return {status:'unresolved',reason:'runtime_order'};
  const first=revision.components[0];
  if(!first)return {status:'unresolved',reason:'empty_runtime_items'};
  return nonempty(first.image)?explicit(first.image,'Contents.0.Image',consumer):{status:'unresolved',reason:'runtime_icon_address'};
}
