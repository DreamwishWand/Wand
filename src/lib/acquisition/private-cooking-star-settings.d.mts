/**
 * Read-only, owner-private Steam v1.26.2 CookingData.RecipeStarResult rows.
 * This is not a final meal sell-price calculation implementation.
 */
export declare const DB02_PRIVATE_COOKING_STAR_CONTRACT:
  'wand.db02.private-cooking-star-settings@1';
export declare const DB02_ORIGINAL_COOKING_PROTO_SHA256:
  'dc5015cc37b30f14ebda2b13822ddfa21b311e6f651ba29dc5c5eccaefa2a623';
export declare const DB02_ORIGINAL_COOKING_WIRE_SHA256:
  'c7f88137699c319dbdcbf3d8a006b0db50399d48683143b5e75ac908365bc1c2';
export interface NativeCookingStarResult {
  readonly starRating:number;
  readonly minDiscoveredInfoPercentage:number|null;
  readonly minDiscoveredInfoFieldPresent:boolean;
  readonly maxDiscoveredInfoPercentage:number|null;
  readonly maxDiscoveredInfoFieldPresent:boolean;
  readonly sellPriceIngredientPercentage:number;
  readonly manaRecoveredIngredientPercentage:number;
  readonly sourceSerializedSettingsOnly:true;
  readonly actualSellPriceFormulaVerified:false;
  readonly roundingRuleVerified:false;
}
export interface ParsedCookingStarSettings {
  readonly starResults:readonly NativeCookingStarResult[];
  readonly sourceAuthenticated:false;
  readonly nativeSourceSettingsOnly:true;
  readonly sellPriceComputed:false;
}
export interface VerifiedPrivateCookingStarSettings {
  readonly contract:typeof DB02_PRIVATE_COOKING_STAR_CONTRACT;
  readonly gameVersion:'1.26.2';
  readonly platform:'Steam';
  readonly sourceEntryKey:'Cooking';
  readonly nativeClass:'Definitions.Activities.CookingData';
  readonly originalProtoSha256:typeof DB02_ORIGINAL_COOKING_PROTO_SHA256;
  readonly nativeCookingWireSha256:typeof DB02_ORIGINAL_COOKING_WIRE_SHA256;
  readonly verifiedPrivateOriginal:true;
  readonly priceTableKind:'star_result_ingredient_percentage_configuration';
  readonly starResults:readonly NativeCookingStarResult[];
  getStarResult(star:number):NativeCookingStarResult;
  readonly formulaBodyVerified:false;
  readonly roundingRuleVerified:false;
  readonly actualSellPricesVerified:false;
  readonly saveWriterAuthorized:false;
  readonly publishable:false;
}
/** Parse source shape, not source authenticity. This can inspect synthetic tests. */
export declare function parseCookingDataStarSettings(
  body:Uint8Array
):ParsedCookingStarSettings;
/** Verify exact private original protoDb.bin SHA-256 before reading source rows. */
export declare function loadPrivateCookingStarSettings(
  protoDbBytes:Uint8Array
):Promise<VerifiedPrivateCookingStarSettings>;
