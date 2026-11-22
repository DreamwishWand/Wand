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
export type WandTheme='dark'|'light';
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
export function readWandTheme():WandTheme{
  try{return window.localStorage.getItem(THEME_STORAGE_KEY)==='light'?'light':'dark';}
  catch{return 'dark';}
}
export function setWandTheme(value:WandTheme):void{
  if(value!=='dark'&&value!=='light')return;
  try{window.localStorage.setItem(THEME_STORAGE_KEY,value);}catch{/* private mode */}
  document.documentElement.dataset.wandTheme=value;
  document.documentElement.style.colorScheme=value;
}
