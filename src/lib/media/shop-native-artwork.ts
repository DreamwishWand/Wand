/**
 * Source-backed Steam 1.26.2 BundleViewModel field interpretation.
 * GameAssembly SHA256 a574a3c41b2911f6031070d05f933f562e4b3efdb881ac3c774384a0effee653
 * dump.cs SHA256 0ebf1de44c236a59703a5f09aa702f2acf2369e77b9f399ea792db58a0270d08
 * This is not a category/group selection or rendering verification.
 */
import type {PremiumBundleRevision} from '../items/public-item-master.ts';
import {SHOP_LIGHT_LAYOUTS,type ShopLightLayout} from './shop-artwork-layout.ts';
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
