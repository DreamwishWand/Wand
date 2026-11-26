import {writable,get} from 'svelte/store';
/** Single in-memory account access port for all Community services. The
 * shared Account implementation registers a verified, refreshable session.
 * Never accept a token from a query string, file, local preset, or UI field. */
export interface WandAccountAccess{
 readonly origin:string;
 accessToken:()=>Promise<string>;
}
const state=writable<WandAccountAccess|null>(null);
export const wandAccountAccess={subscribe:state.subscribe};
export function registerWandAccountAccess(access:WandAccountAccess):()=>void{
 const url=new URL(access.origin);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||typeof access.accessToken!=='function')throw Error('ACCOUNT_ACCESS_INVALID');
 const own:WandAccountAccess={origin:url.origin,accessToken:async()=>{
  if(get(state)!==own)throw Error('ACCOUNT_SESSION_CHANGED');
  const token=await access.accessToken();
  if(get(state)!==own||!token)throw Error('ACCOUNT_SESSION_CHANGED');
  return token;
 }};
 state.set(own);
 return ()=>{if(get(state)===own)state.set(null);};
}
export function clearWandAccountAccess(){state.set(null);}
