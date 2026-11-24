/** Source-declared operation restrictions. Missing is not affirmative
 * permission; conditional rules are not evaluated against Save progress. */
export type NativeEditAction='move'|'rotate'|'remove'|'select'|'switchGrid';
export type NativeEditState='denied'|'conditional'|'allowedFlag';
export type NativeEditRestrictions=Readonly<Partial<Record<NativeEditAction,NativeEditState>>>;
const fields={move:'CanMove',rotate:'CanRotate',remove:'CanBeRemoved',select:'CanBeSelected',switchGrid:'CanSwitchGrid'} as const;
const legacy={move:'canMove',rotate:'canRotate',remove:'canBeRemoved',select:'canBeSelected',switchGrid:'canSwitchGrid'} as const;
const rec=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function projectNativeEditRestrictions(value:unknown):NativeEditRestrictions{
 const out:Partial<Record<NativeEditAction,NativeEditState>>={};
 if(!rec(value))return out;
 for(const action of Object.keys(fields) as NativeEditAction[]){
  const rule=value[fields[action]];
  if(!rec(rule))continue;
  if(rule.Value===false)out[action]='denied';
  else if(rule.Conditions!==undefined||rule._unresolvedFields!==undefined)out[action]='conditional';
  else if(rule.Value===true)out[action]='allowedFlag';
 }
 return out;
}
export function sourceEditRestrictions(definition:unknown):NativeEditRestrictions{
 if(!rec(definition))return {};
 if(rec(definition.editRestrictions)){
   const out:Partial<Record<NativeEditAction,NativeEditState>>={};
   for(const action of Object.keys(fields) as NativeEditAction[]){
     const v=definition.editRestrictions[action];
     if(v==='denied'||v==='conditional'||v==='allowedFlag')out[action]=v;
   }
   return out;
 }
 const raw=definition.gridEditRestrictions;
 if(!rec(raw))return {};
 const out:Partial<Record<NativeEditAction,NativeEditState>>={};
 for(const action of Object.keys(legacy) as NativeEditAction[]){
   const v=raw[legacy[action]];
   if(rec(v)&&typeof v.value==='boolean')out[action]=v.value?'allowedFlag':'denied';
 }
 return out;
}
export function nativeActionBlocked(restrictions:NativeEditRestrictions|undefined,action:NativeEditAction):boolean{
 const state=restrictions?.[action];
 return state==='denied'||state==='conditional';
}
