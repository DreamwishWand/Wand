export declare const DB02_NATIVE_TAG_EVIDENCE_CONTRACT: 'wand.db02.native-tag-evidence@1';
export declare const DB02_NATIVE_TAG_SOURCE_SHA256: string;
export declare const DB02_NATIVE_TAG_PARENT_SHA256: string;
export interface NativeTagEvidenceRow {
  readonly tagId: number;
  readonly frameKey: number;
  /** Raw TagItemData.Name (field 2), NOT translated game UI text. */
  readonly nativeName: string;
  /** Raw TagItemData.DisplayName (field 3), a localization key only. */
  readonly displayNameKey: string;
  readonly usedByRecipeSelector: boolean;
  readonly usedByIngredientMembership: boolean;
  readonly namesLocalizedVerified: false;
  readonly liveEligibilityVerified: false;
  readonly currentGameSourceVerified: true;
  readonly sourceFieldNumbers: Readonly<{ID:1;Name:2;DisplayName:3}>;
}
export interface NativeTagEvidenceLookup {
  readonly contract: typeof DB02_NATIVE_TAG_EVIDENCE_CONTRACT;
  readonly privateSource: true;
  readonly publishable: false;
  readonly verified: true;
  readonly sourceVersion: 'Steam v1.26.2';
  readonly manifestSha256: string;
  readonly parentSrc02ManifestSha256: string;
  readonly nativeTagSourceSha256: string;
  readonly namesLocalizedVerified: false;
  readonly liveEligibilityVerified: false;
  readonly playerOwnershipVerified: false;
  readonly saveWritingAuthorized: false;
  readonly counts: Readonly<{nativeTagDefinitions:number;recipeSelectorTagIds:number;
    ingredientMembershipTagIds:number;uniqueReferencedTagIds:number}>;
  readonly allTags: readonly Readonly<NativeTagEvidenceRow>[];
  readonly recipeSelectorTagIds: readonly number[];
  readonly ingredientMembershipTagIds: readonly number[];
  getTag(id:number):Readonly<NativeTagEvidenceRow>|null;
  getRecipeSelectorTag(id:number):Readonly<NativeTagEvidenceRow>|null;
  getIngredientMembershipTag(id:number):Readonly<NativeTagEvidenceRow>|null;
}
export declare function loadVerifiedNativeTagEvidence(
  manifest:Uint8Array|ArrayBuffer, rows:Uint8Array|ArrayBuffer,
  trusted:{expectedManifestSha256:string;expectedParentSrc02ManifestSha256?:string}
):Promise<Readonly<NativeTagEvidenceLookup>>;