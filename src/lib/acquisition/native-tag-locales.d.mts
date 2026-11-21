export declare const DB02_TAG_LOCALES_CONTRACT:'wand.db02.native-tag-locales@1';
export declare const DB02_TAG_EVIDENCE_MANIFEST_SHA256:string;
export declare const DB02_TAG_LOCALES:readonly ['en','fr','it','de','es-ES','ja','zh-CN','pt-BR'];
export declare const DB02_TAG_LOCALE_ARCHIVE_SHA256:Readonly<Record<typeof DB02_TAG_LOCALES[number],string>>;
export interface NativeTagLocalizedRow {
  readonly tagId:number;
  readonly localizedNames:Readonly<Record<typeof DB02_TAG_LOCALES[number],string>>;
  readonly nativeName:string;
  readonly displayNameKey:string;
  readonly usedByRecipeSelector:boolean;
  readonly usedByIngredientMembership:boolean;
  readonly exactGameVersion:'1.26.2';
  readonly localizationExactSourceVerified:true;
  readonly liveRecipeEligibilityVerified:false;
  readonly ownershipVerified:false;
}
export interface NativeTagLocaleName {
  readonly tagId:number;
  readonly locale:typeof DB02_TAG_LOCALES[number];
  readonly value:string;
  readonly evidence:'steam1262_exact_tag_locbin';
  readonly sourceGameVersion:'1.26.2';
  readonly actualPlayerEligibilityVerified:false;
}
export interface NativeTagLocaleLookup {
  readonly contract:typeof DB02_TAG_LOCALES_CONTRACT;
  readonly verified:true;
  readonly privateSource:true;
  readonly publishable:false;
  readonly platform:'Steam';readonly gameVersion:'1.26.2';
  readonly manifestSha256:string;readonly parentTagManifestSha256:string;
  readonly sourceExactLocalizedTagCoverageComplete:true;
  readonly completeGameLocalizationVerified:false;
  readonly liveAvailabilityVerified:false;
  readonly playerOwnershipVerified:false;
  readonly saveWritingAuthorized:false;
  readonly counts:Readonly<{nativeTagDefinitions:number;languages:8;translatedTagStrings:number}>;
  readonly allTags:readonly Readonly<NativeTagLocalizedRow>[];
  getTag(id:number):Readonly<NativeTagLocalizedRow>|null;
  getDisplayName(id:number,locale:typeof DB02_TAG_LOCALES[number]):Readonly<NativeTagLocaleName>|null;
  getRecipeSelectorName(id:number,locale:typeof DB02_TAG_LOCALES[number]):Readonly<NativeTagLocaleName>|null;
  getIngredientMembershipName(id:number,locale:typeof DB02_TAG_LOCALES[number]):Readonly<NativeTagLocaleName>|null;
}
import type {NativeTagEvidenceLookup} from './native-tag-evidence.mjs';
export declare function loadVerifiedNativeTagLocales(
 manifest:Uint8Array|ArrayBuffer,rows:Uint8Array|ArrayBuffer,
 tagEvidence:Readonly<NativeTagEvidenceLookup>,trusted:{expectedManifestSha256:string}
):Promise<Readonly<NativeTagLocaleLookup>>;