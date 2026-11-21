/** DB-02 × DB-03 owner-private static quest item references. */
export declare const DB02_QUEST_ACQUISITION_CONTRACT:'wand.db02.quest-acquisition@1';
export declare const DB03_QUEST_FLOWS_SHA256:string;
export declare const DB03_MISSION_BRIDGE_SHA256:string;
export declare const DB03_MISSION_SOURCE_SHA256:string;
export declare const DB03_TARGET_CONDITION_SHA256:string;
export type QuestFlowKind =
  | 'intro_item_grant_candidate'
  | 'substep_handoff_definition'
  | 'post_mission_cleanup_reference'
  | 'additional_reward_loot_candidate';
export interface QuestFlowCount {
  readonly rows:1517|number;
  readonly quests:number;
  readonly distinctItemIds:number;
  readonly byKind:Readonly<Record<QuestFlowKind,number>>;
}
export interface QuestItemSourceFlow {
  readonly questId:string;
  readonly itemId:string;
  readonly flowKind:QuestFlowKind;
  readonly nativeWireSha256:string;
  readonly sourceField:string;
  readonly indexMembership:'present'|'not_in_supplied_index';
  readonly configuredAmount?: number|Readonly<{kind:'value';value:number;sourceWireSha256:string}>;
  readonly keepItems?:boolean;
  readonly stepId?:number|null;
  readonly subStepId?:number|null;
  readonly candidateRole?:'direct';
  readonly selectorMode?:'item';
  readonly selection?:'not_guaranteed';
  readonly lootSubtableIndex?:number;
}
export interface QuestAcquisitionCandidate {
  readonly index:number;
  readonly questId:string;
  readonly itemId:string;
  readonly sourceFlow:Readonly<QuestItemSourceFlow>;
  readonly staticDefinitionOnly:true;
  readonly guaranteedGrant:false;
  readonly currentAvailabilityVerified:false;
  readonly playerProgressVerified:false;
  readonly acquisitionIndexCoverage:'linked_static_source_candidates'|'unresolved_in_partial_acquisition_index';
  readonly sourceRecipeIds:readonly number[];
  readonly sourceAcquisitionPathIds:readonly string[];
  readonly staticShopCandidateOnly:boolean;
  readonly currentShopOfferVerified:false;
  readonly itemOwnershipVerified:false;
}
export interface PrivateQuestAcquisitionView {
  readonly contract:typeof DB02_QUEST_ACQUISITION_CONTRACT;
  readonly verified:true;
  readonly privateSource:true;
  readonly publishable:false;
  readonly acquisitionGameVersion:'1.26.2';
  readonly guideMissionSourceVersion:'1.26.1';
  readonly guideMissionBytesIdenticalToAcquisitionVersion:true;
  readonly conditionDefinitionsEquivalent:false;
  readonly missionSourceSha256:string;
  readonly flowsSha256:string;
  readonly missionBridgeSha256:string;
  readonly coverage:QuestFlowCount;
  readonly currentAvailabilityVerified:false;
  readonly currentRewardsVerified:false;
  readonly playerProgressVerified:false;
  readonly saveWritingAuthorized:false;
  getQuestItemReferences(questId:string):readonly QuestAcquisitionCandidate[];
  getItemQuestReferences(itemId:string):readonly QuestAcquisitionCandidate[];
}
/** Pure shape validation; it does NOT imply independent source authentication. */
export declare function validateQuestItemFlowStructure(payload:unknown):QuestFlowCount;
/** Requires byte-exact, independently source-pinned private Guide and DB-02 inputs. */
export declare function loadPrivateQuestAcquisitionView(
  flowBytes:Uint8Array|ArrayBuffer,missionBridgeBytes:Uint8Array|ArrayBuffer,
  acquisition:import('./private-browser-bundle.mjs').PrivateSrc02BrowserBundle
):Promise<PrivateQuestAcquisitionView>;