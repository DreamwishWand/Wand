/** Source-only coverage; never an observed native sale price. */
export declare const DB02_INGREDIENT_SOURCE_ROW_COVERAGE_CONTRACT:
  'wand.db02.ingredient-source-row-coverage@1';

export interface IngredientSourceRowCoverage {
  readonly contract:typeof DB02_INGREDIENT_SOURCE_ROW_COVERAGE_CONTRACT;
  readonly itemId:number;
  readonly staticSourceRowCount:0|1;
  readonly dynamicSourceSnapshotProvided:boolean;
  readonly dynamicSourcePurchaseRowPresent:boolean|null;
  readonly dynamicSourceSellRowPresent:boolean|null;
  readonly sourceRowAbsentAcrossStaticAndDynamicSnapshots:boolean|null;
  readonly sourceRecordStatus:
    'static_source_row_present'|
    'dynamic_source_not_supplied'|
    'dynamic_source_row_present'|
    'no_serialized_source_price_row';
  readonly sourceInputIndependentlyAuthenticatedByThisFunction:false;
  readonly noPriceRowIsNotAnOmittedAmountField:true;
  readonly rowAbsenceDoesNotProveRuntimeLookupFailure:true;
  readonly rowAbsenceDoesNotProveUnsellable:true;
  readonly runtimeRegisteredProviderSetVerified:false;
  readonly runtimeDynamicCacheUnmodifiedVerified:false;
  readonly actualIngredientSellPrice:null;
  readonly publishable:false;
  readonly writable:false;
}

export declare function classifyIngredientSerializedPriceRowCoverage(
  input:{
    itemId:number;
    staticRows:readonly {
      itemId:number;
      databaseKey:string;
      sellValueDefinitions:readonly unknown[];
      purchaseCostDefinitions:readonly unknown[];
    }[];
    dynamicCacheLookup?:{
      itemId:number;
      serializedCacheOnly:true;
      originalSourceAuthenticated:true;
      cachedPurchaseRowPresent:boolean;
      cachedSellRowPresent:boolean;
    }|null;
  }
):IngredientSourceRowCoverage;
