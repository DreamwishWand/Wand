/** Whitelisted local-only projection. No serialized profile, names or unknown fields. */
type Numeric=Readonly<Record<string,number>>;
type Palette=Readonly<Record<string,number>>;
export interface SavedAvatarBranch{
 readonly Id?:number;readonly SkinColorIndex?:number;readonly HairColorIndex?:number;readonly HairHighlightColor?:number;
 readonly BodyType?:number;readonly Form?:number;readonly SprintEffectID?:number;
 readonly Clothes?:Numeric;readonly IncompatibleClothes?:Numeric;readonly FaceType?:Numeric;readonly ClothingCustomization?:Numeric;
 readonly Eyeball?:Palette;readonly Makeup?:Readonly<Record<string,Palette>>;readonly ClothingColorSettings?:Readonly<Record<string,Palette>>;
}
const roles=['female','male','femaleMermaid','maleMermaid'] as const;
export type AvatarRole=typeof roles[number];
export interface SavedAvatarAppearance{
 readonly contract:'wand.avatar.raw-appearance@1';readonly saveSchema:number|null;
 readonly status:'unsupported_schema'|'not_observed'|'incompatible_structure'|'partial_inconclusive'|'observed';
 readonly activeIsMale:boolean|null;readonly avatars:Readonly<Partial<Record<AvatarRole,SavedAvatarBranch>>>;
 readonly saveFileModified:false;readonly renderVerified:false;
}
function obj(x:unknown):x is Record<string,unknown>{return x!==null&&typeof x==='object'&&!Array.isArray(x)}
function check(x:unknown):asserts x{if(!x)throw new TypeError('SAVE_AVATAR_APPEARANCE_INVALID')}
function int(x:unknown,unsigned=false):x is number{return typeof x==='number'&&Number.isInteger(x)&&x>=(unsigned?0:-2147483648)&&x<=(unsigned?4294967295:2147483647)}
function palette(x:unknown,keys:readonly string[],floats:readonly string[]=[]):Palette{
 check(obj(x));const out:Record<string,number>=Object.create(null);
 for(const k of keys){if(k in x){check(int(x[k]));out[k]=x[k] as number}}
 for(const k of floats){if(k in x){const v=x[k];check(typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=3.4028234663852886e38);out[k]=v}}
 return Object.freeze(out)
}
function map<T>(x:unknown,max:number,signed:boolean,read:(v:unknown)=>T):Readonly<Record<string,T>>{
 check(obj(x));const rows=Object.entries(x);check(rows.length<=max);const out:Record<string,T>=Object.create(null);
 for(const [k,v] of rows){check(int(Number(k),!signed)&&String(Number(k))===k);out[k]=read(v)}
 return Object.freeze(out)
}
function branch(x:unknown):SavedAvatarBranch{
 check(obj(x));const out:Record<string,unknown>=Object.create(null);
 for(const k of ['Id','SkinColorIndex','HairColorIndex','HairHighlightColor','BodyType','Form','SprintEffectID'])if(k in x){check(int(x[k],k==='Id'));out[k]=x[k]}
 for(const k of ['Clothes','IncompatibleClothes','FaceType','ClothingCustomization'])if(k in x)out[k]=map(x[k],256,k==='ClothingCustomization',v=>{check(int(v));return v});
 if('Eyeball'in x)out.Eyeball=palette(x.Eyeball,['EyeballItemID','ColorIndex1','ColorIndex2','ColorIndex3']);
 if('Makeup'in x)out.Makeup=map(x.Makeup,64,false,v=>palette(v,['MakeupItemID','ColorIndex1','ColorIndex2','ColorIndex3'],['Opacity','Gloss']));
 if('ClothingColorSettings'in x)out.ClothingColorSettings=map(x.ClothingColorSettings,256,true,v=>palette(v,['Color1','Color2','Color3']));
 return Object.freeze(out) as SavedAvatarBranch
}
export function sanitizeSavedAvatarAppearance(x:unknown):SavedAvatarAppearance{
 check(obj(x)&&x.contract==='wand.avatar.raw-appearance@1'&&x.saveFileModified===false&&x.renderVerified===false&&
 (x.saveSchema===null||typeof x.saveSchema==='number'&&Number.isSafeInteger(x.saveSchema))&&
 typeof x.status==='string'&&['unsupported_schema','not_observed','incompatible_structure','partial_inconclusive','observed'].includes(x.status)&&
 (x.activeIsMale===null||typeof x.activeIsMale==='boolean')&&obj(x.avatars));
 const supported=x.saveSchema===626||x.saveSchema===643;
 check((x.status==='unsupported_schema')!==supported);
 const avatars:Partial<Record<AvatarRole,SavedAvatarBranch>>=Object.create(null);
 for(const r of roles)if(r in x.avatars)avatars[r]=branch(x.avatars[r]);
 const has=Object.keys(avatars).length>0||x.activeIsMale!==null;
 check(!['unsupported_schema','not_observed','incompatible_structure'].includes(x.status)||!has);
 check(x.status!=='observed'||has);
 return Object.freeze({contract:'wand.avatar.raw-appearance@1',saveSchema:x.saveSchema as number|null,status:x.status as SavedAvatarAppearance['status'],activeIsMale:x.activeIsMale,avatars:Object.freeze(avatars),saveFileModified:false,renderVerified:false})
}
/** Only explicit observed body flag, never infer from clothing, names or missing fields. */
export function savedBodyPreference(x:SavedAvatarAppearance|undefined):'male'|'female'|undefined{
 return x?.activeIsMale===true?'male':x?.activeIsMale===false?'female':undefined
}
