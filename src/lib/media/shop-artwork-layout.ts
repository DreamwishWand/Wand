/**
 * Native Light Shop artwork templates, from Steam 1.26.2 menu-premiumshop
 * RectTransform, LightSingleBundle selector, HorizontalLayoutGroup and
 * LayoutElement, cross-referenced against the matching MonoScript and enum.
 * Only artwork regions are modeled; this is not a recreation of price,
 * purchase, focus, or entitlement UI. Legacy Layout is NOT LightLayout.
 */
export const SHOP_LIGHT_LAYOUTS=[
  'Light_Dual','Light_Single','Light_Single_111','Light_Single_1111',
  'Light_Mega_11','Light_Mega_111','Light_Mega_1111'
] as const;
export type ShopLightLayout=typeof SHOP_LIGHT_LAYOUTS[number];
export type ShopArtworkBinding='CurrentImage'|`Items[${number}].Icon`|`MegaBundleImage${number}`;
export interface ShopArtworkSlot {readonly binding:ShopArtworkBinding;readonly x:number;readonly width:number}
export interface ShopArtworkTemplate {
  readonly layout:ShopLightLayout;
  readonly prefab:string;
  readonly cardWidth:number;
  readonly cardHeight:380;
  readonly artworkWidth:number;
  readonly artworkHeight:350;
  readonly slots:readonly ShopArtworkSlot[];
  readonly separators:readonly {x:number;width:number}[];
  readonly scroll:null|{readonly x:number;readonly width:number;readonly itemWidth:300;readonly imageInset:59.048};
}
function horizontal(layout:ShopLightLayout,count:number,mega:boolean,groupWidth:number):ShopArtworkTemplate|null{
  const padding=mega?10:0, gap=mega?2:0, divider=mega?70:0;
  const width=(groupWidth-2*padding-(count-1)*(divider+2*gap))/count;
  if(width<=0)return null;
  const slots:ShopArtworkSlot[]=[],separators:{x:number;width:number}[]=[];
  let x=padding;
  for(let i=0;i<count;i++){
    slots.push({binding:mega?`MegaBundleImage${i+1}`:`Items[${i}].Icon`,x,width});
    x+=width;
    if(mega&&i<count-1){x+=gap;separators.push({x,width:divider});x+=divider+gap;}
  }
  return {layout,prefab:mega?`LightBundleItemTile_Mega_${count}_Images`:`LightBundleItemTile_${count}_Images`,
    cardWidth:groupWidth,cardHeight:380,artworkWidth:groupWidth,artworkHeight:350,slots,separators,scroll:null};
}
/** Light_Dual is one tile PER offer, not two images of the same offer.
 * BundleLoader.DelayedInstantiate -> SetPivotPreset(MiddleCenter),
 * SetAnchorPreset(StretchAll), set_offsetMin/Max (Steam 1.26.2 RVAs
 * 0x23E57B0, 0x6E1DF80, 0x6E1EB20). Root serialized width 500 is NOT
 * runtime width. LightDualBundle children occupy half the group minus 30.
 * LightSingleBundle fills the group. Supply verified native group width;
 * no inference from a missing LightLayout or legacy Layout value. */
export function shopArtworkTemplate(layout:unknown,groupWidth?:number):ShopArtworkTemplate|null{
  if(typeof groupWidth!=='number'||!Number.isFinite(groupWidth)||groupWidth<=540||groupWidth>16384)return null;
  const dualWidth=groupWidth/2-30;
  const scrollWidth=groupWidth-40-500;
  switch(layout){
    case 'Light_Dual':return {layout,prefab:'LightBundleItemTile',cardWidth:dualWidth,cardHeight:380,
      artworkWidth:dualWidth,artworkHeight:350,slots:[{binding:'CurrentImage',x:0,width:dualWidth}],separators:[],scroll:null};
    case 'Light_Single':return {layout,prefab:'LightBundleItemTile_With_Scroll',cardWidth:groupWidth,cardHeight:380,
      artworkWidth:groupWidth-40,artworkHeight:350,slots:[{binding:'CurrentImage',x:0,width:500}],separators:[],
      scroll:{x:500,width:scrollWidth,itemWidth:300,imageInset:59.048}};
    case 'Light_Single_111':return horizontal(layout,3,false,groupWidth);
    case 'Light_Single_1111':return horizontal(layout,4,false,groupWidth);
    case 'Light_Mega_11':return horizontal(layout,2,true,groupWidth);
    case 'Light_Mega_111':return horizontal(layout,3,true,groupWidth);
    case 'Light_Mega_1111':return horizontal(layout,4,true,groupWidth);
    default:return null;
  }
}

/** Steam 1.26.2 menu-premiumshop SHA256 257b3b44ac442c08c8d17072188157db322fdae32ffe53261e7646e497e15bed,
 * MonoScript SHA256 c0f5d54d2b03116dfb757d70e84531c99f54b9e9698947ae7ced7645709f9107.
 * LightOneLineBundle.LoadAsync RVA 0x6B67271..0x6B672A9 loads its fixed prefab
 * -3372827615130793737, then BundleLoader.DelayedInstantiate stretches root.
 * TileAndItems LayoutElement preferred height 508; serialized root 1320 x 508
 * is NOT the runtime width. Tile width 900, Mask sizeDelta (+28,+30),
 * anchored position (0,-1); Right sizeDelta (-902,0) / position (451,0).
 * Scroll sizeDelta (0,-64) / position (0,32); ImageTemplate width 300,
 * source preferred width 300, Icon ImageBinding + AsyncImage<Sprite>, fitter 3.
 * CurrentImage fitter 4, no ImageAdjustmentBinding on this image.
 * Group dimensions must be supplied; this is geometry, not pixel equivalence.
 */
export function shopOneLineArtworkTemplate(groupWidth:number,groupHeight:number){
  if(!Number.isFinite(groupWidth)||groupWidth<=902||groupWidth>16384||
     !Number.isFinite(groupHeight)||groupHeight<=64||groupHeight>16384)return null;
  return {
    prefab:'LightBundle_With_Scroll' as const,cardWidth:groupWidth,cardHeight:groupHeight,
    artworkWidth:groupWidth,artworkHeight:groupHeight,
    main:{binding:'CurrentImage' as const,x:-14,y:-14,width:928,height:groupHeight+30,fill:'cover' as const},
    scroll:{x:902,y:0,width:groupWidth-902,height:groupHeight-64,itemWidth:300,fill:'contain' as const},
    preferredHeight:508,serializedRootWidth:1320,
    scrollConsumer:'Sprite' as const,renderingVerified:false as const
  };
}
