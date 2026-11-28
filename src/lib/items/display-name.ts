/** Presentation-only gate: lack of a public label is not proof of an internal
 * object, nor permission to delete the canonical definition or saved state. */
export function usableItemName(value:unknown):value is string{
  if(typeof value!=='string')return false;
  const clean=value.replace(/<\/?nobr>/gi,'').replace(/[\u200b\u200c\u200d\ufeff\u00ad]/g,'').trim();
  return clean.length>0&&!/\{(?:Placeholder|LegacyPlaceholder|DoNotTranslate)\}/i.test(clean);
}
export function displayItemName(names:Readonly<Record<string,unknown>>,locale:string):string|null{
  return [names[locale],names.en,...Object.values(names)].find(usableItemName)??null;
}
