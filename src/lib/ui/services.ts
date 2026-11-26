/** Shell-owned destinations. Unavailable services never receive a fake href. */
export const launcherServices = [
  {key:'decorate',name:'Decorate',icon:'palette',href:'/decorate/',art:null},
  {key:'collection',name:'Collection',icon:'collection',href:'/collection/',art:'/ddv/item-images/steam-1.25.3-schema626-lossless160-v1/46/461f6484256c69e5a528adc3af7054301841fc324c237d8bc0d4534830345bec.webp'},
  {key:'guide',name:'Guide',icon:'guide',href:'/guide/',art:'/ddv/item-images/steam-1.25.3-schema626-lossless160-v1/4f/4f1ed414b3f554a69dbc7b4e682507274c58ad327ace7e22808469aa1e56eff4.webp'},
  {key:'presets',name:'Presets',icon:'sparkles',href:'/presets/',art:null},
  {key:'gallery',name:'Gallery',icon:'gallery',href:null,art:null},
  {key:'dreamsnaps',name:'DreamSnaps',icon:'camera',href:null,art:null},
  {key:'community',name:'Community Help Center',icon:'community',href:null,art:null}
] as const;

export type LauncherService = (typeof launcherServices)[number];
