/** Local-only Wand display preferences. No save data or account state is involved. */
export const UI_LANGUAGES=[
  {code:'ja',label:'日本語',short:'JA'},
  {code:'en',label:'English',short:'EN'},
  {code:'fr',label:'Français',short:'FR'},
  {code:'it',label:'Italiano',short:'IT'},
  {code:'de',label:'Deutsch',short:'DE'},
  {code:'es-ES',label:'Español',short:'ES'},
  {code:'zh-CN',label:'简体中文',short:'ZH'},
  {code:'pt-BR',label:'Português',short:'PT'}
] as const;
export type WandLanguage=typeof UI_LANGUAGES[number]['code'];
export const UI_THEMES=[
  {code:'dawn',label:'黄昏の日の出',short:'日の出',icon:'sunrise'},
  {code:'coral',label:'太陽に照らされた透き通るサンゴ礁',short:'サンゴ礁',icon:'sun'},
  {code:'night',label:'魔法の夜空',short:'夜空',icon:'moon-star'}
] as const;
export type WandTheme=typeof UI_THEMES[number]['code'];
export function isWandTheme(value:unknown):value is WandTheme{
  return typeof value==='string'&&UI_THEMES.some(theme=>theme.code===value);
}
export const LANGUAGE_STORAGE_KEY='dreamwishwand.ui.language.v1';
export const THEME_STORAGE_KEY='dreamwishwand.ui.theme.v1';
export const LANGUAGE_EVENT='wand:ui-language';

export function isWandLanguage(value:unknown):value is WandLanguage{
  return typeof value==='string'&&UI_LANGUAGES.some(lang=>lang.code===value);
}
export function readWandLanguage():WandLanguage{
  try{
    const value=window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isWandLanguage(value)?value:'ja';
  }catch{return 'ja';}
}
export function setWandLanguage(next:WandLanguage):void{
  if(!isWandLanguage(next))return;
  try{window.localStorage.setItem(LANGUAGE_STORAGE_KEY,next);}catch{/* private mode */}
  document.documentElement.lang=next;
  window.dispatchEvent(new CustomEvent<WandLanguage>(LANGUAGE_EVENT,{detail:next}));
}
/** The initial value is read even on routes without localized game records. */
export function watchWandLanguage(update:(value:WandLanguage)=>void):()=>void{
  const listener=(event:Event)=>update((event as CustomEvent<WandLanguage>).detail);
  window.addEventListener(LANGUAGE_EVENT,listener);
  update(readWandLanguage());
  return ()=>window.removeEventListener(LANGUAGE_EVENT,listener);
}
/** Preserve existing selections: light → coral; dark → night. */
export function readWandTheme():WandTheme{
  try{
    const saved=window.localStorage.getItem(THEME_STORAGE_KEY);
    if(isWandTheme(saved))return saved;
    if(saved==='light')return 'coral';
    return 'night';
  }catch{return 'night';}
}
export function setWandTheme(value:WandTheme):void{
  if(!isWandTheme(value))return;
  try{window.localStorage.setItem(THEME_STORAGE_KEY,value);}catch{/* private mode */}
  document.documentElement.dataset.wandTheme=value;
  document.documentElement.style.colorScheme=value==='night'?'dark':'light';
}
