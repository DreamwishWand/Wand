// Shared, browser-only language preference. No account or save data leaves this device.
export const WAND_LOCALES = [
  { id: 'ja', name: '日本語' },
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
  { id: 'it', name: 'Italiano' },
  { id: 'de', name: 'Deutsch' },
  { id: 'es-ES', name: 'Español' },
  { id: 'zh-CN', name: '简体中文' },
  { id: 'pt-BR', name: 'Português' }
] as const;
export type WandLocale = typeof WAND_LOCALES[number]['id'];
const KEY = 'dreamwishwand.ui.locale.v1';
const EVENT = 'wand:locale-change';
export function validWandLocale(value: string): value is WandLocale {
  return WAND_LOCALES.some(locale => locale.id === value);
}
export function readWandLocale(): WandLocale {
  if (typeof window === 'undefined') return 'ja';
  try {
    const value = window.localStorage.getItem(KEY);
    return value !== null && validWandLocale(value) ? value : 'ja';
  } catch { return 'ja'; }
}
export function changeWandLocale(value: string): void {
  if (typeof window === 'undefined' || !validWandLocale(value)) return;
  try { window.localStorage.setItem(KEY, value); } catch { /* Storage may be unavailable */ }
  document.documentElement.lang = value;
  window.dispatchEvent(new CustomEvent<WandLocale>(EVENT, { detail: value }));
}
export function onWandLocaleChange(callback: (locale: WandLocale) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const value = (event as CustomEvent<string>).detail;
    if (validWandLocale(value)) callback(value);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
