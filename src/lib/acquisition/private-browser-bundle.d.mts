/** Private, source-pinned SRC-02 acquisition bundle. No live shop/ownership claims. */
export declare const PRIVATE_SRC02_BROWSER_CONTRACT: 'wand.src02.private-browser-bundle@1';
export declare const CURRENT_STEAM_1262_CONDITION_SHA256: '9eb5e7800a2485b1dfb3e148a7bcff5d6c6b6ed72797ed2331a902ab44188f4c';
export declare const REJECTED_R4_MANIFEST_SHA256: '323f666cd30ae1e784879d4664ca57a845559734d147193b7d7177fd59eb938d';
export interface Src02IndependentPin {
  readonly platform: 'Steam';
  readonly gameVersion: '1.26.2';
  readonly manifestSha256: string;
  readonly src01ManifestSha256: string;
  readonly currentConditionSha256: typeof CURRENT_STEAM_1262_CONDITION_SHA256;
}
export interface PrivateSrc02BrowserArchive {
  readonly fileCount: 12;
  readFile(name: string): Promise<Uint8Array>;
}
export interface PrivateSrc02BrowserBundle {
  readonly contract: typeof PRIVATE_SRC02_BROWSER_CONTRACT;
  readonly manifestSha256: string;
  readonly privateSource: true;
  readonly publishable: false;
  readonly verified: true;
  readonly provenanceMatched: true;
  readonly source: Readonly<{platform:'Steam';gameVersion:'1.26.2'}>;
  readonly counts: Readonly<Record<string, number>>;
  readonly currentShopOffersVerified: false;
  readonly playerOwnershipVerified: false;
  readonly currentAvailabilityVerified: false;
  readonly saveWritingAuthorized: false;
  /** Native static evidence only. Unknown IDs never prove in-game absence. */
  getItem(itemId:number): unknown;
  getRecipe(recipeId:number): unknown;
  getStaticStall(stallId:number): unknown;
  getPossibleStallsForItem(itemId:number): unknown;
  getIngredientSelectorCandidates(selectorId:number): unknown;
}
export declare function openPrivateSrc02Archive(bytes: Uint8Array): PrivateSrc02BrowserArchive;
/**
 * Caller must supply owner-selected bytes and an independently authenticated
 * manifest pin (no current-version accepted release exists until condition source is rebuilt).
 * No network/file writes. Never publish returned game-derived records.
 */
export declare function loadPrivateSrc02BrowserBundle(
  archive:Uint8Array, trusted: Src02IndependentPin
):Promise<PrivateSrc02BrowserBundle>;